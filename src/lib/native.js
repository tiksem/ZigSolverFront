/**
 * The macOS shell, when this bundle is running inside it.
 *
 * `macos/` builds an app whose window is a WKWebView with these same files in
 * it, loaded over a private URL scheme out of an encrypted pack rather than off
 * any HTTP server. That app also STARTS the solver: a loopback-bound
 * `python -m api.server` with a token minted fresh for the launch, which it
 * hands to the server through the environment and to this page through one
 * injected global, evaluated before any of our own script runs:
 *
 *     window.__ZIGSOLVER__ = { api: "http://127.0.0.1:53411", token: "…", … }
 *
 * So under the shell there is no ZigSolver API to type — there is one, it is
 * this process's own, and the token is the only thing on the machine that can
 * spend it. Two consequences the UI acts on:
 *
 *   * the API field is not shown (ConnectView, SettingsSheet). The bot host is
 *     still typed, because that one really is somewhere else.
 *   * every call to the API carries `Authorization: Bearer …`. Nothing else
 *     does: the bot host is the user's own and has no token.
 *
 * In a browser the global is absent and everything below reads as null, which
 * is what keeps `npm run dev` and the bundle the Kotlin server serves working
 * exactly as they did — an API without a token, typed by hand.
 */

/** Cap what we will accept out of the global, so a malformed one reads as absent. */
function text(value, max) {
  return typeof value === 'string' && value.length <= max ? value.trim() : ''
}

function read() {
  const raw = typeof window !== 'undefined' ? window.__ZIGSOLVER__ : null
  if (!raw || typeof raw !== 'object') return null
  const api = text(raw.api, 200)
  // Without an endpoint there is nothing the shell is telling us that the
  // normal two-field flow does not already do better.
  if (!api) return null
  return Object.freeze({
    /** Absolute base URL of the app's own solver, e.g. `http://127.0.0.1:53411`. */
    api,
    /** Bearer token for it — this launch only, and never written to disk. */
    token: text(raw.token, 512),
    /** The app's version string, for the About line. */
    version: text(raw.version, 40),
    /** The bot host the app was last connected to, restored across launches. */
    host: text(raw.host, 200),
  })
}

/** The shell's configuration, or null in a browser. */
export const nativeShell = read()

/** Shorthand for the many `v-if`s that only ask whether there is one. */
export const isNative = !!nativeShell

/**
 * The API token typed on the connect screen, in a browser.
 *
 * A deployed API can require one (`api/server.py --auth-token`, which guards
 * its whole surface, /health included), and a page that sends no Authorization
 * then gets a 401 on every call and reports the solver as unreachable. So the
 * endpoint has an optional credential beside it.
 *
 * It is kept here rather than in lib/server.js, which owns the ref and its
 * persistence, so that apiHeaders() below stays the ONE place a token is ever
 * attached to a request; lib/server.js pushes the value in as it changes.
 * Empty is the ordinary case — an API without a token wants no header at all.
 */
let typedToken = ''

/** Set by lib/server.js when the typed token is read or changed. */
export function setTypedApiToken(value) {
  typedToken = typeof value === 'string' && value.length <= 512 ? value.trim() : ''
}

/**
 * `headers` plus the API's Authorization, when there is a token.
 *
 * Every fetch at the ZigSolver API goes through this — /move, /cancel, /health
 * and /screenError — and nothing else does. Calls at the BOT HOST must not: the
 * token belongs to the solver, and sending it to a host the user typed would be
 * handing it to a third party.
 *
 * The shell's token wins wherever there is one: it is the credential for the
 * solver THIS app started, minted for the launch, and under the shell there is
 * no second endpoint to point at.
 */
export function apiHeaders(headers) {
  const token = (nativeShell && nativeShell.token) || typedToken
  if (!token) return headers ? { ...headers } : {}
  return { ...(headers || {}), Authorization: `Bearer ${token}` }
}

/** The shell's message port, or null when there is not one. */
function bridge() {
  try {
    return window.webkit?.messageHandlers?.zigsolver || null
  } catch {
    return null
  }
}

/**
 * Tell the shell the bot host changed, so the next launch starts on it.
 *
 * localStorage would do it for a browser, but the app also wants the value for
 * its own window title and for the field it shows before the page is up.
 * Absent handler (a browser, an older shell) = nothing happens.
 */
export function reportHost(host) {
  bridge()?.postMessage({ type: 'host', host: String(host || '') })
}

/**
 * Ask the shell for a tab on `index`, and say whether it took the request.
 *
 * In the app a table is a TAB, not a route change: the tables list stays put in
 * the tab that cannot be closed, and every table you open sits beside it the
 * way pages do in a browser. Two tables at once is the normal case for this
 * tool, and one route at a time cannot express it.
 *
 * The return value is what the caller falls back on: false in a browser, and
 * also false if the shell refuses, so the router stays the answer whenever the
 * tab did not happen.
 */
export function openTableTab(index) {
  const port = bridge()
  if (!port) return false
  const n = Number(index)
  if (!Number.isFinite(n)) return false
  port.postMessage({ type: 'openTable', index: n })
  return true
}
