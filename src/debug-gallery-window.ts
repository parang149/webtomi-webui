export type DebugListMode = 'current' | 'virtual' | 'pages'
// Fixed square cards allow stable row heights without retaining offscreen DOM.
export function galleryWindow(count: number, width: number, scrollTop: number, viewportHeight: number, virtual: boolean) {
  const columns = Math.max(1, Math.floor((Math.max(1, width) + 8) / 148))
  const pitch = (Math.max(1, width) - (columns - 1) * 8) / columns + 8
  const rows = Math.ceil(count / columns)
  const first = virtual ? Math.min(Math.max(0, rows - 1), Math.max(0, Math.floor(scrollTop / pitch) - 3)) : 0
  const last = virtual ? Math.min(rows, Math.ceil((Math.max(0, scrollTop) + viewportHeight) / pitch) + 3) : rows
  return { columns, height: Math.max(0, rows * pitch - 8), offset: first * pitch, start: first * columns, end: Math.min(count, last * columns) }
}
export function debugImage(id: number) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="hsl(${(id * 37) % 360},25%,24%)"/><text x="120" y="130" text-anchor="middle" fill="white" font-size="32">${id}</text></svg>`)}`
}
