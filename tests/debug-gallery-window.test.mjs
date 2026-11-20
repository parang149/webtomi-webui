import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/debug-gallery-window.ts',import.meta.url),'utf8')
const module={exports:{}}
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
new Function('module','exports',code)(module,module.exports)
const {galleryWindow,debugImage}=module.exports
test('current mode retains all cards; virtual mode bounds DOM for 1000 and 5000 items',()=>{
  for(const count of [1000,5000]){
    const all=galleryWindow(count,700,0,480,false)
    assert.equal(all.start,0); assert.equal(all.end,count)
    const first=galleryWindow(count,700,0,480,true)
    assert.equal(first.start,0); assert.ok(first.end-first.start<80)
    const middle=galleryWindow(count,700,all.height/2,480,true)
    assert.ok(middle.start>0); assert.ok(middle.end-middle.start<80)
    const last=galleryWindow(count,700,all.height-480,480,true)
    assert.equal(last.end,count); assert.ok(last.start<count)
    assert.equal(galleryWindow(count,700,0,480,true).start,0)
  }
})
test('mobile resizing, partial final rows and empty lists stay within valid indices',()=>{
  for(const width of [240,375,1024]){
    const full=galleryWindow(31,width,0,480,false)
    const end=galleryWindow(31,width,Math.max(0,full.height-480),480,true)
    assert.ok(end.start>=0 && end.start<=end.end && end.end===31)
    assert.ok(end.offset<=full.height)
  }
  const empty=galleryWindow(0,375,0,480,true)
  assert.equal(empty.height,0); assert.equal(empty.end-empty.start,0)
})
test('page-sized grids render only page data and mock images never use network URLs',()=>{
  const page=galleryWindow(30,700,0,480,false)
  assert.equal(page.end-page.start,30)
  assert.ok(debugImage(5000).startsWith('data:image/svg+xml,'))
})
