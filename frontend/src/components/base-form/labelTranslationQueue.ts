export type LabelLocale = 'fa' | 'en' | 'zh'
export type LabelTranslations = Partial<Record<LabelLocale, string>>
export type LabelTranslationStatus = 'pending' | 'online' | 'unconfigured' | 'error'
export const labelTranslationContract = {
  id: 'laboratory.action-label-translation', version: 2,
  locales: ['fa', 'en', 'zh'], dictionaryFirst: true, debounceMs: 500,
  endpoint: '/api/laboratory/label-translations', provider: 'server-configured-MyMemory-or-Microsoft-Translator',
  configurationRequired: true, secretsInExport: false,
  preserveManualLabels: true, provenance: ['manualLabels', 'autoLabels'],
  staleResponses: 'ignore-and-cancel', failures: 'retain-labels-show-needs-review',
  scope: 'shared-laboratory-action-label-editor',
} as const

/** Debounced, cancellable work per document/action. Responses never apply out of order. */
export function createLabelTranslationQueue(request: (text: string, source: LabelLocale, signal: AbortSignal) => Promise<LabelTranslations>, delay = 500) {
  const pending = new Map<string, { timer?: ReturnType<typeof setTimeout>; abort: AbortController }>()
  const cache = new Map<string, LabelTranslations>()
  const cancel = (key: string) => { const job = pending.get(key); if (job) { clearTimeout(job.timer); job.abort.abort(); pending.delete(key) } }
  return {
    cancel,
    dispose: () => { for (const key of pending.keys()) cancel(key); cache.clear() },
    schedule(key: string, text: string, source: LabelLocale, apply: (value: LabelTranslations) => void, status: (value: LabelTranslationStatus) => void) {
      cancel(key)
      if (!text.trim()) return
      const job = { abort: new AbortController(), timer: undefined as ReturnType<typeof setTimeout> | undefined }
      pending.set(key, job); status('pending')
      job.timer = setTimeout(async () => {
        try {
          const cacheKey = source + ':' + text
          const translations = cache.get(cacheKey) ?? await request(text, source, job.abort.signal)
          if (pending.get(key) !== job || job.abort.signal.aborted) return
          const targets = (['fa', 'en', 'zh'] as const).filter(locale => locale !== source)
          if (!targets.every(locale => typeof translations[locale] === 'string' && translations[locale]!.trim().length > 0 && translations[locale]!.length <= 160)) throw Error('Invalid translation response')
          const clean = Object.fromEntries(targets.map(locale => [locale, translations[locale]])) as LabelTranslations
          if (cache.size >= 128) cache.delete(cache.keys().next().value!)
          cache.set(cacheKey, clean); apply(clean); status('online')
        } catch (error) {
          if (pending.get(key) !== job || job.abort.signal.aborted) return
          const code = (error as { details?: { code?: string } })?.details?.code
          status(code === 'TRANSLATION_NOT_CONFIGURED' ? 'unconfigured' : 'error')
        } finally { if (pending.get(key) === job) pending.delete(key) }
      }, delay)
    },
  }
}
