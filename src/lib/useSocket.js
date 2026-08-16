/**
 * A reconnecting WebSocket as a composable.
 *
 * Same contract the old static pages had — reconnect on close, log errors —
 * but the status is reactive so the UI can show connecting / live / retrying,
 * and the backoff grows instead of hammering a dead host every 5s forever.
 */

import { ref, shallowRef, onScopeDispose } from 'vue'

const BASE_DELAY = 1000
const MAX_DELAY = 15000

export function useSocket({ url, onMessage, onOpen, autoConnect = true }) {
  /** 'idle' | 'connecting' | 'open' | 'retrying' | 'closed' */
  const status = ref('idle')
  const attempts = ref(0)
  const lastError = ref(null)
  const socket = shallowRef(null)

  let timer = null
  let disposed = false
  let wanted = false

  const resolveUrl = () => (typeof url === 'function' ? url() : url?.value ?? url)

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function open() {
    if (disposed) return
    const target = resolveUrl()
    if (!target) {
      status.value = 'idle'
      return
    }
    wanted = true
    clearTimer()
    status.value = attempts.value ? 'retrying' : 'connecting'

    let ws
    try {
      ws = new WebSocket(target)
    } catch (e) {
      lastError.value = String(e)
      return scheduleRetry()
    }
    socket.value = ws

    ws.onopen = () => {
      if (ws !== socket.value) return
      attempts.value = 0
      lastError.value = null
      status.value = 'open'
      onOpen?.(ws)
    }
    ws.onmessage = (event) => {
      if (ws !== socket.value) return
      onMessage?.(event.data, event)
    }
    ws.onerror = () => {
      if (ws !== socket.value) return
      lastError.value = 'socket error'
    }
    ws.onclose = () => {
      if (ws !== socket.value) return
      socket.value = null
      if (wanted && !disposed) scheduleRetry()
      else status.value = 'closed'
    }
  }

  function scheduleRetry() {
    attempts.value += 1
    status.value = 'retrying'
    const delay = Math.min(MAX_DELAY, BASE_DELAY * 2 ** Math.min(attempts.value - 1, 4))
    clearTimer()
    timer = setTimeout(open, delay)
  }

  function close() {
    wanted = false
    clearTimer()
    const ws = socket.value
    socket.value = null
    attempts.value = 0
    status.value = 'closed'
    try {
      ws?.close()
    } catch {
      /* already gone */
    }
  }

  function reconnect() {
    close()
    disposed = false
    attempts.value = 0
    open()
  }

  function send(text) {
    const ws = socket.value
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(text)
      return true
    }
    return false
  }

  if (autoConnect) open()

  onScopeDispose(() => {
    disposed = true
    close()
  })

  return { status, attempts, lastError, socket, send, open, close, reconnect }
}

export const STATUS_LABEL = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  open: 'Live',
  retrying: 'Reconnecting…',
  closed: 'Disconnected',
}
