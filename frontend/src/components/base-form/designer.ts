import type { BaseFormAction } from './types'
import type { FormSchemaDraft } from './formSchema'

export const designerDraftFormat = 'yarn-trade.form-designer-draft' as const
export const designerDraftVersion = 1 as const
export const designerHistoryLimit = 50

export const designerElementAppearanceProperties = ['appearancePreset', 'borderWidth', 'borderStyle', 'borderRadius', 'shadowOpacity', 'shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowSpread', 'shadowInset', 'gradientEnabled', 'gradientStartColor', 'gradientEndColor', 'gradientAngle', 'paddingX', 'paddingY'] as const

export const designerProperties = [
  'fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'underline', 'strikeThrough', 'script', 'textAlign', 'lineHeight',
  'backgroundColor', 'textColor', 'labelColor', 'borderColor', 'focusColor', 'focusBackgroundColor', 'focusTextColor', 'focusBorderColor', 'focusLabelColor', 'hoverColor', 'hoverTextColor', 'hoverBorderColor', 'selectedColor', 'disabledColor', 'disabledTextColor', 'disabledBorderColor', 'errorColor',
  'componentPopupBackground', 'componentPopupFontSize', 'componentAddBackground', 'componentAddTextColor', 'componentAddWidth', 'componentAddHeight',
  'width', 'height', 'offsetX', 'offsetY', ...designerElementAppearanceProperties
] as const

export type DesignerProperty = typeof designerProperties[number]
export type DesignerValue = string | number | boolean
export type DesignerPart = 'field' | 'label' | 'input'
export type DesignerFieldOverride = Partial<Record<DesignerProperty, DesignerValue>>
export type DesignerActionTextPart = 'code' | 'fa' | 'en' | 'zh'
export type DesignerActionTextStyle = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  bold?: boolean
  italic?: boolean
  underline?: 'single' | 'double'
  strikeThrough?: boolean
  script?: 'superscript' | 'subscript'
  textColor?: string
  textAlign?: string
  lineHeight?: number
}
export type DesignerActionOverride = DesignerFieldOverride & {
  visible?: boolean
  code?: string
  labels?: Partial<Record<'fa' | 'en' | 'zh', string>>
  textStyles?: Partial<Record<DesignerActionTextPart, DesignerActionTextStyle>>
}
export const designerAppearancePresets = {
  flat: { borderWidth: 1, borderStyle: 'solid', borderRadius: 6, shadowOpacity: 0 },
  raised: { borderWidth: 1, borderStyle: 'solid', borderRadius: 6, shadowOpacity: 24, shadowOffsetY: 3, shadowBlur: 2 },
  inset: { borderWidth: 1, borderStyle: 'solid', borderRadius: 6, shadowOpacity: 30, shadowOffsetY: 2, shadowBlur: 4, shadowInset: true },
  outlined: { borderWidth: 2, borderStyle: 'solid', borderRadius: 6, shadowOpacity: 0 },
  softShadow: { shadowOpacity: 18, shadowOffsetY: 2, shadowBlur: 6 },
  strongShadow: { shadowOpacity: 35, shadowOffsetY: 5, shadowBlur: 12 },
  gradient: { gradientEnabled: true, gradientAngle: 135, shadowOpacity: 0 },
  pill: { borderRadius: 100, shadowOpacity: 0 }
} satisfies Record<string, DesignerFieldOverride>
export function designerElementAppearanceValues(values: DesignerFieldOverride): DesignerFieldOverride {
  return { ...designerAppearancePresets[values.appearancePreset as keyof typeof designerAppearancePresets], ...values }
}
export const designerActionDimensionLimits = { width: { min: 48, max: 1000 }, height: { min: 24, max: 600 } } as const
export const designerAppearanceProperties = [
  'formBackground', 'formFrameBackground', 'formFrameBorder', 'entryFieldBackground',
  'tableBackground', 'tableBorder', 'tableTitleBackground', 'tableTitleText',
  'headerBackground', 'headerText', 'headerBorder', 'headerActiveBackground', 'headerActiveText',
  'rowBackground', 'rowAlternateBackground', 'rowHoverBackground', 'rowSelectedBackground', 'cellText', 'cellBackground', 'gridLine',
  'footerBackground', 'footerText', 'footerBorder',
  'toolbarBackground', 'toolbarText', 'searchBackground', 'searchBorder', 'filterBackground', 'filterText', 'summaryText',
  'actionBarBackground', 'actionBackground', 'actionText', 'actionBorder', 'actionHoverBackground', 'actionDisabledBackground'
] as const
export type DesignerAppearanceProperty = typeof designerAppearanceProperties[number]
export type DesignerAppearance = Partial<Record<DesignerAppearanceProperty, string>>
export type DesignerTableColumnStyle = { bold?: boolean; italic?: boolean; underline?: 'single' | 'double'; strikeThrough?: boolean; script?: 'superscript' | 'subscript'; textColor?: string; backgroundColor?: string; fontFamily?: string; fontSize?: number; textAlign?: 'start' | 'center' | 'end' }
export type DesignerDraft = {
  format: typeof designerDraftFormat
  schemaVersion: typeof designerDraftVersion
  formId: string
  overrides: Record<string, DesignerFieldOverride>
  filterPopupFontSize?: number
  gridSearchPosition?: GridSearchPosition
  tableFont?: { family?: string; size?: number }
  tableHeaderHeight?: number
  tableColumns?: Record<string, DesignerTableColumnStyle>
  tableHeaders?: Record<string, DesignerTableHeaderStyle>
  buttonPressEffect?: boolean
  neighborResize?: Partial<DesignerNeighborResize>
  appearance?: DesignerAppearance
  defaults?: { input?: DesignerFieldOverride; label?: DesignerFieldOverride }
  actions?: Record<string, DesignerActionOverride>
  canvas?: DesignerCanvas
  layoutMode?: 'schema' | 'canvas'
  sectionCanvases?: Record<string, DesignerCanvas>
  tables?: Record<string, DesignerTableSettings>
}
export type DesignerTableSettings = Pick<DesignerDraft, 'filterPopupFontSize' | 'gridSearchPosition' | 'tableFont' | 'tableHeaderHeight' | 'tableColumns' | 'tableHeaders'>
export type GridSearchPosition = 'left' | 'center' | 'right'
export type DesignerTableHeaderStyle = DesignerTableColumnStyle & { backgroundColor?: string; borderColor?: string }
export type DesignerHistory = { present: DesignerDraft, past: DesignerDraft[], future: DesignerDraft[], transactionStart?: DesignerDraft; document?: { present: FormSchemaDraft; past: FormSchemaDraft[]; future: FormSchemaDraft[]; transactionStart?: FormSchemaDraft } }
export type DesignerHistoryAction =
  | { type: 'change', draft: DesignerDraft, schema?: FormSchemaDraft }
  | { type: 'beginTransaction' }
  | { type: 'commitTransaction' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace', draft: DesignerDraft }

const colorProperties = new Set<DesignerProperty>(['componentPopupBackground', 'componentAddBackground', 'componentAddTextColor', 'backgroundColor', 'textColor', 'labelColor', 'borderColor', 'focusColor', 'focusBackgroundColor', 'focusTextColor', 'focusBorderColor', 'focusLabelColor', 'hoverColor', 'hoverTextColor', 'hoverBorderColor', 'selectedColor', 'disabledColor', 'disabledTextColor', 'disabledBorderColor', 'errorColor', 'gradientStartColor', 'gradientEndColor'])
export const designerActionProperties: DesignerProperty[] = ['backgroundColor', 'textColor', 'borderColor', 'hoverColor', 'hoverTextColor', 'hoverBorderColor', 'disabledColor', 'disabledTextColor', 'disabledBorderColor', 'width', 'height', 'fontSize', 'fontWeight', 'fontFamily', 'bold', 'italic', 'underline', 'strikeThrough', 'script', 'textAlign', 'lineHeight', ...designerElementAppearanceProperties]
const effectRanges: Partial<Record<DesignerProperty, readonly [number, number]>> = { componentPopupFontSize: [8, 40], componentAddWidth: [20, 120], componentAddHeight: [20, 120], borderWidth: [0, 12], shadowOpacity: [0, 100], shadowOffsetX: [-40, 40], shadowOffsetY: [-40, 40], shadowBlur: [0, 80], shadowSpread: [-20, 40], gradientAngle: [0, 360], paddingX: [0, 40], paddingY: [0, 40] }
const fontFamilies = new Set(['inherit', 'vazirmatn', 'tahoma', 'segoe', 'arial', 'naskh', 'aptos', 'calibri', 'cambria', 'consolas', 'courier', 'georgia', 'times', 'verdana'])
const fontWeights = new Set([300, 400, 500, 600, 700])
const alignments = new Set(['start', 'center', 'end', 'left', 'right'])
const dimensions = new Set<DesignerProperty>(['width', 'height', 'offsetX', 'offsetY'])
const validPropertySet = new Set<string>(designerProperties)
const validAppearancePropertySet = new Set<string>(designerAppearanceProperties)
const appearanceVariables: Record<DesignerAppearanceProperty, string> = {
  formBackground: '--lab-form-bg', formFrameBackground: '--lab-form-frame-bg', formFrameBorder: '--lab-form-frame-border', entryFieldBackground: '--lab-entry-field-bg',
  tableBackground: '--lab-table-bg', tableBorder: '--lab-table-border', tableTitleBackground: '--lab-table-title-bg', tableTitleText: '--lab-table-title-text',
  headerBackground: '--lab-header-bg', headerText: '--lab-header-text', headerBorder: '--lab-header-border', headerActiveBackground: '--lab-header-active-bg', headerActiveText: '--lab-header-active-text',
  rowBackground: '--lab-row-bg', rowAlternateBackground: '--lab-row-alt-bg', rowHoverBackground: '--lab-row-hover-bg', rowSelectedBackground: '--lab-row-selected-bg', cellText: '--lab-cell-text', cellBackground: '--lab-cell-bg', gridLine: '--lab-grid-line',
  footerBackground: '--lab-footer-bg', footerText: '--lab-footer-text', footerBorder: '--lab-footer-border',
  toolbarBackground: '--lab-toolbar-bg', toolbarText: '--lab-toolbar-text', searchBackground: '--lab-search-bg', searchBorder: '--lab-search-border', filterBackground: '--lab-filter-bg', filterText: '--lab-filter-text', summaryText: '--lab-summary-text',
  actionBarBackground: '--lab-action-bar-bg', actionBackground: '--lab-action-bg', actionText: '--lab-action-text', actionBorder: '--lab-action-border', actionHoverBackground: '--lab-action-hover-bg', actionDisabledBackground: '--lab-action-disabled-bg'
}

export function emptyDesignerDraft(formId: string): DesignerDraft {
  return { format: designerDraftFormat, schemaVersion: designerDraftVersion, formId, overrides: {} }
}

function validValue(property: DesignerProperty, value: unknown): value is DesignerValue {
  if (value === undefined) return true
  if (property === 'appearancePreset') return typeof value === 'string' && Object.hasOwn(designerAppearancePresets, value)
  if (property === 'borderStyle') return typeof value === 'string' && ['solid', 'dashed', 'dotted', 'double', 'none'].includes(value)
  if (property === 'gradientEnabled' || property === 'shadowInset') return typeof value === 'boolean'
  const range = effectRanges[property]
  if (range) return typeof value === 'number' && Number.isFinite(value) && value >= range[0] && value <= range[1]
  if (colorProperties.has(property)) return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  if (property === 'fontFamily') return typeof value === 'string' && fontFamilies.has(value)
  if (property === 'fontSize') return typeof value === 'number' && Number.isInteger(value) && value >= 8 && value <= 40
  if (property === 'fontWeight') return typeof value === 'number' && fontWeights.has(value)
  if (property === 'lineHeight') return typeof value === 'number' && Number.isFinite(value) && value >= 0.8 && value <= 3
  if (property === 'borderRadius') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
  if (dimensions.has(property)) return typeof value === 'number' && Number.isFinite(value) && value >= (property === 'width' || property === 'height' ? 16 : -10000) && value <= (property === 'width' || property === 'height' ? 1200 : 10000)
  if (property === 'textAlign') return typeof value === 'string' && alignments.has(value)
  if (property === 'bold' || property === 'italic' || property === 'strikeThrough') return typeof value === 'boolean'
  if (property === 'underline') return value === 'single' || value === 'double'
  if (property === 'script') return value === 'superscript' || value === 'subscript'
  return false
}

export function validateDesignerDraft(value: unknown, formId: string, validFieldIds: readonly string[]): DesignerDraft {
  if (!value || typeof value !== 'object') return emptyDesignerDraft(formId)
  const candidate = value as Partial<DesignerDraft>
  if (candidate.format !== designerDraftFormat || candidate.schemaVersion !== designerDraftVersion || candidate.formId !== formId || !candidate.overrides || typeof candidate.overrides !== 'object' || Array.isArray(candidate.overrides)) return emptyDesignerDraft(formId)
  const allowedFields = new Set(validFieldIds)
  const overrides: DesignerDraft['overrides'] = {}
  for (const [fieldId, properties] of Object.entries(candidate.overrides)) {
    const [baseId, part] = fieldId.split('::')
    if (!allowedFields.has(baseId) || (part !== undefined && !['label', 'input'].includes(part)) || !properties || typeof properties !== 'object' || Array.isArray(properties)) continue
    const clean: DesignerFieldOverride = {}
    for (const [name, setting] of Object.entries(properties)) {
      if (!validPropertySet.has(name)) continue
      const property = name as DesignerProperty
      if (validValue(property, setting) && setting !== undefined) clean[property] = typeof setting === 'string' && colorProperties.has(property) ? setting.toLowerCase() : setting
    }
    if (Object.keys(clean).length) overrides[fieldId] = clean
  }
  const canvas = validateDesignerCanvas(candidate.canvas, validFieldIds)
  const appearance: DesignerAppearance = {}
  if (candidate.appearance && typeof candidate.appearance === 'object' && !Array.isArray(candidate.appearance)) {
    for (const [name, setting] of Object.entries(candidate.appearance)) if (validAppearancePropertySet.has(name) && typeof setting === 'string' && /^#[0-9a-f]{6}$/i.test(setting)) appearance[name as DesignerAppearanceProperty] = setting.toLowerCase()
  }
  const defaults: NonNullable<DesignerDraft['defaults']> = {}
  for (const part of ['input', 'label'] as const) {
    const clean: DesignerFieldOverride = {}
    const values = candidate.defaults?.[part]
    if (values && typeof values === 'object' && !Array.isArray(values)) for (const [name, value] of Object.entries(values)) {
      const property = name as DesignerProperty
      if (colorProperties.has(property) && validValue(property, value) && typeof value === 'string') clean[property] = value.toLowerCase()
    }
    if (Object.keys(clean).length) defaults[part] = clean
  }
  const actions: NonNullable<DesignerDraft['actions']> = {}
  if (candidate.actions && typeof candidate.actions === 'object' && !Array.isArray(candidate.actions)) for (const [id, values] of Object.entries(candidate.actions)) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id) || !values || typeof values !== 'object' || Array.isArray(values)) continue
    const clean: DesignerActionOverride = {}
    if (typeof values.visible === 'boolean') clean.visible = values.visible
    if (typeof values.code === 'string' && values.code.length <= 32) clean.code = values.code
    if (values.labels && typeof values.labels === 'object' && !Array.isArray(values.labels)) {
      const labels: NonNullable<DesignerActionOverride['labels']> = {}
      for (const locale of ['fa', 'en', 'zh'] as const) if (typeof values.labels[locale] === 'string' && values.labels[locale].length <= 160) labels[locale] = values.labels[locale]
      if (Object.keys(labels).length) clean.labels = labels
    }
    if (values.textStyles && typeof values.textStyles === 'object' && !Array.isArray(values.textStyles)) {
      const textStyles: NonNullable<DesignerActionOverride['textStyles']> = {}
      const styleProperties = ['fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'textAlign', 'lineHeight'] as const
      for (const part of ['code', 'fa', 'en', 'zh'] as const) {
        const source = values.textStyles[part]
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue
        const style: DesignerActionTextStyle = {}
        for (const property of styleProperties) {
          const setting = source[property]
          if (validValue(property, setting) && setting !== undefined) style[property] = setting as never
        }
        if (Object.keys(style).length) textStyles[part] = style
      }
      if (Object.keys(textStyles).length) clean.textStyles = textStyles
    }
    for (const [name, value] of Object.entries(values)) {
      const property = name as DesignerProperty
      if (designerActionProperties.includes(property) && validValue(property, value) && value !== undefined) clean[property] = typeof value === 'string' && colorProperties.has(property) ? value.toLowerCase() : value
    }
    if (Object.keys(clean).length) actions[id] = clean
  }
  const filterPopupFontSize = typeof candidate.filterPopupFontSize === 'number' && Number.isInteger(candidate.filterPopupFontSize) && candidate.filterPopupFontSize >= 12 && candidate.filterPopupFontSize <= 24 ? candidate.filterPopupFontSize : undefined
  const gridSearchPosition = candidate.gridSearchPosition && ['left', 'center', 'right'].includes(candidate.gridSearchPosition) ? candidate.gridSearchPosition : undefined
  const tableHeaderHeight = typeof candidate.tableHeaderHeight === 'number' && Number.isFinite(candidate.tableHeaderHeight) && candidate.tableHeaderHeight >= 28 && candidate.tableHeaderHeight <= 120 ? Math.round(candidate.tableHeaderHeight) : undefined
  const tableFont: NonNullable<DesignerDraft['tableFont']> = {}
  if (candidate.tableFont && typeof candidate.tableFont === 'object') {
    if (typeof candidate.tableFont.family === 'string' && fontFamilies.has(candidate.tableFont.family)) tableFont.family = candidate.tableFont.family
    if (typeof candidate.tableFont.size === 'number' && Number.isFinite(candidate.tableFont.size) && candidate.tableFont.size >= 8 && candidate.tableFont.size <= 40) tableFont.size = candidate.tableFont.size
  }
  const tableColumns: NonNullable<DesignerDraft['tableColumns']> = {}
  if (candidate.tableColumns && typeof candidate.tableColumns === 'object' && !Array.isArray(candidate.tableColumns)) for (const [id, value] of Object.entries(candidate.tableColumns)) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const style: DesignerTableColumnStyle = {}
    if (typeof value.bold === 'boolean') style.bold = value.bold
    if (typeof value.italic === 'boolean') style.italic = value.italic
    if (value.underline === 'single' || value.underline === 'double') style.underline = value.underline
    if (typeof value.strikeThrough === 'boolean') style.strikeThrough = value.strikeThrough
    if (value.script === 'superscript' || value.script === 'subscript') style.script = value.script
    if (typeof value.italic === 'boolean') style.italic = value.italic
    if (value.underline === 'single' || value.underline === 'double') style.underline = value.underline
    if (typeof value.strikeThrough === 'boolean') style.strikeThrough = value.strikeThrough
    if (value.script === 'superscript' || value.script === 'subscript') style.script = value.script
    if (typeof value.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.textColor)) style.textColor = value.textColor.toLowerCase()
    if (typeof value.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.backgroundColor)) style.backgroundColor = value.backgroundColor.toLowerCase()
    if (typeof value.fontFamily === 'string' && fontFamilies.has(value.fontFamily)) style.fontFamily = value.fontFamily
    if (typeof value.fontSize === 'number' && Number.isFinite(value.fontSize) && value.fontSize >= 8 && value.fontSize <= 40) style.fontSize = value.fontSize
    if (value.textAlign==='start'||value.textAlign==='center'||value.textAlign==='end')style.textAlign=value.textAlign
    if (Object.keys(style).length) tableColumns[id] = style
  }
  const tableHeaders: NonNullable<DesignerDraft['tableHeaders']> = {}
  if (candidate.tableHeaders && typeof candidate.tableHeaders === 'object' && !Array.isArray(candidate.tableHeaders)) for (const [id, value] of Object.entries(candidate.tableHeaders)) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const style: DesignerTableHeaderStyle = {}
    if (typeof value.bold === 'boolean') style.bold = value.bold
    if (typeof value.italic === 'boolean') style.italic = value.italic
    if (value.underline === 'single' || value.underline === 'double') style.underline = value.underline
    if (typeof value.strikeThrough === 'boolean') style.strikeThrough = value.strikeThrough
    if (value.script === 'superscript' || value.script === 'subscript') style.script = value.script
    if (typeof value.italic === 'boolean') style.italic = value.italic
    if (value.underline === 'single' || value.underline === 'double') style.underline = value.underline
    if (typeof value.strikeThrough === 'boolean') style.strikeThrough = value.strikeThrough
    if (value.script === 'superscript' || value.script === 'subscript') style.script = value.script
    if (typeof value.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.textColor)) style.textColor = value.textColor.toLowerCase()
    if (typeof value.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.backgroundColor)) style.backgroundColor = value.backgroundColor.toLowerCase()
    if (typeof value.borderColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.borderColor)) style.borderColor = value.borderColor.toLowerCase()
    if (typeof value.fontFamily === 'string' && fontFamilies.has(value.fontFamily)) style.fontFamily = value.fontFamily
    if (typeof value.fontSize === 'number' && Number.isFinite(value.fontSize) && value.fontSize >= 8 && value.fontSize <= 40) style.fontSize = value.fontSize
    if (value.textAlign==='start'||value.textAlign==='center'||value.textAlign==='end')style.textAlign=value.textAlign
    if (Object.keys(style).length) tableHeaders[id] = style
  }
  const sectionCanvases: Record<string, DesignerCanvas> = {}
  for (const [id, raw] of Object.entries(candidate.sectionCanvases ?? {})) {
    if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(id) || !raw || typeof raw !== 'object' || !raw.fields) continue
    const value = validateDesignerCanvas(raw, Object.keys(raw.fields).filter(fieldId => allowedFields.has(fieldId)))
    if (value) sectionCanvases[id] = value
  }
  const tables: Record<string, DesignerTableSettings> = {}
  for (const [id, raw] of Object.entries(candidate.tables ?? {})) {
    if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(id) || !raw || typeof raw !== 'object') continue
    const clean = validateDesignerDraft({ ...emptyDesignerDraft(formId), filterPopupFontSize: raw.filterPopupFontSize, gridSearchPosition: raw.gridSearchPosition, tableFont: raw.tableFont, tableHeaderHeight: raw.tableHeaderHeight, tableColumns: raw.tableColumns, tableHeaders: raw.tableHeaders }, formId, [])
    tables[id] = Object.fromEntries(['filterPopupFontSize', 'gridSearchPosition', 'tableFont', 'tableHeaderHeight', 'tableColumns', 'tableHeaders'].filter(key => clean[key as keyof DesignerDraft] !== undefined).map(key => [key, clean[key as keyof DesignerDraft]]))
  }
  const neighborResize:Partial<DesignerNeighborResize>={}
  for(const axis of ['horizontal','vertical'] as const)if(typeof candidate.neighborResize?.[axis]==='boolean')neighborResize[axis]=candidate.neighborResize[axis]
  const buttonPressEffect = typeof candidate.buttonPressEffect === 'boolean' ? candidate.buttonPressEffect : undefined
  return { format: designerDraftFormat, schemaVersion: designerDraftVersion, formId, overrides, ...(Object.keys(neighborResize).length?{neighborResize}:{}), ...(filterPopupFontSize !== undefined ? { filterPopupFontSize } : {}), ...(gridSearchPosition ? { gridSearchPosition } : {}), ...(tableHeaderHeight !== undefined ? { tableHeaderHeight } : {}), ...(Object.keys(tableFont).length ? { tableFont } : {}), ...(Object.keys(tableColumns).length ? { tableColumns } : {}), ...(Object.keys(tableHeaders).length ? { tableHeaders } : {}), ...(buttonPressEffect !== undefined ? { buttonPressEffect } : {}), ...(Object.keys(defaults).length ? { defaults } : {}), ...(Object.keys(actions).length ? { actions } : {}), ...(Object.keys(appearance).length ? { appearance } : {}), ...(canvas && { canvas }), ...(['schema', 'canvas'].includes(candidate.layoutMode ?? '') ? { layoutMode: candidate.layoutMode } : {}), ...(Object.keys(sectionCanvases).length ? { sectionCanvases } : {}), ...(Object.keys(tables).length ? { tables } : {}) }
}

export function setDesignerFilterPopupFontSize(draft: DesignerDraft, value: number | undefined): DesignerDraft {
  if (value !== undefined && (!Number.isInteger(value) || value < 12 || value > 24)) return draft
  if (value === draft.filterPopupFontSize) return draft
  if (value === undefined) { const { filterPopupFontSize: _size, ...rest } = draft; return rest }
  return { ...draft, filterPopupFontSize: value }
}

export function setDesignerGridSearchPosition(draft: DesignerDraft, value: GridSearchPosition | undefined): DesignerDraft {
  if (value === draft.gridSearchPosition) return draft
  if (value === undefined) { const { gridSearchPosition: _position, ...rest } = draft; return rest }
  return { ...draft, gridSearchPosition: value }
}

export function setDesignerTableFont(draft: DesignerDraft, property: 'family' | 'size', value: string | number): DesignerDraft {
  if (property === 'family' ? typeof value !== 'string' || !fontFamilies.has(value) : typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 40) return draft
  return { ...draft, tableFont: { ...draft.tableFont, [property]: value } }
}

export function setDesignerTableHeaderHeight(draft: DesignerDraft, value: number | undefined): DesignerDraft {
  if (value !== undefined && (!Number.isFinite(value) || value < 28 || value > 120)) return draft
  if (value === undefined) { const { tableHeaderHeight: _height, ...rest } = draft; return rest }
  return { ...draft, tableHeaderHeight: Math.round(value) }
}

export function setDesignerTableColumnStyle(draft: DesignerDraft, columnId: string, property: keyof DesignerTableColumnStyle, value: string | number | boolean | undefined): DesignerDraft {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(columnId) || (['bold', 'italic', 'strikeThrough'].includes(property) ? value !== undefined && typeof value !== 'boolean' : property === 'underline' ? value !== undefined && value !== 'single' && value !== 'double' : property === 'script' ? value !== undefined && value !== 'superscript' && value !== 'subscript' : property === 'textAlign' ? value !== undefined && !['start','center','end'].includes(String(value)) : property === 'fontFamily' ? value !== undefined && (typeof value !== 'string' || !fontFamilies.has(value)) : property === 'fontSize' ? value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 40) : value !== undefined && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)))) return draft
  const tableColumns = { ...draft.tableColumns }, style = { ...tableColumns[columnId] }
  if (value === undefined) delete style[property]
  else style[property] = (property === 'textColor' || property === 'backgroundColor' ? String(value).toLowerCase() : value) as never
  if (!Object.keys(style).length) delete tableColumns[columnId]
  else tableColumns[columnId] = style
  return { ...draft, tableColumns }
}

export function setDesignerTableHeaderStyle(draft: DesignerDraft, columnId: string, property: keyof DesignerTableHeaderStyle, value: string | number | boolean | undefined): DesignerDraft {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(columnId) || (['bold', 'italic', 'strikeThrough'].includes(property) ? value !== undefined && typeof value !== 'boolean' : property === 'underline' ? value !== undefined && value !== 'single' && value !== 'double' : property === 'script' ? value !== undefined && value !== 'superscript' && value !== 'subscript' : property === 'textAlign' ? value !== undefined && !['start','center','end'].includes(String(value)) : property === 'fontFamily' ? value !== undefined && (typeof value !== 'string' || !fontFamilies.has(value)) : property === 'fontSize' ? value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 40) : value !== undefined && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)))) return draft
  const tableHeaders = { ...draft.tableHeaders }, style = { ...tableHeaders[columnId] }
  if (value === undefined) delete style[property]
  else style[property] = (property === 'textColor' || property === 'backgroundColor' || property === 'borderColor' ? String(value).toLowerCase() : value) as never
  if (!Object.keys(style).length) delete tableHeaders[columnId]
  else tableHeaders[columnId] = style
  return { ...draft, tableHeaders }
}

export function setDesignerButtonPressEffect(draft: DesignerDraft, enabled: boolean): DesignerDraft {
  if (enabled === draft.buttonPressEffect) return draft
  return { ...draft, buttonPressEffect: enabled }
}

export function designerColorScope(selection: readonly string[], property: DesignerProperty, validFieldIds: readonly string[]) {
  const part = property === 'labelColor' || property === 'focusLabelColor' ? 'label' : 'input'
  const targets = [...new Set(selection.filter(key => {
    const [id, selectedPart = 'field'] = key.split('::')
    return validFieldIds.includes(id) && (selectedPart === part || selectedPart === 'field')
  }).map(key => `${key.split('::')[0]}::${part}`))]
  return { part, targets, global: targets.length === 0 } as const
}

export function designerEffectiveValues(draft: DesignerDraft, fieldId: string, part: 'input' | 'label'): DesignerFieldOverride {
  const legacy = { ...draft.overrides[fieldId] }
  if (part === 'label' && legacy.labelColor !== undefined) legacy.textColor = legacy.labelColor
  return { ...draft.defaults?.[part], ...legacy, ...draft.overrides[`${fieldId}::${part}`] }
}

export function setDesignerColorProperty(draft: DesignerDraft, selection: readonly string[], property: DesignerProperty, value: unknown, validFieldIds: readonly string[]): DesignerDraft {
  if (!colorProperties.has(property) || !validValue(property, value)) return draft
  const scope = designerColorScope(selection, property, validFieldIds)
  const storedProperty = property === 'labelColor' ? 'textColor' : property
  if (scope.global) {
    const defaults = { ...draft.defaults, [scope.part]: { ...draft.defaults?.[scope.part] } }
    if (value === undefined) delete defaults[scope.part]![storedProperty]
    else defaults[scope.part]![storedProperty] = String(value).toLowerCase()
    if (!Object.keys(defaults[scope.part]!).length) delete defaults[scope.part]
    return { ...draft, defaults }
  }
  let next = draft
  if (value === undefined) {
    // Move legacy shared colors to parts before resetting one element to its default.
    for (const target of scope.targets) {
      const id = target.split('::')[0], legacy = next.overrides[id]
      const keys: DesignerProperty[] = scope.part === 'label' && property === 'labelColor' ? ['textColor', 'labelColor'] : [property]
      for (const key of keys) if (legacy?.[key] !== undefined) {
        for (const part of ['input', 'label'] as const) {
          const effectiveKey = key === 'labelColor' ? 'textColor' : key
          const compatible = key === 'labelColor' ? part === 'label' : true
          const partId = `${id}::${part}`
          if (compatible && part !== scope.part && next.overrides[partId]?.[effectiveKey] === undefined) next = setDesignerProperty(next, [partId], effectiveKey, legacy[key], validFieldIds)
        }
        next = setDesignerProperty(next, [id], key, undefined, validFieldIds)
      }
    }
  }
  return setDesignerProperty(next, scope.targets, storedProperty, value, validFieldIds)
}

export function setDesignerActionProperty(draft: DesignerDraft, actionIds: readonly string[], property: DesignerProperty, value: unknown): DesignerDraft {
  if (!designerActionProperties.includes(property) || !validValue(property, value)) return draft
  if ((property === 'width' || property === 'height') && value !== undefined) {
    const limits = designerActionDimensionLimits[property]
    if (Number(value) < limits.min || Number(value) > limits.max) return draft
  }
  const actions = { ...draft.actions }
  for (const id of actionIds) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id)) continue
    const properties = { ...actions[id] }
    if (property === 'appearancePreset') for (const key of designerElementAppearanceProperties) delete properties[key]
    if (value === undefined) delete properties[property]
    else properties[property] = typeof value === 'string' && colorProperties.has(property) ? value.toLowerCase() : value as DesignerValue
    if (Object.keys(properties).length) actions[id] = properties
    else delete actions[id]
  }
  return { ...draft, actions }
}

export function setDesignerActionText(draft: DesignerDraft, actionId: string, part: DesignerActionTextPart, value: string | undefined): DesignerDraft {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(actionId) || typeof value !== 'string' || value.length > (part === 'code' ? 32 : 160)) return draft
  const actions = { ...draft.actions }, current = { ...actions[actionId] }
  if (part === 'code') {
    current.code = value
  } else {
    const labels = { ...current.labels }
    labels[part] = value
    if (Object.keys(labels).length) current.labels = labels
    else delete current.labels
  }
  if (Object.keys(current).length) actions[actionId] = current
  else delete actions[actionId]
  return { ...draft, actions }
}

const actionTextStyleProperties = ['fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'underline', 'strikeThrough', 'script', 'textColor', 'textAlign', 'lineHeight'] as const
export function setDesignerActionTextProperty(draft: DesignerDraft, actionIds: readonly string[], part: DesignerActionTextPart, property: DesignerProperty, value: unknown): DesignerDraft {
  if (!actionTextStyleProperties.includes(property as typeof actionTextStyleProperties[number]) || !validValue(property, value)) return draft
  const actions = { ...draft.actions }
  for (const id of actionIds) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id)) continue
    const current = { ...actions[id] }, textStyles = { ...current.textStyles }, style = { ...textStyles[part] }
    if (value === undefined) delete style[property as keyof DesignerActionTextStyle]
    else style[property as keyof DesignerActionTextStyle] = value as never
    if (Object.keys(style).length) textStyles[part] = style
    else delete textStyles[part]
    if (Object.keys(textStyles).length) current.textStyles = textStyles
    else delete current.textStyles
    if (Object.keys(current).length) actions[id] = current
    else delete actions[id]
  }
  return { ...draft, actions }
}

export function designerActionCode(draft: DesignerDraft, action: Pick<BaseFormAction, 'id' | 'code'>): string {
  return draft.actions?.[action.id]?.code ?? action.code
}

export function designerActionLabel(draft: DesignerDraft, action: Pick<BaseFormAction, 'id' | 'label'>, language: 'fa' | 'en' | 'zh'): string {
  return draft.actions?.[action.id]?.labels?.[language] ?? action.label[language]
}

export function designerActionTextStyle(draft: DesignerDraft, actionId: string, part: DesignerActionTextPart): Record<string, string | number> {
  const values = draft.actions?.[actionId]?.textStyles?.[part] ?? {}
  const style: Record<string, string | number> = {}
  if (values.fontFamily && values.fontFamily !== 'inherit') style.fontFamily = safeFonts[String(values.fontFamily)]
  if (values.fontSize !== undefined) style.fontSize = `${values.fontSize}px`
  if (values.bold !== undefined) style.fontWeight = values.bold ? 700 : 400
  else if (values.fontWeight !== undefined) style.fontWeight = values.fontWeight
  if (values.italic !== undefined) style.fontStyle = values.italic ? 'italic' : 'normal'
  if (values.textColor !== undefined) style.color = values.textColor
  if (values.underline || values.strikeThrough) style.textDecorationLine = [values.underline ? 'underline' : '', values.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ')
  if (values.underline === 'double') style.textDecorationStyle = 'double'
  if (values.script) { style.verticalAlign = values.script === 'superscript' ? 'super' : 'sub'; style.fontSize = `${Number(values.fontSize ?? 14) * 0.75}px` }
  if (values.textAlign !== undefined) style.textAlign = String(values.textAlign)
  if (values.lineHeight !== undefined) style.lineHeight = values.lineHeight
  return style
}

export function designerActionVisible(draft: DesignerDraft, action: Pick<BaseFormAction, 'id' | 'required'>): boolean {
  return Boolean(action.required) || draft.actions?.[action.id]?.visible !== false
}

export function setDesignerActionVisibility(draft: DesignerDraft, action: Pick<BaseFormAction, 'id' | 'required'>, visible: boolean): DesignerDraft {
  if (typeof visible !== 'boolean' || action.required || !/^[a-zA-Z0-9_.-]{1,80}$/.test(action.id) || designerActionVisible(draft, action) === visible) return draft
  return { ...draft, actions: { ...draft.actions, [action.id]: { ...draft.actions?.[action.id], visible } } }
}

export function designerShortcutAction(draft: DesignerDraft, actions: readonly BaseFormAction[], key: string): BaseFormAction | undefined {
  return actions.find(action => !action.disabled && designerActionVisible(draft, action) && action.keys?.includes(key))
}

export function setDesignerProperty(draft: DesignerDraft, fieldIds: readonly string[], property: DesignerProperty, value: unknown, validFieldIds: readonly string[]): DesignerDraft {
  if (!validPropertySet.has(property) || !validValue(property, value)) return draft
  const allowed = new Set(validFieldIds)
  const overrides = { ...draft.overrides }
  let changed = false
  for (const fieldId of fieldIds) {
    const [baseId, part = 'field'] = fieldId.split('::')
    if (!allowed.has(baseId) || !['field', 'label', 'input'].includes(part)) continue
    const storageId = part === 'field' ? baseId : `${baseId}::${part}`
    const current = { ...(overrides[storageId] ?? {}) }
    if (property === 'appearancePreset') for (const key of designerElementAppearanceProperties) delete current[key]
    if (value === undefined) delete current[property]
    else current[property] = typeof value === 'string' && colorProperties.has(property) ? value.toLowerCase() : value
    if (Object.keys(current).length) overrides[storageId] = current
    else delete overrides[storageId]
    changed = true
  }
  return changed ? { ...draft, overrides } : draft
}

export function setDesignerAppearanceProperty(draft: DesignerDraft, property: DesignerAppearanceProperty, value: unknown): DesignerDraft {
  if (!validAppearancePropertySet.has(property) || (value !== undefined && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)))) return draft
  const appearance = { ...(draft.appearance ?? {}) }
  if (value === undefined) {
    if (!(property in appearance)) return draft
    delete appearance[property]
  } else {
    const normalized = value.toLowerCase()
    if (appearance[property] === normalized) return draft
    appearance[property] = normalized
  }
  return Object.keys(appearance).length ? { ...draft, appearance } : (() => { const { appearance: _appearance, ...rest } = draft; return rest })()
}

export function designerAppearanceStyle(draft: DesignerDraft): Record<string, string> {
  const style: Record<string, string> = {}
  for (const property of designerAppearanceProperties) {
    const value = draft.appearance?.[property]
    if (value) style[appearanceVariables[property]] = value
  }
  if (draft.tableFont?.family) style['--lab-table-font-family'] = safeFonts[draft.tableFont.family] ?? 'inherit'
  if (draft.tableFont?.size !== undefined) style['--lab-table-font-size'] = `${draft.tableFont.size}px`
  return style
}

export function moveDesignerFieldGroup(draft: DesignerDraft, fieldId: string, offsetX: number, offsetY: number, validFieldIds: readonly string[]): DesignerDraft {
  if (!validFieldIds.includes(fieldId) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return draft
  let next = draft
  for (const part of ['label', 'input'] as const) {
    const target = `${fieldId}::${part}`
    const current = { ...draft.overrides[fieldId], ...draft.overrides[target] }
    next = setDesignerProperty(next, [target], 'offsetX', Math.max(-10000, Math.min(10000, Number(current.offsetX ?? 0) + offsetX)), validFieldIds)
    next = setDesignerProperty(next, [target], 'offsetY', Math.max(-10000, Math.min(10000, Number(current.offsetY ?? 0) + offsetY)), validFieldIds)
  }
  return next
}

export function resizeDesignerWidth(width: number, deltaX: number, handleEdge: 'left' | 'right'): number {
  const outwardDelta = handleEdge === 'left' ? -deltaX : deltaX
  return Math.max(48, Math.min(1000, width + outwardDelta))
}

export function resizeDesignerEdge(size: number, pointerDelta: number, edge: 'left' | 'right' | 'top' | 'bottom', minimum: number, maximum: number): { size: number; positionDelta: number } {
  const direction = edge === 'left' || edge === 'top' ? -1 : 1
  const nextSize = Math.max(minimum, Math.min(maximum, size + pointerDelta * direction))
  return { size: nextSize, positionDelta: edge === 'left' || edge === 'top' ? size - nextSize : 0 }
}

export function selectDesignerPart(selection: readonly string[], fieldId: string, part: DesignerPart, additive: boolean): string[] {
  const key = `${fieldId}::${part}`
  return additive ? selection.includes(key) ? selection.filter(item => item !== key) : [...selection, key] : [key]
}

export function contextDesignerSelection(selection: readonly string[], target: string): string[] {
  const group = target.includes('::') ? `${target.split('::')[0]}::field` : target
  return selection.includes(target) || selection.includes(group) ? [...selection] : [target]
}

export function selectedDesignerInputs(selection: readonly string[], validFieldIds: readonly string[]): string[] {
  return [...new Set(selection.filter(key => key.split('::')[1] !== 'label').map(key => key.split('::')[0]).filter(id => validFieldIds.includes(id)))]
}

type DesignerPointerStart = Pick<PointerEvent, 'button' | 'pointerId' | 'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'> & { currentTarget: HTMLElement }

// Capture belongs to the pressed handle. A handle's later click must not select its parent.
export function stopDesignerHandleClick(event: Pick<Event, 'preventDefault' | 'stopPropagation'>): void {
  event.preventDefault()
  event.stopPropagation()
}

export function captureDesignerPointer(event: DesignerPointerStart, onDelta: (dx: number, dy: number) => void, onEnd: (event?:PointerEvent) => void): () => void {
  const handle = event.currentTarget
  const { pointerId, clientX, clientY } = event
  event.preventDefault()
  event.stopPropagation()
  let ended = false
  const move = (next: PointerEvent) => {
    if (next.pointerId === pointerId) onDelta(next.clientX - clientX, next.clientY - clientY)
  }
  const end = (next?: PointerEvent) => {
    if (ended || (next && next.pointerId !== pointerId)) return
    ended = true
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    handle.removeEventListener('lostpointercapture', end)
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
    onEnd(next)
  }
  handle.setPointerCapture(pointerId)
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
  handle.addEventListener('lostpointercapture', end)
  return () => end()
}

export type DesignerInputBounds = { id: string; left: number; top: number; width: number; height: number; labelLeft: number; labelTop: number }
export type DesignerInputAnchor = Pick<DesignerInputBounds, 'id' | 'left' | 'top' | 'labelLeft' | 'labelTop'>

export function resizeDesignerInputs(draft: DesignerDraft, inputs: readonly DesignerInputBounds[], edge: 'left' | 'right' | 'top' | 'bottom', delta: number, validFieldIds: readonly string[]): { draft: DesignerDraft; anchors: DesignerInputAnchor[] } {
  const horizontal = edge === 'left' || edge === 'right'
  let next = draft
  const anchors = inputs.map(input => {
    const resized = resizeDesignerEdge(horizontal ? input.width : input.height, delta, edge, horizontal ? 48 : 24, horizontal ? 1000 : 600)
    next = setDesignerProperty(next, [`${input.id}::input`], horizontal ? 'width' : 'height', resized.size, validFieldIds)
    return { id: input.id, left: input.left + (horizontal ? resized.positionDelta : 0), top: input.top + (horizontal ? 0 : resized.positionDelta), labelLeft: input.labelLeft, labelTop: input.labelTop }
  })
  return { draft: next, anchors }
}

// RTL flex alignment and grid row heights can move a control when its size changes.
// Correct from rendered input geometry before paint, keeping the label and opposite edge fixed.
export function anchorDesignerInputs(draft: DesignerDraft, anchors: readonly DesignerInputAnchor[], measured: readonly DesignerInputBounds[], validFieldIds: readonly string[]): DesignerDraft {
  let next = draft
  for (const anchor of anchors) {
    const bounds = measured.find(input => input.id === anchor.id)
    if (!bounds) continue
    for (const part of ['input', 'label'] as const) {
      const key = `${anchor.id}::${part}`
      const values = { ...draft.overrides[anchor.id], ...draft.overrides[key] }
      const dx = part === 'input' ? anchor.left - bounds.left : anchor.labelLeft - bounds.labelLeft
      const dy = part === 'input' ? anchor.top - bounds.top : anchor.labelTop - bounds.labelTop
      if (Math.abs(dx) > 0.1) next = setDesignerProperty(next, [key], 'offsetX', Number(values.offsetX ?? 0) + dx, validFieldIds)
      if (Math.abs(dy) > 0.1) next = setDesignerProperty(next, [key], 'offsetY', Number(values.offsetY ?? 0) + dy, validFieldIds)
    }
  }
  return next
}

export type DesignerLayoutOrientation = 'horizontal' | 'vertical'
export type DesignerLayoutOperation = 'arrange' | 'align' | 'equalSize' | 'equalWidth' | 'equalHeight' | 'equalSpacing'
export type DesignerLayoutField = {
  id: string
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  inputWidth: number
  inputHeight: number
  labelWidth: number
  labelHeight: number
}

export function layoutDesignerFields(
  draft: DesignerDraft,
  fields: readonly DesignerLayoutField[],
  options: { operation: DesignerLayoutOperation; orientation: DesignerLayoutOrientation; gap: number; rtl: boolean; referenceId?: string; width?: number; height?: number; verticalGap?: number; wrapWidth?: number },
  validFieldIds: readonly string[]
): DesignerDraft {
  const unique = [...new Map(fields.filter(field => validFieldIds.includes(field.id)).map(field => [field.id, field])).values()]
  if (unique.length < 2 || !Number.isFinite(options.gap)) return draft
  const horizontal = options.orientation === 'horizontal'
  const ordered = [...unique].sort((a, b) => horizontal
    ? options.rtl ? b.right - a.right : a.left - b.left
    : a.top - b.top || (options.rtl ? b.right - a.right : a.left - b.left))
  const gap = Math.max(0, Math.min(300, options.gap))
  const reference = unique.find(field => field.id === options.referenceId) ?? unique[0]
  const sizeWidth = ['equalSize', 'equalWidth'].includes(options.operation)
  const sizeHeight = ['equalSize', 'equalHeight'].includes(options.operation)
  const commonWidth = sizeWidth ? Math.max(48, Math.min(1000, options.width ?? reference.inputWidth)) : 0
  const commonHeight = sizeHeight ? Math.max(24, Math.min(600, options.height ?? reference.inputHeight)) : 0
  let next = draft
  const slots = ordered.map(field => {
    const width = sizeWidth ? commonWidth : field.inputWidth
    const height = sizeHeight ? commonHeight : field.inputHeight
    if (sizeWidth) next = setDesignerProperty(next, [`${field.id}::input`], 'width', width, validFieldIds)
    if (sizeHeight) next = setDesignerProperty(next, [`${field.id}::input`], 'height', height, validFieldIds)
    const groupWidth = Math.max(field.labelWidth, field.width + width - field.inputWidth)
    const groupHeight = Math.max(field.labelHeight, field.height + height - field.inputHeight)
    return {
      ...field,
      inputWidth: width,
      inputHeight: height,
      width: groupWidth,
      height: groupHeight,
      right: field.left + groupWidth,
      bottom: field.top + groupHeight
    }
  })

  const alignCrossAxis = options.operation === 'arrange' || options.operation === 'align'
  const distribute = options.operation === 'arrange' || options.operation === 'equalSpacing'
  if (options.operation === 'arrange' && horizontal && options.wrapWidth) {
    const margin = 12, right = options.wrapWidth - margin
    let cursor = options.rtl ? right : margin, top = Math.min(...slots.map(field => field.top)), rowHeight = 0
    for (const field of slots) {
      const exceeds = options.rtl ? cursor - field.width < margin : cursor + field.width > right
      if (exceeds && rowHeight) { top += rowHeight + (options.verticalGap ?? gap); cursor = options.rtl ? right : margin; rowHeight = 0 }
      const left = options.rtl ? cursor - field.width : cursor
      next = moveDesignerFieldGroup(next, field.id, left - field.left, top - field.top, validFieldIds)
      cursor = options.rtl ? left - gap : left + field.width + gap
      rowHeight = Math.max(rowHeight, field.height)
    }
    return next
  }
  if (horizontal && alignCrossAxis) {
    const top = Math.min(...slots.map(field => field.top))
    for (const field of slots) next = moveDesignerFieldGroup(next, field.id, 0, top - field.top, validFieldIds)
  } else if (!horizontal && alignCrossAxis) {
    const edge = options.rtl ? Math.max(...slots.map(field => field.right)) : Math.min(...slots.map(field => field.left))
    for (const field of slots) next = moveDesignerFieldGroup(next, field.id, options.rtl ? edge - field.right : edge - field.left, 0, validFieldIds)
  }

  if (distribute) {
    if (horizontal) {
      const extent = slots.reduce((sum, field) => sum + field.width, 0) + gap * (slots.length - 1)
      let cursor = options.rtl ? Math.min(...slots.map(field => field.left)) + extent : Math.min(...slots.map(field => field.left))
      for (const field of slots) {
        const targetLeft = options.rtl ? cursor - field.width : cursor
        next = moveDesignerFieldGroup(next, field.id, targetLeft - field.left, 0, validFieldIds)
        cursor = options.rtl ? targetLeft - gap : targetLeft + field.width + gap
      }
    } else {
      let cursor = Math.min(...slots.map(field => field.top))
      for (const field of slots) {
        next = moveDesignerFieldGroup(next, field.id, 0, cursor - field.top, validFieldIds)
        cursor += field.height + gap
      }
    }
  }
  return next
}

export function resetDesignerFields(draft: DesignerDraft, fieldIds: readonly string[]): DesignerDraft {
  const keys = fieldIds.flatMap(id => { const [baseId, part] = id.split('::'); return part ? [id] : [baseId, `${baseId}::label`, `${baseId}::input`] })
  if (!keys.some(id => id in draft.overrides)) return draft
  const overrides = { ...draft.overrides }
  for (const id of keys) delete overrides[id]
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

/** Join legacy structure/visual stacks once, without dropping either. New edits share one timeline. */
export function attachDesignerDocument(history: DesignerHistory, schema: FormSchemaDraft, legacy?: { past: FormSchemaDraft[]; future: FormSchemaDraft[] }): DesignerHistory {
  if (history.document) return history
  const past = legacy?.past ?? [], future = legacy?.future ?? []
  return { ...history, past: [...past.map(() => history.past[0] ?? history.present), ...history.past], future: [...history.future, ...future.map(() => history.present)], document: { present: schema, past: [...past, ...history.past.map(() => schema)], future: [...history.future.map(() => schema), ...future], ...(history.transactionStart ? { transactionStart: schema } : {}) } }
}

export function designerHistoryReducer(state: DesignerHistory, action: DesignerHistoryAction): DesignerHistory {
  if (action.type === 'replace') return state.document ? designerHistoryReducer(state, { type: 'change', draft: action.draft }) : createDesignerHistory(action.draft)
  if (action.type === 'beginTransaction') return state.transactionStart ? state : { ...state, transactionStart: state.present, ...(state.document ? { document: { ...state.document, transactionStart: state.document.present } } : {}) }
  if (action.type === 'change') {
    const schema = action.schema ?? state.document?.present
    if (JSON.stringify(action.draft) === JSON.stringify(state.present) && JSON.stringify(schema) === JSON.stringify(state.document?.present)) return state
    if (state.transactionStart) return { ...state, present: action.draft, ...(state.document && schema ? { document: { ...state.document, present: schema } } : {}) }
    return { present: action.draft, past: [...state.past, state.present].slice(-designerHistoryLimit), future: [], ...(state.document && schema ? { document: { present: schema, past: [...state.document.past, state.document.present].slice(-designerHistoryLimit), future: [] } } : {}) }
  }
  if (action.type === 'commitTransaction') {
    if (!state.transactionStart) return state
    const unchanged = JSON.stringify(state.transactionStart) === JSON.stringify(state.present) && JSON.stringify(state.document?.transactionStart) === JSON.stringify(state.document?.present)
    const past = unchanged ? state.past : [...state.past, state.transactionStart].slice(-designerHistoryLimit)
    return { present: state.present, past, future: unchanged ? state.future : [], transactionStart: undefined, ...(state.document ? { document: { present: state.document.present, past: unchanged ? state.document.past : [...state.document.past, state.document.transactionStart ?? state.document.present].slice(-designerHistoryLimit), future: unchanged ? state.document.future : [] } } : {}) }
  }
  if (state.transactionStart) return state
  if (action.type === 'undo') {
    if (!state.past.length) return state
    const previous = state.past[state.past.length - 1]
    return { present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future].slice(0, designerHistoryLimit), ...(state.document ? { document: { present: state.document.past.at(-1) ?? state.document.present, past: state.document.past.slice(0, -1), future: [state.document.present, ...state.document.future].slice(0, designerHistoryLimit) } } : {}) }
  }
  if (!state.future.length) return state
  return { present: state.future[0], past: [...state.past, state.present].slice(-designerHistoryLimit), future: state.future.slice(1), ...(state.document ? { document: { present: state.document.future[0] ?? state.document.present, past: [...state.document.past, state.document.present].slice(-designerHistoryLimit), future: state.document.future.slice(1) } } : {}) }
}

const cssColorVariables: Partial<Record<DesignerProperty, string>> = {
  componentPopupBackground: '--component-popup-bg', componentAddBackground: '--component-add-bg', componentAddTextColor: '--component-add-text',
  backgroundColor: '--lab-bg', textColor: '--lab-text', labelColor: '--lab-label', borderColor: '--lab-border',
  focusColor: '--lab-focus', focusBackgroundColor: '--lab-focus-bg', focusTextColor: '--lab-focus-text', focusBorderColor: '--lab-focus-border', focusLabelColor: '--lab-focus-label',
  hoverColor: '--lab-hover', hoverTextColor: '--lab-hover-text', hoverBorderColor: '--lab-hover-border', selectedColor: '--lab-selected', disabledColor: '--lab-disabled', disabledTextColor: '--lab-disabled-text', disabledBorderColor: '--lab-disabled-border', errorColor: '--lab-error'
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
  if (values.componentPopupFontSize !== undefined) style['--component-popup-font-size'] = `${values.componentPopupFontSize}px`
  if (values.componentAddWidth !== undefined) style['--component-add-width'] = `${values.componentAddWidth}px`
  if (values.componentAddHeight !== undefined) style['--component-add-height'] = `${values.componentAddHeight}px`
  if (values.fontFamily && values.fontFamily !== 'inherit') style['--lab-font'] = safeFonts[String(values.fontFamily)]
  if (values.fontSize !== undefined) style['--lab-font-size'] = String(values.fontSize) + 'px'
  if (values.fontWeight !== undefined) style['--lab-font-weight'] = String(values.fontWeight)
  if (values.bold !== undefined) style['--lab-bold'] = values.bold ? '700' : '400'
  if (values.italic !== undefined) style['--lab-font-style'] = values.italic ? 'italic' : 'normal'
  if (values.underline || values.strikeThrough) style['--lab-text-decoration'] = [values.underline ? 'underline' : '', values.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ')
  if (values.underline === 'double') style['--lab-text-decoration-style'] = 'double'
  if (values.script) { style['--lab-script-size'] = '0.75em'; style['--lab-script-align'] = values.script === 'superscript' ? 'super' : 'sub' }
  if (values.textAlign !== undefined) style['--lab-text-align'] = String(values.textAlign)
  if (values.lineHeight !== undefined) style['--lab-line-height'] = String(values.lineHeight)
  if (values.width !== undefined) style['--lab-width'] = `${values.width}px`
  if (values.height !== undefined) style['--lab-height'] = `${values.height}px`
  if (values.borderRadius !== undefined) style['--lab-radius'] = `${values.borderRadius}px`
  if (values.offsetX !== undefined || values.offsetY !== undefined) style['--lab-offset'] = `translate(${Number(values.offsetX ?? 0)}px, ${Number(values.offsetY ?? 0)}px)`
  if (designerElementAppearanceProperties.some(key => values[key] !== undefined)) {
    const effects = designerElementAppearanceValues(values)
    for (const [property, variable] of [['borderWidth', '--lab-border-width'], ['borderRadius', '--lab-radius'], ['paddingX', '--lab-padding-x'], ['paddingY', '--lab-padding-y']] as const) {
      if (effects[property] !== undefined) style[variable] = `${effects[property]}px`
    }
    if (effects.borderStyle !== undefined) style['--lab-border-style'] = String(effects.borderStyle)
    const shadow = Number(effects.shadowOpacity ?? 0) > 0 ? `${effects.shadowInset ? 'inset ' : ''}${effects.shadowOffsetX ?? 0}px ${effects.shadowOffsetY ?? 2}px ${effects.shadowBlur ?? 6}px ${effects.shadowSpread ?? 0}px rgb(0 0 0 / ${effects.shadowOpacity}%)` : 'none'
    style['--lab-shadow'] = values.appearancePreset === 'raised' ? `inset 1px 1px 0 #ffffff80, inset -1px -1px 0 #00000030${shadow === 'none' ? '' : `, ${shadow}`}` : shadow
    style['--lab-shadow-layer'] = style['--lab-shadow'] === 'none' ? '0 0 0 0 transparent' : style['--lab-shadow']
    const start = effects.gradientStartColor ?? 'var(--lab-effect-base-bg)', end = effects.gradientEndColor ?? '#ffffff'
    style['--lab-gradient'] = effects.gradientEnabled ? `linear-gradient(${effects.gradientAngle ?? 135}deg, ${start}, ${end})` : 'none'
    if (values.appearancePreset === 'outlined') style['--lab-effect-bg'] = 'transparent'
  }
  return style
}

export function designerStyleForPart(draft: DesignerDraft, fieldId: string, part: DesignerPart): Record<string, string | number> {
  if (part === 'field') return designerStyleForField(draft, fieldId)
  const values = designerEffectiveValues(draft, fieldId, part)
  return designerStyleForField({ ...draft, overrides: { [fieldId]: values } }, fieldId)
}

export function designerActionStyle(draft: DesignerDraft, actionId: string): Record<string, string | number> {
  const style = designerStyleForField({ ...draft, overrides: { [actionId]: draft.actions?.[actionId] ?? {} } }, actionId)
  const actionVariables: Record<string, string> = { '--lab-bg': '--lab-action-bg', '--lab-text': '--lab-action-text', '--lab-border': '--lab-action-border', '--lab-hover': '--lab-action-hover-bg', '--lab-hover-text': '--lab-action-hover-text', '--lab-hover-border': '--lab-action-hover-border', '--lab-disabled': '--lab-action-disabled-bg', '--lab-disabled-text': '--lab-action-disabled-text', '--lab-disabled-border': '--lab-action-disabled-border' }
  return Object.fromEntries(Object.entries(style).map(([key, value]) => [actionVariables[key] ?? key, value]))
}

// Physical canvas coordinates. Editable rectangles never participate in grid sizing.
export type DesignerRect = { left: number; top: number; width: number; height: number }
export type DesignerCanvasField = { input: DesignerRect; label: DesignerRect; select?: DesignerRect; error?: DesignerRect }
export type DesignerCanvas = { width: number; height: number; fields: Record<string, DesignerCanvasField>; centeredFieldIds?: string[] }
export type DesignerObstacle = DesignerRect & { id: string }
export type DesignerAlignment = 'top' | 'bottom' | 'left' | 'right' | 'horizontalCenter' | 'verticalCenter'
export const designerSafetyGap = 8
const epsilon = 0.1
export const rightOf = (rect: DesignerRect) => rect.left + rect.width
export const bottomOf = (rect: DesignerRect) => rect.top + rect.height

export function validateDesignerCanvas(value: unknown, ids: readonly string[]): DesignerCanvas | undefined {
  if (!value || typeof value !== 'object') return undefined
  const canvas = value as DesignerCanvas
  if (![canvas.width, canvas.height].every(n => Number.isFinite(n) && n > 0 && n <= 20000) || !canvas.fields || typeof canvas.fields !== 'object') return undefined
  const fields: DesignerCanvas['fields'] = {}
  const cleanRect = (rect: DesignerRect | undefined) => rect && ['left', 'top', 'width', 'height'].every(key => typeof rect[key as keyof DesignerRect] === 'number' && Number.isFinite(rect[key as keyof DesignerRect]))
    && Math.abs(rect.left) <= 20000 && Math.abs(rect.top) <= 20000 && rect.width > 0 && rect.width <= 20000 && rect.height > 0 && rect.height <= 20000
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined
  for (const id of ids) {
    const field = canvas.fields[id]
    if (!field) continue
    const input = cleanRect(field.input), label = cleanRect(field.label)
    if (!input || !label) return undefined
    const select = cleanRect(field.select), error = cleanRect(field.error)
    fields[id] = { input, label, ...(select && { select }), ...(error && { error }) }
  }
  return Object.keys(fields).length === ids.length ? { width: canvas.width, height: canvas.height, fields, ...(Array.isArray(canvas.centeredFieldIds)?{centeredFieldIds:canvas.centeredFieldIds.filter(id=>typeof id==='string'&&ids.includes(id))}:{}) } : undefined
}

/** Center each selected physical row by its input borders, retaining sizes and gaps. */
export function centerCanvasRows(canvas:DesignerCanvas,ids:readonly string[]=canvas.centeredFieldIds??[],width=canvas.width):DesignerCanvas {
  const fields={...canvas.fields},rows:string[][]=[]
  for(const id of [...new Set(ids)].filter(id=>fields[id]).sort((a,b)=>fields[a].input.top-fields[b].input.top)){
    const input=fields[id].input
    const row=rows.find(row=>row.some(other=>{const r=fields[other].input;return Math.min(bottomOf(r),bottomOf(input))-Math.max(r.top,input.top)>0}))
    if(row)row.push(id);else rows.push([id])
  }
  width=Math.max(width,...rows.map(row=>Math.max(...row.map(id=>rightOf(fields[id].input)))-Math.min(...row.map(id=>fields[id].input.left))))
  for(const row of rows){
    const left=Math.min(...row.map(id=>fields[id].input.left)),right=Math.max(...row.map(id=>rightOf(fields[id].input)))
    const dx=(width-(right-left))/2-left
    for(const id of row)fields[id]=translateCanvasField(fields[id],dx,0)
  }
  return {...canvas,width,fields,centeredFieldIds:[...new Set(ids)].filter(id=>fields[id])}
}

export function canvasObstacles(canvas: DesignerCanvas): DesignerObstacle[] {
  return Object.entries(canvas.fields).flatMap(([id, field]) => Object.entries(field).map(([part, rect]) => ({ ...rect, id: `${id}::${part}` })))
}

export function rectanglesCollide(a: DesignerRect, b: DesignerRect, gap = designerSafetyGap): boolean {
  return a.left < rightOf(b) + gap - epsilon && rightOf(a) > b.left - gap + epsilon && a.top < bottomOf(b) + gap - epsilon && bottomOf(a) > b.top - gap + epsilon
}

export function existingCanvasCollisions(canvas: DesignerCanvas): [string, string][] {
  const parts = canvasObstacles(canvas)
  return parts.flatMap((a, index) => parts.slice(index + 1).filter(b => rectanglesCollide(a, b, 0)).map(b => [a.id, b.id] as [string, string]))
}

export function resizeCanvasInput(initial: DesignerRect, edge: 'left' | 'right' | 'top' | 'bottom', delta: number, container: DesignerRect, obstacles: readonly DesignerRect[], gap = designerSafetyGap): DesignerRect {
  const horizontal = edge === 'left' || edge === 'right'
  const leading = edge === 'left' || edge === 'top'
  const start = horizontal ? initial.left : initial.top
  const end = horizontal ? rightOf(initial) : bottomOf(initial)
  const size = horizontal ? initial.width : initial.height
  const minimum = Math.min(size, horizontal ? 48 : 24)
  const maximum = Math.max(size, horizontal ? 1000 : 600)
  let low = leading ? Math.min(start, horizontal ? container.left : container.top) : start + minimum
  let high = leading ? end - minimum : Math.max(end, horizontal ? rightOf(container) : bottomOf(container))
  if (leading) low = Math.max(low, end - maximum)
  else high = Math.min(high, start + maximum)
  for (const obstacle of obstacles) {
    if (obstacle.width <= 0 || obstacle.height <= 0) continue
    const crossStart = horizontal ? initial.top : initial.left
    const crossEnd = horizontal ? bottomOf(initial) : rightOf(initial)
    const obstacleCrossStart = horizontal ? obstacle.top : obstacle.left
    const obstacleCrossEnd = horizontal ? bottomOf(obstacle) : rightOf(obstacle)
    if (crossEnd <= obstacleCrossStart - gap + epsilon || crossStart >= obstacleCrossEnd + gap - epsilon) continue
    const obstacleStart = horizontal ? obstacle.left : obstacle.top
    const obstacleEnd = horizontal ? rightOf(obstacle) : bottomOf(obstacle)
    if (leading && obstacleEnd <= start + epsilon) low = Math.max(low, Math.min(start, obstacleEnd + gap))
    else if (!leading && obstacleStart >= end - epsilon) high = Math.min(high, Math.max(end, obstacleStart - gap))
    else if (obstacleEnd > start && obstacleStart < end) {
      // Preserve an imported overlap, but never enlarge into that obstacle.
      if (leading) low = Math.max(low, start)
      else high = Math.min(high, end)
    }
  }
  const coordinate = Math.max(low, Math.min(high, (leading ? start : end) + delta))
  const next = { ...initial }
  if (horizontal) { next.left = leading ? coordinate : start; next.width = leading ? end - coordinate : coordinate - start }
  else { next.top = leading ? coordinate : start; next.height = leading ? end - coordinate : coordinate - start }
  return next
}

export function resizeCanvasInputs(canvas: DesignerCanvas, ids: readonly string[], edge: 'left' | 'right' | 'top' | 'bottom', delta: number, extra: readonly DesignerObstacle[] = []): DesignerCanvas {
  const parts = [...canvasObstacles(canvas), ...extra]
  const container = { left: 0, top: 0, width: canvas.width, height: canvas.height }
  const fields = { ...canvas.fields }
  for (const id of ids) {
    const field = canvas.fields[id]
    if (!field) continue
    // Selection controls are Designer chrome. A field's own label may have a
    // smaller normal vertical gap; it must not prevent horizontal resizing.
    const input = resizeCanvasInput(field.input, edge, delta, container, parts.filter(part => !part.id.endsWith('::select') && part.id !== `${id}::input` && (!['left','right'].includes(edge) || part.id !== `${id}::label`)))
    fields[id] = { ...field, input }
  }
  return { ...canvas, fields }
}

export const designerResizeHandles = ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type DesignerResizeHandle = typeof designerResizeHandles[number]
export type DesignerNeighborResize = { horizontal:boolean; vertical:boolean }
export const laboratoryResizeContract = { axes:['horizontal','vertical'], minimumWidth:48, minimumHeight:24, preserveGap:true, preserveOuterSpan:true, persistentRowCentering:true, atomicUndo:true } as const

function canvasResizeNeighbor(canvas:DesignerCanvas,id:string,edge:'left'|'right'|'top'|'bottom') {
  const initial=canvas.fields[id]?.input;if(!initial)return undefined
  const horizontal=edge==='left'||edge==='right',leading=edge==='left'||edge==='top'
  const pos=horizontal?'left':'top',size=horizontal?'width':'height',crossPos=horizontal?'top':'left',crossSize=horizontal?'height':'width'
  const candidates=Object.entries(canvas.fields).filter(([key,other])=>key!==id&&Math.min(initial[crossPos]+initial[crossSize],other.input[crossPos]+other.input[crossSize])-Math.max(initial[crossPos],other.input[crossPos])>0.5).map(([key,other])=>({id:key,field:other,gap:leading?initial[pos]-other.input[pos]-other.input[size]:other.input[pos]-initial[pos]-initial[size]})).filter(item=>item.gap>=-0.1).sort((a,b)=>a.gap-b.gap)
  return candidates[0]&&!(candidates[1]&&Math.abs(candidates[1].gap-candidates[0].gap)<0.5)?candidates[0]:undefined
}

/** Move a shared boundary in physical coordinates. Both outer edges and the
 * existing gap stay fixed. Only one unambiguous neighbour in this canvas joins. */
export function resizeCanvasNeighborInput(canvas:DesignerCanvas,id:string,edge:'left'|'right'|'top'|'bottom',delta:number):DesignerCanvas {
  const field=canvas.fields[id];if(!field||!Number.isFinite(delta)||!delta)return canvas
  const horizontal=edge==='left'||edge==='right',leading=edge==='left'||edge==='top'
  const pos=horizontal?'left':'top',size=horizontal?'width':'height'
  const initial=field.input,start=initial[pos]
  const neighbor=canvasResizeNeighbor(canvas,id,edge);if(!neighbor)return canvas
  const minimum=horizontal?48:24,maximum=horizontal?1000:600
  const ownMin=Math.min(minimum,initial[size]),otherMin=Math.min(minimum,neighbor.field.input[size])
  const ownMax=Math.max(maximum,initial[size]),otherMax=Math.max(maximum,neighbor.field.input[size])
  const low=leading?Math.max(initial[size]-ownMax,otherMin-neighbor.field.input[size]):Math.max(ownMin-initial[size],neighbor.field.input[size]-otherMax)
  const high=leading?Math.min(initial[size]-ownMin,otherMax-neighbor.field.input[size]):Math.min(ownMax-initial[size],neighbor.field.input[size]-otherMin)
  const amount=Math.max(low,Math.min(high,delta));if(Math.abs(amount)<0.001)return canvas
  const adjust=(before:DesignerCanvasField,input:DesignerRect):DesignerCanvasField=>{
    const dx=horizontal?(Math.abs(rightOf(before.label)-rightOf(before.input))<=Math.abs(before.label.left-before.input.left)?rightOf(input)-rightOf(before.input):input.left-before.input.left):0
    const dy=horizontal?0:input.top-before.input.top
    return {...before,input,label:{...before.label,left:before.label.left+dx,top:before.label.top+dy},...(before.select?{select:{...before.select,left:before.select.left+input.left-before.input.left,top:before.select.top+dy}}:{}),...(before.error?{error:{...before.error,left:before.error.left+input.left-before.input.left,top:before.error.top+bottomOf(input)-bottomOf(before.input)}}:{})}
  }
  const build=(d:number):DesignerCanvas=>{
    const input={...initial,[pos]:start+(leading?d:0),[size]:initial[size]+(leading?-d:d)}
    const other={...neighbor.field.input,[pos]:neighbor.field.input[pos]+(leading?0:d),[size]:neighbor.field.input[size]+(leading?d:-d)}
    return {...canvas,fields:{...canvas.fields,[id]:adjust(field,input),[neighbor.id]:adjust(neighbor.field,other)}}
  }
  const parts=canvasObstacles(canvas).filter(part=>!part.id.endsWith('::select'))
  const area=(a:DesignerRect,b:DesignerRect)=>Math.max(0,Math.min(rightOf(a),rightOf(b))-Math.max(a.left,b.left))*Math.max(0,Math.min(bottomOf(a),bottomOf(b))-Math.max(a.top,b.top))
  const safe=(next:DesignerCanvas)=>{
    const after=canvasObstacles(next).filter(part=>!part.id.endsWith('::select'))
    for(let i=0;i<after.length;i++){
      const a=after[i],old=parts[i]
      if(a.left<Math.min(0,old.left)-0.01||a.top<Math.min(0,old.top)-0.01||rightOf(a)>Math.max(canvas.width,rightOf(old))+0.01||bottomOf(a)>Math.max(canvas.height,bottomOf(old))+0.01)return false
      for(let j=i+1;j<after.length;j++)if(area(a,after[j])>area(old,parts[j])+0.01)return false
    }
    return true
  }
  let result=build(amount)
  if(!safe(result)){let lo=0,hi=1;for(let i=0;i<24;i++){const middle=(lo+hi)/2;if(safe(build(amount*middle)))lo=middle;else hi=middle}if(Math.abs(amount*lo)<0.01)return canvas;result=build(amount*lo)}
  return result
}

/** Numeric sizes use the same physical boundary operation as pointer/keyboard. */
export function resizeCanvasDimension(canvas:DesignerCanvas,ids:readonly string[],dimension:'width'|'height',value:number,preserve?:Partial<DesignerNeighborResize>,rtl=false):DesignerCanvas {
  if(!Number.isFinite(value))return canvas
  const horizontal=dimension==='width',locked=horizontal?preserve?.horizontal:preserve?.vertical
  if(locked&&ids.length!==1)return canvas
  let next=canvas
  for(const id of ids){
    const rect=next.fields[id]?.input;if(!rect)continue
    let edge:'left'|'right'|'top'|'bottom'=horizontal?(rtl?'left':'right'):'bottom'
    if(locked&&!canvasResizeNeighbor(next,id,edge)){const alternate=edge==='left'?'right':edge==='right'?'left':'top';if(canvasResizeNeighbor(next,id,alternate))edge=alternate}
    const delta=(value-rect[dimension])*(edge==='left'||edge==='top'?-1:1)
    next=resizeCanvasHandle(next,[id],edge,horizontal?delta:0,horizontal?0:delta,preserve)
  }
  return next
}

export function resizeCanvasHandle(canvas: DesignerCanvas, ids: readonly string[], handle: DesignerResizeHandle, dx: number, dy: number, preserve?:Partial<DesignerNeighborResize>): DesignerCanvas {
  let next = canvas
  if (dx && (handle.includes('left') || handle.includes('right'))) next = preserve?.horizontal ? ids.length===1?resizeCanvasNeighborInput(next,ids[0],handle.includes('left')?'left':'right',dx):next : resizeCanvasInputs(next, ids, handle.includes('left') ? 'left' : 'right', dx)
  if (dy && (handle.includes('top') || handle.includes('bottom'))) next = preserve?.vertical ? ids.length===1?resizeCanvasNeighborInput(next,ids[0],handle.includes('top')?'top':'bottom',dy):next : resizeCanvasInputs(next, ids, handle.includes('top') ? 'top' : 'bottom', dy)
  return ids.every(id => {
    const before = canvas.fields[id]?.input, after = next.fields[id]?.input
    return before === after || (before && after && before.left === after.left && before.top === after.top && before.width === after.width && before.height === after.height)
  }) ? canvas : next
}

export function fieldGroupRect(field: DesignerCanvasField): DesignerRect {
  const left = Math.min(field.input.left, field.label.left), top = Math.min(field.input.top, field.label.top)
  return { left, top, width: Math.max(rightOf(field.input), rightOf(field.label)) - left, height: Math.max(bottomOf(field.input), bottomOf(field.label)) - top }
}

export function translateCanvasField(field: DesignerCanvasField, dx: number, dy: number): DesignerCanvasField {
  return Object.fromEntries(Object.entries(field).map(([part, rect]) => [part, { ...rect, left: rect.left + dx, top: rect.top + dy }])) as DesignerCanvasField
}

export function moveCanvasFields(canvas: DesignerCanvas, ids: readonly string[], dx: number, dy: number): DesignerCanvas {
  const parts = ids.flatMap(id => canvas.fields[id] ? Object.values(canvas.fields[id]) : [])
  if (!parts.length) return canvas
  const boundedX = Math.max(-Math.min(...parts.map(p => p.left)), Math.min(canvas.width - Math.max(...parts.map(rightOf)), dx))
  const boundedY = Math.max(-Math.min(...parts.map(p => p.top)), Math.min(canvas.height - Math.max(...parts.map(bottomOf)), dy))
  const fields = { ...canvas.fields }
  for (const id of ids) if (fields[id]) fields[id] = translateCanvasField(fields[id], boundedX, boundedY)
  return { ...canvas, fields }
}

export function validateCanvasArrangement(initial: DesignerCanvas, proposed: DesignerCanvas, movedIds: readonly string[], extra: readonly DesignerObstacle[] = [], gap = designerSafetyGap, ignoreSelectionControls = false): string | undefined {
  const moved = new Set(movedIds)
  const before = new Map(canvasObstacles(initial).map(rect => [rect.id, rect]))
  const all = [...canvasObstacles(proposed), ...extra].filter(rect => !ignoreSelectionControls || !rect.id.endsWith('::select'))
  for (const rect of all) {
    const id = rect.id.split('::')[0]
    if (!moved.has(id)) continue
    const old = before.get(rect.id)
    if (old && JSON.stringify(rect) === JSON.stringify(old)) continue
    if (rect.left < -epsilon || rect.top < -epsilon || rightOf(rect) > proposed.width + epsilon || bottomOf(rect) > proposed.height + epsilon) return 'container'
    for (const other of all) {
      if (other.id.split('::')[0] === id) continue
      if (rectanglesCollide(rect, other, gap)) return other.id.split('::')[0]
    }
  }
  return undefined
}

export function alignCanvasFields(canvas: DesignerCanvas, selected: readonly string[], referenceId: string, direction: DesignerAlignment, extra: readonly DesignerObstacle[] = [], gap = designerSafetyGap): { canvas: DesignerCanvas; blockedBy?: string } {
  const ids = [...new Set(selected)].filter(id => canvas.fields[id])
  if (ids.length < 2 || !ids.includes(referenceId)) return { canvas }
  const reference = canvas.fields[referenceId].input, fields = { ...canvas.fields }
  for (const id of ids) {
    if (id === referenceId) continue
    const rect = fields[id].input
    const dx = direction === 'left' ? reference.left - rect.left : direction === 'right' ? rightOf(reference) - rightOf(rect) : direction === 'horizontalCenter' ? reference.left + reference.width / 2 - rect.left - rect.width / 2 : 0
    const dy = direction === 'top' ? reference.top - rect.top : direction === 'bottom' ? bottomOf(reference) - bottomOf(rect) : direction === 'verticalCenter' ? reference.top + reference.height / 2 - rect.top - rect.height / 2 : 0
    fields[id] = translateCanvasField(fields[id], dx, dy)
  }
  const proposed = { ...canvas, fields }
  const blockedBy = validateCanvasArrangement(canvas, proposed, ids.filter(id => id !== referenceId), extra, gap, true)
  return blockedBy ? { canvas, blockedBy } : { canvas: proposed }
}
