<script setup lang="ts">
defineProps<{ stored?: boolean; blocked?: boolean; state?: string; iconOnly?: boolean }>()
const emit=defineEmits<{ save: []; cancel: [] }>()
</script>
<template>
  <UButton :variant="iconOnly ? 'ghost' : 'soft'" color="neutral" :class="iconOnly ? 'icon-button' : undefined" type="button" :loading="false" :loading-auto="false"
    :disabled="stored || state === 'cancelling' || (!state && blocked)" :aria-label="stored ? '영구 저장됨' : state ? (state === 'cancelling' ? '다운로드 취소 중' : '다운로드 취소') : '다운로드 · 영구 저장'"
    :title="stored ? '영구 저장됨' : state ? '다운로드 취소' : '다운로드 · 영구 저장'" @click="state ? emit('cancel') : emit('save')">
    <UIcon v-if="state === 'cancelling'" name="i-lucide-loader-circle" class="size-5 animate-spin" />
    <svg v-else-if="iconOnly" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path v-if="state" d="M6 6h12v12H6Z"/><path v-else d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>
    <template v-if="!iconOnly">{{ stored ? '영구 저장됨' : state === 'cancelling' ? '취소 중…' : state ? '다운로드 취소' : '다운로드 · 영구 저장' }}</template>
  </UButton>
</template>
