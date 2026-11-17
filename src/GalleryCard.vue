<script setup lang="ts">
// Shared result card for Hitomi search, E-Hentai search and the library.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CopyValue from './CopyValue.vue'
import { kindColor } from './type-colors'
import { tagClass, tagDescription, tagKey } from './tag-descriptions'
import type { GalleryTag, ReadBadge } from './GalleryDetail.vue'
const props = defineProps<{ layout: 'grid' | 'list'; title: string; cover?: string; placeholder?: string; downloaded?: boolean; info: string; id?: string | number | null; kind?: string | null; badge?: ReadBadge | null; rating?: number | null; artists?: string[]; groups?: string[]; tags?: GalleryTag[]; date?: string }>()
const emit = defineEmits<{ detail: []; coverError: [string] }>()
const TAG_PREVIEW = 4
const expanded = ref(false), coverFailed = ref(false)
// Our own cover endpoint can fail briefly; retry it twice before showing the placeholder.
const coverRetry = ref(0)
let retryTimer: ReturnType<typeof setTimeout> | undefined
watch(() => props.cover, () => { coverFailed.value = false; coverRetry.value = 0; clearTimeout(retryTimer) })
onBeforeUnmount(() => clearTimeout(retryTimer))
const coverSrc = computed(() => !props.cover || !coverRetry.value ? props.cover : `${props.cover}${props.cover.includes('?') ? '&' : '?'}retry=${coverRetry.value}`)
function coverLoadFailed() {
  const cover = props.cover
  if (!cover) return
  if (cover.startsWith('/') && coverRetry.value < 2) {
    const wait = coverRetry.value ? 5000 : 2000
    retryTimer = setTimeout(() => { if (props.cover === cover) coverRetry.value++ }, wait)
    return
  }
  coverFailed.value = true; emit('coverError', cover)
}
const shownTags = computed(() => expanded.value ? props.tags ?? [] : (props.tags ?? []).slice(0, TAG_PREVIEW))
const listUi = { body: 'grid grid-cols-[90px_minmax(0,1fr)] sm:grid-cols-[140px_minmax(0,1fr)] items-start gap-x-3 sm:gap-x-[18px] gap-y-2 p-2.5 sm:p-4' }
const gridUi = { root: 'flex flex-col', body: 'flex-1 flex flex-col p-2.5 sm:p-4' }
</script>

<template>
  <UCard :ui="layout === 'list' ? listUi : gridUi">
    <UButton variant="ghost" color="neutral" class="cover-link" :aria-label="`${title} 상세 보기`" @click="emit('detail')">
      <img v-if="cover && !coverFailed" :src="coverSrc" alt="" loading="lazy" referrerpolicy="no-referrer" @error="coverLoadFailed">
      <span v-else :class="{ 'format-placeholder': placeholder }">{{ placeholder || '표지 없음' }}</span>
      <span v-if="downloaded" class="download-check" title="다운로드 완료" aria-label="다운로드 완료" role="img">✓</span>
    </UButton>
    <div class="result-body">
      <h3><UButton variant="link" color="neutral" class="title-link p-0 text-base sm:text-lg font-bold text-highlighted" @click="emit('detail')">{{ title }}</UButton></h3>
      <small>{{ info }} <UBadge v-if="kind" class="kind" :color="kindColor(kind)" variant="soft" size="sm">{{ kind }}</UBadge> <UBadge v-if="badge" class="kind" :color="badge.color" variant="soft" size="sm">{{ badge.label }}</UBadge><span v-if="rating != null" class="rating"> ★ {{ rating }}</span></small>
      <div v-if="id" class="meta-row"><span class="meta-label">ID</span><div><CopyValue :value="String(id)" /></div></div>
      <div v-if="artists?.length" class="meta-row"><span class="meta-label">작가</span><div><CopyValue v-for="artist in artists" :key="artist" :value="artist" /></div></div>
      <div v-if="groups?.length" class="meta-row"><span class="meta-label">그룹</span><div><CopyValue v-for="group in groups" :key="group" :value="group" /></div></div>
      <div v-if="layout === 'list' && tags?.length" class="meta-row"><span class="meta-label">태그</span><div class="tags">
        <template v-for="tag in shownTags" :key="typeof tag === 'string' ? tag : tagKey(tag)">
          <CopyValue v-if="typeof tag === 'string'" :value="tag" />
          <CopyValue v-else :tone="tagClass(tag)" :value="tag.tag" :description="tagDescription(tag)" />
        </template>
        <UButton v-if="!expanded && tags.length > TAG_PREVIEW" variant="ghost" color="neutral" size="xs" @click="expanded = true">+{{ tags.length - TAG_PREVIEW }}개 더</UButton>
      </div></div>
      <slot name="notice" />
      <div class="result-foot"><small v-if="date">{{ date }}</small><div class="result-actions"><slot /></div></div>
    </div>
  </UCard>
</template>

<style src="./search-results.css"></style>
