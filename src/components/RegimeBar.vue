<script setup>
/**
 * What to ask the solver, and the table commands.
 *
 * The regime is here rather than in the settings sheet on purpose: everything
 * in settings is how a solve is REQUESTED and you set it once, while this is
 * which question you are asking, and it changes hand to hand.
 *
 * Picking one re-solves the snapshot on screen. `Manual` does not — it puts
 * the table into ask-before-each-solve mode, and the asking happens where the
 * answer will be.
 *
 * Read / Bot / Pause keep their tokens and the "E" shortcut.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import HelpButton from './HelpButton.vue'
import InfoSheet from './InfoSheet.vue'
import { REGIMES } from '../lib/regime'
import { settings } from '../lib/settings'

const props = defineProps({
  /** Socket state — the table commands need it; a re-solve does not. */
  disabled: { type: Boolean, default: false },
  /** 'gto' | 'exploit' | 'manual' */
  selected: { type: String, default: 'gto' },
  /** Whether the exploit regime can answer the snapshot on screen, and why not. */
  exploitOk: { type: Boolean, default: true },
  exploitWhy: { type: String, default: null },
  solving: { type: Boolean, default: false },
  canSolve: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'command', 'resolve', 'settings'])

const helpFor = ref(null)

/** The line under the picker: what the next solve will actually ask for. */
const note = computed(() => {
  if (props.selected === 'manual') {
    return props.exploitOk
      ? 'Each decision stops and asks before anything is sent.'
      : `Answered GTO without asking: ${props.exploitWhy}.`
  }
  if (props.selected === 'exploit' && !props.exploitOk) {
    return `Falls back to GTO here: ${props.exploitWhy}.`
  }
  return REGIMES.find((r) => r.value === props.selected)?.tagline || ''
})

const degraded = computed(
  () => props.selected !== 'gto' && !props.exploitOk,
)

function onKey(e) {
  // Not while typing, and not while a help sheet has the screen.
  if (e.target instanceof Element && e.target.closest('input, textarea, select, .sheet')) return
  if (helpFor.value) return
  if (e.key === 'e' || e.key === 'E') emit('command', 'read')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="bar card">
    <section class="block">
      <div class="row head">
        <span class="eyebrow">Regime</span>
        <span class="muted note">What the solver is asked for</span>
        <div class="spacer" />
        <span v-if="solving" class="solving"><span class="spinner" />Solving…</span>
      </div>

      <div class="regimes">
        <div
          v-for="r in REGIMES"
          :key="r.value"
          class="rwrap"
          :class="{ on: selected === r.value, inert: r.value === 'exploit' && !exploitOk }"
        >
          <button class="rbtn" :title="r.tagline" @click="emit('select', r.value)">
            {{ r.short }}
          </button>
          <HelpButton :size="17" :label="`About ${r.title}`" @click="helpFor = r" />
        </div>
      </div>

      <p class="line" :class="{ warn: degraded }">{{ note }}</p>
    </section>

    <div class="hair" />

    <section class="block bottom">
      <div class="solve">
        <span class="eyebrow">Solve</span>
        <button class="btn btn-sm" :disabled="!canSolve || solving" @click="emit('resolve')">
          Re-solve
        </button>
        <button class="settings-chip" title="Solve settings" @click="emit('settings')">
          <span class="mono">{{ settings.maxSolveTime }}s</span>
          <span v-if="!settings.autoSolve" class="flag">manual send</span>
          <span v-if="!settings.useHandCache" class="flag">no cache</span>
          <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">
            <path
              d="M5 7.5 L10 12.5 L15 7.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="cmds">
        <span class="eyebrow">Table</span>
        <button class="btn" :disabled="disabled" @click="emit('command', 'read')">
          Read <kbd>E</kbd>
        </button>
        <button class="btn btn-success" :disabled="disabled" @click="emit('command', 'bot')">
          Bot
        </button>
        <button class="btn btn-danger" :disabled="disabled" @click="emit('command', 'pause')">
          Pause
        </button>
      </div>
    </section>

    <InfoSheet
      v-if="helpFor"
      :title="helpFor.title"
      :subtitle="helpFor.tagline"
      @close="helpFor = null"
    >
      <p class="para">{{ helpFor.detail }}</p>
      <template v-if="helpFor.limits">
        <h4>Where it does not apply</h4>
        <p class="para">{{ helpFor.limits }}</p>
      </template>
      <template v-if="helpFor.value === 'exploit'">
        <h4>Reading the answer</h4>
        <p class="para">
          The panel lists every action with its EV, best first, and the top row is the move —
          there is no frequency to mix at. <strong>EV</strong> is counted from this decision on:
          chips already in the pot are sunk, so folding is 0 and everything else is read against
          it. <strong>Support</strong> is how much real play the size models saw at that size; a
          winning branch with thin support is one the models are extrapolating on, and the
          warnings say so.
        </p>
      </template>
    </InfoSheet>
  </div>
</template>

<style scoped>
.bar {
  padding: 14px 16px 16px;
}

.head {
  margin-bottom: 10px;
}

.note {
  font-size: 11.5px;
}

.solving {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--blue);
  font-size: 12px;
  font-weight: 620;
}

.spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--fill-strong);
  border-top-color: var(--blue);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.regimes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rwrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 2px;
  border-radius: var(--r-pill);
  background: var(--fill);
  transition: background-color var(--dur) var(--ease);
}

.rwrap:hover {
  background: var(--fill-strong);
}

.rwrap.on {
  background: color-mix(in srgb, var(--blue) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 55%, transparent);
}

/* Selectable, but it would not answer this spot — say so before the click
   rather than only in the warnings afterwards. */
.rwrap.inert .rbtn {
  color: var(--label-3);
}

.rwrap.on.inert {
  background: color-mix(in srgb, var(--orange) 20%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--orange) 55%, transparent);
}

.rbtn {
  min-height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--label);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform var(--dur) var(--ease);
}

.rwrap.on .rbtn {
  color: var(--blue);
}

.rwrap.on.inert .rbtn {
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

.rbtn:active {
  transform: scale(0.94);
}

.line {
  margin: 9px 2px 0;
  color: var(--label-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.line.warn {
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

.bottom {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.solve,
.cmds {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cmds {
  margin-left: auto;
}

.settings-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 9px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--label-2);
  font-size: 12.5px;
  font-weight: 620;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.settings-chip:hover {
  background: var(--fill-strong);
  color: var(--label);
}

.flag {
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: color-mix(in srgb, var(--orange) 22%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
  font-size: 10.5px;
  font-weight: 700;
}

kbd {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--fill-strong);
  font-family: var(--font-mono);
  font-size: 10px;
}

h4 {
  margin: 18px 0 6px;
  font-size: 13px;
  font-weight: 680;
}

.para {
  margin: 0;
  color: var(--label-2);
  font-size: 14px;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .bottom {
    flex-direction: column;
    align-items: stretch;
  }

  .cmds {
    margin-left: 0;
  }

  .cmds .btn {
    flex: 1;
  }
}
</style>
