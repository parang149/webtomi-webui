<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import RedditGalleryGrid from './RedditGalleryGrid.vue'
import { ExposureSnapshot } from './reddit-exposure'
import { redditDisplayMode } from './reddit-display'
import type { VideoDiagnostic } from './video-diagnostics'
import Reader from './Reader.vue'
import { recoverMedia, retryUrl } from './reddit-media-retry'
import BottomPull from './BottomPull.vue'
import AppSelect from './AppSelect.vue'
import RedditThumb from './RedditThumb.vue'
import StatusCheck from './StatusCheck.vue'
import GalleryDetail from './GalleryDetail.vue'
import { loadReddit, redditStatus, redditRequest, type RedditItem, subscriberLabel, subscriberDescription, refreshRedditSubscribers, redditMediaUrl, redditPostUrl } from './reddit-client'
const props = defineProps<{ savedOnly?: boolean; historyOnly?: boolean; searchText?: string }>()
const emit = defineEmits<{ reading: [boolean]; 'stored-count': [number] }>()
const items = ref<RedditItem[]>([]), error = ref(''), requesting = ref(false), selected = ref<number | null>(null), sentinel = ref<HTMLElement>()
const readerItems = ref<RedditItem[]>([])
const mediaReader = ref<InstanceType<typeof Reader>>()
const revisions = ref<Record<string, number>>({}), thumbFailures = ref(new Set<string>()), mediaFailures = ref(new Set<string>())
const retryStage = ref('')
const retrying = ref(''), retryMany = ref(false)
function thumbFailed(id: string) { thumbFailures.value.add(id) }
function thumbLoaded(id: string) { thumbFailures.value.delete(id) }
async function mediaDiagnostic(index: number, report: VideoDiagnostic) {
  const item=readerItems.value[index]; if(!item) return
  const names: Record<VideoDiagnostic['event'],string>={network:'네트워크 수신',decode:'영상 디코딩',unsupported:'영상 형식 미지원',policy:'브라우저 재생 정책',fullscreen:'전체화면 전환',timeout:'재생 준비 시간 초과',aborted:'브라우저 재생 중단',unknown:'분류되지 않은 재생 오류'}
  error.value=`영상 재생 실패: ${names[report.event]} (MediaError ${report.code})`
  try { await redditRequest(`items/${encodeURIComponent(item.id)}/playback-error`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report),keepalive:true}) } catch { /* No retry loop for diagnostic delivery. */ }
  if (report.original && ['network','unsupported','decode'].includes(report.event) && !originalRetried.has(item.id) && selected.value !== null && visibleReaderIndex === index) {
    originalRetried.add(item.id)
    revisions.value={...revisions.value,[item.id]:(revisions.value[item.id]??0)+1}
    await nextTick()
    if (selected.value !== null && visibleReaderIndex === index) {error.value='';mediaReader.value?.reloadMedia(index);await mediaReader.value?.playVideo()}
  }
}
function mediaFailed(index: number) { visibleReaderIndex = index; directPlay = false; const item = readerItems.value[index]; if (item) mediaFailures.value.add(item.id) }
function applyRetried(updated: RedditItem) {
    items.value = items.value.map(item => item.id === updated.id ? {...updated,gallery_seen_at:item.gallery_seen_at} : item)
    readerItems.value = readerItems.value.map(item => item.id === updated.id ? { ...item, resource: updated.resource, stored: updated.stored, downloaded_at: updated.downloaded_at } : item)
}
async function retryItem(id: string) {
  if (retrying.value || keeping.value || redditStatus.value?.busy) return false
  retrying.value = id; error.value = ''
  let proceed = true
  try {
    const original = items.value.find(item => item.id === id)
    if (!original) return false
    const thumbnail = !mediaFailures.value.has(id)
    const updated = await recoverMedia(original, thumbnail, (revisions.value[id] ?? 0) + 1, undefined, undefined, stage => { retryStage.value = stage }, applyRetried)
    videoFallback.value.delete(id)
    if (thumbnail) thumbFailures.value.delete(id); else mediaFailures.value.delete(id)
    applyRetried(updated)
  } catch (e) { error.value = String(e); proceed = !/403|401|407|429|HTTP (502|503|504)|프록시|시간 초과|처리 중|Failed to fetch|NetworkError/i.test(error.value) }
  finally {
    revisions.value = { ...revisions.value, [id]: (revisions.value[id] ?? 0) + 3 }
    await nextTick()
    const index = readerItems.value.findIndex(item => item.id === id)
    if (index >= 0) mediaReader.value?.reloadMedia(index)
    retrying.value = ''; retryStage.value = ''
  }
  return proceed
}
async function retryMedia(index: number) { const item = readerItems.value[index]; if (item) await retryItem(item.id) }
const failedItems = computed(() => feedItems.value.filter(item => thumbFailures.value.has(item.id) || mediaFailures.value.has(item.id)))
async function retryVisibleFailures() {
  if (retryMany.value || retrying.value) return
  retryMany.value = true
  try {
    for (const item of failedItems.value.slice(0, 50)) {
      if (disposed) break
      if (!await retryItem(item.id)) break
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } finally { retryMany.value = false }
}
async function retryDownloads() {
  if (requesting.value || redditStatus.value?.busy || retrying.value || retryMany.value) return
  requesting.value = true; error.value = ''
  try { beginLoad(); await redditRequest('retry-failed', { method: 'POST' }); await refresh() }
  catch (e) { error.value = String(e); trackingLoad = false }
  finally { requesting.value = false }
}
let directPlay = false, galleryScroll = 0
async function playVideo(index: number) { galleryScroll = window.scrollY; open(index); directPlay = !(typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches); await nextTick(); await mediaReader.value?.playVideo() }
async function videoExit() { if (!directPlay) return; const scroll = galleryScroll; close(); await nextTick(); window.scrollTo({ top: scroll, behavior: 'instant' }) }
async function deleteMedia(index: number) {
  const item = readerItems.value[index]
  if (!item?.stored || deleting.value) return
  deleting.value = item.id; error.value = ''
  try {
    const saved: RedditItem = await (await redditRequest(`items/${encodeURIComponent(item.id)}/stored`, { method: 'DELETE' })).json()
    items.value = items.value.map(value => value.id === saved.id ? saved : value)
    readerItems.value = readerItems.value.map(value => value.id === saved.id ? { ...value, stored: false, downloaded_at: null } : value)
    if (props.savedOnly) mediaReader.value?.afterMediaDeleted(index)
  } catch (e) { error.value = String(e) } finally { deleting.value = '' }
}
let trackingLoad = false, polling = false
function beginLoad() { trackingLoad = true }
const exposureSnapshot = new ExposureSnapshot(), exposureBorders = ref(new Set<string>())
function resetExposureBorders() { exposureSnapshot.reset(); exposureBorders.value = new Set() }
const pendingExposure = new Set<string>()
const exposureObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || entry.intersectionRatio < .25) continue
    const id=(entry.target as HTMLElement).dataset.exposureId
    const item=items.value.find(item=>item.id===id)
    if (!item || item.gallery_seen_at || pendingExposure.has(item.id)) continue
    pendingExposure.add(item.id)
    void redditRequest(`items/${encodeURIComponent(item.id)}/exposed`,{method:'POST',keepalive:true}).then(()=>{
      items.value=items.value.map(value=>value.id===item.id?{...value,gallery_seen_at:Math.floor(Date.now()/1000)}:value)
    }).catch(()=>{}).finally(()=>pendingExposure.delete(item.id))
  }
}, {threshold:.25}) : undefined
const vExposed = { mounted(el:HTMLElement,binding:{value:string}) {el.dataset.exposureId=binding.value;exposureObserver?.observe(el)}, unmounted(el:HTMLElement) {exposureObserver?.unobserve(el)} }
const videoFallback = ref(new Set<string>())
function videoUrl(item: RedditItem) { return item.kind === 'video' && !item.stored && redditStatus.value?.config.redgifs_original && !videoFallback.value.has(item.id) ? `/api/reddit/video/${item.id}` : redditMediaUrl(item, false, false) }
function fallbackMedia(index: number) {const item=readerItems.value[index]; if(item) videoFallback.value.add(item.id)}
const cancelling = ref(''), deleting = ref('')
async function cancelKeep(index: number) {
  const item=readerItems.value[index]; if(!item || cancelling.value) return
  cancelling.value=item.id
  try { await redditRequest(`items/${encodeURIComponent(item.id)}/keep/cancel`, {method:'POST'}); await loadReddit() }
  catch(e) {error.value=String(e)} finally {cancelling.value=''}
}
const detail = ref<RedditItem>()
const book = computed(() => ({ id: 'reddit-gallery', title: 'Reddit', pages: readerItems.value.length, media: readerItems.value.map(item => ({ url: retryUrl(videoUrl(item), revisions.value[item.id] ?? 0), poster: retryUrl(redditMediaUrl(item, true), revisions.value[item.id] ?? 0), kind: item.kind, title: item.title, stored: item.stored, original_test: item.kind === 'video' && !!redditStatus.value?.config.redgifs_original && !item.stored && !videoFallback.value.has(item.id), save_state: cancelling.value === item.id ? 'cancelling' : redditStatus.value?.saves?.[item.id] || (keeping.value === item.id ? 'downloading' : undefined), revision: revisions.value[item.id] ?? 0, badge: item.seen_at ? 'seen' as const : undefined })), initialPage: selected.value ?? 0 }))
const savingSeen = new Set<string>()
let visibleReaderIndex = -1
const originalRetried = new Set<string>()
const keeping = ref<string>()
async function keep(index: number) {
  const item = readerItems.value[index]
  if (!item || item.stored || keeping.value) return
  keeping.value = item.id
  try {
    const saved: RedditItem = await (await redditRequest(`items/${encodeURIComponent(item.id)}/keep`, { method: 'POST' })).json()
    items.value = items.value.map(value => value.id === saved.id ? saved : value)
    readerItems.value = readerItems.value.map(value => value.id === saved.id ? { ...value, stored: true, downloaded_at: saved.downloaded_at } : value)
  } catch (e) { error.value = String(e).includes('다운로드를 취소했습니다') ? '' : String(e) } finally { keeping.value = undefined; await loadReddit().catch(() => {}) }
}
async function mediaShown(index: number) {
  visibleReaderIndex = index
  const snapshot = readerItems.value[index]
  if (!snapshot) return
  mediaFailures.value.delete(snapshot.id)
  const current = items.value.find(item => item.id === snapshot.id)
  if (!current || savingSeen.has(current.id)) return
  savingSeen.add(current.id)
  try {
    const saved: RedditItem = await (await redditRequest(`items/${encodeURIComponent(current.id)}/seen`, { method: 'POST', keepalive: true })).json()
    items.value = items.value.map(item => item.id === saved.id ? saved : item)
    readerItems.value = readerItems.value.map(item => item.id === saved.id ? {...item,seen_at:saved.seen_at} : item)
  } catch { error.value = '본 항목 상태를 저장하지 못했습니다. 다시 열어 재시도하세요.' }
  finally { savingSeen.delete(current.id) }
}
const mediaFilter = ref('all')
const feedItems = computed(() => items.value.filter(item => (props.historyOnly ? !!item.seen_at : props.savedOnly ? item.stored : item.subreddit.toLowerCase() === redditStatus.value?.config.subreddit.toLowerCase()) && (!props.searchText || `${item.title} ${item.subreddit}`.toLowerCase().includes(props.searchText.toLowerCase())) && (mediaFilter.value === 'all' || (mediaFilter.value === 'video' ? item.kind === 'video' : item.kind !== 'video'))).sort((a,b)=>props.historyOnly ? (b.seen_at ?? 0)-(a.seen_at ?? 0) : 0))
watch(items, list => emit('stored-count', list.filter(item => item.stored).length))
let timer: ReturnType<typeof setInterval> | undefined, lastBusy = false, disposed = false
const automatic = ref(false)
const batchSize = computed(() => redditStatus.value?.config.batch_size ?? 30)
const page = ref(1), gallery = ref<HTMLElement>()
const pageOffset = computed(() => redditDisplayMode.value === 'pages' ? (page.value - 1) * batchSize.value : 0)
const displayedItems = computed(() => redditDisplayMode.value === 'pages' ? feedItems.value.slice(pageOffset.value, pageOffset.value + batchSize.value) : feedItems.value)
async function changePage(value: number) { page.value = value; resetScrollGate(); await nextTick(); gallery.value?.scrollIntoView({ block: 'start' }) }
watch([redditDisplayMode, mediaFilter, () => redditStatus.value?.config.subreddit, batchSize], () => { page.value = 1; resetScrollGate() })
watch(() => feedItems.value.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / batchSize.value))) })
const refreshing = ref(false)
watch(() => redditStatus.value?.busy, busy => { if (!busy) refreshing.value=false })
function canRefresh() { return !disposed && !retrying.value && !retryMany.value && selected.value === null && !detail.value && ((props.savedOnly || props.historyOnly) || !!redditStatus.value?.config.enabled) && !redditStatus.value?.busy && !redditStatus.value?.stopping && !requesting.value && !refreshing.value }
const pullArea = ref<InstanceType<typeof BottomPull>>()
function resetScrollGate() { pullArea.value?.reset() }
function canAccumulate() { return !disposed && automatic.value && selected.value === null && !detail.value && !!redditStatus.value?.config.enabled && !redditStatus.value.busy && !redditStatus.value.stopping && !requesting.value && !redditStatus.value.exhausted && feedItems.value.length > 0 && !!sentinel.value?.getClientRects().length }
watch([() => redditStatus.value?.config.subreddit, () => redditStatus.value?.busy, requesting, selected, detail], resetScrollGate)
watch(() => redditStatus.value?.config.subreddit, () => { trackingLoad = false })
async function refresh() {
  await loadReddit(); items.value = await (await redditRequest(redditStatus.value?.config.fresh_list && !props.savedOnly && !props.historyOnly ? 'items?session=true' : 'items')).json()
  exposureBorders.value = exposureSnapshot.observe(items.value)

  const failed = /^오류:/.test(redditStatus.value?.message || '')
  if (trackingLoad && !requesting.value && !redditStatus.value?.busy) { trackingLoad = false }
  if (failed) automatic.value = false
}
async function more(manual = false) {
  if (!manual && /^오류:/.test(redditStatus.value?.message || '')) { automatic.value = false; return }
  if (requesting.value || redditStatus.value?.busy || redditStatus.value?.stopping || !redditStatus.value?.config.enabled || redditStatus.value?.exhausted || (!manual && !automatic.value)) return
  resetScrollGate(); requesting.value = true; error.value = ''; if (manual) automatic.value = true
  try { beginLoad(); await redditRequest('batch', { method: 'POST' }); await refresh() } catch (e) { trackingLoad = false; error.value = String(e); automatic.value = false } finally { requesting.value = false }
}
const batchLabel = computed(() => redditStatus.value?.stopping ? '정지 중…' : redditStatus.value?.busy ? '정지' : feedItems.value.length ? (redditStatus.value?.config.mode === 'online' ? `다음 ${batchSize.value}개 불러오기` : `다음 ${batchSize.value}개 받기`) : (redditStatus.value?.config.mode === 'online' ? `${batchSize.value}개 불러오기` : `${batchSize.value}개 받기`))
const batchDisabled = computed(() => !!retrying.value || retryMany.value || requesting.value || redditStatus.value?.stopping || (!redditStatus.value?.busy && (refreshing.value || !redditStatus.value?.config.enabled || redditStatus.value?.exhausted)))
async function toggleBatch() {
  if (!redditStatus.value?.busy) { await more(true); return }
  pullArea.value?.interrupt(); automatic.value = false; requesting.value = true; error.value = ''
  try { await redditRequest('stop', { method: 'POST' }); lastBusy = true; await loadReddit(); automatic.value = true } catch (e) { error.value = String(e) } finally { requesting.value = false }
}
async function selectSubreddit(subreddit: string) {
  if (requesting.value || refreshing.value || redditStatus.value?.busy) return
  resetScrollGate(); requesting.value = true; automatic.value = false; error.value = ''
  try { await redditRequest('select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subreddit }) }); resetExposureBorders(); if (redditStatus.value?.config.fresh_list) { const response=await redditRequest('open',{method:'POST'}); if(response.status===202) {items.value=[];lastBusy=true;} } await refresh() } catch (e) { error.value = String(e) } finally { requesting.value = false }
  if (!error.value) { automatic.value = true; if (!feedItems.value.length) await more(true) }
}
function date(value?: number | null) { return value ? new Date(value * 1000).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '기록 없음' }
function open(index: number) { readerItems.value = feedItems.value.map(item => ({ ...item })); selected.value = index; emit('reading', true) }
function close() { directPlay = false; detail.value = undefined; selected.value = null; emit('reading', false) }
function showDetail(index = 0) { detail.value = readerItems.value[index] }
function readDetail() { detail.value = undefined }
async function latest() {
  if (!canRefresh()) return
  if (props.savedOnly || props.historyOnly) { try { resetExposureBorders(); await refresh() } catch (e) { error.value = String(e) }; return }
  page.value = 1
  refreshing.value = true; requesting.value = true; error.value = ''
  try { beginLoad(); await redditRequest('latest', { method: 'POST' }); resetExposureBorders(); if (redditStatus.value?.config.fresh_list) items.value=[]; automatic.value = true; await refresh() }
  catch (e) { trackingLoad = false; error.value = String(e); automatic.value = false }
  finally { requesting.value = false; if (!redditStatus.value?.busy) refreshing.value = false }
}

onMounted(async () => {
  try { await loadReddit(); if (!props.savedOnly && !props.historyOnly && redditStatus.value?.config.fresh_list) { const response=await redditRequest('open',{method:'POST'}); lastBusy=response.status===202; } await refresh(); automatic.value = !(props.savedOnly || props.historyOnly) && !/^오류:/.test(redditStatus.value?.message || ''); if (!(props.savedOnly || props.historyOnly) && !feedItems.value.length && automatic.value && !/^정지됨/.test(redditStatus.value?.message || '')) void more(true) } catch (e) { error.value = String(e) }
  if (disposed) return
  if (!(props.savedOnly || props.historyOnly)) void refreshRedditSubscribers().catch(() => {})
  timer = setInterval(async () => { if (polling || requesting.value) return; polling = true; try { await loadReddit(); const busy = !!redditStatus.value?.busy; if ((props.savedOnly || props.historyOnly) || lastBusy || busy || trackingLoad) await refresh(); lastBusy = busy } catch { automatic.value = false } finally { polling = false } }, 2000)
})
onUnmounted(() => { disposed = true; resetScrollGate(); clearInterval(timer); exposureObserver?.disconnect(); emit('reading', false) })
</script>
<template>
  <section class="reddit-pane">
    <header><div><h2>{{ historyOnly ? 'Reddit 읽기 기록' : savedOnly ? 'Reddit 저장 항목' : 'Reddit' }}</h2><p v-if="!savedOnly && !historyOnly" :title="subscriberDescription(redditStatus?.config.subreddit || '')">r/{{ redditStatus?.config.subreddit }} · {{ subscriberLabel(redditStatus?.config.subreddit || '') }} · 추가 항목은 아래에 표시 · {{ feedItems.length }}개</p></div><div class="flex flex-wrap gap-2"><UButton variant="soft" :loading="refreshing" :disabled="!canRefresh()" @click="latest">목록 새로 확인</UButton><UButton v-if="!savedOnly && !historyOnly" :disabled="batchDisabled" :color="redditStatus?.busy ? 'error' : 'primary'" @click="toggleBatch">{{ batchLabel }}</UButton></div></header>
    <AppSelect v-if="!savedOnly && !historyOnly && redditStatus?.config.subreddits?.length" :model-value="redditStatus.config.subreddit" :options="redditStatus.config.subreddits.map(name => ({ value: name, label: `r/${name} · ${subscriberLabel(name)}` }))" label="서브레딧 선택" :disabled="requesting || redditStatus.busy" class="mb-4" @update:model-value="selectSubreddit" />
    <AppSelect v-model="mediaFilter" :options="[{value:'all',label:'전체'},{value:'image',label:'사진'},{value:'video',label:'동영상'}]" label="미디어 필터" class="mb-4" />
    <div class="flex flex-wrap gap-2 mb-3"><UButton v-if="failedItems.length" variant="soft" :loading="retryMany" :disabled="!!retrying || !!redditStatus?.busy || !!keeping" @click="retryVisibleFailures">실패한 미디어 {{ failedItems.length }}개 다시 불러오기</UButton><UButton v-if="!savedOnly && !historyOnly && redditStatus?.failed_downloads" variant="soft" :disabled="requesting || !!redditStatus?.busy || !!retrying || retryMany" @click="retryDownloads">다운로드 실패 {{ redditStatus.failed_downloads }}개 재시도</UButton></div>
    <p v-if="retrying" role="status">{{ retryStage }}</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="!savedOnly && !historyOnly" role="status">{{ redditStatus?.message }}</p>
    <p v-if="!feedItems.length && !redditStatus?.busy">{{ historyOnly ? '뷰어로 본 Reddit 항목이 없습니다.' : savedOnly ? '영구 저장한 Reddit 미디어가 없습니다.' : '설정에서 지정한 서브레딧의 미디어를 받아 갤러리로 표시합니다.' }}</p>
    <div ref="gallery" />
    <BottomPull ref="pullArea" :refresh-enabled="canRefresh()" :refresh-loading="refreshing" :enabled="!savedOnly && !historyOnly && redditDisplayMode !== 'pages' && canAccumulate()" :loading="selected === null && !detail && !!(redditStatus?.busy || requesting)" @load="more()" @refresh="latest">
    <RedditGalleryGrid :count="displayedItems.length" :virtual="redditDisplayMode === 'virtual'" :titles="redditStatus?.config.show_titles !== false">
      <template #default="{ index: localIndex }">
      <article v-for="item in [displayedItems[localIndex]!]" :key="item.id" :id="`reddit-card-${item.id}`" class="reddit-card" :class="{ 'reddit-familiar': exposureBorders.has(item.id) || !!item.seen_at }" v-exposed="item.id">
        <div class="reddit-preview">
        <button class="reddit-cover" data-pull-surface type="button" @click="open(pageOffset + localIndex)" :aria-label="redditStatus?.config.show_titles === false ? `미디어 ${pageOffset + localIndex + 1} 보기` : `${item.title} 보기`">
          <RedditThumb :revision="revisions[item.id] ?? 0" @failed="thumbFailed(item.id)" @loaded="thumbLoaded(item.id)" :id="item.id" :kind="item.kind" :stored="item.stored" :src="retryUrl(redditMediaUrl(item, true), revisions[item.id] ?? 0)" :title="redditStatus?.config.show_titles === false ? 'Reddit 미디어' : item.title" />
          <span v-if="item.stored" class="media-stored" aria-label="영구 저장됨">↓</span>
          <span v-if="item.kind === 'gif'" class="media-kind">GIF</span>
          <StatusCheck v-if="item.seen_at" overlay gray double label="뷰어로 봄" />
          <StatusCheck v-else-if="exposureBorders.has(item.id)" overlay gray label="갤러리에서 노출됨" />
        </button>
        <button v-if="thumbFailures.has(item.id) || mediaFailures.has(item.id) || !redditMediaUrl(item, true)" class="reddit-retry" type="button" :disabled="!!retrying || retryMany || !!redditStatus?.busy || !!keeping" aria-label="미디어 다시 불러오기" title="미디어 다시 불러오기" @click.stop="retryItem(item.id)">{{ retrying === item.id ? '…' : '↻' }}</button>
        <button v-if="item.kind === 'video'" class="reddit-play" data-pull-surface type="button" aria-label="동영상 재생" @click.stop="playVideo(pageOffset + localIndex)"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 7 26 16 11 25Z" /></svg></button>
        </div>
        <div v-if="redditStatus?.config.show_titles !== false" class="reddit-card-footer"><span class="reddit-title">{{ item.title }}</span></div>
      </article>
      </template>
    </RedditGalleryGrid>
    <template #footer><div v-if="!savedOnly && !historyOnly" ref="sentinel" class="reddit-sentinel">
      <span v-if="redditStatus?.exhausted && !redditStatus?.busy">마지막 항목입니다.</span>
      <template v-else>
        <div v-if="redditDisplayMode !== 'pages' && feedItems.length && !redditStatus?.busy && !requesting" class="scroll-charge">
          <span class="scroll-charge-label">{{ automatic ? `위로 당겼다 놓으면 다음 ${batchSize}개` : '다음 받기 버튼으로 다시 시작하세요' }}</span>
        </div>
        <UButton variant="soft" :disabled="batchDisabled" @click="toggleBatch">{{ batchLabel }}</UButton>
      </template>
    </div>
    </template></BottomPull>
    <div v-if="redditDisplayMode === 'pages' && feedItems.length" class="reddit-pagination"><UPagination :page="page" :total="feedItems.length" :items-per-page="batchSize" :sibling-count="1" @update:page="changePage" /></div>
    <UModal title="Reddit 상세" :open="!!detail" :ui="{ overlay: 'z-[1100]', content: 'sm:max-w-2xl z-[1101]' }" @update:open="value => { if (!value) detail = undefined }">
      <template #body><GalleryDetail v-if="detail" :title="detail.title" :external-url="redditPostUrl(detail)" external-label="Reddit 원본 포스트에서 열기" :cover="detail.kind !== 'video' ? redditMediaUrl(detail, true) || undefined : undefined" :placeholder="detail.kind === 'video' ? '▶ 동영상' : undefined" :info="`r/${detail.subreddit} · ${detail.kind === 'video' ? '동영상' : detail.kind === 'gif' ? 'GIF' : '이미지'}`" :fields="[{ name: '게시 날짜', values: [date(detail.created)] }, { name: '다운로드 날짜', values: [date(detail.downloaded_at)] }]">
        <template #actions><UButton class="reddit-open-button" size="lg" @click="readDetail">계속 보기</UButton><UButton variant="soft" color="neutral" size="lg" @click="detail = undefined">닫기</UButton></template>
      </GalleryDetail></template>
    </UModal>

    <Reader ref="mediaReader" v-if="selected !== null && readerItems.length" :book="book" :detail-open="!!detail" :detail-error="error || undefined" :media-saving="!!keeping || !!deleting || !!retrying || retryMany" @retry-media="retryMedia" @media-error="mediaFailed" @media-diagnostic="mediaDiagnostic" @keep="keep" @cancel-keep="cancelKeep" @fallback-media="fallbackMedia" @delete-media="deleteMedia" @video-exit="videoExit" @detail="showDetail" @media-shown="mediaShown" @close="close" />
  </section>
</template>
<style scoped>
.reddit-card.reddit-familiar :deep(.reddit-thumb img){opacity:.65}
.reddit-pane>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.reddit-pane h2,.reddit-pane header p{margin:0}.reddit-pane p{color:var(--muted);overflow-wrap:anywhere}
.reddit-card{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:6px;background:var(--canvas)}
.reddit-cover{position:relative;display:block;width:100%;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;flex-shrink:0}
.reddit-cover:focus-visible{outline:3px solid var(--accent);outline-offset:-3px}
.reddit-preview{position:relative;flex-shrink:0}.reddit-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:56px;height:56px;padding:0;border:0;border-radius:50%;background:#0009;color:white;cursor:pointer}.reddit-play svg{width:28px;height:28px;fill:currentColor;pointer-events:none}.reddit-play:focus-visible{outline:3px solid var(--ui-primary);outline-offset:3px}
.reddit-retry{position:absolute;bottom:8px;left:8px;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:#000b;color:var(--ui-primary);font-size:24px;cursor:pointer}.reddit-retry:disabled{opacity:.5;cursor:wait}
.reddit-card-footer{padding:8px 10px}
.reddit-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;font-size:13px;line-height:1.5}
.media-kind{position:absolute;top:8px;right:8px;background:#000b;color:white;border-radius:6px;padding:4px 8px;font-size:12px;pointer-events:none}
.media-state{position:absolute;top:8px;left:8px;background:#000b;color:var(--ui-primary);border-radius:5px;padding:3px 6px;font-size:11px;font-weight:600;pointer-events:none}.media-state.is-new{background:var(--ui-primary);color:var(--ui-bg)}
.media-stored{position:absolute;bottom:8px;right:8px;background:#000b;color:white;border-radius:5px;padding:2px 7px;font-size:14px;pointer-events:none}
.reddit-sentinel{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px}
.reddit-pagination{display:flex;justify-content:center;overflow-x:auto;padding:12px 0}
.scroll-charge{display:grid;justify-items:center;gap:10px}.scroll-charge-label{font-size:12px;color:var(--muted);text-align:center}
</style>
