import { ref } from 'vue'

export type Notice = {
  id: number
  category: 'download' | 'library' | 'debug'
  message: string
  failed: boolean
  createdAt: number
}

export const notificationHistory = ref<Notice[]>([])
export const activeToasts = ref<Notice[]>([])
let nextId = 0

export function notify(category: Notice['category'], message: string, failed = false) {
  const notice = { id: ++nextId, category, message, failed, createdAt: Date.now() }
  notificationHistory.value = [notice, ...notificationHistory.value].slice(0, 100)
  activeToasts.value = [...activeToasts.value.slice(-3), notice]
}

export function dismissToast(id: number) {
  activeToasts.value = activeToasts.value.filter(notice => notice.id !== id)
}
