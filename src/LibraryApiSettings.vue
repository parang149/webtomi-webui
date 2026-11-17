<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const token = ref<string | null>(null)
const busy = ref(false)
const message = ref('')
const address = computed(() => token.value ? `${window.location.origin}/api/${token.value}` : '')

async function update(method: 'GET' | 'POST' | 'DELETE') {
  busy.value = true
  message.value = ''
  try {
    const response = await fetch('/api/settings/library-api', { method, cache: 'no-store' })
    if (!response.ok) throw new Error(await response.text())
    token.value = method === 'DELETE' ? null : await response.json()
  } catch (error) {
    message.value = `API 설정을 처리하지 못했습니다. ${String(error)}`
  } finally {
    busy.value = false
  }
}

onMounted(() => update('GET'))
</script>

<template>
  <div class="search-preferences">
    <p>{{ token ? '라이브러리 동기화 API 사용 중' : '라이브러리 동기화 API 꺼짐' }}</p>
    <label v-if="address">데스크톱 연동 주소<UInput :model-value="address" readonly spellcheck="false" @focus="($event.target as HTMLInputElement).select()" /></label>
    <p v-if="address">주소에 인증 토큰이 포함되어 있습니다. 토큰을 재발급하면 이전 주소는 만료됩니다.</p>
    <div class="work-tabs">
      <UButton variant="outline" color="neutral" :disabled="busy" @click="update('POST')">{{ token ? '토큰 재발급' : 'API 사용' }}</UButton>
      <UButton variant="outline" color="neutral" v-if="token" :disabled="busy" @click="update('DELETE')">API 끄기</UButton>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
  </div>
</template>
