// One bottom pull, released to load; separate gestures never accumulate.
// Shared by BottomPull.vue; no network, media or batch-size dependencies.
export class BottomScrollGate {
  distance = 0
  get progress() { return Math.min(1, this.distance / 175) }
  get offset() { return 85 * (1 - Math.exp(-this.distance / 100)) }
  private wheelAt = -Infinity
  private wheelArmed = false
  private freshWheelRequired = false
  private touch: { x: number; y: number } | null = null

  reset() {
    this.distance = 0
    this.wheelArmed = false
    this.touch = null
  }

  release() { const ready = this.progress >= 1; this.reset(); return ready }
  interrupt(now: number) { this.reset(); this.wheelAt = now; this.freshWheelRequired = true }

  wheel(delta: number, mode: number, now: number, bottom: boolean) {
    const gap = now - this.wheelAt
    this.wheelAt = now
    if (delta < 0 || !bottom) { this.reset(); return false }
    // After interruption, even large/discrete tail events must first go idle.
    if (this.freshWheelRequired) {
      if (gap <= 180) return false
      this.freshWheelRequired = false
    }
    // Trackpad inertia arriving from above stays ignored until a new gesture.
    // Discrete mouse notches can arm individually without a long pause.
    if (gap > 180 || mode === 1 || (gap >= 40 && Math.abs(delta) >= 80)) this.wheelArmed = true
    if (!this.wheelArmed) return false
    const pixels = delta * (mode === 1 ? 40 : mode === 2 ? 400 : 1)
    // Accelerated wheel notches must not suddenly add a larger step.
    if (Number.isFinite(pixels)) this.distance = Math.min(300, this.distance + Math.min(pixels, 70))
    return false
  }

  beginTouch(x: number, y: number, bottom: boolean) {
    this.reset()
    this.touch = bottom ? { x, y } : null
  }

  moveTouch(x: number, y: number, bottom: boolean) {
    if (!bottom) { this.reset(); return false }
    if (!this.touch) return false
    const dx = x - this.touch.x, dy = this.touch.y - y
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { this.reset(); return false }
    this.distance = Math.max(0, Math.min(300, dy))
    return false
  }

  endTouch() { return this.release() }
}
