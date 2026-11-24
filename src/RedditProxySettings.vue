<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadReddit, redditRequest, redditStatus } from './reddit-client'
const enabled = ref(false), url = ref(''), username = ref(''), password = ref('')
const busy = ref(false), message = ref('')
function load() { const p = redditStatus.value?.proxy; enabled.value = p?.enabled ?? false; url.value = p?.url ?? ''; username.value = p?.username ?? ''; password.value = '' }
async function save(test = false) {
  if (busy.value) return
  busy.value = true; message.value = ''
  try {
    await redditRequest('proxy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled.value, url: url.value, username: username.value, password: password.value || null }) })
    password.value = ''; await loadReddit(); load()
    if (test) {
      const result = await (await redditRequest('proxy/test', { method: 'POST' })).json()
      message.value = `프록시 연결 성공 · 외부 IP ${result.ip}. Gluetun의 VPN 연결 로그와 함께 확인하세요.`
    } else message.value = '프록시 설정 저장 완료. 열린 뷰어를 닫고 다시 열면 적용됩니다.'
  } catch (e) { message.value = String(e) } finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <fieldset class="reddit-proxy" :disabled="busy || redditStatus?.busy || redditStatus?.installing || redditStatus?.subscribers_refreshing">
    <legend>Reddit 전용 VPN 프록시 · 테스트</legend>
    <label class="proxy-switch"><USwitch v-model="enabled" />프록시 사용</label>
    <label>HTTP 프록시 주소<UInput v-model="url" placeholder="http://gluetun:8888" autocomplete="off" /></label>
    <label>프록시 사용자 이름 · 선택<UInput v-model="username" autocomplete="off" /></label>
    <label>프록시 비밀번호 · 선택<UInput v-model="password" type="password" autocomplete="new-password" :placeholder="redditStatus?.proxy?.password_set ? '등록됨 · 비워 두면 유지' : '미등록'" /></label>
    <div class="proxy-actions"><UButton variant="soft" :loading="busy" @click="save()">프록시 저장</UButton><UButton variant="soft" color="neutral" :disabled="!enabled" @click="save(true)">저장 후 연결 확인</UButton></div>
    <p class="auth-help">기본 꺼짐. 켜면 Reddit 목록·다운로드·온라인 썸네일·원본을 프록시로 연결합니다. 미디어는 저장 없이 중계하며 다운로드 버튼을 눌렀을 때만 영구 저장합니다. VPN 연결 실패 시 직접 접속하지 않습니다. 다른 출처와 Web UI 포트는 그대로입니다.</p>
    <p class="auth-help">Gluetun과 같은 Docker 네트워크에서 내부 포트 8888을 사용하면 호스트의 8888 포트와 충돌하지 않습니다. 인증을 제거하려면 사용자 이름을 비워 저장하세요.</p>
    <p v-if="message" role="status">{{ message }}</p>
  </fieldset>
</template>
<style scoped>
.reddit-proxy{display:grid;gap:12px;border:1px solid var(--ui-border);border-radius:8px;padding:14px;min-width:0}.reddit-proxy label{display:grid;gap:8px}.reddit-proxy .proxy-switch,.proxy-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.reddit-proxy p{margin:0;overflow-wrap:anywhere}
</style>
