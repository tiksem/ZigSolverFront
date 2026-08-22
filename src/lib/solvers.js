/**
 * What the `solver` field of a /move answer means — the method that actually
 * ran. The regime ladder degrades under a tight budget, so the frequencies
 * cannot be read without knowing which rung produced them; this is the copy
 * behind the "?" next to the solver badge.
 */

export const SOLVERS = {
  chart: {
    title: 'Preflop chart',
    tone: 'neutral',
    quality: 'chart',
    summary: 'No solver ran — the preflop answer is a chart.',
    detail:
      'The baseline is the measured TAG cluster deviated to 3bet-or-fold: never limp, ' +
      'unopened pots are open-raise or fold, facing aggression re-raise or fold. Two ' +
      'exceptions produce calls — small pocket pairs set-mining at a priced call, and the ' +
      'BB flatting a single raiser when nobody else is in. The opponents’ VPIP / PFR / ' +
      'ATS / 3BET bend the widths. There is no GTO twin preflop: the chart IS the baseline.',
  },
  exact: {
    title: 'Exact CFR',
    tone: 'good',
    quality: 'exact',
    summary: 'Heads-up, solved exactly by the CPU/GPU CFR engine.',
    detail:
      'The strongest 2-player path: a real tree solved to a 1%-of-pot early-stop target ' +
      'within the request budget. The hero’s combo is injected into the flop entry range ' +
      'when the estimate does not contain it, so the answer is about the hand actually held. ' +
      'A flop this badge covers may still have been solved on a cheaper abstraction of the ' +
      'same exact engine — trimmed bet menus, or clustered turn runouts — when the full one ' +
      'did not fit; the Flow line below says which.',
  },
  exploit: {
    title: 'Behavioural expectimax',
    tone: 'ok',
    quality: 'exploit',
    summary: 'Not a solve: maximum EV against models fitted to real players.',
    detail:
      'Against a FIXED opponent model there is no equilibrium to compute, so this is an ' +
      'expectimax rather than CFR — villain’s fold/call/raise probabilities and bet sizes come ' +
      'from boosters trained on millions of real hands with these HUD stats, the showdown ' +
      'model supplies E[share], and the hero maximizes. Villain’s range is never enumerated; ' +
      'it is absorbed into the models’ weights, learned from the betting line. Nothing is ' +
      'cached: the tree it walks is this hand, so every call rebuilds it.\n\n' +
      'Three honest limits. Only BET sizes were trained, so the hero’s raise branches come ' +
      'from the measured population raise-TO distribution rather than a model. The raise chain ' +
      'is capped at one raise, so facing a raise the menu is call-or-fold — a re-raise was ' +
      'never priced rather than priced and rejected, and the warnings say so. And there is no ' +
      'ICM in it at all: a bubble spot gets a cash-game answer.',
  },
  net: {
    title: 'Net-truncated flop',
    tone: 'ok',
    quality: 'net',
    summary: 'Flop solved against the turn value net instead of a full tree.',
    detail:
      'The balancer picked the net regime because a full solve did not fit the time budget. ' +
      'Turn leaves are evaluated by the neural value net rather than played out. Cheaper and ' +
      'still close, but this flow retains no solver session — a profile answer may be ' +
      'unavailable, in which case the GTO strategy is served instead.',
  },
  'exact-thinned': {
    title: 'Exact CFR (thinned from multiway)',
    tone: 'good',
    quality: 'exact',
    summary: 'The flop was 3-way; it is heads-up now, so the exact solver took over.',
    detail:
      'When a player folds postflop, everything from the next street on is a genuine ' +
      '2-player game, and the exact solver is roughly an order of magnitude closer to ' +
      'equilibrium than the blueprint. The folded player’s chips stay in as dead money and ' +
      'both survivors’ ranges are the blueprint’s reach-weighted ranges at the thin point, ' +
      'conditioned on the whole multiway prefix actually played.',
  },
  'net-thinned': {
    title: 'Net-truncated (thinned from multiway)',
    tone: 'ok',
    quality: 'net',
    summary: 'Thinned to heads-up, then answered on the net-truncated flop flow.',
    detail:
      'Same hand-off as exact-thinned, but the 2-player balancer landed on the net regime ' +
      'for the budget available. Turn leaves come from the value net rather than a solved ' +
      'subtree.',
  },
  'flop-full': {
    title: 'MCCFR blueprint — full menu',
    tone: 'good',
    quality: 'mccfr',
    summary: '3-way flop on the top rung: the full betting menu, 100 card buckets.',
    detail:
      'The multiway path is a sampling MCCFR blueprint, not the 2-player exact engine. ' +
      'This is its best rung — every bet size in the abstraction is available on every ' +
      'street. Profiles shape the entry ranges only; the answer is the blueprint’s own ' +
      'strategy.',
  },
  'flop-shove-turn-river': {
    title: 'MCCFR blueprint — shove/fold later streets',
    tone: 'ok',
    quality: 'mccfr',
    summary: 'The flop keeps its menu; the turn and river are cut to check/all-in.',
    detail:
      'Rung 2 of the flop ladder — taken when a full-menu solve did not fit the budget. ' +
      'The flop decision is still solved properly, but later-street play is abstracted to ' +
      'check or all-in, which biases the flop frequencies toward that shape.',
  },
  'flop-shove-turn-river-cap1': {
    title: 'MCCFR blueprint — shove/fold later streets, one raise',
    tone: 'ok',
    quality: 'mccfr',
    summary:
      'Same as the rung above, with the flop capped at a single raise per street.',
    detail:
      'On real 3-way ranges the uncapped rung prices at 20–31s, so a 15s request used to ' +
      'fall all the way to the checkdown leaf. Cutting the flop raise chain to one raise ' +
      '(bet, raise, then fold or call — no re-raise and no shove over it) is 45% fewer ' +
      'infosets and fits any stack depth. Measured against a converged full-menu ' +
      'reference it is indistinguishable from the uncapped rung: the boundary that ' +
      'matters is betting versus no betting, not how deep the raise chain goes.',
  },
  'flop-shove-turn-cap1': {
    title: 'MCCFR blueprint — shove/fold turn, one raise',
    tone: 'ok',
    quality: 'mccfr',
    summary:
      'The flop keeps its menu, the turn is check/all-in, the river is checked down.',
    detail:
      'The cheapest rung that still keeps a real decision on every street it models — ' +
      'about 7s at any stack depth. The river carries no betting, which costs roughly ' +
      '0.01–0.02 total variation against a full-menu reference, but the flop still plays ' +
      'for a genuine turn decision. Well clear of the checkdown leaf below it, which has ' +
      'twice the error on the hero’s own seat.',
  },
  'flop-checkdown': {
    title: 'MCCFR blueprint — checkdown leaf',
    tone: 'weak',
    quality: 'mccfr',
    summary: 'Last resort: no postflop betting after the flop at all.',
    detail:
      'The cheapest rung. Everything past the flop is checked down, so the answer knows ' +
      'nothing about future streets — treat the frequencies as a rough guide and raise ' +
      'maxSolveTime if you can. Measured error on the hero’s seat is about twice any rung ' +
      'that keeps postflop betting, so this one is worth spending budget to escape.',
  },
  'turn-unabstracted': {
    title: 'MCCFR turn — no card abstraction',
    tone: 'good',
    quality: 'mccfr',
    summary: 'Turn-rooted blueprint with the card abstraction dropped entirely.',
    detail:
      'The finest turn rung: still the sampling blueprint, but each combo is its own ' +
      'infoset rather than one of 500 buckets. Expensive (~71M iterations) and gated ' +
      'behind a large budget.',
  },
  'turn-full-fine': {
    title: 'MCCFR turn — 500 buckets',
    tone: 'good',
    quality: 'mccfr',
    summary: 'Turn-rooted, full menu, the fine card abstraction.',
    detail:
      'On a turn root the card abstraction is what binds, not the iteration count: 100 ' +
      'buckets sits at a 16.0% pot NashConv floor iterations cannot cross, while 500 ' +
      'reaches 11.8%. This rung buys that fidelity.',
  },
  'turn-full': {
    title: 'MCCFR turn — full menu',
    tone: 'ok',
    quality: 'mccfr',
    summary: 'Turn-rooted, full betting menu, the coarse (100-bucket) abstraction.',
    detail:
      'All bet sizes available, but combos are pooled into 100 buckets — the measured ' +
      'abstraction floor on a turn root. Fine for the shape of the answer, coarse for ' +
      'thin distinctions between similar hands.',
  },
  'turn-shove-river': {
    title: 'MCCFR turn — shove/fold river',
    tone: 'weak',
    quality: 'mccfr',
    summary: 'The turn keeps its menu; the river is cut to check/all-in.',
    detail: 'A budget rung: river play is abstracted, which tilts turn frequencies.',
  },
  'turn-checkdown-river': {
    title: 'MCCFR turn — river checkdown',
    tone: 'weak',
    quality: 'mccfr',
    summary: 'No river betting at all.',
    detail: 'The cheapest turn rung. The river is checked down in the model.',
  },
  'river-unabstracted': {
    title: 'MCCFR river — no card abstraction',
    tone: 'good',
    quality: 'mccfr',
    summary: 'A 3-way river solved with every combo as its own infoset.',
    detail:
      'A 3-way river is only ~13.5k infosets unabstracted and solves in about half a ' +
      'second, so it carries no card-abstraction error at all.',
  },
  'river-full-fine': {
    title: 'MCCFR river — 500 buckets',
    tone: 'good',
    quality: 'mccfr',
    summary: 'River-rooted with the fine card abstraction.',
    detail: 'Full menu, 500 buckets — the fallback when the unabstracted rung did not fit.',
  },
  'river-full': {
    title: 'MCCFR river — 100 buckets',
    tone: 'ok',
    quality: 'mccfr',
    summary: 'River-rooted, full menu, coarse abstraction.',
    detail: 'All sizes available; combos pooled into 100 buckets.',
  },
}

const UNDERTRAINED = {
  title: 'Undertrained',
  tone: 'weak',
  quality: 'mccfr',
  summary: 'No rung fit the budget — the cheapest one ran at whatever iterations it bought.',
  detail:
    'A blueprint run for too few iterations is not a weaker answer, it is an untrained ' +
    'one. Unvisited infosets fall back to uniform noise. Treat this answer as ' +
    'provisional and give the request more time.',
}

export function describeSolver(name) {
  if (!name) return null
  if (SOLVERS[name]) return { name, ...SOLVERS[name] }
  if (name.endsWith('-undertrained')) {
    const base = SOLVERS[name.slice(0, -'-undertrained'.length)]
    return {
      name,
      ...UNDERTRAINED,
      title: `${base ? base.title : name} — undertrained`,
      detail: `${UNDERTRAINED.detail}${base ? `\n\n${base.detail}` : ''}`,
    }
  }
  return {
    name,
    title: name,
    tone: 'neutral',
    quality: 'other',
    summary: 'Solver regime reported by the API.',
    detail: 'No local description for this regime name.',
  }
}

/**
 * `meta.flow` from /solve — how the 2-player street was actually solved. Listed
 * in the balancer's own preference order: it runs the strongest flow that fits
 * maxSolveTime, and the three exact rungs are all real CFR solves — what changes
 * is how much of the game they abstract away before solving it.
 */
export const FLOWS = {
  exact: 'Exact CFR over the full betting menu.',
  'exact-reduced': 'Exact CFR over a reduced bet menu (the balancer trimmed sizes to fit).',
  'exact-clustered':
    'Reduced menus plus turn-runout clustering: the flop→turn chance node solves two ' +
    'representatives per cluster instead of all ~49 runouts, so the turn and river subtrees ' +
    'under the rest disappear. 2–5× faster for 0.2–1.6% deployment exploitability depending ' +
    'on the group count, which is well inside the bar that makes a full solve preferable to ' +
    'the net — so every rung of it is spent before the net is.',
  net: 'Flop truncated at the turn, leaves valued by the neural net.',
  mccfr: 'Sampling MCCFR blueprint (3+ players).',
  expectimax:
    'Expectimax over the trained behavioural models — hero maximizes, villain’s nodes are ' +
    'expectations under the fitted action and size distributions, chance nodes average over ' +
    'runouts (enumerated on the river, bucketed from a flop root).',
}

/**
 * One line on how the street was solved, for any `meta.flow` — including a
 * regime this build has never heard of. The balancer gains rungs faster than
 * this app ships, and a flow with no local copy is exactly the case where the
 * name alone is not enough to read the frequencies.
 */
export function describeFlow(name) {
  if (!name) return null
  if (FLOWS[name]) return FLOWS[name]
  if (name.startsWith('exact')) {
    return (
      'An exact CFR solve on a regime this build has no description for — the balancer ' +
      'picked it to fit the budget, so expect some abstraction against the full menu.'
    )
  }
  return 'Solve regime reported by the API; no local description for this flow name.'
}

/** The decision category the engine assigned the hero hand for each action. */
export const DECISION_LABELS = {
  value_bet: 'Value bet',
  thin_value: 'Thin value',
  protection: 'Protection',
  semi_bluff: 'Semi-bluff',
  bluff: 'Bluff',
  bluff_raise: 'Bluff raise',
  trap: 'Trap',
  bluff_catch: 'Bluff catch',
  regular_call: 'Regular call',
  regular_check: 'Regular check',
  give_up_fold: 'Give-up fold',
  give_up_check: 'Give-up check',
  no_equity_fold: 'No-equity fold',
  no_equity_call: 'No-equity call',
}
