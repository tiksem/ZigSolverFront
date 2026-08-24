/**
 * Which question the solver is asked, and who decides.
 *
 * Deliberately NOT in the settings sheet. The other options are how a solve is
 * requested and you set them once; this is what you are asking for, and it
 * changes hand to hand — so it lives on the table screen, one click from the
 * answer it produced.
 *
 * Four choices, two of which are the endpoint's `regime` verbatim:
 *
 *   gto      the equilibrium strategy at the node
 *   exploit  the maximum-EV action against this villain's measured behaviour
 *   manual    neither — ask once per hand, and send whichever was picked
 *   advanced  neither — draw one per hand at a mix you set
 *
 * `manual` and `advanced` never reach the API. They are UI modes that decide
 * which of `gto` / `exploit` goes out: manual by asking, advanced by rolling.
 *
 * Both decide it ON THE FLOP, ONCE, FOR THE WHOLE HAND. A hand is one line and
 * the two regimes answer different questions about it, so switching between
 * them on the turn produces a line neither of them would have played — the flop
 * bet sized by an equilibrium the turn then abandons, or an exploit that never
 * gets to collect.
 *
 * PREFLOP IS NOT PART OF THIS. It is played by the preflop algorithm whatever
 * is selected here, so a preflop node is not a spot the regime fell back from —
 * it is a spot the question was never about. Nothing in the UI should report it
 * as a fallback, and nothing should be decided or drawn for it.
 */

import { reactive, watch } from 'vue'
import { isKnownStat } from './handBody'
import { readStored, writeStored } from './persist'

const KEY = 'zigsolver.regime'

/**
 * How many HUD stats the villain must carry before the advanced regime is allowed
 * to draw Exploit, when that gate is on.
 *
 * Three is the point where the read stops being the population average: the
 * exploit models impute every stat the HUD does not carry, so one or two of them
 * describe the average player with a small dent in it, not this villain.
 */
export const MIN_STATS_FOR_EXPLOIT = 3

/**
 * The four choices, in picker order.
 *
 * Only what is NOT prose lives here: the value that goes out with the request,
 * and whether the mode has a "where it does not apply" section at all. Every
 * word — short, title, tagline, detail, limits — is in the message files under
 * `regime.<value>.*`, so the picker reads in whatever language is selected.
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

const DEFAULT_STATE = {
  selected: 'gto',
  /** Advanced: the weight on Exploit, in percent. 0 = always GTO, 100 = always
   *  Exploit — both ends are legal, and are how you park the mode. */
  exploitPct: 50,
  /** Advanced: refuse to draw Exploit against a villain the HUD barely covers.
   *  On by default — an exploit answer with no read is the population average
   *  dressed as a read, which is the one thing GTO does better. */
  requireStats: true,
}

const state = reactive(load())

function load() {
  const out = { ...DEFAULT_STATE }
  const raw = readStored(KEY)
  if (!raw) return out
  // Before the advanced regime this key held the bare regime string.
  const saved = typeof raw === 'object' ? raw : { selected: raw }
  if (REGIME_BY_VALUE[saved.selected]) out.selected = saved.selected
  if (Number.isFinite(Number(saved.exploitPct))) out.exploitPct = clampPct(saved.exploitPct)
  if (typeof saved.requireStats === 'boolean') out.requireStats = saved.requireStats
  return out
}

function clampPct(v) {
  return Math.min(100, Math.max(0, Math.round(Number(v))))
}

watch(state, (v) => writeStored(KEY, { ...v }), { deep: true })

export const regime = state

export function setRegime(value) {
  if (REGIME_BY_VALUE[value]) state.selected = value
}

/** Advanced: the weight on Exploit, 0-100. */
export function setExploitPct(value) {
  const n = Number(value)
  if (Number.isFinite(n)) state.exploitPct = clampPct(n)
}

/** Advanced: whether a thin HUD read blocks the Exploit draw. */
export function setRequireStats(on) {
  state.requireStats = !!on
}

/**
 * Can the exploit regime answer THIS hand?
 *
 * THREE answers, not two, because "not yet" and "no" are different things to
 * tell an operator and collapsing them is what produced lines like "falls back
 * to GTO: no snapshot yet" on an empty screen:
 *
 *   ok       heads-up postflop — exploit answers this hand
 *   pending  nothing to decide yet: no snapshot, or preflop. NOT a refusal, and
 *            never worth a warning — the regime is decided when the flop comes.
 *   no       this hand is GTO whatever is selected, and `why` is what did it
 *
 * The refusals mirror api/exploit_spot.py's, so the manual prompt is not raised
 * for a hand whose answer would come back GTO whatever you picked.
 *
 * Heads-up ON THE FLOP is not the same as heads-up now: a pot dealt three ways
 * is a three-way game even after someone folds, and the models were never
 * fitted on one. Both refusals are properties of the hand rather than of the
 * street, which is what lets one verdict on the flop stand for the whole hand.
 *
 * `why` is a `{ key, count? }` pair, not a sentence — the bar quotes it inside
 * a larger line and renders both at once (i18n.tk).
 */
export function exploitAvailability(hand) {
  // No snapshot, or preflop: the preflop algorithm plays it and the regime is
  // decided on the flop, so there is nothing here to refuse.
  if (!hand || !hand.street) return { status: 'pending', ok: false, why: null }
  if (hand.tableSize < 3) {
    return { status: 'no', ok: false, why: { key: 'reason.headsUpTable' } }
  }
  const sawFlop = seatsToTheFlop(hand)
  if (sawFlop.length !== 2) {
    return {
      status: 'no',
      ok: false,
      why: { key: 'reason.multiwayFlop', count: sawFlop.length },
    }
  }
  return { status: 'ok', ok: true, why: null }
}

function seatsToTheFlop(hand) {
  return hand.seats.filter((s) => !s.actions.some((a) => a.street === 0 && a.kind === 'fold'))
}

/**
 * What the HUD carries on the villain of this spot.
 *
 * Only stats the endpoint actually reads are counted (handBody.STAT_KEYS):
 * a key the models have no coefficient for is not a read, whatever the client
 * put in the body. The villain is the seat opposite the hero among those still
 * in from the flop — where there is no single one (preflop, multiway), there is
 * nothing to gate on and the count is 0.
 */
export function villainRead(hand) {
  const none = { seat: null, stats: [], count: 0 }
  if (!hand || !hand.hero) return none
  const others = seatsToTheFlop(hand).filter((s) => !s.isHero)
  if (others.length !== 1) return none
  const seat = others[0]
  const stats = Object.keys(seat.stats || {}).filter(isKnownStat)
  return { seat, stats, count: stats.length }
}

/**
 * The advanced regime's coin. Drawn ONCE PER HAND, ON THE FLOP — the caller is
 * what keeps it, and what makes sure it is not drawn before there is a flop.
 *
 * Deliberately knows nothing about the spot: the coin is the hand's question,
 * and whether the hand can carry it is the separate check below.
 */
export function flipRegimeCoin() {
  return Math.random() * 100 < state.exploitPct ? 'exploit' : 'gto'
}

/**
 * "The HUD barely covers this villain", as a quotable reason.
 *
 * Zero is its own key rather than the plural's zero form: "no stats" and "only
 * 0 stats" are the same fact and only one of them is a sentence.
 */
export function thinReadReason(count) {
  return count === 0 ? { key: 'reason.noStats' } : { key: 'reason.fewStats', count }
}

/**
 * This hand's coin, resolved against the hand.
 *
 * `forced` is set only where the refusal actually cost something — the coin
 * came up Exploit and this hand cannot carry it — so the bar can report the
 * hand's draw without pretending a refusal was a GTO flip. A `pending` spot is
 * not a refusal and never sets it.
 */
export function resolveAdvanced(hand, coin) {
  if (coin !== 'exploit') return { coin: 'gto', regime: 'gto', forced: null }
  const availability = exploitAvailability(hand)
  if (availability.status !== 'ok') {
    return { coin, regime: 'gto', forced: availability.why }
  }
  if (state.requireStats) {
    const { count } = villainRead(hand)
    if (count < MIN_STATS_FOR_EXPLOIT) {
      return { coin, regime: 'gto', forced: thinReadReason(count) }
    }
  }
  return { coin, regime: 'exploit', forced: null }
}
