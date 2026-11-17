<script setup lang="ts">
// Tabs whose triggers always share the row equally (2 or 3 columns), used across the app.
import type { TabsItem } from '@nuxt/ui'

defineProps<{ items: TabsItem[]; label: string }>()
const value = defineModel<string | number>({ required: true })
const ui = { root: 'w-full', list: 'w-full', trigger: 'flex-1 basis-0 min-w-0 justify-center' }
</script>

<template>
  <UTabs v-model="value" :items="items" :content="false" :aria-label="label" :ui="ui" />
</template>
