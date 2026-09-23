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
 * that process's own. The page no longer calls it: the coordinator does
 * (lib/coordinator.js), so the endpoint and the token are handed on to it, and
 * the connect screen and the settings sheet show the solver as embedded rather
 * than as a field.
 *
 * In a browser the global is absent and everything below reads as null, which
 * is what keeps `npm run dev` and the bundle the Kotlin server serves working
 * exactly as they did.
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
  // normal flow does not already do better.
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
 * The app wants the value for its own window title and for the field it shows
 * before the page is up. Absent handler (a browser, an older shell) = nothing
 * happens.
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
