import { ref } from 'vue'

export type VaultItem = {
  id: string; url: string; title: string; status: 'unread' | 'reviewing' | 'done'; note: string; tags: string[]
  createdAt: number; updatedAt: number; completedAt: number | null; deletedAt: number | null
  supjav?: { id?: string; thumb?: string | null; date?: string | null }
}
export type VaultStatus = { token: string | null; count: number; clients: { id: string; name: string; last_seen: number }[] }

/** 탭 보관함 연동(토큰)이 켜져 있으면 주 메뉴에 TAPS 탭을 보인다. */
export const tapsEnabled = ref(false)

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
  return body as T
}

export async function loadTaps() {
  const result = await call<{ enabled: boolean; items: VaultItem[] }>('/api/taps/items')
  tapsEnabled.value = result.enabled
  return result.items
}
export function editTaps(id: string, fields: Partial<Pick<VaultItem, 'status' | 'note' | 'tags' | 'deletedAt' | 'completedAt'>>) {
  return call<VaultItem>(`/api/taps/items/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) })
}
export async function vaultSettings(method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  const status = await call<VaultStatus>('/api/settings/vault', { method })
  tapsEnabled.value = !!status.token
  return status
}
