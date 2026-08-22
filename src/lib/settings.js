/**
 * Everything about how a solve is requested, in one place and persisted.
 *
 * These map onto the /move request body (api/move.MoveRequest); the comments
 * are what each one actually does at the endpoint, because they are what the
 * settings sheet shows.
 */

import { reactive, ref, watch } from 'vue'

const KEY = 'zigsolver.settings'

export const DEFAULTS = {
  /** `maxSolveTime` — wall-time budget for the flop solve, in seconds. The
   *  balancer picks the strongest regime that fits it. */
  maxSolveTime: 15,
  /** Send each snapshot to the API as it arrives. Off = only the Re-solve
   *  button and a change of regime call the solver. */
  autoSolve: true,
  /** `handId` — keys the per-hand tree cache, so a later street and a re-solve
   *  under a different read reuse the tree instead of solving again. */
  useHandCache: true,
  /** `statHands` — how many hands the body's HUD stats were measured over.
   *  It prices the read the exploit regime runs on: everything the HUD does
   *  not carry is imputed from the population, and a thin sample widens those
   *  imputations. null = unknown, read as "a lot". */
  statHands: null,
  /** Cancel the running solve when a newer snapshot arrives (POST /cancel). */
  cancelSuperseded: true,
  /** Keep the sampled action stable while the same spot is re-solved, instead
   *  of drawing a fresh one from every answer. GTO only — an exploit answer is
   *  an argmax and has no draw to hold. */
  stableSample: false,

  // --- flop solve quality (null = whatever the API's own default is) --------
  // The three numbers the flop regime ladder runs on. All FLOP ONLY: turn and
  // river are solved as their own street at the widest sizing grid, with no
  // ladder and no floor. The API publishes its defaults and accepted ranges on
  // /health.solveTuning, which is what the sheet shows as the placeholder.

  /** `gateExploitability` — % of pot. An exact regime is preferred to the
   *  net-truncated flow when its PREDICTED exploitability is at or under this.
   *  Lower = stricter = more spots drop to the net (whose own honest number is
   *  5.6-12%). 0 = never solve exactly. */
  gateExploitability: null,
  /** `targetExploitability` — % of pot. The solve stops once its own
   *  best-response check reaches this. Lower = keeps iterating longer, still
   *  capped by the budget. */
  targetExploitability: null,
  /** `minSolveTime` — seconds. Floor under that early stop: the solve keeps
   *  improving past the target until this much time is spent. Never adds
   *  iterations beyond the budget's cap, so it cannot exceed maxSolveTime. */
  minSolveTime: null,
}

const LIMITS = {
  maxSolveTime: [0.5, 600],
  statHands: [1, 1000000],
  gateExploitability: [0, 100],
  targetExploitability: [0.01, 100],
  minSolveTime: [0, 600],
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
export const GATE_PRESETS = [1, 2, 3, 5, 10]

/**
 * `/health.solveTuning` — the API's own defaults, ranges and labels for the
 * three knobs above, or null until a /health has been read. The sheet shows
 * these as placeholders so an untouched setting reads as what the server will
 * actually do rather than as a number this app invented.
 */
export const serverTuning = ref(null)

/** Feed a /health payload in (ConnectView probes it; the sheet re-reads it). */
export function noteServerInfo(info) {
  serverTuning.value = (info && info.solveTuning) || null
}

/** The server's default for `key`, as a string for a placeholder, or null. */
export function serverDefault(key, budget) {
  const spec = serverTuning.value && serverTuning.value[key]
  if (!spec) return null
  if (spec.default !== null && spec.default !== undefined) return String(spec.default)
  // minSolveTime's default is a FRACTION of the budget, not a fixed number.
  if (spec.defaultFraction && Number.isFinite(budget)) {
    return `${Math.round(budget * spec.defaultFraction * 10) / 10}`
  }
  return null
}
