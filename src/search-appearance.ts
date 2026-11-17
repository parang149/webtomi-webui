import { ref, watch } from 'vue'

const key = 'search-filter-layout'
export const filterLayout = ref<'classic' | 'compact'>(
  localStorage.getItem(key) === 'compact' ? 'compact' : 'classic',
)
watch(filterLayout, layout => localStorage.setItem(key, layout))

const excludeGayTagsKey = 'search-exclude-gay-tags-default'
export const excludeGayTagsDefault = ref(localStorage.getItem(excludeGayTagsKey) === 'true')
watch(excludeGayTagsDefault, value => localStorage.setItem(excludeGayTagsKey, String(value)))

const excludeAiGeneratedKey = 'ehentai-exclude-ai-generated-default'
export const excludeAiGeneratedDefault = ref(localStorage.getItem(excludeAiGeneratedKey) === 'true')
watch(excludeAiGeneratedDefault, value => localStorage.setItem(excludeAiGeneratedKey, String(value)))
