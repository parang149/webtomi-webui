import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {parse,compileScript} from '@vue/compiler-sfc'
import {createSSRApp,defineComponent,h} from 'vue'
import {renderToString} from '@vue/server-renderer'
import ts from 'typescript'
const source=await readFile(new URL('../src/MediaSaveButton.vue',import.meta.url),'utf8')
const {descriptor}=parse(source)
const script=compileScript(descriptor,{id:'test-media-save',inlineTemplate:true})
const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const module={exports:{}}
new Function('module','exports','require',code)(module,module.exports,createRequire(import.meta.url))
async function render(props) {
  const app=createSSRApp({render:()=>h(module.exports.default,props)})
  app.component('UButton',defineComponent({props:['disabled','loading'],setup(p,{attrs,slots}){return ()=>h('button',{...attrs,disabled:p.disabled,'data-built-in-loading':String(!!p.loading)},slots.default?.())}}))
  app.component('UIcon',defineComponent({setup(){return ()=>h('i',{'data-spinner':'true'})}}))
  return renderToString(app)
}
test('download switches to enabled cancel even while other controls are blocked',async()=>{
  const html=await render({state:'downloading',blocked:true,iconOnly:true})
  assert.match(html,/aria-label="다운로드 취소"/);assert.doesNotMatch(html,/ disabled/)
  assert.equal((html.match(/<svg/g)||[]).length,1);assert.doesNotMatch(html,/data-spinner/)
  assert.match(html,/data-built-in-loading="false"/)
  // The icon cannot depend on Reader's scoped CSS after moving to a child component.
  assert.match(html,/width="22"/);assert.match(html,/height="22"/)
  assert.match(html,/stroke="currentColor"/);assert.match(html,/fill="none"/)
})
test('cancelling shows exactly one spinner and blocks repeat clicks; stored files stay disabled',async()=>{
  const html=await render({state:'cancelling',iconOnly:true})
  assert.match(html,/ disabled/);assert.equal((html.match(/data-spinner/g)||[]).length,1);assert.doesNotMatch(html,/<svg/)
  assert.match(await render({stored:true}),/ disabled/)
  assert.match(await render({blocked:true}),/ disabled/)
})
