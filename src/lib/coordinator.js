/**
 * The coordinator: the one server this app talks to.
 *
 * ZigSolverCoordinator (the Python service beside this repo) holds everything
 * that is not drawing — the bot host's sockets, the ZigSolver API, the snapshot
 * parsing, the typed stats and headers written into the bodies, the regime
 * coins, the solve pipeline, the history and every setting. This module is the
 * whole of the app's side of that: ONE reconnecting WebSocket, the state the
 * coordinator pushes down it, and the intents the UI sends back up.
 *
 *   down  `hello`  the static meta and the global state, on every (re)connect
 *         `state`  a patch of the global fields — each named field replaced
 *         `table`  a patch of one table's fields, for the tables subscribed to
 *         `notify` a toast: the host's own words, or one of our message keys
 *         `reply`  the answer to a request that carried an `id`
 *   up    `{ type, ...data }` — see the intents at the bottom of the file
 *
 * Nothing here decides anything about a hand. Where a component needs a fact —
 * whether the exploit regime can answer this hand, what a typed stat writes into
 * the body, which regime the advanced coin came up — the coordinator sends the
 * fact, and the component draws it.
 *
 * What stays in THIS browser is only what is about this browser: the
 * coordinator's own address (below), the theme, the language, which pane of a
 * sheet was open. Everything else is the coordinator's, so every page on every
 * machine reads the same settings and the same history.
 */

import { reactive, ref, computed, watch, onScopeDispose, unref } from 'vue'
import { readStored, writeStored } from './persist'
import { notify } from './notify'
import { t } from './i18n'
import { nativeShell } from './native'

const KEY = 'zigsolver.coordinator'
const DEFAULT_PORT = 8765
const BASE_DELAY = 1000
const MAX_DELAY = 15000
const REQUEST_TIMEOUT = 20000

/**
 * Where the coordinator is when nothing has been typed: the machine this page
 * was served from, on the coordinator's port. That is right for `npm run dev`
 * and for a coordinator run beside the host that serves `dist/`; anything else
 * is typed once on the connect screen. A page with no web origin (a file, the
 * macOS shell's private scheme) looks on this machine.
 */
function defaultAddress() {
  const env = import.meta.env?.VITE_COORDINATOR
  if (env) return String(env)
  const web = typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
  const host = web && location.hostname ? location.hostname : 'localhost'
  return `${host.includes(':') ? `[${host}]` : host}:${DEFAULT_PORT}`
}

/** Is this something an endpoint could be addressed by? The form's check only —
 *  the coordinator is the one that decides, and says so if it disagrees. */
export function looksLikeAddress(input) {
  const text = String(input || '').trim()
  if (!text) return false
  try {
    return !!new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`).hostname
  } catch {
    return false
  }
}

/** Free-form input -> `ws(s)://…`, or null: `host:port`, `ws://`, `http(s)://` all do. */
export function coordinatorUrl(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  let url
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `${secure ? 'wss' : 'ws'}://${text}`)
  } catch {
    return null
  }
  if (!url.hostname) return null
  const scheme = { 'ws:': 'ws', 'http:': 'ws', 'wss:': 'wss', 'https:': 'wss' }[url.protocol]
  return scheme ? `${scheme}://${url.host}${url.pathname}${url.search}` : null
}

const stored = readStored(KEY)
/** The coordinator's address, as typed. Stored only when it is not the default. */
export const coordinatorInput = ref(typeof stored === 'string' && stored ? stored : defaultAddress())

/** The socket to the coordinator. `status` is the StatusDot vocabulary. */
export const link = reactive({
  status: 'idle',
  /** The `hello` has arrived: `state` below is the coordinator's, not the placeholders. */
  ready: false,
  attempts: 0,
  url: null,
})

/** What does not change while the coordinator runs — sent with every `hello`. */
export const meta = reactive({
  version: null,
  settings: { defaults: {}, limits: {}, budgetPresets: [], gatePresets: [] },
  minStatsForExploit: 3,
  manualStatKeys: [],
  tournamentKeys: [],
})

/**
 * The global state, field for field as the coordinator names it. The values
 * here are only what to draw before the first `hello` lands.
 */
export const state = reactive({
  config: {
    host: '',
    api: '',
    apiTokenSet: false,
    hostValid: false,
    apiValid: false,
    hostDisplay: '',
    apiDisplay: '',
    connected: false,
  },
  lobby: { status: 'idle', tables: [], activity: [] },
  /** The /health verdict — null, or `{ state, info?, url? }`. Facts, worded at render. */
  health: null,
  /** Only what the regime bar's chip shows, until the real ones arrive. */
  settings: { maxSolveTime: 15, autoSolve: true, useHandCache: true },
  gtoAvailable: false,
  /** `/health.solveTuning` — the API's own defaults for the flop knobs. */
  solveTuning: null,
})

/** index -> that table's state, for every table some component has subscribed to. */
export const tables = reactive({})

function emptyTable(index) {
  return {
    index,
    /** The coordinator's full state for this table has arrived since the last subscribe. */
    synced: false,
    socket: 'idle',
    hand: null,
    result: null,
    solving: false,
    /** `performance.now()` when the solve in flight went out — rebuilt from the
     *  coordinator's `solveElapsed`, since its clock is not this machine's. */
    startedAt: null,
    pending: null,
    /** What this table's bar has picked — each table keeps its own. */
    regime: { selected: 'gto', exploitPct: 50, requireStats: true },
    preflop: { selected: 'alg', gtoPct: 50 },
    exploit: { status: 'pending', ok: false, why: null },
    villainStats: [],
    drew: null,
    pfDrew: null,
    canSolve: false,
    ranges: [],
    feed: [],
    history: { count: 0, rev: 0 },
    manual: { stats: {}, tournament: null },
    host: { stats: {}, tournament: null },
  }
}

// --- the socket ---------------------------------------------------------------

let ws = null
let timer = null
let seq = 0
/** id -> { resolve, reject, timer } for requests awaiting their reply. */
const waiting = new Map()
/** index -> how many components hold it. The socket subscribes once per table. */
const holds = new Map()
/** How many lobby screens are mounted — the lobby's toasts are only for them. */
let lobbyWatchers = 0

function open() {
  clearTimeout(timer)
  const url = coordinatorUrl(coordinatorInput.value)
  link.url = url
  if (!url) {
    link.status = 'idle'
    return
  }
  link.status = link.attempts ? 'retrying' : 'connecting'
  let socket
  try {
    socket = new WebSocket(url)
  } catch {
    retry()
    return
  }
  ws = socket
  socket.onopen = () => {
    if (socket !== ws) return
    link.attempts = 0
    link.status = 'open'
  }
  socket.onmessage = (event) => {
    if (socket === ws) receive(event.data)
  }
  socket.onclose = () => {
    if (socket !== ws) return
    ws = null
    lost()
    retry()
  }
}

/** The backoff grows instead of hammering a coordinator that is not up yet. */
function retry() {
  link.attempts += 1
  link.status = 'retrying'
  clearTimeout(timer)
  timer = setTimeout(open, Math.min(MAX_DELAY, BASE_DELAY * 2 ** Math.min(link.attempts - 1, 4)))
}

function lost() {
  link.ready = false
  for (const table of Object.values(tables)) table.synced = false
  for (const w of waiting.values()) {
    clearTimeout(w.timer)
    w.reject(new Error(t('coordinator.lost')))
  }
  waiting.clear()
}

/** Drop the socket and dial again — the address changed, or someone asked. */
export function reconnect() {
  const old = ws
  ws = null
  lost()
  try {
    old?.close()
  } catch {
    /* already gone */
  }
  link.attempts = 0
  open()
}

export function setCoordinator(value) {
  const text = String(value || '').trim()
  coordinatorInput.value = text || defaultAddress()
  // The default is the absence of a choice, so it is stored as the absence of a
  // key — the same bargain the theme makes with 'system'.
  writeStored(KEY, text && text !== defaultAddress() ? text : undefined)
  reconnect()
}

function receive(raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  switch (msg.type) {
    case 'hello':
      Object.assign(meta, msg.meta || {})
      Object.assign(state, msg.state || {})
      link.ready = true
      // A reconnect lands here too: every table this page holds is asked for again.
      for (const index of holds.keys()) send('table.subscribe', { index })
      adoptShell()
      break
    case 'state':
      Object.assign(state, msg.patch || {})
      break
    case 'table':
      applyTable(msg.index, msg.patch || {})
      break
    case 'notify':
      toast(msg)
      break
    case 'reply':
      settle(msg)
      break
    default:
      break
  }
}

function applyTable(index, patch) {
  // A patch in flight when this page let go of the table is for nobody.
  if (!holds.has(index)) return
  if (!tables[index]) tables[index] = emptyTable(index)
  const table = tables[index]
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'solveElapsed') {
      table.startedAt = value == null ? null : performance.now() - value * 1000
    } else {
      table[key] = value
    }
  }
  table.synced = true
}

function toast(msg) {
  if (msg.scope === 'lobby' && !lobbyWatchers) return
  if (msg.scope === 'table' && !holds.has(msg.index)) return
  // Ours arrive as a key, worded now: a toast lives for seconds, so the
  // language at arrival is the language it is read in.
  const text = msg.text ?? (msg.key ? t(msg.key, msg.params) : '')
  if (text) notify(text, { tone: msg.tone || 'info' })
}

function settle(msg) {
  const w = waiting.get(msg.id)
  if (!w) return
  waiting.delete(msg.id)
  clearTimeout(w.timer)
  if (msg.ok) w.resolve(msg.data ?? null)
  else w.reject(new Error(msg.error || t('coordinator.refused')))
}

/**
 * Under the macOS shell the solver is the app's own process, and its endpoint
 * and token arrive injected (lib/native.js). The coordinator is what calls the
 * solver now, so it is told — on every hello, since the token is minted fresh
 * for each launch and the coordinator never reads one back to compare.
 */
function adoptShell() {
  if (nativeShell) send('config.set', { api: nativeShell.api, apiToken: nativeShell.token })
}

/** Fire-and-forget. False when there is no socket to send it on. */
export function send(type, data = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify({ ...data, type }))
  return true
}

/** A message that expects a reply; resolves with its data, rejects with its error. */
export function request(type, data = {}, { timeout = REQUEST_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error(t('coordinator.offline')))
      return
    }
    const id = ++seq
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new Error(t('coordinator.timeout')))
    }, timeout)
    waiting.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ ...data, type, id }))
  })
}

// --- what components hold -------------------------------------------------------

function acquire(index) {
  const n = holds.get(index) || 0
  holds.set(index, n + 1)
  if (!tables[index]) tables[index] = emptyTable(index)
  if (n === 0) send('table.subscribe', { index })
}

function release(index) {
  const n = holds.get(index) || 0
  if (n > 1) {
    holds.set(index, n - 1)
    return
  }
  holds.delete(index)
  send('table.unsubscribe', { index })
  // Kept rather than deleted, so coming back draws the last state while the
  // fresh one is on its way — but marked as not the coordinator's any more.
  if (tables[index]) tables[index].synced = false
}

/**
 * One table's state, subscribed for as long as the calling component lives.
 *
 * `index` may be a ref or a getter: a view whose table changes under it lets go
 * of the old one and takes the new one, and the coordinator keeps the table it
 * left alive for a few seconds in case it comes back.
 */
export function useTable(index) {
  const current = computed(() => Number(typeof index === 'function' ? index() : unref(index)))
  let held = null
  watch(
    current,
    (i) => {
      if (held === i) return
      if (held !== null) release(held)
      held = Number.isFinite(i) ? i : null
      if (held !== null) acquire(held)
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    if (held !== null) release(held)
    held = null
  })
  return computed(() => tables[current.value] || emptyTable(current.value))
}

/** The lobby screen is mounted: its host lines are toasts while it is. */
export function watchLobby() {
  lobbyWatchers += 1
  onScopeDispose(() => {
    lobbyWatchers -= 1
  })
}

// --- intents ----------------------------------------------------------------------

/** Store both hosts and connect to the bot host's lobby. `apiToken` only when typed:
 *  the coordinator keeps the one it has, and never sends it back to show. */
export const connectHosts = ({ host, api, apiToken }) =>
  request('config.connect', { host, api, ...(apiToken ? { apiToken } : {}) })
export const disconnectHosts = () => send('config.disconnect')
/** `key` is host | api | apiToken. */
export const setEndpoint = (key, value) => send('config.set', { [key]: value })
export const probeHealth = () => send('health.probe')
export const lobbyCommand = (token) => request('lobby.command', { token })
export const clearActivity = () => send('lobby.clearActivity')

export const setSetting = (key, value) => send('settings.set', { key, value })
export const resetSettings = () => send('settings.reset')

/**
 * A table's bar, for that table alone: the regime and the preflop engine are
 * kept per table. Picking a regime also re-asks the table's hand.
 */
export const selectRegime = (index, value) => send('regime.select', { index, value })
export const setExploitPct = (index, value) => send('regime.setExploitPct', { index, value })
export const setRequireStats = (index, on) => send('regime.setRequireStats', { index, on })
export const selectPreflop = (index, value) => send('preflop.select', { index, value })
export const setGtoPct = (index, value) => send('preflop.setGtoPct', { index, value })

export const solveTable = (index) => send('table.solve', { index })
/** Manual mode's answer for this hand. */
export const pickRegime = (index, regime) => send('table.pick', { index, regime })
export const tableCommand = (index, token) => request('table.command', { index, token })
export const clearFeed = (index) => send('table.clearFeed', { index })

export const setManualStat = (index, name, key, value) =>
  send('stats.set', { index, name, key, value })
export const clearManualStats = (index, name) => send('stats.clear', { index, name })
export const setManualTournament = (index, key, value) =>
  send('tournament.set', { index, key, value })
export const clearManualTournament = (index) => send('tournament.clear', { index })
/**
 * An editor closed. `before` is what it showed when it opened; the coordinator
 * compares it with what it holds once every keystroke has landed, and re-asks
 * the spot if the body changed.
 */
export const typedDone = (index, kind, before, name) =>
  send('table.typed', { index, kind, before, ...(name ? { name } : {}) })

export const fetchHistory = (index) => request('history.list', { index })
export const fetchHand = (index, key) => request('history.hand', { index, key })
/** `entryId`, not `id`: that one is the request's own, and pairs it with its reply. */
export const fetchEntry = (index, entryId) => request('history.entry', { index, entryId })
export const clearHistory = (index) => send('history.clear', { index })

/** The screenshot check, relayed to the bot host. A photo takes a while each way. */
export const checkScreenshot = (payload) =>
  request('check.screenshot', payload, { timeout: 150000 })

open()

// A hot reload replaces this module; the socket it opened must not outlive it.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearTimeout(timer)
    const old = ws
    ws = null
    try {
      old?.close()
    } catch {
      /* already gone */
    }
  })
}
