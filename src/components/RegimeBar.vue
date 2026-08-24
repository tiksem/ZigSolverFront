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
 * answer will be. `Advanced` opens its two knobs first and re-solves when they
 * are closed, so the solve is drawn at the mix you just set rather than the one
 * you are about to change.
 *
 * Read / Bot / Pause keep their tokens and the "E" shortcut.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import HelpButton from './HelpButton.vue'
import InfoSheet from './InfoSheet.vue'
import AdvancedSheet from './AdvancedSheet.vue'
import {
  REGIMES,
  regime as regimeState,
  MIN_STATS_FOR_EXPLOIT,
  thinReadReason,
} from '../lib/regime'
import { settings } from '../lib/settings'
import { t, tk } from '../lib/i18n'

const props = defineProps({
  /** Socket state — the table commands need it; a re-solve does not. */
  disabled: { type: Boolean, default: false },
  /** 'gto' | 'exploit' | 'manual' | 'advanced' */
  selected: { type: String, default: 'gto' },
  /** lib/regime.exploitAvailability for this hand: { status, ok, why }. */
  exploit: { type: Object, default: () => ({ status: 'pending', ok: false, why: null }) },
  /** The HUD stats read on this spot's villain — what Advanced's gate looks at. */
  statNames: { type: Array, default: () => [] },
  /** What the last Advanced draw sent, and why it was not the coin's. */
  drew: { type: Object, default: null },
  solving: { type: Boolean, default: false },
  canSolve: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'command', 'resolve', 'settings'])

const helpFor = ref(null)
const advanced = ref(false)

/**
 * Selectable, but it would not answer this hand the way its name says.
 *
 * Only a real refusal greys a chip. Preflop and the empty screen are `pending`,
 * and dimming Exploit there would be telling the operator their selection is
 * not in effect when all that has happened is that the flop has not come.
 */
const inert = (value) =>
  (value === 'exploit' || value === 'advanced') && props.exploit.status === 'no'

/** Advanced's gate on this hand's villain — the coin is skipped under it. */
const gated = computed(
  () => regimeState.requireStats && props.statNames.length < MIN_STATS_FOR_EXPLOIT,
)

/**
 * Nothing decided yet: no snapshot, or preflop. The regime is chosen on the
 * flop and preflop is the preflop algorithm's either way, so this state gets a
 * plain statement of what the selection will do — never a fallback warning.
 *
 * Only the modes whose pending line differs from their tagline have a key under
 * `regimeBar.pending`; the rest fall through to the tagline rather than
 * repeating it in two places.
 */
const PENDING = ['exploit', 'manual', 'advanced']

const tagline = computed(() => t(`regime.${props.selected}.tagline`))

/** The line under the picker: what the next solve will actually ask for. */
const note = computed(() => {
  if (props.exploit.status === 'pending') {
    return PENDING.includes(props.selected)
      ? t(`regimeBar.pending.${props.selected}`)
      : tagline.value
  }

  const why = tk(props.exploit.why)

  if (props.selected === 'manual') {
    return props.exploit.ok
      ? t('regimeBar.manualAsks')
      : t('regimeBar.manualSkipped', { why })
  }
  if (props.selected === 'exploit' && !props.exploit.ok) {
    return t('regimeBar.exploitRefused', { why })
  }
  if (props.selected === 'advanced') {
    if (!props.exploit.ok) return t('regimeBar.advancedRefused', { why })
    if (gated.value) {
      return t('regimeBar.advancedRefused', { why: tk(thinReadReason(props.statNames.length)) })
    }
    const pct = regimeState.exploitPct
    // The ends are legal settings and are how the mode is parked; reporting
    // them as a mix would be describing a coin that has only one side.
    if (pct === 0) return t('regimeBar.parkedGto')
    if (pct === 100) return t('regimeBar.parkedExploit')
    // The coin belongs to the hand, so it is reported as the hand's, not as the
    // last thing that happened to be rolled.
    const drew = props.drew
      ? t('regimeBar.drew', { regime: t(`regime.${props.drew.coin}.title`) })
      : ''
    return `${t('regimeBar.mix', { pct })}${drew}`
  }
  return tagline.value
})

/** Orange is for a hand that is not being played the way the chip says. */
const degraded = computed(
  () =>
    props.selected !== 'gto' &&
    (props.exploit.status === 'no' ||
      (props.selected === 'advanced' && props.exploit.ok && gated.value)),
)

/**
 * Advanced is picked and configured in one gesture: the chip selects it and
 * opens the knobs, and the solve waits until they are closed.
 */
function pick(value) {
  emit('select', value)
  if (value === 'advanced') advanced.value = true
}

function closeAdvanced() {
  advanced.value = false
  // A fresh draw at whatever the mix is now — the same thing selecting any
  // other regime does.
  if (props.canSolve) emit('resolve')
}

function onKey(e) {
  // Not while typing, and not while a help sheet has the screen.
  if (e.target instanceof Element && e.target.closest('input, textarea, select, .sheet')) return
  if (helpFor.value || advanced.value) return
  if (e.key === 'e' || e.key === 'E') emit('command', 'read')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="bar card">
    <section class="block">
      <div class="row head">
        <span class="eyebrow">{{ t('regimeBar.heading') }}</span>
        <span class="muted note">{{ t('regimeBar.note') }}</span>
        <div class="spacer" />
        <span v-if="solving" class="solving">
          <span class="spinner" />{{ t('regimeBar.solving') }}
        </span>
      </div>

      <div class="regimes">
        <div
          v-for="r in REGIMES"
          :key="r.value"
          class="rwrap"
          :class="{ on: selected === r.value, inert: inert(r.value) }"
        >
          <button class="rbtn" :title="t(`regime.${r.value}.tagline`)" @click="pick(r.value)">
            {{ t(`regime.${r.value}.short`) }}
            <span v-if="r.value === 'advanced'" class="mix mono">
              {{ regimeState.exploitPct }}%
            </span>
          </button>
          <HelpButton
            :size="17"
            :label="t('regimeBar.about', { name: t(`regime.${r.value}.title`) })"
            @click="helpFor = r"
          />
        </div>
      </div>

      <p class="line" :class="{ warn: degraded }">{{ note }}</p>
    </section>

    <div class="hair" />

    <section class="block bottom">
      <div class="solve">
        <span class="eyebrow">{{ t('regimeBar.solve') }}</span>
        <button class="btn btn-sm" :disabled="!canSolve || solving" @click="emit('resolve')">
          {{ t('regimeBar.resolve') }}
        </button>
        <button
          class="settings-chip"
          :title="t('regimeBar.solveSettings')"
          @click="emit('settings')"
        >
          <span class="mono">{{ settings.maxSolveTime }}s</span>
          <span v-if="!settings.autoSolve" class="flag">{{ t('regimeBar.manualSend') }}</span>
          <span v-if="!settings.useHandCache" class="flag">{{ t('regimeBar.noCache') }}</span>
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
        <span class="eyebrow">{{ t('regimeBar.tableCommands') }}</span>
        <button class="btn" :disabled="disabled" @click="emit('command', 'read')">
          {{ t('regimeBar.read') }} <kbd>E</kbd>
        </button>
        <button class="btn btn-success" :disabled="disabled" @click="emit('command', 'bot')">
          {{ t('regimeBar.bot') }}
        </button>
        <button class="btn btn-danger" :disabled="disabled" @click="emit('command', 'pause')">
          {{ t('regimeBar.pause') }}
        </button>
      </div>
    </section>

    <AdvancedSheet
      v-if="advanced"
      :exploit="exploit"
      :stat-names="statNames"
      @close="closeAdvanced"
    />

    <InfoSheet
      v-if="helpFor"
      :title="t(`regime.${helpFor.value}.title`)"
      :subtitle="t(`regime.${helpFor.value}.tagline`)"
      @close="helpFor = null"
    >
      <p class="para">{{ t(`regime.${helpFor.value}.detail`) }}</p>
      <template v-if="helpFor.hasLimits">
        <h4>{{ t('regimeBar.limitsHeading') }}</h4>
        <p class="para">{{ t(`regime.${helpFor.value}.limits`) }}</p>
      </template>
      <template v-if="helpFor.value === 'exploit'">
        <h4>{{ t('regimeBar.answerHeading') }}</h4>
        <!-- v-html: the only markup is the <b> the message file itself carries,
             and the message files are part of this bundle. -->
        <p class="para" v-html="t('regimeBar.exploitAnswer')" />
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
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

/* The mix on the chip: the setting is one click away, but which one is set is
   the sort of thing you want to read without opening anything. */
.mix {
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--fill-strong);
  color: var(--label-2);
  font-size: 10.5px;
  font-weight: 700;
}

.rwrap.on .mix {
  background: color-mix(in srgb, var(--orange) 26%, transparent);
  color: color-mix(in srgb, var(--orange) 86%, var(--label));
}

.mono {
  font-family: var(--font-mono);
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
