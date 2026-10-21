import type { DesignerCanvas, DesignerDraft, DesignerRect, DesignerTableSettings } from './designer.ts'
import type { FormSchemaDraft } from './formSchema.ts'

export const tableDesignerKeys = ['filterPopupFontSize', 'gridSearchPosition', 'tableFont', 'tableHeaderHeight', 'tableColumns', 'tableHeaders'] as const
export const designerRectStyle = (rect?: DesignerRect) => rect ? { position: 'absolute' as const, left: rect.left, top: rect.top, width: rect.width, height: rect.height, transform: 'none', margin: 0 } : {}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Merge per-property overrides, preserving inheritance for unspecified properties. */
export function mergeFormSettings<T>(baseline: T, overrides: unknown): T {
  if (!object(baseline) || !object(overrides)) return (overrides === undefined ? baseline : overrides) as T
  const result: Record<string, unknown> = { ...baseline }
  for (const [key, value] of Object.entries(overrides)) result[key] = mergeFormSettings(result[key], value)
  return result as T
}

export function formSettingsDifference(baseline: unknown, current: unknown): unknown {
  if (JSON.stringify(baseline) === JSON.stringify(current)) return undefined
  if (!object(current) || !object(baseline)) return current
  const difference: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(current)) {
    const changed = formSettingsDifference(baseline[key], value)
    if (changed !== undefined) difference[key] = changed
  }
  return Object.keys(difference).length ? difference : undefined
}

export function designerDraftForTable(draft: DesignerDraft, tableId?: string): DesignerDraft {
  return tableId ? mergeFormSettings(draft, draft.tables?.[tableId]) : draft
}

export function updateTableDesigner(draft: DesignerDraft, tableId: string | undefined, update: (table: DesignerDraft) => DesignerDraft): DesignerDraft {
  if (!tableId) return update(draft)
  const changed = update(designerDraftForTable(draft, tableId))
  const settings: DesignerTableSettings = {}
  for (const key of tableDesignerKeys) {
    const difference = formSettingsDifference(draft[key], changed[key])
    if (difference !== undefined) Object.assign(settings, { [key]: difference })
  }
  return { ...draft, tables: { ...draft.tables, [tableId]: settings } }
}

export function designerDraftForEditor(draft: DesignerDraft, schema: FormSchemaDraft, sectionId?: string): DesignerDraft {
  if (draft.layoutMode === 'schema') return { ...draft, canvas: undefined }
  const firstEditor = schema.sections.find(section => section.kind === 'editor')?.id
  const stored = sectionId ? draft.sectionCanvases?.[sectionId] ?? (sectionId === firstEditor ? draft.canvas : undefined) : draft.canvas
  const ids = new Set(schema.fields.filter(field => !sectionId || field.sectionId === sectionId).map(field => field.id))
  const canvas: DesignerCanvas | undefined = stored ? { ...stored, fields: Object.fromEntries(Object.entries(stored.fields).filter(([id]) => ids.has(id))) } : undefined
  // Project new fields below saved geometry without moving or overwriting surviving fields.
  if (canvas) for (const id of ids) {
    if (canvas.fields[id]) continue
    const top = Math.max(12, ...Object.values(canvas.fields).flatMap(field => Object.values(field).map(rect => rect.top + rect.height + 12)))
    const existing=Object.values(canvas.fields).map(field=>field.input.left)
    const left=Math.max(12,Math.min(canvas.width-60,existing.length?Math.min(...existing):12))
    const width = Math.max(48, Math.min(320, canvas.width - left - 12))
    canvas.fields[id] = { label: { left, top, width, height: 24 }, input: { left, top: top + 28, width, height: 36 } }
    canvas.height = Math.max(canvas.height, top + 76)
  }
  return { ...draft, canvas }
}
