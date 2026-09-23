<script setup>
/**
 * One table, as the coordinator sees it.
 *
 * Everything that happens to a snapshot happens in ZigSolverCoordinator: it
 * holds the bot host's socket for this table, writes what was typed by hand into
 * each body, decides whether the snapshot is a new question, draws the regime
 * for the hand, sends the solve, cancels the superseded one and keeps the
 * answer. This view subscribes to the table (lib/coordinator.useTable), draws
 * the state it is sent, and sends back what the operator does: a regime picked,
 * a manual prompt answered, a re-solve, a command, a stat typed.
 *
 * A second page on the same table — another tab, another machine — joins the
 * same session and draws the same felt and the same answer, rather than opening
 * a second socket and paying for every solve twice.
 *
 * What stays here is only what is about this page: which past decision is on
 * the felt, and which sheet is open.
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppNav from '../components/AppNav.vue'
import StatusDot from '../components/StatusDot.vue'
import PokerTable from '../components/PokerTable.vue'
import RegimeBar from '../components/RegimeBar.vue'
import RegimePrompt from '../components/RegimePrompt.vue'
import SolverPanel from '../components/SolverPanel.vue'
import SettingsSheet from '../components/SettingsSheet.vue'
import SeatStatsSheet from '../components/SeatStatsSheet.vue'
import TournamentSheet from '../components/TournamentSheet.vue'
import MessageDock from '../components/MessageDock.vue'
import HistorySheet from '../components/HistorySheet.vue'
import { notify } from '../lib/notify'
// Under the shell this view IS the tab, so there is nothing to go back to
// within it — the tables list is the tab next door, and closing is the ✕.
import { isNative } from '../lib/native'
import { locale, t, tv } from '../lib/i18n'
import {
  link,
  state,
  coordinatorInput,
  useTable,
  selectRegime,
  solveTable,
  pickRegime,
  tableCommand,
  clearFeed,
  typedDone,
  fetchEntry,
} from '../lib/coordinator'

const props = defineProps({ index: { type: Number, required: true } })
const router = useRouter()

const table = useTable(() => props.index)

// A table needs both hosts, and they are typed on the connect screen. Only
// decided once the coordinator has said what it has: before that, an empty
// config is the placeholder, not the answer.
watch(
  () => link.ready && (!state.config.hostValid || !state.config.apiValid),
  (unconfigured) => {
    if (unconfigured) router.replace({ name: 'connect' })
  },
  { immediate: true },
)

/**
 * The table socket's state — or the coordinator's, while that is what stands
 * between this page and the table.
 */
const socketStatus = computed(() => {
  if (!link.ready) return link.status === 'open' ? 'connecting' : link.status
  return table.value.synced ? table.value.socket : 'connecting'
})

const socketLabel = computed(() =>
  !link.ready
    ? t('table.coordinatorStatus', { status: tv(`status.${socketStatus.value}`, socketStatus.value) })
    : t('table.socket', {
        status:
          socketStatus.value === 'open'
            ? t('table.socketLive')
            : tv(`status.${socketStatus.value}`, socketStatus.value),
      }),
)

const solving = computed(() => table.value.solving)
const showSettings = ref(false)

/** Typed stats per seat name, as the felt marks them. */
const typedStats = computed(() =>
  Object.fromEntries(
    Object.entries(table.value.manual.stats).map(([name, entry]) => [name, entry.values]),
  ),
)

/**
 * The past decision on the felt instead of the live one, by history entry id —
 * or null for the live table.
 *
 * Reviewing only swaps what is DRAWN. Everything live carries on underneath —
 * the socket, the solves, the answer they land — so going back to live shows
 * whatever the table has done meanwhile, with nothing missed.
 */
const reviewId = ref(null)
/** That decision as the coordinator keeps it: the snapshot parsed, the answer, the ranges. */
const review = ref(null)
const showHistory = ref(false)
const reviewing = computed(() => !!review.value)

async function loadReview(id) {
  if (!id) {
    review.value = null
    return
  }
  let entry = null
  try {
    entry = await fetchEntry(props.index, id)
  } catch {
    entry = null
  }
  if (reviewId.value !== id) return
  review.value = entry
  // Trimmed or cleared since it was opened: there is nothing left to review.
  if (!entry) reviewId.value = null
}

watch(reviewId, loadReview)
// The history moved under the reviewed decision — read it again, so a trim or
// a clear ends the review instead of leaving a decision nobody keeps.
watch(
  () => table.value.history.rev,
  () => {
    if (reviewId.value) loadReview(reviewId.value)
  },
)

const shownHand = computed(() => (review.value ? review.value.hand : table.value.hand))
const shownResult = computed(() => (review.value ? review.value.result : table.value.result))
const shownRanges = computed(() => (review.value ? review.value.ranges : table.value.ranges))

/** The reviewed entry's neighbours, older and newer, for stepping through. */
const reviewStep = computed(() => ({
  older: review.value?.older || null,
  newer: review.value?.newer || null,
}))

const historyCount = computed(() => table.value.history.count)

/** 'Flop · 14:32:07' — which decision, and when it was answered. */
const reviewWhen = computed(() => {
  const e = review.value
  if (!e) return ''
  const street = e.street ? tv(`street.${e.street}`, e.street) : t('street.decision')
  const time = new Date(e.at).toLocaleString(locale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${street} · ${time}`
})

function openEntry(id) {
  reviewId.value = id
  showHistory.value = false
}

function backToLive() {
  reviewId.value = null
}

// Every gesture on the regime bar is about the live table, so it goes back to
// it — a regime picked while a past hand is on the felt would otherwise re-solve
// a spot you are not looking at.

function onSelectRegime(value) {
  backToLive()
  selectRegime(value, props.index)
}

function resolve() {
  backToLive()
  solveTable(props.index)
}

function pick(regime) {
  backToLive()
  pickRegime(props.index, regime)
}

async function command(token) {
  let ok = false
  try {
    ok = !!(await tableCommand(props.index, token))?.ok
  } catch {
    ok = false
  }
  notify(ok ? t('table.sent', { token }) : t('table.dropped'), { tone: ok ? 'ok' : 'bad' })
}

/**
 * The seat whose four HUD stats are being typed, or null — with what was typed
 * for it when the editor opened, which is what the coordinator compares against
 * when it closes.
 */
const editing = ref(null)

function editStats(seat) {
  // A past snapshot is read, not edited: what is typed goes into the LIVE body.
  if (reviewing.value) return
  editing.value = {
    name: seat.name,
    position: seat.position,
    before: { ...(table.value.manual.stats[seat.name]?.values || {}) },
  }
}

/**
 * Closing the editor is what re-solves — the same bargain the Advanced knobs
 * make: the question goes out once, under the numbers settled on, rather than
 * on every keystroke. Opened and closed untouched, it costs nothing.
 */
function closeStats() {
  const e = editing.value
  editing.value = null
  if (e) typedDone(props.index, 'stats', e.before, e.name)
}

/** The tournament header being typed, or null. */
const editingTourney = ref(null)

function editTournament() {
  if (reviewing.value) return
  editingTourney.value = { before: { ...(table.value.manual.tournament?.values || {}) } }
}

function closeTournament() {
  const e = editingTourney.value
  editingTourney.value = null
  if (e) typedDone(props.index, 'tournament', e.before)
}

// A different table is a different felt: nothing open on this one carries over.
// The subscription itself follows the index (useTable).
watch(
  () => props.index,
  () => {
    editing.value = null
    editingTourney.value = null
    reviewId.value = null
    showHistory.value = false
  },
)
</script>

<template>
  <div class="wrap">
    <AppNav
      :title="t('table.title', { index })"
      :subtitle="t('table.subtitle', { host: state.config.hostDisplay, api: state.config.apiDisplay })"
      :back="isNative ? null : { name: 'connect' }"
      wide
    >
      <StatusDot :status="socketStatus" :label="socketLabel" />
      <StatusDot
        :status="solving ? 'connecting' : table.result?.type === 'error' ? 'closed' : 'open'"
        :label="
          solving
            ? t('table.solverSolving')
            : table.result?.type === 'error'
              ? t('table.solverError')
              : t('table.solverReady')
        "
      />
      <button
        class="gear"
        :class="{ on: reviewing }"
        :title="t('table.historyTitle', { count: historyCount })"
        :aria-label="t('table.history')"
        @click="showHistory = true"
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <path
            d="M3.2 10a6.8 6.8 0 1 0 2-4.8M3.2 3.6v3.2h3.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M10 6.2V10l2.6 1.7"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
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

    <!-- Two columns: the felt on the left, everything that reads it on the
         right. The right column scrolls on its own so the table never leaves
         the screen while you read the answer. -->
    <div class="page">
      <div class="felt-col">
        <div v-if="socketStatus !== 'open'" class="offline card">
          <div class="spinner" />
          <div v-if="!link.ready">
            <strong>{{ t('table.connectingCoordinator', { address: coordinatorInput }) }}</strong>
            <p class="muted">{{ t('table.connectingCoordinatorNote') }}</p>
          </div>
          <div v-else>
            <strong>{{ t('table.connecting', { host: state.config.hostDisplay }) }}</strong>
            <p class="muted">{{ t('table.connectingNote') }}</p>
          </div>
        </div>

        <!-- No swap transition and no :key here on purpose: the felt updates in
             place on every snapshot, and an out-in transition stalls whenever the
             tab is backgrounded (rAF throttling), which would strand the table. -->
        <div v-if="reviewing" class="review card">
          <div class="rtext">
            <strong>{{ t('history.reviewing') }}</strong>
            <span class="muted tnum">{{ reviewWhen }}</span>
          </div>
          <span v-if="solving" class="live">
            <span class="dot" />{{ t('history.liveSolving') }}
          </span>
          <div class="rnav">
            <button
              class="btn btn-sm"
              :disabled="!reviewStep.older"
              :title="t('history.older')"
              :aria-label="t('history.older')"
              @click="reviewId = reviewStep.older"
            >
              ‹
            </button>
            <button
              class="btn btn-sm"
              :disabled="!reviewStep.newer"
              :title="t('history.newer')"
              :aria-label="t('history.newer')"
              @click="reviewId = reviewStep.newer"
            >
              ›
            </button>
            <button class="btn btn-sm btn-primary" @click="backToLive">
              {{ t('history.backToLive') }}
            </button>
          </div>
        </div>

        <PokerTable
          v-if="shownHand"
          :hand="shownHand"
          :typed-stats="typedStats"
          :typed-tournament="table.manual.tournament?.values || {}"
          editable
          @edit-stats="editStats"
          @edit-tournament="editTournament"
        />
        <div v-else class="empty card">
          <p><strong>{{ t('table.noSnapshot') }}</strong></p>
          <!-- v-html: the <kbd> is the message file's own. -->
          <p class="muted" v-html="t('table.noSnapshotNote')" />
        </div>
      </div>

      <aside class="side">
        <RegimeBar
          :disabled="socketStatus !== 'open'"
          :selected="state.regime.selected"
          :exploit="table.exploit"
          :stat-names="table.villainStats"
          :drew="table.drew"
          :preflop-drew="table.pfDrew"
          :solving="solving"
          :can-solve="table.canSolve"
          @select="onSelectRegime"
          @command="command"
          @resolve="resolve"
          @settings="showSettings = true"
        />

        <RegimePrompt
          v-if="table.pending"
          :hand="table.pending.hand"
          :street="table.pending.street"
          @pick="pick"
        />

        <SolverPanel
          :result="shownResult"
          :pending="!reviewing && solving"
          :started-at="reviewing ? null : table.startedAt"
          :regime="state.regime.selected"
          :ranges="shownRanges"
        />
      </aside>
    </div>

    <MessageDock :messages="table.feed" :title="t('table.hostMessages')" @clear="clearFeed(index)" />

    <SettingsSheet v-if="showSettings" @close="showSettings = false" />

    <HistorySheet
      v-if="showHistory"
      :table-index="index"
      :current="reviewId"
      :rev="table.history.rev"
      @open="openEntry"
      @close="showHistory = false"
    />

    <SeatStatsSheet
      v-if="editing"
      :table-index="index"
      :name="editing.name"
      :position="editing.position"
      :hud="table.host.stats[editing.name] || {}"
      :typed="table.manual.stats[editing.name]?.values || {}"
      :lines="table.manual.stats[editing.name]?.lines || []"
      @close="closeStats"
    />

    <TournamentSheet
      v-if="editingTourney"
      :table-index="index"
      :host="table.host.tournament"
      :typed="table.manual.tournament?.values || {}"
      :phrases="table.manual.tournament?.phrases || []"
      @close="closeTournament"
    />
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

.gear.on {
  background: var(--blue);
  color: #fff;
}

/* Above the felt while a past decision is on it, so there is no mistaking it
   for the live table. */
.review {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px 10px 16px;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--blue) 55%, transparent), var(--shadow-1);
}

.rtext {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.rtext .muted {
  font-size: 13px;
}

.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--label-2);
  font-size: 12.5px;
}

.live .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--orange);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

.rnav {
  display: flex;
  gap: 6px;
  margin-left: auto;
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

/* :deep, because the <kbd> arrives through v-html on the empty-state note. */
.empty :deep(kbd) {
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
