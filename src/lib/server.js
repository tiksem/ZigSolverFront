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
 */

import { ref, computed } from 'vue'

/** The table index the Kotlin side broadcasts the running-table list on. */
export const INDEXES_TABLE_INDEX = 96782

/** ConnectionMode.entries — 0 is HAND: snapshots and commands. */
export const MODE_HAND = 0

const HOST_KEY = 'zigsolver.server'
const API_KEY = 'zigsolver.api'

export const serverInput = ref(localStorage.getItem(HOST_KEY) || '')
export const apiInput = ref(localStorage.getItem(API_KEY) || '')

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
  localStorage.setItem(HOST_KEY, serverInput.value)
}

export function setApi(value) {
  apiInput.value = String(value || '').trim()
  localStorage.setItem(API_KEY, apiInput.value)
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

export function displayHost(target = server.value) {
  return target ? target.host + target.prefix : ''
}

export function displayApi(target = api.value) {
  return target ? target.host + target.prefix : ''
}
