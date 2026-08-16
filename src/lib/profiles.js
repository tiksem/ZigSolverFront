/**
 * The opponent reads ZigSolver actually supports, straight from its
 * profiles.json (`api/constants.PROFILE_INTENSITY` is built from the same
 * list, and an unknown name is a 400 from /move).
 *
 * These replace the old ad-hoc button set (fish / aggro_fish / rock / …): every
 * one below is a measured cluster of the GG tournament corpus, carrying its own
 * behavioural model, its serving intensity and the fitted temperature the
 * exploit pass regularizes toward GTO with.
 *
 *   name        the token sent over the socket
 *   title       display name
 *   short       button label
 *   description what the cluster IS (size of the cohort, its rates)
 *   exploit     how it differs from the pool, and what beats it
 *   cluster     the corpus cell it was cut from
 *   stats       the cluster signature (vpip/pfr/3b/… , cbet_f, af, bb100)
 *   temp        KL tilt toward GTO in the best-response pass — lower = the
 *               exploit commits harder
 *   serving     how far the served strategy is allowed to deviate
 *
 * Generated from ZigSolver/profiles.json; regenerate rather than hand-editing.
 */

export const PROFILES = [
  {
    "name": "population",
    "title": "Population Average",
    "description": "The average opponent in the calibration corpus - 68,160 GG tournament players over 298M hands, 26/16 with an 8.1% 3-bet. Fitted, not hand-tuned: profilegen/ measured what this population does postflop and inverted it into the tables below.",
    "exploit": "The baseline read for an unknown opponent, and the reference every stats-derived profile deviates from. Its own leaks are the population's: it under-value-bets, over-checks, calls down a little wide, slow-plays far more than GTO, folds MORE than GTO on the flop and LESS on the river, and raise-bluffs rivers far more.",
    "serving": 0.3,
    "temp": 0.168,
    "cluster": null,
    "stats": {},
    "short": "POP",
    "group": "baseline"
  },
  {
    "name": "reg",
    "title": "Reg",
    "description": "Measured cluster, not hand-tuned: 6932 players / 32.0M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 26/16 with a 8.1% 3-bet, limps 2.2% of first-in spots and cold-calls 10.7%; postflop it c-bets the flop 74.6%, folds to a river bet 53.6% and runs an aggression factor of 2.24 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it sits close to the pool average. It wins 4.0 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.134,
    "cluster": "factor:steady_normal — the centre of the pool on both postflop axes: AF 2.04, folds 56.8%.",
    "stats": {
      "vpip": 25.5,
      "pfr": 16.1,
      "3b": 8.1,
      "4b": 6.7,
      "ftd3b": 44.7,
      "ats": 37.7,
      "limp": 2.2,
      "cc": 10.7,
      "cbet_f": 74.6,
      "ftb_r": 53.6,
      "af": 2.24,
      "wtsd": 43.4,
      "wwsf": 44.9,
      "bb100": 4.0
    },
    "short": "REG",
    "group": "regular"
  },
  {
    "name": "tag",
    "title": "TAG",
    "description": "Measured cluster, not hand-tuned: 4534 players / 29.1M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 27/18 with a 9.3% 3-bet, limps 1.9% of first-in spots and cold-calls 9.7%; postflop it c-bets the flop 80.4%, folds to a river bet 52.7% and runs an aggression factor of 2.81 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it c-bets the flop 6.2 points more, carries 0.61 more aggression factor. It wins 5.7 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.071,
    "cluster": "factor:aggro_normal — aggressive with ordinary defence: AF 2.58, c-bets 73.4%, +5.7 bb/100.",
    "stats": {
      "vpip": 26.7,
      "pfr": 17.8,
      "3b": 9.3,
      "4b": 7.1,
      "ftd3b": 48.3,
      "ats": 43.5,
      "limp": 1.9,
      "cc": 9.7,
      "cbet_f": 80.4,
      "ftb_r": 52.7,
      "af": 2.81,
      "wtsd": 42.6,
      "wwsf": 47.6,
      "bb100": 5.7
    },
    "short": "TAG",
    "group": "regular"
  },
  {
    "name": "lag",
    "title": "LAG",
    "description": "Measured cluster, not hand-tuned: 253 players / 1.8M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 29/22 with a 12.3% 3-bet, limps 1.2% of first-in spots and cold-calls 7.1%; postflop it c-bets the flop 83.4%, folds to a river bet 52.8% and runs an aggression factor of 3.29 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it c-bets the flop 9.2 points more, carries 1.09 more aggression factor, limps 1.2 points less, goes to showdown 1.9 points more. It wins 5.5 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.046,
    "cluster": "box:lag — loose preflop while keeping a TAG's gap (29.4/22.0) and the highest aggression measured, AF 3.06 — 253 players, +5.5 bb/100.",
    "stats": {
      "vpip": 29.4,
      "pfr": 22.0,
      "3b": 12.3,
      "4b": 7.9,
      "ftd3b": 52.9,
      "ats": 51.7,
      "limp": 1.2,
      "cc": 7.1,
      "cbet_f": 83.4,
      "ftb_r": 52.8,
      "af": 3.29,
      "wtsd": 45.4,
      "wwsf": 49.3,
      "bb100": 5.5
    },
    "short": "LAG",
    "group": "regular"
  },
  {
    "name": "aggro_reg",
    "title": "Aggressive Reg",
    "description": "Measured cluster, not hand-tuned: 3359 players / 33.1M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 26/18 with a 9.0% 3-bet, limps 1.6% of first-in spots and cold-calls 8.3%; postflop it c-bets the flop 83.0%, folds to a river bet 59.3% and runs an aggression factor of 3.21 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 6.5 points more than the pool, c-bets the flop 8.8 points more, carries 1.01 more aggression factor, goes to showdown 4.6 points less. It wins 7.6 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.09,
    "cluster": "factor:aggro_foldy — aggressive AND disciplined, the pool's best type: AF 2.95, c-bets 74.9%, folds a river bet 62.3%, +7.6 bb/100.",
    "stats": {
      "vpip": 25.8,
      "pfr": 17.6,
      "3b": 9.0,
      "4b": 6.4,
      "ftd3b": 55.7,
      "ats": 46.0,
      "limp": 1.6,
      "cc": 8.3,
      "cbet_f": 83.0,
      "ftb_r": 59.3,
      "af": 3.21,
      "wtsd": 38.8,
      "wwsf": 46.8,
      "bb100": 7.6
    },
    "short": "AGGRO",
    "group": "regular"
  },
  {
    "name": "tight_reg",
    "title": "Tight Reg",
    "description": "Measured cluster, not hand-tuned: 4134 players / 29.9M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 24/16 with a 7.8% 3-bet, limps 1.8% of first-in spots and cold-calls 9.0%; postflop it c-bets the flop 77.4%, folds to a river bet 59.7% and runs an aggression factor of 2.62 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 6.9 points more than the pool, c-bets the flop 3.3 points more, carries 0.42 more aggression factor, goes to showdown 3.3 points less. It wins 5.5 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.154,
    "cluster": "factor:steady_foldy — ordinary aggression, folds early: AF 2.38, folds a river bet 62.3%.",
    "stats": {
      "vpip": 24.2,
      "pfr": 15.8,
      "3b": 7.8,
      "4b": 6.0,
      "ftd3b": 51.9,
      "ats": 39.4,
      "limp": 1.8,
      "cc": 9.0,
      "cbet_f": 77.4,
      "ftb_r": 59.7,
      "af": 2.62,
      "wtsd": 40.1,
      "wwsf": 44.2,
      "bb100": 5.5
    },
    "short": "TIGHT",
    "group": "regular"
  },
  {
    "name": "passive_reg",
    "title": "Passive Reg",
    "description": "Measured cluster, not hand-tuned: 6740 players / 33.6M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 25/15 with a 6.9% 3-bet, limps 2.8% of first-in spots and cold-calls 12.6%; postflop it c-bets the flop 66.9%, folds to a river bet 54.2% and runs an aggression factor of 1.74 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it c-bets the flop 7.2 points less, carries 0.46 less aggression factor. It wins 1.9 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.138,
    "cluster": "factor:passive_normal — under-aggressive but not sticky: AF 1.56, c-bets 59.4%.",
    "stats": {
      "vpip": 25.1,
      "pfr": 14.5,
      "3b": 6.9,
      "4b": 6.1,
      "ftd3b": 41.7,
      "ats": 33.6,
      "limp": 2.8,
      "cc": 12.6,
      "cbet_f": 66.9,
      "ftb_r": 54.2,
      "af": 1.74,
      "wtsd": 43.1,
      "wwsf": 41.9,
      "bb100": 1.9
    },
    "short": "PASSIVE",
    "group": "regular"
  },
  {
    "name": "weak_tight",
    "title": "Weak-Tight",
    "description": "Measured cluster, not hand-tuned: 4445 players / 31.7M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 23/14 with a 6.6% 3-bet, limps 2.1% of first-in spots and cold-calls 10.2%; postflop it c-bets the flop 68.9%, folds to a river bet 60.4% and runs an aggression factor of 2.06 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 7.6 points more than the pool, c-bets the flop 5.2 points less, carries 0.14 less aggression factor, goes to showdown 2.9 points less. It wins 3.5 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.179,
    "cluster": "factor:passive_foldy — passive AND disciplined: AF 1.85, folds a river bet 62.8%, showdowns 40.5%.",
    "stats": {
      "vpip": 23.1,
      "pfr": 14.0,
      "3b": 6.6,
      "4b": 5.6,
      "ftd3b": 48.6,
      "ats": 33.9,
      "limp": 2.1,
      "cc": 10.2,
      "cbet_f": 68.9,
      "ftb_r": 60.4,
      "af": 2.06,
      "wtsd": 40.5,
      "wwsf": 41.4,
      "bb100": 3.5
    },
    "short": "WEAK-T",
    "group": "regular"
  },
  {
    "name": "sticky_reg",
    "title": "Sticky Reg",
    "description": "Measured cluster, not hand-tuned: 9275 players / 32.8M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 28/17 with a 8.6% 3-bet, limps 2.8% of first-in spots and cold-calls 14.3%; postflop it c-bets the flop 71.0%, folds to a river bet 46.6% and runs an aggression factor of 1.88 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 6.2 points less than the pool, c-bets the flop 3.2 points less, carries 0.32 less aggression factor, goes to showdown 3.6 points more. It wins -2.5 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.073,
    "cluster": "factor:steady_sticky — ordinary aggression, will not let go: folds a river bet 50.3%, showdowns 47.1%.",
    "stats": {
      "vpip": 28.4,
      "pfr": 17.0,
      "3b": 8.6,
      "4b": 7.4,
      "ftd3b": 35.5,
      "ats": 37.3,
      "limp": 2.8,
      "cc": 14.3,
      "cbet_f": 71.0,
      "ftb_r": 46.6,
      "af": 1.88,
      "wtsd": 47.1,
      "wwsf": 45.2,
      "bb100": -2.5
    },
    "short": "STICKY",
    "group": "leaky"
  },
  {
    "name": "spewer",
    "title": "Spewer",
    "description": "Measured cluster, not hand-tuned: 8332 players / 32.5M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 30/19 with a 10.1% 3-bet, limps 2.5% of first-in spots and cold-calls 13.4%; postflop it c-bets the flop 76.9%, folds to a river bet 45.2% and runs an aggression factor of 2.42 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 7.5 points less than the pool, c-bets the flop 2.8 points more, carries 0.22 more aggression factor, goes to showdown 3.7 points more. It wins -3.1 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.034,
    "cluster": "factor:aggro_sticky — aggressive AND unable to fold, which is the losing combination: AF 2.22, folds a river bet 49.0%, -3.1 bb/100.",
    "stats": {
      "vpip": 29.6,
      "pfr": 18.8,
      "3b": 10.1,
      "4b": 8.1,
      "ftd3b": 36.8,
      "ats": 41.2,
      "limp": 2.5,
      "cc": 13.4,
      "cbet_f": 76.9,
      "ftb_r": 45.2,
      "af": 2.42,
      "wtsd": 47.1,
      "wwsf": 48.0,
      "bb100": -3.1
    },
    "short": "SPEWER",
    "group": "leaky"
  },
  {
    "name": "trapper",
    "title": "Trapper",
    "description": "Measured cluster, not hand-tuned: 663 players / 7.2M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 27/18 with a 10.0% 3-bet, limps 1.8% of first-in spots and cold-calls 8.1%; postflop it c-bets the flop 78.0%, folds to a river bet 50.9% and runs an aggression factor of 2.71 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 1.9 points less than the pool, c-bets the flop 3.8 points more, carries 0.51 more aggression factor, goes to showdown 7.5 points more. It wins 4.6 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.072,
    "cluster": "box:trapper — the third factor: check-raises 19.0% and slowplays where the pool leads, showdowns 51.0%.",
    "stats": {
      "vpip": 26.6,
      "pfr": 18.4,
      "3b": 10.0,
      "4b": 7.5,
      "ftd3b": 45.8,
      "ats": 42.0,
      "limp": 1.8,
      "cc": 8.1,
      "cbet_f": 78.0,
      "ftb_r": 50.9,
      "af": 2.71,
      "wtsd": 51.0,
      "wwsf": 48.6,
      "bb100": 4.6
    },
    "short": "TRAP",
    "group": "leaky"
  },
  {
    "name": "station",
    "title": "Calling Station",
    "description": "Measured cluster, not hand-tuned: 7259 players / 29.4M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 28/15 with a 7.2% 3-bet, limps 4.1% of first-in spots and cold-calls 17.4%; postflop it c-bets the flop 63.1%, folds to a river bet 48.1% and runs an aggression factor of 1.44 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 4.7 points less than the pool, c-bets the flop 11.1 points less, carries 0.76 less aggression factor, limps 1.7 points more, goes to showdown 2.4 points more. It wins -4.6 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.6,
    "temp": 0.095,
    "cluster": "factor:passive_sticky — passive and does not fold: AF 1.30, folds a river bet 51.9%, showdowns 45.8% — the pool's donator at -4.6 bb/100.",
    "stats": {
      "vpip": 28.5,
      "pfr": 15.3,
      "3b": 7.2,
      "4b": 6.5,
      "ftd3b": 32.7,
      "ats": 33.4,
      "limp": 4.1,
      "cc": 17.4,
      "cbet_f": 63.1,
      "ftb_r": 48.1,
      "af": 1.44,
      "wtsd": 45.8,
      "wwsf": 42.1,
      "bb100": -4.6
    },
    "short": "STATION",
    "group": "leaky"
  },
  {
    "name": "limper",
    "title": "Limper",
    "description": "Measured cluster, not hand-tuned: 4311 players / 10.0M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 38/12 with a 6.3% 3-bet, limps 20.2% of first-in spots and cold-calls 32.9%; postflop it c-bets the flop 66.8%, folds to a river bet 51.8% and runs an aggression factor of 1.64 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it c-bets the flop 7.4 points less, carries 0.56 less aggression factor, limps 17.8 points more, goes to showdown 2.2 points less. It wins -16.4 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.6,
    "temp": 0.059,
    "cluster": "cluster_pre:limper — 37.7/12.2 limping a fifth of its first-in spots and cold-calling a third — the corpus's actual fish at -16.4 bb/100.",
    "stats": {
      "vpip": 37.7,
      "pfr": 12.2,
      "3b": 6.3,
      "4b": 5.2,
      "ftd3b": 22.8,
      "ats": 23.6,
      "limp": 20.2,
      "cc": 32.9,
      "cbet_f": 66.8,
      "ftb_r": 51.8,
      "af": 1.64,
      "wtsd": 41.2,
      "wwsf": 40.7,
      "bb100": -16.4
    },
    "short": "LIMPER",
    "group": "leaky"
  },
  {
    "name": "maniac",
    "title": "Maniac",
    "description": "Measured cluster, not hand-tuned: 1289 players / 2.6M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 47/28 with a 13.5% 3-bet, limps 4.1% of first-in spots and cold-calls 30.0%; postflop it c-bets the flop 72.4%, folds to a river bet 49.3% and runs an aggression factor of 2.17 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 3.5 points less than the pool, c-bets the flop 1.8 points less, limps 1.7 points more, goes to showdown 2.8 points more. It wins -31.2 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.6,
    "temp": 0.031,
    "cluster": "box:maniac — aggression without selection: 47.2/27.7, a 19.5-point gap, -31.2 bb/100.",
    "stats": {
      "vpip": 47.2,
      "pfr": 27.6,
      "3b": 13.5,
      "4b": 8.3,
      "ftd3b": 26.9,
      "ats": 52.3,
      "limp": 4.1,
      "cc": 30.0,
      "cbet_f": 72.4,
      "ftb_r": 49.3,
      "af": 2.17,
      "wtsd": 46.3,
      "wwsf": 44.6,
      "bb100": -31.2
    },
    "short": "MANIAC",
    "group": "leaky"
  },
  {
    "name": "nit",
    "title": "Nit",
    "description": "Measured cluster, not hand-tuned: 564 players / 3.5M hands of GG tournament play whose preflop stats and postflop rates put them in this cell of the corpus. 16/11 with a 5.7% 3-bet, limps 1.0% of first-in spots and cold-calls 6.4%; postflop it c-bets the flop 66.9%, folds to a river bet 54.8% and runs an aggression factor of 2.26 (population: 74.2 / 52.8 / 2.20).",
    "exploit": "Relative to the population it folds the river 2.0 points more than the pool, c-bets the flop 7.3 points less, limps 1.4 points less, goes to showdown 2.3 points more. It wins -0.2 bb/100 in the corpus against the pool's 2.0. The counter is the exploit re-solve against this model at its fitted temperature, which is what the API profile answer already does.",
    "serving": 0.3,
    "temp": 0.068,
    "cluster": "box:nit — 16.4/10.7 and folds the flop more than three players in four.",
    "stats": {
      "vpip": 16.4,
      "pfr": 10.7,
      "3b": 5.7,
      "4b": 5.3,
      "ftd3b": 45.4,
      "ats": 25.4,
      "limp": 1.0,
      "cc": 6.4,
      "cbet_f": 66.9,
      "ftb_r": 54.8,
      "af": 2.26,
      "wtsd": 45.7,
      "wwsf": 43.5,
      "bb100": -0.2
    },
    "short": "NIT",
    "group": "leaky"
  }
]

export const PROFILE_BY_NAME = Object.fromEntries(PROFILES.map((p) => [p.name, p]))

export const PROFILE_GROUPS = [
  { key: 'baseline', label: 'Baseline' },
  { key: 'regular', label: 'Regulars' },
  { key: 'leaky', label: 'Exploitable types' },
]

/** Human labels for the signature keys, in display order. */
export const SIGNATURE_FIELDS = [
  ['vpip', 'VPIP', '%'],
  ['pfr', 'PFR', '%'],
  ['3b', '3-bet', '%'],
  ['4b', '4-bet', '%'],
  ['ftd3b', 'Fold to 3-bet', '%'],
  ['ats', 'Steal attempt', '%'],
  ['limp', 'Limp', '%'],
  ['cc', 'Cold-call', '%'],
  ['cbet_f', 'Flop c-bet', '%'],
  ['ftb_r', 'Fold to river bet', '%'],
  ['af', 'Aggression factor', ''],
  ['wtsd', 'Went to showdown', '%'],
  ['wwsf', 'Won when saw flop', '%'],
  ['bb100', 'Win rate', ' bb/100'],
]

export function profileTitle(name) {
  if (!name) return null
  if (typeof name === 'object') return 'Custom read'
  return PROFILE_BY_NAME[name]?.title || name
}

/** One line on what this read IS — the cluster's own description, minus its
 *  internal key. For the compact answer panel; the sheet has the full text. */
export function profileBlurb(name) {
  const p = PROFILE_BY_NAME[name]
  if (!p) return null
  if (p.name === 'population') {
    return 'the pool average — under-value-bets, over-checks, calls down a little wide and ' +
      'slow-plays far more than GTO'
  }
  if (!p.cluster) return null
  const parts = p.cluster.split(' — ')
  return parts.length > 1 ? parts.slice(1).join(' — ') : p.cluster
}
