/**
 * localStorage-backed refs, in one place.
 *
 * Everything the operator sets by hand should survive a reload — the dev server
 * restarts constantly, and re-picking the theme, the tab you were reading and
 * the crop you were iterating on every time is friction with no upside.
 *
 * Two rules the callers rely on:
 *
 *   - a write that throws is not an error. Private mode and a full quota both
 *     reject setItem, and the app is perfectly usable without persistence — it
 *     just forgets. Nothing here ever propagates a storage failure.
 *   - a stored value is UNTRUSTED input. It was written by an older build, or
 *     hand-edited, so every ref sanitizes what it reads and falls back to its
 *     default rather than restoring nonsense into the UI.
 */

import { ref, watch } from 'vue'

/** Stored value for `key`, or undefined if absent/unreadable. */
export function readStored(key) {
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch {
    return undefined
  }
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    // Keys written before this module stored bare strings ('open', 'dark').
    // They parse as themselves, which is exactly the migration we want.
    return raw
  }
}

/** Write `value` as JSON, or remove the key when it is undefined. */
export function writeStored(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or quota: the setting just does not persist */
  }
}

/**
 * A ref that loads from `key` and writes back on every change.
 *
 * `sanitize` maps a stored value to an acceptable one, and returns undefined to
 * reject it — that is the hook for "this used to be a number and is now an enum".
 * Called inside a component's setup, the watcher is scoped to that component and
 * stops with it.
 */
export function persistentRef(key, fallback, sanitize = (v) => v) {
  const stored = readStored(key)
  const restored = stored === undefined ? undefined : sanitize(stored)
  const state = ref(restored === undefined ? fallback : restored)
  watch(
    state,
    (v) => writeStored(key, v),
    { deep: fallback !== null && typeof fallback === 'object' },
  )
  return state
}

/** sanitize helper: keep the value only if it is one of `allowed`. */
export function oneOf(allowed) {
  return (v) => (allowed.includes(v) ? v : undefined)
}

/** sanitize helper: booleans only — a stored 'true' string is not one. */
export function asBoolean(v) {
  return typeof v === 'boolean' ? v : undefined
}

/** sanitize helper: strings only, capped so a junk value cannot bloat a field. */
export function asString(max = 200) {
  return (v) => (typeof v === 'string' ? v.slice(0, max) : undefined)
}
