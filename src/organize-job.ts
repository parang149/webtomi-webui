import { ref } from 'vue'
import { notify } from './notifications'

type Result = { moved: number; skipped: number; failed: number; removed_folders: number }
export const organizeJob = ref<{ total: number; running: boolean; result?: Result; error?: string }>()
type JobRecord = { id: number; trial: boolean; status: 'completed' | 'cancelled' | 'failed'; result?: Result; error?: string }
export const organizeHistory = ref<JobRecord[]>([])

export function clearFinishedOrganizeJobs() {
  organizeHistory.value = organizeHistory.value.filter(job => job.status === 'failed')
  libraryTasks.value = libraryTasks.value.filter(job => job.status !== 'completed')
}

export async function startOrganize(token: string, trial: boolean, total: number) {
  if (organizeJob.value?.running) return
  organizeJob.value = { total, running: true }
  notify('library', 'ID 구간별 정리를 시작했습니다.')
  try {
    const response = await fetch('/api/settings/organize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, trial }),
    })
    if (!response.ok) throw new Error(await response.text())
    organizeJob.value = { total, running: false, result: await response.json() }
  } catch (error) {
    organizeJob.value = { total, running: false, error: error instanceof Error ? error.message : '정리에 실패했습니다.' }
  }
  const result = organizeJob.value.result
  notify('library', result ? `ID 구간별 정리 완료 · 이동 ${result.moved}개 · 오류 ${result.failed}개` : 'ID 구간별 정리 실패 · 작업 탭에서 확인하세요.', !result || result.failed > 0)
  organizeHistory.value.unshift({
    id: Date.now(),
    trial,
    status: organizeJob.value.result ? 'completed' : 'failed',
    result: organizeJob.value.result,
    error: organizeJob.value.error,
  })
}

type LibraryTask = { id: number; title: string; status: 'running' | 'completed' | 'failed'; count?: number; error?: string }
export const libraryTasks = ref<LibraryTask[]>([])
let nextTaskId = 0

export async function trackLibraryTask<T>(title: string, run: () => Promise<T>, count: (result: T) => number): Promise<T> {
  const task = ref<LibraryTask>({ id: ++nextTaskId, title, status: 'running' })
  libraryTasks.value.unshift(task.value)
  notify('library', `${title} 시작`)
  try {
    const result = await run()
    task.value.status = 'completed'
    task.value.count = count(result)
    notify('library', `${title} 완료 · ${task.value.count}개`)
    return result
  } catch (error) {
    task.value.status = 'failed'
    task.value.error = String(error)
    notify('library', `${title} 실패 · 작업 탭에서 확인하세요.`, true)
    throw error
  }
}
