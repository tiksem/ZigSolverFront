/**
 * The people at the table: a name, a persona, and the HUD stats the body
 * carries for them. Stats are generated *from* the persona, so a station's
 * numbers and a station's play agree with each other — which is the point of
 * the whole mock: the read the front end shows should match what you watch.
 */

import { round1 } from './rng.js'

const NAMES = [
  'K Barsukov', 'Dmitri O', 'Nikolai V', 'Sasha M', 'Big Stack Bob', 'Anna K',
  'Ivan P', 'Marta L', 'Duy N', '老虎', 'Grzegorz W', 'Ana Sofia', 'Kenji T',
  'Lars H', 'Priya R', 'Tomás F', 'Fede B', 'Yuki S', 'Owen McB', 'Zara A',
  'Rui C', 'Halvard', 'Mika J', 'Оля', 'Ceyda D', 'Pieter vD', 'Sam Q',
]

/**
 * open   how often it opens an unraised pot
 * cont   how often it keeps betting once it has the lead
 * agg    how often it raises rather than calls
 * call   how sticky it is against a bet
 */
export const PERSONAS = {
  nit: { key: 'nit', open: 0.15, cont: 0.34, agg: 0.16, call: 0.5 },
  tag: { key: 'tag', open: 0.27, cont: 0.58, agg: 0.34, call: 0.78 },
  lag: { key: 'lag', open: 0.44, cont: 0.62, agg: 0.5, call: 0.92 },
  reg: { key: 'reg', open: 0.25, cont: 0.52, agg: 0.3, call: 0.8 },
  station: { key: 'station', open: 0.18, cont: 0.3, agg: 0.1, call: 1.35 },
  limper: { key: 'limper', open: 0.1, cont: 0.28, agg: 0.12, call: 1.15 },
  maniac: { key: 'maniac', open: 0.56, cont: 0.72, agg: 0.66, call: 1.0 },
  trapper: { key: 'trapper', open: 0.22, cont: 0.3, agg: 0.22, call: 1.05 },
}

const PERSONA_KEYS = Object.keys(PERSONAS)

/** The hero plays a wide-ish TAG, so decisions actually reach the front end. */
export const HERO_PERSONA = { key: 'hero', open: 0.33, cont: 0.6, agg: 0.36, call: 0.95 }

export const HERO_NAME = '*me*'

function statsFor(persona, rng) {
  const jitter = (n, spread) => Math.max(1, Math.round(n + rng.float(-spread, spread)))
  const vpip = jitter(
    { nit: 16, tag: 25, lag: 36, reg: 24, station: 46, limper: 42, maniac: 58, trapper: 27 }[
      persona.key
    ],
    4,
  )
  const pfr = Math.max(2, Math.round(vpip * rng.float(0.35, 0.85) * (persona.open + 0.5)))
  const stats = { VPIP: vpip, PFR: Math.min(pfr, vpip) }
  // Not every villain has every stat sampled — the real HUD is patchy too.
  if (rng.chance(0.75)) stats['3BET'] = jitter(pfr * 0.35, 3)
  if (rng.chance(0.55)) stats.ATS = jitter(vpip * 1.5, 6)
  if (rng.chance(0.5)) stats.AF = round1(0.4 + persona.agg * 4 + rng.float(-0.3, 0.4))
  if (rng.chance(0.4)) stats.WTSD = jitter(20 + persona.call * 18, 5)
  if (rng.chance(0.3)) stats.WWSF = jitter(38 + persona.cont * 12, 5)
  return stats
}

/** A seat that persists across hands: the stack carries over, the stats do not move. */
export function makeVillain(rng) {
  const persona = PERSONAS[rng.pick(PERSONA_KEYS)]
  return {
    name: null, // assigned by the table, which keeps names unique
    isHero: false,
    persona,
    stats: statsFor(persona, rng),
    stack: round1(rng.float(22, 160)),
  }
}

export function makeHero(rng) {
  return {
    name: HERO_NAME,
    isHero: true,
    persona: HERO_PERSONA,
    stats: {},
    stack: round1(rng.float(45, 110)),
  }
}

/** A name not already sitting at this table. */
export function pickName(taken, rng) {
  const free = NAMES.filter((n) => !taken.has(n))
  if (free.length) return rng.pick(free)
  return `${rng.pick(NAMES)} ${rng.int(2, 99)}`
}

export function statLines(stats) {
  return Object.entries(stats).map(([key, value]) =>
    key === 'AF' ? `AF=${value}` : `${key}=${value}%`,
  )
}
