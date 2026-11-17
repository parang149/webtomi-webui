<script setup lang="ts">
// Upstream request counts from the server, for checking how much reaches Hitomi / E-Hentai.
import { computed, onMounted, ref } from 'vue'
import { infoCacheMode, loadInfoCacheMode, saveInfoCacheMode, type InfoCacheMode } from './info-cache'
type Counts = { upstream: number; rate_limited: number; server_error: number; other_error: number; saved: number }
type Row = { site: 'hitomi' | 'ehentai'; kind: 'search' | 'info' | 'cover' | 'page' | 'other'; hour: Counts; total: Counts }
const rows = ref<Row[]>([]), error = ref(''), busy = ref(false)
const period = ref<'hour' | 'total'>('hour')
const sites = { hitomi: 'Hitomi', ehentai: 'E-Hentai' }
const kinds = { search: '검색', info: '작품 정보', cover: '표지', page: '페이지', other: '기타' }
const shown = computed(() => rows.value.map(row => ({ ...row, counts: row[period.value] })))
const failures = (counts: Counts) => counts.rate_limited + counts.server_error + counts.other_error
async function load() {
  busy.value = true; error.value = ''
  try {
    const response = await fetch('/api/settings/requests')
    if (!response.ok) throw new Error()
    rows.value = await response.json()
  } catch { error.value = '요청 기록을 불러오지 못했습니다.' }
  finally { busy.value = false }
}
const modeMessage = ref('')
async function changeMode(mode: InfoCacheMode) {
  modeMessage.value = ''
  try { await saveInfoCacheMode(mode); modeMessage.value = '저장했습니다. 다음 요청부터 적용됩니다.' }
  catch { modeMessage.value = '저장하지 못했습니다.' }
}
onMounted(() => { void load(); void loadInfoCacheMode() })
</script>

<template>
  <section class="request-stats">
    <div class="info-mode">
      <h3>작품 정보 저장</h3>
      <UTabs :model-value="infoCacheMode" :items="[{ label: '현행 (메모리 5분)', value: 'current' }, { label: '7일 저장', value: 'week' }]" :content="false" size="xs" @update:model-value="value => changeMode(value as InfoCacheMode)" />
      <p class="stats-help">7일 저장은 작품 정보(제목·태그·페이지 목록)를 서버에 보관하고, 7일이 지난 정보는 읽기·검색·상세 보기 때 다시 받습니다. 상세창에 정보 새로고침 버튼이 나타납니다.</p>
      <p v-if="modeMessage" role="status" class="stats-help">{{ modeMessage }}</p>
    </div>
    <div class="stats-head">
      <h3>외부 요청</h3>
      <UTabs v-model="period" :items="[{ label: '최근 1시간', value: 'hour' }, { label: '서버 시작 후', value: 'total' }]" :content="false" size="xs" />
      <UButton variant="soft" color="neutral" size="sm" icon="i-lucide-refresh-cw" :loading="busy" @click="load">새로고침</UButton>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!rows.length" class="stats-help">아직 기록이 없습니다.</p>
    <div v-else class="stats-table">
      <table>
        <thead><tr><th>사이트</th><th>종류</th><th>외부 요청</th><th>저장분 사용</th><th>실패</th></tr></thead>
        <tbody>
          <tr v-for="row in shown" :key="`${row.site}-${row.kind}`">
            <td>{{ sites[row.site] }}</td><td>{{ kinds[row.kind] }}</td><td>{{ row.counts.upstream }}</td><td>{{ row.counts.saved }}</td>
            <td :title="`429 ${row.counts.rate_limited} · 5xx ${row.counts.server_error} · 기타 ${row.counts.other_error}`">{{ failures(row.counts) }}<template v-if="row.counts.rate_limited"> (429 {{ row.counts.rate_limited }})</template></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="stats-help">저장분 사용은 서버에 저장된 표지나 동시에 들어온 같은 요청을 나눠 써서 외부로 보내지 않은 횟수입니다. 서버를 다시 시작하면 초기화됩니다.</p>
  </section>
</template>

<style scoped>
.request-stats{display:grid;gap:10px;margin-top:20px}
.info-mode{display:grid;gap:8px;margin-bottom:12px}.info-mode h3{margin:0}
.stats-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.stats-head h3{margin:0 auto 0 0}
.stats-table{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}
th,td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--ui-border)}
th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}
th{color:var(--ui-text-muted);font-weight:500}
.stats-help{font-size:12px;color:var(--ui-text-muted)}
</style>
