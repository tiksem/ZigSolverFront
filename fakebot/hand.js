/**
 * One hand of no-limit hold'em, and the body text the client would print for it.
 *
 * The hand is driven from outside: the table runner asks for `nextActor()`,
 * hands back an action, and asks again — so the hand advances one decision per
 * timer tick and a snapshot can be rendered at any point in between.
 *
 * The rendered body is the same shape src/lib/handBody.js parses (a port of
 * ZigSolver's api/handhistory.py): an optional tournament header, one block per
 * action in acting order, `Board:` lines between the streets, and the seat that
 * is on the clock closing the body with `waiting`.
 *
 * Deliberately not modelled: side pots. An all-in short stack that wins takes
 * the whole pot. Nothing downstream reads chip totals, and the simplification
 * keeps the settle step to a few lines.
 */

import { makeDeck, evaluate7, cmpScore, describeScore, boardText, handText } from './cards.js'
import { statLines } from './players.js'
import { round1 } from './rng.js'

/** Seat counts 2..10, in preflop acting order — the client's own labels. */
export const POSITIONS = {
  2: ['SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'LJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  10: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
}

export const STREETS = ['preflop', 'flop', 'turn', 'river']

/** 2.5 -> '2.5', 3.0 -> '3' — the client never prints a trailing zero. */
export const fmt = (n) => {
  const v = round1(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export function createHand({ seats, handNo, rng, tournament, maxFlopPlayers = 3 }) {
  const n = seats.length
  const order = POSITIONS[n]
  if (!order) throw new Error(`no position layout for ${n} seats`)

  // The button moves one seat per hand, so every seat plays every position.
  const players = seats.map((seat, i) => ({
    seat,
    name: seat.name,
    isHero: seat.isHero,
    persona: seat.persona,
    stats: seat.stats,
    position: order[(i + handNo) % n],
    stack: seat.stack,
    hole: [],
    folded: false,
    allIn: false,
    acted: false,
    // Put money in preflop by choice — a posted blind does not count. This is
    // what the field-size cap below counts, so a limped BB is not "in" yet.
    voluntary: false,
    streetCommit: 0,
    totalCommit: 0,
  }))

  const deck = rng.shuffle(makeDeck())
  let drawn = 0
  const draw = (k) => deck.slice(drawn, (drawn += k))
  for (const p of players) p.hole = draw(2)

  const byPos = [...players].sort(
    (a, b) => order.indexOf(a.position) - order.indexOf(b.position),
  )
  const seat = (pos) => byPos.find((p) => p.position === pos)
  const preflopOrder = byPos
  // Postflop the blinds act first; heads-up that is the BB, who is out of position.
  const postflopOrder =
    n === 2 ? [seat('BB'), seat('SB')] : [seat('SB'), seat('BB'), ...byPos.slice(0, n - 2)]

  const hand = {
    handNo,
    players,
    board: [],
    street: 0,
    currentBet: 0,
    minRaiseTo: 2,
    raises: 0,
    log: [],
    order: preflopOrder,
    pos: -1,
    tournament,
    maxFlopPlayers,
    done: false,
  }

  const pay = (p, amount) => {
    const paid = Math.min(round1(amount), p.stack)
    p.stack = round1(p.stack - paid)
    p.streetCommit = round1(p.streetCommit + paid)
    if (p.stack <= 0) {
      p.stack = 0
      p.allIn = true
    }
  }

  // Blinds are posted, not logged: the parser posts them itself off the
  // positions, exactly as the solver's replay does.
  const sb = seat('SB')
  const bb = seat('BB')
  if (sb) pay(sb, 0.5)
  if (bb) pay(bb, 1)
  hand.currentBet = 1

  hand.notFolded = () => players.filter((p) => !p.folded)
  hand.live = () => players.filter((p) => !p.folded && !p.allIn)
  hand.potTotal = () =>
    round1(players.reduce((sum, p) => sum + p.totalCommit + p.streetCommit, 0))
  hand.toCall = (p) => round1(Math.max(0, hand.currentBet - p.streetCommit))

  /** The seat on the clock, or null when the street's betting is finished. */
  hand.nextActor = () => {
    if (hand.done || hand.notFolded().length <= 1) return null
    for (let k = 1; k <= players.length; k++) {
      const p = hand.order[(hand.pos + k) % hand.order.length]
      if (p.folded || p.allIn) continue
      if (!p.acted || p.streetCommit < hand.currentBet) return p
    }
    return null
  }

  /** Apply `{ kind, to }` and log the block the client would print for it. */
  hand.apply = (p, action) => {
    p.acted = true
    hand.pos = hand.order.indexOf(p)
    // The stack a block declares is the chips behind BEFORE its action: the
    // solver's replay reads `stack=` and only then commits the chips
    // (api/handhistory.py `_Sim.act`), so declaring the post-action stack
    // costs a `declares NBB behind but the replay says …` warning per block.
    const behind = p.stack
    let kind = action.kind
    let amount = null

    if (kind === 'fold') {
      p.folded = true
    } else if (kind === 'check') {
      // nothing to pay
    } else if (kind === 'call') {
      pay(p, hand.toCall(p))
      amount = p.streetCommit
      p.voluntary = true
    } else {
      // bet / raise: `to` is the total this street, the way the client prints it.
      const ceiling = round1(p.stack + p.streetCommit)
      const to = Math.min(Math.max(action.to, hand.minRaiseTo, hand.currentBet), ceiling)
      const prevBet = hand.currentBet
      pay(p, to - p.streetCommit)
      amount = p.streetCommit
      hand.currentBet = Math.max(hand.currentBet, amount)
      hand.minRaiseTo = round1(hand.currentBet + Math.max(1, hand.currentBet - prevBet))
      if (hand.street === 0) hand.raises++
      kind = prevBet > 0 ? 'raise' : 'bet'
      p.voluntary = true
    }
    if (p.allIn && kind !== 'fold' && kind !== 'check') {
      kind = 'all in'
      // An all-in declares the chips it pushes, not the street to-amount —
      // the replay reads it as `seat.stack` and shoves `street_commit + stack`.
      amount = behind
    }

    hand.log.push({
      type: 'act',
      name: p.name,
      position: p.position,
      isHero: p.isHero,
      stats: p.stats,
      hand: handText(p.hole),
      stack: behind,
      street: hand.street,
      action: amount == null ? kind : `${kind} ${fmt(amount)}BB`,
      kind,
      amount,
    })
    return hand.log[hand.log.length - 1]
  }

  /** Deal the next street; false when the river is already out. */
  hand.nextStreet = () => {
    if (hand.street >= 3) return false
    for (const p of players) {
      p.totalCommit = round1(p.totalCommit + p.streetCommit)
      p.streetCommit = 0
      p.acted = false
    }
    hand.street++
    hand.currentBet = 0
    hand.minRaiseTo = 1
    hand.board.push(...draw(hand.street === 1 ? 3 : 1))
    hand.order = postflopOrder
    hand.pos = -1
    hand.log.push({ type: 'board', cards: hand.board.slice() })
    return true
  }

  /** Everyone left is all-in: the rest of the board runs out with no betting. */
  hand.isRunout = () => hand.live().length <= 1 && hand.notFolded().length > 1

  hand.headerLine = () => {
    const pot = `Total pot ${fmt(hand.potTotal())}BB`
    if (!tournament) return pot
    return (
      `This is online poker tournament, ${tournament.playersLeft} players left, ` +
      `${fmt(tournament.averageStack)}BB average stack, ${tournament.playersPaid} ` +
      `players paid. ${pot}`
    )
  }

  const block = (entry) => {
    const out = [entry.name, `position=${entry.position}`, entry.action]
    if (entry.isHero) out.push(`hand=${entry.hand}`)
    else if (entry.showStats) out.push(...statLines(entry.stats))
    out.push(`stack=${fmt(entry.stack)}BB`)
    return out.join('\n')
  }

  /** The snapshot as of now, closing on `waiter`'s decision. */
  hand.render = (waiter) => {
    const seen = new Set()
    const lines = [hand.headerLine()]
    for (const ev of hand.log) {
      if (ev.type === 'board') {
        lines.push(`Board: ${boardText(ev.cards)}`)
        continue
      }
      // The HUD stats ride along the first block a villain gets, not every one.
      lines.push(block({ ...ev, showStats: !seen.has(ev.name) }))
      seen.add(ev.name)
    }
    if (waiter) {
      lines.push(
        block({
          name: waiter.name,
          position: waiter.position,
          action: 'waiting',
          isHero: waiter.isHero,
          hand: handText(waiter.hole),
          stats: waiter.stats,
          showStats: !seen.has(waiter.name),
          stack: waiter.stack,
        }),
      )
    }
    return `${lines.join('\n\n')}\n`
  }

  /** Award the pot. Returns `{ winner, pot, showdown, description }`. */
  hand.settle = () => {
    hand.done = true
    for (const p of players) {
      p.totalCommit = round1(p.totalCommit + p.streetCommit)
      p.streetCommit = 0
    }
    const pot = round1(players.reduce((sum, p) => sum + p.totalCommit, 0))
    const left = hand.notFolded()
    let winner = left[0]
    let description = null
    const showdown = left.length > 1 && hand.board.length === 5
    if (showdown) {
      const scored = left.map((p) => ({ p, score: evaluate7([...p.hole, ...hand.board]) }))
      scored.sort((a, b) => cmpScore(b.score, a.score))
      winner = scored[0].p
      description = describeScore(scored[0].score)
      hand.showdown = scored.map(({ p, score }) => ({
        name: p.name,
        hand: handText(p.hole),
        description: describeScore(score),
      }))
    }
    if (winner) winner.stack = round1(winner.stack + pot)
    for (const p of players) p.seat.stack = p.stack
    return { winner, pot, showdown, description }
  }

  return hand
}
