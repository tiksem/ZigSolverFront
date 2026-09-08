<script setup>
/**
 * The advanced preflop mode's one knob, opened by the chip that selects it.
 *
 * The mix is a weight on ONE coin flip per hand, thrown on the hand's first
 * preflop decision — not a blend of two answers. The whole preflop of that
 * hand is played by whichever engine won the toss, because opening off the
 * blueprint and then facing the 3-bet off the chart is a line neither engine
 * would have played.
 *
 * Deliberately simpler than the regime's AdvancedSheet: that one also gates on
 * how much the HUD carries, because an exploit answer without a read is the
 * population average dressed as one. Neither preflop engine reads the villain
 * that way, so there is nothing here to gate on.
 */
import InfoSheet from './InfoSheet.vue'
import { preflop, setGtoPct, gtoAvailable } from '../lib/preflop'
import { t } from '../lib/i18n'

const emit = defineEmits(['close'])

const PRESETS = [0, 25, 50, 75, 100]
</script>

<template>
  <InfoSheet
    :title="t('preflopMix.title')"
    :subtitle="t('preflopMix.subtitle')"
    @close="emit('close')"
  >
    <section class="grp">
      <div class="row col">
        <div class="lab">
          <strong>{{ t('preflopMix.mix') }}</strong>
          <span class="desc">{{ t('preflopMix.mixDesc') }}</span>
        </div>

        <div class="mix">
          <div class="scale">
            <span class="end alg">
              {{ t('preflop.alg.title') }} <b class="mono">{{ 100 - preflop.gtoPct }}%</b>
            </span>
            <span class="end gto">
              <b class="mono">{{ preflop.gtoPct }}%</b> {{ t('preflop.gto.title') }}
            </span>
          </div>
          <input
            class="slider"
            type="range"
            min="0"
            max="100"
            step="5"
            :aria-label="t('preflopMix.sliderLabel')"
            :value="preflop.gtoPct"
            @input="setGtoPct($event.target.value)"
          />
          <div class="presets">
            <button
              v-for="p in PRESETS"
              :key="p"
              class="preset"
              :class="{ on: preflop.gtoPct === p }"
              @click="setGtoPct(p)"
            >
              {{ p }}%
            </button>
          </div>
        </div>
      </div>

      <p v-if="!gtoAvailable" class="warn">{{ t('preflopBar.noService') }}</p>
    </section>
  </InfoSheet>
</template>

<style scoped>
.grp {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.row.col {
  flex-direction: column;
}
.lab {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lab .desc {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.mix {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scale {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
}
.scale b {
  color: var(--fg);
}
.slider {
  width: 100%;
}
.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.preset {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.preset.on {
  border-color: var(--accent);
  color: var(--fg);
}
.warn {
  color: var(--warn, #d08770);
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
}
</style>
