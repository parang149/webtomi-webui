export type Filters = { artist: string[]; group: string[]; series: string[]; character: string[]; tag: string[] }
export const emptyFilters = (): Filters => ({ artist: [], group: [], series: [], character: [], tag: [] })
export const languages = {
  ko: ['korean', '한국어'], ja: ['japanese', '일본어'], en: ['english', '영어'],
  zh: ['chinese', '중국어'], es: ['spanish', '스페인어'], fr: ['french', '프랑스어'],
  de: ['german', '독일어'], ru: ['russian', '러시아어'], pt: ['portuguese', '포르투갈어'],
  it: ['italian', '이탈리아어'],
} as const

export function defaultLanguage(locale: string): string {
  const code = locale.toLowerCase().split('-')[0] as keyof typeof languages
  return languages[code]?.[0] ?? ''
}

export function buildQuery(query: string, language: string, types: string[], filters: Filters): string {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (language) terms.push(`language:${language}`)
  if (types.length) terms.push(`type:${[...new Set(types)].sort().join('|')}`)
  for (const [field, values] of Object.entries(filters)) for (const value of values) {
    const negative = value.startsWith('-')
    const raw = value.replace(/^-/, '').trim().replace(/\s+/g, '_')
    if (raw) terms.push(`${negative ? '-' : ''}${raw.includes(':') ? raw : `${field}:${raw}`}`)
  }
  return [...new Set(terms)].join(' ')
}
