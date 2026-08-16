<script setup>
/**
 * The felt: board, pot and every seat laid out around an oval with the hero at
 * the bottom and the rest going clockwise in acting order — the layout every
 * poker client uses, so the snapshot reads the same way the table did.
 *
 * Below a phone-ish width the ellipse collapses into a plain stacked list
 * (pure CSS, so nothing re-measures on resize).
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import SeatPod from './SeatPod.vue'
import PlayingCard from './PlayingCard.vue'

const props = defineProps({
  hand: { type: Object, required: true },
})

const fmt = (n, d = 1) =>
  n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString()

/** Hero first, then clockwise in acting order. */
const ordered = computed(() => {
  const seats = props.hand.seats
  if (!seats.length) return []
  const heroAt = seats.findIndex((s) => s.isHero)
  if (heroAt < 0) return seats
  return [...seats.slice(heroAt), ...seats.slice(0, heroAt)]
})

/**
 * Seats sit on the full ellipse of `.ring`, which is the felt inset by half a
 * pod on each side — so a pod lands fully inside the felt at every seat count
 * and every felt size.
 *
 * They are spaced by ARC LENGTH, not by angle. Equal angles look right on a
 * circle and bunch up on an ellipse, because the same angular step covers much
 * less perimeter where the curve is sharpest — the left and right extremes.
 * Measured on a 9-max table that put two pods 7px INTO each other on a narrow
 * felt; by arc length the tightest pair clears by 25px, and every count from 2
 * to 10 is positive.
 */
const STEPS = 720

/** The ring's pixel size — the ellipse's real proportions, which is what the
 *  arc length depends on. Defaults to the desktop shape until measured. */
const ringSize = ref({ w: 964, h: 540 })
const ring = ref(null)
let ro = null

onMounted(() => {
  if (!ring.value || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    if (width > 1 && height > 1) ringSize.value = { w: width, h: height }
  })
  ro.observe(ring.value)
})

onBeforeUnmount(() => ro?.disconnect())

/** Angles of `n` points spread evenly along the ellipse's perimeter, from the
 *  bottom (the hero's seat) clockwise. */
const angles = computed(() => {
  const n = ordered.value.length
  const rx = ringSize.value.w / 2
  const ry = ringSize.value.h / 2
  const base = Math.PI / 2
  const at = (k) => {
    const a = base + (k / STEPS) * 2 * Math.PI
    return [rx * Math.cos(a), ry * Math.sin(a)]
  }
  const cum = [0]
  let prev = at(0)
  for (let k = 1; k <= STEPS; k++) {
    const p = at(k)
    cum.push(cum[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]))
    prev = p
  }
  const total = cum[STEPS]
  const out = []
  let k = 0
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total
    while (k < STEPS && cum[k + 1] < target) k++
    const span = cum[k + 1] - cum[k]
    const frac = span > 0 ? (target - cum[k]) / span : 0
    out.push(base + ((k + frac) / STEPS) * 2 * Math.PI)
  }
  return out
})

function podStyle(i) {
  const n = ordered.value.length
  if (n <= 1) return { left: '50%', top: '100%' }
  const a = angles.value[i]
  // Emitted as a percentage of the ring box, which IS rx/ry — so the pods keep
  // their places through a resize even before the observer fires again.
  return {
    left: `${50 + 50 * Math.cos(a)}%`,
    top: `${50 + 50 * Math.sin(a)}%`,
  }
}

/**
 * Pods shrink a little on a crowded ring. Arc-length spacing already keeps 9
 * and 10 handed tables clear of each other, but only by a few pixels on a
 * narrow felt — this buys the gap back without a smaller felt.
 */
const podScale = computed(() => {
  const n = ordered.value.length
  if (n >= 9) return 0.9
  if (n === 8) return 0.94
  return 1
})

const streetLabel = computed(() => {
  const s = props.hand.streetName
  return s ? s[0].toUpperCase() + s.slice(1) : ''
})

const boardSlots = computed(() => {
  const b = props.hand.board || []
  return [...b, ...Array(Math.max(0, 5 - b.length)).fill(null)]
})
</script>

<template>
  <div class="table-wrap">
    <div class="felt" :style="{ '--pod-seats': podScale }">
      <div class="rail" />
      <div class="center">
        <div class="street">{{ streetLabel }}</div>

        <div class="board">
          <template v-for="(card, i) in boardSlots" :key="i + (card || 'x')">
            <PlayingCard v-if="card" :card="card" size="lg" dealt />
            <span v-else class="slot" />
          </template>
        </div>

        <div class="pot">
          <span class="pot-label">Total pot</span>
          <span class="pot-value tnum">{{ fmt(hand.pot, 2) }}<em>BB</em></span>
        </div>

        <div v-if="hand.toCall > 0" class="tocall">
          To call <b class="tnum">{{ fmt(hand.toCall, 2) }}BB</b>
        </div>
      </div>

      <div ref="ring" class="ring">
        <div
          v-for="(seat, i) in ordered"
          :key="seat.name"
          class="pod-slot"
          :style="podStyle(i)"
        >
          <SeatPod
            :seat="seat"
            :is-button="seat.name === hand.buttonName"
            :to-act="seat.toAct || (seat.isHero && hand.heroToAct)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-wrap {
  container-type: inline-size;
}

.felt {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  min-height: 430px;
  padding: 96px 120px;
  border-radius: 50% / 42%;
  background:
    radial-gradient(ellipse at 50% 34%, color-mix(in srgb, var(--felt-1) 88%, #fff 12%), transparent 62%),
    linear-gradient(170deg, var(--felt-1), var(--felt-2));
  box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.4), var(--shadow-2);
}

.rail {
  position: absolute;
  inset: -12px;
  border-radius: 50% / 42%;
  border: 12px solid rgba(28, 20, 14, 0.55);
  box-shadow: inset 0 2px 6px rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.center {
  position: absolute;
  left: 50%;
  top: 47%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.street {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.board {
  display: flex;
  gap: 6px;
}

.slot {
  width: 46px;
  height: 64px;
  border-radius: 8px;
  border: 1.5px dashed rgba(255, 255, 255, 0.16);
}

.pot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 16px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.pot-label {
  color: rgba(255, 255, 255, 0.55);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pot-value {
  color: #fff;
  font-family: var(--font-rounded);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.pot-value em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.6;
  margin-left: 3px;
}

.tocall {
  padding: 3px 10px;
  border-radius: var(--r-pill);
  background: color-mix(in srgb, var(--yellow) 88%, transparent);
  color: #2a2000;
  font-size: 11.5px;
  font-weight: 700;
}

/* Inset by half the tallest/widest pod, so the ring can use its full radius. */
.ring {
  position: absolute;
  inset: 86px 88px;
  pointer-events: none;
}

.pod-slot {
  position: absolute;
  /* Two independent factors: how crowded the ring is (--pod-seats, set from
     the seat count) and how narrow the felt is (--pod-narrow, from the
     container query below). */
  transform: translate(-50%, -50%) scale(calc(var(--pod-seats, 1) * var(--pod-narrow, 1)));
  pointer-events: auto;
}

@container (max-width: 900px) {
  .felt {
    padding: 70px 40px;
    min-height: 400px;
  }

  .ring {
    inset: 76px 74px;
  }

  .felt {
    --pod-narrow: 0.86;
  }
}

@container (max-width: 700px) {
  .felt {
    position: static;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    aspect-ratio: auto;
    min-height: 0;
    padding: 18px 14px 20px;
    border-radius: var(--r-lg);
  }

  .rail {
    display: none;
  }

  .center {
    position: static;
    transform: none;
  }

  .ring {
    position: static;
    inset: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .pod-slot {
    position: static;
    transform: none;
    width: 100%;
    max-width: 380px;
  }
}
</style>
