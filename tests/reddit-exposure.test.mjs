import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/RedditPane.vue',import.meta.url),'utf8')
const expression=source.match(/^const feedItems = (.*)$/m)[1]
function visible(list,props={}) {
 return new Function('computed','items','props','redditStatus','mediaFilter',`return ${expression}`)(fn=>fn(),{value:list},props,{value:{config:{subreddit:'a'}}},{value:'all'})
}
test('Reddit history includes only viewed entries across subreddits, most recent first',()=>{
 const list=[{id:'unseen',subreddit:'a',title:'x',gallery_seen_at:100},{id:'old',subreddit:'b',title:'x',seen_at:2},{id:'new',subreddit:'a',title:'x',seen_at:20}]
 assert.deepEqual(visible(list,{historyOnly:true}).map(i=>i.id),['new','old'])
 assert.deepEqual(visible(list).map(i=>i.id),['unseen','new'])
 assert.deepEqual(visible(list,{savedOnly:true}),[])
})
test('only intersecting gallery cards record exposure, with in-flight deduplication and cleanup',async()=>{
 const section=source.slice(source.indexOf('const pendingExposure'),source.indexOf('const videoFallback'))
 const code=ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 let observeCallback,requests=0,unobserved=0
 class Observer {constructor(cb){observeCallback=cb}observe(){}unobserve(){unobserved++}}
 const items={value:[{id:'one'}]}
 const directive=new Function('IntersectionObserver','items','redditRequest',`${code};return vExposed`)(Observer,items,async()=>{requests++})
 const el={dataset:{}};directive.mounted(el,{value:'one'})
 observeCallback([{target:el,isIntersecting:false,intersectionRatio:0}]);assert.equal(requests,0)
 observeCallback([{target:el,isIntersecting:true,intersectionRatio:.1}]);assert.equal(requests,0)
 const entry={target:el,isIntersecting:true,intersectionRatio:.5}
 observeCallback([entry,entry]);assert.equal(requests,1)
 await new Promise(resolve=>setImmediate(resolve));assert.ok(items.value[0].gallery_seen_at)
 assert.equal(items.value[0].seen_at,undefined)
 observeCallback([entry]);assert.equal(requests,1)
 directive.unmounted(el);assert.equal(unobserved,1)
})

test('new exposure never gains a border through polling or append; full reload applies it', async()=>{
 const input=await readFile(new URL('../src/reddit-exposure.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(input.replace('export class','class'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const Snapshot=new Function(`${code};return ExposureSnapshot`)()
 const state=new Snapshot()
 assert.deepEqual([...state.observe([{id:'old',gallery_seen_at:1},{id:'new'}])],['old'])
 assert.deepEqual([...state.observe([{id:'old',gallery_seen_at:1},{id:'new',gallery_seen_at:2},{id:'appended'}])],['old'])
 assert.deepEqual([...state.observe([{id:'new',gallery_seen_at:2},{id:'appended',gallery_seen_at:3}])],['old'])
 state.reset()
 assert.deepEqual([...state.observe([{id:'new',gallery_seen_at:2},{id:'appended',gallery_seen_at:3}])],['new','appended'])
})
