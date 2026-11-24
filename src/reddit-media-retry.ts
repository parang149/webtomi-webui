import { redditMediaUrl, redditRequest, type RedditItem } from './reddit-client'

export function retryUrl(url: string, revision: number) {
  return url.startsWith('/api/reddit/') ? `${url}${url.includes('?') ? '&' : '?'}retry=${revision}` : url
}
export async function probeMedia(item: RedditItem, thumbnail: boolean, revision: number) {
  const url = retryUrl(redditMediaUrl(item, thumbnail), revision)
  if (!url) throw new Error('썸네일 주소가 없습니다.')
  if (url.startsWith('/api/reddit/')) {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`미디어 연결 HTTP ${response.status}`)
  }
  await new Promise<void>((resolve, reject) => {
    const video = !thumbnail && item.kind === 'video'
    const media = video ? document.createElement('video') : new Image()
    const finish = (error?: Error) => {
      clearTimeout(timer); media.onload = null; media.onerror = null
      if (media instanceof HTMLVideoElement) { media.onloadedmetadata = null; media.pause(); media.removeAttribute('src'); media.load() }
      else media.removeAttribute('src')
      error ? reject(error) : resolve()
    }
    const timer = setTimeout(() => finish(new Error('미디어 로딩 시간 초과.')), 20000)
    media.onerror = () => finish(new Error('미디어 로딩 실패. 원본 접근 제한 또는 파일 형식을 확인하세요.'))
    if (media instanceof HTMLVideoElement) { media.preload = 'metadata'; media.onloadedmetadata = () => finish() }
    else { media.referrerPolicy = 'no-referrer'; media.onload = () => finish() }
    media.src = url
  })
}
export async function recoverMedia(
  item: RedditItem, thumbnail: boolean, revision: number,
  probe = probeMedia,
  refresh = async (id: string): Promise<RedditItem> => (await redditRequest(`items/${encodeURIComponent(id)}/refresh`, { method: 'POST' })).json(),
  progress: (stage: string) => void = () => {},
  onUpdated: (item: RedditItem) => void = () => {},
) {
  progress('미디어 다시 연결 중')
  try { await probe(item, thumbnail, revision); return item }
  catch (e) { if (/HTTP (401|407|429)/.test(String(e))) throw e }
  progress('포스트 주소 갱신 중')
  const updated = await refresh(item.id)
  onUpdated(updated)
  progress('갱신한 미디어 확인 중')
  await probe(updated, thumbnail, revision + 1)
  return updated
}
