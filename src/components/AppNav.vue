<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

defineProps({
  title: { type: String, default: 'ZigSolver' },
  subtitle: { type: String, default: '' },
  back: { type: Object, default: null },
  /** Match the wider two-column page instead of the default reading width. */
  wide: { type: Boolean, default: false },
})

const theme = ref(document.documentElement.dataset.theme || 'system')

const ORDER = ['system', 'light', 'dark']

function cycleTheme() {
  theme.value = ORDER[(ORDER.indexOf(theme.value) + 1) % ORDER.length]
  if (theme.value === 'system') {
    delete document.documentElement.dataset.theme
    localStorage.removeItem('zigsolver.theme')
  } else {
    document.documentElement.dataset.theme = theme.value
    localStorage.setItem('zigsolver.theme', theme.value)
  }
}

onMounted(() => {
  theme.value = document.documentElement.dataset.theme || 'system'
})
</script>

<template>
  <header class="nav">
    <div class="inner" :class="{ wide }">
      <RouterLink v-if="back" class="back" :to="back">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path
            d="M12.5 4 L6.5 10 L12.5 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>Tables</span>
      </RouterLink>

      <div class="titles">
        <div class="t">{{ title }}</div>
        <div v-if="subtitle" class="s">{{ subtitle }}</div>
      </div>

      <div class="right">
        <slot />
        <button class="theme" :title="`Appearance: ${theme}`" @click="cycleTheme">
          <svg v-if="theme === 'light'" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="3.6" fill="currentColor" />
            <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <path d="M10 1.6v2.2M10 16.2v2.2M18.4 10h-2.2M3.8 10H1.6" />
              <path d="M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6M15.9 15.9l-1.6-1.6M5.7 5.7L4.1 4.1" />
            </g>
          </svg>
          <svg v-else-if="theme === 'dark'" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M16.3 12.4A6.9 6.9 0 0 1 7.6 3.7a6.9 6.9 0 1 0 8.7 8.7z"
              fill="currentColor"
            />
          </svg>
          <svg v-else viewBox="0 0 20 20" aria-hidden="true">
            <circle
              cx="10"
              cy="10"
              r="6.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
            />
            <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--chrome);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--separator);
}

.inner {
  max-width: 1180px;
  margin: 0 auto;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
}

.inner.wide {
  max-width: 1760px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: -6px;
  padding: 4px 8px 4px 4px;
  border-radius: var(--r-pill);
  color: var(--blue);
  font-size: 15px;
  font-weight: 590;
  transition: background-color var(--dur) var(--ease);
}

.back:hover {
  background: var(--fill);
}

.titles {
  min-width: 0;
}

.t {
  font-size: 16px;
  font-weight: 680;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.s {
  color: var(--label-2);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.theme:hover {
  background: var(--fill-strong);
  color: var(--label);
}

.theme svg {
  width: 17px;
  height: 17px;
}

@media (max-width: 640px) {
  .inner {
    padding: 8px 14px;
  }
}
</style>
