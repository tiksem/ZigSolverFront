<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click.self="emit('close')">
      <Transition name="pop" appear>
        <div class="sheet" role="dialog" aria-modal="true">
          <header class="head">
            <div class="titles">
              <h3>{{ title }}</h3>
              <p v-if="subtitle" class="sub">{{ subtitle }}</p>
            </div>
            <button class="x" aria-label="Close" @click="emit('close')">
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
                <path
                  d="M4 4 L16 16 M16 4 L4 16"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>
          <div class="body">
            <slot />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  animation: fadein 0.18s var(--ease);
}

@keyframes fadein {
  from {
    opacity: 0;
  }
}

.sheet {
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 20px 12px;
}

.titles {
  min-width: 0;
  flex: 1;
}

h3 {
  font-size: 20px;
}

.sub {
  margin: 3px 0 0;
  color: var(--label-2);
  font-size: 13px;
}

.x {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}

.x:hover {
  background: var(--fill-strong);
  color: var(--label);
}

.body {
  padding: 0 20px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (max-width: 560px) {
  .scrim {
    padding: 0;
    align-items: flex-end;
  }

  .sheet {
    max-height: 88vh;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
  }
}
</style>
