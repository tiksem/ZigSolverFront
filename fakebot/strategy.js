/**
 * How a simulated seat picks its action. Not a solver — a plausible-enough
 * mix of hand strength, pot odds and persona, so the stream of snapshots looks
 * like poker rather than noise, and a station really does call more than a nit.
 */

import { evaluate7 } from './cards.js'
import { clamp, round1 } from './rng.js'

/** Rough 0..1 preflop strength: high cards, pairs, suitedness, connectedness. */
function preflopStrength(hole) {
  const [a, b] = hole
  const hi = Math.max(a.r, b.r)
  const lo = Math.min(a.r, b.r)
  let s = (hi / 12) * 0.45 + (lo / 12) * 0.25
  if (a.r === b.r) s += 0.32
  if (a.s === b.s) s += 0.07
  else if (hi - lo <= 2) s += 0.04
  return clamp(s, 0, 1)
}

const CATEGORY_STRENGTH = [0.16, 0.38, 0.58, 0.72, 0.82, 0.87, 0.93, 0.97, 1]

export function strength(p, hand) {
  if (hand.street === 0) return preflopStrength(p.hole)
  const score = evaluate7([...p.hole, ...hand.board])
  return clamp(CATEGORY_STRENGTH[score[0]] + ((score[1] ?? 0) / 12) * 0.06, 0, 1)
}

function openSize(hand, rng) {
  const limpers = hand.players.filter(
    (p) => !p.folded && p.streetCommit >= 1 && p.position !== 'BB',
  ).length
  return round1(rng.float(2.1, 3.1) + limpers)
}

function betSize(hand, rng, str) {
  const frac = rng.pick([0.33, 0.4, 0.5, 0.66, 0.75, 1.15])
  return round1(Math.max(1, hand.potTotal() * frac * (0.75 + str * 0.5)))
}

function raiseSize(hand, rng) {
  return round1(Math.max(hand.minRaiseTo, hand.currentBet * rng.float(2.2, 3.4)))
}

/**
 * Would entering the pot make the flop wider than the endpoint serves?
 *
 * ZigSolver's postflop advice supports up to 3 players — a 5-way flop comes
 * back as `the flop was dealt 5-way`, which is a 400, not an answer. So a seat
 * that is not in the pot yet does not cold-call into a field that is already
 * full: the table keeps dealing flops the solver can actually be asked about.
 * `--max-flop-players 0` turns this off if the refusal is what you want to see.
 */
function fieldIsFull(p, hand) {
  if (hand.street !== 0 || !hand.maxFlopPlayers || p.voluntary) return false
  const inPot = hand.players.filter((q) => q !== p && !q.folded && q.voluntary).length
  return inPot + 1 > hand.maxFlopPlayers
}

/** `{ kind: 'fold'|'check'|'call'|'bet', to? }` — `bet` covers raises too. */
export function decide(p, hand, rng) {
  const k = p.persona
  const str = strength(p, hand)
  const toCall = hand.toCall(p)
  const pot = hand.potTotal()

  if (toCall > 0 && fieldIsFull(p, hand)) return { kind: 'fold' }

  // Unopened preflop pot: fold, limp, or put in the first raise.
  if (hand.street === 0 && hand.raises === 0 && toCall > 0) {
    if (rng.chance(clamp(k.open * (0.3 + str * 1.9), 0.03, 0.78))) {
      return { kind: 'bet', to: openSize(hand, rng) }
    }
    if (rng.chance(clamp(k.call * 0.35 * (str + 0.15), 0.02, 0.4))) return { kind: 'call' }
    return { kind: 'fold' }
  }

  if (toCall === 0) {
    const lead = hand.street === 0 ? k.open : k.cont * 0.55
    if (p.stack > 0 && rng.chance(clamp(lead * (0.35 + str * 1.4), 0.02, 0.8))) {
      return { kind: 'bet', to: hand.street === 0 ? openSize(hand, rng) : betSize(hand, rng, str) }
    }
    return { kind: 'check' }
  }

  const price = toCall / (pot + toCall)
  if (p.stack > toCall && rng.chance(clamp(k.agg * (str - 0.5) * 1.6, 0, 0.32))) {
    return { kind: 'bet', to: raiseSize(hand, rng) }
  }
  if (rng.chance(clamp(k.call * (str + 0.2 - price * 1.2), 0.02, 0.95))) {
    return { kind: 'call' }
  }
  return { kind: 'fold' }
}
