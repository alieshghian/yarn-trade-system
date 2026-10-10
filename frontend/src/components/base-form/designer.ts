export const designerDraftFormat = 'yarn-trade.form-designer-draft' as const
export const designerDraftVersion = 1 as const
export const designerHistoryLimit = 50

export const designerProperties = [
  'fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'textAlign', 'lineHeight',
  'backgroundColor', 'textColor', 'labelColor', 'borderColor', 'focusColor', 'hoverColor', 'selectedColor', 'disabledColor', 'errorColor'
] as const

export type DesignerProperty = typeof designerProperties[number]
export type DesignerValue = string | number | boolean
export type DesignerFieldOverride = Partial<Record<DesignerProperty, DesignerValue>>
export type DesignerDraft = {
  format: typeof designerDraftFormat
  schemaVersion: typeof designerDraftVersion
  formId: string
  overrides: Record<string, DesignerFieldOverride>
}
export type DesignerHistory = { present: DesignerDraft, past: DesignerDraft[], future: DesignerDraft[], transactionStart?: DesignerDraft }
export type DesignerHistoryAction =
  | { type: 'change', draft: DesignerDraft }
  | { type: 'beginTransaction' }
  | { type: 'commitTransaction' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace', draft: DesignerDraft }

const colorProperties = new Set<DesignerProperty>(['backgroundColor', 'textColor', 'labelColor', 'borderColor', 'focusColor', 'hoverColor', 'selectedColor', 'disabledColor', 'errorColor'])
const fontFamilies = new Set(['inherit', 'vazirmatn', 'tahoma', 'segoe', 'arial', 'naskh'])
const fontWeights = new Set([300, 400, 500, 600, 700])
const alignments = new Set(['start', 'center', 'end', 'left', 'right'])
const validPropertySet = new Set<string>(designerProperties)

export function emptyDesignerDraft(formId: string): DesignerDraft {
  return { format: designerDraftFormat, schemaVersion: designerDraftVersion, formId, overrides: {} }
}

function validValue(property: DesignerProperty, value: unknown): value is DesignerValue {
  if (value === undefined) return true
  if (colorProperties.has(property)) return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  if (property === 'fontFamily') return typeof value === 'string' && fontFamilies.has(value)
  if (property === 'fontSize') return typeof value === 'number' && Number.isInteger(value) && value >= 8 && value <= 40
  if (property === 'fontWeight') return typeof value === 'number' && fontWeights.has(value)
  if (property === 'lineHeight') return typeof value === 'number' && Number.isFinite(value) && value >= 0.8 && value <= 3
  if (property === 'textAlign') return typeof value === 'string' && alignments.has(value)
  if (property === 'bold' || property === 'italic') return typeof value === 'boolean'
  return false
}

export function validateDesignerDraft(value: unknown, formId: string, validFieldIds: readonly string[]): DesignerDraft {
  if (!value || typeof value !== 'object') return emptyDesignerDraft(formId)
  const candidate = value as Partial<DesignerDraft>
  if (candidate.format !== designerDraftFormat || candidate.schemaVersion !== designerDraftVersion || candidate.formId !== formId || !candidate.overrides || typeof candidate.overrides !== 'object' || Array.isArray(candidate.overrides)) return emptyDesignerDraft(formId)
  const allowedFields = new Set(validFieldIds)
  const overrides: DesignerDraft['overrides'] = {}
  for (const [fieldId, properties] of Object.entries(candidate.overrides)) {
    if (!allowedFields.has(fieldId) || !properties || typeof properties !== 'object' || Array.isArray(properties)) continue
    const clean: DesignerFieldOverride = {}
    for (const [name, setting] of Object.entries(properties)) {
      if (!validPropertySet.has(name)) continue
      const property = name as DesignerProperty
      if (validValue(property, setting) && setting !== undefined) clean[property] = typeof setting === 'string' && colorProperties.has(property) ? setting.toLowerCase() : setting
    }
    if (Object.keys(clean).length) overrides[fieldId] = clean
  }
  return { format: designerDraftFormat, schemaVersion: designerDraftVersion, formId, overrides }
}

export function setDesignerProperty(draft: DesignerDraft, fieldIds: readonly string[], property: DesignerProperty, value: unknown, validFieldIds: readonly string[]): DesignerDraft {
  if (!validPropertySet.has(property) || !validValue(property, value)) return draft
  const allowed = new Set(validFieldIds)
  const overrides = { ...draft.overrides }
  let changed = false
  for (const fieldId of fieldIds) {
    if (!allowed.has(fieldId)) continue
    const current = { ...(overrides[fieldId] ?? {}) }
    if (value === undefined) delete current[property]
    else current[property] = typeof value === 'string' && colorProperties.has(property) ? value.toLowerCase() : value
    if (Object.keys(current).length) overrides[fieldId] = current
    else delete overrides[fieldId]
    changed = true
  }
  return changed ? { ...draft, overrides } : draft
}

export function resetDesignerFields(draft: DesignerDraft, fieldIds: readonly string[]): DesignerDraft {
  if (!fieldIds.some(id => id in draft.overrides)) return draft
  const overrides = { ...draft.overrides }
  for (const id of fieldIds) delete overrides[id]
  return { ...draft, overrides }
}

export function designerStorageKey(userId: string, formId: string): string {
  return 'yarn-trade:form-lab-designer:v1:' + encodeURIComponent(userId) + ':' + encodeURIComponent(formId)
}

export function loadDesignerDraft(storage: Pick<Storage, 'getItem'> | undefined, userId: string | undefined, formId: string, validFieldIds: readonly string[]): DesignerDraft {
  if (!storage || !userId) return emptyDesignerDraft(formId)
  try {
    const raw = storage.getItem(designerStorageKey(userId, formId))
    return raw ? validateDesignerDraft(JSON.parse(raw), formId, validFieldIds) : emptyDesignerDraft(formId)
  } catch { return emptyDesignerDraft(formId) }
}

export function saveDesignerDraft(storage: Pick<Storage, 'setItem'> | undefined, userId: string | undefined, formId: string, draft: DesignerDraft, validFieldIds: readonly string[]): boolean {
  if (!storage || !userId) return false
  const safe = validateDesignerDraft(draft, formId, validFieldIds)
  try { storage.setItem(designerStorageKey(userId, formId), JSON.stringify(safe)); return true }
  catch { return false }
}

export function createDesignerHistory(draft: DesignerDraft): DesignerHistory {
  return { present: draft, past: [], future: [] }
}

export function designerHistoryReducer(state: DesignerHistory, action: DesignerHistoryAction): DesignerHistory {
  if (action.type === 'replace') return createDesignerHistory(action.draft)
  if (action.type === 'beginTransaction') return state.transactionStart ? state : { ...state, transactionStart: state.present }
  if (action.type === 'change') {
    if (JSON.stringify(action.draft) === JSON.stringify(state.present)) return state
    if (state.transactionStart) return { ...state, present: action.draft }
    return { present: action.draft, past: [...state.past, state.present].slice(-designerHistoryLimit), future: [] }
  }
  if (action.type === 'commitTransaction') {
    if (!state.transactionStart) return state
    const past = JSON.stringify(state.transactionStart) === JSON.stringify(state.present) ? state.past : [...state.past, state.transactionStart].slice(-designerHistoryLimit)
    return { present: state.present, past, future: past === state.past ? state.future : [], transactionStart: undefined }
  }
  if (state.transactionStart) return state
  if (action.type === 'undo') {
    if (!state.past.length) return state
    const previous = state.past[state.past.length - 1]
    return { present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future].slice(0, designerHistoryLimit) }
  }
  if (!state.future.length) return state
  return { present: state.future[0], past: [...state.past, state.present].slice(-designerHistoryLimit), future: state.future.slice(1) }
}

const cssColorVariables: Partial<Record<DesignerProperty, string>> = {
  backgroundColor: '--lab-bg', textColor: '--lab-text', labelColor: '--lab-label', borderColor: '--lab-border',
  focusColor: '--lab-focus', hoverColor: '--lab-hover', selectedColor: '--lab-selected', disabledColor: '--lab-disabled', errorColor: '--lab-error'
}
const safeFonts: Record<string, string> = {
  vazirmatn: "'Vazirmatn',Tahoma,Arial,sans-serif", tahoma: 'Tahoma,Arial,sans-serif', segoe: "'Segoe UI',Tahoma,sans-serif",
  arial: 'Arial,sans-serif', naskh: "'Noto Naskh Arabic','B Nazanin',serif"
}

export function designerStyleForField(draft: DesignerDraft, fieldId: string): Record<string, string | number> {
  const values = draft.overrides[fieldId] ?? {}
  const style: Record<string, string | number> = {}
  for (const property of designerProperties) {
    const value = values[property]
    if (value === undefined) continue
    const variable = cssColorVariables[property]
    if (variable && typeof value === 'string') style[variable] = value
  }
  if (values.fontFamily && values.fontFamily !== 'inherit') style['--lab-font'] = safeFonts[String(values.fontFamily)]
  if (values.fontSize !== undefined) style['--lab-font-size'] = String(values.fontSize) + 'px'
  if (values.fontWeight !== undefined) style['--lab-font-weight'] = String(values.fontWeight)
  if (values.bold !== undefined) style['--lab-bold'] = values.bold ? '700' : '400'
  if (values.italic !== undefined) style['--lab-font-style'] = values.italic ? 'italic' : 'normal'
  if (values.textAlign !== undefined) style['--lab-text-align'] = String(values.textAlign)
  if (values.lineHeight !== undefined) style['--lab-line-height'] = String(values.lineHeight)
  return style
}
