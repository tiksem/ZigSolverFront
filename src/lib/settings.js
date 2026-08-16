/**
 * Everything about how a solve is requested, in one place and persisted.
 *
 * These map onto the /move request body (api/move.MoveRequest); the comments
 * are what each one actually does at the endpoint, because they are what the
 * settings sheet shows.
 */

import { reactive, watch } from 'vue'

const KEY = 'zigsolver.settings'

export const DEFAULTS = {
  /** `maxSolveTime` — wall-time budget for the flop solve, in seconds. The
   *  balancer picks the strongest regime that fits it. */
  maxSolveTime: 15,
  /** Send each snapshot to the API as it arrives. Off = only the Re-solve
   *  button and the read buttons call the solver. */
  autoSolve: true,
  /** `handId` — keys the per-hand tree cache, so a later street and a re-solve
   *  under a different read reuse the tree instead of solving again. */
  useHandCache: true,
  /** `statHands` — how many hands the body's HUD stats were measured over.
   *  Drives the fit weights and the extraction temperature: a 150-hand read is
   *  played much closer to GTO than a 5,000-hand one. null = unknown. */
  statHands: null,
  /** Cancel the running solve when a newer snapshot arrives (POST /cancel). */
  cancelSuperseded: true,
  /** Keep the sampled action stable while the same spot is re-solved, instead
   *  of drawing a fresh one from every answer. */
  stableSample: false,
}

const LIMITS = {
  maxSolveTime: [0.5, 600],
  statHands: [1, 1000000],
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    const out = { ...DEFAULTS }
    for (const k of Object.keys(DEFAULTS)) {
      if (raw[k] === undefined || raw[k] === null) continue
      out[k] = typeof DEFAULTS[k] === 'boolean' ? !!raw[k] : raw[k]
    }
    return out
  } catch {
    return { ...DEFAULTS }
  }
}

export const settings = reactive(load())

export function clampNumber(key, value) {
  const limit = LIMITS[key]
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (!limit) return n
  return Math.min(limit[1], Math.max(limit[0], n))
}

export function setSetting(key, value) {
  if (!(key in DEFAULTS)) return
  if (typeof DEFAULTS[key] === 'boolean') {
    settings[key] = !!value
    return
  }
  if (value === '' || value === null || value === undefined) {
    settings[key] = DEFAULTS[key] === null ? null : DEFAULTS[key]
    return
  }
  settings[key] = clampNumber(key, value)
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS)
}

watch(
  settings,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* private mode: settings just do not persist */
    }
  },
  { deep: true },
)

export const BUDGET_PRESETS = [5, 10, 15, 30, 60, 120]
