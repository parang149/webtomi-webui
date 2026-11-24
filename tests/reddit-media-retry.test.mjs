import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/reddit-media-retry.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const module={exports:{}}
new Function('module','exports','require',code)(module,module.exports,()=>({}))
const {recoverMedia,retryUrl}=module.exports
const item={id:'one',seen_at:123,is_new:false,resource:{source:'old'}}
test('transient media failure recovers using current URL without metadata request',async()=>{
  let refreshes=0
  const result=await recoverMedia(item,true,1,async()=>{},async()=>{refreshes++;return item})
  assert.equal(result,item);assert.equal(refreshes,0)
})
test('expired URL refreshes once and only succeeds after new media loads',async()=>{
  const calls=[]
  const updated={...item,resource:{source:'new'}}
  const result=await recoverMedia(item,false,2,async value=>{calls.push(value.resource.source);if(value===item)throw Error('HTTP 403')},async()=>updated)
  assert.deepEqual(calls,['old','new']);assert.equal(result.seen_at,123);assert.equal(result.is_new,false)
  let retained
  await assert.rejects(()=>recoverMedia(item,false,2,async()=>{throw Error('still broken')},async()=>updated,()=>{},value=>{retained=value}),/still broken/)
  assert.equal(retained,updated)
})
test('rate limits stop without refreshing and metadata errors remain understandable',async()=>{
  let refreshes=0
  await assert.rejects(()=>recoverMedia(item,true,1,async()=>{throw Error('HTTP 429')},async()=>{refreshes++;return item}),/429/)
  assert.equal(refreshes,0)
  await assert.rejects(()=>recoverMedia(item,true,1,async()=>{throw Error('media')},async()=>{throw Error('post lookup 403')}),/post lookup 403/)
})
test('retry marker only changes local relay URLs, never signed CDN URLs',()=>{
  assert.equal(retryUrl('/api/reddit/media/one',2),'/api/reddit/media/one?retry=2')
  const signed='https://i.redd.it/a.jpg?token=unchanged'
  assert.equal(retryUrl(signed,2),signed)
})
