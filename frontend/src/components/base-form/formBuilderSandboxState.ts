import type { FormComponentPreset } from './componentRegistry'
import type { FormLocalizedText, FormSchemaDraft, FormSchemaField, FormSchemaSection } from './formSchema'

export const sandboxStorageKey = 'yarn-trade:form-builder-sandbox:v1'
export const managedFormsStorageKey = 'yarn-trade:form-builder-forms:v1'
export const phoneComponentId = 'base-form.value-list'
export const phonePresetId = 'contact.phone'
export const sandboxBounds = { width: 960, height: 640, fieldWidth: 320, fieldHeight: 120 } as const
export type NewSandboxMode = 'operational' | 'reporting' | 'hybrid'
export type SandboxPanel = FormSchemaSection & {
  parentId: string | null
  title: FormLocalizedText
  order: number
  initialSize: { width: number; height: number }
  layout: { direction: 'horizontal' | 'vertical'; gap: number }
}
export type SandboxPhoneField = FormSchemaField & {
  componentId: typeof phoneComponentId
  kind: 'valueList'
  settings: {
    presetId: typeof phonePresetId
    position: { x: number; y: number }
    demo: { primary: string; numbers: string[]; listPrimary: string }
  }
}
export type SandboxForm = Omit<FormSchemaDraft, 'fields' | 'sections'> & { fields: SandboxPhoneField[]; sections: SandboxPanel[] }
export type ManagedForms = { version: 1; activeFormId: string | null; forms: SandboxForm[] }

export function emptySandboxForm(): SandboxForm {
  return {
    id: 'form-builder.sandbox', schemaVersion: 1, version: 1, mode: 'operational', status: 'draft',
    title: { fa: 'فرم آزمایشی مستقل', en: 'Independent sandbox form', zh: '独立试验表单' },
    layout: { direction: 'vertical', gap: 12 },
    sections: [{
      id: 'sandbox.editor', kind: 'editor', parentId: null, title: { fa: 'پنل تلفن', en: 'Phone panel', zh: '电话面板' },
      order: 0, initialSize: { width: 984, height: 720 }, layout: { direction: 'vertical', gap: 12 }
    }], fields: []
  }
}

export function createManagedForm(id: string, name: string, mode: NewSandboxMode): SandboxForm {
  if (!id.trim() || !name.trim() || !['operational', 'reporting', 'hybrid'].includes(mode)) throw new Error('A form needs a unique id, name and supported mode.')
  return { ...emptySandboxForm(), id, title: { fa: name.trim(), en: name.trim(), zh: name.trim() }, mode, sections: [], fields: [] }
}

/** Only this explicitly implemented preset has an adapter. */
export function supportsSandboxPreset(preset: FormComponentPreset): boolean {
  return preset.id === phonePresetId && preset.componentId === phoneComponentId && preset.schemaKind === 'valueList'
}

export function sandboxPanelBounds(form: SandboxForm, sectionId: string) {
  const panel = form.sections.find(section => section.id === sectionId)
  return { width: Math.max(320, (panel?.initialSize.width ?? 984) - 24), height: Math.max(120, (panel?.initialSize.height ?? 720) - 80) }
}

export function addSandboxPhone(form: SandboxForm, preset: FormComponentPreset, instanceId: string, sectionId = form.sections[0]?.id): SandboxForm {
  if (!supportsSandboxPreset(preset)) throw new Error('This preset has no sandbox adapter.')
  if (form.mode === 'reporting' || !form.sections.some(section => section.id === sectionId)) throw new Error('Phone needs an operational form panel.')
  if (!instanceId.trim() || form.fields.some(field => field.id === instanceId)) throw new Error('Instance id must be unique.')
  const offset = form.fields.filter(field => field.sectionId === sectionId).length % 5 * 28
  const bounds = sandboxPanelBounds(form, sectionId!)
  const field: SandboxPhoneField = {
    id: instanceId, componentId: phoneComponentId, sectionId: sectionId!, kind: 'valueList',
    label: { ...preset.title }, labelPolicy: preset.labelPolicy, minTracks: 1, span: 1,
    settings: {
      presetId: phonePresetId, position: { x: Math.min(24 + offset, bounds.width - 320), y: Math.min(24 + offset, bounds.height - 120) },
      demo: { primary: '0211000001', numbers: ['0211000001', '0211000002'], listPrimary: '0211000001' }
    }
  }
  return { ...form, fields: [...form.fields, field] }
}

export function updateSandboxPhone(form: SandboxForm, id: string, update: (field: SandboxPhoneField) => SandboxPhoneField): SandboxForm {
  return { ...form, fields: form.fields.map(field => field.id === id ? update(field) : field) }
}

export function moveSandboxPhone(form: SandboxForm, id: string, x: number, y: number): SandboxForm {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return form
  return updateSandboxPhone(form, id, field => {
    const bounds = sandboxPanelBounds(form, field.sectionId)
    return { ...field, settings: { ...field.settings, position: {
      x: Math.max(0, Math.min(bounds.width - 320, x)), y: Math.max(0, Math.min(bounds.height - 120, y))
    } } }
  })
}

export function removeSandboxPhone(form: SandboxForm, id: string): SandboxForm {
  return { ...form, fields: form.fields.filter(field => field.id !== id) }
}

export function sandboxPanelChildren(form: SandboxForm, parentId: string | null): SandboxPanel[] {
  return form.sections.filter(section => section.parentId === parentId).sort((a, b) => a.order - b.order)
}

export function canParentSandboxPanel(form: SandboxForm, id: string, parentId: string | null): boolean {
  const seen = new Set([id])
  let parent = parentId
  while (parent !== null) {
    if (seen.has(parent)) return false
    seen.add(parent)
    const section = form.sections.find(item => item.id === parent)
    if (!section) return false
    parent = section.parentId
  }
  return true
}

export function addSandboxPanel(form: SandboxForm, id: string, title: FormLocalizedText, parentId: string | null = null, kind: SandboxPanel['kind'] = 'editor'): SandboxForm {
  if (!id.trim() || form.sections.some(section => section.id === id) || !canParentSandboxPanel(form, id, parentId)) throw new Error('Panel id or parent is invalid.')
  const panel: SandboxPanel = {
    id, title: { ...title }, parentId, kind, order: sandboxPanelChildren(form, parentId).length,
    initialSize: { width: 420, height: 300 }, layout: { direction: 'vertical', gap: 12 }
  }
  return { ...form, sections: [...form.sections, panel] }
}

export function moveSandboxPanel(form: SandboxForm, id: string, parentId: string | null, index?: number): SandboxForm {
  const panel = form.sections.find(section => section.id === id)
  if (!panel || !canParentSandboxPanel(form, id, parentId)) throw new Error('A panel cannot be moved into itself or its descendants.')
  const siblings = sandboxPanelChildren(form, parentId).filter(section => section.id !== id)
  siblings.splice(index === undefined ? siblings.length : Math.max(0, Math.min(siblings.length, index)), 0, { ...panel, parentId })
  const changed = new Map(siblings.map((section, order) => [section.id, { ...section, order }]))
  let next = { ...form, sections: form.sections.map(section => changed.get(section.id) ?? section) }
  if (panel.parentId !== parentId) {
    const oldOrder = new Map(sandboxPanelChildren(next, panel.parentId).map((section, order) => [section.id, order]))
    next = { ...next, sections: next.sections.map(section => oldOrder.has(section.id) ? { ...section, order: oldOrder.get(section.id)! } : section) }
  }
  return next
}

export function removeSandboxPanel(form: SandboxForm, id: string): SandboxForm {
  const removed = new Set([id])
  for (let changed = true; changed;) {
    changed = false
    for (const section of form.sections) if (section.parentId !== null && removed.has(section.parentId) && !removed.has(section.id)) { removed.add(section.id); changed = true }
  }
  return { ...form, sections: form.sections.filter(section => !removed.has(section.id)), fields: form.fields.filter(field => !removed.has(field.sectionId)) }
}

export function updateSandboxPanel(form: SandboxForm, id: string, patch: Partial<Pick<SandboxPanel, 'title' | 'kind' | 'initialSize' | 'layout'>>): SandboxForm {
  let next = { ...form, sections: form.sections.map(section => section.id === id ? { ...section, ...patch } : section) }
  for (const field of next.fields.filter(field => field.sectionId === id)) next = moveSandboxPhone(next, field.id, field.settings.position.x, field.settings.position.y)
  return next
}

type SandboxStorage = Pick<Storage, 'getItem' | 'setItem'>
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is FormLocalizedText => object(value) && ['fa', 'en', 'zh'].every(locale => typeof value[locale] === 'string')
const validSize = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** Read both the previous phone-only form and managed drafts, normalizing legacy combined to hybrid. */
export function restoreSandboxForm(raw: string | null): SandboxForm | null {
  if (raw === null) return emptySandboxForm()
  try {
    const value: unknown = JSON.parse(raw)
    if (!object(value) || typeof value.id !== 'string' || !value.id.trim() || value.schemaVersion !== 1 || value.version !== 1 || !['operational', 'reporting', 'hybrid', 'combined'].includes(String(value.mode)) || !text(value.title) || !Array.isArray(value.fields) || !Array.isArray(value.sections)) return null
    const sections: SandboxPanel[] = []
    const ids = new Set<string>()
    for (const section of value.sections) {
      if (!object(section) || typeof section.id !== 'string' || !section.id.trim() || ids.has(section.id) || !['editor', 'grid', 'footer'].includes(String(section.kind))) return null
      if (section.parentId !== undefined && section.parentId !== null && typeof section.parentId !== 'string') return null
      if (section.title !== undefined && !text(section.title)) return null
      if (section.order !== undefined && (!validSize(section.order, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(section.order))) return null
      if (section.initialSize !== undefined && (!object(section.initialSize) || !validSize(section.initialSize.width, 360, 2400) || !validSize(section.initialSize.height, 200, 1800))) return null
      if (section.layout !== undefined && (!object(section.layout) || !['horizontal', 'vertical'].includes(String(section.layout.direction)))) return null
      ids.add(section.id)
      sections.push({
        id: section.id, kind: section.kind as SandboxPanel['kind'], parentId: typeof section.parentId === 'string' ? section.parentId : null,
        title: text(section.title) ? { ...section.title } : { fa: 'پنل', en: 'Panel', zh: '面板' },
        order: typeof section.order === 'number' ? section.order : sections.length,
        initialSize: section.initialSize as SandboxPanel['initialSize'] ?? { width: 984, height: 720 },
        layout: { direction: object(section.layout) && section.layout.direction === 'horizontal' ? 'horizontal' : 'vertical', gap: 12 }
      })
    }
    const form: SandboxForm = { ...emptySandboxForm(), id: value.id, title: { ...value.title }, mode: value.mode === 'combined' ? 'hybrid' : value.mode as NewSandboxMode, sections, fields: [], layout: { direction: object(value.layout) && value.layout.direction === 'horizontal' ? 'horizontal' : 'vertical', gap: 12 } }
    if (sections.some(section => !canParentSandboxPanel(form, section.id, section.parentId))) return null
    const fieldIds = new Set<string>()
    for (const field of value.fields) {
      if (!object(field) || typeof field.id !== 'string' || !field.id.trim() || fieldIds.has(field.id) || field.componentId !== phoneComponentId || field.kind !== 'valueList' || typeof field.sectionId !== 'string' || !ids.has(field.sectionId) || !text(field.label)) return null
      const settings = field.settings
      if (!object(settings) || settings.presetId !== phonePresetId || !object(settings.position) || !object(settings.demo)) return null
      const { position, demo } = settings
      if (typeof position.x !== 'number' || typeof position.y !== 'number' || !Number.isFinite(position.x) || !Number.isFinite(position.y) || typeof demo.primary !== 'string' || typeof demo.listPrimary !== 'string' || !Array.isArray(demo.numbers) || !demo.numbers.every(item => typeof item === 'string') || (demo.primary !== '' && !demo.numbers.includes(demo.primary)) || (demo.listPrimary !== '' && !demo.numbers.includes(demo.listPrimary))) return null
      fieldIds.add(field.id)
      const bounds = sandboxPanelBounds(form, field.sectionId)
      form.fields.push({
        id: field.id, componentId: phoneComponentId, kind: 'valueList', sectionId: field.sectionId,
        label: { ...field.label }, labelPolicy: field.labelPolicy === 'fixed' ? 'fixed' : 'editable', minTracks: 1, span: 1,
        settings: { presetId: phonePresetId, position: { x: Math.max(0, Math.min(bounds.width - 320, position.x)), y: Math.max(0, Math.min(bounds.height - 120, position.y)) }, demo: { primary: demo.primary, numbers: [...demo.numbers], listPrimary: demo.listPrimary } }
      })
    }
    return form
  } catch { return null }
}

export function loadSandboxForm(storage: SandboxStorage): SandboxForm | null {
  try { return restoreSandboxForm(storage.getItem(sandboxStorageKey)) } catch { return null }
}

export function saveSandboxForm(storage: SandboxStorage, form: SandboxForm): boolean {
  try {
    const serialized = JSON.stringify(form)
    if (!restoreSandboxForm(serialized)) return false
    storage.setItem(sandboxStorageKey, serialized)
    return true
  } catch { return false }
}

export function loadManagedForms(storage: SandboxStorage): ManagedForms | null {
  try {
    const raw = storage.getItem(managedFormsStorageKey)
    if (raw === null) {
      const legacy = storage.getItem(sandboxStorageKey)
      if (legacy === null) return { version: 1, forms: [], activeFormId: null }
      const form = restoreSandboxForm(legacy)
      return form ? { version: 1, forms: [form], activeFormId: form.id } : null
    }
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.version !== 1 || !Array.isArray(value.forms)) return null
    const forms: SandboxForm[] = [], ids = new Set<string>()
    for (const item of value.forms) {
      const form = restoreSandboxForm(JSON.stringify(item))
      if (!form || ids.has(form.id)) return null
      ids.add(form.id); forms.push(form)
    }
    if (value.activeFormId !== null && (typeof value.activeFormId !== 'string' || !ids.has(value.activeFormId))) return null
    return { version: 1, forms, activeFormId: value.activeFormId as string | null }
  } catch { return null }
}

export function saveManagedForm(storage: SandboxStorage, form: SandboxForm): boolean {
  try {
    const existing = loadManagedForms(storage)
    const normalized = restoreSandboxForm(JSON.stringify(form))
    if (!existing || !normalized || !Object.values(normalized.title).some(name => name.trim())) return false
    const forms = existing.forms.filter(item => item.id !== form.id)
    forms.push(normalized)
    storage.setItem(managedFormsStorageKey, JSON.stringify({ version: 1, forms, activeFormId: form.id }))
    return true
  } catch { return false }
}
