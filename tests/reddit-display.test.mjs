import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/reddit-display.ts', import.meta.url), 'utf8')
function load(value) {
  const module = { exports: {} }, storage = new Map([['reddit:display-mode', value]])
  let persist
  const vue = { ref: value => ({ value }), watch: (_, callback) => { persist = callback } }
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('module', 'exports', 'require', 'localStorage', code)(module, module.exports, () => vue, { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) })
  return { ...module.exports, persist, storage }
}
test('actual Reddit display choice restores and persists with safe defaults', () => {
  for (const mode of ['current', 'virtual', 'pages']) assert.equal(load(mode).redditDisplayMode.value, mode)
  const state = load('invalid'); assert.equal(state.redditDisplayMode.value, 'current')
  state.persist('pages'); assert.equal(state.storage.get('reddit:display-mode'), 'pages')
})
test('real thumbnail rows bound cards, preserve total height and reach final items', () => {
  const { redditGridWindow: window } = load('current')
  for (const count of [0, 31, 1000, 5000]) for (const width of [280, 375, 1024]) for (const row of [222, 277]) {
    const full = window(count, width, 0, 844, row, false)
    assert.equal(full.end, count)
    for (const top of [0, full.height / 2, Math.max(0, full.height - 844)]) {
      const range = window(count, width, top, 844, row, true)
      assert.equal(range.height, full.height)
      assert.ok(range.start <= range.end && range.end <= count)
      assert.ok(range.end - range.start <= range.columns * 11)
    }
    assert.equal(window(count, width, Math.max(0, full.height - 844), 844, row, true).end, count)
  }
})
