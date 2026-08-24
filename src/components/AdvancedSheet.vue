<script setup>
/**
 * The advanced regime's two knobs, opened by the chip that selects it.
 *
 * The mix is a weight on ONE coin flip per hand, thrown on the flop, not a
 * blend of two answers: the rest of the hand is wholly GTO or wholly Exploit,
 * and the percentage is how often the second one wins the toss.
 *
 * The stats gate is the other knob, and it is about what an exploit answer is
 * worth: the models impute every stat the HUD does not carry, so under a few
 * of them the "read" is the population average and GTO is the better answer at
 * the same price.
 */
import { computed } from 'vue'
import InfoSheet from './InfoSheet.vue'
import {
  regime,
  setExploitPct,
  setRequireStats,
  MIN_STATS_FOR_EXPLOIT,
} from '../lib/regime'
import { t, tp, tk } from '../lib/i18n'

const props = defineProps({
  /** lib/regime.exploitAvailability for this hand: { status, ok, why }. */
  exploit: { type: Object, default: () => ({ status: 'pending', ok: false, why: null }) },
  /** The HUD stats read on this hand's villain, so the gate says what it is gating. */
  statNames: { type: Array, default: () => [] },
})
const emit = defineEmits(['close'])

const PRESETS = [0, 25, 50, 75, 100]

const gtoPct = computed(() => 100 - regime.exploitPct)

/** What the gate does to the hand on screen, in one line. */
const gateNote = computed(() => {
  // Preflop and the empty screen have no villain to count stats on yet, and
  // that is not the gate refusing anything — it is the gate not being due.
  if (props.exploit.status === 'pending') return t('advanced.gatePending')
  if (props.exploit.status === 'no') {
    return t('advanced.gateNoVillain', { why: tk(props.exploit.why) })
  }
  const n = props.statNames.length
  if (n === 0) return t('advanced.gateNone')
  const list = props.statNames.join(', ')
  return n < MIN_STATS_FOR_EXPLOIT
    ? tp('advanced.gateThin', n, { list })
    : tp('advanced.gateOk', n, { list })
})

/** Warn only where the gate is actually costing this hand its draw. */
const gateWarn = computed(
  () =>
    regime.requireStats &&
    (props.exploit.status === 'no' ||
      (props.exploit.ok && props.statNames.length < MIN_STATS_FOR_EXPLOIT)),
)
</script>

<template>
  <InfoSheet
    :title="t('advanced.title')"
    :subtitle="t('advanced.subtitle')"
    @close="emit('close')"
  >
    <section class="grp">
      <div class="row col">
        <div class="lab">
          <strong>{{ t('advanced.mix') }}</strong>
          <span class="desc">{{ t('advanced.mixDesc') }}</span>
        </div>

        <div class="mix">
          <div class="scale">
            <span class="end gto">
              {{ t('regime.gto.title') }} <b class="mono">{{ gtoPct }}%</b>
            </span>
            <span class="end exp">
              <b class="mono">{{ regime.exploitPct }}%</b> {{ t('regime.exploit.title') }}
            </span>
          </div>
          <input
            class="slider"
            type="range"
            min="0"
            max="100"
            step="5"
            :aria-label="t('advanced.sliderLabel')"
            :value="regime.exploitPct"
            @input="setExploitPct($event.target.value)"
          />
          <div class="presets">
            <button
              v-for="p in PRESETS"
              :key="p"
              class="preset"
              :class="{ on: regime.exploitPct === p }"
              @click="setExploitPct(p)"
            >
              {{ p }}%
            </button>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="lab">
          <strong>{{ t('advanced.gate', { n: MIN_STATS_FOR_EXPLOIT }) }}</strong>
          <span class="desc">{{ t('advanced.gateDesc', { n: MIN_STATS_FOR_EXPLOIT }) }}</span>
        </div>
        <input
          class="switch"
          type="checkbox"
          :checked="regime.requireStats"
          @change="setRequireStats($event.target.checked)"
        />
      </div>

      <p class="gate" :class="{ warn: gateWarn }">{{ gateNote }}</p>
    </section>

    <p class="foot">{{ t('advanced.foot') }}</p>
  </InfoSheet>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--separator);
}

.row.col {
  flex-direction: column;
  gap: 12px;
}

.row:first-child {
  border-top: none;
  padding-top: 4px;
}

.lab {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lab strong {
  font-size: 14.5px;
  font-weight: 620;
}

/* A notch larger than the settings sheet's own rows: these two paragraphs are
   the whole explanation of what the mode does, and they are read once rather
   than skimmed past a familiar label. */
.desc {
  color: var(--label-2);
  font-size: 13.5px;
  line-height: 1.55;
}

.mix {
  width: 100%;
}

.scale {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 620;
  color: var(--label-2);
}

.end b {
  font-size: 15px;
  font-weight: 700;
}

.end.gto b {
  color: var(--teal);
}

.end.exp b {
  color: var(--orange);
}

/* A spectrum, not a fill meter: the track runs GTO-coloured to Exploit-coloured
   end to end and the handle's position between them IS the mix. Painting it as
   a fill would be a lie in one direction or the other — the bar to the left of
   the handle is the Exploit share while the colour under it is GTO's. */
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 26px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: var(--r-pill);
  background: linear-gradient(to right, var(--teal), var(--orange));
}

.slider::-moz-range-track {
  height: 6px;
  border-radius: var(--r-pill);
  background: linear-gradient(to right, var(--teal), var(--orange));
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  margin-top: -8px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

.slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.preset {
  min-height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label);
  font-size: 13px;
  font-weight: 620;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.preset:hover {
  background: var(--fill-strong);
}

.preset.on {
  background: var(--blue);
  color: #fff;
}

.switch {
  appearance: none;
  width: 50px;
  height: 30px;
  flex: none;
  margin-top: 2px;
  border-radius: var(--r-pill);
  background: var(--fill-strong);
  position: relative;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform var(--dur) var(--ease);
}

.switch:checked {
  background: var(--green);
}

.switch:checked::after {
  transform: translateX(20px);
}

.gate {
  margin: 0;
  padding: 11px 12px;
  border-radius: var(--r-md);
  background: var(--fill);
  color: var(--label-2);
  font-size: 13px;
  line-height: 1.55;
}

.gate.warn {
  background: color-mix(in srgb, var(--orange) 16%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

/* A footnote, but one that changes what the two knobs above actually do — the
   faintest label colour was hiding that, so it reads as body text set apart by
   a rule rather than by being greyed down. */
.foot {
  margin: 16px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--separator);
  color: var(--label-2);
  font-size: 13px;
  line-height: 1.55;
}

.mono {
  font-family: var(--font-mono);
}
</style>
