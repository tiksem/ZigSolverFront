/**
 * The ZigSolver API client.
 *
 * Every snapshot the bot host pushes is POSTed here as the /move `body`, under
 * one `regime`: `gto` (the equilibrium strategy at the node) or `exploit` (the
 * maximum-EV action against the villain's measured behaviour). Never both — the
 * endpoint answers one question per call.
 *
 * The one thing worth knowing: `handId`. It keys the per-hand tree cache, so a
 * later street reuses the tree the earlier one built. It must be stable WITHIN
 * a hand and distinct ACROSS hands — a handId whose tree was solved for a
 * different hero hand keeps that tree. It does nothing for an exploit answer:
 * that regime walks the hand rather than a subgame and is recomputed every
 * call, by design.
 */

import { buildAnswer, buildError } from './moveResult'

/** Reads the endpoint's own explanation out of a non-200 body. */
function detailOf(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  const d = payload.detail ?? payload.error ?? payload.message
  if (typeof d === 'string') return d
  // FastAPI validation errors: [{loc, msg, type}, ...]
  if (Array.isArray(d)) {
    return d.map((e) => `${(e.loc || []).join('.')}: ${e.msg}`).join('; ') || fallback
  }
  return d ? JSON.stringify(d) : fallback
}

/**
 * POST /move.
 *
 * @param {string} url        absolute URL of the endpoint
 * @param {object} req        { body, handId, regime, maxSolveTime, statHands,
 *                              gateExploitability, targetExploitability,
 *                              minSolveTime }
 * @param {AbortSignal} signal
 */
export async function solveMove(url, req, signal) {
  const payload = { body: req.body, regime: req.regime || 'gto' }
  if (req.handId) payload.handId = req.handId
  if (req.requestId) payload.requestId = req.requestId
  if (req.maxSolveTime) payload.maxSolveTime = req.maxSolveTime
  if (req.statHands) payload.statHands = req.statHands
  // Flop tuning: omitted means "the API's own default", so these are sent on a
  // null check rather than a truthy one — gateExploitability 0 is a real
  // setting (never solve exactly), not an absent one.
  for (const k of ['gateExploitability', 'targetExploitability', 'minSolveTime']) {
    if (req[k] !== null && req[k] !== undefined && req[k] !== '') payload[k] = req[k]
  }

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    // fetch() rejects identically for "host is down" and "the browser blocked
    // the response because it carried no CORS header", so say both.
    return buildError(`Could not reach the ZigSolver API at ${url}`, {
      hint:
        'Either the API is not running there, or it is running but does not send ' +
        'CORS headers — a browser refuses a cross-origin response without them. ' +
        'See the README: add CORSMiddleware to api/server.py, or serve this app ' +
        'from the same origin as the API.',
      request: req,
    })
  }

  let parsed = null
  const text = await res.text()
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  // 499: the endpoint dropped this solve because it was cancelled. Normally we
  // never see it (our own fetch was aborted first), but a lost race or a cancel
  // from another client can deliver it — and it is not an error to show, it is
  // an answer we asked not to receive.
  if (res.status === 499) return { type: 'cancelled', request: req }

  if (!res.ok) {
    return buildError(detailOf(parsed, text || `${res.status} ${res.statusText}`), {
      payload: parsed ?? text,
      hint:
        res.status === 400
          ? 'The endpoint refused the snapshot — /move is strict about the ' +
            'sequence and only answers when the body ends on the hero’s decision.'
          : null,
      request: req,
    })
  }

  if (!parsed || !Array.isArray(parsed.actions)) {
    return buildError('The API returned a body that is not a /move answer', {
      payload: parsed ?? text,
      request: req,
    })
  }
  return buildAnswer(parsed, req)
}

/**
 * POST /cancel — kill an in-flight solve server-side.
 *
 * Aborting the fetch only closes OUR end of the connection; the endpoint would
 * keep solving to completion and keep holding the solve semaphore, so the
 * question we actually want would queue behind an answer nobody will read.
 * This is what stops the work: it SIGKILLs the subprocess stage and frees the
 * lock before the replacement request arrives.
 *
 * Fire-and-forget by design — a cancel that fails changes nothing we can act
 * on, and `keepalive` lets it survive the page navigation that triggered it.
 */
export function cancelSolve(url, requestId) {
  if (!url || !requestId) return
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* nothing useful to do about a failed cancel */
  }
}

/** GET /health — used on the connect screen to prove the API is reachable. */
export async function health(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * Tracks which poker hand a snapshot belongs to and mints its handId.
 *
 * A hand is "the same one" while the hero holds the same two cards, the board
 * only grows, and the pot only grows. Any of those going backwards means a new
 * hand — which is what makes this independent of whether the host bothered to
 * announce one.
 */
export function createHandIds(tableIndex) {
  let seq = 0
  let prev = null

  return function handIdFor(snapshot) {
    const hero = snapshot.heroHand ? snapshot.heroHand.join('') : ''
    const board = snapshot.board.join('')
    const pot = snapshot.pot ?? 0
    const same =
      prev !== null &&
      prev.hero === hero &&
      board.startsWith(prev.board) &&
      pot >= prev.pot - 1e-9
    if (!same) seq += 1
    prev = { hero, board, pot }
    return `t${tableIndex}#${seq}${hero ? `-${hero}` : ''}`
  }
}
