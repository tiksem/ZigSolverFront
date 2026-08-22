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
import { ref, computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import HelpButton from './HelpButton.vue'
import InfoSheet from './InfoSheet.vue'
import { describeSolver, describeFlow, DECISION_LABELS } from '../lib/solvers'
import { REGIME_BY_VALUE } from '../lib/regime'
import { ACTION_TONE, pct } from '../lib/moveResult'

const props = defineProps({
  result: { type: Object, default: null },
  pending: { type: Boolean, default: false },
  /** The regime currently selected: 'gto' | 'exploit' | 'manual'. */
  regime: { type: String, default: 'gto' },
})

const solverHelp = ref(false)
const details = ref(false)

const solver = computed(() => describeSolver(props.result?.solver))
const meta = computed(() => props.result?.meta || {})
const answer = computed(() => (props.result?.type === 'answer' ? props.result : null))

/** The regime that ACTUALLY ran, which is what the numbers below mean. */
const served = computed(() => REGIME_BY_VALUE[answer.value?.regime || 'gto'])
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
  return REGIME_BY_VALUE[asked]?.title || asked
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

/** The full account of the solve — behind the Details button. */
const facts = computed(() => {
  const m = meta.value
  const out = []
  const push = (label, value) => {
    if (value !== null && value !== undefined && value !== '') out.push({ label, value })
  }
  push('Regime', props.result?.regime)
  push('Requested', answer.value?.regimeRequested)
  push('Solver', props.result?.solver)
  push('Flow', m.flow)
  push('Street', props.result?.street)
  push('Hand', props.result?.hand)
  push('Pot', m.potBB != null ? `${num(m.potBB)} BB` : null)
  push('To call', m.toCallBB != null ? `${num(m.toCallBB)} BB` : null)
  push('Seats', seatsLabel.value)
  push('Acting seat', m.actingSeat != null ? String(m.actingSeat) : null)
  push('Board', Array.isArray(m.board) ? m.board.join(' ') : m.board)
  push('Solve time', m.solveSeconds != null ? `${num(m.solveSeconds, 3)} s` : null)
  push('Predicted', m.predictedSolveSeconds != null ? `${num(m.predictedSolveSeconds, 3)} s` : null)
  push('Response time', props.result?.responseTime != null ? `${props.result.responseTime} s` : null)
  push('Cached', m.cached === null || m.cached === undefined ? null : String(m.cached))
  push('Rooted at', m.rootedAt)
  push('Entry ranges', m.entrySource)
  push('Players', m.players)
  push('Iterations', m.iterations != null ? Number(m.iterations).toLocaleString() : null)
  push('Infosets', m.infosets != null ? Number(m.infosets).toLocaleString() : null)
  push('Iters / infoset', m.itersPerInfoset)
  push('Depth limit', m.depthLimit)
  push('Thinned from', m.thinnedFrom ? `${m.thinnedFrom}-way at the ${m.thinnedAt}` : null)
  push('Narrowed on', m.narrowRegime)
  push('Narrow time', m.narrowSeconds != null ? `${num(m.narrowSeconds, 3)} s` : null)
  // Exploit-only: how the search was shaped, and what it was reading.
  push('Runouts', m.chance ? JSON.stringify(m.chance) : null)
  push('Leaf', m.leaf)
  push('Card removal', m.removal)
  push('Bet menu', Array.isArray(m.menuBets) ? m.menuBets.join(' / ') + '%' : null)
  push('Raise menu', Array.isArray(m.menuRaises) ? m.menuRaises.join(' / ') + '%' : null)
  push('Nodes', m.nodes != null ? Number(m.nodes).toLocaleString() : null)
  push('Model calls', m.predicts)
  push('Villain stats read', Array.isArray(m.villainStats) ? m.villainStats.join(', ') : null)
  push('Over hands', m.villainStatHands != null ? Number(m.villainStatHands).toLocaleString() : null)
  push('Hand class', m.handClass)
  push('Effective stack', m.effectiveBB != null ? `${num(m.effectiveBB)} BB` : null)
  push('Raises before', m.raisesBefore)
  push('Callers before', m.callersBefore)
  push('Aggressor', m.aggressor)
  push('Node', m.node)
  push('Budget sent', props.result?.request?.maxSolveTime ? `${props.result.request.maxSolveTime} s` : null)
  push('handId', props.result?.request?.handId)
  return out
})

const warnings = computed(() => props.result?.warnings || [])
const tone = (a) => (a ? ACTION_TONE[a.kind] || ACTION_TONE.other : 'var(--label-3)')
</script>

<template>
  <div class="panel card">
    <!-- header ------------------------------------------------------------ -->
    <header class="head">
      <div class="crumbs">
        <span class="street">
          {{
            result?.type === 'answer'
              ? (result.street || 'decision').replace(/^./, (c) => c.toUpperCase())
              : result?.type === 'error'
                ? 'Rejected'
                : 'Waiting'
          }}
        </span>
        <template v-if="answer">
          <span class="sep">·</span>
          <span class="chip read" :class="{ exploit: isExploit, fell: fellBack }">
            {{ served.title }}<i v-if="fellBack">asked {{ askedLabel }}</i>
          </span>
          <button class="badge" :class="solver.tone" @click="solverHelp = true">
            {{ solver.title }}
          </button>
          <HelpButton :size="16" label="How this was solved" @click="solverHelp = true" />
          <span v-if="result.responseTime != null" class="secs mono">
            {{ result.responseTime }}s
          </span>
        </template>
      </div>

      <div class="right">
        <span v-if="pending" class="busy"><span class="spinner" />solving</span>
        <button v-if="answer" class="btn btn-sm" @click="details = true">Details</button>
        <div v-if="heroCards.length" class="hcards">
          <PlayingCard v-for="c in heroCards" :key="c" :card="c" size="sm" />
        </div>
      </div>
    </header>

    <template v-if="answer">
      <!-- what to play -------------------------------------------------- -->
      <div class="picks">
        <div class="pick" :style="{ '--tone': tone(answer.sampled) }">
          <span class="plabel">{{ isExploit ? 'Play (max EV)' : 'Play (GTO)' }}</span>
          <span class="pval">{{ answer.sampled?.action || '—' }}</span>
        </div>
      </div>

      <!-- the numbers ----------------------------------------------------- -->
      <table class="freq">
        <thead>
          <tr>
            <th class="a">Action</th>
            <template v-if="isExploit">
              <th class="n">EV (BB)</th>
              <th class="n">% pot</th>
              <th class="n d">Support</th>
            </template>
            <th v-else class="n">Frequency</th>
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
              <span v-if="r.decision" class="dec">{{
                DECISION_LABELS[r.decision] || r.decision
              }}</span>
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
        <strong>{{ served.title }}</strong>
        <span class="blurb">
          {{
            isExploit
              ? `Maximum EV against this villain’s measured behaviour. The top row is the move — there is nothing to mix at, and every EV is counted from this decision on.`
              : result.street === 'preflop'
                ? 'A chart, already bent by the opponents’ stats — mix at these frequencies.'
                : 'The equilibrium strategy at this node — mix at these frequencies.'
          }}
        </span>
      </div>

      <p v-if="fellBack" class="fellback">
        <strong>{{ askedLabel }} was asked for and could not be answered here</strong> — this is
        the GTO answer instead.
        <button class="linky" @click="details = true">Why</button>
      </p>

      <p v-if="thinBest" class="fellback">
        The recommended size has thin population support — the models are extrapolating there.
      </p>

      <p v-if="warnings.length" class="warncount">
        {{ warnings.length }} warning{{ warnings.length > 1 ? 's' : '' }} —
        <button class="linky" @click="details = true">see details</button>
      </p>
    </template>

    <template v-else-if="result?.type === 'error'">
      <div class="error">
        <p class="emsg">{{ result.message }}</p>
        <p v-if="result.hint" class="ehint">{{ result.hint }}</p>
      </div>
    </template>

    <div v-else class="idlebox">
      <div v-if="pending" class="spinner" />
      <span class="muted">
        {{
          pending
            ? 'Solving…'
            : 'Each snapshot is sent to the ZigSolver API, and its answer lands here.'
        }}
      </span>
    </div>

    <!-- sheets --------------------------------------------------------- -->
    <InfoSheet
      v-if="solverHelp"
      :title="solver.title"
      :subtitle="`solver: ${solver.name}`"
      @close="solverHelp = false"
    >
      <p class="para"><strong>{{ solver.summary }}</strong></p>
      <p class="para pre">{{ solver.detail }}</p>
      <template v-if="meta.flow">
        <h4>Flow: {{ meta.flow }}</h4>
        <p class="para">{{ describeFlow(meta.flow) }}</p>
      </template>
      <h4>Reading the numbers</h4>
      <p class="para">
        In the <strong>GTO</strong> regime the column is a distribution: mix at those
        frequencies, and <strong>Play</strong> is one random draw from it. In the
        <strong>Exploit</strong> regime there is nothing to mix — the rows are ranked by EV
        against the modelled opponent and the top one is the move.
      </p>
      <p class="para">
        <strong>EV (BB)</strong> counts from this decision on: chips already in the pot are sunk,
        so folding is 0 by construction and every other number is read against it.
        <strong>% pot</strong> is the same number over the pot at the node.
        <strong>Support</strong> is the share of real play the size models saw at that size — a
        winning branch under about 2% is one the models are extrapolating on, which the warnings
        also say.
      </p>
    </InfoSheet>

    <InfoSheet
      v-if="details"
      title="How it was solved"
      :subtitle="`${result?.solver || ''}`"
      @close="details = false"
    >
      <div class="grid">
        <div v-for="f in facts" :key="f.label" class="fact">
          <span class="fl">{{ f.label }}</span>
          <span class="fv">{{ f.value }}</span>
        </div>
      </div>

      <template v-if="warnings.length">
        <h4>Warnings</h4>
        <ul class="warnings">
          <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
        </ul>
      </template>

      <h4>Raw response</h4>
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
  color: var(--label-3);
  font-size: 11.5px;
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
