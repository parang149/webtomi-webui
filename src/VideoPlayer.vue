<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps<{ src: string; poster?: string }>()
const emit = defineEmits<{ loaded: []; buffering: [value: boolean]; ready: []; playing: [value: boolean]; fullscreen: [value: boolean]; active: [value: boolean]; 'preview-tap': []; error: [] }>()
type NativeVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void; webkitDisplayingFullscreen?: boolean }
const frame = ref<HTMLElement>(), video = ref<NativeVideo>(), preview = ref<HTMLElement>()
const fullscreen = ref(false), starting = ref(false), message = ref(''), posterBroken = ref(false)
const active = ref(false)
function desktopPointer() { return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches }
const inlineMode = ref(desktopPointer())
const buffering = ref(false)
let entryBounds: DOMRect | undefined, expanding: Animation | undefined
function expandPreview() {
  const element=preview.value, target=frame.value?.getBoundingClientRect?.()
  if (!element?.animate || !entryBounds || !target?.width || !target.height || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return
  expanding?.cancel()
  expanding=element.animate([
    { transform: `translate(${entryBounds.left-target.left}px,${entryBounds.top-target.top}px) scale(${entryBounds.width/target.width},${entryBounds.height/target.height})` },
    { transform: 'none' },
  ], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' })
}
let nativePending = false, disposed = false, startPoint: { x: number; y: number } | null = null, ignoreTapUntil = 0
let nativeTimer: ReturnType<typeof setTimeout> | undefined
function pointerDown(event: PointerEvent) { startPoint = { x: event.clientX, y: event.clientY } }
function pointerUp(event: PointerEvent) { if (startPoint && Math.hypot(event.clientX-startPoint.x,event.clientY-startPoint.y)>12) ignoreTapUntil=Date.now()+500; startPoint=null }
function pointerCancel() { ignoreTapUntil=Date.now()+500; startPoint=null }
function tapPreview() { if (Date.now()>=ignoreTapUntil) emit('preview-tap') }
function reset() {
  clearTimeout(nativeTimer)
  expanding?.cancel(); expanding=undefined; entryBounds=undefined
  nativePending=false; starting.value=false; buffering.value=false; fullscreen.value=false; active.value=false
  video.value?.pause(); video.value?.removeAttribute('src'); video.value?.load()
  emit('playing',false); emit('buffering',false); emit('active',false); emit('fullscreen',false)
}
function pause() {
  const owned = document.fullscreenElement === frame.value || document.fullscreenElement === video.value
  if (video.value?.webkitDisplayingFullscreen) video.value.webkitExitFullscreen?.()
  reset()
  if (owned) void document.exitFullscreen().catch(()=>{})
}
defineExpose({ pause, start })
function changed() {
  if (document.fullscreenElement === frame.value || document.fullscreenElement === video.value) { fullscreen.value=true; active.value=true; if (document.fullscreenElement === frame.value) expandPreview(); emit('active',true); emit('fullscreen',true) }
  else if (fullscreen.value && !video.value?.webkitDisplayingFullscreen) reset()
}
function nativeBegin() {
  if (disposed || !nativePending) { video.value?.webkitExitFullscreen?.(); return }
  clearTimeout(nativeTimer); fullscreen.value=true; active.value=true; emit('active',true); emit('fullscreen',true)
  void video.value?.play().catch(()=> { message.value='재생할 수 없습니다.'; pause() })
}
function metadata() {
  emit('loaded')
  if (nativePending && !fullscreen.value) {
    try { video.value?.webkitEnterFullscreen?.() }
    catch { message.value='전체 화면 재생을 시작하지 못했습니다. 다시 눌러 주세요.'; pause() }
  }
}
async function start(forceFullscreen = false) {
  if (Date.now()<ignoreTapUntil || starting.value || active.value) return
  const element=video.value, container=frame.value
  if (!element || !container) return
  message.value=''; entryBounds=container.getBoundingClientRect?.(); starting.value=true
  element.src=props.src
  inlineMode.value=!forceFullscreen && desktopPointer()
  try {
    if (inlineMode.value) {
      active.value=true; emit('active',true)
      await element.play()
    } else if (container.requestFullscreen) {
      await container.requestFullscreen()
      if (disposed || document.fullscreenElement !== container) { pause(); return }
      fullscreen.value=true; active.value=true; emit('active',true); emit('fullscreen',true)
      await element.play()
    } else if (element.webkitEnterFullscreen) {
      nativePending=true
      nativeTimer=setTimeout(()=> { if (!fullscreen.value) { message.value='전체 화면을 열지 못했습니다. 다시 눌러 주세요.'; pause() } },10000)
      element.load()
      if (element.readyState>=1) element.webkitEnterFullscreen()
    } else throw new Error('Fullscreen unavailable')
  } catch {
    message.value='재생을 시작하지 못했습니다. 브라우저 지원·영상 연결을 확인하세요.'
    pause()
  }
}
function failed() { if (!starting.value && !active.value) return; message.value='동영상을 불러오지 못했습니다.'; pause() }
function played() {
  if (!active.value) { video.value?.pause(); return }
  starting.value=false; buffering.value=false; emit('buffering',false); emit('ready'); emit('playing',true)
}
function waiting() { if (active.value) { buffering.value=true; emit('buffering',true) } }
function canplay() { if (!starting.value) { buffering.value=false; emit('buffering',false) } }
onMounted(()=> { document.addEventListener('fullscreenchange',changed) })
onBeforeUnmount(()=> { disposed=true; pause(); document.removeEventListener('fullscreenchange',changed) })
</script>
<template>
  <div ref="frame" class="video-player" :class="{ fullscreen }" @pointerdown="pointerDown" @pointerup="pointerUp" @pointercancel="pointerCancel">
    <div v-show="!active || starting" ref="preview" class="video-preview" @click.stop="tapPreview">
      <img v-if="poster && !posterBroken" :src="poster" alt="동영상 미리보기" referrerpolicy="no-referrer" draggable="false" @error="posterBroken=true">
      <button v-if="!starting" class="play-button" :aria-label="inlineMode ? '동영상 재생' : '전체 화면으로 동영상 재생'" @click.stop="start()"><svg class="play-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 7 26 16 11 25Z" /></svg></button>
      <span v-if="!starting" class="preview-label">{{ inlineMode ? '재생 버튼을 눌러 재생' : '재생 버튼을 눌러 전체 화면 재생' }}</span>
    </div>
    <video ref="video" :poster="poster" :class="{ inactive: !active }" controls playsinline preload="none" aria-label="동영상 플레이어"
      @click.stop @pointerdown.stop @pointerup.stop @touchstart.stop @touchend.stop @wheel.stop
      @loadedmetadata="metadata" @loadeddata="active && emit('ready')"
      @waiting="waiting" @canplay="canplay"
      @playing="played" @pause="emit('playing',false)" @ended="emit('playing',false)"
      @webkitbeginfullscreen="nativeBegin" @webkitendfullscreen="reset" @error="failed" />
    <div v-if="starting || buffering" class="video-loading" role="status" aria-label="동영상 불러오는 중"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /></svg></div>
    <p v-if="message && !active" class="video-message" role="alert">{{ message }}</p>
  </div>
</template>
<style scoped>
.video-player{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;background:#08090c}
.video-preview{position:absolute;inset:0;z-index:1;display:grid;place-items:center;width:100%;height:100%;padding:0;border:0;border-radius:0;background:#08090c;color:white;cursor:pointer;touch-action:pan-x pan-y pinch-zoom;transform-origin:top left}.video-preview:disabled{opacity:1;cursor:wait}
.video-preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none}.play-button{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1;display:grid;place-items:center;width:64px;height:64px;padding:0;border:0;border-radius:50%;background:#0008;color:white;cursor:pointer}.video-preview .play-icon{display:block;width:28px;height:28px;fill:currentColor;stroke:none}.preview-label{position:absolute;bottom:20px;font-size:12px;background:#0008;padding:5px 10px;border-radius:5px;pointer-events:none}
video{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;background:#08090c}video.inactive{opacity:0;pointer-events:none}
.video-loading{position:absolute;inset:0;z-index:3;display:grid;place-items:center;pointer-events:none;color:var(--ui-primary,#8ae3be)}.video-loading svg{width:36px;height:36px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:56 20;animation:video-loading-spin .7s linear infinite;will-change:transform}@keyframes video-loading-spin{to{transform:rotate(360deg)}}
.video-message{position:absolute;z-index:4;bottom:56px;left:12px;right:12px;text-align:center;font-size:12px;color:#ffb4b4;pointer-events:none}.video-player:fullscreen{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none}
@media(prefers-reduced-motion:reduce){.video-loading svg{animation:none}}
</style>
