<script setup>
/**
 * The ranges behind the answer on screen, as a sheet over the panel. What is
 * drawn inside is RangesView, which the solve history also uses inline.
 */
import { computed } from 'vue'
import InfoSheet from './InfoSheet.vue'
import RangesView from './RangesView.vue'
import { t } from '../lib/i18n'

const props = defineProps({
  /** The hand's records, earliest street first (the coordinator's `table.ranges`). */
  streets: { type: Array, default: () => [] },
  /** The street to open on — the one the answer on screen was given for. */
  street: { type: String, default: null },
})
defineEmits(['close'])

const source = computed(() => {
  const rec = props.streets.find((s) => s.street === props.street) || props.streets.at(-1)
  return rec?.source || null
})
</script>

<template>
  <InfoSheet
    wide
    :title="t('ranges.title')"
    :subtitle="source ? t('ranges.subtitle', { source }) : ''"
    @close="$emit('close')"
  >
    <RangesView :streets="streets" :street="street" />
  </InfoSheet>
</template>
