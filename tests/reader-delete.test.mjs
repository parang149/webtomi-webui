import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/Reader.vue', import.meta.url), 'utf8')
const part = source.slice(source.indexOf('function afterMediaDeleted('), source.indexOf('defineExpose('))
const code = ts.transpileModule(part, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
test('successful deletion advances to next media, closes at end, and preserves a user-changed page', () => {
  const page = { value: 0 }; let closed = 0
  const deleted = new Function('page', 'props', 'close', `${code}; return afterMediaDeleted`)(page, { book: { pages: 3 } }, () => { closed++ })
  deleted(0); assert.equal(page.value, 1); assert.equal(closed, 0)
  deleted(1); assert.equal(page.value, 2); assert.equal(closed, 0)
  deleted(0); assert.equal(page.value, 2); assert.equal(closed, 0)
  deleted(2); assert.equal(closed, 1)
})
