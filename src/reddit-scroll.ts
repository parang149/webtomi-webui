// Only deliberate input at the bottom contributes; scrolling into view never loads.
export class BottomScrollGate {
  progress = 0
  private latched = false
  private wheelAt = -Infinity
  private wheelArmed = false
  private touch: { x: number; y: number; startY: number } | null = null

  reset() {
    this.progress = 0
    this.latched = false
    this.wheelArmed = false
    this.touch = null
  }

  private add(fraction: number) {
    if (this.latched || !Number.isFinite(fraction) || fraction <= 0) return false
    this.progress = Math.min(1, this.progress + fraction)
    if (this.progress < 1 - 1e-8) return false
    this.progress = 1
    this.latched = true
    return true
  }

  wheel(delta: number, mode: number, now: number, bottom: boolean) {
    const gap = now - this.wheelAt
    this.wheelAt = now
    if (delta < 0 || !bottom) { this.reset(); return false }
    // Trackpad inertia arriving from above stays ignored until a new gesture.
    // Discrete mouse notches can arm individually without a long pause.
    if (gap > 180 || mode === 1 || (gap >= 40 && Math.abs(delta) >= 80)) this.wheelArmed = true
    if (!this.wheelArmed) return false
    const pixels = delta * (mode === 1 ? 40 : mode === 2 ? 400 : 1)
    return this.add(Math.min(pixels, 120) / 400)
  }

  beginTouch(x: number, y: number, bottom: boolean) {
    this.touch = bottom ? { x, y, startY: y } : null
  }

  moveTouch(x: number, y: number, bottom: boolean) {
    if (!bottom) { this.reset(); return false }
    if (!this.touch) return false
    const dx = x - this.touch.x, dy = this.touch.y - y
    const totalY = this.touch.startY - y
    this.touch = { ...this.touch, y }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(totalY)) { this.touch = null; return false }
    if (dy < 0) { this.reset(); return false }
    return this.add(dy / 200)
  }

  endTouch() { this.touch = null }
}
