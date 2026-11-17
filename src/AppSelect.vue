<script setup lang="ts">
const model = defineModel<string>({ required: true })
defineProps<{ label: string; options: { value: string; label: string }[] }>()
</script>

<template>
  <USelect v-model="model" :items="options" :aria-label="label" class="w-full" />
</template>
