<script setup lang="ts">
import AppSelect from './AppSelect.vue'
import { nextTick, computed, onMounted, onUnmounted, ref } from 'vue'
import { ehentaiCover } from './ehentai-cover'
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
import SourceTabs from './SourceTabs.vue'

const props = defineProps<{ localCovers: ReadonlyMap<string, string> }>()
const emit = defineEmits<{ libraryChanged: [] }>()
type Job = { id: number; source?: 'hitomi' | 'ehentai'; token?: string; title: string; status: string; downloaded: number; total: number; error: string | null; artists?: string[]; thumb?: string | null; started_at?: number | null; completed_at?: number | null; retry_at?: number | null }
const detailed = ref(false)
const expanded = ref(new Set<string>())
const brokenCovers = ref(new Set<string>())
const jobs = ref<Job[]>([])
const error = ref('')
const pending = ref(false)
const hasFinishedJobs = computed(() => jobs.value.some(job => job.status === 'completed' || job.status === 'cancelled'))
const filter = ref('all')
const sortDirection = ref<'asc' | 'desc'>('asc')
const source = ref<'all' | 'hitomi' | 'ehentai'>('all')
const sourceJobs = computed(() => jobs.value.filter(job => source.value === 'all' || source.value === (job.source ?? 'hitomi')))
function waitLabel(job: Job) {
  if (job.status !== 'downloading' || !job.retry_at) return ''
  const seconds = Math.max(0, job.retry_at - Date.now() / 1000)
  return seconds < 60 ? '서버 대기 중 · 곧 재개' : `서버 대기 중 · ${Math.ceil(seconds / 60)}분 후 재개`
}
const activeStates = ['queued','downloading','pausing','cancelling','finalizing']
const filteredJobs = computed(() => sourceJobs.value.filter(job => filter.value === 'all' || (filter.value === 'active' ? activeStates.includes(job.status) : filter.value === 'completed' ? job.status === 'completed' : !activeStates.includes(job.status) && job.status !== 'completed')))
const visibleJobs = computed(() => {
  const ordered = sortDirection.value === 'asc' ? filteredJobs.value : [...filteredJobs.value].reverse()
  return [
    ...ordered.filter(job => job.status === 'downloading'),
    ...ordered.filter(job => job.status !== 'downloading'),
  ]
})
const labels: Record<string, string> = { queued: '대기 중', downloading: '다운로드 중', finalizing: '저장 마무리 중', pausing: '일시정지 중', paused: '일시정지', cancelling: '취소 중', cancelled: '취소됨', completed: '완료', failed: '실패', interrupted: '중단됨' }
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let revision = 0
async function refresh() {
  const requestedRevision = revision
  try {
    if (pending.value) return
    const response = await fetch('/api/downloads')
    if (!response.ok) throw new Error()
    const latest: Job[] = await response.json()
    if (requestedRevision === revision) {
      const completed = new Set(jobs.value.filter(job => job.status === 'completed').map(jobKey))
      jobs.value = latest
      error.value = ''
      if (latest.some((job: Job) => job.status === 'completed' && !completed.has(jobKey(job)) && !props.localCovers.has(jobKey(job)))) {
        emit('libraryChanged')
      }
    }
  } catch {
    if (requestedRevision === revision) error.value = '다운로드 상태를 불러오지 못했습니다.'
  }
  finally { if (!disposed) timer = setTimeout(refresh, 2000) }
}
const jobKey = (job: Job) => `${job.source || 'hitomi'}:${job.id}`
function toggleCard(job: Job) {
  const key = jobKey(job)
  if (expanded.value.has(key)) expanded.value.delete(key)
  else expanded.value.add(key)
}
async function animateCard(job: Job, event: MouseEvent) {
  const header = event.currentTarget as HTMLElement
  const before = header.getBoundingClientRect()
  const opening = !expanded.value.has(jobKey(job))
  toggleCard(job)
  // Closing drops the cover column and padding at once, so it closes instantly instead of sliding back.
  if (!opening) return
  await nextTick()
  if (!header.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const after = header.getBoundingClientRect()
  header.getAnimations().forEach(animation => animation.cancel())
  header.animate([{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
    { transform: 'translate(0, 0)' }], { duration: 220, easing: 'ease-out' })
}
const cover = (job: Job) => job.status === 'completed' ? props.localCovers.get(jobKey(job)) : job.source === 'ehentai' ? ehentaiCover(job.thumb) : `/api/galleries/${job.id}/cover`
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' })
const formatTime = (seconds?: number | null) => seconds == null ? '—' : dateFormat.format(seconds * 1000)
function duration(job: Job) {
  if (job.started_at == null || job.completed_at == null) return '—'
  const seconds = Math.max(0, job.completed_at - job.started_at)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  return [hours ? `${hours}시간` : '', hours || minutes ? `${minutes}분` : '', `${seconds % 60}초`].filter(Boolean).join(' ')
}
async function action(job: Job, command = '') {
  revision++
  pending.value = true
  try {
    const source = job.source === 'ehentai' ? '/api/ehentai' : '/api'
    const body = job.source === 'ehentai' && !command
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: job.token, title: job.title }) }
      : {}
    const response = await fetch(`${source}/downloads/${job.id}${command ? '/' + command : ''}`, { method: 'POST', ...body })
    if (!response.ok) throw new Error()
    const updated: Job = await response.json()
    jobs.value = jobs.value.map(old => jobKey(old) === jobKey(updated) ? updated : old)
  } catch { error.value = '상태가 바뀌었거나 요청을 처리하지 못했습니다. 현재 상태를 확인하세요.' }
  finally { pending.value = false }
}
async function clearFinished() {
  revision++
  pending.value = true
  error.value = ''
  try {
    const response = await fetch('/api/downloads', { method: 'DELETE' })
    if (!response.ok) throw new Error()
    jobs.value = await response.json()
  } catch { error.value = '완료·취소 작업을 제거하지 못했습니다.' }
  finally { pending.value = false }
}
onMounted(refresh)
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>
<template>
  <section><h2>다운로드</h2><p v-if="error" role="alert">{{ error }}</p><p v-if="!jobs.length">다운로드 작업이 없습니다.</p>
    <SourceTabs v-model="source" label="다운로드 출처" />
    <div class="job-filters">
      <label>작업 필터<AppSelect v-model="filter" label="작업 필터" :options="[{'value': 'all', 'label': `전체 (${sourceJobs.length})`}, {'value': 'active', 'label': '진행 중'}, {'value': 'stopped', 'label': '일시정지·중단·실패'}, {'value': 'completed', 'label': '완료'}]" /></label>
      <label>정렬 방향<AppSelect v-model="sortDirection" label="정렬 방향" :options="[{'value': 'asc', 'label': '오름차순'}, {'value': 'desc', 'label': '내림차순'}]" /></label>
      <UButton variant="outline" color="neutral" type="button" :disabled="pending || !hasFinishedJobs" @click="clearFinished">완료·취소 작업 제거</UButton>
      <div class="download-views" role="group" aria-label="다운로드 보기 방식">
        <UButton :variant="(!detailed) ? 'solid' : 'outline'" :color="(!detailed) ? 'primary' : 'neutral'" type="button" :aria-pressed="!detailed" aria-label="기본 보기" title="기본 보기" @click="detailed = false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </UButton>
        <UButton :variant="(detailed) ? 'solid' : 'outline'" :color="(detailed) ? 'primary' : 'neutral'" type="button" :aria-pressed="detailed" aria-label="상세 보기" title="상세 보기" @click="detailed = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h8"/></svg>
        </UButton>
      </div>
    </div>
    <template v-for="(job, index) in visibleJobs" :key="jobKey(job)">
      <USeparator v-if="job.status !== 'downloading' && visibleJobs[index - 1]?.status === 'downloading'" class="download-separator" />
      <CollapsibleRoot as="article" class="job" :class="{ 'job-open': detailed || expanded.has(jobKey(job)) }" :open="detailed || expanded.has(jobKey(job))" :data-source="job.source ?? 'hitomi'">
        <component :is="detailed ? 'div' : CollapsibleTrigger" class="job-summary" @click="!detailed && animateCard(job, $event)">
          <strong>{{ job.title }}</strong>
          <span class="job-summary-meta">#{{ job.id }} <UBadge class="job-status" :data-status="job.status">{{ labels[job.status] || job.status }}</UBadge> <UBadge v-if="waitLabel(job)" color="warning" variant="soft">{{ waitLabel(job) }}</UBadge> {{ !job.total && job.status === 'downloading' ? '페이지 확인 중' : `${job.downloaded} / ${job.total || '?'}페이지` }}</span>
        </component>
        <UProgress v-if="!detailed && !expanded.has(jobKey(job)) && (job.total > 0 || job.status === 'downloading')" class="job-progress" :class="{ 'is-downloading': job.status === 'downloading', 'is-indeterminate': !job.total }" :model-value="job.total ? Math.min(100, job.downloaded / job.total * 100) : 0" :aria-label="`${job.title} 다운로드 진행률`"></UProgress>
            <div v-if="detailed || expanded.has(jobKey(job))" class="job-cover">
              <img v-if="cover(job) && !brokenCovers.has(cover(job)!)" :src="cover(job) || undefined" alt="" loading="lazy" referrerpolicy="no-referrer" @error="brokenCovers.add(cover(job)!)">
              <span v-else>표지 없음</span>
            </div>
        <CollapsibleContent class="job-detail">
            <div class="job-info">
              <p>작가 {{ job.artists?.join(', ') || '정보 없음' }}</p>
              <p class="job-source">{{ job.source === 'ehentai' ? 'E-Hentai' : 'Hitomi' }}</p>
              <dl class="job-times">
                <div><dt>시작 시각</dt><dd>{{ formatTime(job.started_at) }}</dd></div>
                <div><dt>완료 시각</dt><dd>{{ formatTime(job.completed_at) }}</dd></div>
                <div><dt>걸린 시간</dt><dd>{{ duration(job) }}</dd></div>
              </dl>
              <UProgress v-if="job.total > 0 || job.status === 'downloading'" class="job-progress" :class="{ 'is-downloading': job.status === 'downloading', 'is-indeterminate': !job.total }" :model-value="job.total ? Math.min(100, job.downloaded / job.total * 100) : 0" :aria-label="`${job.title} 다운로드 진행률`"></UProgress>
              <p v-if="job.error" role="status">{{ job.error }}</p>
              <div class="actions"><UButton type="button" v-if="['queued','downloading'].includes(job.status)" :disabled="pending" @click="action(job, 'pause')">일시정지</UButton><UButton type="button" v-if="['queued','downloading','paused','interrupted','failed'].includes(job.status)" :disabled="pending" @click="action(job, 'cancel')">취소</UButton><UButton type="button" v-if="['paused','cancelled','failed','interrupted'].includes(job.status)" :disabled="pending" @click="action(job)">{{ job.status === 'failed' ? '다시 시도' : '재개 / 이어받기' }}</UButton></div>
            </div>
        </CollapsibleContent>
      </CollapsibleRoot>
    </template>
  </section>
</template>
<style scoped src="./job-filters.css"></style>
<style scoped>
.download-views{display:flex;gap:6px;margin-left:auto}
.download-views button{display:grid;place-items:center;width:46px}
.download-views svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}
.job-summary{display:grid;gap:4px;width:100%;text-align:start;background:transparent;padding:0;overflow-wrap:anywhere}
.job-summary span{color:var(--muted);font-size:.85rem}
.job-summary[aria-expanded]::after{content:"";grid-column:2;grid-row:1;border:solid currentColor;border-width:0 1.5px 1.5px 0;width:8px;height:8px;transform:rotate(45deg);justify-self:end;align-self:center;margin:0 4px 4px 8px}
.job-summary[aria-expanded="true"]::after{transform:rotate(225deg);margin-bottom:0}

.job-detail{overflow:hidden}
@media (prefers-reduced-motion: no-preference) {
  .job-summary ~ .job-detail[data-state="open"]{animation:job-expand 200ms ease-out}
}
@keyframes job-expand{from{height:0}to{height:var(--reka-collapsible-content-height)}}
.job{padding:16px;background:var(--surface);border:0;border-radius:12px;box-shadow:0 1px 2px #0003;margin:12px 0;overflow-wrap:anywhere}
.download-separator{height:1px;margin:20px 0;background:var(--muted);opacity:.35}
.job[data-source="hitomi"]{--source-accent:#8de3bf}
.job[data-source="ehentai"]{--source-accent:#d8b4fe}
.job[data-source]{border-inline-start:4px solid var(--source-accent)}
.job-source{color:var(--source-accent);font-weight:600}
.job p,section>p{line-height:1.6;color:var(--muted)}
.job{position:relative;--cover-width:clamp(80px,19vw,152px);--cover-gap:clamp(10px,2vw,18px)}
.job-open{padding-inline-start:calc(16px + var(--cover-width) + var(--cover-gap));min-height:calc(32px + var(--cover-width) * 4 / 3)}
.job-info{min-width:0}.job-info p{margin:.25rem 0}
.job-cover{position:absolute;top:16px;aspect-ratio:3/4;inset-inline-start:16px;width:var(--cover-width);display:grid;place-items:center;overflow:hidden;border-radius:8px;background:var(--canvas);color:var(--muted);font-size:.7rem}
.job-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center}
.job-times{display:flex;flex-wrap:wrap;gap:8px 20px;margin:12px 0;font-size:.85rem}
.job-times dt{color:var(--muted)}
.job-times dd{margin:2px 0 0}
.job-progress{position:relative;height:8px;margin:8px 0 0;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--source-accent) 16%,var(--canvas))}
.job-progress-fill{height:100%;border-radius:inherit;background:var(--source-accent)}
.job-progress.is-indeterminate .job-progress-fill{width:30%}
@media (prefers-reduced-motion: no-preference) {
  .job-progress-fill{transition:width 250ms ease-out}
  .job-progress.is-downloading:not(.is-indeterminate)::after{
    content:"";position:absolute;inset:0;width:35%;
    background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--source-accent) 65%,white),transparent);
    animation:download-sweep 1.8s linear infinite;
  }
  .job-progress.is-downloading.is-indeterminate .job-progress-fill{animation:download-sweep 1.8s linear infinite}
}
@keyframes download-sweep{from{transform:translateX(-100%)}to{transform:translateX(335%)}}
.job-summary-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.job .job-status{display:inline-flex;align-items:center;padding:2px 8px;border:1px solid #ffffff24;border-radius:999px;color:var(--text);font-size:.75rem;font-weight:600;line-height:1.5}
.job-status[data-status="downloading"],.job-status[data-status="completed"]{background:color-mix(in srgb,var(--source-accent) 15%,transparent)}
.job-status[data-status="failed"]{background:#ff909022}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}


</style>
