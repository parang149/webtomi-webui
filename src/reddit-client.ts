import { ref } from 'vue'
export type RedditConfig = { enabled: boolean; subreddit: string; subreddits: string[]; all_media: boolean; show_titles: boolean; batch_size?: number; request_interval?: number; mode?: 'download' | 'online' }
export type RedditSubscribers = { count: number | null; updated_at: number | null; attempted_at: number | null }
export type RedditProxy = { enabled: boolean; url: string; username: string; password_set: boolean }
export type RedditStatus = { proxy?: RedditProxy; config: RedditConfig; installed: boolean; version: string; cookies: boolean; busy: boolean; installing: boolean; stopping: boolean; failed_downloads?: number; message: string; exhausted: boolean; subscribers?: Record<string, RedditSubscribers>; subscribers_refreshing?: boolean; subscribers_message?: string }
export type RedditItem = { id: string; title: string; kind: 'image' | 'gif' | 'video'; created: number; downloaded_at?: number | null; sequence?: number; subreddit: string; seen_at?: number | null; is_new?: boolean; stored?: boolean; resource?: { source?: string; playback?: string; thumbnail?: string; post_id?: string } }
export const redditStatus = ref<RedditStatus>()
export async function redditRequest(path: string, init?: RequestInit) {
  const response = await fetch(`/api/reddit/${path}`, init)
  if (!response.ok) throw new Error(await response.text())
  return response
}
export async function loadReddit() { redditStatus.value = await (await redditRequest('status')).json() }
export async function refreshRedditSubscribers(force = false) {
  await redditRequest('subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) })
  await loadReddit()
}
export function subscriberLabel(name: string) {
  const info = redditStatus.value?.subscribers?.[name.toLowerCase()]
  if (info?.count != null) return `구독자 ${new Intl.NumberFormat('ko-KR', { notation: info.count >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(info.count)}명`
  if (redditStatus.value?.subscribers_refreshing) return '구독자 수 확인 중'
  return info?.attempted_at ? '구독자 수 확인 불가' : '구독자 수 확인 전'
}
export function subscriberDescription(name: string) {
  const info = redditStatus.value?.subscribers?.[name.toLowerCase()]
  if (!info?.updated_at) return '구독자 수는 최초 등록 또는 누락 시 조회하고, 이후 선택할 때 1주일이 지났으면 갱신합니다.'
  return `갱신: ${new Date(info.updated_at * 1000).toLocaleString('ko-KR')}${info.attempted_at && info.attempted_at > info.updated_at ? ' · 최근 조회 실패, 저장된 값 표시' : ''}`
}

export function redditMediaUrl(item: RedditItem, thumbnail = false) {
  if (item.stored && (!thumbnail || item.kind !== 'video')) return `/api/reddit/media/${item.id}`
  if (redditStatus.value?.proxy?.enabled) return `/api/reddit/${thumbnail ? 'thumbnail' : 'media'}/${item.id}`
  const candidate = thumbnail ? item.resource?.thumbnail : item.resource?.playback || item.resource?.source
  try {
    const url = new URL(candidate || '')
    const allowed = ['redd.it', 'redditmedia.com', 'imgur.com', 'redgifs.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
    if (url.protocol === 'https:' && !url.port && !url.username && !url.password && allowed && (thumbnail || /\.(jpe?g|png|webp|avif|gif|mp4|webm|m4v|mov)$/i.test(url.pathname))) return url.href
  } catch { /* Missing or non-media links use a placeholder/error, never a download. */ }
  return thumbnail ? '' : `/api/reddit/media/${item.id}`
}
export function redditPostUrl(item: RedditItem): string | undefined {
  const id = item.resource?.post_id
  if (id && /^[a-z0-9]+$/i.test(id)) return `https://www.reddit.com/comments/${id}/`
  try {
    const url = new URL(item.resource?.source || '')
    if (url.protocol === 'https:' && ['reddit.com', 'www.reddit.com'].includes(url.hostname)) {
      const match = url.pathname.match(/\/(?:comments|gallery)\/([a-z0-9]+)(?:\/|$)/i)
      if (match) return `https://www.reddit.com/comments/${match[1]}/`
    }
  } catch { /* Older entries may have no post metadata. */ }
}
