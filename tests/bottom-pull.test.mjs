import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/bottom-pull.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('module', 'exports', code)(module, module.exports)
const { BottomScrollGate } = module.exports

test('cancel discards old touches and wheel tail until idle, then allows a new pull', () => {
  const gate = new BottomScrollGate()
  gate.beginTouch(100, 500, true); gate.moveTouch(100, 300, true)
  gate.interrupt(1000)
  gate.moveTouch(100, 100, true)
  assert.equal(gate.release(), false)
  // Even line-mode mouse events must not rearm the interrupted gesture.
  for (let now = 1010; now <= 1200; now += 10) gate.wheel(100, 1, now, true)
  assert.equal(gate.distance, 0)
  gate.wheel(100, 0, 1500, true)
  gate.wheel(100, 0, 1560, true)
  gate.wheel(100, 0, 1620, true)
  assert.equal(gate.release(), true)
  gate.interrupt(1700)
  gate.beginTouch(100, 500, true); gate.moveTouch(100, 300, true)
  assert.equal(gate.release(), true)
})

test('touch follows one drag, resists increasingly, and loads only on release', () => {
  const gate = new BottomScrollGate()
  gate.beginTouch(100, 500, true)
  gate.moveTouch(100, 450, true)
  const first = gate.offset
  gate.moveTouch(100, 400, true)
  assert.ok(gate.offset - first < first)
  assert.ok(gate.offset < 85)
  assert.equal(gate.release(), false)
  assert.equal(gate.offset, 0)
  gate.beginTouch(100, 500, true)
  gate.moveTouch(100, 325, true)
  assert.equal(gate.progress, 1)
  assert.equal(gate.release(), true)
  assert.equal(gate.release(), false)
})
test('small separate swipes do not accumulate and pulling back disarms', () => {
  const gate = new BottomScrollGate()
  for (let i = 0; i < 5; i++) {
    gate.beginTouch(100, 500, true); gate.moveTouch(100, 420, true)
    assert.equal(gate.release(), false)
  }
  gate.beginTouch(100, 500, true); gate.moveTouch(100, 300, true)
  gate.moveTouch(100, 450, true)
  assert.equal(gate.release(), false)
})
test('arrival inertia and touches starting above the bottom do not pull', () => {
  const gate = new BottomScrollGate()
  gate.wheel(20, 0, 0, false)
  for (let t = 8; t <= 80; t += 8) gate.wheel(20, 0, t, true)
  assert.equal(gate.distance, 0)
  gate.beginTouch(100, 500, false); gate.moveTouch(100, 100, true)
  assert.equal(gate.release(), false)
  gate.beginTouch(100, 500, true); gate.moveTouch(300, 480, true)
  assert.equal(gate.release(), false)
})
test('wheel release triggers once, accelerated events cannot complete one pull', () => {
  const gate = new BottomScrollGate()
  gate.wheel(2000, 0, 0, true)
  assert.equal(gate.progress, .4)
  assert.equal(gate.release(), false)
  gate.wheel(100, 0, 300, true); gate.wheel(100, 0, 360, true)
  assert.equal(gate.progress, .8)
  gate.wheel(100, 0, 420, true)
  assert.equal(gate.progress, 1)
  assert.equal(gate.release(), true)
  assert.equal(gate.release(), false)
  gate.wheel(100, 0, 600, true); gate.wheel(-1, 0, 650, true)
  assert.equal(gate.release(), false)
})
test('sparse and smooth touch sampling produce identical distance and bounded movement', () => {
  const sparse = new BottomScrollGate(), smooth = new BottomScrollGate()
  sparse.beginTouch(100, 700, true); sparse.moveTouch(100, 50, true)
  smooth.beginTouch(100, 700, true)
  for (let n = 1; n <= 650; n++) smooth.moveTouch(100, 700 - n, true)
  assert.equal(smooth.offset, sparse.offset)
  assert.ok(smooth.offset > 60 && smooth.offset < 85)
  assert.equal(smooth.release(), true)
})
