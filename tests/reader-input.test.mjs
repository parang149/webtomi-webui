import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/Reader.vue', import.meta.url), 'utf8')
const start = source.indexOf('function surfaceClick('), end = source.indexOf('function pointerDown(', start)
const code = ts.transpileModule(source.slice(start,end), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function setup() {
  const state = { ready:{value:true}, mode:{value:'page'}, settings:{value:false}, forward:{value:1}, direction:{value:'ltr'}, viewport:{value:{scrollTop:0,clientHeight:800,scrollHeight:800,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:800})}}, moves:[], toggles:0 }
  const api = new Function('state', `const {ready,mode,settings,forward,direction,viewport}=state; const window={getSelection:()=>''}; const suppressClickUntil=0; function move(n){state.moves.push(n)} function toggleControls(){state.toggles++} ${code}; return {surfaceClick,wheel}`)(state)
  return {state,...api}
}
test('tap zones follow reading direction and center toggles menu',()=>{
  const {state,surfaceClick}=setup()
  for(const clientX of [100,500,900]) surfaceClick({clientX})
  assert.deepEqual(state.moves,[-1,1]); assert.equal(state.toggles,1)
  state.forward.value=-1; surfaceClick({clientX:100}); assert.equal(state.moves.at(-1),1)
  state.mode.value='scroll'; surfaceClick({clientX:100}); assert.equal(state.toggles,2)
  state.mode.value='page';state.settings.value=true;surfaceClick({clientX:900});assert.equal(state.moves.length,3)
})
test('vertical direction uses top, middle and bottom tap bands',()=>{
  const {state,surfaceClick}=setup(); state.direction.value='ttb'
  for(const clientY of [100,400,700]) surfaceClick({clientX:900,clientY})
  assert.deepEqual(state.moves,[-1,1]); assert.equal(state.toggles,1)
})
function touchSetup(view, dir='ttb', fwd=1) {
  const s=source.indexOf('let touch:'), e=source.indexOf('function visible(', s)
  const touchCode=ts.transpileModule(source.slice(s,e),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  const state={moves:[],swipe:{value:true}}
  const api=new Function('state','view',`const viewport={value:view}, settings={value:false}, mode={value:'page'}, swipe=state.swipe, forward={value:${fwd}}, direction={value:'${dir}'}; const window={innerWidth:400}; let suppressClickUntil=0; function move(n){state.moves.push(n)} function surfaceClick(e){state.taps=(state.taps||0)+1} ${touchCode}; return {touchstart,touchend}`)(state,view)
  const swipe=(x0,y0,x1,y1)=>{api.touchstart({touches:[{clientX:x0,clientY:y0}]});api.touchend({changedTouches:[{clientX:x1,clientY:y1}]})}
  return {...api,state,swipe}
}
const page=()=>({scrollTop:0,clientHeight:800,scrollHeight:800,scrollLeft:0,clientWidth:400,scrollWidth:400})
test('vertical swipe turns pages only from the scroll edge in every direction',()=>{
  for (const dir of ['ttb','ltr','rtl']) {
    const view=page(), {state,swipe}=touchSetup(view,dir,dir==='rtl'?-1:1)
    swipe(200,600,200,300);swipe(200,300,200,600);assert.deepEqual(state.moves,[1,-1])
    view.scrollHeight=1600;swipe(200,600,200,300);assert.equal(state.moves.length,2)
    view.scrollTop=800;swipe(200,600,200,300);assert.deepEqual(state.moves.at(-1),1)
  }
  // Edge touches block the browser back gesture, still swipe, and still tap.
  const {state,touchstart,touchend}=touchSetup(page())
  let prevented=0; const edge=(x0,x1)=>{touchstart({touches:[{clientX:x0,clientY:400}],cancelable:true,preventDefault(){prevented++}});touchend({changedTouches:[{clientX:x1,clientY:400}]})}
  edge(5,250);assert.equal(prevented,1);assert.equal(state.moves.at(-1),-1)
  edge(5,8);assert.equal(prevented,2);assert.equal(state.taps,1)
})
test('horizontal swipe follows the reading direction and waits for the horizontal scroll edge',()=>{
  const ltr=touchSetup(page(),'ltr',1); ltr.swipe(300,400,100,400); ltr.swipe(100,400,300,400); assert.deepEqual(ltr.state.moves,[1,-1])
  const rtl=touchSetup(page(),'rtl',-1); rtl.swipe(100,400,300,400); assert.deepEqual(rtl.state.moves,[1])
  const view={...page(),scrollWidth:900}, wide=touchSetup(view,'ltr',1)
  wide.swipe(300,400,100,400); assert.equal(wide.state.moves.length,0)
  view.scrollLeft=500; wide.swipe(300,400,100,400); assert.deepEqual(wide.state.moves,[1])
})
test('swipe can be turned off',()=>{
  const {state,swipe}=touchSetup(page(),'ltr',1); state.swipe.value=false
  swipe(300,400,100,400); swipe(200,600,200,300); assert.equal(state.moves.length,0)
})
test('wheel turns once per gesture and preserves scrolling and pinch zoom',()=>{
  const {state,wheel}=setup();let prevented=0
  const event={deltaX:0,deltaY:100,deltaMode:0,ctrlKey:false,preventDefault(){prevented++}}
  state.viewport.value.scrollHeight=1600;wheel(event);assert.equal(state.moves.length,0);assert.equal(prevented,0)
  state.viewport.value.scrollHeight=800;wheel({...event,ctrlKey:true});assert.equal(state.moves.length,0)
  wheel(event);wheel(event);wheel(event);assert.deepEqual(state.moves,[1]);assert.equal(prevented,3)
})
