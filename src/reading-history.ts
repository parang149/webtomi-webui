import { ref } from 'vue'
import type { EhentaiGallery } from './EhentaiSearch.vue'
export type EhentaiDetails = Pick<EhentaiGallery, 'thumb' | 'category' | 'posted' | 'rating' | 'tags' | 'uploader'>
export type History = { key: string; title: string; page: number; total: number; furthest: number; completed: boolean; updated_at: number; ehentai?: EhentaiDetails }
export const historySources = [
  { id: 'all', label: '전체' }, { id: 'hitomi', label: 'Hitomi' }, { id: 'ehentai', label: 'E-Hentai' }, { id: 'toon', label: '만화' },
] as const
export const pendingProgress = new Map<string, Promise<void>>()
export const readingHistory = ref<Record<string, History>>({})
export const historyError = ref('')
let loading: Promise<void> | null = null
export function refreshReading(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const response = await fetch('/api/reading/history')
      if (!response.ok) throw new Error()
      readingHistory.value = await response.json(); historyError.value = ''
    } catch { historyError.value = '읽기 기록을 불러오지 못했습니다.' }
    finally { loading = null }
  })()
  return loading
}
export function record(id: string | number, remote = false): History | undefined { return readingHistory.value[remote ? `remote:${id}` : String(id)] }
export function readState(id: string | number, total: number, remote = false): 'unread' | 'reading' | 'read' {
  const entry = record(id, remote)
  if (!entry) return 'unread'
  return entry.completed || (entry.total === 0 && entry.furthest >= total && total > 0) ? 'read' : 'reading'
}
export function readLabel(id: string | number, total: number, remote = false): string {
  const state = readState(id, total, remote), entry = record(id, remote)
  return state === 'unread' ? '안 읽음' : state === 'read' ? '읽음' : `읽는 중 · ${Math.min(entry!.furthest, total)} / ${total}페이지`
}
/** Card badge: nothing for unread, progress while reading, done when finished. */
export function readBadge(id: string | number, total: number, remote = false) {
  const state = readState(id, total, remote), entry = record(id, remote)
  if (state === 'unread') return null
  return state === 'read' ? { label: '읽음', color: 'success' as const } : { label: `읽는 중 ${Math.min(entry!.furthest, total)}/${total}`, color: 'primary' as const }
}
export async function markReading(id: string | number, completed: boolean, remote = false) {
  const entry = record(id, remote)
  // "Unread" clears every alias of the work (online, library, saved position), like the history tab,
  // and the badge changes at once instead of passing through stale progress.
  if (!completed && entry) {
    return resetReading(entry.key)
  }
  if (entry) for (const alias of Object.values(readingHistory.value)) if (alias.key === entry.key) Object.assign(alias, { completed: true, furthest: alias.total || alias.furthest })
  const response = await fetch(`/api/${remote ? 'galleries' : 'library'}/${encodeURIComponent(id)}/read-status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) })
  if (!response.ok) throw new Error('읽기 상태를 변경하지 못했습니다.')
  if (loading) await loading
  await refreshReading()
}

function forgetLocally(key: string) {
  readingHistory.value = Object.fromEntries(Object.entries(readingHistory.value).filter(([, entry]) => entry.key !== key))
}
export async function resetReading(key: string) {
  forgetLocally(key)
  await Promise.all(pendingProgress.values())
  const response = await fetch(`/api/reading/history/${encodeURIComponent(key)}`, { method: 'DELETE' })
  if (!response.ok) { await refreshReading(); throw new Error('읽기 상태를 변경하지 못했습니다.') }
  try {
    localStorage.removeItem(`reader:${key}`)
    for (const [alias, entry] of Object.entries(readingHistory.value)) {
      if (entry.key === key && alias !== key) localStorage.removeItem(`reader:${alias}`)
    }
  } catch { /* The server still keeps the reset. */ }
  if (loading) await loading
  await refreshReading()
}
