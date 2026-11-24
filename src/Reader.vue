<script setup lang="ts">
import type { VideoDiagnostic } from './video-diagnostics'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import ScrollPage from './ScrollPage.vue'
import VideoPlayer from './VideoPlayer.vue'
import StatusCheck from './StatusCheck.vue'
import MediaSaveButton from './MediaSaveButton.vue'
import { refreshReading, markReading, pendingProgress, resetReading, type EhentaiDetails } from './reading-history'
const props = defineProps<{ book: { id: string; title: string; pages: number; initialPage?: number; media?: { url: string; kind: 'image' | 'gif' | 'video'; title: string; badge?: 'new' | 'seen'; stored?: boolean; poster?: string; revision?: number; save_state?: string; original_test?: boolean }[]; remote?: boolean; ehentaiToken?: string; ehentaiDetails?: EhentaiDetails; toon?: { site?: 'toon' | 'wolf'; series: number; seriesTitle: string; episodes: { id: number; title: string }[]; local?: boolean }; metadata?: { toon_episode?: number } }; mediaSaving?: boolean; detailError?: string; backPrompt?: number; detailOpen?: boolean }>()
const emit = defineEmits<{ close: []; detail: [page?: number]; episode: [number]; 'media-shown': [index: number]; keep: [index: number]; 'cancel-keep': [index: number]; 'fallback-media': [index: number]; 'delete-media': [index: number]; 'video-exit': []; 'retry-media': [index: number]; 'media-error': [index: number]; 'media-diagnostic': [index: number, report: VideoDiagnostic] }>()
const page = ref(props.book.initialPage ?? 0)
const mixed = !!props.book.media
const currentMedia = computed(() => props.book.media?.[page.value])
const isVideo = computed(() => currentMedia.value?.kind === 'video')
const mixedVideo = ref<InstanceType<typeof VideoPlayer>>()
async function playVideo() {
  if (!isVideo.value) return
  ready.value = true
  await nextTick()
  await mixedVideo.value?.start()
}
function afterMediaDeleted(index: number) {
  if (page.value !== index) return
  if (index + 1 < props.book.pages) page.value = index + 1
  else close()
}
function reloadMedia(index: number) { if (page.value === index) { broken.value = false; pageLoading.value = !isVideo.value; displayedMedia.value = '' } }
function retryMedia() { if (mixed) emit('retry-media', page.value); else broken.value = false }
defineExpose({ playVideo, afterMediaDeleted, reloadMedia })
const videoPlaying = ref(false)
const videoFullscreen = ref(false)
const videoActive = ref(false)
const displayedMedia = ref('')
function reportMediaShown() {
  if (!mixed || !displayedMedia.value || props.detailOpen || document.hidden) return
  const index = page.value, url = imageUrl(index)
  requestAnimationFrame(() => {
    if (!disposed && index === page.value && displayedMedia.value === url && !document.hidden && !props.detailOpen) emit('media-shown', index)
  })
}
function mediaLoaded() { if (mixed) { displayedMedia.value = imageUrl(page.value); reportMediaShown() } }
watch(page, () => { displayedMedia.value = '' })
watch(() => props.detailOpen, () => reportMediaShown())
watch(() => props.detailOpen, open => { if (open) mixedVideo.value?.pause() })
const mode = ref<'page' | 'scroll'>('page')
const direction = ref<'ltr' | 'rtl' | 'ttb'>('ltr')
const swipe = ref(true)
const forward = computed(() => direction.value === 'rtl' ? -1 : 1)
const zoom = ref(100)
const fit = ref<'width' | 'screen' | 'original'>('screen')
const tabUi = { root: 'w-full', list: 'w-full', trigger: 'flex-1 basis-0 min-w-0 justify-center' }
const controls = ref(true)
const settings = ref(false)
const dimensions = ref({ width: 1, height: 1 })
const frame = ref({ width: 1, height: 1 })
const imageWidth = computed(() => {
  const { width, height } = dimensions.value
  const scale = fit.value === 'width' ? frame.value.width / width : fit.value === 'screen' ? Math.min(frame.value.width / width, frame.value.height / height) : 1
  return Math.max(1, width * scale * zoom.value / 100)
})
const scrollWidth = computed(() => '100%')
let resizeObserver: ResizeObserver | undefined
let oldOverflow = ''
let suppressClickUntil = 0
let pointer: { x: number; y: number } | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined
function scheduleVideoMenuHide() {
  clearTimeout(hideTimer)
  if (!isVideo.value || !videoPlaying.value || settings.value) return
  hideTimer = setTimeout(() => { if (!settings.value) controls.value = false }, 2500)
}
function showControls() { controls.value = true; scheduleVideoMenuHide() }
function videoPlayback(playing: boolean) { videoPlaying.value = playing; scheduleVideoMenuHide() }
function videoActivity(active: boolean) {
  const previous = videoActive.value
  videoActive.value = active
  if (active && !previous) { controls.value = false; settings.value = false }
  else if (!active && previous && !videoFullscreen.value) showControls()
}
function videoFullScreen(value: boolean) { const wasFullscreen = videoFullscreen.value; videoFullscreen.value = value; if (!value && !videoActive.value) showControls(); if (wasFullscreen && !value) emit('video-exit') }
function deleteMedia() { mixedVideo.value?.pause(); emit('delete-media', page.value) }
watch(settings, () => { if (isVideo.value) scheduleVideoMenuHide() })
watch(page, () => { mixedVideo.value?.pause(); videoPlaying.value = false; videoFullscreen.value = false; videoActive.value = false })
function toggleControls() {
  if (Date.now() < suppressClickUntil || window.getSelection()?.toString()) return
  settings.value = false; controls.value = !controls.value
}
function surfaceClick(event: MouseEvent) {
  if (isVideo.value && (videoFullscreen.value || videoActive.value)) return
  if (!ready.value || Date.now() < suppressClickUntil || window.getSelection()?.toString()) return
  if (settings.value || mode.value === 'scroll') { toggleControls(); return }
  const bounds = viewport.value!.getBoundingClientRect()
  // Vertical reading uses top/middle/bottom bands; other directions use left/middle/right.
  if (direction.value === 'ttb') {
    const y = (event.clientY - bounds.top) / bounds.height
    if (y >= .25 && y <= .75) toggleControls()
    else move(y < .25 ? -1 : 1)
    return
  }
  const x = (event.clientX - bounds.left) / bounds.width
  if (x >= .25 && x <= .75) toggleControls()
  else move((x < .25 ? -1 : 1) * forward.value)
}
let wheelSum = 0, wheelAt = 0, wheelTurnAt = 0, wheelSign = 0, wheelLocked = false
function wheel(event: WheelEvent) {
  if (isVideo.value && (videoFullscreen.value || videoActive.value)) return
  if (!ready.value || mode.value !== 'page' || settings.value || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return
  const view = viewport.value!
  const sign = Math.sign(event.deltaY), now = Date.now()
  const gap = now - wheelAt
  wheelAt = now
  if (gap > 180) wheelLocked = false
  if (wheelLocked) { event.preventDefault(); return }
  if (gap > 180 || sign !== wheelSign) wheelSum = 0
  wheelSign = sign
  const canScroll = sign > 0 ? view.scrollTop + view.clientHeight < view.scrollHeight - 2 : view.scrollTop > 2
  if (canScroll) { wheelSum = 0; return }
  event.preventDefault()
  // Require a fresh gesture at a tall image's edge; ignore trackpad momentum after turning.
  if (view.scrollHeight > view.clientHeight + 2 && gap <= 180 && !wheelSum) return
  if (now - wheelTurnAt < 650) return
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.clientHeight : 1)
  wheelSum += Math.abs(delta)
  if (wheelSum >= 60) { move(sign); wheelTurnAt = now; wheelSum = 0; wheelLocked = true }
}
function pointerDown(event: PointerEvent) { pointer = { x: event.clientX, y: event.clientY } }
function pointerUp(event: PointerEvent) {
  if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) suppressClickUntil = Date.now() + 400
  pointer = null
}
function measured(event: Event) {
  pageLoading.value = false
  const image = event.target as HTMLImageElement
  dimensions.value = { width: image.naturalWidth || 1, height: image.naturalHeight || 1 }
  if (image.naturalWidth > 0 && image.naturalHeight > 0) mediaLoaded()
}
function measureFrame() { if (viewport.value) frame.value = { width: viewport.value.clientWidth, height: viewport.value.clientHeight } }
function setFit(value: 'width' | 'screen' | 'original') { fit.value = value; zoom.value = 100; void nextTick(() => requestAnimationFrame(measureFrame)) }
function toggleSettings() { controls.value = true; settings.value = !settings.value; scheduleVideoMenuHide() }
function surfaceKey(event: KeyboardEvent) { if (!videoActive.value && event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); toggleControls() } }
const ready = ref(false)
const status = ref('읽던 위치 확인 중…')
const broken = ref(false)
// Page mode waits for the current image before turning again.
const pageLoading = ref(!isVideo.value)
// The indicator appears only for loads longer than 0.2 s, so cached pages do not flicker.
const showLoading = ref(false)
let loadingTimer: ReturnType<typeof setTimeout> | undefined
watch([pageLoading, mode], ([loading, current]) => {
  clearTimeout(loadingTimer)
  if (!loading || current !== 'page') { showLoading.value = false; return }
  loadingTimer = setTimeout(() => { showLoading.value = pageLoading.value && mode.value === 'page' }, 200)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(loadingTimer))
const viewport = ref<HTMLElement>()
const encodedId = encodeURIComponent(props.book.id)
const ehentaiToken = props.book.ehentaiToken
const toon = props.book.toon
// Downloaded episodes read from the library but keep the episode navigation.
const toonOnline = toon && !toon.local ? toon : undefined
const comicSite = toon?.site ?? 'toon'
const online = !!(props.book.remote || ehentaiToken || toonOnline)
const baseUrl = toonOnline ? `/api/${comicSite}/episodes/${encodedId}` : ehentaiToken
  ? `/api/ehentai/galleries/${encodedId}/${encodeURIComponent(ehentaiToken)}`
  : `/api/${props.book.remote ? 'galleries' : 'library'}/${encodedId}`
const progressUrl = toonOnline ? `/api/${comicSite}/series/${toonOnline.series}/episodes/${encodedId}/progress` : `${baseUrl}/progress`
const toonEpisode = toon?.local ? props.book.metadata?.toon_episode : Number(props.book.id)
const toonIndex = toon ? toon.episodes.findIndex(item => item.id === toonEpisode) : -1
const nextEpisode = toon && toonIndex >= 0 ? toon.episodes[toonIndex + 1] : undefined
const previousEpisode = toon && toonIndex > 0 ? toon.episodes[toonIndex - 1] : undefined
const imageUrl = (index: number) => props.book.media?.[index]?.url ?? `${baseUrl}/pages/${index}`
const storageKey = toonOnline ? `reader:${comicSite}:${props.book.id}` : ehentaiToken
  ? `reader:ehentai:${props.book.id}:${ehentaiToken}`
  : `reader:${props.book.remote ? 'remote:' : ''}${props.book.id}`
const reader = ref<HTMLElement>()
let timer: ReturnType<typeof setTimeout> | undefined
let chain = Promise.resolve()
let savedPosition = ''
let suppressSave = false
let disposed = false
let positioning = false
function clamp(value: number) { return Number.isFinite(value) ? Math.max(0, Math.min(props.book.pages - 1, Math.floor(value))) : 0 }
function save() {
  if (!ready.value || suppressSave || mixed) return
  const data = { page: page.value, mode: mode.value }
  const position = `${data.page}:${data.mode}`
  if (savedPosition === position) return
  savedPosition = position
  try { localStorage.setItem(storageKey, ehentaiToken || toonOnline ? JSON.stringify(data) : String(data.page)) } catch { /* Optional fallback. */ }
  const body = toonOnline ? { ...data, title: props.book.title } : ehentaiToken
    ? { ...data, title: props.book.title, details: props.book.ehentaiDetails }
    : data
  chain = chain.then(async () => {
    try {
      const response = await fetch(progressUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      if (!response.ok) throw new Error()
      status.value = '읽던 위치 저장됨'; if (disposed) void refreshReading()
    } catch {
      if (savedPosition === position) savedPosition = ''
      status.value = '서버 저장 실패 · 이 기기에 임시 보관됨'
    }
  })
  const request = chain
  pendingProgress.set(progressUrl, request)
  void request.then(() => { if (pendingProgress.get(progressUrl) === request) pendingProgress.delete(progressUrl) })
}
async function locate() {
  if (mode.value !== 'scroll' || !ready.value) return
  positioning = true
  await nextTick()
  const target = document.getElementById(`page-${page.value}`)
  if (target && viewport.value) viewport.value.scrollTop = target.offsetTop
  requestAnimationFrame(() => requestAnimationFrame(() => { positioning = false }))
}
const endPrompt = ref<HTMLDialogElement>()
const promptReason = ref<'end' | 'back'>('end')
function openPrompt(reason: 'end' | 'back') {
  if (endPrompt.value?.open) return
  promptReason.value = reason
  endPrompt.value?.showModal(); endPrompt.value?.focus()
}
// The app cancels a browser back gesture while reading and asks here instead.
watch(() => props.backPrompt, () => openPrompt('back'))
function move(delta: number, repeat = false) {
  if (!ready.value || endPrompt.value?.open || (!isVideo.value && mode.value === 'page' && pageLoading.value)) return
  if (delta > 0 && page.value === props.book.pages - 1) {
    if (!repeat) openPrompt('end')
    return
  }
  page.value = clamp(page.value + delta)
}
function jump(event: Event) { page.value = clamp(Number((event.target as HTMLInputElement).value) - 1); locate() }
function close() { mixedVideo.value?.pause(); clearTimeout(hideTimer); clearTimeout(timer); save(); emit('close') }
function keydown(event: KeyboardEvent) {
  if (props.detailOpen || endPrompt.value?.open || document.querySelector('dialog[open]')) return
  if (event.key === 'Escape') { if (settings.value) settings.value = false; else if (controls.value) controls.value = false; else showControls(); return }
  if (isVideo.value && (videoFullscreen.value || videoActive.value)) {
    if (event.target instanceof Element && event.target.closest('video,button,input,select,textarea')) return
    if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); move(event.key === 'PageDown' ? 1 : -1) }
    return
  }
  if (event.target instanceof HTMLElement && (['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable)) return
  if (event.key === ' ') { if (event.target instanceof HTMLElement && event.target.closest('button')) return; event.preventDefault(); toggleControls(); return }
  if (mode.value === 'scroll') {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move((event.key === 'ArrowRight' ? 1 : -1) * forward.value, event.repeat); void locate() }
    return
  }
  if (['ArrowRight','ArrowDown','PageDown','ArrowLeft','ArrowUp','PageUp','Home','End'].includes(event.key)) event.preventDefault()
  if (event.key === 'ArrowRight') move(forward.value, event.repeat)
  if (['ArrowDown','PageDown'].includes(event.key)) move(1, event.repeat)
  if (event.key === 'ArrowLeft') move(-forward.value, event.repeat)
  if (['ArrowUp','PageUp'].includes(event.key)) move(-1)
  if (event.key === 'Home') page.value = 0
  if (event.key === 'End') page.value = props.book.pages - 1
}
let touch: { x: number; y: number; top: boolean; bottom: boolean; left: boolean; right: boolean; edge: boolean } | null = null
const EDGE = 24
function touchstart(event: TouchEvent) {
  if (isVideo.value && (videoFullscreen.value || videoActive.value)) { touch = null; return }
  if (event.touches.length !== 1) suppressClickUntil = Date.now() + 700
  const view = viewport.value
  const x = event.touches[0]?.clientX ?? 0
  // Touches from the screen edge would start the browser's back gesture; keep them in the viewer.
  const edge = event.touches.length === 1 && (x <= EDGE || x >= window.innerWidth - EDGE)
  if (edge && event.cancelable) event.preventDefault()
  // Large pages scroll first; a swipe turns only when it starts at that scroll edge.
  touch = event.touches.length === 1 ? {
    x, y: event.touches[0].clientY, edge,
    top: !view || view.scrollTop <= 2, bottom: !view || view.scrollTop + view.clientHeight >= view.scrollHeight - 2,
    left: !view || view.scrollLeft <= 2, right: !view || view.scrollLeft + view.clientWidth >= view.scrollWidth - 2,
  } : null
}
function touchend(event: TouchEvent) {
  if (isVideo.value && (videoFullscreen.value || videoActive.value)) { touch = null; return }
  const start = touch; touch = null
  if (!start || !event.changedTouches.length) return
  const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y
  // Cancelled edge touches produce no click, so their taps are handled here.
  if (start.edge && Math.hypot(dx, dy) <= 12) { surfaceClick({ clientX: start.x + dx, clientY: start.y + dy } as MouseEvent); return }
  if (!swipe.value || settings.value || mode.value !== 'page') return
  // Left/right follows the reading direction (vertical reading turns like right-hand); up always means next.
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && (dx < 0 ? start.right : start.left)) { move((dx < 0 ? 1 : -1) * forward.value); suppressClickUntil = Date.now() + 500 }
  else if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.6 && (dy < 0 ? start.bottom : start.top)) { move(dy < 0 ? 1 : -1); suppressClickUntil = Date.now() + 500 }
  touch = null
}
function visible(index: number) { if (ready.value && !positioning && mode.value === 'scroll') page.value = index }
function flush() { clearTimeout(timer); save() }
async function setRead(completed: boolean) {
  if (!completed) suppressSave = true
  try {
    clearTimeout(timer)
    await chain
    if (toonOnline && completed) {
      const response = await fetch(progressUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: props.book.pages - 1, mode: mode.value, title: props.book.title }) })
      if (!response.ok) throw new Error()
      await refreshReading()
    } else if (toonOnline) await resetReading(`${comicSite}:${toonOnline.series}:${props.book.id}`)
    else if (ehentaiToken) await resetReading(`ehentai:${props.book.id}:${ehentaiToken}`)
    else await markReading(props.book.id, completed, !!props.book.remote)
    status.value = completed ? '읽음으로 표시했습니다' : '안 읽음으로 변경했습니다'
    if (!completed) emit('close')
  } catch {
    suppressSave = false
    status.value = '읽기 상태를 변경하지 못했습니다'
  }
}
function visibility() { if (document.visibilityState === 'hidden') flush(); else reportMediaShown() }
watch([page, mode], () => {
  broken.value = false
  pageLoading.value = !isVideo.value && mode.value === 'page'
  if (!ready.value) return
  status.value = '저장 중…'
  clearTimeout(timer); timer = setTimeout(save, 350)
})
watch([fit, zoom], async () => {
  await nextTick()
  if (mode.value === 'page' && viewport.value) { viewport.value.scrollTop = 0; viewport.value.scrollLeft = 0 }
  else void locate()
})
watch(page, () => {
  if (mode.value === 'page' && viewport.value) { viewport.value.scrollTop = 0; viewport.value.scrollLeft = 0 }
  if (!mixed && !online && ready.value && mode.value === 'page' && page.value + 1 < props.book.pages) { const image = new Image(); image.src = imageUrl(page.value + 1) }
})
watch([page, ready], ([index, loaded], _, cleanup) => {
  if (!loaded || !online || index + 1 >= props.book.pages) return
  const request = new AbortController()
  const timer = setTimeout(async () => {
    const url = `${baseUrl}/prefetch/${index}`
    try {
      const response = await fetch(url, { method: 'POST', signal: request.signal })
      if (response.status === 429 && !request.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 700))
        if (!request.signal.aborted) await fetch(url, { method: 'POST', signal: request.signal })
      }
    } catch { /* Prefetch is optional and stops when the reader moves. */ }
  }, 300)
  cleanup(() => { clearTimeout(timer); request.abort() })
})
watch(mode, value => { if (toon) { try { localStorage.setItem('reader:toon-mode', value) } catch { /* Optional. */ } } void locate() })
onMounted(async () => {
  oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
  resizeObserver = new ResizeObserver(measureFrame)
  if (viewport.value) resizeObserver.observe(viewport.value)
  try {
    const saved = JSON.parse(localStorage.getItem('reader:appearance') || '{}')
    if (['width','screen','original'].includes(saved.fit)) fit.value = saved.fit
    if (saved.direction === 'rtl' || saved.direction === 'ttb') direction.value = saved.direction
    if (saved.swipe === false) swipe.value = false
  } catch { /* Optional preference. */ }
  let fallback = { page: 0, mode: toon ? (localStorage.getItem('reader:toon-mode') === 'page' ? 'page' : 'scroll') : 'page' }
  try {
    const saved = mixed ? null : localStorage.getItem(storageKey)
    if (saved) fallback = ehentaiToken || toonOnline ? JSON.parse(saved) ?? fallback : { ...fallback, page: Number(saved) }
  } catch { /* Optional browser storage. */ }
  try {
    if (mixed) throw new Error('local gallery')
    await pendingProgress.get(progressUrl)
    if (disposed) return
    const response = await fetch(progressUrl)
    if (!response.ok) throw new Error()
    const data = await response.json()
    const position = data.saved ? data : fallback
    page.value = clamp(position.page)
    mode.value = position.mode === 'scroll' ? 'scroll' : 'page'
    status.value = '읽던 위치 불러옴'
  } catch {
    page.value = clamp(mixed ? props.book.initialPage ?? 0 : fallback.page)
    mode.value = !mixed && fallback.mode === 'scroll' ? 'scroll' : 'page'
    status.value = mixed ? 'Reddit · 저장된 미디어' : '이 기기의 읽던 위치 사용 중'
  }
  if (disposed) return
  ready.value = true; save(); await locate()
  hideTimer = setTimeout(() => { if (!settings.value && !reader.value?.contains(document.activeElement)) controls.value = false }, 3500)
  window.addEventListener('keydown', keydown); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', visibility)
})
watch([fit, direction, swipe], () => { try { localStorage.setItem('reader:appearance', JSON.stringify({ fit: fit.value, direction: direction.value, swipe: swipe.value })) } catch { /* Optional preference. */ } })
onBeforeUnmount(flush)
onUnmounted(() => { document.body.style.overflow = oldOverflow; resizeObserver?.disconnect(); clearTimeout(hideTimer); disposed = true; window.removeEventListener('keydown', keydown); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility) })

</script>
<template>
  <section ref="reader" class="reader" :class="{ 'chrome-visible': controls, 'video-mode': isVideo, 'video-active': videoActive }" role="dialog" aria-modal="true" aria-label="작품 뷰어">
    <div ref="viewport" class="reader-viewport" tabindex="0" aria-label="읽기 화면 · 좌우 페이지 이동, 중앙 메뉴 표시" @click="surfaceClick" @wheel="wheel" @pointercancel="pointer = null" @touchcancel="touch = null" @keydown="surfaceKey" @pointerdown="pointerDown" @pointerup="pointerUp" @touchstart="touchstart" @touchend.passive="touchend">
      <div v-if="!ready" class="empty-state"><span class="loader" />읽던 위치를 불러오는 중</div>
      <template v-else-if="mode === 'page'">
        <div v-if="broken" class="empty-state" @click.stop>{{ isVideo ? '동영상을 불러오지 못했습니다.' : '이미지를 불러오지 못했습니다.' }}<UButton variant="outline" color="neutral"  :disabled="mediaSaving" @click="retryMedia">다시 불러오기</UButton><UButton v-if="currentMedia?.original_test" variant="soft" @click="emit('fallback-media', page); broken = false; pageLoading = false">기존 방식으로 재생</UButton><span v-if="currentMedia?.original_test">RedGIFs 원본 주소 조회 또는 영상 연결에 실패했습니다. 진단 로그에서 원인을 확인하세요.</span></div>
        <VideoPlayer ref="mixedVideo" v-else-if="isVideo" :key="`${page}:${currentMedia?.revision ?? 0}`" :src="imageUrl(page)" :poster="currentMedia?.poster" @fullscreen="videoFullScreen" @active="videoActivity" @preview-tap="toggleControls" @loaded="pageLoading = false" @ready="mediaLoaded" @buffering="value => pageLoading = value" @playing="videoPlayback" @diagnostic="report => emit('media-diagnostic', page, report)" @error="broken = true; pageLoading = false; displayedMedia = ''; if (mixed) emit('media-error', page)" />
        <div v-else class="page-stage" :style="{ width: `${Math.max(frame.width, imageWidth)}px` }"><img :key="mixed ? `${page}:${currentMedia?.revision ?? 0}` : undefined" :referrerpolicy="mixed ? 'no-referrer' : undefined" class="page-image" :style="{ width: `${imageWidth}px` }" :src="imageUrl(page)" :alt="`${page + 1}페이지`" draggable="false" @load="measured" @error="broken = true; pageLoading = false; displayedMedia = ''; if (mixed) emit('media-error', page)"></div>
      </template>
      <div v-else class="scroll-pages" :class="`scroll-${fit}`" :style="{ width: scrollWidth }"><ScrollPage v-for="index in book.pages" :key="index" :index="index - 1" :src="imageUrl(index - 1)" :fit="fit" :max-height="frame.height" :available-width="frame.width" :zoom="zoom" @visible="visible" /><div v-if="nextEpisode" class="episode-end"><UButton size="xl" icon="i-lucide-chevron-right" @click.stop="flush(); emit('episode', 1)">다음 회차 · {{ nextEpisode.title }}</UButton></div></div>
    </div>

    <Transition name="chrome"><header v-if="controls" class="top-overlay" @click.stop>
      <UButton variant="ghost" color="neutral" class="icon-button" @click="close" aria-label="목록으로 돌아가기"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6" /></svg></UButton>
      <div class="book-heading"><span>{{ mixed ? 'REDDIT' : toon ? toon.seriesTitle : ehentaiToken ? 'E-HENTAI' : book.remote ? 'ONLINE READER' : 'MY LIBRARY' }}</span><StatusCheck v-if="currentMedia?.badge === 'seen'" class="ml-2" gray double label="뷰어로 봄" /><UBadge v-else-if="currentMedia?.badge === 'new'" class="ml-2" size="xs" color="primary" variant="soft">NEW</UBadge><h2>{{ currentMedia?.title || book.title }}</h2></div>
      <div class="top-actions"><UButton v-if="mixed" variant="ghost" color="neutral" class="icon-button" :disabled="mediaSaving" @click="retryMedia" aria-label="미디어 다시 불러오기" title="미디어 다시 불러오기"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3" /></svg></UButton><UButton v-if="mixed && currentMedia?.stored" variant="ghost" color="error" class="icon-button" :disabled="mediaSaving" @click="deleteMedia" aria-label="다운로드 파일 삭제" title="다운로드 파일 삭제"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg></UButton><MediaSaveButton v-if="mixed" icon-only :stored="currentMedia?.stored" :blocked="mediaSaving" :state="currentMedia?.save_state" @save="emit('keep', page)" @cancel="emit('cancel-keep', page)" /><UButton variant="ghost" color="neutral" class="icon-button" @click="emit('detail', page)" aria-label="작품 상세 보기" title="작품 상세 보기"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg></UButton><UButton variant="ghost" color="neutral" class="icon-button" @click="toggleSettings" aria-label="뷰어 설정" :aria-expanded="settings"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 17h16M9 4v6m6 4v6" /></svg></UButton><UButton variant="ghost" color="neutral" class="icon-button hide-button" @click="controls = false; settings = false" aria-label="메뉴 숨기기"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg></UButton></div>
    </header></Transition>

    <Transition name="panel"><aside v-if="controls && settings" class="settings-panel" aria-label="뷰어 설정 패널" @click.stop>
      <div class="panel-title"><h3>읽기 설정</h3><UButton variant="ghost" color="neutral" icon="i-lucide-x" square @click="settings = false" aria-label="설정 닫기" /></div>
      <fieldset v-if="!isVideo"><legend>이미지 맞춤</legend><UTabs :content="false" size="sm" :ui="tabUi" :items="[{ label: '화면 맞춤', value: 'screen' }, { label: '폭 맞춤', value: 'width' }, { label: '원본 크기', value: 'original' }]" :model-value="fit" @update:model-value="value => setFit(value as 'width' | 'screen' | 'original')" /></fieldset>
      <fieldset v-if="!mixed"><legend>읽기 방식</legend><UTabs :content="false" size="sm" :ui="tabUi" :items="[{ label: '페이지 넘김', value: 'page' }, { label: '세로 스크롤', value: 'scroll' }]" :model-value="mode" @update:model-value="value => mode = value as 'page' | 'scroll'" /></fieldset>
      <fieldset><legend>읽기 방향</legend><UTabs :content="false" size="sm" :ui="tabUi" :items="[{ label: '오른쪽', icon: 'i-lucide-arrow-right', value: 'ltr' }, { label: '왼쪽', icon: 'i-lucide-arrow-left', value: 'rtl' }, { label: '세로', icon: 'i-lucide-arrow-down', value: 'ttb' }]" :model-value="direction" @update:model-value="value => direction = value as 'ltr' | 'rtl' | 'ttb'" /></fieldset>
      <div v-if="toon" class="read-actions episode-actions"><UButton variant="ghost" color="neutral" size="sm" block icon="i-lucide-chevron-left" :disabled="!previousEpisode" @click="flush(); emit('episode', -1)">이전 회차</UButton><UButton variant="ghost" color="neutral" size="sm" block trailing-icon="i-lucide-chevron-right" :disabled="!nextEpisode" @click="flush(); emit('episode', 1)">다음 회차</UButton></div><div class="zoom-row"><span>스와이프로 넘기기</span><USwitch v-model="swipe" aria-label="스와이프로 페이지 넘기기" /></div>
      <div v-if="!isVideo" class="zoom-row"><span>확대 (%)</span><UInputNumber v-model="zoom" variant="soft" :min="50" :max="300" :step="25" size="sm" class="w-32" aria-label="확대 비율" /></div>
      <div v-if="mixed" class="read-actions"><MediaSaveButton :stored="currentMedia?.stored" :blocked="mediaSaving" :state="currentMedia?.save_state" @save="emit('keep', page)" @cancel="emit('cancel-keep', page)" /></div>
      <div v-if="!mixed" class="read-actions"><UButton variant="ghost" color="neutral" size="sm" block v-if="!ehentaiToken" @click="setRead(true)">읽음으로 표시</UButton><UButton variant="ghost" color="neutral" size="sm" block @click="setRead(false)">안 읽음으로 변경</UButton></div><p class="sync-status" role="status">{{ status }}</p><p class="keyboard-hint">← → 페이지 이동 · Space 메뉴</p>
    </aside></Transition>

    <Transition name="chrome"><footer v-if="controls && !videoActive" class="bottom-overlay" @click.stop>
      <div class="page-row" :class="{ reversed: direction === 'rtl' }" :style="{ flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }"><UButton variant="soft" color="neutral" size="xl" square icon="i-lucide-chevron-left" :disabled="!ready || page === 0" @click="move(-1); locate()" aria-label="이전 페이지" /><label class="page-count"><UInput :model-value="page + 1" type="number" min="1" :max="book.pages" inputmode="numeric" class="w-16" :ui="{ base: 'text-center' }" aria-label="페이지 번호" @change="jump" />
<span>/ {{ book.pages }}</span></label><UButton variant="soft" color="neutral" size="xl" square icon="i-lucide-chevron-right" :disabled="!ready || !book.pages" @click="move(1); locate()" aria-label="다음 페이지" /><Transition name="loading-fade"><span v-if="showLoading" class="page-loading" role="status" aria-label="페이지 불러오는 중"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /></span></Transition></div>
      <USlider class="page-slider" :ui="{ root: 'cursor-pointer', thumb: 'cursor-grab active:cursor-grabbing' }" :min="1" :max="Math.max(2, book.pages)" :disabled="book.pages < 2" :model-value="page + 1" :dir="direction === 'rtl' ? 'rtl' : 'ltr'" @update:model-value="value => { if (typeof value === 'number') { page = clamp(value - 1); locate() } }"></USlider><span class="tap-hint">{{ mode !== 'page' ? '화면 터치로 메뉴 표시·숨기기' : direction === 'ttb' ? '위아래 터치·스와이프로 페이지 이동 · 중앙 터치로 메뉴' : '좌우 터치로 페이지 이동 · 중앙 터치로 메뉴' }}</span>
    </footer></Transition>
    <UButton variant="ghost" color="neutral" v-if="!controls" class="reveal-button" aria-label="읽기 메뉴 표시" @click="showControls"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg><span>{{ page + 1 }} / {{ book.pages }}</span><Transition name="loading-fade"><span v-if="showLoading" class="page-loading" role="status" aria-label="페이지 불러오는 중"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /></span></Transition></UButton>

    <p v-if="detailError" class="detail-error" role="alert">{{ detailError }}</p>
    <dialog ref="endPrompt" class="end-prompt" tabindex="-1" aria-labelledby="end-prompt-title">
      <h2 id="end-prompt-title">{{ promptReason === 'end' ? '마지막 페이지입니다' : '뷰어를 닫을까요?' }}</h2>
      <p>{{ promptReason === 'end' ? (nextEpisode ? `다음 회차: ${nextEpisode.title}` : '뷰어를 닫을까요?') : '뒤로 가기 동작이 감지되었습니다.' }}</p>
      <div class="end-actions">
        <UButton v-if="promptReason === 'end' && nextEpisode" type="button" class="primary-button next-episode" @click="endPrompt?.close(); flush(); emit('episode', 1)">다음 회차</UButton>
        <UButton variant="outline" color="neutral" type="button" @click="endPrompt?.close()">계속 보기</UButton>
        <UButton type="button" :variant="promptReason === 'end' && nextEpisode ? 'outline' : 'solid'" :color="promptReason === 'end' && nextEpisode ? 'neutral' : 'primary'" :class="{ 'primary-button': !(promptReason === 'end' && nextEpisode) }" @click="endPrompt?.close(); close()">뷰어 닫기</UButton>
      </div>
    </dialog>
  </section>
</template>
<style scoped>
.reader{position:fixed;inset:0;z-index:1000;background:#08090c;color:#f3f5fa;font-family:Inter,system-ui,sans-serif;isolation:isolate}.reader-viewport{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-x pan-y pinch-zoom;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#373943 transparent;outline:none}.page-stage{min-height:100%;display:grid;place-items:center}.page-image{display:block;max-width:none;height:auto;user-select:none}.scroll-pages{margin:0 auto}.scroll-original{min-width:100%}.reader button{cursor:pointer}.reader button:disabled{opacity:.25;cursor:default}.reader button:focus-visible,.reader input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.reader svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}.icon-button{width:44px;height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:#ffffff0b;backdrop-filter:blur(12px)}.icon-button:hover{background:#ffffff18}.top-overlay{position:absolute;inset:0 0 auto;margin:0;max-width:none;padding:max(18px,env(safe-area-inset-top)) 28px 38px;display:flex;gap:16px;align-items:center;background:linear-gradient(#090b10ee,#090b10b8 70%,transparent);pointer-events:none}.top-overlay>*{pointer-events:auto}.book-heading{flex:1;min-width:0}.book-heading>span{font-size:10px;letter-spacing:.18em;color:#b4bcce}.book-heading h2{font-size:16px;font-weight:550;line-height:1.4;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:4px 0 0}.top-actions{display:flex;gap:8px}.bottom-overlay{position:absolute;inset:auto 0 0;display:flex;flex-direction:column;align-items:center;padding:36px 24px max(18px,env(safe-area-inset-bottom));background:linear-gradient(transparent,#090b10ce 40%,#090b10f2);pointer-events:none}.bottom-overlay>*{pointer-events:auto}.page-row{display:flex;align-items:center;gap:20px}.page-row{position:relative}.page-loading{position:absolute;top:50%;left:100%;margin-left:12px;transform:translateY(-50%);display:grid;place-items:center;pointer-events:none;color:#f3f5fa}.reveal-button .page-loading{left:auto;right:100%;margin:0 10px 0 0}.loading-fade-enter-active,.loading-fade-leave-active{transition:opacity .15s}.loading-fade-enter-from,.loading-fade-leave-to{opacity:0}.page-count{display:flex;align-items:center;gap:8px;font-size:13px;font-variant-numeric:tabular-nums;color:#aeb6c8}.page-count input{appearance:textfield}.page-count input::-webkit-inner-spin-button{appearance:none}.page-slider{width:min(460px,80vw);margin:14px 0 6px}.tap-hint{font-size:11px;color:#99a1b3;margin-top:4px}.settings-panel{position:absolute;right:28px;top:88px;width:340px;padding:20px;border-radius:22px;background:#191c25ed;box-shadow:0 20px 80px #0009;backdrop-filter:blur(24px);max-height:calc(100dvh - 230px);overflow:auto}.panel-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.panel-title h3{margin:0;font-size:16px;font-weight:600}.settings-panel fieldset{border:0;padding:0;margin:0 0 20px;min-width:0}.settings-panel legend{font-size:12px;color:#a9b1c3;margin-bottom:10px;padding:0}.zoom-row{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#a9b1c3}.zoom-row>div{display:flex;align-items:center;gap:8px}.read-actions{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;margin-top:20px;padding:4px;border-radius:calc(var(--ui-radius)*2);background:var(--ui-bg-elevated)}.episode-actions{margin:0 0 20px}.episode-end{display:flex;justify-content:center;padding:32px 16px 120px}.sync-status{font-size:11px;color:#a6b7a9;margin:22px 0 0}.keyboard-hint{font-size:10px;color:#8f98aa;line-height:1.6;margin:8px 0 0}.reveal-button{min-height:44px;position:absolute;right:20px;bottom:max(18px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;background:#1519239c;border-radius:24px;padding:0 14px;backdrop-filter:blur(12px);opacity:.65}.reveal-button span{font-size:11px;font-variant-numeric:tabular-nums}.empty-state{min-height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-size:13px;color:#99a1b3}.empty-state button{border-radius:12px;padding:8px 16px;background:#202634}.loader{width:24px;height:24px;border:2px solid #ffffff20;border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}.chrome-enter-active,.chrome-leave-active,.panel-enter-active,.panel-leave-active{transition:opacity .18s ease,transform .18s ease}.chrome-enter-from,.chrome-leave-to{opacity:0}.panel-enter-from,.panel-leave-to{opacity:0;transform:translateY(-8px)}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:600px){.top-overlay{padding:12px 12px 30px;gap:10px}.book-heading h2{font-size:13px}.book-heading>span{font-size:9px}.top-actions{gap:4px}.icon-button{width:40px;height:44px;border-radius:12px}.hide-button{display:none}.settings-panel{top:76px;left:12px;right:12px;width:auto;max-height:calc(100dvh - 220px);padding:18px;border-radius:20px}.bottom-overlay{padding-left:12px;padding-right:12px}.page-row{gap:16px}.reveal-button{right:12px}.keyboard-hint{display:none}}@media(prefers-reduced-motion:reduce){.chrome-enter-active,.chrome-leave-active,.panel-enter-active,.panel-leave-active{transition:none}.loader{animation:none}}
</style>

<style scoped>.page-row.reversed svg{transform:rotate(180deg)}</style>
<style scoped>
.detail-error{position:absolute;z-index:3;top:70px;right:12px;margin:0;padding:8px 12px;border-radius:8px;background:var(--canvas);color:var(--danger)}
.end-prompt{margin:auto;width:min(360px,calc(100% - 32px));padding:22px;border:0;border-radius:16px;background:#202323;color:inherit}
.end-prompt:focus{outline:none}
.end-prompt::backdrop{background:#0009}
.end-prompt h2{margin:0;font-size:20px}
.end-prompt p{margin:8px 0 20px}
.end-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.end-actions .next-episode{grid-column:1/-1;justify-content:center}
.end-actions button{min-height:44px;padding:8px;justify-content:center}
</style>

<style scoped>
.page-slider{position:relative;display:flex;align-items:center;touch-action:none;user-select:none}
.page-track{position:relative;flex:1;height:5px;border-radius:999px;background:#ffffff35}
.page-range{position:absolute;height:100%;border-radius:inherit;background:var(--accent)}
.page-thumb{display:block;width:18px;height:18px;border-radius:50%;background:var(--accent)}
.page-thumb:focus-visible{outline:2px solid white;outline-offset:3px}
</style>

<style scoped>
.reader-viewport{z-index:0}.top-overlay,.bottom-overlay,.reveal-button{z-index:10}.settings-panel{z-index:20}
.video-mode .reader-viewport{overflow:hidden;scrollbar-gutter:auto}
.video-active .reveal-button{top:max(12px,env(safe-area-inset-top));bottom:auto}
</style>
