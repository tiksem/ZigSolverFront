<script setup>
/**
 * The answer, compactly: what to play, the numbers behind it, and one line on
 * the regime that produced it. Everything else — the solve's own account of
 * itself, the warnings, the raw payload — is a click away rather than on screen.
 *
 * ONE column, because the endpoint answers one question per call. Which one it
 * answered decides what the numbers mean: a GTO answer is a distribution to mix
 * at, an exploit answer is a ranking by EV whose top row IS the move.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import PlayingCard from './PlayingCard.vue'
import HelpButton from './HelpButton.vue'
import InfoSheet from './InfoSheet.vue'
import { describeSolver, describeFlow, decisionLabel } from '../lib/solvers'
import { REGIME_BY_VALUE } from '../lib/regime'
import { ACTION_TONE, pct } from '../lib/moveResult'
import { t, tp, tv, tk } from '../lib/i18n'

const props = defineProps({
  result: { type: Object, default: null },
  pending: { type: Boolean, default: false },
  /** `performance.now()` when the solve in flight went out, or null. */
  startedAt: { type: Number, default: null },
  /** The regime currently selected: 'gto' | 'exploit' | 'manual'. */
  regime: { type: String, default: 'gto' },
})

const solverHelp = ref(false)
// Both of these open a sheet OVER the answer, and neither is persisted: a modal
// restored open on load covers a panel that has no result behind it yet.
const details = ref(false)

const solver = computed(() => describeSolver(props.result?.solver))
const meta = computed(() => props.result?.meta || {})
const answer = computed(() => (props.result?.type === 'answer' ? props.result : null))

/**
 * The stopwatch, running while a solve is out.
 *
 * An interval rather than a rAF loop: the digit that moves is a tenth of a
 * second, and rAF stops dead in a backgrounded tab — which is exactly where a
 * long solve is watched from — while an interval keeps counting (throttled).
 */
const ticking = ref(0)
let ticker = null

function stopTicker() {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

watch(
  () => props.startedAt,
  (at) => {
    stopTicker()
    if (at == null) return
    ticking.value = 0
    ticker = setInterval(() => {
      ticking.value = (performance.now() - at) / 1000
    }, 100)
  },
  { immediate: true },
)

onBeforeUnmount(stopTicker)

/**
 * The same clock, stopped: what the browser waited for THIS answer.
 *
 * Worth having next to the endpoint's own `responseTime` — that one is measured
 * inside the API and knows nothing about the queue, the transport or the
 * coalescing in front of it, so a gap between the two is where the wait went.
 */
const measured = computed(() =>
  typeof props.result?.clientSeconds === 'number' ? props.result.clientSeconds : null,
)

/** Measured minus what the API charged itself — everything that is not solving. */
const overhead = computed(() => {
  const reported = Number(props.result?.responseTime)
  if (measured.value === null || !Number.isFinite(reported)) return null
  return measured.value - reported
})

/** The regime that ACTUALLY ran, which is what the numbers below mean. */
const served = computed(() => {
  const value = answer.value?.regime || 'gto'
  return REGIME_BY_VALUE[value] ? t(`regime.${value}.title`) : value
})
const isExploit = computed(() => answer.value?.regime === 'exploit')

/**
 * The endpoint declined the question and answered the other one — preflop, a
 * multiway pot, a two-handed table, or a box without the models. The reason is
 * in the warnings; this is the sentence that sends you there.
 */
const fellBack = computed(() => !!answer.value?.fellBack)

const heroCards = computed(() => {
  const h = props.result?.hand
  if (!h || typeof h !== 'string' || h.length < 4) return []
  return [h.slice(0, 2), h.slice(2, 4)]
})

/** What was asked for, in the picker's own words. */
const askedLabel = computed(() => {
  const asked = answer.value?.regimeRequested || props.result?.request?.regime || props.regime
  return REGIME_BY_VALUE[asked] ? t(`regime.${asked}.title`) : asked
})

/** The header's street word — 'decision' when the answer carries no street. */
const streetLabel = computed(() => {
  const s = props.result?.street
  if (!s) return t('street.decision')
  return tv(`street.${s}`, String(s).replace(/^./, (c) => c.toUpperCase()))
})

/** One row per action. The columns differ by regime; the shape does not. */
const rows = computed(() => {
  const a = answer.value
  if (!a) return []
  return a.actions.map((x) => ({
    action: x.action,
    color: ACTION_TONE[x.kind] || ACTION_TONE.other,
    probability: x.probability,
    evBB: x.evBB,
    evPot: x.evPot,
    support: x.support,
    decision: meta.value.handDecisions?.[x.action] || null,
  }))
})

/**
 * The EV given up by NOT taking the best action, per row — the number that says
 * whether the recommendation is a real edge or an indifference point.
 */
const bestEv = computed(() => {
  const evs = rows.value.map((r) => r.evBB).filter((v) => v != null)
  return evs.length ? Math.max(...evs) : null
})

/** Below this the size models are extrapolating (flopml.exploit.Guard). */
const THIN_SUPPORT = 0.02
const thinBest = computed(() => {
  const top = rows.value[0]
  return isExploit.value && top && top.support != null && top.support < THIN_SUPPORT
})

const num = (v, d = 2) =>
  v == null || Number.isNaN(Number(v)) ? null : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString()

const seatsLabel = computed(() => {
  const s = meta.value.seats
  if (!s) return null
  if (Array.isArray(s)) return s.join('  ·  ')
  return Object.entries(s)
    .map(([k, v]) => `${k.toUpperCase()} ${v}`)
    .join('  ·  ')
})

/**
 * The full account of the solve — behind the Details button.
 *
 * The LABELS are translated; the values are left exactly as the API reported
 * them. This is a diagnostic dump read next to the endpoint's own logs, and a
 * translated `flow` or `solver` name would not be greppable against either.
 */
const facts = computed(() => {
  const m = meta.value
  const out = []
  const push = (key, value) => {
    if (value !== null && value !== undefined && value !== '') {
      out.push({ key, label: t(`facts.${key}`), value })
    }
  }
  push('regime', props.result?.regime)
  push('requested', answer.value?.regimeRequested)
  push('solver', props.result?.solver)
  push('flow', m.flow)
  push('street', props.result?.street)
  push('hand', props.result?.hand)
  push('pot', m.potBB != null ? `${num(m.potBB)} BB` : null)
  push('toCall', m.toCallBB != null ? `${num(m.toCallBB)} BB` : null)
  push('seats', seatsLabel.value)
  push('actingSeat', m.actingSeat != null ? String(m.actingSeat) : null)
  push('board', Array.isArray(m.board) ? m.board.join(' ') : m.board)
  push('solveTime', m.solveSeconds != null ? `${num(m.solveSeconds, 3)} s` : null)
  push('predicted', m.predictedSolveSeconds != null ? `${num(m.predictedSolveSeconds, 3)} s` : null)
  push('responseTime', props.result?.responseTime != null ? `${props.result.responseTime} s` : null)
  push('measured', measured.value != null ? `${num(measured.value, 3)} s` : null)
  push('overhead', overhead.value != null ? `${num(overhead.value, 3)} s` : null)
  push('cached', m.cached === null || m.cached === undefined ? null : String(m.cached))
  push('rootedAt', m.rootedAt)
  push('entryRanges', m.entrySource)
  push('players', m.players)
  push('iterations', m.iterations != null ? Number(m.iterations).toLocaleString() : null)
  push('infosets', m.infosets != null ? Number(m.infosets).toLocaleString() : null)
  push('itersPerInfoset', m.itersPerInfoset)
  push('depthLimit', m.depthLimit)
  push(
    'thinnedFrom',
    m.thinnedFrom
      ? t('facts.thinnedValue', {
          n: m.thinnedFrom,
          street: tv(`street.${m.thinnedAt}`, m.thinnedAt),
        })
      : null,
  )
  push('narrowedOn', m.narrowRegime)
  push('narrowTime', m.narrowSeconds != null ? `${num(m.narrowSeconds, 3)} s` : null)
  // Exploit-only: how the search was shaped, and what it was reading.
  push('runouts', m.chance ? JSON.stringify(m.chance) : null)
  push('leaf', m.leaf)
  push('cardRemoval', m.removal)
  push('betMenu', Array.isArray(m.menuBets) ? m.menuBets.join(' / ') + '%' : null)
  push('raiseMenu', Array.isArray(m.menuRaises) ? m.menuRaises.join(' / ') + '%' : null)
  push('nodes', m.nodes != null ? Number(m.nodes).toLocaleString() : null)
  push('modelCalls', m.predicts)
  push('villainStats', Array.isArray(m.villainStats) ? m.villainStats.join(', ') : null)
  push('overHands', m.villainStatHands != null ? Number(m.villainStatHands).toLocaleString() : null)
  push('handClass', m.handClass)
  push('effectiveStack', m.effectiveBB != null ? `${num(m.effectiveBB)} BB` : null)
  push('raisesBefore', m.raisesBefore)
  push('callersBefore', m.callersBefore)
  push('aggressor', m.aggressor)
  push('node', m.node)
  push(
    'budgetSent',
    props.result?.request?.maxSolveTime ? `${props.result.request.maxSolveTime} s` : null,
  )
  push('handId', props.result?.request?.handId)
  return out
})

const warnings = computed(() => props.result?.warnings || [])
const tone = (a) => (a ? ACTION_TONE[a.kind] || ACTION_TONE.other : 'var(--label-3)')

/**
 * An error's message and hint. Either may be a string the endpoint sent, which
 * is shown verbatim, or one of our own `{ key, params }` pairs, which is worded
 * here so it follows the language rather than the moment it failed.
 */
const say = (v) => (typeof v === 'string' ? v : tk(v))
const errorMessage = computed(() => say(props.result?.message))
const errorHint = computed(() => say(props.result?.hint))
</script>

<template>
  <div class="panel card">
    <!-- header ------------------------------------------------------------ -->
    <header class="head">
      <div class="crumbs">
        <span class="street">
          {{
            result?.type === 'answer'
              ? streetLabel
              : result?.type === 'error'
                ? t('panel.rejected')
                : t('panel.waiting')
          }}
        </span>
        <template v-if="answer">
          <span class="sep">·</span>
          <span class="chip read" :class="{ exploit: isExploit, fell: fellBack }">
            {{ served }}<i v-if="fellBack">{{ t('panel.asked', { regime: askedLabel }) }}</i>
          </span>
          <button class="badge" :class="solver.tone" @click="solverHelp = true">
            {{ solver.title }}
          </button>
          <HelpButton :size="16" :label="t('panel.howSolved')" @click="solverHelp = true" />
        </template>

        <!-- The wait, measured here: ticking while the answer is out, then
             frozen next to the seconds the API charged itself. -->
        <span v-if="measured != null && !pending" class="secs mono" :title="t('panel.timingTitle')">
          {{ t('panel.wallShort') }} {{ measured.toFixed(2) }}s<i v-if="result.responseTime != null">
            · {{ t('panel.apiShort') }} {{ result.responseTime }}s</i>
        </span>
      </div>

      <div class="right">
        <span v-if="pending" class="busy">
          <span class="spinner" />{{ t('panel.solving') }}
          <span v-if="startedAt != null" class="mono clock">{{ ticking.toFixed(1) }}s</span>
        </span>
        <button v-if="answer" class="btn btn-sm" @click="details = true">
          {{ t('common.details') }}
        </button>
        <div v-if="heroCards.length" class="hcards">
          <PlayingCard v-for="c in heroCards" :key="c" :card="c" size="sm" />
        </div>
      </div>
    </header>

    <template v-if="answer">
      <!-- what to play -------------------------------------------------- -->
      <div class="picks">
        <div class="pick" :style="{ '--tone': tone(answer.sampled) }">
          <span class="plabel">{{ isExploit ? t('panel.playMaxEv') : t('panel.playGto') }}</span>
          <span class="pval">{{ answer.sampled?.action || '—' }}</span>
        </div>
      </div>

      <!-- the numbers ----------------------------------------------------- -->
      <table class="freq">
        <thead>
          <tr>
            <th class="a">{{ t('panel.colAction') }}</th>
            <template v-if="isExploit">
              <th class="n">{{ t('panel.colEv') }}</th>
              <th class="n">{{ t('panel.colPctPot') }}</th>
              <th class="n d">{{ t('panel.colSupport') }}</th>
            </template>
            <th v-else class="n">{{ t('panel.colFrequency') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in rows"
            :key="r.action"
            :class="{ dead: !isExploit && r.probability < 0.0005, top: isExploit && i === 0 }"
          >
            <td class="a">
              <span class="swatch" :style="{ background: r.color }" />
              <span class="akey">{{ r.action }}</span>
              <span v-if="r.decision" class="dec">{{ decisionLabel(r.decision) }}</span>
            </td>
            <template v-if="isExploit">
              <td class="n tnum strong">{{ num(r.evBB, 2) }}</td>
              <td class="n tnum muted">
                {{ r.evPot == null ? '' : `${(r.evPot * 100).toFixed(0)}%` }}
              </td>
              <td class="n d tnum" :class="{ thin: r.support != null && r.support < 0.02 }">
                {{ r.support == null ? '' : `${(r.support * 100).toFixed(1)}%` }}
              </td>
            </template>
            <td v-else class="n tnum strong">{{ pct(r.probability) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- the regime, in one line ----------------------------------------- -->
      <div class="readline">
        <strong>{{ served }}</strong>
        <span class="blurb">
          {{
            isExploit
              ? t('panel.blurbExploit')
              : result.street === 'preflop'
                ? t('panel.blurbPreflop')
                : t('panel.blurbGto')
          }}
        </span>
      </div>

      <p v-if="fellBack" class="fellback">
        <!-- v-html: the <b> is the message file's own, and the file is ours. -->
        <span v-html="t('panel.fellBack', { regime: askedLabel })" />
        <button class="linky" @click="details = true">{{ t('panel.why') }}</button>
      </p>

      <p v-if="thinBest" class="fellback">{{ t('panel.thinSupport') }}</p>

      <p v-if="warnings.length" class="warncount">
        {{ tp('panel.warningCount', warnings.length) }}
        <button class="linky" @click="details = true">{{ t('panel.seeDetails') }}</button>
      </p>
    </template>

    <template v-else-if="result?.type === 'error'">
      <div class="error">
        <p class="emsg">{{ errorMessage }}</p>
        <p v-if="errorHint" class="ehint">{{ errorHint }}</p>
      </div>
    </template>

    <div v-else class="idlebox">
      <div v-if="pending" class="spinner" />
      <span class="muted">
        {{ pending ? t('panel.solvingEllipsis') : t('panel.idle') }}
      </span>
      <span v-if="pending && startedAt != null" class="mono clock">
        {{ ticking.toFixed(1) }}s
      </span>
    </div>

    <!-- sheets --------------------------------------------------------- -->
    <InfoSheet
      v-if="solverHelp"
      :title="solver.title"
      :subtitle="t('panel.solverSubtitle', { name: solver.name })"
      @close="solverHelp = false"
    >
      <p class="para"><strong>{{ solver.summary }}</strong></p>
      <p class="para pre">{{ solver.detail }}</p>
      <template v-if="meta.flow">
        <h4>{{ t('panel.flowHeading', { flow: meta.flow }) }}</h4>
        <p class="para">{{ describeFlow(meta.flow) }}</p>
      </template>
      <h4>{{ t('panel.numbersHeading') }}</h4>
      <!-- v-html: the <b> markup belongs to the message files. -->
      <p class="para" v-html="t('panel.numbersMix')" />
      <p class="para" v-html="t('panel.numbersEv')" />
    </InfoSheet>

    <InfoSheet
      v-if="details"
      :title="t('panel.detailsTitle')"
      :subtitle="`${result?.solver || ''}`"
      @close="details = false"
    >
      <div class="grid">
        <div v-for="f in facts" :key="f.key" class="fact">
          <span class="fl">{{ f.label }}</span>
          <span class="fv">{{ f.value }}</span>
        </div>
      </div>

      <template v-if="warnings.length">
        <h4>{{ t('common.warningsHeading') }}</h4>
        <ul class="warnings">
          <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
        </ul>
      </template>

      <h4>{{ t('common.rawHeading') }}</h4>
      <pre class="raw mono">{{ JSON.stringify(result?.payload, null, 2) }}</pre>
    </InfoSheet>
  </div>
</template>

<style scoped>
.panel {
  padding: 12px 14px 14px;
}

/* --- header --------------------------------------------------------- */

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}

.street {
  font-size: 16px;
  font-weight: 680;
  letter-spacing: -0.02em;
}

.sep {
  color: var(--label-3);
}

.chip.read {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 9px;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label);
  font-size: 12px;
  font-weight: 620;
}

.chip.read i {
  font-style: normal;
  color: var(--label-2);
  font-weight: 550;
}

/* The regime that actually ran, in the colour the picker uses for it. */
.chip.read.exploit {
  background: color-mix(in srgb, var(--orange) 18%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

.chip.read.fell {
  background: color-mix(in srgb, var(--orange) 18%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

.badge {
  padding: 2px 9px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.badge.good {
  background: color-mix(in srgb, var(--green) 18%, transparent);
  color: color-mix(in srgb, var(--green) 76%, var(--label));
}

.badge.ok {
  background: color-mix(in srgb, var(--blue) 16%, transparent);
  color: var(--blue);
}

.badge.weak {
  background: color-mix(in srgb, var(--orange) 20%, transparent);
  color: color-mix(in srgb, var(--orange) 82%, var(--label));
}

.secs {
  color: var(--label-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

/* The API's own number, second: ours is the one being reported. */
.secs i {
  font-style: normal;
  color: var(--label-3);
}

/* Tabular figures, or the seconds shift the label every tenth of a second. */
.clock {
  color: var(--blue);
  font-size: 11.5px;
  font-weight: 640;
  font-variant-numeric: tabular-nums;
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.busy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--blue);
  font-size: 11.5px;
  font-weight: 620;
}

.hcards {
  display: flex;
  gap: 3px;
}

/* --- picks ---------------------------------------------------------- */

.picks {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 11px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--tone) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone) 32%, transparent);
}

.plabel {
  color: var(--label-2);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.pval {
  flex: 1;
  min-width: 0;
  font-family: var(--font-rounded);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- numbers -------------------------------------------------------- */

.freq {
  width: 100%;
  margin-top: 10px;
  border-collapse: collapse;
  font-size: 13px;
}

.freq th {
  padding: 2px 6px 5px;
  color: var(--label-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--separator);
}

.freq th.a,
.freq td.a {
  text-align: left;
}

.freq th.n,
.freq td.n {
  text-align: right;
  width: 66px;
}

.freq th.d,
.freq td.d {
  width: 62px;
}

.freq td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--separator);
}

.freq tr:last-child td {
  border-bottom: none;
}

tr.dead {
  opacity: 0.42;
}

td.a {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.swatch {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 2px;
  transform: translateY(-1px);
}

.akey {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dec {
  color: var(--label-3);
  font-size: 10.5px;
  white-space: nowrap;
}

td.n {
  font-variant-numeric: tabular-nums;
}

td.n.strong {
  font-weight: 700;
}

td.n.muted {
  color: var(--label-2);
}

/* The recommendation, in a ranking where only the first row is the answer. */
tr.top td {
  background: color-mix(in srgb, var(--orange) 9%, transparent);
}

td.n.thin {
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

/* --- read line ------------------------------------------------------ */

.readline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--separator);
  font-size: 12.5px;
  line-height: 1.45;
}

.readline strong {
  font-weight: 660;
  white-space: nowrap;
}

.blurb {
  flex: 1;
  min-width: 0;
  color: var(--label-2);
}

.fellback {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--orange) 12%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
  font-size: 12.5px;
  line-height: 1.45;
}

.fellback strong {
  font-weight: 660;
}

.warncount {
  margin: 8px 0 0;
  color: color-mix(in srgb, var(--orange) 84%, var(--label));
  font-size: 12px;
}

.linky {
  padding: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

/* --- states --------------------------------------------------------- */

.error {
  margin-top: 10px;
  padding: 11px 13px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--red) 12%, transparent);
}

.emsg {
  margin: 0;
  color: color-mix(in srgb, var(--red) 88%, var(--label));
  font-size: 13.5px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ehint {
  margin: 7px 0 0;
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.idlebox {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
  font-size: 13px;
}

.spinner {
  width: 14px;
  height: 14px;
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

/* --- sheets --------------------------------------------------------- */

h4 {
  margin: 18px 0 6px;
  font-size: 13px;
  font-weight: 680;
}

.para {
  margin: 0 0 8px;
  color: var(--label-2);
  font-size: 14px;
  line-height: 1.5;
}

.para.pre {
  white-space: pre-line;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 1px;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--separator);
}

.fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 11px;
  background: var(--bg-elevated);
  font-size: 12.5px;
}

.fl {
  color: var(--label-2);
  white-space: nowrap;
}

.fv {
  font-weight: 620;
  text-align: right;
  overflow-wrap: anywhere;
}

.sig {
  border-radius: var(--r-md);
  background: var(--fill);
  overflow: hidden;
}

.sigrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  font-size: 13px;
}

.sigrow + .sigrow {
  border-top: 1px solid var(--separator);
}

.sk {
  color: var(--label-2);
}

.sv {
  font-weight: 640;
}

.warnings {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--orange) 12%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
  font-size: 12.5px;
  line-height: 1.5;
}

.warnings li + li {
  margin-top: 6px;
}

.raw {
  margin: 0;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  border-radius: var(--r-md);
  background: var(--fill);
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 620px) {
  .picks {
    flex-direction: column;
  }

  .dec {
    display: none;
  }
}
</style>
