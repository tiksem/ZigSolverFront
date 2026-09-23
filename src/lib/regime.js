/**
 * The regime picker's choices — which question the solver is asked.
 *
 * Deliberately NOT in the settings sheet. The other options are how a solve is
 * requested and you set them once; this is what you are asking for, and it
 * changes hand to hand — so it lives on the table screen, one click from the
 * answer it produced.
 *
 *   gto       the equilibrium strategy at the node
 *   exploit   the maximum-EV action against this villain's measured behaviour
 *   manual    neither — ask once per hand, and send whichever was picked
 *   advanced  neither — draw one per hand at a mix you set
 *
 * Which one is selected, the advanced mix, whether this hand can carry Exploit
 * and how its coin came up are all the coordinator's (lib/coordinator.js);
 * this module is only what the picker draws.
 */

/**
 * The four choices, in picker order.
 *
 * Only what is NOT prose lives here: the value, and whether the mode has a
 * "where it does not apply" section at all. Every word — short, title,
 * tagline, detail, limits — is in the message files under `regime.<value>.*`.
 */
export const REGIMES = [
  { value: 'gto', hasLimits: false },
  { value: 'exploit', hasLimits: true },
  { value: 'manual', hasLimits: false },
  { value: 'advanced', hasLimits: true },
]

export const REGIME_BY_VALUE = Object.fromEntries(REGIMES.map((r) => [r.value, r]))

/** `regime.gto.title` etc — the message key for one field of one regime. */
export function regimeKey(value, field) {
  return `regime.${value}.${field}`
}

/**
 * "The HUD barely covers this villain", as a quotable reason — the words the
 * coordinator uses for the same refusal (regime.thin_read_reason), for the
 * bar's line about a draw that has not been made yet.
 *
 * Zero is its own key rather than the plural's zero form: "no stats" and "only
 * 0 stats" are the same fact and only one of them is a sentence.
 */
export function thinReadReason(count) {
  return count === 0 ? { key: 'reason.noStats' } : { key: 'reason.fewStats', count }
}
