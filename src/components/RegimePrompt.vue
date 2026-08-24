<script setup>
/**
 * Manual mode's question: GTO or Exploit, for THIS HAND.
 *
 * It sits where the answer will appear rather than over the table, because the
 * table is what you are reading while you decide. Nothing has been sent yet —
 * the solve starts on the click, so the choice costs no wall clock.
 *
 * Raised once per hand, on the flop: the turn and the river go out under that
 * answer rather than asking again, and preflop is never asked about because the
 * preflop algorithm plays it either way. And only where the choice is real — a
 * hand the exploit regime cannot answer goes straight to GTO without asking
 * (see lib/regime.exploitAvailability).
 */
import { computed } from 'vue'
import { t, tv } from '../lib/i18n'

const props = defineProps({
  /** The hero's hand and the street, so the question names the spot it is about. */
  hand: { type: String, default: null },
  street: { type: String, default: null },
})
const emit = defineEmits(['pick'])

const CHOICES = ['gto', 'exploit']

const streetLabel = computed(() =>
  props.street
    ? tv(`street.${props.street}`, props.street.replace(/^./, (c) => c.toUpperCase()))
    : t('street.decision'),
)
</script>

<template>
  <div class="prompt card">
    <div class="head">
      <span class="eyebrow">{{ t('prompt.eyebrow') }}</span>
      <span class="what">
        {{ streetLabel }}
        <template v-if="hand"> · {{ hand }}</template>
      </span>
    </div>
    <p class="ask">{{ t('prompt.ask') }}</p>
    <p class="sub">{{ t('prompt.sub') }}</p>
    <div class="choices">
      <button
        v-for="c in CHOICES"
        :key="c"
        class="choice"
        :class="c"
        @click="emit('pick', c)"
      >
        <span class="ctitle">{{ t(`regime.${c}.title`) }}</span>
        <span class="cdesc">{{ t(`regime.${c}.tagline`) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt {
  padding: 14px 16px 16px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 45%, transparent);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.what {
  font-size: 13px;
  font-weight: 620;
  color: var(--label-2);
}

.ask {
  margin: 8px 0 2px;
  font-size: 15px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.sub {
  margin: 0 0 12px;
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.choices {
  display: flex;
  gap: 10px;
}

.choice {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 11px 13px;
  border: none;
  border-radius: var(--r-md);
  background: var(--fill);
  color: var(--label);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.choice:hover {
  background: var(--fill-strong);
}

.choice:active {
  transform: scale(0.985);
}

.ctitle {
  font-size: 14px;
  font-weight: 700;
}

.choice.gto .ctitle {
  color: var(--teal);
}

.choice.exploit .ctitle {
  color: var(--orange);
}

.cdesc {
  color: var(--label-2);
  font-size: 12px;
  line-height: 1.4;
}

@media (max-width: 620px) {
  .choices {
    flex-direction: column;
  }
}
</style>
