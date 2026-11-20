import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const gateModule={exports:{}}
new Function('module','exports',compile(await readFile(new URL('../src/bottom-pull.ts',import.meta.url),'utf8')))(gateModule,gateModule.exports)
const source=await readFile(new URL('../src/BottomPull.vue',import.meta.url),'utf8')
const script=compile(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/mg,''))
class FakeElement {
  constructor(card=false){this.card=card}
  closest(){return this.card ? null : this}
}
class FakeImage extends FakeElement {}
function setup(edge='bottom') {
  const events=[], image=new FakeImage(true)
  const page={scrollHeight:2000,clientHeight:500,scrollTop:edge==='top'?0:1500,getClientRects:()=>[{}],contains:target=>target instanceof FakeElement}
  const document={hidden:false,scrollingElement:page}
  const api=new Function('BottomScrollGate','ref','onMounted','onUnmounted','watch','defineProps','withDefaults','defineEmits','defineExpose','document','Element','HTMLImageElement','matchMedia',`${script}; return {viewport,start,move,release,down,mouseMove,up,click,nativeDrag,progress,reset}`)(gateModule.exports.BottomScrollGate,value=>({value}),()=>{},()=>{},()=>{},()=>({enabled:true,refreshEnabled:true,contained:true}),(props,defaults)=>({...defaults,...props}),()=>(name)=>events.push(name),()=>{},document,FakeElement,FakeImage,()=>({matches:true}))
  api.viewport.value=page
  const event=(y)=>({button:0,target:image,clientX:100,clientY:y,cancelable:true,preventDefault(){this.prevented=true}})
  return {...api,page,image,events,event}
}
test('mouse drag on an image button loads below, refreshes above, and suppresses the ensuing click',()=>{
  for (const edge of ['top','bottom']) {
    const api=setup(edge)
    api.down(api.event(300)); api.mouseMove(api.event(edge==='top'?520:80)); assert.equal(api.progress.value,1)
    api.up(); assert.deepEqual(api.events,[edge==='top'?'refresh':'load'])
    const click={target:api.image,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}}
    api.click(click); assert.ok(click.prevented && click.stopped)
    const native=api.event(0); api.nativeDrag(native); assert.ok(native.prevented)
  }
})
test('touch starting on an image accumulates and ordinary controls are excluded',()=>{
  const api=setup('bottom')
  const touch=y=>({...api.event(y),touches:[{clientX:100,clientY:y}]})
  api.start(touch(400)); api.move(touch(180)); api.release(); assert.deepEqual(api.events,['load'])
  api.reset()
  api.down({...api.event(400),target:new FakeElement(false)}); api.mouseMove(api.event(100)); api.up()
  assert.deepEqual(api.events,['load'])
})
test('short pulls return without requests and later gestures do not inherit progress',()=>{
  const api=setup('top')
  for(let n=0;n<3;n++){api.down(api.event(200));api.mouseMove(api.event(270));api.up()}
  assert.deepEqual(api.events,[]); assert.equal(api.progress.value,0)
})
