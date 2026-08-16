/**
 * Normalizes a /move answer into what the panel renders.
 *
 *   { actions:    [{action, probability}],   <- the SERVED answer: the exploit
 *                                               when a profile resolved
 *     gtoActions: [{action, probability}],   <- what it deviated FROM (null preflop)
 *     solver, profile, street, hand, responseTime,
 *     meta: { flow, cached, board, actingSeat, seats, potBB, toCallBB,
 *             solveSeconds, gtoStrategy, handDecisions, warnings, ... } }
 *
 * Action keys are `check`, `fold`, `call(NN.NBB)`, `bet 33%(4.4BB)`,
 * `raise 60%(27.5BB)`, `all-in(37.8BB)` postflop, and `raise 8.4BB` style
 * preflop / multiway.
 */

const KIND_ORDER = { fold: 0, check: 1, call: 2, bet: 3, raise: 4, 'all-in': 5 }

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

/** `bet 33%(4.4BB)` -> { kind:'bet', pct:33, bb:4.4 }. */
export function splitAction(key) {
  const kind = actionKind(key)
  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(key)
  const bb = /\(?\s*(\d+(?:\.\d+)?)\s*BB\s*\)?/i.exec(key)
  return {
    kind,
    pct: pct ? parseFloat(pct[1]) : null,
    bb: bb ? parseFloat(bb[1]) : null,
  }
}

export const ACTION_TONE = {
  fold: 'var(--label-3)',
  check: 'var(--teal)',
  call: 'var(--green)',
  bet: 'var(--orange)',
  raise: 'var(--pink)',
  'all-in': 'var(--red)',
  other: 'var(--purple)',
}

function toList(actions) {
  if (!Array.isArray(actions)) return []
  return actions
    .filter((a) => a && a.action != null)
    .map((a) => ({
      action: a.action,
      probability: Number(a.probability) || 0,
      ...splitAction(a.action),
    }))
}

function sortForDisplay(list) {
  return [...list].sort((a, b) => {
    const ka = KIND_ORDER[a.kind] ?? 9
    const kb = KIND_ORDER[b.kind] ?? 9
    if (ka !== kb) return ka - kb
    return (a.bb ?? a.pct ?? 0) - (b.bb ?? b.pct ?? 0)
  })
}

/** One draw from a probability distribution (the move you would actually make). */
export function sampleAction(list) {
  const total = list.reduce((s, a) => s + a.probability, 0)
  if (total <= 0) return null
  let r = Math.random() * total
  for (const a of list) {
    r -= a.probability
    if (r <= 0) return a
  }
  return list[list.length - 1]
}

let nextId = 1

/**
 * A /move response body -> a render-ready answer.
 *
 * `request` is what we asked for, so the panel can say which read produced this
 * answer even when the endpoint echoes a resolved object rather than a name.
 */
export function buildAnswer(payload, request = {}) {
  const actions = sortForDisplay(toList(payload.actions))
  const gtoRaw = payload.gtoActions == null ? null : sortForDisplay(toList(payload.gtoActions))
  const meta = payload.meta || {}
  // `actions` IS the GTO answer when no profile was served; only call the two
  // different when a profile actually resolved.
  const hasProfile = payload.profile != null && gtoRaw != null
  const deviated =
    hasProfile &&
    gtoRaw.some((g) => {
      const a = actions.find((x) => x.action === g.action)
      return !a || Math.abs(a.probability - g.probability) > 0.0005
    })
  return {
    id: nextId++,
    receivedAt: Date.now(),
    type: 'answer',
    payload,
    request,
    street: payload.street,
    hand: payload.hand,
    solver: payload.solver,
    profile: payload.profile,
    responseTime: payload.responseTime,
    exploit: actions,
    gto: gtoRaw,
    hasProfile,
    deviated,
    sampledExploit: sampleAction(actions),
    sampledGto: gtoRaw ? sampleAction(gtoRaw) : null,
    meta,
    warnings: meta.warnings || [],
  }
}

/**
 * A refused or unreachable call. `hint` is the actionable half — a 400 from the
 * endpoint explains itself, a network failure does not.
 */
export function buildError(message, { payload = null, hint = null, request = {} } = {}) {
  return {
    id: nextId++,
    receivedAt: Date.now(),
    type: 'error',
    message,
    hint,
    payload,
    request,
  }
}

/** Percent with one decimal, but exact 0 / 100 stay clean. */
export function pct(p) {
  const v = p * 100
  if (v <= 0) return '0'
  if (v >= 99.95) return '100'
  return v.toFixed(1)
}
