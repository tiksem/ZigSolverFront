<script setup>
import { computed } from 'vue'
import { t } from '../lib/i18n'

const props = defineProps({
  /** Null falls back to the generic label, translated. */
  label: { type: String, default: null },
  size: { type: Number, default: 18 },
})
const emit = defineEmits(['click'])

const text = computed(() => props.label || t('common.whatIsThis'))
</script>

<template>
  <button
    class="help"
    :style="{ '--s': size + 'px' }"
    :aria-label="text"
    :title="text"
    @click.stop="emit('click')"
  >
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M7.4 7.2a2.7 2.7 0 1 1 3.5 2.6c-.6.2-.9.7-.9 1.3v.6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
      />
      <circle cx="10" cy="14.7" r="1.15" fill="currentColor" />
    </svg>
  </button>
</template>

<style scoped>
.help {
  width: var(--s);
  height: var(--s);
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}

.help:hover {
  background: var(--blue);
  color: #fff;
}

.help:active {
  transform: scale(0.9);
}

svg {
  width: 74%;
  height: 74%;
}
</style>
