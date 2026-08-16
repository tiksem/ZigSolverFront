<script setup>
/**
 * The opponent read, and what to do with it.
 *
 * Picking one re-solves the current snapshot against it (a `profile` on the
 * /move call) and, when it is a real profile name, also tells the runner over
 * the socket — the same token the old page sent, so the bot's own play follows
 * the read you are looking at.
 *
 * Two entries are not profiles:
 *   Auto  let the endpoint fit a read from the villain's own HUD stats
 *   GTO   autoProfile: false — the equilibrium answer, no read at all
 *
 * Read / Bot / Pause keep their tokens and the "E" shortcut.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import HelpButton from './HelpButton.vue'
import InfoSheet from './InfoSheet.vue'
import { PROFILES, PROFILE_GROUPS, SIGNATURE_FIELDS } from '../lib/profiles'
import { settings } from '../lib/settings'

const props = defineProps({
  /** Socket state — the table commands need it; a re-solve does not. */
  disabled: { type: Boolean, default: false },
  /** 'auto' | 'gto' | a profile name */
  selected: { type: String, default: 'auto' },
  solving: { type: Boolean, default: false },
  canSolve: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'command', 'resolve', 'settings'])

const SPECIAL = [
  {
    name: 'auto',
    short: 'AUTO',
    title: 'Automatic read',
    description:
      'No profile is named: the endpoint fits one from the villain seat’s own HUD stats in ' +
      'the snapshot (VPIP, PFR, 3BET, ATS and the postflop columns), and the answer is the ' +
      'best response to it.',
    exploit:
      'Fewer than three usable stats is treated as no read at all — a profile fitted to one ' +
      'number is noise wearing a temperature — and it falls back to the `population` profile ' +
      'instead, because an opponent you know nothing about is still a draw from the ' +
      'calibration population rather than an equilibrium player. The response says which one ' +
      'it resolved to.',
  },
  {
    name: 'gto',
    short: 'GTO',
    title: 'GTO only',
    description:
      'Sends autoProfile: false. No read is fitted and no exploit pass runs — the answer is ' +
      'the equilibrium strategy at this node.',
    exploit:
      'Use it as the reference point: it is what every exploit answer deviates from, and the ' +
      'strategy that gives up nothing to an opponent who is playing you back.',
  },
]

const helpFor = ref(null)

const grouped = computed(() =>
  PROFILE_GROUPS.map((g) => ({
    ...g,
    items: PROFILES.filter((p) => p.group === g.key),
  })).filter((g) => g.items.length),
)

const signature = computed(() => {
  const p = helpFor.value
  if (!p || !p.stats) return []
  return SIGNATURE_FIELDS.filter(([k]) => p.stats[k] != null).map(([k, label, unit]) => ({
    key: k,
    label,
    value: p.stats[k],
    unit,
  }))
})

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
        <span class="eyebrow">Opponent read</span>
        <span class="muted note">Re-solves this hand; a named profile is also sent to the table</span>
        <div class="spacer" />
        <span v-if="solving" class="solving"><span class="spinner" />Solving…</span>
      </div>

      <div class="group">
        <div class="glabel">No named read</div>
        <div class="profiles">
          <div
            v-for="s in SPECIAL"
            :key="s.name"
            class="pwrap"
            :class="{ on: selected === s.name }"
          >
            <button class="pbtn" :title="s.title" @click="emit('select', s.name)">
              {{ s.short }}
            </button>
            <HelpButton :size="17" :label="`About ${s.title}`" @click="helpFor = s" />
          </div>
        </div>
      </div>

      <div v-for="group in grouped" :key="group.key" class="group">
        <div class="glabel">{{ group.label }}</div>
        <div class="profiles">
          <div
            v-for="p in group.items"
            :key="p.name"
            class="pwrap"
            :class="{ on: selected === p.name }"
          >
            <button class="pbtn" :title="p.title" @click="emit('select', p.name)">
              {{ p.short }}
            </button>
            <HelpButton
              :size="17"
              :label="`About the ${p.title} profile`"
              @click="helpFor = p"
            />
          </div>
        </div>
      </div>
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
          <span v-if="!settings.autoSolve" class="flag">manual</span>
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
      :subtitle="helpFor.cluster || (helpFor.stats ? `profile: ${helpFor.name}` : '')"
      @close="helpFor = null"
    >
      <p class="para">{{ helpFor.description }}</p>

      <h4>{{ helpFor.stats ? 'How it differs, and what beats it' : 'What that means' }}</h4>
      <p class="para">{{ helpFor.exploit }}</p>

      <template v-if="signature.length">
        <h4>Cluster signature</h4>
        <div class="sig">
          <div v-for="s in signature" :key="s.key" class="sigrow">
            <span class="sk">{{ s.label }}</span>
            <span class="sv tnum">{{ s.value }}{{ s.unit }}</span>
          </div>
        </div>
      </template>

      <template v-if="helpFor.temp != null">
        <h4>Serving</h4>
        <div class="sig">
          <div class="sigrow">
            <span class="sk">Temperature</span>
            <span class="sv tnum">{{ helpFor.temp }}</span>
          </div>
          <div class="sigrow">
            <span class="sk">Serving intensity</span>
            <span class="sv tnum">{{ helpFor.serving }}</span>
          </div>
        </div>
        <p class="fine">
          The exploit answer is computed, not tabulated: this profile’s behavioural model is
          frozen on the opponent of the acting seat and the hero best-responds to it. The
          temperature is a KL tilt back toward GTO — it keeps the answer equilibrium-shaped where
          actions are close in EV and only commits where the modelled edge is large. A lower
          temperature deviates harder.
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

.group + .group {
  margin-top: 10px;
}

.glabel {
  margin: 0 0 6px 2px;
  color: var(--label-3);
  font-size: 11px;
  font-weight: 600;
}

.profiles {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.pwrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 2px;
  border-radius: var(--r-pill);
  background: var(--fill);
  transition: background-color var(--dur) var(--ease);
}

.pwrap:hover {
  background: var(--fill-strong);
}

.pwrap.on {
  background: color-mix(in srgb, var(--blue) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 55%, transparent);
}

.pbtn {
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--label);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform var(--dur) var(--ease);
}

.pwrap.on .pbtn {
  color: var(--blue);
}

.pbtn:active {
  transform: scale(0.94);
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

.fine {
  margin: 12px 0 0;
  color: var(--label-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.sig {
  border-radius: var(--r-md);
  background: var(--fill);
  overflow: hidden;
}

.sigrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  font-size: 13px;
}

.sigrow + .sigrow {
  border-top: 1px solid var(--separator);
}

.sk {
  color: var(--label-2);
}

.sv {
  font-weight: 640;
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
