<script setup>
import { computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import { CORE_STATS } from '../lib/handBody'

const props = defineProps({
  seat: { type: Object, required: true },
  isButton: { type: Boolean, default: false },
  toAct: { type: Boolean, default: false },
})

const fmt = (n, d = 1) =>
  n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString()

const displayName = computed(() =>
  props.seat.isHero ? 'You' : props.seat.name.replace(/\s+/g, ' ').trim(),
)

const action = computed(() => {
  const a = props.seat.lastAction
  if (!a) return null
  const amount = a.amount != null ? `${fmt(a.amount)}BB` : null
  switch (a.kind) {
    case 'fold':
      return { text: 'Fold', tone: 'fold' }
    case 'check':
      return { text: 'Check', tone: 'check' }
    case 'call':
      return { text: amount ? `Call ${amount}` : 'Call', tone: 'call' }
    case 'bet':
      return { text: `Bet ${amount || ''}`.trim(), tone: 'bet' }
    case 'raise':
      return { text: `Raise ${amount || ''}`.trim(), tone: 'raise' }
    case 'all-in':
      return { text: 'All in', tone: 'allin' }
    default:
      return null
  }
})

const stats = computed(() => {
  const out = []
  for (const key of CORE_STATS) {
    if (props.seat.stats[key] != null) out.push([key, props.seat.stats[key]])
  }
  return out
})

const extraStatCount = computed(
  () => Object.keys(props.seat.stats).length - stats.value.length,
)
</script>

<template>
  <div
    class="pod"
    :class="{
      hero: seat.isHero,
      folded: seat.folded,
      allin: seat.allIn,
      acting: toAct,
    }"
  >
    <div class="badges">
      <span class="pos">{{ seat.position || '?' }}</span>
      <span v-if="isButton" class="btn-chip" title="Dealer button">D</span>
      <span v-if="seat.allIn" class="tag allin-tag">ALL IN</span>
      <span v-else-if="seat.folded" class="tag fold-tag">FOLDED</span>
    </div>

    <div class="name" :title="seat.name">{{ displayName }}</div>

    <div class="stack">
      <span class="v tnum">{{ fmt(seat.stack) }}</span>
      <span class="u">BB</span>
    </div>

    <div v-if="seat.hand" class="hand">
      <PlayingCard v-for="c in seat.hand" :key="c" :card="c" size="sm" />
    </div>

    <div v-if="stats.length" class="stats">
      <span v-for="[key, value] in stats" :key="key" class="stat" :title="key">
        <b class="tnum">{{ fmt(value, 0) }}</b><i>{{ key === '3BET' ? '3B' : key }}</i>
      </span>
      <span v-if="extraStatCount > 0" class="more">+{{ extraStatCount }}</span>
    </div>

    <div v-if="action" class="action" :class="action.tone">{{ action.text }}</div>
    <div v-else-if="toAct" class="action waiting">To act…</div>

    <div v-if="seat.streetCommit > 0" class="commit" :title="'In front this street'">
      <span class="chipstack" aria-hidden="true"><i /><i /><i /></span>
      <span class="tnum">{{ fmt(seat.streetCommit, 2) }}</span>
    </div>
  </div>
</template>

<style scoped>
.pod {
  position: relative;
  width: 158px;
  padding: 9px 11px 10px;
  border-radius: var(--r-md);
  background: rgba(10, 22, 18, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f2f6f4;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: border-color var(--dur) var(--ease), opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.pod.hero {
  border-color: color-mix(in srgb, var(--blue) 70%, transparent);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.34),
    0 0 0 1px color-mix(in srgb, var(--blue) 45%, transparent);
}

.pod.acting {
  border-color: color-mix(in srgb, var(--yellow) 78%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--yellow) 24%, transparent),
    0 8px 26px rgba(0, 0, 0, 0.34);
}

.pod.folded {
  opacity: 0.42;
}

.badges {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}

.pos {
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.16);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.hero .pos {
  background: var(--blue);
  color: #fff;
}

.btn-chip {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: #111;
  font-size: 10px;
  font-weight: 800;
}

.tag {
  padding: 1px 5px;
  border-radius: var(--r-pill);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.allin-tag {
  background: color-mix(in srgb, var(--red) 82%, transparent);
  color: #fff;
}

.fold-tag {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.7);
}

.name {
  font-size: 13px;
  font-weight: 640;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stack {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin-top: 1px;
}

.stack .v {
  font-family: var(--font-rounded);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.stack .u {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
}

.hand {
  display: flex;
  gap: 3px;
  margin-top: 5px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.stat {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 10px;
}

.stat b {
  font-weight: 700;
}

.stat i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.55);
  font-size: 9px;
  font-weight: 600;
}

.more {
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  font-weight: 600;
}

.action {
  margin-top: 7px;
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 650;
  text-align: center;
}

.action.check {
  background: color-mix(in srgb, var(--teal) 34%, transparent);
}

.action.call {
  background: color-mix(in srgb, var(--green) 34%, transparent);
}

.action.bet {
  background: color-mix(in srgb, var(--orange) 40%, transparent);
}

.action.raise {
  background: color-mix(in srgb, var(--pink) 42%, transparent);
}

.action.allin {
  background: color-mix(in srgb, var(--red) 55%, transparent);
}

.action.fold {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.55);
}

.action.waiting {
  background: color-mix(in srgb, var(--yellow) 26%, transparent);
  color: #fff;
}

.commit {
  position: absolute;
  top: -10px;
  right: -8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 5px;
  border-radius: var(--r-pill);
  background: #f7c948;
  color: #241a00;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
}

.chipstack {
  display: inline-flex;
  align-items: flex-end;
  gap: 1px;
  height: 10px;
}

.chipstack i {
  width: 3px;
  border-radius: 1px;
  background: rgba(0, 0, 0, 0.42);
}

.chipstack i:nth-child(1) {
  height: 5px;
}

.chipstack i:nth-child(2) {
  height: 9px;
}

.chipstack i:nth-child(3) {
  height: 7px;
}

@media (max-width: 860px) {
  .pod {
    width: auto;
  }
}
</style>
