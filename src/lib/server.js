/**
 * The two endpoints the app talks to, and how to address them.
 *
 *   bot host   the Kotlin runner. One socket per table, mode=0: it pushes the
 *              table snapshots and takes the commands.
 *   ZigSolver  the solver API. Every snapshot is POSTed to its /move and the
 *              answer is what the table view renders.
 *
 * Both are typed once on the root view — `localhost:8080`, `http://10.0.0.4:8000`,
 * `ws://box:8080/app`, all fine — and remembered.
 *
 * Under the macOS shell only the FIRST of them is typed. The solver is a
 * process that app started on loopback, so its endpoint arrives injected and
 * its token rides on every call to it (lib/native.js).
 */

import { ref, computed } from 'vue'
import { readStored, writeStored } from './persist'
import { nativeShell, apiHeaders, setTypedApiToken } from './native'

/** The table index the Kotlin side broadcasts the running-table list on. */
export const INDEXES_TABLE_INDEX = 96782

/** ConnectionMode.entries — 0 is HAND: snapshots and commands. */
export const MODE_HAND = 0

const HOST_KEY = 'zigsolver.server'
const API_KEY = 'zigsolver.api'
const API_TOKEN_KEY = 'zigsolver.apiToken'

/** Stored endpoint as text — anything else under the key reads as "unset". */
function storedHost(key) {
  const v = readStored(key)
  return v === undefined || v === null ? '' : String(v)
}

export const serverInput = ref(storedHost(HOST_KEY))
/**
 * The API endpoint. Under the shell it is the app's own solver and is not a
 * setting: a stored value from a previous browser session must not win over
 * the process this launch actually started.
 */
export const apiInput = ref(nativeShell ? nativeShell.api : storedHost(API_KEY))
/**
 * OPTIONAL bearer token for that endpoint, for an API started with
 * `--auth-token`. Empty means the API wants none, which is the usual case on a
 * LAN — so this is never required to connect, and an empty value sends no
 * header rather than an empty one.
 *
 * Not a setting under the shell for the same reason the endpoint is not: the
 * app injects the token it minted for the solver it started, and a value left
 * in this browser profile by an earlier session must not override it.
 */
export const apiTokenInput = ref(nativeShell ? '' : storedHost(API_TOKEN_KEY))
// Hand it to lib/native.js now, not on first use: a reload restores the token
// from storage and the connect screen's /health probe is the very first call.
setTypedApiToken(apiTokenInput.value)

/** Free-form input -> { secure, host, prefix } or null. */
export function parseServer(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `http://${text}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!url.hostname) return null
  const prefix = url.pathname.replace(/\/+$/, '')
  return {
    secure: url.protocol === 'https:' || url.protocol === 'wss:',
    host: url.host,
    prefix: prefix === '/' ? '' : prefix,
  }
}

export const server = computed(() => parseServer(serverInput.value))
export const api = computed(() => parseServer(apiInput.value))

export function setServer(value) {
  serverInput.value = String(value || '').trim()
  writeStored(HOST_KEY, serverInput.value)
}

export function setApi(value) {
  // The shell's endpoint is not editable — there is no second solver to point
  // at, and the token this app holds is for that one. The UI hides the field
  // rather than relying on this, but a caller that gets here is refused.
  if (nativeShell) return
  apiInput.value = String(value || '').trim()
  writeStored(API_KEY, apiInput.value)
}

/**
 * The API's bearer token. Refused under the shell for the same reason setApi is
 * — the token there is the one the app minted, and nothing typed replaces it.
 */
export function setApiToken(value) {
  if (nativeShell) return
  apiTokenInput.value = String(value || '').trim()
  writeStored(API_TOKEN_KEY, apiTokenInput.value)
  setTypedApiToken(apiTokenInput.value)
}

export function socketUrl(mode, tableIndex, target = server.value) {
  if (!target) return null
  const scheme = target.secure ? 'wss' : 'ws'
  return `${scheme}://${target.host}${target.prefix}/commands?mode=${mode}&tableIndex=${tableIndex}`
}

function http(target, path) {
  if (!target) return null
  const scheme = target.secure ? 'https' : 'http'
  return `${scheme}://${target.host}${target.prefix}${path}`
}

/** An URL on the bot host (the /checkScreenshot upload). */
export function httpUrl(path, target = server.value) {
  return http(target, path)
}

/** An URL on the ZigSolver API (/move, /health). */
export function apiUrl(path, target = api.value) {
  return http(target, path)
}

/**
 * The headers that go with an `apiUrl` — the caller's own, plus the shell's
 * `Authorization` when there is one, and nothing at all in a browser.
 *
 * Re-exported from lib/native.js so that the URL and the credential for it come
 * out of the same module: the one mistake worth designing against here is
 * sending the solver's token to `httpUrl()`, the host the user typed.
 */
export { apiHeaders }

export function displayHost(target = server.value) {
  return target ? target.host + target.prefix : ''
}

export function displayApi(target = api.value) {
  return target ? target.host + target.prefix : ''
}
