import type {FormStorage} from './laboratoryFormDraftState'

export type DesignLifecycle = 'active' | 'archived' | 'removed'
type Entry = {state: DesignLifecycle; changedAt: string}
export const formDesignLifecycleKey = (userId?: string) => `yarn-trade:form-design-lifecycle:v1:${encodeURIComponent(userId || 'developer-local')}`
export const laboratoryDesignLifecycleContract = {
  id: 'laboratory.design-lifecycle', version: 2,
  archivePreservesDesign: true, removalIsRecoverable: true,
  operationalDataUnaffected: true, hiddenDesignCannotRequestIntegration: true,
  identity: 'stable-form-id', showSchemaVersionAndLastEdit: true,
  reopenCreatesEdition: false, newEditionRequiresExplicitAction: true,
  recoveryKeepsDocumentIdentity: true, showCurrentDesign: true,
  legacyRouteDuplicates: 'collapsed-history-without-deletion'
} as const

/** Lifecycle is separate from the schema, approval and recovery journal. */
export function readDesignLifecycles(storage: FormStorage | undefined, userId?: string): Record<string, Entry> | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(formDesignLifecycleKey(userId))
    if (raw === null) return {}
    const value = JSON.parse(raw)
    if (value?.version !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) return null
    if (Object.values(value.entries).some((entry: any) => !entry || !['active', 'archived', 'removed'].includes(entry.state) || typeof entry.changedAt !== 'string')) return null
    return value.entries
  } catch { return null }
}

export function setDesignLifecycle(storage: FormStorage | undefined, userId: string | undefined, formId: string, state: DesignLifecycle): boolean {
  const entries = readDesignLifecycles(storage, userId)
  if (!storage || !entries || !formId) return false
  try {
    storage.setItem(formDesignLifecycleKey(userId), JSON.stringify({version: 1, entries: {...entries, [formId]: {state, changedAt: new Date().toISOString()}}}))
    return true
  } catch { return false }
}

/** Invalid lifecycle storage fails closed for publication, without deleting records. */
export function isDesignAvailable(storage: FormStorage | undefined, userId: string | undefined, formId: string): boolean {
  const entries = readDesignLifecycles(storage, userId)
  return entries !== null && (!entries[formId] || entries[formId].state === 'active')
}
