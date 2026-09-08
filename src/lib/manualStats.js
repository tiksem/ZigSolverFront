/**
 * The four HUD stats, typed by hand.
 *
 * The host writes whatever its HUD carries, and it often carries nothing: a
 * table that just opened, a client that anonymises its seats, a villain the
 * tracker has never seen. Every stat the body does not say is imputed from the
 * population on the solver side — so the exploit models describe the average
 * player rather than this one, and the preflop chart's widths are bent by
 * numbers nobody measured here. When you know better than the HUD, this is
 * where you say so.
 *
 * A typed value is WRITTEN INTO THE SNAPSHOT in the host's own format
 * (`VPIP=25%`, handBody.writeStats) before it is parsed. That is the whole
 * design: from there on there is ONE body, so the felt, the exploit gate, the
 * /move request and the screenError capture all read the same text and nothing
 * downstream has to know a number was typed rather than read.
 *
 * Two things it is deliberately NOT:
 *
 *   * not the hero's. The endpoint reads these to model the OPPONENTS; a line
 *     under `*me*` would be typed into a body nothing looks at.
 *   * not global. Kept per table, keyed by the name the body carries, because
 *     an anonymising client reuses the same handful of names at every table and
 *     a shared map would put one table's read on another table's stranger.
 */

import { reactive, watch } from 'vue'
import { CORE_STATS, writeStats } from './handBody'
import { readStored, writeStored } from './persist'

const KEY = 'zigsolver.manualStats'

/** What can be typed: the four the HUD leads with, in the pods' own order. */
export const MANUAL_STAT_KEYS = CORE_STATS

/** All four are percentages — the ratio stats (AF) are not among them. */
const RANGE = [0, 100]

/**
 * Names kept per table, oldest first out.
 *
 * A seat that is edited again is re-inserted at the end, so the cap only ever
 * drops reads that have been sitting untouched for dozens of villains. It is a
 * bound on a map nothing else prunes, not a policy.
 */
const MAX_NAMES = 64

/** `{ '3': { 'Big Stack Bob': { VPIP: 38, PFR: 12 } } }` — table index, name. */
export const manualStats = reactive(load())

function clean(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(RANGE[1], Math.max(RANGE[0], Math.round(n * 10) / 10))
}

/** Keep the four keys, in CORE_STATS order, dropping anything unreadable. */
function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const key of MANUAL_STAT_KEYS) {
    const v = clean(raw[key])
    if (v !== null) out[key] = v
  }
  return Object.keys(out).length ? out : null
}

function load() {
  const raw = readStored(KEY)
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [table, byName] of Object.entries(raw)) {
    if (!byName || typeof byName !== 'object') continue
    const seats = {}
    for (const [name, stats] of Object.entries(byName).slice(-MAX_NAMES)) {
      const entry = cleanEntry(stats)
      if (entry) seats[name] = entry
    }
    if (Object.keys(seats).length) out[String(table)] = seats
  }
  return out
}

watch(manualStats, (v) => writeStored(KEY, JSON.parse(JSON.stringify(v))), { deep: true })

/** Every typed stat at one table — the map handBody.writeStats takes, or null. */
export function tableStats(index) {
  return manualStats[String(index)] || null
}

/** What has been typed for one seat, or null. */
export function statsFor(index, name) {
  const seats = tableStats(index)
  return (seats && seats[name]) || null
}

/** How many seats at this table carry typed stats. */
export function typedSeatCount(index) {
  return Object.keys(tableStats(index) || {}).length
}

/**
 * Type one stat, or clear it with '' / null.
 *
 * A seat left with nothing typed is removed rather than kept as an empty
 * object, so "has the operator said anything about this villain" stays a
 * question about whether the key is there.
 */
export function setManualStat(index, name, key, value) {
  if (!MANUAL_STAT_KEYS.includes(key)) return
  const table = String(index)
  const seats = manualStats[table] || {}
  const next = { ...(seats[name] || {}) }

  const v = value === '' || value === null || value === undefined ? null : clean(value)
  if (v === null) delete next[key]
  else next[key] = v

  // Re-inserted rather than mutated in place: it is what keeps the cap below
  // dropping the reads nobody has touched instead of the one being typed.
  delete seats[name]
  if (Object.keys(next).length) {
    // In CORE_STATS order, so the body reads the way the HUD writes it.
    seats[name] = Object.fromEntries(
      MANUAL_STAT_KEYS.filter((k) => next[k] !== undefined).map((k) => [k, next[k]]),
    )
  }

  const names = Object.keys(seats)
  for (const stale of names.slice(0, Math.max(0, names.length - MAX_NAMES))) {
    delete seats[stale]
  }

  if (Object.keys(seats).length) manualStats[table] = seats
  else delete manualStats[table]
}

/** Forget everything typed for one seat — the villain who left, or a mistake. */
export function clearManualStats(index, name) {
  const seats = manualStats[String(index)]
  if (!seats || !seats[name]) return
  delete seats[name]
  if (!Object.keys(seats).length) delete manualStats[String(index)]
}

/** The snapshot as it should go out: the host's text with the typed stats in it. */
export function applyManualStats(index, body) {
  const seats = tableStats(index)
  return seats ? writeStats(body, seats) : String(body)
}
