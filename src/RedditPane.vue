<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Reader from './Reader.vue'
import BottomPull from './BottomPull.vue'
import AppSelect from './AppSelect.vue'
import RedditThumb from './RedditThumb.vue'
import GalleryDetail from './GalleryDetail.vue'
import { loadReddit, redditStatus, redditRequest, type RedditItem, subscriberLabel, subscriberDescription, refreshRedditSubscribers } from './reddit-client'
const emit = defineEmits<{ reading: [boolean] }>()
const items = ref<RedditItem[]>([]), error = ref(''), requesting = ref(false), selected = ref<number | null>(null), sentinel = ref<HTMLElement>()
const readerItems = ref<RedditItem[]>([])
const detail = ref<RedditItem>()
const book = computed(() => ({ id: 'reddit-gallery', title: 'Reddit', pages: readerItems.value.length, media: readerItems.value.map(item => ({ url: `/api/reddit/media/${item.id}`, kind: item.kind, title: item.title, badge: item.seen_at ? 'seen' as const : item.is_new ? 'new' as const : undefined })), initialPage: selected.value ?? 0 }))
const savingSeen = new Set<string>()
async function mediaShown(index: number) {
  const snapshot = readerItems.value[index]
  if (!snapshot) return
  const current = items.value.find(item => item.id === snapshot.id)
  if (!current || current.seen_at || savingSeen.has(current.id)) return
  savingSeen.add(current.id)
  try {
    const saved: RedditItem = await (await redditRequest(`items/${encodeURIComponent(current.id)}/seen`, { method: 'POST', keepalive: true })).json()
    items.value = items.value.map(item => item.id === saved.id ? saved : item)
  } catch { error.value = '본 항목 상태를 저장하지 못했습니다. 다시 열어 재시도하세요.' }
  finally { savingSeen.delete(current.id) }
}
const feedItems = computed(() => items.value.filter(item => item.subreddit.toLowerCase() === redditStatus.value?.config.subreddit.toLowerCase() && (redditStatus.value?.config.all_media || item.kind === 'image')))
let timer: ReturnType<typeof setInterval> | undefined, lastBusy = false, disposed = false
const automatic = ref(false)
const pullArea = ref<InstanceType<typeof BottomPull>>()
function resetScrollGate() { pullArea.value?.reset() }
function canAccumulate() { return !disposed && automatic.value && selected.value === null && !detail.value && !!redditStatus.value?.config.enabled && !redditStatus.value.busy && !redditStatus.value.stopping && !requesting.value && !redditStatus.value.exhausted && feedItems.value.length > 0 && !!sentinel.value?.getClientRects().length }
watch([() => redditStatus.value?.config.subreddit, () => redditStatus.value?.busy, requesting, selected, detail], resetScrollGate)
async function refresh() { await loadReddit(); items.value = await (await redditRequest('items')).json(); if (/^오류:/.test(redditStatus.value?.message || '')) automatic.value = false }
async function more(manual = false) {
  if (!manual && /^오류:/.test(redditStatus.value?.message || '')) { automatic.value = false; return }
  if (requesting.value || redditStatus.value?.busy || redditStatus.value?.stopping || !redditStatus.value?.config.enabled || redditStatus.value?.exhausted || (!manual && !automatic.value)) return
  resetScrollGate(); requesting.value = true; error.value = ''; if (manual) automatic.value = true
  try { await redditRequest('batch', { method: 'POST' }); await loadReddit() } catch (e) { error.value = String(e); automatic.value = false } finally { requesting.value = false }
}
const batchLabel = computed(() => redditStatus.value?.stopping ? '정지 중…' : redditStatus.value?.busy ? '정지' : feedItems.value.length ? '다음 25개 받기' : '25개 받기')
const batchDisabled = computed(() => requesting.value || redditStatus.value?.stopping || (!redditStatus.value?.busy && (!redditStatus.value?.config.enabled || redditStatus.value?.exhausted)))
async function toggleBatch() {
  if (!redditStatus.value?.busy) { await more(true); return }
  pullArea.value?.interrupt(); automatic.value = false; requesting.value = true; error.value = ''
  try { await redditRequest('stop', { method: 'POST' }); lastBusy = true; await loadReddit(); automatic.value = true } catch (e) { error.value = String(e) } finally { requesting.value = false }
}
async function selectSubreddit(subreddit: string) {
  if (requesting.value || redditStatus.value?.busy) return
  resetScrollGate(); requesting.value = true; automatic.value = false; error.value = ''
  try { await redditRequest('select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subreddit }) }); await refresh() } catch (e) { error.value = String(e) } finally { requesting.value = false }
  if (!error.value) { automatic.value = true; if (!feedItems.value.length) await more(true) }
}
function date(value?: number | null) { return value ? new Date(value * 1000).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '기록 없음' }
function open(index: number) { readerItems.value = feedItems.value.map(item => ({ ...item })); selected.value = index; emit('reading', true) }
function close() { detail.value = undefined; selected.value = null; emit('reading', false) }
function showDetail(index = 0) { detail.value = readerItems.value[index] }
function readDetail() { detail.value = undefined }
async function latest() { try { await redditRequest('latest', { method: 'POST' }); await loadReddit(); await more(true) } catch (e) { error.value = String(e) } }
onMounted(async () => {
  try { await refresh(); automatic.value = !/^오류:/.test(redditStatus.value?.message || ''); if (!feedItems.value.length && automatic.value && !/^정지됨/.test(redditStatus.value?.message || '')) void more(true) } catch (e) { error.value = String(e) }
  if (disposed) return
  void refreshRedditSubscribers().catch(() => {})
  timer = setInterval(async () => { try { await loadReddit(); const busy = !!redditStatus.value?.busy; if (lastBusy || busy) await refresh(); lastBusy = busy } catch { automatic.value = false } }, 2000)
})
onUnmounted(() => { disposed = true; resetScrollGate(); clearInterval(timer); emit('reading', false) })
</script>
<template>
  <section class="reddit-pane">
    <header><div><h2>Reddit</h2><p :title="subscriberDescription(redditStatus?.config.subreddit || '')">r/{{ redditStatus?.config.subreddit }} · {{ subscriberLabel(redditStatus?.config.subreddit || '') }} · 게시일 최신순 · {{ feedItems.length }}개</p></div><div class="flex flex-wrap gap-2"><UButton variant="soft" :disabled="requesting || redditStatus?.busy" @click="latest">목록 새로 확인</UButton><UButton :disabled="batchDisabled" :color="redditStatus?.busy ? 'error' : 'primary'" @click="toggleBatch">{{ batchLabel }}</UButton></div></header>
    <AppSelect v-if="redditStatus?.config.subreddits?.length" :model-value="redditStatus.config.subreddit" :options="redditStatus.config.subreddits.map(name => ({ value: name, label: `r/${name} · ${subscriberLabel(name)}` }))" label="서브레딧 선택" :disabled="requesting || redditStatus.busy" class="mb-4" @update:model-value="selectSubreddit" />
    <p v-if="error" role="alert">{{ error }}</p><p role="status">{{ redditStatus?.message }}</p>
    <p v-if="!feedItems.length && !redditStatus?.busy">설정에서 지정한 서브레딧의 미디어를 받아 갤러리로 표시합니다.</p>
    <BottomPull ref="pullArea" :enabled="canAccumulate()" :loading="selected === null && !detail && !!(redditStatus?.busy || requesting)" @load="more()">
    <div class="reddit-grid">
      <article v-for="(item, index) in feedItems" :key="item.id" class="reddit-card">
        <button class="reddit-cover" type="button" @click="open(index)" :aria-label="redditStatus?.config.show_titles === false ? `미디어 ${index + 1} 보기` : `${item.title} 보기`">
          <RedditThumb :id="item.id" :kind="item.kind" :title="redditStatus?.config.show_titles === false ? 'Reddit 미디어' : item.title" />
          <span v-if="item.kind !== 'image'" class="media-kind">{{ item.kind === 'video' ? '▶ 영상' : 'GIF' }}</span>
          <span v-if="item.seen_at || item.is_new" class="media-state" :class="{ 'is-new': !item.seen_at && item.is_new }" :aria-label="item.seen_at ? '봄' : '새 이미지'">{{ item.seen_at ? '✓' : 'NEW' }}</span>
        </button>
        <div v-if="redditStatus?.config.show_titles !== false" class="reddit-card-footer"><span class="reddit-title">{{ item.title }}</span></div>
      </article>
    </div>
    <template #footer><div ref="sentinel" class="reddit-sentinel">
      <span v-if="redditStatus?.exhausted && !redditStatus?.busy">마지막 항목입니다.</span>
      <template v-else>
        <div v-if="feedItems.length && !redditStatus?.busy && !requesting" class="scroll-charge">
          <span class="scroll-charge-label">{{ automatic ? '위로 당겼다 놓으면 다음 25개' : '다음 받기 버튼으로 다시 시작하세요' }}</span>
        </div>
        <UButton variant="soft" :disabled="batchDisabled" @click="toggleBatch">{{ batchLabel }}</UButton>
      </template>
    </div>
    </template></BottomPull>
    <UModal title="Reddit 상세" :open="!!detail" :ui="{ overlay: 'z-[1100]', content: 'sm:max-w-2xl z-[1101]' }" @update:open="value => { if (!value) detail = undefined }">
      <template #body><GalleryDetail v-if="detail" :title="detail.title" :cover="detail.kind !== 'video' ? `/api/reddit/media/${detail.id}` : undefined" :placeholder="detail.kind === 'video' ? '▶ 동영상' : undefined" :info="`r/${detail.subreddit} · ${detail.kind === 'video' ? '동영상' : detail.kind === 'gif' ? 'GIF' : '이미지'}`" :fields="[{ name: '게시 날짜', values: [date(detail.created)] }, { name: '다운로드 날짜', values: [date(detail.downloaded_at)] }]">
        <template #actions><UButton class="reddit-open-button" size="lg" @click="readDetail">계속 보기</UButton><UButton variant="soft" color="neutral" size="lg" @click="detail = undefined">닫기</UButton></template>
      </GalleryDetail></template>
    </UModal>

    <Reader v-if="selected !== null && readerItems.length" :book="book" :detail-open="!!detail" @detail="showDetail" @media-shown="mediaShown" @close="close" />
  </section>
</template>
<style scoped>
.reddit-pane>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.reddit-pane h2,.reddit-pane header p{margin:0}.reddit-pane p{color:var(--muted);overflow-wrap:anywhere}
.reddit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;align-items:stretch}
.reddit-card{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:6px;background:var(--canvas)}
.reddit-cover{position:relative;display:block;width:100%;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;flex-shrink:0}
.reddit-cover:focus-visible{outline:3px solid var(--accent);outline-offset:-3px}
.reddit-card-footer{padding:8px 10px}
.reddit-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;font-size:13px;line-height:1.5}
.media-kind{position:absolute;top:8px;right:8px;background:#000b;color:white;border-radius:6px;padding:4px 8px;font-size:12px;pointer-events:none}
.media-state{position:absolute;top:8px;left:8px;background:#000b;color:white;border-radius:5px;padding:3px 6px;font-size:11px;font-weight:600;pointer-events:none}.media-state.is-new{background:var(--ui-primary);color:var(--ui-bg)}
.reddit-sentinel{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px}
.scroll-charge{display:grid;justify-items:center;gap:10px}.scroll-charge-label{font-size:12px;color:var(--muted);text-align:center}
</style>
