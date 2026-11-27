import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/code.ts',import.meta.url),'utf8')
const module={exports:{}}
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports)
const { extractCode, codeFields, detailRows } = module.exports

test('품번 규칙은 확장과 같다', () => {
  assert.equal(extractCode('FC2PPV 5014499 タイトル'), '5014499')
  assert.equal(extractCode('HEYZO 1234 x'), 'HEYZO 1234')
  assert.equal(extractCode('一本道 112624_001'), '112624_001-1PON')
  assert.equal(extractCode('그 밖'), null)
})
test('직접 입력이 우선, 비우면 제목에서', () => {
  assert.deepEqual(codeFields('FC2PPV 5014499', ' abc-1 '), { codeManual: 'abc-1', code: 'abc-1', codeKey: 'ABC1' })
  assert.deepEqual(codeFields('FC2PPV 5014499', ''), { codeManual: null, code: '5014499', codeKey: '5014499' })
})
test('상세 줄은 빈 값을 뺀다', () => {
  const rows = detailRows({ url: 'u1', urls: ['u1', 'u2'], code: '5014499', status: 'done', deletedAt: null, tags: [], nyaa: { downloaded: { count: 2, last: '2026-11-27T00:00:00Z', savepath: 'D:/x' } } })
  assert.deepEqual(rows.map(r => r[0]), ['품번', '상태', '다른 주소', 'nyaa 다운로드', '저장 경로'])
})
