<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
defineProps<{ id: string; kind: string; title: string }>()
const frame = ref<HTMLElement>(), visible = ref(false)
let observer: IntersectionObserver | undefined
onMounted(() => { observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { visible.value = true; observer?.disconnect() } }, { rootMargin: '200px' }); if (frame.value) observer.observe(frame.value) })
onUnmounted(() => observer?.disconnect())
</script>
<template><span ref="frame" class="reddit-thumb"><video v-if="kind === 'video' && visible" :src="`/api/reddit/media/${id}#t=0.1`" preload="metadata" muted playsinline /><span v-else-if="kind === 'video'" class="video-placeholder">▶</span><img v-else :src="`/api/reddit/media/${id}`" :alt="title" loading="lazy"></span></template>
<style scoped>.reddit-thumb{display:block;height:220px;overflow:hidden}.reddit-thumb img,.reddit-thumb video{display:block;width:100%;height:100%;object-fit:cover;border-radius:0}.video-placeholder{display:grid;place-items:center;height:100%;background:var(--canvas)}</style>
