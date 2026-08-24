<script setup>
import { computed } from 'vue'
import { t } from '../lib/i18n'

const props = defineProps({
  /** Engine token: 'Qs', 'Th', '4d'… */
  card: { type: String, required: true },
  size: { type: String, default: 'md' }, // sm | md | lg
  dealt: { type: Boolean, default: false },
})

const SUITS = {
  s: { key: 's', glyph: '♠', color: 'var(--card-ink)' },
  h: { key: 'h', glyph: '♥', color: '#e0322c' },
  d: { key: 'd', glyph: '♦', color: '#1f6fe0' },
  c: { key: 'c', glyph: '♣', color: '#1f9d55' },
}

const rank = computed(() => (props.card || '').slice(0, 1).toUpperCase())
const suit = computed(() => SUITS[(props.card || '').slice(1, 2).toLowerCase()] || SUITS.s)
// Screen-reader only: the face itself is a rank and a glyph in every language.
const label = computed(() =>
  t('card.label', { rank: rank.value, suit: t(`card.suit.${suit.value.key}`) }),
)
</script>

<template>
  <span
    class="pc"
    :class="[size, { dealt }]"
    :style="{ color: suit.color }"
    :aria-label="label"
    role="img"
  >
    <span class="r">{{ rank }}</span>
    <span class="s">{{ suit.glyph }}</span>
  </span>
</template>

<style scoped>
.pc {
  display: inline-grid;
  grid-template-rows: auto auto;
  place-items: center;
  gap: 0;
  background: var(--card-face);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28), 0 4px 10px rgba(0, 0, 0, 0.18);
  font-family: var(--font-rounded);
  line-height: 1;
  font-variant-numeric: lining-nums;
  user-select: none;
}

.sm {
  width: 22px;
  height: 30px;
  border-radius: 4px;
}

.sm .r {
  font-size: 13px;
  font-weight: 700;
}

.sm .s {
  font-size: 11px;
}

.md {
  width: 34px;
  height: 47px;
}

.md .r {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.md .s {
  font-size: 15px;
  margin-top: 1px;
}

.lg {
  width: 46px;
  height: 64px;
  border-radius: 8px;
}

.lg .r {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.lg .s {
  font-size: 20px;
  margin-top: 2px;
}

.dealt {
  animation: deal 0.32s var(--ease) backwards;
}

@keyframes deal {
  from {
    opacity: 0;
    transform: translateY(-10px) rotate(-6deg) scale(0.9);
  }
}
</style>
