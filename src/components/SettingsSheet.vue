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
  return v === null ? 'server default' : v
}
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
            runs the strongest regime that fits it: full menus, then reduced menus, then
            reduced menus with clustered turn runouts, then the net-truncated flow. Three-way
            pots ladder the same way over the blueprint’s betting menus. More time buys a
            better answer, not a different question.
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
            only Re-solve or a change of regime calls the solver.
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
            re-solve reuse it instead of solving from scratch. GTO only: an Exploit answer walks
            the hand rather than a subgame, so there is nothing for a later street to inherit
            and it is recomputed every time either way.
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
            prices the read the Exploit regime runs on: everything the HUD does not carry is
            imputed from the population, and a thin sample widens those imputations rather than
            pretending to a measurement. Leave empty when you do not know — it is then read as
            “a lot”, i.e. the read at full strength.
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
            Keep one draw while the same spot is re-solved, so a re-solve does not also re-roll
            the dice. Off, every answer samples fresh. GTO only — an Exploit answer is a ranking
            by EV, not a distribution, and its top row is the move.
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
      <h4>Flop solve quality</h4>
      <p class="note">
        The three numbers the flop regime ladder runs on. Leave a field empty to use the
        API’s own default (shown greyed). Flop only — turn and river are always solved as
        their own street at the widest sizing grid.
      </p>

      <div class="row col">
        <div class="lab">
          <strong>Solve exactly when it beats</strong>
          <span class="desc">
            <code>gateExploitability</code> — % of pot. Before choosing, the balancer predicts
            how exploitable each regime’s solve would be at the iterations your budget buys,
            and takes the strongest one at or under this. The net-truncated flow it falls back
            to measures 5.6–12% itself, so anything below that is a real preference for an
            exact solve. Lower is stricter: fewer spots qualify and more drop to the net.
            <strong>0</strong> never solves exactly.
          </span>
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
          <strong>Stop at</strong>
          <span class="desc">
            <code>targetExploitability</code> — % of pot. The solve runs its own best-response
            check as it goes and stops once it reaches this. Lower keeps it iterating longer
            for a sharper answer; the budget still ends it either way.
          </span>
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
          <strong>Minimum solve time</strong>
          <span class="desc">
            <code>minSolveTime</code> — seconds. A floor under the stop above: a flop that
            reaches the target in two seconds keeps improving until this much time is spent,
            which is most of what the budget buys on an easy board. It never runs past the
            solve budget — a value above it is clamped, and the answer says so.
          </span>
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
