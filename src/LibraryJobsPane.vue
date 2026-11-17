<script setup lang="ts">
import AppSelect from './AppSelect.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'

type Job = { id: number; title: string; status: string; phase: string; current: string; processed: number; total: number | null; started: number; finished: number | null }
const jobs = ref<Job[]>([])
const filter = ref('all')
const detailed = ref(false)
const error = ref(false)
const visible = computed(() => jobs.value.filter(job => filter.value === 'all' || job.status === filter.value))
const labels: Record<string, string> = { running: '진행 중', completed: '완료', failed: '실패', cancelled: '취소' }
let timer: ReturnType<typeof setTimeout>
let stopped = false
const time = (value: number) => new Date(value * 1000).toLocaleString('ko-KR')

async function load() {
  const response = await fetch('/api/library/jobs', { cache: 'no-store' })
  if (!response.ok) throw new Error()
  jobs.value = await response.json()
}

async function refresh() {
  try { await load(); error.value = false }
  catch { error.value = true }
  finally { if (!stopped) timer = setTimeout(refresh, 1000) }
}

async function clear() {
  try {
    const response = await fetch('/api/library/jobs', { method: 'DELETE' })
    if (!response.ok) throw new Error()
    await load()
  } catch { error.value = true }
}

onMounted(refresh)
onUnmounted(() => { stopped = true; clearTimeout(timer) })
</script>

<template>
  <h2>라이브러리 작업</h2>
  <div class="job-filters">
    <label>상태<AppSelect v-model="filter" label="상태" :options="[{ value: 'all', label: '전체' }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]" /></label>
    <UButton variant="outline" color="neutral" type="button" :disabled="!jobs.some(job => ['completed','cancelled'].includes(job.status))" @click="clear">완료·취소 작업 제거</UButton>
    <UButton :variant="(detailed) ? 'solid' : 'outline'" :color="(detailed) ? 'primary' : 'neutral'" type="button" :aria-pressed="detailed" @click="detailed = !detailed">상세 보기</UButton>
  </div>
  <CollapsibleRoot v-for="job in visible" :key="job.id" as="article" class="job-record" :open="detailed || undefined">
    <CollapsibleTrigger v-if="!detailed" class="task-heading"><strong>{{ job.title }}</strong><span>{{ labels[job.status] }} · {{ job.phase }}</span></CollapsibleTrigger>
    <div v-else class="task-heading"><strong>{{ job.title }}</strong><span>{{ labels[job.status] }} · {{ job.phase }}</span></div>
    <p v-if="job.current" class="task-file">{{ job.current.split('/').pop() }}</p>
    <template v-if="job.status === 'running'">
      <UProgress class="task-progress" :model-value="job.total ? job.processed / job.total * 100 : 0" :aria-label="job.phase"></UProgress>
      <p v-if="job.total">처리 {{ job.processed }} / {{ job.total }}개 · 남은 {{ job.total - job.processed }}개</p>
    </template>
    <CollapsibleContent class="task-detail">
      <p v-if="job.current">현재 경로 {{ job.current }}</p>
      <p>시작 {{ time(job.started) }}</p>
      <p v-if="job.finished">종료 {{ time(job.finished) }}</p>
    </CollapsibleContent>
  </CollapsibleRoot>
  <p v-if="error" role="alert">작업 상태를 불러오지 못했습니다.</p>
  <p v-else-if="!visible.length">표시할 작업이 없습니다.</p>
</template>

<style scoped src="./job-filters.css"></style>
<style scoped>
.job-record{padding:16px;background:var(--surface);border-radius:12px;margin:12px 0;overflow-wrap:anywhere}
.task-heading{display:grid;gap:4px;width:100%;text-align:start;background:transparent;padding:0}
.task-heading span,.job-record p{color:var(--muted);font-size:.85rem}
.job-record p{margin:6px 0 0}
.task-detail{margin-top:12px}
.task-progress{height:8px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--canvas)}
.task-progress-fill{height:100%;border-radius:inherit;background:var(--accent)}
@media (prefers-reduced-motion:no-preference){
  .task-progress[data-state="indeterminate"] .task-progress-fill{animation:task-sweep 1.6s linear infinite}
}
@keyframes task-sweep{from{transform:translateX(-100%)}to{transform:translateX(400%)}}
</style>
