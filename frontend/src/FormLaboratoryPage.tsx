import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Field, Shortcut } from './DefinitionControls'
import { FormValueList } from './components/base-form/FormValueList'
import { FormBuilderSandbox } from './components/base-form/FormBuilderSandbox'
import { useDesignerSession } from './components/base-form/useDesignerSession'
import type { PersonTitleOption } from './components/base-form/PersonTitleControl'
import { BaseFormGridBoundary, type GridColumn } from './components/base-form/BaseFormGridBoundary'
import { BaseFormShell } from './components/base-form/BaseFormShell'
import { handleLaboratorySearchKey } from './components/base-form/formLaboratoryKeyboard'
import { functionKeyFromEvent } from './components/base-form/functionKeys'
import { FormLaboratoryDesignerPanel, type DesignerPropertyRequest } from './components/base-form/FormLaboratoryDesignerPanel'
import { ExcelColorPicker } from './components/base-form/ExcelColorPicker'
import { laboratoryDatasetSizes, type SyntheticPerson } from './components/base-form/syntheticPersons'
import { apiRequest } from './api'
import { gridValueKey, type GridPage, type GridQuery } from './components/base-form/excelGrid'
import { alignCanvasFields, designerActionCode, designerActionLabel, designerActionTextStyle, designerAppearanceStyle, existingCanvasCollisions, fieldGroupRect, moveCanvasFields, resizeCanvasHandle, designerResizeHandles, type DesignerResizeHandle, translateCanvasField, validateCanvasArrangement, captureDesignerPointer, designerStyleForPart, layoutDesignerFields, loadDesignerDraft, resetDesignerFields, saveDesignerDraft, selectDesignerPart, selectedDesignerInputs, setDesignerActionText, setDesignerActionTextProperty, setDesignerAppearanceProperty, setDesignerButtonPressEffect, setDesignerFilterPopupFontSize, setDesignerGridSearchPosition, setDesignerTableColumnStyle, setDesignerTableHeaderStyle, setDesignerTableFont, setDesignerProperty, stopDesignerHandleClick, type DesignerActionTextPart, type DesignerAppearanceProperty, type DesignerDraft, type DesignerCanvas, type DesignerRect, type DesignerAlignment, type DesignerLayoutOperation, type DesignerLayoutOrientation, type DesignerProperty, type DesignerValue, type GridSearchPosition } from './components/base-form/designer'
import type { BaseFormDefinition } from './components/base-form/types'
import type { Language } from './i18n'
import { designerActionVisible, designerShortcutAction, setDesignerActionVisibility } from './components/base-form/designer'
import { contextDesignerSelection, designerActionDimensionLimits, designerActionStyle, designerEffectiveValues, designerElementAppearanceProperties, resizeDesignerEdge, setDesignerActionProperty, setDesignerColorProperty } from './components/base-form/designer'

const laboratoryDefinition: BaseFormDefinition = {
  id: 'form-laboratory.persons-synthetic',
  actions: [
    { id: 'new-person', code: 'Space', keys: [' '], label: { fa: 'شخص جدید', en: 'New person', zh: '新建人员' }, primary: true, required: true },
    { id: 'edit-person', code: 'Insert', keys: ['Insert'], label: { fa: 'ویرایش', en: 'Edit', zh: '编辑' }, required: true },
    { id: 'delete-person', code: 'Delete', keys: ['Delete'], label: { fa: 'حذف', en: 'Delete', zh: '删除' }, required: true },
    { id: 'first-record', code: 'Home', keys: ['Home'], label: { fa: 'اول', en: 'First', zh: '首条' } },
    { id: 'previous-page', code: 'PgUp', keys: ['PageUp'], label: { fa: 'صفحه قبل', en: 'Previous page', zh: '上一页' } },
    { id: 'browse-records', code: '↑ ↓', keys: ['ArrowUp', 'ArrowDown'], label: { fa: 'مرور', en: 'Browse', zh: '浏览' } },
    { id: 'next-page', code: 'PgDn', keys: ['PageDown'], label: { fa: 'صفحه بعد', en: 'Next page', zh: '下一页' } },
    { id: 'last-record', code: 'End', keys: ['End'], label: { fa: 'آخر', en: 'Last', zh: '末条' } },
    { id: 'action-settings', code: '⚙', label: { fa: 'تنظیمات', en: 'Settings', zh: '设置' }, iconOnly: true },
    { id: 'demo-save', code: 'F3', keys: ['F3'], label: { fa: 'ذخیره', en: 'Save', zh: '保存' }, primary: true, required: true },
    { id: 'reset-sample', code: 'Esc', keys: ['Escape'], label: { fa: 'خروج', en: 'Exit', zh: '退出' }, required: true }
  ],
  sections: [{ id: 'laboratory.editor', kind: 'editor' }, { id: 'laboratory.grid', kind: 'grid' }, { id: 'laboratory.footer', kind: 'footer' }],
  fields: [
    { id: 'personCode', sectionId: 'laboratory.editor', minTracks: 2, span: 2, required: true }, { id: 'titleId', sectionId: 'laboratory.editor', minTracks: 3, span: 3, required: true },
    { id: 'firstName', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'lastName', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'jobId', sectionId: 'laboratory.editor', minTracks: 5, span: 5 },
    { id: 'nationalityId', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'phone', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'mobile', sectionId: 'laboratory.editor', minTracks: 5, span: 5 },
    { id: 'address', sectionId: 'laboratory.editor', minTracks: 10, span: 10 }, { id: 'notes', sectionId: 'laboratory.editor', minTracks: 10, span: 10 },
    { id: 'errorExample', sectionId: 'laboratory.editor', minTracks: 10, span: 10 }, { id: 'disabledExample', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }
  ]
}

const columns: GridColumn<SyntheticPerson>[] = [
  { id: 'personCode', label: 'کد', width: 120, type: 'text', value: row => row.personCode }, { id: 'displayName', label: 'نام', width: 210, type: 'text', value: row => row.displayName },
  { id: 'job', label: 'نقش', width: 130, type: 'text', value: row => row.job }, { id: 'nationality', label: 'ملیت', width: 110, type: 'text', value: row => row.nationality },
  { id: 'mobile', label: 'موبایل', width: 145, type: 'text', value: row => row.mobile }, { id: 'address', label: 'نشانی', width: 240, type: 'text', value: row => row.address }
]

const labels: Record<string, Record<Language, string>> = {
  personCode: { fa: 'کد شخص', en: 'Person code', zh: '人员代码' }, titleId: { fa: 'عنوان', en: 'Title', zh: '称谓' }, firstName: { fa: 'نام', en: 'First name', zh: '名字' },
  lastName: { fa: 'نام خانوادگی', en: 'Last name', zh: '姓氏' }, jobId: { fa: 'نقش', en: 'Job', zh: '角色' }, nationalityId: { fa: 'ملیت', en: 'Nationality', zh: '国籍' },
  phone: { fa: 'تلفن', en: 'Phone', zh: '电话' }, mobile: { fa: 'موبایل', en: 'Mobile', zh: '手机' }, address: { fa: 'آدرس', en: 'Address', zh: '地址' },
  notes: { fa: 'توضیحات', en: 'Notes', zh: '说明' }, errorExample: { fa: 'نمونهٔ خطا', en: 'Error example', zh: '错误示例' }, disabledExample: { fa: 'نمونهٔ غیرفعال', en: 'Disabled example', zh: '禁用示例' }
}
const fieldIds = laboratoryDefinition.fields.map(field => field.id)
function loadLaboratoryDraft(userId?: string): DesignerDraft {
  let storage: Storage | undefined
  try { storage = window.localStorage } catch { /* Storage access itself can be blocked. */ }
  let stored = loadDesignerDraft(storage, userId, laboratoryDefinition.id, fieldIds)
  if (!userId || !storage) return stored
  // Restore the requested all-visible baseline once, then respect later checkbox choices.
  const visibilityKey = `yarn-trade:form-lab-action-visibility:v1:${encodeURIComponent(userId)}:${laboratoryDefinition.id}`
  try {
    if (storage.getItem(visibilityKey) !== 'restored') {
      const next = { ...stored, actions: { ...stored.actions } }
      for (const action of laboratoryDefinition.actions ?? []) next.actions[action.id] = { ...next.actions[action.id], visible: true }
      storage.setItem(`${visibilityKey}:previous-draft`, JSON.stringify(stored))
      if (saveDesignerDraft(storage, userId, laboratoryDefinition.id, next, fieldIds)) storage.setItem(visibilityKey, 'restored')
      stored = next
    }
  } catch { /* Preserve the session if storage is unavailable. */ }
  const key = `yarn-trade:form-lab-persons-appearance:v3:${encodeURIComponent(userId)}:${laboratoryDefinition.id}`
  try {
    if (storage.getItem(key) === 'persons') return stored
    // Apply the requested Persons footer and vertical spacing once. Keep labels,
    // visibility and horizontal geometry; retain the previous draft for recovery.
    const actions: NonNullable<DesignerDraft['actions']> = {}
    for (const [id, action] of Object.entries(stored.actions ?? {})) {
      const { visible, code, labels } = action
      const retained = { ...(visible !== undefined ? { visible } : {}), ...(code !== undefined ? { code } : {}), ...(labels ? { labels } : {}) }
      if (Object.keys(retained).length) actions[id] = retained
    }
    const { actions: _previousActions, appearance: previousAppearance, ...rest } = stored
    const appearance = { ...previousAppearance }
    for (const property of ['actionBarBackground', 'actionBackground', 'actionText', 'actionBorder', 'actionHoverBackground', 'actionDisabledBackground'] as const) delete appearance[property]
    const overrides = Object.fromEntries(Object.entries(rest.overrides).map(([id, values]) => {
      const { offsetY: _previousOffsetY, ...retained } = values
      return [id, retained]
    }))
    let canvas = rest.canvas
    if (canvas) {
      const labelHeight = 13 * 1.65
      const fieldHeight = labelHeight + 3 + 34
      const tops = [15, 15 + fieldHeight + 8 + (56 - 34)]
      tops.push(tops[1] + fieldHeight + 8, tops[1] + 2 * (fieldHeight + 8) + 4)
      const rowFor: Record<string, number> = { personCode: 0, titleId: 0, firstName: 0, lastName: 0, jobId: 0, nationalityId: 1, phone: 1, mobile: 1, disabledExample: 1, address: 2, notes: 2, errorExample: 3 }
      const fields = Object.fromEntries(Object.entries(canvas.fields).map(([id, field]) => {
        const top = id === 'titleId' ? 13 : tops[rowFor[id] ?? 0] + (id === 'address' ? 4 : 0)
        const input = { ...field.input, top: top + labelHeight + (id === 'notes' ? 5 : 3), height: id === 'titleId' || id === 'notes' ? 36 : 34 }
        return [id, { ...field, label: { ...field.label, top, height: labelHeight }, input,
          ...(field.error ? { error: { ...field.error, top: input.top + input.height + 3 } } : {}),
          ...(field.select ? { select: { ...field.select, top: Math.max(0, top - 23) } } : {}) }]
      }))
      canvas = { ...canvas, fields, height: Math.max(...Object.values(fields).map(field => field.error ? field.error.top + field.error.height : field.input.top + field.input.height)) + 16 }
    }
    const next = { ...rest, overrides, ...(canvas ? { canvas } : {}), ...(Object.keys(appearance).length ? { appearance } : {}), ...(Object.keys(actions).length ? { actions } : {}) }
    storage.setItem(`${key}:previous-draft`, JSON.stringify(stored))
    if (saveDesignerDraft(storage, userId, laboratoryDefinition.id, next, fieldIds)) storage.setItem(key, 'persons')
    return next
  } catch { return stored }
}
const previewWidths = { desktop: 1440, tablet: 768, mobile: 390 } as const
type PreviewDevice = keyof typeof previewWidths
type PreviewFramePreferences = { device: PreviewDevice, width: number, height: number | null, fitToPage: boolean }
const previewFrameStorageKey = (userId?: string) => `yarn-trade:form-lab-frame:v1:${encodeURIComponent(userId || 'local')}:${encodeURIComponent(laboratoryDefinition.id)}`
function loadPreviewFramePreferences(userId?: string): PreviewFramePreferences {
  const defaults: PreviewFramePreferences = { device: 'desktop', width: previewWidths.desktop, height: null, fitToPage: true }
  try {
    const raw = window.localStorage.getItem(previewFrameStorageKey(userId))
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Partial<PreviewFramePreferences>
    const device = stored.device === 'desktop' || stored.device === 'tablet' || stored.device === 'mobile' ? stored.device : defaults.device
    const width = typeof stored.width === 'number' && Number.isFinite(stored.width) ? Math.max(320, Math.min(2400, stored.width)) : defaults.width
    const height = stored.height === null ? null : typeof stored.height === 'number' && Number.isFinite(stored.height) ? Math.max(600, Math.min(1800, stored.height)) : defaults.height
    const fitToPage = typeof stored.fitToPage === 'boolean' ? stored.fitToPage : device === 'desktop' && width === previewWidths.desktop
    return { device, width, height, fitToPage }
  } catch { return defaults }
}
function savePreviewFramePreferences(userId: string | undefined, preferences: PreviewFramePreferences) {
  try { window.localStorage.setItem(previewFrameStorageKey(userId), JSON.stringify(preferences)) } catch { /* Keep the current session usable if local storage is unavailable. */ }
}
type PreviewResizeEdge = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
const defaultPersonDraft = { personCode: 'LAB-000001', titleId: 'mr', firstName: 'آرمان', lastName: 'رضایی', jobId: 'customer', nationalityId: 'iranian', phone: '0211000001', phoneDefault: '0211000001', phoneNumbers: ['0211000001'], mobile: '09121000001', mobileDefault: '09121000001', mobileNumbers: ['09121000001'], address: 'نشانی مصنوعی آزمایشگاه', addressDefault: 'نشانی مصنوعی آزمایشگاه', addresses: ['نشانی مصنوعی آزمایشگاه'], notes: '' }
const emptyPersonDraft = (titleId = 'company') => ({ ...defaultPersonDraft, titleId, personCode: '', firstName: '', lastName: '', phone: '', phoneDefault: '', phoneNumbers: [], mobile: '', mobileDefault: '', mobileNumbers: [], address: '', addressDefault: '', addresses: [], notes: '' })
const laboratoryTitleSettingsKey = 'form-laboratory-title-settings-v1'
const builtInLaboratoryTitles: PersonTitleOption[] = [
  { id: 'mr', nameFa: 'آقای', nameEn: 'Mr.', code: 'MR', personType: 'Individual' },
  { id: 'mrs', nameFa: 'خانم', nameEn: 'Mrs.', code: 'MRS', personType: 'Individual' },
  { id: 'company', nameFa: 'شرکت', nameEn: 'Company', nameZh: '公司', code: 'COMPANY', personType: 'Company' },
  { id: 'organization', nameFa: 'سازمان', nameEn: 'Organization', nameZh: '组织', code: 'ORGANIZATION', personType: 'Company' }
]
type LaboratoryTitleSettings = { options: PersonTitleOption[], defaultId: string, usedIds?: string[] }
function persistLaboratoryTitleSettings(settings: LaboratoryTitleSettings) {
  try { window.localStorage.setItem(laboratoryTitleSettingsKey, JSON.stringify(settings)) }
  catch { /* Keep the current session usable when browser storage is unavailable. */ }
}
function readLaboratoryTitleSettings(): LaboratoryTitleSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(laboratoryTitleSettingsKey) ?? 'null') as Partial<LaboratoryTitleSettings> | null
    const options = Array.isArray(saved?.options) ? saved.options.filter(option => option && typeof option.id === 'string' && typeof option.nameFa === 'string' && typeof option.nameEn === 'string') : []
    const merged = options.length ? options : [...builtInLaboratoryTitles]
    const defaultId = typeof saved?.defaultId === 'string' && merged.some(option => option.id === saved.defaultId) ? saved.defaultId : merged.find(option => option.id === 'company')?.id ?? merged[0].id
    return { options: merged, defaultId, usedIds: Array.isArray(saved?.usedIds) ? saved.usedIds.filter(id => typeof id === 'string') : [] }
  } catch {
    return { options: builtInLaboratoryTitles, defaultId: 'company' }
  }
}
const jobOptionIds = ['customer', 'seller', 'supplier', 'partner'] as const
const jobLabels: Record<(typeof jobOptionIds)[number], Record<Language, string>> = {
  customer: { fa: 'مشتری', en: 'Customer', zh: '客户' }, seller: { fa: 'فروشنده', en: 'Seller', zh: '销售方' },
  supplier: { fa: 'تأمین‌کننده', en: 'Supplier', zh: '供应商' }, partner: { fa: 'شریک', en: 'Partner', zh: '合作伙伴' }
}

export default function FormLaboratoryPage({ language, authenticatedUserId }: { language: Language, authenticatedUserId?: string }) {
  const fa = language === 'fa'
  const [datasetSize, setDatasetSize] = useState<(typeof laboratoryDatasetSizes)[number]>(100000)
  const [labTitleSettings, setLabTitleSettings] = useState<LaboratoryTitleSettings>(readLaboratoryTitleSettings)
  const labTitles = labTitleSettings.options
  const defaultTitleId = labTitleSettings.defaultId
  useEffect(() => {
    persistLaboratoryTitleSettings(labTitleSettings)
  }, [labTitleSettings])
  const titleName = (option: PersonTitleOption) => language === 'fa' ? option.nameFa : language === 'zh' ? option.nameZh ?? option.nameEn : option.nameEn
  const titleInUse = (id: string) => ['mr', 'company'].includes(id) || labTitleSettings.usedIds?.includes(id) === true
  const commitLaboratoryTitles = (primary: string, values: string[], origins: ReadonlyMap<string, string>) => {
    if (values.some(name => {
      const original = labTitles.find(option => titleName(option) === (origins.get(name) ?? name))
      return original && titleInUse(original.id) && titleName(original) !== name
    })) return false
    const options = values.map(name => {
      const original = labTitles.find(option => titleName(option) === (origins.get(name) ?? name))
      if (original && titleName(original) === name) return original
      return original ? { ...original, nameFa: name, nameEn: name, nameZh: name }
        : { id: `lab-title-${crypto.randomUUID()}`, nameFa: name, nameEn: name, nameZh: name, code: `CUSTOM_${crypto.randomUUID()}`, personType: 'Individual' as const }
    })
    const selected = options.find(option => titleName(option) === primary)
    if (!selected || labTitles.some(option => titleInUse(option.id) && !options.some(next => next.id === option.id))) return false
    const next = { ...labTitleSettings, options, defaultId: selected.id }
    persistLaboratoryTitleSettings(next)
    setLabTitleSettings(next)
    updateDraft(current => ({ ...current, titleId: selected.id }))
  }
  const [deletedCodes, setDeletedCodes] = useState<string[]>([])
  const [navigationRequest, setNavigationRequest] = useState<{ sequence: number, command: 'first' | 'last' | 'previous' | 'next' | 'up' | 'down' }>()
  const remoteGridQuery = useCallback((query: GridQuery, signal?: AbortSignal) => {
    const filters = { ...query.filters }
    if (deletedCodes.length) {
      const deletedKeys = deletedCodes.map(gridValueKey)
      const filter = filters.personCode
      filters.personCode = { ...filter, selectionMode: filter?.selectedValues && filter.selectionMode !== 'exclude' ? 'include' : 'exclude',
        selectedValues: filter?.selectedValues && filter.selectionMode !== 'exclude'
          ? filter.selectedValues.filter(code => !deletedKeys.includes(code))
          : [...new Set([...(filter?.selectedValues ?? []), ...deletedKeys])] }
    }
    return apiRequest<GridPage<SyntheticPerson>>('/api/form-laboratory/synthetic-grid', { method: 'POST', body: JSON.stringify({ ...query, filters, datasetSize }), signal })
  }, [datasetSize, deletedCodes])
  const [draft, updateDraft] = useState(defaultPersonDraft)
  const update = (key: keyof typeof draft, value: string) => updateDraft(current => ({ ...current, [key]: value }))
  const [dataEntryActive, setDataEntryActive] = useState(false)
  const dataEntryActiveRef = useRef(false)
  const [selectedPerson, setSelectedPerson] = useState<SyntheticPerson | null>(null)
  const [gridRecordCount, setGridRecordCount] = useState(0)
  const entryDraftBaseline = useRef<typeof defaultPersonDraft | null>(null)
  const runActionRef = useRef<(id: string) => void>(() => {})
  const { history, dispatchHistory, historyRef, setPreviewDraft: setColorPreviewDraft, visibleDraft, editingBaseline, save: saveSessionDraft, undo: undoHistory, redo: redoHistory } = useDesignerSession({
    formId: laboratoryDefinition.id, fieldIds, userId: authenticatedUserId,
    initialDraftLoader: ({ userId }) => loadLaboratoryDraft(userId)
  })
  const [designerOpen, setDesignerOpen] = useState(false)
  const [formsManagerOpen, setFormsManagerOpen] = useState(false)
  const designerOpenRef = useRef(designerOpen)
  designerOpenRef.current = designerOpen
  const [gridResetRequest, setGridResetRequest] = useState(0)
  const [initialPreviewFrame] = useState(() => loadPreviewFramePreferences(authenticatedUserId))
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>(initialPreviewFrame.device)
  const [previewWidth, setPreviewWidth] = useState<number>(initialPreviewFrame.width)
  const [previewFitToPage, setPreviewFitToPage] = useState(initialPreviewFrame.fitToPage)
  const [previewHeight, setPreviewHeight] = useState<number | null>(initialPreviewFrame.height)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const previewFrameOwner = useRef(authenticatedUserId)
  useEffect(() => {
    if (previewFrameOwner.current !== authenticatedUserId) {
      previewFrameOwner.current = authenticatedUserId
      const next = loadPreviewFramePreferences(authenticatedUserId)
      setPreviewDevice(next.device)
      setPreviewWidth(next.width)
      setPreviewFitToPage(next.fitToPage)
      setPreviewHeight(next.height)
      setPreviewOffset({ x: 0, y: 0 })
      return
    }
    savePreviewFramePreferences(authenticatedUserId, { device: previewDevice, width: previewWidth, height: previewHeight, fitToPage: previewFitToPage })
  }, [authenticatedUserId, previewDevice, previewWidth, previewHeight, previewFitToPage])
  const formFrameAreaRef = useRef<HTMLDivElement | null>(null)
  const formFrameRef = useRef<HTMLDivElement | null>(null)
  const formBannerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!previewFitToPage || previewDevice !== 'desktop') return
    const area = formFrameAreaRef.current
    if (!area) return
    const syncWidth = () => setPreviewWidth(Math.max(320, Math.min(2400, Math.round(area.clientWidth))))
    const observer = new ResizeObserver(syncWidth)
    observer.observe(area)
    syncWidth()
    return () => observer.disconnect()
  }, [previewFitToPage, previewDevice])
  const previewInteractionRef = useRef<'resize' | 'move' | null>(null)
  const geometryEditable = previewDevice === 'desktop'
  const previewResizeEdgeAt = (clientX: number, clientY: number): PreviewResizeEdge | null => {
    const rect = formFrameRef.current?.getBoundingClientRect()
    if (!rect) return null
    const hitArea = 12
    if (clientX < rect.left - hitArea || clientX > rect.right + hitArea || clientY < rect.top - hitArea || clientY > rect.bottom + hitArea) return null
    const left = Math.abs(clientX - rect.left) <= hitArea
    const right = Math.abs(clientX - rect.right) <= hitArea
    const top = Math.abs(clientY - rect.top) <= hitArea
    const bottom = Math.abs(clientY - rect.bottom) <= hitArea
    if (top && left) return 'top-left'
    if (top && right) return 'top-right'
    if (bottom && left) return 'bottom-left'
    if (bottom && right) return 'bottom-right'
    if (left) return 'left'
    if (right) return 'right'
    if (top) return 'top'
    if (bottom) return 'bottom'
    return null
  }
  const previewCanMoveFrom = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement) || !target.closest('.form-laboratory-banner')) return false
    return !target.closest('input,select,textarea,button,a,label,.laboratory-designer-field,.designer-label-part,.designer-input-part')
  }
  const previewCursorForEdge = (edge: PreviewResizeEdge) => {
    if (edge === 'top-left' || edge === 'bottom-right') return 'nwse-resize'
    if (edge === 'top-right' || edge === 'bottom-left') return 'nesw-resize'
    return edge === 'left' || edge === 'right' ? 'ew-resize' : 'ns-resize'
  }
  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroll = formFrameAreaRef.current
    if (!scroll) return
    if (previewInteractionRef.current === 'move') { scroll.style.cursor = 'grabbing'; return }
    if (previewInteractionRef.current === 'resize') return
    const edge = previewResizeEdgeAt(event.clientX, event.clientY)
    scroll.style.cursor = edge ? previewCursorForEdge(edge) : previewCanMoveFrom(event.target) ? 'grab' : ''
  }
  const beginPreviewPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const scroll = formFrameAreaRef.current
    const viewport = formFrameRef.current
    if (!scroll || !viewport) return
    const edge = previewResizeEdgeAt(event.clientX, event.clientY)
    const moving = !edge && previewCanMoveFrom(event.target)
    if (!edge && !moving) return
    event.preventDefault()
    event.stopPropagation()
    previewInteractionRef.current = edge ? 'resize' : 'move'
    scroll.style.cursor = edge ? previewCursorForEdge(edge) : 'grabbing'
    scroll.style.userSelect = 'none'
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    const rect = viewport.getBoundingClientRect()
    const startWidth = rect.width
    const startHeight = previewHeight ?? rect.height
    const startOffset = previewOffset
    const computedScroll = getComputedStyle(scroll)
    const contentWidth = scroll.clientWidth - (parseFloat(computedScroll.paddingInlineStart) || 0) - (parseFloat(computedScroll.paddingInlineEnd) || 0)
    const contentHeight = scroll.clientHeight - (parseFloat(computedScroll.paddingTop) || 0) - (parseFloat(computedScroll.paddingBottom) || 0)
    const baseLeft = Math.max(0, (contentWidth - startWidth) / 2)
    const baseTop = Math.max(0, (contentHeight - startHeight) / 2)
    const startLeft = baseLeft + startOffset.x
    const startTop = baseTop + startOffset.y
    const onMove = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const deltaX = next.clientX - startX
      const deltaY = next.clientY - startY
      if (moving) {
        const maxX = Math.max(0, (contentWidth - startWidth) / 2)
        const maxY = Math.max(0, (contentHeight - startHeight) / 2)
        setPreviewOffset({ x: Math.max(-maxX, Math.min(maxX, startOffset.x + deltaX)), y: Math.max(-maxY, Math.min(maxY, startOffset.y + deltaY)) })
        return
      }
      const resizeLeft = edge!.includes('left')
      const resizeRight = edge!.includes('right')
      const resizeTop = edge!.includes('top')
      const resizeBottom = edge!.includes('bottom')
      let nextWidth = startWidth
      let nextHeight = startHeight
      if (resizeLeft || resizeRight) nextWidth = Math.max(320, Math.min(2400, startWidth + (resizeRight ? deltaX : 0) - (resizeLeft ? deltaX : 0)))
      if (resizeTop || resizeBottom) nextHeight = Math.max(600, Math.min(1800, startHeight + (resizeBottom ? deltaY : 0) - (resizeTop ? deltaY : 0)))
      if (resizeLeft || resizeRight) {
        const targetLeft = startLeft + (resizeLeft ? startWidth - nextWidth : 0)
        setPreviewFitToPage(false)
        setPreviewWidth(nextWidth)
        setPreviewOffset(current => ({ ...current, x: targetLeft - Math.max(0, (contentWidth - nextWidth) / 2) }))
      }
      if (resizeTop || resizeBottom) {
        const targetTop = startTop + (resizeTop ? startHeight - nextHeight : 0)
        setPreviewHeight(nextHeight)
        setPreviewOffset(current => ({ ...current, y: targetTop - Math.max(0, (contentHeight - nextHeight) / 2) }))
      }
    }
    const onEnd = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      previewInteractionRef.current = null
      scroll.style.cursor = ''
      scroll.style.userSelect = ''
      if (edge) setPreviewOffset({ x: 0, y: 0 })
    }
    scroll.setPointerCapture(event.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }
  const handlePreviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 64 : 16
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const grows = fa ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
      setPreviewFitToPage(false)
      setPreviewWidth(current => Math.max(320, Math.min(2400, current + (grows ? step : -step))))
    } else {
      const grows = event.key === 'ArrowDown'
      setPreviewHeight(current => Math.max(600, Math.min(1800, (current ?? formFrameRef.current?.getBoundingClientRect().height ?? 650) + (grows ? step : -step))))
    }
    setPreviewOffset({ x: 0, y: 0 })
  }
  const [selection, setSelection] = useState<string[]>([])
  const [actionSelection, setActionSelection] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ left: number, top: number, part: 'input' | 'label' | 'action' | 'grid', gridTarget?: 'header' | 'row' | 'search', columnId?: string } | null>(null)
  const [gridSubmenu, setGridSubmenu] = useState<'header' | 'column' | null>(null)
  const [gridFormatDialog, setGridFormatDialog] = useState<null | { scope: 'header' | 'column'; mode: 'font' | 'color'; id: string; label: string; base: DesignerDraft; fontFamily: string; fontSize: number; bold: boolean; color: string; colorProperty: 'textColor' | 'backgroundColor' | 'borderColor' }>(null)
  const [selectedTableColumnId, setSelectedTableColumnId] = useState<string>()
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const contextSubmenuRef = useRef<HTMLDivElement>(null)
  const [propertyRequest, setPropertyRequest] = useState<DesignerPropertyRequest>()
  const [applyToAll, setApplyToAll] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const formGridRef = useRef<HTMLDivElement | null>(null)
  const gestureCleanup = useRef<(() => void) | null>(null)
  const [frozenCanvas, setFrozenCanvas] = useState<DesignerCanvas | null>(null)
  const [referenceId, setReferenceId] = useState('')
  const [layoutStatus, setLayoutStatus] = useState('')
  // Responsive views reflow the same fields without changing the saved desktop canvas.
  const canvas = geometryEditable ? history.present.canvas ?? (designerOpen ? frozenCanvas : null) : null
  const propertyCommitTimer = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!contextMenu || !designerOpen || !contextMenuRef.current) return
    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(contextMenu.left, window.innerWidth - rect.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(contextMenu.top, window.innerHeight - rect.height - 8))}px`
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [contextMenu, designerOpen])
  useEffect(() => {
    if (!contextMenu) return
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!contextMenuRef.current?.contains(target) && !contextSubmenuRef.current?.contains(target)) setContextMenu(null) }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setContextMenu(null) }
    }
    const resize = () => setContextMenu(null)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', resize)
    }
  }, [contextMenu])
  useLayoutEffect(() => {
    const focusGridSearch = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('[data-form-builder-sandbox]')) return
      const roots = [...document.querySelectorAll<HTMLElement>('[data-form-laboratory]')]
      const root = roots.find(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden')
      if (!root) return
      const target = event.target
      const isEditorInput = dataEntryActiveRef.current && target instanceof HTMLElement && Boolean(
        target.closest('.laboratory-form-grid') && target.matches('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"]')
      )
      handleLaboratorySearchKey(event, isEditorInput, () => {
        const search = root?.querySelector<HTMLInputElement>('.grid-search-control input[type="search"]:not(:disabled)')
        search?.focus({ preventScroll: true })
        if (search) search.setSelectionRange(0, search.value.length)
      })
    }
    const startWithSpace = (event: globalThis.KeyboardEvent) => {
      if (event.type !== 'keydown' || (event.key !== ' ' && event.key !== 'Spacebar' && event.code !== 'Space') || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) return
      const roots = [...document.querySelectorAll<HTMLElement>('[data-form-laboratory]')]
      const root = roots.find(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden')
      if (!root || designerOpenRef.current) return
      const target = event.target
      if (target !== document.body && target !== document.documentElement && (!(target instanceof Node) || !root.contains(target))) return
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!dataEntryActiveRef.current) runActionRef.current('new-person')
    }
    // Capture at window level so F1 is handled before browser/app keyboard handlers.
    // keyup is a fallback for keyboard drivers that consume the initial function-key keydown.
    window.addEventListener('keydown', focusGridSearch, true)
    window.addEventListener('keyup', focusGridSearch, true)
    window.addEventListener('keydown', startWithSpace, true)
    return () => {
      window.removeEventListener('keydown', focusGridSearch, true)
      window.removeEventListener('keyup', focusGridSearch, true)
      window.removeEventListener('keydown', startWithSpace, true)
    }
  }, [])
  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!designerOpen) return
    const target = event.target as HTMLElement
    if (target.closest('.laboratory-designer-pane, .excel-color-picker, [role="dialog"], [role="menu"]')) return
    event.preventDefault(); event.stopPropagation()
    const action = target.closest<HTMLElement>('[data-action-id]')?.dataset.actionId
    const part = target.closest('.designer-input-part') ? 'input' : target.closest('.designer-label-part') ? 'label' : null
    const field = part ? target.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId : undefined
    if (!action && !field) { setContextMenu(null); return }
    setApplyToAll(false)
    if (action) { setSelection([]); setActionSelection(current => contextDesignerSelection(current, action)) }
    else { setActionSelection([]); setSelection(current => contextDesignerSelection(current, `${field}::${part}`)) }
    setContextMenu({ left: event.clientX, top: event.clientY, part: action ? 'action' : part! })
  }
  const requestProperty = (section: DesignerPropertyRequest['section'], property?: DesignerPropertyRequest['property']) => {
    setContextMenu(null)
    setGridSubmenu(null)
    setPropertyRequest(current => ({ sequence: (current?.sequence ?? 0) + 1, section, property }))
  }
  useEffect(() => {
    setSaveStatus('')
  }, [authenticatedUserId])

  const selectField = (id: string, event: { ctrlKey: boolean, metaKey: boolean }, part: 'field' | 'label' | 'input' = 'field') => {
    setActionSelection([])
    setSelection(current => selectDesignerPart(current, id, part, event.ctrlKey || event.metaKey))
  }
  const mapDesignerPropertyTargets = (property: DesignerProperty, targets: string[], value: DesignerValue | undefined) => {
    if (property.startsWith('component')) return targets.filter(key => ['titleId', 'phone', 'mobile', 'address'].includes(key.split('::')[0])).map(key => `${key.split('::')[0]}::input`)
    const mapped = property === 'width' || property === 'height' || designerElementAppearanceProperties.includes(property as typeof designerElementAppearanceProperties[number])
      ? targets.map(key => `${key.split('::')[0]}::input`)
      : property === 'focusLabelColor'
        ? targets.map(key => `${key.split('::')[0]}::label`)
        : property === 'focusBackgroundColor' || property === 'focusTextColor' || property === 'focusBorderColor'
          ? targets.map(key => `${key.split('::')[0]}::input`)
          : targets
    if (value === undefined && (property === 'focusLabelColor' || property === 'focusBackgroundColor' || property === 'focusTextColor' || property === 'focusBorderColor')) return [...new Set([...mapped, ...targets.map(key => key.split('::')[0])])]
    return mapped
  }
  const updateProperty = (property: DesignerProperty, value: DesignerValue | undefined) => {
    const targets = applyToAll ? fieldIds : selection
    const propertyTargets = mapDesignerPropertyTargets(property, targets, value)
    if (propertyCommitTimer.current === null) dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: actionSelection.length ? setDesignerActionProperty(historyRef.current.present, actionSelection, property, value) : setDesignerProperty(historyRef.current.present, propertyTargets, property, value, fieldIds) })
    if (propertyCommitTimer.current !== null) window.clearTimeout(propertyCommitTimer.current)
    propertyCommitTimer.current = window.setTimeout(() => { dispatchHistory({ type: 'commitTransaction' }); propertyCommitTimer.current = null }, 250)
    setSaveStatus('')
  }
  const updateActionText = (id: string, part: DesignerActionTextPart, value: string) => {
    setColorPreviewDraft(null)
    if (propertyCommitTimer.current === null) dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: setDesignerActionText(historyRef.current.present, id, part, value) })
    if (propertyCommitTimer.current !== null) window.clearTimeout(propertyCommitTimer.current)
    propertyCommitTimer.current = window.setTimeout(() => { dispatchHistory({ type: 'commitTransaction' }); propertyCommitTimer.current = null }, 250)
    setSaveStatus('')
  }
  const changeActionVisibility = (id: string, visible: boolean) => {
    const action = laboratoryDefinition.actions?.find(item => item.id === id)
    if (!action) return
    finishPropertyChange()
    setColorPreviewDraft(null)
    dispatchHistory({ type: 'change', draft: setDesignerActionVisibility(historyRef.current.present, action, visible) })
    setSaveStatus('')
  }
  const updateActionTextProperty = (ids: string[], part: DesignerActionTextPart, property: DesignerProperty, value: DesignerValue | undefined) => {
    setColorPreviewDraft(null)
    if (propertyCommitTimer.current === null) dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: setDesignerActionTextProperty(historyRef.current.present, ids, part, property, value) })
    if (propertyCommitTimer.current !== null) window.clearTimeout(propertyCommitTimer.current)
    propertyCommitTimer.current = window.setTimeout(() => { dispatchHistory({ type: 'commitTransaction' }); propertyCommitTimer.current = null }, 250)
    setSaveStatus('')
  }
  const commitColorProperty = (property: DesignerProperty, value: DesignerValue | undefined, explicitTargets?: string[]) => {
    setColorPreviewDraft(null)
    if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null; dispatchHistory({ type: 'commitTransaction' }) }
    const targets = explicitTargets ?? selection
    dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: setDesignerColorProperty(historyRef.current.present, targets, property, value, fieldIds) })
    dispatchHistory({ type: 'commitTransaction' })
    setSaveStatus('')
  }
  const finishPropertyChange = () => {
    if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null }
    dispatchHistory({ type: 'commitTransaction' })
  }
  const commitElementAppearance = (property: DesignerProperty, value: DesignerValue | undefined) => {
    setColorPreviewDraft(null)
    finishPropertyChange()
    const targets = mapDesignerPropertyTargets(property, applyToAll ? fieldIds : selection, value)
    dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: actionSelection.length ? setDesignerActionProperty(historyRef.current.present, actionSelection, property, value) : setDesignerProperty(historyRef.current.present, targets, property, value, fieldIds) })
    dispatchHistory({ type: 'commitTransaction' })
    setSaveStatus('')
  }
  const commitAppearanceColor = (property: DesignerAppearanceProperty, value: string | undefined) => {
    setColorPreviewDraft(null)
    if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null; dispatchHistory({ type: 'commitTransaction' }) }
    dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: setDesignerAppearanceProperty(historyRef.current.present, property, value) })
    dispatchHistory({ type: 'commitTransaction' })
    setSaveStatus('')
  }
  const updateFilterPopupFontSize = (value: number) => { dispatchHistory({ type: 'change', draft: setDesignerFilterPopupFontSize(historyRef.current.present, value) }); setSaveStatus('') }
  const updateGridSearchPosition = (value: GridSearchPosition) => { dispatchHistory({ type: 'change', draft: setDesignerGridSearchPosition(historyRef.current.present, value) }); setSaveStatus('') }
  const updateTableFont = (property: 'family' | 'size', value: string | number) => { dispatchHistory({ type: 'change', draft: setDesignerTableFont(historyRef.current.present, property, value) }); setSaveStatus('') }
  const updateTableColumnStyle = (id: string, property: 'bold' | 'textColor' | 'backgroundColor' | 'fontFamily' | 'fontSize', value: string | number | boolean | undefined) => { dispatchHistory({ type: 'change', draft: setDesignerTableColumnStyle(historyRef.current.present, id, property, value) }); setSaveStatus('') }
  const updateTableHeaderStyle = (id: string, property: 'bold' | 'textColor' | 'backgroundColor' | 'borderColor' | 'fontFamily' | 'fontSize', value: string | number | boolean | undefined) => { dispatchHistory({ type: 'change', draft: setDesignerTableHeaderStyle(historyRef.current.present, id, property, value) }); setSaveStatus('') }
  const previewTableStyleColor = (target: 'column' | 'header', id: string, color: string | undefined | null, property: 'textColor' | 'backgroundColor' | 'borderColor' = 'textColor') => { const update = (draft: DesignerDraft) => target === 'column' ? setDesignerTableColumnStyle(draft, id, 'textColor', color ?? undefined) : setDesignerTableHeaderStyle(draft, id, property, color ?? undefined); setColorPreviewDraft(color == null ? null : update(historyRef.current.present)) }
  const commitTableStyleColor = (target: 'column' | 'header', id: string, color: string | undefined, property: 'textColor' | 'backgroundColor' | 'borderColor' = 'textColor') => { setColorPreviewDraft(null); dispatchHistory({ type: 'change', draft: target === 'column' ? setDesignerTableColumnStyle(historyRef.current.present, id, 'textColor', color) : setDesignerTableHeaderStyle(historyRef.current.present, id, property, color) }); setSaveStatus('') }
  const previewTableColumnBackgroundColor = (id: string, color: string | undefined | null) => setColorPreviewDraft(color == null ? null : setDesignerTableColumnStyle(historyRef.current.present, id, 'backgroundColor', color))
  const commitTableColumnBackgroundColor = (id: string, color: string | undefined) => { setColorPreviewDraft(null); dispatchHistory({ type: 'change', draft: setDesignerTableColumnStyle(historyRef.current.present, id, 'backgroundColor', color) }); setSaveStatus('') }
  const buildGridFormatDraft = (dialog: NonNullable<typeof gridFormatDialog>) => {
    let next = dialog.base
    if (dialog.mode === 'font') {
      if (dialog.scope === 'column') {
        next = setDesignerTableColumnStyle(next, dialog.id, 'fontFamily', dialog.fontFamily === 'inherit' ? undefined : dialog.fontFamily)
        next = setDesignerTableColumnStyle(next, dialog.id, 'fontSize', dialog.fontSize)
        next = setDesignerTableColumnStyle(next, dialog.id, 'bold', dialog.bold)
      } else {
        next = setDesignerTableHeaderStyle(next, dialog.id, 'fontFamily', dialog.fontFamily === 'inherit' ? undefined : dialog.fontFamily)
        next = setDesignerTableHeaderStyle(next, dialog.id, 'fontSize', dialog.fontSize)
        next = setDesignerTableHeaderStyle(next, dialog.id, 'bold', dialog.bold)
      }
    }
    return dialog.scope === 'column'
      ? setDesignerTableColumnStyle(next, dialog.id, 'textColor', dialog.color)
      : setDesignerTableHeaderStyle(next, dialog.id, dialog.colorProperty, dialog.color)
  }
  const openGridFormatDialog = (scope: 'header' | 'column', id: string, label: string, mode: 'font' | 'color', colorProperty: 'textColor' | 'backgroundColor' | 'borderColor' = 'textColor') => {
    const base = historyRef.current.present
    const style = scope === 'column' ? base.tableColumns?.[id] : base.tableHeaders?.[id]
    const fallbackColor = colorProperty === 'backgroundColor' ? '#f7f9f7' : colorProperty === 'borderColor' ? '#dfe7e3' : '#263a38'
    const currentColor = scope === 'header' ? base.tableHeaders?.[id]?.[colorProperty] : base.tableColumns?.[id]?.textColor
    const next = { scope, id, label, mode, base, fontFamily: style?.fontFamily ?? 'inherit', fontSize: style?.fontSize ?? base.tableFont?.size ?? 13, bold: style?.bold ?? false, color: currentColor ?? fallbackColor, colorProperty }
    setContextMenu(null); setGridSubmenu(null); setGridFormatDialog(next); setColorPreviewDraft(buildGridFormatDraft(next))
  }
  const updateGridFormatDialog = (patch: Partial<NonNullable<typeof gridFormatDialog>>) => {
    if (!gridFormatDialog) return
    const next = { ...gridFormatDialog, ...patch }
    setGridFormatDialog(next); setColorPreviewDraft(buildGridFormatDraft(next))
  }
  const cancelGridFormatDialog = () => { setColorPreviewDraft(null); setGridFormatDialog(null) }
  const applyGridFormatDialog = () => { if (!gridFormatDialog) return; dispatchHistory({ type: 'change', draft: buildGridFormatDraft(gridFormatDialog) }); setColorPreviewDraft(null); setGridFormatDialog(null); setSaveStatus('') }
  const handleGridFormatColorCommit = (color: string | undefined) => {
    if (!gridFormatDialog) return
    const next = { ...gridFormatDialog, color: color ?? gridFormatDialog.color }
    if (next.mode === 'color') { dispatchHistory({ type: 'change', draft: buildGridFormatDraft(next) }); setColorPreviewDraft(null); setGridFormatDialog(null); setSaveStatus('') }
    else updateGridFormatDialog({ color: next.color })
  }
  const selectGridDesignerColumn = (columnId: string) => setSelectedTableColumnId(columnId)
  const openGridDesignerContextMenu = (target: 'header' | 'row' | 'search', columnId: string | undefined, left: number, top: number) => { if (!designerOpen) return; setSelectedTableColumnId(columnId); setGridSubmenu(null); setContextMenu({ left, top, part: 'grid', gridTarget: target, columnId }) }
  const commitActionColor = (property: DesignerProperty, value: DesignerValue | undefined) => {
    setColorPreviewDraft(null)
    if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null; dispatchHistory({ type: 'commitTransaction' }) }
    dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: setDesignerActionProperty(historyRef.current.present, actionSelection, property, value) })
    dispatchHistory({ type: 'commitTransaction' })
    setSaveStatus('')
  }
  const previewColorProperty = (property: DesignerProperty, value: DesignerValue | undefined | null, explicitTargets?: string[]) => {
    if (value === null) { setColorPreviewDraft(null); return }
    setColorPreviewDraft(setDesignerColorProperty(historyRef.current.present, explicitTargets ?? selection, property, value, fieldIds))
  }
  const previewElementAppearance = (property: DesignerProperty, value: DesignerValue | undefined | null) => {
    if (value === null) { setColorPreviewDraft(null); return }
    const targets = mapDesignerPropertyTargets(property, applyToAll ? fieldIds : selection, value)
    setColorPreviewDraft(actionSelection.length
      ? setDesignerActionProperty(historyRef.current.present, actionSelection, property, value)
      : setDesignerProperty(historyRef.current.present, targets, property, value, fieldIds))
  }
  const previewAppearanceColor = (property: DesignerAppearanceProperty, value: string | undefined | null) => {
    setColorPreviewDraft(value === null ? null : setDesignerAppearanceProperty(historyRef.current.present, property, value))
  }
  const previewActionColor = (property: DesignerProperty, value: DesignerValue | undefined | null) => {
    setColorPreviewDraft(value === null ? null : setDesignerActionProperty(historyRef.current.present, actionSelection, property, value))
  }
  const actionDisabled = (action: NonNullable<typeof laboratoryDefinition.actions>[number]) => {
    if (designerOpen) return false
    if (action.id === 'action-settings') return false
    if (dataEntryActive) return action.id !== 'demo-save' && action.id !== 'reset-sample'
    return action.id === 'demo-save' || (['edit-person', 'delete-person', 'first-record', 'last-record', 'previous-page', 'next-page', 'browse-records'].includes(action.id) && gridRecordCount === 0)
  }
  const validateRequiredField = (id: string, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const field = laboratoryDefinition.fields.find(item => item.id === id)
    if (!field?.required) return true
    control.setCustomValidity('')
    if (id === 'titleId' && !control.value.trim()) {
      control.focus()
      control.closest('.person-number-wrap')?.querySelector<HTMLButtonElement>('.number-add-button')?.click()
      return false
    }
    if (id === 'personCode') {
      const code = control.value.trim().toUpperCase()
      const match = code.match(/^LAB-(\d{6})$/)
      const number = match ? Number(match[1]) : 0
      const existsInSyntheticData = Boolean(match && number > 0 && number <= datasetSize
        && !deletedCodes.some(deleted => deleted.trim().toUpperCase() === code)
        && selectedPerson?.personCode.trim().toUpperCase() !== code)
      if (!code) control.setCustomValidity(fa ? 'کد شخص الزامی است.' : 'Person code is required.')
      else if (existsInSyntheticData) control.setCustomValidity(fa ? 'این کد قبلاً در داده‌های آزمایشگاه ثبت شده است.' : 'This code already exists in the laboratory data.')
    }
    if (control.checkValidity()) return true
    control.reportValidity()
    control.focus()
    return false
  }
  const validateRequiredFields = () => {
    for (const field of laboratoryDefinition.fields) {
      if (!field.required) continue
      const control = formGridRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-field-id="${field.id}"] input, [data-field-id="${field.id}"] select, [data-field-id="${field.id}"] textarea`)
      if (control && !validateRequiredField(field.id, control)) return false
    }
    return true
  }
  const beginEntry = (nextDraft: typeof defaultPersonDraft) => {
    entryDraftBaseline.current = draft
    dataEntryActiveRef.current = true
    setDataEntryActive(true)
    updateDraft(nextDraft)
    requestAnimationFrame(() => formGridRef.current?.querySelector<HTMLInputElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus())
  }
  const runAction = (id: string, key?: string) => {
    const action = laboratoryDefinition.actions?.find(item => item.id === id)
    const keyboardCancel = dataEntryActive && id === 'reset-sample'
    if (designerOpen || !action || !designerActionVisible(history.present, action) || (!keyboardCancel && actionDisabled(action))) return
    if (id === 'action-settings') { openDesigner(); return }
    const navigation = ({ 'first-record': 'first', 'last-record': 'last', 'previous-page': 'previous', 'next-page': 'next', 'browse-records': key === 'ArrowUp' ? 'up' : 'down' } as const)[id as 'first-record' | 'last-record' | 'previous-page' | 'next-page' | 'browse-records']
    if (navigation) { setNavigationRequest(current => ({ sequence: (current?.sequence ?? 0) + 1, command: navigation })); return }
    if (id === 'delete-person') {
      if (!selectedPerson) { window.alert(fa ? 'ابتدا یک ردیف از جدول را انتخاب کنید.' : 'Select a table row first.'); return }
      if (window.confirm(fa ? 'این ردیف مصنوعی فقط از نمونهٔ همین نشست حذف شود؟' : 'Remove this synthetic row from this session only?')) {
        setDeletedCodes(current => [...current, selectedPerson.personCode]); setSelectedPerson(null)
      }
      return
    }
    if (id === 'new-person') {
      setSelectedPerson(null)
      beginEntry(emptyPersonDraft(defaultTitleId))
      return
    }
    if (id === 'edit-person') {
      if (!selectedPerson) {
        window.alert(fa ? 'ابتدا یک ردیف از جدول را انتخاب کنید.' : language === 'zh' ? '请先选择表格中的一行。' : 'Select a table row first.')
        return
      }
      const words = selectedPerson.displayName.trim().split(/\s+/)
      const company = selectedPerson.displayName.startsWith('شرکت ')
      const jobId = ({ 'مشتری': 'customer', 'فروشنده': 'seller', 'تأمین‌کننده': 'supplier', 'شریک': 'partner' } as Record<string, string>)[selectedPerson.job] ?? 'customer'
      beginEntry({
        personCode: selectedPerson.personCode, titleId: company ? 'company' : 'mr', firstName: words.shift() ?? '', lastName: words.join(' '),
        jobId, nationalityId: selectedPerson.nationality === 'چینی' ? 'chinese' : 'iranian', phone: selectedPerson.phone,
        phoneDefault: selectedPerson.phone, mobileDefault: selectedPerson.mobile, addressDefault: selectedPerson.address,
        phoneNumbers: selectedPerson.phone ? [selectedPerson.phone] : [], mobile: selectedPerson.mobile, mobileNumbers: selectedPerson.mobile ? [selectedPerson.mobile] : [],
        address: selectedPerson.address, addresses: selectedPerson.address ? [selectedPerson.address] : [], notes: selectedPerson.notes
      })
      return
    }
    if (id === 'demo-save') {
      if (!validateRequiredFields()) return
      const titles = { ...labTitleSettings, usedIds: [...new Set([...(labTitleSettings.usedIds ?? []), draft.titleId])] }
      persistLaboratoryTitleSettings(titles)
      setLabTitleSettings(titles)
      window.alert(fa ? 'در آزمایشگاه هیچ داده‌ای ذخیره نمی‌شود.' : language === 'zh' ? '实验室不会保存任何数据。' : 'Laboratory data is never persisted.')
      dataEntryActiveRef.current = false
      setDataEntryActive(false)
      entryDraftBaseline.current = null
      return
    }
    if (id === 'reset-sample') {
      updateDraft(entryDraftBaseline.current ?? defaultPersonDraft)
      entryDraftBaseline.current = null
      dataEntryActiveRef.current = false
      setDataEntryActive(false)
    }
  }
  runActionRef.current = runAction
  const openDesigner = () => {
    if (!designerOpen && editingBaseline.current === null) editingBaseline.current = history.present
    setFrozenCanvas(null)
    setDesignerOpen(value => !value)
  }
  const cancelDesigner = () => {
    if (editingBaseline.current) dispatchHistory({ type: 'replace', draft: editingBaseline.current })
    else dispatchHistory({ type: 'replace', draft: history.present })
    editingBaseline.current = null
    setDesignerOpen(false)
    setSaveStatus('')
  }
  const saveDraft = () => {
    let saved = false
    try { saved = saveSessionDraft() }
    catch { /* Report unavailable storage through the existing save status. */ }
    if (saved) {
      editingBaseline.current = history.present
      dispatchHistory({ type: 'replace', draft: history.present })
      setSaveStatus(fa ? 'پیش‌نویس این فرم برای کاربر جاری ذخیره شد.' : language === 'zh' ? '此表单草稿已为当前用户保存。' : 'Draft saved for this user and laboratory form.')
    } else setSaveStatus(fa ? 'ذخیرهٔ محلی انجام نشد.' : language === 'zh' ? '无法保存本地草稿。' : 'Local draft could not be saved.')
  }
  const resetSelected = () => {
    if (propertyCommitTimer.current) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null; dispatchHistory({ type: 'commitTransaction' }) }
    if (actionSelection.length) { const actions = { ...history.present.actions }; for (const id of actionSelection) delete actions[id]; updateDraftState({ ...history.present, actions }); return }
    setFrozenCanvas(null); const { canvas: _canvas, ...reset } = resetDesignerFields(history.present, selection); updateDraftState(reset)
  }
  const updateButtonPressEffect = (enabled: boolean) => updateDraftState(setDesignerButtonPressEffect(historyRef.current.present, enabled))
  const resetAll = () => { setFrozenCanvas(null); const { canvas: _canvas, ...reset } = resetDesignerFields(history.present, fieldIds); updateDraftState({ ...reset, appearance: undefined, defaults: undefined, actions: undefined, filterPopupFontSize: undefined, gridSearchPosition: undefined, buttonPressEffect: undefined }) }
  const updateDraftState = (next: DesignerDraft) => { dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const blockedMessage = (id: string) => fa ? id === 'container' ? 'تراز انجام نشد: فضای کافی در محدودهٔ فرم وجود ندارد.' : `تراز انجام نشد: مسیر با «${labels[id]?.fa ?? id}» برخورد دارد؛ ابتدا مانع را جابه‌جا کنید.` : 'Alignment was blocked by an element or the canvas boundary.'
  const applyAlignment = (direction: DesignerAlignment) => {
    if (!canvas) return
    const ids = selectedDesignerInputs(selection, fieldIds)
    const result = alignCanvasFields(canvas, ids, ids.includes(referenceId) ? referenceId : ids[0], direction)
    if (result.blockedBy) { setLayoutStatus(blockedMessage(result.blockedBy)); return }
    updateDraftState(withCanvas(history.present, result.canvas))
    setLayoutStatus('')
  }
  const applyLayout = (operation: DesignerLayoutOperation, orientation: DesignerLayoutOrientation, gap: number) => {
    if (!canvas) return
    if (operation === 'align') { applyAlignment(orientation === 'horizontal' ? 'top' : fa ? 'right' : 'left'); return }
    const ids = selectedDesignerInputs(selection, fieldIds)
    const measured = ids.map(id => {
      const field = canvas.fields[id], rect = fieldGroupRect(field)
      return { id, ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, inputWidth: field.input.width, inputHeight: field.input.height, labelWidth: field.label.width, labelHeight: field.label.height }
    })
    const changed = layoutDesignerFields(history.present, measured, { operation, orientation, gap, rtl: fa }, fieldIds)
    const fields = { ...canvas.fields }
    for (const id of ids) {
      const old = { ...history.present.overrides[id], ...history.present.overrides[`${id}::input`] }
      const next = { ...changed.overrides[id], ...changed.overrides[`${id}::input`] }
      fields[id] = translateCanvasField(fields[id], Number(next.offsetX ?? 0) - Number(old.offsetX ?? 0), Number(next.offsetY ?? 0) - Number(old.offsetY ?? 0))
      fields[id] = { ...fields[id], input: { ...fields[id].input, width: Number(next.width ?? fields[id].input.width), height: Number(next.height ?? fields[id].input.height) } }
    }
    const proposed = { ...canvas, fields }
    const blocked = validateCanvasArrangement(canvas, proposed, ids)
    if (blocked) { setLayoutStatus(blockedMessage(blocked)); return }
    updateDraftState(withCanvas(history.present, proposed)); setLayoutStatus('')
  }
  const updateDirectProperty = (targetId: string, property: DesignerProperty, value: DesignerValue) => {
    dispatchHistory({ type: 'change', draft: setDesignerProperty(history.present, [targetId], property, value, fieldIds) })
    setSaveStatus('')
  }
  // Capture the responsive grid once. Only this laboratory canvas uses fixed geometry.
  useLayoutEffect(() => {
    if (!designerOpen || !geometryEditable || history.present.canvas || frozenCanvas || !formGridRef.current) return
    const grid = formGridRef.current, origin = grid.getBoundingClientRect()
    const rect = (element: Element): DesignerRect => { const r = element.getBoundingClientRect(); return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height } }
    const fields: DesignerCanvas['fields'] = {}
    for (const element of grid.querySelectorAll<HTMLElement>('[data-field-id]')) {
      const input = element.querySelector('.designer-input-part > :is(input,select,textarea,.person-number-wrap)'), label = element.querySelector('.designer-label-part')
      if (!input || !label) continue
      const select = element.querySelector('.laboratory-field-select'), error = element.querySelector('.field-error')
      fields[element.dataset.fieldId!] = { input: rect(input), label: rect(label), ...(select && select.getClientRects().length ? { select: rect(select) } : {}), ...(error && error.getClientRects().length ? { error: rect(error) } : {}) }
    }
    const captured = { width: origin.width, height: Math.max(origin.height, ...Object.values(fields).flatMap(field => Object.values(field).map(part => part.top + part.height))), fields }
    // Let the browser finish the responsive grid's first layout before freezing it.
    const frame = window.requestAnimationFrame(() => setFrozenCanvas(current => current ?? captured))
    if (existingCanvasCollisions(captured).length) setLayoutStatus(fa ? 'طرح فعلی هم‌پوشانی دارد؛ موقعیت عناصر موجود حفظ شده است.' : 'Existing overlaps were preserved.')
    return () => window.cancelAnimationFrame(frame)
  }, [designerOpen, geometryEditable, history.present.canvas])
  useEffect(() => {
    const ids = selectedDesignerInputs(selection, fieldIds)
    if (!ids.includes(referenceId)) setReferenceId(ids[0] ?? '')
  }, [selection, referenceId])
  useEffect(() => {
    if (!designerOpen) gestureCleanup.current?.()
    return () => gestureCleanup.current?.()
  }, [designerOpen])
  const withCanvas = (draft: DesignerDraft, nextCanvas: DesignerCanvas): DesignerDraft => {
    const previous = draft.canvas ?? frozenCanvas
    let next = draft
    if (previous) for (const id of fieldIds) for (const part of ['input', 'label'] as const) {
      const old = previous.fields[id]?.[part], rect = nextCanvas.fields[id]?.[part]
      if (!old || !rect) continue
      const key = `${id}::${part}`, values = { ...draft.overrides[id], ...draft.overrides[key] }
      if (old.width !== rect.width) next = setDesignerProperty(next, [key], 'width', rect.width, fieldIds)
      if (old.height !== rect.height) next = setDesignerProperty(next, [key], 'height', rect.height, fieldIds)
      if (old.left !== rect.left) next = setDesignerProperty(next, [key], 'offsetX', Number(values.offsetX ?? 0) + rect.left - old.left, fieldIds)
      if (old.top !== rect.top) next = setDesignerProperty(next, [key], 'offsetY', Number(values.offsetY ?? 0) + rect.top - old.top, fieldIds)
    }
    return { ...next, canvas: nextCanvas }
  }
  const finishGesture = () => { gestureCleanup.current = null; dispatchHistory({ type: 'commitTransaction' }) }
  const beginActionResize = (event: React.PointerEvent<HTMLElement>, actionId: string, edge: 'left' | 'right' | 'top' | 'bottom') => {
    if (!designerOpen || event.button !== 0) return
    const button = event.currentTarget.parentElement?.querySelector('button:not(.designer-edge-handle)')
    if (!button) return
    gestureCleanup.current?.()
    const horizontal = edge === 'left' || edge === 'right', rect = button.getBoundingClientRect(), startDraft = historyRef.current.present
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerPointer(event, (dx, dy) => {
      const limits = designerActionDimensionLimits[horizontal ? 'width' : 'height']
      const resized = resizeDesignerEdge(horizontal ? rect.width : rect.height, horizontal ? dx : dy, edge, limits.min, limits.max)
      flushSync(() => dispatchHistory({ type: 'change', draft: setDesignerActionProperty(startDraft, [actionId], horizontal ? 'width' : 'height', resized.size) }))
    }, finishGesture)
    setSaveStatus('')
  }
  const beginInputResize = (event: React.PointerEvent<HTMLElement>, fieldId: string, edge: DesignerResizeHandle) => {
    if (!designerOpen || !canvas || event.button !== 0) return
    gestureCleanup.current?.()
    const ids = selectedDesignerInputs(selection, fieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    event.currentTarget.focus({ preventScroll: true })
    const initialCanvas = canvas, startDraft = historyRef.current.present
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerPointer(event, (dx, dy) => {
      const resized = resizeCanvasHandle(initialCanvas, targets, edge, dx, dy)
      flushSync(() => dispatchHistory({ type: 'change', draft: withCanvas(startDraft, resized) }))
    }, finishGesture)
  }
  const handleInputResizeKey = (event: React.KeyboardEvent<HTMLElement>, fieldId: string, handle: DesignerResizeHandle) => {
    if (!designerOpen || !geometryEditable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault(); event.stopPropagation()
    const start = historyRef.current.present
    const currentCanvas = start.canvas ?? frozenCanvas
    if (!currentCanvas) return
    const ids = selectedDesignerInputs(selection, fieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    const resized = resizeCanvasHandle(currentCanvas, targets, handle, dx, dy)
    if (resized !== currentCanvas) updateDraftState(withCanvas(start, resized))
  }
  const beginFieldMove = (event: React.PointerEvent<HTMLElement>, targetId: string, part: 'label' | 'input') => {
    if (!designerOpen || !canvas || event.button !== 0) return
    gestureCleanup.current?.()
    const fieldId = targetId.split('::')[0], ids = selectedDesignerInputs(selection, fieldIds)
    const targets = part === 'input' && ids.includes(fieldId) ? ids : [fieldId]
    const initialCanvas = canvas, startDraft = historyRef.current.present
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerPointer(event, (dx, dy) => {
      let moved = moveCanvasFields(initialCanvas, targets, dx, dy)
      if (part === 'label') {
        const label = initialCanvas.fields[fieldId].label
        moved = { ...initialCanvas, fields: { ...initialCanvas.fields, [fieldId]: { ...initialCanvas.fields[fieldId], label: { ...label, left: Math.max(0, Math.min(initialCanvas.width - label.width, label.left + dx)), top: Math.max(0, Math.min(initialCanvas.height - label.height, label.top + dy)) } } } }
      }
      flushSync(() => dispatchHistory({ type: 'change', draft: withCanvas(startDraft, moved) }))
    }, finishGesture)
  }
  const rectStyle = (rect: DesignerRect | undefined): CSSProperties => rect ? { position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height, transform: 'none', margin: 0 } : {}
  const partStyle = (id: string, part: 'input' | 'label'): CSSProperties => ({ ...designerStyleForPart(visibleDraft, id, part), ...rectStyle(canvas?.fields[id]?.[part]) })
  const undo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } undoHistory() }
  const redo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } redoHistory() }
  const handleDesignerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const functionKey = functionKeyFromEvent(event.nativeEvent)
    if (functionKey === 'F8' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) {
        setGridResetRequest(current => current + 1)
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLElement && activeElement.closest('.base-grid-virtual-wrap')) activeElement.blur()
      }
      return
    }
    const shortcutKey = laboratoryDefinition.actions?.some(action => action.keys?.includes(functionKey ?? event.key))
    if (shortcutKey && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('[role="dialog"], .excel-color-picker.is-open')) return
      // Own this form's shortcuts even when an action is hidden or disabled.
      // Editable controls retain native typing/navigation; picker dialogs own Escape.
      event.stopPropagation()
      if (dataEntryActiveRef.current && event.key === 'Escape') {
        event.preventDefault()
        if (!event.repeat) runAction('reset-sample')
        return
      }
      const editingField = target instanceof HTMLElement && (target.matches('input, select, textarea, [contenteditable="true"]') || target.isContentEditable)
      if (editingField && dataEntryActiveRef.current && (functionKey === 'F3' || event.key === 'Escape')) {
        event.preventDefault()
        if (!event.repeat) runAction(functionKey === 'F3' ? 'demo-save' : 'reset-sample')
        return
      }
      if (editingField || (event.key === ' ' && target instanceof HTMLElement && target.closest('button'))) return
      event.preventDefault()
      if (!designerOpen && !event.repeat) {
        const action = designerShortcutAction(history.present, laboratoryDefinition.actions ?? [], functionKey ?? event.key)
        if (action) runAction(action.id, event.key)
      }
      return
    }
    if (!designerOpen || !(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase())) return
    const target = event.target
    if (target instanceof HTMLElement && (target.matches('input, textarea, [contenteditable="true"]') || target.isContentEditable)) return
    event.preventDefault()
    if (event.key.toLowerCase() === 'z' && !event.shiftKey) undo()
    else redo()
  }
  const renderField = (id: string, layoutClass: string, control: React.ReactNode, error?: string) => {
    const fieldDefinition = laboratoryDefinition.fields.find(field => field.id === id)
    const required = fieldDefinition?.required === true
    const selected = designerOpen && selection.includes(`${id}::field`)
    const inputSelected = designerOpen && (selected || selection.includes(`${id}::input`))
    const labelSelected = designerOpen && (selected || selection.includes(`${id}::label`))
    const fieldLabel = labels[id][language]
    return <div key={id} className={'laboratory-designer-field ' + layoutClass + (selection.some(key => key.startsWith(`${id}::`)) ? ' is-selected' : '')} data-field-id={id} style={canvas?.fields[id]?.error ? { '--canvas-error-left': canvas.fields[id].error!.left + 'px', '--canvas-error-top': canvas.fields[id].error!.top + 'px', '--canvas-error-width': canvas.fields[id].error!.width + 'px', '--canvas-error-height': canvas.fields[id].error!.height + 'px' } as CSSProperties : undefined} role="group" aria-label={fieldLabel}>
      <button type="button" className="laboratory-field-select" style={rectStyle(canvas?.fields[id]?.select)} aria-label={(fa ? 'انتخاب فیلد ' : language === 'zh' ? '选择字段 ' : 'Select field ') + fieldLabel} aria-pressed={selected} onClick={event => selectField(id, event)}>{selected ? '✓' : '+'}</button>
      <Field label={fieldLabel} labelId={`laboratory-label-${id}`} labelContent={<span className={'designer-label-part' + (labelSelected ? ' designer-part-selected' : '')} style={partStyle(id, 'label')} onClick={event => { if (designerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) { return } selectField(id, event, 'label') } }}>{fieldLabel}{required && <span aria-hidden="true"> *</span>}{labelSelected && <>{geometryEditable && <button type="button" className="designer-move-handle" aria-label="Move label" onClick={stopDesignerHandleClick} onPointerDown={event => beginFieldMove(event, `${id}::label`, 'label')}>↕</button>}<span className="designer-type-tools"><button type="button" aria-label="Decrease label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.max(8, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) - 1)) }}>A−</button><button type="button" aria-label="Increase label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.min(40, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) + 1)) }}>A+</button><button type="button" aria-label="Toggle label bold" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'bold', !(history.present.overrides[`${id}::label`]?.bold ?? false)) }}>B</button><ExcelColorPicker language={language} label="Label color" value={String(designerEffectiveValues(visibleDraft, id, 'label').textColor ?? getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() ?? '#71817e')} onPreview={value => previewColorProperty('labelColor', value, [`${id}::label`])} onCommit={value => commitColorProperty('labelColor', value, [`${id}::label`])} /></span></>}</span>} controlContent={<span className={'designer-input-part' + (inputSelected ? ' designer-part-selected' : '')} style={partStyle(id, 'input')} onClick={event => { if (designerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) { return } event.preventDefault(); selectField(id, event, 'input') } }}>{React.isValidElement(control) ? React.cloneElement(control as React.ReactElement<any>, { style: { ...designerStyleForPart(visibleDraft, id, 'input') as CSSProperties, ...((control as React.ReactElement<{ style?: CSSProperties }>).props.style ?? {}) }, ...(typeof control.type === 'string' ? { 'data-field': id, ...(required ? { required: true, 'aria-required': true, onInput: (event: React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => event.currentTarget.setCustomValidity(''), onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => validateRequiredField(id, event.currentTarget) } : {}) } : { required, designerMode: designerOpen }) }) : control}{inputSelected && geometryEditable && <><button type="button" className="designer-move-handle" aria-label="Move input" onClick={stopDesignerHandleClick} onPointerDown={event => beginFieldMove(event, `${id}::input`, 'input')}>↕</button>{designerResizeHandles.map(edge => <button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize input ${edge}`} title={fa ? `تغییر اندازه ${edge}؛ کلیدهای جهت‌دار، Shift برای ۱۰ پیکسل` : `Resize ${edge}: arrows; Shift for 10 pixels`} onKeyDown={event => handleInputResizeKey(event, id, edge)} onClick={stopDesignerHandleClick} onPointerDown={event => beginInputResize(event, id, edge)} />)}</>}</span>} error={error} style={designerStyleForPart(visibleDraft, id, 'field') as CSSProperties}>{control}</Field>
    </div>
  }
  const title = fa ? 'آزمایشگاه فرم‌ها' : language === 'zh' ? '表单实验室' : 'Form Laboratory'
  const settingsLabel = fa ? 'طراحی ظاهری فرم' : language === 'zh' ? '表单外观设计' : 'Visual form designer'
  const layoutExtents = Object.values(history.present.overrides).reduce<{ width: number, height: number }>((extent, override) => ({
    width: Math.max(extent.width, Number(override.offsetX ?? 0)),
    height: Math.max(extent.height, Number(override.offsetY ?? 0))
  }), { width: 0, height: 0 })
  const extraCanvasWidth = Math.max(0, layoutExtents.width)
  const canvasStyle = { '--lab-canvas-extra-width': `${extraCanvasWidth ? extraCanvasWidth + 64 : 0}px`, '--lab-canvas-extra-height': `${Math.max(0, layoutExtents.height)}px` } as CSSProperties
  const appearanceStyle = designerAppearanceStyle(visibleDraft) as CSSProperties
  const contextInputs = selection.length > 0 && selection.every(key => !key.endsWith('::label'))
  const contextLabels = selection.length > 0 && selection.every(key => key.endsWith('::label') || key.endsWith('::field'))
  const contextColors = contextMenu?.part === 'action' || (contextMenu?.part === 'input' ? contextInputs : contextLabels)
  const contextSize = contextMenu?.part === 'action' || (contextMenu?.part === 'input' && contextInputs)
  const contextLayout = !actionSelection.length && contextInputs && selectedDesignerInputs(selection, fieldIds).length > 1 && Boolean(canvas)
  const selectedTableColumn = selectedTableColumnId ? columns.find(column => column.id === selectedTableColumnId) : undefined
  const selectedTableHeader = selectedTableColumn
  const footerActions = (laboratoryDefinition.actions ?? []).filter(action => designerActionVisible(visibleDraft, action))
  return <div className="form-laboratory-page" dir={fa ? 'rtl' : 'ltr'} data-form-laboratory data-synthetic-only="true" data-entry-active={dataEntryActive || undefined} data-designer-active={designerOpen || undefined} data-button-press-effect={history.present.buttonPressEffect !== false ? "true" : "false"} onKeyDown={handleDesignerKey} onContextMenu={openContextMenu}>
    {import.meta.env.DEV && <div><button type="button" onClick={() => setFormsManagerOpen(true)}>{fa ? 'مدیریت فرم‌ها' : language === 'zh' ? '表单管理' : 'Form management'}</button></div>}
    {import.meta.env.DEV && formsManagerOpen && <FormBuilderSandbox language={language} onClose={() => setFormsManagerOpen(false)} />}
    <div ref={formFrameAreaRef} className="laboratory-form-frame-area" role="region" aria-label={fa ? 'فضای فرم؛ برای تغییر اندازه موس را به لبه‌های بیرونی ببرید و برای جابه‌جایی نوار عنوان را بکشید.' : 'Form workspace. Move the pointer to an outer edge to resize; drag the title bar to move.'} tabIndex={0} onPointerMove={handlePreviewPointerMove} onPointerLeave={event => { if (!previewInteractionRef.current) event.currentTarget.style.cursor = '' }} onPointerDown={beginPreviewPointer} onKeyDown={handlePreviewKeyDown}>
    <div ref={formFrameRef} className="laboratory-form-frame" data-preview-device={previewDevice} data-preview-width={previewWidth} dir={fa ? 'rtl' : 'ltr'} style={{ width: previewFitToPage && previewDevice === 'desktop' ? '100%' : previewWidth, height: previewHeight ?? undefined, minHeight: previewHeight ?? undefined, left: previewOffset.x, top: previewOffset.y }}>
    <header ref={formBannerRef} className="form-laboratory-banner"><div className="laboratory-banner-title"><strong>{title}</strong><span>{fa ? 'محیط مستقل با دادهٔ قطعی و مصنوعی؛ هیچ API اشخاصی فراخوانی نمی‌شود.' : language === 'zh' ? '独立的确定性合成数据环境；不会调用人员 API。' : 'Independent deterministic synthetic data; no Persons API is called.'}</span></div><div className="laboratory-banner-actions"><div className="laboratory-device-toolbar" role="group" aria-label={fa ? 'پیش‌نمایش دستگاه' : 'Device preview'}>{(Object.keys(previewWidths) as PreviewDevice[]).map(device => <button key={device} type="button" aria-pressed={previewDevice === device} onClick={() => { setPreviewDevice(device); setPreviewFitToPage(device === 'desktop'); setPreviewWidth(previewWidths[device]); setPreviewHeight(null); setPreviewOffset({ x: 0, y: 0 }) }} title={previewWidths[device] + 'px'}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">{device === 'desktop' ? <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M7 21h10" /></> : <><rect x={device === 'tablet' ? 5 : 7} y="2" width={device === 'tablet' ? 14 : 10} height="20" rx="2" /><path d="M11 19h2" /></>}</svg>{fa ? ({ desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' })[device] : ({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]}</button>)}{previewDevice === 'mobile' && <select aria-label={fa ? 'عرض موبایل' : 'Mobile width'} value={previewWidth === 320 || previewWidth === 390 ? previewWidth : 'custom'} onChange={event => { const width = Number(event.target.value); if (width) { setPreviewFitToPage(false); setPreviewWidth(width); setPreviewOffset(current => ({ ...current, x: 0 })) } }}><option value="custom">{fa ? 'اندازهٔ دلخواه' : 'Custom width'}</option><option value="390">390px</option><option value="320">320px</option></select>}</div><label>{fa ? 'اندازهٔ داده' : language === 'zh' ? '数据量' : 'Dataset size'}<select value={datasetSize} onChange={event => setDatasetSize(Number(event.target.value) as typeof datasetSize)}>{laboratoryDatasetSizes.map(size => <option key={size} value={size}>{size.toLocaleString()}</option>)}</select></label><button type="button" className="laboratory-history-button" aria-label={fa ? 'واگرد' : 'Undo'} title="Ctrl+Z" disabled={!history.past.length} onClick={undo}>↶</button><button type="button" className="laboratory-history-button" aria-label={fa ? 'ازنو' : 'Redo'} title="Ctrl+Y" disabled={!history.future.length} onClick={redo}>↷</button><button type="button" className="laboratory-designer-toggle" aria-label={settingsLabel} title={settingsLabel} aria-expanded={designerOpen} aria-controls="form-laboratory-designer" onClick={openDesigner}>⚙</button></div></header>
    <div className={"laboratory-workspace" + (designerOpen ? " has-designer" : "")}>
      {designerOpen && <FormLaboratoryDesignerPanel geometryEditable={geometryEditable} propertyRequest={propertyRequest} onElementAppearanceCommit={commitElementAppearance} onElementAppearancePreview={previewElementAppearance} onFinishPropertyChange={finishPropertyChange} language={language} draft={visibleDraft} onTableFontChange={updateTableFont} selectedTableColumn={selectedTableColumn ? { id: selectedTableColumn.id, label: selectedTableColumn.label, style: visibleDraft.tableColumns?.[selectedTableColumn.id] } : undefined} selectedTableHeader={selectedTableHeader ? { id: selectedTableHeader.id, label: selectedTableHeader.label, style: visibleDraft.tableHeaders?.[selectedTableHeader.id] } : undefined} onTableColumnStyleChange={updateTableColumnStyle} onTableHeaderStyleChange={updateTableHeaderStyle} onTableColumnColorCommit={(id, color) => commitTableStyleColor('column', id, color)} onTableColumnColorPreview={(id, color) => previewTableStyleColor('column', id, color)} onTableColumnBackgroundColorCommit={commitTableColumnBackgroundColor} onTableColumnBackgroundColorPreview={previewTableColumnBackgroundColor} onTableHeaderColorCommit={(id, property, color) => commitTableStyleColor('header', id, color, property)} onTableHeaderColorPreview={(id, property, color) => previewTableStyleColor('header', id, color, property)} filterPopupFontSize={history.present.filterPopupFontSize ?? 16} onFilterPopupFontSizeChange={updateFilterPopupFontSize} gridSearchPosition={history.present.gridSearchPosition ?? 'right'} onGridSearchPositionChange={updateGridSearchPosition} buttonPressEffectEnabled={history.present.buttonPressEffect !== false} onButtonPressEffectChange={updateButtonPressEffect} onBeginFilterPopupFontSizeChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitFilterPopupFontSizeChange={() => dispatchHistory({ type: 'commitTransaction' })} selectedFieldIds={selection} selectedActionIds={actionSelection} actions={laboratoryDefinition.actions ?? []} onActionVisibilityChange={changeActionVisibility} onSelectAction={id => { setSelection([]); setActionSelection([id]); setApplyToAll(false) }} onActionTextChange={updateActionText} onActionTextPropertyChange={updateActionTextProperty} onActionColorCommit={commitActionColor} onActionColorPreview={previewActionColor} onClearSelection={() => { setSelection([]); setActionSelection([]) }} fieldIds={fieldIds} fieldLabels={Object.fromEntries(fieldIds.map(id => [id, labels[id][language]]))} applyToAll={applyToAll} canSave={Boolean(authenticatedUserId)} saveStatus={saveStatus} onApplyToAllChange={setApplyToAll} onChange={updateProperty} onColorCommit={commitColorProperty} onColorPreview={previewColorProperty} onAppearanceColorCommit={commitAppearanceColor} onAppearanceColorPreview={previewAppearanceColor} onBeginColorChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitColorChange={() => dispatchHistory({ type: 'commitTransaction' })} onUndo={undo} onRedo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onResetSelected={resetSelected} onResetAll={resetAll} onSave={saveDraft} onCancel={cancelDesigner} onSelectAll={() => { setActionSelection([]); setSelection(fieldIds.map(id => `${id}::input`)) }} onLayout={applyLayout} onAlign={applyAlignment} referenceFieldId={referenceId} onReferenceChange={setReferenceId} layoutStatus={layoutStatus} />}
    <BaseFormShell formId={laboratoryDefinition.id} initialHeaderRef={formBannerRef}
      editor={<div className="person-editor panel laboratory-editor" style={appearanceStyle}><div ref={formGridRef} className={'person-form-grid laboratory-form-grid' + (canvas ? ' has-fixed-geometry' : '')} style={canvas ? { width: canvas.width, height: canvas.height, minWidth: canvas.width } : undefined} data-section-id="laboratory.editor" onClick={event => { if (designerOpen && event.target === event.currentTarget) setSelection([]) }}>
        {renderField('personCode', 'lab-person-code', <input aria-label={labels.personCode[language]} value={draft.personCode} disabled={!dataEntryActive} onChange={event => update('personCode', event.target.value)} />)}
        {renderField('titleId', 'lab-title laboratory-shared-contact', <FormValueList onSelectValue={value => { const option = labTitles.find(item => titleName(item) === value); if (option) update('titleId', option.id) }} field="titleId" label={labels.titleId[language]} primary={labTitles.find(option => option.id === draft.titleId) ? titleName(labTitles.find(option => option.id === draft.titleId)!) : ''} numbers={labTitles.map(titleName)} listPrimary={labTitles.find(option => option.id === defaultTitleId) ? titleName(labTitles.find(option => option.id === defaultTitleId)!) : ''} disabled={!dataEntryActive} fa={fa} multiline minListWidth={240} addLabel={fa ? 'افزودن عنوان' : 'Add title'} listLabel={fa ? 'نمایش عنوان‌ها' : 'Show titles'} getItemKey={original => labTitles.find(option => titleName(option) === original)?.id ?? original} className="laboratory-title-text-control" canEdit={original => !titleInUse(labTitles.find(option => titleName(option) === original)?.id ?? '')} canRemove={original => !titleInUse(labTitles.find(option => titleName(option) === original)?.id ?? '')} onChange={commitLaboratoryTitles} />)}
        {renderField('firstName', 'lab-first', <input aria-label={labels.firstName[language]} value={draft.firstName} disabled={!dataEntryActive} onChange={event => update('firstName', event.target.value)} />)}
        {renderField('lastName', 'lab-last', <input aria-label={labels.lastName[language]} value={draft.lastName} disabled={!dataEntryActive} onChange={event => update('lastName', event.target.value)} />)}
        {renderField('jobId', 'lab-job', <select aria-label={labels.jobId[language]} value={draft.jobId} disabled={!dataEntryActive} onChange={event => update('jobId', event.target.value)}>{jobOptionIds.map(id => <option key={id} value={id}>{jobLabels[id][language]}</option>)}</select>)}
        {renderField('nationalityId', 'lab-nationality', <select aria-label={labels.nationalityId[language]} value={draft.nationalityId} disabled={!dataEntryActive} onChange={event => update('nationalityId', event.target.value)}><option value="iranian">{fa ? 'ایرانی' : language === 'zh' ? '伊朗' : 'Iranian'}</option><option value="chinese">{fa ? 'چینی' : language === 'zh' ? '中国' : 'Chinese'}</option></select>)}
        {renderField('phone', 'lab-phone laboratory-shared-contact', <FormValueList listPrimary={draft.phoneDefault} onSelectValue={value => update('phone', value)} field="phone" label={fa ? 'تلفن' : 'Phone'} primary={draft.phone} numbers={draft.phoneNumbers} disabled={!dataEntryActive} fa={fa} suggestedCode={draft.nationalityId === 'chinese' ? '+86' : '+98'} onChange={(phone, phoneNumbers) => updateDraft(current => ({ ...current, phone, phoneDefault: phone, phoneNumbers }))} />)}
        {renderField('mobile', 'lab-mobile laboratory-shared-contact', <FormValueList listPrimary={draft.mobileDefault} onSelectValue={value => update('mobile', value)} field="mobile" label={fa ? 'موبایل' : 'Mobile'} primary={draft.mobile} numbers={draft.mobileNumbers} disabled={!dataEntryActive} fa={fa} suggestedCode={draft.nationalityId === 'chinese' ? '+86' : '+98'} onChange={(mobile, mobileNumbers) => updateDraft(current => ({ ...current, mobile, mobileDefault: mobile, mobileNumbers }))} />)}
        {renderField('disabledExample', 'lab-disabled', <input disabled value={fa ? 'فقط نمایشی' : 'Display only'} readOnly />)}
        {renderField('address', 'lab-address laboratory-shared-contact', <FormValueList listPrimary={draft.addressDefault} onSelectValue={value => update('address', value)} field="address" label={fa ? 'آدرس' : 'Address'} primary={draft.address} numbers={draft.addresses} disabled={!dataEntryActive} fa={fa} onChange={(address, addresses) => updateDraft(current => ({ ...current, address, addressDefault: address, addresses }))} multiline />)}
        {renderField('notes', 'lab-notes', <input type="text" data-field="notes" aria-label={labels.notes[language]} placeholder={fa ? 'نمونهٔ حالت عادی' : 'Normal state example'} value={draft.notes} disabled={!dataEntryActive} onChange={event => update('notes', event.target.value)} />)}
        {renderField('errorExample', 'lab-error', <input aria-label={labels.errorExample[language]} aria-invalid="true" defaultValue="نمونه" />, fa ? 'دادهٔ آزمایشی نامعتبر است.' : 'Synthetic validation example.')}
      </div>{!canvas && geometryEditable && <div className="designer-canvas-spacer" aria-hidden="true" style={canvasStyle} />}</div>}
      grid={<div className="person-grid-panel panel laboratory-grid"><BaseFormGridBoundary rows={[]} columns={columns} language={language} appearanceStyle={appearanceStyle} filterPopupFontSize={history.present.filterPopupFontSize ?? 16} remoteQuery={remoteGridQuery} remoteQueryScope={datasetSize} resetRequest={gridResetRequest} navigationRequest={navigationRequest} gridSearchPosition={history.present.gridSearchPosition ?? 'right'} designerMode={designerOpen} designerColumnStyles={visibleDraft.tableColumns} designerHeaderStyles={visibleDraft.tableHeaders} onDesignerColumnSelect={selectGridDesignerColumn} onDesignerContextMenu={openGridDesignerContextMenu} onRowSelectionChange={setSelectedPerson} onTotalChange={setGridRecordCount} /></div>}
      footer={<div className={`shortcut-bar laboratory-footer${dataEntryActive ? ' is-entry-active' : ''}`} dir={fa ? 'rtl' : 'ltr'} role="group" aria-label={fa ? 'دکمه‌های پایین فرم' : 'Form actions'} aria-live="polite" style={appearanceStyle}>{footerActions.map(action => {
        const disabled = !designerOpen && actionDisabled(action)
        return <span key={action.id} data-action-id={action.id} className={'laboratory-action-button' + (action.iconOnly ? ' is-icon-action' : '') + (designerOpen && actionSelection.includes(action.id) ? ' designer-part-selected' : '')} style={designerActionStyle(visibleDraft, action.id) as CSSProperties} title={disabled ? action.id === 'edit-person' ? (fa ? 'برای ویرایش باید جدول رکورد داشته باشد.' : 'The table must contain records to edit.') : fa ? 'این کلید در حالت فعلی فرم قابل استفاده نیست.' : 'This action is unavailable in the current form mode.' : undefined} onClickCapture={event => {
        if (!designerOpen || (event.target as HTMLElement).closest('.designer-edge-handle')) return
        event.preventDefault(); event.stopPropagation(); setSelection([])
        setActionSelection(current => event.ctrlKey || event.metaKey ? current.includes(action.id) ? current.filter(id => id !== action.id) : [...current, action.id] : [action.id])
      }}><Shortcut code={dataEntryActive ? action.code : designerActionCode(visibleDraft, action)} label={dataEntryActive ? action.label[language] : designerActionLabel(visibleDraft, action, language)} codeStyle={designerActionTextStyle(visibleDraft, action.id, 'code')} labelStyle={designerActionTextStyle(visibleDraft, action.id, language)} disabled={disabled} primary={action.primary} danger={action.id === 'delete-person'} onClick={() => runAction(action.id)} />{designerOpen && geometryEditable && actionSelection.includes(action.id) && (['left', 'right', 'top', 'bottom'] as const).map(edge => <button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize action ${action.id} ${edge}`} onClick={stopDesignerHandleClick} onPointerDown={event => beginActionResize(event, action.id, edge)} />)}</span>
      })}</div>}
      style={appearanceStyle}
    />
    </div>
    </div></div>
    {designerOpen && contextMenu && createPortal(<><div ref={contextMenuRef} className="designer-context-menu" role="menu" aria-label="ویژگی‌های انتخاب" dir="rtl" style={{ left: contextMenu.left, top: contextMenu.top }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      {contextMenu.part === 'grid' ? <>
        {contextMenu.gridTarget === 'header' ? <>
          <strong>تنظیم سرستون «{columns.find(column => column.id === contextMenu.columnId)?.label ?? ''}»</strong>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={gridSubmenu === 'header'} onMouseEnter={() => setGridSubmenu('header')} onClick={() => setGridSubmenu('header')}>تغییرات هدر <span aria-hidden="true">‹</span></button>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={gridSubmenu === 'column'} onMouseEnter={() => setGridSubmenu('column')} onClick={() => setGridSubmenu('column')}>تغییرات داده‌های ستون <span aria-hidden="true">‹</span></button>
        </> : <>
        <strong>{contextMenu.gridTarget === 'search' ? 'تنظیمات جست‌وجوی جدول' : 'تنظیمات جدول و ردیف'}</strong>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableTypography')}>قلم و اندازهٔ کل جدول</button>
        {contextMenu.gridTarget === 'row' && <>
          <button type="button" role="menuitem" onClick={() => requestProperty('appearance', 'rowBackground')}>رنگ ردیف‌های جدول</button>
          <button type="button" role="menuitem" onClick={() => requestProperty('appearance', 'rowAlternateBackground')}>رنگ ردیف‌های یکی‌درمیان</button>
          <button type="button" role="menuitem" onClick={() => requestProperty('appearance', 'cellText')}>رنگ متن سلول‌ها</button>
        </>}
        {contextMenu.gridTarget === 'search' && <>
          <button type="button" role="menuitem" onClick={() => requestProperty('appearance', 'searchBackground')}>رنگ پس‌زمینهٔ جست‌وجو</button>
          <button type="button" role="menuitem" onClick={() => requestProperty('appearance', 'searchBorder')}>رنگ کادر جست‌وجو</button>
        </>}
        </>}
      </> : <>
      {contextColors && <>
        {contextMenu.part !== 'label' && <button type="button" role="menuitem" onClick={() => requestProperty('color', 'backgroundColor')}>تغییر رنگ پس‌زمینه</button>}
        <button type="button" role="menuitem" onClick={() => requestProperty('color', contextMenu.part === 'label' ? 'labelColor' : 'textColor')}>تغییر رنگ متن</button>
        {contextMenu.part !== 'label' && <button type="button" role="menuitem" onClick={() => requestProperty('color', 'borderColor')}>تغییر رنگ کادر</button>}
      </>}
      {contextSize && geometryEditable && <button type="button" role="menuitem" onClick={() => requestProperty('size')}>تغییر اندازه</button>}
      {contextSize && <>
        <button type="button" role="menuitem" onClick={() => requestProperty('appearance')}>سبک و جلوه ظاهری</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('borders')}>تنظیم کادر</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('shadow')}>تنظیم سایه</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('gradient')}>تنظیم گرادیان</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('appearanceMore')}>تنظیمات بیشتر ظاهری</button>
      </>}
      <button type="button" role="menuitem" onClick={() => requestProperty('font')}>تنظیم فونت</button>
      <button type="button" role="menuitem" onClick={() => requestProperty(contextLayout ? 'align' : 'textAlign')}>تراز</button>
      {contextLayout && <button type="button" role="menuitem" onClick={() => requestProperty('spacing')}>فاصله‌گذاری</button>}
      <button type="button" role="menuitem" onClick={() => requestProperty('more')}>تنظیمات بیشتر</button>
      <button type="button" role="menuitem" onClick={() => { setContextMenu(null); resetSelected() }}>بازنشانی به پیش‌فرض</button>
      </>}
    </div>
    {contextMenu.part === 'grid' && contextMenu.gridTarget === 'header' && gridSubmenu && contextMenu.columnId && <div ref={contextSubmenuRef} className="designer-context-menu designer-context-submenu" role="menu" aria-label={gridSubmenu === 'header' ? 'تنظیمات ظاهری هدر' : 'تنظیمات داده‌های ستون'} dir="rtl" style={{ left: Math.max(8, Math.min(window.innerWidth - 228, contextMenu.left > 236 ? contextMenu.left - 228 : contextMenu.left + 220)), top: Math.max(8, Math.min(window.innerHeight - 300, contextMenu.top)) }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      {gridSubmenu === 'header' ? <>
        <strong>تغییرات هدر</strong>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableHeaderTypography', 'headerColor')}>رنگ متن هدر…</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableHeaderTypography', 'headerBackgroundColor')}>رنگ پس‌زمینهٔ این هدر…</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableHeaderTypography', 'headerBorderColor')}>رنگ کادر این هدر…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('header', contextMenu.columnId!, columns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'font')}>قلم و اندازهٔ هدر…</button>
        <button type="button" role="menuitemcheckbox" aria-checked={Boolean(visibleDraft.tableHeaders?.[contextMenu.columnId]?.bold)} onClick={() => updateTableHeaderStyle(contextMenu.columnId!, 'bold', !visibleDraft.tableHeaders?.[contextMenu.columnId!]?.bold)}>{visibleDraft.tableHeaders?.[contextMenu.columnId]?.bold ? 'برداشتن حالت درشت هدر' : 'درشت‌کردن هدر'}</button>
      </> : <>
        <strong>تغییرات داده‌های ستون</strong>
        <button type="button" role="menuitemcheckbox" aria-checked={Boolean(visibleDraft.tableColumns?.[contextMenu.columnId]?.bold)} onClick={() => updateTableColumnStyle(contextMenu.columnId!, 'bold', !visibleDraft.tableColumns?.[contextMenu.columnId!]?.bold)}>{visibleDraft.tableColumns?.[contextMenu.columnId]?.bold ? 'برداشتن حالت درشت ستون' : 'درشت‌کردن داده‌های ستون'}</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableTypography', 'columnColor')}>رنگ متن داده‌های ستون…</button>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableTypography', 'columnBackgroundColor')}>رنگ پس‌زمینهٔ سلول‌های ستون…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('column', contextMenu.columnId!, columns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'font')}>قلم و اندازهٔ داده‌های ستون…</button>
      </>}
    </div>}
    </>, document.body)}
    {designerOpen && gridFormatDialog && createPortal(<div className="designer-grid-format-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) cancelGridFormatDialog() }}><section className="designer-grid-format-dialog" role="dialog" aria-modal="true" aria-labelledby="designer-grid-format-title" dir={fa ? 'rtl' : 'ltr'} onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') cancelGridFormatDialog() }}>
      <header><h2 id="designer-grid-format-title">{gridFormatDialog.mode === 'font' ? (fa ? `قلم — ${gridFormatDialog.scope === 'header' ? 'سرستون' : 'داده‌های ستون'}: ${gridFormatDialog.label}` : `Font — ${gridFormatDialog.scope === 'header' ? 'Header' : 'Column data'}: ${gridFormatDialog.label}`) : (fa ? `رنگ — ${gridFormatDialog.label}` : `Color — ${gridFormatDialog.label}`)}</h2><button type="button" aria-label={fa ? 'بستن' : 'Close'} onClick={cancelGridFormatDialog}>×</button></header>
      {gridFormatDialog.mode === 'font' && <div className="designer-grid-font-fields"><label>{fa ? 'قلم' : 'Font'}<select value={gridFormatDialog.fontFamily} onChange={event => updateGridFormatDialog({ fontFamily: event.target.value })}>{[['inherit', 'پیش‌فرض', 'Default'], ['vazirmatn', 'وزیرمتن', 'Vazirmatn'], ['tahoma', 'Tahoma', 'Tahoma'], ['segoe', 'Segoe UI', 'Segoe UI'], ['arial', 'Arial', 'Arial'], ['naskh', 'نسخ', 'Naskh']].map(([id, faName, enName]) => <option key={id} value={id}>{fa ? faName : enName}</option>)}</select></label><label>{fa ? 'حالت قلم' : 'Font style'}<select value={gridFormatDialog.bold ? 'bold' : 'regular'} onChange={event => updateGridFormatDialog({ bold: event.target.value === 'bold' })}><option value="regular">{fa ? 'معمولی' : 'Regular'}</option><option value="bold">{fa ? 'درشت' : 'Bold'}</option></select></label><label>{fa ? 'اندازه' : 'Size'}<input type="number" min="8" max="40" value={Number.isFinite(gridFormatDialog.fontSize) ? gridFormatDialog.fontSize : ''} onChange={event => updateGridFormatDialog({ fontSize: Number(event.target.value) })} onBlur={event => updateGridFormatDialog({ fontSize: Math.max(8, Math.min(40, Number(event.currentTarget.value) || 8)) })} /></label><div className="designer-grid-format-color"><span>{fa ? 'رنگ قلم' : 'Font color'}</span><ExcelColorPicker language={language} label={fa ? 'رنگ قلم' : 'Font color'} value={gridFormatDialog.color} onPreview={color => setColorPreviewDraft(buildGridFormatDraft(color == null ? gridFormatDialog : { ...gridFormatDialog, color }))} onCommit={handleGridFormatColorCommit} /></div><div className="designer-grid-format-preview" style={{ fontFamily: ({ inherit: 'inherit', vazirmatn: "'Vazirmatn',Tahoma,Arial,sans-serif", tahoma: 'Tahoma,Arial,sans-serif', segoe: "'Segoe UI',Tahoma,sans-serif", arial: 'Arial,sans-serif', naskh: "'Noto Naskh Arabic','B Nazanin',serif" } as Record<string, string>)[gridFormatDialog.fontFamily], fontSize: `${gridFormatDialog.fontSize}px`, fontWeight: gridFormatDialog.bold ? 700 : 400, color: gridFormatDialog.color }}>{fa ? 'پیش‌نمایش متن جدول' : 'Table text preview'}</div></div>}
      {gridFormatDialog.mode === 'color' && <div className="designer-grid-format-color-only"><span>{fa ? 'رنگ جدید را انتخاب کنید' : 'Choose a new color'}</span><ExcelColorPicker key={`${gridFormatDialog.scope}-${gridFormatDialog.id}-${gridFormatDialog.colorProperty}`} language={language} label={fa ? 'انتخاب رنگ' : 'Choose color'} value={gridFormatDialog.color} autoOpen onPreview={color => setColorPreviewDraft(buildGridFormatDraft(color == null ? gridFormatDialog : { ...gridFormatDialog, color }))} onCommit={handleGridFormatColorCommit} /></div>}
      <footer><button type="button" onClick={cancelGridFormatDialog}>{fa ? 'لغو' : 'Cancel'}</button>{gridFormatDialog.mode === 'font' && <button type="button" className="primary" onClick={applyGridFormatDialog}>{fa ? 'تأیید' : 'OK'}</button>}</footer>
    </section></div>, document.body)}
  </div>
}
