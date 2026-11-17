<script setup lang="ts">
// Settings > About: server and WEBUI versions, WEBUI update from the public release repository.
import { onMounted, ref } from 'vue'
declare const __APP_VERSION__: string
const webuiVersion = __APP_VERSION__
type Info = { server_version: string; api_version: number; current: string; source: 'builtin' | 'installed'; builtin_version: string | null; installed: string[]; repo: string; locked_builtin: boolean }
type Latest = { version: string; notes: string; newer: boolean }
const info = ref<Info | null>(null), latest = ref<Latest | null>(null)
const busy = ref<'' | 'check' | 'install' | 'switch'>(''), message = ref(''), error = ref('')
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error((await response.text()) || '요청에 실패했습니다.')
  return response.status === 204 ? (undefined as T) : response.json()
}
async function load() { try { info.value = await call<Info>('/api/webui') } catch (e) { error.value = (e as Error).message } }
async function run(kind: 'check' | 'install' | 'switch', task: () => Promise<void>) {
  busy.value = kind; message.value = ''; error.value = ''
  try { await task() } catch (e) { error.value = (e as Error).message } finally { busy.value = '' }
}
const check = () => run('check', async () => {
  latest.value = await call<Latest>('/api/webui/check', { method: 'POST' })
  if (!latest.value.newer) message.value = `최신 버전입니다 (v${latest.value.version}).`
})
const install = () => run('install', async () => {
  const done = await call<{ version: string }>('/api/webui/install', { method: 'POST' })
  message.value = `v${done.version} 설치를 마쳤습니다. 새로고침하면 적용됩니다.`
  latest.value = null; await load()
})
const useVersion = (version: string | null) => run('switch', async () => {
  await call('/api/webui/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version }) })
  message.value = '변경했습니다. 새로고침하면 적용됩니다.'; await load()
})
const reload = () => window.location.reload()
onMounted(load)
</script>

<template>
  <div class="search-preferences webui-about">
    <dl>
      <dt>서버 버전</dt><dd>v{{ info?.server_version ?? '…' }}</dd>
      <dt>WEBUI 버전</dt>
      <dd class="version-row">
        <span>v{{ webuiVersion }}<UBadge v-if="info" variant="soft" color="neutral" size="sm" class="ms-2">{{ info.source === 'builtin' ? '기본 내장' : '설치됨' }}</UBadge></span>
        <UButton variant="soft" color="neutral" size="sm" icon="i-lucide-refresh-cw" :loading="busy === 'check'" :disabled="!!busy || info?.locked_builtin" @click="check">업데이트</UButton>
      </dd>
    </dl>
    <div v-if="latest?.newer" class="update-box">
      <p><strong>새 WEBUI v{{ latest.version }}</strong></p>
      <p v-if="latest.notes" class="notes">{{ latest.notes }}</p>
      <UButton :loading="busy === 'install'" :disabled="!!busy" icon="i-lucide-arrow-down" @click="install">설치</UButton>
    </div>
    <p v-if="message" role="status" class="auth-help">{{ message }} <UButton v-if="message.includes('새로고침')" variant="link" size="sm" @click="reload">지금 새로고침</UButton></p>
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
    <p v-if="info?.locked_builtin" class="auth-help">HITOMI_WEBUI=builtin 설정으로 기본 내장 WEBUI만 사용합니다.</p>
    <div v-if="info && (info.installed.length || info.source === 'installed')" class="other-versions">
      <span class="auth-help">다른 버전 사용</span>
      <UButton v-if="info.source === 'installed'" variant="soft" color="neutral" size="sm" :disabled="!!busy" @click="useVersion(null)">기본 내장{{ info.builtin_version ? ` v${info.builtin_version}` : '' }}</UButton>
      <UButton v-for="version in info.installed.filter(v => !(info?.source === 'installed' && v === info.current))" :key="version" variant="soft" color="neutral" size="sm" :disabled="!!busy" @click="useVersion(version)">v{{ version }}</UButton>
    </div>
    <p class="auth-help">WEBUI는 {{ info?.repo ?? '공개 저장소' }} 릴리스에서 받습니다. 화면이 깨지면 주소 뒤에 <code>?webui=builtin</code>을 붙여 기본 내장 WEBUI로 열 수 있습니다(되돌리기: <code>?webui=active</code>).</p>
  </div>
</template>

<style scoped>
dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;align-items:center;margin:0}
dd{margin:0}
.version-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.update-box{display:grid;gap:8px;padding:12px;border-radius:10px;background:var(--ui-bg-elevated)}
.update-box p{margin:0}.notes{white-space:pre-wrap;font-size:13px;color:var(--ui-text-muted)}
.other-versions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.error-text{color:var(--ui-error);margin:0}
code{font-size:12px}
</style>
