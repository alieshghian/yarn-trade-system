import type { FormSchemaDraft } from './formSchema'

/** Evidence is produced by integration tests, never by saving a design. */
export const operationalAcceptanceVersion = 1
export const operationalFormChecks = ['runtime-controls', 'keyboard-and-focus', 'approved-appearance', 'permissions', 'save-reload'] as const
export const operationalTableChecks = ['server-paging', 'server-search', 'server-filters', 'server-sort', 'server-filter-options', 'stable-page-order', 'bounded-browser-rendering', 'large-dataset', 'row-selection-binding', 'sticky-header-controls'] as const
export type AcceptanceCheck = { status: 'passed' | 'failed' | 'blocked'; artifact: string }
export type OperationalAcceptanceEvidence = {
  version: number; formId: string; releaseId: string; digest: string
  form: Partial<Record<typeof operationalFormChecks[number], AcceptanceCheck>>
  tables: Record<string, Partial<Record<typeof operationalTableChecks[number], AcceptanceCheck>>>
  hierarchy?: Partial<Record<'lazy-branches' | 'search-path-loading' | 'copy-without-full-tree', AcceptanceCheck>>
}
type Schema = Pick<FormSchemaDraft, 'id' | 'tables' | 'fields'>
export function operationalAcceptanceRequirements(schema: Schema) {
  return {
    version: operationalAcceptanceVersion,
    form: [...operationalFormChecks],
    tables: (schema.tables ?? []).map(table => ({ id: table.id, checks: [...operationalTableChecks] })),
    hierarchy: schema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') ? ['lazy-branches', 'search-path-loading', 'copy-without-full-tree'] : [],
  }
}
export function operationalAcceptanceBlockers(schema: Schema, releaseId: string, digest: string, evidence?: OperationalAcceptanceEvidence): string[] {
  if (!evidence || evidence.version !== operationalAcceptanceVersion || evidence.formId !== schema.id || evidence.releaseId !== releaseId || evidence.digest !== digest) return ['runtime-evidence-missing-or-stale']
  const required = operationalAcceptanceRequirements(schema), blockers: string[] = []
  const verify = (scope: string, keys: readonly string[], checks: Record<string, AcceptanceCheck | undefined> | undefined) => {
    for (const key of keys) if (checks?.[key]?.status !== 'passed' || !checks[key]!.artifact.trim()) blockers.push(scope + ':' + key)
  }
  verify('form', required.form, evidence.form)
  for (const table of required.tables) verify(table.id, table.checks, evidence.tables?.[table.id])
  verify('hierarchy', required.hierarchy, evidence.hierarchy)
  return blockers
}
