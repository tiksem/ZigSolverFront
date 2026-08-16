/**
 * Seeded PRNG, so a run can be replayed: `--seed 7` deals the same game twice.
 * mulberry32 — small, fast, good enough for dealing cards nobody wins money on.
 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng = {
    next,
    float: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
  }
  return rng
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Chip amounts are BB with one decimal, the way the client prints them. */
export const round1 = (n) => Math.round(n * 10) / 10
