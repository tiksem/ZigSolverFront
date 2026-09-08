/**
 * The tournament header, typed by hand.
 *
 * The header is three numbers — players left, players paid, average stack — and
 * they are the difference between an answer in chips and an answer in money.
 * The endpoint prices a hand under ICM only when the body says how many are
 * left AND how many places pay, and it can only weigh the hero against a field
 * when it also says what the average stack is; a snapshot carrying none of that
 * is answered as a cash game, which at a pay jump is the wrong question rather
 * than a slightly worse answer.
 *
 * Plenty of clients never report it. The HUD has it on screen, the extractor
 * does not read it, and the operator can see the lobby — so this is where they
 * say it.
 *
 * Same design as the typed stats ([[manualStats]] is the sibling module): what
 * is typed is WRITTEN INTO THE SNAPSHOT in the host's own prose
 * (`781 players left, 78.9BB average stack, 92 players paid`,
 * handBody.writeTournament) before that snapshot is parsed, so there is one
 * body from there on and nothing downstream has to know a number was typed.
 *
 * Kept PER TABLE and not globally: two tables are two tournaments, at different
 * stages of different fields, and one table's bubble is not the other's.
 */

import { reactive, watch } from 'vue'
import { TOURNAMENT_KEYS, writeTournament } from './handBody'
import { readStored, writeStored } from './persist'

const KEY = 'zigsolver.manualTournament'

export { TOURNAMENT_KEYS }

/**
 * What each field accepts, and how it is rounded.
 *
 * The counts are whole players; the average stack is a BB figure to one
 * decimal, the same precision the host writes it at. `playersPaid` is NOT
 * capped by `playersLeft` — in the money there are fewer players left than
 * places paid, which is exactly the spot this feature exists for.
 */
const FIELDS = {
  playersLeft: { min: 1, max: 1e7, decimals: 0 },
  playersPaid: { min: 1, max: 1e7, decimals: 0 },
  averageStack: { min: 0.1, max: 1e5, decimals: 1 },
}

/** `{ '3': { playersLeft: 781, playersPaid: 92, averageStack: 78.9 } }`. */
export const manualTournament = reactive(load())

function clean(key, value) {
  const field = FIELDS[key]
  if (!field) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const p = 10 ** field.decimals
  const rounded = Math.round(n * p) / p
  if (rounded < field.min || rounded > field.max) return null
  return rounded
}

/** Keep the three keys, in TOURNAMENT_KEYS order, dropping anything unreadable. */
function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const key of TOURNAMENT_KEYS) {
    const v = clean(key, raw[key])
    if (v !== null) out[key] = v
  }
  return Object.keys(out).length ? out : null
}

function load() {
  const raw = readStored(KEY)
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [table, values] of Object.entries(raw)) {
    const entry = cleanEntry(values)
    if (entry) out[String(table)] = entry
  }
  return out
}

watch(manualTournament, (v) => writeStored(KEY, JSON.parse(JSON.stringify(v))), { deep: true })

/** What has been typed for one table, or null. */
export function tournamentFor(index) {
  return manualTournament[String(index)] || null
}

/** How many of the three this table carries by hand. */
export function typedTournamentCount(index) {
  return Object.keys(tournamentFor(index) || {}).length
}

/**
 * Type one field, or clear it with '' / null.
 *
 * Cleared rather than zeroed: an empty field is "leave this one to the host",
 * and the body is rewritten from the host's own text on every snapshot, so
 * clearing genuinely hands the number back rather than freezing the last one.
 */
export function setManualTournament(index, key, value) {
  if (!TOURNAMENT_KEYS.includes(key)) return
  const table = String(index)
  const next = { ...(manualTournament[table] || {}) }

  const v = value === '' || value === null || value === undefined ? null : clean(key, value)
  if (v === null) delete next[key]
  else next[key] = v

  // In TOURNAMENT_KEYS order, so the stored object reads the way the panes do.
  const ordered = Object.fromEntries(
    TOURNAMENT_KEYS.filter((k) => next[k] !== undefined).map((k) => [k, next[k]]),
  )
  if (Object.keys(ordered).length) manualTournament[table] = ordered
  else delete manualTournament[table]
}

/** Forget the whole header for one table — a new tournament at the same seat. */
export function clearManualTournament(index) {
  delete manualTournament[String(index)]
}

/** The snapshot as it should go out: the host's text with the typed header in it. */
export function applyManualTournament(index, body) {
  const values = tournamentFor(index)
  return values ? writeTournament(body, values) : String(body)
}
