import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Language } from '../../i18n'
import { designerActionCode, designerActionDimensionLimits, designerActionLabel, designerActionVisible, designerProperties, designerColorScope, designerEffectiveValues, designerElementAppearanceProperties, designerElementAppearanceValues, type DesignerActionTextPart, type DesignerActionTextStyle, type DesignerAlignment, type DesignerAppearanceProperty, type DesignerDraft, type DesignerLayoutOperation, type DesignerLayoutOrientation, type DesignerProperty, type DesignerValue, type GridSearchPosition } from './designer'
import type { BaseFormAction } from './types'
import { ExcelColorPicker } from './ExcelColorPicker'
import { getFormComponentById, getFormComponentPresets, getFormComponents, type FormComponentCategory } from './componentRegistry'
import { FormBuilderSandbox } from './FormBuilderSandbox'
import { supportsSandboxPreset } from './formBuilderSandboxState'

export type DesignerPropertyRequest = {
  sequence: number
  section: 'color' | 'size' | 'font' | 'align' | 'textAlign' | 'spacing' | 'more' | 'appearance' | 'borders' | 'shadow' | 'gradient' | 'appearanceMore'
  property?: DesignerProperty
}

type Props = {
  geometryEditable: boolean
  propertyRequest?: DesignerPropertyRequest
  onElementAppearanceCommit: (property: DesignerProperty, value: DesignerValue | undefined) => void
  onElementAppearancePreview: (property: DesignerProperty, value: DesignerValue | undefined | null) => void
  onFinishPropertyChange: () => void
  language: Language
  draft: DesignerDraft
  filterPopupFontSize: number
  onFilterPopupFontSizeChange: (size: number) => void
  gridSearchPosition: GridSearchPosition
  onGridSearchPositionChange: (position: GridSearchPosition) => void
  buttonPressEffectEnabled: boolean
  onButtonPressEffectChange: (enabled: boolean) => void
  onBeginFilterPopupFontSizeChange: () => void
  onCommitFilterPopupFontSizeChange: () => void
  selectedFieldIds: string[]
  selectedActionIds: string[]
  actions: BaseFormAction[]
  onActionVisibilityChange: (id: string, visible: boolean) => void
  onSelectAction: (id: string) => void
  onActionTextChange: (id: string, part: DesignerActionTextPart, value: string) => void
  onActionTextPropertyChange: (ids: string[], part: DesignerActionTextPart, property: DesignerProperty, value: DesignerValue | undefined) => void
  onActionColorCommit: (property: DesignerProperty, value: DesignerValue | undefined) => void
  onActionColorPreview: (property: DesignerProperty, value: DesignerValue | undefined | null) => void
  onClearSelection: () => void
  fieldIds: readonly string[]
  fieldLabels: Record<string, string>
  applyToAll: boolean
  canSave: boolean
  saveStatus: string
  onApplyToAllChange: (value: boolean) => void
  onChange: (property: DesignerProperty, value: DesignerValue | undefined) => void
  onColorCommit: (property: DesignerProperty, value: DesignerValue | undefined) => void
  onColorPreview: (property: DesignerProperty, value: DesignerValue | undefined | null) => void
  onAppearanceColorCommit: (property: DesignerAppearanceProperty, value: string | undefined) => void
  onAppearanceColorPreview: (property: DesignerAppearanceProperty, value: string | undefined | null) => void
  onBeginColorChange: () => void
  onCommitColorChange: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onResetSelected: () => void
  onResetAll: () => void
  onSave: () => void
  onCancel: () => void
  onSelectAll: () => void
  onLayout: (operation: DesignerLayoutOperation, orientation: DesignerLayoutOrientation, gap: number) => void
  onAlign: (direction: DesignerAlignment) => void
  referenceFieldId: string
  onReferenceChange: (id: string) => void
  layoutStatus: string
}

const propertyLabels: Record<DesignerProperty, [string, string, string]> = {
  componentPopupBackground: ['زمینهٔ پنجره', 'Popup background', '弹窗背景'], componentPopupFontSize: ['قلم پنجره', 'Popup font size', '弹窗字号'],
  componentAddBackground: ['زمینهٔ کلید +', 'Add button background', '添加按钮背景'], componentAddTextColor: ['رنگ علامت +', 'Add button text', '添加按钮文字'], componentAddWidth: ['عرض کلید +', 'Add button width', '添加按钮宽度'], componentAddHeight: ['ارتفاع کلید +', 'Add button height', '添加按钮高度'],
  appearancePreset: ['سبک ظاهری', 'Appearance preset', '外观样式'], borderWidth: ['ضخامت کادر', 'Border width', '边框宽度'], borderStyle: ['نوع کادر', 'Border style', '边框样式'],
  shadowOpacity: ['شدت سایه (%)', 'Shadow intensity (%)', '阴影强度 (%)'], shadowOffsetX: ['جهت افقی سایه', 'Shadow horizontal offset', '阴影横向偏移'], shadowOffsetY: ['جهت عمودی سایه', 'Shadow vertical offset', '阴影纵向偏移'], shadowBlur: ['محو شدن سایه', 'Shadow blur', '阴影模糊'], shadowSpread: ['گسترش سایه', 'Shadow spread', '阴影扩散'], shadowInset: ['سایهٔ داخلی', 'Inset shadow', '内阴影'],
  gradientEnabled: ['گرادیان فعال', 'Enable gradient', '启用渐变'], gradientStartColor: ['رنگ آغاز گرادیان', 'Gradient start', '渐变起始颜色'], gradientEndColor: ['رنگ پایان گرادیان', 'Gradient end', '渐变结束颜色'], gradientAngle: ['جهت گرادیان (درجه)', 'Gradient angle', '渐变角度'], paddingX: ['فاصلهٔ داخلی افقی', 'Horizontal padding', '水平内边距'], paddingY: ['فاصلهٔ داخلی عمودی', 'Vertical padding', '垂直内边距'],
  borderRadius: ['گردی گوشه', 'Border radius', '圆角'], hoverTextColor: ['متن هنگام اشاره', 'Hover text', '悬停文字'], hoverBorderColor: ['مرز هنگام اشاره', 'Hover border', '悬停边框'], disabledTextColor: ['متن غیرفعال', 'Disabled text', '禁用文字'], disabledBorderColor: ['مرز غیرفعال', 'Disabled border', '禁用边框'],
  fontFamily: ['قلم', 'Font family', '字体'], fontSize: ['اندازهٔ قلم', 'Font size', '字号'], fontWeight: ['ضخامت قلم', 'Font weight', '字重'], bold: ['درشت', 'Bold', '粗体'], italic: ['ایتالیک', 'Italic', '斜体'], textAlign: ['تراز متن', 'Text alignment', '文本对齐'], lineHeight: ['فاصلهٔ سطر', 'Line height', '行高'],
  backgroundColor: ['پس‌زمینه', 'Background', '背景色'], textColor: ['متن', 'Text', '文字颜色'], labelColor: ['برچسب', 'Label', '标签颜色'], borderColor: ['حاشیه', 'Border', '边框颜色'], focusColor: ['تمرکز', 'Focus', '焦点颜色'], focusBackgroundColor: ['پس‌زمینهٔ فوکوس', 'Focus background', '焦点背景'], focusTextColor: ['متن فوکوس', 'Focus text', '焦点文字'], focusBorderColor: ['مرز فوکوس', 'Focus border', '焦点边框'], focusLabelColor: ['متن برچسب در فوکوس', 'Focused label text', '焦点标签文字'], hoverColor: ['شناوری', 'Hover', '悬停颜色'], selectedColor: ['انتخاب', 'Selected', '选中颜色'], disabledColor: ['غیرفعال', 'Disabled', '禁用颜色'], errorColor: ['خطا', 'Error', '错误颜色'], width: ['عرض', 'Width', '宽度'], height: ['ارتفاع', 'Height', '高度'], offsetX: ['موقعیت افقی', 'Horizontal position', '水平位置'], offsetY: ['موقعیت عمودی', 'Vertical position', '垂直位置']
}
const colorKeys: DesignerProperty[] = ['backgroundColor', 'textColor', 'labelColor', 'borderColor', 'hoverColor', 'selectedColor', 'disabledColor', 'errorColor']
const isActionTextStyleProperty = (property: DesignerProperty): property is keyof DesignerActionTextStyle => ['fontFamily', 'fontSize', 'fontWeight', 'bold', 'italic', 'textAlign', 'lineHeight'].includes(property)
const focusColorKeys: DesignerProperty[] = ['focusBackgroundColor', 'focusBorderColor', 'focusTextColor', 'focusLabelColor']
const defaultColors: Record<string, string> = { backgroundColor: '#ffffff', textColor: '#202a31', labelColor: '#69747b', borderColor: '#d7dee2', focusColor: '#0e7490', focusBackgroundColor: '#ffffff', focusTextColor: '#202a31', focusBorderColor: '#0e7490', focusLabelColor: '#69747b', hoverColor: '#e9f4f5', selectedColor: '#d99a30', disabledColor: '#eef1f3', errorColor: '#c24141' }
const appearanceLabels: Record<DesignerAppearanceProperty, [string, string, string]> = {
  formBackground: ['پس‌زمینهٔ فرم', 'Form background', '表单背景'], formFrameBackground: ['پس‌زمینهٔ قاب فرم', 'Form frame background', '表单框架背景'], formFrameBorder: ['قاب بیرونی فرم', 'Form frame border', '表单框架边框'], entryFieldBackground: ['پس‌زمینهٔ فیلدها هنگام ورود اطلاعات', 'Entry-mode field background', '录入模式字段背景'],
  tableBackground: ['پس‌زمینهٔ جدول', 'Table background', '表格背景'], tableBorder: ['قاب جدول', 'Table frame', '表格边框'], tableTitleBackground: ['پس‌زمینهٔ عنوان جدول', 'Table title background', '表格标题背景'], tableTitleText: ['متن عنوان جدول', 'Table title text', '表格标题文字'],
  headerBackground: ['پس‌زمینهٔ سرستون', 'Header background', '表头背景'], headerText: ['متن سرستون', 'Header text', '表头文字'], headerBorder: ['مرز سرستون', 'Header border', '表头边框'], headerActiveBackground: ['سرستون مرتب‌شده', 'Sorted header background', '排序表头背景'], headerActiveText: ['متن سرستون مرتب‌شده', 'Sorted header text', '排序表头文字'],
  rowBackground: ['پس‌زمینهٔ ردیف', 'Row background', '行背景'], rowAlternateBackground: ['ردیف یکی‌درمیان', 'Alternate row', '交替行背景'], rowHoverBackground: ['ردیف هنگام اشاره', 'Row hover', '悬停行背景'], rowSelectedBackground: ['ردیف انتخاب‌شده', 'Selected row', '选中行背景'], cellText: ['متن سلول', 'Cell text', '单元格文字'], cellBackground: ['پس‌زمینهٔ سلول', 'Cell background', '单元格背景'], gridLine: ['خطوط شبکه', 'Grid lines', '网格线'],
  footerBackground: ['پس‌زمینهٔ فوتر جدول', 'Table footer background', '表格页脚背景'], footerText: ['متن فوتر جدول', 'Table footer text', '表格页脚文字'], footerBorder: ['مرز فوتر جدول', 'Table footer border', '表格页脚边框'],
  toolbarBackground: ['پس‌زمینهٔ نوار ابزار', 'Toolbar background', '工具栏背景'], toolbarText: ['متن نوار ابزار', 'Toolbar text', '工具栏文字'], searchBackground: ['پس‌زمینهٔ جست‌وجو', 'Search background', '搜索背景'], searchBorder: ['مرز جست‌وجو', 'Search border', '搜索边框'], filterBackground: ['پس‌زمینهٔ فیلترها', 'Filter background', '筛选背景'], filterText: ['متن فیلترها', 'Filter text', '筛选文字'], summaryText: ['متن خلاصهٔ رکوردها', 'Record summary text', '记录摘要文字'],
  actionBarBackground: ['پس‌زمینهٔ نوار عملیات', 'Action bar background', '操作栏背景'], actionBackground: ['پس‌زمینهٔ دکمهٔ عملیات', 'Action button background', '操作按钮背景'], actionText: ['متن دکمهٔ عملیات', 'Action button text', '操作按钮文字'], actionBorder: ['مرز دکمهٔ عملیات', 'Action button border', '操作按钮边框'], actionHoverBackground: ['دکمه هنگام اشاره', 'Action button hover', '悬停操作按钮'], actionDisabledBackground: ['دکمهٔ غیرفعال', 'Disabled action button', '禁用操作按钮']
}
const appearanceDefaults: Record<DesignerAppearanceProperty, string> = {
  formBackground: '#ffffff', formFrameBackground: '#ffffff', formFrameBorder: '#dfe7e3', entryFieldBackground: '#f4f6f5',
  tableBackground: '#ffffff', tableBorder: '#dfe7e3', tableTitleBackground: '#ffffff', tableTitleText: '#102a2a',
  headerBackground: '#f7f9f7', headerText: '#6f7f7c', headerBorder: '#dfe7e3', headerActiveBackground: '#e8f2ef', headerActiveText: '#217c73',
  rowBackground: '#ffffff', rowAlternateBackground: '#fbfcfb', rowHoverBackground: '#f3faf8', rowSelectedBackground: '#dcece8', cellText: '#263a38', cellBackground: '#ffffff', gridLine: '#e5ece9',
  footerBackground: '#e3efec', footerText: '#536763', footerBorder: '#c6d9d4',
  toolbarBackground: '#ffffff', toolbarText: '#102a2a', searchBackground: '#ffffff', searchBorder: '#dfe7e3', filterBackground: '#ffffff', filterText: '#263a38', summaryText: '#71817e',
  actionBarBackground: '#e3efec', actionBackground: '#ffffff', actionText: '#314a47', actionBorder: '#cbd8d4', actionHoverBackground: '#f9fffd', actionDisabledBackground: '#eef1f3'
}
const appearanceGroups: [string, string, DesignerAppearanceProperty[]][] = [
  ['form', 'فرم و قاب', ['formBackground', 'formFrameBackground', 'formFrameBorder']],
  ['entry', 'حالت ورود اطلاعات', ['entryFieldBackground']],
  ['table', 'جدول', ['tableBackground', 'tableBorder', 'tableTitleBackground', 'tableTitleText']],
  ['header', 'هدر جدول', ['headerBackground', 'headerText', 'headerBorder', 'headerActiveBackground', 'headerActiveText']],
  ['rows', 'ردیف‌ها و سلول‌ها', ['rowBackground', 'rowAlternateBackground', 'rowHoverBackground', 'rowSelectedBackground', 'cellText', 'cellBackground', 'gridLine']],
  ['footer', 'فوتر جدول', ['footerBackground', 'footerText', 'footerBorder']],
  ['toolbar', 'نوار ابزار و فیلتر', ['toolbarBackground', 'toolbarText', 'searchBackground', 'searchBorder', 'filterBackground', 'filterText', 'summaryText']],
  ['actions', 'دکمه‌های عملیاتی', ['actionBarBackground', 'actionBackground', 'actionText', 'actionBorder', 'actionHoverBackground', 'actionDisabledBackground']]
]

export function FormLaboratoryDesignerPanel(props: Props) {
  const [orientation, setOrientation] = useState<DesignerLayoutOrientation>('horizontal')
  const [gap, setGap] = useState(12)
  const [actionTextPart, setActionTextPart] = useState<'button' | DesignerActionTextPart>('button')
  const [componentLibraryQuery, setComponentLibraryQuery] = useState('')
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<{ kind: 'component' | 'preset'; id: string } | null>(null)
  const [sandboxRequest, setSandboxRequest] = useState<{ presetId?: string } | null>(null)
  const fa = props.language === 'fa'
  const zh = props.language === 'zh'
  const word = (faText: string, enText: string, zhText: string) => fa ? faText : zh ? zhText : enText
  const libraryComponents = getFormComponents().filter(component => component.designerSelectable)
  const libraryPresets = getFormComponentPresets()
  const categoryTitle = (category: FormComponentCategory) => category === 'input'
    ? word('ورودی', 'Inputs', '输入')
    : category === 'table'
      ? word('جدول', 'Tables', '表格')
      : category === 'layout'
        ? word('چیدمان', 'Layout', '布局')
        : category === 'action'
          ? word('عملیات', 'Actions', '操作')
          : word('پشتیبان', 'Support', '辅助')
  const labelPolicyTitle = (policy: 'editable' | 'fixed' | 'none') => policy === 'editable'
    ? word('قابل ویرایش', 'Editable', '可编辑')
    : policy === 'fixed'
      ? word('ثابت', 'Fixed', '固定')
      : word('بدون برچسب', 'No label', '无标签')
  const libraryQuery = componentLibraryQuery.trim().toLocaleLowerCase()
  const libraryCategories: FormComponentCategory[] = ['input', 'table', 'layout', 'action', 'support']
  const libraryGroups = libraryCategories.map(category => ({
    category,
    components: libraryComponents.map(component => {
      const presets = libraryPresets.filter(preset => preset.componentId === component.id)
      const componentMatches = !libraryQuery || [component.id, component.exportName, component.title[props.language]].some(value => value.toLocaleLowerCase().includes(libraryQuery))
      const matchingPresets = presets.filter(preset => !libraryQuery || [preset.id, preset.title[props.language]].some(value => value.toLocaleLowerCase().includes(libraryQuery)))
      return { component, presets: componentMatches ? presets : matchingPresets }
    }).filter(({ component, presets }) => component.category === category && (!libraryQuery || presets.length > 0 || [component.id, component.exportName, component.title[props.language]].some(value => value.toLocaleLowerCase().includes(libraryQuery))))
  })).filter(group => group.components.length > 0)
  const selectedPreset = selectedLibraryItem?.kind === 'preset' ? libraryPresets.find(preset => preset.id === selectedLibraryItem.id) : undefined
  const selectedComponent = selectedLibraryItem?.kind === 'component'
    ? getFormComponentById(selectedLibraryItem.id)
    : selectedPreset ? getFormComponentById(selectedPreset.componentId) : undefined
  const fieldIds = props.applyToAll ? props.fieldIds : props.selectedFieldIds
  const componentFieldIds = fieldIds.filter(id => ['titleId', 'phone', 'mobile', 'address'].includes(id.split('::')[0]))
  const editingAction = props.selectedActionIds.length > 0
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const request = props.propertyRequest, panel = panelRef.current
    if (!request || !panel) return
    if (request.section === 'color') {
      const control = panel.querySelector<HTMLElement>(`${editingAction ? '.designer-action-colors ' : ''}[data-designer-color-property="${request.property}"]`)
      if (!control) return
      for (let parent = control.parentElement; parent && parent !== panel; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true
      }
      control.scrollIntoView({ block: 'nearest' })
      control.querySelector<HTMLButtonElement>('.excel-color-trigger')?.click()
      return
    }
    const selectors = { size: '#designer-width', font: '#designer-font-size', align: '.designer-layout-operations button:not(:disabled)', textAlign: '#designer-text-align', spacing: '.designer-layout-gap input', more: '.designer-properties select:not(:disabled)', appearance: '#designer-appearance-preset', borders: '#designer-effect-borderWidth', shadow: '#designer-effect-shadowOpacity', gradient: '#designer-gradientEnabled', appearanceMore: '#designer-effect-paddingX' }
    const control = panel.querySelector<HTMLElement>(selectors[request.section])
    for (let parent = control?.parentElement; parent && parent !== panel; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true
    }
    control?.scrollIntoView({ block: 'nearest' })
    control?.focus()
  }, [props.propertyRequest])
  const editingEnabled = fieldIds.length > 0 || editingAction
  const firstField = props.selectedFieldIds[0] ?? props.fieldIds[0]
  const storageKey = (id: string, property: DesignerProperty) => {
    const [baseId, part = 'field'] = id.split('::')
    if (property.startsWith('component')) return `${baseId}::input`
    if (property === 'focusLabelColor') return `${baseId}::label`
    if (property === 'focusBackgroundColor' || property === 'focusTextColor' || property === 'focusBorderColor') return `${baseId}::input`
    if (designerElementAppearanceProperties.includes(property as typeof designerElementAppearanceProperties[number])) return `${baseId}::input`
    return property === 'width' || property === 'height' ? `${baseId}::${part === 'field' ? 'input' : part}` : part === 'field' ? baseId : `${baseId}::${part}`
  }
  const readValue = (id: string, key: DesignerProperty) => {
    if (editingAction) {
      if (actionTextPart !== 'button' && isActionTextStyleProperty(key)) return props.draft.actions?.[id]?.textStyles?.[actionTextPart]?.[key]
      return props.draft.actions?.[id]?.[key]
    }
    const primary = props.draft.overrides[storageKey(id, key)]?.[key]
    if (primary !== undefined) return primary
    return undefined
  }
  const valuesFor = (key: DesignerProperty) => (editingAction ? props.selectedActionIds : key.startsWith('component') ? componentFieldIds : fieldIds).map(id => readValue(id, key))
  const mixed = (key: DesignerProperty) => new Set(valuesFor(key).map(value => JSON.stringify(value))).size > 1
  const selectedNames = props.selectedFieldIds.map(id => props.fieldLabels[id.split('::')[0]] ?? id)
  const selectedGroupCount = new Set(props.selectedFieldIds.map(id => id.split('::')[0])).size
  const value = (key: DesignerProperty, fallback: DesignerValue): DesignerValue => readValue(editingAction ? props.selectedActionIds[0] : key.startsWith('component') ? componentFieldIds[0] ?? firstField : firstField, key) ?? fallback
  const edit = (key: DesignerProperty, next: DesignerValue | undefined) => {
    if (editingAction && actionTextPart !== 'button' && isActionTextStyleProperty(key)) props.onActionTextPropertyChange(props.selectedActionIds, actionTextPart, key, next)
    else props.onChange(key, next)
  }
  const clear = (key: DesignerProperty) => <button type="button" className="designer-inherit-button" disabled={!editingEnabled || (!props.geometryEditable && ['width', 'height', 'offsetX', 'offsetY'].includes(key)) || valuesFor(key).every(v => v === undefined)} onClick={() => edit(key, undefined)}>{word('وراثت', 'Inherit', '继承')}</button>
  const scopeText = (key: DesignerProperty) => {
    const scope = designerColorScope(props.selectedFieldIds, key, props.fieldIds), labels = scope.part === 'label'
    return scope.global ? word(labels ? 'همه برچسب‌ها' : 'همه فیلدها', labels ? 'All labels' : 'All inputs', labels ? '全部标签' : '全部输入') : scope.targets.length === 1 ? word(labels ? 'برچسب انتخاب‌شده' : 'فیلد انتخاب‌شده', 'Selected element', '所选元素') : word(`${scope.targets.length.toLocaleString('fa-IR')} ${labels ? 'برچسب' : 'فیلد'} انتخاب‌شده`, `${scope.targets.length} selected elements`, `${scope.targets.length} 个所选元素`)
  }
  const colorControl = (key: DesignerProperty) => {
    const scope = designerColorScope(props.selectedFieldIds, key, props.fieldIds), storedKey = key === 'labelColor' ? 'textColor' : key
    const tokens = getComputedStyle(document.documentElement)
    const token = (name: string, fallback: string) => tokens.getPropertyValue(name).trim() || fallback
    const fallback = ({ backgroundColor: token('--cream', '#f8faf8'), textColor: token('--ink', '#102a2a'), labelColor: token('--muted', '#71817e'), borderColor: token('--line', '#dfe7e3'), focusBorderColor: token('--teal', '#217c73') } as Partial<Record<DesignerProperty, string>>)[key] ?? defaultColors[key]
    const inheritedKey = ({ focusBackgroundColor: 'backgroundColor', focusTextColor: 'textColor', focusLabelColor: 'textColor', hoverColor: 'backgroundColor' } as Partial<Record<DesignerProperty, DesignerProperty>>)[key]
    const colors = (scope.global ? [props.draft.defaults?.[scope.part] ?? {}] : scope.targets.map(id => designerEffectiveValues(props.draft, id.split('::')[0], scope.part))).map(values => values[storedKey] ?? (inheritedKey ? values[inheritedKey] : undefined) ?? (key === 'focusBackgroundColor' || key === 'hoverColor' ? token('--cream', '#f8faf8') : key === 'focusTextColor' ? token('--ink', '#102a2a') : key === 'focusLabelColor' ? token('--muted', '#71817e') : fallback))
    const current = colors[0] as string
    const hasOverride = scope.global ? props.draft.defaults?.[scope.part]?.[storedKey] !== undefined : scope.targets.some(id => props.draft.overrides[id]?.[storedKey] !== undefined || props.draft.overrides[id.split('::')[0]]?.[key] !== undefined)
    const labelText = propertyLabels[key][props.language === 'fa' ? 0 : props.language === 'zh' ? 2 : 1]
    return <div className="designer-color-control" data-designer-color-property={key} key={key}>
      <div className="designer-color-label"><span>{labelText}<small className="designer-color-scope">{scopeText(key)}{hasOverride && !scope.global ? word(' · رنگ اختصاصی', ' · override', ' · 自定义') : ''}</small></span><ExcelColorPicker language={props.language} label={labelText} value={current} mixed={new Set(colors.map(c => c ?? defaultColors[key])).size > 1} onPreview={next => props.onColorPreview(key, next)} onCommit={next => props.onColorCommit(key, next)} /></div><button type="button" className="designer-inherit-button" disabled={!hasOverride} onClick={() => props.onColorCommit(key, undefined)}>{scope.global ? word('پیش‌فرض', 'Default', '默认') : word('بازگشت به رنگ عمومی', 'Reset to global', '恢复全局')}</button>
    </div>
  }
  const actionColorControl = (key: DesignerProperty) => {
    const appearanceKey = ({ backgroundColor: 'actionBackground', textColor: 'actionText', borderColor: 'actionBorder', hoverColor: 'actionHoverBackground', disabledColor: 'actionDisabledBackground' } as Partial<Record<DesignerProperty, DesignerAppearanceProperty>>)[key]
    const tokens = getComputedStyle(document.documentElement), primary = props.actions.find(action => action.id === props.selectedActionIds[0])?.primary
    const normalKey = key.includes('Text') ? 'textColor' : key.includes('Border') ? 'borderColor' : 'backgroundColor'
    const normal = props.draft.actions?.[props.selectedActionIds[0]]?.[normalKey]
    const designFallback = key === 'textColor' ? primary ? '#ffffff' : '#314a47' : key === 'backgroundColor' || key === 'borderColor' ? tokens.getPropertyValue(primary ? '--teal' : key === 'backgroundColor' ? '--cream' : '--line').trim() : undefined
    const fallback = (appearanceKey ? props.draft.appearance?.[appearanceKey] : undefined) ?? (key.startsWith('hover') || key.startsWith('disabled') ? normal : undefined) ?? designFallback ?? (appearanceKey ? appearanceDefaults[appearanceKey] : key.includes('Text') ? '#314a47' : '#6f9992')
    const labelText = propertyLabels[key][fa ? 0 : zh ? 2 : 1]
    return <div className="designer-color-control" data-designer-color-property={key} key={key}><div className="designer-color-label"><span>{labelText}</span><ExcelColorPicker language={props.language} label={`${word('دکمه', 'Button', '按钮')} ${labelText}`} value={String(value(key, fallback))} mixed={mixed(key)} onPreview={next => props.onActionColorPreview(key, next)} onCommit={next => props.onActionColorCommit(key, next)} /></div><button type="button" className="designer-inherit-button" disabled={valuesFor(key).every(v => v === undefined)} onClick={() => props.onActionColorCommit(key, undefined)}>{word('پیش‌فرض', 'Default', '默认')}</button></div>
  }
  const appearanceControl = (key: DesignerAppearanceProperty) => {
    const labelText = appearanceLabels[key][props.language === 'fa' ? 0 : props.language === 'zh' ? 2 : 1]
    const current = props.draft.appearance?.[key] ?? appearanceDefaults[key]
    return <div className="designer-color-control" key={key}><div className="designer-color-label"><span>{labelText}</span><ExcelColorPicker language={props.language} label={labelText} value={current} onPreview={next => props.onAppearanceColorPreview(key, next)} onCommit={next => props.onAppearanceColorCommit(key, next)} /></div><button type="button" className="designer-inherit-button" disabled={!props.draft.appearance?.[key]} onClick={() => props.onAppearanceColorCommit(key, undefined)}>{word('پیش‌فرض', 'Default', '默认')}</button></div>
  }
  const label = (key: DesignerProperty) => propertyLabels[key][props.language === 'fa' ? 0 : props.language === 'zh' ? 2 : 1]
  const fieldNames = editingAction ? props.actions.filter(a => props.selectedActionIds.includes(a.id)).map(a => a.label[props.language]).join('، ') : props.applyToAll ? word('همهٔ فیلدها', 'All fields', '全部字段') : selectedNames.length ? selectedNames.join('، ') : word('همه فیلدها و برچسب‌ها', 'All inputs and labels', '全部输入和标签')
  const supportsAppearance = editingAction || (fieldIds.length > 0 && fieldIds.every(id => !id.endsWith('::label')))
  const effectValues = (editingAction ? props.selectedActionIds : fieldIds).map(id => designerElementAppearanceValues(editingAction ? props.draft.actions?.[id] ?? {} : designerEffectiveValues(props.draft, id.split('::')[0], 'input')))
  const effectValue = (key: DesignerProperty, fallback: DesignerValue) => effectValues[0]?.[key] ?? fallback
  const effectMixed = (key: DesignerProperty, fallback: DesignerValue) => new Set(effectValues.map(values => JSON.stringify(values[key] ?? fallback))).size > 1
  const effectNumber = (key: DesignerProperty, min: number, max: number, fallback: number) => <div className="designer-control-row" key={key}><label htmlFor={`designer-effect-${key}`}>{label(key)}</label><input id={`designer-effect-${key}`} type="number" min={min} max={max} step="1" value={effectMixed(key, fallback) ? '' : Number(effectValue(key, fallback))} placeholder={effectMixed(key, fallback) ? word('متفاوت', 'Mixed', '不同') : ''} onChange={event => edit(key, Number(event.target.value))} onBlur={props.onFinishPropertyChange} />{clear(key)}</div>
  const effectColor = (key: 'gradientStartColor' | 'gradientEndColor') => {
    const fallback = key === 'gradientStartColor' ? String(effectValue('backgroundColor', editingAction && props.actions.find(action => action.id === props.selectedActionIds[0])?.primary ? '#217c73' : '#f8faf8')) : '#ffffff'
    return <div className="designer-color-control" key={key} data-designer-color-property={key}><div className="designer-color-label"><span>{label(key)}</span><ExcelColorPicker language={props.language} label={label(key)} value={String(effectValue(key, fallback))} mixed={effectMixed(key, fallback)} onPreview={next => props.onElementAppearancePreview(key, next)} onCommit={next => props.onElementAppearanceCommit(key, next)} /></div><button type="button" className="designer-inherit-button" disabled={valuesFor(key).every(v => v === undefined)} onClick={() => props.onElementAppearanceCommit(key, undefined)}>{word('پیش‌فرض', 'Default', '默认')}</button></div>
  }
  return <div className="laboratory-designer-pane">
    <div className="designer-resize-handle" role="separator" aria-orientation="vertical" aria-label={word('تغییر عرض پنل', 'Resize settings panel', '调整设置面板宽度')} onPointerDown={event => {
      const workspace = event.currentTarget.closest<HTMLElement>('.laboratory-workspace')
      const pane = event.currentTarget.parentElement
      if (!workspace || !pane) return
      event.preventDefault()
      const handle = event.currentTarget
      const startX = event.clientX, startWidth = pane.getBoundingClientRect().width
      handle.setPointerCapture(event.pointerId)
      const move = (next: PointerEvent) => {
        const maximum = Math.min(560, workspace.clientWidth * 0.45)
        const width = Math.max(Math.min(280, maximum), Math.min(maximum, startWidth + (fa ? startX - next.clientX : next.clientX - startX)))
        workspace.style.setProperty('--designer-panel-width', width + 'px')
      }
      const end = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', end)
        handle.removeEventListener('pointercancel', end)
        handle.removeEventListener('lostpointercapture', end)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', end)
      handle.addEventListener('pointercancel', end)
      handle.addEventListener('lostpointercapture', end)
    }} />
  <aside ref={panelRef} id="form-laboratory-designer" className="laboratory-designer-panel" aria-label={word('طراحی ظاهری فرم', 'Visual form designer', '表单外观设计器')} dir={fa ? 'rtl' : 'ltr'}>

    <div className="designer-panel-heading"><div><strong>{word('طراحی ظاهری', 'Visual design', '外观设计')}</strong><small aria-live="polite">{fieldNames}</small></div><button type="button" className="designer-close" aria-label={word('بستن پنل', 'Close panel', '关闭面板')} onClick={props.onCancel}>×</button></div>
    <div className="designer-selection-actions"><button type="button" aria-pressed={!props.applyToAll} onClick={() => props.onApplyToAllChange(false)}>{word('فیلدهای انتخابی', 'Selected fields', '所选字段')}</button><button type="button" aria-pressed={props.applyToAll} onClick={() => { props.onClearSelection(); props.onApplyToAllChange(true) }}>{word('همهٔ فیلدها', 'All fields', '全部字段')}</button><button type="button" onClick={props.onSelectAll}>{word('انتخاب همه', 'Select all', '全选')}</button><button type="button" onClick={props.onClearSelection}>{word('پاک‌کردن انتخاب', 'Clear selection', '清除选择')}</button></div>
    <small className="designer-selection-help">{props.applyToAll ? word('هر ویژگی روی تمام فیلدهای نمونه اعمال می‌شود.', 'Each property applies to every sample field.', '每个属性都应用于所有示例字段。') : word('با Ctrl/Meta+کلیک چند فیلد را انتخاب کنید؛ ویژگی‌ها روی همهٔ انتخاب‌ها اعمال می‌شوند.', 'Ctrl/Meta-click to select multiple fields; changes apply to every selected field.', '按 Ctrl/Meta 并单击可多选；更改将应用于所有选中字段。')}</small>
    <details className="designer-component-library" open>
      <summary>{word('کتابخانه کامپوننت‌ها', 'Component library', '组件库')}</summary>
      <div className="designer-component-library-content">
        <label className="designer-component-search"><span>{word('جست‌وجوی نام یا شناسه', 'Search name or ID', '搜索名称或 ID')}</span><input type="search" dir="auto" value={componentLibraryQuery} onChange={event => setComponentLibraryQuery(event.target.value)} placeholder={word('نام یا شناسه کامپوننت', 'Component name or ID', '组件名称或 ID')} /></label>
        <p className="designer-component-library-notice">{import.meta.env.DEV ? word('تلفن فقط به فرم آزمایشی مستقل افزوده می‌شود؛ سایر Adapterها آماده نیستند.', 'Phone can be added only to the independent sandbox; other adapters are not ready.', '电话仅可添加到独立试验表单；其他适配器尚未就绪。') : word('افزودن واقعی کامپوننت‌ها در مرحلهٔ بعد فعال می‌شود.', 'Adding components will be enabled in a later phase.', '组件的实际添加将在后续阶段启用。')}</p>
        {import.meta.env.DEV && <button type="button" onClick={() => setSandboxRequest({})}>{word('مدیریت فرم‌ها', 'Form management', '表单管理')}</button>}
        {libraryGroups.length ? libraryGroups.map(group => <section className="designer-component-category" key={group.category} aria-label={categoryTitle(group.category)}>
          <h4>{categoryTitle(group.category)}</h4>
          <div className="designer-component-items">
            {group.components.map(({ component, presets }) => <div className="designer-component-entry" key={component.id}>
              <button type="button" className="designer-component-item" aria-pressed={selectedLibraryItem?.kind === 'component' && selectedLibraryItem.id === component.id} onClick={() => setSelectedLibraryItem({ kind: 'component', id: component.id })}>
                <span>{component.title[props.language]}</span><code dir="ltr">{component.id}</code>
                {component.adapterRequired && <small>{word('نیازمند Adapter', 'Adapter required', '需要适配器')}</small>}
              </button>
              {presets.map(preset => <button type="button" className="designer-component-preset" key={preset.id} aria-pressed={selectedLibraryItem?.kind === 'preset' && selectedLibraryItem.id === preset.id} onClick={() => setSelectedLibraryItem({ kind: 'preset', id: preset.id })}>
                <span>{preset.title[props.language]}</span><code dir="ltr">{preset.id}</code>
              </button>)}
            </div>)}
          </div>
        </section>) : <small>{word('موردی با این جست‌وجو پیدا نشد.', 'No matching components found.', '未找到匹配的组件。')}</small>}
        {selectedComponent && <section className="designer-component-details" aria-live="polite">
          <strong>{selectedPreset?.title[props.language] ?? selectedComponent.title[props.language]}</strong>
          <code dir="ltr">{selectedPreset?.id ?? selectedComponent.id}</code>
          <dl>
            <dt>{word('کامپوننت', 'Component', '组件')}</dt><dd>{selectedComponent.title[props.language]} · <code dir="ltr">{selectedComponent.exportName}</code></dd>
            <dt>{word('دسته', 'Category', '类别')}</dt><dd>{categoryTitle(selectedComponent.category)}</dd>
            <dt>{word('سیاست برچسب', 'Label policy', '标签策略')}</dt><dd>{labelPolicyTitle(selectedPreset?.labelPolicy ?? selectedComponent.labelPolicy)}</dd>
            <dt>{word('نوع فرم', 'Form types', '表单类型')}</dt><dd dir="ltr">{(selectedPreset?.allowedFormTypes ?? selectedComponent.allowedFormTypes).join(', ')}</dd>
            <dt>{word('Adapter', 'Adapter', '适配器')}</dt><dd>{selectedComponent.adapterRequired ? word('لازم است', 'Required', '必需') : word('لازم نیست', 'Not required', '不需要')}</dd>
          </dl>
          {import.meta.env.DEV && <button type="button" disabled={!selectedPreset || !supportsSandboxPreset(selectedPreset)} onClick={() => {
            if (selectedPreset && supportsSandboxPreset(selectedPreset)) setSandboxRequest({ presetId: selectedPreset.id })
          }}>{selectedPreset && supportsSandboxPreset(selectedPreset) ? word('افزودن تلفن به فرم آزمایشی', 'Add Phone to sandbox form', '向试验表单添加电话') : word('Adapter آماده نیست', 'Adapter not ready', '适配器尚未就绪')}</button>}
        </section>}
      </div>
    </details>
    <label className="designer-button-press-setting"><input type="checkbox" checked={props.buttonPressEffectEnabled} onChange={event => props.onButtonPressEffectChange(event.target.checked)} /><span>{word('جلوهٔ فرورفتن دکمه هنگام فشار', 'Pressed button effect', '按下按钮时显示凹陷效果')}</span></label>
    <details className="designer-action-section" open><summary>{word('دکمه‌های پایین', 'Bottom actions', '底部按钮')}</summary><div className="designer-action-list">{props.actions.map(action => <div className="designer-action-row" key={action.id}><input type="checkbox" aria-label={`${word('نمایش دکمه', 'Show action', '显示按钮')} ${designerActionLabel(props.draft, action, props.language)}`} checked={designerActionVisible(props.draft, action)} disabled={action.required} onChange={event => props.onActionVisibilityChange(action.id, event.target.checked)} /><button type="button" aria-pressed={props.selectedActionIds.includes(action.id)} onClick={() => props.onSelectAction(action.id)}>{designerActionLabel(props.draft, action, props.language)}</button><kbd>{designerActionCode(props.draft, action)}</kbd>{action.required && <small>{word('ضروری', 'Required', '必需')}</small>}</div>)}</div>
      {props.selectedActionIds.length === 1 && (() => { const action = props.actions.find(item => item.id === props.selectedActionIds[0]); if (!action) return null; return <div className="designer-action-text-fields">
        <label>{word('میان‌بر', 'Shortcut', '快捷键')}<input dir="ltr" maxLength={32} value={designerActionCode(props.draft, action)} onChange={event => props.onActionTextChange(action.id, 'code', event.target.value)} /></label>
        {(['fa', 'en', 'zh'] as const).map(locale => <label key={locale}>{locale === 'fa' ? word('عنوان فارسی', 'Persian label', '波斯语标签') : locale === 'en' ? word('عنوان انگلیسی', 'English label', '英语标签') : word('عنوان چینی', 'Chinese label', '中文标签')}<input maxLength={160} value={designerActionLabel(props.draft, action, locale)} onChange={event => props.onActionTextChange(action.id, locale, event.target.value)} /></label>)}
        <small>{word('میان‌بر و عنوان هر زبان جداگانه ذخیره می‌شوند.', 'The shortcut and each language label are saved independently.', '快捷键和各语言标签分别保存。')}</small>
      </div> })()}
    </details>
    <section className="designer-layout-tools" hidden={editingAction || !props.geometryEditable} aria-label={word('چیدمان گروهی', 'Group layout', '组合布局')}>
      {selectedGroupCount > 1 && <>
        <label className="designer-layout-gap">{word('فیلد مرجع', 'Reference field', '参考字段')}<select aria-label={word('فیلد مرجع', 'Reference field', '参考字段')} value={props.referenceFieldId} onChange={event => props.onReferenceChange(event.target.value)}>{[...new Set(props.selectedFieldIds.filter(id => !id.endsWith('::label')).map(id => id.split('::')[0]))].map(id => <option key={id} value={id}>{props.fieldLabels[id]}</option>)}</select></label>
        <div className="designer-layout-operations">{([
          ['top', 'تراز بالا', 'Align Top'], ['bottom', 'تراز پایین', 'Align Bottom'], ['left', 'تراز چپ', 'Align Left'], ['right', 'تراز راست', 'Align Right'], ['horizontalCenter', 'تراز مرکز افقی', 'Align Horizontal Centers'], ['verticalCenter', 'تراز مرکز عمودی', 'Align Vertical Centers']
        ] as const).map(([direction, persian, english]) => <button type="button" key={direction} title={fa ? `${persian} نسبت به فیلد مرجع؛ مرجع ثابت می‌ماند` : english} onClick={() => props.onAlign(direction)}>{fa ? persian : english}</button>)}</div>
      </>}
      {props.layoutStatus && <small role="alert">{props.layoutStatus}</small>}
      <div className="designer-layout-orientation"><button type="button" aria-pressed={orientation === 'horizontal'} onClick={() => setOrientation('horizontal')}>{word('افقی', 'Horizontal', '水平')}</button><button type="button" aria-pressed={orientation === 'vertical'} onClick={() => setOrientation('vertical')}>{word('عمودی', 'Vertical', '垂直')}</button></div>
      <label className="designer-layout-gap">{orientation === 'horizontal' ? word('فاصلهٔ افقی', 'Horizontal gap', '水平间距') : word('فاصلهٔ عمودی', 'Vertical gap', '垂直间距')}<input aria-label={orientation === 'horizontal' ? word('فاصلهٔ افقی', 'Horizontal gap', '水平间距') : word('فاصلهٔ عمودی', 'Vertical gap', '垂直间距')} type="number" min="0" max="300" step="1" value={gap} onChange={event => setGap(Math.max(0, Math.min(300, Number(event.target.value) || 0)))} /></label>
      <div className="designer-layout-operations"><button type="button" disabled={selectedGroupCount < 2} onClick={() => props.onLayout('arrange', orientation, gap)}>{word('چیدمان', 'Arrange', '排列')}</button><button type="button" disabled={selectedGroupCount < 2} onClick={() => props.onLayout('align', orientation, gap)}>{word('تراز', 'Align', '对齐')}</button><button type="button" disabled={selectedGroupCount < 2} onClick={() => props.onLayout('equalWidth', orientation, gap)}>{word('عرض برابر', 'Equal width', '等宽')}</button><button type="button" disabled={selectedGroupCount < 2} onClick={() => props.onLayout('equalHeight', orientation, gap)}>{word('ارتفاع برابر', 'Equal height', '等高')}</button><button type="button" disabled={selectedGroupCount < 2} onClick={() => props.onLayout('equalSize', orientation, gap)}>{word('اندازه برابر', 'Equal size', '等尺寸')}</button><button type="button" disabled={selectedGroupCount < 2} onClick={() => props.onLayout('equalSpacing', orientation, gap)}>{word('فاصله برابر', 'Equal spacing', '等间距')}</button></div>
      <small>{word('اندازهٔ ورودی‌ها یکسان می‌شود؛ اندازهٔ برچسب‌ها مستقل می‌ماند.', 'Input sizes are matched; label sizes remain independent.', '输入尺寸将统一；标签尺寸保持独立。')}</small>
    </section>
    {!props.geometryEditable && <small>{word('برای تغییر اندازه و چیدمان به نمای دسکتاپ برگردید.', 'Return to Desktop to edit sizes and layout.', '返回桌面视图以编辑尺寸和布局。')}</small>}
    <fieldset className="designer-properties" disabled={!editingEnabled}>
      <legend>{editingAction ? word('ویژگی‌های دکمه', 'Button properties', '按钮属性') : word('ویژگی‌های فیلد', 'Field properties', '字段属性')}</legend>
      {editingAction && <label className="designer-action-text-part">{word('قلم و حالت برای', 'Typography for', '文字样式应用于')}<select value={actionTextPart} onChange={event => setActionTextPart(event.target.value as typeof actionTextPart)}><option value="button">{word('کل دکمه', 'Whole button', '整个按钮')}</option><option value="code">{word('میان‌بر', 'Shortcut', '快捷键')}</option><option value="fa">{word('عنوان فارسی', 'Persian label', '波斯语标签')}</option><option value="en">{word('عنوان انگلیسی', 'English label', '英语标签')}</option><option value="zh">{word('عنوان چینی', 'Chinese label', '中文标签')}</option></select></label>}
      <div className="designer-typography-grid">
        {props.selectedFieldIds.length > 1 && designerProperties.some(key => mixed(key)) && <small className="designer-mixed-values" role="status">{word('بعضی ویژگی‌ها در انتخاب‌ها مقدارهای متفاوت دارند؛ برای تغییرشان یک مقدار تازه انتخاب کنید.', 'Some selected properties have mixed values; choose a value to apply it to all compatible selections.', '部分所选属性的值不同；选择新值后将应用于所有兼容项。')}</small>}
        <div className="designer-control-row"><label htmlFor="designer-font-family">{label('fontFamily')}</label><select id="designer-font-family" value={mixed('fontFamily') ? '' : String(value('fontFamily', 'inherit'))} onChange={event => edit('fontFamily', event.target.value === 'inherit' ? undefined : event.target.value)}><option value="" hidden>{word('مقدارهای متفاوت', 'Mixed values', '值不同')}</option><option value="inherit">{word('ارث‌بری از فرم', 'Inherit', '继承')}</option><option value="vazirmatn">Vazirmatn</option><option value="tahoma">Tahoma</option><option value="segoe">Segoe UI</option><option value="arial">Arial</option><option value="naskh">Noto Naskh</option></select>{clear('fontFamily')}</div>
        <div className="designer-control-row"><label htmlFor="designer-font-size">{label('fontSize')}</label><input id="designer-font-size" type="number" min="8" max="40" step="1" value={mixed('fontSize') ? '' : Number(value('fontSize', 14))} placeholder={mixed('fontSize') ? word('متفاوت', 'Mixed', '不同') : ''} onChange={event => edit('fontSize', Number(event.target.value))} />{clear('fontSize')}</div>
        <div className="designer-control-row"><label htmlFor="designer-font-weight">{label('fontWeight')}</label><select id="designer-font-weight" value={mixed('fontWeight') ? '' : String(value('fontWeight', 400))} onChange={event => edit('fontWeight', Number(event.target.value))}><option value="" hidden>{word('مقدارهای متفاوت', 'Mixed values', '值不同')}</option><option value="300">300</option><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option></select>{clear('fontWeight')}</div>
        <div className="designer-control-row"><label htmlFor="designer-text-align">{label('textAlign')}</label><select id="designer-text-align" value={String(value('textAlign', 'start'))} onChange={event => edit('textAlign', event.target.value)}><option value="start">{word('ابتدا', 'Start', '起始')}</option><option value="center">{word('وسط', 'Center', '居中')}</option><option value="end">{word('انتها', 'End', '末尾')}</option><option value="left">{word('چپ', 'Left', '左')}</option><option value="right">{word('راست', 'Right', '右')}</option></select>{clear('textAlign')}</div>
        <div className="designer-control-row"><label htmlFor="designer-line-height">{label('lineHeight')}</label><input id="designer-line-height" type="number" min="0.8" max="3" step="0.1" value={Number(value('lineHeight', 1.4))} onChange={event => edit('lineHeight', Number(event.target.value))} />{clear('lineHeight')}</div>
        {(editingAction ? ['width', 'height', 'borderRadius'] as const : ['width', 'height', 'offsetX', 'offsetY'] as const).map(key => {
          const limits = editingAction && (key === 'width' || key === 'height') ? designerActionDimensionLimits[key] : undefined
          const selectedAction = props.actions.find(action => action.id === props.selectedActionIds[0])
          const fallback = key === 'borderRadius' ? 7 : editingAction ? key === 'height' ? 60 : selectedAction?.iconOnly ? 54 : selectedAction?.primary ? 150 : 122 : 0
          return <div className="designer-control-row" key={key}><label htmlFor={`designer-${key}`}>{label(key)}{mixed(key) && <small className="designer-mixed-value">{word('متفاوت', 'Mixed', '不同')}</small>}</label><input id={`designer-${key}`} type="number" disabled={!props.geometryEditable && key !== 'borderRadius'} min={limits?.min ?? (key === 'borderRadius' ? 0 : key === 'offsetX' || key === 'offsetY' ? -10000 : 16)} max={limits?.max ?? (key === 'borderRadius' ? 100 : key === 'width' ? 1200 : key === 'height' ? 600 : 10000)} value={mixed(key) ? '' : Number(value(key, fallback))} placeholder={mixed(key) ? word('متفاوت', 'Mixed', '不同') : ''} onChange={event => edit(key, Number(event.target.value))} />{clear(key)}</div>
        })}
        <div className="designer-control-row designer-check"><input id="designer-bold" type="checkbox" checked={Boolean(value('bold', Number(value('fontWeight', 400)) >= 600))} onChange={event => edit('bold', event.target.checked)} /><label htmlFor="designer-bold">{label('bold')}</label>{clear('bold')}</div>
        <div className="designer-control-row designer-check"><input id="designer-italic" type="checkbox" checked={Boolean(value('italic', false))} onChange={event => edit('italic', event.target.checked)} /><label htmlFor="designer-italic">{label('italic')}</label>{clear('italic')}</div>
      </div>
    </fieldset>
    {supportsAppearance && <details className="designer-element-appearance"><summary>{word('سبک و جلوه ظاهری', 'Style and appearance', '样式与外观')}</summary><div className="designer-color-groups">
      <div className="designer-control-row"><label htmlFor="designer-appearance-preset">{label('appearancePreset')}</label><select id="designer-appearance-preset" value={effectMixed('appearancePreset', 'inherit') ? '' : String(effectValue('appearancePreset', 'inherit'))} onChange={event => props.onElementAppearanceCommit('appearancePreset', event.target.value === 'inherit' ? undefined : event.target.value)}><option value="" hidden>{word('متفاوت', 'Mixed', '不同')}</option><option value="inherit">{word('پیش‌فرض', 'Default', '默认')}</option>{[['flat', 'تخت', 'Flat'], ['raised', 'برجسته / سه‌بعدی', 'Raised / 3D'], ['inset', 'فرورفته', 'Inset / Sunken'], ['outlined', 'فقط کادر', 'Outlined'], ['softShadow', 'سایهٔ ملایم', 'Soft Shadow'], ['strongShadow', 'سایهٔ قوی', 'Strong Shadow'], ['gradient', 'گرادیان', 'Gradient'], ['pill', 'گرد / کپسولی', 'Rounded / Pill']].map(([id, persian, english]) => <option key={id} value={id}>{fa ? persian : english}</option>)}</select></div>
      <details className="designer-color-group"><summary>{word('تنظیم کادر', 'Border settings', '边框设置')}</summary>{effectNumber('borderWidth', 0, 12, 1)}<div className="designer-control-row"><label htmlFor="designer-borderStyle">{label('borderStyle')}</label><select id="designer-borderStyle" value={effectMixed('borderStyle', 'solid') ? '' : String(effectValue('borderStyle', 'solid'))} onChange={event => props.onElementAppearanceCommit('borderStyle', event.target.value)}><option value="" hidden>{word('متفاوت', 'Mixed', '不同')}</option>{[['solid', 'پیوسته'], ['dashed', 'خط‌چین'], ['dotted', 'نقطه‌چین'], ['double', 'دوتایی'], ['none', 'بدون کادر']].map(([id, text]) => <option key={id} value={id}>{fa ? text : id}</option>)}</select>{clear('borderStyle')}</div>{effectNumber('borderRadius', 0, 100, editingAction ? 7 : 6)}</details>
      <details className="designer-color-group"><summary>{word('تنظیم سایه', 'Shadow settings', '阴影设置')}</summary>{effectNumber('shadowOpacity', 0, 100, 0)}{effectNumber('shadowOffsetX', -40, 40, 0)}{effectNumber('shadowOffsetY', -40, 40, 2)}{effectNumber('shadowBlur', 0, 80, 6)}{effectNumber('shadowSpread', -20, 40, 0)}<label className="designer-effect-check"><input id="designer-shadowInset" type="checkbox" checked={Boolean(effectValue('shadowInset', false))} onChange={event => props.onElementAppearanceCommit('shadowInset', event.target.checked)} />{label('shadowInset')}</label></details>
      <details className="designer-color-group"><summary>{word('تنظیم گرادیان', 'Gradient settings', '渐变设置')}</summary><label className="designer-effect-check"><input id="designer-gradientEnabled" type="checkbox" checked={Boolean(effectValue('gradientEnabled', false))} onChange={event => props.onElementAppearanceCommit('gradientEnabled', event.target.checked)} />{label('gradientEnabled')}</label>{effectColor('gradientStartColor')}{effectColor('gradientEndColor')}{effectNumber('gradientAngle', 0, 360, 135)}</details>
      <details className="designer-color-group"><summary>{word('تنظیمات بیشتر ظاهری', 'More appearance settings', '更多外观设置')}</summary>{effectNumber('paddingX', 0, 40, 8)}{effectNumber('paddingY', 0, 40, editingAction ? 5 : 6)}<small>{word('قلم و رنگ‌های متن، زمینه و کادر از کنترل‌های مشترک همین پنل تنظیم می‌شوند.', 'Font and text, background and border colors use the shared panel controls.', '字体及文字、背景和边框颜色使用本面板的共享控件。')}</small></details>
    </div></details>}
    {!editingAction && componentFieldIds.length > 0 && <>
      <details className="designer-color-section" open><summary>{word('کلید + متصل به کامپوننت', 'Attached add button', '组件添加按钮')}</summary>
        {(['componentAddWidth', 'componentAddHeight'] as const).map(key => <div className="designer-control-row" key={key}><label>{label(key)}</label><input type="number" min="20" max="120" value={mixed(key) ? '' : Number(value(key, key === 'componentAddWidth' ? 25 : 27))} onChange={event => edit(key, Number(event.target.value))} />{clear(key)}</div>)}
        {(['componentAddBackground', 'componentAddTextColor'] as const).map(key => <div className="designer-control-row" key={key}><span>{label(key)}</span><ExcelColorPicker language={props.language} label={label(key)} mixed={mixed(key)} value={String(value(key, key === 'componentAddBackground' ? '#d8d8d8' : '#102a2a'))} onCommit={next => edit(key, next ?? undefined)} />{clear(key)}</div>)}
      </details>
      <details className="designer-color-section" open><summary>{word('پنجرهٔ زیر کامپوننت', 'Component popup', '组件弹窗')}</summary>
        <div className="designer-control-row"><span>{label('componentPopupBackground')}</span><ExcelColorPicker language={props.language} label={label('componentPopupBackground')} mixed={mixed('componentPopupBackground')} value={String(value('componentPopupBackground', '#ffffff'))} onCommit={next => edit('componentPopupBackground', next ?? undefined)} />{clear('componentPopupBackground')}</div>
        <div className="designer-control-row"><label>{label('componentPopupFontSize')}</label><input type="number" min="8" max="40" value={mixed('componentPopupFontSize') ? '' : Number(value('componentPopupFontSize', 15))} onChange={event => edit('componentPopupFontSize', Number(event.target.value))} />{clear('componentPopupFontSize')}</div>
      </details>
    </>}
    <details className="designer-color-section"><summary>{word('رنگ و ظاهر', 'Color and appearance', '颜色与外观')}</summary><div className="designer-color-groups">
      <details className="designer-color-group" open><summary>{word('جست‌وجو و فیلتر جدول', 'Grid search and filters', '表格搜索与筛选')}</summary><label className="designer-control-row" htmlFor="designer-filter-popup-font-size"><span>{word('اندازهٔ قلم پنجرهٔ فیلتر', 'Filter popup font size', '筛选弹窗字号')}</span><input id="designer-filter-popup-font-size" type="range" min="12" max="24" step="1" value={props.filterPopupFontSize} onPointerDown={props.onBeginFilterPopupFontSizeChange} onPointerUp={props.onCommitFilterPopupFontSizeChange} onKeyDown={props.onBeginFilterPopupFontSizeChange} onKeyUp={props.onCommitFilterPopupFontSizeChange} onBlur={props.onCommitFilterPopupFontSizeChange} onChange={event => props.onFilterPopupFontSizeChange(Number(event.target.value))} /><output>{props.filterPopupFontSize}px</output></label><label className="designer-control-row" htmlFor="designer-grid-search-position"><span>{word('جایگاه کادر جست‌وجو', 'Search box position', '搜索框位置')}</span><select id="designer-grid-search-position" value={props.gridSearchPosition} onChange={event => props.onGridSearchPositionChange(event.target.value as GridSearchPosition)}><option value="right">{word('راست', 'Right', '右')}</option><option value="center">{word('وسط', 'Center', '中')}</option><option value="left">{word('چپ', 'Left', '左')}</option></select></label></details>
      {!editingAction && <><details className="designer-color-group" open><summary>{word('رنگ ورودی‌ها', 'Input colors', '输入颜色')} · {scopeText('backgroundColor')}</summary>{colorKeys.filter(key => key !== 'labelColor').map(colorControl)}</details><details className="designer-color-group" open><summary>{word('رنگ برچسب‌ها', 'Label colors', '标签颜色')} · {scopeText('labelColor')}</summary>{colorControl('labelColor')}</details><details className="designer-color-group"><summary>{word('رنگ‌های حالت فوکوس', 'Focus-state colors', '焦点状态颜色')}</summary>{focusColorKeys.map(colorControl)}</details></>}
      {editingAction && <details className="designer-color-group designer-action-colors" open><summary>{word('رنگ دکمهٔ انتخاب‌شده', 'Selected action colors', '所选按钮颜色')} · {fieldNames}</summary>{(['backgroundColor', 'textColor', 'borderColor', 'hoverColor', 'hoverTextColor', 'hoverBorderColor', 'disabledColor', 'disabledTextColor', 'disabledBorderColor'] as DesignerProperty[]).map(actionColorControl)}</details>}
      {appearanceGroups.map(([id, faLabel, keys]) => <details className="designer-color-group" key={id}><summary>{fa ? faLabel : appearanceLabels[keys[0]][1]}</summary>{(editingAction && id === 'actions' ? keys.filter(key => key === 'actionBarBackground') : keys).map(appearanceControl)}</details>)}
      <small className="designer-color-note">{word('رنگ عمومی پیش‌فرض مشترک است؛ رنگ اختصاصی هر عنصر حفظ می‌شود. برای برگشت، «بازگشت به رنگ عمومی» را بزنید.', 'Global colors are shared defaults; individual overrides stay intact. Use Reset to global to inherit again.', '全局颜色是共享默认值；独立设置会保留。使用恢复全局再次继承。')}</small>
    </div></details>
    <div className="designer-history-actions"><button type="button" disabled={!props.canUndo} onClick={props.onUndo}>{word('واگرد', 'Undo', '撤销')}</button><button type="button" disabled={!props.canRedo} onClick={props.onRedo}>{word('ازنو', 'Redo', '重做')}</button><button type="button" disabled={!props.selectedFieldIds.length && !editingAction} onClick={props.onResetSelected}>{word('بازنشانی انتخابی', 'Reset selected', '重置所选')}</button><button type="button" onClick={props.onResetAll}>{word('بازنشانی همه', 'Reset all', '全部重置')}</button></div>
    <div className="designer-save-actions"><button type="button" disabled={!props.canSave} onClick={props.onSave}>{word('ذخیرهٔ پیش‌نویس', 'Save draft', '保存草稿')}</button><button type="button" onClick={props.onCancel}>{word('لغو تغییرات', 'Cancel', '取消')}</button></div>
    <div className="designer-save-status" role="status">{props.saveStatus || (props.canSave ? word('پیش‌نویس فقط برای کاربر جاری ذخیره می‌شود.', 'Draft is saved for the current user only.', '草稿仅保存给当前用户。') : word('ذخیرهٔ محلی به نشست کاربر نیاز دارد.', 'Sign in to save a local draft.', '登录后才能保存本地草稿。'))}</div><input type="color" hidden aria-hidden="true" tabIndex={-1} value="#000000" readOnly />
    <span className="designer-screen-reader" aria-live="polite">{word('فیلدهای انتخاب‌شده:', 'Selected fields:', '所选字段：')} {fieldNames}</span>
    <span className="designer-screen-reader">{designerProperties.length} {word('ویژگی قابل تنظیم', 'editable properties', '项可编辑属性')}</span>
  </aside>
  {import.meta.env.DEV && sandboxRequest && <FormBuilderSandbox language={props.language} initialPresetId={sandboxRequest.presetId} onClose={() => setSandboxRequest(null)} />}
  </div>
}
