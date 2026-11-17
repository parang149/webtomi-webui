<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
const props = defineProps<{ src: string; index: number; fit?: 'width' | 'screen' | 'original'; maxHeight?: number; availableWidth?: number; zoom?: number }>()
const emit = defineEmits<{ visible: [index: number] }>()
const element = ref<HTMLElement>()
const loaded = ref(false)
const broken = ref(false)
const ratio = ref('0.7')
const natural = ref({ width: 0, height: 0 })
const width = computed(() => {
  const available = props.availableWidth || 600, zoom = (props.zoom || 100) / 100
  if (!natural.value.width || props.fit === 'width') return `${available * zoom}px`
  if (props.fit === 'original') return `${natural.value.width * zoom}px`
  const scale = Math.min(available / natural.value.width, (props.maxHeight || 900) / natural.value.height)
  return `${natural.value.width * scale * zoom}px`
})
let nearby: IntersectionObserver | undefined
let visible: IntersectionObserver | undefined
function measured(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth && image.naturalHeight) { ratio.value = `${image.naturalWidth} / ${image.naturalHeight}`; natural.value = { width: image.naturalWidth, height: image.naturalHeight } }
}
onMounted(() => {
  nearby = new IntersectionObserver(entries => { loaded.value = entries[0].isIntersecting }, { rootMargin: '800px 0px' })
  visible = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) emit('visible', props.index)
  }, { rootMargin: '-10% 0px -70% 0px' })
  if (element.value) { nearby.observe(element.value); visible.observe(element.value) }
})
onUnmounted(() => { nearby?.disconnect(); visible?.disconnect() })
</script>
<template><div ref="element" :id="`page-${index}`" :style="{ aspectRatio: ratio, width, margin: '0 auto' }"><div v-if="loaded && broken" style="padding:32px;text-align:center;color:#aeb6c8">이미지를 불러오지 못했습니다.<UButton variant="outline" color="neutral" style="display:block;margin:16px auto" @click.stop="broken = false">다시 불러오기</UButton></div><img v-if="loaded && !broken" :src="src" :alt="`${index + 1}페이지`" style="display:block;width:100%;height:auto" @load="measured" @error="broken = true"></div></template>
