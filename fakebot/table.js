/**
 * One simulated table: it deals hands forever, one decision per timer tick, and
 * pushes to whoever is listening on `mode=0&tableIndex=<index>`.
 *
 * What goes out on the socket is what the Kotlin runner puts out:
 *
 *   * a **snapshot** (a body with `position=` lines) every time the hero is on
 *     the clock — that is the only frame the front end solves;
 *   * plain **log lines** for everything else (new hand, showdown, the action
 *     the bot ended up taking, a seat sitting down), which the front end shows
 *     as notifications and keeps in the message dock.
 *
 * The table only runs while someone is connected, and freezes mid-hand when the
 * last client goes away.
 */

import { boardText } from './cards.js'
import { createHand, fmt, POSITIONS } from './hand.js'
import { decide } from './strategy.js'
import { makeHero, makeVillain, pickName } from './players.js'
import { round1 } from './rng.js'

const HAND_NO_BASE = 4700

export function createTable({ index, seatCount, rng, opts, log }) {
  if (!POSITIONS[seatCount]) throw new Error(`table ${index}: seats must be 2..10`)

  const clients = new Set()
  const seats = [makeHero(rng)]
  const taken = new Set()
  for (let i = 1; i < seatCount; i++) {
    const villain = makeVillain(rng)
    villain.name = pickName(taken, rng)
    taken.add(villain.name)
    seats.push(villain)
  }

  // Heads-up runs as a cash game; anything bigger carries the tournament header.
  const tournament =
    seatCount > 2
      ? { playersLeft: rng.int(180, 900), playersPaid: rng.int(40, 120), averageStack: 0 }
      : null

  let handNo = HAND_NO_BASE + rng.int(1, 400)
  let hand = null
  let timer = null
  let deferred = null
  let pending = null // { actor, body } while the hero is on the clock
  let paused = false
  let botOn = true
  let profile = 'auto'

  const broadcast = (text) => {
    log(index, text)
    for (const send of clients) send(text)
  }

  const wait = (ms, fn) => {
    clearTimeout(timer)
    const delay = Math.max(20, ms / opts.speed)
    if (paused) {
      deferred = { ms, fn }
      return
    }
    timer = setTimeout(fn, delay)
  }

  const jitter = (a, b) => rng.int(a, b)

  // --- the hand loop ---------------------------------------------------------

  const startHand = () => {
    pending = null
    // Anyone who lost their stack leaves; a new name buys in for the seat.
    for (const seat of seats) {
      if (seat.stack >= 1) continue
      if (seat.isHero) {
        seat.stack = round1(rng.float(45, 110))
        broadcast(`Bot re-buys: ${fmt(seat.stack)}BB`)
        continue
      }
      const gone = seat.name
      const fresh = makeVillain(rng)
      taken.delete(gone)
      fresh.name = pickName(taken, rng)
      taken.add(fresh.name)
      Object.assign(seat, fresh)
      broadcast(`${gone} busts out; ${seat.name} sits down with ${fmt(seat.stack)}BB`)
    }
    if (tournament) {
      tournament.playersLeft = Math.max(20, tournament.playersLeft - rng.int(0, 3))
      tournament.averageStack = round1(
        seats.reduce((sum, s) => sum + s.stack, 0) / seats.length + rng.float(-6, 6),
      )
    }

    handNo++
    hand = createHand({ seats, handNo, rng, tournament, maxFlopPlayers: opts.maxFlopPlayers })
    broadcast(`New hand #${handNo} — ${seatCount} seats, blinds 0.5/1BB`)
    wait(jitter(500, 900), step)
  }

  const step = () => {
    const actor = hand.nextActor()
    if (!actor) return closeStreet()
    if (actor.isHero) return heroTurn(actor)

    const entry = hand.apply(actor, decide(actor, hand, rng))
    if (entry.kind === 'all in') {
      broadcast(`${actor.name} (${actor.position}) is all in for ${fmt(entry.amount)}BB`)
    }
    wait(jitter(350, 1100), step)
  }

  /**
   * The hero's decision: push the snapshot, then — after the think time the
   * front end gets to read its answer in — play it out so the game continues.
   */
  const heroTurn = (actor) => {
    pending = { actor, body: hand.render(actor) }
    broadcast(pending.body)
    wait(opts.heroDelay, () => {
      if (!pending) return
      // With the bot switched off the seat just gives up its turn, the way the
      // runner does when it is only watching.
      const action = botOn
        ? decide(actor, hand, rng)
        : { kind: hand.toCall(actor) ? 'fold' : 'check' }
      const entry = hand.apply(actor, action)
      pending = null
      broadcast(`Bot ${botOn ? `(${profile})` : '(off)'}: ${entry.action}`)
      wait(jitter(300, 600), step)
    })
  }

  const STREET_LABELS = ['Preflop', 'Flop', 'Turn', 'River']

  const closeStreet = () => {
    if (hand.notFolded().length <= 1 || hand.street === 3) return finish()
    hand.nextStreet()
    broadcast(
      `${STREET_LABELS[hand.street]}: ${boardText(hand.board)} — pot ${fmt(hand.potTotal())}BB`,
    )
    wait(jitter(700, 1200), step)
  }

  const finish = () => {
    const { winner, pot, showdown, description } = hand.settle()
    // One last body, the way the runner puts it out: the whole history with a
    // `Hand finished` block on the end instead of a decision. It is a snapshot by
    // shape and a result by meaning — /move refuses a body that does not close on
    // the hero — so it is here to prove the front end does not solve it.
    broadcast(`${hand.render(null).trimEnd()}\n\nHand finished\n`)
    if (showdown) {
      const shown = hand.showdown
        .map((s) => `${s.name} ${s.hand} (${s.description})`)
        .join(', ')
      broadcast(`Showdown: ${shown}`)
      broadcast(
        `Hand #${handNo}: ${winner.name} wins ${fmt(pot)}BB with ${description}`,
      )
    } else if (winner) {
      broadcast(`Hand #${handNo}: ${winner.name} wins ${fmt(pot)}BB uncontested`)
    }
    wait(jitter(1600, 2400), startHand)
  }

  // --- what the socket layer talks to ---------------------------------------

  const table = {
    index,
    seatCount,
    get clients() {
      return clients.size
    },
    attach(send) {
      clients.add(send)
      send(`Connected to table ${index} (${seatCount} seats), bot ${botOn ? 'on' : 'off'}`)
      if (pending) send(pending.body)
      // The clock was stopped when the last client left; pick it back up where
      // it stood — mid-hand if there is one, otherwise with a fresh deal.
      if (clients.size === 1) {
        if (hand && !hand.done) wait(jitter(400, 800), step)
        else wait(jitter(200, 500), startHand)
      }
    },
    detach(send) {
      clients.delete(send)
      // Nobody watching: freeze where we are rather than burn timers.
      if (!clients.size) clearTimeout(timer)
    },
    /** A command frame from the front end. */
    command(text, send) {
      const cmd = String(text).trim()
      if (cmd === 'read') {
        send(pending ? pending.body : `No decision pending on table ${index}`)
        return
      }
      if (cmd === 'pause') {
        paused = !paused
        if (!paused && deferred) {
          const { ms, fn } = deferred
          deferred = null
          wait(ms, fn)
        }
        broadcast(paused ? 'Paused' : 'Resumed')
        return
      }
      if (cmd === 'bot') {
        botOn = !botOn
        broadcast(`Bot ${botOn ? 'enabled' : 'disabled'}`)
        return
      }
      if (cmd === 'allbot' || cmd === 'autoenablebot') {
        broadcast(cmd === 'allbot' ? 'All bots enabled' : 'Auto-enable bot set')
        return
      }
      profile = cmd
      broadcast(`Profile set to ${cmd}`)
    },
    stop() {
      clearTimeout(timer)
      clients.clear()
    },
  }
  return table
}
