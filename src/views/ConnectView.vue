<script setup>
/**
 * Root view: the coordinator, the two endpoints behind it, and the tables the
 * bot host is running.
 *
 * The page talks to ZigSolverCoordinator only (lib/coordinator.js). Connecting
 * hands it the bot host and the ZigSolver API; it opens the mode=0 socket on the
 * hardcoded indexes table, where the Kotlin side broadcasts
 *
 *     "Indexes: " + tableRunners.map { it.tableIndex }.joinToString(",")
 *
 * and probes the API's /health at the same time, so an unreachable API is a
 * message here rather than a surprise mid-hand. Every index in that line becomes
 * a card; anything else on the socket is a status line and lands in the
 * activity list underneath. The coordinator keeps all of it — the endpoints,
 * the connection, the list — so coming back to this screen, or opening it on a
 * second machine, finds it as it was.
 *
 * Under the macOS shell there is one host field, not two: the solver is the
 * process the app started, and its endpoint and token are handed to the
 * coordinator as they are (lib/native.js).
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppNav from '../components/AppNav.vue'
import StatusDot from '../components/StatusDot.vue'
import SettingsSheet from '../components/SettingsSheet.vue'
import MessageDock from '../components/MessageDock.vue'
import { readStored } from '../lib/persist'
import { t, tv } from '../lib/i18n'
import { isNative, nativeShell, reportHost, openTableTab } from '../lib/native'
import {
  link,
  state,
  coordinatorInput,
  coordinatorUrl,
  looksLikeAddress,
  setCoordinator,
  connectHosts,
  disconnectHosts,
  probeHealth,
  lobbyCommand,
  clearActivity,
  watchLobby,
} from '../lib/coordinator'

const router = useRouter()

// The lobby's status lines are toasts while this screen is up.
watchLobby()

const coordinatorDraft = ref(coordinatorInput.value)
// Before the coordinator held them, this browser did: a first run against a
// fresh coordinator starts from what was typed here last.
const hostDraft = ref(state.config.host || legacy('zigsolver.server'))
const apiDraft = ref(state.config.api || legacy('zigsolver.api'))
// Never filled from the coordinator: it keeps the token and does not send it
// back. Typing one replaces it; leaving this empty keeps the one it has.
const apiTokenDraft = ref('')
const connectError = ref(null)
const showSettings = ref(false)

function legacy(key) {
  const v = readStored(key)
  return typeof v === 'string' ? v : ''
}

const connected = computed(() => state.config.connected)
const tables = computed(() => state.lobby.tables)

const coordinatorValid = computed(() => !!coordinatorUrl(coordinatorDraft.value))
const hostValid = computed(() => looksLikeAddress(hostDraft.value))
// Under the shell the solver's endpoint came from the app, so it is valid by
// construction and there is no second field to be waiting on.
const apiValid = computed(() => isNative || looksLikeAddress(apiDraft.value))
const canConnect = computed(() => link.ready && hostValid.value && apiValid.value)

/** What the coordinator row says about the socket to it. */
const coordinatorText = computed(() => {
  if (link.ready) return t('connect.coordinatorReady')
  return tv(`status.${link.status}`, link.status)
})

function applyCoordinator() {
  if (!coordinatorValid.value) return
  setCoordinator(coordinatorDraft.value)
}

/** What the /health verdict says, in the language selected right now. */
const apiText = computed(() => {
  const s = state.health
  if (!s) return ''
  if (s.state === 'checking') return t('connect.checking')
  if (s.state === 'fail') return t('connect.unreachable', { url: s.url })
  const info = s.info || {}
  return [
    info.status,
    info.libVersion ? t('connect.libVersion', { version: info.libVersion }) : null,
    info.netEnabled ? t('connect.turnNetOn', { device: info.netDevice }) : t('connect.turnNetOff'),
    info.flopSolveDevice ? t('connect.flopDevice', { device: info.flopSolveDevice }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
})

/** The actionable half, and only the failure has one. */
const apiHint = computed(() =>
  state.health?.state === 'fail' ? t('connect.unreachableHint') : null,
)

async function connect() {
  if (!canConnect.value) return
  connectError.value = null
  // The shell keeps its own copy, so the next launch opens on this host and
  // its window can say where it is pointed before the page has loaded.
  reportHost(hostDraft.value)
  try {
    await connectHosts({
      host: hostDraft.value,
      api: isNative ? nativeShell.api : apiDraft.value,
      apiToken: isNative ? nativeShell.token : apiTokenDraft.value,
    })
    apiTokenDraft.value = ''
  } catch (e) {
    connectError.value = e.message
  }
}

function disconnect() {
  disconnectHosts()
}

// The coordinator's values arrive with its hello, and change when any page (the
// settings sheet here, another machine) changes them.
watch(
  () => state.config.host,
  (v) => {
    if (v && v !== hostDraft.value) hostDraft.value = v
  },
)
watch(
  () => state.config.api,
  (v) => {
    if (v && v !== apiDraft.value) apiDraft.value = v
  },
)
watch(coordinatorInput, (v) => {
  if (v !== coordinatorDraft.value) coordinatorDraft.value = v
})

/**
 * A table opens in a TAB under the shell, and in this one otherwise.
 *
 * The list is worth keeping on screen — it is where the next table comes from,
 * and it is the only thing that notices one appearing or going away — so in the
 * app it stays in its own tab and each table gets another. `openTableTab`
 * returns false in a browser, where a route change is the only thing there is.
 */
function openTable(index) {
  if (isNative && openTableTab(index)) return
  router.push({ name: 'table', params: { index } })
}
</script>

<template>
  <div class="wrap">
    <AppNav
      :title="t('connect.title')"
      :subtitle="connected ? state.config.hostDisplay : t('connect.notConnected')"
    >
      <StatusDot v-if="connected" :status="state.lobby.status" />
      <button class="gear" :title="t('nav.settings')" @click="showSettings = true">
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
        <h1>{{ t('connect.heading') }}</h1>
        <p class="lede">{{ t('connect.lede') }}</p>
      </section>

      <!-- The one address this page keeps for itself. Everything below is the
           coordinator's, which is why it cannot be typed until it answers. -->
      <form class="coordinator card" :class="{ down: !link.ready }" @submit.prevent="applyCoordinator">
        <div class="field-block">
          <label class="eyebrow" for="coordinator">{{ t('connect.coordinator') }}</label>
          <div class="crow">
            <input
              id="coordinator"
              v-model="coordinatorDraft"
              class="field"
              type="text"
              inputmode="url"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="localhost:8765"
            />
            <button
              v-if="coordinatorDraft.trim() !== coordinatorInput"
              class="btn"
              type="submit"
              :disabled="!coordinatorValid"
            >
              {{ t('connect.coordinatorApply') }}
            </button>
            <StatusDot :status="link.ready ? 'open' : link.status" :label="coordinatorText" />
          </div>
          <!-- v-html: the <code> is the message file's own. -->
          <p v-if="!link.ready && link.attempts > 0" class="chint" v-html="t('connect.coordinatorHint')" />
        </div>
      </form>

      <form class="connect card" @submit.prevent="connect">
        <div class="fields">
          <div class="field-block">
            <label class="eyebrow" for="host">{{ t('connect.botHost') }}</label>
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
              :disabled="connected || !link.ready"
              @keydown.enter.prevent="connect"
            />
          </div>

          <div v-if="!isNative" class="field-block">
            <label class="eyebrow" for="api">{{ t('connect.api') }}</label>
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
              :disabled="connected || !link.ready"
              @keydown.enter.prevent="connect"
            />
          </div>

          <!-- Optional, and last: an API started with --auth-token refuses
               every call without one, /health included, so this screen would
               otherwise report a perfectly healthy solver as unreachable.
               Left empty for an API that wants none, which is the LAN case. -->
          <div v-if="!isNative" class="field-block">
            <label class="eyebrow" for="apiToken">
              {{ t('connect.apiToken') }}
              <span class="optional">{{ t('connect.optional') }}</span>
            </label>
            <input
              id="apiToken"
              v-model="apiTokenDraft"
              class="field"
              type="password"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              :placeholder="
                state.config.apiTokenSet
                  ? t('connect.apiTokenSaved')
                  : t('connect.apiTokenPlaceholder')
              "
              :disabled="connected || !link.ready"
              @keydown.enter.prevent="connect"
            />
          </div>

          <!-- The shell's solver: stated, not typed. It is this app's own
               process on loopback and there is nothing to point elsewhere. -->
          <div v-else class="field-block">
            <span class="eyebrow">{{ t('connect.api') }}</span>
            <p class="embedded">{{ t('connect.embedded') }}</p>
          </div>
        </div>

        <div class="actions">
          <button v-if="!connected" class="btn btn-primary" type="submit" :disabled="!canConnect">
            {{ t('connect.connect') }}
          </button>
          <button v-else class="btn btn-danger" type="button" @click="disconnect">
            {{ t('connect.disconnect') }}
          </button>
          <span v-if="connectError" class="bad small">{{ connectError }}</span>
          <span v-else-if="link.ready && !canConnect && (hostDraft || apiDraft)" class="muted small">
            {{ isNative ? t('connect.hostRequired') : t('connect.bothRequired') }}
          </span>
        </div>

        <div v-if="connected && state.health" class="apistate" :class="state.health.state">
          <span class="ico">
            <svg v-if="state.health.state === 'ok'" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg v-else-if="state.health.state === 'fail'" viewBox="0 0 16 16" aria-hidden="true">
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
            <strong>{{ t('connect.apiLine', { text: apiText }) }}</strong>
            <span v-if="apiHint" class="ahint">{{ apiHint }}</span>
          </span>
          <button v-if="state.health.state === 'fail'" class="btn btn-sm" type="button" @click="probeHealth">
            {{ t('common.retry') }}
          </button>
        </div>
      </form>

      <section v-if="connected" class="results">
        <div class="sechead">
          <h2>{{ t('connect.runningTables') }}</h2>
          <span v-if="tables.length" class="chip">{{ tables.length }}</span>
          <div class="spacer" />
          <StatusDot :status="state.lobby.status" />
        </div>

        <TransitionGroup v-if="tables.length" name="fade" tag="div" class="grid">
          <button
            v-for="index in tables"
            :key="index"
            class="tile card"
            @click="openTable(index)"
          >
            <span class="tile-index">{{ index }}</span>
            <span class="tile-name">{{ t('connect.table', { index }) }}</span>
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
          <!-- v-html: the <code> is the message file's own. -->
          <p v-if="state.lobby.status === 'open'" v-html="t('connect.waitingBroadcast')" />
          <p v-else>{{ t('connect.reaching', { host: state.config.hostDisplay }) }}</p>
        </div>

        <div class="allbots">
          <button class="btn" :disabled="state.lobby.status !== 'open'" @click="lobbyCommand('allbot')">
            {{ t('connect.toggleAllBots') }}
          </button>
          <button
            class="btn"
            :disabled="state.lobby.status !== 'open'"
            @click="lobbyCommand('autoenablebot')"
          >
            {{ t('connect.autoEnableBots') }}
          </button>
        </div>

      </section>

      <section v-else class="placeholder">
        <p class="muted">
          {{ isNative ? t('connect.placeholderNative') : t('connect.placeholder') }}
        </p>
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
          <strong>{{ t('connect.checkLink') }}</strong>
          <span class="muted">{{ t('connect.checkLinkSub') }}</span>
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

    <MessageDock
      :messages="state.lobby.activity"
      :title="t('connect.hostMessages')"
      @clear="clearActivity"
    />

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

.coordinator {
  padding: 14px 18px;
  margin-bottom: 14px;
}

/* Down is the one state where nothing below can work, so it is the one that
   is allowed to look like a problem. */
.coordinator.down {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--orange) 55%, transparent), var(--shadow-1);
}

.crow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.crow .field {
  flex: 1;
  margin-top: 0;
}

.chint {
  margin: 8px 2px 0;
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}

/* :deep, because the <code> in the hint arrives through v-html. */
.chint :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--fill);
}

.bad {
  color: var(--red);
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

/* "optional" sits inside the label, so it has to shed the eyebrow's caps and
   weight or it reads as part of the field's name. */
.optional {
  margin-left: 6px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  opacity: 0.7;
}

/* The shell's solver line, where a browser has an input. Given the height of
   the field it replaces so the Connect button does not move between the two. */
.embedded {
  display: flex;
  align-items: center;
  margin: 6px 0 0;
  min-height: 38px;
  color: var(--label-2);
  font-size: 13px;
  line-height: 1.35;
}

.hint {
  margin: 8px 2px 0;
  color: var(--label-2);
  font-size: 12.5px;
}

/* :deep, because the one <code> left on this screen arrives through v-html. */
.empty :deep(code) {
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
