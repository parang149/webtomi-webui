import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import ts from 'typescript'
const source = await readFile(new URL('../src/reddit-client.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('module', 'exports', 'require', code)(module, module.exports, createRequire(import.meta.url))
const { redditMediaUrl, redditPostUrl } = module.exports

test('original post links use metadata and only validated Reddit fallback paths', () => {
  assert.equal(redditPostUrl({resource:{post_id:'abc123'}}), 'https://www.reddit.com/comments/abc123/')
  assert.equal(redditPostUrl({resource:{source:'https://www.reddit.com/r/test/comments/abc123/title/?x=1'}}), 'https://www.reddit.com/comments/abc123/')
  for (const resource of [{}, {post_id:'../bad'}, {source:'https://evil.test/comments/abc123/'}, {source:'https://i.redd.it/image.jpg'}]) assert.equal(redditPostUrl({resource}), undefined)
})
test('online thumbnails and originals go directly to media hosts', () => {
  const item = { id: 'a', stored: false, resource: { source: 'https://i.redd.it/a.jpg', thumbnail: 'https://preview.redd.it/small.jpg' } }
  assert.equal(redditMediaUrl(item), 'https://i.redd.it/a.jpg')
  assert.equal(redditMediaUrl(item, true), 'https://preview.redd.it/small.jpg')
  assert.equal(redditMediaUrl({ ...item, resource: { playback: 'https://v.redd.it/a/DASH_720.mp4?x=1' } }), 'https://v.redd.it/a/DASH_720.mp4?x=1')
})
test('missing previews stay empty and unsupported videos never fall back to downloads', () => {
  const item = { id: 'a', resource: { source: 'https://redgifs.com/watch/page' } }
  assert.equal(redditMediaUrl(item, true), '')
  assert.equal(redditMediaUrl(item), '/api/reddit/media/a')
  for (const source of ['http://127.0.0.1/a.jpg', 'https://i.redd.it.evil.test/a.jpg', 'https://user:pass@i.redd.it/a.jpg']) {
    assert.equal(redditMediaUrl({ id: 'a', resource: { source } }), '/api/reddit/media/a')
  }
})
test('explicitly saved files use authenticated local media URLs', () => {
  const item = { id: 'saved', stored: true, resource: { source: 'https://i.redd.it/a.jpg' } }
  assert.equal(redditMediaUrl(item), '/api/reddit/media/saved')
  assert.equal(redditMediaUrl(item, true), '/api/reddit/media/saved')
  // A saved video must not be fetched as an <img> to make its preview.
  assert.equal(redditMediaUrl({ ...item, kind: 'video' }, true), '')
})
