/**
 * Transient notifications.
 *
 * The host talks while you are looking at the felt — a new hand, a stat read, a
 * table that is not running, the confirmation of a command you sent. Each one
 * surfaces here for a few seconds and is kept in the message dock afterwards,
 * so nothing is missed and nothing stays in the way.
 */

import { ref } from 'vue'

/** At most this many on screen; older ones are dropped, not queued. */
const MAX_VISIBLE = 4

export const notifications = ref([])

let seq = 0
const timers = new Map()

export function notify(text, { tone = 'info', ttl = 4500 } = {}) {
  const id = ++seq
  const entry = { id, text: String(text), tone, at: Date.now() }
  const next = [...notifications.value, entry]
  // Drop from the front rather than queueing: a burst should show its most
  // recent members, not replay the oldest.
  for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
    clearTimeout(timers.get(dropped.id))
    timers.delete(dropped.id)
  }
  notifications.value = next.slice(-MAX_VISIBLE)
  if (ttl) timers.set(id, setTimeout(() => dismiss(id), ttl))
  return id
}

export function dismiss(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  notifications.value = notifications.value.filter((n) => n.id !== id)
}

export function clearNotifications() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  notifications.value = []
}
