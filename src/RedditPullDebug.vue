<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import BottomPull from './BottomPull.vue'
import DebugGalleryGrid from './DebugGalleryGrid.vue'
import { debugImage } from './debug-gallery-window'
import { redditDisplayMode as mode } from './reddit-display'
import { loadReddit, redditRequest, redditStatus } from './reddit-client'
const interval = ref(3), savingInterval = ref(false), intervalMessage = ref('')
watch(() => redditStatus.value?.config.request_interval, value => { interval.value = value ?? 3 }, { immediate: true })
onMounted(() => { void loadReddit().catch(e => { intervalMessage.value = String(e) }) })
async function saveInterval() {
  if (savingInterval.value || redditStatus.value?.busy) return
  savingInterval.value = true; intervalMessage.value = ''
  try {
    if (!Number.isFinite(interval.value) || interval.value < 0 || interval.value > 3) throw new Error('0~3초로 입력하세요.')
    const requestedInterval = interval.value
    await loadReddit()
    await redditRequest('status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...redditStatus.value!.config, request_interval: requestedInterval }) })
    await loadReddit(); intervalMessage.value = '저장 완료 · 다음 실제 목록 조회부터 적용됩니다.'
  } catch (e) { intervalMessage.value = String(e) } finally { savingInterval.value = false }
}
const area = ref<InstanceType<typeof BottomPull>>()
const batchSize = computed(() => redditStatus.value?.config.batch_size ?? 30)
const total = ref(100)
const totalInput = computed({
  get: () => total.value,
  set: (value: number | undefined) => { total.value = Math.max(1, Math.min(500, Math.trunc(Number(value) || 1))) },
})
const count = ref(batchSize.value), page = ref(1), rendered = ref(0), calls = ref(0)
const loading = ref(false), refreshing = ref(false), fail = ref(false), failed = ref(false)
const message = ref('표시 방식을 선택해 같은 이미지 목록을 비교하세요.')
const selected = ref<number | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
const pageCount = computed(() => Math.ceil(total.value / batchSize.value))
const offset = computed(() => mode.value === 'pages' ? (page.value - 1) * batchSize.value : 0)
const shownCount = computed(() => mode.value === 'pages' ? Math.min(batchSize.value, total.value - offset.value) : count.value)
const canLoad = computed(() => selected.value === null && mode.value !== 'pages' && !loading.value && !failed.value && count.value < total.value)
const canRefresh = computed(() => selected.value === null && mode.value !== 'pages' && !loading.value && !failed.value)
function cancel() { clearTimeout(timer); timer = undefined; area.value?.interrupt(); loading.value = false; refreshing.value = false; message.value = '취소 완료 · 새 당기기로 재개하세요.' }
function request(action: 'next' | 'refresh' | 'page' = 'next', nextPage = 1) {
  if (loading.value) return
  if (action === 'next' && count.value >= total.value) return
  failed.value = false; calls.value++; loading.value = true; refreshing.value = action === 'refresh'; message.value = '가상 로딩 중…'
  timer = setTimeout(async () => {
    loading.value = false; refreshing.value = false
    if (fail.value) { failed.value = true; message.value = '가상 오류 · 버튼으로 다시 시도하세요.'; return }
    if (action === 'page') page.value = Math.max(1, Math.min(pageCount.value, nextPage))
    else count.value = action === 'refresh' ? Math.min(total.value, batchSize.value) : Math.min(total.value, count.value + batchSize.value)
    message.value = action === 'page' ? `${page.value}페이지 표시` : action === 'refresh' ? '목록 새로 확인 완료' : `${batchSize.value}개 추가 완료`
    if (action !== 'next') { await nextTick(); area.value?.toTop() }
  }, 600)
}
async function reset() {
  cancel(); selected.value = null; failed.value = false; count.value = Math.min(total.value, batchSize.value); page.value = 1; calls.value = 0
  message.value = '초기화 완료 · 미디어 요청 없이 테스트합니다.'
  await nextTick(); area.value?.toTop()
}
async function all() { cancel(); failed.value = false; count.value = total.value; await nextTick(); area.value?.toTop(); message.value = '전체 목록 표시 · 실제 카드 수를 비교하세요.' }
watch([mode, total, batchSize], () => { void reset() })
onUnmounted(() => clearTimeout(timer))
</script>
<template>
  <section class="pull-debug">
    <h3>갤러리 표시 방식 비교</h3>
    <label>실제 Reddit 목록 요청 간격 (0~3초)<UInputNumber v-model="interval" :min="0" :max="3" :step="0.5" :disabled="savingInterval || redditStatus?.busy" /></label>
    <div><UButton variant="soft" :loading="savingInterval" :disabled="!redditStatus || redditStatus.busy" @click="saveInterval">요청 간격 저장</UButton></div>
    <p class="auth-help">기본 3초. gallery-dl의 목록 조회 요청 사이 간격이며, 미디어 다운로드 대기는 유지됩니다.</p>
    <p v-if="intervalMessage" role="status">{{ intervalMessage }}</p>
    <p class="auth-help">표시 방식은 실제 Reddit 갤러리에 즉시 적용되며 이 브라우저에 저장됩니다. 아래 가상 이미지 영역은 별도 동작 테스트용입니다.</p>
    <div class="debug-options">
      <label>표시 방식<USelect v-model="mode" :items="[{label:'현재 방식 · 전체 카드 유지',value:'current'},{label:'새 방식 · 가상 스크롤',value:'virtual'},{label:'페이지 방식',value:'pages'}]" class="w-full" /></label>
      <label>테스트 항목 수 (1~500개)<UInputNumber v-model="totalInput" :min="1" :max="500" :step="1" class="w-full" /></label>
    </div>
    <p class="debug-stats">전체 {{ total.toLocaleString() }}개 · {{ mode === 'pages' ? `페이지 ${page}/${pageCount}` : `불러옴 ${count.toLocaleString()}개` }} · 실제 카드 {{ rendered.toLocaleString() }}개 · {{ batchSize }}개씩</p>
    <div class="debug-controls">
      <UButton variant="soft" @click="area?.toTop()">맨 위로</UButton><UButton variant="soft" @click="area?.toBottom()">맨 아래로</UButton>
      <UButton v-if="mode !== 'pages'" variant="soft" :color="loading ? 'error' : 'primary'" :disabled="!loading && count >= total" @click="loading ? cancel() : request()">{{ loading ? '로딩 취소' : `다음 ${batchSize}개` }}</UButton>
      <UButton v-else-if="loading" variant="soft" color="error" @click="cancel">로딩 취소</UButton>
      <UButton v-if="mode !== 'pages'" variant="soft" color="neutral" @click="all">전체 불러오기</UButton>
      <UButton v-if="failed && mode === 'pages'" variant="soft" @click="request('page',page)">다시 시도</UButton>
      <UButton variant="ghost" color="neutral" @click="reset">초기화</UButton><label><USwitch v-model="fail" />실패 재현</label>
    </div>
    <p role="status">{{ message }} · 요청 {{ calls }}회</p>
    <BottomPull ref="area" contained region-label="갤러리 표시 방식 비교 영역" :refresh-enabled="canRefresh" :refresh-loading="refreshing" :enabled="canLoad" :loading="loading" @load="request()" @refresh="request('refresh')">
      <DebugGalleryGrid :count="shownCount" :offset="offset" :virtual="mode === 'virtual'" @rendered="rendered=$event" @select="selected=$event; message=`카드 ${$event} 클릭`" />
      <template #footer><p class="debug-bottom">{{ mode === 'pages' ? '아래 페이지 번호로 이동하세요.' : count >= total ? '마지막 항목입니다. 위로 돌아가 카드 복원을 확인하세요.' : `맨 위에서 당겨 새로 확인 · 맨 아래에서 다음 ${batchSize}개` }}</p></template>
    </BottomPull>
    <div v-if="mode === 'pages'" class="debug-pagination"><UPagination :page="page" :total="total" :items-per-page="batchSize" :sibling-count="1" :disabled="loading" @update:page="request('page',$event)" /></div>
    <UModal :open="selected !== null" :title="`테스트 이미지 ${selected ?? ''}`" @update:open="value => { if (!value) selected=null }"><template #body><img v-if="selected !== null" :src="debugImage(selected)" class="w-full" alt="가상 이미지 상세"><UButton class="mt-3" block @click="selected=null">닫고 목록으로</UButton></template></UModal>
  </section>
</template>
<style scoped>
.pull-debug{display:grid;gap:12px;min-width:0}.pull-debug h3,.pull-debug p{margin:0}.debug-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.debug-options label{display:grid;gap:6px;min-width:0}.debug-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.debug-controls label{display:flex;gap:8px;align-items:center}.debug-bottom{padding:24px 8px;text-align:center;font-size:12px;color:var(--muted)}.debug-stats{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}.debug-pagination{display:flex;justify-content:center;overflow-x:auto}@media(max-width:540px){.debug-options{grid-template-columns:1fr}}
</style>
