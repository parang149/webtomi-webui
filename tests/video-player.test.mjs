import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/VideoPlayer.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/mg, '')
const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
function setup(native = false, desktop = false) {
  const events = [], counts = { play: 0, pause: 0, load: 0, nativeEnter: 0 }
  const document = { fullscreenElement: null, addEventListener() {}, removeEventListener() {}, async exitFullscreen() { this.fullscreenElement = null } }
  const api = new Function('document', 'defineProps', 'defineEmits', 'defineExpose', 'ref', 'onMounted', 'onBeforeUnmount', 'matchMedia', `${code}; return {failed,start,tapPreview,pointerDown,pointerUp,changed,metadata,nativeBegin,reset,pause,played,waiting,canplay,preview,buffering,frame,video,fullscreen,starting,active}`)(document, () => ({ src: 'https://v.redd.it/example/video.mp4' }), () => (...args) => events.push(args), () => {}, value => ({ value }), () => {}, () => {}, query => ({ matches: query.includes('pointer: fine') && desktop }))
  const container = native ? {} : { async requestFullscreen() { document.fullscreenElement = container } }
  api.frame.value = container
  const video = { readyState: 0, async play() { counts.play++ }, pause() { counts.pause++ }, load() { counts.load++ }, removeAttribute(name) { delete this[name] } }
  if (native) video.webkitEnterFullscreen = () => { counts.nativeEnter++ }
  api.video.value = video
  return { ...api, document, events, counts }
}
test('video stays unloaded until tap, then plays fullscreen and unloads on exit', async () => {
  const api = setup()
  assert.equal(api.video.value.src, undefined); assert.equal(api.counts.load, 0); assert.equal(api.counts.play, 0)
  await api.start()
  assert.equal(api.document.fullscreenElement, api.frame.value)
  assert.equal(api.fullscreen.value, true); assert.equal(api.counts.play, 1)
  api.document.fullscreenElement = null; api.changed()
  assert.equal(api.fullscreen.value, false); assert.equal(api.video.value.src, undefined)
  assert.ok(api.counts.pause > 0); assert.deepEqual(api.events.at(-1), ['fullscreen', false])
})
test('explicit fullscreen remains available on desktop and exit unloads video', async () => {
  const api = setup(false, true)
  await api.start(true)
  assert.equal(api.document.fullscreenElement, api.frame.value)
  assert.equal(api.counts.play, 1)
  api.document.fullscreenElement = null; api.changed()
  assert.equal(api.active.value, false)
  assert.equal(api.video.value.src, undefined)
})

test('native fullscreen waits for metadata and never plays inline', async () => {
  const api = setup(true)
  await api.start(); assert.equal(api.counts.play, 0)
  api.metadata(); assert.equal(api.counts.nativeEnter, 1); assert.equal(api.counts.play, 0)
  api.nativeBegin(); assert.equal(api.counts.play, 1); assert.equal(api.fullscreen.value, true)
  api.reset(); assert.equal(api.video.value.src, undefined); assert.equal(api.fullscreen.value, false)
})
test('loading remains until playing, then returns for buffering and clears on exit', async () => {
  const api=setup()
  await api.start(); assert.equal(api.starting.value,true)
  api.canplay(); assert.equal(api.starting.value,true)
  api.played(); assert.equal(api.starting.value,false); assert.equal(api.buffering.value,false)
  api.waiting(); assert.equal(api.buffering.value,true)
  api.canplay(); assert.equal(api.buffering.value,false)
  api.reset(); assert.equal(api.starting.value,false); assert.equal(api.buffering.value,false)
})
test('fullscreen expansion starts at the preview rectangle and ends at fullscreen size', async () => {
  const api=setup()
  let bounds={left:24,top:100,width:320,height:500}, animation
  api.frame.value.getBoundingClientRect=()=>bounds
  api.preview.value={animate(frames,options){animation={frames,options};return {cancel(){}}}}
  await api.start()
  bounds={left:0,top:0,width:400,height:800}; api.changed()
  assert.equal(animation.frames[0].transform,'translate(24px,100px) scale(0.8,0.625)')
  assert.equal(animation.frames[1].transform,'none')
  assert.equal(animation.options.duration,280)
  api.reset()
})
test('desktop plays inline without requesting fullscreen and releases video on close', async () => {
  const api=setup(false,true)
  api.frame.value.requestFullscreen=()=>{throw new Error('Must not request fullscreen on desktop')}
  assert.equal(api.video.value.src,undefined)
  await api.start()
  assert.equal(api.document.fullscreenElement,null)
  assert.equal(api.active.value,true); assert.equal(api.fullscreen.value,false); assert.equal(api.counts.play,1)
  api.played(); assert.equal(api.starting.value,false)
  api.pause(); assert.equal(api.active.value,false); assert.equal(api.video.value.src,undefined)
})
test('poster taps only request the shared viewer menu, while a swipe never triggers a tap', () => {
  const api=setup()
  api.tapPreview()
  assert.deepEqual(api.events,[['preview-tap']]); assert.equal(api.video.value.src,undefined); assert.equal(api.counts.play,0)
  api.pointerDown({clientX:300,clientY:200}); api.pointerUp({clientX:100,clientY:200}); api.tapPreview()
  assert.equal(api.events.length,1)
})


test('video failures unload playback and expose retry to the shared reader', async () => {
  const api=setup();await api.start();api.failed()
  assert.equal(api.video.value.src,undefined)
  const error=api.events.findIndex(event=>event[0]==='error')
  assert.ok(error>=0);assert.ok(api.events.findIndex((event,index)=>index>error && event[0]==='fullscreen' && event[1]===false)>error)
})

test('decode failures report numeric browser state before reset without source URLs', async () => {
  const api=setup();await api.start();api.video.value.error={code:3};api.video.value.readyState=1;api.video.value.networkState=2;api.failed()
  const reports=api.events.filter(event=>event[0]==='diagnostic')
  assert.equal(reports.length,1);assert.deepEqual(reports[0][1],{event:'decode',code:3,ready:1,network:2,original:false})
  assert.doesNotMatch(JSON.stringify(reports),/https:|example|video.mp4/)
})
test('play-policy rejection is reported even when the media error event never fires', async () => {
  const api=setup(false,true);api.video.value.play=async()=>{throw {name:'NotAllowedError',message:'secret signed URL'}}
  await api.start()
  assert.equal(api.events.find(event=>event[0]==='diagnostic')[1].event,'policy')
  assert.ok(api.events.some(event=>event[0]==='error'));assert.doesNotMatch(JSON.stringify(api.events),/secret/)
})
test('normal user cancellation does not generate a false playback error',async()=>{
  const api=setup(false,true);let rejectPlay
  api.video.value.play=()=>new Promise((_,reject)=>{rejectPlay=reject})
  const pending=api.start();api.pause();rejectPlay({name:'AbortError'})
  await pending;assert.ok(!api.events.some(event=>event[0]==='diagnostic'))
})

 test('gallery reader entry uses the player desktop/mobile policy', async () => {
  const reader = await readFile(new URL('../src/Reader.vue', import.meta.url), 'utf8')
  const body = reader.match(/async function playVideo\(\) \{([\s\S]*?)\n\}/)[1]
  let argument = 'not-called'
  await new Function('isVideo','ready','nextTick','mixedVideo',`return (async()=>{${body}})()`)(
    {value:true},{value:false},async()=>{}, {value:{start:async value=>{argument=value}}})
  assert.equal(argument,undefined)
 })
