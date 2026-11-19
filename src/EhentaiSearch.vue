<script lang="ts">
export type EhentaiGallery = {
  id: number
  url: string
  title: string
  category: string
  thumb: string | null
  posted: string | null
  pages: number | null
  rating: number | null
  tags: string[]
  uploader?: string | null
}
</script>

<script setup lang="ts">
import { kindColor } from './type-colors'
import CompareSelect from "./OptionSelect"
import { notify } from './notifications'
import { computed, onUnmounted, ref, watch } from 'vue'
import CopyValue from './CopyValue.vue'
import { scrollToSearchResults } from './search-scroll'
import ViewToggle from './ViewToggle.vue'
import { excludeAiGeneratedDefault, excludeGayTagsDefault } from './search-appearance'
import { tagKey } from './tag-descriptions'
import { readingHistory } from './reading-history'
import { ehentaiCover } from './ehentai-cover'
import GalleryCard from './GalleryCard.vue'
import GalleryDetail from './GalleryDetail.vue'
import { infoCacheMode } from './info-cache'

const props = defineProps<{ localCovers?: Map<string, string>; openLocal?: (id: number) => boolean; detailItem?: EhentaiGallery; readerDetail?: boolean; downloadedIds: Set<number> }>()
const emit = defineEmits<{ detail: [EhentaiGallery]; closeDetail: []; read: [EhentaiGallery, number, string]; libraryChanged: [] }>()

const categories = [
  { name: 'Doujinshi', flag: 2 }, { name: 'Manga', flag: 4 },
  { name: 'Artist CG', flag: 8 }, { name: 'Game CG', flag: 16 },
  { name: 'Western', flag: 512 }, { name: 'Non-H', flag: 256 },
  { name: 'Image Set', flag: 32 }, { name: 'Cosplay', flag: 64 },
  { name: 'Misc', flag: 1 },
]
const detailMetadata = computed(() => {
  const fields = [
    { key: 'artist', label: '작가', values: new Set<string>() },
    { key: 'group', label: '그룹', values: new Set<string>() },
    { key: 'parody', label: '시리즈 / 원작', values: new Set<string>() },
    { key: 'character', label: '캐릭터', values: new Set<string>() },
  ]
  const languages = new Set<string>()
  const tags = new Map<string, { tag: string; female?: number; male?: number }>()
  for (const raw of props.detailItem?.tags ?? []) {
    const separator = raw.indexOf(':')
    const namespace = separator === -1 ? '' : raw.slice(0, separator).trim().toLowerCase()
    const label = raw.slice(separator + 1).trim()
    if (!label) continue
    const field = fields.find(field => field.key === namespace)
    if (field) {
      field.values.add(label)
    } else if (namespace === 'language' && label.toLowerCase() !== 'translated') {
      languages.add(label)
    } else {
      const tag = { tag: label, female: Number(namespace === 'female'), male: Number(namespace === 'male') }
      tags.set(tagKey(tag), tag)
    }
  }
  return { fields, language: [...languages].join(', '), tags: [...tags.values()] }
})
const query = ref('')
const categoryMask = ref(0)
const minimumRating = ref(0)
const excludeGayTags = ref(excludeGayTagsDefault.value)
watch(excludeGayTagsDefault, value => { excludeGayTags.value = value })
const excludeAiGenerated = ref(excludeAiGeneratedDefault.value)
const excludeNonNude = ref(false)
watch(excludeAiGeneratedDefault, value => { excludeAiGenerated.value = value })

type Results = {
  items: EhentaiGallery[]
  previous: number | null
  next: number | null
}

const resultsStart = ref<HTMLElement>()
const result = ref<Results>()
const busy = ref(false)
const error = ref('')
const layout = ref<'grid' | 'list'>(localStorage.getItem('ehentai-layout') === 'list' ? 'list' : 'grid')
watch(layout, value => localStorage.setItem('ehentai-layout', value))

const opening = ref(false)
const readerError = ref('')
let readerRequest: AbortController | undefined
watch(() => props.detailItem, () => {
  readerRequest?.abort()
  opening.value = false
  readerError.value = ''
})
onUnmounted(() => {
  readerRequest?.abort()
  disposed = true
  clearTimeout(downloadTimer)
})
const displayedDetail = ref<typeof props.detailItem>()
watch(() => props.detailItem, item => { if (item) displayedDetail.value = item }, { immediate: true, flush: "sync" })

function galleryToken(item: EhentaiGallery) {
  const gallery = new URL(item.url)
  const token = gallery.pathname.match(/^\/g\/\d+\/([a-f0-9]{10})\/$/)?.[1]
  if (gallery.origin !== 'https://e-hentai.org' || !token) throw new Error()
  return token
}

const refreshing = ref(false)
async function refreshDetail() {
  const item = displayedDetail.value
  if (!item || refreshing.value) return
  refreshing.value = true
  try {
    const response = await fetch(`/api/ehentai/galleries/${item.id}/${galleryToken(item)}/refresh`, { method: 'POST' })
    if (!response.ok) throw new Error()
    const { pages } = await response.json()
    if (displayedDetail.value?.id === item.id) displayedDetail.value = { ...item, pages }
  } catch { readerError.value = '정보를 새로 받지 못했습니다.' }
  finally { refreshing.value = false }
}
function readLabel(item: EhentaiGallery) {
  return readingHistory.value[`ehentai:${item.id}:${galleryToken(item)}`] ? '이어 읽기' : '읽기'
}

async function openReader(item: EhentaiGallery) {
  if (opening.value || props.openLocal?.(item.id)) return
  const request = new AbortController()
  readerRequest = request
  opening.value = true
  readerError.value = ''
  try {
    const token = galleryToken(item)
    const response = await fetch(`/api/ehentai/galleries/${item.id}/${token}`, { signal: request.signal })
    if (!response.ok) throw new Error()
    const { pages } = await response.json()
    if (!Number.isSafeInteger(pages) || pages < 1) throw new Error()
    if (!request.signal.aborted) emit('read', item, pages, token)
  } catch {
    if (!request.signal.aborted) readerError.value = '작품의 이미지 목록을 불러오지 못했습니다.'
  } finally {
    if (readerRequest === request) {
      readerRequest = undefined
      opening.value = false
    }
  }
}

const downloadStatus = ref<Record<number, string>>({})
const downloadError = ref<Record<number, string>>({})
const submittingDownload = ref<number>()
const activeStatuses = ['queued', 'downloading', 'pausing', 'cancelling', 'finalizing']
let downloadTimer: ReturnType<typeof setTimeout> | undefined
let polling = false
let disposed = false
const isDownloaded = (id: number) => props.downloadedIds.has(id)
const isDownloading = (id: number) => activeStatuses.includes(downloadStatus.value[id])
function downloadLabel(id: number) {
  if (isDownloaded(id)) return '다운로드 완료'
  if (submittingDownload.value === id) return '등록 중…'
  return isDownloading(id) ? '다운로드 중' : '다운로드'
}
async function refreshDownloads() {
  if (polling || disposed) return
  clearTimeout(downloadTimer)
  polling = true
  try {
    const response = await fetch('/api/downloads')
    if (!response.ok) return
    const jobs: { id: number; source?: string; status: string }[] = await response.json()
    const next = Object.fromEntries(jobs.filter(job => job.source === 'ehentai').map(job => [job.id, job.status]))
    const completed = Object.entries(next).some(([id, status]) => status === 'completed' && isDownloading(Number(id)))
    downloadStatus.value = next
    if (completed) emit('libraryChanged')
  } catch { /* A later poll retries the connection. */ }
  finally {
    polling = false
    if (!disposed && Object.values(downloadStatus.value).some(status => activeStatuses.includes(status))) {
      downloadTimer = setTimeout(refreshDownloads, 2000)
    }
  }
}
async function download(item: EhentaiGallery) {
  if (submittingDownload.value !== undefined || isDownloaded(item.id) || isDownloading(item.id)) return
  submittingDownload.value = item.id
  delete downloadError.value[item.id]
  try {
    const response = await fetch(`/api/ehentai/downloads/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: galleryToken(item), title: item.title, thumb: item.thumb }),
    })
    if (!response.ok) throw new Error()
    downloadStatus.value[item.id] = (await response.json()).status
    if (downloadStatus.value[item.id] === 'completed') emit('libraryChanged')
    else notify('download', '다운로드를 추가했습니다.')
    clearTimeout(downloadTimer)
    downloadTimer = setTimeout(refreshDownloads, 1000)
  } catch { downloadError.value[item.id] = '다운로드 작업을 등록하지 못했습니다.' }
  finally { submittingDownload.value = undefined }
}

let submitted = new URLSearchParams()
async function search(cursor?: number, previous = false) {
  if (busy.value) return
  const filters = cursor === undefined
    ? new URLSearchParams({
        q: query.value.trim(),
        categories: String(categoryMask.value),
        rating: String(minimumRating.value),
        exclude_gay_tags: String(excludeGayTags.value),
        exclude_ai_generated: String(excludeAiGenerated.value),
        exclude_non_nude: String(excludeNonNude.value),
      })
    : submitted
  const params = new URLSearchParams(filters)
  if (cursor !== undefined) {
    params.set('cursor', String(cursor))
    params.set('previous', String(previous))
  }
  busy.value = true
  if (cursor === undefined) void refreshDownloads()
  error.value = ''
  try {
    const response = await fetch('/api/ehentai/search?' + params)
    if (!response.ok) {
      if (response.status === 502) {
        const upstreamMessages: Record<string, string> = {
          'E-Hentai search page request failed': '이 서버에서 E-Hentai 검색 페이지(e-hentai.org)에 연결하지 못했습니다.',
          'E-Hentai search page format changed': 'E-Hentai 검색 페이지를 받았지만 결과를 읽지 못했습니다.',
        }
        throw new Error(upstreamMessages[await response.text()] ?? '서버가 E-Hentai 검색 결과를 가져오지 못했습니다.')
      }
      const messages: Record<number, string> = {
        400: '검색어 길이와 조건을 확인하세요. 제외 태그를 포함해 최대 200자입니다.',
        429: '다른 E-Hentai 검색이 진행 중입니다. 잠시 후 다시 시도하세요.',
        504: 'E-Hentai의 응답 시간이 초과되었습니다.',
      }
      throw new Error(messages[response.status] ?? '검색에 실패했습니다.')
    }
    result.value = await response.json()
    submitted = filters
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '검색에 실패했습니다.'
  } finally {
    busy.value = false
  }
  if (!error.value && cursor !== undefined) await scrollToSearchResults(() => resultsStart.value)
}
</script>

<template>
  <section aria-labelledby="ehentai-heading">
    <h2 id="ehentai-heading">E-Hentai 검색</h2>
    <form class="eh-form" @submit.prevent="search()">
      <label class="keyword">검색어
        <UInput v-model="query" type="search" maxlength="200" placeholder="제목 또는 태그" />
      </label>
      <label>최저 별점
        <CompareSelect v-model="minimumRating">
          <option :value="0">전체</option>
          <option v-for="rating in [2, 3, 4, 5]" :key="rating" :value="rating">{{ rating }}★ 이상</option>
        </CompareSelect>
      </label>
      <label class="check"><UCheckbox v-model="excludeGayTags" />게이 태그 제외</label>
      <label class="check"><UCheckbox v-model="excludeAiGenerated" />AI Generated 제목 제외</label>
      <label class="check"><UCheckbox v-model="excludeNonNude" />non-nude 태그 제외</label>
      <UButton type="submit" class="primary-button" icon="i-lucide-search" :loading="busy" :disabled="busy">검색</UButton>
      <fieldset class="categories">
        <legend>카테고리</legend>
        <UButton :variant="(categoryMask === 0) ? 'solid' : 'outline'" :color="(categoryMask === 0) ? 'primary' : 'neutral'" type="button" :aria-pressed="categoryMask === 0" @click="categoryMask = 0">전체</UButton>
        <UButton :variant="(categoryMask & category.flag) !== 0 ? 'solid' : 'outline'" :color="kindColor(category.name)" v-for="category in categories" :key="category.flag" type="button"
          :aria-pressed="(categoryMask & category.flag) !== 0" @click="categoryMask ^= category.flag">
          {{ category.name }}
        </UButton>
      </fieldset>
    </form>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="readerError && !detailItem" role="alert">{{ readerError }}</p>
    <template v-if="result">
      <div ref="resultsStart" class="toolbar">
        <p aria-live="polite">{{ result.items.length ? '검색 결과 ' + result.items.length + '건' : '표시할 작품이 없습니다.' }}</p>
        <ViewToggle v-model="layout" label="E-Hentai 결과 보기 방식" />
      </div>
      <div class="results" :class="{ 'results-list': layout === 'list' }" :aria-busy="busy">
        <GalleryCard v-for="item in result.items" :key="item.url" :layout="layout" :title="item.title" :cover="localCovers?.get(`ehentai:${item.id}`) ?? (item.thumb ? ehentaiCover(item.thumb) : '')" :downloaded="isDownloaded(item.id)" :id="item.id" :info="item.pages ? `${item.pages}페이지` : ''" :kind="item.category" :rating="item.rating" :tags="item.tags" :date="item.posted ? `업로드 ${item.posted}` : ''" @detail="emit('detail', item)">
          <template #notice><p v-if="downloadError[item.id]" role="alert">{{ downloadError[item.id] }}</p></template>
                <UButton class="read-button" :disabled="opening" @click="openReader(item)">{{ readLabel(item) }}</UButton>
                <UButton variant="outline" color="neutral" :disabled="submittingDownload !== undefined || isDownloaded(item.id) || isDownloading(item.id)" @click="download(item)">{{ downloadLabel(item.id) }}</UButton>
        </GalleryCard>
      </div>
      <nav v-if="result.previous || result.next" class="pager" aria-label="E-Hentai 검색 결과 페이지">
        <UButton variant="outline" color="neutral" icon="i-lucide-chevron-left" :disabled="busy || result.previous === null" @click="search(result.previous ?? undefined, true)">이전</UButton>
        <UButton variant="outline" color="neutral" trailing-icon="i-lucide-chevron-right" :disabled="busy || result.next === null" @click="search(result.next ?? undefined)">다음</UButton>
      </nav>
    </template>

    <UModal title="E-Hentai 작품 상세" :open="!!detailItem" :ui="{ content: 'sm:max-w-3xl' }" @update:open="open => { if (!open) emit('closeDetail') }">
        <template #body><div class="gallery-detail">
          <template v-if="displayedDetail">
        
        <GalleryDetail :refreshable="infoCacheMode === 'week'" :refreshing="refreshing" @refresh="refreshDetail" :title="displayedDetail.title" :cover="localCovers?.get(`ehentai:${displayedDetail.id}`) ?? (displayedDetail.thumb ? ehentaiCover(displayedDetail.thumb) : '')" :kind="displayedDetail.category" :info="(detailMetadata.language || '언어 정보 없음') + (displayedDetail.pages ? ` · ${displayedDetail.pages}페이지` : '')" :rating="displayedDetail.rating" :id="displayedDetail.id" :fields="detailMetadata.fields.map(f => ({ name: f.label, values: f.values }))" :tags="detailMetadata.tags" :uploader="displayedDetail.uploader" :external-url="displayedDetail.url" external-label="E-Hentai에서 열기" :date="displayedDetail.posted ? `업로드 ${displayedDetail.posted}` : ''">
          <template #actions>
          <UButton v-if="!readerDetail" class="read-button" :disabled="opening" @click="openReader(displayedDetail)">{{ opening ? '여는 중…' : readLabel(displayedDetail) }}</UButton>
          <UButton variant="outline" color="neutral" :disabled="submittingDownload !== undefined || isDownloaded(displayedDetail.id) || isDownloading(displayedDetail.id)" @click="download(displayedDetail)">{{ downloadLabel(displayedDetail.id) }}</UButton>
          </template>
        <p v-if="readerError" role="alert">{{ readerError }}</p>
        <p v-if="downloadError[displayedDetail.id]" role="alert">{{ downloadError[displayedDetail.id] }}</p>
        </GalleryDetail>
      </template>
    
        </div></template>
    </UModal>
  </section>
</template>

<style scoped>
.eh-form{display:flex;align-items:end;flex-wrap:wrap;gap:12px}.eh-form .primary-button{justify-content:center}
.keyword{flex:1;min-width:200px}
.check{display:flex;align-items:center;gap:8px;height:2.25rem}
.categories{display:flex;flex-wrap:wrap;gap:8px;width:100%;margin:0 0 12px;padding:0;border:0}
.categories legend{padding:0;margin:0 0 8px;color:var(--muted);font-size:14px}
.results{--result-actions-columns:2}
.eh-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rating{color:#f6cd76}
.detail-category{font-size:12px}
@media(max-width:480px){
  .keyword{flex-basis:100%}
  .eh-form .primary-button{flex-basis:100%}
}
</style>
