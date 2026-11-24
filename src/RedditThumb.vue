<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ id: string; kind: string; title: string; stored?: boolean; src?: string; revision?: number }>()
const emit = defineEmits<{ failed: []; loaded: [] }>()
const broken = ref(false)
watch(() => [props.id, props.src, props.revision], () => { broken.value = false })
</script>
<template><span class="reddit-thumb"><img v-if="src && !broken" :key="revision" :src="src" referrerpolicy="no-referrer" :alt="title" :loading="revision ? 'eager' : 'lazy'" @load="emit('loaded')" @error="broken = true; emit('failed')"><span v-else class="video-placeholder">{{ kind === 'video' ? '▶' : '미리보기 없음' }}</span></span></template>
<style scoped>.reddit-thumb{display:block;height:220px;overflow:hidden}.reddit-thumb img{display:block;width:100%;height:100%;object-fit:cover;border-radius:0}.video-placeholder{display:grid;place-items:center;height:100%;background:var(--canvas);color:var(--muted);font-size:12px}</style>
