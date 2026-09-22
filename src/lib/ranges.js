/**
 * The ranges a solve ran on: the chart, and the hand's history of them.
 *
 * `meta.ranges` is one entry per seat of the game that was SOLVED, each with a
 * class map — `{ "AA": 1, "AKs": 0.85, ... }` — that the API has already
 * averaged over the combos the board leaves live. So a cell's weight is "how
 * much of this hand the range holds", and the combo count beside it is how many
 * ways there are left to hold it. Both halves are needed: a class the board has
 * taken two of is not half as likely, it is the same hand with fewer combos.
 *
 * It is absent wherever the answer was not computed from enumerated ranges —
 * both preflop engines and the exploit regime, which never builds villain's
 * range at all. That is a fact about the answer rather than a gap in it, so the
 * sheet says which one it is instead of drawing an empty chart.
 *
 * The STREET tabs are built here rather than asked for: every street of a hand
 * is a separate /move call, and each one reports the ranges it was actually
 * answered on. Keeping them as they arrive is what makes "how did the turn card
 * narrow this" a thing you can look at, and it costs no extra solve — the
 * alternative, asking the endpoint for every street on every call, would price
 * a narrowing nobody has asked to see.
 */

import { reactive } from 'vue'

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const SUITS = ['s', 'h', 'd', 'c']

export const STREETS = ['preflop', 'flop', 'turn', 'river']

/** 'AKs' | 'AKo' | 'AA' for the cell at (row, col) of the 13x13 chart. */
export function cellKey(row, col) {
  if (row === col) return `${RANKS[row]}${RANKS[row]}`
  const hi = RANKS[Math.min(row, col)]
  const lo = RANKS[Math.max(row, col)]
  return row < col ? `${hi}${lo}s` : `${hi}${lo}o`
}

/** The 169 cells in chart order — suited above the diagonal, offsuit below. */
export const GRID = (() => {
  const out = []
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const key = cellKey(row, col)
      out.push({
        key,
        row,
        col,
        kind: row === col ? 'pair' : row < col ? 'suited' : 'offsuit',
      })
    }
  }
  return out
})()

/** 'Ks 8d 3d 7c' -> ['Ks', '8d', '3d', '7c']. Tolerates commas and case. */
export function boardCards(board) {
  if (Array.isArray(board)) return board.filter(Boolean).map(String)
  return String(board || '')
    .split(/[\s,]+/)
    .filter(Boolean)
}

/** The suits of `rank` no board card has taken. */
function liveSuits(rank, dead) {
  return SUITS.filter((s) => !dead.has(`${rank}${s}`))
}

/**
 * How many combos of `key` the board leaves — 6 / 4 / 12 on a blank board, and
 * fewer once the cards are out. Zero means the hand cannot be held at all,
 * which is a different thing from a range that does not want it.
 */
export function liveCombos(key, dead) {
  const a = key[0]
  const b = key[1]
  const sa = liveSuits(a, dead)
  if (a === b) return (sa.length * (sa.length - 1)) / 2
  const sb = liveSuits(b, dead)
  const both = sa.filter((s) => sb.includes(s)).length
  // Suited: one combo per suit live in BOTH ranks. Offsuit: every pairing of a
  // live suit with a different live suit.
  return key[2] === 's' ? both : sa.length * sb.length - both
}

/**
 * One player's chart: 169 cells, each with the weight the range holds it at and
 * the combos the board leaves. `dead` is the board as a Set of card strings.
 */
export function chartOf(weights, dead) {
  const w = weights || {}
  return GRID.map((cell) => {
    const combos = liveCombos(cell.key, dead)
    const weight = combos > 0 ? Number(w[cell.key]) || 0 : 0
    return { ...cell, weight, combos, held: weight * combos }
  })
}

/**
 * `meta.ranges` off an answer, or null.
 *
 * Shape-checked rather than trusted: an older API answers without the block at
 * all, and the sheet's empty state is a sentence about the regime, not a crash.
 */
export function readRanges(result) {
  const block = result?.meta?.ranges
  if (!block || !Array.isArray(block.players) || !block.players.length) return null
  return {
    source: block.source || null,
    rootedAt: block.rootedAt || null,
    board: boardCards(block.board ?? result?.meta?.board),
    players: block.players.map((p, i) => ({
      key: p.name || p.label || `#${i}`,
      name: p.name || p.label || `#${i}`,
      label: p.label || p.name || `#${i}`,
      position: p.position || null,
      seat: p.seat || null,
      hero: !!p.hero,
      combos: Number(p.combos) || 0,
      widthPct: Number(p.widthPct) || 0,
      weights: p.weights && typeof p.weights === 'object' ? p.weights : {},
    })),
  }
}

// --- the hand's streets, as they arrive --------------------------------------

/**
 * Per table: the hand being watched, and one record per street of it that has
 * come back carrying ranges.
 *
 * Keyed by handId so a new hand replaces rather than accumulates — and a street
 * re-solved (a re-read, a regime change, a stat typed) overwrites its own
 * record, since the question was re-asked and the old ranges are no longer the
 * ones behind the answer on screen.
 */
const store = reactive({})

const streetIndex = (s) => {
  const at = STREETS.indexOf(String(s))
  return at < 0 ? STREETS.length : at
}

/**
 * One street's record off an answer, or null when it carries no ranges.
 *
 * Shared with the solve history (lib/history.js), which rebuilds a past hand's
 * streets from the answers it kept rather than from this store.
 */
export function rangeRecord(result, at = Date.now()) {
  if (result?.type !== 'answer') return null
  const ranges = readRanges(result)
  if (!ranges) return null
  return {
    street: result.street || ranges.rootedAt || 'flop',
    at,
    solver: result.solver || null,
    ...ranges,
  }
}

/** Records in street order, earliest first. */
export function sortStreets(records) {
  return [...records].sort((a, b) => streetIndex(a.street) - streetIndex(b.street))
}

/** File an answer's ranges under the hand it was asked about. */
export function recordRanges(tableIndex, handId, result) {
  const record = rangeRecord(result)
  if (!record) return
  const key = String(tableIndex)
  const hand = handId || 'unknown'
  const held = store[key]
  if (!held || held.handId !== hand) store[key] = { handId: hand, streets: {} }
  store[key].streets[record.street] = record
}

/** This table's records, earliest street first. Empty when there are none. */
export function rangeStreets(tableIndex) {
  const held = store[String(tableIndex)]
  if (!held) return []
  return sortStreets(Object.values(held.streets))
}

/** Drop what is kept for a table — a new hand, or a table left behind. */
export function clearRanges(tableIndex) {
  delete store[String(tableIndex)]
}

/**
 * Why THIS answer carries no ranges, as a message key — or null when it does.
 *
 * Every case is a real property of the regime that ran rather than a failure,
 * so the sheet names it: nothing on the preflop engines (the chart is bent by
 * the opponents' stats, not solved against their ranges) and nothing on the
 * exploit regime (it walks the hand against behavioural models and never
 * enumerates villain's range).
 */
export function whyNoRanges(result) {
  if (result?.type !== 'answer' || readRanges(result)) return null
  if (result.regime === 'exploit') return 'ranges.noneExploit'
  if (result.street === 'preflop') return 'ranges.nonePreflop'
  return 'ranges.noneOther'
}
