<script setup lang="ts">
import { historySources } from './reading-history'
import EqualTabs from './EqualTabs.vue'

const source = defineModel<typeof historySources[number]['id']>({ required: true })
defineProps<{ label: string }>()
const items = historySources.map(tab => ({ label: tab.label, value: tab.id, avatar: tab.id === 'all' || tab.id === 'toon' ? undefined : { src: `/${tab.id}-favicon.png`, size: '3xs' as const }, icon: tab.id === 'toon' ? 'i-lucide-book-open' : undefined }))
</script>

<template>
  <EqualTabs :items="items" :model-value="source" :label="label" class="source-tabs"
    @update:model-value="value => { const next = historySources.find(item => item.id === value)?.id; if (next) source = next }" />
</template>

<style scoped>
.source-tabs{margin-bottom:12px}
</style>
