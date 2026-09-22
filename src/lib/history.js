/**
 * Every answer the table has shown, kept so a hand can be read again after the
 * table has moved past it.
 *
 * The panel only ever holds the newest answer: the turn replaces the flop, the
 * next hand replaces the river, and a spot worth a second look is gone by the
 * time you think to look. So each answer that lands on screen — an error
 * included, since a refused body is usually a misread and worth seeing again —
 * is filed here with the snapshot it was asked on, and the table view can put
 * both back on the felt.
 *
 * What is stored is the answer object itself (lib/moveResult). It already
 * carries the request, and so the exact body that went out, plus the raw
 * payload with `meta.ranges` — which is how a past hand's range streets are
 * rebuilt without keeping a second copy of them.
 *
 * The hand's LAST snapshot is kept too, when the host sends one: the body that
 * ends on "Hand finished". The hero's decisions stop at the hero's last action,
 * and without it the history would never show what the villains did next, the
 * river that came, or the cards shown down.
 *
 * Kept PER TABLE and persisted, newest first, capped. Storage is finite and the
 * payloads are the size of a ranges block each, so a write that hits the quota
 * drops the oldest entries across every table and tries again rather than
 * silently forgetting everything from then on.
 */

import { reactive } from 'vue'
import { parseHandBody } from './handBody'
import { readStored, writeStored } from './persist'
import { rangeRecord, sortStreets } from './ranges'

const KEY = 'zigsolver.history'

/** Per table. A session of a few hours is well inside it. */
const PER_TABLE = 150

/**
 * Minted once per page load and put in front of every handId.
 *
 * The handId restarts its count on a reload (`t3#1-AhKd`), so on its own it
 * would file tonight's first hand under last night's first hand whenever the
 * hero happened to hold the same two cards.
 */
const SESSION = Math.random().toString(36).slice(2, 8)

/** `{ '3': [entry, ...] }`, newest first. */
export const history = reactive(load())

function validEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.at !== 'number') {
    return false
  }
  if (e.kind === 'final') return typeof e.body === 'string'
  return (
    !!e.result &&
    (e.result.type === 'answer' || e.result.type === 'error') &&
    typeof e.result.request?.body === 'string'
  )
}

/** The snapshot an entry is about — what was asked, or how the hand ended. */
export function bodyOf(e) {
  return e.kind === 'final' ? e.body : e.result.request.body
}

const isSolve = (e) => e.kind !== 'final'

function load() {
  const raw = readStored(KEY)
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [table, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue
    const kept = list.filter(validEntry).slice(0, PER_TABLE)
    if (kept.length) out[String(table)] = kept
  }
  return out
}

/** Every table's entries, oldest first — the order a quota trim eats them in. */
function oldestFirst() {
  return Object.entries(history)
    .flatMap(([table, list]) => list.map((e) => ({ table, at: e.at, id: e.id })))
    .sort((a, b) => a.at - b.at)
}

function fits(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Persist, trimming the oldest quarter until it fits.
 *
 * Gives up once there is nothing left to trim — private mode rejects every
 * write, and the history still works for the session, it just is not kept.
 */
function save() {
  for (;;) {
    const snapshot = JSON.parse(JSON.stringify(history))
    if (fits(snapshot)) return
    const all = oldestFirst()
    if (all.length <= 1) {
      writeStored(KEY, undefined)
      return
    }
    const drop = new Set(all.slice(0, Math.ceil(all.length / 4)).map((e) => e.id))
    for (const table of Object.keys(history)) {
      history[table] = history[table].filter((e) => !drop.has(e.id))
      if (!history[table].length) delete history[table]
    }
  }
}

/**
 * The few things the list shows, read once when the answer is filed rather
 * than by parsing every body each time the sheet opens.
 */
function summarize(body) {
  const parsed = parseHandBody(body)
  if (!parsed) return { street: null, heroHand: null, board: [], pot: null }
  return {
    street: parsed.streetName || null,
    heroHand: parsed.heroHand ? [...parsed.heroHand] : null,
    board: [...(parsed.board || [])],
    pot: parsed.pot ?? null,
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const handKey = (handId) => `${SESSION}:${handId || '?'}`

/**
 * File the answer that just landed on screen, under the hand it was asked for.
 *
 * The same body answered in the same regime again — Re-solve, or a settings
 * change — REPLACES the entry it repeats: it is the same decision, and a list
 * of five identical flops is harder to read than one. A different regime on the
 * same body is a different question and gets a row of its own.
 */
export function recordSolve(tableIndex, handId, result) {
  const body = result?.request?.body
  if (!body || (result.type !== 'answer' && result.type !== 'error')) return
  const table = String(tableIndex)
  const list = history[table] || []
  const entry = {
    id: newId(),
    at: Date.now(),
    hand: handKey(handId),
    ...summarize(body),
    result: JSON.parse(JSON.stringify(result)),
  }
  const regimeOf = (r) => (r.type === 'answer' ? r.regime : r.request?.regime)
  const top = list.find(isSolve)
  // Only the newest row can be repeated: once the hand has ended, a re-solve of
  // its last decision is a new row after the ending rather than a rewrite.
  const repeats =
    !!top &&
    top === list[0] &&
    top.hand === entry.hand &&
    top.result.request.body === body &&
    regimeOf(top.result) === regimeOf(entry.result)
  history[table] = [entry, ...(repeats ? list.slice(1) : list)].slice(0, PER_TABLE)
  save()
}

/**
 * File the snapshot a hand ended on, against the hand it ended.
 *
 * Only for a hand this page has answered something in — a result with no
 * decision behind it is not a hand the history has a place for. A hand ends
 * once, so a second finish for it replaces the first.
 */
export function recordHandEnd(tableIndex, handId, body) {
  if (!handId || !body) return
  const table = String(tableIndex)
  const list = history[table] || []
  const hand = handKey(handId)
  if (!list.some((e) => isSolve(e) && e.hand === hand)) return
  const entry = { id: newId(), at: Date.now(), hand, kind: 'final', ...summarize(body), body }
  const rest = list.filter((e) => !(e.kind === 'final' && e.hand === hand))
  history[table] = [entry, ...rest].slice(0, PER_TABLE)
  save()
}

/** This table's decisions, newest first — the answers, not how hands ended. */
export function entriesFor(tableIndex) {
  return (history[String(tableIndex)] || []).filter(isSolve)
}

/** One decision by id, or null — it may have been trimmed or cleared since. */
export function findEntry(tableIndex, id) {
  if (!id) return null
  return entriesFor(tableIndex).find((e) => e.id === id) || null
}

/**
 * This table's hands, newest first, each with its decisions in the order they
 * were answered and the snapshot it ended on, if one came.
 *
 * `last` is the fullest account of the hand there is: how it ended when that is
 * known, and otherwise the last decision asked.
 */
export function handsFor(tableIndex) {
  const hands = []
  const byKey = new Map()
  for (const e of history[String(tableIndex)] || []) {
    let h = byKey.get(e.hand)
    if (!h) {
      h = { key: e.hand, at: e.at, heroHand: null, entries: [], final: null }
      byKey.set(e.hand, h)
      hands.push(h)
    }
    if (e.kind === 'final') h.final = e
    else h.entries.unshift(e)
    if (!h.heroHand && e.heroHand) h.heroHand = e.heroHand
  }
  const out = hands.filter((h) => h.entries.length)
  for (const h of out) h.last = h.final || h.entries[h.entries.length - 1]
  return out
}

/** One hand by key, or null. */
export function findHand(tableIndex, key) {
  return handsFor(tableIndex).find((h) => h.key === key) || null
}

/**
 * The ranges a past decision could have been read against: its hand's streets
 * as they stood when it was answered, latest record per street.
 *
 * Nothing answered AFTER it — reviewing the flop should not show a turn range
 * the flop could not have known about.
 */
export function rangesAt(tableIndex, entry) {
  if (!entry) return []
  const streets = {}
  const same = entriesFor(tableIndex)
    .filter((e) => e.hand === entry.hand && e.at <= entry.at)
    .reverse()
  for (const e of same) {
    const record = rangeRecord(e.result, e.at)
    if (record) streets[record.street] = record
  }
  return sortStreets(Object.values(streets))
}

/** Forget one table's history. */
export function clearHistory(tableIndex) {
  delete history[String(tableIndex)]
  save()
}
