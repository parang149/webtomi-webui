import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/reddit-scroll.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('module', 'exports', code)(module, module.exports)
const { BottomScrollGate } = module.exports

test('bottom arrival needs four extra wheel notches and triggers only once', () => {
  const gate = new BottomScrollGate()
  assert.equal(gate.wheel(100, 0, 0, false), false)
  assert.equal(gate.progress, 0)
  for (let n = 1; n <= 3; n++) { assert.equal(gate.wheel(100, 0, n * 60, true), false); assert.equal(gate.progress, n / 4) }
  assert.equal(gate.wheel(100, 0, 240, true), true)
  for (let n = 0; n < 10; n++) assert.equal(gate.wheel(120, 0, 300 + n * 60, true), false)
  assert.equal(gate.progress, 1)
  const huge = new BottomScrollGate()
  assert.equal(huge.wheel(2000, 0, 1000, true), false)
  assert.equal(huge.progress, .3)
})

test('trackpad arrival inertia is ignored and a new deliberate gesture accumulates small deltas', () => {
  const gate = new BottomScrollGate()
  gate.wheel(20, 0, 0, false)
  for (let t = 8; t <= 80; t += 8) assert.equal(gate.wheel(20, 0, t, true), false)
  assert.equal(gate.progress, 0)
  for (let n = 0; n < 39; n++) assert.equal(gate.wheel(10, 0, 300 + n * 8, true), false)
  assert.equal(gate.wheel(10, 0, 612, true), true)
})

test('touch must start at the bottom; separate swipes stack but touch end and inertia do not', () => {
  const gate = new BottomScrollGate()
  gate.beginTouch(100, 500, false)
  assert.equal(gate.moveTouch(100, 100, true), false)
  assert.equal(gate.progress, 0)
  gate.beginTouch(100, 500, true)
  assert.equal(gate.moveTouch(100, 420, true), false)
  gate.endTouch()
  assert.equal(gate.moveTouch(100, 100, true), false)
  assert.equal(gate.progress, .4)
  gate.beginTouch(100, 500, true)
  assert.equal(gate.moveTouch(100, 380, true), true)
  assert.equal(gate.moveTouch(100, 200, true), false)
  gate.reset(); gate.beginTouch(100, 500, true)
  assert.equal(gate.moveTouch(102, 499, true), false)
  assert.equal(gate.moveTouch(100, 300, true), true)
})

test('upward scroll, moving away, and explicit resets clear accumulated progress', () => {
  const gate = new BottomScrollGate()
  gate.wheel(120, 1, 0, true)
  gate.wheel(-1, 0, 60, true)
  assert.equal(gate.progress, 0)
  gate.wheel(120, 0, 300, true)
  gate.wheel(100, 0, 360, false)
  assert.equal(gate.progress, 0)
  gate.beginTouch(100, 500, true); gate.moveTouch(100, 450, true); gate.moveTouch(100, 480, true)
  assert.equal(gate.progress, 0)
  gate.wheel(120, 0, 1000, true); gate.reset()
  assert.equal(gate.progress, 0)
})
