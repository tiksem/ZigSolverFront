<script setup>
/**
 * Everything in the snapshot that the felt cannot show: the tournament header,
 * the full HUD block per seat, the action history street by street, and the
 * body verbatim.
 */
import { computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import { CORE_STATS, isRatioStat } from '../lib/handBody'
import { persistentRef, oneOf, asBoolean } from '../lib/persist'
import { t, tp, tv, tk } from '../lib/i18n'

const props = defineProps({
  hand: { type: Object, required: true },
})

// Which pane you read is a preference, not hand state — a reload should not put
// you back on Players when you have been living in Action all session.
const tab = persistentRef('zigsolver.details.tab', 'players', oneOf(['players', 'history', 'spot']))
const showRaw = persistentRef('zigsolver.details.raw', false, asBoolean)

const fmt = (n, d = 1) =>
  n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString()

const statKeys = computed(() => {
  const keys = new Set()
  for (const s of props.hand.seats) Object.keys(s.stats).forEach((k) => keys.add(k))
  const core = CORE_STATS.filter((k) => keys.has(k))
  const rest = [...keys].filter((k) => !core.includes(k)).sort()
  return [...core, ...rest]
})

const STREET_KEYS = ['preflop', 'flop', 'turn', 'river']

const streets = computed(() =>
  props.hand.streetLog
    .map((entries, i) => ({
      index: i,
      name: t(`street.${STREET_KEYS[i]}`),
      board: props.hand.boardByStreet[i] || [],
      entries,
    }))
    .filter((s) => s.entries.length || s.board.length),
)

function actionText(entry) {
  const amount = entry.amount != null ? `${fmt(entry.amount)}BB` : ''
  switch (entry.kind) {
    case 'fold':
      return t('act.fold')
    case 'check':
      return t('act.check')
    case 'call':
      return amount ? t('act.callAmount', { amount }) : t('act.call')
    case 'bet':
      return t('act.bet', { amount })
    case 'raise':
      return t('act.raise', { amount })
    case 'all-in':
      return amount ? t('act.allInAmount', { amount }) : t('act.allIn')
    default:
      return entry.kind || ''
  }
}

const tournament = computed(() => props.hand.tournament)
</script>

<template>
  <div class="details card">
    <div class="tabs" role="tablist">
      <button
        v-for="pane in [
          { k: 'players', label: t('details.tabPlayers') },
          { k: 'history', label: t('details.tabAction') },
          { k: 'spot', label: t('details.tabSpot') },
        ]"
        :key="pane.k"
        class="tab"
        :class="{ on: tab === pane.k }"
        role="tab"
        :aria-selected="tab === pane.k"
        @click="tab = pane.k"
      >
        {{ pane.label }}
      </button>
    </div>

    <!-- Players ------------------------------------------------------------ -->
    <div v-if="tab === 'players'" class="pane">
      <div class="tablescroll">
        <table>
          <thead>
            <tr>
              <th class="left">{{ t('details.player') }}</th>
              <th>{{ t('details.position') }}</th>
              <th class="num">{{ t('details.stack') }}</th>
              <th class="num">{{ t('details.inPot') }}</th>
              <th
                v-for="k in statKeys"
                :key="k"
                class="num"
                :title="tv(`stat.${k}`, k)"
              >
                {{ k }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in hand.seats" :key="s.name" :class="{ hero: s.isHero, out: s.folded }">
              <td class="left">
                <span class="pname">{{ s.isHero ? t('details.you') : s.name }}</span>
                <span v-if="s.hand" class="inline-cards">
                  <PlayingCard v-for="c in s.hand" :key="c" :card="c" size="sm" />
                </span>
                <span v-if="s.allIn" class="mini allin">{{ t('details.allIn') }}</span>
                <span v-else-if="s.folded" class="mini">{{ t('details.folded') }}</span>
              </td>
              <td>{{ s.position || '—' }}</td>
              <td class="num tnum">{{ fmt(s.stack) }}</td>
              <td class="num tnum">{{ s.streetCommit ? fmt(s.streetCommit, 2) : '—' }}</td>
              <td v-for="k in statKeys" :key="k" class="num tnum">
                <template v-if="s.stats[k] != null">
                  {{ fmt(s.stats[k], isRatioStat(k) ? 2 : 0) }}<em v-if="!isRatioStat(k)">%</em>
                </template>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- v-html: the <i> and <code> come from the message file, which is ours. -->
      <p class="fine" v-html="t('details.playersFine')" />
    </div>

    <!-- Action history ------------------------------------------------------ -->
    <div v-else-if="tab === 'history'" class="pane">
      <div v-for="s in streets" :key="s.index" class="street">
        <div class="sthead">
          <span class="stname">{{ s.name }}</span>
          <span v-if="s.board.length" class="stboard">
            <PlayingCard v-for="c in s.board" :key="c" :card="c" size="sm" />
          </span>
        </div>
        <ul v-if="s.entries.length" class="acts">
          <li v-for="(e, i) in s.entries" :key="i">
            <span class="who">{{ e.name === '*me*' ? t('details.you') : e.name }}</span>
            <span class="what" :class="e.kind">{{ actionText(e) }}</span>
          </li>
        </ul>
        <p v-else class="fine">{{ t('details.noAction') }}</p>
      </div>
      <div v-if="hand.heroToAct" class="turn">{{ t('details.yourTurn') }}</div>
    </div>

    <!-- Spot ---------------------------------------------------------------- -->
    <div v-else class="pane">
      <div class="grid">
        <div class="fact">
          <span class="fl">{{ t('details.street') }}</span>
          <span class="fv">{{ tv(`street.${hand.streetName}`, hand.streetName) }}</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.tableSize') }}</span>
          <span class="fv">{{ tp('details.seatCount', hand.tableSize) }}</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.contenders') }}</span
          ><span class="fv">{{ hand.contenders }}</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.totalPot') }}</span
          ><span class="fv">{{ fmt(hand.pot, 2) }} BB</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.replayedPot') }}</span
          ><span class="fv">{{ fmt(hand.replayedPot, 2) }} BB</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.currentBet') }}</span
          ><span class="fv">{{ fmt(hand.currentBet, 2) }} BB</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.heroToCall') }}</span
          ><span class="fv">{{ fmt(hand.toCall, 2) }} BB</span>
        </div>
        <div class="fact">
          <span class="fl">{{ t('details.heroHand') }}</span>
          <span class="fv">{{ hand.heroHand ? hand.heroHand.join(' ') : '—' }}</span>
        </div>
        <template v-if="tournament">
          <div v-if="tournament.playersLeft != null" class="fact">
            <span class="fl">{{ t('details.playersLeft') }}</span
            ><span class="fv">{{ tournament.playersLeft }}</span>
          </div>
          <div v-if="tournament.playersPaid != null" class="fact">
            <span class="fl">{{ t('details.playersPaid') }}</span
            ><span class="fv">{{ tournament.playersPaid }}</span>
          </div>
          <div v-if="tournament.averageStack != null" class="fact">
            <span class="fl">{{ t('details.averageStack') }}</span>
            <span class="fv">{{ fmt(tournament.averageStack) }} BB</span>
          </div>
        </template>
      </div>

      <p v-if="hand.headerText" class="header-quote">{{ hand.headerText }}</p>

      <ul v-if="hand.warnings.length" class="warnings">
        <li v-for="(w, i) in hand.warnings" :key="i">{{ tk(w) }}</li>
      </ul>

      <button class="btn btn-sm rawtoggle" @click="showRaw = !showRaw">
        {{ showRaw ? t('details.hideRaw') : t('details.showRaw') }}
      </button>
      <pre v-if="showRaw" class="raw mono">{{ hand.raw }}</pre>
    </div>
  </div>
</template>

<style scoped>
.details {
  padding: 6px 6px 14px;
}

.tabs {
  display: inline-flex;
  gap: 2px;
  margin: 8px 10px 10px;
  padding: 2px;
  border-radius: var(--r-pill);
  background: var(--fill);
}

.tab {
  min-height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 620;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.tab.on {
  background: var(--bg-elevated);
  color: var(--label);
  box-shadow: var(--shadow-1);
}

.pane {
  padding: 0 14px;
}

.tablescroll {
  overflow-x: auto;
  margin: 0 -14px;
  padding: 0 14px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

th {
  padding: 6px 8px;
  color: var(--label-3);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid var(--separator);
}

td {
  padding: 8px;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid var(--separator);
}

th.left,
td.left {
  text-align: left;
}

td.num,
th.num {
  text-align: right;
}

td em {
  font-style: normal;
  font-size: 9px;
  opacity: 0.45;
  margin-left: 1px;
}

tr.hero td {
  background: color-mix(in srgb, var(--blue) 8%, transparent);
}

tr.out {
  opacity: 0.5;
}

.pname {
  font-weight: 620;
}

.inline-cards {
  display: inline-flex;
  gap: 2px;
  margin-left: 6px;
  vertical-align: middle;
}

.mini {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label-3);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
}

.mini.allin {
  background: color-mix(in srgb, var(--allin) 16%, transparent);
  color: var(--allin);
}

.street + .street {
  margin-top: 16px;
}

.sthead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.stname {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--label-2);
}

.stboard {
  display: inline-flex;
  gap: 3px;
}

.acts {
  margin: 0;
  padding: 0;
  list-style: none;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--fill);
}

.acts li {
  display: flex;
  gap: 10px;
  padding: 6px 11px;
  font-size: 13px;
}

.acts li + li {
  border-top: 1px solid var(--separator);
}

.who {
  min-width: 120px;
  font-weight: 620;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.what {
  color: var(--label-2);
}

.what.bet,
.what.raise {
  color: color-mix(in srgb, var(--orange) 84%, var(--label));
  font-weight: 600;
}

.what.all-in {
  color: var(--allin);
  font-weight: 700;
}

.what.fold {
  color: var(--label-3);
}

.turn {
  margin-top: 14px;
  padding: 9px 12px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--yellow) 20%, transparent);
  font-size: 13px;
  font-weight: 620;
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
}

.fv {
  font-weight: 620;
}

.header-quote {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--separator-strong);
  color: var(--label-2);
  font-size: 13px;
  white-space: pre-line;
}

.warnings {
  margin: 12px 0 0;
  padding: 10px 12px 10px 28px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--orange) 12%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
  font-size: 12.5px;
}

.fine {
  margin: 10px 2px 0;
  color: var(--label-3);
  font-size: 12px;
  line-height: 1.5;
}

/* :deep, because .fine's markup arrives through v-html and so carries no
   scope attribute of its own. */
.fine :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.fine :deep(i) {
  font-style: italic;
}

.rawtoggle {
  margin-top: 12px;
}

.raw {
  margin: 10px 0 0;
  padding: 12px;
  max-height: 340px;
  overflow: auto;
  border-radius: var(--r-md);
  background: var(--fill);
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
