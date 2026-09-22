<script setup>
/**
 * The ranges behind the answer, without a sheet around them — RangesSheet puts
 * one on for the live panel, and the solve history draws them inline.
 *
 * The ranges behind the answer: one tab per player, one chart at a time, and
 * the hand's streets to move between.
 *
 * Two axes because there are two questions. "What is this player here with" is
 * the chart; "what did the turn card do to it" is the street, and the answer to
 * the second one is only visible as a CHANGE — so the width of the street
 * before is carried next to the width on screen rather than left to be
 * remembered.
 *
 * A player is kept SELECTED across streets by name. The seats of a thinned pot
 * are not the seats of the flop, and re-selecting whoever happens to be first
 * every time the street changes would lose the comparison the street tabs exist
 * for. A player who is gone by the selected street says so instead.
 */
import { computed, ref, watch } from 'vue'
import PlayingCard from './PlayingCard.vue'
import RangeGrid from './RangeGrid.vue'
import { t, tv } from '../lib/i18n'

const props = defineProps({
  /** The hand's records, earliest street first (lib/ranges.rangeStreets). */
  streets: { type: Array, default: () => [] },
  /** The street to open on — the one the answer on screen was given for. */
  street: { type: String, default: null },
})

const at = ref(0)

/** Open on the answer's own street, falling back to the latest one recorded. */
function openAt() {
  const want = props.streets.findIndex((s) => s.street === props.street)
  return want >= 0 ? want : Math.max(0, props.streets.length - 1)
}
at.value = openAt()
watch(() => [props.streets.length, props.street], () => { at.value = openAt() })

const current = computed(() => props.streets[at.value] || null)
const previous = computed(() => (at.value > 0 ? props.streets[at.value - 1] : null))

/** Every player the hand has had a range for, in the order they last appeared. */
const players = computed(() => {
  const seen = new Map()
  for (const rec of props.streets) for (const p of rec.players) seen.set(p.key, p)
  return [...seen.values()]
})

const selected = ref(null)

watch(
  players,
  (list) => {
    if (!list.length) return
    // Default to the hero: it is the one range the operator already knows the
    // shape of, which makes it the one that says whether the rest are sane.
    if (!list.some((p) => p.key === selected.value)) {
      selected.value = (list.find((p) => p.hero) || list[0]).key
    }
  },
  { immediate: true },
)

const shown = computed(
  () => current.value?.players.find((p) => p.key === selected.value) || null,
)

/** The same player one street earlier — what the width on screen moved from. */
const before = computed(
  () => previous.value?.players.find((p) => p.key === selected.value) || null,
)

/** Narrowed by, in points of width. Null when there is nothing to compare to. */
const narrowedBy = computed(() => {
  if (!shown.value || !before.value) return null
  const d = before.value.widthPct - shown.value.widthPct
  return Math.abs(d) < 0.05 ? null : d
})

const streetLabel = (s) => tv(`street.${s}`, String(s || ''))

const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString()

function tab(p) {
  // The hero is '*me*' in every body the host writes; the felt says "you" and
  // so does this, or the tab strip reads as a table of strangers.
  return p.hero ? t('ranges.hero') : p.name
}
</script>

<template>
  <div class="rview">
    <template v-if="current">
      <!-- who ------------------------------------------------------------ -->
      <div class="tabs" role="tablist" :aria-label="t('ranges.playersLabel')">
        <button
          v-for="p in players"
          :key="p.key"
          class="tab"
          :class="{ on: p.key === selected, hero: p.hero }"
          role="tab"
          :aria-selected="p.key === selected"
          @click="selected = p.key"
        >
          <span class="nick">{{ tab(p) }}</span>
          <span v-if="p.position" class="pos">{{ p.position }}</span>
        </button>
      </div>

      <!-- when ----------------------------------------------------------- -->
      <div class="bar">
        <div class="seg" role="tablist" :aria-label="t('ranges.streetsLabel')">
          <button
            v-for="(rec, i) in streets"
            :key="rec.street"
            class="segbtn"
            :class="{ on: i === at }"
            role="tab"
            :aria-selected="i === at"
            @click="at = i"
          >
            {{ streetLabel(rec.street) }}
          </button>
        </div>
        <div v-if="current.board.length" class="board">
          <PlayingCard
            v-for="(c, i) in current.board"
            :key="`${c}-${i}`"
            :card="c"
            size="sm"
          />
        </div>
      </div>

      <!-- the range ------------------------------------------------------ -->
      <template v-if="shown">
        <div class="summary">
          <div class="stat">
            <span class="sl">{{ t('ranges.width') }}</span>
            <span class="sv">{{ num(shown.widthPct, 1) }}%</span>
          </div>
          <div class="stat">
            <span class="sl">{{ t('ranges.combos') }}</span>
            <span class="sv">{{ num(shown.combos, 1) }}</span>
          </div>
          <div v-if="narrowedBy !== null" class="stat">
            <span class="sl">
              {{ t(narrowedBy > 0 ? 'ranges.narrowed' : 'ranges.widened') }}
            </span>
            <span class="sv" :class="narrowedBy > 0 ? 'down' : 'up'">
              {{ narrowedBy > 0 ? '−' : '+' }}{{ num(Math.abs(narrowedBy), 1) }}
              {{ t('ranges.points') }}
              <i>{{ t('ranges.since', { street: streetLabel(previous.street) }) }}</i>
            </span>
          </div>
          <div v-if="current.rootedAt" class="stat">
            <span class="sl">{{ t('facts.rootedAt') }}</span>
            <span class="sv">{{ streetLabel(current.rootedAt) }}</span>
          </div>
        </div>

        <RangeGrid :weights="shown.weights" :board="current.board" />

        <p class="note">{{ t('ranges.note') }}</p>
      </template>

      <p v-else class="gone">{{ t('ranges.notInGame', { street: streetLabel(current.street) }) }}</p>
    </template>

    <p v-else class="gone">{{ t('ranges.empty') }}</p>
  </div>
</template>

<style scoped>
/* --- player tabs ----------------------------------------------------- */

.tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--separator);
}

.tab {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label-2);
  font: inherit;
  font-size: 13px;
  font-weight: 620;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.tab:hover {
  background: var(--fill-strong);
}

.tab.on {
  background: var(--blue);
  color: #fff;
}

.nick {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.7;
}

/* --- street switcher --------------------------------------------------- */

.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.seg {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--r-pill);
  background: var(--fill);
}

.segbtn {
  padding: 5px 14px;
  border: none;
  border-radius: var(--r-pill);
  background: none;
  color: var(--label-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 620;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.segbtn.on {
  background: var(--bg-elevated);
  color: var(--label);
  box-shadow: var(--shadow-1);
}

.board {
  display: flex;
  gap: 3px;
  margin-left: auto;
}

/* --- summary ----------------------------------------------------------- */

.summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
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

.sv i {
  font-style: normal;
  font-weight: 550;
  color: var(--label-3);
}

.sv.down {
  color: color-mix(in srgb, var(--green) 76%, var(--label));
}

.sv.up {
  color: color-mix(in srgb, var(--orange) 84%, var(--label));
}

/* --- footer ------------------------------------------------------------ */

.note {
  margin: 12px 0 0;
  color: var(--label-3);
  font-size: 11.5px;
  line-height: 1.5;
}

.gone {
  margin: 18px 0;
  color: var(--label-2);
  font-size: 13.5px;
  line-height: 1.5;
}
</style>
