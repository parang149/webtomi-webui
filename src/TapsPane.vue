<script setup lang="ts">
// TAPS: 확장 관리 화면 보관함 탭과 같은 배치 (개수 칸·상태 탭·검색/출처/정렬·선택·⋮ 메뉴·50개씩 쪽)
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editTaps, emptyTapsTrash, loadTaps, type VaultItem } from './vault-client'
import { codeFields, detailRows } from './code'

type Fields = Parameters<typeof editTaps>[1]
const PER_PAGE = 50
const STATUS: Record<string, string> = { unread: '미확인', reviewing: '확인 중', done: '완료' }
const SORTS = [{ label: '최신순', value: 'newest' }, { label: '저장 순서', value: 'order' }, { label: '도메인', value: 'domain' }, { label: '제목', value: 'title' }, { label: '최근 확인', value: 'recent' }]
const SOURCES = [{ label: '전체', value: 'all' }, { label: 'supjav', value: 'supjav' }, { label: '품번 없음', value: 'nocode' }, { label: 'nyaa 기록만', value: 'record' }]

const items = ref<VaultItem[]>([])
const view = ref<'active' | 'reviewing' | 'done' | 'all' | 'trash'>('active')
const source = ref<'all' | 'supjav' | 'nocode' | 'record'>('all')
const sort = ref(localStorage.getItem('taps-sort') || 'newest')
const search = ref('')
const page = ref(1)
const busy = ref(false)
const error = ref('')
const saving = ref(new Set<string>())
const gridView = ref(localStorage.getItem('taps-layout') === 'grid')
watch(gridView, v => localStorage.setItem('taps-layout', v ? 'grid' : 'list'))
watch(sort, v => localStorage.setItem('taps-sort', v))

const domain = (url: string) => { try { return new URL(url).hostname } catch { return '' } }
const isSupjav = (i: VaultItem) => i.tags?.includes('supjav') || i.url.startsWith('https://supjav.com/')
const listed = computed(() => items.value.filter(i => source.value === 'record' ? i.recordOnly : !i.recordOnly && (source.value === 'all' || (source.value === 'nocode' ? !i.codeKey : isSupjav(i)))))
const counts = computed(() => {
  const c = { total: 0, unread: 0, reviewing: 0, done: 0, trash: 0 }
  for (const i of items.value) {
    if (i.recordOnly) continue
    if (i.deletedAt !== null) { c.trash++; continue }
    c.total++; c[i.status]++
  }
  return c
})
const tabs = computed(() => [
  { label: '미완료', value: 'active' }, { label: `확인 중${counts.value.reviewing ? ` ${counts.value.reviewing}` : ''}`, value: 'reviewing' }, { label: `완료 ${counts.value.done}`, value: 'done' },
  { label: '전체', value: 'all' }, { label: `휴지통${counts.value.trash ? ` ${counts.value.trash}` : ''}`, value: 'trash' },
])
const visible = computed(() => {
  const q = search.value.trim().toLocaleLowerCase()
  const list = listed.value
    .filter(i => view.value === 'trash' ? i.deletedAt !== null : i.deletedAt === null && (view.value === 'all' || (view.value === 'active' ? i.status !== 'done' : i.status === view.value)))
    .filter(i => !q || `${i.title}\n${i.url}\n${i.note}\n${i.code || ''}`.toLocaleLowerCase().includes(q))
  const by: Record<string, (a: VaultItem, b: VaultItem) => number> = {
    newest: (a, b) => b.createdAt - a.createdAt, order: (a, b) => a.createdAt - b.createdAt,
    domain: (a, b) => domain(a.url).localeCompare(domain(b.url)), title: (a, b) => a.title.localeCompare(b.title),
    recent: (a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0),
  }
  return list.sort((a, b) => (by[sort.value] || by.newest)(a, b) || b.id.localeCompare(a.id))
})
const pages = computed(() => Math.max(1, Math.ceil(visible.value.length / PER_PAGE)))
const shown = computed(() => visible.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
watch([view, source, sort, search], () => { page.value = 1; selecting.value = false; selected.value = new Set() })
watch(pages, n => { if (page.value > n) page.value = n })

let loading: Promise<void> | null = null, again = false
async function refresh() {
  if (loading) { again = true; return }
  busy.value = true
  loading = (async () => {
    try { items.value = await loadTaps(); error.value = '' }
    catch (e) { error.value = `목록을 불러오지 못했습니다. ${e instanceof Error ? e.message : e}` }
    finally { busy.value = false; loading = null; if (again) { again = false; void refresh() } }
  })()
}

async function change(item: VaultItem, fields: Fields) {
  saving.value = new Set(saving.value).add(item.id)
  try {
    const next = await editTaps(item.id, fields)
    items.value = items.value.map(i => i.id === item.id ? next : i).filter(i => i)
    return true
  } catch (e) { error.value = `바꾸지 못했습니다. ${e instanceof Error ? e.message : e}`; return false }
  finally { const s = new Set(saving.value); s.delete(item.id); saving.value = s }
}
const ACTIONS: Record<string, Fields> = {
  done: { status: 'done', completedAt: Date.now() }, unread: { status: 'unread', completedAt: null },
  delete: { deletedAt: Date.now() }, restore: { deletedAt: null },
}
const act = (item: VaultItem, kind: keyof typeof ACTIONS) => change(item, { ...ACTIONS[kind], ...(kind === 'done' ? { completedAt: Date.now() } : kind === 'delete' ? { deletedAt: Date.now() } : {}) })
const open = (item: VaultItem) => { if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer') }

// 선택해서 한꺼번에 바꾸기
const selecting = ref(false)
const selected = ref(new Set<string>())
const toggle = (id: string) => { const s = new Set(selected.value); s.has(id) ? s.delete(id) : s.add(id); selected.value = s }
const allOnPage = computed({
  get: () => shown.value.length > 0 && shown.value.every(i => selected.value.has(i.id)),
  set: v => { const s = new Set(selected.value); for (const i of shown.value) v ? s.add(i.id) : s.delete(i.id); selected.value = s },
})
async function bulk(kind: keyof typeof ACTIONS) {
  busy.value = true
  try { for (const item of items.value.filter(i => selected.value.has(i.id))) await act(item, kind) }
  finally { busy.value = false; selected.value = new Set(); selecting.value = false }
}

// 휴지통 비우기
const trashConfirm = ref(false)
async function emptyTrash() {
  trashConfirm.value = false
  busy.value = true
  try { await emptyTapsTrash(); busy.value = false; await refresh() }
  catch (e) { error.value = `휴지통을 비우지 못했습니다. ${e instanceof Error ? e.message : e}`; busy.value = false }
}

// 상세 보기 + 품번 직접 입력
const detail = ref<VaultItem | null>(null)
const codeInput = ref('')
const detailOpen = computed({ get: () => !!detail.value, set: v => { if (!v) detail.value = null } })
const showDetail = (item: VaultItem) => { detail.value = item; codeInput.value = item.codeManual || '' }
async function saveCode() {
  const item = detail.value
  if (!item) return
  await change(item, codeFields(item.title, codeInput.value))
  detail.value = items.value.find(i => i.id === item.id) || null // 다른 항목에 합쳐졌으면 닫음(목록은 SSE로 갱신)
}

// 메모 / 태그
const editing = ref<VaultItem | null>(null)
const note = ref('')
const tagText = ref('')
const editOpen = computed({ get: () => !!editing.value, set: v => { if (!v) editing.value = null } })
const showEdit = (item: VaultItem) => { editing.value = item; note.value = item.note || ''; tagText.value = (item.tags || []).join(', ') }
async function saveEdit() {
  const item = editing.value
  if (!item) return
  const tags = [...new Set(tagText.value.split(',').map(t => t.trim()).filter(Boolean))]
  if (await change(item, { note: note.value, tags })) editing.value = null
}

function menu(item: VaultItem) {
  const info = [{ label: '상세 보기', icon: 'i-lucide-info', onSelect: () => showDetail(item) }]
  if (item.deletedAt !== null) return [info, [{ label: '휴지통에서 복원', icon: 'i-lucide-rotate-ccw', onSelect: () => act(item, 'restore') }]]
  return [info,
    [{ label: '새 탭으로 열기', icon: 'i-lucide-external-link', disabled: !item.url, onSelect: () => open(item) }],
    [{ label: '완료', icon: 'i-lucide-check', disabled: item.status === 'done', onSelect: () => act(item, 'done') },
     { label: '미확인으로', icon: 'i-lucide-circle', disabled: item.status === 'unread', onSelect: () => act(item, 'unread') },
     { label: '메모 / 태그', icon: 'i-lucide-pencil', onSelect: () => showEdit(item) }],
    [{ label: '휴지통으로', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => act(item, 'delete') }]]
}
const sub = (i: VaultItem) => [STATUS[i.status], domain(i.url), i.supjav?.date, i.note ? '메모' : '', i.nyaa?.downloaded?.count ? '받음' : ''].filter(Boolean).join(' · ')

let events: EventSource | null = null
onMounted(() => {
  void refresh()
  events = new EventSource('/api/taps/events')
  events.addEventListener('vault', () => void refresh())
})
onBeforeUnmount(() => events?.close())
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="grid grid-cols-5 gap-2">
      <div v-for="[key, label] in [['total', '보관함 전체'], ['unread', '미확인'], ['reviewing', '확인 중'], ['done', '완료'], ['trash', '휴지통']]" :key="key" class="rounded-lg bg-elevated px-2 py-2 sm:px-3">
        <strong class="block text-base sm:text-lg">{{ counts[key as keyof typeof counts].toLocaleString() }}</strong><span class="text-xs text-muted">{{ label }}</span>
      </div>
    </div>
    <UTabs v-model="view" :items="tabs" :content="false" size="md" class="w-full" />
    <div class="flex flex-wrap gap-1.5">
      <UInput v-model="search" size="md" icon="i-lucide-search" placeholder="제목, URL, 메모, 품번 검색" class="min-w-40 flex-1" :maxlength="500" />
      <USelect v-model="source" size="md" :items="SOURCES" class="w-32" aria-label="출처" />
      <USelect v-model="sort" size="md" :items="SORTS" class="w-28" aria-label="정렬" />
      <UButton size="md" color="neutral" variant="soft" icon="i-lucide-refresh-cw" aria-label="새로고침" :disabled="busy" @click="refresh" />
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <UButton size="sm" color="neutral" :variant="selecting ? 'solid' : 'soft'" icon="i-lucide-list-checks" @click="selecting = !selecting; selected = new Set()">{{ selecting ? `${selected.size}개 선택` : '선택' }}</UButton>
      <template v-if="selecting">
        <UCheckbox v-model="allOnPage" label="이 쪽 전체" />
        <template v-if="view !== 'trash'">
          <UButton size="sm" variant="soft" :disabled="busy || !selected.size" @click="bulk('done')">완료</UButton>
          <UButton size="sm" color="neutral" variant="soft" :disabled="busy || !selected.size" @click="bulk('unread')">미확인</UButton>
          <UButton size="sm" color="error" variant="soft" :disabled="busy || !selected.size" @click="bulk('delete')">휴지통</UButton>
        </template>
        <UButton v-else size="sm" variant="soft" :disabled="busy || !selected.size" @click="bulk('restore')">복원</UButton>
      </template>
      <span class="ml-auto text-xs text-muted">{{ visible.length.toLocaleString() }}개</span>
      <UButton v-if="view === 'trash'" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" :disabled="busy || !counts.trash" @click="trashConfirm = true">휴지통 비우기</UButton>
      <UFieldGroup role="group" aria-label="보기 방식">
        <UButton v-for="v in ([{ grid: false, icon: 'i-lucide-list', label: '목록 보기' }, { grid: true, icon: 'i-lucide-layout-grid', label: '그리드 보기' }] as const)" :key="v.label" size="sm" square
          :icon="v.icon" :aria-label="v.label" :title="v.label" :aria-pressed="gridView === v.grid" :color="gridView === v.grid ? 'primary' : 'neutral'" :variant="gridView === v.grid ? 'solid' : 'outline'" @click="gridView = v.grid" />
      </UFieldGroup>
    </div>

    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
    <p v-if="busy && !items.length" class="py-8 text-center text-muted">불러오는 중…</p>
    <p v-else-if="!items.length" class="py-8 text-center text-muted">아직 보관함 항목이 없습니다. PC 탭 보관함에서 연동을 켜세요.</p>

    <div v-else-if="gridView" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="저장 항목">
      <p v-if="!shown.length" class="col-span-full py-8 text-center text-muted">표시할 항목이 없습니다.</p>
      <div v-for="item in shown" :key="item.id" class="relative flex flex-col overflow-hidden rounded-lg border border-default bg-elevated/40" :class="{ 'opacity-60': item.status === 'done' || item.deletedAt !== null }">
        <button type="button" class="text-left" :title="`${item.title}\n${item.url}`" @click="selecting ? toggle(item.id) : open(item)">
          <img v-if="item.supjav?.thumb" :src="item.supjav.thumb" alt="" loading="lazy" referrerpolicy="no-referrer" class="aspect-[320/216] w-full bg-accented object-cover" />
          <span v-else class="grid aspect-[320/216] w-full place-items-center bg-accented text-muted"><UIcon name="i-lucide-image-off" class="size-6" /></span>
          <span class="line-clamp-2 px-2.5 pt-2 text-sm leading-snug">{{ item.title || '(제목 없음)' }}</span>
        </button>
        <div class="mt-auto flex items-center gap-1.5 px-2.5 pt-1 pb-1.5 text-xs text-muted">
          <UCheckbox v-if="selecting" :model-value="selected.has(item.id)" :aria-label="`${item.title || '제목 없음'} 선택`" @update:model-value="toggle(item.id)" />
          <span class="min-w-0 flex-1 truncate">{{ STATUS[item.status] }}<template v-if="item.supjav?.date"> · {{ item.supjav.date }}</template><template v-if="item.nyaa?.downloaded?.count"> · 받음</template></span>
          <UDropdownMenu :items="menu(item)" :content="{ align: 'end' }">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="항목 메뉴" :disabled="saving.has(item.id)" />
          </UDropdownMenu>
        </div>
      </div>
    </div>
    <ul v-else class="flex flex-col gap-1" aria-label="저장 항목">
      <li v-if="!shown.length" class="py-8 text-center text-muted">표시할 항목이 없습니다.</li>
      <li v-for="item in shown" :key="item.id" class="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-elevated" :class="{ 'opacity-60': item.status === 'done' || item.deletedAt !== null }">
        <UCheckbox v-if="selecting" :model-value="selected.has(item.id)" :aria-label="`${item.title || '제목 없음'} 선택`" @update:model-value="toggle(item.id)" />
        <span class="grid size-7 shrink-0 place-items-center rounded-md bg-accented text-xs font-bold text-toned" aria-hidden="true">{{ (domain(item.url).replace(/^www\./, '').charAt(0) || '#').toUpperCase() }}</span>
        <button type="button" class="min-w-0 flex-1 text-left" :title="`${item.title}\n${item.url}`" @click="selecting ? toggle(item.id) : open(item)">
          <span class="block truncate font-medium">{{ item.title || '(제목 없음)' }}</span>
          <span class="block truncate text-xs text-muted">{{ sub(item) }}</span>
        </button>
        <UDropdownMenu :items="menu(item)" :content="{ align: 'end' }">
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="항목 메뉴" :disabled="saving.has(item.id)" />
        </UDropdownMenu>
      </li>
    </ul>
    <div v-if="pages > 1" class="flex justify-center">
      <UPagination v-model:page="page" :total="visible.length" :items-per-page="PER_PAGE" :sibling-count="1" size="sm" show-edges />
    </div>

    <UModal v-model:open="detailOpen" title="상세 정보" :description="detail?.title || '(제목 없음)'">
      <template #body>
        <div v-if="detail" class="taps-detail">
          <img v-if="detail.supjav?.thumb" :src="detail.supjav.thumb" alt="" referrerpolicy="no-referrer" />
          <a v-if="detail.url" :href="detail.url" target="_blank" rel="noreferrer noopener">{{ detail.url }}</a>
          <dl><template v-for="[k, v] in detailRows(detail)" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
          <form class="flex gap-1.5" @submit.prevent="saveCode">
            <UInput v-model="codeInput" placeholder="품번 직접 입력 (비우면 제목에서 자동)" class="flex-1" />
            <UButton type="submit" size="sm" variant="soft" :loading="saving.has(detail.id)">저장</UButton>
          </form>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="editOpen" title="메모 / 태그" :description="editing?.title || '(제목 없음)'">
      <template #body>
        <form class="flex flex-col gap-3" @submit.prevent="saveEdit">
          <UFormField label="메모"><UTextarea v-model="note" :rows="4" class="w-full" /></UFormField>
          <UFormField label="태그 (쉼표로 구분)"><UInput v-model="tagText" class="w-full" /></UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="editing = null">취소</UButton>
            <UButton type="submit" :loading="!!editing && saving.has(editing.id)">저장</UButton>
          </div>
        </form>
      </template>
    </UModal>
    <UModal v-model:open="trashConfirm" title="휴지통 비우기" :description="`휴지통 항목 ${counts.trash}개를 완전히 지웁니다.`">
      <template #body>
        <p class="text-sm">연동된 모든 PC의 탭 보관함에서도 지워지며 되돌릴 수 없습니다.</p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="trashConfirm = false">취소</UButton>
          <UButton color="error" @click="emptyTrash">완전히 지우기</UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.taps-detail{display:grid;gap:10px;font-size:14px}
.taps-detail img{width:100%;max-height:240px;object-fit:contain;border-radius:8px;background:var(--canvas)}
.taps-detail a{color:var(--ui-primary);overflow-wrap:anywhere}
.taps-detail dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0}
.taps-detail dt{color:var(--muted)}
.taps-detail dd{margin:0;white-space:pre-line;overflow-wrap:anywhere}
</style>
