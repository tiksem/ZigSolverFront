<script setup>
/**
 * One range as the 13x13 chart: pairs down the diagonal, suited above it,
 * offsuit below.
 *
 * The cell is FILLED from the bottom to the weight rather than tinted by it. A
 * tint reads as one more colour on a grid that already has three regions, and
 * the thing being read here is a frequency — a bar is the shape that says 35%
 * without being looked up.
 *
 * A hand the board has taken every combo of is drawn dead rather than at 0%:
 * "this range does not hold A5s" and "there is no A5s left to hold" are
 * different facts, and only one of them is about the range.
 */
import { computed } from 'vue'
import { chartOf } from '../lib/ranges'
import { t } from '../lib/i18n'

const props = defineProps({
  /** `{ 'AA': 1, 'AKs': 0.85, ... }` — the class map off `meta.ranges`. */
  weights: { type: Object, default: () => ({}) },
  /** The board, as card strings — what the cells are masked by. */
  board: { type: Array, default: () => [] },
})

const dead = computed(() => new Set(props.board.map((c) => String(c))))
const cells = computed(() => chartOf(props.weights, dead.value))

/** Exactly what the panel's own frequencies do: 0 and 100 stay clean. */
function show(weight) {
  const v = weight * 100
  if (v <= 0) return ''
  if (v >= 99.5) return '100'
  if (v < 1) return '<1'
  return String(Math.round(v))
}

function title(cell) {
  if (!cell.combos) return t('ranges.cellDead', { hand: cell.key })
  return t('ranges.cellTitle', {
    hand: cell.key,
    pct: (cell.weight * 100).toFixed(1),
    held: (Math.round(cell.held * 10) / 10).toLocaleString(),
    combos: cell.combos,
  })
}
</script>

<template>
  <div class="grid" role="img" :aria-label="t('ranges.chartLabel')">
    <div
      v-for="cell in cells"
      :key="cell.key"
      class="cell"
      :class="[cell.kind, { dead: !cell.combos, empty: cell.combos && !cell.weight }]"
      :title="title(cell)"
    >
      <span class="fill" :style="{ height: `${cell.weight * 100}%` }" />
      <span class="key">{{ cell.key }}</span>
      <span class="pct">{{ show(cell.weight) }}</span>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
  gap: 2px;
}

.cell {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border-radius: 4px;
  background: var(--fill);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  /* The suit region, faintly: the diagonal is what orients the chart, and a
     border on every cell would be louder than the weights it frames. */
  box-shadow: inset 0 0 0 1px transparent;
}

.cell.pair {
  box-shadow: inset 0 0 0 1px var(--separator-strong);
}

.fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--blue) 62%, transparent);
}

.cell.suited .fill {
  background: color-mix(in srgb, var(--green) 58%, transparent);
}

.cell.offsuit .fill {
  background: color-mix(in srgb, var(--blue) 52%, transparent);
}

.cell.pair .fill {
  background: color-mix(in srgb, var(--purple) 58%, transparent);
}

.key {
  position: relative;
  font-size: 10px;
  font-weight: 680;
  letter-spacing: -0.02em;
  line-height: 1;
}

.pct {
  position: relative;
  color: var(--label-2);
  font-size: 9px;
  font-weight: 620;
  line-height: 1;
  min-height: 9px;
}

/* Held at all, at any weight: the number stops being a second-class label. */
.cell:not(.empty):not(.dead) .pct {
  color: var(--label);
}

.cell.empty {
  opacity: 0.55;
}

/* No combos left on this board — nothing to hold, so nothing to report. */
.cell.dead {
  opacity: 0.3;
  background: repeating-linear-gradient(
    45deg,
    var(--fill) 0 3px,
    transparent 3px 6px
  );
}

@media (max-width: 720px) {
  .pct {
    display: none;
  }

  .key {
    font-size: 9px;
  }
}
</style>
