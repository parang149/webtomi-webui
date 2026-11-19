<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import BottomPull from './BottomPull.vue'
const area = ref<InstanceType<typeof BottomPull>>()
const count = ref(25), calls = ref(0), loading = ref(false), fail = ref(false)
const failed = ref(false)
const message = ref('아래 끝에서 위로 당겼다 놓아 보세요.')
let timer: ReturnType<typeof setTimeout> | undefined
function cancel() { clearTimeout(timer); timer = undefined; area.value?.interrupt(); loading.value = false; message.value = '취소 완료 · 새로 당겼다 놓으면 다시 받습니다.' }
function load() {
  if (loading.value) return
  failed.value = false; calls.value++; loading.value = true; message.value = '가상 로딩 중…'
  timer = setTimeout(() => {
    loading.value = false
    if (fail.value) { failed.value = true; message.value = '가상 오류 · 버튼으로 다시 시도하세요.'; return }
    count.value += 25; message.value = `25개 추가 완료 · 현재 ${count.value}개`
  }, 1200)
}
async function reset() { clearTimeout(timer); failed.value = false; loading.value = false; count.value = 25; calls.value = 0; message.value = '초기화 완료'; area.value?.interrupt(); await nextTick(); area.value?.toBottom() }
onUnmounted(() => clearTimeout(timer))
</script>
<template>
  <section class="pull-debug">
    <h3>다음 25개 받기 테스트</h3>
    <p class="auth-help">실제 Reddit과 같은 당기기·복귀·로딩 동작입니다. 색상 카드만 추가하며 네트워크 요청이나 파일 저장은 하지 않습니다.</p>
    <div class="debug-controls"><UButton variant="soft" @click="area?.toBottom()">맨 아래로</UButton><UButton variant="soft" :color="loading ? 'error' : 'primary'" @click="loading ? cancel() : load()">{{ loading ? '로딩 취소' : '다음 25개 테스트' }}</UButton><UButton variant="ghost" color="neutral" @click="reset">초기화</UButton><label><USwitch v-model="fail" />실패 재현</label></div>
    <p role="status">{{ message }} · 요청 {{ calls }}회</p>
    <BottomPull ref="area" contained region-label="다음 25개 받기 테스트 영역" :enabled="!loading && !failed" :loading="loading" @load="load">
      <div class="debug-grid"><div v-for="n in count" :key="n" class="debug-card" :style="{ background: `hsl(${(n * 37) % 360} 25% 24%)` }"><span>{{ n }}</span></div></div>
      <template #footer><p class="debug-bottom">위로 당겼다 놓으면 다음 25개 · 휠도 테스트 가능</p></template>
    </BottomPull>
  </section>
</template>
<style scoped>
.pull-debug{display:grid;gap:12px}.pull-debug h3,.pull-debug p{margin:0}.debug-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.debug-controls label{display:flex;gap:8px;align-items:center}.debug-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:8px}.debug-card{aspect-ratio:1;display:grid;place-items:center;border-radius:6px;color:#fff;font-size:24px}.debug-bottom{padding:24px 8px;text-align:center;font-size:12px;color:var(--muted)}
</style>
