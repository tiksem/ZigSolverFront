/**
 * Which question the solver is asked, and who decides.
 *
 * Deliberately NOT in the settings sheet. The other options are how a solve is
 * requested and you set them once; this is what you are asking for, and it
 * changes hand to hand — so it lives on the table screen, one click from the
 * answer it produced.
 *
 * Three choices, two of which are the endpoint's `regime` verbatim:
 *
 *   gto      the equilibrium strategy at the node
 *   exploit  the maximum-EV action against this villain's measured behaviour
 *   manual   neither — ask before each solve, and send whichever was picked
 *
 * `manual` never reaches the API. It is a UI mode: the table stops and asks,
 * and what goes out is `gto` or `exploit`.
 */

import { reactive, watch } from 'vue'

const KEY = 'zigsolver.regime'

export const REGIMES = [
  {
    value: 'gto',
    short: 'GTO',
    title: 'GTO',
    tagline: 'The equilibrium strategy at this node.',
    detail:
      'A real CFR solve of the spot: both ranges estimated from the players’ own preflop ' +
      'action and HUD stats, the postflop line replayed through the solved tree, and the ' +
      'answer is the hero hand’s strategy there. It is a distribution — mix at the stated ' +
      'frequencies. It gives up nothing to an opponent who is playing you back, and it also ' +
      'gives up whatever this particular villain is handing out.',
  },
  {
    value: 'exploit',
    short: 'Exploit',
    title: 'Exploit',
    tagline: 'The maximum-EV action against this villain’s measured behaviour.',
    detail:
      'Not a solve and not a deviation from one. Villain’s action, size and showdown ' +
      'probabilities come from models fitted to real players with these HUD stats, and the ' +
      'hero simply maximizes against them — an expectimax, so there is no equilibrium in it ' +
      'and nothing to mix. The answer is one action with the EV of every alternative next to ' +
      'it. It is also maximally exploitable back, and only as good as the read: with no HUD ' +
      'stats on the villain the models describe the average player, not this one.',
    limits:
      'Heads-up postflop only. Preflop, a flop dealt three or more ways, and a two-handed ' +
      'table are outside what the models were fitted on, and those answer GTO instead — the ' +
      'panel says so when it happens. There is no ICM in it either: a bubble spot gets a ' +
      'cash-game answer.',
  },
  {
    value: 'manual',
    short: 'Manual',
    title: 'Manual',
    tagline: 'Ask before every solve.',
    detail:
      'Nothing is sent until you pick. Each new decision the table pushes stops and asks GTO ' +
      'or Exploit, and that choice applies to that decision only. Spots where exploit is not ' +
      'available are not worth asking about, so they go straight to GTO.',
  },
]

export const REGIME_BY_VALUE = Object.fromEntries(REGIMES.map((r) => [r.value, r]))

const state = reactive({
  selected: load(),
})

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return REGIME_BY_VALUE[raw] ? raw : 'gto'
  } catch {
    return 'gto'
  }
}

watch(
  () => state.selected,
  (v) => {
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* private mode: the choice just does not persist */
    }
  },
)

export const regime = state

export function setRegime(value) {
  if (REGIME_BY_VALUE[value]) state.selected = value
}

/**
 * Can the exploit regime answer THIS snapshot?
 *
 * Mirrors api/exploit_spot.py's refusals, so the manual prompt is not raised
 * for a decision whose answer would come back GTO whatever you picked, and the
 * Exploit chip can say why it is inert. Postflop, heads-up on the flop, at
 * least three players dealt in.
 *
 * Heads-up ON THE FLOP is not the same as heads-up now: a pot dealt three ways
 * is a three-way game even after someone folds, and the models were never
 * fitted on one.
 */
export function exploitAvailability(hand) {
  if (!hand) return { ok: false, why: 'no snapshot yet' }
  if (!hand.street) {
    return { ok: false, why: 'this is preflop, and the behavioural models are postflop only' }
  }
  if (hand.tableSize < 3) {
    return {
      ok: false,
      why: 'a two-handed table is outside the models’ training data',
    }
  }
  const sawFlop = hand.seats.filter(
    (s) => !s.actions.some((a) => a.street === 0 && a.kind === 'fold'),
  )
  if (sawFlop.length !== 2) {
    return {
      ok: false,
      why: `the flop was ${sawFlop.length}-way and the models are heads-up postflop`,
    }
  }
  return { ok: true, why: null }
}
