<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { redditGridWindow } from './reddit-display'
const props = defineProps<{ count: number; virtual: boolean; titles: boolean }>()
const root = ref<HTMLElement>(), width = ref(300), top = ref(0), height = ref(800)
let observer: ResizeObserver | undefined, frame = 0
function measure() {
  if (!root.value?.clientWidth) return
  width.value = root.value.clientWidth; height.value = window.innerHeight
  top.value = Math.max(0, -root.value.getBoundingClientRect().top)
}
function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure() }) }
const rowHeight = computed(() => props.titles ? 277 : 222)
const range = computed(() => redditGridWindow(props.count, width.value, top.value, height.value, rowHeight.value, props.virtual))
const indices = computed(() => Array.from({ length: Math.max(0, range.value.end - range.value.start) }, (_, i) => range.value.start + i))
watch(() => [props.count, props.virtual, props.titles], schedule, { flush: 'post' })
onMounted(() => { measure(); window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule); observer = new ResizeObserver(schedule); if (root.value) observer.observe(root.value) })
onUnmounted(() => { observer?.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame) })
</script>
<template>
  <div ref="root" :style="virtual ? { position: 'relative', height: `${range.height}px` } : undefined">
    <div class="reddit-grid" :style="virtual ? { position: 'absolute', top: 0, left: 0, right: 0, gridTemplateColumns: `repeat(${range.columns},minmax(0,1fr))`, gridAutoRows: `${rowHeight}px`, transform: `translateY(${range.offset}px)` } : undefined">
      <slot v-for="index in indices" :key="index" :index="index" />
    </div>
  </div>
</template>
<style scoped>.reddit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;align-items:stretch}</style>
