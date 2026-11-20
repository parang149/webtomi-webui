<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { debugImage, galleryWindow } from './debug-gallery-window'
const props = defineProps<{ count: number; offset?: number; virtual?: boolean }>()
const emit = defineEmits<{ rendered: [count: number]; select: [id: number] }>()
const root = ref<HTMLElement>()
const width = ref(300), scrollTop = ref(0), viewportHeight = ref(480)
let viewport: HTMLElement | null = null, observer: ResizeObserver | undefined, frame = 0
function measure() {
  if (!root.value || !viewport) return
  width.value = root.value.clientWidth
  viewportHeight.value = viewport.clientHeight
  // Relative rectangles also work while the shared pull component is translated.
  const origin = root.value.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
  scrollTop.value = Math.max(0, viewport.scrollTop - origin)
}
function scroll() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure() }) }
const windowed = computed(() => galleryWindow(props.count, width.value, scrollTop.value, viewportHeight.value, !!props.virtual))
const ids = computed(() => Array.from({ length: Math.max(0, windowed.value.end - windowed.value.start) }, (_, i) => (props.offset ?? 0) + windowed.value.start + i + 1))
watch(() => ids.value.length, count => emit('rendered', count), { immediate: true })
watch(() => [props.count, props.virtual, props.offset], () => { measure() }, { flush: 'post' })
onMounted(() => {
  viewport = root.value?.closest('.bottom-pull') as HTMLElement | null
  measure(); viewport?.addEventListener('scroll', scroll, { passive: true })
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  if (viewport) observer.observe(viewport)
})
onUnmounted(() => { observer?.disconnect(); viewport?.removeEventListener('scroll', scroll); cancelAnimationFrame(frame) })
</script>
<template>
  <div ref="root" class="debug-list" :style="{ height: `${windowed.height}px` }">
    <div class="debug-grid" :style="{ gridTemplateColumns: `repeat(${windowed.columns},minmax(0,1fr))`, transform: `translateY(${windowed.offset}px)` }">
      <button v-for="id in ids" :key="id" data-pull-surface class="debug-card" @click="emit('select', id)"><img :src="debugImage(id)" :alt="`테스트 이미지 ${id}`" loading="lazy"></button>
    </div>
  </div>
</template>
<style scoped>
.debug-list{position:relative;margin:8px}.debug-grid{position:absolute;top:0;left:0;right:0;display:grid;gap:8px;align-items:start}.debug-card{display:block;aspect-ratio:1;padding:0;border:0;border-radius:6px;overflow:hidden;min-width:0;background:var(--canvas)}.debug-card img{display:block;width:100%;height:100%;user-select:none}
</style>
