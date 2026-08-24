<script setup>
/**
 * The solve settings. Each row says what the option does at the endpoint, so
 * the sheet doubles as the documentation for the /move fields it drives.
 */
import { computed, onMounted } from 'vue'
import InfoSheet from './InfoSheet.vue'
import {
  settings,
  setSetting,
  resetSettings,
  noteServerInfo,
  serverDefault,
  BUDGET_PRESETS,
  GATE_PRESETS,
  DEFAULTS,
} from '../lib/settings'
import {
  serverInput,
  apiInput,
  setServer,
  setApi,
  parseServer,
  apiUrl,
} from '../lib/server'
import { health } from '../lib/zigsolver'
import { t } from '../lib/i18n'

const emit = defineEmits(['close'])

const dirty = computed(() =>
  Object.keys(DEFAULTS).some((k) => settings[k] !== DEFAULTS[k]),
)

const hostOk = computed(() => !!parseServer(serverInput.value))
const apiOk = computed(() => !!parseServer(apiInput.value))

// The three flop knobs show the API's OWN defaults as their placeholder, so an
// untouched row says what the server will really do instead of a number this
// app made up. Re-read every time the sheet opens: the API may have moved.
onMounted(async () => {
  const url = apiUrl('/health')
  if (!url) return
  try {
    noteServerInfo(await health(url))
  } catch {
    /* unreachable API: the placeholders just read "server default" */
  }
})

function placeholder(key) {
  const v = serverDefault(key, Number(settings.maxSolveTime))
  return v === null ? t('settings.serverDefault') : v
}
</script>

<template>
  <InfoSheet
    :title="t('settings.title')"
    :subtitle="t('settings.subtitle')"
    @close="emit('close')"
  >
    <!-- The `desc` spans are v-html throughout: the only markup in them is the
         <code> and <b> the message files carry, and those files are part of
         this bundle rather than anything a host or an API can reach. -->
    <section class="grp">
      <h4>{{ t('settings.solveGroup') }}</h4>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.budget') }}</strong>
          <span class="desc" v-html="t('settings.budgetDesc')" />
        </div>
        <div class="ctl">
          <div class="presets">
            <button
              v-for="b in BUDGET_PRESETS"
              :key="b"
              class="preset"
              :class="{ on: settings.maxSolveTime === b }"
              @click="setSetting('maxSolveTime', b)"
            >
              {{ b }}s
            </button>
          </div>
          <input
            class="field num"
            type="number"
            min="0.5"
            max="600"
            step="0.5"
            :value="settings.maxSolveTime"
            @change="setSetting('maxSolveTime', $event.target.value)"
          />
        </div>
      </div>

      <div class="row">
        <div class="lab">
          <strong>{{ t('settings.autoSolve') }}</strong>
          <span class="desc" v-html="t('settings.autoSolveDesc')" />
        </div>
        <input
          class="switch"
          type="checkbox"
          :checked="settings.autoSolve"
          @change="setSetting('autoSolve', $event.target.checked)"
        />
      </div>

      <div class="row">
        <div class="lab">
          <strong>{{ t('settings.cancel') }}</strong>
          <span class="desc" v-html="t('settings.cancelDesc')" />
        </div>
        <input
          class="switch"
          type="checkbox"
          :checked="settings.cancelSuperseded"
          @change="setSetting('cancelSuperseded', $event.target.checked)"
        />
      </div>

      <div class="row">
        <div class="lab">
          <strong>{{ t('settings.cache') }}</strong>
          <span class="desc" v-html="t('settings.cacheDesc')" />
        </div>
        <input
          class="switch"
          type="checkbox"
          :checked="settings.useHandCache"
          @change="setSetting('useHandCache', $event.target.checked)"
        />
      </div>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.statHands') }}</strong>
          <span class="desc" v-html="t('settings.statHandsDesc')" />
        </div>
        <input
          class="field num wide"
          type="number"
          min="1"
          step="50"
          :placeholder="t('settings.statHandsPlaceholder')"
          :value="settings.statHands ?? ''"
          @change="setSetting('statHands', $event.target.value)"
        />
      </div>

      <div class="row">
        <div class="lab">
          <strong>{{ t('settings.stableSample') }}</strong>
          <span class="desc" v-html="t('settings.stableSampleDesc')" />
        </div>
        <input
          class="switch"
          type="checkbox"
          :checked="settings.stableSample"
          @change="setSetting('stableSample', $event.target.checked)"
        />
      </div>
    </section>

    <section class="grp">
      <h4>{{ t('settings.qualityGroup') }}</h4>
      <p class="note">{{ t('settings.qualityNote') }}</p>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.gate') }}</strong>
          <span class="desc" v-html="t('settings.gateDesc')" />
        </div>
        <div class="ctl">
          <div class="presets">
            <button
              v-for="g in GATE_PRESETS"
              :key="g"
              class="preset"
              :class="{ on: settings.gateExploitability === g }"
              @click="setSetting('gateExploitability', g)"
            >
              {{ g }}%
            </button>
          </div>
          <input
            class="field num"
            type="number"
            min="0"
            max="100"
            step="0.5"
            :placeholder="placeholder('gateExploitability')"
            :value="settings.gateExploitability ?? ''"
            @change="setSetting('gateExploitability', $event.target.value)"
          />
        </div>
      </div>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.target') }}</strong>
          <span class="desc" v-html="t('settings.targetDesc')" />
        </div>
        <input
          class="field num wide"
          type="number"
          min="0.01"
          max="100"
          step="0.1"
          :placeholder="placeholder('targetExploitability')"
          :value="settings.targetExploitability ?? ''"
          @change="setSetting('targetExploitability', $event.target.value)"
        />
      </div>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.minTime') }}</strong>
          <span class="desc" v-html="t('settings.minTimeDesc')" />
        </div>
        <input
          class="field num wide"
          type="number"
          min="0"
          max="600"
          step="0.5"
          :placeholder="placeholder('minSolveTime')"
          :value="settings.minSolveTime ?? ''"
          @change="setSetting('minSolveTime', $event.target.value)"
        />
      </div>
    </section>

    <section class="grp">
      <h4>{{ t('settings.endpointsGroup') }}</h4>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.botHost') }}</strong>
          <span class="desc">{{ t('settings.botHostDesc') }}</span>
        </div>
        <input
          class="field"
          :class="{ bad: serverInput && !hostOk }"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          placeholder="localhost:8080"
          :value="serverInput"
          @change="setServer($event.target.value)"
        />
      </div>

      <div class="row col">
        <div class="lab">
          <strong>{{ t('settings.api') }}</strong>
          <span class="desc">{{ t('settings.apiDesc') }}</span>
        </div>
        <input
          class="field"
          :class="{ bad: apiInput && !apiOk }"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          placeholder="localhost:8000"
          :value="apiInput"
          @change="setApi($event.target.value)"
        />
      </div>
    </section>

    <div class="foot">
      <button class="btn btn-sm" :disabled="!dirty" @click="resetSettings">
        {{ t('settings.reset') }}
      </button>
    </div>
  </InfoSheet>
</template>

<style scoped>
.grp + .grp {
  margin-top: 8px;
}

.note {
  margin: 0 0 2px;
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.5;
}

h4 {
  margin: 16px 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--label-2);
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 13px 0;
  border-top: 1px solid var(--separator);
}

.row.col {
  flex-direction: column;
  gap: 10px;
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

.desc {
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.5;
}

/* :deep, because the descriptions arrive through v-html and their <code> tags
   carry no scope attribute. */
.desc :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--fill);
}

.ctl {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  flex-wrap: wrap;
}

.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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

.num {
  width: 92px;
  min-height: 34px;
  font-size: 14px;
}

.num.wide {
  width: 140px;
}

.field.bad {
  border-color: var(--red);
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

.foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--separator);
  margin-top: 8px;
}
</style>
