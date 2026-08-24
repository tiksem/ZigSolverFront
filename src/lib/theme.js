/**
 * Appearance: system, light or dark, remembered.
 *
 * The stylesheet reads `:root[data-theme]` — dark is the system default and
 * `light` / `dark` override it — so the source of truth here is the dataset
 * attribute and this module is what keeps it and localStorage in step.
 *
 * `initTheme()` runs from main.js BEFORE the app mounts: the attribute has to
 * be on <html> for the first paint, or a dark-mode reload flashes light.
 */

import { ref } from 'vue'
import { readStored, writeStored, oneOf } from './persist'

const KEY = 'zigsolver.theme'

/** Cycle order for the nav button — 'system' means "follow the OS". */
export const THEMES = ['system', 'light', 'dark']

const sanitize = oneOf(THEMES)

export const theme = ref('system')

function apply(value) {
  const root = document.documentElement
  if (value === 'system') delete root.dataset.theme
  else root.dataset.theme = value
}

export function setTheme(value) {
  const next = sanitize(value) || 'system'
  theme.value = next
  apply(next)
  // 'system' is the absence of a choice, so it is stored as the absence of a
  // key — that way a later change to the default is picked up rather than
  // pinned by a stale write.
  writeStored(KEY, next === 'system' ? undefined : next)
}

export function cycleTheme() {
  setTheme(THEMES[(THEMES.indexOf(theme.value) + 1) % THEMES.length])
}

/** Read the stored choice and put it on <html>. Call once, before mount. */
export function initTheme() {
  const stored = sanitize(readStored(KEY))
  theme.value = stored || 'system'
  apply(theme.value)
}
