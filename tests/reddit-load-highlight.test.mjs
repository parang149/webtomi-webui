import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/reddit-load-highlight.ts', import.meta.url), 'utf8')
const module = { exports: {} }
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports)
const { RedditLoadHighlight } = module.exports
test('marks only new IDs across polls, replacing previous batch on success', () => {
  const state = new RedditLoadHighlight()
  assert.equal(state.observe(['a']).size, 0)
  state.begin(['a']); assert.deepEqual([...state.observe(['a', 'b'])], ['b'])
  assert.deepEqual([...state.observe(['c', 'a', 'b'])], ['b', 'c'])
  state.finish(true)
  state.begin(['a', 'b', 'c']); assert.deepEqual([...state.observe(['a', 'b', 'c'])], ['b', 'c'])
  assert.deepEqual([...state.observe(['a', 'b', 'c', 'd'])], ['d'])
  state.finish(true); state.begin(['a', 'b', 'c', 'd']); assert.equal(state.finish(true).size, 0)
})
test('failed empty loads retain highlights, cancellation retains partial additions, reset clears', () => {
  const state = new RedditLoadHighlight()
  state.begin([]); state.observe(['a']); state.finish(true)
  state.begin(['a']); assert.deepEqual([...state.finish(false)], ['a'])
  state.begin(['a']); state.observe(['a', 'b']); assert.deepEqual([...state.finish(false)], ['b'])
  state.clear(); assert.equal(state.observe(['a', 'b']).size, 0)
})
