import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/RedditPane.vue',import.meta.url),'utf8')
const part=source.slice(source.indexOf('const revisions ='),source.indexOf('let directPlay ='))
const code=ts.transpileModule(part,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
const helperSource = await readFile(new URL('../src/reddit-media-retry.ts',import.meta.url),'utf8')
const helperCode = ts.transpileModule(helperSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const helperModule = {exports:{}}
new Function('module','exports','require',helperCode)(helperModule,helperModule.exports,()=>({}))
function setup(blocked=false) {
  const original={id:'one',stored:false,seen_at:123,is_new:false,resource:{source:'https://i.redd.it/old.jpg'}}
  const items={value:[original,{...original,id:'two'}]}, readerItems={value:[{...original}]}, error={value:''}, calls=[], reload=[]
  const request=async path=>{calls.push(path);if(blocked)throw new Error('Reddit 접근 차단(403)');return {json:async()=>({...original,resource:{source:'https://i.redd.it/new.jpg'}})}}
  const recover=async(item,thumb,revision,_probe,_refresh,progress)=>helperModule.exports.recoverMedia(item,thumb,revision,async value=>{if(value.resource.source.includes('old'))throw new Error('media failed')},async id=>(await request(`items/${id}/refresh`)).json(),progress)
  const api=new Function('videoFallback','recoverMedia','ref','computed','nextTick','redditRequest','keeping','redditStatus','items','readerItems','mediaReader','feedItems','error','setTimeout','disposed',`let directPlay = false; ${code};return {retryItem,retryVisibleFailures,thumbFailed,thumbLoaded,mediaFailed,thumbFailures,mediaFailures,revisions}`)({value:new Set()},recover,value=>({value}),fn=>({get value(){return fn()}}),async()=>{},request,{value:''},{value:{busy:false}},items,readerItems,{value:{reloadMedia:index=>reload.push(index)}},items,error,fn=>{fn();return 0},false)
  return {...api,items,readerItems,error,calls,reload}
}
test('retry refreshes original URL, remounts media and preserves viewed flags',async()=>{
  const api=setup();api.thumbFailed('one');api.mediaFailed(0)
  assert.equal(await api.retryItem('one'),true)
  assert.equal(api.readerItems.value[0].resource.source,'https://i.redd.it/new.jpg')
  assert.equal(api.readerItems.value[0].seen_at,123)
  assert.equal(api.revisions.value.one,3);assert.deepEqual(api.reload,[0])
  assert.equal(api.thumbFailures.value.size,1);assert.equal(api.mediaFailures.value.size,0)
  api.thumbLoaded('one');assert.equal(api.thumbFailures.value.size,0)
})
test('blocked retries retain existing URLs, still remount and halt bulk requests',async()=>{
  const api=setup(true);api.thumbFailed('one');api.thumbFailed('two')
  await api.retryVisibleFailures()
  assert.equal(api.calls.length,1);assert.equal(api.revisions.value.one,3)
  assert.equal(api.readerItems.value[0].resource.source,'https://i.redd.it/old.jpg')
  assert.ok(api.thumbFailures.value.has('two'));assert.match(api.error.value,/403/)
})
test('successful thumbnail loading never hides a separate original-media failure',()=>{
  const api=setup();api.thumbFailed('one');api.mediaFailed(0);api.thumbLoaded('one')
  assert.equal(api.thumbFailures.value.size,0);assert.ok(api.mediaFailures.value.has('one'))
})
