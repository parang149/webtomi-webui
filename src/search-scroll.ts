import { nextTick } from 'vue'

export async function scrollToSearchResults(getTarget: () => HTMLElement | undefined) {
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const target = getTarget()
  if (!target?.getClientRects().length) return
  const menu = target.closest('main')?.querySelector('.main-nav')
  const inset = (menu?.getBoundingClientRect().height ?? 0) + 8
  const top = window.scrollY + target.getBoundingClientRect().top - inset
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
}
