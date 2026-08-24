/**
 * Interface language: English or Russian, remembered.
 *
 * Deliberately tiny — one reactive `locale` ref and a lookup, no plugin. Every
 * `t()` call reads `locale.value`, so a component that renders one is already
 * subscribed to the language and re-renders on a change; nothing has to be
 * re-mounted and no key has to be threaded through the tree.
 *
 * Two rules the message files rely on:
 *
 *   - English is the DEFAULT and the fallback. A key another locale has not
 *     translated yet resolves to the English string rather than to the key, so
 *     an unfinished translation reads as a sentence in the wrong language
 *     instead of as `regimeBar.parkedGto` on screen.
 *   - a lib module never holds a translated string. Anything below components
 *     (the regime refusals, the parser's warnings) returns a `{ key, params }`
 *     pair — see `tk()` — so the sentence is built at render time in whatever
 *     language is selected then, not in whichever one was up when the snapshot
 *     arrived.
 *
 * `initLocale()` runs from main.js before mount, the same way the theme does,
 * so the first paint is already in the remembered language.
 */

import { computed, ref } from 'vue'
import { readStored, writeStored, oneOf } from './persist'
import en from '../locales/en'
import ru from '../locales/ru'

const KEY = 'zigsolver.locale'

/** Cycle order for the nav button. `short` is what the button shows. */
export const LOCALES = [
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'ru', label: 'Русский', short: 'RU' },
]

const MESSAGES = { en, ru }
const DEFAULT_LOCALE = 'en'

const sanitize = oneOf(LOCALES.map((l) => l.value))

export const locale = ref(DEFAULT_LOCALE)

export const localeInfo = computed(
  () => LOCALES.find((l) => l.value === locale.value) || LOCALES[0],
)

function walk(bag, path) {
  let node = bag
  for (const part of path) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return node
}

/** The raw entry for `key` — a string, a plural object, an array, or undefined. */
function resolve(key) {
  const path = String(key).split('.')
  const hit = walk(MESSAGES[locale.value], path)
  return hit === undefined ? walk(MESSAGES[DEFAULT_LOCALE], path) : hit
}

const FIELD = /\{(\w+)\}/g

function fill(text, params) {
  if (!params) return text
  return text.replace(FIELD, (m, name) =>
    params[name] === undefined || params[name] === null ? m : String(params[name]),
  )
}

/** The translation of `key`, with `{name}` placeholders filled from `params`. */
export function t(key, params) {
  const hit = resolve(key)
  return typeof hit === 'string' ? fill(hit, params) : String(key)
}

/** Whether `key` resolves to anything at all — for the optional sections. */
export function te(key) {
  return resolve(key) !== undefined
}

/**
 * The raw entry, for the arrays and label maps the UI iterates, or `fallback`.
 * Also the escape hatch for a key that may not exist: `tv('street.' + s, s)`.
 */
export function tv(key, fallback = null) {
  const hit = resolve(key)
  return hit === undefined ? fallback : hit
}

const rules = {}

function ruleFor(value) {
  if (!rules[value]) rules[value] = new Intl.PluralRules(value)
  return rules[value]
}

/**
 * A counted translation. The entry is an object of CLDR plural categories —
 * `{ one, other }` in English, `{ one, few, many }` in Russian — and `count` is
 * always available to the string as `{count}`.
 */
export function tp(key, count, params) {
  const hit = resolve(key)
  const merged = { ...params, count }
  if (!hit || typeof hit !== 'object') return t(key, merged)
  const form = hit[ruleFor(locale.value).select(count)] ?? hit.other ?? hit.many
  return form === undefined ? String(key) : fill(String(form), merged)
}

/**
 * Render a `{ key, params, count }` pair from a lib module. Null in, '' out —
 * the refusals are null whenever there is nothing to refuse.
 */
export function tk(entry) {
  if (!entry || !entry.key) return ''
  return entry.count === undefined
    ? t(entry.key, entry.params)
    : tp(entry.key, entry.count, entry.params)
}

export function setLocale(value) {
  const next = sanitize(value) || DEFAULT_LOCALE
  locale.value = next
  document.documentElement.lang = next
  // English is the absence of a choice, so it is stored as the absence of a
  // key — the same bargain the theme makes with 'system'.
  writeStored(KEY, next === DEFAULT_LOCALE ? undefined : next)
}

export function cycleLocale() {
  const at = LOCALES.findIndex((l) => l.value === locale.value)
  setLocale(LOCALES[(at + 1) % LOCALES.length].value)
}

/** Read the stored choice and put it on <html lang>. Call once, before mount. */
export function initLocale() {
  locale.value = sanitize(readStored(KEY)) || DEFAULT_LOCALE
  document.documentElement.lang = locale.value
}
