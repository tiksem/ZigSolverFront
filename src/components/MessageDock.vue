<script setup>
/**
 * The message history, docked bottom-right.
 *
 * Minimized by default — it is a log, not the thing you came to read — and
 * carries a badge for what arrived while it was closed. Expanding shows the
 * full history; the choice is remembered.
 */
import { ref, computed, watch, onMounted } from 'vue'
import NotificationStack from './NotificationStack.vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  title: { type: String, default: 'Messages' },
})
const emit = defineEmits(['clear'])

const KEY = 'zigsolver.dock'

const open = ref(false)
const unread = ref(0)
let seen = 0

onMounted(() => {
  open.value = localStorage.getItem(KEY) === 'open'
  seen = props.messages.length
})

watch(
  () => props.messages.length,
  (n) => {
    if (open.value || n < seen) {
      seen = n
      unread.value = 0
      return
    }
    unread.value += n - seen
    seen = n
  },
)

function toggle() {
  open.value = !open.value
  localStorage.setItem(KEY, open.value ? 'open' : 'closed')
  if (open.value) {
    unread.value = 0
    seen = props.messages.length
  }
}

const badge = computed(() => (unread.value > 99 ? '99+' : String(unread.value)))
const clock = (ts) => new Date(ts).toLocaleTimeString()
</script>

<template>
  <Teleport to="body">
    <div class="dock" :class="{ open }">
      <NotificationStack />

      <Transition name="panel">
        <section v-if="open" class="panel">
          <header class="head">
            <span class="eyebrow">{{ title }}</span>
            <span v-if="messages.length" class="count">{{ messages.length }}</span>
            <div class="spacer" />
            <button class="mini" :disabled="!messages.length" @click="emit('clear')">
              Clear
            </button>
            <button class="mini icon" title="Minimize" @click="toggle">
              <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                <path
                  d="M5 8 L10 13 L15 8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </header>

          <ul v-if="messages.length" class="list">
            <li v-for="(m, i) in messages" :key="m.at + '-' + i">
              <span class="mono time">{{ clock(m.at) }}</span>
              <span class="mono text">{{ m.text }}</span>
            </li>
          </ul>
          <p v-else class="empty">Nothing from the host yet.</p>
        </section>
      </Transition>

      <button class="pill" :class="{ hot: unread > 0 }" @click="toggle">
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path
            d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3.5 3v-3h-1a2 2 0 0 1-2-2z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
        <span class="lbl">{{ title }}</span>
        <span v-if="unread > 0" class="badge">{{ badge }}</span>
        <span v-else-if="messages.length" class="total">{{ messages.length }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.dock {
  position: fixed;
  left: 18px;
  bottom: 18px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--chrome);
  color: var(--label);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-1), inset 0 0 0 1px var(--separator);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.pill:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-2), inset 0 0 0 1px var(--separator-strong);
}

.pill:active {
  transform: scale(0.97);
}

.pill svg {
  color: var(--label-2);
}

.badge,
.total {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.badge {
  background: var(--red);
  color: #fff;
}

.hot svg {
  color: var(--red);
}

.total {
  background: var(--fill);
  color: var(--label-2);
}

.panel {
  width: min(400px, calc(100vw - 36px));
  max-height: min(58vh, 420px);
  display: flex;
  flex-direction: column;
  border-radius: var(--r-lg);
  background: var(--chrome);
  box-shadow: var(--shadow-2), inset 0 0 0 1px var(--separator);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px 9px 14px;
  border-bottom: 1px solid var(--separator);
}

.count {
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label-2);
  font-size: 11px;
  font-weight: 700;
}

.mini {
  min-height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.mini:hover:not(:disabled) {
  background: var(--fill-strong);
  color: var(--label);
}

.mini:disabled {
  opacity: 0.4;
  cursor: default;
}

.mini.icon {
  display: grid;
  place-items: center;
  width: 26px;
  padding: 0;
}

.list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.list li {
  display: flex;
  gap: 9px;
  padding: 6px 14px;
  font-size: 12.5px;
}

.list li + li {
  border-top: 1px solid var(--separator);
}

.time {
  flex: none;
  color: var(--label-3);
}

.text {
  color: var(--label-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.empty {
  margin: 0;
  padding: 22px 14px;
  color: var(--label-3);
  font-size: 13px;
  text-align: center;
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s var(--ease), transform 0.2s var(--ease);
  transform-origin: bottom left;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

@media (max-width: 560px) {
  .dock {
    left: 14px;
    right: 14px;
    bottom: 14px;
    align-items: stretch;
  }

  .pill {
    justify-content: center;
  }
}
</style>
