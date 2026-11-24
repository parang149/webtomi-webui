<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { loadReddit, redditRequest, redditStatus } from './reddit-client'
const enabled = ref(false), url = ref(''), username = ref(''), password = ref('')
const busy = ref(false), message = ref('')
type Health = { state: string; ip?: string; checked_at?: number; error?: string; active: number; last_media_error?: string }
const health = ref<Health>(), statusError = ref('')
const labels: Record<string,string> = { off: '꺼짐', checking: '확인 중', connected: '연결 정상', failed: '연결 실패', stale: '확인 지연' }
let timer: ReturnType<typeof setInterval> | undefined, polling = false, disposed = false
async function poll() {
  if (polling || disposed) return
  polling = true
  try { const h = await (await redditRequest('proxy/status')).json(); if (!disposed) { health.value = h; statusError.value = '' } }
  catch { if (!disposed) statusError.value = '연결 상태를 가져오지 못했습니다.' }
  finally { polling = false }
}
async function check() {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await redditRequest('proxy/test', { method: 'POST' }) }
  catch (e) { message.value = String(e) }
  finally { await poll(); busy.value = false }
}
function load() { const p = redditStatus.value?.proxy; enabled.value = p?.enabled ?? false; url.value = p?.url ?? ''; username.value = p?.username ?? ''; password.value = '' }
async function save(test = false) {
  if (busy.value) return
  busy.value = true; message.value = ''
  try {
    await redditRequest('proxy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled.value, url: url.value, username: username.value, password: password.value || null }) })
    password.value = ''; await loadReddit(); load()
    if (test) {
      try { await redditRequest('proxy/test', { method: 'POST' }) } catch (e) { message.value = String(e) }
    } else message.value = '프록시 설정 저장 완료. 열린 뷰어를 닫고 다시 열면 적용됩니다.'
  } catch (e) { message.value = String(e) } finally { await poll(); busy.value = false }
}
onMounted(async () => { try { await loadReddit(); if (!disposed) load() } catch (e) { message.value = String(e) } await poll(); if (!disposed) timer = setInterval(poll, 2000) })
onUnmounted(() => { disposed = true; clearInterval(timer) })
</script>
<template>
  <fieldset class="reddit-proxy" :disabled="busy || redditStatus?.busy || redditStatus?.installing || redditStatus?.subscribers_refreshing">
    <legend>VPN 프록시 · Reddit 전용</legend>
    <div class="proxy-health" role="status" aria-live="polite" :data-state="statusError ? 'stale' : health?.state">
      <strong>{{ statusError ? '확인 지연' : labels[health?.state || 'checking'] }}</strong>
      <span>외부 IP: {{ health?.ip || '확인 전' }} · 미디어 중계 {{ health?.active ?? 0 }}개</span>
      <span>마지막 확인: {{ health?.checked_at ? new Date(health.checked_at * 1000).toLocaleString('ko-KR') : '확인 전' }}</span>
      <span v-if="statusError || health?.error">{{ statusError || health?.error }}</span>
      <span v-if="health?.last_media_error">최근 미디어 오류: {{ health.last_media_error }}</span>
      <UButton type="button" variant="soft" color="neutral" :disabled="!redditStatus?.proxy?.enabled || busy || health?.state === 'checking'" @click="check">지금 연결 확인</UButton>
    </div>
    <label class="proxy-switch"><USwitch v-model="enabled" />프록시 사용</label>
    <label>HTTP 프록시 주소<UInput v-model="url" placeholder="http://gluetun:8888" autocomplete="off" /></label>
    <label>프록시 사용자 이름 · 선택<UInput v-model="username" autocomplete="off" /></label>
    <label>프록시 비밀번호 · 선택<UInput v-model="password" type="password" autocomplete="new-password" :placeholder="redditStatus?.proxy?.password_set ? '등록됨 · 비워 두면 유지' : '미등록'" /></label>
    <div class="proxy-actions"><UButton type="button" variant="soft" :loading="busy" @click="save()">프록시 저장</UButton><UButton type="button" variant="soft" color="neutral" :disabled="!enabled" @click="save(true)">저장 후 연결 확인</UButton></div>
    <p class="auth-help">활성화 중 서버가 30초마다 프록시 경유 외부 연결을 확인합니다. VPN 국가·Gluetun 내부 터널 상태는 Gluetun 로그에서 확인하세요. 외부 IP는 마지막 성공 값입니다.</p>
    <p class="auth-help">기본 꺼짐. 켜면 Reddit 목록·다운로드·온라인 썸네일·원본을 프록시로 연결합니다. 미디어는 저장 없이 중계하며 다운로드 버튼을 눌렀을 때만 영구 저장합니다. VPN 연결 실패 시 직접 접속하지 않습니다. 다른 출처와 Web UI 포트는 그대로입니다.</p>
    <p class="auth-help">Gluetun과 같은 Docker 네트워크에서 내부 포트 8888을 사용하면 호스트의 8888 포트와 충돌하지 않습니다. 인증을 제거하려면 사용자 이름을 비워 저장하세요.</p>
    <p v-if="message" role="status">{{ message }}</p>
  </fieldset>
</template>
<style scoped>
.reddit-proxy{display:grid;gap:12px;border:1px solid var(--ui-border);border-radius:8px;padding:14px;min-width:0}.reddit-proxy label{display:grid;gap:8px}.reddit-proxy .proxy-switch,.proxy-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.reddit-proxy p{margin:0;overflow-wrap:anywhere}.proxy-health{display:grid;gap:6px;padding:12px;border:1px solid var(--ui-border);border-radius:8px;font-size:13px;overflow-wrap:anywhere}.proxy-health[data-state=connected] strong{color:var(--ui-primary)}.proxy-health[data-state=failed] strong{color:var(--ui-error)}
</style>
