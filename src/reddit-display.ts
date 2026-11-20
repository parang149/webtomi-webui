import { ref, watch } from 'vue'
export type RedditDisplayMode = 'current' | 'virtual' | 'pages'
const key = 'reddit:display-mode'
function saved(): RedditDisplayMode {
  try { const value = localStorage.getItem(key); if (value === 'virtual' || value === 'pages') return value } catch {}
  return 'current'
}
export const redditDisplayMode = ref<RedditDisplayMode>(saved())
watch(redditDisplayMode, value => { try { localStorage.setItem(key, value) } catch {} })

export function redditGridWindow(count: number, width: number, top: number, height: number, rowHeight: number, virtual: boolean) {
  const columns = Math.max(1, Math.floor((width + 12) / 162)), pitch = rowHeight + 12
  const rows = Math.ceil(count / columns)
  const first = virtual ? Math.min(Math.max(0, rows - 1), Math.max(0, Math.floor(top / pitch) - 3)) : 0
  const last = virtual ? Math.min(rows, Math.ceil((top + height) / pitch) + 3) : rows
  return { columns, start: first * columns, end: Math.min(count, last * columns), offset: first * pitch, height: Math.max(0, rows * pitch - 12) }
}
