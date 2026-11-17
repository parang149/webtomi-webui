<script setup lang="ts">
const layout = defineModel<'grid' | 'list'>({ required: true })
defineProps<{ label: string }>()
const views = [{ value: 'grid', label: '그리드 보기', icon: 'i-lucide-layout-grid' }, { value: 'list', label: '세로 목록 보기', icon: 'i-lucide-list' }] as const
</script>

<template>
  <UFieldGroup class="view-toggle" role="group" :aria-label="label">
    <UButton v-for="view in views" :key="view.value" :icon="view.icon" square :title="view.label" :aria-label="view.label"
      :aria-pressed="layout === view.value" :color="layout === view.value ? 'primary' : 'neutral'" :variant="layout === view.value ? 'solid' : 'outline'"
      @click="layout = view.value" />
  </UFieldGroup>
</template>
