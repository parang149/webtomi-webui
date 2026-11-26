<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { vaultSettings, type VaultStatus } from './vault-client'

const status = ref<VaultStatus | null>(null)
const busy = ref(false)
const message = ref('')
const address = computed(() => status.value?.token ? `${window.location.origin}/api/vault/${status.value.token}` : '')

async function update(method: 'GET' | 'POST' | 'DELETE') {
  busy.value = true
  message.value = ''
  try { status.value = await vaultSettings(method) }
  catch (error) { message.value = `보관함 연동 설정을 처리하지 못했습니다. ${String(error)}` }
  finally { busy.value = false }
}
onMounted(() => update('GET'))
</script>

<template>
  <div class="search-preferences">
    <h3>탭 보관함 연동</h3>
    <p>{{ status?.token ? `사용 중 · 서버 보관함 항목 ${status.count}개` : '꺼짐' }}</p>
    <label v-if="address">확장에 넣을 주소<UInput :model-value="address" readonly spellcheck="false" @focus="($event.target as HTMLInputElement).select()" /></label>
    <p v-if="address">주소에 인증 토큰이 포함되어 있습니다. 재발급하면 모든 PC 연결이 끊기고 새 주소를 다시 넣어야 합니다. 라이브러리 API 주소와는 별개입니다.</p>
    <ul v-if="status?.clients.length" class="vault-clients">
      <li v-for="client in status.clients" :key="client.id">{{ client.name || client.id.slice(0, 8) }} · 마지막 접속 {{ new Date(client.last_seen).toLocaleString('ko-KR') }}</li>
    </ul>
    <div class="work-tabs">
      <UButton variant="outline" color="neutral" :disabled="busy" @click="update('POST')">{{ status?.token ? '토큰 재발급' : '연동 사용' }}</UButton>
      <UButton v-if="status?.token" variant="outline" color="neutral" :disabled="busy" @click="update('DELETE')">연동 끄기</UButton>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>.vault-clients{margin:0;padding-left:18px;font-size:14px;color:var(--muted)}h3{margin:16px 0 0;font-size:16px}</style>
