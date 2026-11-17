<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from 'vue'
const props = defineProps<{ label: string; field: string; modelValue: string[]; inlineChips?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
type Option = { s: string; n: string; t: number }
const input = ref(''), notice = ref(''), focused = ref(false)
const options = ref<Option[]>([]), selected = ref(-1), dismissed = ref(false)
const root = ref<HTMLElement>(), above = ref(false)
const editor = ref<HTMLInputElement>()
function positionList() { const box = root.value?.getBoundingClientRect(); above.value = !!box && window.innerHeight - box.bottom < 200 && box.top > 240 }
const inputId = useId(), listId = `${inputId}-suggestions`
const show = computed(() => focused.value && !dismissed.value && options.value.length > 0)
let timer: ReturnType<typeof setTimeout> | undefined, blurTimer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined, serial = 0
function focusInput() { clearTimeout(blurTimer); focused.value = true }
function blurInput() { blurTimer = setTimeout(() => focused.value = false, 150) }
function add(value = input.value) {
  const terms = value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  emit('update:modelValue', [...new Set([...props.modelValue, ...terms])])
  input.value = ''; options.value = []; selected.value = -1
}
function choose(option: Option) { add(`${input.value.startsWith('-') ? '-' : ''}${option.n}:${option.s}`) }
function keydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (['ArrowDown','ArrowUp'].includes(event.key) && options.value.length) {
    event.preventDefault(); dismissed.value = false
    selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + options.value.length) % options.value.length
    return
  }
  if (event.key === 'Enter') { event.preventDefault(); if (show.value && selected.value >= 0) choose(options.value[selected.value]); else add() }
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismissed.value = true }
}
defineExpose({
  commit: () => { if (input.value.trim()) add() },
  focus: () => { positionList(); editor.value?.focus(); focusInput() },
})
watch(input, value => {
  const request = ++serial
  clearTimeout(timer); controller?.abort(); options.value = []; notice.value = ''; selected.value = -1; dismissed.value = false
  const raw = value.replace(/^-/, '').trim()
  const parts = raw.split(':')
  const field = parts.length > 1 && ['artist','group','series','character','tag','female','male','language'].includes(parts[0]) ? parts[0] : props.field
  const term = (parts.length > 1 ? parts.slice(1).join(':') : raw).trim()
  if (term.length < 2) return
  timer = setTimeout(async () => {
    controller = new AbortController()
    notice.value = '추천어 불러오는 중…'
    try {
      const response = await fetch(`/api/search/suggestions?${new URLSearchParams({ field, q: term })}`, { signal: controller.signal })
      if (!response.ok) throw new Error()
      const result = await response.json()
      if (request !== serial) return
      positionList(); options.value = result; selected.value = result.length ? 0 : -1
      notice.value = result.length ? '' : '일치하는 추천어 없음 · 직접 추가할 수 있습니다.'
    } catch (error) { if (request === serial && !(error instanceof DOMException && error.name === 'AbortError')) notice.value = '추천어 연결 불가 · 직접 입력 후 추가하세요.' }
  }, 300)
})
onUnmounted(() => { ++serial; clearTimeout(timer); clearTimeout(blurTimer); controller?.abort() })
</script>
<template>
  <div ref="root" class="filter-field"><label :for="inputId">{{ label }}</label><div class="entry"><input ref="editor" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm" :id="inputId" v-model="input" role="combobox" autocomplete="off" :aria-expanded="!!show" :aria-controls="listId" :aria-activedescendant="show && selected >= 0 ? `${listId}-${selected}` : undefined" aria-autocomplete="list" :placeholder="`${label} 입력 후 추가`" maxlength="100" @focus="focusInput" @blur="blurInput" @keydown="keydown"><UButton type="button" variant="soft" color="neutral" :disabled="!input.trim()" @click="add()" :aria-label="`${label} 조건 추가`">추가</UButton></div>
    <small v-if="notice" role="status">{{ notice }}</small>
    <div v-if="inlineChips && modelValue.length" class="chips">
      <UButton variant="outline" color="neutral" v-for="term in modelValue" :key="term" type="button" :aria-label="`${term} 조건 삭제`"
        @click="emit('update:modelValue', modelValue.filter(value => value !== term))">{{ term }} ×</UButton>
    </div>
    <div v-if="show" :id="listId" class="suggestions" :class="{ above }" role="listbox" :aria-label="`${label} 추천`"><UButton variant="ghost" color="neutral" v-for="(option,index) in options" :id="`${listId}-${index}`" :key="`${option.n}:${option.s}`" role="option" :aria-selected="selected === index" type="button" @pointerdown.prevent @click="choose(option)">{{ option.s }}<small>{{ option.n }} · {{ option.t.toLocaleString() }}개</small></UButton></div>
  </div>
</template>
<style scoped>.filter-field{min-width:0;position:relative}.entry{display:flex;gap:6px}.entry input{min-width:0}.entry button{flex-shrink:0}.suggestions{position:absolute;z-index:5;top:76px;width:100%;max-height:240px;overflow:auto;background:var(--surface-raised);border-radius:10px;box-shadow:0 8px 24px #0008}.suggestions button{display:block;width:100%;text-align:left}.suggestions small{display:block}</style>

<style scoped>.filter-field>label{margin-bottom:6px}.suggestions{top:76px}.filter-field>small{display:block;margin:6px 0;color:var(--muted)}</style>

<style scoped>.suggestions.above{top:auto;bottom:calc(100% - 18px)}</style>
<style scoped>
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chips button{max-width:100%;overflow-wrap:anywhere}
</style>
