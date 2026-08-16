/**
 * Cards, and a 7-card evaluator so a simulated hand can actually be won.
 *
 * A card is `{ r, s }` with r 0..12 (deuce..ace) and s 0..3, printed the way
 * the poker client prints it: `Q♠`, `4♥ T♦ 8♣`.
 */

export const RANKS = '23456789TJQKA'
export const SUITS = ['♠', '♥', '♦', '♣']

export function makeDeck() {
  const deck = []
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ r, s })
  return deck
}

export const cardText = (c) => RANKS[c.r] + SUITS[c.s]

/** Hole cards as the body carries them: `hand=Q♠J♠`. */
export const handText = (cards) => cards.map(cardText).join('')

/** Board as the body carries it: `Board: 4♥ T♦ 8♣`. */
export const boardText = (cards) => cards.map(cardText).join(' ')

const CATEGORIES = [
  'high card',
  'a pair',
  'two pair',
  'three of a kind',
  'a straight',
  'a flush',
  'a full house',
  'four of a kind',
  'a straight flush',
]

function straightHigh(ranks) {
  const has = Array(13).fill(false)
  for (const r of ranks) has[r] = true
  for (let hi = 12; hi >= 4; hi--) {
    let ok = true
    for (let k = 0; k < 5; k++) {
      if (!has[hi - k]) {
        ok = false
        break
      }
    }
    if (ok) return hi
  }
  // The wheel: the ace plays low, so 5 is the high card.
  if (has[12] && has[0] && has[1] && has[2] && has[3]) return 3
  return null
}

/**
 * Best five of the cards given -> a comparable score array,
 * `[category, ...tiebreakers]`, high is better. Compare with `cmpScore`.
 */
export function evaluate7(cards) {
  const counts = Array(13).fill(0)
  const suited = [[], [], [], []]
  for (const c of cards) {
    counts[c.r]++
    suited[c.s].push(c.r)
  }

  const flush = suited.find((s) => s.length >= 5)
  if (flush) {
    const sf = straightHigh(flush)
    if (sf != null) return [8, sf]
    return [5, ...[...flush].sort((a, b) => b - a).slice(0, 5)]
  }

  const present = counts.map((n, r) => (n ? r : -1)).filter((r) => r >= 0)
  const straight = straightHigh(present)

  // [count, rank] groups, biggest group first and highest rank within it.
  const groups = []
  for (let r = 12; r >= 0; r--) if (counts[r]) groups.push([counts[r], r])
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const kickers = (n, used) =>
    groups
      .filter(([, r]) => !used.includes(r))
      .map(([, r]) => r)
      .slice(0, n)

  const [c0, r0] = groups[0]
  const [c1, r1] = groups[1] || [0, -1]
  if (c0 === 4) return [7, r0, ...kickers(1, [r0])]
  if (c0 === 3 && c1 >= 2) return [6, r0, r1]
  if (straight != null) return [4, straight]
  if (c0 === 3) return [3, r0, ...kickers(2, [r0])]
  if (c0 === 2 && c1 === 2) return [2, r0, r1, ...kickers(1, [r0, r1])]
  if (c0 === 2) return [1, r0, ...kickers(3, [r0])]
  return [0, ...kickers(5, [])]
}

export function cmpScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1)
    if (d) return d
  }
  return 0
}

/** 'a pair of Kings', 'two pair, tens and fours' — for the showdown line. */
export function describeScore(score) {
  const name = CATEGORIES[score[0]]
  const hi = RANKS[score[1]]
  switch (score[0]) {
    case 8:
      return `${name}, ${hi} high`
    case 7:
      return `${name}, ${hi}s`
    case 6:
      return `${name}, ${hi}s full of ${RANKS[score[2]]}s`
    case 5:
      return `${name}, ${hi} high`
    case 4:
      return `${name}, ${hi} high`
    case 3:
      return `${name}, ${hi}s`
    case 2:
      return `${name}, ${hi}s and ${RANKS[score[2]]}s`
    case 1:
      return `${name} of ${hi}s`
    default:
      return `${name}, ${hi} high`
  }
}
