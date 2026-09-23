<script setup>
/**
 * The table's past hands: a list of them, and each one opened in full.
 *
 * A hand opened here is the whole record rather than a summary of it: who sat
 * where with what stack and what HUD, the action street by street — through to
 * the end when the host sent the snapshot it ended on — every decision's answer
 * exactly as the panel showed it, and the ranges the hand was solved on.
 *
 * The coordinator keeps the history, so it is read from there: the list light,
 * and a hand in full only once it is opened. `rev` moves whenever the table's
 * history does (an answer filed, a hand ended, a trim, a clear), and both are
 * read again.
 *
 * The pieces are the live ones (HandDetails, SolverPanel, RangesView), so a
 * past hand reads the way the table did while it was being played. Any decision
 * can also go back on the felt itself (`open`), which is the table view's job.
 */
import { computed, nextTick, ref, watch } from 'vue'
import InfoSheet from './InfoSheet.vue'
import PlayingCard from './PlayingCard.vue'
import HandDetails from './HandDetails.vue'
import SolverPanel from './SolverPanel.vue'
import RangesView from './RangesView.vue'
import { fetchHistory, fetchHand, clearHistory } from '../lib/coordinator'
import { ACTION_TONE, actionKind } from '../lib/answerFormat'
import { REGIME_BY_VALUE } from '../lib/regime'
import { locale, t, tp, tv } from '../lib/i18n'

const props = defineProps({
  tableIndex: { type: Number, required: true },
  /** The decision the felt is showing, if it is showing one. */
  current: { type: String, default: null },
  /** The table's history revision — a change is the cue to read it again. */
  rev: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'open'])

/** Every hand, light — what the list draws. Null until the first read lands. */
const list = ref(null)
const hands = computed(() => list.value?.hands || [])
const decisions = computed(() => list.value?.decisions || 0)

// --- which hand is open -----------------------------------------------------

/** The hand opened in full, by key — null for the list. */
const openKey = ref(null)
/** The decision to bring into view once the hand is drawn. */
const focusId = ref(null)
/** The open hand: its record parsed, every answer, and the ranges behind each. */
const hand = ref(null)

async function loadList() {
  try {
    list.value = await fetchHistory(props.tableIndex)
  } catch {
    list.value = list.value || { hands: [], decisions: 0 }
  }
}

async function loadHand() {
  const key = openKey.value
  if (!key) {
    hand.value = null
    return
  }
  let full = null
  try {
    full = await fetchHand(props.tableIndex, key)
  } catch {
    full = null
  }
  if (openKey.value !== key) return
  // A hand cleared or trimmed away under the open view goes back to the list.
  if (!full) openKey.value = null
  hand.value = full
}

// Opened while a past decision is on the felt: start on that decision's hand,
// which is the one the operator is reading.
loadList().then(() => {
  if (!props.current || openKey.value) return
  const h = hands.value.find((x) => x.entries.some((e) => e.id === props.current))
  if (h) openHand(h.key, props.current)
})

watch(openKey, loadHand)
watch(
  () => props.rev,
  () => {
    loadList()
    loadHand()
  },
)

function openHand(key, entryId = null) {
  openKey.value = key
  focusId.value = entryId
}

watch(
  [hand, focusId],
  async ([h, id]) => {
    if (!h || !id) return
    await nextTick()
    document.getElementById(`dec-${id}`)?.scrollIntoView({ block: 'start' })
  },
  { immediate: true },
)

/**
 * The fullest snapshot of the open hand — how it ended when the host said, the
 * last decision asked otherwise — already parsed, for HandDetails.
 */
const record = computed(() => hand.value?.record || null)

const heroPosition = computed(() => record.value?.hero?.position || null)

/** Every street the hand has ranges for, as of its last decision. */
const handRanges = computed(() => hand.value?.ranges || [])

// --- formatting -------------------------------------------------------------

/** A time today, or a date and time for anything older. */
function when(at) {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  const opts = today
    ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  return d.toLocaleString(locale.value, opts)
}

const streetLabel = (s) => (s ? tv(`street.${s}`, s) : t('street.decision'))

const fmt = (n, d = 1) =>
  n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString()

/** What the row says was played — the answer's pick, or that it was refused. */
function played(e) {
  if (e.result.type !== 'answer') return { text: t('history.rejected'), tone: 'var(--red)' }
  const a = e.result.sampled
  if (!a) return { text: '—', tone: 'var(--label-3)' }
  return { text: a.action, tone: ACTION_TONE[actionKind(a.action)] || ACTION_TONE.other }
}

function regimeLabel(e) {
  const r = e.result.type === 'answer' ? e.result.regime : e.result.request?.regime
  return r && REGIME_BY_VALUE[r] ? t(`regime.${r}.title`) : r || ''
}

/** How far the hand is known: to its end, or to the last street asked about. */
function reach(h) {
  return h.final
    ? t('history.finished')
    : t('history.lastSeen', { street: streetLabel(h.last.street).toLowerCase() })
}

// --- clearing ---------------------------------------------------------------

/** Two clicks, so a stray one does not take the whole table's history. */
const confirming = ref(false)
function clear() {
  if (!confirming.value) {
    confirming.value = true
    return
  }
  confirming.value = false
  clearHistory(props.tableIndex)
}
</script>

<template>
  <!-- One hand, in full ------------------------------------------------------>
  <InfoSheet
    v-if="hand"
    wide
    :title="t('history.handTitle', { index: tableIndex })"
    :subtitle="`${when(hand.entries[0].at)} · ${reach(hand)}`"
    @close="emit('close')"
  >
    <button class="back linky" @click="openKey = null">‹ {{ t('history.allHands') }}</button>

    <div class="summary">
      <div v-if="hand.heroHand" class="cards">
        <PlayingCard v-for="c in hand.heroHand" :key="c" :card="c" />
      </div>
      <div class="facts">
        <div v-if="heroPosition" class="stat">
          <span class="sl">{{ t('details.position') }}</span>
          <span class="sv">{{ heroPosition }}</span>
        </div>
        <div class="stat">
          <span class="sl">{{ t('details.totalPot') }}</span>
          <span class="sv">{{ fmt(hand.last.pot, 2) }} BB</span>
        </div>
        <div class="stat">
          <span class="sl">{{ t('history.decisionsLabel') }}</span>
          <span class="sv">{{ hand.entries.length }}</span>
        </div>
        <span class="chip" :class="{ done: hand.final }">{{ reach(hand) }}</span>
      </div>
      <div v-if="hand.last.board.length" class="cards board">
        <PlayingCard v-for="c in hand.last.board" :key="c" :card="c" size="sm" />
      </div>
    </div>

    <h4>{{ t('history.handSection') }}</h4>
    <HandDetails v-if="record" :hand="record" />
    <p v-else class="gone">{{ t('history.unreadable') }}</p>

    <h4>{{ t('history.decisionsSection') }}</h4>
    <div v-for="e in hand.entries" :id="`dec-${e.id}`" :key="e.id" class="decision">
      <div class="dhead">
        <span class="st">{{ streetLabel(e.street) }}</span>
        <span class="time tnum">{{ when(e.at) }}</span>
        <span v-if="e.id === current" class="chip onfelt">{{ t('history.onFelt') }}</span>
        <button v-else class="btn btn-sm" @click="emit('open', e.id)">
          {{ t('history.showOnFelt') }}
        </button>
      </div>
      <SolverPanel
        :result="e.result"
        :regime="e.result.request?.regime || 'gto'"
        :ranges="e.ranges"
      />
    </div>

    <h4>{{ t('history.rangesSection') }}</h4>
    <RangesView v-if="handRanges.length" :streets="handRanges" />
    <p v-else class="gone">{{ t('history.noRanges') }}</p>
  </InfoSheet>

  <!-- Every hand ------------------------------------------------------------->
  <InfoSheet
    v-else
    :title="t('history.title')"
    :subtitle="
      decisions
        ? t('history.subtitle', {
            index: tableIndex,
            hands: tp('history.hands', hands.length),
            decisions: tp('history.decisions', decisions),
          })
        : t('table.title', { index: tableIndex })
    "
    @close="emit('close')"
  >
    <p v-if="list && !hands.length" class="gone">{{ t('history.empty') }}</p>

    <section v-for="h in hands" :key="h.key" class="hand">
      <button class="hhead" :title="t('history.openHand')" @click="openHand(h.key)">
        <span v-if="h.heroHand" class="hcards">
          <PlayingCard v-for="c in h.heroHand" :key="c" :card="c" size="sm" />
        </span>
        <span class="htime tnum">{{ when(h.entries[0].at) }}</span>
        <span class="chip" :class="{ done: h.final }">{{ reach(h) }}</span>
        <span class="more">{{ t('history.openHand') }} ›</span>
      </button>

      <button
        v-for="e in h.entries"
        :key="e.id"
        class="dec"
        :class="{ on: e.id === current }"
        @click="openHand(h.key, e.id)"
      >
        <span class="st">{{ streetLabel(e.street) }}</span>
        <span class="board mono">{{ e.board.join(' ') }}</span>
        <span class="play" :style="{ '--tone': played(e).tone }">{{ played(e).text }}</span>
        <span class="chip">{{ regimeLabel(e) }}</span>
        <span class="time tnum">{{ when(e.at) }}</span>
      </button>
    </section>

    <footer v-if="hands.length" class="foot">
      <p class="note">{{ t('history.note') }}</p>
      <button class="btn btn-sm btn-danger" @click="clear" @blur="confirming = false">
        {{ confirming ? t('history.clearConfirm') : t('history.clear') }}
      </button>
    </footer>
  </InfoSheet>
</template>

<style scoped>
/* --- the list ---------------------------------------------------------- */

.hand {
  padding: 10px 0;
  border-top: 1px solid var(--separator);
}

.hand:first-of-type {
  border-top: none;
  padding-top: 0;
}

.hhead {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--r-md);
  background: none;
  color: var(--label);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}

.hhead:hover {
  background: var(--fill);
}

.hcards {
  display: flex;
  gap: 3px;
}

.htime {
  color: var(--label-2);
  font-size: 12.5px;
  font-weight: 600;
}

.more {
  margin-left: auto;
  color: var(--blue);
  font-size: 12.5px;
  font-weight: 600;
}

.dec {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--r-md);
  background: none;
  color: var(--label);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}

.dec:hover {
  background: var(--fill);
}

.dec.on {
  background: color-mix(in srgb, var(--blue) 14%, transparent);
}

.st {
  font-weight: 650;
}

.board {
  color: var(--label-2);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play {
  font-weight: 650;
  color: color-mix(in srgb, var(--tone) 80%, var(--label));
  white-space: nowrap;
}

.time {
  color: var(--label-3);
  font-size: 11.5px;
  text-align: right;
  white-space: nowrap;
}

.chip.done {
  background: color-mix(in srgb, var(--green) 16%, transparent);
  color: color-mix(in srgb, var(--green) 78%, var(--label));
}

.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--separator);
}

.note {
  flex: 1;
  margin: 0;
  color: var(--label-3);
  font-size: 11.5px;
  line-height: 1.5;
}

.gone {
  margin: 12px 0;
  color: var(--label-2);
  font-size: 13.5px;
  line-height: 1.5;
}

/* --- one hand ---------------------------------------------------------- */

.back {
  margin-bottom: 12px;
}

.linky {
  padding: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.summary {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.cards {
  display: flex;
  gap: 4px;
}

.cards.board {
  margin-left: auto;
  gap: 3px;
}

.facts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 6px 11px;
  border-radius: var(--r-md);
  background: var(--fill);
  font-size: 12.5px;
}

.sl {
  color: var(--label-2);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.sv {
  font-weight: 660;
  font-variant-numeric: tabular-nums;
}

h4 {
  margin: 22px 0 10px;
  font-size: 15px;
}

.decision + .decision {
  margin-top: 14px;
}

.dhead {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.dhead .btn,
.dhead .onfelt {
  margin-left: auto;
}

.onfelt {
  background: color-mix(in srgb, var(--blue) 14%, transparent);
  color: var(--blue);
}
</style>
