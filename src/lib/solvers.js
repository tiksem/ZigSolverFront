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
      'when the estimate does not contain it, so the answer is about the hand actually held.',
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
  'flop-checkdown': {
    title: 'MCCFR blueprint — checkdown leaf',
    tone: 'weak',
    quality: 'mccfr',
    summary: 'Last resort: no postflop betting after the flop at all.',
    detail:
      'The cheapest rung. Everything past the flop is checked down, so the answer knows ' +
      'nothing about future streets — treat the frequencies as a rough guide and raise ' +
      'maxSolveTime if you can.',
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

/** `meta.flow` from /solve — how the 2-player street was actually solved. */
export const FLOWS = {
  exact: 'Exact CFR over the full betting menu.',
  'exact-reduced': 'Exact CFR over a reduced bet menu (the balancer trimmed sizes to fit).',
  net: 'Flop truncated at the turn, leaves valued by the neural net.',
  mccfr: 'Sampling MCCFR blueprint (3+ players).',
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
