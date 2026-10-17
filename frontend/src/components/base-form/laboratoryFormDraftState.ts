import { emptyDesignerDraft, validateDesignerDraft, type DesignerDraft } from './designer.ts'
import type { FormSchemaDraft, FormSchemaField, FormSchemaMode } from './formSchema'

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
  template: { formId: string; version: number }
  designerOverrides: Partial<DesignerDraft>
  customization: ManagedFormCustomization
  structurePermissions: { fieldAddRemove: false; fieldTypeChange: false; tableSchemaChange: false; businessBehaviorChange: false }
}
export type ManagedLaboratoryForms = { version: 1; activeFormId: string | null; forms: ManagedLaboratoryForm[] }
export type FormStorage = Pick<Storage, 'getItem' | 'setItem'>

export type FormSchemaGridPlacement = { columns: number; columnStart: number; columnSpan: number }

const defaultCustomization: ManagedFormCustomization = { colors: false, typography: false, formSize: false, tablePresentation: false }
const lockedStructure = { fieldAddRemove: false, fieldTypeChange: false, tableSchemaChange: false, businessBehaviorChange: false } as const

const laboratoryFieldGridPlacements: Readonly<Record<string, FormSchemaGridPlacement>> = {
  personCode: { columns: 20, columnStart: 1, columnSpan: 2 },
  titleId: { columns: 20, columnStart: 3, columnSpan: 3 },
  firstName: { columns: 20, columnStart: 6, columnSpan: 5 },
  lastName: { columns: 20, columnStart: 11, columnSpan: 5 },
  jobId: { columns: 20, columnStart: 16, columnSpan: 5 },
  nationalityId: { columns: 20, columnStart: 1, columnSpan: 5 },
  phone: { columns: 20, columnStart: 6, columnSpan: 5 },
  mobile: { columns: 20, columnStart: 11, columnSpan: 5 },
  disabledExample: { columns: 20, columnStart: 16, columnSpan: 5 },
  address: { columns: 20, columnStart: 1, columnSpan: 10 },
  notes: { columns: 20, columnStart: 11, columnSpan: 10 },
  errorExample: { columns: 20, columnStart: 1, columnSpan: 10 }
}

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

function fieldGridPlacement(field: FormSchemaField): FormSchemaGridPlacement | undefined {
  const layout = field.settings?.layout
  if (!record(layout) || !record(layout.grid)) return undefined
  const { columns, columnStart, columnSpan } = layout.grid
  if (typeof columns !== 'number' || typeof columnStart !== 'number' || typeof columnSpan !== 'number' || ![columns, columnStart, columnSpan].every(Number.isInteger)) return undefined
  if (columns < 1 || columns > 40 || columnStart < 1 || columnSpan < 1 || columnStart + columnSpan - 1 > columns) return undefined
  return { columns, columnStart, columnSpan }
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
    if (!fallback || fieldGridPlacement(field)) return field
    fieldsChanged = true
    const layout = record(field.settings?.layout) ? field.settings.layout : {}
    return { ...field, settings: { ...field.settings, layout: { ...layout, grid: fallback } } }
  })
  let sectionsChanged = false
  const sections = schema.sections.map(section => {
    if (section.kind !== 'editor') return section
    const columns = hadStoredGridPositions ? section.layout?.columns ?? storedGridColumns : 20
    const direction = hadStoredGridPositions ? section.layout?.direction ?? 'horizontal' : 'horizontal'
    const gap = section.layout?.gap ?? 12
    if (columns === section.layout?.columns && direction === section.layout?.direction && gap === section.layout?.gap) return section
    sectionsChanged = true
    return { ...section, layout: { ...section.layout, columns, direction, gap } }
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
export function formSchemaFieldGridStyle(schema: FormSchemaDraft, fieldId: string): { gridColumn: string } | undefined {
  const field = schema.fields.find(item => item.id === fieldId)
  const placement = field && fieldGridPlacement(field)
  return placement ? { gridColumn: `${placement.columnStart} / span ${placement.columnSpan}` } : undefined
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
    templateFormId: laboratoryTemplateFormId,
    settings: {
      ...source.settings,
      shared: { ...source.settings?.shared, standardId: laboratoryTemplateFormId, version: input.templateVersion ?? laboratoryTemplateVersion, designer: baseline },
      specific: { ...source.settings?.specific, designer: { properties: {}, appearance: {}, components: {} } }
    }
  })
  return {
    id, schema, frame,
    template: { formId: laboratoryTemplateFormId, version: input.templateVersion ?? laboratoryTemplateVersion },
    designerOverrides: {}, customization: { ...defaultCustomization }, structurePermissions: { ...lockedStructure }
  }
}

export function resolveManagedLaboratoryDesigner(form: ManagedLaboratoryForm, currentTemplate?: DesignerDraft, currentVersion = laboratoryTemplateVersion): DesignerDraft {
  const pinnedBaseline = form.schema.settings?.shared?.designer ?? emptyDesignerDraft(form.template.formId)
  const baseline = currentTemplate && currentVersion === form.template.version ? currentTemplate : pinnedBaseline
  const overrides = form.designerOverrides
  return {
    ...baseline,
    ...overrides,
    formId: form.id,
    overrides: { ...baseline.overrides, ...overrides.overrides },
    appearance: { ...baseline.appearance, ...overrides.appearance },
    defaults: { ...baseline.defaults, ...overrides.defaults },
    actions: { ...baseline.actions, ...overrides.actions },
    tableColumns: { ...baseline.tableColumns, ...overrides.tableColumns },
    tableHeaders: { ...baseline.tableHeaders, ...overrides.tableHeaders }
  }
}

function restoreForm(value: unknown): ManagedLaboratoryForm | null {
  if (!record(value) || typeof value.id !== 'string' || value.id === laboratoryTemplateFormId || !record(value.schema)) return null
  const schema = value.schema as unknown as FormSchemaDraft
  if (schema.id !== value.id || schema.status !== 'draft' || !['operational', 'reporting', 'hybrid'].includes(schema.mode) || !Array.isArray(schema.fields) || !Array.isArray(schema.sections)) return null
  if (!record(value.frame) || !['desktop', 'tablet', 'mobile'].includes(String(value.frame.device)) || typeof value.frame.width !== 'number' || value.frame.width < 320 || value.frame.width > 2400 || !(value.frame.height === null || (typeof value.frame.height === 'number' && value.frame.height >= 320 && value.frame.height <= 2400)) || typeof value.frame.fitToPage !== 'boolean') return null
  if (!record(value.template) || typeof value.template.formId !== 'string' || value.template.formId !== schema.templateFormId || typeof value.template.version !== 'number') return null
  if (!record(value.customization) || !['colors', 'typography', 'formSize', 'tablePresentation'].every(key => typeof value.customization?.[key] === 'boolean')) return null
  const baseline = schema.settings?.shared?.designer
  if (!baseline || typeof baseline !== 'object') return null
  const fields = schema.fields.map(field => field.id)
  const designer = validateDesignerDraft(baseline, value.template.formId, fields)
  if (designer.formId !== value.template.formId) return null
  if (!record(value.designerOverrides)) return null
  const restoredSchema = ensureLaboratoryTemplateFieldLayout({ ...schema, settings: { ...schema.settings, shared: { ...schema.settings?.shared, designer } } })
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
    return { version: 1, activeFormId: parsed.activeFormId as string | null, forms }
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
    storage.setItem(managedLaboratoryFormsStorageKey(userId), JSON.stringify({ version: 1, activeFormId: form.id, forms }))
    return true
  } catch { return false }
}
