<script setup>
/**
 * Four fields, one villain.
 *
 * Typing here does not annotate anything on our side — it writes the stat into
 * the snapshot in the host's own format before that snapshot is parsed or sent
 * (lib/manualStats), so what the solver reads is a HUD line it cannot tell from
 * one the client wrote. That is what the preview at the bottom shows.
 *
 * A field left empty is not a zero: it is the HUD's own value where there is
 * one — which the placeholder says — and the population average where there is
 * not. Only the fields that carry something are written.
 */
import { computed } from 'vue'
import InfoSheet from './InfoSheet.vue'
import { statLine } from '../lib/handBody'
import {
  MANUAL_STAT_KEYS,
  statsFor,
  setManualStat,
  clearManualStats,
} from '../lib/manualStats'
import { t } from '../lib/i18n'

const props = defineProps({
  tableIndex: { type: Number, required: true },
  /** The name the body carries — the key these are stored under. */
  name: { type: String, required: true },
  position: { type: String, default: null },
  /**
   * What the HOST's own snapshot said about this seat, before anything typed
   * was written into it. The placeholders, so an empty field reads as the value
   * it is leaving alone rather than as nothing.
   */
  hud: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['close'])

const typed = computed(() => statsFor(props.tableIndex, props.name) || {})

const rows = computed(() =>
  MANUAL_STAT_KEYS.map((key) => ({
    key,
    label: key,
    desc: t(`stat.${key}`),
    value: typed.value[key] ?? '',
    hud: props.hud?.[key] ?? null,
  })),
)

/** The lines this adds to every snapshot — the body's own syntax, verbatim. */
const written = computed(() =>
  MANUAL_STAT_KEYS.filter((k) => typed.value[k] != null).map((k) => statLine(k, typed.value[k])),
)

function onInput(key, value) {
  setManualStat(props.tableIndex, props.name, key, value)
}
</script>

<template>
  <InfoSheet
    :title="t('stats.title', { name })"
    :subtitle="t('stats.subtitle', { position: position || '?', index: tableIndex })"
    @close="emit('close')"
  >
    <p class="lede">{{ t('stats.lede') }}</p>

    <div v-for="row in rows" :key="row.key" class="row">
      <div class="lab">
        <strong>{{ row.label }}</strong>
        <span class="desc">{{ row.desc }}</span>
      </div>
      <label class="ctl" :class="{ on: row.value !== '' }">
        <input
          class="field num"
          type="number"
          min="0"
          max="100"
          step="1"
          inputmode="decimal"
          :placeholder="row.hud != null ? String(row.hud) : t('stats.imputed')"
          :value="row.value"
          :aria-label="row.label"
          @input="onInput(row.key, $event.target.value)"
        />
        <span class="pct">%</span>
      </label>
    </div>

    <div class="foot">
      <p v-if="written.length" class="wrote">
        <span class="eyebrow">{{ t('stats.writes') }}</span>
        <code>{{ written.join('  ') }}</code>
      </p>
      <p v-else class="wrote muted">{{ t('stats.noneTyped') }}</p>
      <button
        class="btn btn-sm"
        :disabled="!written.length"
        @click="clearManualStats(tableIndex, name)"
      >
        {{ t('stats.clear') }}
      </button>
    </div>
  </InfoSheet>
</template>

<style scoped>
.lede {
  margin: 0 0 4px;
  color: var(--label-2);
  font-size: 13px;
  line-height: 1.5;
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--separator);
}

.lab {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lab strong {
  font-family: var(--font-mono);
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.desc {
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.4;
}

/* The % sits inside the field's border, so the number and its unit read as one
   value rather than as a field with a label parked next to it. */
.ctl {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-right: 12px;
  border: 1px solid var(--separator);
  border-radius: var(--r-md);
  background: var(--bg-elevated);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.ctl:focus-within {
  border-color: var(--blue);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 18%, transparent);
}

/* Typed, as opposed to left to the HUD. The same blue the felt marks it in. */
.ctl.on {
  border-color: color-mix(in srgb, var(--blue) 55%, transparent);
}

.num {
  width: 100px;
  min-height: 40px;
  padding: 0 2px 0 10px;
  border: none;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 15px;
  text-align: right;
}

/* The placeholder is a word ("imputed") as often as it is a number, so it drops
   the mono figures the value keeps and fits either way. */
.num::placeholder {
  font-family: var(--font-ui);
  font-size: 12.5px;
}

.num:focus {
  outline: none;
  box-shadow: none;
}

.pct {
  color: var(--label-2);
  font-size: 13px;
  font-weight: 620;
}

.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 14px;
  margin-top: 6px;
  border-top: 1px solid var(--separator);
}

.wrote {
  flex: 1;
  min-width: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wrote code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--label);
  word-break: break-word;
}

.wrote.muted {
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}
</style>
