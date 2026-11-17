export function ehentaiCover(url?: string | null) {
  return url ? `/api/ehentai/cover?url=${encodeURIComponent(url)}` : ''
}
