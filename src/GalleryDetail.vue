<script lang="ts">
export type GalleryTag = string | { tag: string; female?: number | string; male?: number | string }
export type ReadBadge = { label: string; color: 'success' | 'primary' }
</script>
<script setup lang="ts">
// Shared detail body for Hitomi search, E-Hentai search and the library.
import { computed } from 'vue'
import CopyValue from './CopyValue.vue'
import { kindColor } from './type-colors'
import { tagClass, tagDescription, tagKey } from './tag-descriptions'
const props = defineProps<{ title: string; cover?: string; placeholder?: string; kind?: string | null; badge?: ReadBadge | null; info: string; rating?: number | null; id?: string | number | null; fields: { name: string; values?: Iterable<string> }[]; tags?: GalleryTag[]; date?: string; refreshable?: boolean; refreshing?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
const shownFields = computed(() => props.fields.map(field => ({ name: field.name, values: [...(field.values ?? [])] })).filter(field => field.values.length))
const prefix = (tag: Exclude<GalleryTag, string>) => tagClass(tag) === 'female' ? '♀ ' : tagClass(tag) === 'male' ? '♂ ' : ''
</script>

<template>
  <div class="detail-content">
    <img v-if="cover" class="detail-cover" :src="cover" alt="표지" referrerpolicy="no-referrer">
    <span v-else class="detail-cover format-placeholder">{{ placeholder || '표지 없음' }}</span>
    <div>
      <h2 class="detail-title">{{ title }}</h2>
      <div v-if="kind || badge || refreshable" class="detail-badges"><UBadge v-if="kind" :color="kindColor(kind)" variant="soft">{{ kind }}</UBadge><UBadge v-if="badge" :color="badge.color" variant="soft">{{ badge.label }}</UBadge><UButton v-if="refreshable" variant="soft" color="neutral" size="xs" icon="i-lucide-refresh-cw" :loading="refreshing" class="ms-auto" @click="emit('refresh')">정보 새로고침</UButton></div>
      <p>{{ info }}<span v-if="rating != null" class="rating"> · ★ {{ rating }}</span></p>
      <dl>
        <template v-if="id"><dt>ID</dt><dd class="metadata-values"><CopyValue :value="String(id)" /></dd></template>
        <template v-for="field in shownFields" :key="field.name"><dt>{{ field.name }}</dt><dd class="metadata-values"><CopyValue v-for="value in field.values" :key="value" :value="value" /></dd></template>
        <template v-if="tags?.length"><dt>태그</dt><dd class="tags">
          <template v-for="tag in tags" :key="typeof tag === 'string' ? tag : tagKey(tag)">
            <CopyValue v-if="typeof tag === 'string'" :value="tag" />
            <CopyValue v-else :tone="tagClass(tag)" :value="tag.tag" :description="tagDescription(tag)">{{ prefix(tag) }}{{ tag.tag }}</CopyValue>
          </template>
        </dd></template>
      </dl>
    </div>
  </div>
  <p v-if="date" class="detail-date">{{ date }}</p>
  <div v-if="$slots.actions" class="detail-actions"><slot name="actions" /></div>
  <slot />
</template>

<style src="./gallery-detail.css"></style>
