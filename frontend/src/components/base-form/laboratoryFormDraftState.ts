import { emptyDesignerDraft, validateDesignerDraft, type DesignerDraft } from './designer.ts'
import type { FormSchemaDraft, FormSchemaField, FormSchemaLocale, FormSchemaMode } from './formSchema'
import { formSettingsDifference, mergeFormSettings } from './formDocumentDesigner.ts'
import { columnSourceFields } from './formTableStructure.ts'

export const laboratoryManagedFormsKey = 'yarn-trade:form-laboratory-managed-forms:v1'
export const laboratoryTemplateFormId = 'form-laboratory.persons-synthetic'
export const laboratoryTemplateVersion = 1

export type ManagedFormMode = Exclude<FormSchemaMode, 'combined'>
export type ManagedFormFrame = { device: 'desktop' | 'tablet' | 'mobile'; width: number; height: number | null; fitToPage: boolean }
export type ManagedFormCustomization = { colors: boolean; typography: boolean; formSize: boolean; tablePresentation: boolean }
export type ManagedLaboratoryForm = {
  id: string
  schema: FormSchemaDraft
  frame: ManagedFormFrame
  template: { formId: string; version: number; schema?: FormSchemaDraft; frame?: ManagedFormFrame }
  designerOverrides: Partial<DesignerDraft>
  customization: ManagedFormCustomization
  structurePermissions: { fieldAddRemove: false; fieldTypeChange: false; tableSchemaChange: false; businessBehaviorChange: false }
}
export type ManagedTemplateRevision = { version: number; schema: FormSchemaDraft; designer: DesignerDraft; frame: ManagedFormFrame; createdAt: string }
export type ManagedLaboratoryForms = { version: 1; activeFormId: string | null; forms: ManagedLaboratoryForm[]; templateRevision?: ManagedTemplateRevision; templateRevisions?: ManagedTemplateRevision[]; catalogTemplates?: Record<string, ManagedTemplateRevision> }
export type FormStorage = Pick<Storage, 'getItem' | 'setItem'>

export type FormSchemaGridPlacement = { columns: number; columnStart: number; columnSpan: number; rowStart?: number }
export type ManagedFormStructureHistory<T = FormSchemaField[]> = { past: T[]; present: T; future: T[] }

const defaultCustomization: ManagedFormCustomization = { colors: false, typography: false, formSize: false, tablePresentation: false }
const lockedStructure = { fieldAddRemove: false, fieldTypeChange: false, tableSchemaChange: false, businessBehaviorChange: false } as const

const laboratoryFieldGridPlacements: Readonly<Record<string, FormSchemaGridPlacement>> = {
  personCode: { columns: 20, columnStart: 1, columnSpan: 2, rowStart: 1 },
  titleId: { columns: 20, columnStart: 3, columnSpan: 3, rowStart: 1 },
  firstName: { columns: 20, columnStart: 6, columnSpan: 5, rowStart: 1 },
  lastName: { columns: 20, columnStart: 11, columnSpan: 5, rowStart: 1 },
  jobId: { columns: 20, columnStart: 16, columnSpan: 5, rowStart: 1 },
  nationalityId: { columns: 20, columnStart: 1, columnSpan: 5, rowStart: 2 },
  phone: { columns: 20, columnStart: 6, columnSpan: 5, rowStart: 2 },
  mobile: { columns: 20, columnStart: 11, columnSpan: 5, rowStart: 2 },
  disabledExample: { columns: 20, columnStart: 16, columnSpan: 5, rowStart: 2 },
  address: { columns: 20, columnStart: 1, columnSpan: 10, rowStart: 3 },
  notes: { columns: 20, columnStart: 11, columnSpan: 10, rowStart: 3 },
  errorExample: { columns: 20, columnStart: 1, columnSpan: 10, rowStart: 4 }
}

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

function fieldGridPlacement(field: FormSchemaField): FormSchemaGridPlacement | undefined {
  const layout = field.settings?.layout
  if (!record(layout) || !record(layout.grid)) return undefined
  const { columns, columnStart, columnSpan, rowStart } = layout.grid
  if (typeof columns !== 'number' || typeof columnStart !== 'number' || typeof columnSpan !== 'number' || ![columns, columnStart, columnSpan].every(Number.isInteger)) return undefined
  if (columns < 1 || columns > 40 || columnStart < 1 || columnSpan < 1 || columnStart + columnSpan - 1 > columns) return undefined
  return { columns, columnStart, columnSpan, ...(typeof rowStart === 'number' && Number.isInteger(rowStart) && rowStart > 0 && rowStart <= 1000 ? { rowStart } : {}) }
}

/** Adds the versioned Laboratory template grid contract only where a saved schema has none. */
export function ensureLaboratoryTemplateFieldLayout(schema: FormSchemaDraft): FormSchemaDraft {
  if (schema.templateFormId !== laboratoryTemplateFormId) return schema
  const savedPlacements = schema.fields.map(fieldGridPlacement).filter((value): value is FormSchemaGridPlacement => value !== undefined)
  const hadStoredGridPositions = savedPlacements.length > 0
  const storedGridColumns = savedPlacements.reduce((maximum, placement) => Math.max(maximum, placement.columns), 0)
  let fieldsChanged = false
  const fields = schema.fields.map(field => {
    const fallback = laboratoryFieldGridPlacements[field.id]
    const current = fieldGridPlacement(field)
    if (!fallback) return field
    if (current) {
      if (current.rowStart || current.columns !== fallback.columns || current.columnStart !== fallback.columnStart || current.columnSpan !== fallback.columnSpan) return field
      fieldsChanged = true
      const layout = record(field.settings?.layout) ? field.settings.layout : {}
      const grid = record(layout.grid) ? layout.grid : {}
      return { ...field, settings: { ...field.settings, layout: { ...layout, grid: { ...grid, rowStart: fallback.rowStart } } } }
    }
    fieldsChanged = true
    const layout = record(field.settings?.layout) ? field.settings.layout : {}
    return { ...field, settings: { ...field.settings, layout: { ...layout, grid: fallback } } }
  })
  const hasCustomTemplatePlacement = schema.fields.some(field => {
    const expected = laboratoryFieldGridPlacements[field.id]
    const placement = fieldGridPlacement(field)
    return Boolean(expected && placement && (placement.columns !== expected.columns || placement.columnStart !== expected.columnStart || placement.columnSpan !== expected.columnSpan || (placement.rowStart !== undefined && placement.rowStart !== expected.rowStart)))
  })
  let sectionsChanged = false
  const sections = schema.sections.map(section => {
    if (section.kind !== 'editor') return section
    const columns = hadStoredGridPositions ? section.layout?.columns ?? storedGridColumns : 20
    const direction = hadStoredGridPositions ? section.layout?.direction ?? 'horizontal' : 'horizontal'
    const gap = section.layout?.gap ?? 12
    const minimumWidth = section.layout?.minimumWidth ?? (hasCustomTemplatePlacement ? undefined : 1440)
    if (columns === section.layout?.columns && direction === section.layout?.direction && gap === section.layout?.gap && minimumWidth === section.layout?.minimumWidth) return section
    sectionsChanged = true
    return { ...section, layout: { ...section.layout, columns, direction, gap, ...(minimumWidth ? { minimumWidth } : {}) } }
  })
  return fieldsChanged || sectionsChanged ? { ...schema, fields, sections } : schema
}

export function formSchemaGridColumnCount(schema: FormSchemaDraft): number | undefined {
  const positionedColumns = schema.fields.flatMap(field => {
    const placement = fieldGridPlacement(field)
    return placement ? [placement.columns] : []
  })
  if (positionedColumns.length) return Math.max(...positionedColumns)
  const configured = schema.sections.find(section => section.kind === 'editor')?.layout?.columns
  if (typeof configured === 'number' && Number.isInteger(configured) && configured > 0 && configured <= 40) return configured
  return undefined
}

/** Inline placement is consumed by the shared grid renderer, including on legacy drafts. */
export function formSchemaFieldGridStyle(schema: FormSchemaDraft, fieldId: string): { gridColumn: string; gridRow?: string } | undefined {
  const field = schema.fields.find(item => item.id === fieldId)
  const placement = field && fieldGridPlacement(field)
  return placement ? { gridColumn: `${placement.columnStart} / span ${placement.columnSpan}`, ...(placement.rowStart ? { gridRow: `${placement.rowStart} / span 1` } : {}) } : undefined
}

/** Field structure history is separate from designer appearance and frame settings. */
export function createManagedFormStructureHistory<T>(fields: T): ManagedFormStructureHistory<T> {
  return { past: [], present: fields, future: [] }
}

export function commitManagedFormStructure<T>(history: ManagedFormStructureHistory<T>, fields: T): ManagedFormStructureHistory<T> {
  if (fields === history.present) return history
  return { past: [...history.past.slice(-49), history.present], present: fields, future: [] }
}

export function undoManagedFormStructure<T>(history: ManagedFormStructureHistory<T>): ManagedFormStructureHistory<T> {
  if (!history.past.length) return history
  return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] }
}

export function redoManagedFormStructure<T>(history: ManagedFormStructureHistory<T>): ManagedFormStructureHistory<T> {
  if (!history.future.length) return history
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) }
}

export function renameManagedFormField(schema: FormSchemaDraft, fieldId: string, locale: FormSchemaLocale, label: string): FormSchemaDraft {
  const field = schema.fields.find(item => item.id === fieldId)
  if (!field || field.label[locale] === label) return schema
  const nextLabel = { ...field.label, [locale]: label }
  const tables = schema.tables?.map(table => ({ ...table, columns: table.columns.map(column => {
    const sources = columnSourceFields(schema,column)
    return sources.includes(fieldId) && !column.sourceFieldLabelSnapshot?.[fieldId] ? { ...column, sourceFieldLabelSnapshot: { ...column.sourceFieldLabelSnapshot, [fieldId]: { ...field.label } } } : column
  }) }))
  return { ...schema, ...(tables ? { tables } : {}), fields: schema.fields.map(item => item.id === fieldId ? { ...item, label: nextLabel } : item) }
}

export function removeManagedFormField(schema: FormSchemaDraft, fieldId: string): FormSchemaDraft {
  if (!schema.fields.some(field => field.id === fieldId)) return schema
  return { ...schema, fields: schema.fields.filter(field => field.id !== fieldId) }
}

export function managedLaboratoryFormsStorageKey(userId?: string): string {
  return `${laboratoryManagedFormsKey}:${encodeURIComponent(userId || 'developer-local')}`
}

export function createManagedLaboratoryForm(input: {
  id: string
  name: string
  mode: ManagedFormMode
  templateSchema: FormSchemaDraft
  templateDesigner: DesignerDraft
  frame: ManagedFormFrame
  templateVersion?: number
}): ManagedLaboratoryForm {
  const id = input.id.trim()
  const name = input.name.trim()
  if (!id || id === laboratoryTemplateFormId || !name || !['operational', 'reporting', 'hybrid'].includes(input.mode)) throw new Error('A managed form requires a new id, name and supported mode.')
  const baseline = copy(input.templateDesigner)
  const source = copy(input.templateSchema)
  const frame = copy(input.frame)
  const schema = ensureLaboratoryTemplateFieldLayout({
    ...source,
    id,
    version: 1,
    status: 'draft',
    mode: input.mode,
    title: { fa: name, en: name, zh: name },
    actions: source.actions?.map(action => ({ ...action, required: false })),
    templateFormId: laboratoryTemplateFormId,
    settings: {
      ...source.settings,
      shared: { ...source.settings?.shared, standardId: laboratoryTemplateFormId, version: input.templateVersion ?? laboratoryTemplateVersion, designer: baseline },
      specific: { ...source.settings?.specific, designer: { properties: {}, appearance: {}, components: {} } }
    }
  })
  return {
    id, schema, frame,
    template: { formId: laboratoryTemplateFormId, version: input.templateVersion ?? laboratoryTemplateVersion, schema: copy(source), frame: copy(frame) },
    designerOverrides: {}, customization: { ...defaultCustomization }, structurePermissions: { ...lockedStructure }
  }
}

export function resolveManagedLaboratoryDesigner(form: ManagedLaboratoryForm, currentTemplate?: DesignerDraft, currentVersion = laboratoryTemplateVersion): DesignerDraft {
  const pinnedBaseline = form.schema.settings?.shared?.designer ?? emptyDesignerDraft(form.template.formId)
  const baseline = currentTemplate && currentVersion === form.template.version ? currentTemplate : pinnedBaseline
  const overrides = form.designerOverrides
  return { ...mergeFormSettings(baseline, overrides), formId: form.id }
}

export function managedFormWithDesigner(form: ManagedLaboratoryForm, draft: DesignerDraft): ManagedLaboratoryForm {
  const baseline = form.schema.settings?.shared?.designer ?? emptyDesignerDraft(form.template.formId)
  const { formId: _formId, format: _format, schemaVersion: _schemaVersion, ...current } = draft
  const { formId: _baseId, format: _baseFormat, schemaVersion: _baseVersion, ...base } = baseline
  return { ...form, designerOverrides: (formSettingsDifference(base, current) ?? {}) as Partial<DesignerDraft> }
}

function restoreForm(value: unknown): ManagedLaboratoryForm | null {
  if (!record(value) || typeof value.id !== 'string' || value.id === laboratoryTemplateFormId || !record(value.schema)) return null
  const schema = value.schema as unknown as FormSchemaDraft
  if (schema.id !== value.id || schema.status !== 'draft' || !['operational', 'reporting', 'hybrid', 'combined'].includes(schema.mode) || !Array.isArray(schema.fields) || !Array.isArray(schema.sections)) return null
  if (!record(value.frame) || !['desktop', 'tablet', 'mobile'].includes(String(value.frame.device)) || typeof value.frame.width !== 'number' || value.frame.width < 320 || value.frame.width > 2400 || !(value.frame.height === null || (typeof value.frame.height === 'number' && value.frame.height >= 320 && value.frame.height <= 2400)) || typeof value.frame.fitToPage !== 'boolean') return null
  if (!record(value.template) || typeof value.template.formId !== 'string' || value.template.formId !== schema.templateFormId || typeof value.template.version !== 'number') return null
  if (!record(value.customization)) return null
  const customization = value.customization as Record<string, unknown>
  if (!(['colors', 'typography', 'formSize', 'tablePresentation'] as const).every(key => typeof customization[key] === 'boolean')) return null
  const baseline = schema.settings?.shared?.designer
  if (!baseline || typeof baseline !== 'object') return null
  const fields = schema.fields.map(field => field.id)
  const designer = validateDesignerDraft(baseline, value.template.formId, fields)
  if (designer.formId !== value.template.formId) return null
  if (!record(value.designerOverrides)) return null
  const restoredSchema = ensureLaboratoryTemplateFieldLayout({ ...schema, actions: schema.actions?.map(action => ({ ...action, required: false })), settings: { ...schema.settings, shared: { ...schema.settings?.shared, designer } } })
  return {
    id: value.id,
    schema: restoredSchema,
    frame: value.frame as ManagedFormFrame,
    template: value.template as ManagedLaboratoryForm['template'],
    designerOverrides: value.designerOverrides as Partial<DesignerDraft>,
    customization: value.customization as ManagedFormCustomization,
    structurePermissions: { ...lockedStructure }
  }
}

export function loadManagedLaboratoryForms(storage: FormStorage | undefined, userId?: string): ManagedLaboratoryForms | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(managedLaboratoryFormsStorageKey(userId))
    if (raw === null) return { version: 1, activeFormId: null, forms: [] }
    const parsed: unknown = JSON.parse(raw)
    if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.forms)) return null
    const forms: ManagedLaboratoryForm[] = []
    const ids = new Set<string>()
    for (const item of parsed.forms) {
      const form = restoreForm(item)
      if (!form || ids.has(form.id)) return null
      ids.add(form.id)
      forms.push(form)
    }
    if (parsed.activeFormId !== null && (typeof parsed.activeFormId !== 'string' || !ids.has(parsed.activeFormId))) return null
    const templateRevision = record(parsed.templateRevision) && record(parsed.templateRevision.schema) && parsed.templateRevision.schema.id === laboratoryTemplateFormId && record(parsed.templateRevision.designer) && record(parsed.templateRevision.frame) && typeof parsed.templateRevision.version === 'number' ? parsed.templateRevision as unknown as ManagedTemplateRevision : undefined
    const templateRevisions = Array.isArray(parsed.templateRevisions) ? parsed.templateRevisions as ManagedTemplateRevision[] : undefined
    return { version: 1, activeFormId: parsed.activeFormId as string | null, forms, ...(templateRevision ? { templateRevision } : {}), ...(templateRevisions ? { templateRevisions } : {}), ...(record(parsed.catalogTemplates) ? { catalogTemplates: parsed.catalogTemplates as Record<string, ManagedTemplateRevision> } : {}) }
  } catch { return null }
}

export function saveManagedLaboratoryForm(storage: FormStorage | undefined, userId: string | undefined, form: ManagedLaboratoryForm): boolean {
  if (!storage) return false
  try {
    const current = loadManagedLaboratoryForms(storage, userId)
    const normalized = restoreForm(form)
    if (!current || !normalized) return false
    const forms = current.forms.filter(item => item.id !== form.id)
    forms.push(normalized)
    storage.setItem(managedLaboratoryFormsStorageKey(userId), JSON.stringify({ ...current, version: 1, activeFormId: form.id, forms }))
    return true
  } catch { return false }
}
