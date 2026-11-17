// Gallery info storage mode (Settings > Debug). "week" also shows the detail refresh button.
import { ref } from 'vue'

export type InfoCacheMode = 'current' | 'week'
export const infoCacheMode = ref<InfoCacheMode>('current')

export async function loadInfoCacheMode() {
  try {
    const response = await fetch('/api/settings/info-cache')
    if (response.ok) infoCacheMode.value = (await response.json()).mode
  } catch { /* keep the default */ }
}

export async function saveInfoCacheMode(mode: InfoCacheMode) {
  const response = await fetch('/api/settings/info-cache', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) })
  if (!response.ok) throw new Error('저장하지 못했습니다.')
  infoCacheMode.value = mode
}
