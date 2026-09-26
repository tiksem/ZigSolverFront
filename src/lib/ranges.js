/**
 * How a range is drawn: the 13x13 chart, and the combos the board leaves.
 *
 * The ranges themselves arrive from the coordinator, already read off the
 * answers and collected street by street (`table.ranges`, and a past decision's
 * from the history). Each player's class map — `{ "AA": 1, "AKs": 0.85, ... }`
 * — is what the API averaged over the combos the board leaves live, so a cell's
 * weight is "how much of this hand the range holds", and the combo count beside
 * it is how many ways there are left to hold it. Both halves are needed: a class
 * the board has taken two of is not half as likely, it is the same hand with
 * fewer combos.
 */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const SUITS = ['s', 'h', 'd', 'c']

export const STREETS = ['preflop', 'flop', 'turn', 'river']

/** 'AKs' | 'AKo' | 'AA' for the cell at (row, col) of the 13x13 chart. */
export function cellKey(row, col) {
  if (row === col) return `${RANKS[row]}${RANKS[row]}`
  const hi = RANKS[Math.min(row, col)]
  const lo = RANKS[Math.max(row, col)]
  return row < col ? `${hi}${lo}s` : `${hi}${lo}o`
}

/** The 169 cells in chart order — suited above the diagonal, offsuit below. */
export const GRID = (() => {
  const out = []
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      out.push({
        key: cellKey(row, col),
        row,
        col,
        kind: row === col ? 'pair' : row < col ? 'suited' : 'offsuit',
      })
    }
  }
  return out
})()

/** The suits of `rank` no board card has taken. */
function liveSuits(rank, dead) {
  return SUITS.filter((s) => !dead.has(`${rank}${s}`))
}

/**
 * How many combos of `key` the board leaves — 6 / 4 / 12 on a blank board, and
 * fewer once the cards are out. Zero means the hand cannot be held at all,
 * which is a different thing from a range that does not want it.
 */
export function liveCombos(key, dead) {
  const a = key[0]
  const b = key[1]
  const sa = liveSuits(a, dead)
  if (a === b) return (sa.length * (sa.length - 1)) / 2
  const sb = liveSuits(b, dead)
  const both = sa.filter((s) => sb.includes(s)).length
  // Suited: one combo per suit live in BOTH ranks. Offsuit: every pairing of a
  // live suit with a different live suit.
  return key[2] === 's' ? both : sa.length * sb.length - both
}

/**
 * One player's chart: 169 cells, each with the weight the range holds it at and
 * the combos the board leaves. `dead` is the board as a Set of card strings.
 */
export function chartOf(weights, dead) {
  const w = weights || {}
  return GRID.map((cell) => {
    const combos = liveCombos(cell.key, dead)
    const weight = combos > 0 ? Number(w[cell.key]) || 0 : 0
    return { ...cell, weight, combos, held: weight * combos }
  })
}

/**
 * Why THIS answer carries no ranges, as a message key — or null when it does.
 *
 * Every case is a real property of the regime that ran rather than a failure,
 * so the sheet names it: nothing on the preflop engines (the chart is bent by
 * the opponents' stats, not solved against their ranges) and nothing on the
 * exploit regime (it walks the hand against behavioural models and never
 * enumerates villain's range).
 */
export function whyNoRanges(result) {
  if (result?.type !== 'answer') return null
  const players = result.meta?.ranges?.players
  if (Array.isArray(players) && players.length) return null
  if (result.solver === 'preflop-allin' || result.solver === 'chart+allin') {
    return 'ranges.noneAllin'
  }
  if (result.regime === 'exploit') return 'ranges.noneExploit'
  if (result.street === 'preflop') return 'ranges.nonePreflop'
  return 'ranges.noneOther'
}
