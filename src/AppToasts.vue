<script setup lang="ts">
import { watch } from 'vue'
import { onMounted, onUnmounted } from 'vue'
import { activeToasts, notify } from './notifications'

const toast = useToast()
{
  watch(activeToasts, (notices, previous) => {
    const existing = new Set(previous.map(notice => notice.id))
    for (const notice of notices) {
      if (existing.has(notice.id)) continue
      toast.add({ title: notice.message, color: notice.failed ? 'error' : 'success', icon: notice.failed ? 'i-lucide-circle-alert' : 'i-lucide-circle-check', duration: notice.failed ? 6000 : 3000 })
    }
  })
}

type Job = { source?: string; id: number; title: string; status: string }
let previous: Map<string, string> | undefined
let timer: ReturnType<typeof setTimeout>
let stopped = false

async function poll() {
  try {
    const response = await fetch('/api/downloads')
    if (!response.ok || stopped) return
    const jobs: Job[] = await response.json()
    if (stopped) return
    const current = new Map<string, string>()
    for (const job of jobs) {
      const key = `${job.source ?? 'hitomi'}:${job.id}`
      current.set(key, job.status)
      if (!previous || previous.get(key) === job.status) continue
      if (job.status === 'completed') notify('download', `다운로드 완료 · ${job.title}`)
      if (job.status === 'failed') notify('download', `다운로드 실패 · ${job.title}`, true)
    }
    previous = current
  } catch {
    // Keep the last successful snapshot across connection interruptions.
  } finally {
    if (!stopped) timer = setTimeout(poll, 2000)
  }
}

onMounted(() => {
  void poll()
})
onUnmounted(() => { stopped = true; clearTimeout(timer); activeToasts.value = [] })
</script>

<template><!-- Toasts render through UApp. --></template>


