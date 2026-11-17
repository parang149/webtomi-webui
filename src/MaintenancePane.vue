<script setup lang="ts">
import CompareSelect from "./OptionSelect"
import { computed, onMounted, ref } from 'vue'
import { organizeJob } from './organize-job'
import CopyValue from './CopyValue.vue'

const props = defineProps<{ logs?: boolean }>()
const emit = defineEmits<{ organize: [string, boolean, number] }>()
type PreviewItem = { source: string; folder: string; skip: string | null }
type Preview = { token: string; eligible: number; skipped: number; old_folders: number; root: string; items: PreviewItem[] }
type Log = { id: number; time: string; kind: string; status: string; message: string; source: string; destination: string }
const preview = ref<Preview>()
const previewQuery = ref('')
const previewFilter = ref('all')
const previewPage = ref(0)
const previewPageSize = 50
const filteredItems = computed(() => {
  const search = previewQuery.value.trim().toLowerCase()
  return (preview.value?.items ?? []).filter(item =>
    (previewFilter.value === 'all' || (previewFilter.value === 'skipped' ? !!item.skip : !item.skip))
    && item.source.toLowerCase().includes(search))
})
const pageStart = computed(() => previewPage.value * previewPageSize)
const pageItems = computed(() => filteredItems.value.slice(pageStart.value, pageStart.value + previewPageSize))

function previewPath(root: string, ...parts: string[]) {
  const separator = root.includes('\\') ? '\\' : '/'
  return root.replace(/[\\/]+$/, '') + separator + parts.join('/').split('/').join(separator)
}
const fileName = (source: string) => source.slice(source.lastIndexOf('/') + 1)
function logSubject(entry: Log) {
  if (entry.kind !== '정리' && entry.kind !== '다운로드') return ''
  if (entry.kind === '다운로드' && entry.status === '오류') return ''
  return fileName(entry.source.split('\\').join('/'))
}
const organizing = computed(() => organizeJob.value?.running ?? false)
const entries = ref<Log[]>([])
const filters = ref({ q: '', kind: '', status: '', date: '' })
const page = ref(0)
const busy = ref(false)
const error = ref('')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await task() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '작업을 처리하지 못했습니다.' }
  finally { busy.value = false }
}
function inspect() {
  void run(async () => {
    preview.value = undefined
    previewPage.value = 0
    previewQuery.value = ''
    previewFilter.value = 'all'
    preview.value = await request('/api/settings/organize')
  })
}
function organize(trial: boolean) {
  const plan = preview.value
  if (!plan || !window.confirm(trial ? '최대 10개 작품을 실제로 이동할까요?' : `${plan.eligible}개 작품을 이동하고 비어 있는 기존 구간 폴더를 제거할까요?`)) return
  emit('organize', plan.token, trial, trial ? Math.min(10, plan.eligible) : plan.eligible + plan.skipped)
}
function loadLogs(next = 0) {
  void run(async () => {
    const query = new URLSearchParams({ ...filters.value, page: String(next) })
    entries.value = await request(`/api/settings/logs?${query}`)
    page.value = next
  })
}
onMounted(() => { if (props.logs) loadLogs() })
</script>

<template>
  <section class="maintenance">
    <template v-if="logs">
      <form class="actions" @submit.prevent="loadLogs()">
        <label>검색어 <UInput v-model="filters.q" type="search" maxlength="200" placeholder="메시지, 작품 ID, 경로" /></label>
        <label>작업 <CompareSelect v-model="filters.kind"><option value="">전체</option><option>정리</option><option>다운로드</option><option>설정</option><option>서버</option><option>라이브러리 API</option></CompareSelect></label>
        <label>결과 <CompareSelect v-model="filters.status"><option value="">전체</option><option>완료</option><option>오류</option><option>건너뜀</option><option>진행 중</option></CompareSelect></label>
        <label>날짜 (UTC) <UInput v-model="filters.date" type="date" /></label>
        <UButton type="submit" variant="outline" color="neutral" :disabled="busy">검색</UButton>
      </form>
      <p v-if="!entries.length && !busy && !error">표시할 로그가 없습니다.</p>
      <ul v-else-if="entries.length" class="log-list">
        <li v-for="entry in entries" :key="entry.id">
          <details>
            <summary class="log-line">
              <span class="log-toggle" aria-hidden="true">›</span>
              <time class="log-time">{{ entry.time }} UTC</time>
              <span class="log-kind">{{ entry.kind }}</span>
              <span class="log-status" :data-status="entry.status">{{ entry.status }}</span>
              <span class="log-message">
                <strong v-if="logSubject(entry)" class="log-subject">{{ logSubject(entry) }}</strong>
                <span v-if="!logSubject(entry) || entry.status !== '완료'" :class="{ 'log-reason': logSubject(entry) }">{{ entry.message }}</span>
              </span>
            </summary>
            <dl class="log-detail">
              <template v-if="entry.source">
                <dt>{{ entry.kind === '정리' ? '원본 경로' : '관련 정보' }}</dt>
                <dd v-if="entry.kind === '서버' || entry.status === '오류' && entry.kind === '다운로드'" class="log-diagnostics">{{ entry.source }}</dd>
                <dd v-else><CopyValue :value="entry.source"><code>{{ entry.source }}</code></CopyValue></dd>
              </template>
              <template v-if="!entry.source && !entry.destination">
                <dt>메시지</dt><dd>{{ entry.message }}</dd>
              </template>
              <template v-if="entry.destination">
                <dt>목적지 경로</dt>
                <dd><CopyValue :value="entry.destination"><code>{{ entry.destination }}</code></CopyValue></dd>
              </template>
            </dl>
          </details>
        </li>
      </ul>
      <div class="actions" v-if="page || entries.length === 50">
        <UButton variant="outline" color="neutral" type="button" :disabled="busy || page === 0" @click="loadLogs(page - 1)">이전</UButton>
        <span>{{ page + 1 }}페이지</span>
        <UButton variant="outline" color="neutral" type="button" :disabled="busy || entries.length < 50" @click="loadLogs(page + 1)">다음</UButton>
      </div>
    </template>
    <template v-else>
      <h3>ID 구간별 정리</h3>
      <p>Hitomi 작품을 ID 50,000번 단위로 정리합니다. 기존 1,000번 구간의 작품도 옮기고 비어 있는 구간 폴더를 제거합니다. 이동 후 데스크톱 앱을 다시 스캔하고 스냅샷을 갱신하세요.</p>
      <UButton variant="outline" color="neutral" type="button" :disabled="busy || organizing" @click="inspect">정리 미리보기</UButton>
      <div v-if="preview">
        <p>이동 {{ preview.eligible }}개 · 건너뜀 {{ preview.skipped }}개</p>
        <div class="actions">
          <label>파일명 또는 작품 ID <UInput v-model="previewQuery" type="search" @input="previewPage = 0" /></label>
          <label>상태 <CompareSelect v-model="previewFilter" @change="previewPage = 0">
            <option value="all">전체</option><option value="eligible">이동 대상</option><option value="skipped">건너뜀</option>
          </CompareSelect></label>
        </div>
        <div v-if="pageItems.length" class="preview-table">
          <table>
            <thead><tr><th scope="col">작품 파일명</th><th scope="col">이동할 구간 폴더</th><th scope="col">상태</th></tr></thead>
            <tbody>
              <tr v-for="item in pageItems" :key="item.source">
                <td><details>
                  <summary>{{ fileName(item.source) }}</summary>
                  <div>원본 <code>{{ previewPath(preview.root, item.source) }}</code></div>
                  <div v-if="item.folder">목적지 <code>{{ previewPath(preview.root, item.folder, fileName(item.source)) }}</code></div>
                </details></td>
                <td>{{ item.folder || '—' }}</td>
                <td>{{ item.skip || '이동 대상' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else>표시할 항목이 없습니다.</p>
        <div v-if="filteredItems.length" class="actions preview-pagination">
          <UButton variant="outline" color="neutral" type="button" :disabled="previewPage === 0" @click="previewPage--">이전</UButton>
          <span>{{ pageStart + 1 }}–{{ pageStart + pageItems.length }} / {{ filteredItems.length }}개</span>
          <UButton variant="outline" color="neutral" type="button" :disabled="pageStart + pageItems.length >= filteredItems.length" @click="previewPage++">다음</UButton>
        </div>
        <p>검색과 필터는 목록에만 적용됩니다.</p>
        <div class="actions">
          <UButton variant="outline" color="neutral" type="button" :disabled="busy || organizing || !preview.eligible" @click="organize(true)">최대 10개 시험 이동</UButton>
          <UButton variant="outline" color="neutral" type="button" :disabled="busy || organizing || (!preview.eligible && !preview.old_folders)" @click="organize(false)">{{ preview.eligible ? `이동 대상 ${preview.eligible}개 전체 정리` : '빈 구간 폴더 정리' }}</UButton>
        </div>
      </div>
    </template>
    <p v-if="busy" role="status">불러오는 중입니다.</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.maintenance { margin-top: 1rem; overflow-wrap: anywhere; }
.maintenance li { margin-block: .5rem; }
.maintenance li p { margin: .2rem 0; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; }
.preview-table { margin-top: .75rem; overflow-x: auto; }
.preview-table table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.preview-table th, .preview-table td { padding: .6rem .5rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.preview-table th:first-child { width: 52%; }
.preview-table summary { cursor: pointer; }
.preview-table details div { margin-top: .35rem; color: var(--muted); }
.preview-pagination { margin-top: .75rem; }
.log-list { list-style: none; padding: 0; margin: .85rem 0; }
.log-list li { margin: 0; border-bottom: 1px solid var(--line); }
.log-line { display: grid; grid-template-columns: .75rem max-content 3.8rem 4rem minmax(0, 1fr); gap: .6rem; align-items: center; padding: .55rem .4rem; cursor: pointer; list-style: none; }
.log-line::-webkit-details-marker { display: none; }
.log-line:hover, .log-list details[open] { background: var(--surface); }
.log-toggle { color: var(--muted); }
.log-list details[open] .log-toggle { transform: rotate(90deg); }
.log-time, .log-kind { color: var(--muted); font-size: .8rem; }
.log-status { font-size: .8rem; }
.log-status[data-status="완료"] { color: #86d9ad; }
.log-status[data-status="오류"] { color: #ff9a97; }
.log-status[data-status="건너뜀"] { color: #e4c580; }
.log-message { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-subject { font-weight: 600; }
.log-reason { margin-inline-start: .5rem; color: var(--muted); }
.log-list details[open] .log-message { white-space: normal; word-break: keep-all; overflow-wrap: anywhere; line-height: 1.5; }
.log-detail { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: .4rem .8rem; margin: 0; padding: .5rem 1.75rem 1rem; }
.log-detail dt { color: var(--muted); }
.log-detail dd { margin: 0; min-width: 0; }
.log-detail code { white-space: normal; overflow-wrap: anywhere; }
.log-diagnostics { white-space: pre-line; word-break: keep-all; overflow-wrap: anywhere; line-height: 1.55; }
@media (max-width: 600px) {
  .log-line { grid-template-columns: .75rem max-content minmax(0, 1fr) max-content; gap: .25rem .45rem; }
  .log-message { grid-column: 2 / -1; }
}
</style>
