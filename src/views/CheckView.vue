<script setup>
/**
 * The screenshot check — the same POST /checkScreenshot multipart the old
 * check.html submitted (image, check2, crop, tableIndex), except the response
 * is rendered inline instead of replacing the page, so you can iterate on a
 * crop without re-picking the file.
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import AppNav from '../components/AppNav.vue'
import { serverInput, server, setServer, httpUrl, displayHost } from '../lib/server'

const draft = ref(serverInput.value)
const file = ref(null)
const previewUrl = ref(null)
const check2 = ref(false)
const crop = ref('')
const tableIndex = ref('')
const dragging = ref(false)
const busy = ref(false)
const error = ref(null)
const resultUrl = ref(null)
const resultText = ref(null)
const elapsed = ref(null)

const canSubmit = computed(() => !!file.value && !!server.value && !busy.value)

const cropValid = computed(() => {
  const t = crop.value.trim()
  if (!t) return true
  return /^\s*\d+\s*(,\s*\d+\s*){3}$/.test(t)
})

function revoke(url) {
  if (url) URL.revokeObjectURL(url)
}

function pick(f) {
  if (!f) return
  revoke(previewUrl.value)
  file.value = f
  previewUrl.value = URL.createObjectURL(f)
  error.value = null
}

function onInput(e) {
  pick(e.target.files?.[0])
}

function onDrop(e) {
  dragging.value = false
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
  pick(f)
}

function onPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
  if (item) pick(item.getAsFile())
}

async function submit() {
  if (!canSubmit.value) return
  if (!cropValid.value) {
    error.value = 'Crop must be four comma-separated integers, e.g. 100,80,640,480'
    return
  }
  setServer(draft.value)
  const url = httpUrl('/checkScreenshot')
  if (!url) {
    error.value = 'Set a server URL first'
    return
  }

  busy.value = true
  error.value = null
  revoke(resultUrl.value)
  resultUrl.value = null
  resultText.value = null
  const started = performance.now()

  const body = new FormData()
  body.append('image', file.value, file.value.name || 'screenshot.png')
  if (check2.value) body.append('check2', 'true')
  if (crop.value.trim()) body.append('crop', crop.value.trim())
  if (tableIndex.value !== '') body.append('tableIndex', String(tableIndex.value))

  try {
    const res = await fetch(url, { method: 'POST', body })
    const type = res.headers.get('content-type') || ''
    if (!res.ok) {
      error.value = `${res.status} ${res.statusText} — ${(await res.text()).slice(0, 600)}`
      return
    }
    if (type.startsWith('image/')) {
      resultUrl.value = URL.createObjectURL(await res.blob())
    } else {
      const text = await res.text()
      resultText.value = text || '(empty response)'
    }
  } catch (e) {
    error.value = `Request failed: ${e}. Check the host and that it allows this origin.`
  } finally {
    elapsed.value = Math.round(performance.now() - started)
    busy.value = false
  }
}

function reset() {
  revoke(previewUrl.value)
  revoke(resultUrl.value)
  file.value = null
  previewUrl.value = null
  resultUrl.value = null
  resultText.value = null
  error.value = null
}

onBeforeUnmount(() => {
  revoke(previewUrl.value)
  revoke(resultUrl.value)
})
</script>

<template>
  <div class="wrap" @paste="onPaste">
    <AppNav title="Screenshot check" :subtitle="displayHost()" :back="{ name: 'connect' }" />

    <div class="page">
      <section class="intro">
        <h1>Check a screenshot</h1>
        <p class="lede">
          Posts to <code>/checkScreenshot</code>. With no crop the image goes through the
          extractor’s debug pass; with a crop it comes back cropped to those coordinates.
        </p>
      </section>

      <div class="card block">
        <label class="eyebrow" for="host">Server</label>
        <input
          id="host"
          v-model="draft"
          class="field"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          placeholder="localhost:8080"
        />
      </div>

      <div
        class="drop card"
        :class="{ over: dragging, filled: !!file }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <input id="image" class="fileinput" type="file" accept="image/*" @change="onInput" />
        <template v-if="previewUrl">
          <img class="preview" :src="previewUrl" alt="Selected screenshot" />
          <div class="dropmeta">
            <strong>{{ file.name }}</strong>
            <span class="muted">{{ (file.size / 1024).toFixed(0) }} KB</span>
            <label class="btn btn-sm" for="image">Replace</label>
            <button class="btn btn-sm" @click="reset">Clear</button>
          </div>
        </template>
        <label v-else class="dropzone" for="image">
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          <strong>Drop an image, paste, or choose a file</strong>
          <span class="muted">PNG or JPEG</span>
        </label>
      </div>

      <div class="card block opts">
        <label class="opt">
          <span>
            <strong>Check 2</strong>
            <span class="muted">Second-pass processor instead of the extractor debug pass</span>
          </span>
          <input v-model="check2" type="checkbox" class="switch" />
        </label>

        <div class="hair" />

        <label class="opt col">
          <span>
            <strong>Crop</strong>
            <span class="muted">Four integers: x1, y1, x2, y2. Leave empty for a full check.</span>
          </span>
          <input
            v-model="crop"
            class="field"
            :class="{ bad: !cropValid }"
            type="text"
            inputmode="numeric"
            placeholder="100,80,640,480"
          />
        </label>

        <div class="hair" />

        <label class="opt col">
          <span>
            <strong>Table index for crop</strong>
            <span class="muted">Which table the crop coordinates belong to</span>
          </span>
          <input v-model="tableIndex" class="field" type="number" min="0" placeholder="0" />
        </label>
      </div>

      <div class="submit">
        <button class="btn btn-primary big" :disabled="!canSubmit" @click="submit">
          {{ busy ? 'Checking…' : 'Check screenshot' }}
        </button>
        <span v-if="elapsed != null && !busy" class="muted">{{ elapsed }} ms</span>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <section v-if="resultUrl || resultText" class="card result">
        <div class="rhead">
          <span class="eyebrow">Response</span>
          <div class="spacer" />
          <a v-if="resultUrl" class="btn btn-sm" :href="resultUrl" download="check.png">
            Download
          </a>
        </div>
        <img v-if="resultUrl" class="rimg" :src="resultUrl" alt="Check result" />
        <pre v-else class="raw mono">{{ resultText }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100%;
}

.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.intro {
  padding: 20px 0 4px;
}

.lede {
  margin: 8px 0 0;
  max-width: 60ch;
  color: var(--label-2);
}

code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--fill);
}

.block {
  padding: 14px 16px 16px;
}

.block .field {
  margin-top: 6px;
}

.drop {
  padding: 14px;
  border: 1.5px dashed var(--separator-strong);
  transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
}

.drop.over {
  border-color: var(--blue);
  background: color-mix(in srgb, var(--blue) 8%, var(--bg-elevated));
}

.drop.filled {
  border-style: solid;
  border-color: transparent;
}

.fileinput {
  display: none;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 34px 16px;
  color: var(--label-2);
  cursor: pointer;
  text-align: center;
}

.dropzone strong {
  color: var(--label);
  font-size: 15px;
}

.dropzone span {
  font-size: 13px;
}

.preview {
  display: block;
  width: 100%;
  max-height: 340px;
  object-fit: contain;
  border-radius: var(--r-md);
  background: var(--fill);
}

.dropmeta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 13px;
}

.dropmeta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropmeta .btn {
  margin-left: auto;
}

.dropmeta .btn + .btn {
  margin-left: 0;
}

.opts {
  padding: 4px 16px;
}

.opt {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 0;
  cursor: pointer;
}

.opt.col {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.opt > span {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  font-size: 14px;
}

.opt .muted {
  font-size: 12.5px;
}

.switch {
  appearance: none;
  width: 50px;
  height: 30px;
  flex: none;
  border-radius: var(--r-pill);
  background: var(--fill-strong);
  position: relative;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform var(--dur) var(--ease);
}

.switch:checked {
  background: var(--green);
}

.switch:checked::after {
  transform: translateX(20px);
}

.field.bad {
  border-color: var(--red);
}

.submit {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.big {
  min-height: 46px;
  padding: 0 26px;
  font-size: 16px;
}

.error {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--red) 12%, transparent);
  color: color-mix(in srgb, var(--red) 88%, var(--label));
  font-size: 13.5px;
  overflow-wrap: anywhere;
}

.result {
  padding: 12px 14px 14px;
}

.rhead {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.rimg {
  display: block;
  width: 100%;
  border-radius: var(--r-md);
  background: var(--fill);
}

.raw {
  margin: 0;
  padding: 12px;
  max-height: 360px;
  overflow: auto;
  border-radius: var(--r-md);
  background: var(--fill);
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
