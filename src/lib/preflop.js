/**
 * Which engine answers a PREFLOP decision, and who decides.
 *
 * A sibling of lib/regime.js, deliberately separate rather than four more
 * entries in that picker. The two answer different streets and neither
 * constrains the other: `regime` is the question asked about the FLOP onwards
 * (equilibrium vs this villain's leak), and this is which of two engines plays
 * the hand before there is a board. Folding them together would offer eight
 * combinations of two independent choices and make both harder to read.
 *
 * Three choices, two of which are the endpoint's `preflop` verbatim:
 *
 *   alg       the rangegen chart: a fast heuristic bent by the opponents' stats
 *   gto       the presolved blueprint: an exact solve of the actual game
 *   advanced  neither — draw one per hand at a mix you set
 *
 * `advanced` never reaches the API. It is a UI mode that decides which of
 * `alg` / `gto` goes out, by rolling.
 *
 * The draw happens ONCE PER HAND, on the hand's FIRST PREFLOP DECISION, and is
 * kept for the rest of its preflop. Same reason the regime coin is drawn once:
 * a hand is one line, and opening under one engine only to face the 3-bet under
 * the other produces a line neither would have played.
 *
 * `gto` NEEDS THE BLUEPRINT SERVICE. When the API reports it is not configured
 * (`/health.preflopEngines` without "gto"), this falls back to `alg` — the
 * picker says so rather than offering a choice that would quietly come back as
 * the chart anyway. The server degrades the same way for a spot the grid does
 * not cover, and reports it per answer as `preflopRequested` next to `preflop`.
 */

import { reactive, ref, watch } from 'vue'
import { readStored, writeStored } from './persist'

const KEY = 'zigsolver.preflop'

/**
 * The three choices, in picker order.
 *
 * Only what is NOT prose lives here: the value that goes out with the request,
 * and whether the mode needs the blueprint service to be usable at all. Every
 * word is in the message files under `preflop.<value>.*`.
 */
export const PREFLOP_ENGINES = [
  { value: 'alg', needsService: false },
  { value: 'gto', needsService: true },
  { value: 'advanced', needsService: true },
]

export const PREFLOP_BY_VALUE = Object.fromEntries(
  PREFLOP_ENGINES.map((e) => [e.value, e]),
)

/** `preflop.gto.title` etc — the message key for one field of one engine. */
export function preflopKey(value, field) {
  return `preflop.${value}.${field}`
}

const DEFAULT_STATE = {
  selected: 'alg',
  /** Advanced: the weight on GTO, in percent. 0 = always the chart, 100 =
   *  always the blueprint — both ends are legal, and are how you park it. */
  gtoPct: 50,
}

const state = reactive(load())

function load() {
  const out = { ...DEFAULT_STATE }
  const raw = readStored(KEY)
  if (!raw) return out
  const saved = typeof raw === 'object' ? raw : { selected: raw }
  if (PREFLOP_BY_VALUE[saved.selected]) out.selected = saved.selected
  if (Number.isFinite(Number(saved.gtoPct))) out.gtoPct = clampPct(saved.gtoPct)
  return out
}

function clampPct(v) {
  return Math.min(100, Math.max(0, Math.round(Number(v))))
}

watch(state, (v) => writeStored(KEY, { ...v }), { deep: true })

export const preflop = state

export function setPreflop(value) {
  if (PREFLOP_BY_VALUE[value]) state.selected = value
}

/** Advanced: the weight on the blueprint, 0-100. */
export function setGtoPct(value) {
  const n = Number(value)
  if (Number.isFinite(n)) state.gtoPct = clampPct(n)
}

/**
 * Whether the server can actually answer with the blueprint.
 *
 * Driven by `/health.preflopEngines`. An OLDER server does not send the field
 * at all; that is read as "chart only" rather than as "yes", because guessing
 * yes would offer a choice every hand would silently ignore.
 *
 * Starts false so the picker is honest before the first /health lands, rather
 * than offering `gto` for the seconds it takes to find out.
 */
export const gtoAvailable = ref(false)

/** Feed a /health payload in (lib/settings.noteServerInfo, one place). */
export function noteHealth(info) {
  const list = info && info.preflopEngines
  gtoAvailable.value = Array.isArray(list) && list.includes('gto')
}

/**
 * The advanced mode's coin. Drawn ONCE PER HAND — the caller keeps it, and
 * makes sure it is drawn on the hand's first preflop decision.
 *
 * Knows nothing about the spot: whether the hand can carry the draw is the
 * separate check in `resolvePreflop`.
 */
export function flipPreflopCoin() {
  return Math.random() * 100 < state.gtoPct ? 'gto' : 'alg'
}

/**
 * This hand's engine, resolved against what the server can serve.
 *
 * `forced` is set only where the fallback actually cost something — the coin
 * came up `gto`, or `gto` was selected outright, and the service is not there.
 * Choosing `alg` and getting `alg` is not a fallback and never sets it.
 */
export function resolvePreflop(coin, available) {
  const want = state.selected === 'advanced' ? coin : state.selected
  if (want === 'gto' && !available) {
    return { coin, engine: 'alg', forced: { key: 'reason.noPreflopService' } }
  }
  return { coin, engine: want, forced: null }
}
