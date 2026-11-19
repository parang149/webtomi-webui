<script lang="ts">
export type ComicSite = 'toon' | 'wolf'
export const comicLabel = (site: ComicSite) => site === 'wolf' ? '늑대툰' : '일일툰'
export type ToonSeries = { id: number; title: string; thumb: string | null; date: string | null; site?: ComicSite }
export type ToonEpisode = { id: number; title: string; date: string | null }
export type ToonSeriesInfo = { site?: ComicSite; id: number; title: string; thumb: string | null; artists: string[]; genres: string[]; description?: string | null; episodes: ToonEpisode[] }
export const toonKey = (site: ComicSite, series: number, episode: number) => `${site}:${series}:${episode}`
export const toonCover = (site: ComicSite, series: number) => `/api/${site}/series/${series}/cover`
</script>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { notify } from './notifications'
import EqualTabs from './EqualTabs.vue'
import ViewToggle from './ViewToggle.vue'
import GalleryCard from './GalleryCard.vue'
import GalleryDetail from './GalleryDetail.vue'
import { readingHistory, readBadge } from './reading-history'

type LocalSeries = { title: string; episodes: { id: number; title: string }[] }
const props = defineProps<{ site: ComicSite; detailItem?: ToonSeries; readerDetail?: boolean; localSeries?: Map<number, LocalSeries> }>()
const emit = defineEmits<{ detail: [ToonSeries]; closeDetail: []; read: [ToonSeriesInfo, ToonEpisode]; libraryChanged: [] }>()

const query = ref('')
const items = ref<ToonSeries[]>()
const busy = ref(false)
const error = ref('')
const layout = ref<'grid' | 'list'>(localStorage.getItem(`${props.site}-layout`) === 'list' ? 'list' : 'grid')
watch(layout, value => localStorage.setItem(`${props.site}-layout`, value))

async function search() {
  const q = query.value.trim()
  if (busy.value || !q) return
  busy.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/${props.site}/search?` + new URLSearchParams({ q }))
    if (!response.ok) throw new Error(response.status === 400 ? '검색어를 확인해 주세요.' : `${comicLabel(props.site)} 서버에서 검색 결과를 가져오지 못했습니다.`)
    items.value = searchItems = await response.json()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '검색에 실패했습니다.'
  } finally { busy.value = false }
}

// 일일툰 lists (최신·인기·완결·매일 추천 100) with one genre filter.
// 늑대툰 has one 만화책 list with 최신순/인기순 order.
type ListMode = 'latest' | 'popular' | 'completed' | 'daily' | 'comics'
const modes = props.site === 'wolf'
  ? [{ label: '검색', value: 'search' }, { label: '만화책', value: 'comics' }]
  : [{ label: '검색', value: 'search' }, { label: '최신', value: 'latest' }, { label: '인기', value: 'popular' }, { label: '완결', value: 'completed' }, { label: '추천100', value: 'daily' }]
const savedMode = localStorage.getItem(`${props.site}-mode`)
const mode = ref<'search' | ListMode>(modes.some(m => m.value === savedMode) ? savedMode as ListMode : 'search')
const order = ref<'latest' | 'popular'>('latest')
const genre = ref('')
const genres = ref<string[]>([])
const page = ref(1)
const lastPage = ref(1)
let searchItems: ToonSeries[] | undefined
let listRequest: AbortController | undefined
async function loadList(next = 1) {
  if (mode.value === 'search') return
  listRequest?.abort()
  const request = new AbortController()
  listRequest = request
  busy.value = true
  error.value = ''
  try {
    const params: Record<string, string> = props.site === 'wolf' ? { genre: genre.value, order: order.value, page: String(next) } : { list: mode.value, genre: genre.value, page: String(next) }
    const response = await fetch(`/api/${props.site}/browse?` + new URLSearchParams(params), { signal: request.signal })
    if (!response.ok) throw new Error(`${comicLabel(props.site)} 서버에서 목록을 가져오지 못했습니다.`)
    const result: { items: ToonSeries[]; page: number; last_page: number; genres: string[] } = await response.json()
    items.value = result.items
    page.value = result.page
    lastPage.value = result.last_page
    if (result.genres.length) genres.value = result.genres
    window.scrollTo({ top: 0 })
  } catch (cause) {
    if (!request.signal.aborted) error.value = cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.'
  } finally { if (listRequest === request) busy.value = false }
}
watch(mode, value => {
  localStorage.setItem(`${props.site}-mode`, value)
  if (value === 'search') { listRequest?.abort(); busy.value = false; items.value = searchItems; error.value = '' }
  else { genre.value = ''; genres.value = []; void loadList() }
})
watch(order, () => { void loadList() })
function pickGenre(value: string) { genre.value = genre.value === value ? '' : value; void loadList() }
if (mode.value !== 'search') void loadList()

/** Latest episode read in this series, for "이어 읽기". */
function lastRead(series: number) {
  let best: { episode: number; updated: number } | undefined
  for (const [key, entry] of Object.entries(readingHistory.value)) {
    const match = key.match(/^(toon|wolf):(\d+):(\d+)$/)
    if (match && match[1] === props.site && Number(match[2]) === series && (!best || entry.updated_at > best.updated)) best = { episode: Number(match[3]), updated: entry.updated_at }
  }
  return best?.episode
}

const info = ref<ToonSeriesInfo>()
const loadingInfo = ref(false)
const infoError = ref('')
const newestFirst = ref(localStorage.getItem('toon-order') !== 'oldest')
watch(newestFirst, value => localStorage.setItem('toon-order', value ? 'newest' : 'oldest'))
let infoRequest: AbortController | undefined
async function loadInfo(series: ToonSeries) {
  infoRequest?.abort()
  const request = new AbortController()
  infoRequest = request
  if (info.value?.id !== series.id) info.value = undefined
  loadingInfo.value = true
  infoError.value = ''
  try {
    const response = await fetch(`/api/${props.site}/series/${series.id}`, { signal: request.signal })
    if (!response.ok) throw new Error()
    const value: ToonSeriesInfo = { ...await response.json(), site: props.site }
    if (!request.signal.aborted) info.value = value
  } catch {
    if (request.signal.aborted) return
    const local = props.localSeries?.get(series.id)
    if (local) info.value = { site: props.site, id: series.id, title: local.title, thumb: null, artists: [], genres: [], episodes: local.episodes.map(({ id, title }) => ({ id, title, date: null })) }
    infoError.value = local ? `${comicLabel(props.site)} 서버에 연결하지 못해 받은 회차만 표시합니다.` : '회차 목록을 불러오지 못했습니다.'
  } finally { if (infoRequest === request) loadingInfo.value = false }
}
const displayed = ref<ToonSeries>()
watch(() => props.detailItem, item => {
  if (!item || (item.site ?? 'toon') !== props.site) return
  displayed.value = item
  if (info.value?.id !== item.id || infoError.value) void loadInfo(item)
}, { immediate: true })

const episodes = computed(() => {
  const list = info.value?.episodes ?? []
  return newestFirst.value ? [...list].reverse() : list
})
const continueEpisode = computed(() => {
  const series = info.value
  if (!series?.episodes.length) return undefined
  const last = lastRead(series.id)
  return series.episodes.find(episode => episode.id === last) ?? series.episodes[0]
})
const continueLabel = computed(() => !info.value || lastRead(info.value.id) === undefined ? '첫 회 읽기' : '이어 읽기')
const downloaded = computed(() => new Set(info.value ? (props.localSeries?.get(info.value.id)?.episodes ?? []).map(e => e.id) : []))
const jobStatus = ref<Record<number, string>>({})
const activeStatuses = ['queued', 'downloading', 'pausing', 'cancelling', 'finalizing']
const downloadError = ref('')
const submitting = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
onUnmounted(() => { disposed = true; clearTimeout(pollTimer) })
async function poll() {
  clearTimeout(pollTimer)
  try {
    const response = await fetch('/api/downloads')
    if (!response.ok) return
    const jobs: { id: number; source?: string; status: string }[] = await response.json()
    const next = Object.fromEntries(jobs.filter(job => job.source === props.site).map(job => [job.id, job.status]))
    const finished = Object.entries(next).some(([id, status]) => status === 'completed' && activeStatuses.includes(jobStatus.value[Number(id)]))
    jobStatus.value = next
    if (finished) emit('libraryChanged')
  } catch { /* The next poll retries. */ }
  finally {
    if (!disposed && Object.values(jobStatus.value).some(status => activeStatuses.includes(status))) pollTimer = setTimeout(poll, 2000)
  }
}
watch(() => props.detailItem, item => { if (item && (item.site ?? 'toon') === props.site) void poll() })
const isDownloading = (id: number) => activeStatuses.includes(jobStatus.value[id])
const pendingEpisodes = computed(() => (info.value?.episodes ?? []).filter(e => !downloaded.value.has(e.id) && !isDownloading(e.id)))
async function download(list: ToonEpisode[]) {
  const series = info.value
  if (!series || !list.length || submitting.value) return
  submitting.value = true
  downloadError.value = ''
  let added = 0
  try {
    for (let start = 0; start < list.length; start += 50) {
      const response = await fetch(`/api/${props.site}/downloads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series: series.id, series_title: series.title, artists: series.artists, genres: series.genres, count: series.episodes.length, episodes: list.slice(start, start + 50).map(({ id, title, date }) => ({ id, title, date, number: props.site === 'wolf' ? id % 1_000_000 : series.episodes.findIndex(e => e.id === id) + 1 })) }),
      })
      if (!response.ok) throw new Error(response.status === 429 ? '다운로드 대기열이 가득 찼습니다. 진행 중인 작업이 끝난 뒤 다시 받으세요.' : '다운로드 작업을 등록하지 못했습니다.')
      const jobs: { id: number; status: string }[] = await response.json()
      for (const job of jobs) jobStatus.value[job.id] = job.status
      added += jobs.length
      if (jobs.length < Math.min(50, list.length - start)) throw new Error(`${added}개만 등록했습니다. 대기열이 가득 차면 나머지는 나중에 받으세요.`)
    }
  } catch (cause) {
    downloadError.value = cause instanceof Error ? cause.message : '다운로드 작업을 등록하지 못했습니다.'
  } finally {
    submitting.value = false
    if (added) notify('download', `회차 ${added}개를 다운로드에 추가했습니다.`)
    void poll()
  }
}
function badge(episode: ToonEpisode) {
  const entry = readingHistory.value[toonKey(props.site, info.value!.id, episode.id)]
  return entry ? readBadge(toonKey(props.site, info.value!.id, episode.id), entry.total) : null
}
</script>

<template>
  <section :aria-labelledby="`${site}-heading`">
    <h2 :id="`${site}-heading`" class="sr-only">{{ comicLabel(site) }} 검색</h2>
    <EqualTabs class="mode-tabs" :label="`${comicLabel(site)} 목록`" :model-value="mode" :items="modes" @update:model-value="value => { if (modes.some(m => m.value === value)) mode = value as typeof mode }" />
    <div v-if="mode !== 'search' && genres.length" class="genres" role="group" aria-label="장르">
      <UButton size="sm" :variant="genre ? 'outline' : 'solid'" :color="genre ? 'neutral' : 'primary'" :aria-pressed="!genre" :disabled="busy" @click="genre = ''; loadList()">전체</UButton>
      <UButton v-for="name in genres" :key="name" size="sm" :variant="genre === name ? 'solid' : 'outline'" :color="genre === name ? 'primary' : 'neutral'" :aria-pressed="genre === name" :disabled="busy" @click="pickGenre(name)">{{ name }}</UButton>
    </div>
    <form v-if="mode === 'search'" class="toon-form" @submit.prevent="search()">
      <label class="keyword">작품 제목
        <UInput v-model="query" type="search" maxlength="100" placeholder="작품 제목" />
      </label>
      <UButton type="submit" class="primary-button" icon="i-lucide-search" :loading="busy" :disabled="busy || !query.trim()">검색</UButton>
    </form>

    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="items">
      <div v-if="mode === 'comics'" class="order-row" role="group" aria-label="정렬">
        <UButton v-for="option in [{ label: '최신순', value: 'latest' }, { label: '인기순', value: 'popular' }] as const" :key="option.value" size="xs" :variant="order === option.value ? 'solid' : 'outline'" color="neutral" :aria-pressed="order === option.value" :disabled="busy" @click="order = option.value">{{ option.label }}</UButton>
      </div>
      <div class="toolbar">
        <p aria-live="polite">{{ !items.length ? '표시할 작품이 없습니다.' : mode === 'search' ? '검색 결과 ' + items.length + '건' : `${page} / ${lastPage}쪽` }}</p>
        <ViewToggle v-model="layout" :label="`${comicLabel(site)} 결과 보기 방식`" />
      </div>
      <div class="results" :class="{ 'results-list': layout === 'list' }" :aria-busy="busy">
        <GalleryCard v-for="item in items" :key="item.id" :layout="layout" :title="item.title" :cover="toonCover(site, item.id)" :id="item.id" info="" :date="item.date ? (site === 'wolf' || mode !== 'search' ? item.date : `업데이트 ${item.date.slice(0, 10)}`) : ''" @detail="emit('detail', { ...item, site })">
          <UButton class="read-button" @click="emit('detail', { ...item, site })">{{ lastRead(item.id) === undefined ? '회차 보기' : '이어 읽기' }}</UButton>
        </GalleryCard>
      </div>
      <nav v-if="mode !== 'search' && lastPage > 1" class="pager" aria-label="목록 페이지">
        <UButton variant="outline" color="neutral" icon="i-lucide-chevron-left" :disabled="busy || page <= 1" @click="loadList(page - 1)">이전</UButton>
        <UButton variant="outline" color="neutral" trailing-icon="i-lucide-chevron-right" :disabled="busy || page >= lastPage" @click="loadList(page + 1)">다음</UButton>
      </nav>
    </template>

    <UModal :title="`${comicLabel(site)} 작품 상세`" :open="!!detailItem && (detailItem.site ?? 'toon') === site" :ui="{ content: 'sm:max-w-3xl' }" @update:open="open => { if (!open) emit('closeDetail') }">
      <template #body><div class="gallery-detail">
        <GalleryDetail v-if="displayed" :title="info?.title || displayed.title" :cover="toonCover(site, displayed.id)" :info="info ? `${info.episodes.length}화` : loadingInfo ? '회차 불러오는 중…' : ''" :id="displayed.id" :fields="[{ name: '작가', values: info?.artists }, { name: '장르', values: info?.genres }]" :date="displayed.date ? (site === 'wolf' ? displayed.date : `업데이트 ${displayed.date.slice(0, 10)}`) : ''">
          <template #actions>
            <UButton v-if="!readerDetail" class="read-button" :disabled="!continueEpisode" @click="info && continueEpisode && emit('read', info, continueEpisode)">{{ continueLabel }}</UButton>
            <UButton variant="outline" color="neutral" icon="i-lucide-download" :disabled="!pendingEpisodes.length || submitting" @click="download(pendingEpisodes)">{{ submitting ? '등록 중…' : pendingEpisodes.length ? `안 받은 ${pendingEpisodes.length}화 받기` : '모두 받음' }}</UButton>
          </template>
          <p v-if="infoError" role="alert">{{ infoError }} <UButton variant="link" @click="loadInfo(displayed)">다시 시도</UButton></p>
          <p v-if="info?.description" class="toon-description">{{ info.description }}</p>
          <p v-if="downloadError" role="alert">{{ downloadError }}</p>
          <div v-if="info" class="episode-tools"><UButton variant="ghost" color="neutral" size="sm" :icon="newestFirst ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'" @click="newestFirst = !newestFirst">{{ newestFirst ? '최신화부터' : '1화부터' }}</UButton></div>
          <ol v-if="info" class="episodes" aria-label="회차 목록">
            <li v-for="episode in episodes" :key="episode.id">
              <UIcon v-if="downloaded.has(episode.id)" name="i-lucide-circle-check" class="episode-state text-success" aria-label="받음" />
              <UIcon v-else-if="isDownloading(episode.id)" name="i-lucide-loader-circle" class="episode-state animate-spin" aria-label="받는 중" />
              <UButton v-else variant="ghost" color="neutral" square icon="i-lucide-download" :disabled="submitting" :aria-label="`${episode.title} 받기`" @click="download([episode])" />
              <UButton variant="ghost" color="neutral" class="episode" @click="emit('read', info, episode)">
                <span class="episode-title">{{ episode.title }}</span>
                <UBadge v-if="badge(episode)" :color="badge(episode)!.color" variant="subtle" size="sm">{{ badge(episode)!.label }}</UBadge>
                <span v-if="episode.date" class="episode-date">{{ episode.date }}</span>
              </UButton>
            </li>
          </ol>
        </GalleryDetail>
      </div></template>
    </UModal>
  </section>
</template>

<style scoped>
.toon-form{display:flex;align-items:end;flex-wrap:wrap;gap:12px;margin-bottom:16px}.toon-form .primary-button{justify-content:center}
.keyword{flex:1;min-width:200px}
.results{--result-actions-columns:1}
.episodes{list-style:none;margin:12px 0 0;padding:0;scrollbar-gutter:stable;max-height:min(50vh,480px);overflow-y:auto;border-top:1px solid var(--ui-border)}
.episodes li{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--ui-border)}
.episode-state{flex:none;width:44px;height:20px}
.mode-tabs{margin-bottom:12px}
.order-row{display:flex;justify-content:flex-end;gap:4px;margin-bottom:6px}
.genres{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.toon-description{margin:12px 0 0;font-size:14px;line-height:1.6;color:var(--ui-text-muted);white-space:pre-line}
.episode-tools{display:flex;justify-content:flex-end;margin-top:8px}
.episode{flex:1;min-width:0;min-height:44px;justify-content:flex-start;gap:8px}
.episode-title{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.episode-date{color:var(--ui-text-muted);font-size:12px}
@media(max-width:480px){.keyword,.toon-form .primary-button{flex-basis:100%}}
</style>
