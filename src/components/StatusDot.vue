<script setup>
import { computed } from 'vue'
import { STATUS_LABEL } from '../lib/useSocket'

const props = defineProps({
  status: { type: String, default: 'idle' },
  label: { type: String, default: '' },
})

const tone = computed(() => {
  if (props.status === 'open') return 'live'
  if (props.status === 'connecting' || props.status === 'retrying') return 'busy'
  return 'off'
})
</script>

<template>
  <span class="status" :class="tone">
    <span class="dot" />
    <span class="text">{{ label || STATUS_LABEL[status] || status }}</span>
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--label-2);
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--label-3);
  flex: none;
}

.live .dot {
  background: var(--green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 22%, transparent);
}

.live .text {
  color: color-mix(in srgb, var(--green) 70%, var(--label));
}

.busy .dot {
  background: var(--orange);
  animation: pulse 1.1s var(--ease) infinite;
}

.busy .text {
  color: color-mix(in srgb, var(--orange) 74%, var(--label));
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.8);
  }
}
</style>
