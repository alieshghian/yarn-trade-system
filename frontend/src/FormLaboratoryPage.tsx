import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Field, Shortcut } from './DefinitionControls'
import { BaseFormGridBoundary, type GridColumn } from './components/base-form/BaseFormGridBoundary'
import { BaseFormShell } from './components/base-form/BaseFormShell'
import { handleLaboratorySearchKey } from './components/base-form/formLaboratoryKeyboard'
import { FormLaboratoryDesignerPanel, type DesignerPropertyRequest } from './components/base-form/FormLaboratoryDesignerPanel'
import { ExcelColorPicker } from './components/base-form/ExcelColorPicker'
import { laboratoryDatasetSizes, type SyntheticPerson } from './components/base-form/syntheticPersons'
import { apiRequest } from './api'
import type { GridPage, GridQuery } from './components/base-form/excelGrid'
import { alignCanvasFields, designerAppearanceStyle, existingCanvasCollisions, fieldGroupRect, moveCanvasFields, resizeCanvasInputs, translateCanvasField, validateCanvasArrangement, captureDesignerPointer, createDesignerHistory, designerHistoryReducer, designerStyleForPart, layoutDesignerFields, loadDesignerDraft, resetDesignerFields, saveDesignerDraft, selectDesignerPart, selectedDesignerInputs, setDesignerAppearanceProperty, setDesignerFilterPopupFontSize, setDesignerGridSearchPosition, setDesignerProperty, stopDesignerHandleClick, type DesignerAppearanceProperty, type DesignerDraft, type DesignerCanvas, type DesignerRect, type DesignerAlignment, type DesignerLayoutOperation, type DesignerLayoutOrientation, type DesignerProperty, type DesignerValue, type GridSearchPosition } from './components/base-form/designer'
import type { BaseFormDefinition } from './components/base-form/types'
import type { Language } from './i18n'
import { contextDesignerSelection, designerActionDimensionLimits, designerActionStyle, designerActionVisible, designerEffectiveValues, designerElementAppearanceProperties, designerShortcutAction, resizeDesignerEdge, setDesignerActionProperty, setDesignerActionVisibility, setDesignerColorProperty } from './components/base-form/designer'

const laboratoryDefinition: BaseFormDefinition = {
  id: 'form-laboratory.persons-synthetic',
  actions: [
    { id: 'new-person', code: 'Space', keys: [' '], label: { fa: 'شخص جدید', en: 'New person', zh: '新建人员' }, primary: true, required: true },
    { id: 'edit-person', code: 'Insert', keys: ['Insert'], label: { fa: 'ویرایش', en: 'Edit', zh: '编辑' }, required: true, disabled: true },
    { id: 'delete-person', code: 'Delete', keys: ['Delete'], label: { fa: 'حذف', en: 'Delete', zh: '删除' }, disabled: true },
    { id: 'first-record', code: 'Home', keys: ['Home'], label: { fa: 'اول', en: 'First', zh: '首条' }, disabled: true },
    { id: 'previous-page', code: 'PgUp', keys: ['PageUp'], label: { fa: 'صفحه قبل', en: 'Previous page', zh: '上一页' }, disabled: true },
    { id: 'browse-records', code: '↑ ↓', keys: ['ArrowUp', 'ArrowDown'], label: { fa: 'مرور', en: 'Browse', zh: '浏览' }, disabled: true },
    { id: 'next-page', code: 'PgDn', keys: ['PageDown'], label: { fa: 'صفحه بعد', en: 'Next page', zh: '下一页' }, disabled: true },
    { id: 'last-record', code: 'End', keys: ['End'], label: { fa: 'آخر', en: 'Last', zh: '末条' }, disabled: true },
    { id: 'action-settings', code: '⚙', label: { fa: 'تنظیمات', en: 'Settings', zh: '设置' }, iconOnly: true, disabled: true },
    { id: 'demo-save', code: 'F3', keys: ['F3'], label: { fa: 'ذخیرهٔ نمایشی', en: 'Demo save', zh: '演示保存' }, primary: true, required: true },
    { id: 'reset-sample', code: 'Esc', keys: ['Escape'], label: { fa: 'بازنشانی نمونه', en: 'Reset sample', zh: '重置示例' } }
  ],
  sections: [{ id: 'laboratory.editor', kind: 'editor' }, { id: 'laboratory.grid', kind: 'grid' }, { id: 'laboratory.footer', kind: 'footer' }],
  fields: [
    { id: 'personCode', sectionId: 'laboratory.editor', minTracks: 2, span: 2 }, { id: 'titleId', sectionId: 'laboratory.editor', minTracks: 3, span: 3 },
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
  phone: { fa: 'تلفن', en: 'Phone', zh: '电话' }, mobile: { fa: 'موبایل', en: 'Mobile', zh: '手机' }, address: { fa: 'نشانی', en: 'Address', zh: '地址' },
  notes: { fa: 'توضیحات', en: 'Notes', zh: '说明' }, errorExample: { fa: 'نمونهٔ خطا', en: 'Error example', zh: '错误示例' }, disabledExample: { fa: 'نمونهٔ غیرفعال', en: 'Disabled example', zh: '禁用示例' }
}
const fieldIds = laboratoryDefinition.fields.map(field => field.id)
const previewWidths = { desktop: 1440, tablet: 768, mobile: 390 } as const
type PreviewDevice = keyof typeof previewWidths

export default function FormLaboratoryPage({ language, authenticatedUserId }: { language: Language, authenticatedUserId?: string }) {
  const fa = language === 'fa'
  const [datasetSize, setDatasetSize] = useState<(typeof laboratoryDatasetSizes)[number]>(100)
  const remoteGridQuery = useCallback((query: GridQuery, signal?: AbortSignal) => apiRequest<GridPage<SyntheticPerson>>('/api/form-laboratory/synthetic-grid', { method: 'POST', body: JSON.stringify({ ...query, datasetSize }), signal }), [datasetSize])
  const [draft, updateDraft] = useState({ personCode: 'LAB-000001', firstName: 'آرمان', lastName: 'رضایی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' })
  const update = (key: keyof typeof draft, value: string) => updateDraft(current => ({ ...current, [key]: value }))
  const [dataEntryActive, setDataEntryActive] = useState(false)
  const dataEntryActiveRef = useRef(false)
  const [history, dispatchHistory] = useReducer(designerHistoryReducer, undefined, () => createDesignerHistory(loadDesignerDraft(window.localStorage, authenticatedUserId, laboratoryDefinition.id, fieldIds)))
  const [colorPreviewDraft, setColorPreviewDraft] = useState<DesignerDraft | null>(null)
  const visibleDraft = colorPreviewDraft ?? history.present
  const historyRef = useRef(history)
  historyRef.current = history
  const [designerOpen, setDesignerOpen] = useState(false)
  const [gridResetRequest, setGridResetRequest] = useState(0)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [mobileWidth, setMobileWidth] = useState<390 | 320>(390)
  const previewWidth = previewDevice === 'mobile' ? mobileWidth : previewWidths[previewDevice]
  const geometryEditable = previewDevice === 'desktop'
  const [selection, setSelection] = useState<string[]>([])
  const [actionSelection, setActionSelection] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ left: number, top: number, part: 'input' | 'label' | 'action' } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [propertyRequest, setPropertyRequest] = useState<DesignerPropertyRequest>()
  const [applyToAll, setApplyToAll] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const editingBaseline = useRef<DesignerDraft | null>(null)
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
    const outside = (event: PointerEvent) => { if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null) }
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
    // Capture at window level so F1 is handled before browser/app keyboard handlers.
    // keyup is a fallback for keyboard drivers that consume the initial function-key keydown.
    window.addEventListener('keydown', focusGridSearch, true)
    window.addEventListener('keyup', focusGridSearch, true)
    return () => {
      window.removeEventListener('keydown', focusGridSearch, true)
      window.removeEventListener('keyup', focusGridSearch, true)
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
  const requestProperty = (section: DesignerPropertyRequest['section'], property?: DesignerProperty) => {
    setContextMenu(null)
    setPropertyRequest(current => ({ sequence: (current?.sequence ?? 0) + 1, section, property }))
  }
  useEffect(() => {
    const restored = loadDesignerDraft(window.localStorage, authenticatedUserId, laboratoryDefinition.id, fieldIds)
    dispatchHistory({ type: 'replace', draft: restored })
    editingBaseline.current = null
    setSaveStatus('')
  }, [authenticatedUserId])

  const selectField = (id: string, event: { ctrlKey: boolean, metaKey: boolean }, part: 'field' | 'label' | 'input' = 'field') => {
    setActionSelection([])
    setSelection(current => selectDesignerPart(current, id, part, event.ctrlKey || event.metaKey))
  }
  const mapDesignerPropertyTargets = (property: DesignerProperty, targets: string[], value: DesignerValue | undefined) => {
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
  const changeActionVisibility = (id: string, visible: boolean) => {
    const action = laboratoryDefinition.actions?.find(item => item.id === id)
    if (!action) return
    if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null; dispatchHistory({ type: 'commitTransaction' }) }
    dispatchHistory({ type: 'change', draft: setDesignerActionVisibility(historyRef.current.present, action, visible) })
    if (!visible && !action.required) setActionSelection(current => current.filter(selected => selected !== id))
    setSaveStatus('')
  }
  const runAction = (id: string) => {
    const action = laboratoryDefinition.actions?.find(item => item.id === id)
    if (designerOpen || !action || action.disabled || !designerActionVisible(historyRef.current.present, action)) return
    if (id === 'new-person') {
      dataEntryActiveRef.current = true
      setDataEntryActive(true)
      updateDraft({ personCode: '', firstName: '', lastName: '', phone: '', mobile: '', address: '', notes: '' })
      requestAnimationFrame(() => formGridRef.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus())
    }
    if (id === 'demo-save') window.alert(fa ? 'در آزمایشگاه هیچ داده‌ای ذخیره نمی‌شود.' : 'Laboratory data is never persisted.')
    if (id === 'demo-save' || id === 'reset-sample') {
      dataEntryActiveRef.current = false
      setDataEntryActive(false)
    }
    if (id === 'reset-sample') updateDraft({ personCode: 'LAB-000001', firstName: 'آرمان', lastName: 'رضایی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' })
  }
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
    const saved = saveDesignerDraft(window.localStorage, authenticatedUserId, laboratoryDefinition.id, history.present, fieldIds)
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
  const resetAll = () => { setFrozenCanvas(null); const { canvas: _canvas, ...reset } = resetDesignerFields(history.present, fieldIds); updateDraftState({ ...reset, appearance: undefined, defaults: undefined, actions: undefined, filterPopupFontSize: undefined, gridSearchPosition: undefined }) }
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
      const input = element.querySelector('.designer-input-part > :is(input,select,textarea)'), label = element.querySelector('.designer-label-part')
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
  const beginInputResize = (event: React.PointerEvent<HTMLElement>, fieldId: string, edge: 'left' | 'right' | 'top' | 'bottom') => {
    if (!designerOpen || !canvas || event.button !== 0) return
    gestureCleanup.current?.()
    const ids = selectedDesignerInputs(selection, fieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    const initialCanvas = canvas, startDraft = historyRef.current.present
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerPointer(event, (dx, dy) => {
      const resized = resizeCanvasInputs(initialCanvas, targets, edge, edge === 'left' || edge === 'right' ? dx : dy)
      flushSync(() => dispatchHistory({ type: 'change', draft: withCanvas(startDraft, resized) }))
    }, finishGesture)
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
  const undo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'undo' }) }
  const redo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'redo' }) }
  const handleDesignerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'F8' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) setGridResetRequest(current => current + 1)
      return
    }
    const shortcutKey = laboratoryDefinition.actions?.some(action => action.keys?.includes(event.key))
    if (shortcutKey && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('[role="dialog"], .excel-color-picker.is-open')) return
      // Own this form's shortcuts even when an action is hidden or disabled.
      // Editable controls retain native typing/navigation; picker dialogs own Escape.
      event.stopPropagation()
      const editingField = target instanceof HTMLElement && (target.matches('input, select, textarea, [contenteditable="true"]') || target.isContentEditable)
      if (editingField && dataEntryActiveRef.current && ['F3', 'Escape'].includes(event.key)) {
        event.preventDefault()
        if (!event.repeat) runAction(event.key === 'F3' ? 'demo-save' : 'reset-sample')
        return
      }
      if (editingField || (event.key === ' ' && target instanceof HTMLElement && target.closest('button'))) return
      event.preventDefault()
      if (!designerOpen && !event.repeat) {
        const action = designerShortcutAction(historyRef.current.present, laboratoryDefinition.actions ?? [], event.key)
        if (action) runAction(action.id)
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
    const selected = designerOpen && selection.includes(`${id}::field`)
    const inputSelected = designerOpen && (selected || selection.includes(`${id}::input`))
    const labelSelected = designerOpen && (selected || selection.includes(`${id}::label`))
    const fieldLabel = labels[id][language]
    return <div key={id} className={'laboratory-designer-field ' + layoutClass + (selection.some(key => key.startsWith(`${id}::`)) ? ' is-selected' : '')} data-field-id={id} style={canvas?.fields[id]?.error ? { '--canvas-error-left': canvas.fields[id].error!.left + 'px', '--canvas-error-top': canvas.fields[id].error!.top + 'px', '--canvas-error-width': canvas.fields[id].error!.width + 'px', '--canvas-error-height': canvas.fields[id].error!.height + 'px' } as CSSProperties : undefined} role="group" aria-label={fieldLabel}>
      <button type="button" className="laboratory-field-select" style={rectStyle(canvas?.fields[id]?.select)} aria-label={(fa ? 'انتخاب فیلد ' : language === 'zh' ? '选择字段 ' : 'Select field ') + fieldLabel} aria-pressed={selected} onClick={event => selectField(id, event)}>{selected ? '✓' : '+'}</button>
      <Field label={fieldLabel} labelId={`laboratory-label-${id}`} labelContent={<span className={'designer-label-part' + (labelSelected ? ' designer-part-selected' : '')} style={partStyle(id, 'label')} onClick={event => { if (designerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) { return } selectField(id, event, 'label') } }}>{fieldLabel}{labelSelected && <>{geometryEditable && <button type="button" className="designer-move-handle" aria-label="Move label" onClick={stopDesignerHandleClick} onPointerDown={event => beginFieldMove(event, `${id}::label`, 'label')}>↕</button>}<span className="designer-type-tools"><button type="button" aria-label="Decrease label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.max(8, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) - 1)) }}>A−</button><button type="button" aria-label="Increase label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.min(40, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) + 1)) }}>A+</button><button type="button" aria-label="Toggle label bold" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'bold', !(history.present.overrides[`${id}::label`]?.bold ?? false)) }}>B</button><ExcelColorPicker language={language} label="Label color" value={String(designerEffectiveValues(visibleDraft, id, 'label').textColor ?? getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() ?? '#71817e')} onPreview={value => previewColorProperty('labelColor', value, [`${id}::label`])} onCommit={value => commitColorProperty('labelColor', value, [`${id}::label`])} /></span></>}</span>} controlContent={<span className={'designer-input-part' + (inputSelected ? ' designer-part-selected' : '')} style={partStyle(id, 'input')} onClick={event => { if (designerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) { return } selectField(id, event, 'input') } }}>{React.isValidElement(control) ? React.cloneElement(control as React.ReactElement<{ style?: CSSProperties }>, { style: { ...designerStyleForPart(visibleDraft, id, 'input') as CSSProperties, ...((control as React.ReactElement<{ style?: CSSProperties }>).props.style ?? {}) } }) : control}{inputSelected && geometryEditable && <><button type="button" className="designer-move-handle" aria-label="Move input" onClick={stopDesignerHandleClick} onPointerDown={event => beginFieldMove(event, `${id}::input`, 'input')}>↕</button>{(['left', 'right', 'top', 'bottom'] as const).map(edge => <button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize input ${edge}`} onClick={stopDesignerHandleClick} onPointerDown={event => beginInputResize(event, id, edge)} />)}</>}</span>} error={error} style={designerStyleForPart(visibleDraft, id, 'field') as CSSProperties}>{control}</Field>
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
  return <div className="form-laboratory-page" dir={fa ? 'rtl' : 'ltr'} data-form-laboratory data-synthetic-only="true" data-entry-active={dataEntryActive || undefined} onKeyDown={handleDesignerKey} onContextMenu={openContextMenu}>
    <header className="form-laboratory-banner"><div className="laboratory-banner-title"><strong>{title}</strong><span>{fa ? 'محیط مستقل با دادهٔ قطعی و مصنوعی؛ هیچ API اشخاصی فراخوانی نمی‌شود.' : language === 'zh' ? '独立的确定性合成数据环境；不会调用人员 API。' : 'Independent deterministic synthetic data; no Persons API is called.'}</span></div><div className="laboratory-banner-actions"><div className="laboratory-device-toolbar" role="group" aria-label={fa ? 'پیش‌نمایش دستگاه' : 'Device preview'}>{(Object.keys(previewWidths) as PreviewDevice[]).map(device => <button key={device} type="button" aria-pressed={previewDevice === device} onClick={() => setPreviewDevice(device)} title={previewWidths[device] + 'px'}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">{device === 'desktop' ? <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M7 21h10" /></> : <><rect x={device === 'tablet' ? 5 : 7} y="2" width={device === 'tablet' ? 14 : 10} height="20" rx="2" /><path d="M11 19h2" /></>}</svg>{fa ? ({ desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' })[device] : ({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]}</button>)}{previewDevice === 'mobile' && <select aria-label={fa ? 'عرض موبایل' : 'Mobile width'} value={mobileWidth} onChange={event => setMobileWidth(Number(event.target.value) as 390 | 320)}><option value="390">390px</option><option value="320">320px</option></select>}</div><label>{fa ? 'اندازهٔ داده' : language === 'zh' ? '数据量' : 'Dataset size'}<select value={datasetSize} onChange={event => setDatasetSize(Number(event.target.value) as typeof datasetSize)}>{laboratoryDatasetSizes.map(size => <option key={size} value={size}>{size.toLocaleString()}</option>)}</select></label><button type="button" className="laboratory-history-button" aria-label={fa ? 'واگرد' : 'Undo'} title="Ctrl+Z" disabled={!history.past.length} onClick={undo}>↶</button><button type="button" className="laboratory-history-button" aria-label={fa ? 'ازنو' : 'Redo'} title="Ctrl+Y" disabled={!history.future.length} onClick={redo}>↷</button><button type="button" className="laboratory-designer-toggle" aria-label={settingsLabel} title={settingsLabel} aria-expanded={designerOpen} aria-controls="form-laboratory-designer" onClick={openDesigner}>⚙</button></div></header>
    <div className={"laboratory-workspace" + (designerOpen ? " has-designer" : "")}>
      {designerOpen && <FormLaboratoryDesignerPanel geometryEditable={geometryEditable} propertyRequest={propertyRequest} onElementAppearanceCommit={commitElementAppearance} onElementAppearancePreview={previewElementAppearance} onFinishPropertyChange={finishPropertyChange} language={language} draft={visibleDraft} filterPopupFontSize={history.present.filterPopupFontSize ?? 16} onFilterPopupFontSizeChange={updateFilterPopupFontSize} gridSearchPosition={history.present.gridSearchPosition ?? 'right'} onGridSearchPositionChange={updateGridSearchPosition} onBeginFilterPopupFontSizeChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitFilterPopupFontSizeChange={() => dispatchHistory({ type: 'commitTransaction' })} selectedFieldIds={selection} selectedActionIds={actionSelection} actions={laboratoryDefinition.actions ?? []} onActionVisibilityChange={changeActionVisibility} onSelectAction={id => { setSelection([]); setActionSelection([id]); setApplyToAll(false) }} onActionColorCommit={commitActionColor} onActionColorPreview={previewActionColor} onClearSelection={() => { setSelection([]); setActionSelection([]) }} fieldIds={fieldIds} fieldLabels={Object.fromEntries(fieldIds.map(id => [id, labels[id][language]]))} applyToAll={applyToAll} canSave={Boolean(authenticatedUserId)} saveStatus={saveStatus} onApplyToAllChange={setApplyToAll} onChange={updateProperty} onColorCommit={commitColorProperty} onColorPreview={previewColorProperty} onAppearanceColorCommit={commitAppearanceColor} onAppearanceColorPreview={previewAppearanceColor} onBeginColorChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitColorChange={() => dispatchHistory({ type: 'commitTransaction' })} onUndo={undo} onRedo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onResetSelected={resetSelected} onResetAll={resetAll} onSave={saveDraft} onCancel={cancelDesigner} onSelectAll={() => { setActionSelection([]); setSelection(fieldIds.map(id => `${id}::input`)) }} onLayout={applyLayout} onAlign={applyAlignment} referenceFieldId={referenceId} onReferenceChange={setReferenceId} layoutStatus={layoutStatus} />}
    <div className="laboratory-preview-scroll" role="region" aria-label={fa ? 'فضای پیش‌نمایش دستگاه' : 'Device preview workspace'} tabIndex={0}><div className="laboratory-preview-viewport" data-preview-device={previewDevice} data-preview-width={previewWidth} style={{ width: previewWidth }}>
    <BaseFormShell formId={laboratoryDefinition.id}
      editor={<div className="person-editor panel laboratory-editor" style={appearanceStyle}><div ref={formGridRef} className={'person-form-grid laboratory-form-grid' + (canvas ? ' has-fixed-geometry' : '')} style={canvas ? { width: canvas.width, height: canvas.height, minWidth: canvas.width } : undefined} data-section-id="laboratory.editor" onClick={event => { if (designerOpen && event.target === event.currentTarget) setSelection([]) }}>
        {renderField('personCode', 'lab-person-code', <input aria-label={labels.personCode[language]} value={draft.personCode} onChange={event => update('personCode', event.target.value)} />)}
        {renderField('titleId', 'lab-title', <select aria-label={labels.titleId[language]}><option>{fa ? 'آقای' : 'Mr.'}</option><option>{fa ? 'شرکت' : 'Company'}</option></select>)}
        {renderField('firstName', 'lab-first', <input aria-label={labels.firstName[language]} value={draft.firstName} onChange={event => update('firstName', event.target.value)} />)}
        {renderField('lastName', 'lab-last', <input aria-label={labels.lastName[language]} value={draft.lastName} onChange={event => update('lastName', event.target.value)} />)}
        {renderField('jobId', 'lab-job', <select aria-label={labels.jobId[language]}><option>{fa ? 'مشتری' : 'Customer'}</option><option>{fa ? 'تأمین‌کننده' : 'Supplier'}</option></select>)}
        {renderField('nationalityId', 'lab-nationality', <select aria-label={labels.nationalityId[language]}><option>{fa ? 'ایرانی' : 'Iranian'}</option><option>{fa ? 'چینی' : 'Chinese'}</option></select>)}
        {renderField('phone', 'lab-phone', <input dir="ltr" aria-label={labels.phone[language]} value={draft.phone} onChange={event => update('phone', event.target.value)} />)}
        {renderField('mobile', 'lab-mobile', <input dir="ltr" aria-label={labels.mobile[language]} value={draft.mobile} onChange={event => update('mobile', event.target.value)} />)}
        {renderField('disabledExample', 'lab-disabled', <input disabled value={fa ? 'فقط نمایشی' : 'Display only'} readOnly />)}
        {renderField('address', 'lab-address', <textarea aria-label={labels.address[language]} value={draft.address} onChange={event => update('address', event.target.value)} />)}
        {renderField('notes', 'lab-notes', <textarea aria-label={labels.notes[language]} placeholder={fa ? 'نمونهٔ حالت عادی' : 'Normal state example'} value={draft.notes} onChange={event => update('notes', event.target.value)} />)}
        {renderField('errorExample', 'lab-error', <input aria-label={labels.errorExample[language]} aria-invalid="true" defaultValue="نمونه" />, fa ? 'دادهٔ آزمایشی نامعتبر است.' : 'Synthetic validation example.')}
      </div>{!canvas && geometryEditable && <div className="designer-canvas-spacer" aria-hidden="true" style={canvasStyle} />}</div>}
      grid={<div className="person-grid-panel panel laboratory-grid"><BaseFormGridBoundary rows={[]} columns={columns} language={language} appearanceStyle={appearanceStyle} filterPopupFontSize={history.present.filterPopupFontSize ?? 16} remoteQuery={remoteGridQuery} resetRequest={gridResetRequest} gridSearchPosition={history.present.gridSearchPosition ?? 'right'} /></div>}
      footer={<div className="shortcut-bar laboratory-footer" role="group" aria-label={fa ? 'دکمه‌های پایین فرم' : 'Form actions'} style={appearanceStyle}>{laboratoryDefinition.actions?.filter(action => designerActionVisible(visibleDraft, action)).map(action => <span key={action.id} data-action-id={action.id} className={'laboratory-action-button' + (action.iconOnly ? ' is-icon-action' : '') + (designerOpen && actionSelection.includes(action.id) ? ' designer-part-selected' : '')} style={{ '--lab-action-default-width': `${action.iconOnly ? 54 : action.primary ? 150 : 122}px`, ...designerActionStyle(visibleDraft, action.id) } as CSSProperties} title={!designerOpen && action.disabled ? fa ? 'این عملیات در نمونهٔ آزمایشگاهی فعال نیست.' : 'This action is unavailable in the laboratory sample.' : undefined} onClickCapture={event => {
        if (!designerOpen || (event.target as HTMLElement).closest('.designer-edge-handle')) return
        event.preventDefault(); event.stopPropagation(); setSelection([])
        setActionSelection(current => event.ctrlKey || event.metaKey ? current.includes(action.id) ? current.filter(id => id !== action.id) : [...current, action.id] : [action.id])
      }}><Shortcut code={action.code} label={action.label[language]} disabled={!designerOpen && action.disabled} primary={action.primary} onClick={() => runAction(action.id)} />{designerOpen && geometryEditable && actionSelection.includes(action.id) && (['left', 'right', 'top', 'bottom'] as const).map(edge => <button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize action ${action.id} ${edge}`} onClick={stopDesignerHandleClick} onPointerDown={event => beginActionResize(event, action.id, edge)} />)}</span>)}<span className="laboratory-action-note">{fa ? 'فقط دادهٔ مصنوعی' : 'Synthetic data only'}</span></div>}
      style={appearanceStyle}
    />
    </div></div>
    </div>
    {designerOpen && contextMenu && createPortal(<div ref={contextMenuRef} className="designer-context-menu" role="menu" aria-label="ویژگی‌های انتخاب" dir="rtl" style={{ left: contextMenu.left, top: contextMenu.top }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
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
    </div>, document.body)}
  </div>
}
