import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/auth-client.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
let serial=0
async function setup(status=200) {
  const calls=[],events=[]
  globalThis.window={location:{href:'http://localhost:4824/',origin:'http://localhost:4824'},fetch:async(input,init)=>{calls.push({input,init});return new Response('',{status})},dispatchEvent:event=>events.push(event.type)}
  const module=await import(`data:text/javascript;base64,${Buffer.from(compiled+`\n//${serial++}`).toString('base64')}`)
  module.setCsrf('test-csrf');module.installAuthFetch();module.installAuthFetch()
  return {calls,events,module}
}
test('CSRF headers attach only to unsafe same-origin API requests',async()=>{
  const {calls}=await setup()
  await window.fetch('/api/downloads/42',{method:'POST'})
  assert.equal(calls[0].init.headers.get('X-CSRF-Token'),'test-csrf')
  assert.equal(calls[0].init.headers.get('X-Hitomi-Request'),'1')
  await window.fetch('/api/library')
  assert.equal(calls[1].init.headers.has('X-CSRF-Token'),false)
  await window.fetch('https://example.com/api/test',{method:'POST'})
  assert.equal(calls[2].init.headers,undefined)
})
test('expired protected request triggers login gate; wrong login does not',async()=>{
  const {events}=await setup(401)
  await window.fetch('/api/library')
  assert.deepEqual(events,['hitomi-auth-expired'])
  await window.fetch('/api/auth/login',{method:'POST'})
  assert.equal(events.length,1)
})
