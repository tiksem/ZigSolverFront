<script setup>
import { notifications, dismiss } from '../lib/notify'
</script>

<template>
  <!-- Rendered inside MessageDock's column: the dock owns the fixed position,
       so notifications sit above the panel or the pill without either side
       measuring the other. -->
  <div class="notif-stack" role="status" aria-live="polite">
    <TransitionGroup name="notif">
      <button
        v-for="n in notifications"
        :key="n.id"
        class="notif"
        :class="n.tone"
        title="Dismiss"
        @click="dismiss(n.id)"
      >
        <span class="dot" />
        <span class="text">{{ n.text }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notif-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
}

.notif-stack:empty {
  display: none;
}

.notif {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  max-width: min(380px, calc(100vw - 36px));
  padding: 10px 14px;
  border: none;
  border-radius: var(--r-md);
  background: var(--chrome);
  color: var(--label);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--shadow-2), inset 0 0 0 1px var(--separator);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  pointer-events: auto;
}

.dot {
  width: 7px;
  height: 7px;
  flex: none;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--blue);
}

.ok .dot {
  background: var(--green);
}

.warn .dot {
  background: var(--orange);
}

.bad .dot {
  background: var(--red);
}

.text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-enter-active,
.notif-leave-active {
  transition: opacity 0.2s var(--ease), transform 0.2s var(--ease);
}

/* Slides in from the edge the dock is anchored to. */
.notif-enter-from {
  opacity: 0;
  transform: translateX(-14px) scale(0.96);
}

.notif-leave-to {
  opacity: 0;
  transform: translateX(-14px) scale(0.96);
}

.notif-move {
  transition: transform 0.2s var(--ease);
}

@media (max-width: 560px) {
  .notif-stack {
    align-items: stretch;
  }

  .notif {
    max-width: none;
  }
}
</style>
