<script lang="ts">
export type Gallery = { id: number; title: string; language: string; pages: number; date?: string | null; artists: string[]; kind?: string; groups?: string[]; series?: string[]; characters?: string[]; tags?: { tag: string; female?: number | string; male?: number | string }[] }
</script>
<script setup lang="ts">
import { kindColor } from './type-colors'
import CompareSelect from "./OptionSelect"
import { notify } from './notifications'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { record, readState, readBadge, markReading } from './reading-history'
import CopyValue from './CopyValue.vue'
import GalleryCard from './GalleryCard.vue'
import GalleryDetail from './GalleryDetail.vue'
import { infoCacheMode } from './info-cache'
import FilterField from './FilterField.vue'
import { excludeGayTagsDefault, filterLayout } from './search-appearance'
import { scrollToSearchResults } from './search-scroll'
import ViewToggle from './ViewToggle.vue'
import { buildQuery, defaultLanguage, emptyFilters, languages } from './search-filters'
const layout = ref<'grid' | 'list'>(localStorage.getItem('search-layout') === 'list' ? 'list' : 'grid')
watch(layout, value => localStorage.setItem('search-layout', value))
const props = defineProps<{ downloadedIds: Set<number>; localCovers?: Map<string, string>; detailItem: Gallery | null; readerDetail?: boolean }>()
const selected = computed(() => props.detailItem)
function uploadDate(value?: string | null) {
  const date = value?.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ]\d{2}:\d{2})/)?.[1]
  if (!date) return ''
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : ''
}

const displayedDetail = ref<typeof selected.value>()
watch(() => selected.value, item => { if (item) displayedDetail.value = item }, { immediate: true, flush: "sync" })
const refreshing = ref(false)
async function refreshDetail() {
  const id = displayedDetail.value?.id
  if (!id || refreshing.value) return
  refreshing.value = true
  try {
    const response = await fetch(`/api/galleries/${id}/refresh`, { method: 'POST' })
    if (!response.ok) throw new Error()
    const fresh: Gallery = await response.json()
    if (displayedDetail.value?.id === id) displayedDetail.value = fresh
  } catch { notices.value[id] = '정보를 새로 받지 못했습니다.' }
  finally { refreshing.value = false }
}
function readDetail() { if (selected.value) emit('read', selected.value) }
const emit = defineEmits<{ read: [Gallery]; detail: [Gallery]; closeDetail: []; libraryChanged: [] }>()

type Result = { page: number; total: number; page_size: number; items: Gallery[]; failed_ids: number[] }
const query = ref('')
const excludeGayTags = ref(excludeGayTagsDefault.value)
watch(excludeGayTagsDefault, value => { excludeGayTags.value = value })
const browserLanguage = defaultLanguage(navigator.language)
const savedLanguage = ref(localStorage.getItem('search-language'))
const language = computed({
  get: () => savedLanguage.value === '' || Object.values(languages).some(([value]) => value === savedLanguage.value)
    ? savedLanguage.value ?? browserLanguage : browserLanguage,
  set: value => { savedLanguage.value = value; localStorage.setItem('search-language', value) },
})
const types = ref<string[]>([])
const kinds = { gamecg: 'GameCG', manga: 'Manga', doujinshi: 'Doujinshi', artistcg: 'ArtistCG', anime: 'Anime', imageset: 'ImageSet' }
function toggleType(kind: string) {
  types.value = types.value.includes(kind) ? types.value.filter(value => value !== kind) : [...types.value, kind]
}
const filters = ref(emptyFilters())
const fields = [{ key: 'artist', label: '작가' }, { key: 'group', label: '그룹' }, { key: 'series', label: '시리즈 / 원작' }, { key: 'character', label: '캐릭터' }, { key: 'tag', label: '태그' }] as const
const advancedOpen = ref(true)
const compact = computed(() => filterLayout.value === 'compact')
advancedOpen.value = !compact.value
watch(compact, value => { advancedOpen.value = !value })
// Keep typed-but-unadded filter text when the panel closes and its fields unmount.
function setAdvancedOpen(open: boolean) {
  if (!open) fieldRefs.value.forEach(field => field.commit())
  advancedOpen.value = open
}
const activeField = ref<typeof fields[number]['key']>()
const applied = computed(() => fields.flatMap(field =>
  filters.value[field.key].map(term => ({
    ...field, term, excluded: term.startsWith('-'),
    name: term.replace(/^-/, '').replace(new RegExp('^' + field.key + ':'), ''),
  })),
))
async function openField(key: typeof fields[number]['key']) {
  if (activeField.value === key) { activeField.value = undefined; return }
  activeField.value = key
  await nextTick()
  fieldRefs.value.find(field => field.$props.field === key)?.focus()
}
const fieldRefs = ref<InstanceType<typeof FilterField>[]>([])
const preview = computed(() => buildQuery(query.value, language.value, types.value, filters.value))
const formVersion = ref(0)
const comicId = ref('')
function reset() {
  formVersion.value++; query.value = ''; types.value = []; filters.value = emptyFilters(); popular.value = false
  excludeGayTags.value = excludeGayTagsDefault.value
  activeField.value = undefined
  if (compact.value) advancedOpen.value = false
  savedLanguage.value = null
  localStorage.removeItem('search-language')
}
async function submit() {
  fieldRefs.value.forEach(field => field.commit())
  await nextTick()
  await search(1, true)
}
async function lookup() {
  const id = Number(comicId.value)
  if (!Number.isInteger(id) || id <= 0) { error.value = '올바른 작품 ID를 입력하세요.'; return }
  emit('libraryChanged')
  busy.value = true; error.value = ''
  try {
    const response = await fetch(`/api/galleries/${id}`)
    if (!response.ok) throw new Error(response.status === 404 ? '작품을 찾지 못했습니다.' : '작품 조회에 실패했습니다.')
    result.value = { page: 1, total: 1, page_size: 12, items: [await response.json()], failed_ids: [] }
  } catch (e) { error.value = e instanceof Error ? e.message : '조회 실패' }
  finally { busy.value = false }
}
const popular = ref(false)
const resultsStart = ref<HTMLElement>()
const result = ref<Result | null>(null)
const busy = ref(false)
const error = ref('')
const downloading = ref<number | null>(null)
const notices = ref<Record<number, string>>({})
// List view shows the first tags only; the rest open per item.
const pending = ref(new Set<number>())
let pollTimer: ReturnType<typeof setTimeout> | undefined
let unmounted = false
function pollDownloads() {
  if (pollTimer || unmounted || !pending.value.size) return
  pollTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/downloads')
      if (!response.ok) return
      const jobs: { id: number; source?: string; status: string }[] = await response.json()
      let completed = false
      for (const job of jobs) {
        if (job.source === 'ehentai') continue
        if (!pending.value.has(job.id) || ['queued', 'downloading', 'finalizing', 'pausing', 'cancelling'].includes(job.status)) continue
        pending.value.delete(job.id)
        if (job.status === 'completed') {
          completed = true
          notices.value[job.id] = '다운로드를 완료했습니다.'
        } else {
          delete notices.value[job.id]
        }
      }
      if (completed) emit('libraryChanged')
    } catch { /* A later poll retries a temporary connection failure. */ }
    finally { pollTimer = undefined; pollDownloads() }
  }, 2000)
}
onUnmounted(() => { unmounted = true; clearTimeout(pollTimer) })
async function download(id: number) {
  if (props.downloadedIds.has(id) || pending.value.has(id)) return
  downloading.value = id
  try {
    const response = await fetch(`/api/downloads/${id}`, { method: 'POST' })
    if (!response.ok) throw new Error()
    const job = await response.json()
    if (job.status === 'completed') {
      notices.value[id] = '이미 다운로드한 작품입니다.'
      emit('libraryChanged')
    } else {
      notices.value[id] = '다운로드에 등록했습니다.'
      notify('download', '다운로드를 추가했습니다.')
      pending.value.add(id)
      pollDownloads()
    }
  } catch { notices.value[id] = '등록하지 못했습니다. 잠시 후 다시 시도하세요.' }
  finally { downloading.value = null }
}
let submitted = { q: '', popular: false, excludeGayTags: false }
async function search(page = 1, fresh = false) {
  if (busy.value) return
  if (fresh) {
    submitted = { q: preview.value, popular: popular.value, excludeGayTags: excludeGayTags.value }
    result.value = null
    emit('libraryChanged')
  }
  busy.value = true; error.value = ''
  try {
    const params = new URLSearchParams({ q: submitted.q, popular: String(submitted.popular), exclude_gay_tags: String(submitted.excludeGayTags), page: String(page) })
    const response = await fetch(`/api/search?${params}`)
    if (!response.ok) {
      const message: Record<number, string> = { 400: '검색어 또는 페이지를 확인하세요.', 429: '검색 작업이 진행 중입니다. 잠시 후 다시 시도하세요.', 502: '원격 검색 서버에 연결하지 못했습니다.', 504: '검색 시간이 초과되었습니다. 다시 시도하세요.' }
      throw new Error(message[response.status] || `검색 실패 (HTTP ${response.status})`)
    }
    result.value = await response.json()
  } catch (e) { error.value = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.' }
  finally { busy.value = false }
  if (!error.value && !fresh) await scrollToSearchResults(() => resultsStart.value)
}
</script>
<template>
  <section>
    <h2>작품 검색</h2>
    <form @submit.prevent="submit">
      <div class="search-form">
      <label>검색어<UInput v-model="query" maxlength="512" placeholder="제목·일반 검색어 또는 고급 검색식" type="search" /></label>
      <label>언어<CompareSelect v-model="language"><option value="">전체 언어</option><option v-for="[value, label] in languages" :key="value" :value="value">{{ label }}</option></CompareSelect></label>
      <label class="check"><UCheckbox v-model="popular" />인기순</label>
      <label class="check"><UCheckbox v-model="excludeGayTags" />게이 태그 제외</label>
      <UButton type="submit" class="primary-button" icon="i-lucide-search" :loading="busy" :disabled="busy">검색</UButton>
      <UButton type="button" variant="outline" color="neutral" class="secondary-button" @click="reset" :disabled="busy">조건 초기화</UButton>
      </div>
      <fieldset class="work-types">
        <legend>작품 종류</legend>
        <UButton :variant="(!types.length) ? 'solid' : 'outline'" :color="(!types.length) ? 'primary' : 'neutral'" type="button" :aria-pressed="!types.length" @click="types = []">전체 종류</UButton>
        <UButton :variant="types.includes(kind) ? 'solid' : 'outline'" :color="kindColor(kind)" v-for="(label, kind) in kinds" :key="kind" type="button" :aria-pressed="types.includes(kind)" @click="toggleType(kind)">{{ label }}</UButton>
      </fieldset>
      <div class="advanced" :class="{ classic: !compact }">
        <UCollapsible :open="advancedOpen" @update:open="setAdvancedOpen">
          <UButton type="button" variant="ghost" color="neutral" block class="group advanced-toggle" trailing-icon="i-lucide-chevron-down"
            :ui="{ base: 'justify-between px-0', trailingIcon: 'transition-transform duration-200 group-data-[state=open]:rotate-180' }"><span>상세 조건<span v-if="!compact"> · 작가 / 그룹 / 시리즈 / 캐릭터 / 태그</span><span v-else-if="applied.length" class="filter-count">{{ applied.length }}</span></span></UButton>
          <template #content>
          <div v-if="compact" class="filter-types" role="group" aria-label="조건 종류">
            <UButton variant="ghost" color="neutral" v-for="field in fields" :key="field.key" type="button" class="secondary-button"
              :aria-expanded="activeField === field.key" @click="openField(field.key)">{{ field.label }}</UButton>
          </div>
          <div :class="{ 'filter-grid': !compact }">
            <FilterField v-for="field in fields" v-show="!compact || activeField === field.key" ref="fieldRefs"
              :key="formVersion + '-' + field.key" v-model="filters[field.key]" :field="field.key" :label="field.label" :inline-chips="!compact" />
          </div>
        </template>
        </UCollapsible>
        <div v-if="compact && applied.length" class="applied-filters" role="group" aria-label="선택한 상세 조건">
          <UButton variant="outline" color="neutral" v-for="chip in applied" :key="chip.key + ':' + chip.term" type="button" :class="{ excluded: chip.excluded }"
            :aria-label="(chip.excluded ? '제외 ' : '') + chip.label + ' ' + chip.name + ' 삭제'"
            @click="filters[chip.key] = filters[chip.key].filter(term => term !== chip.term)">
            <span>{{ chip.excluded ? '제외 · ' : '' }}{{ chip.label }}</span> {{ chip.name }} <span aria-hidden="true">×</span>
          </UButton>
        </div>
      </div>
    </form>
    <component :is="compact ? 'details' : 'div'" :class="{ 'search-help': compact }">
      <summary v-if="compact">검색 도움말 · 적용 검색식</summary>
      <p class="help">조건 앞에 -를 붙이면 제외합니다. 쉼표로 여러 조건을 추가할 수 있습니다. 태그는 female: 또는 male:도 입력할 수 있습니다.</p>
      <p class="help">적용 검색식 <code>{{ preview || '전체 작품' }}<template v-if="excludeGayTags"> · 게이 태그 제외</template></code></p>
    </component>
    <form class="id-search" @submit.prevent="lookup"><label>작품 ID로 찾기<UInput v-model="comicId" inputmode="numeric" pattern="[0-9]+" placeholder="예: 1234567" /></label><UButton type="submit" variant="outline" color="neutral" :disabled="busy || !comicId">ID 조회</UButton></form>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="result" aria-live="polite">
      <div ref="resultsStart" class="result-toolbar"><p>{{ result.total.toLocaleString() }}개 · {{ result.page }}페이지</p><ViewToggle v-model="layout" label="검색 결과 표시 방식" /></div>
      <p v-if="result.failed_ids.length" role="status">일부 작품 정보를 불러오지 못했습니다 ({{ result.failed_ids.length }}개). 다시 검색해 주세요.</p>
      <p v-if="!result.total">검색 결과가 없습니다.</p>
      <div class="results" :class="{ 'results-list': layout === 'list' }">
        <GalleryCard v-for="item in result.items" :key="item.id" :layout="layout" :title="item.title" :cover="localCovers?.get(`hitomi:${item.id}`) ?? `/api/galleries/${item.id}/cover`" :downloaded="downloadedIds.has(item.id)" :id="item.id" :info="`${item.language || '언어 정보 없음'} · ${item.pages}페이지`" :kind="item.kind" :badge="readBadge(item.id,item.pages,true)" :artists="item.artists" :groups="item.groups" :tags="item.tags" :date="uploadDate(item.date) ? `업로드 ${uploadDate(item.date)}` : ''" @detail="emit('detail', item)">
          <template #notice><p v-if="notices[item.id]" role="status">{{ notices[item.id] }}</p></template>
          <UButton class="read-button" @click="emit('read', item)" :disabled="!item.pages">{{ record(item.id,true) ? '이어 읽기' : '읽기' }}</UButton><UButton variant="outline" color="neutral" :disabled="downloading !== null || downloadedIds.has(item.id) || pending.has(item.id)" @click="download(item.id)">{{ downloadedIds.has(item.id) ? (layout === 'list' ? '완료' : '다운로드 완료') : downloading === item.id ? '등록 중…' : pending.has(item.id) ? (layout === 'list' ? '받는 중' : '다운로드 중') : (layout === 'list' ? '받기' : '다운로드') }}</UButton><UButton variant="outline" color="neutral" @click="markReading(item.id,readState(item.id,item.pages,true) !== 'read',true).catch(() => notices[item.id] = '상태 변경 실패')">{{ readState(item.id,item.pages,true) === 'read' ? (layout === 'list' ? '안 읽음' : '안 읽음으로 변경') : (layout === 'list' ? '읽음' : '읽음으로 표시') }}</UButton>
        </GalleryCard>
      </div>
      <nav class="pager" aria-label="검색 결과 페이지"><UPagination :page="result.page" :total="result.total" :items-per-page="result.page_size" :sibling-count="1" :disabled="busy" show-edges color="neutral" active-color="primary" :ui="{ first: 'max-sm:hidden', last: 'max-sm:hidden' }" @update:page="search" /></nav>
    </div>
    <UModal title="작품 상세" :open="!!selected" :ui="{ content: 'sm:max-w-3xl' }" @update:open="open => { if (!open) emit('closeDetail') }">
        <template #body><div class="gallery-detail">
          <template v-if="displayedDetail"><GalleryDetail :refreshable="infoCacheMode === 'week'" :refreshing="refreshing" @refresh="refreshDetail" :title="displayedDetail.title" :cover="localCovers?.get(`hitomi:${displayedDetail.id}`) ?? `/api/galleries/${displayedDetail.id}/cover`" :kind="displayedDetail.kind" :badge="readBadge(displayedDetail.id,displayedDetail.pages,true)" :info="`${displayedDetail.language || '언어 정보 없음'} · ${displayedDetail.pages}페이지`" :id="displayedDetail.id" :fields="[{name:'작가',values:displayedDetail.artists},{name:'그룹',values:displayedDetail.groups},{name:'시리즈',values:displayedDetail.series},{name:'캐릭터',values:displayedDetail.characters}]" :tags="displayedDetail.tags" :date="uploadDate(displayedDetail.date) ? `업로드 ${uploadDate(displayedDetail.date)}` : ''"><template #actions><UButton v-if="!readerDetail" class="read-button" :disabled="!displayedDetail.pages" @click="readDetail">{{ record(displayedDetail.id,true) ? '이어 읽기' : '읽기' }}</UButton><UButton variant="outline" color="neutral" :disabled="downloading !== null || downloadedIds.has(displayedDetail.id) || pending.has(displayedDetail.id)" @click="download(displayedDetail.id)">{{ downloadedIds.has(displayedDetail.id) ? '다운로드 완료' : pending.has(displayedDetail.id) ? '다운로드 중' : '다운로드' }}</UButton></template><p v-if="notices[displayedDetail.id]" role="status">{{ notices[displayedDetail.id] }}</p></GalleryDetail></template>
    
        </div></template>
    </UModal>
    <p class="help">다운로드는 서버에 저장됩니다. 진행 상황은 다운로드 탭에서 확인하세요.</p>
  </section>
</template>
<style scoped>
.search-form{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.search-form>label:first-child{flex:1;min-width:220px}.check{display:flex;align-items:center;gap:8px;height:var(--control-h,2.25rem)}.search-form>button{justify-content:center}.help{font-size:14px;color:var(--muted);line-height:1.6}h3{font-size:17px;margin:10px 0}
</style>


<style scoped>.advanced{border:0;padding:0 12px;border-radius:12px;margin-top:16px;background:var(--surface)}
.search-help summary{cursor:pointer;min-height:44px;line-height:44px}
.filter-count{margin-inline-start:4px;padding:2px 8px;border-radius:999px;color:var(--accent);background:var(--selected);font-size:12px}
.filter-types,.applied-filters{display:flex;flex-wrap:wrap;gap:8px}
.filter-types{padding-bottom:12px}


.advanced :deep(.filter-field){margin-bottom:12px}
.advanced.classic{padding:12px}

.filter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:16px 0}
.filter-grid :deep(.filter-field){margin-bottom:0}
@media(max-width:600px){.filter-grid{grid-template-columns:1fr}}
.applied-filters{padding:10px 0}
.applied-filters button{max-width:100%;overflow-wrap:anywhere}

.applied-filters .excluded{background:#ffaaaa18}
.applied-filters .excluded span{color:var(--danger)}
.search-help{margin-top:6px;color:var(--muted);font-size:13px}
.search-help .help{margin:4px 0 10px}
.id-search{display:flex;gap:10px;align-items:end;margin:16px 0}.id-search label{flex:1}.search-form>label{min-width:130px}.search-form>label:first-child{min-width:200px}@media(max-width:600px){.search-form>label:first-child{flex-basis:100%}.search-form>button{flex-basis:100%}}</style>


<style scoped>
.result-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.work-types{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:8px 0 0;border:0;min-width:0}.work-types legend{font-size:14px}.metadata-values{display:flex;flex-wrap:wrap;gap:4px}.kind{font-size:12px}@media(max-width:520px){.result-toolbar{align-items:start;font-size:13px}.results-list .tags{max-height:120px;overflow:auto}}
</style>

