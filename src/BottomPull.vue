<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { BottomScrollGate } from './bottom-pull'
const props = withDefaults(defineProps<{
  enabled?: boolean
  loading?: boolean
  refreshEnabled?: boolean
  refreshLoading?: boolean
  contained?: boolean
  label?: string
  regionLabel?: string
}>(), { enabled: true, loading: false, refreshEnabled: false, refreshLoading: false, contained: false, label: '다음 항목 불러오기', regionLabel: '스크롤 영역' })
const emit = defineEmits<{ load: []; refresh: [] }>()
const viewport = ref<HTMLElement>(), content = ref<HTMLElement>()
const progress = ref(0), offset = ref(0)
const gate = new BottomScrollGate()
const direction = ref<'top' | 'bottom'>('bottom')
let point: { x: number; y: number; top: boolean; bottom: boolean } | undefined
let mouse = false, suppressUntil = 0
let timer: ReturnType<typeof setTimeout> | undefined
let target: HTMLElement | Window | undefined
let frame = 0, lastFrame = 0, targetOffset = 0, targetProgress = 0
function animate(now: number) {
  const dt = Math.min(50, lastFrame ? now - lastFrame : 16)
  lastFrame = now
  const blend = 1 - Math.exp(-dt / (Math.abs(targetOffset) > 0 ? 45 : 85))
  offset.value += (targetOffset - offset.value) * blend
  progress.value += (targetProgress - progress.value) * blend
  if (Math.abs(targetOffset - offset.value) < .05 && Math.abs(targetProgress - progress.value) < .001) {
    offset.value = targetOffset; progress.value = targetProgress; frame = 0; lastFrame = 0
  } else frame = requestAnimationFrame(animate)
}
function render() {
  targetOffset = gate.offset * (direction.value === 'top' ? -1 : 1); targetProgress = gate.progress
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { offset.value = targetOffset; progress.value = targetProgress; return }
  if (!frame) frame = requestAnimationFrame(animate)
}
function reset() { clearTimeout(timer); timer = undefined; point=undefined; mouse=false; gate.reset(); render() }
function interrupt() { reset(); gate.interrupt(performance.now()) }
function bottom() {
  const page = props.contained ? viewport.value : document.scrollingElement
  return !!page && page.scrollHeight - page.scrollTop - (props.contained ? page.clientHeight : innerHeight) <= 3
}
function top() { const page=props.contained ? viewport.value : document.scrollingElement; return !!page && page.scrollTop<=3 }
function allowed() { return (direction.value==='top' ? props.refreshEnabled : props.enabled) && !props.loading && !props.refreshLoading && !document.hidden && !!viewport.value?.getClientRects().length }
function control(event: Event) { return event.target instanceof Element && !!event.target.closest('button:not([data-pull-surface]),input,textarea,select,[role="dialog"],[role="listbox"],[contenteditable="true"],video[controls]') }
function edge() { return direction.value==='top' ? top() : bottom() }
function update() { render() }
function release() { const ready = gate.release(), action=direction.value; reset(); if (ready && allowed() && edge()) { if(action==='top') emit('refresh'); else emit('load') } }
function wheel(event: WheelEvent) {
  if (event.ctrlKey || control(event) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  direction.value=event.deltaY<0 ? 'top' : 'bottom'
  if (!allowed()) { reset(); gate.wheel(event.deltaY, event.deltaMode, performance.now(), false); return }
  gate.wheel(Math.abs(event.deltaY), event.deltaMode, performance.now(), edge()); update()
  if (edge() && event.cancelable) event.preventDefault()
  clearTimeout(timer); timer = setTimeout(release, 200)
}
function start(event: TouchEvent) {
  if (control(event) || event.touches.length !== 1) { reset(); return }
  clearTimeout(timer); timer = undefined
  begin(event.touches[0]!.clientX,event.touches[0]!.clientY)
}
function begin(x:number,y:number) { reset(); point={x,y,top:top(),bottom:bottom()} }
function drag(x:number,y:number,event:Event) {
  if (!point) return
  const dy=y-point.y
  if (gate.distance===0) {
    direction.value=dy>0 && point.top ? 'top' : 'bottom'
    if (!allowed() || !(direction.value==='top' ? point.top : point.bottom)) return
    gate.beginTouch(point.x,direction.value==='top' ? -point.y : point.y,true)
  }
  if (!allowed()) { reset(); return }
  const active=gate.distance>0
  gate.moveTouch(x,direction.value==='top' ? -y : y,edge())
  if (gate.distance>0 || active) { if(event.cancelable) event.preventDefault() }
  if (gate.distance>8 || active) suppressUntil=Date.now()+600
  update()
}
function move(event: TouchEvent) {
  if (event.touches.length !== 1) { reset(); return }
  drag(event.touches[0]!.clientX,event.touches[0]!.clientY,event)
}
function down(event:MouseEvent) { if(event.button!==0 || control(event) || !viewport.value?.contains(event.target as Node)) return; begin(event.clientX,event.clientY); mouse=true }
function mouseMove(event:MouseEvent) { if(mouse && event.buttons===0) { reset(); return }; if(mouse) drag(event.clientX,event.clientY,event) }
function up() { if(mouse) release() }
function click(event:Event) { if(Date.now()<suppressUntil && viewport.value?.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation() } }
function nativeDrag(event:Event) { if (event.target instanceof HTMLImageElement && viewport.value?.contains(event.target)) event.preventDefault() }
function scroll() { if (!allowed() || !edge()) reset() }
function toTop() { const page=props.contained ? viewport.value : document.scrollingElement; if(page) page.scrollTop=0 }
function toBottom() { const page = props.contained ? viewport.value : document.scrollingElement; if (page) page.scrollTop = page.scrollHeight }
defineExpose({ reset, interrupt, toBottom, toTop })
watch(() => [props.enabled, props.loading,props.refreshEnabled,props.refreshLoading], interrupt, { flush: 'sync' })
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
  window.addEventListener('blur', interrupt)
  window.addEventListener('mousedown',down); window.addEventListener('mousemove',mouseMove); window.addEventListener('mouseup',up)
  window.addEventListener('click',click,true); window.addEventListener('dragstart',nativeDrag,true)
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
  window.removeEventListener('blur', interrupt)
  window.removeEventListener('mousedown',down); window.removeEventListener('mousemove',mouseMove); window.removeEventListener('mouseup',up)
  window.removeEventListener('click',click,true); window.removeEventListener('dragstart',nativeDrag,true)
})
</script>
<template>
  <div ref="viewport" class="bottom-pull" :class="{ contained }" :tabindex="contained ? 0 : undefined" :role="contained ? 'region' : undefined" :aria-label="contained ? regionLabel : undefined">
    <div ref="content" class="pull-content" :style="{ transform: `translate3d(0,${refreshLoading ? Math.max(44, -offset) : -offset}px,0)` }">
      <div v-if="refreshLoading || direction==='top' && progress>0" class="pull-ring-position top-ring"><span class="pull-ring" :class="{loading:refreshLoading}" role="progressbar" aria-label="목록 새로 확인" :aria-valuenow="refreshLoading ? undefined : Math.round(progress*100)"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="20"/><circle class="fill" cx="24" cy="24" r="20" pathLength="100" stroke-dasharray="100" :stroke-dashoffset="refreshLoading ? 72 : 100-progress*100"/></svg></span></div>
      <slot />
      <div class="pull-ring-position"><div v-if="direction==='bottom' && progress>0 || loading && !refreshLoading" class="pull-ring" :class="{loading}" role="progressbar" :aria-label="label" :aria-valuenow="loading ? undefined : Math.round(progress*100)"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="20"/><circle class="fill" cx="24" cy="24" r="20" pathLength="100" stroke-dasharray="100" :stroke-dashoffset="loading ? 72 : 100-progress*100"/></svg></div></div>
      <slot name="footer" /></div>
  </div>
</template>
<style scoped>
:global(html.bottom-pull-active){overscroll-behavior-y:none}
.bottom-pull{position:relative;min-width:0}.bottom-pull.contained{height:480px;max-height:65dvh;overflow-y:auto;overscroll-behavior-y:none;border:1px solid var(--line);border-radius:6px}
.pull-content{will-change:transform}
.top-ring{position:absolute;top:0;left:0;right:0;transform:translateY(-100%)}
.pull-ring-position{height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none}
.pull-ring{width:28px;height:28px;color:var(--ui-primary,var(--accent,#8ae3be))}.pull-ring svg{display:block;width:100%;height:100%;fill:none;stroke-width:4}.track{stroke:currentColor;opacity:.15}.fill{stroke:currentColor;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center}
.loading svg{animation:pull-spin .8s linear infinite}@keyframes pull-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.fill,.pull-content{transition:none}.loading svg{animation:none}}
</style>
