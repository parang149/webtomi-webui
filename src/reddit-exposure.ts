// Freeze exposure styling until a full list reload; polling/appends cannot promote cards.
export class ExposureSnapshot {
  private captured = new Set<string>()
  private previous = new Set<string>()
  reset() { this.captured.clear(); this.previous.clear() }
  observe(items: { id: string; gallery_seen_at?: number | null }[]) {
    for (const item of items) {
      if (this.captured.has(item.id)) continue
      this.captured.add(item.id)
      if (item.gallery_seen_at) this.previous.add(item.id)
    }
    return new Set(this.previous)
  }
}
