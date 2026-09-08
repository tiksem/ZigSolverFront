<script setup>
/**
 * Three fields, one tournament.
 *
 * Typing here does not annotate anything on our side — it writes the header
 * into the snapshot in the host's own prose before that snapshot is parsed or
 * sent (lib/manualTournament), so what the solver reads is a header line it
 * cannot tell from one the client wrote. The footer shows the sentence itself.
 *
 * The status line above it is the part worth reading: the endpoint prices under
 * ICM only when the body says both how many are left and how many places pay,
 * and only weighs the hero against a field when it also carries an average
 * stack. Anything short of that comes back in chips, so the sheet says which of
 * the two answers the header currently buys.
 */
import { computed } from 'vue'
import InfoSheet from './InfoSheet.vue'
import { TOURNAMENT_KEYS, TOURNAMENT_WRITE_ORDER, tournamentPhrase } from '../lib/handBody'
import {
  tournamentFor,
  setManualTournament,
  clearManualTournament,
} from '../lib/manualTournament'
import { t } from '../lib/i18n'

const props = defineProps({
  tableIndex: { type: Number, required: true },
  /**
   * What the HOST's own snapshot said, before anything typed was written into
   * it. The placeholders — so an empty field reads as the value it is leaving
   * alone rather than as nothing.
   */
  host: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const typed = computed(() => tournamentFor(props.tableIndex) || {})

const rows = computed(() =>
  TOURNAMENT_KEYS.map((key) => ({
    key,
    label: t(`details.${key}`),
    desc: t(`tourney.desc.${key}`),
    unit: key === 'averageStack' ? 'BB' : null,
    step: key === 'averageStack' ? '0.1' : '1',
    value: typed.value[key] ?? '',
    host: props.host?.[key] ?? null,
  })),
)

/** What the snapshot will actually say — typed where typed, host's otherwise. */
const effective = computed(() =>
  Object.fromEntries(
    TOURNAMENT_KEYS.map((key) => [key, typed.value[key] ?? props.host?.[key] ?? null]),
  ),
)

/** Which of the two answers this header buys, in the endpoint's own terms. */
const gate = computed(() => {
  const e = effective.value
  if (e.playersLeft == null || e.playersPaid == null) {
    return { ok: false, text: t('tourney.needBoth') }
  }
  if (e.averageStack == null) return { ok: false, text: t('tourney.needAverage') }
  return { ok: true, text: t('tourney.icm') }
})

/**
 * The clauses this adds to every snapshot — the header's own words, verbatim,
 * and in the order the body will carry them rather than the order they are
 * typed in above.
 */
const written = computed(() =>
  TOURNAMENT_WRITE_ORDER.filter((k) => typed.value[k] != null).map((k) =>
    tournamentPhrase(k, typed.value[k]),
  ),
)

function onInput(key, value) {
  setManualTournament(props.tableIndex, key, value)
}
</script>

<template>
  <InfoSheet
    :title="t('tourney.title')"
    :subtitle="t('tourney.subtitle', { index: tableIndex })"
    @close="emit('close')"
  >
    <p class="lede">{{ t('tourney.lede') }}</p>

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
          :step="row.step"
          inputmode="decimal"
          :placeholder="row.host != null ? String(row.host) : t('tourney.absent')"
          :value="row.value"
          :aria-label="row.label"
          @input="onInput(row.key, $event.target.value)"
        />
        <span v-if="row.unit" class="unit">{{ row.unit }}</span>
      </label>
    </div>

    <p class="gate" :class="{ ok: gate.ok }">{{ gate.text }}</p>

    <div class="foot">
      <p v-if="written.length" class="wrote">
        <span class="eyebrow">{{ t('tourney.writes') }}</span>
        <code>{{ written.join(', ') }}</code>
      </p>
      <p v-else class="wrote muted">{{ t('tourney.noneTyped') }}</p>
      <button
        class="btn btn-sm"
        :disabled="!written.length"
        @click="clearManualTournament(tableIndex)"
      >
        {{ t('tourney.clear') }}
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
  font-size: 13.5px;
  font-weight: 640;
}

.desc {
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.4;
}

/* The unit sits inside the field's border, so the number and its BB read as one
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

/* Typed, as opposed to left to the host. The same blue the felt marks it in. */
.ctl.on {
  border-color: color-mix(in srgb, var(--blue) 55%, transparent);
}

.num {
  width: 120px;
  min-height: 40px;
  padding: 0 2px 0 10px;
  border: none;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 15px;
  text-align: right;
}

/* The placeholder is a phrase as often as it is a number, so it drops the mono
   figures the value keeps and fits either way. */
.num::placeholder {
  font-family: var(--font-ui);
  font-size: 12.5px;
}

.num:focus {
  outline: none;
  box-shadow: none;
}

.unit {
  color: var(--label-2);
  font-size: 13px;
  font-weight: 620;
}

/* Which of the two answers the header buys. Not a warning: a chip-EV answer is
   a correct answer to a different question, and the operator is the one who
   knows whether this table is at a pay jump. */
.gate {
  margin: 12px 0 0;
  padding: 9px 12px;
  border-radius: var(--r-md);
  border-top: 1px solid var(--separator);
  background: var(--fill);
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.gate.ok {
  background: color-mix(in srgb, var(--green) 14%, transparent);
  color: var(--label);
}

.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 14px;
  margin-top: 12px;
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
