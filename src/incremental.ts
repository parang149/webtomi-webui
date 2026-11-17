// Render long card lists in steps so layout switches and filters stay fast.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export const RENDER_STEP = 24

/** Bring the list controls back into view when it was scrolled past them. */
export function scrollToControls(selector: string) {
  void nextTick(() => {
    const element = document.querySelector(selector)
    if (element && element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: 'start' })
  })
}

/** `resetOn` returns the filter/sort/layout inputs; changing them starts again from the first step. */
export function useIncremental<T>(items: () => T[], resetOn: () => unknown) {
  const count = ref(RENDER_STEP)
  const sentinel = ref<HTMLElement | null>(null)
  const shown = computed(() => items().slice(0, count.value))
  const more = computed(() => items().length > count.value)
  let observer: IntersectionObserver | undefined
  watch(resetOn, () => { count.value = RENDER_STEP }, { deep: true })
  watch(sentinel, element => {
    observer?.disconnect()
    if (!element) return
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) count.value += RENDER_STEP
    }, { rootMargin: '600px 0px' })
    observer.observe(element)
  })
  // Re-observe after each step so a still-visible sentinel loads the next one too.
  watch(count, () => nextTick(() => {
    if (observer && sentinel.value) { observer.unobserve(sentinel.value); observer.observe(sentinel.value) }
  }))
  onBeforeUnmount(() => observer?.disconnect())
  return { shown, more, sentinel }
}
