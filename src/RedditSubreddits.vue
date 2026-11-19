<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { subscriberLabel, subscriberDescription } from './reddit-client'
const names = defineModel<string[]>({ required: true })
const props = defineProps<{ disabled?: boolean }>()
const input = ref(''), error = ref(''), dragging = ref('')
let pointerId = -1, lastX = 0, lastY = 0, animation = 0
const list = ref<HTMLOListElement>()
function add() {
  const value = input.value.trim().replace(/^https:\/\/(?:www\.)?reddit\.com\/r\//i, '').replace(/^r\//i, '').split(/[/?#]/)[0] || ''
  if (!/^[a-z0-9_]{1,50}$/i.test(value)) { error.value = '서브레딧 이름 또는 Reddit 주소를 입력하세요.'; return }
  if (names.value.length >= 20) { error.value = '최대 20개까지 등록할 수 있습니다.'; return }
  if (names.value.some(name => name.toLowerCase() === value.toLowerCase())) { error.value = '이미 등록한 서브레딧입니다.'; return }
  names.value = [...names.value, value]; input.value = ''; error.value = ''
}
function move(from: number, to: number) { if (props.disabled || to < 0 || to >= names.value.length || from === to) return; const next = [...names.value]; next.splice(to, 0, next.splice(from, 1)[0]!); names.value = next }
function start(event: PointerEvent, name: string) { if (props.disabled || !event.isPrimary || event.button !== 0) return; end(); dragging.value = name; pointerId = event.pointerId; lastX = event.clientX; lastY = event.clientY; animation = requestAnimationFrame(scrollDrag) }
function end() { dragging.value = ''; pointerId = -1; cancelAnimationFrame(animation) }
function scrollDrag() {
  if (!dragging.value || props.disabled) return
  const element = list.value, bounds = element?.getBoundingClientRect()
  if (element && bounds && lastX >= bounds.left && lastX <= bounds.right) {
    const before = element.scrollTop
    if (lastY < bounds.top + 30) element.scrollTop -= 6
    else if (lastY > Math.min(bounds.bottom, innerHeight) - 30) element.scrollTop += 6
    if (element.scrollTop !== before) reorder(lastX, lastY)
  }
  animation = requestAnimationFrame(scrollDrag)
}
onMounted(() => { window.addEventListener('pointermove', drag, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); window.addEventListener('blur', end) })
onUnmounted(() => { end(); window.removeEventListener('pointermove', drag); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('blur', end) })
function drag(event: PointerEvent) {
  if (!dragging.value || props.disabled || event.pointerId !== pointerId) return
  if (event.cancelable) event.preventDefault()
  lastX = event.clientX; lastY = event.clientY; reorder(lastX, lastY)
}
function reorder(x: number, y: number) {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-subreddit]')
  const from = names.value.indexOf(dragging.value), to = names.value.indexOf(row?.dataset.subreddit || '')
  if (!row || from < 0 || to < 0 || from === to) return
  const middle = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2
  if (from < to ? y < middle : y > middle) return
  move(from, to)
}
</script>
<template>
  <section class="subreddit-list" aria-label="등록한 서브레딧">
    <div class="subreddit-add"><UInput v-model="input" class="min-w-0 flex-1" placeholder="서브레딧 이름 또는 주소" aria-label="추가할 서브레딧" :disabled="disabled || names.length >= 20" @keydown.enter.prevent="add" /><UButton variant="soft" :disabled="disabled || names.length >= 20 || !input.trim()" @click="add">추가</UButton></div>
    <p class="auth-help">{{ names.length }}/20개 · 손잡이를 마우스나 터치로 끌어 순서를 바꾼 뒤 설정을 저장하세요. 키보드는 손잡이에서 ↑↓.</p>
    <ol ref="list"><li v-for="(name, index) in names" :key="name" :data-subreddit="name" :class="{ dragging: dragging === name }"><button type="button" class="drag-handle" :disabled="disabled" :aria-label="`${name} 순서 조절`" @pointerdown.prevent="start($event, name)" @keydown.up.prevent="move(index, index - 1)" @keydown.down.prevent="move(index, index + 1)">⠿</button><span>r/{{ name }}<small :title="subscriberDescription(name)">{{ subscriberLabel(name) }}</small></span><UButton variant="ghost" color="neutral" size="sm" :disabled="disabled" :aria-label="`${name} 삭제`" @click="names = names.filter((_, i) => i !== index)">삭제</UButton></li></ol>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.subreddit-list{display:grid;gap:10px}.subreddit-add{display:flex;gap:8px}.subreddit-list ol{list-style:none;padding:0;margin:0;max-height:420px;overflow:auto}.subreddit-list li{display:flex;align-items:center;gap:8px;padding:4px;border-bottom:1px solid var(--line)}.subreddit-list li>span{flex:1;min-width:0;overflow-wrap:anywhere}.drag-handle{touch-action:none;cursor:grab;min-width:44px;min-height:44px;font-size:24px;border:0;background:transparent;border-radius:6px}.dragging{background:var(--ui-bg-elevated)}.dragging .drag-handle{cursor:grabbing}
.subreddit-list li small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
</style>
