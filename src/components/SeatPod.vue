<script setup>
import { computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import { CORE_STATS } from '../lib/handBody'
import { statsFor } from '../lib/manualStats'
import { t } from '../lib/i18n'

const props = defineProps({
  seat: { type: Object, required: true },
  isButton: { type: Boolean, default: false },
  toAct: { type: Boolean, default: false },
  /** Which table's typed stats these are — they are kept per table. */
  tableIndex: { type: Number, default: null },
  /** Whether this seat's stats can be typed by hand (villains only). */
  editable: { type: Boolean, default: false },
})
const emit = defineEmits(['edit'])

const fmt = (n, d = 1) =>
  n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString()

const displayName = computed(() =>
  props.seat.isHero ? t('seat.you') : props.seat.name.replace(/\s+/g, ' ').trim(),
)

const action = computed(() => {
  const a = props.seat.lastAction
  if (!a) return null
  const amount = a.amount != null ? `${fmt(a.amount)}BB` : null
  switch (a.kind) {
    case 'fold':
      return { text: t('seat.fold'), tone: 'fold' }
    case 'check':
      return { text: t('seat.check'), tone: 'check' }
    case 'call':
      return { text: amount ? t('seat.callAmount', { amount }) : t('seat.call'), tone: 'call' }
    case 'bet':
      return { text: t('seat.bet', { amount: amount || '' }).trim(), tone: 'bet' }
    case 'raise':
      return { text: t('seat.raise', { amount: amount || '' }).trim(), tone: 'raise' }
    case 'all-in':
      return { text: t('seat.allIn'), tone: 'allin' }
    default:
      return null
  }
})

/** What was typed for this seat — the same lookup that put it in the body. */
const typed = computed(() =>
  props.editable ? statsFor(props.tableIndex, props.seat.name) || {} : {},
)

/**
 * The four the HUD leads with. A typed one is marked: it is already in the
 * snapshot by the time this draws, and "what the client read" and "what I told
 * it" should never look like the same fact.
 */
const stats = computed(() =>
  CORE_STATS.filter((key) => props.seat.stats[key] != null).map((key) => ({
    key,
    short: key === '3BET' ? '3B' : key,
    value: props.seat.stats[key],
    typed: typed.value[key] != null,
  })),
)

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
      <span v-if="isButton" class="btn-chip" :title="t('seat.dealerButton')">D</span>
      <span v-if="seat.allIn" class="tag allin-tag">{{ t('seat.allInTag') }}</span>
      <span v-else-if="seat.folded" class="tag fold-tag">{{ t('seat.foldedTag') }}</span>
    </div>

    <div class="name" :title="seat.name">{{ displayName }}</div>

    <div class="stack">
      <span class="v tnum">{{ fmt(seat.stack) }}</span>
      <span class="u">BB</span>
    </div>

    <div v-if="seat.hand" class="hand">
      <PlayingCard v-for="c in seat.hand" :key="c" :card="c" size="sm" />
    </div>

    <div v-if="stats.length || editable" class="stats">
      <span
        v-for="s in stats"
        :key="s.key"
        class="stat"
        :class="{ typed: s.typed }"
        :title="s.typed ? t('stats.typedTitle', { stat: s.key }) : s.key"
      >
        <b class="tnum">{{ fmt(s.value, 0) }}</b><i>{{ s.short }}</i>
      </span>
      <span v-if="extraStatCount > 0" class="more">+{{ extraStatCount }}</span>
      <button v-if="editable" class="edit" :title="t('stats.edit')" @click="emit('edit')">
        <span v-if="!stats.length">{{ t('stats.add') }}</span>
        <svg v-else viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
          <path
            d="M11.2 1.9 14.1 4.8 5.4 13.5 1.9 14.1 2.5 10.6z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div v-if="action" class="action" :class="action.tone">{{ action.text }}</div>
    <div v-else-if="toAct" class="action waiting">{{ t('seat.toAct') }}</div>

    <div v-if="seat.streetCommit > 0" class="commit" :title="t('seat.inFront')">
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
  background: color-mix(in srgb, var(--allin) 88%, transparent);
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

/* Typed by hand, not read by the client — the same blue the editor marks a
   filled field in. It is in the snapshot either way, which is exactly why the
   two must not look alike. */
.stat.typed {
  background: color-mix(in srgb, var(--blue) 46%, transparent);
}

.stat.typed i {
  color: rgba(255, 255, 255, 0.72);
}

.more {
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  font-weight: 600;
}

/* Dashed, because it is the one thing on the pod that is not a reading. Reads
   "+ stats" on a villain the HUD says nothing about, which is the seat the
   whole feature exists for. */
.edit {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}

.edit:hover {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
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
  background: color-mix(in srgb, var(--allin) 62%, transparent);
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
