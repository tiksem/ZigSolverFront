<script setup>
/**
 * Root view: the two endpoints, and the tables the bot host is running.
 *
 * Connecting opens the mode=0 socket on the hardcoded indexes table, which is
 * where the Kotlin side broadcasts
 *
 *     "Indexes: " + tableRunners.map { it.tableIndex }.joinToString(",")
 *
 * Every index in that line becomes a card. Anything else on the socket is a
 * status line and lands in the activity list underneath. The ZigSolver URL is
 * probed with GET /health at the same time, so an unreachable API (or a missing
 * CORS header) is a message here rather than a surprise mid-hand.
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppNav from '../components/AppNav.vue'
import StatusDot from '../components/StatusDot.vue'
import SettingsSheet from '../components/SettingsSheet.vue'
import MessageDock from '../components/MessageDock.vue'
import { notify } from '../lib/notify'
import { useSocket } from '../lib/useSocket'
import { health } from '../lib/zigsolver'
import { noteServerInfo } from '../lib/settings'
import {
  INDEXES_TABLE_INDEX,
  MODE_HAND,
  serverInput,
  apiInput,
  setServer,
  setApi,
  socketUrl,
  apiUrl,
  displayHost,
  parseServer,
} from '../lib/server'

const router = useRouter()

const hostDraft = ref(serverInput.value)
const apiDraft = ref(apiInput.value)
const connected = ref(false)
const tables = ref([])
const activity = ref([])

/** null | {state:'checking'|'ok'|'fail', text, hint} */
const apiState = ref(null)
const showSettings = ref(false)

const target = computed(() => (connected.value ? socketUrl(MODE_HAND, INDEXES_TABLE_INDEX) : null))
const hostValid = computed(() => !!parseServer(hostDraft.value))
const apiValid = computed(() => !!parseServer(apiDraft.value))
const canConnect = computed(() => hostValid.value && apiValid.value)

const sock = useSocket({
  url: target,
  autoConnect: false,
  onMessage: (data) => handleMessage(String(data)),
})

function handleMessage(text) {
  const m = /indexes\s*:\s*([\d\s,]*)/i.exec(text)
  if (m) {
    tables.value = [
      ...new Set(
        m[1]
          .split(',')
          .map((t) => parseInt(t.trim(), 10))
          .filter((n) => Number.isFinite(n)),
      ),
    ].sort((a, b) => a - b)
    return
  }
  // Not a table list: a status line from the host — notify, then keep it.
  notify(text, { tone: /not running|error|fail/i.test(text) ? 'warn' : 'info' })
  activity.value = [{ text, at: Date.now() }, ...activity.value].slice(0, 200)
}

async function probeApi() {
  const url = apiUrl('/health')
  if (!url) return
  apiState.value = { state: 'checking', text: 'Checking…' }
  try {
    const info = await health(url)
    // The API's own flop-tuning defaults, for the settings sheet's placeholders.
    noteServerInfo(info)
    const bits = [
      info.status,
      info.libVersion ? `lib ${info.libVersion}` : null,
      info.netEnabled ? `turn net on (${info.netDevice})` : 'turn net off',
      info.flopSolveDevice ? `flop ${info.flopSolveDevice}` : null,
    ].filter(Boolean)
    apiState.value = { state: 'ok', text: bits.join(' · ') }
  } catch (e) {
    apiState.value = {
      state: 'fail',
      text: `Could not reach ${url}`,
      hint:
        'The API is either not running there, or running without CORS headers — ' +
        'a browser refuses a cross-origin response that has none. Add ' +
        'CORSMiddleware to api/server.py, or serve this app from the API’s origin.',
    }
  }
}

function connect() {
  if (!canConnect.value) return
  setServer(hostDraft.value)
  setApi(apiDraft.value)
  tables.value = []
  activity.value = []
  connected.value = true
  nextTick(() => sock.reconnect())
  probeApi()
}

function disconnect() {
  connected.value = false
  sock.close()
  tables.value = []
  apiState.value = null
}

watch(serverInput, (v) => {
  if (v !== hostDraft.value) hostDraft.value = v
})
watch(apiInput, (v) => {
  if (v !== apiDraft.value) apiDraft.value = v
})

// Coming back from a table view should not mean re-typing the endpoints.
onMounted(() => {
  if (canConnect.value) connect()
})

function openTable(index) {
  router.push({ name: 'table', params: { index } })
}

</script>

<template>
  <div class="wrap">
    <AppNav title="ZigSolver" :subtitle="connected ? displayHost() : 'Not connected'">
      <StatusDot v-if="connected" :status="sock.status.value" />
      <button class="gear" title="Settings" @click="showSettings = true">
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path
            d="M10 2.2l1 2.1 2.3-.5.5 2.3 2.1 1-1 2.1 1 2.1-2.1 1-.5 2.3-2.3-.5-1 2.1-1-2.1-2.3.5-.5-2.3-2.1-1 1-2.1-1-2.1 2.1-1 .5-2.3 2.3.5z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </AppNav>

    <div class="page">
      <section class="hero">
        <h1>Tables</h1>
        <p class="lede">
          Connect to a running bot host to list its tables. Each table’s snapshots are sent
          straight to the ZigSolver API, and its answer is what you read.
        </p>
      </section>

      <form class="connect card" @submit.prevent="connect">
        <div class="fields">
          <div class="field-block">
            <label class="eyebrow" for="host">Bot host</label>
            <input
              id="host"
              v-model="hostDraft"
              class="field"
              type="text"
              inputmode="url"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="localhost:8080"
              :disabled="connected"
              @keydown.enter.prevent="connect"
            />
          </div>

          <div class="field-block">
            <label class="eyebrow" for="api">ZigSolver API</label>
            <input
              id="api"
              v-model="apiDraft"
              class="field"
              type="text"
              inputmode="url"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="localhost:8000"
              :disabled="connected"
              @keydown.enter.prevent="connect"
            />
          </div>
        </div>

        <div class="actions">
          <button v-if="!connected" class="btn btn-primary" type="submit" :disabled="!canConnect">
            Connect
          </button>
          <button v-else class="btn btn-danger" type="button" @click="disconnect">
            Disconnect
          </button>
          <span v-if="!canConnect && (hostDraft || apiDraft)" class="muted small">
            Both hosts are required.
          </span>
        </div>

        <div v-if="apiState" class="apistate" :class="apiState.state">
          <span class="ico">
            <svg v-if="apiState.state === 'ok'" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg v-else-if="apiState.state === 'fail'" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4 L12 12 M12 4 L4 12"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              />
            </svg>
            <span v-else class="spinner tiny" />
          </span>
          <span class="atext">
            <strong>ZigSolver: {{ apiState.text }}</strong>
            <span v-if="apiState.hint" class="ahint">{{ apiState.hint }}</span>
          </span>
          <button v-if="apiState.state === 'fail'" class="btn btn-sm" type="button" @click="probeApi">
            Retry
          </button>
        </div>
      </form>

      <section v-if="connected" class="results">
        <div class="sechead">
          <h2>Running tables</h2>
          <span v-if="tables.length" class="chip">{{ tables.length }}</span>
          <div class="spacer" />
          <StatusDot :status="sock.status.value" />
        </div>

        <TransitionGroup v-if="tables.length" name="fade" tag="div" class="grid">
          <button
            v-for="index in tables"
            :key="index"
            class="tile card"
            @click="openTable(index)"
          >
            <span class="tile-index">{{ index }}</span>
            <span class="tile-name">Table {{ index }}</span>
            <span class="tile-go">
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
                <path
                  d="M7.5 4 L13.5 10 L7.5 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </button>
        </TransitionGroup>

        <div v-else class="empty card">
          <div class="spinner" />
          <p v-if="sock.status.value === 'open'">
            Connected — waiting for the <code>Indexes:</code> broadcast.
          </p>
          <p v-else>Reaching {{ displayHost() }}…</p>
        </div>

        <div class="allbots">
          <button class="btn" :disabled="sock.status.value !== 'open'" @click="sock.send('allbot')">
            Toggle all bots
          </button>
          <button
            class="btn"
            :disabled="sock.status.value !== 'open'"
            @click="sock.send('autoenablebot')"
          >
            Auto-enable bots
          </button>
        </div>

      </section>

      <section v-else class="placeholder">
        <p class="muted">Enter both hosts above to see the tables the bot is running.</p>
      </section>

      <RouterLink class="checklink card" to="/check">
        <span class="ci">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <rect
              x="3"
              y="5"
              width="18"
              height="14"
              rx="3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
            <path
              d="M4 17l5-4.5 3.5 3 3-2.5L20 17"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="cl">
          <strong>Screenshot check</strong>
          <span class="muted">Run a screenshot through the extractor, or crop a region.</span>
        </span>
        <svg class="cx" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path
            d="M7.5 4 L13.5 10 L7.5 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </RouterLink>
    </div>

    <MessageDock :messages="activity" title="Host messages" @clear="activity = []" />

    <SettingsSheet v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100%;
}

.hero {
  padding: 22px 0 18px;
}

.lede {
  margin: 8px 0 0;
  max-width: 58ch;
  color: var(--label-2);
  font-size: 16px;
}

.connect {
  padding: 18px;
}

.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field-block .field {
  margin-top: 6px;
}

.hint {
  margin: 8px 2px 0;
  color: var(--label-2);
  font-size: 12.5px;
}

code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--fill);
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.actions .btn {
  min-height: 44px;
  padding: 0 22px;
}

.small {
  font-size: 12.5px;
}

.apistate {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--fill);
  font-size: 13px;
}

.apistate.ok {
  background: color-mix(in srgb, var(--green) 12%, transparent);
  color: color-mix(in srgb, var(--green) 76%, var(--label));
}

.apistate.fail {
  background: color-mix(in srgb, var(--red) 12%, transparent);
  color: color-mix(in srgb, var(--red) 84%, var(--label));
}

.ico {
  width: 16px;
  height: 16px;
  flex: none;
  margin-top: 2px;
  display: grid;
  place-items: center;
}

.ico svg {
  width: 16px;
  height: 16px;
}

.atext {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ahint {
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.results {
  margin-top: 28px;
}

.sechead {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
}

.tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.tile:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}

.tile:active {
  transform: scale(0.985);
}

.tile-index {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: linear-gradient(160deg, var(--blue), color-mix(in srgb, var(--blue) 62%, var(--purple)));
  color: #fff;
  font-family: var(--font-rounded);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tile-name {
  flex: 1;
  font-size: 16px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.tile-go {
  color: var(--label-3);
}

.empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px;
  color: var(--label-2);
}

.empty p {
  margin: 0;
  font-size: 14px;
}

.spinner {
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 50%;
  border: 2px solid var(--fill-strong);
  border-top-color: var(--blue);
  animation: spin 0.8s linear infinite;
}

.spinner.tiny {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.allbots {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.placeholder {
  padding: 28px 4px;
}

.checklink {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 28px;
  padding: 16px;
  color: inherit;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.checklink:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}

.ci {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: var(--fill);
  color: var(--label-2);
}

.cl {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  font-size: 14px;
}

.cl strong {
  font-size: 15px;
  font-weight: 620;
}

.cx {
  color: var(--label-3);
}

.gear {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.gear:hover {
  background: var(--fill-strong);
  color: var(--label);
}

@media (max-width: 720px) {
  .fields {
    grid-template-columns: 1fr;
  }
}
</style>
