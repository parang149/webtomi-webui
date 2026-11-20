// Temporary load decoration; no persisted reading/NEW state depends on it.
export class RedditLoadHighlight {
  private baseline?: Set<string>
  private added = new Set<string>()
  ids = new Set<string>()
  begin(ids: string[]) { this.baseline = new Set(ids); this.added = new Set() }
  observe(ids: string[]) {
    if (!this.baseline) return this.ids
    for (const id of ids) if (!this.baseline.has(id)) this.added.add(id)
    if (this.added.size) this.ids = new Set(this.added)
    return this.ids
  }
  finish(success: boolean) {
    if (this.baseline && success) this.ids = new Set(this.added)
    this.baseline = undefined
    return this.ids
  }
  clear() { this.baseline = undefined; this.added.clear(); this.ids = new Set() }
}
