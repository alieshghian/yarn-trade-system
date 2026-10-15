import type { GridPage } from './excelGrid'

export const VIRTUAL_PAGE_SIZE = 100
export const VIRTUAL_OVERSCAN = 8

export function virtualQueryKey(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
}

export function virtualRange(total: number, scrollTop: number, viewportHeight: number, rowHeight: number) {
  const first = Math.min(Math.max(0, total - 1), Math.floor(Math.max(0, scrollTop) / rowHeight))
  const last = Math.min(total, first + Math.max(1, Math.ceil(viewportHeight / rowHeight)))
  return { first, last, start: Math.max(0, first - VIRTUAL_OVERSCAN), end: Math.min(total, last + VIRTUAL_OVERSCAN) }
}

// One instance belongs to one complete query generation. Disposing it makes late responses inert.
export class VirtualPageCache<Row> {
  readonly queryKey: string
  total: number | undefined
  readonly metrics = { requests: 0, peakConcurrent: 0, completed: [] as { page: number, prefetch: boolean, latency: number }[] }
  private pages = new Map<number, GridPage<Row>>()
  private pending = new Map<number, { controller: AbortController, promise: Promise<void> }>()
  private queue = new Map<number, boolean>()
  private errors = new Map<number, string>()
  private listeners = new Set<() => void>()
  private wanted = new Set<number>()
  private anchor = 1
  private disposed = false
  private fetchPage: (page: number, signal: AbortSignal) => Promise<GridPage<Row>>
  private maxPages: number
  private concurrency: number

  constructor(queryKey: string, fetchPage: (page: number, signal: AbortSignal) => Promise<GridPage<Row>>, maxPages = 8, concurrency = 2) {
    this.queryKey = queryKey
    this.fetchPage = fetchPage; this.maxPages = maxPages; this.concurrency = concurrency
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  get cacheSize() { return this.pages.size }
  get inFlight() { return this.pending.size }
  row(index: number): Row | undefined { return this.pages.get(Math.floor(index / VIRTUAL_PAGE_SIZE) + 1)?.items[index % VIRTUAL_PAGE_SIZE] }
  error(page: number) { return this.errors.get(page) }
  loadedRows(): Row[] { return [...this.pages.entries()].sort(([a], [b]) => a - b).flatMap(([, page]) => page.items) }

  setViewport(first: number, start: number, end: number) {
    if (this.disposed) return
    this.anchor = Math.floor(first / VIRTUAL_PAGE_SIZE) + 1
    const lastPage = this.total === undefined ? 1 : Math.ceil(this.total / VIRTUAL_PAGE_SIZE)
    const needed = new Set<number>()
    for (let page = Math.floor(start / VIRTUAL_PAGE_SIZE) + 1; page <= Math.floor(Math.max(start, end - 1) / VIRTUAL_PAGE_SIZE) + 1; page++) {
      if (page <= lastPage) needed.add(page)
    }
    const next = this.anchor + 1
    // Row 35 of each page leaves 65 rows of lead time; overscan may demand it earlier.
    if (first % VIRTUAL_PAGE_SIZE >= 34 && next <= lastPage) needed.add(next)
    this.wanted = needed
    for (const page of this.queue.keys()) if (!needed.has(page)) this.queue.delete(page)
    for (const [page, request] of this.pending) if (!needed.has(page) && Math.abs(page - this.anchor) > 1) request.controller.abort()
    for (const page of needed) {
      if (!this.pages.has(page) && !this.pending.has(page) && !this.errors.has(page)) {
        this.queue.set(page, page === next && page > Math.floor(Math.max(start, end - 1) / VIRTUAL_PAGE_SIZE) + 1)
      }
    }
    this.evict()
    this.pump()
  }

  retry(page: number) {
    if (!this.wanted.has(page) || this.pending.has(page) || this.disposed) return
    this.errors.delete(page)
    this.queue.set(page, false)
    this.pump()
    this.emit()
  }

  dispose() {
    this.disposed = true
    for (const request of this.pending.values()) request.controller.abort()
    this.queue.clear(); this.listeners.clear()
  }

  private evict() {
    const distant = [...new Set([...this.pages.keys(), ...this.errors.keys()])].filter(page => !this.wanted.has(page)).sort((a, b) => Math.abs(b - this.anchor) - Math.abs(a - this.anchor))
    while (this.pages.size + this.errors.size > this.maxPages && distant.length) {
      const page = distant.shift()!
      this.pages.delete(page); this.errors.delete(page)
    }
  }
  private emit() { if (!this.disposed) for (const listener of this.listeners) listener() }
  private pump() {
    if (this.disposed) return
    while (this.pending.size < this.concurrency && this.queue.size) {
      const [page, prefetch] = [...this.queue.entries()].sort(([a, ap], [b, bp]) => Number(ap) - Number(bp) || Math.abs(a - this.anchor) - Math.abs(b - this.anchor))[0]
      this.queue.delete(page)
      const controller = new AbortController()
      const started = performance.now()
      this.metrics.requests++
      const promise = Promise.resolve().then(() => this.fetchPage(page, controller.signal)).then(result => {
        if (this.disposed || controller.signal.aborted) return
        this.pages.set(page, result); this.total = result.total; this.errors.delete(page)
        this.metrics.completed.push({ page, prefetch, latency: performance.now() - started })
        if (this.metrics.completed.length > 100) this.metrics.completed.shift()
        this.evict()
      }).catch(error => {
        if (!this.disposed && !controller.signal.aborted) this.errors.set(page, error instanceof Error ? error.message : String(error))
      }).finally(() => {
        this.pending.delete(page)
        if (!this.disposed) { this.pump(); this.emit() }
      })
      this.pending.set(page, { controller, promise })
      this.metrics.peakConcurrent = Math.max(this.metrics.peakConcurrent, this.pending.size)
    }
  }
}
