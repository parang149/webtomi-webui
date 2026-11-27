// 품번 규칙: 확장 extension/code.js와 똑같이 유지 (AHK ExtractByTitle, 제목만). 규칙 문서: fc-nyaa/docs/query-normalization.md
export function extractCode(title = ''): string | null {
  const s = String(title)
  const t = s.toLowerCase()
  let m: RegExpMatchArray | null
  if (t.includes('1pondo') || s.includes('一本道')) return (m = s.match(/\d{6}[_-]\d{3}/)) ? `${m[0]}-1PON` : null
  if (t.includes('10musume') || s.includes('天然むすめ')) return (m = s.match(/\d{6}[_-]\d{2,3}/)) ? `${m[0]}-10MU` : null
  if (t.includes('caribbeancom') || s.includes('カリビアンコム')) return (m = s.match(/\d{6}[_-]\d{3}/)) ? `${m[0]}-CARIB` : null
  if (t.includes('pacopacomama') || s.includes('パコパコママ')) return (m = s.match(/\d{6}[_-]\d{3}/)) ? `${m[0]}-PACO` : null
  if (t.includes('heyzo')) return (m = s.match(/HEYZO\s+(\d{3,4})/i)) ? `HEYZO ${m[1]}` : null
  if (t.includes('fc2')) return (m = s.match(/(?<!\d)\d{7,10}(?!\d)/)) ? m[0] : null
  return null
}
export const codeKey = (code: string | null) => (code ? code.toUpperCase().replace(/-/g, '') : null)

/** 직접 입력값(비우면 제목에서 자동)으로 서버에 보낼 품번 칸 */
export function codeFields(title: string, manual: string) {
  const m = manual.trim()
  const code = m || extractCode(title)
  return { codeManual: m || null, code, codeKey: codeKey(code) }
}

type Stat = { count?: number; last?: string; savepath?: string } | undefined
type DetailItem = { url: string; urls?: string[]; code?: string | null; status: string; deletedAt: number | null; tags?: string[]; note?: string
  createdAt?: number; completedAt?: number | null; lastViewedAt?: number | null; supjav?: { date?: string | null }; nyaa?: Record<string, Stat> | null }
const when = (v?: number | string | null) => (v ? new Date(v).toLocaleString() : '')
const stat = (s: Stat) => (s?.count ? `${s.count}회 · 마지막 ${when(s.last)}` : '')
/** TAPS 상세 보기 줄 [이름, 값] — 확장 상세 보기와 같은 순서, 빈 값은 뺌 */
export function detailRows(i: DetailItem): [string, string][] {
  const st = i.deletedAt !== null ? '휴지통' : ({ unread: '미확인', reviewing: '확인 중', done: '완료' } as Record<string, string>)[i.status] || i.status
  const n = i.nyaa || {}
  const rows: [string, string][] = [
    ['품번', i.code || ''], ['상태', st], ['다른 주소', (i.urls || []).filter(u => u !== i.url).join('\n')],
    ['태그', (i.tags || []).join(', ')], ['메모', i.note || ''],
    ['수집 날짜', when(i.createdAt)], ['포스트 날짜', i.supjav?.date || ''], ['완료 날짜', when(i.completedAt)],
    ['마지막 확인', when(i.lastViewedAt)], ['휴지통 날짜', when(i.deletedAt)],
    ['nyaa 열람', stat(n.viewed)], ['nyaa 검색', stat(n.searched)], ['nyaa 다운로드', stat(n.downloaded)], ['저장 경로', n.downloaded?.savepath || ''],
  ]
  return rows.filter(r => r[1])
}
