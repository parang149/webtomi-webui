import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/Reader.vue', import.meta.url), 'utf8')
const part=source.slice(source.indexOf('function videoPlayback('),source.indexOf('watch(settings,'))
const code=ts.transpileModule(part,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
test('playback resumes preserve a manually opened menu and exit restores shared controls',()=>{
  const state={controls:{value:true},settings:{value:false},videoActive:{value:false},videoFullscreen:{value:false},videoPlaying:{value:false}}
  const events=[]
  const api=new Function('state','emit',`const {controls,settings,videoActive,videoFullscreen,videoPlaying}=state; function scheduleVideoMenuHide(){} function showControls(){controls.value=true} ${code};return {videoPlayback,videoActivity,videoFullScreen}`)(state,name=>events.push(name))
  api.videoActivity(true); assert.equal(state.controls.value,false)
  state.controls.value=true
  api.videoPlayback(true); assert.equal(state.controls.value,true)
  api.videoFullScreen(true); api.videoActivity(false); api.videoFullScreen(false)
  assert.equal(state.controls.value,true); assert.equal(state.videoActive.value,false)
  assert.deepEqual(events,['video-exit'])
  api.videoFullScreen(false); assert.equal(events.length,1)
})
