<script setup>
/**
 * The solve settings. Each row says what the option does at the endpoint, so
 * the sheet doubles as the documentation for the /move fields it drives.
 */
import { computed } from 'vue'
import InfoSheet from './InfoSheet.vue'
import {
  settings,
  setSetting,
  resetSettings,
  BUDGET_PRESETS,
  DEFAULTS,
} from '../lib/settings'
import {
  serverInput,
  apiInput,
  setServer,
  setApi,
  parseServer,
} from '../lib/server'

const emit = defineEmits(['close'])

const dirty = computed(() =>
  Object.keys(DEFAULTS).some((k) => settings[k] !== DEFAULTS[k]),
)

const hostOk = computed(() => !!parseServer(serverInput.value))
const apiOk = computed(() => !!parseServer(apiInput.value))
</script>

<template>
  <InfoSheet title="Settings" subtitle="How each solve is requested" @close="emit('close')">
    <section class="grp">
      <h4>Solve</h4>

      <div class="row col">
        <div class="lab">
          <strong>Solve budget</strong>
          <span class="desc">
            <code>maxSolveTime</code> — the wall-time budget for the flop solve. The balancer
            runs the strongest regime that fits it: full menus, then reduced menus, then the
            net-truncated flow. More time buys a better answer, not a different question.
          </span>
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
          <strong>Solve every snapshot</strong>
          <span class="desc">
            Send each snapshot to the API the moment it arrives. Off, the table still draws and
            only Re-solve or a read button calls the solver.
          </span>
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
          <strong>Cancel superseded solves</strong>
          <span class="desc">
            When a newer snapshot arrives, <code>POST /cancel</code> kills the one still running:
            it SIGKILLs the solver subprocess and frees the solve semaphore, so the answer you
            do want is not queued behind one you do not. Off, the old solve runs to completion
            and its answer is discarded on arrival.
          </span>
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
          <strong>Per-hand tree cache</strong>
          <span class="desc">
            <code>handId</code> — keys the solved tree to this hand, so the next street and any
            re-solve under a different read reuse it. A profile answer becomes one
            best-response pass (~0.2s) instead of a full solve. Off, every call solves from
            scratch.
          </span>
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
          <strong>Stat sample size</strong>
          <span class="desc">
            <code>statHands</code> — how many hands the HUD stats in the snapshot cover. It
            drives both the profile fit and its temperature: a 150-hand read is played much
            closer to GTO than a 5,000-hand one. Leave empty when you do not know.
          </span>
        </div>
        <input
          class="field num wide"
          type="number"
          min="1"
          step="50"
          placeholder="unknown"
          :value="settings.statHands ?? ''"
          @change="setSetting('statHands', $event.target.value)"
        />
      </div>

      <div class="row">
        <div class="lab">
          <strong>Hold the sampled action</strong>
          <span class="desc">
            Keep one draw while the same spot is re-solved, so comparing reads does not also
            re-roll the dice. Off, every answer samples fresh.
          </span>
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
      <h4>Endpoints</h4>

      <div class="row col">
        <div class="lab">
          <strong>Bot host</strong>
          <span class="desc">The runner’s WebSocket, and the screenshot check upload.</span>
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
          <strong>ZigSolver API</strong>
          <span class="desc">Where snapshots are POSTed. Changing it applies to the next solve.</span>
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
        Reset solve settings
      </button>
    </div>
  </InfoSheet>
</template>

<style scoped>
.grp + .grp {
  margin-top: 8px;
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

code {
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
