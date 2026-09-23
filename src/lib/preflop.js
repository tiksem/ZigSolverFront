/**
 * The preflop picker's choices — which engine answers a decision before there
 * is a board.
 *
 * A sibling of lib/regime.js, deliberately separate rather than more entries in
 * that picker: the two answer different streets and neither constrains the
 * other.
 *
 *   alg       the rangegen chart: a fast heuristic bent by the opponents' stats
 *   gto       the presolved blueprint: an exact solve of the actual game
 *   advanced  neither — draw one per hand at a mix you set
 *
 * `gto` needs the blueprint service, and whether the API has one comes from its
 * /health — the coordinator reads it and says so (`state.gtoAvailable`).
 */

/**
 * The three choices, in picker order. Only what is NOT prose lives here: the
 * value, and whether the mode needs the blueprint service at all. Every word
 * is in the message files under `preflop.<value>.*`.
 */
export const PREFLOP_ENGINES = [
  { value: 'alg', needsService: false },
  { value: 'gto', needsService: true },
  { value: 'advanced', needsService: true },
]

export const PREFLOP_BY_VALUE = Object.fromEntries(PREFLOP_ENGINES.map((e) => [e.value, e]))

/** `preflop.gto.title` etc — the message key for one field of one engine. */
export function preflopKey(value, field) {
  return `preflop.${value}.${field}`
}
