<script setup lang="ts">
// 일일툰 addresses: the server tries them in order and keeps using the one that answers.
import { onMounted, ref } from 'vue'
const props = defineProps<{ site: 'toon' | 'wolf'; label: string; example: string }>()

const origins = ref<string[]>([])
const draft = ref('')
const busy = ref(false)
const message = ref('')
const failed = ref(false)

onMounted(async () => {
  try {
    const response = await fetch(`/api/settings/${props.site}`)
    if (response.ok) origins.value = (await response.json()).origins
  } catch { /* The list stays empty until the server answers. */ }
})

async function save(next: string[]) {
  busy.value = true
  message.value = ''
  try {
    const response = await fetch(`/api/settings/${props.site}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origins: next }) })
    if (!response.ok) throw new Error(response.status === 400 ? await response.text() : '저장하지 못했습니다.')
    origins.value = (await response.json()).origins
    failed.value = false
    message.value = '저장했습니다.'
    return true
  } catch (cause) {
    failed.value = true
    message.value = cause instanceof Error ? cause.message : '저장하지 못했습니다.'
    return false
  } finally { busy.value = false }
}
async function add() {
  const value = draft.value.trim()
  if (!value) return
  if (await save([value, ...origins.value])) draft.value = ''
}
const remove = (index: number) => save(origins.value.filter((_, i) => i !== index))
const promote = (index: number) => save([origins.value[index], ...origins.value.filter((_, i) => i !== index)])
</script>

<template>
  <section class="toon-origins" :aria-labelledby="`${site}-origins-title`">
    <h3 :id="`${site}-origins-title`">{{ label }} 주소</h3>
    <ol class="origin-list">
      <li v-for="(origin, index) in origins" :key="origin">
        <span class="origin">{{ origin }}</span>
        <UBadge v-if="index === 0" variant="subtle" size="sm">우선</UBadge>
        <UButton v-else type="button" variant="ghost" color="neutral" size="sm" :disabled="busy" @click="promote(index)">우선 사용</UButton>
        <UButton type="button" variant="ghost" color="neutral" size="sm" square icon="i-lucide-x" :disabled="busy || origins.length < 2" :aria-label="`${origin} 삭제`" @click="remove(index)" />
      </li>
    </ol>
    <div class="origin-add">
      <UInput v-model="draft" :placeholder="`예: ${example}`" maxlength="200" class="flex-1" :aria-label="`새 ${label} 주소`" @keydown.enter.prevent="add" />
      <UButton type="button" variant="soft" icon="i-lucide-plus" :disabled="busy || !draft.trim()" @click="add">추가</UButton>
    </div>
    <p v-if="message" :role="failed ? 'alert' : 'status'" class="auth-help">{{ message }}</p>
    <p class="auth-help">위에서부터 차례로 접속하고, 응답한 주소를 계속 씁니다. 사이트 주소가 바뀌면 새 주소를 추가하세요. 바로 저장됩니다.</p>
  </section>
</template>

<style scoped>
.toon-origins{margin-top:20px}
.toon-origins h3{margin:0 0 8px;font-size:15px}
.origin-list{list-style:none;margin:0 0 8px;padding:0}
.origin-list li{display:flex;align-items:center;gap:8px;min-height:44px;border-bottom:1px solid var(--ui-border)}
.origin{flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px}
.origin-add{display:flex;gap:8px}
</style>
