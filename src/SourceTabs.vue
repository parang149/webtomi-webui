<script setup lang="ts">
import { historySources } from './reading-history'
import EqualTabs from './EqualTabs.vue'
import { computed } from 'vue'

const source = defineModel<typeof historySources[number]['id'] | 'reddit'>({ required: true })
const props = defineProps<{ label: string; reddit?: boolean }>()
const tabs = computed(() => props.reddit ? [...historySources, { id: 'reddit' as const, label: 'Reddit' }] : [...historySources])
const items = computed(() => tabs.value.map(tab => ({ label: tab.label, value: tab.id, avatar: ['all','toon','reddit'].includes(tab.id) ? undefined : { src: `/${tab.id}-favicon.png`, size: '3xs' as const }, icon: tab.id === 'toon' ? 'i-lucide-book-open' : undefined })))
</script>

<template>
  <EqualTabs :items="items" :model-value="source" :label="label" class="source-tabs"
    @update:model-value="value => { const next = tabs.find(item => item.id === value)?.id; if (next) source = next }" />
</template>

<style scoped>
.source-tabs{margin-bottom:12px}
</style>
