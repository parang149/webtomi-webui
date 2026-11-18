<script setup lang="ts">
import type { ToonSeries } from './ToonSearch.vue'
import AppSelect from './AppSelect.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { historySources, readingHistory, refreshReading, historyError, resetReading, type History } from './reading-history'
import type { Gallery } from './RemoteSearch.vue'
import type { EhentaiGallery } from './EhentaiSearch.vue'
import ViewToggle from './ViewToggle.vue'
import GalleryCard from './GalleryCard.vue'
import { scrollToControls, useIncremental } from './incremental'
import SourceTabs from './SourceTabs.vue'
import { ehentaiCover } from './ehentai-cover'
const props = defineProps<{ books: {id:string;title:string;pages:number;readable?:boolean}[] }>()
type LocalBook = (typeof props.books)[number]
const emit = defineEmits<{ read: [LocalBook & {remote?:boolean}]; localDetail: [LocalBook]; remoteDetail: [Gallery]; ehentaiRead: [EhentaiGallery, number, string]; ehentaiDetail: [EhentaiGallery]; toonRead: ['toon' | 'wolf', number, number, string]; toonDetail: [ToonSeries] }>()
const error = ref(''), busy = ref('')
const filter = ref('all')
const comicSite = ref<'all' | 'toon' | 'wolf'>('all')
const cookieName = 'hitomi-history-source'
const savedSource = document.cookie.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
const source = ref(historySources.find(option => option.id === savedSource)?.id ?? 'all')
watch(source, value => {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${cookieName}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
}, { flush: 'sync' })
const layout = ref<'grid' | 'list'>(localStorage.getItem('history-layout') === 'grid' ? 'grid' : 'list')
watch(layout, value => localStorage.setItem('history-layout', value))
const coverErrors = ref(new Set<string>())
const localBooks = computed(() => {
  const books = new Map<string, (typeof props.books)[number]>()
  for (const book of props.books) {
    const key = readingHistory.value[book.id]?.key
    if (key && book.readable !== false && !books.has(key)) books.set(key, book)
  }
  return books
})
function coverUrl(entry: History) {
  const book = localBooks.value.get(entry.key)
  if (book) {
    const url = `/api/library/${encodeURIComponent(book.id)}/pages/0`
    if (!coverErrors.value.has(url)) return url
  }
  if (/^remote:\d+$/.test(entry.key)) {
    const url = `/api/galleries/${entry.key.slice(7)}/cover`
    if (!coverErrors.value.has(url)) return url
  }
  const toon = entry.key.match(/^(toon|wolf):(\d+):\d+$/)
  if (toon) {
    const url = `/api/${toon[1]}/series/${toon[2]}/cover`
    if (!coverErrors.value.has(url)) return url
  }
  const thumb = ehentaiCover(entry.ehentai?.thumb)
  if (thumb && !coverErrors.value.has(thumb)) return thumb
  return ''
}
const entryId = (entry: History) => entry.key.match(/^(?:remote|ehentai|ehentai-library|toon|wolf):(\d+)/)?.[1] ?? null
const entrySource = (entry: History) => entry.key.startsWith('toon:') || entry.key.startsWith('wolf:') ? 'toon' : entry.key.startsWith('ehentai:') || entry.key.startsWith('ehentai-library:') ? 'ehentai' : 'hitomi'
/** One card per entry; 만화 episodes of the same series share one card (latest episode first). */
type Item = { key: string; entry: History; group?: History[] }
const items = computed(() => {
  const list = [...new Map(Object.values(readingHistory.value).map(entry => [entry.key, entry])).values()]
    .filter(entry => (source.value === 'all' || source.value === entrySource(entry))
      && (source.value !== 'toon' || comicSite.value === 'all' || entry.key.startsWith(comicSite.value + ':'))
      && (filter.value === 'all' || (filter.value === 'read' ? entry.completed : !entry.completed)))
    .sort((a, b) => b.updated_at - a.updated_at)
  const result: Item[] = [], series = new Map<string, Item>()
  for (const entry of list) {
    const key = entry.key.match(/^((?:toon|wolf):\d+):\d+$/)?.[1]
    const item = key && series.get(key)
    if (item) { item.group!.push(entry); continue }
    const next: Item = key ? { key, entry, group: [entry] } : { key: entry.key, entry }
    if (key) series.set(key, next)
    result.push(next)
  }
  return result
})
/** Series name from its episode titles ("친구 게임 129화" → "친구 게임"). */
function seriesTitle(item: Item) {
  const titles = item.group!.map(entry => entry.title.trim())
  let name = titles[0]
  for (const title of titles.slice(1)) { let i = 0; while (i < name.length && name[i] === title[i]) i++; name = name.slice(0, i) }
  if (titles.length < 2) name = name.replace(/\d+(?:\.\d+)?\s*(?:화|회|話|부)?\s*$/, '')
  name = name.replace(/[\s\d.\-_:(\[]+$/, '').trim()
  return name || `작품 #${entryId(item.entry)}`
}
const episodeName = (item: Item) => { const name = seriesTitle(item), title = item.entry.title.trim(); return title.startsWith(name) && title.length > name.length ? title.slice(name.length).trim() : title }
const { shown: shownItems, more, sentinel } = useIncremental(() => items.value, () => [source.value, comicSite.value, filter.value, layout.value])
watch(layout, () => scrollToControls('.history-controls'))
function date(value: number) { return new Date(value * 1000).toLocaleString() }
async function open(entry: History, detail = false) {
  error.value = ''; busy.value = entry.key
  try {
    const local = localBooks.value.get(entry.key)
    if (local && !(detail && /^(toon|wolf):/.test(entry.key))) { if (detail) emit('localDetail', local); else emit('read', local); return }
    const toon = entry.key.match(/^(toon|wolf):(\d+):(\d+)$/)
    if (toon) {
      const site = toon[1] as 'toon' | 'wolf'
      if (detail) emit('toonDetail', { id: Number(toon[2]), title: seriesTitle(items.value.find(item => item.group?.includes(entry)) ?? { key: '', entry, group: [entry] }), thumb: null, date: null, site })
      else emit('toonRead', site, Number(toon[2]), Number(toon[3]), entry.title)
      return
    }
    const ehentai = entry.key.match(/^ehentai:([1-9]\d*):([a-f0-9]{10})$/)
    if (ehentai) {
      const [, id, token] = ehentai
      const item: EhentaiGallery = {
        id: Number(id), url: `https://e-hentai.org/g/${id}/${token}/`, title: entry.title, pages: entry.total,
        thumb: null, category: '', posted: null, rating: null, tags: [], ...entry.ehentai,
      }
      if (detail) emit('ehentaiDetail', item)
      else {
        const response = await fetch(`/api/ehentai/galleries/${id}/${token}`)
        if (!response.ok) throw new Error('작품 정보를 가져오지 못했습니다.')
        const { pages } = await response.json()
        if (!Number.isSafeInteger(pages) || pages < 1) throw new Error('페이지 정보를 가져오지 못했습니다.')
        emit('ehentaiRead', item, pages, token)
      }
      return
    }
    if (!entry.key.startsWith('remote:')) throw new Error('서버에서 해당 작품 폴더를 찾지 못했습니다.')
    const response = await fetch(`/api/galleries/${entry.key.slice(7)}`)
    if (!response.ok) throw new Error('작품 정보를 가져오지 못했습니다.')
    const book: Gallery = await response.json()
    if (detail) emit('remoteDetail', book)
    else emit('read', { id: String(book.id), title: book.title, pages: book.pages, remote: true })
  } catch(e) { error.value = String(e) }
  finally { busy.value = '' }
}
async function markUnread(entry: History) {
  error.value = ''; busy.value = entry.key
  try { await resetReading(entry.key) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '읽기 상태를 변경하지 못했습니다.' }
  finally { busy.value = '' }
}
onMounted(refreshReading)
</script>
<template>
  <section>
    <div class="toolbar history-toolbar"><h2>읽기 기록</h2><UButton variant="soft" color="neutral" @click="coverErrors.clear(); refreshReading()">새로고침</UButton></div>
    <SourceTabs v-model="source" label="읽기 기록 출처" />
    <div class="history-controls">
      <div class="history-filters"><label>표시<AppSelect v-model="filter" label="표시" :options="[{'value': 'all', 'label': '전체'}, {'value': 'reading', 'label': '읽는 중'}, {'value': 'read', 'label': '읽음'}]" /></label>
      <label v-if="source === 'toon'">사이트<AppSelect v-model="comicSite" label="사이트" :options="[{'value': 'all', 'label': '전체'}, {'value': 'toon', 'label': '일일툰'}, {'value': 'wolf', 'label': '늑대툰'}]" /></label></div>
      <ViewToggle v-model="layout" label="읽기 기록 표시 방식" />
    </div>
    <p v-if="error || historyError" role="alert">{{ error || historyError }}</p>
    <p v-if="!items.length">아직 읽기 기록이 없습니다.</p>
    <div class="results history-results" :class="{ 'results-list': layout === 'list' }">
      <GalleryCard v-for="{ key, entry, group } in shownItems" :key="key" :layout="layout" :title="group ? seriesTitle({ key, entry, group }) : entry.title.startsWith('remote:') ? `작품 #${entry.key.slice(7)}` : entry.title" :cover="coverUrl(entry)" :id="entryId(entry)" :info="group ? `${entry.key.startsWith('wolf:') ? '늑대툰' : '일일툰'} · 최근 ${episodeName({ key, entry, group })} · 기록 ${group.length}화` : ({ ehentai: 'E-Hentai', toon: '일일툰', hitomi: 'Hitomi' } as const)[entrySource(entry)]" :badge="entry.completed ? { label: '읽음', color: 'success' } : { label: `읽는 중 ${entry.furthest}/${entry.total || '?'}`, color: 'primary' }" :date="`읽은 날짜 ${date(entry.updated_at)}`" @detail="open(entry, true)" @cover-error="src => coverErrors.add(src)">
        <UButton :disabled="!!busy" @click="open(entry)">{{ busy === entry.key ? '불러오는 중…' : '이어 읽기' }}</UButton>
        <UButton v-if="group" variant="outline" color="neutral" :disabled="!!busy" @click="open(entry, true)">회차 보기</UButton>
        <UButton v-else variant="outline" color="neutral" :disabled="!!busy" @click="markUnread(entry)">{{ layout === 'list' ? '안 읽음' : '안 읽음으로 변경' }}</UButton>
      </GalleryCard>
    </div>
    <div v-if="more" ref="sentinel" class="load-more" aria-hidden="true" />
  </section>
</template>

<style scoped>
.history-toolbar{margin-bottom:12px}
.history-filters{display:flex;flex-wrap:wrap;gap:12px}
.history-controls{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px}
.history-results{--result-actions-columns:2;margin-top:16px}
</style>
