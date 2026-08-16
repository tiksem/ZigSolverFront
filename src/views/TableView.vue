<script setup>
/**
 * One table: one socket, one API.
 *
 * The mode=0 socket pushes the table snapshots (the /move `body` format) and
 * takes the commands. Every snapshot is POSTed straight to the ZigSolver API,
 * and the answer is what the panel renders — there is no mode=1 socket in this
 * flow; the front end is the one calling the solver.
 *
 * Picking a read re-POSTs the SAME body with that profile. Because the call
 * carries a handId, the endpoint answers it off the tree it already solved
 * (one best-response pass) rather than solving the spot again.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import AppNav from '../components/AppNav.vue'
import StatusDot from '../components/StatusDot.vue'
import PokerTable from '../components/PokerTable.vue'
import ProfileBar from '../components/ProfileBar.vue'
import SolverPanel from '../components/SolverPanel.vue'
import { useSocket } from '../lib/useSocket'
import { parseHandBody } from '../lib/handBody'
import { solveMove, cancelSolve, createHandIds } from '../lib/zigsolver'
import SettingsSheet from '../components/SettingsSheet.vue'
import MessageDock from '../components/MessageDock.vue'
import { notify } from '../lib/notify'
import {
  MODE_HAND,
  server,
  api,
  socketUrl,
  apiUrl,
  displayHost,
  displayApi,
} from '../lib/server'
import { settings } from '../lib/settings'
import { PROFILE_BY_NAME } from '../lib/profiles'

const props = defineProps({ index: { type: Number, required: true } })
const router = useRouter()

if (!server.value || !api.value) router.replace({ name: 'connect' })

const hand = ref(null)
const result = ref(null)
const solving = ref(false)
const feed = ref([])
/** 'auto' | 'gto' | a profile name */
const read = ref('auto')
const showSettings = ref(false)

/**
 * The snapshot currently being answered — what a re-solve re-sends. A ref, not
 * a plain variable: `canSolve` is computed from it.
 */
const lastBody = ref(null)
let lastHandId = null
let inFlight = null
let solveSeq = 0
let coalesceTimer = null

/**
 * A new snapshot lands while an older one is still solving all the time (the
 * villain acts, the client re-reads). The old answer is worthless the moment
 * that happens, so the request is aborted rather than awaited.
 *
 * The short window before firing coalesces a burst of snapshots into one solve
 * — the case where cancelling after the fact would already have spent the
 * budget. It is invisible next to a multi-second solve.
 */
const COALESCE_MS = 150

/**
 * Cancellation handles. Every solve gets its OWN id, and /cancel names it.
 *
 * A stable per-table id looks tidier and is wrong: /cancel is fire-and-forget,
 * so it races the replacement /move, and if the replacement wins the race the
 * cancel arrives afterwards and kills the request we just made. A unique id per
 * solve makes a late cancel harmless — it names a request that has already
 * finished, which the endpoint answers with `found: false`.
 */
const idBase = `zs-${Math.random().toString(36).slice(2, 8)}-t${props.index}`
let currentRequestId = null

const handIdFor = createHandIds(props.index)

const handUrl = computed(() => socketUrl(MODE_HAND, props.index))
const canSolve = computed(() => !!lastBody.value && !!api.value)

const handSock = useSocket({
  url: handUrl,
  onMessage: (data) => onHandMessage(String(data)),
})

function onHandMessage(text) {
  const parsed = parseHandBody(text)
  if (parsed) {
    // Identical body re-sent (a re-read of the same spot): the answer on screen
    // already covers it, so do not spend a solve on it.
    const unchanged = parsed.raw === lastBody.value
    hand.value = parsed
    lastBody.value = parsed.raw
    lastHandId = handIdFor(parsed)
    if (settings.autoSolve && (!unchanged || !result.value)) scheduleSolve()
    return
  }
  if (/new hand/i.test(text)) {
    // The spot on screen is over; anything still solving for it is wasted.
    abortInFlight()
    clearTimeout(coalesceTimer)
    coalesceTimer = null
    solveSeq++
    updateBusy()
    hand.value = null
    result.value = null
    lastBody.value = null
    feed.value = []
  }
  // Everything the host says that is not a snapshot: a notification now, and
  // the dock's history afterwards.
  notify(text, { tone: /not running|error|fail/i.test(text) ? 'warn' : 'info' })
  feed.value = [{ text, at: Date.now() }, ...feed.value].slice(0, 200)
}

function updateBusy() {
  solving.value = !!inFlight || coalesceTimer !== null
}

/**
 * Kill the request in flight, if any — on both ends.
 *
 * Aborting the fetch only frees the browser; POST /cancel is what stops the
 * solver (SIGKILL on the running stage) and releases the solve semaphore, so
 * the replacement request is not queued behind an answer nobody will read.
 */
function abortInFlight() {
  if (!inFlight) return
  inFlight.abort()
  inFlight = null
  // Cancel by the id of the request being abandoned — captured before the
  // replacement takes one out.
  if (settings.cancelSuperseded && currentRequestId) {
    cancelSolve(apiUrl('/cancel'), currentRequestId)
  }
  currentRequestId = null
}

/** Supersede whatever is running and solve the newest snapshot. */
function scheduleSolve() {
  abortInFlight()
  clearTimeout(coalesceTimer)
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null
    solve()
  }, COALESCE_MS)
  updateBusy()
}

/** POST the current snapshot under the current read. */
async function solve() {
  clearTimeout(coalesceTimer)
  coalesceTimer = null
  const url = apiUrl('/move')
  if (!url || !lastBody.value) return updateBusy()

  // A newer snapshot supersedes an older solve: without this a slow answer for
  // a spot that has already moved on could land after the fresh one.
  abortInFlight()
  const controller = new AbortController()
  inFlight = controller
  const seq = ++solveSeq
  const rid = `${idBase}-${seq}`
  currentRequestId = rid

  const request = {
    body: lastBody.value,
    handId: settings.useHandCache ? lastHandId : null,
    requestId: rid,
    maxSolveTime: settings.maxSolveTime,
    statHands: settings.statHands,
    profile: read.value === 'auto' || read.value === 'gto' ? null : read.value,
    autoProfile: read.value !== 'gto',
    readLabel: read.value,
  }

  updateBusy()
  try {
    const out = await solveMove(url, request, controller.signal)
    if (out.type === 'cancelled') return
    if (seq === solveSeq) {
      // Comparing two reads on one spot should not also re-roll the dice.
      if (settings.stableSample && out.type === 'answer' && result.value?.type === 'answer') {
        const held = result.value.sampledExploit
        const still = held && out.exploit.find((a) => a.action === held.action)
        if (still) out.sampledExploit = still
      }
      result.value = out
    }
  } catch (e) {
    // An abort is us superseding ourselves — never an error to show.
    if (e.name !== 'AbortError' && seq === solveSeq) {
      result.value = { type: 'error', id: seq, message: String(e), request }
    }
  } finally {
    if (inFlight === controller) inFlight = null
    // Finished: there is nothing left to cancel under this id.
    if (currentRequestId === rid) currentRequestId = null
    updateBusy()
  }
}

function selectRead(value) {
  read.value = value
  // A named profile is the runner's read too — same token the old page sent.
  if (PROFILE_BY_NAME[value]) {
    const sent = handSock.send(value)
    showToast(sent ? `Read: ${value} — re-solving` : `Re-solving as ${value} (table offline)`, sent)
  }
  solve()
}

function command(token) {
  const ok = handSock.send(token)
  showToast(ok ? `Sent “${token}”` : 'Not connected — command dropped', ok)
}

function showToast(text, ok = true) {
  notify(text, { tone: ok ? 'ok' : 'bad' })
}

watch(
  () => props.index,
  () => {
    abortInFlight()
    clearTimeout(coalesceTimer)
    coalesceTimer = null
    solveSeq++
    updateBusy()
    hand.value = null
    result.value = null
    feed.value = []
    lastBody.value = null
    read.value = 'auto'
    handSock.reconnect()
  },
)

// Leaving the table kills the solve with it.
onBeforeUnmount(() => {
  abortInFlight()
  clearTimeout(coalesceTimer)
})

</script>

<template>
  <div class="wrap">
    <AppNav
      :title="`Table ${index}`"
      :subtitle="`${displayHost()}  ·  solver ${displayApi()}`"
      :back="{ name: 'connect' }"
      wide
    >
      <StatusDot
        :status="handSock.status.value"
        :label="`Table · ${handSock.status.value === 'open' ? 'live' : handSock.status.value}`"
      />
      <StatusDot
        :status="solving ? 'connecting' : result?.type === 'error' ? 'closed' : 'open'"
        :label="solving ? 'Solver · solving' : result?.type === 'error' ? 'Solver · error' : 'Solver · ready'"
      />
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

    <!-- Two columns: the felt on the left, everything that reads it on the
         right. The right column scrolls on its own so the table never leaves
         the screen while you read the answer. -->
    <div class="page">
      <div class="felt-col">
        <div v-if="handSock.status.value !== 'open'" class="offline card">
          <div class="spinner" />
          <div>
            <strong>Connecting to {{ displayHost() }}</strong>
            <p class="muted">
              The table socket retries automatically. If the table is not running the host replies
              with a message on the feed below.
            </p>
          </div>
        </div>

        <!-- No swap transition and no :key here on purpose: the felt updates in
             place on every snapshot, and an out-in transition stalls whenever the
             tab is backgrounded (rAF throttling), which would strand the table. -->
        <PokerTable v-if="hand" :hand="hand" />
        <div v-else class="empty card">
          <p><strong>No snapshot yet</strong></p>
          <p class="muted">
            The table pushes its state when the hero has a decision, and it is sent to the solver as
            it arrives. Hit <kbd>Read</kbd> to ask the runner to re-read the table.
          </p>
        </div>
      </div>

      <aside class="side">
        <ProfileBar
          :disabled="handSock.status.value !== 'open'"
          :selected="read"
          :solving="solving"
          :can-solve="canSolve"
          @select="selectRead"
          @command="command"
          @resolve="solve"
          @settings="showSettings = true"
        />

        <SolverPanel :result="result" :pending="solving" :read="read" />
      </aside>
    </div>

    <MessageDock :messages="feed" title="Host messages" @clear="feed = []" />

    <SettingsSheet v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100%;
}

/* Wider than the shared .page so both columns get room. The felt is capped at a
   comfortable size and the right column takes everything left over, so no width
   goes to waste between them. */
.page {
  max-width: 1760px;
  display: grid;
  grid-template-columns: minmax(0, 820px) minmax(340px, 1fr);
  align-items: start;
  gap: 20px;
  padding-top: 18px;
  padding-bottom: 24px;
}

.felt-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Sticky and self-scrolling: the answer can be as long as it likes without
   pushing the felt off the screen. */
.side {
  position: sticky;
  top: 70px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  max-height: calc(100vh - 112px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (max-width: 1100px) {
  .page {
    grid-template-columns: minmax(0, 1fr);
  }

  .side {
    position: static;
    max-height: none;
    overflow: visible;
  }
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

.offline {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}

.offline p {
  margin: 2px 0 0;
  font-size: 13px;
}

.empty {
  padding: 40px 24px;
  text-align: center;
}

.empty p {
  margin: 0;
}

.empty p + p {
  margin-top: 6px;
  font-size: 13.5px;
}

kbd {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--fill);
  font-family: var(--font-mono);
  font-size: 11px;
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

</style>
