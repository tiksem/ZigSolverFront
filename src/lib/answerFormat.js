/**
 * How an answer's rows are drawn: a colour per action kind, and the percent.
 *
 * The answer itself arrives normalized from the coordinator — every row already
 * carries its `kind`, `pct` and `bb`, a GTO answer is already grouped
 * fold/check/call/bet/raise, and the draw (`sampled`) has already been made, so
 * every page watching a table shows the same play.
 */

export const ACTION_TONE = {
  fold: 'var(--label-3)',
  check: 'var(--teal)',
  call: 'var(--green)',
  bet: 'var(--orange)',
  raise: 'var(--pink)',
  'all-in': 'var(--allin)',
  other: 'var(--purple)',
}

/** `raise 60%(27.5BB)` -> 'raise'. For rows that arrive without their kind. */
export function actionKind(key) {
  const k = String(key).toLowerCase()
  if (k.startsWith('fold')) return 'fold'
  if (k.startsWith('check')) return 'check'
  if (k.startsWith('call')) return 'call'
  if (k.startsWith('bet')) return 'bet'
  if (k.startsWith('raise')) return 'raise'
  if (k.startsWith('all')) return 'all-in'
  return 'other'
}

/** Percent with one decimal, but exact 0 / 100 stay clean. */
export function pct(p) {
  const v = p * 100
  if (v <= 0) return '0'
  if (v >= 99.95) return '100'
  return v.toFixed(1)
}
