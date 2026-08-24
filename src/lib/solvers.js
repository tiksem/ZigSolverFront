/**
 * What the `solver` field of a /move answer means — the method that actually
 * ran. The regime ladder degrades under a tight budget, so the frequencies
 * cannot be read without knowing which rung produced them; this is the copy
 * behind the "?" next to the solver badge.
 *
 * Only the badge TONE lives here. The title, the one-line summary and the long
 * explanation are in the message files under `solver.<name>.*`, and are looked
 * up at render time so a language change re-reads them.
 */

import { t, te, tv } from './i18n'

/**
 * Badge colour and family per solver name. `quality` is not shown anywhere yet;
 * it is what a rung is worth relative to the others, and it is kept next to the
 * tone so the two cannot drift apart.
 */
export const SOLVER_TONES = {
  chart: { tone: 'neutral', quality: 'chart' },
  exact: { tone: 'good', quality: 'exact' },
  exploit: { tone: 'ok', quality: 'exploit' },
  net: { tone: 'ok', quality: 'net' },
  'exact-thinned': { tone: 'good', quality: 'exact' },
  'net-thinned': { tone: 'ok', quality: 'net' },
  'flop-full': { tone: 'good', quality: 'mccfr' },
  'flop-shove-turn-river': { tone: 'ok', quality: 'mccfr' },
  'flop-shove-turn-river-cap1': { tone: 'ok', quality: 'mccfr' },
  'flop-shove-turn-cap1': { tone: 'ok', quality: 'mccfr' },
  'flop-checkdown': { tone: 'weak', quality: 'mccfr' },
  'turn-unabstracted': { tone: 'good', quality: 'mccfr' },
  'turn-full-fine': { tone: 'good', quality: 'mccfr' },
  'turn-full': { tone: 'ok', quality: 'mccfr' },
  'turn-shove-river': { tone: 'weak', quality: 'mccfr' },
  'turn-checkdown-river': { tone: 'weak', quality: 'mccfr' },
  'river-unabstracted': { tone: 'good', quality: 'mccfr' },
  'river-full-fine': { tone: 'good', quality: 'mccfr' },
  'river-full': { tone: 'ok', quality: 'mccfr' },
}

const UNDERTRAINED_TONE = { tone: 'weak', quality: 'mccfr' }

/** Whether this build has copy for `name` at all. */
function known(name) {
  return te(`solver.${name}.title`)
}

/**
 * `{ name, tone, quality, title, summary, detail }` for a solver name — the
 * three strings already in the selected language.
 *
 * Three cases, and the middle one is the reason this is a function rather than
 * a map: a `-undertrained` suffix is a real rung run for too few iterations, so
 * it keeps the base rung's explanation and gains one of its own on top.
 */
export function describeSolver(name) {
  if (!name) return null
  if (known(name)) {
    return {
      name,
      ...(SOLVER_TONES[name] || { tone: 'neutral', quality: 'other' }),
      title: t(`solver.${name}.title`),
      summary: t(`solver.${name}.summary`),
      detail: t(`solver.${name}.detail`),
    }
  }
  if (name.endsWith('-undertrained')) {
    const base = name.slice(0, -'-undertrained'.length)
    const baseTitle = known(base) ? t(`solver.${base}.title`) : base
    const baseDetail = known(base) ? `\n\n${t(`solver.${base}.detail`)}` : ''
    return {
      name,
      ...UNDERTRAINED_TONE,
      title: t('solver.undertrained.titleOf', { base: baseTitle }),
      summary: t('solver.undertrained.summary'),
      detail: `${t('solver.undertrained.detail')}${baseDetail}`,
    }
  }
  return {
    name,
    tone: 'neutral',
    quality: 'other',
    title: name,
    summary: t('solver.unknown.summary'),
    detail: t('solver.unknown.detail'),
  }
}

/**
 * One line on how the street was solved, for any `meta.flow` — including a
 * regime this build has never heard of. The balancer gains rungs faster than
 * this app ships, and a flow with no local copy is exactly the case where the
 * name alone is not enough to read the frequencies.
 *
 * The copy is under `flow.*`, listed there in the balancer's own preference
 * order: it runs the strongest flow that fits maxSolveTime, and the three exact
 * rungs are all real CFR solves — what changes is how much of the game they
 * abstract away before solving it.
 */
export function describeFlow(name) {
  if (!name) return null
  if (te(`flow.${name}`)) return t(`flow.${name}`)
  if (name.startsWith('exact')) return t('flow.unknownExact')
  return t('flow.unknown')
}

/** The decision category the engine assigned the hero hand, in words. */
export function decisionLabel(key) {
  return key ? tv(`decision.${key}`, key) : ''
}
