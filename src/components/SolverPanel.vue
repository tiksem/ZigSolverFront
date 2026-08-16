<script setup>
/**
 * The answer, compactly: what to play, the two strategies as numbers, and one
 * line on the read. Everything else — the solve's own account of itself, the
 * warnings, the raw payload — is a click away rather than on screen.
 */
import { ref, computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import HelpButton from './HelpButton.vue'
import InfoSheet from './InfoSheet.vue'
import { describeSolver, FLOWS, DECISION_LABELS } from '../lib/solvers'
import { profileTitle, profileBlurb, PROFILE_BY_NAME, SIGNATURE_FIELDS } from '../lib/profiles'
import { ACTION_TONE, pct } from '../lib/moveResult'

const props = defineProps({
  result: { type: Object, default: null },
  pending: { type: Boolean, default: false },
  /** The read currently selected: 'auto' | 'gto' | a profile name. */
  read: { type: String, default: 'auto' },
})

const solverHelp = ref(false)
const readHelp = ref(false)
const details = ref(false)

const solver = computed(() => describeSolver(props.result?.solver))
const meta = computed(() => props.result?.meta || {})
const answer = computed(() => (props.result?.type === 'answer' ? props.result : null))

const heroCards = computed(() => {
  const h = props.result?.hand
  if (!h || typeof h !== 'string' || h.length < 4) return []
  return [h.slice(0, 2), h.slice(2, 4)]
})

const resolvedName = computed(() =>
  typeof props.result?.profile === 'string' ? props.result.profile : null,
)
const profileLabel = computed(() => {
  const p = props.result?.profile
  if (!p) return null
  return typeof p === 'object' ? 'Custom read' : profileTitle(p)
})
const blurb = computed(() => (resolvedName.value ? profileBlurb(resolvedName.value) : null))
const readProfile = computed(() => PROFILE_BY_NAME[resolvedName.value] || null)

/** What we asked for, when it differs from what came back. */
const askedLabel = computed(() => {
  const asked = props.result?.request?.readLabel || props.read
  if (asked === 'gto') return 'GTO only'
  if (asked === 'auto') return 'Auto'
  return profileTitle(asked)
})
const resolvedNote = computed(() => {
  const asked = props.result?.request?.readLabel || props.read
  if (asked === 'auto') return profileLabel.value ? `→ ${profileLabel.value}` : null
  if (asked !== 'gto' && resolvedName.value && resolvedName.value !== asked) {
    return `→ ${profileLabel.value}`
  }
  return null
})

/** One row per action, both columns side by side. */
const rows = computed(() => {
  const a = answer.value
  if (!a) return []
  const gto = a.gto || a.exploit
  const source = a.hasProfile ? a.exploit : gto
  return source.map((x) => {
    const g = gto.find((y) => y.action === x.action)
    const gp = g ? g.probability : null
    const delta = a.hasProfile && gp != null ? x.probability - gp : null
    return {
      action: x.action,
      color: ACTION_TONE[x.kind] || ACTION_TONE.other,
      gto: gp,
      exploit: x.probability,
      delta: delta != null && Math.abs(delta) >= 0.005 ? delta : null,
      decision: meta.value.handDecisions?.[x.action] || null,
    }
  })
})

const twoColumn = computed(() => !!answer.value?.hasProfile && !!answer.value?.gto)

const signature = computed(() => {
  const p = readProfile.value
  if (!p?.stats) return []
  return SIGNATURE_FIELDS.filter(([k]) => p.stats[k] != null).map(([k, label, unit]) => ({
    key: k,
    label,
    value: p.stats[k],
    unit,
  }))
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
          <span class="chip read">
            {{ askedLabel }}<i v-if="resolvedNote">{{ resolvedNote }}</i>
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
        <div class="pick" :style="{ '--tone': tone(answer.sampledExploit) }">
          <span class="plabel">{{ twoColumn ? 'Play (exploit)' : 'Play' }}</span>
          <span class="pval">{{ answer.sampledExploit?.action || '—' }}</span>
        </div>
        <div v-if="twoColumn" class="pick" :style="{ '--tone': tone(answer.sampledGto) }">
          <span class="plabel">GTO</span>
          <span class="pval">{{ answer.sampledGto?.action || '—' }}</span>
        </div>
      </div>

      <!-- the numbers ----------------------------------------------------- -->
      <table class="freq">
        <thead>
          <tr>
            <th class="a">Action</th>
            <th v-if="twoColumn" class="n">GTO</th>
            <th class="n">{{ twoColumn ? 'Exploit' : 'Strategy' }}</th>
            <th v-if="twoColumn" class="n d">Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.action" :class="{ dead: r.exploit < 0.0005 }">
            <td class="a">
              <span class="swatch" :style="{ background: r.color }" />
              <span class="akey">{{ r.action }}</span>
              <span v-if="r.decision" class="dec">{{
                DECISION_LABELS[r.decision] || r.decision
              }}</span>
            </td>
            <td v-if="twoColumn" class="n tnum muted">{{ pct(r.gto) }}</td>
            <td class="n tnum strong">{{ pct(r.exploit) }}</td>
            <td v-if="twoColumn" class="n d tnum">
              <span v-if="r.delta" :class="r.delta > 0 ? 'up' : 'down'">
                {{ r.delta > 0 ? '+' : '−' }}{{ pct(Math.abs(r.delta)) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- the read, in one line ------------------------------------------- -->
      <div v-if="blurb" class="readline">
        <strong>{{ profileLabel }}</strong>
        <span class="blurb">{{ blurb }}</span>
        <HelpButton :size="16" :label="`About ${profileLabel}`" @click="readHelp = true" />
      </div>
      <div v-else-if="!twoColumn" class="readline">
        <span class="blurb">
          {{
            result.street === 'preflop'
              ? 'Preflop is a chart, already bent by the opponents’ stats — there is no GTO twin.'
              : 'No read served: this is the equilibrium answer.'
          }}
        </span>
      </div>

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
      <template v-if="meta.flow && FLOWS[meta.flow]">
        <h4>Flow: {{ meta.flow }}</h4>
        <p class="para">{{ FLOWS[meta.flow] }}</p>
      </template>
      <h4>Reading the two columns</h4>
      <p class="para">
        <strong>GTO</strong> is the equilibrium strategy at this node. <strong>Exploit</strong> is
        the best response to the opponent model, regularized back toward GTO by that profile’s
        fitted temperature — it commits only where the modelled edge is large. With no read served
        the two are the same and only one column is shown. <strong>Play</strong> is one random draw
        from the distribution: take it if you want to mix at the stated frequencies.
      </p>
    </InfoSheet>

    <InfoSheet
      v-if="readHelp && readProfile"
      :title="readProfile.title"
      :subtitle="readProfile.cluster || `profile: ${readProfile.name}`"
      @close="readHelp = false"
    >
      <p class="para">{{ readProfile.description }}</p>
      <h4>How it differs, and what beats it</h4>
      <p class="para">{{ readProfile.exploit }}</p>
      <template v-if="signature.length">
        <h4>Cluster signature</h4>
        <div class="sig">
          <div v-for="s in signature" :key="s.key" class="sigrow">
            <span class="sk">{{ s.label }}</span>
            <span class="sv tnum">{{ s.value }}{{ s.unit }}</span>
          </div>
        </div>
      </template>
      <template v-if="readProfile.temp != null">
        <h4>Serving</h4>
        <div class="sig">
          <div class="sigrow">
            <span class="sk">Temperature</span>
            <span class="sv tnum">{{ readProfile.temp }}</span>
          </div>
          <div class="sigrow">
            <span class="sk">Serving intensity</span>
            <span class="sv tnum">{{ readProfile.serving }}</span>
          </div>
        </div>
      </template>
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
  width: 68px;
}

.freq th.d,
.freq td.d {
  width: 58px;
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

.up {
  color: color-mix(in srgb, var(--green) 78%, var(--label));
  font-size: 11.5px;
  font-weight: 700;
}

.down {
  color: color-mix(in srgb, var(--red) 84%, var(--label));
  font-size: 11.5px;
  font-weight: 700;
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
