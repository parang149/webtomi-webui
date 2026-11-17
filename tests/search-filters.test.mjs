import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/search-filters.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { buildQuery, defaultLanguage, emptyFilters } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
test('whole-library search has no hidden Korean condition', () => assert.equal(buildQuery('', '', [], emptyFilters()), ''))
test('browser locale uses its primary language or falls back to all languages', () => {
  assert.equal(defaultLanguage('ko-KR'), 'korean')
  assert.equal(defaultLanguage('zh-Hant-TW'), 'chinese')
  assert.equal(defaultLanguage('sv-SE'), '')
})
test('selected work types form a single OR condition', () => {
  assert.equal(buildQuery('', 'korean', ['manga', 'anime', 'manga'], emptyFilters()), 'language:korean type:anime|manga')
})
test('separate fields preserve namespaces, exclusion and spaces', () => {
  const filters = { ...emptyFilters(), artist: ['Some Artist'], tag: ['-full color', 'female:test'] }
  assert.equal(buildQuery('title', 'english', ['manga'], filters), 'title language:english type:manga artist:Some_Artist -tag:full_color female:test')
})
test('duplicate terms are included once', () => assert.equal(buildQuery('artist:test', '', [], { ...emptyFilters(), artist: ['test'] }), 'artist:test'))
