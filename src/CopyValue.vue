<script lang="ts">
import { shallowRef } from 'vue'

const activeNotice = shallowRef<{ owner: symbol; key: symbol; text: string }>()
</script>
<script setup lang="ts">
import { onUnmounted, ref, useId, watch } from 'vue'
import { tagColor } from './type-colors'

const props = defineProps<{ value: string; description?: string; tone?: string }>()
const owner = Symbol()
let timer: ReturnType<typeof setTimeout>
let hintTimer: ReturnType<typeof setTimeout>
const hintId = useId()
const hint = ref<{ left: number; edge: number; above: boolean }>()
const buttonRef = ref<HTMLButtonElement>()
let press: { id: number; x: number; y: number } | undefined
let suppressClick = false

function showHint() {
  const box = buttonRef.value?.getBoundingClientRect()
  if (!props.description || !box) return
  const width = Math.min(260, window.innerWidth - 24)
  const above = window.innerHeight - box.bottom < 105 && box.top > 105
  hint.value = {
    left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)),
    edge: above ? window.innerHeight - box.top + 6 : box.bottom + 6,
    above,
  }
}
function hideHint() { clearTimeout(hintTimer); hint.value = undefined }
function hover(event: PointerEvent) {
  if (props.description && event.pointerType === 'mouse') hintTimer = setTimeout(showHint, 250)
}
function leave(event: PointerEvent) { if (event.pointerType === 'mouse') hideHint() }
function pointerDown(event: PointerEvent) {
  suppressClick = false
  if (!props.description || event.pointerType === 'mouse' || !event.isPrimary) return
  hideHint()
  press = { id: event.pointerId, x: event.clientX, y: event.clientY }
  hintTimer = setTimeout(() => { suppressClick = true; showHint() }, 480)
}
function endPress(event: PointerEvent) {
  if (press?.id !== event.pointerId) return
  clearTimeout(hintTimer)
  press = undefined
}
function pointerMove(event: PointerEvent) {
  if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
    endPress(event)
  }
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !buttonRef.value?.contains(event.target)) hideHint()
}
watch(hint, (value, _, cleanup) => {
  if (!value) return
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('scroll', hideHint, true)
  window.addEventListener('resize', hideHint)
  cleanup(() => {
    document.removeEventListener('pointerdown', outside, true)
    window.removeEventListener('scroll', hideHint, true)
    window.removeEventListener('resize', hideHint)
  })
})
function dismissWithEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !hint.value) return
  event.preventDefault()
  event.stopPropagation()
  hideHint()
}

function copyInHttp(button: HTMLElement) {
  const field = document.createElement('textarea')
  field.value = props.value
  field.readOnly = true
  field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none'
  // Modals trap focus, so the field must live inside the open dialog to be selectable.
  const container = button.closest('dialog, [role="dialog"]') ?? document.body
  container.append(field)
  try {
    field.select()
    field.setSelectionRange(0, field.value.length)
    if (!document.execCommand('copy')) throw new Error('Copy failed')
  } finally {
    field.remove()
    button.focus({ preventScroll: true })
  }
}

async function copy(event: MouseEvent) {
  if (event.detail && suppressClick) { suppressClick = false; return }
  hideHint()
  const button = event.currentTarget as HTMLElement
  clearTimeout(timer)
  const pending = { owner, key: Symbol(), text: '' }
  activeNotice.value = pending
  let text: string
  try {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(props.value)
    } catch { copyInHttp(button) }
    text = '복사완료'
  } catch { text = '복사할 수 없어요' }
  if (activeNotice.value !== pending) return
  const visible = { ...pending, text }
  activeNotice.value = visible
  timer = setTimeout(() => {
    if (activeNotice.value === visible) activeNotice.value = undefined
  }, 1600)
}
onUnmounted(() => {
  hideHint()
  clearTimeout(timer)
  if (activeNotice.value?.owner === owner) activeNotice.value = undefined
})
</script>

<template>
  <span class="copy-value" :class="tone">
    <UButton :variant="tagColor(tone) === 'neutral' ? 'outline' : 'soft'" :color="tagColor(tone)" size="sm" ref="buttonRef" type="button" :class="{ 'has-description': description }" :aria-label="`${value} 복사`" :aria-describedby="hint ? hintId : undefined"
      @click.stop="copy" @pointerenter="hover" @pointerleave="leave" @pointerdown="pointerDown"
      @pointermove="pointerMove" @pointerup="endPress" @pointercancel="endPress"
      @focus="buttonRef?.matches(':focus-visible') && showHint()" @blur="hideHint"
      @keydown="dismissWithEscape" @contextmenu="press && $event.preventDefault()"><slot>{{ value }}</slot></UButton>
    <span v-if="hint" :id="hintId" role="tooltip" class="tag-description"
      :style="{ left: hint.left + 'px', [hint.above ? 'bottom' : 'top']: hint.edge + 'px' }">{{ description }}</span>
    <span v-if="activeNotice?.owner === owner && activeNotice.text" :key="activeNotice.key"
      class="copy-notice" role="status">{{ activeNotice.text }}</span>
  </span>
</template>

<style scoped>
.copy-value{position:relative;display:inline-flex;max-width:100%;vertical-align:middle}
.copy-value button{overflow-wrap:anywhere}
.has-description{touch-action:manipulation;user-select:none;-webkit-touch-callout:none}
.copy-notice{position:absolute;z-index:2;bottom:100%;left:0;white-space:nowrap;padding:4px 8px;background:#101212;color:var(--text);border-radius:6px;font-size:12px;pointer-events:none;opacity:.68;animation:copy-fade 1600ms ease both}
@keyframes copy-fade{0%,100%{opacity:0}10%,82%{opacity:.68}}
@media(prefers-reduced-motion:reduce){.copy-notice{animation:none}}
.tag-description{position:fixed;z-index:20;width:max-content;max-width:min(260px,calc(100vw - 24px));padding:9px 12px;border-radius:9px;background:linear-gradient(var(--copy-background,transparent),var(--copy-background,transparent)),var(--surface-raised);color:inherit;box-shadow:0 6px 24px #0007;line-height:1.5;font-size:13px;overflow-wrap:anywhere;pointer-events:none}
.copy-value.female .tag-description::before{content:'♀ ';margin-inline-end:3px}
.copy-value.male .tag-description::before{content:'♂ ';margin-inline-end:3px}
</style>
