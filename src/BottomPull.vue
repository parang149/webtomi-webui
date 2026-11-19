<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { BottomScrollGate } from './bottom-pull'
const props = withDefaults(defineProps<{
  enabled?: boolean
  loading?: boolean
  contained?: boolean
  label?: string
  regionLabel?: string
}>(), { enabled: true, loading: false, contained: false, label: '다음 항목 불러오기', regionLabel: '스크롤 영역' })
const emit = defineEmits<{ load: [] }>()
const viewport = ref<HTMLElement>(), content = ref<HTMLElement>()
const progress = ref(0), offset = ref(0)
const gate = new BottomScrollGate()
let timer: ReturnType<typeof setTimeout> | undefined
let target: HTMLElement | Window | undefined
let frame = 0, lastFrame = 0, targetOffset = 0, targetProgress = 0
function animate(now: number) {
  const dt = Math.min(50, lastFrame ? now - lastFrame : 16)
  lastFrame = now
  const blend = 1 - Math.exp(-dt / (targetOffset > 0 ? 45 : 85))
  offset.value += (targetOffset - offset.value) * blend
  progress.value += (targetProgress - progress.value) * blend
  if (Math.abs(targetOffset - offset.value) < .05 && Math.abs(targetProgress - progress.value) < .001) {
    offset.value = targetOffset; progress.value = targetProgress; frame = 0; lastFrame = 0
  } else frame = requestAnimationFrame(animate)
}
function render() {
  targetOffset = gate.offset; targetProgress = gate.progress
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { offset.value = targetOffset; progress.value = targetProgress; return }
  if (!frame) frame = requestAnimationFrame(animate)
}
function reset() { clearTimeout(timer); timer = undefined; gate.reset(); render() }
function interrupt() { reset(); gate.interrupt(performance.now()) }
function bottom() {
  const page = props.contained ? viewport.value : document.scrollingElement
  return !!page && page.scrollHeight - page.scrollTop - (props.contained ? page.clientHeight : innerHeight) <= 3
}
function allowed() { return props.enabled && !props.loading && !document.hidden && !!viewport.value?.getClientRects().length }
function control(event: Event) { return event.target instanceof Element && !!event.target.closest('button,input,textarea,select,[role="dialog"],[role="listbox"],[contenteditable="true"],video[controls]') }
function update() { render() }
function release() { const ready = gate.release(); reset(); if (ready && allowed() && bottom()) emit('load') }
function wheel(event: WheelEvent) {
  if (event.ctrlKey || control(event) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  if (!allowed()) { reset(); gate.wheel(event.deltaY, event.deltaMode, performance.now(), false); return }
  gate.wheel(event.deltaY, event.deltaMode, performance.now(), bottom()); update()
  if (bottom() && event.deltaY > 0 && event.cancelable) event.preventDefault()
  clearTimeout(timer); timer = setTimeout(release, 200)
}
function start(event: TouchEvent) {
  if (!allowed() || control(event) || event.touches.length !== 1) { reset(); return }
  clearTimeout(timer); timer = undefined
  gate.beginTouch(event.touches[0]!.clientX, event.touches[0]!.clientY, bottom()); update()
}
function move(event: TouchEvent) {
  if (!allowed() || event.touches.length !== 1) { reset(); return }
  const active = gate.distance > 0
  gate.moveTouch(event.touches[0]!.clientX, event.touches[0]!.clientY, bottom())
  if ((active || gate.distance > 0) && event.cancelable) event.preventDefault()
  update()
}
function scroll() { if (!allowed() || !bottom()) reset() }
function toBottom() { const page = props.contained ? viewport.value : document.scrollingElement; if (page) page.scrollTop = page.scrollHeight }
defineExpose({ reset, interrupt, toBottom })
watch(() => [props.enabled, props.loading], interrupt, { flush: 'sync' })
onMounted(() => {
  target = props.contained ? viewport.value : window
  if (!props.contained) document.documentElement.classList.add('bottom-pull-active')
  target?.addEventListener('wheel', wheel as EventListener, { passive: false })
  target?.addEventListener('touchstart', start as EventListener, { passive: true })
  target?.addEventListener('touchmove', move as EventListener, { passive: false })
  target?.addEventListener('touchend', release, { passive: true })
  target?.addEventListener('touchcancel', reset, { passive: true })
  target?.addEventListener('scroll', scroll, { passive: true })
  window.addEventListener('resize', reset)
})
onUnmounted(() => {
  reset()
  cancelAnimationFrame(frame); frame = 0
  if (!props.contained) document.documentElement.classList.remove('bottom-pull-active')
  target?.removeEventListener('wheel', wheel as EventListener)
  target?.removeEventListener('touchstart', start as EventListener)
  target?.removeEventListener('touchmove', move as EventListener)
  target?.removeEventListener('touchend', release)
  target?.removeEventListener('touchcancel', reset)
  target?.removeEventListener('scroll', scroll)
  window.removeEventListener('resize', reset)
})
</script>
<template>
  <div ref="viewport" class="bottom-pull" :class="{ contained }" :tabindex="contained ? 0 : undefined" :role="contained ? 'region' : undefined" :aria-label="contained ? regionLabel : undefined">
    <div ref="content" class="pull-content" :style="{ transform: `translate3d(0,${-offset}px,0)` }"><slot />
    <div class="pull-ring-position">
      <div v-if="progress > 0 || loading" class="pull-ring" :class="{ loading }" role="progressbar" :aria-label="label" :aria-valuenow="loading ? undefined : Math.round(progress * 100)" :aria-valuemin="0" :aria-valuemax="100"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="20" /><circle class="fill" cx="24" cy="24" r="20" pathLength="100" stroke-dasharray="100" :stroke-dashoffset="loading ? 72 : 100 - progress * 100" /></svg></div>
    </div><slot name="footer" /></div>
  </div>
</template>
<style scoped>
:global(html.bottom-pull-active){overscroll-behavior-y:none}
.bottom-pull{position:relative;min-width:0}.bottom-pull.contained{height:480px;max-height:65dvh;overflow-y:auto;overscroll-behavior-y:none;border:1px solid var(--line);border-radius:6px}
.pull-content{will-change:transform}
.pull-ring-position{height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none}
.pull-ring{width:28px;height:28px;color:var(--ui-primary,var(--accent,#8ae3be))}.pull-ring svg{display:block;width:100%;height:100%;fill:none;stroke-width:4}.track{stroke:currentColor;opacity:.15}.fill{stroke:currentColor;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center}
.loading svg{animation:pull-spin .8s linear infinite}@keyframes pull-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.fill,.pull-content{transition:none}.loading svg{animation:none}}
</style>
