<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppSelect from './AppSelect.vue'
import ViewToggle from './ViewToggle.vue'
import { useIncremental } from './incremental'
import { editTaps, loadTaps, type VaultItem } from './vault-client'

const items = ref<VaultItem[]>([])
const filter = ref<'active' | 'unread' | 'done' | 'trash' | 'all'>('active')
const query = ref('')
const origin = ref<'all' | 'supjav'>('all')
const isSupjav = (item: VaultItem) => item.tags?.includes('supjav') || item.url.startsWith('https://supjav.com/')
const busy = ref(false)
const error = ref('')
const saving = ref(new Set<string>())
const layout = ref<'grid' | 'list'>(localStorage.getItem('taps-layout') === 'grid' ? 'grid' : 'list')
watch(layout, v => localStorage.setItem('taps-layout', v))

const visible = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  return items.value
    .filter(item => filter.value === 'all' || (filter.value === 'trash' ? item.deletedAt !== null : item.deletedAt === null && (filter.value === 'active' ? item.status !== 'done' : item.status === filter.value)))
    .filter(item => origin.value === 'all' || isSupjav(item))
    .filter(item => !q || `${item.title}\n${item.url}\n${item.note}`.toLocaleLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
})
const { shown, more, sentinel } = useIncremental(() => visible.value, () => [filter.value, origin.value, query.value, layout.value])
const label = (item: VaultItem) => item.deletedAt !== null ? '휴지통' : { unread: '미확인', reviewing: '확인 중', done: '완료' }[item.status]

let loading: Promise<void> | null = null, again = false
async function refresh() {
  if (loading) { again = true; return }
  busy.value = !items.value.length
  loading = (async () => {
    try { items.value = await loadTaps(); error.value = '' }
    catch (e) { error.value = `목록을 불러오지 못했습니다. ${e instanceof Error ? e.message : e}` }
    finally { busy.value = false; loading = null; if (again) { again = false; void refresh() } }
  })()
}

async function change(item: VaultItem, fields: Parameters<typeof editTaps>[1]) {
  saving.value = new Set(saving.value).add(item.id)
  try {
    const next = await editTaps(item.id, fields)
    items.value = items.value.map(i => i.id === next.id ? next : i)
  } catch (e) { error.value = `바꾸지 못했습니다. ${e instanceof Error ? e.message : e}` }
  finally { const s = new Set(saving.value); s.delete(item.id); saving.value = s }
}
const toggleDone = (item: VaultItem) => change(item, item.status === 'done' ? { status: 'unread', completedAt: null } : { status: 'done', completedAt: Date.now() })
const toggleTrash = (item: VaultItem) => change(item, { deletedAt: item.deletedAt === null ? Date.now() : null })

let source: EventSource | null = null
onMounted(() => {
  void refresh()
  source = new EventSource('/api/taps/events')
  source.addEventListener('vault', () => void refresh())
})
onBeforeUnmount(() => source?.close())
</script>

<template>
  <section class="supjav-pane">
    <div class="supjav-controls">
      <label>표시<AppSelect v-model="filter" label="표시" :options="[{ value: 'active', label: '완료 제외' }, { value: 'unread', label: '미확인' }, { value: 'done', label: '완료' }, { value: 'trash', label: '휴지통' }, { value: 'all', label: '전체' }]" /></label>
      <label>출처<AppSelect v-model="origin" label="출처" :options="[{ value: 'all', label: '전체' }, { value: 'supjav', label: 'supjav' }]" /></label>
      <label class="supjav-search">검색<UInput v-model="query" placeholder="제목·주소·메모" /></label>
      <span class="supjav-count">{{ visible.length }}개</span>
      <ViewToggle v-model="layout" label="TAPS 보기 방식" />
    </div>
    <p v-if="error" class="supjav-error" role="alert">{{ error }}</p>
    <p v-if="busy" class="empty">불러오는 중…</p>
    <p v-else-if="!items.length" class="empty">아직 보관함 항목이 없습니다. PC 탭 보관함에서 연동을 켜세요.</p>
    <p v-else-if="!visible.length" class="empty">선택한 조건에 맞는 항목이 없습니다.</p>
    <div :class="layout === 'list' ? 'supjav-list' : 'supjav-grid'">
      <article v-for="item in shown" :key="item.id" :class="{ done: item.status === 'done', trash: item.deletedAt !== null }">
        <a :href="item.url" target="_blank" rel="noreferrer noopener" class="supjav-link">
          <img v-if="layout === 'grid' && item.supjav?.thumb" :src="item.supjav.thumb" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <span v-else-if="layout === 'grid'" class="supjav-nothumb">썸네일 없음</span>
          <span class="supjav-title">{{ item.title }}</span>
        </a>
        <div class="supjav-meta">
          <UBadge size="sm" :color="item.deletedAt !== null ? 'neutral' : item.status === 'done' ? 'success' : 'primary'" variant="soft">{{ label(item) }}</UBadge>
          <span>{{ item.supjav?.date || '' }}</span>
        </div>
        <div class="supjav-actions">
          <UButton size="sm" variant="soft" :color="item.status === 'done' ? 'neutral' : 'primary'" :disabled="saving.has(item.id) || item.deletedAt !== null" @click="toggleDone(item)">{{ item.status === 'done' ? '안 봄' : '완료' }}</UButton>
          <UButton size="sm" variant="ghost" color="neutral" :disabled="saving.has(item.id)" @click="toggleTrash(item)">{{ item.deletedAt === null ? '휴지통' : '복원' }}</UButton>
        </div>
      </article>
    </div>
    <div v-if="more" ref="sentinel" class="load-more" aria-hidden="true" />
  </section>
</template>

<style scoped>
.supjav-controls{display:flex;flex-wrap:wrap;align-items:end;gap:8px 12px;margin-bottom:14px}
.supjav-controls label{display:grid;gap:4px;font-size:13px;color:var(--muted)}
.supjav-search{flex:1 1 12rem}
.supjav-count{font-size:13px;color:var(--muted);margin-left:auto}
.supjav-error{color:var(--ui-error);font-size:14px}
.supjav-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
@media(max-width:480px){.supjav-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}
article{display:flex;flex-direction:column;border-radius:10px;overflow:hidden;background:var(--ui-bg-elevated);border:1px solid var(--ui-border)}
article.done img,article.trash img{opacity:.55}
.supjav-link{display:flex;flex-direction:column;color:inherit;text-decoration:none}
.supjav-link img,.supjav-nothumb{width:100%;aspect-ratio:320/216;object-fit:cover;background:var(--canvas)}
.supjav-nothumb{display:grid;place-items:center;font-size:12px;color:var(--muted)}
.supjav-title{padding:8px 8px 0;font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.supjav-meta{display:flex;align-items:center;gap:6px;padding:6px 8px 0;font-size:12px;color:var(--muted)}
.supjav-actions{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px;margin-top:auto}
.supjav-list{display:flex;flex-direction:column;border:1px solid var(--ui-border);border-radius:10px;overflow:hidden}
.supjav-list article{flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:8px 10px;border:0;border-bottom:1px solid var(--ui-border);border-radius:0}
.supjav-list article:last-child{border-bottom:0}
.supjav-list article.done .supjav-title,.supjav-list article.trash .supjav-title{opacity:.55}
.supjav-list .supjav-link{flex:1 1 14rem;min-width:0}
.supjav-list .supjav-title{padding:0;-webkit-line-clamp:1}
.supjav-list .supjav-meta{padding:0}
.supjav-list .supjav-actions{padding:0;margin:0;display:flex}
</style>
