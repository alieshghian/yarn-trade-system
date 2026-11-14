import type { BaseFormAction } from './types'
import type { FormSchemaDraft } from './formSchema'

export const designerDraftFormat = 'yarn-trade.form-designer-draft' as const
export const designerDraftVersion = 1 as const
export const designerHistoryLimit = 50

export const designerElementAppearanceProperties = ['appearancePreset', 'borderWidth', 'borderStyle', 'borderRadius', 'shadowOpacity', 'shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowSpread', 'shadowInset', 'gradientEnabled', 'gradientStartColor', 'gradientEndColor', 'gradientAngle', 'paddingX', 'paddingY'] as const

export const designerProperties = [
  'fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'underline', 'strikeThrough', 'script', 'textAlign', 'verticalTextAlign', 'lineHeight',
  'backgroundColor', 'textColor', 'labelColor', 'borderColor', 'focusColor', 'focusBackgroundColor', 'focusTextColor', 'focusBorderColor', 'focusLabelColor', 'hoverColor', 'hoverTextColor', 'hoverBorderColor', 'selectedColor', 'disabledColor', 'disabledTextColor', 'disabledBorderColor', 'errorColor',
  'componentPopupBackground', 'componentPopupFontSize', 'componentPopupWidth', 'componentPopupButtonWidth', 'componentPopupButtonHeight', 'componentAddBackground', 'componentAddTextColor', 'componentAddWidth', 'componentAddHeight',
  'width', 'height', 'offsetX', 'offsetY', ...designerElementAppearanceProperties
] as const

export type DesignerProperty = typeof designerProperties[number]
export type DesignerValue = string | number | boolean
export type DesignerPart = 'field' | 'label' | 'input'
export function isDesignerShortcutKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode'>, letter: 'a' | 'l'): boolean {
  return event.key.toLowerCase() === letter || event.code.toLowerCase() === `key${letter}` || event.keyCode === letter.toUpperCase().charCodeAt(0)
}
export type DesignerFieldOverride = Partial<Record<DesignerProperty, DesignerValue>>
export type DesignerActionTextPart = 'code' | 'fa' | 'en' | 'zh'
export type DesignerActionTextStyle = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  bold?: boolean
  italic?: boolean
  underline?: 'none' | 'single' | 'double'
  strikeThrough?: boolean
  script?: 'none' | 'superscript' | 'subscript'
  textColor?: string
  textAlign?: string
  lineHeight?: number
}
export type DesignerActionOverride = DesignerFieldOverride & {
  visible?: boolean
  code?: string
  labels?: Partial<Record<'fa' | 'en' | 'zh', string>>
  manualLabels?: Partial<Record<'fa' | 'en' | 'zh', boolean>>
  autoLabels?: Partial<Record<'fa' | 'en' | 'zh', string>>
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
export type DesignerTableColumnStyle = { bold?: boolean; italic?: boolean; underline?: 'single' | 'double'; strikeThrough?: boolean; script?: 'superscript' | 'subscript'; textColor?: string; backgroundColor?: string; fontFamily?: string; fontSize?: number; textAlign?: 'start' | 'center' | 'end' | 'left' | 'right'; verticalTextAlign?: 'top' | 'center' | 'bottom' }
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
  actionBarHeight?: number
  actionBarOffsetY?: number
  neighborResize?: Partial<DesignerNeighborResize>
  appearance?: DesignerAppearance
  defaults?: { input?: DesignerFieldOverride; label?: DesignerFieldOverride }
  actions?: Record<string, DesignerActionOverride>
  canvas?: DesignerCanvas
  layoutMode?: 'schema' | 'canvas'
  sectionCanvases?: Record<string, DesignerCanvas>
  flowSlots?: Record<string, { width: number; height: number }>
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
const effectRanges: Partial<Record<DesignerProperty, readonly [number, number]>> = { componentPopupFontSize: [8, 40], componentPopupWidth: [80, 1200], componentPopupButtonWidth: [24, 240], componentPopupButtonHeight: [20, 80], componentAddWidth: [20, 120], componentAddHeight: [20, 120], borderWidth: [0, 12], shadowOpacity: [0, 100], shadowOffsetX: [-40, 40], shadowOffsetY: [-40, 40], shadowBlur: [0, 80], shadowSpread: [-20, 40], gradientAngle: [0, 360], paddingX: [0, 40], paddingY: [0, 40] }
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
  if (dimensions.has(property)) return typeof value === 'number' && Number.isFinite(value) && value >= (property === 'width' || property === 'height' ? 16 : -10000) && value <= (property === 'width' || property === 'height' ? 20000 : 10000)
  if (property === 'textAlign') return typeof value === 'string' && alignments.has(value)
  if (property === 'verticalTextAlign') return typeof value === 'string' && ['top', 'center', 'bottom'].includes(value)
  if (property === 'bold' || property === 'italic' || property === 'strikeThrough') return typeof value === 'boolean'
  if (property === 'underline') return value === 'none' || value === 'single' || value === 'double'
  if (property === 'script') return value === 'none' || value === 'superscript' || value === 'subscript'
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
    const composite = /^(.*)\.tree\.(?:[0-4]\.(?:column|title|search|items|add|selected|change)|header|back|all|path|node\.(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-Fa-f]{2})+)$/.exec(baseId)
    if ((!allowedFields.has(baseId) && !(composite && allowedFields.has(composite[1]))) || (part !== undefined && !['label', 'input'].includes(part)) || !properties || typeof properties !== 'object' || Array.isArray(properties)) continue
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
    for (const locale of ['fa', 'en', 'zh'] as const) {
      if (typeof values.manualLabels?.[locale] === 'boolean') (clean.manualLabels ??= {})[locale] = values.manualLabels[locale]
      if (typeof values.autoLabels?.[locale] === 'string' && values.autoLabels[locale].length <= 160) (clean.autoLabels ??= {})[locale] = values.autoLabels[locale]
    }
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
    if (value.textAlign==='start'||value.textAlign==='center'||value.textAlign==='end'||value.textAlign==='left'||value.textAlign==='right')style.textAlign=value.textAlign
    if (value.verticalTextAlign==='top'||value.verticalTextAlign==='center'||value.verticalTextAlign==='bottom')style.verticalTextAlign=value.verticalTextAlign
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
    if (value.textAlign==='start'||value.textAlign==='center'||value.textAlign==='end'||value.textAlign==='left'||value.textAlign==='right')style.textAlign=value.textAlign
    if (value.verticalTextAlign==='top'||value.verticalTextAlign==='center'||value.verticalTextAlign==='bottom')style.verticalTextAlign=value.verticalTextAlign
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
  const actionBarHeight = typeof candidate.actionBarHeight === 'number' && Number.isFinite(candidate.actionBarHeight) && candidate.actionBarHeight >= 48 && candidate.actionBarHeight <= 220 ? Math.round(candidate.actionBarHeight) : undefined
  const actionBarOffsetY = typeof candidate.actionBarOffsetY === 'number' && Number.isFinite(candidate.actionBarOffsetY) && candidate.actionBarOffsetY >= -600 && candidate.actionBarOffsetY <= 600 ? Math.round(candidate.actionBarOffsetY) : undefined
  const flowSlots: NonNullable<DesignerDraft['flowSlots']> = {}
  if (candidate.flowSlots && typeof candidate.flowSlots === 'object' && !Array.isArray(candidate.flowSlots)) {
    for (const id of validFieldIds) {
      const slot = candidate.flowSlots[id]
      if (slot && Number.isFinite(slot.width) && Number.isFinite(slot.height) && slot.width > 0 && slot.width <= 20000 && slot.height > 0 && slot.height <= 20000) flowSlots[id] = { width: slot.width, height: slot.height }
    }
  }
  return { format: designerDraftFormat, schemaVersion: designerDraftVersion, formId, overrides, ...(Object.keys(flowSlots).length ? { flowSlots } : {}), ...(Object.keys(neighborResize).length?{neighborResize}:{}), ...(filterPopupFontSize !== undefined ? { filterPopupFontSize } : {}), ...(gridSearchPosition ? { gridSearchPosition } : {}), ...(tableHeaderHeight !== undefined ? { tableHeaderHeight } : {}), ...(Object.keys(tableFont).length ? { tableFont } : {}), ...(Object.keys(tableColumns).length ? { tableColumns } : {}), ...(Object.keys(tableHeaders).length ? { tableHeaders } : {}), ...(buttonPressEffect !== undefined ? { buttonPressEffect } : {}), ...(actionBarHeight !== undefined ? { actionBarHeight } : {}), ...(actionBarOffsetY !== undefined ? { actionBarOffsetY } : {}), ...(Object.keys(defaults).length ? { defaults } : {}), ...(Object.keys(actions).length ? { actions } : {}), ...(Object.keys(appearance).length ? { appearance } : {}), ...(canvas && { canvas }), ...(['schema', 'canvas'].includes(candidate.layoutMode ?? '') ? { layoutMode: candidate.layoutMode } : {}), ...(Object.keys(sectionCanvases).length ? { sectionCanvases } : {}), ...(Object.keys(tables).length ? { tables } : {}) }
}

export function setDesignerActionBarHeight(draft: DesignerDraft, value: number | undefined): DesignerDraft {
  if (value !== undefined && (!Number.isFinite(value) || value < 48 || value > 220)) return draft
  if (value === draft.actionBarHeight) return draft
  if (value === undefined) {
    const { actionBarHeight: _height, ...rest } = draft
    return rest
  }
  return { ...draft, actionBarHeight: Math.round(value) }
}

export function setDesignerActionBarOffsetY(draft: DesignerDraft, value: number | undefined): DesignerDraft {
  if (value !== undefined && (!Number.isFinite(value) || value < -600 || value > 600)) return draft
  if (value === draft.actionBarOffsetY) return draft
  if (value === undefined) { const { actionBarOffsetY: _offset, ...rest } = draft; return rest }
  return { ...draft, actionBarOffsetY: Math.round(value) }
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
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(columnId) || (['bold', 'italic', 'strikeThrough'].includes(property) ? value !== undefined && typeof value !== 'boolean' : property === 'underline' ? value !== undefined && value !== 'single' && value !== 'double' : property === 'script' ? value !== undefined && value !== 'superscript' && value !== 'subscript' : property === 'textAlign' ? value !== undefined && !['start','center','end','left','right'].includes(String(value)) : property === 'verticalTextAlign' ? value !== undefined && !['top','center','bottom'].includes(String(value)) : property === 'fontFamily' ? value !== undefined && (typeof value !== 'string' || !fontFamilies.has(value)) : property === 'fontSize' ? value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 40) : value !== undefined && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)))) return draft
  const tableColumns = { ...draft.tableColumns }, style = { ...tableColumns[columnId] }
  if (value === undefined) delete style[property]
  else style[property] = (property === 'textColor' || property === 'backgroundColor' ? String(value).toLowerCase() : value) as never
  if (!Object.keys(style).length) delete tableColumns[columnId]
  else tableColumns[columnId] = style
  return { ...draft, tableColumns }
}

export function setDesignerTableHeaderStyle(draft: DesignerDraft, columnId: string, property: keyof DesignerTableHeaderStyle, value: string | number | boolean | undefined): DesignerDraft {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(columnId) || (['bold', 'italic', 'strikeThrough'].includes(property) ? value !== undefined && typeof value !== 'boolean' : property === 'underline' ? value !== undefined && value !== 'single' && value !== 'double' : property === 'script' ? value !== undefined && value !== 'superscript' && value !== 'subscript' : property === 'textAlign' ? value !== undefined && !['start','center','end','left','right'].includes(String(value)) : property === 'verticalTextAlign' ? value !== undefined && !['top','center','bottom'].includes(String(value)) : property === 'fontFamily' ? value !== undefined && (typeof value !== 'string' || !fontFamilies.has(value)) : property === 'fontSize' ? value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 40) : value !== undefined && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)))) return draft
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

/** Resize selected footer actions by the same pointer delta while preserving their relative sizes. */
export function resizeDesignerActions(draft: DesignerDraft, starts: readonly { id: string; size: number }[], property: 'width' | 'height', edge: 'left' | 'right' | 'top' | 'bottom', delta: number): DesignerDraft {
  const horizontal = edge === 'left' || edge === 'right'
  if ((property === 'width') !== horizontal || !Number.isFinite(delta)) return draft
  const limits = designerActionDimensionLimits[property]
  let next = draft
  for (const start of starts) {
    if (!Number.isFinite(start.size)) continue
    const resized = resizeDesignerEdge(start.size, delta, edge, limits.min, limits.max)
    next = setDesignerActionProperty(next, [start.id], property, resized.size)
  }
  return next
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

type ActionLabelLanguage = 'fa' | 'en' | 'zh'
const actionLabelPhrases: ReadonlyArray<Readonly<Record<ActionLabelLanguage, string>>> = [
  { fa: 'گروه جدید', en: 'New group', zh: '新建分组' }, { fa: 'ایجاد گروه', en: 'Create group', zh: '创建分组' }, { fa: 'افزودن گروه', en: 'Add group', zh: '添加分组' },
  { fa: 'شخص جدید', en: 'New person', zh: '新建人员' }, { fa: 'ایجاد شخص', en: 'Create person', zh: '创建人员' }, { fa: 'افزودن شخص', en: 'Add person', zh: '添加人员' },
  { fa: 'ذخیره فرم', en: 'Save form', zh: '保存表单' }, { fa: 'ذخیره', en: 'Save', zh: '保存' }, { fa: 'ذخیره و بستن', en: 'Save and close', zh: '保存并关闭' },
  { fa: 'کپی آخرین', en: 'Copy last', zh: '复制上一条' }, { fa: 'کپی آخرین مورد', en: 'Copy last item', zh: '复制最后一项' },
  { fa: 'کپی انتخابی', en: 'Copy selected', zh: '复制所选' }, { fa: 'کپی انتخاب‌شده', en: 'Copy selection', zh: '复制选中项' },
  { fa: 'ویرایش اطلاعات', en: 'Edit information', zh: '编辑信息' }, { fa: 'ویرایش', en: 'Edit', zh: '编辑' },
  { fa: 'حذف انتخاب‌شده', en: 'Delete selected', zh: '删除所选' }, { fa: 'حذف انتخابی', en: 'Delete selection', zh: '删除选中项' }, { fa: 'حذف', en: 'Delete', zh: '删除' },
  { fa: 'صفحه بعد', en: 'Next page', zh: '下一页' }, { fa: 'صفحهٔ بعد', en: 'Next page', zh: '下一页' }, { fa: 'بعدی', en: 'Next', zh: '下一个' },
  { fa: 'صفحه قبل', en: 'Previous page', zh: '上一页' }, { fa: 'صفحهٔ قبل', en: 'Previous page', zh: '上一页' }, { fa: 'صفحهٔ قبلی', en: 'Previous page', zh: '上一页' }, { fa: 'قبلی', en: 'Previous', zh: '上一个' },
  { fa: 'تنظیمات', en: 'Settings', zh: '设置' }, { fa: 'اولین', en: 'First', zh: '首条' }, { fa: 'اول', en: 'First', zh: '首条' }, { fa: 'آخرین', en: 'Last', zh: '末条' }, { fa: 'آخر', en: 'Last', zh: '末条' },
  { fa: 'مرور', en: 'Browse', zh: '浏览' }, { fa: 'مرور رکوردها', en: 'Browse records', zh: '浏览记录' },
  { fa: 'خروج از فرم', en: 'Exit form', zh: '退出表单' }, { fa: 'خروج', en: 'Exit', zh: '退出' }, { fa: 'بستن فرم', en: 'Close form', zh: '关闭表单' }, { fa: 'بستن', en: 'Close', zh: '关闭' },
  { fa: 'جدید', en: 'New', zh: '新建' }, { fa: 'افزودن', en: 'Add', zh: '添加' }, { fa: 'انصراف', en: 'Cancel', zh: '取消' }, { fa: 'تأیید', en: 'Confirm', zh: '确认' }, { fa: 'تایید', en: 'Confirm', zh: '确认' }, { fa: 'جستجو', en: 'Search', zh: '搜索' }, { fa: 'جست‌وجو', en: 'Search', zh: '搜索' }
]
// Compare lookup keys only; never rewrite the user's displayed caption.
const normalizeActionLabelPhrase = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
  .replace(/[يى]/gu, 'ی').replace(/ك/gu, 'ک')
  .replace(/[\u064b-\u065f\u0670ـ]/gu, '')
  .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, '')
  .replace(/[\s\u200c]+/gu, ' ').replace(/[.!؟?،,:;؛]+/gu, '').trim()

/** Translate common form-action labels locally; custom labels remain editable when no known phrase matches. */
export function translateDesignerActionLabel(value: string, sourceLanguage: ActionLabelLanguage): Partial<Record<ActionLabelLanguage, string>> | undefined {
  const normalized = normalizeActionLabelPhrase(value)
  if (!normalized) return undefined
  const phrase = actionLabelPhrases.find(candidate => normalizeActionLabelPhrase(candidate[sourceLanguage]) === normalized)
  if (!phrase) return undefined
  return Object.fromEntries((['fa', 'en', 'zh'] as const).filter(language => language !== sourceLanguage).map(language => [language, phrase[language]]))
}

/** Preserve authored translations and provenance through export, reload and Undo. */
export function markDesignerActionLabelManual(draft: DesignerDraft, id: string, locale: ActionLabelLanguage, manual = true): DesignerDraft {
  const current = draft.actions?.[id] ?? {}
  return { ...draft, actions: { ...draft.actions, [id]: { ...current, manualLabels: { ...current.manualLabels, [locale]: manual } } } }
}
export function applyDesignerActionTranslations(draft: DesignerDraft, id: string, translations: Partial<Record<ActionLabelLanguage, string>>): DesignerDraft {
  let next = draft
  for (const locale of ['fa', 'en', 'zh'] as const) {
    const text = translations[locale]
    if (typeof text !== 'string' || !text.trim() || text.length > 160 || next.actions?.[id]?.manualLabels?.[locale]) continue
    next = setDesignerActionText(next, id, locale, text)
    const current = next.actions![id]
    next = { ...next, actions: { ...next.actions, [id]: { ...current, autoLabels: { ...current.autoLabels, [locale]: text } } } }
  }
  return next
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
  if (values.underline !== undefined || values.strikeThrough !== undefined) style.textDecorationLine = [values.underline === 'single' || values.underline === 'double' ? 'underline' : '', values.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none'
  if (values.underline === 'double') style.textDecorationStyle = 'double'
  if (values.script === 'superscript' || values.script === 'subscript') { style.verticalAlign = values.script === 'superscript' ? 'super' : 'sub'; style.fontSize = `${Number(values.fontSize ?? 14) * 0.75}px` }
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

export function contextDesignerSelection(selection: readonly string[], target: string, additive = false): string[] {
  const targetId = target.split('::')[0]
  const alreadySelected = selection.some(item => item === target || item === targetId || item.startsWith(`${targetId}::`))
  if (alreadySelected) return [...selection]
  return additive ? [...selection, target] : [target]
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
  const resetSlots = new Set(fieldIds.filter(id => !id.endsWith('::label')).map(id => id.split('::')[0]))
  if (!keys.some(id => id in draft.overrides) && !Object.keys(draft.flowSlots ?? {}).some(id => resetSlots.has(id))) return draft
  const overrides = { ...draft.overrides }
  for (const id of keys) delete overrides[id]
  const flowSlots = Object.fromEntries(Object.entries(draft.flowSlots ?? {}).filter(([id]) => !resetSlots.has(id)))
  const { flowSlots: _oldSlots, ...rest } = draft
  return { ...rest, overrides, ...(Object.keys(flowSlots).length ? { flowSlots } : {}) }
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
  if (values.componentPopupWidth !== undefined) style['--component-popup-width'] = `${values.componentPopupWidth}px`
  if (values.componentPopupButtonWidth !== undefined) style['--component-popup-button-width'] = `${values.componentPopupButtonWidth}px`
  if (values.componentPopupButtonHeight !== undefined) style['--component-popup-button-height'] = `${values.componentPopupButtonHeight}px`
  if (values.componentAddWidth !== undefined) style['--component-add-width'] = `${values.componentAddWidth}px`
  if (values.componentAddHeight !== undefined) style['--component-add-height'] = `${values.componentAddHeight}px`
  if (values.fontFamily && values.fontFamily !== 'inherit') style['--lab-font'] = safeFonts[String(values.fontFamily)]
  if (values.fontSize !== undefined) style['--lab-font-size'] = String(values.fontSize) + 'px'
  if (values.fontWeight !== undefined) style['--lab-font-weight'] = String(values.fontWeight)
  if (values.bold !== undefined) style['--lab-bold'] = values.bold ? '700' : '400'
  if (values.italic !== undefined) style['--lab-font-style'] = values.italic ? 'italic' : 'normal'
  if (values.underline !== undefined || values.strikeThrough !== undefined) style['--lab-text-decoration'] = [values.underline === 'single' || values.underline === 'double' ? 'underline' : '', values.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none'
  if (values.underline === 'double') style['--lab-text-decoration-style'] = 'double'
  if (values.script !== undefined) { style['--lab-script-size'] = values.script === 'superscript' || values.script === 'subscript' ? '0.75em' : '1em'; style['--lab-script-align'] = values.script === 'superscript' ? 'super' : values.script === 'subscript' ? 'sub' : 'baseline' }
  if (values.textAlign !== undefined) style['--lab-text-align'] = String(values.textAlign)
  if (values.verticalTextAlign !== undefined) {
    style['--lab-vertical-text-align'] = String(values.verticalTextAlign)
    if (values.verticalTextAlign === 'top') {
      style['--lab-text-pad-before'] = '2px'
      style['--lab-text-pad-after'] = 'max(2px, calc(var(--lab-height, 36px) - 1.2em - 4px))'
    } else if (values.verticalTextAlign === 'bottom') {
      style['--lab-text-pad-before'] = 'max(2px, calc(var(--lab-height, 36px) - 1.2em - 4px))'
      style['--lab-text-pad-after'] = '2px'
    }
  }
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
export type DesignerCanvas = { width: number; height: number; fields: Record<string, DesignerCanvasField>; centeredFieldIds?: string[]; alignmentExceptionFieldIds?: string[]; preserveHorizontalBounds?: boolean }
export type DesignerObstacle = DesignerRect & { id: string }
export type DesignerAlignment = 'top' | 'bottom' | 'left' | 'right' | 'horizontalCenter' | 'verticalCenter'
export const designerSafetyGap = 8
export const designerCanvasEdgeInset = 96 / 2.54 / 2
const epsilon = 0.1
export const rightOf = (rect: DesignerRect) => rect.left + rect.width
export const bottomOf = (rect: DesignerRect) => rect.top + rect.height

/** Grow only the editable canvas bounds; viewport sizing must never translate saved field geometry. */
export function expandDesignerCanvasBounds(canvas: DesignerCanvas, minimumWidth: number, minimumHeight: number): DesignerCanvas {
  const width = Math.max(canvas.width, Number.isFinite(minimumWidth) ? minimumWidth : canvas.width)
  const height = Math.max(canvas.height, Number.isFinite(minimumHeight) ? minimumHeight : canvas.height)
  return width === canvas.width && height === canvas.height ? canvas : { ...canvas, width, height }
}

/** Cap an oversized stored Canvas at the editor viewport without moving its fields. */
export function capDesignerCanvasWidth(canvas: DesignerCanvas, maximumWidth: number): DesignerCanvas {
  if (!Number.isFinite(maximumWidth) || maximumWidth <= 0) return canvas
  const width = Math.min(canvas.width, Math.max(320, maximumWidth))
  return width === canvas.width ? canvas : { ...canvas, width }
}

/**
 * Build a render-only Canvas projection that uses the available editor width
 * until its fields and labels reach the half-centimeter edge insets. Saved
 * rectangles are never changed; narrower viewports overflow only as much as
 * the content plus those insets requires.
 */
export function fitDesignerCanvasToViewport(
  canvas: DesignerCanvas,
  availableWidth: number,
  fieldIds: readonly string[] = Object.keys(canvas.fields),
  edgeInset = 96 / 2.54 / 2
): { canvas: DesignerCanvas; shift: number; minimumWidth: number } {
  const ids = [...new Set(fieldIds)].filter(id => canvas.fields[id])
  const rects = ids.map(id => fieldGroupRect(canvas.fields[id]))
  if (!rects.length || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return { canvas, shift: 0, minimumWidth: canvas.width }
  }

  const contentLeft = Math.min(...rects.map(rect => rect.left))
  const contentRight = Math.max(...rects.map(rightOf))
  const contentWidth = contentRight - contentLeft
  const minimumWidth = contentWidth + edgeInset * 2
  const width = Math.max(availableWidth, minimumWidth)
  const shift = (width - contentWidth) / 2 - contentLeft
  return {
    canvas: { ...canvas, width, centeredFieldIds: ids },
    shift,
    minimumWidth
  }
}

/** Keep scrolling active until a growing viewport gives the field group an 8mm
 * margin; when shrinking, enable it at the normal 5mm margin. The small retained
 * overflow keeps the scrollbar from toggling repeatedly around one pixel. */
export function fitDesignerCanvasToViewportWithHysteresis(
  canvas: DesignerCanvas,
  availableWidth: number,
  fieldIds: readonly string[] = Object.keys(canvas.fields),
  wasOverflowing = false,
  edgeInset = 96 / 2.54 / 2,
  releaseInset = 96 / 2.54 * 8 / 10
): { canvas: DesignerCanvas; shift: number; minimumWidth: number; overflowing: boolean } {
  const fitted = fitDesignerCanvasToViewport(canvas, availableWidth, fieldIds, edgeInset)
  const ids = [...new Set(fieldIds)].filter(id => canvas.fields[id])
  const rects = ids.map(id => fieldGroupRect(canvas.fields[id]))
  if (!Number.isFinite(availableWidth) || availableWidth <= 0 || !rects.length) {
    return { ...fitted, overflowing: false }
  }
  const releaseWidth = fitted.minimumWidth + Math.max(0, releaseInset - edgeInset) * 2
  const overflowing = wasOverflowing ? availableWidth < releaseWidth : availableWidth <= fitted.minimumWidth
  if (!overflowing) return { ...fitted, overflowing: false }

  const contentLeft = Math.min(...rects.map(rect => rect.left))
  const contentRight = Math.max(...rects.map(rightOf))
  const width = Math.max(fitted.minimumWidth, availableWidth + 1)
  const shift = (width - (contentRight - contentLeft)) / 2 - contentLeft
  return { ...fitted, canvas: { ...fitted.canvas, width }, shift, overflowing: true }
}

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
  return Object.keys(fields).length === ids.length ? {
    width: canvas.width,
    height: canvas.height,
    fields,
    ...(Array.isArray(canvas.centeredFieldIds) ? { centeredFieldIds: canvas.centeredFieldIds.filter(id => typeof id === 'string' && ids.includes(id)) } : {}),
    ...(Array.isArray(canvas.alignmentExceptionFieldIds) ? { alignmentExceptionFieldIds: [...new Set(canvas.alignmentExceptionFieldIds.filter(id => typeof id === 'string' && ids.includes(id)))] } : {}),
    ...(canvas.preserveHorizontalBounds === true ? { preserveHorizontalBounds: true } : {})
  } : undefined
}

/** Center each selected physical row by its input borders, retaining sizes and gaps. */
export function centerCanvasRows(canvas:DesignerCanvas,ids:readonly string[]=canvas.centeredFieldIds??[],width=canvas.width):DesignerCanvas {
  const fields={...canvas.fields},rows:string[][]=[]
  const exceptions=new Set(canvas.alignmentExceptionFieldIds??[])
  const centeredIds=[...new Set(ids)].filter(id=>fields[id]&&!exceptions.has(id))
  for(const id of centeredIds.sort((a,b)=>fields[a].input.top-fields[b].input.top)){
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
  return {...canvas,width,fields,centeredFieldIds:centeredIds}
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

const median = (values: readonly number[]) => {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const tenth = (value: number) => Math.round(value * 10) / 10
const boundedMean = (values: readonly number[], fallback: number, min: number, max: number) => {
  if (!values.length) return fallback
  const center = median(values)
  const central = values.filter(value => Math.abs(value - center) <= Math.max(10, Math.abs(center) * 0.4))
  return tenth(Math.max(min, Math.min(max, mean(central.length ? central : values))))
}

function coordinateGroups<T>(items: readonly T[], coordinate: (item: T) => number, tolerance: (center: number, group: readonly T[]) => number): T[][] {
  const groups: T[][] = []
  for (const item of [...items].sort((a, b) => coordinate(a) - coordinate(b))) {
    const nearest = groups
      .map(group => ({ group, center: median(group.map(coordinate)) }))
      .filter(candidate => Math.abs(coordinate(item) - candidate.center) <= tolerance(candidate.center, candidate.group))
      .sort((a, b) => Math.abs(coordinate(item) - a.center) - Math.abs(coordinate(item) - b.center))[0]
    if (nearest) nearest.group.push(item)
    else groups.push([item])
  }
  return groups
}

/** Toggle fields that the automatic alignment pass must leave at their chosen geometry. */
export function toggleDesignerCanvasAlignmentException(canvas: DesignerCanvas, fieldIds: readonly string[]): DesignerCanvas {
  const ids = [...new Set(fieldIds)].filter(id => Boolean(canvas.fields[id]))
  if (!ids.length) return canvas
  const exceptions = new Set(canvas.alignmentExceptionFieldIds ?? [])
  const shouldExclude = ids.some(id => !exceptions.has(id))
  for (const id of ids) shouldExclude ? exceptions.add(id) : exceptions.delete(id)
  return { ...canvas, alignmentExceptionFieldIds: exceptions.size ? [...exceptions] : undefined }
}

/**
 * Snap near-matching canvas controls to common rows, columns and dimensions.
 * Large differences are treated as deliberate. F1-exempt fields are ignored.
 */
export function autoAlignDesignerCanvas(canvas: DesignerCanvas, options: { rtl?: boolean; fieldIds?: readonly string[]; respectExceptions?: boolean; textareaFieldIds?: readonly string[]; checkboxFieldIds?: readonly string[] } = {}): DesignerCanvas {
  const rtl = options.rtl === true
  const exceptions = options.respectExceptions === false ? new Set<string>() : new Set(canvas.alignmentExceptionFieldIds ?? [])
  const requested = options.fieldIds ? new Set(options.fieldIds) : undefined
  const ids = Object.keys(canvas.fields).filter(id => !exceptions.has(id))
  const movableIds = new Set(ids.filter(id => !requested || requested.has(id)))
  if (ids.length < 2 || movableIds.size === 0) return canvas

  let current: DesignerCanvas = { ...canvas, fields: { ...canvas.fields } }
  let changed = false
  const withinOriginalBounds = (candidate: DesignerCanvas) => Object.entries(candidate.fields).every(([id, field]) => Object.entries(field).every(([part, rect]) => {
    const before = canvas.fields[id]?.[part as keyof DesignerCanvasField]
    if (!before) return false
    const wasInside = before.left >= 0 && before.top >= 0 && rightOf(before) <= canvas.width && bottomOf(before) <= canvas.height
    return !wasInside || (rect.left >= 0 && rect.top >= 0 && rightOf(rect) <= canvas.width && bottomOf(rect) <= canvas.height)
  }))
  const commit = (fields: Record<string, DesignerCanvasField>) => {
    const geometryChanged = Object.keys(fields).some(id => {
      const before = current.fields[id], after = fields[id]
      return Object.keys(before ?? {}).some(part => {
        const a = before[part as keyof DesignerCanvasField], b = after?.[part as keyof DesignerCanvasField]
        return Boolean(a && b && (a.left !== b.left || a.top !== b.top || a.width !== b.width || a.height !== b.height))
      })
    })
    if (!geometryChanged) return false
    const candidate = { ...current, fields }
    if (!withinOriginalBounds(candidate)) return false
    const before = new Set(existingCanvasCollisions(current).map(pair => [...pair].sort().join('|')))
    if (existingCanvasCollisions(candidate).some(pair => !before.has([...pair].sort().join('|')))) return false
    current = candidate
    changed = true
    return true
  }
  const similarityGroups = (items: readonly string[], dimension: 'width' | 'height') => coordinateGroups(
    items,
    id => current.fields[id].input[dimension],
    (center, group) => Math.max(dimension === 'width' ? 24 : 8, Math.abs(center) * 0.22)
  )
  const rowsFor = (items: readonly string[]) => coordinateGroups(
    items,
    id => current.fields[id].input.top + current.fields[id].input.height / 2,
    // Baseline grouping must follow the actual input controls. Label placement
    // can differ independently; using the full label+input box can split a
    // visually single row when a newly added field has a small baseline drift.
    // This tolerance absorbs normal field-height-sized variation, while rows
    // separated by actual row spacing remain distinct.
    (_center, group) => Math.max(12, median(group.map(id => current.fields[id].input.height)) * 0.7)
  )
  const columnsFor = (items: readonly string[]) => coordinateGroups(
    items,
    id => rtl ? rightOf(current.fields[id].input) : current.fields[id].input.left,
    (_edge, group) => Math.max(12, median(group.map(id => current.fields[id].input.width)) * 0.08)
  )
  const equalize = (items: readonly string[], dimension: 'width' | 'height') => {
    for (const group of similarityGroups(items, dimension).filter(part => part.length > 1)) {
      const targetSize = Math.round(median(group.map(id => current.fields[id].input[dimension])))
      const fields = { ...current.fields }
      for (const id of group) {
        if (!movableIds.has(id)) continue
        const field = fields[id], input = field.input, size = input[dimension]
        if (size === targetSize) continue
        const delta = dimension === 'width' ? (rtl ? size - targetSize : 0) : (size - targetSize) / 2
        const moved = translateCanvasField(field, dimension === 'width' ? delta : 0, dimension === 'height' ? delta : 0)
        fields[id] = { ...moved, input: { ...moved.input, [dimension]: targetSize } }
      }
      commit(fields)
    }
  }
  const alignRows = () => {
    for (const row of rowsFor(ids).filter(group => group.length > 1)) {
      const anchors = row.filter(id => !movableIds.has(id))
      const baseline = anchors.length ? anchors : row
      const center = median(baseline.map(id => current.fields[id].input.top + current.fields[id].input.height / 2))
      const fields = { ...current.fields }
      for (const id of row) {
        if (!movableIds.has(id)) continue
        const field = fields[id]
        const delta = Math.round(center - (field.input.top + field.input.height / 2))
        if (delta) fields[id] = translateCanvasField(field, 0, delta)
      }
      commit(fields)
    }
  }
  const alignColumns = () => {
    for (const column of columnsFor(ids).filter(group => group.length > 1)) {
      const anchors = column.filter(id => !movableIds.has(id))
      const baseline = anchors.length ? anchors : column
      const edge = median(baseline.map(id => rtl ? rightOf(current.fields[id].input) : current.fields[id].input.left))
      const fields = { ...current.fields }
      for (const id of column) {
        if (!movableIds.has(id)) continue
        const field = fields[id], currentEdge = rtl ? rightOf(field.input) : field.input.left
        const delta = Math.round(edge - currentEdge)
        if (delta) fields[id] = translateCanvasField(field, delta, 0)
      }
      commit(fields)
    }
  }
  const distributeGaps = (groups: readonly string[][], axis: 'horizontal' | 'vertical') => {
    for (const group of groups.filter(items => items.length > 2)) {
      const ordered = [...group].sort((a, b) => axis === 'horizontal'
        ? rtl ? rightOf(current.fields[b].input) - rightOf(current.fields[a].input) : current.fields[a].input.left - current.fields[b].input.left
        : current.fields[a].input.top - current.fields[b].input.top)
      const gaps = ordered.slice(1).map((id, index) => axis === 'horizontal'
        ? rtl ? current.fields[ordered[index]].input.left - rightOf(current.fields[id].input) : current.fields[id].input.left - rightOf(current.fields[ordered[index]].input)
        : current.fields[id].input.top - bottomOf(current.fields[ordered[index]].input))
      if (gaps.some(gap => gap < 0)) continue
      const targetGap = median(gaps)
      if (Math.max(...gaps) - Math.min(...gaps) > Math.max(24, targetGap * 0.6)) continue
      const fields = { ...current.fields }
      for (let index = 0; index < ordered.length; index++) {
        const id = ordered[index]
        if (!movableIds.has(id)) continue
        const field = fields[id]
        let dx = 0, dy = 0
        if (axis === 'horizontal') {
          const previous = index > 0 ? fields[ordered[index - 1]] : undefined
          const next = index + 1 < ordered.length ? fields[ordered[index + 1]] : undefined
          if (previous) dx = rtl ? previous.input.left - targetGap - rightOf(field.input) : rightOf(previous.input) + targetGap - field.input.left
          else if (next) dx = rtl ? rightOf(next.input) + targetGap - rightOf(field.input) : next.input.left - targetGap - rightOf(field.input)
        } else {
          const previous = index > 0 ? fields[ordered[index - 1]] : undefined
          const next = index + 1 < ordered.length ? fields[ordered[index + 1]] : undefined
          if (previous) dy = bottomOf(previous.input) + targetGap - field.input.top
          else if (next) dy = next.input.top - targetGap - bottomOf(field.input)
        }
        if (dx || dy) fields[id] = translateCanvasField(field, Math.round(dx), Math.round(dy))
      }
      commit(fields)
    }
  }
  const fillTextareaBesideCheckbox = () => {
    const textareas=new Set(options.textareaFieldIds??[]),checkboxes=new Set(options.checkboxFieldIds??[])
    if(!textareas.size||!checkboxes.size)return
    if([...textareas].some(id=>!movableIds.has(id))||[...checkboxes].some(id=>!movableIds.has(id)))return
    for(const row of rowsFor(ids)){
      if(row.length!==2)continue
      const textarea=row.find(id=>textareas.has(id)),checkbox=row.find(id=>checkboxes.has(id))
      if(!textarea||!checkbox)continue
      const selectedRects=ids.map(id=>current.fields[id].input)
      const spanLeft=Math.min(...selectedRects.map(rect=>rect.left)),spanRight=Math.max(...selectedRects.map(rightOf))
      const checkGroup=fieldGroupRect(current.fields[checkbox]),checkWidth=checkGroup.width,gap=12
      const textareaField=current.fields[textarea],textareaInput=textareaField.input
      const fields={...current.fields}
      if(rtl){
        const checkboxDx=spanLeft-checkGroup.left,textareaLeft=spanLeft+checkWidth+gap,textareaWidth=spanRight-textareaLeft
        if(textareaWidth<textareaInput.width||textareaWidth<48)continue
        fields[checkbox]=translateCanvasField(fields[checkbox],checkboxDx,0)
        const moved=translateCanvasField(textareaField,textareaLeft-textareaInput.left,0)
        fields[textarea]={...moved,input:{...moved.input,width:textareaWidth}}
      }else{
        const checkboxDx=spanRight-(checkGroup.left+checkGroup.width),textareaWidth=spanRight-checkWidth-gap-spanLeft
        if(textareaWidth<textareaInput.width||textareaWidth<48)continue
        fields[checkbox]=translateCanvasField(fields[checkbox],checkboxDx,0)
        const moved=translateCanvasField(textareaField,spanLeft-textareaInput.left,0)
        fields[textarea]={...moved,input:{...moved.input,width:textareaWidth}}
      }
      commit(fields)
    }
  }

  // Equalize approximate dimensions locally in rows and columns, then align and
  // distribute their gaps. The staged safety check preserves deliberate outliers.
  for (const row of rowsFor(ids)) { equalize(row, 'width'); equalize(row, 'height') }
  for (const column of columnsFor(ids)) { equalize(column, 'width'); equalize(column, 'height') }
  fillTextareaBesideCheckbox()
  alignRows()
  alignColumns()
  distributeGaps(rowsFor(ids), 'horizontal')
  // A full-width/textarea field can share an edge with a regular column by
  // coincidence. It may align to that edge, but must not change the regular
  // fields' vertical gap calculation or undo their row baseline alignment.
  const verticalSpacingColumns = columnsFor(ids).map(group => {
    const targetWidth = median(group.map(id => current.fields[id].input.width))
    const tolerance = Math.max(24, targetWidth * 0.22)
    return group.filter(id => Math.abs(current.fields[id].input.width - targetWidth) <= tolerance)
  })
  distributeGaps(verticalSpacingColumns, 'vertical')
  return changed ? current : canvas
}

/**
 * Rebuild a selected form canvas as a compact, consistently spaced grid.
 * Unlike local snapping, this is an explicit whole-form operation and includes
 * F1-exempt fields. RTL forms share a right edge; LTR forms share a left edge.
 */
export function levelDesignerCanvas(canvas: DesignerCanvas, options: {
  rtl?: boolean
  fieldIds?: readonly string[]
  textareaFieldIds?: readonly string[]
  checkboxFieldIds?: readonly string[]
  activeFieldIds?: readonly string[]
  horizontalGap?: number
  verticalGap?: number
  edgeInset?: number
} = {}): DesignerCanvas {
  const ids = [...new Set(options.fieldIds ?? Object.keys(canvas.fields))].filter(id => Boolean(canvas.fields[id]))
  if (ids.length < 2) return canvas
  const rtl = options.rtl === true
  const textareaIds = new Set((options.textareaFieldIds ?? []).filter(id => ids.includes(id)))
  const checkboxIds = new Set((options.checkboxFieldIds ?? []).filter(id => ids.includes(id)))
  const activeIds = new Set((options.activeFieldIds ?? []).filter(id => ids.includes(id)))
  const stable = (id: string) => canvas.fields[id]
  const group = (id: string) => fieldGroupRect(stable(id))
  const isLevelable = (id: string) => !textareaIds.has(id) && !checkboxIds.has(id)
  const ordinaryIds = ids.filter(isLevelable)
  const labels = new Map<string, { placement: 'above' | 'below' | 'left' | 'right'; gap: number; width: number }>()
  const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
  for (const id of ids) {
    const { input, label } = stable(id)
    const horizontalOverlap = overlap(input.left, rightOf(input), label.left, rightOf(label))
    const verticalOverlap = overlap(input.top, bottomOf(input), label.top, bottomOf(label))
    const horizontalRatio = horizontalOverlap / Math.max(1, Math.min(input.width, label.width))
    const verticalRatio = verticalOverlap / Math.max(1, Math.min(input.height, label.height))
    const aboveGap = input.top - bottomOf(label)
    const belowGap = label.top - bottomOf(input)
    let placement: 'above' | 'below' | 'left' | 'right'
    let gap: number
    if (aboveGap >= -4 && aboveGap <= 36 && horizontalRatio >= 0.25) {
      placement = 'above'; gap = Math.max(0, aboveGap)
    } else if (belowGap >= -4 && belowGap <= 36 && horizontalRatio >= 0.25) {
      placement = 'below'; gap = Math.max(0, belowGap)
    } else if (verticalRatio >= 0.4) {
      if (label.left + label.width / 2 < input.left + input.width / 2) {
        placement = 'left'; gap = Math.max(0, input.left - rightOf(label))
      } else {
        placement = 'right'; gap = Math.max(0, label.left - rightOf(input))
      }
    } else {
      placement = label.top + label.height / 2 <= input.top + input.height / 2 ? 'above' : 'below'
      gap = placement === 'above' ? Math.max(0, aboveGap) : Math.max(0, belowGap)
    }
    labels.set(id, { placement, gap, width: label.width })
  }
  const representativeSize = (values: readonly number[], fallback: readonly number[], min: number, tolerance: number) => {
    const source = values.filter(value => Number.isFinite(value) && value > 0).length ? values.filter(value => Number.isFinite(value) && value > 0) : fallback
    if (!source.length) return min
    const center = median(source)
    const similar = source.filter(value => Math.abs(value - center) <= Math.max(tolerance, Math.abs(center) * 0.2))
    return Math.max(min, tenth(mean(similar.length ? similar : source)))
  }
  const averageNear = (values: readonly number[], fallback: number, max: number) => {
    const source = values.filter(value => Number.isFinite(value) && value >= 0 && value <= max)
    if (!source.length) return fallback
    const center = median(source)
    const similar = source.filter(value => Math.abs(value - center) <= Math.max(2, Math.abs(center) * 0.25))
    return tenth(mean(similar.length ? similar : source))
  }
  const labelHeight = representativeSize(ids.map(id => stable(id).label.height), [], 8, 2)
  const sideLabelWidth = (placement: 'left' | 'right') => representativeSize(
    ids.filter(id => labels.get(id)?.placement === placement).map(id => stable(id).label.width),
    [],
    16,
    4
  )
  const sideLabelWidths = { left: sideLabelWidth('left'), right: sideLabelWidth('right') }
  const gapFor = (placement: 'above' | 'below' | 'left' | 'right') => averageNear(
    ids.filter(id => labels.get(id)?.placement === placement).map(id => labels.get(id)!.gap), 3, 36
  )
  const labelGaps = { above: gapFor('above'), below: gapFor('below'), left: gapFor('left'), right: gapFor('right') }
  const labelBox = (id: string, inputWidth: number) => {
    const info = labels.get(id)!
    const vertical = info.placement === 'above' || info.placement === 'below'
    const width = vertical ? inputWidth : info.placement === 'left' || info.placement === 'right' ? sideLabelWidths[info.placement] : info.width
    return { placement: info.placement, gap: labelGaps[info.placement], width, height: labelHeight }
  }
  const groupWidthFor = (id: string, inputWidth: number) => {
    const label = labelBox(id, inputWidth)
    return label.placement === 'left' || label.placement === 'right' ? inputWidth + label.width + label.gap : inputWidth
  }
  const groupHeightFor = (id: string, inputHeight: number) => {
    const label = labelBox(id, stable(id).input.width)
    return label.placement === 'above' || label.placement === 'below' ? inputHeight + label.height + label.gap : Math.max(inputHeight, label.height)
  }

  const rowAnchorIds = ids.filter(id => !checkboxIds.has(id))
  const rowAnchorTop = (row: readonly string[]) => {
    const anchors = row.filter(id => !checkboxIds.has(id))
    return median((anchors.length ? anchors : row).map(id => group(id).top))
  }
  const rowAnchorCenter = (row: readonly string[]) => {
    const anchors = row.filter(id => !checkboxIds.has(id))
    return median((anchors.length ? anchors : row).map(id => stable(id).input.top + stable(id).input.height / 2))
  }
  let rows = coordinateGroups(
    rowAnchorIds.length ? rowAnchorIds : ids,
    id => stable(id).input.top + stable(id).input.height / 2,
    (_center, row) => Math.max(16, median(row.map(id => stable(id).input.height)) * 0.3)
  ).sort((a, b) => rowAnchorTop(a) - rowAnchorTop(b))

  // Checkbox controls have a compact box and often sit beside their label, so
  // their input center can be above the control center of the row they belong
  // to. Attach each checkbox to the nearest ordinary row before leveling; this
  // keeps it in that row without letting the checkbox create or anchor a row.
  if (rowAnchorIds.length) {
    const checkboxRowTolerance = Math.max(36, median(rowAnchorIds.map(id => stable(id).input.height)) * 0.8)
    for (const id of ids.filter(item => checkboxIds.has(item))) {
      const center = stable(id).input.top + stable(id).input.height / 2
      let nearestIndex = -1, nearestDistance = Number.POSITIVE_INFINITY
      rows.forEach((row, index) => {
        const distance = Math.abs(center - rowAnchorCenter(row))
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index }
      })
      if (nearestIndex >= 0 && nearestDistance <= checkboxRowTolerance) rows[nearestIndex].push(id)
      else rows.push([id])
    }
    rows.sort((a, b) => rowAnchorTop(a) - rowAnchorTop(b))
  }

  const denseRow = rows.map(row => row.filter(isLevelable)).sort((a, b) => b.length - a.length)[0] ?? []
  const unitWidths = (denseRow.length > 1 ? denseRow : ordinaryIds).map(id => stable(id).input.width)
  const unitHeights = ordinaryIds.map(id => stable(id).input.height)
  const cellWidth = representativeSize(unitWidths, ordinaryIds.map(id => stable(id).input.width), 48, 16)
  const cellHeight = representativeSize(unitHeights, ids.map(id => stable(id).input.height), 24, 6)

  const measuredHorizontalGaps = rows.flatMap(row => {
    const ordered = [...row].sort((a, b) => group(a).left - group(b).left)
    return ordered.slice(1).map((id, index) => group(id).left - rightOf(group(ordered[index])))
  }).filter(gap => gap >= 0 && gap <= 100)
  const measuredVerticalGaps = rows.slice(1).map((row, index) => {
    const previousBottom = Math.max(...rows[index].map(id => bottomOf(group(id))))
    return median(row.map(id => group(id).top)) - previousBottom
  }).filter(gap => gap >= 0 && gap <= 120)
  const horizontalGap = Math.max(8, Math.min(40, options.horizontalGap === undefined
    ? boundedMean(measuredHorizontalGaps, 12, 8, 40)
    : tenth(options.horizontalGap)))
  const verticalGap = Math.max(8, Math.min(48, options.verticalGap === undefined
    ? boundedMean(measuredVerticalGaps, 20, 8, 48)
    : tenth(options.verticalGap)))
  const inset = Math.max(8, Math.min(40, tenth(options.edgeInset ?? 96 / 2.54 / 2)))

  // Keep the Notes field with the row derived from its current saved geometry.
  // It is a textarea with an intentional width, so it must not be stretched to
  // fill the rest of the panel during global leveling.
  const notesId = textareaIds.size === 1 ? [...textareaIds][0] : undefined
  const activeCheckboxId = [...checkboxIds].find(id => activeIds.has(id) || /active/i.test(id))
    ?? (checkboxIds.size === 1 ? [...checkboxIds][0] : undefined)

  const inputWidthFor = (id: string) => {
    const originalWidth = stable(id).input.width
    if (checkboxIds.has(id)) return 14
    if (!isLevelable(id)) return originalWidth
    const span = Math.max(1, Math.round((originalWidth + horizontalGap) / (cellWidth + horizontalGap)))
    return tenth(span * cellWidth + (span - 1) * horizontalGap)
  }
  const isFlexibleRow = (row: readonly string[]) => Boolean(
    notesId && activeCheckboxId && row.length === 2 && row.includes(notesId) && row.includes(activeCheckboxId)
  )
  const rowWidthFor = (row: readonly string[]) => row.reduce((sum, id) => sum + groupWidthFor(id, inputWidthFor(id)), 0) + Math.max(0, row.length - 1) * horizontalGap
  const rowWidths = rows.filter(row => !isFlexibleRow(row)).map(rowWidthFor)
  const minimumNotesWidth = notesId && activeCheckboxId
    ? groupWidthFor(notesId, 48) + groupWidthFor(activeCheckboxId, inputWidthFor(activeCheckboxId)) + horizontalGap
    : 0
  const contentWidth = Math.max(minimumNotesWidth, ...rowWidths, 0)
  const width = Math.max(canvas.width, Math.ceil(contentWidth + inset * 2))
  const fields: DesignerCanvas['fields'] = { ...canvas.fields }
  let rowTop = Math.max(inset, Math.min(...(rowAnchorIds.length ? rowAnchorIds : ids).map(id => group(id).top)))

  const placeField = (id: string, groupLeft: number, groupTop: number, targetWidth = stable(id).input.width, targetHeight = stable(id).input.height) => {
    const original = stable(id)
    const label = labelBox(id, targetWidth)
    let inputLeft = groupLeft
    if (label.placement === 'left') inputLeft += label.width + label.gap
    const groupHeight = groupHeightFor(id, targetHeight)
    const inputTop = label.placement === 'above'
      ? groupTop + label.height + label.gap
      : label.placement === 'below'
        ? groupTop
        : groupTop + (groupHeight - targetHeight) / 2
    const labelLeft = label.placement === 'left'
      ? groupLeft
      : label.placement === 'right'
        ? inputLeft + targetWidth + label.gap
        : inputLeft
    const labelTop = label.placement === 'above'
      ? groupTop
      : label.placement === 'below'
        ? inputTop + targetHeight + label.gap
        : groupTop + (groupHeight - label.height) / 2
    const dx = inputLeft - original.input.left
    const dy = inputTop - original.input.top
    const translated = translateCanvasField(original, dx, dy)
    fields[id] = {
      ...translated,
      ...(translated.select ? { select: { ...translated.select, left: tenth(inputLeft + 4) } } : {}),
      input: { ...translated.input, left: tenth(inputLeft), top: tenth(inputTop), width: targetWidth, height: targetHeight },
      label: { ...translated.label, left: tenth(labelLeft), top: tenth(labelTop), width: label.width, height: label.height }
    }
  }

  for (const row of rows) {
    const isNotesRow = isFlexibleRow(row)
    const ordered = isNotesRow
      ? (rtl ? [activeCheckboxId!, notesId!] : [notesId!, activeCheckboxId!])
      : [...row].sort((a, b) => rtl ? rightOf(group(b)) - rightOf(group(a)) : group(a).left - group(b).left)
    const rowWidth = rowWidthFor(ordered)
    const inputHeightFor = (id: string) => checkboxIds.has(id) ? 14 : isLevelable(id) ? cellHeight : stable(id).input.height
    const rowHeight = Math.max(...ordered.map(id => groupHeightFor(id, inputHeightFor(id))))
    if (isNotesRow) {
      const checkbox = activeCheckboxId!
      const notes = notesId!
      const checkboxWidth = groupWidthFor(checkbox, inputWidthFor(checkbox))
      const notesWidth = Math.max(48, contentWidth - checkboxWidth - horizontalGap - (groupWidthFor(notes, 48) - 48))
      const notesGroupWidth = groupWidthFor(notes, notesWidth)
      const rowWidth = notesGroupWidth + checkboxWidth + horizontalGap
      const rowLeft = (width - rowWidth) / 2
      const notesGroupLeft = rtl ? rowLeft + checkboxWidth + horizontalGap : rowLeft
      const checkboxGroupLeft = rtl ? rowLeft : rowLeft + notesGroupWidth + horizontalGap
      placeField(notes, notesGroupLeft, rowTop, notesWidth, cellHeight)
      const notesCenter = fields[notes].input.top + cellHeight / 2
      const checkboxTop = notesCenter - groupHeightFor(checkbox, inputHeightFor(checkbox)) / 2
      placeField(checkbox, checkboxGroupLeft, checkboxTop, inputWidthFor(checkbox), inputHeightFor(checkbox))
    } else {
      let cursor = rtl ? (width + contentWidth) / 2 : (width - contentWidth) / 2
      for (const id of ordered) {
        const targetWidth = inputWidthFor(id)
        const targetHeight = inputHeightFor(id)
        const allocationWidth = groupWidthFor(id, targetWidth)
        const groupLeft = rtl ? cursor - allocationWidth : cursor
        placeField(id, groupLeft, rowTop, targetWidth, targetHeight)
        cursor = rtl ? groupLeft - horizontalGap : groupLeft + allocationWidth + horizontalGap
      }
    }
    rowTop = isNotesRow
      ? Math.max(...row.map(id => bottomOf(fieldGroupRect(fields[id])))) + verticalGap
      : rowTop + rowHeight + verticalGap
  }

  const height = Math.max(canvas.height, Math.ceil(rowTop - verticalGap + inset))
  const exceptions = new Set(canvas.alignmentExceptionFieldIds ?? [])
  const centeredFieldIds = [...new Set([
    ...(canvas.centeredFieldIds ?? []).filter(id => !ids.includes(id)),
    ...ids.filter(id => !exceptions.has(id))
  ])]
  return { ...canvas, width, height, fields, preserveHorizontalBounds: true, centeredFieldIds }
}

/** Move a complete selection to one horizontal canvas edge without changing its vertical layout. */
export function alignDesignerCanvasFieldsToEdge(canvas: DesignerCanvas, ids: readonly string[], edge: 'left' | 'right', edgeInset = designerCanvasEdgeInset, visibleEdgeWidth = canvas.width, visibleOriginOffset = 0): DesignerCanvas {
  const selected = [...new Set(ids)].filter(id => Boolean(canvas.fields[id]))
  if (!selected.length) return canvas
  const bounds = selected.map(id => fieldGroupRect(canvas.fields[id]))
  const left = Math.min(...bounds.map(rect => rect.left))
  const right = Math.max(...bounds.map(rightOf))
  const groupWidth = right - left
  const targetWidth = Number.isFinite(visibleEdgeWidth) && visibleEdgeWidth > 0 ? visibleEdgeWidth : canvas.width
  const inset = Math.max(0, Math.min(targetWidth / 2, edgeInset))
  // Align to the visible editor edge whenever the selection fits there. If it
  // does not, retain the wider content Canvas so scrolling can reach its edge.
  const edgeWidth = groupWidth + inset * 2 <= targetWidth ? targetWidth : canvas.width
  // Render-only responsive translation moves the visible edge without changing
  // saved coordinates. Compensate for it here so the rendered inset stays exact.
  const offset = Number.isFinite(visibleOriginOffset) ? visibleOriginOffset : 0
  const delta = edge === 'left' ? inset - offset - left : edgeWidth - inset - offset - right
  const positioned = { ...canvas, preserveHorizontalBounds: true, centeredFieldIds: canvas.centeredFieldIds?.filter(id => !selected.includes(id)) }
  if (Math.abs(delta) < epsilon) return positioned
  const fields = { ...canvas.fields }
  for (const id of selected) fields[id] = translateCanvasField(fields[id], delta, 0)
  return { ...positioned, fields }
}

export function resizeCanvasInput(initial: DesignerRect, edge: 'left' | 'right' | 'top' | 'bottom', delta: number, container: DesignerRect, obstacles: readonly DesignerRect[], gap = designerSafetyGap): DesignerRect {
  const horizontal = edge === 'left' || edge === 'right'
  const leading = edge === 'left' || edge === 'top'
  const start = horizontal ? initial.left : initial.top
  const end = horizontal ? rightOf(initial) : bottomOf(initial)
  const size = horizontal ? initial.width : initial.height
  const minimum = Math.min(size, horizontal ? 48 : 24)
  const maximum = 20000
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

/** Keep labels and field chrome attached to the input while its geometry changes. */
function followInputResize(field: DesignerCanvasField, input: DesignerRect): DesignerCanvasField {
  const before = field.input
  if (before.left === input.left && before.top === input.top && before.width === input.width && before.height === input.height) return field
  const horizontalLeftDelta = input.left - before.left
  const horizontalRightDelta = rightOf(input) - rightOf(before)
  const alignHorizontally = (part: DesignerRect): DesignerRect => {
    if (Math.abs(part.width - before.width) <= Math.max(1, before.width * 0.02)) {
      return { ...part, left: input.left, width: input.width }
    }
    const leftAligned = Math.abs(part.left - before.left)
    const rightAligned = Math.abs(rightOf(part) - rightOf(before))
    return { ...part, left: part.left + (rightAligned <= leftAligned ? horizontalRightDelta : horizontalLeftDelta) }
  }
  const label = alignHorizontally(field.label)
  const labelVerticalDelta = input.top - before.top
  const select = field.select ? { ...field.select, left: field.select.left + horizontalLeftDelta, top: field.select.top + labelVerticalDelta } : undefined
  let error = field.error ? alignHorizontally(field.error) : undefined
  if (error) {
    const topAnchorGap = Math.min(Math.abs(error.top - before.top), Math.abs(bottomOf(error) - before.top))
    const bottomAnchorGap = Math.min(Math.abs(error.top - bottomOf(before)), Math.abs(bottomOf(error) - bottomOf(before)))
    error.top += bottomAnchorGap <= topAnchorGap ? input.top + input.height - bottomOf(before) : labelVerticalDelta
    if (Math.abs(error.width - before.width) <= Math.max(1, before.width * 0.02)) error.width = input.width
  }
  return { ...field, input, label: { ...label, top: label.top + labelVerticalDelta }, ...(select ? { select } : {}), ...(error ? { error } : {}) }
}

/** Visible space can exceed a saved, centered layout. Keep its coordinate origin
 * unchanged and pass these transient bounds only to manual geometry commands. */
export function designerCanvasInteractionBounds(canvas:DesignerCanvas,visibleWidth:number,viewShift=0):DesignerRect {
  return {left:Math.min(0,-viewShift),top:0,width:Math.max(canvas.width,visibleWidth),height:canvas.height}
}

export function resizeCanvasInputs(canvas: DesignerCanvas, ids: readonly string[], edge: 'left' | 'right' | 'top' | 'bottom', delta: number, extra: readonly DesignerObstacle[] = [], bounds?:DesignerRect): DesignerCanvas {
  const parts = [...canvasObstacles(canvas), ...extra]
  const selected = new Set(ids)
  const inset=bounds?Math.min(designerCanvasEdgeInset,bounds.width/2):0
  const container = bounds?{...bounds,left:bounds.left+inset,width:bounds.width-2*inset}:{ left: 0, top: 0, width: canvas.width, height: canvas.height }
  const fields = { ...canvas.fields }
  for (const id of ids) {
    const field = canvas.fields[id]
    if (!field) continue
    // Selection controls, labels and error overlays are attached parts, not
    // obstacles to their own input resize; followInputResize updates them.
    const ownParts = new Set([`${id}::input`, `${id}::label`, `${id}::error`])
    const input = resizeCanvasInput(field.input, edge, delta, container, parts.filter(part => !part.id.endsWith('::select') && !ownParts.has(part.id) && !selected.has(part.id.split('::')[0])))
    fields[id] = followInputResize(field, input)
  }
  return { ...canvas, fields, ...(bounds?{preserveHorizontalBounds:true}: {}) }
}

export const designerResizeHandles = ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type DesignerResizeHandle = typeof designerResizeHandles[number]
export type DesignerNeighborResize = { horizontal:boolean; vertical:boolean }
export const laboratoryResizeContract = { axes:['horizontal','vertical'], minimumWidth:48, minimumHeight:24, preserveGap:true, preserveOuterSpan:true, persistentRowCentering:true, preserveOppositeEdge:true, atomicUndo:true, automaticLayoutLocksManualGeometry:false, manualHorizontalBounds:'visible-editor-half-centimeter-inset', preserveUnselectedGeometry:true, selectedRowSizing:"arithmetic-mean", selectedRowSpacing:"mean-input-edge-gaps", partialSelectionSmartLayout:true, neighborCompensationDefault:false, neighborCompensationRequiresExplicitChoice:true, missingNeighborResize:"independent-within-editor-bounds" } as const

/** Shared layout calculation for canvas fields and measured component surfaces.
 * Persistence (Canvas rectangles versus flow offsets) is an adapter concern. */
export function layoutDesignerCanvasSelection(canvas: DesignerCanvas, ids: readonly string[], options: {
  operation: DesignerLayoutOperation; orientation: DesignerLayoutOrientation; gap: number; rtl: boolean;
  referenceId?: string; width?: number; height?: number; verticalGap?: number; wrapWidth?: number
}, deferValidation = false): { canvas: DesignerCanvas; blockedBy?: string } {
  const targets = [...new Set(ids)].filter(id => Boolean(canvas.fields[id]))
  if (targets.length < 2) return { canvas }
  const measured = targets.map(id => {
    const field = canvas.fields[id], rect = fieldGroupRect(field)
    return { id, ...rect, right: rightOf(rect), bottom: bottomOf(rect), inputWidth: field.input.width, inputHeight: field.input.height, labelWidth: field.label.width, labelHeight: field.label.height }
  })
  const draft = { overrides: {} } as DesignerDraft
  const changed = layoutDesignerFields(draft, measured, options, targets)
  const fields = { ...canvas.fields }
  for (const id of targets) {
    const values = changed.overrides[id + '::input'] ?? {}
    const original = fields[id]
    const input = { ...original.input, width: Number(values.width ?? original.input.width), height: Number(values.height ?? original.input.height) }
    if (options.rtl && ['equalWidth', 'equalSize'].includes(options.operation)) input.left += original.input.width - input.width
    fields[id] = translateCanvasField(followInputResize(original, input), Number(values.offsetX ?? 0), Number(values.offsetY ?? 0))
  }
  const height = options.operation === 'arrange' ? Math.max(canvas.height, ...Object.values(fields).map(field => bottomOf(fieldGroupRect(field)) + 12)) : canvas.height
  const proposed = { ...canvas, fields, height }
  const blockedBy = deferValidation ? undefined : height > 20000 ? 'container' : validateCanvasArrangement(canvas, proposed, targets, [], Math.min(8, options.gap, options.verticalGap ?? options.gap), true)
  return blockedBy ? { canvas, blockedBy } : { canvas: proposed }
}

/** Normalize a selected input-only row using its measured spacing. The same
 * command is available to any registered surface, independent of its content. */
export function levelDesignerInputRow(canvas: DesignerCanvas, ids: readonly string[], rtl: boolean, centerWidth?: number): { canvas: DesignerCanvas; blockedBy?: string } {
  const targets = [...new Set(ids)].filter(id => Boolean(canvas.fields[id]))
  if (targets.length < 2) return { canvas }
  const boxes = targets.map(id => canvas.fields[id].input).sort((a, b) => a.left - b.left)
  const gap = Math.max(0, mean(boxes.slice(1).map((rect, i) => rect.left - rightOf(boxes[i]))))
  const width = mean(boxes.map(rect => rect.width)), height = mean(boxes.map(rect => rect.height))
  const ordered = [...targets].sort((a,b)=>canvas.fields[a].input.left-canvas.fields[b].input.left)
  const span = width * ordered.length + gap * (ordered.length - 1)
  const left = centerWidth === undefined ? (boxes[0].left + rightOf(boxes[boxes.length-1]) - span) / 2 : (centerWidth-span)/2
  const top = mean(boxes.map(rect => rect.top))
  const fields = {...canvas.fields}
  for (const [index,id] of ordered.entries()) {
    const original = canvas.fields[id]
    fields[id] = followInputResize(original,{...original.input,left:left+index*(width+gap),top,width,height})
  }
  const proposed = {...canvas,fields}
  const blockedBy = validateCanvasArrangement(canvas, proposed, targets, [], Math.min(8, gap), true)
  return blockedBy ? { canvas, blockedBy } : { canvas: proposed }
}

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
  const build=(d:number):DesignerCanvas=>{
    const input={...initial,[pos]:start+(leading?d:0),[size]:initial[size]+(leading?-d:d)}
    const other={...neighbor.field.input,[pos]:neighbor.field.input[pos]+(leading?0:d),[size]:neighbor.field.input[size]+(leading?d:-d)}
    return {...canvas,fields:{...canvas.fields,[id]:followInputResize(field,input),[neighbor.id]:followInputResize(neighbor.field,other)}}
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
export function resizeCanvasDimension(canvas:DesignerCanvas,ids:readonly string[],dimension:'width'|'height',value:number,preserve?:Partial<DesignerNeighborResize>,rtl=false,bounds?:DesignerRect):DesignerCanvas {
  if(!Number.isFinite(value))return canvas
  const horizontal=dimension==='width',locked=horizontal?preserve?.horizontal:preserve?.vertical
  if(locked&&ids.length!==1)return canvas
  let next=canvas
  for(const id of ids){
    const rect=next.fields[id]?.input;if(!rect)continue
    let edge:'left'|'right'|'top'|'bottom'=horizontal?(rtl?'left':'right'):'bottom'
    if(locked&&!canvasResizeNeighbor(next,id,edge)){const alternate=edge==='left'?'right':edge==='right'?'left':'top';if(canvasResizeNeighbor(next,id,alternate))edge=alternate}
    const delta=(value-rect[dimension])*(edge==='left'||edge==='top'?-1:1)
    next=resizeCanvasHandle(next,[id],edge,horizontal?delta:0,horizontal?0:delta,preserve,bounds)
  }
  return next
}

/** Neighbour compensation is an explicit Designer choice, never a runtime policy default. */
export function resolveDesignerNeighborResize(draft: Pick<DesignerDraft,'neighborResize'>): DesignerNeighborResize {
  return {horizontal:draft.neighborResize?.horizontal===true,vertical:draft.neighborResize?.vertical===true}
}

export function resizeCanvasHandle(canvas: DesignerCanvas, ids: readonly string[], handle: DesignerResizeHandle, dx: number, dy: number, preserve?:Partial<DesignerNeighborResize>, bounds?:DesignerRect): DesignerCanvas {
  let next = canvas
  if (dx && (handle.includes('left') || handle.includes('right'))) {
    const edge=handle.includes('left')?'left':'right'
    next=preserve?.horizontal
      ?ids.length===1?(canvasResizeNeighbor(next,ids[0],edge)?resizeCanvasNeighborInput(next,ids[0],edge,dx):resizeCanvasInputs(next,ids,edge,dx,[],bounds)):next
      :resizeCanvasInputs(next,ids,edge,dx,[],bounds)
  }
  if (dy && (handle.includes('top') || handle.includes('bottom'))) {
    const edge=handle.includes('top')?'top':'bottom'
    next=preserve?.vertical
      ?ids.length===1?(canvasResizeNeighbor(next,ids[0],edge)?resizeCanvasNeighborInput(next,ids[0],edge,dy):resizeCanvasInputs(next,ids,edge,dy,[],bounds)):next
      :resizeCanvasInputs(next,ids,edge,dy,[],bounds)
  }
  return ids.every(id => {
    const before = canvas.fields[id]?.input, after = next.fields[id]?.input
    return before === after || (before && after && before.left === after.left && before.top === after.top && before.width === after.width && before.height === after.height)
  }) ? canvas : next
}

/** Snap only the edges the user resized to nearby stationary field edges. */
export function snapResizedCanvasInputsToPeers(canvas: DesignerCanvas, ids: readonly string[], handle: DesignerResizeHandle, preserve?: Partial<DesignerNeighborResize>,bounds?:DesignerRect): DesignerCanvas {
  const targets = new Set(ids.filter(id => Boolean(canvas.fields[id])))
  const exceptions = new Set(canvas.alignmentExceptionFieldIds ?? [])
  if (!targets.size) return canvas
  let next = canvas
  // Snapping a shared boundary after a neighbour-preserving resize would undo
  // one side of the transaction and leave its peer at the expanded size.
  const edges = (['left', 'right', 'top', 'bottom'] as const).filter(edge => handle.includes(edge)
    && !(preserve?.horizontal && (edge === 'left' || edge === 'right'))
    && !(preserve?.vertical && (edge === 'top' || edge === 'bottom')))
  for (const id of targets) {
    if (exceptions.has(id)) continue
    for (const edge of edges) {
      const rect = next.fields[id]?.input
      if (!rect) continue
      const horizontal = edge === 'left' || edge === 'right'
      const edgeOf = (candidate: DesignerRect) => edge === 'left' ? candidate.left : edge === 'right' ? rightOf(candidate) : edge === 'top' ? candidate.top : bottomOf(candidate)
      const currentEdge = edgeOf(rect)
      const anchors = Object.entries(next.fields)
        .filter(([peerId]) => !targets.has(peerId) && !exceptions.has(peerId))
        .map(([, field]) => edgeOf(field.input))
      if (!anchors.length) continue
      const anchor = anchors.reduce((closest, value) => Math.abs(value - currentEdge) < Math.abs(closest - currentEdge) ? value : closest)
      const tolerance = Math.max(12, Math.min(24, (horizontal ? rect.width : rect.height) * 0.08))
      const delta = anchor - currentEdge
      if (Math.abs(delta) <= epsilon || Math.abs(delta) > tolerance) continue
      const snapped = resizeCanvasInputs(next, [id], edge, delta,[],bounds)
      const snappedEdge = snapped.fields[id] ? edgeOf(snapped.fields[id].input) : currentEdge
      if (Math.abs(snappedEdge - anchor) > epsilon) continue
      next = snapped
    }
  }
  return next
}

export function fieldGroupRect(field: DesignerCanvasField): DesignerRect {
  const left = Math.min(field.input.left, field.label.left), top = Math.min(field.input.top, field.label.top)
  return { left, top, width: Math.max(rightOf(field.input), rightOf(field.label)) - left, height: Math.max(bottomOf(field.input), bottomOf(field.label)) - top }
}

export function translateCanvasField(field: DesignerCanvasField, dx: number, dy: number): DesignerCanvasField {
  return Object.fromEntries(Object.entries(field).map(([part, rect]) => [part, { ...rect, left: rect.left + dx, top: rect.top + dy }])) as DesignerCanvasField
}

export function moveCanvasFields(canvas: DesignerCanvas, ids: readonly string[], dx: number, dy: number,bounds?:DesignerRect): DesignerCanvas {
  // Input rectangles define the editable canvas bounds. Labels can deliberately
  // span a whole row, while selection/error overlays may have stale geometry;
  // they move with the field but cannot pin its drag to an invisible edge.
  const parts = ids.flatMap(id => canvas.fields[id] ? [canvas.fields[id].input] : [])
  if (!parts.length) return canvas
  const available=bounds??{left:0,top:0,width:canvas.width,height:canvas.height}
  const inset = Math.min(designerCanvasEdgeInset, available.width / 2)
  let minX = available.left+inset - Math.min(...parts.map(p => p.left))
  let maxX = available.left+available.width - inset - Math.max(...parts.map(rightOf))
  if (maxX < minX) {
    minX = -Math.min(...parts.map(p => p.left))
    maxX = canvas.width - Math.max(...parts.map(rightOf))
  }
  // Preserve the approved safety inset, but never force a field already beyond
  // it to jump backwards. Zero is always a valid delta for imported geometry;
  // inward one-pixel nudges remain incremental until it is inside the inset.
  minX = Math.min(0, minX)
  maxX = Math.max(0, maxX)
  const boundedX = dx === 0 || maxX < minX ? 0 : Math.max(minX, Math.min(maxX, dx))
  const boundedY = Math.max(Math.min(0, -Math.min(...parts.map(p => p.top))), Math.min(Math.max(0, canvas.height - Math.max(...parts.map(bottomOf))), dy))
  const fields = { ...canvas.fields }
  for (const id of ids) if (fields[id]) fields[id] = translateCanvasField(fields[id], boundedX, boundedY)
  return { ...canvas, fields, preserveHorizontalBounds: true }
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
