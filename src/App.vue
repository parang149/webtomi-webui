<script setup lang="ts">
import AppSelect from './AppSelect.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import CopyValue from './CopyValue.vue'
import Reader from './Reader.vue'
import { refreshReading, record, readState, readBadge, markReading, historyError, type EhentaiDetails } from './reading-history'
import RemoteSearch, { type Gallery } from './RemoteSearch.vue'
import EhentaiSearch, { type EhentaiGallery } from './EhentaiSearch.vue'
import ToonSearch, { type ToonSeries, type ToonSeriesInfo, type ToonEpisode, type ComicSite } from './ToonSearch.vue'
import ReadingHistory from './ReadingHistory.vue'
import DownloadsPane from './DownloadsPane.vue'
import AppToasts from './AppToasts.vue'
import { trackLibraryTask } from './organize-job'
import LibraryJobsPane from './LibraryJobsPane.vue'
const workTab = ref<'downloads' | 'library'>('downloads')
import ViewToggle from './ViewToggle.vue'
import GalleryCard from './GalleryCard.vue'
import EqualTabs from './EqualTabs.vue'
import { loadInfoCacheMode } from './info-cache'
import { scrollToControls, useIncremental } from './incremental'
import GalleryDetail from './GalleryDetail.vue'
import SourceTabs from './SourceTabs.vue'
import RedditPane from './RedditPane.vue'
import { loadReddit, redditStatus } from './reddit-client'
const emit = defineEmits<{ reading: [boolean] }>()
const props = defineProps<{ libraryRevision: number; workRevision: number }>()
const menu = [
  { id: 'search', label: '검색', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 4 4' },
  { id: 'ehentai', label: 'E-Hentai', icon: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4' },
  { id: 'toon', label: '만화', icon: '' },
  { id: 'downloads', label: '작업', icon: 'M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4' },
  { id: 'reddit', label: 'Reddit', icon: 'M4 4h16v16H4zM8 14l3-3 3 3 2-2 4 4' },
  { id: 'library', label: '라이브러리', icon: 'M4 4h4v16H4zm5 0h4v16H9zm6 1 4-1 4 15-4 1z' },
  { id: 'history', label: '읽기 기록', icon: 'M3 12a9 9 0 1 0 2-6M3 3v5h5m4-1v5l3 2' },
] as const

type ToonBook = { site?: ComicSite; series: number; seriesTitle: string; episodes: { id: number; title: string }[]; local?: boolean }
type Book = { id: string; title: string; pages: number; remote?: boolean; ehentaiToken?: string; toon?: ToonBook; ehentaiDetails?: EhentaiDetails; readable?: boolean; formats?: string[]; download_sort_at?: number; metadata?: { id?: number; ehentai_id?: number; source?: string; toon_series?: number; toon_episode?: number; series_title?: string; title?: string; type?: string; language?: string; artists?: string[]; groups?: string[]; parodys?: string[]; characters?: string[]; tags?: {tag:string;female?:number;male?:number}[]; uploader?: string; uploaded?: string; downloaded_at?: number; comicinfo_updated_at?: number; ehentai_token?: string } }
const books = ref<Book[]>([])
const downloadedIds = computed(() => new Set(books.value.flatMap(book => Number(book.metadata?.id) > 0 ? [Number(book.metadata?.id)] : [])))
const downloadedEhentaiIds = computed(() => new Set(books.value.flatMap(book => book.metadata?.ehentai_id ? [book.metadata.ehentai_id] : [])))
type Screen = {
  key: string
  tab: typeof menu[number]['id']
  local?: Book
  remote?: Gallery
  ehentai?: EhentaiGallery
  toon?: ToonSeries
  reader?: Book
  readerDetail?: boolean
}
const newKey = () => Math.random().toString(36).slice(2)
const screen = shallowRef<Screen>({ key: newKey(), tab: 'search' })
const tab = computed(() => screen.value.tab)
const redditReading = ref(false)
watch(() => redditStatus.value?.config.enabled, enabled => { if (enabled === false && tab.value === 'reddit') changeTab('library') })
const active = computed(() => screen.value.reader)
const defaultTitle = document.title
const selected = computed(() => active.value && !screen.value.readerDetail ? null : screen.value.local ?? null)
const remoteDetail = computed(() => active.value && !screen.value.readerDetail ? null : screen.value.remote ?? null)
const ehentaiDetail = computed(() => active.value && !screen.value.readerDetail ? undefined : screen.value.ehentai)
const toonDetail = computed(() => active.value && !screen.value.readerDetail ? undefined : screen.value.toon)
const detailBook = shallowRef<Book>()
const positions = new Map<string, number>()
let backing = false
let previousRestoration: ScrollRestoration
watch(active, (book, previous) => {
  document.title = book?.title || defaultTitle
  emit('reading', !!book)
  if (!book && previous) void refreshReading()
}, { immediate: true })
watch(selected, book => {
  if (book) detailBook.value = book
}, { immediate: true, flush: 'sync' })

function restoreScroll(position: number) {
  void nextTick(() => window.scrollTo(0, position))
}
function navigate(next: Omit<Screen, 'key'>, position = window.scrollY) {
  if (backing) return
  if (!history.state?.hitomiScreen) history.replaceState({ ...history.state, hitomiScreen: screen.value }, '')
  positions.set(screen.value.key, window.scrollY)
  const entry = { ...next, key: newKey() }
  history.pushState({ hitomiScreen: JSON.parse(JSON.stringify(entry)) }, '')
  screen.value = entry
  restoreScroll(position)
}
function changeTab(next: Screen['tab']) {
  if (next !== tab.value) navigate({ tab: next }, 0)
}
function showDetail(book: Book) { navigate({ tab: tab.value, local: book }) }
function showRemoteDetail(item: Gallery) { navigate({ tab: tab.value, remote: item }) }
function showEhentaiDetail(item: EhentaiGallery) { navigate({ tab: tab.value, ehentai: item }) }
function showToonDetail(item: ToonSeries) { navigate({ tab: tab.value, toon: item }) }
function goBack() {
  if (backing) return
  backing = true
  history.back()
}
const backPrompt = ref(0)
function restoreScreen() {
  const intended = backing
  backing = false
  if (location.hash === '#settings') return
  const entry = history.state?.hitomiScreen as Screen | undefined
  if (!entry || entry.key === screen.value.key) return
  // A browser back gesture while reading asks first instead of dropping the viewer.
  if (!intended && screen.value.reader && !entry.reader) {
    history.pushState({ hitomiScreen: JSON.parse(JSON.stringify(screen.value)) }, '')
    backPrompt.value++
    return
  }
  positions.set(screen.value.key, window.scrollY)
  screen.value = entry
  restoreScroll(positions.get(entry.key) ?? 0)
}
const lastReaderKey = 'app:last-reader'
function savedReader(): { tab: Screen['tab']; reader: Book } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(lastReaderKey) || 'null')
    return saved?.reader?.id && menu.some(item => item.id === saved.tab) ? saved : null
  } catch { return null }
}
function readerHash(book: Book) {
  const kind = book.toon ? book.toon.site ?? 'toon' : book.ehentaiToken ? 'ehentai' : book.remote ? 'hitomi' : 'library'
  return `#read/${kind}/${encodeURIComponent(book.id)}`
}
function rememberReader(current: Screen) {
  if (location.hash === '#settings') return
  const book = current.reader
  try {
    if (book) localStorage.setItem(lastReaderKey, JSON.stringify({ tab: current.tab, reader: book }))
    else localStorage.removeItem(lastReaderKey)
  } catch { /* Optional: restore still works from the address while the tab lives. */ }
  const hash = book ? readerHash(book) : ''
  if (location.hash !== hash) history.replaceState(history.state, '', location.pathname + location.search + hash)
}
function searchText(book:Book) {
  const m=book.metadata
  return [book.id,book.title,m?.id,m?.type,m?.language,...(m?.artists||[]),...(m?.groups||[]),...(m?.parodys||[]),...(m?.characters||[]),...(m?.tags||[]).flatMap(t=>[t.tag,t.female ? `female:${t.tag}` : '',t.male ? `male:${t.tag}` : ''])].join('\n').toLowerCase()
}
const error = ref('')
const busy = ref(false)
const filter = ref('')
function storedOption<T extends string>(key: string, options: readonly T[], fallback: T) {
  const saved = options.find(option => option === localStorage.getItem(key))
  const value = ref<T>(saved ?? fallback)
  watch(value, next => localStorage.setItem(key, next), { flush: 'sync' })
  return value
}
const redditStoredCount = ref(0)
const librarySource = storedOption('library-source', ['all', 'hitomi', 'ehentai', 'toon', 'reddit'], 'all')
const isComic = (book: Book) => book.metadata?.source === 'toon' || book.metadata?.source === 'wolf'
const bookSource = (book: Book) => isComic(book) ? 'toon' : book.metadata?.source === 'ehentai' || book.metadata?.ehentai_id ? 'ehentai' : 'hitomi'
// Downloaded 일일툰 episodes, grouped by series (oldest episode first).
type LocalSeries = { title: string; episodes: { id: number; title: string; book: Book }[] }
const toonLocalSeries = computed(() => {
  const sites: Record<ComicSite, Map<number, LocalSeries>> = { toon: new Map(), wolf: new Map() }
  for (const book of books.value) {
    const m = book.metadata
    if (!isComic(book) || !m?.toon_series || !m.toon_episode || book.readable === false) continue
    const series = sites[m.source as ComicSite]
    const entry = series.get(m.toon_series) ?? { title: m.series_title || book.title, episodes: [] }
    entry.episodes.push({ id: m.toon_episode, title: book.title, book })
    series.set(m.toon_series, entry)
  }
  for (const series of Object.values(sites)) for (const entry of series.values()) entry.episodes.sort((a, b) => a.id - b.id)
  return sites
})
// The library shows one card per series instead of one per episode.
const libraryBooks = computed(() => {
  const others = books.value.filter(book => !isComic(book))
  const series = (['toon', 'wolf'] as const).flatMap(site => [...toonLocalSeries.value[site]].map(([id, entry]): Book => ({
    id: `${site}-series:${id}`, title: entry.title, pages: entry.episodes.length, readable: true,
    download_sort_at: Math.max(...entry.episodes.map(e => e.book.download_sort_at ?? 0)),
    metadata: { source: site, toon_series: id, title: entry.title },
  })))
  return [...others, ...series]
})
const readingFilter = storedOption('library-reading-filter', ['all', 'unread', 'reading', 'read'], 'all')
const sort = storedOption('library-sort', ['title', 'recent', 'artist', 'download'], 'title')
const sortDirection = storedOption('library-sort-direction', ['asc', 'desc'], 'asc')
const libraryLayout = storedOption('library-layout', ['grid', 'list'], 'grid')
const { shown: shownBooks, more: moreBooks, sentinel: bookSentinel } = useIncremental(() => visible.value, () => [filter.value, librarySource.value, readingFilter.value, sort.value, sortDirection.value, libraryLayout.value])
watch(libraryLayout, () => scrollToControls('.library-filters'))
// Language and pages; the detail also lists file formats.
function libraryInfo(book: Book, withFormats: boolean) {
  const formats = !withFormats ? [] : (book.formats ?? []).filter(format => format !== 'source').map(format => format.toUpperCase())
  return [book.metadata?.language ?? '', `${book.pages || '?'}페이지`, ...formats].filter(Boolean).join(' · ')
}
// Library rows store seconds (download records) or milliseconds (file times).
function downloadDate(book: Book) {
  const value = book.download_sort_at ?? 0
  return value > 0 ? new Date(value < 1e11 ? value * 1000 : value).toLocaleDateString() : ''
}
/** Upload, download and XML refresh times shown under the library detail. */
function detailDates(book: Book) {
  const m = book.metadata
  return [m?.uploaded ? `업로드 ${m.uploaded.slice(0, 16)}` : '', downloadDate(book) ? `받은 날짜 ${downloadDate(book)}` : '',
    m?.comicinfo_updated_at ? `XML 갱신 ${new Date(m.comicinfo_updated_at * 1000).toLocaleString()}` : ''].filter(Boolean).join(' · ')
}
const xmlToast = useToast()
const xmlRefreshing = ref(false)
async function refreshXml(book: Book) {
  xmlRefreshing.value = true
  try {
    const response = await fetch(`/api/library/${encodeURIComponent(book.id)}/comicinfo`, { method: 'POST' })
    if (!response.ok) throw new Error(await response.text() || 'XML을 다시 쓰지 못했습니다.')
    const metadata = await response.json()
    detailBook.value = { ...book, metadata: { ...book.metadata, ...metadata } }
    xmlToast.add({ title: 'XML을 갱신했습니다.', color: 'success', icon: 'i-lucide-circle-check' })
    void refresh()
  } catch (error) {
    xmlToast.add({ title: error instanceof Error ? error.message : 'XML을 다시 쓰지 못했습니다.', color: 'error', icon: 'i-lucide-circle-alert' })
  } finally { xmlRefreshing.value = false }
}
watch(sort, value => { sortDirection.value = value === 'recent' || value === 'download' ? 'desc' : 'asc' })
const visible = computed(() => {
  const items = libraryBooks.value.filter(book =>
    (librarySource.value === 'all' || librarySource.value === bookSource(book))
    && searchText(book).includes(filter.value.toLowerCase())
    && (readingFilter.value === 'all' || readState(book.id, book.pages) === readingFilter.value))
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return items.sort((a, b) => {
    const titleOrder = a.title.localeCompare(b.title)
    let order = titleOrder
    switch (sort.value) {
      case 'download':
        order = (a.download_sort_at ?? 0) - (b.download_sort_at ?? 0)
        break
      case 'recent':
        order = (record(a.id)?.updated_at ?? 0) - (record(b.id)?.updated_at ?? 0)
        break
      case 'artist':
        order = (a.metadata?.artists?.[0] ?? '').localeCompare(b.metadata?.artists?.[0] ?? '')
        break
    }
    return direction * order || titleOrder || a.id.localeCompare(b.id)
  })
})
async function mark(book: Book, complete: boolean) { try { await markReading(book.id,complete) } catch(e) { error.value = String(e) } }

const imageUrl = (book: Book, index: number) => `/api/library/${encodeURIComponent(book.id)}/pages/${index}`
// Downloaded works open and show covers from the library instead of the upstream site.
const localBookByKey = computed(() => {
  const local = new Map<string, Book>()
  for (const book of books.value) {
    if (book.readable === false) continue
    const metadata = book.metadata
    if (isComic(book) && metadata?.toon_episode) local.set(`${metadata.source}:${metadata.toon_episode}`, book)
    else if (metadata?.ehentai_id) local.set(`ehentai:${metadata.ehentai_id}`, book)
    else if (metadata?.id) local.set(`hitomi:${metadata.id}`, book)
  }
  return local
})
function openLocal(key: string) {
  const book = localBookByKey.value.get(key)
  if (book) open(book)
  return !!book
}
const localDownloadCovers = computed(() => {
  const covers = new Map<string, string>()
  for (const book of books.value) {
    if (book.readable === false) continue
    const metadata = book.metadata
    if (isComic(book) && metadata?.toon_episode) covers.set(`${metadata.source}:${metadata.toon_episode}`, imageUrl(book, 0))
    else if (metadata?.ehentai_id) covers.set(`ehentai:${metadata.ehentai_id}`, imageUrl(book, 0))
    else if (metadata?.id) covers.set(`hitomi:${metadata.id}`, imageUrl(book, 0))
  }
  return covers
})
let libraryRequest = 0
async function refresh(scan?: boolean) {
  const request = ++libraryRequest
  busy.value = true; error.value = ''
  try {
    async function load(): Promise<Book[]> {
      const response = scan === undefined ? await fetch('/api/library') : await fetch(`/api/library/scan?incremental=${scan}`, { method: 'POST' })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    }
    const next = scan === undefined ? await load() : await trackLibraryTask(
      scan ? '새 파일·변경 스캔' : '전체 스캔', load, books => books.length,
    )
    if (request === libraryRequest) { books.value = next; await refreshReading() }
  } catch(e) { if (request === libraryRequest) error.value = `라이브러리를 불러오지 못했습니다: ${String(e)}` }
  finally { if (request === libraryRequest) busy.value = false }
}
function open(book: Book) {
  if (book.readable === false) { error.value='이 작품은 브라우저에서 열 수 없습니다.'; return }
  navigate({ tab: tab.value, local: screen.value.local, remote: screen.value.remote, reader: book })
}
function openEhentai(item: EhentaiGallery, pages: number, token: string) {
  const { thumb, category, posted, rating, tags } = item
  navigate({ tab: tab.value, ehentai: item, reader: {
    id: String(item.id), title: item.title, pages, ehentaiToken: token,
    ehentaiDetails: { thumb, category, posted, rating, tags },
  } })
}
const toonError = ref('')
const comicSite = storedOption('comic-site', ['toon', 'wolf'], 'toon')
let openingToon = false
async function openToon(info: ToonSeriesInfo | ToonBook, episode: ToonEpisode | { id: number; title: string }) {
  if (openingToon) return
  openingToon = true
  toonError.value = ''
  try {
    const base: ToonBook = 'series' in info ? info : { site: info.site ?? 'toon', series: info.id, seriesTitle: info.title, episodes: info.episodes.map(({ id, title }) => ({ id, title })) }
    const site = base.site ?? 'toon'
    const local = localBookByKey.value.get(`${site}:${episode.id}`)
    let book: Book
    if (local) book = { ...local, toon: { ...base, local: true } }
    else {
      const response = await fetch(`/api/${site}/episodes/${episode.id}`)
      if (!response.ok) throw new Error()
      const { pages } = await response.json()
      if (!Number.isSafeInteger(pages) || pages < 1) throw new Error()
      book = { id: String(episode.id), title: episode.title, pages, toon: { ...base, local: false } }
    }
    const toon = book.toon!
    const current = screen.value
    const series: ToonSeries = current.toon ?? { id: toon.series, title: toon.seriesTitle, thumb: null, date: null, site }
    // Moving to another episode replaces the reader entry so back still returns to the list.
    if (current.reader?.toon) { const entry = { ...current, reader: book, readerDetail: false }; screen.value = entry; history.replaceState({ hitomiScreen: JSON.parse(JSON.stringify(entry)) }, '') }
    else navigate({ tab: tab.value, toon: series, reader: book })
  } catch { toonError.value = '회차의 이미지 목록을 불러오지 못했습니다.' }
  finally { openingToon = false }
}
async function openToonHistory(site: ComicSite, series: number, episode: number, title: string) {
  toonError.value = ''
  try {
    const response = await fetch(`/api/${site}/series/${series}`)
    if (!response.ok) throw new Error()
    const info: ToonSeriesInfo = { ...await response.json(), site }
    await openToon(info, info.episodes.find(item => item.id === episode) ?? { id: episode, title })
  } catch { toonError.value = '회차 목록을 불러오지 못했습니다.' }
}
function toonStep(delta: number) {
  const book = active.value
  const list = book?.toon?.episodes ?? []
  const current = book?.toon?.local ? book.metadata?.toon_episode : Number(book?.id)
  const index = list.findIndex(item => item.id === current)
  const next = index < 0 ? undefined : list[index + delta]
  if (book?.toon && next) void openToon(book.toon, next)
}
const readerDetailError = ref('')
let loadingReaderDetail = false
watch(active, () => { readerDetailError.value = '' })
async function showReaderDetail() {
  const current = screen.value
  const book = current.reader
  if (!book || loadingReaderDetail) return
  readerDetailError.value = ''
  if (book.ehentaiToken || book.toon) {
    navigate({ ...current, readerDetail: true })
    return
  }
  if (!book.remote) {
    navigate({ ...current, local: book, readerDetail: true })
    return
  }
  loadingReaderDetail = true
  try {
    let gallery = current.remote
    if (!gallery || String(gallery.id) !== book.id) {
      const response = await fetch('/api/galleries/' + encodeURIComponent(book.id))
      if (!response.ok) throw new Error()
      gallery = await response.json() as Gallery
    }
    if (screen.value === current) navigate({ ...current, remote: gallery, readerDetail: true })
  } catch {
    if (screen.value === current) readerDetailError.value = '작품 상세를 불러오지 못했습니다.'
  } finally { loadingReaderDetail = false }
}
watch(() => props.libraryRevision, () => refresh())
watch(() => props.workRevision, () => {
  workTab.value = 'library'
  if (tab.value !== 'downloads') navigate({ tab: 'downloads' }, 0)
})
let libraryEvents: EventSource | undefined
onMounted(() => {
  libraryEvents = new EventSource('/api/library/events')
  libraryEvents.addEventListener('library-changed', () => void refresh())
  previousRestoration = history.scrollRestoration
  history.scrollRestoration = 'manual'
  if (history.state?.hitomiScreen) screen.value = history.state.hitomiScreen
  else if (location.hash !== '#settings') {
    // A fresh start (browser closed, tab evicted, home-screen icon) reopens the last viewer.
    const last = savedReader()
    const base: Screen = { key: newKey(), tab: last?.tab ?? 'search' }
    history.replaceState({ ...history.state, hitomiScreen: base }, '', location.pathname + location.search)
    screen.value = base
    if (last) {
      const entry: Screen = { key: newKey(), tab: last.tab, reader: last.reader }
      history.pushState({ hitomiScreen: JSON.parse(JSON.stringify(entry)) }, '')
      screen.value = entry
    }
  }
  watch(screen, rememberReader, { immediate: true })
  window.addEventListener('popstate', restoreScreen)
  void refresh()
  void loadInfoCacheMode()
  void loadReddit().catch(() => {})
})
onUnmounted(() => {
  libraryEvents?.close()
  document.title = defaultTitle
  history.scrollRestoration = previousRestoration
  window.removeEventListener('popstate', restoreScreen)
})
</script>

<template>
  <main class="app-workspace">
    <div v-show="!active">
      <nav v-show="!redditReading" class="main-nav" aria-label="주 메뉴">
        <ul class="main-nav-list" :style="{ gridTemplateColumns: `repeat(${redditStatus?.config.enabled ? 5 : 4}, minmax(0, 1fr))` }">
        <li v-for="item in menu.filter(item => item.id !== 'ehentai' && item.id !== 'toon' && (item.id !== 'reddit' || redditStatus?.config.enabled))" :key="item.id">
          <UButton type="button" size="sm" class="sm:h-12 sm:text-base sm:font-semibold" :variant="(tab === item.id || item.id === 'search' && (tab === 'ehentai' || tab === 'toon')) ? 'soft' : 'ghost'" :color="(tab === item.id || item.id === 'search' && (tab === 'ehentai' || tab === 'toon')) ? 'primary' : 'neutral'" :aria-current="(tab === item.id || item.id === 'search' && (tab === 'ehentai' || tab === 'toon')) ? 'page' : undefined" @click="changeTab(item.id)">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon"/></svg>
          {{ item.label }}
        </UButton>
        </li>
        </ul>
      </nav>
      <EqualTabs v-if="tab === 'search' || tab === 'ehentai' || tab === 'toon'" class="search-tabs" label="검색 출처" :model-value="tab" :items="[{ label: 'Hitomi', value: 'search', avatar: { src: '/hitomi-favicon.png', size: '3xs' } }, { label: 'E-Hentai', value: 'ehentai', avatar: { src: '/ehentai-favicon.png', size: '3xs' } }, { label: '만화', value: 'toon', icon: 'i-lucide-book-open' }]" @update:model-value="value => { if (value === 'search' || value === 'ehentai' || value === 'toon') changeTab(value) }" />
      <RedditPane v-if="tab === 'reddit' && redditStatus?.config.enabled" @reading="value => { redditReading = value; emit('reading', value) }" />
      <Transition name="tab-fade">
        <RemoteSearch v-show="tab === 'search'" :downloaded-ids="downloadedIds" :detail-item="remoteDetail" :reader-detail="screen.readerDetail" @detail="showRemoteDetail" @close-detail="goBack" @library-changed="refresh()" :local-covers="localDownloadCovers" @read="item => openLocal(`hitomi:${item.id}`) || open({ id: String(item.id), title: item.title, pages: item.pages, remote: true })" />
      </Transition>
      <Transition name="tab-fade">
        <ReadingHistory @reading="value => { redditReading = value; emit('reading', value) }" class="reading-history-view" v-if="tab === 'history'" :books="books" @read="open" @local-detail="showDetail" @remote-detail="showRemoteDetail" @ehentai-read="openEhentai" @ehentai-detail="showEhentaiDetail" @toon-read="openToonHistory" @toon-detail="showToonDetail" />
      </Transition>
      <Transition name="tab-fade">
        <EhentaiSearch v-show="tab === 'ehentai'" :detail-item="ehentaiDetail" :reader-detail="screen.readerDetail" :downloaded-ids="downloadedEhentaiIds" @detail="showEhentaiDetail" @close-detail="goBack" :local-covers="localDownloadCovers" :open-local="(id: number) => openLocal(`ehentai:${id}`)" @read="openEhentai" @library-changed="refresh()" />
      </Transition>
      <Transition name="tab-fade">
        <div v-show="tab === 'toon'">
          <EqualTabs class="comic-tabs" label="만화 사이트" :model-value="comicSite" :items="[{ label: '일일툰', value: 'toon' }, { label: '늑대툰', value: 'wolf' }]" @update:model-value="value => { if (value === 'toon' || value === 'wolf') comicSite = value }" />
          <ToonSearch v-for="site in (['toon', 'wolf'] as const)" v-show="comicSite === site" :key="site" :site="site" :detail-item="toonDetail" :reader-detail="screen.readerDetail" :local-series="toonLocalSeries[site]" @detail="showToonDetail" @close-detail="goBack" @read="openToon" @library-changed="refresh()" />
          <p v-if="toonError" role="alert">{{ toonError }}</p>
        </div>
      </Transition>
      <Transition name="tab-fade">
      <section v-if="tab === 'downloads'">
        <EqualTabs class="work-type-tabs" label="작업 종류" :model-value="workTab" :items="[{ label: '다운로드', value: 'downloads' }, { label: '작업', value: 'library' }]" @update:model-value="value => { if (value === 'downloads' || value === 'library') workTab = value }" />
        <Transition name="tab-fade">
          <DownloadsPane v-if="workTab === 'downloads'" :local-covers="localDownloadCovers" @library-changed="refresh()" @read="job => job.source === 'toon' || job.source === 'wolf' ? openToonHistory(job.source, job.toon_series!, job.id, job.title) : openLocal(`${job.source || 'hitomi'}:${job.id}`)" />
          <div v-else><LibraryJobsPane /></div>
        </Transition>
      </section>
      </Transition>
      <Transition name="tab-fade">
      <section v-show="tab === 'library'">
      <div class="toolbar library-toolbar"><h2>라이브러리<span v-if="busy" role="status" class="library-busy">확인 중…</span></h2><div class="work-tabs"><UButton variant="soft" color="neutral" icon="i-lucide-refresh-cw" @click="refresh(false)" :disabled="busy">전체 스캔</UButton><UButton variant="soft" color="neutral" icon="i-lucide-folder-sync" @click="refresh(true)" :disabled="busy">새 파일·변경 스캔</UButton></div></div>
      <SourceTabs v-model="librarySource" label="라이브러리 출처" reddit />
      <template v-if="librarySource !== 'reddit'">
      <label>라이브러리 검색<UInput v-model="filter" type="search" placeholder="제목·ID·작가·태그로 찾기" />
</label>
      <div class="library-filters"><label>읽기 상태<AppSelect v-model="readingFilter" label="읽기 상태" :options="[{'value': 'all', 'label': '전체'}, {'value': 'unread', 'label': '안 읽음'}, {'value': 'reading', 'label': '읽는 중'}, {'value': 'read', 'label': '읽음'}]" /></label><label>정렬<AppSelect v-model="sort" label="정렬" :options="[{'value': 'title', 'label': '제목순'}, {'value': 'recent', 'label': '읽은 날짜'}, {'value': 'artist', 'label': '작가순'}, {'value': 'download', 'label': '받은 날짜'}]" /></label><label>방향<AppSelect v-model="sortDirection" label="방향" :options="[{'value': 'asc', 'label': '오름차순'}, {'value': 'desc', 'label': '내림차순'}]" /></label><ViewToggle class="library-view-toggle" v-model="libraryLayout" label="라이브러리 보기 방식" /></div>
      <p v-if="error || historyError" role="alert">{{ error || historyError }}</p>
      <section class="results library-results" :class="{ 'results-list': libraryLayout === 'list' }">
        <template v-for="book in shownBooks" :key="book.id">
        <GalleryCard v-if="/^(toon|wolf)-series:/.test(book.id)" :layout="libraryLayout" :title="book.title" :cover="toonLocalSeries[book.metadata!.source as ComicSite].get(book.metadata!.toon_series!)?.episodes[0] ? imageUrl(toonLocalSeries[book.metadata!.source as ComicSite].get(book.metadata!.toon_series!)!.episodes[0].book, 0) : ''" :id="book.metadata?.toon_series" :info="`${book.metadata?.source === 'wolf' ? '늑대툰' : '일일툰'} · 받은 회차 ${book.pages}개`" :date="downloadDate(book) ? `받은 날짜 ${downloadDate(book)}` : ''" @detail="showToonDetail({ id: book.metadata!.toon_series!, title: book.title, thumb: null, date: null, site: book.metadata!.source as ComicSite })">
          <UButton class="read-button" @click="showToonDetail({ id: book.metadata!.toon_series!, title: book.title, thumb: null, date: null, site: book.metadata!.source as ComicSite })">회차 보기</UButton>
        </GalleryCard>
        <GalleryCard v-else :layout="libraryLayout" :title="book.title" :cover="book.readable !== false ? imageUrl(book, 0) : ''" :placeholder="book.readable === false ? book.formats?.join(' / ').toUpperCase() : ''" :id="book.metadata?.id || book.metadata?.ehentai_id" :info="libraryInfo(book, false)" :kind="book.metadata?.type" :badge="readBadge(book.id,book.pages)" :artists="book.metadata?.artists" :groups="book.metadata?.groups" :tags="book.metadata?.tags" :date="downloadDate(book) ? `받은 날짜 ${downloadDate(book)}` : ''" @detail="showDetail(book)">
                <UButton class="read-button" :disabled="book.readable === false" @click="open(book)">{{ record(book.id) ? '이어 읽기' : '읽기' }}</UButton>
                <UButton variant="outline" color="neutral" :disabled="book.readable === false" @click="mark(book,readState(book.id,book.pages) !== 'read')">{{ readState(book.id,book.pages) === 'read' ? (libraryLayout === 'list' ? '안 읽음' : '안 읽음으로 변경') : (libraryLayout === 'list' ? '읽음' : '읽음으로 표시') }}</UButton>
        </GalleryCard>
        </template>
      </section>
      <div v-if="moreBooks" ref="bookSentinel" class="load-more" aria-hidden="true" />
      <section v-if="!busy && !error && !books.length && !(librarySource === 'all' && redditStoredCount)" class="empty"><h2>아직 작품이 없습니다</h2><p>서버의 <code>라이브러리/작품명/</code> 폴더에 JPG, PNG, WebP 또는 GIF 이미지를 넣고 전체 스캔을 실행하세요.</p><p>이 경로는 서버 PC 기준입니다. 파일명 순서로 표시됩니다.</p></section>
      <p v-else-if="!busy && !error && !visible.length && !(librarySource === 'all' && redditStoredCount)" class="empty">선택한 조건에 맞는 작품이 없습니다.</p>
      </template>
      <RedditPane v-if="tab === 'library' && (librarySource === 'reddit' || librarySource === 'all')" saved-only :search-text="filter" @stored-count="redditStoredCount = $event" @reading="value => { redditReading = value; emit('reading', value) }" />
      </section>
      </Transition>
    </div>
    <UModal title="작품 상세" :open="!!selected" :ui="{ content: 'sm:max-w-3xl' }" @update:open="open => { if (!open) goBack() }">
        <template #body><div class="library-detail">
          <template v-if="detailBook">
          <GalleryDetail :title="detailBook.title" :cover="detailBook.readable !== false ? imageUrl(detailBook, 0) : ''" :placeholder="detailBook.formats?.join(' / ').toUpperCase()" :kind="detailBook.metadata?.type" :badge="readBadge(detailBook.id,detailBook.pages)" :info="libraryInfo(detailBook, true)" :id="detailBook.metadata?.id || detailBook.metadata?.ehentai_id" :fields="[{name:'작가',values:detailBook.metadata?.artists},{name:'그룹',values:detailBook.metadata?.groups},{name:'시리즈',values:detailBook.metadata?.parodys},{name:'캐릭터',values:detailBook.metadata?.characters}]" :tags="detailBook.metadata?.tags" :date="detailDates(detailBook)" :uploader="detailBook.metadata?.uploader" :external-url="detailBook.metadata?.source === 'ehentai' && detailBook.metadata.ehentai_id && detailBook.metadata.ehentai_token ? `https://e-hentai.org/g/${detailBook.metadata.ehentai_id}/${detailBook.metadata.ehentai_token}/` : undefined" external-label="E-Hentai에서 열기" :xml-refresh="detailBook.formats?.some(f => ['source','cbz','zip'].includes(f))" :xml-refreshing="xmlRefreshing" @refresh-xml="refreshXml(detailBook)">
            <template v-if="detailBook.readable !== false && !screen.readerDetail" #actions><UButton class="read-button" @click="open(detailBook)">{{ record(detailBook.id) ? '이어 읽기' : '읽기' }}</UButton><UButton variant="outline" color="neutral" @click="mark(detailBook,readState(detailBook.id,detailBook.pages) !== 'read')">{{ readState(detailBook.id,detailBook.pages) === 'read' ? '안 읽음으로 변경' : '읽음으로 표시' }}</UButton></template>
            <p v-if="detailBook.readable === false" class="detail-date">압축/PDF의 브라우저 열람은 아직 지원하지 않습니다.</p>
          </GalleryDetail>
          </template>
        </div></template>
    </UModal>
    <Reader v-if="active" :key="`${active.toon ? active.toon.site ?? 'toon' : active.ehentaiToken ? 'ehentai' : active.remote ? 'remote' : 'local'}:${active.id}:${active.ehentaiToken ?? ''}`" :book="active" :detail-error="readerDetailError" :back-prompt="backPrompt" @detail="showReaderDetail" @close="goBack" @episode="toonStep" />
  </main>
  <AppToasts />
</template>

<style scoped>
.work-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
</style>

<style>
:root{
  /* Legacy names kept for layout CSS; values follow the Nuxt UI theme. */
  --canvas:var(--ui-bg);--surface:var(--ui-bg-elevated);--surface-raised:var(--ui-bg-accented);--line:var(--ui-border);
  --text:var(--ui-text);--muted:var(--ui-text-muted);--accent:var(--ui-primary);--on-accent:var(--ui-bg);--selected:color-mix(in srgb,var(--ui-primary) 18%,var(--ui-bg));--danger:var(--ui-error);
}
/* The viewer keeps its original palette. */
.reader{--canvas:#171919;--accent:#8ae3be;--danger:#ffaaaa}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:20px}header,.toolbar,.readerbar,nav{display:flex;align-items:center;justify-content:space-between;gap:12px}header{margin:12px 0 28px}h1{margin:4px 0;font-size:28px}h2{font-size:20px}small{color:var(--muted)}label{display:grid;gap:6px;font-size:14px}.empty{padding:36px 16px;line-height:1.8;color:var(--muted);text-align:center}.readerbar{flex-wrap:wrap;position:sticky;top:0;background:var(--canvas);padding:12px 0;z-index:1}.readerbar strong{overflow-wrap:anywhere;flex:1}.canvas{overflow:auto;margin-top:16px}.reading{display:block;max-width:none;height:auto;margin:0 auto 12px}nav{margin:16px 0}code{overflow-wrap:anywhere}@media(max-width:480px){main{padding:12px}.readerbar strong{min-width:60%}}
</style>

<style>


.main-nav{justify-content:flex-start;gap:4px;position:sticky;top:0;z-index:8;margin:4px 0 22px;padding:4px 0 0;background:var(--canvas);}
.main-nav-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;width:100%;list-style:none;padding:0;margin:0}
.main-nav button{display:flex;width:100%;align-items:center;justify-content:center;gap:8px;white-space:nowrap}


@media(max-width:600px){header{margin-bottom:12px}main{padding-bottom:24px}}
@media(max-width:480px){.main-nav button{flex:1;min-width:0;flex-direction:column;gap:4px}}@media(min-width:640px){.main-nav svg{width:22px;height:22px}}
</style>

<style>.library-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;margin-top:14px}.library-filters label{min-width:0}.library-filters label>button{width:100%;min-width:0}.library-filters select{width:100%}.library-filters{align-items:end}.library-view-toggle{grid-column:1/-1;justify-self:end}@media(min-width:640px){.library-filters{display:flex;flex-wrap:wrap}.library-filters label{flex:0 1 11rem}.library-view-toggle{margin-left:auto}}.library-toolbar{margin-bottom:12px;flex-wrap:wrap}.library-toolbar h2{white-space:nowrap}.library-busy{margin-left:8px;font-size:13px;font-weight:400;color:var(--muted)}.library-toolbar .work-tabs{flex-wrap:nowrap}</style>



<style>.library-detail h2,.library-detail dd{overflow-wrap:anywhere}.library-detail dd .copy-value{margin:0 4px 4px 0}.library-detail dt{color:var(--muted);margin-top:12px}.library-detail dd{margin:4px 0}.library-tags{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0}.format-placeholder{display:grid;place-items:center;width:100%;aspect-ratio:3/4;min-height:0;background:var(--canvas);font-size:24px!important}</style>


<style>.search-tabs{margin-bottom:16px}.search-tabs button{display:inline-flex;align-items:center;gap:6px}</style>

<style>
.app-workspace :is(.results > article,.reading-history-view article,.job-record){
  border-radius:12px;
  box-shadow:0 1px 3px #0004;
}





</style>

<style>
@media (prefers-reduced-motion: no-preference) {
  .tab-fade-enter-active{transition:opacity 160ms ease-out}
  .tab-fade-enter-from{opacity:0}
}
</style>

<style>

.library-detail-cover{width:clamp(72px,20vw,148px);aspect-ratio:3/4;object-fit:contain;background:var(--canvas);border-radius:8px}

</style>

<style>@media(max-width:480px){.main-nav>div{width:100%}.main-nav-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.main-nav-list button{width:100%;white-space:normal;text-align:center}}</style>

<style scoped>.library-results{--result-actions-columns:2;margin-top:16px}.metadata-values{display:flex;flex-wrap:wrap;gap:4px}.kind{font-size:12px}.tags{display:flex;flex-wrap:wrap;gap:6px}</style>
