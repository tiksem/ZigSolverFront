/**
 * How the HUD stats and the tournament header are laid out on screen.
 *
 * Only ORDER and FORMAT live here. What a stat means to the endpoint, which ones
 * can be typed, and the lines a typed value writes into the snapshot are the
 * coordinator's (zigsolver_coordinator/hand_body.py) — it sends those lines with
 * the table's state, so an editor never has to know the host's syntax.
 */

/** The four the HUD leads with, in the order worth showing first. */
export const CORE_STATS = ['VPIP', 'PFR', '3BET', 'ATS']

/** AF is a ratio; every other stat is a percentage. */
export function isRatioStat(key) {
  return key === 'AF'
}

/** The tournament header's three numbers, in the order the felt and the panes list them. */
export const TOURNAMENT_KEYS = ['playersLeft', 'playersPaid', 'averageStack']
