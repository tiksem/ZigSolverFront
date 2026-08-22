/**
 * Normalizes a /move answer into what the panel renders.
 *
 *   { actions: [{action, probability, evBB?, evPot?, support?}],
 *     regime, regimeRequested, solver, street, hand, responseTime,
 *     meta: { flow, cached, board, actingSeat, seats, potBB, toCallBB,
 *             solveSeconds, handDecisions, warnings, ... } }
 *
 * ONE list, because the endpoint answers one question per call. A GTO answer is
 * a distribution to mix at; an exploit answer is an argmax, so `probability` is
 * 1 on one row and 0 on the rest and the EV columns are what actually decided
 * it. `regime` is what ran and `regimeRequested` what was asked for — they
 * differ whenever the exploit regime declined the spot.
 *
 * Action keys are `check`, `fold`, `call(NN.NBB)`, `bet 33%(4.4BB)`,
 * `raise 60%(27.5BB)`, `all-in(37.8BB)` for heads-up AND multiway postflop
 * (multiway sizes as percent of pot too, replaying the street's chip flow
 * server-side since the engine has no live pot field of its own). Preflop
 * still carries the BB-only `raise 8.4BB` style, since ranges there aren't
 * anchored to a pot.
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
      // Exploit rows only. `?? null` rather than `|| null`: an EV of exactly 0
      // is the fold branch, which is the reference every other number is read
      // against and the last one to drop.
      evBB: a.evBB ?? null,
      evPot: a.evPot ?? null,
      support: a.support ?? null,
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
 * `request` is what we asked for, so the panel can say what was requested even
 * when the endpoint answered a different regime.
 */
export function buildAnswer(payload, request = {}) {
  const isExploit = payload.regime === 'exploit'
  const raw = toList(payload.actions)
  // An exploit answer is ranked by EV and the ordering IS the recommendation,
  // so it is left alone. A GTO distribution has no order of its own and reads
  // best grouped fold/check/call/bet/raise.
  const actions = isExploit ? raw : sortForDisplay(raw)
  const meta = payload.meta || {}
  const requested = payload.regimeRequested || payload.regime || 'gto'
  return {
    id: nextId++,
    receivedAt: Date.now(),
    type: 'answer',
    payload,
    request,
    street: payload.street,
    hand: payload.hand,
    solver: payload.solver,
    regime: payload.regime || 'gto',
    regimeRequested: requested,
    // The endpoint declined the question and answered the other one. Not an
    // error — the table still needs an action — but the panel must not let it
    // pass for what was asked.
    fellBack: requested !== (payload.regime || 'gto'),
    responseTime: payload.responseTime,
    actions,
    // An argmax has nothing to sample: the top row IS the move. A distribution
    // does, and the draw is the point of showing one.
    sampled: isExploit ? actions[0] || null : sampleAction(actions),
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
