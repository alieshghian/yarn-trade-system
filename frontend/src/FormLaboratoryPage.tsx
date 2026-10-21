import { centerCanvasRows } from './components/base-form/designer'
import {appearanceColors,appearanceBoxCommands} from './components/base-form/appearanceCommands'
import {FormBehaviorControls} from './components/base-form/FormBehaviorControls'
import { LabelEditorDialog } from './components/base-form/LabelEditorDialog'
import { DocumentDialogCloseButton } from './components/base-form/FormDocumentDialog'
import { effectiveFieldRules, fieldRuleMarkers, validateRecordRules } from './components/base-form/fieldRules'
import {behaviorIdFor,currentFormPolicy,resolveFormBehavior,readFormBehaviors,resolveColumnLinkBehavior,type FormBehaviorLibrary,formBehaviorEvent,formTestReducer,initialFormTest,formTestActionFor,testActionVisible,validateTestRecord} from './components/base-form/formBehavior'
import {ComponentLibraryEditor} from './components/base-form/ComponentLibraryEditor'
import { moveToolbarPart, patchToolbarParts, toolbarHeaderFor, toolbarPartLabel, toolbarPartLabels, type GridToolbarPart, type GridToolbarPartStyle, type GridToolbarSettings } from './components/base-form/gridToolbarLayout'
import { editorViewport, fitAutomaticEditors } from './components/base-form/formEditorViewport'
import { LaboratoryThemeEditor } from './components/base-form/ThemeDesignControls'
import { GridToolbarControls } from './components/base-form/GridToolbarControls'
import { FormCatalogList } from './components/base-form/FormCatalogList'
import { FormMenuPlacement } from './components/base-form/PendingFormDesignMenu'
import { createOperationalRedesign, operationalSource, operationalFormCatalog, type OperationalFormContract } from './components/base-form/operationalFormCatalog'
import { classifyRedesign, finalizeDesign, loadDesignReleases } from './components/base-form/formDesignReleases'
import React, { useCallback, useReducer, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Field, Shortcut } from './DefinitionControls'
import { NumberControl } from './components/base-form/NumberControl'
import SystemDateInput from './SystemDateInput'
import {defaultCodeComponentSettings,nextIncrementalCode,validateComponentCode,type CodeComponentSettings} from './components/base-form/serialCode'
import { PersonTitleControl } from './components/base-form/PersonTitleControl'
import { FormValueList } from './components/base-form/FormValueList'
import { FormBuilderSandbox } from './components/base-form/FormBuilderSandbox'
import { useDesignerSession } from './components/base-form/useDesignerSession'
import type { PersonTitleOption } from './components/base-form/PersonTitleControl'
import { type GridColumn } from './components/base-form/BaseFormGridBoundary'
import { FormSchemaPresentation } from './components/base-form/FormSchemaPresentation'
import { FormTableStructureControls } from './components/base-form/FormTableStructureControls'
import { laboratoryColumnFieldLinks, columnLabelMismatch, composeColumnFieldValue, unresolvedTableColumns, unresolvedFormFields, normalizeFormLinks, preserveFormLinks, removeDocumentColumn, removeDocumentTable, updateDocumentColumn, moveDocumentColumn } from './components/base-form/formTableStructure'
import { readFormRecovery, writeFormRecovery, writeFormRecoveryResult, closeFormRecovery, recoverableDeletedFields, recoverableDeletedTables, restoreRecoverableTable, restoreRecoverableField, type RecoverableForm } from './components/base-form/formDocumentRecovery'
import { FieldCreationControls, FieldEditingControls, ActionCreationControls } from './components/base-form/FormFieldStructureControls'
import { addToolbarHeaderPanel, addTableHeaderRow, loadFieldBlueprints, saveFieldBlueprint, type FieldBlueprint } from './components/base-form/formDocumentControls'
import { FormDocumentSettings, FormCustomizationPermissions, FormDocumentDialog } from './components/base-form/FormDocumentSettings'
import { sectionFormSchema, usesFormComposition } from './components/base-form/formDocumentStructure'
import { designerDraftForEditor, designerDraftForTable, designerRectStyle, updateTableDesigner } from './components/base-form/formDocumentDesigner'
import { registerTemplateRevision, templateRevisionConflicts } from './components/base-form/formTemplateInheritance'
import { designerCanvasViewOrigin, inspectRegisteredFormLayouts, resolveFormLayout, type FormLayoutContract } from './components/base-form/formLayoutContract'
import { handleLaboratorySearchKey } from './components/base-form/formLaboratoryKeyboard'
import { functionKeyFromEvent } from './components/base-form/functionKeys'
import { FormLaboratoryDesignerPanel, type DesignerPropertyRequest } from './components/base-form/FormLaboratoryDesignerPanel'
import { ExcelColorPicker } from './components/base-form/ExcelColorPicker'
import { laboratoryDatasetSizes, type SyntheticPerson } from './components/base-form/syntheticPersons'
import { apiRequest } from './api'
import { gridValueKey, type GridPage, type GridQuery } from './components/base-form/excelGrid'
import { alignCanvasFields, designerActionCode, designerActionLabel, designerActionTextStyle, designerAppearanceStyle, existingCanvasCollisions, fieldGroupRect, moveCanvasFields, resizeCanvasHandle, resizeCanvasDimension, designerResizeHandles, type DesignerResizeHandle, translateCanvasField, validateCanvasArrangement, captureDesignerPointer, designerStyleForPart, layoutDesignerFields, loadDesignerDraft, resetDesignerFields, saveDesignerDraft, selectDesignerPart, selectedDesignerInputs, setDesignerActionText, setDesignerActionTextProperty, setDesignerAppearanceProperty, setDesignerButtonPressEffect, setDesignerFilterPopupFontSize as setFilterSizeBase, setDesignerGridSearchPosition as setSearchPositionBase, setDesignerTableColumnStyle as setTableColumnBase, setDesignerTableHeaderStyle as setTableHeaderBase, setDesignerTableHeaderHeight as setTableHeightBase, setDesignerTableFont as setTableFontBase, setDesignerProperty, stopDesignerHandleClick, type DesignerActionTextPart, type DesignerAppearanceProperty, type DesignerDraft, type DesignerCanvas, type DesignerRect, type DesignerAlignment, type DesignerLayoutOperation, type DesignerLayoutOrientation, type DesignerProperty, type DesignerValue, type GridSearchPosition } from './components/base-form/designer'
import type { FormSchemaDraft } from './components/base-form/formSchema'
import type { BaseFormAction, BaseFormDefinition } from './components/base-form/types'
import type { Language } from './i18n'
import { designerActionVisible, designerShortcutAction, setDesignerActionVisibility } from './components/base-form/designer'
import { contextDesignerSelection, designerActionDimensionLimits, designerActionStyle, designerEffectiveValues, designerElementAppearanceProperties, resizeDesignerEdge, setDesignerActionProperty, setDesignerColorProperty } from './components/base-form/designer'
import { commitManagedFormStructure, createManagedFormStructureHistory, createManagedLaboratoryForm, laboratoryTemplateVersion, loadManagedLaboratoryForms, redoManagedFormStructure, removeManagedFormField, renameManagedFormField, resolveManagedLaboratoryDesigner, saveManagedLaboratoryForm, managedFormWithDesigner, managedLaboratoryFormsStorageKey, ensureLaboratoryTemplateFieldLayout, undoManagedFormStructure, type ManagedFormFrame, type ManagedFormMode, type ManagedFormStructureHistory, type ManagedLaboratoryForm, type ManagedLaboratoryForms } from './components/base-form/laboratoryFormDraftState'

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
const laboratoryPresentationSchema: Pick<FormSchemaDraft, 'id' | 'sections' | 'layout'> = {
  id: laboratoryDefinition.id,
  sections: laboratoryDefinition.sections,
  layout: { direction: 'vertical', gap: 0 }
}
const laboratoryTemplatePreviewSchema: Pick<FormSchemaDraft, 'id' | 'sections' | 'layout'> = {
  ...laboratoryPresentationSchema,
  id: 'form-laboratory.shared-template-preview'
}
const laboratorySchemaFieldKinds: Record<string, 'text' | 'select' | 'valueList'> = {
  personCode: 'text', titleId: 'valueList', firstName: 'text', lastName: 'text', jobId: 'select', nationalityId: 'select',
  phone: 'valueList', mobile: 'valueList', address: 'valueList', notes: 'text', errorExample: 'text', disabledExample: 'text'
}
const laboratoryColumnLabels: Record<string, Record<Language, string>> = {
  personCode: { fa: 'کد', en: 'Code', zh: '代码' }, displayName: { fa: 'نام', en: 'Name', zh: '姓名' },
  job: { fa: 'نقش', en: 'Role', zh: '角色' }, nationality: { fa: 'ملیت', en: 'Nationality', zh: '国籍' },
  mobile: { fa: 'موبایل', en: 'Mobile', zh: '手机' }, address: { fa: 'نشانی', en: 'Address', zh: '地址' }
}
function createLaboratorySchemaTemplate(designer: DesignerDraft): FormSchemaDraft {
  return ensureLaboratoryTemplateFieldLayout({
    id: laboratoryDefinition.id, schemaVersion: 1, version: 1, status: 'draft', mode: 'operational',
    title: { fa: 'آزمایشگاه فرم‌ها', en: 'Form Laboratory', zh: '表单实验室' },
    sections: laboratoryDefinition.sections.map(section => ({ ...section, purpose: section.kind === 'grid' ? 'reporting' : 'operational' })),
    fields: laboratoryDefinition.fields.map((field, order) => ({ ...field, kind: laboratorySchemaFieldKinds[field.id], componentId: `form-laboratory.${field.id}`, label: labels[field.id], order, ...(field.id === 'disabledExample' || field.id === 'errorExample' ? { readOnly: true } : {}) })),
    actions: laboratoryDefinition.actions,
    tables: [{
      id: 'laboratory.synthetic-persons', sectionId: 'laboratory.grid', dataSourceId: 'form-laboratory.synthetic-persons',
      title: { fa: 'جدول دادهٔ مصنوعی', en: 'Synthetic data table', zh: '合成数据表' },
      columns: columns.map((column, order) => ({ id: column.id, binding: { kind: 'dataField' as const, dataFieldId: column.id }, sourceFieldIds: laboratoryColumnFieldLinks[column.id], label: laboratoryColumnLabels[column.id], width: column.width, sortable: true, filterable: true, order })),
      searchable: true, columnSelection: true, rowSelection: 'single', contextMenu: true, lazyLoading: true, virtualScrolling: true
    }],
    resources: { dataSourceIds: ['form-laboratory.synthetic-persons'] },
    layout: { direction: 'vertical', gap: 0 }, templateFormId: laboratoryDefinition.id,
    settings: { shared: { standardId: laboratoryDefinition.id, version: 1, designer }, specific: { designer: { properties: {}, appearance: {}, components: {} } } }
  })
}
function browserFormStorage(): Storage | undefined { try { return window.localStorage } catch { return undefined } }
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
function loadLaboratoryColorBaseline(userId?: string): DesignerDraft {
  const stored = loadLaboratoryDraft(userId)
  let storage: Storage | undefined
  try { storage = window.localStorage } catch { /* Use the corrected session palette without storage. */ }
  const key = `yarn-trade:form-lab-field-palette:v1:${encodeURIComponent(userId ?? '')}:${laboratoryDefinition.id}`
  try { if (userId && storage?.getItem(key) === 'restored') return stored } catch { /* Restore only the field fills below. */ }
  const clearFill = (values: DesignerDraft['overrides'][string] = {}) => {
    const { backgroundColor: _background, disabledColor: _disabled, componentAddBackground: _add, ...rest } = values
    return rest
  }
  const overrides = Object.fromEntries(Object.entries(stored.overrides).map(([id, values]) => [id, id.endsWith('::label') ? values : clearFill(values)]))
  const next: DesignerDraft = {
    ...stored, overrides,
    defaults: { ...stored.defaults, input: { ...clearFill(stored.defaults?.input), backgroundColor: '#f4f6f5' } },
    appearance: { ...stored.appearance, entryFieldBackground: '#d8d8d8' }
  }
  if (userId && storage) {
    try {
      if (!storage.getItem(`${key}:previous-draft`)) storage.setItem(`${key}:previous-draft`, JSON.stringify(stored))
      if (saveDesignerDraft(storage, userId, laboratoryDefinition.id, next, fieldIds)) storage.setItem(key, 'restored')
    } catch { /* Keep the corrected session usable if persistence is blocked. */ }
  }
  return next
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
    const height = stored.height === null ? null : typeof stored.height === 'number' && Number.isFinite(stored.height) ? Math.max(320, Math.min(2400, stored.height)) : defaults.height
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
const sharedPresentationRows = [
  { id: 'shared-preview-1', personCode: 'LAB-PREVIEW-001', displayName: 'آرمان رضایی', job: 'مشتری', nationality: 'ایرانی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' },
  { id: 'shared-preview-2', personCode: 'LAB-PREVIEW-002', displayName: 'سارا کریمی', job: 'فروشنده', nationality: 'ایرانی', phone: '0211000002', mobile: '09121000002', address: 'نشانی مصنوعی شماره ۲', notes: '' }
] as SyntheticPerson[]
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
// Browser font synthesis supplies these faces when an installed family lacks a separate font file.
const gridFontStyleSupport: Record<string, { bold: boolean; italic: boolean }> = Object.fromEntries(
  ['inherit', 'vazirmatn', 'tahoma', 'segoe', 'arial', 'naskh', 'aptos', 'calibri', 'cambria', 'consolas', 'courier', 'georgia', 'times', 'verdana'].map(family => [family, { bold: true, italic: true }])
)

export default function FormLaboratoryPage({ language, authenticatedUserId, requestedDesign }: { language: Language, authenticatedUserId?: string, requestedDesign?: { id: string; sequence: number } }) {
  const fa = language === 'fa'
  const gridWord = (faText: string, enText: string, zhText: string) => fa ? faText : language === 'zh' ? zhText : enText
  const gridFonts = [['inherit', 'پیش‌فرض', 'Default', '默认'], ['vazirmatn', 'وزیرمتن', 'Vazirmatn', 'Vazirmatn'], ['tahoma', 'Tahoma', 'Tahoma', 'Tahoma'], ['segoe', 'Segoe UI', 'Segoe UI', 'Segoe UI'], ['arial', 'Arial', 'Arial', 'Arial'], ['naskh', 'نسخ', 'Naskh', 'Naskh'], ['aptos', 'Aptos', 'Aptos', 'Aptos'], ['calibri', 'Calibri', 'Calibri', 'Calibri'], ['cambria', 'Cambria', 'Cambria', 'Cambria'], ['consolas', 'Consolas', 'Consolas', 'Consolas'], ['courier', 'Courier New', 'Courier New', 'Courier New'], ['georgia', 'Georgia', 'Georgia', 'Georgia'], ['times', 'Times New Roman', 'Times New Roman', 'Times New Roman'], ['verdana', 'Verdana', 'Verdana', 'Verdana']] as const
  const gridFontSizes = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]
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
  const designerEntrySnapshot = useRef<typeof defaultPersonDraft | null>(null)
  const runActionRef = useRef<(id: string) => void>(() => {})
  const [startupRecovery] = useState(() => readFormRecovery(browserFormStorage(), authenticatedUserId))
  const recoveredStartup = startupRecovery?.activeFormId ? startupRecovery.documents[startupRecovery.activeFormId]?.current : undefined
  const [recoveryStatus, setRecoveryStatus] = useState('')
  const recoverySnapshotRef = useRef<RecoverableForm | null>(null)
  const [recoveryRevision, setRecoveryRevision] = useState(0)
  const [designerOpen, setDesignerOpen] = useState(Boolean(recoveredStartup))
  const [themeEditorOpen, setThemeEditorOpen] = useState(false)
  const [formsManagerOpen, setFormsManagerOpen] = useState(false)
  const [sharedTemplatePreviewOpen, setSharedTemplatePreviewOpen] = useState(false)
  const sharedPreviewHeaderRef = useRef<HTMLElement>(null)
  const [managedForms, setManagedForms] = useState<ManagedLaboratoryForms>(() => loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId) ?? { version: 1, activeFormId: null, forms: [] })
  const [motherSchema, setMotherSchema] = useState<FormSchemaDraft | null>(() => managedForms.templateRevision?.schema ?? null)
  const [motherStructureHistory, setMotherStructureHistory] = useState<ManagedFormStructureHistory<FormSchemaDraft> | null>(null)
  const [activeEditorSectionId, setActiveEditorSectionId] = useState('laboratory.editor')
  const [selectedTableId, setSelectedTableId] = useState('laboratory.synthetic-persons')
  const activeTableIdRef = useRef(selectedTableId)
  const [managedSaveDialogOpen, setManagedSaveDialogOpen] = useState(false)
  const [templateRegistrationOpen, setTemplateRegistrationOpen] = useState(false)
  const [templateTargetIds, setTemplateTargetIds] = useState<string[]>([])
  const [templateRegistrationStatus, setTemplateRegistrationStatus] = useState('')
  const [fieldBlueprints, setFieldBlueprints] = useState<FieldBlueprint[]>(() => loadFieldBlueprints(browserFormStorage(), authenticatedUserId))
  const [structureDialog, setStructureDialog] = useState<{ kind: 'addField' | 'editField' | 'addAction' | 'table'; tableId?: string; sectionId?: string; fieldId?: string; sourceId?: string } | null>(null)
  const [externalSidebarHost, setExternalSidebarHost] = useState<HTMLDivElement | null>(null)
  const saveBlueprint = (blueprint: FieldBlueprint) => { const next = saveFieldBlueprint(browserFormStorage(), authenticatedUserId, blueprint); if (!next) return false; setFieldBlueprints(next); return true }
  const [componentLibraryOpen,setComponentLibraryOpen]=useState(false)
  const [managedFormsListOpen, setManagedFormsListOpen] = useState(false)
  const [managedFormEditorOpen, setManagedFormEditorOpen] = useState(Boolean(recoveredStartup))
  const [managedSettingsTab, setManagedSettingsTab] = useState<'design' | 'settings'>('design')
  const [managedFormDraft, setManagedFormDraft] = useState<ManagedLaboratoryForm | null>(recoveredStartup?.form ?? null)
  const [managedFormSaved, setManagedFormSaved] = useState(false)
  const [managedFormStatus, setManagedFormStatus] = useState('')
  const [managedStructureEditing, setManagedStructureEditing] = useState(false)
  const [managedSelectedFieldId, setManagedSelectedFieldId] = useState<string | null>(null)
  const [labelEditDialog, setLabelEditDialog] = useState<{ kind: 'field' | 'column'; id: string; tableId?: string; value: string } | null>(null)
  const [managedStructureHistory, setManagedStructureHistory] = useState<ManagedFormStructureHistory<FormSchemaDraft> | null>(recoveredStartup?.structureHistory ?? null)
  const [managedSidebarCollapsed, setManagedSidebarCollapsed] = useState(false)
  const [managedFrameOffsets, setManagedFrameOffsets] = useState<Record<string, { x: number, y: number }>>({})
  const layoutWarnings = useRef(new Set<string>())
  const renderedLayoutRoots = useRef(new Map<HTMLElement, FormLayoutContract>())
  const [layoutWarningMessages, setLayoutWarningMessages] = useState<string[]>([])
  const designerWasOpenBeforeManaged = useRef(false)
  const activeManagedForm = managedFormEditorOpen ? managedFormDraft : null
  const activeFieldIds = (activeManagedForm?.schema ?? motherSchema)?.fields.map(field => field.id) ?? fieldIds
  const activeActions = (activeManagedForm?.schema ?? motherSchema)?.actions ?? laboratoryDefinition.actions ?? []
  const tableSchema = (activeManagedForm?.schema ?? motherSchema)?.tables
  const activeTableId = tableSchema?.some(table => table.id === selectedTableId) ? selectedTableId : tableSchema?.[0]?.id ?? 'laboratory.synthetic-persons'
  activeTableIdRef.current = activeTableId
  const schemaGridColumns = (table: NonNullable<FormSchemaDraft['tables']>[number]): GridColumn<SyntheticPerson>[] => table.columns.map(column => {
    const original = columns.find(item => item.id === column.id)
    const value = (row: SyntheticPerson) => { const record=row as unknown as Record<string,unknown>; const linked=column.sourceFieldIds?.map(id=>record[id]??'')??[]; if(linked.length>1){const combined=composeColumnFieldValue(linked,column);return combined||(original?.value(row)??'')} const key = column.binding.kind === 'formField' ? column.binding.fieldId : column.binding.kind === 'dataField' ? column.binding.dataFieldId : ''; const result=record[key]; return typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' ? result : original?.value(row)??'' }
    return original ? { ...original, label: column.label[language], width: column.width ?? original.width, multiline:column.valueComposition==='newline', value } : { id: column.id, label: column.label[language], width: column.width ?? 160, multiline:column.valueComposition==='newline', type: column.valueType === 'number' ? 'number' : 'text', value }
  })
  const activeDesignerColumns: GridColumn<SyntheticPerson>[] = tableSchema ? tableSchema.length ? schemaGridColumns(tableSchema.find(table => table.id === activeTableId) ?? tableSchema[0]) : [] : columns
  const activeFieldLabels = Object.fromEntries(activeFieldIds.map(id => [id, (activeManagedForm?.schema ?? motherSchema)?.fields.find(field => field.id === id)?.label[language] ?? labels[id]?.[language] ?? id]))
  const { history, dispatchHistory, historyRef, setPreviewDraft: setColorPreviewDraft, visibleDraft, editingBaseline, save: saveSessionDraft, undo: undoHistory, redo: redoHistory, restoreHistory: restoreDesignerHistory } = useDesignerSession({
    formId: activeManagedForm?.id ?? laboratoryDefinition.id, fieldIds: activeFieldIds, userId: authenticatedUserId,
    documentSchema: activeManagedForm ? normalizeFormLinks(activeManagedForm.schema, activeManagedForm.template.schema) : undefined, legacyStructureHistory: managedStructureHistory ?? undefined,
    initialHistoryLoader: identity => readFormRecovery(browserFormStorage(), identity.userId)?.documents[identity.formId]?.current.designerHistory,
    initialDraftLoader: identity => activeManagedForm ? resolveManagedLaboratoryDesigner(activeManagedForm) : loadLaboratoryColorBaseline(identity.userId)
  })
  const documentSchema = history.document?.present ?? activeManagedForm?.schema ?? motherSchema ?? createLaboratorySchemaTemplate(visibleDraft)
  const structureDialogBaseline=useRef<{history:typeof history;schema:FormSchemaDraft}|null>(null)
  const permissionsDialogBaseline=useRef(activeManagedForm?.customization)
  useLayoutEffect(()=>{if(structureDialog)structureDialogBaseline.current={history:structuredClone(historyRef.current),schema:structuredClone(documentSchema)};else structureDialogBaseline.current=null},[structureDialog])
  useLayoutEffect(()=>{if(managedSaveDialogOpen)permissionsDialogBaseline.current=structuredClone(activeManagedForm?.customization)},[managedSaveDialogOpen])
  const columnLinkDefaults = (() => { try { return resolveColumnLinkBehavior(readFormBehaviors(typeof localStorage === 'undefined' ? undefined : localStorage), behaviorIdFor(documentSchema)) } catch { return { allowMultipleSources: true, defaultComposition: 'space' as const, requireMismatchResolution: true } } })()
  useLayoutEffect(() => {
    if (!activeManagedForm || !history.document || managedFormDraft?.schema === history.document.present) return
    setManagedFormDraft(form => form ? { ...form, schema: history.document!.present } : form)
    setManagedStructureHistory({ present: history.document.present, past: history.document.past, future: history.document.future })
    setManagedFormSaved(false); setFrozenCanvas(null)
  }, [activeManagedForm?.id, history.document])
  const fieldReviewIds = new Set(activeManagedForm ? [...unresolvedFormFields(documentSchema).map(field => field.id), ...(documentSchema.tables??[]).flatMap(table=>table.columns.flatMap(column=>columnLabelMismatch(documentSchema,column,language)))] : [])
  const compositionEnabled = usesFormComposition(documentSchema)
  const editorSectionId = documentSchema.sections.some(section => section.id === activeEditorSectionId && section.kind === 'editor') ? activeEditorSectionId : documentSchema.sections.find(section => section.kind === 'editor')?.id
  const editorGeometryScoped = compositionEnabled || documentSchema.sections.some(section=>Boolean(section.tableHeaderFor))
  const geometryFieldIds = editorGeometryScoped ? documentSchema.fields.filter(field => field.sectionId === editorSectionId).map(field => field.id) : activeFieldIds
  const scopedTableId = () => activeManagedForm || motherSchema ? activeTableIdRef.current : undefined
  const tableDesignerDraft = designerDraftForTable(visibleDraft, scopedTableId())
  const setDesignerTableColumnStyle = (...args: Parameters<typeof setTableColumnBase>) => updateTableDesigner(args[0], scopedTableId(), table => setTableColumnBase(table, args[1], args[2], args[3]))
  const setDesignerTableHeaderStyle = (...args: Parameters<typeof setTableHeaderBase>) => updateTableDesigner(args[0], scopedTableId(), table => setTableHeaderBase(table, args[1], args[2], args[3]))
  const setDesignerTableHeaderHeight = (...args: Parameters<typeof setTableHeightBase>) => updateTableDesigner(args[0], scopedTableId(), table => setTableHeightBase(table, args[1]))
  const setDesignerTableFont = (...args: Parameters<typeof setTableFontBase>) => updateTableDesigner(args[0], scopedTableId(), table => setTableFontBase(table, args[1], args[2]))
  const setDesignerFilterPopupFontSize = (...args: Parameters<typeof setFilterSizeBase>) => updateTableDesigner(args[0], scopedTableId(), table => setFilterSizeBase(table, args[1]))
  const setDesignerGridSearchPosition = (...args: Parameters<typeof setSearchPositionBase>) => updateTableDesigner(args[0], scopedTableId(), table => setSearchPositionBase(table, args[1]))
  const activateTable = (id: string) => { if (id !== activeTableIdRef.current) setSelectedTableColumnIds([]); activeTableIdRef.current = id; setSelectedTableId(id) }
  const designerOpenRef = useRef(designerOpen)
  designerOpenRef.current = designerOpen
  const [gridResetRequest, setGridResetRequest] = useState(0)
  const [initialPreviewFrame] = useState(() => loadPreviewFramePreferences(authenticatedUserId))
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>(initialPreviewFrame.device)
  const [previewWidth, setPreviewWidth] = useState<number>(initialPreviewFrame.width)
  const [previewFitToPage, setPreviewFitToPage] = useState(initialPreviewFrame.fitToPage)
  const [previewHeight, setPreviewHeight] = useState<number | null>(initialPreviewFrame.height)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const activePreviewFrame: ManagedFormFrame = activeManagedForm?.frame ?? { device: previewDevice, width: previewWidth, height: previewHeight, fitToPage: previewFitToPage }
  const activePreviewOffset = activeManagedForm ? managedFrameOffsets[activeManagedForm.id] ?? { x: 0, y: 0 } : previewOffset
  const setActivePreviewOffset = (next: React.SetStateAction<{ x: number, y: number }>) => {
    const formId = activeManagedForm?.id
    if (!formId) { setPreviewOffset(next); return }
    setManagedFrameOffsets(current => {
      const previous = current[formId] ?? { x: 0, y: 0 }
      return { ...current, [formId]: typeof next === 'function' ? next(previous) : next }
    })
  }
  const updateActivePreviewFrame = (patch: Partial<ManagedFormFrame>) => {
    if (activeManagedForm) {
      setManagedFormDraft(current => current ? { ...current, frame: { ...current.frame, ...patch } } : current)
      setManagedFormSaved(false)
      setManagedFormStatus('')
      return
    }
    if (patch.device !== undefined) setPreviewDevice(patch.device)
    if (patch.width !== undefined) setPreviewWidth(patch.width)
    if ('height' in patch) setPreviewHeight(patch.height ?? null)
    if (patch.fitToPage !== undefined) setPreviewFitToPage(patch.fitToPage)
  }
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
  useEffect(() => {
    const forms = loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId) ?? { version: 1 as const, activeFormId: null, forms: [] }
    setManagedForms(forms)
    setFieldBlueprints(loadFieldBlueprints(browserFormStorage(), authenticatedUserId))
    setStructureDialog(null)
    setMotherSchema(forms.templateRevision?.schema ?? null)
    setMotherStructureHistory(null)
    const recovery = readFormRecovery(browserFormStorage(), authenticatedUserId)
    const restored = recovery?.activeFormId ? recovery.documents[recovery.activeFormId]?.current : undefined
    setManagedFormEditorOpen(Boolean(restored))
    setManagedFormDraft(restored?.form ?? null)
    setManagedStructureHistory(restored?.structureHistory ?? null)
    if (restored) setDesignerOpen(true)
    setManagedSaveDialogOpen(false)
    setTemplateRegistrationOpen(false)
  }, [authenticatedUserId])
  const formFrameAreaRef = useRef<HTMLDivElement | null>(null)
  const formFrameRef = useRef<HTMLDivElement | null>(null)
  const formBannerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (activeManagedForm || !previewFitToPage || previewDevice !== 'desktop') return
    const area = formFrameAreaRef.current
    if (!area) return
    const syncWidth = () => setPreviewWidth(Math.max(320, Math.min(2400, Math.round(area.clientWidth))))
    const observer = new ResizeObserver(syncWidth)
    observer.observe(area)
    syncWidth()
    return () => observer.disconnect()
  }, [activeManagedForm?.id, previewFitToPage, previewDevice])
  const previewInteractionRef = useRef<'resize' | 'move' | null>(null)
  const geometryEditable = activePreviewFrame.device === 'desktop'
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
    if (event.target instanceof Element && event.target.closest('.base-grid-resizer,.header-height-handle')) { scroll.style.cursor = ''; return }
    if (event.target instanceof Element && event.target.closest('.managed-form-workspace-sidebar,button,input,select,textarea,a,[role="tab"]')) { scroll.style.cursor = ''; return }
    const edge = previewResizeEdgeAt(event.clientX, event.clientY)
    scroll.style.cursor = edge ? previewCursorForEdge(edge) : previewCanMoveFrom(event.target) ? 'grab' : ''
  }
  const beginPreviewPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.base-grid-resizer,.header-height-handle')) return
    if (event.target instanceof Element && event.target.closest('button,input,select,textarea,a,[role="tab"]')) return
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
    const startHeight = activePreviewFrame.height ?? rect.height
    const startOffset = activePreviewOffset
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
        setActivePreviewOffset({ x: Math.max(-maxX, Math.min(maxX, startOffset.x + deltaX)), y: Math.max(-maxY, Math.min(maxY, startOffset.y + deltaY)) })
        return
      }
      const resizeLeft = edge!.includes('left')
      const resizeRight = edge!.includes('right')
      const resizeTop = edge!.includes('top')
      const resizeBottom = edge!.includes('bottom')
      let nextWidth = startWidth
      let nextHeight = startHeight
      if (resizeLeft || resizeRight) nextWidth = Math.max(320, Math.min(2400, startWidth + (resizeRight ? deltaX : 0) - (resizeLeft ? deltaX : 0)))
      if (resizeTop || resizeBottom) nextHeight = Math.max(320, Math.min(2400, startHeight + (resizeBottom ? deltaY : 0) - (resizeTop ? deltaY : 0)))
      if (resizeLeft || resizeRight) {
        const targetLeft = startLeft + (resizeLeft ? startWidth - nextWidth : 0)
        updateActivePreviewFrame({ fitToPage: false, width: nextWidth })
        setActivePreviewOffset(current => ({ ...current, x: targetLeft - Math.max(0, (contentWidth - nextWidth) / 2) }))
      }
      if (resizeTop || resizeBottom) {
        const targetTop = startTop + (resizeTop ? startHeight - nextHeight : 0)
        updateActivePreviewFrame({ height: nextHeight })
        setActivePreviewOffset(current => ({ ...current, y: targetTop - Math.max(0, (contentHeight - nextHeight) / 2) }))
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
      if (edge) setActivePreviewOffset({ x: 0, y: 0 })
    }
    scroll.setPointerCapture(event.pointerId)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }
  const handlePreviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('.managed-form-workspace-sidebar')) return
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 64 : 16
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const grows = fa ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
      updateActivePreviewFrame({ fitToPage: false, width: Math.max(320, Math.min(2400, activePreviewFrame.width + (grows ? step : -step))) })
    } else {
      const grows = event.key === 'ArrowDown'
      updateActivePreviewFrame({ height: Math.max(320, Math.min(2400, (activePreviewFrame.height ?? formFrameRef.current?.getBoundingClientRect().height ?? 650) + (grows ? step : -step))) })
    }
    setActivePreviewOffset({ x: 0, y: 0 })
  }
  const [selection, setSelection] = useState<string[]>([])
  const [actionSelection, setActionSelection] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ left: number, top: number, part: 'input' | 'label' | 'action' | 'grid' | 'structure' | 'toolbar', toolbarPart?: GridToolbarPart, sectionId?: string, fieldId?: string, actionId?: string, gridTarget?: 'header' | 'row' | 'search', columnId?: string } | null>(null)
  const [gridSubmenu, setGridSubmenu] = useState<string | null>(null)
  const [gridFormatDialog, setGridFormatDialogState] = useState<null | { scope: 'header' | 'column' | 'field' | 'label' | 'action' | 'toolbar'; baseSchema?:FormSchemaDraft; tableId?:string; mode: 'font' | 'color'; id: string; targetIds?: string[]; actionPart?: DesignerActionTextPart | 'button'; label: string; base: DesignerDraft; fontFamily: string; fontSize: number; bold: boolean; italic: boolean; underline: 'none' | 'single' | 'double'; strikeThrough: boolean; script: 'none' | 'superscript' | 'subscript'; normalFont: boolean; color: string; colorProperty: 'textColor' | 'backgroundColor' | 'borderColor' }>(null)
  const latestGridFormatDialog = useRef(gridFormatDialog)
  const setGridFormatDialog = (next: typeof gridFormatDialog) => { latestGridFormatDialog.current = next; setGridFormatDialogState(next) }
  const [selectedTableColumnIds, setSelectedTableColumnIds] = useState<string[]>([])
  const [toolbarColorPreview,setToolbarColorPreview]=useState<{tableId:string;part:GridToolbarPart;patch:GridToolbarPartStyle;parts?:GridToolbarPart[]}|null>(null)
  const [toolbarSelectionRequest,setToolbarSelectionRequest]=useState(0)
  const [toolbarSelection,setToolbarSelection]=useState<{tableId:string;parts:GridToolbarPart[]}|null>(null)
  const [headerStyleScope, setHeaderStyleScope] = useState<'selected' | 'all'>('selected')
  const [gridFormatDialogOffset, setGridFormatDialogOffset] = useState({ x: 0, y: 0 })
  const gridFormatDialogRef = useRef<HTMLElement | null>(null)
  const gridFormatDialogDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const contextSubmenuRef = useRef<HTMLDivElement>(null)
  const [propertyRequest, setPropertyRequest] = useState<DesignerPropertyRequest>()
  const [applyToAll, setApplyToAll] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const formGridRef = useRef<HTMLDivElement | null>(null)
  const gestureCleanup = useRef<(() => void) | null>(null)
  const canvasViewOrigins=useRef(new Map<string,number>())
  const [layoutGuideStep,setLayoutGuideStep]=useState(0)
  const [formRuntimeTesting,setFormRuntimeTesting]=useState(false)
  const [runtimeBehaviorPreview,setRuntimeBehaviorPreview]=useState<{library:FormBehaviorLibrary;id:string}|null>(null)
  const effectiveBehaviorId=formRuntimeTesting&&runtimeBehaviorPreview?runtimeBehaviorPreview.id:behaviorIdFor(documentSchema)
  const neighborResizeFor=(draft:DesignerDraft=historyRef.current.present)=>{
    const policy=currentFormPolicy(behaviorIdFor(documentSchema))
    return {horizontal:draft.neighborResize?.horizontal??policy.preserveHorizontalSpacing??false,vertical:draft.neighborResize?.vertical??policy.preserveVerticalSpacing??false}
  }
  const previewPolicy=(id:string)=>formRuntimeTesting&&runtimeBehaviorPreview?JSON.stringify(resolveFormBehavior(runtimeBehaviorPreview.library,id)):undefined
  const [runtime,dispatchRuntime]=useReducer(formTestReducer,undefined,initialFormTest)
  const [runtimeErrors,setRuntimeErrors]=useState<Record<string,string>>({})
  const [behaviorEditorOpen,setBehaviorEditorOpen]=useState(false)
  const [toolbarPropertyRequest,setToolbarPropertyRequest]=useState<{sequence:number;tableId:string;part:GridToolbarPart;property:string}>()
  const toolbarPropertySequence=useRef(0)
  const [,refreshBehavior]=useState(0)
  useEffect(()=>{const refresh=()=>refreshBehavior(value=>value+1);window.addEventListener(formBehaviorEvent,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(formBehaviorEvent,refresh);window.removeEventListener('storage',refresh)}},[])
  const [componentTestMode,setComponentTestMode]=useState(false)
  const [componentTestValues,setComponentTestValues]=useState<Record<string,{value:string;options:string[];defaultValue?:string}>>({})
  useEffect(()=>{setComponentTestMode(false);setFormRuntimeTesting(false);setRuntimeBehaviorPreview(null);dispatchRuntime({type:'reset'});setComponentTestValues({});setRuntimeErrors({})},[activeManagedForm?.id])
  const [frozenCanvas, setFrozenCanvas] = useState<DesignerCanvas | null>(null)
  const [referenceId, setReferenceId] = useState('')
  const [layoutStatus, setLayoutStatus] = useState('')
  // Responsive views reflow the same fields without changing the saved desktop canvas.
  const storedEditorCanvas = designerDraftForEditor(history.present, documentSchema, editorGeometryScoped ? editorSectionId : undefined).canvas
  const canvas = geometryEditable ? storedEditorCanvas ?? (designerOpen ? frozenCanvas : null) : null
  const propertyCommitTimer = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!contextMenu || !designerOpen || !contextMenuRef.current) return
    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(contextMenu.left, window.innerWidth - rect.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(contextMenu.top, window.innerHeight - rect.height - 8))}px`
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [contextMenu, designerOpen])
  useLayoutEffect(() => {
    const menu = contextMenuRef.current, submenu = contextSubmenuRef.current
    if (!menu || !submenu || !gridSubmenu) return
    const anchor = menu.querySelector<HTMLElement>(`[data-grid-submenu="${gridSubmenu}"]`)
    if (!anchor) return
    const parent = menu.getBoundingClientRect(), target = anchor.getBoundingClientRect(), rect = submenu.getBoundingClientRect()
    const preferred = fa ? parent.left - rect.width - 8 : parent.right + 8
    const fallback = fa ? parent.right + 8 : parent.left - rect.width - 8
    const left = preferred >= 8 && preferred + rect.width <= window.innerWidth - 8 ? preferred : fallback
    submenu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`
    submenu.style.top = `${Math.max(8, Math.min(target.top, window.innerHeight - rect.height - 8))}px`
  }, [contextMenu, gridSubmenu, fa])
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
  const activateEditorForField = (fieldId: string) => {
    const sectionId = documentSchema.fields.find(field => field.id === fieldId)?.sectionId
    if (!editorGeometryScoped || !sectionId || sectionId === editorSectionId) return
    const grid = Array.from(formFrameRef.current?.querySelectorAll<HTMLDivElement>('.laboratory-form-grid[data-section-id]') ?? []).find(element => element.dataset.sectionId === sectionId)
    if (grid) formGridRef.current = grid
    setActiveEditorSectionId(sectionId)
    setFrozenCanvas(null)
  }
  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!designerOpen || formRuntimeTesting) return
    const target = event.target as HTMLElement
    if (target.closest('.managed-form-workspace-sidebar, .laboratory-designer-pane, .excel-color-picker, [role="dialog"], [role="menu"]')) return
    event.preventDefault(); event.stopPropagation()
    const action = target.closest<HTMLElement>('[data-action-id]')?.dataset.actionId
    const field = target.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId
    const part = target.closest('.designer-label-part') ? 'label' : field ? 'input' : null
    const sectionId = target.closest<HTMLElement>('[data-section-id]')?.dataset.sectionId ?? target.closest<HTMLElement>('[data-document-section-id]')?.dataset.documentSectionId
    if (!action && !field) { if (activeManagedForm) setContextMenu({ left: event.clientX, top: event.clientY, part: 'structure', sectionId }); else setContextMenu(null); return }
    setApplyToAll(false)
    setToolbarSelection(null)
    if (action) { setSelection([]); setActionSelection(current => contextDesignerSelection(current, action)) }
    else { activateEditorForField(field!); setActionSelection([]); setSelection(current => contextDesignerSelection(current, `${field}::${part}`)) }
    if (field && activeManagedForm) setManagedSelectedFieldId(field)
    setContextMenu({ left: event.clientX, top: event.clientY, part: action ? 'action' : part!, sectionId, fieldId: field, actionId: action })
  }
  const requestProperty = (section: DesignerPropertyRequest['section'], property?: DesignerPropertyRequest['property']) => {
    setContextMenu(null)
    setGridSubmenu(null)
    if (section === 'font') { openSelectedTextFormatDialog(); return }
    setManagedSidebarCollapsed(false); setManagedSettingsTab('design'); setDesignerOpen(true)
    setPropertyRequest(current => ({ sequence: (current?.sequence ?? 0) + 1, section, property }))
  }
  useEffect(() => {
    setSaveStatus('')
  }, [authenticatedUserId])

  const selectField = (id: string, event: { ctrlKey: boolean, metaKey: boolean }, part: 'field' | 'label' | 'input' = 'field') => {
    activateEditorForField(id)
    setToolbarSelection(null);setSelectedTableColumnIds([])
    setManagedSettingsTab('design');setManagedSidebarCollapsed(false)
    setPropertyRequest(current=>({sequence:(current?.sequence??0)+1,section:'size'}))
    setActionSelection([])
    if (activeManagedForm?.schema.fields.some(field => field.id === id)) setManagedSelectedFieldId(id)
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
    const targets = applyToAll ? activeFieldIds : selection
    const propertyTargets = mapDesignerPropertyTargets(property, targets, value)
    if (propertyCommitTimer.current === null) dispatchHistory({ type: 'beginTransaction' })
    const start=historyRef.current.present
    let next=actionSelection.length?setDesignerActionProperty(start,actionSelection,property,value):setDesignerProperty(start,propertyTargets,property,value,activeFieldIds)
    if(!actionSelection.length&&(property==='width'||property==='height')&&typeof value==='number'&&geometryEditable){
      const ids=[...new Set(propertyTargets.filter(id=>!id.endsWith('::label')).map(id=>id.split('::')[0]))]
      const section=documentSchema.fields.find(field=>field.id===ids[0])?.sectionId
      if(ids.length&&ids.every(id=>documentSchema.fields.find(field=>field.id===id)?.sectionId===section)){
        const stored=designerDraftForEditor(start,documentSchema,editorGeometryScoped?section:undefined).canvas
        const options=neighborResizeFor(start),locked=property==='width'?options.horizontal:options.vertical
        const root=formFrameRef.current?.querySelector<HTMLElement>('[data-field-id="'+ids[0]+'"]')?.closest<HTMLDivElement>('.laboratory-form-grid')??null
        const initial=stored??(locked?captureCurrentEditorCanvas(root):undefined)
        if(initial){const resized=resizeCanvasDimension(initial,ids,property,value,options,fa);next=withCanvas(start,resized,section);setLayoutStatus(resized===initial&&locked?'همسایهٔ مناسب یا فضای کافی برای این تغییر اندازه وجود ندارد.':'')}
      }
    }
    dispatchHistory({ type:'change',draft:next })
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
    const action = activeActions.find(item => item.id === id)
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
    dispatchHistory({ type: 'change', draft: setDesignerColorProperty(historyRef.current.present, targets, property, value, activeFieldIds) })
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
    const targets = mapDesignerPropertyTargets(property, applyToAll ? activeFieldIds : selection, value)
    dispatchHistory({ type: 'beginTransaction' })
    dispatchHistory({ type: 'change', draft: actionSelection.length ? setDesignerActionProperty(historyRef.current.present, actionSelection, property, value) : setDesignerProperty(historyRef.current.present, targets, property, value, activeFieldIds) })
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
  const updateTableHeaderHeight = (height: number, phase: 'start' | 'change' | 'end') => {
    if (phase === 'start') { setPropertyRequest(current=>({sequence:(current?.sequence??0)+1,section:'tableHeaderTypography',property:'headerHeight'})); dispatchHistory({ type: 'beginTransaction' }); return }
    if (phase === 'end') { dispatchHistory({ type: 'commitTransaction' }); return }
    dispatchHistory({ type: 'change', draft: setDesignerTableHeaderHeight(historyRef.current.present, height) }); setSaveStatus('')
  }
  const setTableHeaderHeight = (height: number) => { dispatchHistory({ type: 'change', draft: setDesignerTableHeaderHeight(historyRef.current.present, height) }); setSaveStatus('') }
  const updateTableColumnStyle = (id: string, property: 'bold' | 'textColor' | 'backgroundColor' | 'fontFamily' | 'fontSize', value: string | number | boolean | undefined) => { let next = historyRef.current.present; for (const target of selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id]) next = setDesignerTableColumnStyle(next, target, property, value); dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const updateTableHeaderStyle = (id: string, property: 'bold' | 'textColor' | 'backgroundColor' | 'borderColor' | 'fontFamily' | 'fontSize' | 'textAlign', value: string | number | boolean | undefined) => { let next = historyRef.current.present; for (const target of activeGridHeaderIds(id)) next = setDesignerTableHeaderStyle(next, target, property, value); dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const previewTableStyleColor = (target: 'column' | 'header', id: string, color: string | undefined | null, property: 'textColor' | 'backgroundColor' | 'borderColor' = 'textColor') => { let next = historyRef.current.present; const ids = target === 'header' ? activeGridHeaderIds(id) : selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id]; for (const targetId of ids) next = target === 'column' ? setDesignerTableColumnStyle(next, targetId, property === 'backgroundColor' ? 'backgroundColor' : 'textColor', color ?? undefined) : setDesignerTableHeaderStyle(next, targetId, property, color ?? undefined); setColorPreviewDraft(color == null ? null : next) }
  const commitTableStyleColor = (target: 'column' | 'header', id: string, color: string | undefined, property: 'textColor' | 'backgroundColor' | 'borderColor' = 'textColor') => { setColorPreviewDraft(null); let next = historyRef.current.present; const ids = target === 'header' ? activeGridHeaderIds(id) : selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id]; for (const targetId of ids) next = target === 'column' ? setDesignerTableColumnStyle(next, targetId, property === 'backgroundColor' ? 'backgroundColor' : 'textColor', color) : setDesignerTableHeaderStyle(next, targetId, property, color); dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const previewTableColumnBackgroundColor = (id: string, color: string | undefined | null) => { let next = historyRef.current.present; for (const target of selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id]) next = setDesignerTableColumnStyle(next, target, 'backgroundColor', color ?? undefined); setColorPreviewDraft(color == null ? null : next) }
  const commitTableColumnBackgroundColor = (id: string, color: string | undefined) => { setColorPreviewDraft(null); let next = historyRef.current.present; for (const target of selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id]) next = setDesignerTableColumnStyle(next, target, 'backgroundColor', color); dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const buildGridFormatDraft = (dialog: NonNullable<typeof gridFormatDialog>) => {
    let next = dialog.base
    if(dialog.scope==='toolbar')return next
    if (dialog.mode === 'font') {
      if (dialog.scope === 'column' || dialog.scope === 'header') {
        const setTableStyle = dialog.scope === 'column' ? setDesignerTableColumnStyle : setDesignerTableHeaderStyle
        for (const id of dialog.targetIds ?? [dialog.id]) {
          next = setTableStyle(next, id, 'fontFamily', dialog.fontFamily === 'inherit' ? undefined : dialog.fontFamily)
          next = setTableStyle(next, id, 'fontSize', dialog.fontSize)
          next = setTableStyle(next, id, 'bold', dialog.bold)
          next = setTableStyle(next, id, 'italic', dialog.italic)
          next = setTableStyle(next, id, 'underline', dialog.underline === 'none' ? undefined : dialog.underline)
          next = setTableStyle(next, id, 'strikeThrough', dialog.strikeThrough)
          next = setTableStyle(next, id, 'script', dialog.script === 'none' ? undefined : dialog.script)
        }
      } else if (dialog.scope === 'action') {
        const setActionStyle = (property: DesignerProperty, value: string | number | boolean | undefined) => {
          next = dialog.actionPart && dialog.actionPart !== 'button'
            ? setDesignerActionTextProperty(next, dialog.targetIds ?? [], dialog.actionPart, property, value)
            : setDesignerActionProperty(next, dialog.targetIds ?? [], property, value)
        }
        setActionStyle('fontFamily', dialog.fontFamily === 'inherit' ? undefined : dialog.fontFamily)
        setActionStyle('fontSize', dialog.fontSize)
        setActionStyle('bold', dialog.bold)
        setActionStyle('italic', dialog.italic)
        setActionStyle('underline', dialog.underline === 'none' ? undefined : dialog.underline)
        setActionStyle('strikeThrough', dialog.strikeThrough)
        setActionStyle('script', dialog.script === 'none' ? undefined : dialog.script)
      } else {
        const setFieldStyle = (property: DesignerProperty, value: string | number | boolean | undefined) => { next = setDesignerProperty(next, dialog.targetIds ?? [dialog.id], property, value, activeFieldIds) }
        setFieldStyle('fontFamily', dialog.fontFamily === 'inherit' ? undefined : dialog.fontFamily)
        setFieldStyle('fontSize', dialog.fontSize)
        setFieldStyle('bold', dialog.bold)
        setFieldStyle('italic', dialog.italic)
        setFieldStyle('underline', dialog.underline === 'none' ? undefined : dialog.underline)
        setFieldStyle('strikeThrough', dialog.strikeThrough)
        setFieldStyle('script', dialog.script === 'none' ? undefined : dialog.script)
      }
    }
    if (dialog.scope === 'column') { for (const id of dialog.targetIds ?? [dialog.id]) next = setDesignerTableColumnStyle(next, id, dialog.colorProperty === 'backgroundColor' ? 'backgroundColor' : 'textColor', dialog.color); return next }
    if (dialog.scope === 'header') { for (const id of dialog.targetIds ?? [dialog.id]) next = setDesignerTableHeaderStyle(next, id, dialog.colorProperty, dialog.color); return next }
    if (dialog.scope === 'action') return dialog.actionPart && dialog.actionPart !== 'button'
      ? setDesignerActionTextProperty(next, dialog.targetIds ?? [], dialog.actionPart, 'textColor', dialog.color)
      : setDesignerActionProperty(next, dialog.targetIds ?? [], 'textColor', dialog.color)
    return setDesignerProperty(next, dialog.targetIds ?? [dialog.id], 'textColor', dialog.color, activeFieldIds)
  }
  const previewGridFormatColor = (color: string | undefined | null) => {
    const dialog = latestGridFormatDialog.current
    if (!dialog || (dialog.mode === 'color' && color === null)) { setColorPreviewDraft(null); return }
    setColorPreviewDraft(buildGridFormatDraft(color == null ? dialog : { ...dialog, color }))
  }
  const openGridFormatDialog = (scope: 'header' | 'column', columnIds: string | string[], label: string, mode: 'font' | 'color', colorProperty: 'textColor' | 'backgroundColor' | 'borderColor' = 'textColor') => {
    const targetIds = [...new Set(typeof columnIds === 'string' ? [columnIds] : columnIds)]
    if (!targetIds.length) return
    const id = targetIds[0]
    const base = historyRef.current.present
    const table = designerDraftForTable(base, scopedTableId())
    const style = scope === 'column' ? table.tableColumns?.[id] : table.tableHeaders?.[id]
    const fallbackColor = colorProperty === 'backgroundColor' ? '#f7f9f7' : colorProperty === 'borderColor' ? '#dfe7e3' : '#263a38'
    const currentColor = scope === 'header' ? table.tableHeaders?.[id]?.[colorProperty] : table.tableColumns?.[id]?.[colorProperty === 'backgroundColor' ? 'backgroundColor' : 'textColor']
    const next = { scope, id, targetIds, label: targetIds.length > 1 ? `${label} (+${targetIds.length - 1})` : label, mode, base, fontFamily: style?.fontFamily ?? 'inherit', fontSize: style?.fontSize ?? table.tableFont?.size ?? 13, bold: style?.bold ?? false, italic: style?.italic ?? false, underline: (style?.underline ?? 'none') as 'none' | 'single' | 'double', strikeThrough: style?.strikeThrough ?? false, script: (style?.script ?? 'none') as 'none' | 'superscript' | 'subscript', normalFont: false, color: currentColor ?? fallbackColor, colorProperty }
    setGridFormatDialogOffset({ x: 0, y: 0 }); setContextMenu(null); setGridSubmenu(null); setGridFormatDialog(next); setColorPreviewDraft(buildGridFormatDraft(next))
  }
  const openTextFormatDialog = (scope: 'field' | 'label' | 'action', label: string, actionPart: DesignerActionTextPart | 'button' = 'button', selectionOverride?: string[]) => {
    const base = historyRef.current.present
    const targetIds = scope === 'action' ? actionSelection : [...new Set((selectionOverride ?? (applyToAll ? activeFieldIds : selection)).map(id => scope === 'label' && !id.endsWith('::label') ? `${id.split('::')[0]}::label` : id))]
    if (!targetIds.length) return
    const id = targetIds[0]
    const style = scope === 'action' && actionPart !== 'button' ? base.actions?.[id]?.textStyles?.[actionPart] : scope === 'action' ? base.actions?.[id] : base.overrides[id]
    const next = { scope, id, targetIds, actionPart, label, mode: 'font' as const, base, fontFamily: String(style?.fontFamily ?? 'inherit'), fontSize: Number(style?.fontSize ?? 13), bold: Boolean(style?.bold), italic: Boolean(style?.italic), underline: (style?.underline ?? 'none') as 'none' | 'single' | 'double', strikeThrough: Boolean(style?.strikeThrough), script: (style?.script ?? 'none') as 'none' | 'superscript' | 'subscript', normalFont: false, color: String(style?.textColor ?? '#263a38'), colorProperty: 'textColor' as const }
    setGridFormatDialogOffset({ x: 0, y: 0 }); setContextMenu(null); setGridSubmenu(null); setGridFormatDialog(next); setColorPreviewDraft(buildGridFormatDraft(next))
  }
  const toolbarSchemaFromDialog=(dialog:NonNullable<typeof gridFormatDialog>):FormSchemaDraft=>{
    const schema=dialog.baseSchema??documentSchema
    const patch:GridToolbarPartStyle={fontFamily:dialog.fontFamily,fontSize:dialog.fontSize,bold:dialog.bold,italic:dialog.italic,underline:dialog.underline==='none'?undefined:dialog.underline,strikeThrough:dialog.strikeThrough,script:dialog.script==='none'?undefined:dialog.script,textColor:dialog.color}
    return {...schema,tables:schema.tables?.map(table=>{if(table.id!==dialog.tableId)return table;let toolbar=(table.settings?.toolbar??{}) as GridToolbarSettings;for(const part of dialog.targetIds??[dialog.id])toolbar=moveToolbarPart(toolbar,part as GridToolbarPart,patch);return {...table,settings:{...table.settings,toolbar}}})}
  }
  const openToolbarFont=(tableId:string,part:GridToolbarPart)=>{
    const style=(documentSchema.tables?.find(table=>table.id===tableId)?.settings?.toolbar as GridToolbarSettings|undefined)?.[part]??{}
    setGridFormatDialog({scope:'toolbar',tableId,baseSchema:documentSchema,id:part,targetIds:toolbarSelection?.tableId===tableId&&toolbarSelection.parts.includes(part)?toolbarSelection.parts:[part],label:toolbarPartLabel(part),mode:'font',base:historyRef.current.present,fontFamily:style.fontFamily??'inherit',fontSize:style.fontSize??13,bold:style.bold??false,italic:style.italic??false,underline:style.underline??'none',strikeThrough:style.strikeThrough??false,script:style.script??'none',normalFont:false,color:style.textColor??'#263a38',colorProperty:'textColor'})
    setContextMenu(null);setGridSubmenu(null)
  }
  const selectToolbar=(tableId:string,part:GridToolbarPart,toggle=false)=>{
    setToolbarSelectionRequest(current=>current+1)
    setToolbarPropertyRequest(undefined)
    activateTable(tableId);setSelection([]);setActionSelection([]);setSelectedTableColumnIds([])
    setToolbarSelection(current=>{const parts=toggle&&current?.tableId===tableId?(current.parts.includes(part)?current.parts.filter(item=>item!==part):[...current.parts,part]):[part];return parts.length?{tableId,parts}:null})
    setManagedSettingsTab('design');setManagedSidebarCollapsed(false)
  }
  const requestToolbarProperty=(tableId:string,part:GridToolbarPart,property:string)=>{
    setContextMenu(null);setGridSubmenu(null);if(toolbarSelection?.tableId===tableId&&toolbarSelection.parts.includes(part))setToolbarSelectionRequest(current=>current+1);else selectToolbar(tableId,part)
    setToolbarPropertyRequest({sequence:++toolbarPropertySequence.current,tableId,part,property})
  }
  const openSelectedTextFormatDialog = (actionPart: DesignerActionTextPart | 'button' = 'button') => {
    if(toolbarSelection?.parts[0])return openToolbarFont(toolbarSelection.tableId,toolbarSelection.parts[0])
    if(selectedTableColumnIds.length)return openGridFormatDialog('header',selectedTableColumnIds,activeDesignerColumns.find(column=>column.id===selectedTableColumnIds[0])?.label??'','font')
    if (actionSelection.length) return openTextFormatDialog('action', activeActions.find(action => action.id === actionSelection[0])?.label[language] ?? '', actionPart)
    const target = selection[0]
    if (!target) return
    const labelTarget = target.endsWith('::label') || contextMenu?.part === 'label'
    const fieldId = target.split('::')[0]
    openTextFormatDialog(labelTarget ? 'label' : 'field', activeFieldLabels[fieldId] ?? labels[fieldId]?.[language] ?? fieldId)
  }
  const updateGridFormatDialog = (patch: Partial<NonNullable<typeof gridFormatDialog>>) => {
    if (!gridFormatDialog) return
    const next = { ...gridFormatDialog, ...patch, normalFont: patch.normalFont ?? (Object.keys(patch).some(key => key !== 'normalFont') ? false : gridFormatDialog.normalFont) }
    setGridFormatDialog(next); setColorPreviewDraft(buildGridFormatDraft(next))
  }
  const cancelGridFormatDialog = () => { setColorPreviewDraft(null); setGridFormatDialog(null); setGridFormatDialogOffset({ x: 0, y: 0 }); gridFormatDialogDrag.current = null }
  const applyGridFormatDialog = () => { if (!gridFormatDialog) return; if(gridFormatDialog.scope==='toolbar')commitManagedStructure(toolbarSchemaFromDialog(gridFormatDialog));else dispatchHistory({ type: 'change', draft: buildGridFormatDraft(gridFormatDialog) }); setColorPreviewDraft(null); setGridFormatDialog(null); setSaveStatus('') }
  const handleGridFormatColorCommit = (color: string | undefined) => {
    if (!gridFormatDialog) return
    const next = { ...gridFormatDialog, color: color ?? gridFormatDialog.color }
    if (next.mode === 'color') { dispatchHistory({ type: 'change', draft: buildGridFormatDraft(next) }); setColorPreviewDraft(null); setGridFormatDialog(null); setSaveStatus('') }
    else updateGridFormatDialog({ color: next.color })
  }
  const selectGridDesignerColumn = (columnId: string, toggle: boolean) => {setToolbarSelection(null);setSelection([]);setActionSelection([]);setManagedSettingsTab('design');setManagedSidebarCollapsed(false);setSelectedTableColumnIds(current => toggle ? current.includes(columnId) ? current.filter(id => id !== columnId) : [...current, columnId] : [columnId]);setPropertyRequest(current=>({sequence:(current?.sequence??0)+1,section:'tableHeaderTypography'}))}
  const openGridDesignerContextMenu = (target: 'header' | 'row' | 'search', columnId: string | undefined, left: number, top: number) => { if (!designerOpen) return; setToolbarSelection(null); if (columnId) setSelectedTableColumnIds(current => current.includes(columnId) ? current : [columnId]); else setSelectedTableColumnIds([]); setGridSubmenu(null); setContextMenu({ left, top, part: 'grid', gridTarget: target, columnId }) }
  const openLabelFontDialog = () => {
    if (!labelEditDialog) return
    const target = labelEditDialog
    if (target.kind === 'field') {
      setSelection([`${target.id}::label`]); setActionSelection([]); setSelectedTableColumnIds([])
      openTextFormatDialog('label', target.value, 'button', [`${target.id}::label`])
      return
    }
    const column = activeDesignerColumns.find(item => item.id === target.id)
    openGridFormatDialog('header', target.id, column?.label ?? target.value, 'font')
  }
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
    setColorPreviewDraft(setDesignerColorProperty(historyRef.current.present, explicitTargets ?? selection, property, value, activeFieldIds))
  }
  const previewElementAppearance = (property: DesignerProperty, value: DesignerValue | undefined | null) => {
    if (value === null) { setColorPreviewDraft(null); return }
    const targets = mapDesignerPropertyTargets(property, applyToAll ? activeFieldIds : selection, value)
    setColorPreviewDraft(actionSelection.length
      ? setDesignerActionProperty(historyRef.current.present, actionSelection, property, value)
      : setDesignerProperty(historyRef.current.present, targets, property, value, activeFieldIds))
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
    if (designerOpenRef.current || !dataEntryActiveRef.current) { control.setCustomValidity(''); return true }
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
    requestAnimationFrame(() => { if (dataEntryActiveRef.current && !designerOpenRef.current) formGridRef.current?.querySelector<HTMLInputElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus() })
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
  const restoreDesignerEntry = () => {
    if (!designerEntrySnapshot.current) return
    updateDraft(designerEntrySnapshot.current)
    designerEntrySnapshot.current = null
    dataEntryActiveRef.current = true
    setDataEntryActive(true)
  }
  const openDesigner = () => {
    if (!designerOpen) {
      designerOpenRef.current = true
      if (dataEntryActiveRef.current) {
        designerEntrySnapshot.current = draft
        updateDraft(entryDraftBaseline.current ?? defaultPersonDraft)
        dataEntryActiveRef.current = false
        setDataEntryActive(false)
      }
      formGridRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => control.setCustomValidity(''))
    } else restoreDesignerEntry()
    if (!designerOpen && editingBaseline.current === null) editingBaseline.current = history.present
    setFrozenCanvas(null)
    setDesignerOpen(value => !value)
  }
  const cancelDesigner = () => {
    if (activeManagedForm) {
      const saved = resolveManagedLaboratoryDesigner(activeManagedForm)
      setColorPreviewDraft(null)
      dispatchHistory({ type: 'replace', draft: saved })
      editingBaseline.current = saved
      setSaveStatus('')
      return
    }
    if (editingBaseline.current) dispatchHistory({ type: 'replace', draft: editingBaseline.current })
    else dispatchHistory({ type: 'replace', draft: history.present })
    editingBaseline.current = null
    restoreDesignerEntry()
    setDesignerOpen(false)
    setSaveStatus('')
  }
  const saveDraft = () => {
    if (activeManagedForm) { finishPropertyChange(); setManagedSaveDialogOpen(true); return }
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
  const resetAll = () => {
    setFrozenCanvas(null)
    if (activeManagedForm) {
      const saved = resolveManagedLaboratoryDesigner(activeManagedForm)
      setColorPreviewDraft(null); dispatchHistory({ type: 'replace', draft: saved }); setSaveStatus('')
      return
    }
    const { canvas: _canvas, ...reset } = resetDesignerFields(history.present, activeFieldIds)
    updateDraftState({ ...reset, appearance: undefined, defaults: undefined, actions: undefined, filterPopupFontSize: undefined, gridSearchPosition: undefined, buttonPressEffect: undefined })
  }
  const updateDraftState = (next: DesignerDraft) => { dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const blockedMessage = (id: string) => fa ? id === 'container' ? 'تراز انجام نشد: فضای کافی در محدودهٔ فرم وجود ندارد.' : `تراز انجام نشد: مسیر با «${labels[id]?.fa ?? id}» برخورد دارد؛ ابتدا مانع را جابه‌جا کنید.` : 'Alignment was blocked by an element or the canvas boundary.'
  const currentLayoutCanvas = () => {
    if (!geometryEditable || !designerOpen) return undefined
    const stored = designerDraftForEditor(historyRef.current.present, documentSchema, editorGeometryScoped ? editorSectionId : undefined).canvas
    if (stored || frozenCanvas) return stored ?? frozenCanvas ?? undefined
    return captureCurrentEditorCanvas()
  }
  const applyAlignment = (direction: DesignerAlignment) => {
    if(toolbarSelection&&toolbarSelection.parts.length>1){
      const table=documentSchema.tables?.find(item=>item.id===toolbarSelection.tableId)
      const root=formFrameRef.current?.querySelector<HTMLElement>('[data-table-id="'+toolbarSelection.tableId+'"] .grid-toolbar-panels')
      if(!table||!root)return
      const bounds=root.getBoundingClientRect(),fields:DesignerCanvas['fields']={}
      for(const part of toolbarSelection.parts){const rect=root.querySelector<HTMLElement>('[data-toolbar-part="'+part+'"]')?.getBoundingClientRect();if(rect){const box={left:rect.left-bounds.left+2400,top:rect.top-bounds.top+2400,width:rect.width,height:rect.height};fields[part]={input:box,label:{...box}}}}
      const result=alignCanvasFields({width:7200,height:7200,fields},toolbarSelection.parts,toolbarSelection.parts[0],direction,[],0)
      if(result.blockedBy){setLayoutStatus(blockedMessage(result.blockedBy));return}
      let toolbar=(table.settings?.toolbar??{}) as GridToolbarSettings
      for(const part of toolbarSelection.parts){const before=fields[part]?.input,after=result.canvas.fields[part]?.input;if(before&&after)toolbar=moveToolbarPart(toolbar,part,{x:(toolbar[part]?.x??0)+after.left-before.left,y:(toolbar[part]?.y??0)+after.top-before.top})}
      commitManagedStructure({...documentSchema,tables:documentSchema.tables?.map(item=>item.id===table.id?{...item,settings:{...item.settings,toolbar}}:item)});return
    }
    const canvas = currentLayoutCanvas()
    if (!canvas) { setLayoutStatus(fa ? 'ابتدا یک پنل ورودی در نمای دسکتاپ انتخاب کنید.' : 'Select an input panel in desktop view.'); return }
    const ids = selectedDesignerInputs(selection, geometryFieldIds)
    if (ids.length < 2) { setLayoutStatus(fa ? 'حداقل دو فیلد ورودی را انتخاب کنید.' : 'Select at least two input fields.'); return }
    const result = alignCanvasFields(canvas, ids, ids.includes(referenceId) ? referenceId : ids[0], direction)
    if (result.blockedBy) { setLayoutStatus(blockedMessage(result.blockedBy)); return }
    updateDraftState(withCanvas(history.present, result.canvas))
    setLayoutStatus('')
  }
  const applyLayout = (operation: DesignerLayoutOperation, orientation: DesignerLayoutOrientation, gap: number, options?: { width?: number; height?: number; verticalGap?: number }) => {
    const canvas = currentLayoutCanvas()
    if (!canvas) { setLayoutStatus(fa ? 'چیدمان در نمای دسکتاپ و پس از انتخاب پنل ورودی فعال است.' : 'Select an input panel in desktop view.'); return }
    if (operation === 'align') { applyAlignment(orientation === 'horizontal' ? 'top' : fa ? 'right' : 'left'); return }
    const ids = selectedDesignerInputs(selection, geometryFieldIds)
    if (ids.length < 2) { setLayoutStatus(fa ? 'حداقل دو فیلد ورودی را انتخاب کنید.' : 'Select at least two input fields.'); return }
    if ((options?.width !== undefined && (!Number.isFinite(options.width) || options.width < 48 || options.width > 1000)) || (options?.height !== undefined && (!Number.isFinite(options.height) || options.height < 24 || options.height > 600))) { setLayoutStatus(fa ? 'عرض معیار باید ۴۸ تا ۱۰۰۰ و ارتفاع معیار ۲۴ تا ۶۰۰ پیکسل باشد.' : 'Target width must be 48–1000px and height 24–600px.'); return }
    const measured = ids.map(id => {
      const field = canvas.fields[id], rect = fieldGroupRect({ ...field, select: undefined })
      return { id, ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, inputWidth: field.input.width, inputHeight: field.input.height, labelWidth: field.label.width, labelHeight: field.label.height }
    })
    const changed = layoutDesignerFields(history.present, measured, { operation, orientation, gap, rtl: fa, referenceId, ...options, wrapWidth: Math.min(canvas.width, activePreviewFrame.width) }, activeFieldIds)
    const fields = { ...canvas.fields }
    for (const id of ids) {
      const old = { ...history.present.overrides[id], ...history.present.overrides[`${id}::input`] }
      const next = { ...changed.overrides[id], ...changed.overrides[`${id}::input`] }
      fields[id] = translateCanvasField(fields[id], Number(next.offsetX ?? 0) - Number(old.offsetX ?? 0), Number(next.offsetY ?? 0) - Number(old.offsetY ?? 0))
      const width = Number(next.width ?? fields[id].input.width)
      fields[id] = { ...fields[id], input: { ...fields[id].input, left: fields[id].input.left + (fa && ['equalWidth', 'equalSize'].includes(operation) ? fields[id].input.width - width : 0), width, height: Number(next.height ?? fields[id].input.height) } }
    }
    const height = operation === 'arrange' ? Math.max(canvas.height, ...Object.values(fields).map(field => fieldGroupRect(field)).map(rect => rect.top + rect.height + 12)) : canvas.height
    const proposed = { ...canvas, fields, height }
    const blocked = height > 20000 ? 'container' : validateCanvasArrangement(canvas, proposed, ids, [], Math.min(8, gap, options?.verticalGap ?? gap), true)
    if (blocked) { setLayoutStatus(blockedMessage(blocked)); return }
    updateDraftState(withCanvas(history.present, proposed)); setLayoutStatus('')
  }
  const updateDirectProperty = (targetId: string, property: DesignerProperty, value: DesignerValue) => {
    dispatchHistory({ type: 'change', draft: setDesignerProperty(history.present, [targetId], property, value, activeFieldIds) })
    setSaveStatus('')
  }
  const captureCurrentEditorCanvas = (grid:HTMLDivElement|null=formGridRef.current): DesignerCanvas | undefined => {
    if (!grid) return undefined
    const origin = grid.getBoundingClientRect()
    const editor=grid.closest<HTMLElement>('.laboratory-editor'),editorBottom=editor?.getBoundingClientRect().bottom
    const availableHeight=editorBottom===undefined?origin.height:Math.max(origin.height,editorBottom-origin.top)
    const rect = (element: Element): DesignerRect => { const r = element.getBoundingClientRect(); return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height } }
    const fields: DesignerCanvas['fields'] = {}
    for (const element of grid.querySelectorAll<HTMLElement>('[data-field-id]')) {
      const input = element.querySelector('.designer-input-part'), label = element.querySelector('.designer-label-part')
      if (!input || !label) continue
      const select = element.querySelector('.laboratory-field-select'), error = element.querySelector('.field-error')
      fields[element.dataset.fieldId!] = { input: rect(input), label: rect(label), ...(select && select.getClientRects().length ? { select: rect(select) } : {}), ...(error && error.getClientRects().length ? { error: rect(error) } : {}) }
    }
    const captured = { width: origin.width, height: Math.max(availableHeight, ...Object.values(fields).flatMap(field => Object.values(field).map(part => part.top + part.height))), fields }
    return captured
  }
  const expandCanvasToEditorViewport = (source:DesignerCanvas,grid:HTMLDivElement|null):DesignerCanvas => {
    if(!grid)return source
    const editor=grid.closest<HTMLElement>('.laboratory-editor')
    if(!editor)return source
    const available=editor.getBoundingClientRect().bottom-grid.getBoundingClientRect().top
    return available>source.height?{...source,height:available}:source
  }
  // Capture the responsive grid once; commands can also capture synchronously.
  useLayoutEffect(() => {
    if (!designerOpen || !geometryEditable || storedEditorCanvas || frozenCanvas || !formGridRef.current) return
    const captured = captureCurrentEditorCanvas()
    if (!captured) return
    // Let the browser finish the responsive grid's first layout before freezing it.
    const frame = window.requestAnimationFrame(() => setFrozenCanvas(current => current ?? captured))
    if (existingCanvasCollisions(captured).length) setLayoutStatus(fa ? 'طرح فعلی هم‌پوشانی دارد؛ موقعیت عناصر موجود حفظ شده است.' : 'Existing overlaps were preserved.')
    return () => window.cancelAnimationFrame(frame)
  }, [designerOpen, geometryEditable, storedEditorCanvas, editorSectionId, documentSchema.id, frozenCanvas, geometryFieldIds.join('|')])
  useEffect(() => {
    const ids = selectedDesignerInputs(selection, geometryFieldIds)
    if (!ids.includes(referenceId)) setReferenceId(ids[0] ?? '')
  }, [selection, referenceId])
  useEffect(() => {
    if (!designerOpen) gestureCleanup.current?.()
    return () => gestureCleanup.current?.()
  }, [designerOpen])
  const withCanvas = (draft: DesignerDraft, nextCanvas: DesignerCanvas, sectionId=editorSectionId): DesignerDraft => {
    if(nextCanvas.centeredFieldIds?.length)nextCanvas=centerCanvasRows(nextCanvas)
    const previous = designerDraftForEditor(draft, documentSchema, editorGeometryScoped ? sectionId : undefined).canvas ?? (sectionId===editorSectionId?frozenCanvas:undefined) ?? nextCanvas
    let next = draft
    if (previous) for (const id of activeFieldIds) for (const part of ['input', 'label'] as const) {
      const old = previous.fields[id]?.[part], rect = nextCanvas.fields[id]?.[part]
      if (!old || !rect) continue
      const key = `${id}::${part}`, values = { ...draft.overrides[id], ...draft.overrides[key] }
      if (old.width !== rect.width) next = setDesignerProperty(next, [key], 'width', rect.width, activeFieldIds)
      if (old.height !== rect.height) next = setDesignerProperty(next, [key], 'height', rect.height, activeFieldIds)
      if (old.left !== rect.left) next = setDesignerProperty(next, [key], 'offsetX', Number(values.offsetX ?? 0) + rect.left - old.left, activeFieldIds)
      if (old.top !== rect.top) next = setDesignerProperty(next, [key], 'offsetY', Number(values.offsetY ?? 0) + rect.top - old.top, activeFieldIds)
    }
    return editorGeometryScoped && sectionId ? { ...next, layoutMode: 'canvas', sectionCanvases: { ...next.sectionCanvases, [sectionId!]: nextCanvas } } : { ...next, layoutMode: 'canvas', canvas: nextCanvas }
  }
  const centerEditorFields = (all=false) => {
    const current=currentLayoutCanvas();if(!current)return
    const grid=formGridRef.current,editor=grid?.parentElement
    const style=editor?getComputedStyle(editor):undefined
    const available=editor?editor.clientWidth-parseFloat(style!.paddingLeft)-parseFloat(style!.paddingRight):current.width
    const selected=selectedDesignerInputs(selection,geometryFieldIds)
    const ids=all?Object.keys(current.fields):selected.length?selected:contextMenu?.fieldId?[contextMenu.fieldId]:[]
    if(!ids.length)return
    const next=centerCanvasRows(current,ids,Math.max(320,available))
    updateDraftState(withCanvas(historyRef.current.present,next));setContextMenu(null);setGridSubmenu(null)
  }
  const changeNeighborResize = (axis:'horizontal'|'vertical',value:boolean|undefined) => {finishPropertyChange();const start=historyRef.current.present,neighborResize={...start.neighborResize};if(value===undefined)delete neighborResize[axis];else neighborResize[axis]=value;updateDraftState({...start,neighborResize})}
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
    if (!designerOpen || componentTestMode || event.button !== 0) return
    gestureCleanup.current?.()
    const ids = selectedDesignerInputs(selection, geometryFieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    event.currentTarget.focus({ preventScroll: true })
    const startDraft=historyRef.current.present,sourceSection=documentSchema.fields.find(field=>field.id===fieldId)?.sectionId
    const grid=event.currentTarget.closest<HTMLDivElement>('.laboratory-form-grid')
    const candidateCanvas=designerDraftForEditor(startDraft,documentSchema,editorGeometryScoped?sourceSection:undefined).canvas??(sourceSection===editorSectionId&&canvas?.fields[fieldId]?canvas:null)??captureCurrentEditorCanvas(grid)
    const initialCanvas=candidateCanvas?expandCanvasToEditorViewport(candidateCanvas,grid):undefined
    if(!initialCanvas?.fields[fieldId])return
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerPointer(event, (dx, dy) => {
      const resized = resizeCanvasHandle(initialCanvas, targets, edge, dx, dy,neighborResizeFor(startDraft))
      flushSync(() => dispatchHistory({ type: 'change', draft: withCanvas(startDraft, resized,sourceSection) }))
    }, finishGesture)
  }
  const handleInputResizeKey = (event: React.KeyboardEvent<HTMLElement>, fieldId: string, handle: DesignerResizeHandle) => {
    if (!designerOpen || !geometryEditable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault(); event.stopPropagation()
    const start = historyRef.current.present
    const sourceSection=documentSchema.fields.find(field=>field.id===fieldId)?.sectionId
    const grid=event.currentTarget.closest<HTMLDivElement>('.laboratory-form-grid')
    const stored=designerDraftForEditor(start,documentSchema,editorGeometryScoped?sourceSection:undefined).canvas??frozenCanvas
    const candidate=stored?.fields[fieldId]?stored:captureCurrentEditorCanvas(grid)
    const currentCanvas=candidate?expandCanvasToEditorViewport(candidate,grid):undefined
    if (!currentCanvas) return
    const ids = selectedDesignerInputs(selection, geometryFieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    const resized = resizeCanvasHandle(currentCanvas, targets, handle, dx, dy,neighborResizeFor(start))
    if (resized !== currentCanvas) updateDraftState(withCanvas(start, resized,sourceSection))
  }
  const clearDesignerSelection = () => {setSelection([]);setActionSelection([]);setToolbarSelection(null);setSelectedTableColumnIds([]);setManagedSelectedFieldId(null);setApplyToAll(false)}
  const beginFieldMove = (event: React.PointerEvent<HTMLElement>, targetId: string, part: 'label' | 'input', onTap?:()=>void) => {
    if (!designerOpen || componentTestMode || event.button !== 0) return
    gestureCleanup.current?.()
    const fieldId = targetId.split('::')[0], ids = selectedDesignerInputs(selection, geometryFieldIds)
    const targets = part === 'input' && ids.includes(fieldId) ? ids : [fieldId]
    const startDraft=historyRef.current.present,sourceSection=documentSchema.fields.find(field=>field.id===fieldId)?.sectionId
    const grid=event.currentTarget.closest<HTMLDivElement>('.laboratory-form-grid')
    const candidateCanvas=designerDraftForEditor(startDraft,documentSchema,editorGeometryScoped?sourceSection:undefined).canvas??(sourceSection===editorSectionId&&canvas?.fields[fieldId]?canvas:null)??captureCurrentEditorCanvas(grid)
    const initialCanvas=candidateCanvas?expandCanvasToEditorViewport(candidateCanvas,grid):undefined
    if(!initialCanvas?.fields[fieldId])return
    let didMove=false
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerPointer(event, (dx, dy) => {
      if(!didMove&&Math.hypot(dx,dy)<3)return
      didMove=true
      let moved = moveCanvasFields(initialCanvas, targets, dx, dy)
      if (part === 'label') {
        const label = initialCanvas.fields[fieldId].label
        moved = { ...initialCanvas, fields: { ...initialCanvas.fields, [fieldId]: { ...initialCanvas.fields[fieldId], label: { ...label, left: Math.max(0, Math.min(initialCanvas.width - label.width, label.left + dx)), top: Math.max(0, Math.min(initialCanvas.height - label.height, label.top + dy)) } } } }
      }
      flushSync(() => dispatchHistory({ type: 'change', draft: withCanvas(startDraft, moved,sourceSection) }))
    }, ended=>{finishGesture();if(!didMove&&ended?.type==='pointerup')onTap?.()})
  }
  const rectStyle = designerRectStyle
  const partStyle = (id: string, part: 'input' | 'label'): CSSProperties => ({ ...designerStyleForPart(visibleDraft, id, part), ...rectStyle(canvas?.fields[id]?.[part]) })
  const undo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } undoHistory() }
  const redo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } redoHistory() }
  useEffect(() => {
    if (!activeManagedForm || !designerOpen) return
    const onDocumentHistoryKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      event.preventDefault()
      if (key === 'z' && !event.shiftKey) undo(); else redo()
    }
    window.addEventListener('keydown', onDocumentHistoryKey)
    return () => window.removeEventListener('keydown', onDocumentHistoryKey)
  }, [activeManagedForm?.id, designerOpen])
  const handleDesignerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if(formRuntimeTesting){
      const target=event.target as HTMLElement
      if(target.closest('[role="dialog"],.person-number-list,.excel-color-picker'))return
      const nativeControl = target.matches('input,textarea,select')
      const canHandleSpaceNatively = nativeControl && !target.matches(':disabled') && !('readOnly' in target && Boolean((target as HTMLInputElement | HTMLTextAreaElement).readOnly))
      if(runtime.mode==='view'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!canHandleSpaceNatively&&!target.isContentEditable){
        const command=({' ':'create',Insert:'edit',Delete:'delete',Home:'first',End:'last',PageUp:'previous',PageDown:'next',ArrowUp:'previous',ArrowDown:'next'} as const)[event.key as ' '| 'Insert']
        if(command){event.preventDefault();event.stopPropagation();if(!event.repeat)runRuntimeAction(command);return}
      }
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();runRuntimeAction('close')}
      if(functionKeyFromEvent(event.nativeEvent)==='F3'){event.preventDefault();event.stopPropagation();runRuntimeAction('save')}
      return
    }
    const keyboardTarget = event.target as HTMLElement
    if (designerOpen && geometryEditable && !event.defaultPrevented && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !keyboardTarget.closest('input,textarea,select,[contenteditable],.managed-form-workspace-sidebar,[role="dialog"],.designer-edge-handle')) {
      const ids=selectedDesignerInputs(selection,geometryFieldIds)
      let current=currentLayoutCanvas()
      if(ids.some(id=>!current?.fields[id]))current=captureCurrentEditorCanvas(keyboardTarget.closest<HTMLDivElement>('.laboratory-form-grid'))??current
      if (current && ids.length) {
        event.preventDefault(); event.stopPropagation()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        updateDraftState(withCanvas(historyRef.current.present, moveCanvasFields(current, ids, dx, dy)))
        setLayoutStatus((fa ? 'جابجایی: ' : 'Move: ') + dx + ', ' + dy + ' px')
        return
      }
    }

    if (managedFormEditorOpen && !((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))) return
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
      const editingField = target instanceof HTMLElement && ((target.matches('input, select, textarea') && !target.matches(':disabled') && !('readOnly' in target && Boolean((target as HTMLInputElement | HTMLTextAreaElement).readOnly))) || target.isContentEditable)
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
  const renderField = (id: string, layoutClass: string, control: React.ReactNode, error?: string, options: { readOnly?: boolean; designerSelectable?: boolean; designerDraft?: DesignerDraft; canvas?: DesignerCanvas; gridStyle?: CSSProperties; label?: string; structureSelection?: { selected: boolean; onSelect: (event: React.MouseEvent) => void } } = {}) => {
    const readOnly = options.readOnly === true
    const renderDraft = options.designerDraft ?? visibleDraft
    const renderCanvas = options.canvas
    const positionedRect = (rect?:DesignerRect):CSSProperties => ({...rectStyle(rect),...(rect&&renderCanvas?.centeredFieldIds?.includes(id)?{left:`calc(${rect.left}px + var(--lab-center-shift, 0px))`}:{})})
    const selectionRect = renderCanvas?.fields[id]?.select
    const selectionStyle = positionedRect(selectionRect ? { ...selectionRect, left: renderCanvas!.fields[id].input.left + 4 } : undefined)
    const fieldDesignerOpen = designerOpen && !componentTestMode && (!readOnly || options.designerSelectable === true)
    const fieldGeometryEditable = geometryEditable && !componentTestMode && (!readOnly || options.designerSelectable === true)
    const fieldDefinition = documentSchema.fields.find(field => field.id === id)
    const required = fieldDefinition?.required === true
    const selected = fieldDesignerOpen && selection.includes(`${id}::field`)
    const inputSelected = fieldDesignerOpen && (selected || selection.includes(`${id}::input`))
    const labelSelected = fieldDesignerOpen && (selected || selection.includes(`${id}::label`))
    const fieldLabel = options.label ?? labels[id]?.[language] ?? id
    const structureSelected = options.structureSelection?.selected === true
    const partPointer=(event:React.PointerEvent<HTMLElement>,part:'input'|'label')=>{
      if(!fieldDesignerOpen||!fieldGeometryEditable||event.button!==0||(event.target as Element).closest('button,.excel-color-picker'))return
      const wasSelected=selection.includes(id+'::'+part)||selection.includes(id+'::field')
      if(!wasSelected||event.ctrlKey||event.metaKey)selectField(id,event as unknown as React.MouseEvent,part)
      event.currentTarget.focus({preventScroll:true})
      if(!event.ctrlKey&&!event.metaKey)beginFieldMove(event,id+'::'+part,part,wasSelected?clearDesignerSelection:undefined)
    }
    return <div key={id} className={'laboratory-designer-field ' + layoutClass + ((!readOnly && selection.some(key => key.startsWith(`${id}::`))) || structureSelected ? ' is-selected' : '')} data-field-id={id} data-form-behavior-id={String(fieldDefinition?.settings?.behaviorId??effectiveBehaviorId)} data-form-policy={previewPolicy(String(fieldDefinition?.settings?.behaviorId??effectiveBehaviorId))} data-enter-target={typeof fieldDefinition?.settings?.enterTarget==='string'?fieldDefinition.settings.enterTarget:undefined} data-field-review={fieldReviewIds.has(id) || undefined} data-structure-selected={structureSelected || undefined} style={{ ...options.gridStyle, ...(structureSelected ? { outline: '2px solid var(--accent, #208579)', outlineOffset: 2 } : {}), ...(renderCanvas?.fields[id]?.error ? { '--canvas-error-left': renderCanvas.centeredFieldIds?.includes(id)?`calc(${renderCanvas.fields[id].error!.left}px + var(--lab-center-shift, 0px))`:renderCanvas.fields[id].error!.left + 'px', '--canvas-error-top': renderCanvas.fields[id].error!.top + 'px', '--canvas-error-width': renderCanvas.fields[id].error!.width + 'px', '--canvas-error-height': renderCanvas.fields[id].error!.height + 'px' } : {}) } as CSSProperties} role="group" aria-label={fieldLabel}>
      {(!componentTestMode&&(!readOnly || options.structureSelection)) && <button type="button" className="laboratory-field-select" style={selectionStyle} aria-label={(fa ? 'انتخاب فیلد ' : language === 'zh' ? '选择字段 ' : 'Select field ') + fieldLabel} aria-pressed={selected || structureSelected} onClick={event => { event.stopPropagation(); if (options.structureSelection) options.structureSelection.onSelect(event); else selectField(id, event) }}>{selected || structureSelected ? '✓' : '+'}</button>}
      <Field label={fieldLabel} labelId={`laboratory-label-${id}`} labelContent={<span className={'designer-label-part' + (labelSelected ? ' designer-part-selected' : '')} style={{ ...designerStyleForPart(renderDraft, id, 'label'), ...positionedRect(renderCanvas?.fields[id]?.label) }} tabIndex={fieldDesignerOpen?0:undefined} onPointerDown={event=>partPointer(event,'label')} onClick={event => { if (fieldDesignerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button,input')) { return } } }}>{fieldLabel}{fieldDefinition&&fieldRuleMarkers(documentSchema,fieldDefinition).map(marker=><span key={marker.symbol} className="field-rule-marker" title={marker.description} aria-label={marker.description}>{marker.symbol}</span>)}{labelSelected && <>{fieldGeometryEditable && <button type="button" className="designer-move-handle" aria-label="Move label" onClick={stopDesignerHandleClick} onPointerDown={event => beginFieldMove(event, `${id}::label`, 'label')}>↕</button>}<span className="designer-type-tools"><button type="button" aria-label="Decrease label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.max(8, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) - 1)) }}>A−</button><button type="button" aria-label="Increase label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.min(40, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) + 1)) }}>A+</button><button type="button" aria-label="Toggle label bold" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'bold', !(history.present.overrides[`${id}::label`]?.bold ?? false)) }}>B</button><ExcelColorPicker language={language} label="Label color" value={String(designerEffectiveValues(renderDraft, id, 'label').textColor ?? getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() ?? '#71817e')} onPreview={value => previewColorProperty('labelColor', value, [`${id}::label`])} onCommit={value => commitColorProperty('labelColor', value, [`${id}::label`])} /></span></>}</span>} controlContent={<span className={'designer-input-part' + (inputSelected ? ' designer-part-selected' : '')} style={{ ...designerStyleForPart(renderDraft, id, 'input'), ...positionedRect(renderCanvas?.fields[id]?.input) }} tabIndex={fieldDesignerOpen?0:undefined} onPointerDown={event=>partPointer(event,'input')} onClick={event => { if (fieldDesignerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) { return } event.preventDefault(); /* Pointer selection is owned by partPointer, including Ctrl toggles. */ } }}>{React.isValidElement(control) ? React.cloneElement(control as React.ReactElement<any>, { style: { ...designerStyleForPart(renderDraft, id, 'input') as CSSProperties, ...((control as React.ReactElement<{ style?: CSSProperties }>).props.style ?? {}) }, ...(typeof control.type === 'string' ? { 'data-field': id, ...(required ? { required: !designerOpen, 'aria-required': !designerOpen, onInput: (event: React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => event.currentTarget.setCustomValidity(''), onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { if (!(event.relatedTarget instanceof Element && event.relatedTarget.closest('.laboratory-designer-toggle, .laboratory-designer-pane'))) validateRequiredField(id, event.currentTarget) } } : {}) } : { required, designerMode: fieldDesignerOpen }) }) : control}{inputSelected && fieldGeometryEditable && <><button type="button" className="designer-move-handle" aria-label="Move input" onClick={stopDesignerHandleClick} onPointerDown={event=>beginFieldMove(event, `${id}::input`, 'input')}>↕</button>{designerResizeHandles.map(edge=><button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize input ${edge}`} title={fa?`تغییر اندازه ${edge}؛ کلیدهای جهت‌دار، Shift برای ۱۰ پیکسل`:`Resize ${edge}: arrows; Shift for 10 pixels`} onKeyDown={event=>handleInputResizeKey(event,id,edge)} onClick={stopDesignerHandleClick} onPointerDown={event=>beginInputResize(event,id,edge)}/>)}</>}</span>} error={error} style={designerStyleForPart(renderDraft, id, 'field') as CSSProperties}>{control}</Field>
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
  const contextLayout = !actionSelection.length && contextInputs && selectedDesignerInputs(selection, geometryFieldIds).length > 1 && Boolean(canvas)
  const selectedTableColumnId = selectedTableColumnIds[0]
  const selectedTableColumn = selectedTableColumnId ? activeDesignerColumns.find(column => column.id === selectedTableColumnId) : undefined
  const activeGridColumnIds = (id?: string) => id ? selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id] : selectedTableColumnIds.length?selectedTableColumnIds:activeDesignerColumns.map(column=>column.id)
  const activeGridHeaderIds = (id?: string) => headerStyleScope === 'all' ? activeDesignerColumns.map(column => column.id) : activeGridColumnIds(id)
  const changeTableHeaderHeight = (delta: number) => {
    updateDraftState(setDesignerTableHeaderHeight(historyRef.current.present, Math.max(28, Math.min(120, (designerDraftForTable(historyRef.current.present, scopedTableId()).tableHeaderHeight ?? 42) + delta))))
  }
  const handleGridDialogHeaderPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const pointerId = event.pointerId
    const rect = gridFormatDialogRef.current?.getBoundingClientRect()
    if (!rect) return
    gridFormatDialogDrag.current = { pointerId, startX: event.clientX, startY: event.clientY, originX: gridFormatDialogOffset.x, originY: gridFormatDialogOffset.y, baseLeft: rect.left - gridFormatDialogOffset.x, baseTop: rect.top - gridFormatDialogOffset.y, width: rect.width, height: rect.height }
    event.currentTarget.setPointerCapture(pointerId)
    event.preventDefault()
  }
  const handleGridDialogHeaderPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = gridFormatDialogDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = drag.originX + event.clientX - drag.startX
    const y = drag.originY + event.clientY - drag.startY
    setGridFormatDialogOffset({ x: Math.max(16 - drag.baseLeft, Math.min(x, window.innerWidth - 16 - drag.baseLeft - drag.width)), y: Math.max(16 - drag.baseTop, Math.min(y, window.innerHeight - 16 - drag.baseTop - drag.height)) })
  }
  const handleGridDialogHeaderPointerEnd = (event: React.PointerEvent<HTMLElement>) => { if (gridFormatDialogDrag.current?.pointerId === event.pointerId) gridFormatDialogDrag.current = null }
  const selectedTableHeader = selectedTableColumn
  const footerActions = activeActions.filter(action => !('hidden' in action && action.hidden) && designerActionVisible(visibleDraft, action))
  const renderLaboratoryEditor = (readOnly = false, sourceDesignerDraft: DesignerDraft = visibleDraft, schema?: FormSchemaDraft, structureSelection?: { selectedFieldId: string | null; onSelect: (id: string, event: React.MouseEvent) => void }, designerSelectable = false, sectionId?: string) => {
    // Both the Laboratory and independent forms resolve Canvas first, then Schema grid placement.
    const layoutSchema = schema ?? documentSchema
    const designerDraft = designerDraftForEditor(sourceDesignerDraft, documentSchema, sectionId)
    const viewKey=layoutSchema.id+':'+(sectionId??'editor')+':'+layoutSchema.fields.map(field=>field.id).join('|')
    if(!canvasViewOrigins.current.has(viewKey))canvasViewOrigins.current.set(viewKey,designerDraft.canvas?designerCanvasViewOrigin(designerDraft.canvas):0)
    const layout = resolveFormLayout(layoutSchema, designerDraft, activePreviewFrame.device, activePreviewFrame.width, {cropEmptyCanvas:Boolean(activeManagedForm),originX:canvasViewOrigins.current.get(viewKey)})
    const editorCanvas = layout.canvas
    const fieldLabelFor = (id: string) => schema?.fields.find(field => field.id === id)?.label[language] ?? labels[id]?.[language] ?? id
    const renderEditorField = (id: string, layoutClass: string, control: React.ReactNode, error?: string) => ((formRuntimeTesting||Boolean(operationalSource(layoutSchema))) && layoutClass !== 'lab-custom-field') || schema && !schema.fields.some(field => field.id === id) ? null : renderField(id, layoutClass, control, error, { readOnly, designerSelectable, designerDraft, canvas: editorCanvas, gridStyle: layout.fieldStyles[id], label: fieldLabelFor(id), structureSelection: structureSelection ? { selected: structureSelection.selectedFieldId === id, onSelect: event => structureSelection.onSelect(id, event) } : undefined })
    const values = readOnly ? defaultPersonDraft : draft
    const disabled = readOnly || !dataEntryActive
    const viewport = editorViewport(layoutSchema.sections.find(section => section.id === (sectionId ?? layoutSchema.sections.find(item => item.kind === 'editor')?.id)))
    return <div className="person-editor panel laboratory-editor" onClick={event=>{if(designerOpen&&!componentTestMode&&(!readOnly||designerSelectable)&&!(event.target as Element).closest('[data-field-id],button,input,select,textarea,[role="menu"]'))clearDesignerSelection()}} style={{ ...designerAppearanceStyle(designerDraft), overflowX: viewport.overflowX, overflowY: viewport.overflowY } as CSSProperties}><div ref={node => {
      if (!node) return
      renderedLayoutRoots.current.set(node, layout)
      if (!(readOnly && !designerSelectable || sectionId && sectionId !== editorSectionId)) formGridRef.current = node
      return () => { renderedLayoutRoots.current.delete(node); if (formGridRef.current === node) formGridRef.current = null }
    }} className={'person-form-grid laboratory-form-grid' + (editorCanvas ? ' has-fixed-geometry' : '')} data-layout-guides={designerOpen&&!componentTestMode&&layoutGuideStep>0||undefined} data-layout-form-id={layout.formId} data-layout-kind={layout.kind} data-layout-device={layout.device} data-layout-columns={layout.columns} style={{ ...(layoutGuideStep>0?{'--designer-guide-step':layoutGuideStep+'px'}:{}), ...(editorCanvas ? { width: editorCanvas.centeredFieldIds?.length?'100%':editorCanvas.width, '--lab-center-shift':editorCanvas.centeredFieldIds?.length?`calc(50% - ${editorCanvas.width/2}px)`:'0px', height: editorCanvas.height, minWidth: editorCanvas.centeredFieldIds?.length?0:editorCanvas.width, marginLeft:editorCanvas.centeredFieldIds?.length?'auto':0, marginRight:'auto' } : {}), ...(layout.columns ? { '--form-schema-grid-columns': String(layout.columns) } : {}), ...(layout.minimumWidth ? { '--form-schema-grid-min-width': `${layout.minimumWidth}px` } : {}) } as CSSProperties} data-section-id={sectionId ?? layoutSchema.sections.find(section => section.kind === 'editor')?.id} onClick={event => { if (designerOpen && (!readOnly || designerSelectable) && event.target === event.currentTarget) setSelection([]) }}>
      {renderEditorField('personCode', 'lab-person-code', <input aria-label={fieldLabelFor('personCode')} value={values.personCode} disabled={disabled} onChange={readOnly ? undefined : event => update('personCode', event.target.value)} />)}
      {renderEditorField('titleId', 'lab-title laboratory-shared-contact', <FormValueList onSelectValue={value => { if (!readOnly) { const option = labTitles.find(item => titleName(item) === value); if (option) update('titleId', option.id) } }} field="titleId" label={fieldLabelFor('titleId')} primary={labTitles.find(option => option.id === values.titleId) ? titleName(labTitles.find(option => option.id === values.titleId)!) : ''} numbers={labTitles.map(titleName)} listPrimary={labTitles.find(option => option.id === defaultTitleId) ? titleName(labTitles.find(option => option.id === defaultTitleId)!) : ''} disabled={disabled} fa={fa} multiline minListWidth={240} addLabel={fa ? 'افزودن عنوان' : 'Add title'} listLabel={fa ? 'نمایش عنوان‌ها' : 'Show titles'} getItemKey={original => labTitles.find(option => titleName(option) === original)?.id ?? original} className="laboratory-title-text-control" canEdit={original => !titleInUse(labTitles.find(option => titleName(option) === original)?.id ?? '')} canRemove={original => !titleInUse(labTitles.find(option => titleName(option) === original)?.id ?? '')} onChange={readOnly ? () => false : commitLaboratoryTitles} />)}
      {renderEditorField('firstName', 'lab-first', <input aria-label={fieldLabelFor('firstName')} value={values.firstName} disabled={disabled} onChange={readOnly ? undefined : event => update('firstName', event.target.value)} />)}
      {renderEditorField('lastName', 'lab-last', <input aria-label={fieldLabelFor('lastName')} value={values.lastName} disabled={disabled} onChange={readOnly ? undefined : event => update('lastName', event.target.value)} />)}
      {renderEditorField('jobId', 'lab-job', <select aria-label={fieldLabelFor('jobId')} value={values.jobId} disabled={disabled} onChange={readOnly ? undefined : event => update('jobId', event.target.value)}>{jobOptionIds.map(id => <option key={id} value={id}>{jobLabels[id][language]}</option>)}</select>)}
      {renderEditorField('nationalityId', 'lab-nationality', <select aria-label={fieldLabelFor('nationalityId')} value={values.nationalityId} disabled={disabled} onChange={readOnly ? undefined : event => update('nationalityId', event.target.value)}><option value="iranian">{fa ? 'ایرانی' : language === 'zh' ? '伊朗' : 'Iranian'}</option><option value="chinese">{fa ? 'چینی' : language === 'zh' ? '中国' : 'Chinese'}</option></select>)}
      {renderEditorField('phone', 'lab-phone laboratory-shared-contact', <FormValueList listPrimary={values.phoneDefault} onSelectValue={value => { if (!readOnly) update('phone', value) }} field="phone" label={fieldLabelFor('phone')} primary={values.phone} numbers={values.phoneNumbers} disabled={disabled} fa={fa} suggestedCode={values.nationalityId === 'chinese' ? '+86' : '+98'} onChange={readOnly ? () => undefined : (phone, phoneNumbers) => updateDraft(current => ({ ...current, phone, phoneDefault: phone, phoneNumbers }))} />)}
      {renderEditorField('mobile', 'lab-mobile laboratory-shared-contact', <FormValueList listPrimary={values.mobileDefault} onSelectValue={value => { if (!readOnly) update('mobile', value) }} field="mobile" label={fieldLabelFor('mobile')} primary={values.mobile} numbers={values.mobileNumbers} disabled={disabled} fa={fa} suggestedCode={values.nationalityId === 'chinese' ? '+86' : '+98'} onChange={readOnly ? () => undefined : (mobile, mobileNumbers) => updateDraft(current => ({ ...current, mobile, mobileDefault: mobile, mobileNumbers }))} />)}
      {renderEditorField('disabledExample', 'lab-disabled', <input disabled value={fa ? 'فقط نمایشی' : 'Display only'} readOnly />)}
      {renderEditorField('address', 'lab-address laboratory-shared-contact', <FormValueList listPrimary={values.addressDefault} onSelectValue={value => { if (!readOnly) update('address', value) }} field="address" label={fieldLabelFor('address')} primary={values.address} numbers={values.addresses} disabled={disabled} fa={fa} onChange={readOnly ? () => undefined : (address, addresses) => updateDraft(current => ({ ...current, address, addressDefault: address, addresses }))} multiline />)}
      {renderEditorField('notes', 'lab-notes', <input type="text" data-field="notes" aria-label={fieldLabelFor('notes')} placeholder={fa ? 'نمونهٔ حالت عادی' : 'Normal state example'} value={values.notes} disabled={disabled} onChange={readOnly ? undefined : event => update('notes', event.target.value)} />)}
      {renderEditorField('errorExample', 'lab-error', <input aria-label={fieldLabelFor('errorExample')} aria-invalid="true" disabled={readOnly} defaultValue="نمونه" />, fa ? 'دادهٔ آزمایشی نامعتبر است.' : 'Synthetic validation example.')}
      {layoutSchema.fields.filter(field => formRuntimeTesting || Boolean(operationalSource(layoutSchema)) || !fieldIds.includes(field.id)).map(field => {
        const testKey=documentSchema.id+':'+field.id, storedSample=componentTestValues[testKey]??{value:'',options:[]},sample=formRuntimeTesting?{...storedSample,value:runtime.draft[field.id]??''}:storedSample
        const setSample=(value:string,options?:string[],defaultValue?:string)=>{setComponentTestValues(current=>({...current,[testKey]:{value,options:options??current[testKey]?.options??[],defaultValue:defaultValue??current[testKey]?.defaultValue}}));if(formRuntimeTesting){dispatchRuntime({type:'change',field:field.id,value});setRuntimeErrors(current=>{const next={...current};for(const item of documentSchema.fields)if(item.id===field.id||effectiveFieldRules(item).unique||item.ruleSettings?.dependencies?.length||documentSchema.uniqueConstraints?.some(rule=>rule.fieldIds.includes(item.id)))delete next[item.id];return {...next,...validateRecordRules(documentSchema,{...runtime.draft,[field.id]:value},runtime.records,runtime.mode==='edit'?runtime.selectedId:null)}})}}
        const testing=componentTestMode&&(Boolean(activeManagedForm)||formRuntimeTesting)&&(!formRuntimeTesting||runtime.mode!=='view')&&!field.readOnly
        const common = { 'aria-label': field.label[language], disabled: !testing, readOnly: !testing, value: sample.value,onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setSample(event.target.value) }
        const listProps = { componentDefinitionId:typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId,field: field.id, label: field.label[language], primary: sample.value, numbers: sample.options, disabled: !testing, fa, onChange: (value:string,options:string[]) => setSample(value,options,value) }
        const codeSettings={...defaultCodeComponentSettings,...(field.settings?.componentSettings as Partial<CodeComponentSettings>|undefined),incremental:field.componentId==='base-form.incremental-code'}
        const existingCodes=runtime.records.filter(row=>row.id!==runtime.selectedId).map(row=>row.values[field.id]??'')
        const codeError=validateComponentCode(sample.value,codeSettings,existingCodes)
        const changeCode=(value:string)=>{setSample(value);setRuntimeErrors(current=>({...current,[field.id]:validateComponentCode(value,{...codeSettings,required:effectiveFieldRules(field).required,unique:false},[])??validateRecordRules(documentSchema,{...runtime.draft,[field.id]:value},runtime.records,runtime.mode==='edit'?runtime.selectedId:null)[field.id]??''}))}
        const control = field.componentId==='base-form.date-input' ? <SystemDateInput value={sample.value} onChange={setSample} disabled={!testing} required={field.required} language={language} ariaLabel={field.label[language]} suggestToday={field.settings?.suggestToday===true}/> : field.componentId==='base-form.code-input'||field.componentId==='base-form.incremental-code' ? <div className="laboratory-code-control"><input {...common} type="text" inputMode={codeSettings.mode==='number'?'numeric':'text'} required={codeSettings.required} aria-invalid={Boolean(codeError)||undefined} onChange={event=>changeCode(event.target.value)}/>{codeSettings.incremental&&<button type="button" disabled={!testing} onClick={()=>changeCode(nextIncrementalCode(existingCodes,codeSettings))}>پیشنهاد شمارهٔ بعدی</button>}</div> : (field.componentId === 'persons.title-control'||field.componentId === 'form-laboratory.titleId') ? <PersonTitleControl label={field.label[language]} field={field.id} componentDefinitionId={typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId} defaultValue={sample.defaultValue??sample.value} onCommit={async(primary,names)=>{setSample(primary,names,primary);return {options:names.map(name=>({id:name,nameFa:name,nameEn:name,personType:'Individual' as const})),defaultId:primary}}} value={sample.value} options={sample.options.map(name=>({id:name,nameFa:name,nameEn:name,personType:'Individual' as const}))} disabled={!testing} canCreate={testing} fa={fa} language={language} onChange={value=>setSample(value)} onCreate={async name=>{setSample(name,[...sample.options,name]);return {id:name,nameFa:name,nameEn:name,personType:'Individual'}}} /> : field.componentId === 'base-form.number-control' ? <NumberControl {...listProps} /> : field.kind === 'valueList' ? <FormValueList {...listProps} listPrimary={sample.defaultValue??sample.value} onSelectValue={value=>setSample(value)} multiline={field.settings?.multiline === true} /> : ['select','lookup','multiSelect'].includes(field.kind) ? <select aria-label={field.label[language]} disabled={!testing} value={sample.value} onChange={event=>setSample(event.target.value)}><option value="">{field.placeholder?.[language] ?? ''}</option>{['نمونهٔ یک','نمونهٔ دو',...sample.options].map(value=><option key={value}>{value}</option>)}</select> : field.kind === 'textarea' ? <textarea {...common} /> : <input {...common} type={field.valueType === 'number' || field.kind === 'number' ? 'number' : field.kind === 'checkbox' ? 'checkbox' : field.kind === 'date' ? 'date' : field.kind === 'file' ? 'file' : 'text'} />

        return renderEditorField(field.id, 'lab-custom-field', control,runtimeErrors[field.id])
      })}

    </div>{!readOnly && !editorCanvas && geometryEditable && <div className="designer-canvas-spacer" aria-hidden="true" style={canvasStyle} />}</div>
  }
  const renderLaboratoryFooter = (readOnly = false, designerDraft: DesignerDraft = visibleDraft, actions: BaseFormAction[] = laboratoryDefinition.actions ?? [], designerSelectable = false) => {
    const visibleActions = actions.filter(action => !('hidden' in action && action.hidden) && designerActionVisible(designerDraft, action)).filter(action => !formRuntimeTesting || (formTestActionFor(action) ? testActionVisible(runtime.mode,formTestActionFor(action)!) : runtime.mode==='view'))
    return <div className={`shortcut-bar laboratory-footer${!readOnly && dataEntryActive ? ' is-entry-active' : ''}`} dir={fa ? 'rtl' : 'ltr'} data-runtime-actions={formRuntimeTesting||undefined} role="group" aria-label={fa ? 'دکمه‌های پایین فرم' : 'Form actions'} aria-live="polite" style={designerAppearanceStyle(designerDraft) as CSSProperties}>{visibleActions.map(action => {
    const runtimeAction=formRuntimeTesting?formTestActionFor(action):undefined
    const disabled = formRuntimeTesting ? !runtimeAction || (['edit','delete','first','last','previous','next'].includes(runtimeAction)&&!runtime.selectedId) : (readOnly && !designerSelectable) || (!designerOpen && actionDisabled(action))
    const entryActive = !formRuntimeTesting && !readOnly && dataEntryActive
    return <span key={action.id} data-action-id={action.id} className={'laboratory-action-button' + (action.iconOnly ? ' is-icon-action' : '') + (!formRuntimeTesting && (!readOnly || designerSelectable) && designerOpen && actionSelection.includes(action.id) ? ' designer-part-selected' : '')} style={designerActionStyle(designerDraft, action.id) as CSSProperties} title={disabled ? action.id === 'edit-person' ? (fa ? 'برای ویرایش باید جدول رکورد داشته باشد.' : 'The table must contain records to edit.') : fa ? 'این کلید در حالت فعلی فرم قابل استفاده نیست.' : 'This action is unavailable in the current form mode.' : undefined} onClickCapture={event => {
      if (formRuntimeTesting || (readOnly && !designerSelectable) || !designerOpen || (event.target as HTMLElement).closest('.designer-edge-handle')) return
      event.preventDefault(); event.stopPropagation(); setSelection([])
      setActionSelection(current => event.ctrlKey || event.metaKey ? current.includes(action.id) ? current.filter(id => id !== action.id) : [...current, action.id] : [action.id])
    }}><Shortcut code={entryActive ? action.code : designerActionCode(designerDraft, action)} label={entryActive ? action.label[language] : designerActionLabel(designerDraft, action, language)} runtimeAction={runtimeAction} codeStyle={designerActionTextStyle(designerDraft, action.id, 'code')} labelStyle={designerActionTextStyle(designerDraft, action.id, language)} disabled={disabled} primary={action.primary} danger={action.id === 'delete-person' || action.id === 'operational.delete'} onClick={() => { if (runtimeAction) runRuntimeAction(runtimeAction); else if (!formRuntimeTesting&&!readOnly) runAction(action.id) }} />{!formRuntimeTesting && (!readOnly || designerSelectable) && designerOpen && geometryEditable && actionSelection.includes(action.id) && (['left', 'right', 'top', 'bottom'] as const).map(edge => <button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize action ${action.id} ${edge}`} onClick={stopDesignerHandleClick} onPointerDown={event => beginActionResize(event, action.id, edge)} />)}</span>
  })}</div>
  }
  const latestRecoverySnapshot = (): RecoverableForm | null => {
    if (!activeManagedForm) return null
    const latest = historyRef.current, doc = latest.document
    return { form: { ...activeManagedForm, schema: doc?.present ?? documentSchema }, designerHistory: latest, structureHistory: doc ? { present: doc.present, past: doc.past, future: doc.future } : managedStructureHistory ?? createManagedFormStructureHistory(documentSchema) }
  }
  const persistRecoverySnapshot = (snapshot: RecoverableForm, reason?: string) => {
    const result = writeFormRecoveryResult(browserFormStorage(), authenticatedUserId, snapshot, reason)
    const success = result === 'saved'
    if (!success) {
      const reasons = { unavailable: 'حافظهٔ محلی در دسترس نیست', 'invalid-snapshot': 'نسخهٔ جاری با تاریخچهٔ فرم سازگار نیست', 'invalid-journal': 'دادهٔ بازیابی قبلی نامعتبر یا ناسازگار است', quota: 'ظرفیت حافظهٔ محلی پر شده است', 'storage-error': 'نوشتن در حافظهٔ محلی ممکن نشد' }
      setRecoveryStatus(fa ? `ذخیرهٔ بازیابی انجام نشد: ${reasons[result as keyof typeof reasons]}. دادهٔ قبلی حفظ شد؛ فرم را نبندید.` : `Recovery failed (${result}); previous data was kept. Keep this form open.`)
    }
    else { setRecoveryStatus(''); if (reason) setRecoveryRevision(value => value + 1) }
    return success
  }
  recoverySnapshotRef.current = activeManagedForm ? { form: { ...activeManagedForm, schema: documentSchema }, designerHistory: history, structureHistory: history.document ? { present: history.document.present, past: history.document.past, future: history.document.future } : managedStructureHistory ?? createManagedFormStructureHistory(documentSchema) } : null
  useEffect(() => {
    const snapshot = recoverySnapshotRef.current
    if (!snapshot) return
    const timer = window.setTimeout(() => persistRecoverySnapshot(snapshot), 180)
    return () => window.clearTimeout(timer)
  }, [activeManagedForm, history, managedStructureHistory, authenticatedUserId])
  useEffect(() => {
    const flush = () => { const snapshot = recoverySnapshotRef.current; if (snapshot) writeFormRecovery(browserFormStorage(), authenticatedUserId, snapshot) }
    window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', flush)
    import.meta.hot?.dispose(flush)
    return () => { flush(); window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush) }
  }, [authenticatedUserId])
  const restoreRecoverySnapshot = (snapshot: RecoverableForm) => {
    if (!activeManagedForm || snapshot.form.id !== activeManagedForm.id) return
    if (recoverySnapshotRef.current && !persistRecoverySnapshot(recoverySnapshotRef.current, fa ? 'پیش از بازیابی نسخه' : 'Before version restore')) return
    dispatchHistory({ type: 'commitTransaction' })
    dispatchHistory({ type: 'change', draft: snapshot.designerHistory.present, schema: snapshot.form.schema })
    setManagedFormDraft(snapshot.form)
    setFrozenCanvas(null); setSelection([]); setActionSelection([]); setManagedSelectedFieldId(null); setManagedFormSaved(false)
    persistRecoverySnapshot({ ...snapshot, designerHistory: historyRef.current, structureHistory: historyRef.current.document ? { present: historyRef.current.document.present, past: historyRef.current.document.past, future: historyRef.current.document.future } : snapshot.structureHistory }, fa ? 'نسخهٔ بازیابی‌شده' : 'Restored version')
  }
  const createManagedFormFromLaboratory = () => {
    finishPropertyChange()
    const id = `form.laboratory-copy.${crypto.randomUUID()}`
    const frame: ManagedFormFrame = { device: previewDevice, width: previewWidth, height: previewHeight, fitToPage: previewFitToPage }
    const templateDraft = historyRef.current.present
    const form = createManagedLaboratoryForm({ id, name: 'تعریف برند — پیش‌نویس', mode: 'operational', templateSchema: motherSchema ?? createLaboratorySchemaTemplate(templateDraft), templateDesigner: templateDraft, frame, templateVersion: managedForms.templateRevision?.version })
    setSharedTemplatePreviewOpen(false)
    setManagedFormsListOpen(false)
    setManagedFormDraft(form)
    setManagedSettingsTab('design')
    setManagedSidebarCollapsed(false)
    setManagedStructureHistory(createManagedFormStructureHistory(form.schema))
    setManagedStructureEditing(false)
    setManagedSelectedFieldId(null)
    setManagedFormSaved(false)
    setManagedFormStatus('')
    prepareManagedFormDesigner()
    setManagedFormEditorOpen(true)
  }
  const updateManagedForm = (update: (current: ManagedLaboratoryForm) => ManagedLaboratoryForm) => {
    setManagedFormDraft(current => current ? update(current) : current)
    setManagedFormSaved(false)
    setManagedFormStatus('')
  }
  const commitManagedStructure = (schema: FormSchemaDraft) => {
    const current = documentSchema
    if (schema === current) return
    schema = preserveFormLinks(current, schema)
    if (activeManagedForm && recoverySnapshotRef.current && (current.fields.some(field => !schema.fields.some(next => next.id === field.id)) || current.tables?.some(table => !schema.tables?.some(next => next.id === table.id) || table.columns.some(column => !schema.tables?.find(next => next.id === table.id)?.columns.some(next => next.id === column.id))))) {
      if (!persistRecoverySnapshot(recoverySnapshotRef.current, fa ? 'پیش از حذف ساختاری' : 'Before structural deletion')) return
    }
    const oldHistory = (activeManagedForm ? managedStructureHistory : motherStructureHistory) ?? createManagedFormStructureHistory(current)
    const nextHistory = commitManagedFormStructure(oldHistory, schema)
    if (activeManagedForm) { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'change', draft: fitAutomaticEditors(historyRef.current.present, schema), schema }); setManagedStructureHistory(nextHistory); setManagedFormDraft(form => form ? { ...form, schema } : form); setManagedFormSaved(false) }
    else { setMotherStructureHistory(nextHistory); setMotherSchema(nextHistory.present) }
    setFrozenCanvas(null); setManagedFormStatus('')
  }
  const undoManagedStructure = () => {
    if (activeManagedForm) { undo(); return }
    const oldHistory = activeManagedForm ? managedStructureHistory : motherStructureHistory
    if (!oldHistory?.past.length) return
    const nextHistory = undoManagedFormStructure(oldHistory)
    if (activeManagedForm) { setManagedStructureHistory(nextHistory); setManagedFormDraft(form => form ? { ...form, schema: nextHistory.present } : form); setManagedFormSaved(false) }
    else { setMotherStructureHistory(nextHistory); setMotherSchema(nextHistory.present) }
    setFrozenCanvas(null)
  }
  const redoManagedStructure = () => {
    if (activeManagedForm) { redo(); return }
    const oldHistory = activeManagedForm ? managedStructureHistory : motherStructureHistory
    if (!oldHistory?.future.length) return
    const nextHistory = redoManagedFormStructure(oldHistory)
    if (activeManagedForm) { setManagedStructureHistory(nextHistory); setManagedFormDraft(form => form ? { ...form, schema: nextHistory.present } : form); setManagedFormSaved(false) }
    else { setMotherStructureHistory(nextHistory); setMotherSchema(nextHistory.present) }
    setFrozenCanvas(null)
  }
  const renameManagedField = (fieldId: string, value: string) => {
    if (!managedFormDraft) return
    commitManagedStructure(renameManagedFormField(managedFormDraft.schema, fieldId, language, value))
  }
  const removeSelectedManagedField = () => {
    if (!managedFormDraft || !managedSelectedFieldId) return
    commitManagedStructure(removeManagedFormField(managedFormDraft.schema, managedSelectedFieldId))
  }
  const saveManagedFormDraft = () => {
    finishPropertyChange()
    setColorPreviewDraft(null)
    const formId = managedFormDraft?.id
    const snapshotToSave = latestRecoverySnapshot()
    const formToSave = snapshotToSave ? managedFormWithDesigner(snapshotToSave.form, historyRef.current.present) : null
    if (!formToSave || !formId || !saveManagedLaboratoryForm(browserFormStorage(), authenticatedUserId, formToSave)) {
      setManagedFormStatus(fa ? 'ذخیرهٔ محلی ممکن نشد؛ دادهٔ قبلی حفظ شد.' : 'Local save failed; existing data was preserved.')
      return false
    }
    const restored = loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId)
    const saved = restored?.forms.find(form => form.id === formId)
    if (!restored || !saved) {
      setManagedFormStatus(fa ? 'تأیید بازیابی پیش‌نویس انجام نشد.' : 'Draft reload verification failed.')
      return false
    }
    setManagedForms(restored)
    setManagedFormDraft(saved)
    setManagedStructureHistory(current => current ? { ...current, present: saved.schema } : createManagedFormStructureHistory(saved.schema))
    if (recoverySnapshotRef.current) persistRecoverySnapshot({ ...recoverySnapshotRef.current, form: saved, structureHistory: { ...recoverySnapshotRef.current.structureHistory, present: saved.schema } }, fa ? 'ذخیرهٔ نهایی پیش‌نویس' : 'Explicit draft save')
    setManagedFormSaved(true)
    setManagedSaveDialogOpen(false)
    setManagedFormStatus(fa ? 'پیش‌نویس مستقل ذخیره و دوباره از حافظهٔ محلی خوانده شد.' : 'Independent draft saved and reloaded from local storage.')
    return true
  }
  const registerMotherTemplate = () => {
    finishPropertyChange()
    const storage = browserFormStorage()
    const current = loadManagedLaboratoryForms(storage, authenticatedUserId)
    if (!storage || !current) { setTemplateRegistrationStatus(fa ? 'خواندن حافظهٔ محلی ممکن نشد.' : 'Local storage is unavailable.'); return false }
    try {
      const designer = { ...historyRef.current.present, formId: laboratoryDefinition.id }
      const next = registerTemplateRevision(current, { schema: motherSchema ?? createLaboratorySchemaTemplate(designer), designer, frame: activePreviewFrame, createdAt: new Date().toISOString() }, templateTargetIds)
      storage.setItem(managedLaboratoryFormsStorageKey(authenticatedUserId), JSON.stringify(next))
      const restored = loadManagedLaboratoryForms(storage, authenticatedUserId)
      if (!restored || restored.templateRevision?.version !== next.templateRevision?.version) throw new Error('Template reload verification failed.')
      setManagedForms(restored)
      saveSessionDraft()
      setTemplateRegistrationOpen(false)
      setTemplateRegistrationStatus(fa ? 'نسخهٔ قالب مادر ثبت شد؛ فقط فرم‌های انتخاب‌شده به‌روزرسانی شدند.' : 'Master template registered; only selected forms were updated.')
      return true
    } catch { setTemplateRegistrationStatus(fa ? 'ثبت نسخه ممکن نشد؛ فرم باز را نبندید.' : 'Registration failed; keep the current form open.'); return false }
  }
  const openManagedForm = (formId: string) => {
    if (activeManagedForm?.id === formId) { setManagedFormsListOpen(false); setManagedSidebarCollapsed(false); setDesignerOpen(true); return }
    finishPropertyChange()
    const leaving = latestRecoverySnapshot()
    if (leaving && !persistRecoverySnapshot(leaving, fa ? 'تغییر فرم فعال' : 'Switch active form')) return
    const recovered = readFormRecovery(browserFormStorage(), authenticatedUserId)?.documents[formId]?.current
    const form = recovered?.form ?? managedForms.forms.find(item => item.id === formId) ?? loadDesignReleases(browserFormStorage(), authenticatedUserId)?.slice().reverse().find(item => item.formId === formId)?.snapshot
    if (!form) return
    setManagedFormDraft(form)
    setManagedSettingsTab('design')
    setManagedSidebarCollapsed(false)
    setManagedStructureHistory(recovered?.structureHistory ?? createManagedFormStructureHistory(form.schema))
    setManagedStructureEditing(false)
    setManagedSelectedFieldId(null)
    setManagedFormSaved(true)
    setManagedFormStatus('')
    setManagedFormsListOpen(false)
    prepareManagedFormDesigner()
    setManagedFormEditorOpen(true)
  }
  const closeManagedFormEditor = (keepDesigner = false) => {
    finishPropertyChange()
    const latest = latestRecoverySnapshot()
    if (latest && !persistRecoverySnapshot(latest, fa ? 'بستن فرم' : 'Close form')) return false
    if (!closeFormRecovery(browserFormStorage(), authenticatedUserId)) {
      setRecoveryStatus(fa ? 'ثبت وضعیت بستن فرم ممکن نشد؛ فرم باز و داده‌ها محفوظ ماندند.' : 'Could not persist closing state; the form remains open and data was retained.')
      return false
    }
    recoverySnapshotRef.current = null
    resetDesignerControlsForSwitch()
    const reopenLaboratoryDesigner = keepDesigner || designerWasOpenBeforeManaged.current
    setManagedFormEditorOpen(false)
    setManagedFormDraft(null)
    setManagedStructureHistory(null)
    setRecoveryStatus('')
    setManagedStructureEditing(false)
    setManagedSelectedFieldId(null)
    setManagedFormStatus('')
    designerOpenRef.current = reopenLaboratoryDesigner
    setDesignerOpen(reopenLaboratoryDesigner)
    if (!reopenLaboratoryDesigner) restoreDesignerEntry()
    return true
  }
  const switchToLaboratory = () => {
    if (activeManagedForm && !closeManagedFormEditor(true)) return
    setManagedFormsListOpen(false); setManagedSidebarCollapsed(false); setManagedSettingsTab('design')
    designerOpenRef.current = true; setDesignerOpen(true)
  }
  const beginOperationalRedesign = (contract: OperationalFormContract) => {
    finishPropertyChange()
    const leaving = latestRecoverySnapshot()
    if (leaving && !persistRecoverySnapshot(leaving, 'پیش از بازکردن بازطراحی مستقل')) return
    const isRouteForm=(form:ManagedLaboratoryForm)=>operationalSource(form.schema)?.route===contract.route||form.schema.id==='operational.'+contract.route
    const activeRouteForm=activeManagedForm&&isRouteForm(activeManagedForm)
      ? managedFormWithDesigner({...activeManagedForm,schema:historyRef.current.document?.present??activeManagedForm.schema},historyRef.current.present)
      : undefined
    const selectedRouteForm=managedForms.forms.find(form=>form.id===managedForms.activeFormId&&isRouteForm(form))
    const savedRouteForm=selectedRouteForm??[...managedForms.forms].reverse().find(isRouteForm)
    const sourceForm=activeRouteForm??savedRouteForm
    const pin = managedForms.catalogTemplates?.[contract.route] ?? managedForms.templateRevision
    const currentDesigner = sourceForm ? activeRouteForm ? historyRef.current.present : resolveManagedLaboratoryDesigner(sourceForm) : activeManagedForm ? loadLaboratoryColorBaseline(authenticatedUserId) : historyRef.current.present
    const sourceSchema = sourceForm?.schema ?? pin?.schema ?? motherSchema ?? createLaboratorySchemaTemplate(currentDesigner)
    const template = sourceForm ? currentDesigner : pin?.designer ?? currentDesigner
    const frame = sourceForm?.frame ?? pin?.frame ?? (activeManagedForm ? initialPreviewFrame : activePreviewFrame)
    const version = sourceForm?.template.version ?? pin?.version ?? 1
    const form = createOperationalRedesign(contract, 'form.redesign.' + crypto.randomUUID(), template, frame, version, sourceSchema)
    setManagedFormDraft(form); setManagedStructureHistory(createManagedFormStructureHistory(form.schema)); setManagedFormSaved(false)
    setManagedSettingsTab('design'); setManagedSidebarCollapsed(false); setManagedFormStatus(''); setManagedFormsListOpen(false)
    prepareManagedFormDesigner(); setManagedFormEditorOpen(true)
  }
  const finalizeActiveDesign = () => {
    finishPropertyChange()
    const ruleIssues=validateRecordRules(documentSchema,{})
    if(Object.keys(ruleIssues).length){setManagedFormStatus('پیش از ثبت طراحی نهایی، منابع قوانین فیلد را اصلاح کنید: '+Object.values(ruleIssues).join('؛ '));return}
    const pendingLabels=documentSchema.tables?.find(table=>table.columns.some(column=>columnLabelMismatch(documentSchema,column,language).length>0))
    if(columnLinkDefaults.requireMismatchResolution&&pendingLabels){setManagedFormStatus('پیش از ثبت طراحی نهایی، ارتباط عنوان‌های قرمز را همگام یا مستقل تأیید کنید.');setStructureDialog({kind:'table',tableId:pendingLabels.id});return}
    const snapshot = latestRecoverySnapshot()
    if (!snapshot || !persistRecoverySnapshot(snapshot, 'پیش از ثبت طراحی نهایی')) return
    const form = managedFormWithDesigner(snapshot.form, historyRef.current.present)
    if (!saveManagedLaboratoryForm(browserFormStorage(), authenticatedUserId, form)) { setManagedFormStatus('ذخیره ممکن نشد؛ نسخه قبلی محفوظ است.'); return }
    const release = finalizeDesign(browserFormStorage(), authenticatedUserId, form, crypto.randomUUID())
    if (!release) { setManagedFormStatus('ثبت نسخه نهایی ممکن نشد؛ فرم و نسخه‌های قبلی محفوظ هستند.'); return }
    setManagedForms(loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId)!)
    setManagedFormStatus('طراحی نهایی ثبت شد — در انتظار اصلاح اتصال‌ها و آزمون؛ فرم عملیاتی قبلی فعال است.')
    setRecoveryRevision(value => value + 1)
    window.dispatchEvent(new Event('form-design-releases-updated'))
  }
  useEffect(() => {
    const open = (event: Event) => { const id = (event as CustomEvent<string>).detail; if (typeof id === 'string') openManagedForm(id) }
    window.addEventListener('open-form-design-draft', open)
    return () => window.removeEventListener('open-form-design-draft', open)
  })
  useEffect(() => { if (requestedDesign) openManagedForm(requestedDesign.id) }, [requestedDesign?.sequence])
  const resetDesignerControlsForSwitch = () => {
    setColorPreviewDraft(null); setSelection([]); setActionSelection([]);setToolbarSelection(null); setSelectedTableColumnIds([])
    setContextMenu(null); setGridSubmenu(null); setGridFormatDialog(null); setPropertyRequest(undefined)
    setApplyToAll(false); setFrozenCanvas(null); setActiveEditorSectionId('laboratory.editor'); setSelectedTableId('laboratory.synthetic-persons'); setLayoutStatus(''); setSaveStatus('')
  }
  const prepareManagedFormDesigner = () => {
    finishPropertyChange()
    resetDesignerControlsForSwitch()
    if (!activeManagedForm) designerWasOpenBeforeManaged.current = designerOpen
    if (!designerOpen && dataEntryActiveRef.current) {
      designerEntrySnapshot.current = draft
      updateDraft(entryDraftBaseline.current ?? defaultPersonDraft)
      dataEntryActiveRef.current = false
      setDataEntryActive(false)
    }
    formGridRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => control.setCustomValidity(''))
    designerOpenRef.current = true
    setDesignerOpen(true)
  }
  const selectedManagedField = managedFormDraft?.schema.fields.find(field => field.id === managedSelectedFieldId)
  const layoutMetrics = selectedDesignerInputs(selection, geometryFieldIds).flatMap(id => {
    const rect = canvas?.fields[id]?.input ?? formFrameRef.current?.querySelector<HTMLElement>('[data-field-id="'+id+'"] .designer-input-part')?.getBoundingClientRect()
    if (!rect) return []
    const others = Object.entries(canvas?.fields??{}).filter(([key]) => key !== id).map(([, field]) => field.input)
    const left = others.filter(other => other.left + other.width <= rect.left + 0.5 && other.top < rect.top + rect.height && other.top + other.height > rect.top)
    const above = others.filter(other => other.top + other.height <= rect.top + 0.5 && other.left < rect.left + rect.width && other.left + other.width > rect.left)
    return [{ id, width: rect.width, height: rect.height, ...(left.length ? { gapX: rect.left - Math.max(...left.map(other => other.left + other.width)) } : {}), ...(above.length ? { gapY: rect.top - Math.max(...above.map(other => other.top + other.height)) } : {}) }]
  })
  const contextGroup = (id:string,title:string,children:React.ReactNode) => <React.Fragment key={id}>
    <button type="button" role="menuitem" aria-haspopup="menu" data-grid-submenu={id} aria-expanded={gridSubmenu===id} onMouseEnter={()=>setGridSubmenu(id)} onClick={()=>setGridSubmenu(id)} onKeyDown={event=>{if(event.key===(fa?'ArrowLeft':'ArrowRight')){event.preventDefault();setGridSubmenu(id);requestAnimationFrame(()=>contextSubmenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus())}}}>{title}<span className="designer-submenu-arrow" aria-hidden="true"/></button>
    {gridSubmenu===id&&createPortal(<div ref={contextSubmenuRef} className="designer-context-menu designer-context-submenu" data-context-group={id} role="menu" aria-label={title} dir={fa?'rtl':'ltr'} style={{left:8,top:8}} onKeyDown={event=>{if(event.key===(fa?'ArrowRight':'ArrowLeft')||event.key==='Escape'){event.stopPropagation();setGridSubmenu(null);contextMenuRef.current?.querySelector<HTMLButtonElement>('[data-grid-submenu="'+id+'"]')?.focus()}}} onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();event.stopPropagation()}}>{children}</div>,document.body)}
  </React.Fragment>
  const gridSubmenuTriggers = <>          <button type="button" role="menuitem" aria-haspopup="menu" data-grid-submenu="header" aria-expanded={gridSubmenu === 'header'} onMouseEnter={() => setGridSubmenu('header')} onClick={() => setGridSubmenu('header')}>{fa?'تغییرات هدر':'Header appearance'} <span className="designer-submenu-arrow" aria-hidden="true"/></button>
          <button type="button" role="menuitem" aria-haspopup="menu" data-grid-submenu="column" aria-expanded={gridSubmenu === 'column'} onMouseEnter={() => setGridSubmenu('column')} onClick={() => setGridSubmenu('column')}>{fa?'تغییرات داده‌های ستون':'Column data'} <span className="designer-submenu-arrow" aria-hidden="true"/></button></>
  const sharedDesignerPanel = designerOpen && <FormLaboratoryDesignerPanel selectionLabel={toolbarSelection?'انتخاب نوار جدول: '+toolbarSelection.parts.map(part=>toolbarPartLabel(part)).join('، '):selectedTableColumnIds.length?'سرستون انتخاب‌شده: '+selectedTableColumnIds.map(id=>activeDesignerColumns.find(column=>column.id===id)?.label??id).join('، '):selection.length?'فیلد انتخاب‌شده: '+selection.map(id=>activeFieldLabels[id.split('::')[0]]??id).join('، '):undefined} toolbarControls={<><button type="button" onClick={()=>setBehaviorEditorOpen(true)}>مدیریت رفتار و قرارداد فرم‌ها</button><button type="button" title="اجرای فرم کامل با دادهٔ آزمایشی، اعتبارسنجی و کلیدهای فرم" onClick={()=>{setFormRuntimeTesting(true);setComponentTestMode(true)}}>آزمایش فرم کامل</button><button type="button" title="آزمایش فهرست و رفتار یک کامپوننت در کتابخانه" onClick={()=>setComponentLibraryOpen(true)}>کتابخانه و آزمایش کامپوننت‌ها</button><label className="designer-guide-control"><input type="checkbox" aria-label="نمایش خطوط راهنمای چیدمان" checked={layoutGuideStep>0} onChange={event=>setLayoutGuideStep(event.target.checked?20:0)}/>نمایش خطوط راهنمای چیدمان</label>{layoutGuideStep>0&&<label>گام خطوط راهنما (px)<input type="number" aria-label="گام خطوط راهنما" min="4" max="100" value={layoutGuideStep} onChange={event=>setLayoutGuideStep(Math.max(4,Math.min(100,Number(event.target.value)||20)))}/></label>}{toolbarSelection&&documentSchema.tables?.filter(table=>table.id===toolbarSelection.tableId).map(table=><GridToolbarControls key={table.id} schema={documentSchema} table={table} onPreview={(part,patch)=>setToolbarColorPreview(patch?{tableId:table.id,part,patch,parts:toolbarSelection.parts}:null)} onChange={commitManagedStructure} selectedParts={toolbarSelection.parts} selectionRequest={toolbarSelectionRequest} propertyRequest={toolbarPropertyRequest?.tableId===table.id?toolbarPropertyRequest:undefined} onSelect={part=>selectToolbar(table.id,part)} onFont={part=>openToolbarFont(table.id,part)} onAlign={applyAlignment}/>)}</>} externalFormManagement neighborResize={neighborResizeFor(visibleDraft)} onNeighborResizeChange={changeNeighborResize} layoutMetrics={layoutMetrics} documentLibrary={activeManagedForm ? { blueprints: fieldBlueprints, onCreate: sourceId => setStructureDialog({ kind: 'addField', sectionId: editorSectionId, sourceId }), onManageForms: () => setManagedFormsListOpen(true) } : undefined} geometryEditable={geometryEditable} propertyRequest={propertyRequest} onElementAppearanceCommit={commitElementAppearance} onElementAppearancePreview={previewElementAppearance} onFinishPropertyChange={finishPropertyChange} language={language} draft={tableDesignerDraft} onTableFontChange={updateTableFont} selectedTableColumn={selectedTableColumn ? { id: selectedTableColumn.id, label: selectedTableColumn.label, style: tableDesignerDraft.tableColumns?.[selectedTableColumn.id] } : undefined} selectedTableHeader={selectedTableHeader ? { id: selectedTableHeader.id, label: selectedTableHeader.label, style: tableDesignerDraft.tableHeaders?.[selectedTableHeader.id] } : undefined} tableHeaderScope={headerStyleScope} onTableHeaderScopeChange={setHeaderStyleScope} tableHeaderHeight={tableDesignerDraft.tableHeaderHeight ?? 42} onTableHeaderHeightChange={setTableHeaderHeight} onTableColumnStyleChange={updateTableColumnStyle} onTableHeaderStyleChange={updateTableHeaderStyle} onTableColumnColorCommit={(id, color) => commitTableStyleColor('column', id, color)} onTableColumnColorPreview={(id, color) => previewTableStyleColor('column', id, color)} onTableColumnBackgroundColorCommit={commitTableColumnBackgroundColor} onTableColumnBackgroundColorPreview={previewTableColumnBackgroundColor} onTableHeaderColorCommit={(id, property, color) => commitTableStyleColor('header', id, color, property)} onTableHeaderColorPreview={(id, property, color) => previewTableStyleColor('header', id, color, property)} filterPopupFontSize={tableDesignerDraft.filterPopupFontSize ?? 16} onFilterPopupFontSizeChange={updateFilterPopupFontSize} gridSearchPosition={tableDesignerDraft.gridSearchPosition ?? 'right'} onGridSearchPositionChange={updateGridSearchPosition} buttonPressEffectEnabled={history.present.buttonPressEffect !== false} onButtonPressEffectChange={updateButtonPressEffect} onBeginFilterPopupFontSizeChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitFilterPopupFontSizeChange={() => dispatchHistory({ type: 'commitTransaction' })} selectedFieldIds={selection} selectedActionIds={actionSelection} actions={activeActions} onActionVisibilityChange={changeActionVisibility} onSelectAction={id => { setSelection([]); setActionSelection([id]); setApplyToAll(false) }} onActionTextChange={updateActionText} onActionTextPropertyChange={updateActionTextProperty} onActionColorCommit={commitActionColor} onActionColorPreview={previewActionColor} onClearSelection={() => { setSelection([]); setActionSelection([]);setToolbarSelection(null);setSelectedTableColumnIds([]) }} fieldIds={activeFieldIds} fieldLabels={activeFieldLabels} applyToAll={applyToAll} canSave={Boolean(authenticatedUserId || activeManagedForm)} saveStatus={saveStatus} onApplyToAllChange={setApplyToAll} onChange={updateProperty} onOpenFontFormatDialog={part => openSelectedTextFormatDialog(part)} onColorCommit={commitColorProperty} onColorPreview={previewColorProperty} onAppearanceColorCommit={commitAppearanceColor} onAppearanceColorPreview={previewAppearanceColor} onBeginColorChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitColorChange={() => dispatchHistory({ type: 'commitTransaction' })} onUndo={undo} onRedo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onResetSelected={resetSelected} onResetAll={resetAll} onSave={saveDraft} onCancel={cancelDesigner} onSelectAll={() => { setActionSelection([]); setSelection(activeFieldIds.map(id => `${id}::input`)) }} onLayout={applyLayout} onAlign={applyAlignment} referenceFieldId={referenceId} onReferenceChange={setReferenceId}  managedStructure={activeManagedForm ? { enabled: managedStructureEditing, onEnabledChange: enabled => setManagedStructureEditing(enabled), selectedFieldId: managedSelectedFieldId, selectedFieldLabel: selectedManagedField?.label[language], onRename: label => selectedManagedField && renameManagedField(selectedManagedField.id, label), onRemove: removeSelectedManagedField, canUndo: Boolean(history.past.length), canRedo: Boolean(history.future.length), onUndo: undoManagedStructure, onRedo: redoManagedStructure } : undefined} layoutStatus={layoutStatus} />
  const runRuntimeAction=(action:'create'|'save'|'close'|'edit'|'delete'|'first'|'last'|'previous'|'next')=>{
    if(['first','last','previous','next'].includes(action)){
      const current=runtime.records.findIndex(row=>row.id===runtime.selectedId),index=action==='first'?0:action==='last'?runtime.records.length-1:Math.max(0,Math.min(runtime.records.length-1,current+(action==='previous'?-1:1)))
      const row=runtime.records[index];if(row)dispatchRuntime({type:'select',id:row.id});return
    }
    if(action==='close'&&runtime.mode==='view'){setFormRuntimeTesting(false);setComponentTestMode(false);setRuntimeBehaviorPreview(null);return}
    if(action==='create'){
      const defaults:Record<string,string>=Object.fromEntries(documentSchema.fields.map(field=>[field.id,componentTestValues[documentSchema.id+':'+field.id]?.defaultValue??'']))
      for(const field of documentSchema.fields)if(field.componentId==='base-form.incremental-code'&&!defaults[field.id]){const settings={...defaultCodeComponentSettings,...(field.settings?.componentSettings as Partial<CodeComponentSettings>|undefined),incremental:true};defaults[field.id]=nextIncrementalCode(runtime.records.map(row=>row.values[field.id]??''),settings)}
      dispatchRuntime({type:'create',defaults});setRuntimeErrors({});requestAnimationFrame(()=>formFrameRef.current?.querySelector<HTMLElement>('.laboratory-form-grid input:not(:disabled),.laboratory-form-grid textarea:not(:disabled),.laboratory-form-grid select:not(:disabled)')?.focus());return
    }
    if(action==='save'){
      const errors=validateTestRecord(documentSchema,runtime.draft,runtime.records,runtime.mode==='edit'?runtime.selectedId:null);for(const field of documentSchema.fields){if(field.componentId==='base-form.code-input'||field.componentId==='base-form.incremental-code'){const config={...defaultCodeComponentSettings,...(field.settings?.componentSettings as Partial<CodeComponentSettings>|undefined),incremental:field.componentId==='base-form.incremental-code'};const message=validateComponentCode(runtime.draft[field.id]??'',{...config,required:effectiveFieldRules(field).required,unique:false},runtime.records.filter(row=>row.id!==runtime.selectedId).map(row=>row.values[field.id]??''));if(message)errors[field.id]=message}}setRuntimeErrors(errors)
      if(Object.keys(errors).length){const field=formFrameRef.current?.querySelector<HTMLElement>('[data-field-id="'+Object.keys(errors)[0]+'"]');field?.querySelector<HTMLElement>('input,textarea,select')?.focus();return}
      dispatchRuntime({type:'save',id:'sample.'+crypto.randomUUID()});return
    }
    if(action==='close'&&runtime.mode!=='view'&&(runtimeBehaviorPreview?resolveFormBehavior(runtimeBehaviorPreview.library,effectiveBehaviorId):currentFormPolicy(effectiveBehaviorId)).confirmCancel&&!window.confirm('ورود اطلاعات آزمایشی بسته شود؟'))return
    dispatchRuntime({type:action as 'close'|'edit'|'delete'});setRuntimeErrors({})
  }
  const runtimeRows=runtime.records.map(record=>({...record.values,id:record.id,__runtimeValues:record.values})) as unknown as SyntheticPerson[]
  const runtimeColumns=(table:NonNullable<FormSchemaDraft['tables']>[number])=>table.columns.map(column=>({id:column.id,label:column.label[language],width:column.width??160,type:'text' as const,multiline:column.valueComposition==='newline',value:(row:SyntheticPerson)=>{const values=(row as unknown as {__runtimeValues:Record<string,string>}).__runtimeValues;const binding=column.binding;const key=binding.kind==='formField'?binding.fieldId:binding.kind==='dataField'?binding.dataFieldId:'';const linked=column.sourceFieldIds?.map(id=>values[id]??'')??[];return linked.length>1?composeColumnFieldValue(linked,column):values[key]??linked[0]??''}}))
  const basePresentationSchema = gridFormatDialog?.scope==='toolbar'?toolbarSchemaFromDialog(gridFormatDialog):activeManagedForm?documentSchema:motherSchema ?? { ...laboratoryPresentationSchema, tables: documentSchema.tables, fields: documentSchema.fields }
  const structuralSelection = activeManagedForm ? { selectedFieldId: managedSelectedFieldId, onSelect: (id: string, event: React.MouseEvent) => { activateEditorForField(id); setManagedSelectedFieldId(id); selectField(id, event, 'input') } } : undefined
  const activePresentationSchema=toolbarColorPreview?{...basePresentationSchema,tables:basePresentationSchema.tables?.map(table=>table.id===toolbarColorPreview.tableId?{...table,settings:{...table.settings,toolbar:(toolbarColorPreview.parts??[toolbarColorPreview.part]).reduce((settings,part)=>moveToolbarPart(settings,part,toolbarColorPreview.patch),(table.settings?.toolbar??{}) as GridToolbarSettings)}}:table)}:basePresentationSchema
  const addHeaderPanel=(placement:'beside'|'below')=>{const id=('header:'+crypto.randomUUID()) as GridToolbarPart;commitManagedStructure(addToolbarHeaderPanel(documentSchema,activeTableId,id,'report-row.'+crypto.randomUUID(),placement));setContextMenu(null);selectToolbar(activeTableId,id)}
  const renderDocumentEditor = (section: import('./components/base-form/formSchema').FormSchemaSection) => renderLaboratoryEditor(Boolean(activeManagedForm), visibleDraft, sectionFormSchema(documentSchema, section), structuralSelection, Boolean(activeManagedForm), section.id)
  const renderDocumentFooter = (section: import('./components/base-form/formSchema').FormSchemaSection) => renderLaboratoryFooter(Boolean(activeManagedForm), visibleDraft, (documentSchema.actions ?? []).filter(action => action.sectionId === section.id || !action.sectionId && section.id === documentSchema.sections.find(item => item.kind === 'footer')?.id), Boolean(activeManagedForm))
  const primaryEditorSection=documentSchema.sections.find(section=>section.kind==='editor'&&!section.tableHeaderFor)
  const activeEditor = activeManagedForm && primaryEditorSection ? renderDocumentEditor(primaryEditorSection) : renderLaboratoryEditor()
  const persistDesignerColumnWidth = (tableId: string, columnId: string, width: number) => {
    const column = documentSchema.tables?.find(table => table.id === tableId)?.columns.find(item => item.id === columnId)
    if (!column || column.width === width) return
    commitManagedStructure(updateDocumentColumn(documentSchema, tableId, columnId, { width }))
  }
  const persistDesignerColumnOrder = (tableId: string, sourceColumnId: string, targetColumnId: string, position: 'before' | 'after') => {
    const next = moveDocumentColumn(documentSchema, tableId, sourceColumnId, targetColumnId, position)
    if (next !== documentSchema) commitManagedStructure(next)
  }
  const presentationGrids = Object.fromEntries((documentSchema.tables ?? []).map(table => [table.id, {
    rows: formRuntimeTesting?runtimeRows:sharedPresentationRows, columns: formRuntimeTesting?runtimeColumns(table):schemaGridColumns(table),
    designerMode: designerOpen&&!formRuntimeTesting, designerSelectedColumnIds: table.id === activeTableId ? selectedTableColumnIds : [], onDesignerHeaderHeightChange: updateTableHeaderHeight, onDesignerColumnSelect: selectGridDesignerColumn, onDesignerContextMenu: (target: 'header' | 'row' | 'search', columnId: string | undefined, left: number, top: number) => { activateTable(table.id); openGridDesignerContextMenu(target, columnId, left, top) },
    ...(designerOpen&&!formRuntimeTesting?{onDesignerColumnWidthChange:(columnId:string,width:number)=>persistDesignerColumnWidth(table.id,columnId,width),onDesignerColumnOrderChange:(source:string,target:string,position:'before'|'after')=>persistDesignerColumnOrder(table.id,source,target,position)}:{}),
    ...(formRuntimeTesting?{onRowSelectionChange:(row:SyntheticPerson|null)=>row&&dispatchRuntime({type:'select',id:row.id})}:{}),
    ...(!formRuntimeTesting&&!activeManagedForm && table.id === 'laboratory.synthetic-persons' ? { rows: [], remoteQuery: remoteGridQuery, remoteQueryScope: datasetSize, resetRequest: gridResetRequest, navigationRequest, onRowSelectionChange: setSelectedPerson, onTotalChange: setGridRecordCount } : {})
  }]))
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const frameElement = formFrameRef.current
    if (!frameElement) return
    const check = () => {
      const messages: string[] = []
      for (const result of inspectRegisteredFormLayouts(frameElement, renderedLayoutRoots.current)) {
        if (!result.issues.length) continue
        const message = result.formId + (result.sectionId ? ' [' + result.sectionId + ']' : '') + ': ' + result.issues.join('; ')
        messages.push(message)
        if (!layoutWarnings.current.has(message)) { layoutWarnings.current.add(message); console.warn('[Form layout check] ' + message) }
      }
      for (const editor of frameElement.querySelectorAll<HTMLElement>('.laboratory-editor')) {
        const style = getComputedStyle(editor)
        if (style.overflowX === 'hidden' && editor.scrollWidth > editor.clientWidth + 2 || style.overflowY === 'hidden' && editor.scrollHeight > editor.clientHeight + 2) messages.push(documentSchema.id + ': اسکرول غیرفعال است و بخشی از محتوای پنل خارج از دسترس قرار دارد.')
      }
      setLayoutWarningMessages(current => JSON.stringify(current) === JSON.stringify(messages) ? current : messages)
    }
    const frame = requestAnimationFrame(check)
    const observer = new ResizeObserver(check)
    observer.observe(frameElement)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [documentSchema, visibleDraft, activePreviewFrame.device, activePreviewFrame.width, designerOpen, managedSidebarCollapsed, managedSettingsTab])
  const recoveryCollection = useMemo(() => readFormRecovery(browserFormStorage(), authenticatedUserId), [authenticatedUserId, recoveryRevision])
  const activeRecovery = activeManagedForm ? recoveryCollection?.documents[activeManagedForm.id] : undefined
  const recoveryVersions = activeRecovery?.versions ?? []
  const deletedFields = activeManagedForm ? recoverableDeletedFields(activeManagedForm.schema, [...(managedStructureHistory?.past ?? []).slice().reverse(), ...recoveryVersions.slice().reverse().map(version => version.snapshot.form.schema), ...(activeManagedForm.template.schema ? [activeManagedForm.template.schema] : [])]) : []
  const recoverySchemas = [...(history.document?.past ?? managedStructureHistory?.past ?? []).slice().reverse(), ...recoveryVersions.slice().reverse().map(version => version.snapshot.form.schema), ...(activeManagedForm?.template.schema ? [activeManagedForm.template.schema] : [])]
  const deletedTables = activeManagedForm ? recoverableDeletedTables(documentSchema, recoverySchemas) : []
  const recoverySources = (): RecoverableForm[] => {
    const current = recoverySnapshotRef.current
    if (!current || !activeManagedForm) return []
    const docs = history.document
    return [...(docs?.past ?? managedStructureHistory?.past ?? []).slice().reverse().map((schema, index) => ({ ...current, form: { ...current.form, schema }, designerHistory: { ...current.designerHistory, present: history.past[history.past.length - 1 - index] ?? history.present } })), ...recoveryVersions.slice().reverse().map(version => version.snapshot), ...(activeManagedForm.template.schema ? [{ ...current, form: { ...current.form, schema: activeManagedForm.template.schema }, designerHistory: { present: { ...(activeManagedForm.template.schema.settings?.shared?.designer ?? history.present), formId: activeManagedForm.id }, past: [], future: [] } }] : [])]
  }
  const restoreDeletedTable = (tableId: string, columnId?: string) => {
    const current = recoverySnapshotRef.current
    if (!current) return
    const restored = restoreRecoverableTable(current, tableId, recoverySources(), columnId)
    if (restored) restoreRecoverySnapshot(restored)
  }
  const restoreDeletedField = (id: string) => {
    const current = recoverySnapshotRef.current
    if (!current || !activeManagedForm) return
    const restored = restoreRecoverableField(current, id, recoverySources())
    if (restored) restoreRecoverySnapshot(restored)
  }
  const currentStructureHistory = activeManagedForm ? history : motherStructureHistory
  const managedSettingsContent = <div className="managed-form-editor-metadata-panel">
    <h2>{fa ? (activeManagedForm ? 'تنظیمات فرم مستقل' : 'تنظیمات قالب مادر') : 'Developer form settings'}</h2>
    <p>{activeManagedForm ? (fa ? `ارث‌بری از قالب آزمایشگاه — نسخهٔ ${activeManagedForm.template.version}` : `Laboratory template — version ${activeManagedForm.template.version}`) : (fa ? `نسخهٔ ثبت‌شدهٔ قالب مادر: ${managedForms.templateRevision?.version ?? laboratoryTemplateVersion}` : `Registered master version: ${managedForms.templateRevision?.version ?? laboratoryTemplateVersion}`)}</p>
    {activeManagedForm && <fieldset className="form-recovery-controls" data-recovery-revision={recoveryRevision}><legend>{fa ? 'بازیابی و نسخه‌های طراحی' : 'Design recovery and versions'}</legend><p>{fa ? 'تغییرات جاری و تاریخچه خودکار نگهداری می‌شوند؛ ذخیرهٔ نهایی جدا است.' : 'Current edits and history are recovered separately from explicit saves.'}</p>{recoveryStatus && <p role="alert">{recoveryStatus}</p>}<button type="button" onClick={() => recoverySnapshotRef.current && persistRecoverySnapshot(recoverySnapshotRef.current, fa ? 'نسخهٔ دستی' : 'Manual version')}>{fa ? 'ثبت نسخهٔ بازیابی' : 'Create recovery version'}</button><label>{fa ? 'نسخهٔ قابل بازیابی' : 'Recoverable version'}<select value="" onChange={event => { const version = recoveryVersions.find(version => version.id === event.target.value); if (version) restoreRecoverySnapshot(version.snapshot) }}><option value="">{fa ? 'انتخاب نسخه…' : 'Choose version…'}</option>{recoveryVersions.slice().reverse().map(version => <option key={version.id} value={version.id}>{version.reason} · {new Date(version.at).toLocaleString(fa ? 'fa-IR' : 'en-US')}</option>)}</select></label>{deletedTables.map(item => <button key={item.table.id + ':' + (item.columnId ?? '')} type="button" onClick={() => restoreDeletedTable(item.table.id, item.columnId)}>{item.columnId ? (fa ? 'بازیابی ستون: ' : 'Recover column: ') + item.table.columns.find(column => column.id === item.columnId)?.label[language] : (fa ? 'بازیابی جدول: ' : 'Recover table: ') + (item.table.title?.[language] ?? item.table.id)}</button>)}{deletedFields.map(field => <button key={field.id} type="button" onClick={() => restoreDeletedField(field.id)}>{(fa ? 'بازیابی فیلد: ' : 'Recover field: ') + field.label[language]}</button>)}</fieldset>}
    {activeManagedForm && <fieldset className="form-release-settings"><legend>نسخه و وضعیت اتصال</legend>
      <p>{operationalSource(documentSchema) ? 'بازطراحی مستقل؛ فرم عملیاتی قبلی بدون تغییر فعال است.' : 'فرم جدید؛ اتصال عملیاتی هنوز پیاده‌سازی نشده است.'}</p>
      <label>نوع بازطراحی<select value={documentSchema.settings?.specific?.values?.redesignIntent === 'fundamental' ? 'fundamental' : 'appearance'} onChange={event => commitManagedStructure({ ...documentSchema, settings: { ...documentSchema.settings, specific: { ...documentSchema.settings?.specific, values: { ...documentSchema.settings?.specific?.values, redesignIntent: event.target.value } } } })}><option value="appearance">تغییر ظاهر با حفظ رفتار</option><option value="fundamental">تغییر بنیادین؛ نیازمند اصلاح سورس و اتصال‌ها</option></select></label>
      <p role="status">تشخیص قرارداد: {classifyRedesign(documentSchema) === 'fundamental' ? 'تغییر بنیادین / اتصال جدید' : 'ظاهری؛ آزمون حفظ رفتار همچنان الزامی است'}</p>
      <FormMenuPlacement value={documentSchema.menuPlacement?.menuId ?? ''} onChange={menuId=>commitManagedStructure({...documentSchema,menuPlacement:{...documentSchema.menuPlacement,menuId}})}/>
      <button type="button" onClick={finalizeActiveDesign}>ثبت طراحی نهایی — در انتظار اتصال</button>
      {loadDesignReleases(browserFormStorage(), authenticatedUserId)?.filter(item=>item.formId===activeManagedForm.id).slice().reverse().map(item=><details key={item.id}><summary>نسخه {new Date(item.createdAt).toLocaleString()} — در انتظار اتصال</summary><ul>{item.requirements.map(requirement=><li key={requirement}>{requirement}</li>)}</ul><button type="button" onClick={()=>restoreRecoverySnapshot({form:item.snapshot,designerHistory:{...historyRef.current,present:resolveManagedLaboratoryDesigner(item.snapshot)},structureHistory:createManagedFormStructureHistory(item.snapshot.schema)})}>بازیابی این نسخه طراحی — با حفظ نسخه‌های دیگر</button></details>)}
    </fieldset>}
    <FormDocumentSettings onToolbarFont={openToolbarFont} onToolbarSelect={(tableId,part)=>selectToolbar(tableId,part)} onToolbarPreview={(tableId,part,patch)=>setToolbarColorPreview(patch?{tableId,part,patch}:null)} actionVisible={id => { const action = activeActions.find(item => item.id === id); return Boolean(action && designerActionVisible(visibleDraft, action)) }} onActionVisibilityChange={changeActionVisibility} onActionLabelChange={(id, label) => updateActionText(id, language, label)} independent={Boolean(activeManagedForm)} blueprints={fieldBlueprints} onSaveBlueprint={saveBlueprint} savedSizes={managedForms.forms.map(form => ({ id: form.id, name: form.schema.title[language], frame: form.frame }))} defaultColumnComposition={columnLinkDefaults.defaultComposition} allowMultipleColumnSources={columnLinkDefaults.allowMultipleSources} language={language} schema={documentSchema} frame={activePreviewFrame} customization={activeManagedForm?.customization} onSchemaChange={commitManagedStructure} onFrameChange={frame => updateActivePreviewFrame(frame)} onCustomizationChange={permissions => updateManagedForm(form => ({ ...form, customization: permissions }))} onUndo={undoManagedStructure} onRedo={redoManagedStructure} onUseGridLayout={() => { setFrozenCanvas(null); updateDraftState({ ...historyRef.current.present, layoutMode: 'schema' }) }} canUndo={Boolean(currentStructureHistory?.past.length)} canRedo={Boolean(currentStructureHistory?.future.length)} />
    {managedFormStatus && <p role="status">{managedFormStatus}</p>}
    {!activeManagedForm && import.meta.env.DEV && <details onToggle={event=>setThemeEditorOpen(event.currentTarget.open)}><summary>تم و ظاهر مشترک کل برنامه</summary>{themeEditorOpen && <LaboratoryThemeEditor />}</details>}
    {templateRegistrationStatus && !activeManagedForm && <p role="status">{templateRegistrationStatus}</p>}
    {activeManagedForm ? <button type="button" onClick={() => setManagedSaveDialogOpen(true)}>{fa ? 'تأیید و ذخیرهٔ فرم' : 'Confirm and save form'}</button> : <button type="button" onClick={() => { setTemplateTargetIds([]); setTemplateRegistrationOpen(true) }}>{fa ? 'ثبت نسخهٔ قالب مادر' : 'Register master template version'}</button>}
  </div>
  const sharedSidebar = activeManagedForm || designerOpen ? <aside className="managed-form-workspace-sidebar" aria-label={activeManagedForm ? (fa ? 'تنظیمات و طراحی فرم مستقل' : 'Independent form design and settings') : (fa ? 'تنظیمات قالب اصلی آزمایشگاه' : 'Laboratory template settings')} dir={fa ? 'rtl' : 'ltr'}>
        {import.meta.env.DEV && <button type="button" className="laboratory-form-manager" hidden={managedSidebarCollapsed} onClick={() => setManagedFormsListOpen(true)}>{fa ? 'مدیریت فرم‌ها و انتخاب فرم فعال' : 'Manage forms and active document'}</button>}
        <div className="laboratory-sidebar-document-mode" role="status">{activeManagedForm ? (fa ? 'ساخت/ویرایش فرم مستقل — ' : 'Independent form — ') + documentSchema.title[language] : (fa ? 'ویرایش قالب اصلی آزمایشگاه' : 'Original Laboratory template')}</div>
        <div className="managed-form-sidebar-heading">
          <div className="managed-form-editor-tabs" role="tablist" aria-label={fa ? 'بخش تنظیمات فرم' : 'Form settings sections'} hidden={managedSidebarCollapsed}>
            <button id="managed-designer-tab" type="button" role="tab" aria-controls="managed-designer-panel" aria-selected={managedSettingsTab === 'design'} tabIndex={managedSettingsTab === 'design' ? 0 : -1} onClick={() => setManagedSettingsTab('design')}>{fa ? 'طراحی ظاهری' : language === 'zh' ? '外观设计' : 'Visual design'}</button>
            <button id="managed-settings-tab" type="button" role="tab" aria-controls="managed-settings-panel" aria-selected={managedSettingsTab === 'settings'} tabIndex={managedSettingsTab === 'settings' ? 0 : -1} onClick={() => setManagedSettingsTab('settings')}>{fa ? 'تنظیمات فرم' : language === 'zh' ? '表单设置' : 'Form settings'}</button>
          </div>
          <button type="button" className="managed-form-sidebar-toggle" aria-label={managedSidebarCollapsed ? (fa ? 'بازکردن پنل Designer' : 'Expand Designer sidebar') : (fa ? 'جمع‌کردن پنل Designer' : 'Collapse Designer sidebar')} aria-expanded={!managedSidebarCollapsed} aria-controls="managed-form-sidebar-content" onClick={() => setManagedSidebarCollapsed(current => !current)}><span aria-hidden="true">{managedSidebarCollapsed ? '‹' : '›'}</span><span className="sr-only">{managedSidebarCollapsed ? (fa ? 'بازکردن پنل Designer' : 'Expand Designer sidebar') : (fa ? 'جمع‌کردن پنل Designer' : 'Collapse Designer sidebar')}</span></button>
        </div>
        <div id="managed-form-sidebar-content" className="managed-form-sidebar-content">
          <div id="managed-designer-panel" className="managed-form-editor-tabpanel managed-form-designer-slot" role="tabpanel" aria-labelledby="managed-designer-tab" hidden={managedSettingsTab !== 'design'}>{designerOpen ? sharedDesignerPanel : <button type="button" onClick={openDesigner}>{fa ? 'بازکردن Designer همین فرم' : 'Open this form Designer'}</button>}</div>
          <section id="managed-settings-panel" className="managed-form-editor-tabpanel managed-form-metadata-slot" role="tabpanel" aria-labelledby="managed-settings-tab" hidden={managedSettingsTab !== 'settings'}>{managedSettingsContent}</section>
        </div>
      </aside> : sharedDesignerPanel
  return <div className="form-laboratory-page" dir={fa ? 'rtl' : 'ltr'} data-form-laboratory data-form-design-mode={activeManagedForm ? 'independent' : 'laboratory'} data-synthetic-only="true" data-managed-form-id={activeManagedForm?.id} data-form-behavior-id={effectiveBehaviorId} data-form-policy={previewPolicy(effectiveBehaviorId)} data-runtime-mode={formRuntimeTesting?runtime.mode:undefined} data-entry-active={(formRuntimeTesting?runtime.mode!=='view':dataEntryActive) || undefined} data-designer-active={designerOpen&&!componentTestMode || undefined} data-button-press-effect={history.present.buttonPressEffect !== false ? "true" : "false"} onKeyDown={handleDesignerKey} onContextMenu={openContextMenu}>
    {formRuntimeTesting&&<section className="form-runtime-banner" role="status"><strong>آزمایش عملکرد فرم — دادهٔ موقت؛ {runtime.mode==='view'?'نمایش':runtime.mode==='create'?'ایجاد':'ویرایش'}</strong><button type="button" onClick={()=>{if(runtime.mode!=='view'){runRuntimeAction('close');return}setFormRuntimeTesting(false);setComponentTestMode(false);setRuntimeBehaviorPreview(null)}}>پایان آزمایش عملکرد</button><details><summary>گزارش رفتار همین آزمایش</summary><ol>{runtime.log.map((item,index)=><li key={index}>{item}</li>)}</ol></details></section>}
    {activeManagedForm && recoveryStatus && <p role="alert" className="laboratory-document-notice">{recoveryStatus}</p>}
    {import.meta.env.DEV && !activeManagedForm && <div><button type="button" onClick={() => setManagedFormsListOpen(true)}>{fa ? 'مدیریت فرم‌ها' : language === 'zh' ? '表单管理' : 'Form management'}</button></div>}
    {import.meta.env.DEV && formsManagerOpen && <FormBuilderSandbox language={language} onClose={() => setFormsManagerOpen(false)} />}
    <div className={activeManagedForm ? "laboratory-independent-environment" + (managedSidebarCollapsed ? " managed-form-sidebar-collapsed" : "") : "laboratory-environment"}>
    {activeManagedForm && <div ref={setExternalSidebarHost} className="laboratory-external-sidebar" />}
    <div ref={formFrameAreaRef} className="laboratory-form-frame-area" role="region" aria-label={activeManagedForm ? (fa ? 'فضای طراحی فرم مستقل' : 'Independent form design workspace') : (fa ? 'فضای فرم؛ برای تغییر اندازه موس را به لبه‌های بیرونی ببرید و برای جابه‌جایی نوار عنوان را بکشید.' : 'Form workspace. Move the pointer to an outer edge to resize; drag the title bar to move.')} tabIndex={0} onPointerMove={handlePreviewPointerMove} onPointerLeave={event => { if (!previewInteractionRef.current) event.currentTarget.style.cursor = '' }} onPointerDown={beginPreviewPointer} onKeyDown={handlePreviewKeyDown}>
    <div ref={formFrameRef} className="laboratory-form-frame" data-preview-device={activePreviewFrame.device} data-preview-width={activePreviewFrame.width} dir={fa ? 'rtl' : 'ltr'} style={activeManagedForm ? { width: activePreviewFrame.fitToPage && activePreviewFrame.device === 'desktop' ? '100%' : activePreviewFrame.width, minWidth: activePreviewFrame.fitToPage && activePreviewFrame.device === 'desktop' ? 0 : activePreviewFrame.width, height: activePreviewFrame.height ?? undefined, minHeight: activePreviewFrame.height ?? undefined, left: activePreviewOffset.x, top: activePreviewOffset.y, marginInline: 'auto' } : { width: previewFitToPage && previewDevice === 'desktop' ? '100%' : previewWidth, height: previewHeight ?? undefined, minHeight: previewHeight ?? undefined, left: previewOffset.x, top: previewOffset.y }}>
    <header ref={formBannerRef} className="form-laboratory-banner" data-document-mode={activeManagedForm ? "independent" : "laboratory"}><div className="laboratory-banner-title"><strong>{activeManagedForm?.schema.title[language] ?? motherSchema?.title[language] ?? title}</strong><span className="laboratory-document-mode" title={activeManagedForm?.id}>{activeManagedForm ? (fa ? 'ساخت/ویرایش فرم مستقل' : 'Independent form design') : (fa ? 'ویرایش قالب اصلی آزمایشگاه' : 'Original Laboratory template')}</span></div><div className="laboratory-banner-actions"><div className="laboratory-banner-variable-controls">{activeManagedForm&&<button type="button" aria-label="آزمایش کامپوننت‌ها" aria-pressed={componentTestMode} onClick={()=>{setComponentTestMode(value=>!value);setSelection([]);setToolbarSelection(null)}}>{componentTestMode?'بازگشت به طراحی':'آزمایش کامپوننت‌ها'}</button>}<div className="laboratory-device-toolbar" role="group" aria-label={fa ? 'پیش‌نمایش دستگاه' : 'Device preview'}>{(Object.keys(previewWidths) as PreviewDevice[]).map(device => <button key={device} type="button" aria-label={activeManagedForm ? (fa ? ({ desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' })[device] : ({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]) : undefined} aria-pressed={activePreviewFrame.device === device} onClick={() => { updateActivePreviewFrame({ device, fitToPage: device === 'desktop', width: previewWidths[device], height: null }); setActivePreviewOffset({ x: 0, y: 0 }) }} title={previewWidths[device] + 'px'}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">{device === 'desktop' ? <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M7 21h10" /></> : <><rect x={device === 'tablet' ? 5 : 7} y="2" width={device === 'tablet' ? 14 : 10} height="20" rx="2" /><path d="M11 19h2" /></>}</svg><span className="laboratory-device-label">{fa ? ({ desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' })[device] : ({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]}</span></button>)}{activePreviewFrame.device === 'mobile' && <select aria-label={fa ? 'عرض موبایل' : 'Mobile width'} value={activePreviewFrame.width === 320 || activePreviewFrame.width === 390 ? activePreviewFrame.width : 'custom'} onChange={event => { const width = Number(event.target.value); if (width) { updateActivePreviewFrame({ fitToPage: false, width }); setActivePreviewOffset(current => ({ ...current, x: 0 })) } }}><option value="custom">{fa ? 'اندازهٔ دلخواه' : 'Custom width'}</option><option value="390">390px</option><option value="320">320px</option></select>}</div>{!activeManagedForm && <label>{fa ? 'اندازهٔ داده' : language === 'zh' ? '数据量' : 'Dataset size'}<select value={datasetSize} onChange={event => setDatasetSize(Number(event.target.value) as typeof datasetSize)}>{laboratoryDatasetSizes.map(size => <option key={size} value={size}>{size.toLocaleString()}</option>)}</select></label>}<button type="button" className="laboratory-history-button" aria-label={fa ? 'واگرد' : 'Undo'} title="Ctrl+Z" disabled={!history.past.length} onClick={undo}>↶</button><button type="button" className="laboratory-history-button" aria-label={fa ? 'ازنو' : 'Redo'} title="Ctrl+Y" disabled={!history.future.length} onClick={redo}>↷</button></div>{activeManagedForm && <><button type="button" className="laboratory-history-button laboratory-managed-save" aria-label={fa ? 'ذخیرهٔ فرم' : 'Save form'} onClick={() => setManagedSaveDialogOpen(true)}><span className="laboratory-toolbar-icon" aria-hidden="true">✓</span><span className="laboratory-toolbar-label">{fa ? 'ذخیرهٔ فرم' : 'Save form'}</span></button><button type="button" className="laboratory-history-button laboratory-managed-close" aria-label={fa ? 'بستن فرم' : 'Close form'} onClick={() => closeManagedFormEditor()}><span className="laboratory-toolbar-icon" aria-hidden="true">×</span><span className="laboratory-toolbar-label">{fa ? 'بستن فرم' : 'Close form'}</span></button></>}{import.meta.env.DEV && !activeManagedForm && <button type="button" className="laboratory-history-button" aria-label={fa ? 'پیش‌نمایش قالب مشترک' : 'Shared template preview'} title={fa ? 'پیش‌نمایش قالب مشترک' : 'Shared template preview'} style={{ width: 'auto', paddingInline: 10, fontSize: 12, whiteSpace: 'nowrap' }} disabled={designerOpen} onClick={() => setSharedTemplatePreviewOpen(true)}>{fa ? 'پیش‌نمایش قالب مشترک' : language === 'zh' ? '共享模板预览' : 'Shared template preview'}</button>}{import.meta.env.DEV && !activeManagedForm && <><button type="button" onClick={createManagedFormFromLaboratory}>{fa ? 'ایجاد فرم از قالب آزمایشگاه' : language === 'zh' ? '从实验室模板创建表单' : 'Create form from Laboratory template'}</button><button type="button" onClick={() => setManagedFormsListOpen(true)}>{fa ? 'فرم‌های مستقل' : language === 'zh' ? '独立表单' : 'Independent forms'}</button></>}{!activeManagedForm && <button type="button" className="laboratory-designer-toggle" aria-label={settingsLabel} title={settingsLabel} aria-expanded={designerOpen} aria-controls="form-laboratory-designer" onClick={openDesigner}>⚙</button>}</div></header>
    {import.meta.env.DEV && layoutWarningMessages.length > 0 && <div role="alert" className="form-document-layout-warning">{fa ? 'هشدار چیدمان فرم — داده‌های ذخیره‌شده تغییر نکرده‌اند.' : 'Form layout warning — saved data was not changed.'}{layoutWarningMessages.map(message => <div key={message} dir="ltr">{message}</div>)}</div>}
    <div className={"laboratory-workspace" + (activeManagedForm ? " has-external-sidebar" + (designerOpen ? " has-designer" : "") : designerOpen ? " has-designer" : "") + (activeManagedForm || designerOpen ? " managed-form-workspace" : "") + ((activeManagedForm || designerOpen) && managedSidebarCollapsed ? " managed-form-sidebar-collapsed" : "")}>
      {activeManagedForm ? externalSidebarHost && createPortal(sharedSidebar, externalSidebarHost) : sharedSidebar}

    <FormSchemaPresentation schema={activePresentationSchema} designerDraft={visibleDraft} toolbarSelection={toolbarSelection??undefined} onToolbarSelect={selectToolbar} onToolbarContextMenu={(tableId,part,left,top)=>{if(toolbarSelection?.tableId!==tableId||!toolbarSelection.parts.includes(part))selectToolbar(tableId,part);setContextMenu({left,top,part:'toolbar',toolbarPart:part})}} language={language} initialHeaderRef={formBannerRef}
      columnReview={activeManagedForm ? Object.fromEntries((documentSchema.tables ?? []).map(table => [table.id, unresolvedTableColumns(documentSchema, table.id).map(column => column.id)])) : undefined} onToolbarChange={(tableId,part,patch,related)=>commitManagedStructure({...documentSchema,tables:documentSchema.tables?.map(table=>table.id===tableId?{...table,settings:{...table.settings,toolbar:patchToolbarParts((table.settings?.toolbar??{}) as GridToolbarSettings,part,patch,related)}}:table)})} onTableStructure={tableId => setStructureDialog({ kind: 'table', tableId })}
      editor={activeEditor} renderEditor={renderDocumentEditor} renderFooter={renderDocumentFooter} grids={presentationGrids} onGridActivate={activateTable}
      grid={{ rows: activeManagedForm ? sharedPresentationRows : [], columns: activeDesignerColumns, remoteQuery: activeManagedForm ? undefined : remoteGridQuery, remoteQueryScope: activeManagedForm ? undefined : datasetSize, resetRequest: activeManagedForm ? undefined : gridResetRequest, navigationRequest: activeManagedForm ? undefined : navigationRequest, designerMode: designerOpen, onDesignerHeaderHeightChange: updateTableHeaderHeight, ...(designerOpen&&!formRuntimeTesting?{onDesignerColumnWidthChange:(columnId:string,width:number)=>persistDesignerColumnWidth(activeTableId,columnId,width),onDesignerColumnOrderChange:(source:string,target:string,position:'before'|'after')=>persistDesignerColumnOrder(activeTableId,source,target,position)}:{}), designerSelectedColumnIds: selectedTableColumnIds, onDesignerColumnSelect: selectGridDesignerColumn, onDesignerContextMenu: openGridDesignerContextMenu, onRowSelectionChange: activeManagedForm ? undefined : setSelectedPerson, onTotalChange: activeManagedForm ? undefined : setGridRecordCount }}
      footer={activeManagedForm ? renderLaboratoryFooter(true, visibleDraft, activeActions, true) : renderLaboratoryFooter()}
      readOnly={Boolean(activeManagedForm)&&!formRuntimeTesting}
    />
    </div>
    {activeManagedForm && (['top', 'bottom', 'left', 'right'] as const).map(edge => <span key={edge} className={'form-frame-resize-edge form-frame-resize-' + edge} data-frame-resize={edge} role="separator" aria-label={'Resize form ' + edge} />)}
    </div></div></div>
    {import.meta.env.DEV && activeManagedForm && structureDialog && <FormDocumentDialog language={language} title={fa ? 'ویرایش ساختار فرم مستقل' : 'Edit independent form structure'} onClose={()=>setStructureDialog(null)} dirty={Boolean(structureDialogBaseline.current&&JSON.stringify(documentSchema)!==JSON.stringify(structureDialogBaseline.current.schema))} onSave={()=>true} onDiscard={()=>{if(structureDialogBaseline.current)restoreDesignerHistory(structureDialogBaseline.current.history)}}>
      {structureDialog.kind === 'addField' && <FieldCreationControls schema={documentSchema} language={language} onChange={commitManagedStructure} initialSectionId={structureDialog.sectionId} initialSourceId={structureDialog.sourceId} blueprints={fieldBlueprints} onSaveBlueprint={saveBlueprint} />}
      {structureDialog.kind === 'editField' && documentSchema.fields.filter(field => field.id === structureDialog.fieldId).map(field => <FieldEditingControls key={field.id} schema={documentSchema} language={language} onChange={commitManagedStructure} field={field} allowRemove />)}
      {structureDialog.kind === 'table' && documentSchema.tables?.filter(table => table.id === structureDialog.tableId).map(table => <FormTableStructureControls key={table.id} schema={documentSchema} table={table} language={language} defaultComposition={columnLinkDefaults.defaultComposition} allowMultipleSources={columnLinkDefaults.allowMultipleSources} onChange={schema => { commitManagedStructure(schema); if (!schema.tables?.some(item => item.id === table.id)) setStructureDialog(null) }} />)}
      {structureDialog.kind === 'addAction' && <ActionCreationControls schema={documentSchema} language={language} onChange={commitManagedStructure} initialSectionId={structureDialog.sectionId} />}
      <DocumentDialogCloseButton>{fa ? 'بستن' : 'Close'}</DocumentDialogCloseButton>
    </FormDocumentDialog>}
    {import.meta.env.DEV && managedSaveDialogOpen && activeManagedForm && <FormDocumentDialog language={language} title={fa ? 'مجوزهای کاربر و ذخیرهٔ فرم' : 'User permissions and save form'} onClose={()=>setManagedSaveDialogOpen(false)} dirty={JSON.stringify(activeManagedForm.customization)!==JSON.stringify(permissionsDialogBaseline.current)} onSave={saveManagedFormDraft} onDiscard={()=>{if(permissionsDialogBaseline.current)updateManagedForm(form=>({...form,customization:permissionsDialogBaseline.current!}))}}>
      <FormCustomizationPermissions language={language} value={activeManagedForm.customization} onChange={permissions => updateManagedForm(form => ({ ...form, customization: permissions }))} />
      <p>{fa ? 'ساختار، فیلدها، تعداد و ستون‌های جدول و منطق عملیاتی برای کاربر عادی قابل تغییر نیست.' : 'Structure, fields, table schema and business behavior remain developer-owned.'}</p>
      <div className="form-document-settings-buttons"><>{managedFormStatus && <p role="status">{managedFormStatus}</p>}<button type="button" onClick={saveManagedFormDraft}>{fa ? 'تأیید مجوزها و ذخیره' : 'Confirm permissions and save'}</button></><DocumentDialogCloseButton>{fa ? 'بازگشت به طراحی' : 'Back to design'}</DocumentDialogCloseButton></div>{managedFormStatus && <p role="status">{managedFormStatus}</p>}
    </FormDocumentDialog>}
    {import.meta.env.DEV && templateRegistrationOpen && !activeManagedForm && <FormDocumentDialog language={language} title={fa ? 'ثبت نسخهٔ قالب مادر' : 'Register master template version'} onClose={()=>setTemplateRegistrationOpen(false)} dirty={templateTargetIds.length>0} onSave={registerMotherTemplate}>
      <p>{fa ? 'این تغییرات به کدام فرم‌ها اعمال شود؟ تصمیم‌های اختصاصی حفظ می‌شوند و فرم‌های انتخاب‌نشده تغییر نمی‌کنند.' : 'Which forms should receive the changes? Form-specific decisions are preserved and unselected forms remain unchanged.'}</p>
      <p>فرم‌های سیستم: این انتخاب، پیش‌فرض طراحی آن فرم را نسخه‌بندی می‌کند؛ نسخه عملیاتی سالم تا اتصال و آزمون جایگزین نمی‌شود.</p>
      {operationalFormCatalog.filter(item=>item.availability!=='laboratory').map(item=><label className="form-document-check" key={'catalog:'+item.route}><input type="checkbox" checked={templateTargetIds.includes('catalog:'+item.route)} onChange={event=>setTemplateTargetIds(ids=>event.target.checked?[...ids,'catalog:'+item.route]:ids.filter(id=>id!=='catalog:'+item.route))}/>{item.title} — پیش‌فرض طراحی</label>)}
      {managedForms.forms.map(form => <label className="form-document-check" key={form.id}><input type="checkbox" checked={templateTargetIds.includes(form.id)} onChange={event => setTemplateTargetIds(ids => event.target.checked ? [...ids, form.id] : ids.filter(id => id !== form.id))} /><span>{form.schema.title[language]}<small dir="ltr">{form.id}</small>{!form.template.schema && <small>{fa ? 'پیش‌نویس قدیمی: ساختار حفظ می‌شود و فقط ظاهرِ ارثی به‌روزرسانی می‌شود.' : 'Legacy draft: structure is preserved; inherited appearance can be updated.'}</small>}</span></label>)}
      {managedForms.forms.filter(form=>templateTargetIds.includes(form.id)).map(form=>{const conflicts=templateRevisionConflicts(form,{schema:motherSchema??createLaboratorySchemaTemplate(visibleDraft),designer:visibleDraft,frame:activePreviewFrame,createdAt:''});return conflicts.length>0&&<details key={'conflicts:'+form.id}><summary>{form.schema.title[language]} — {conflicts.length} تصمیم اختصاصی حفظ می‌شود</summary><p>این موارد با نسخه مادر متفاوت‌اند و بازنویسی نخواهند شد.</p><ul>{conflicts.map(path=><li key={path} dir="ltr">{path}</li>)}</ul></details>})}
      <div className="form-document-settings-buttons"><button type="button" onClick={registerMotherTemplate}>{fa ? 'ثبت نسخه و اعمال به فرم‌های انتخابی' : 'Register and update selected forms'}</button><DocumentDialogCloseButton>{fa ? 'لغو' : 'Cancel'}</DocumentDialogCloseButton></div>{templateRegistrationStatus && <p role="status">{templateRegistrationStatus}</p>}
    </FormDocumentDialog>}
    {sharedTemplatePreviewOpen && createPortal(<div role="dialog" aria-modal="true" aria-label={fa ? 'پیش‌نمایش قالب مشترک' : 'Shared template preview'} dir={fa ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: 24, background: 'rgb(13 39 43 / 38%)' }} onMouseDown={event => { if (event.target === event.currentTarget) setSharedTemplatePreviewOpen(false) }}><section className="form-laboratory-page" style={{ width: 'min(1440px, calc(100vw - 48px))', height: 'min(880px, calc(100vh - 48px))', overflow: 'auto', padding: 20, borderRadius: 16, background: 'var(--surface, #fff)', boxShadow: '0 16px 48px rgb(0 0 0 / 28%)' }}><header ref={sharedPreviewHeaderRef} className="form-laboratory-banner"><div className="laboratory-banner-title"><strong>{fa ? 'پیش‌نمایش قالب مشترک' : language === 'zh' ? '共享模板预览' : 'Shared template preview'}</strong><span>{fa ? 'فقط‌خواندنی؛ با دادهٔ مصنوعی محلی و بدون ثبت تغییرات' : language === 'zh' ? '只读，本地合成数据，不保存更改' : 'Read-only with local synthetic data and no saved changes'}</span></div><div className="laboratory-banner-actions"><button type="button" onClick={() => setSharedTemplatePreviewOpen(false)}>{fa ? 'بستن' : language === 'zh' ? '关闭' : 'Close'}</button></div></header><div className="laboratory-workspace"><FormSchemaPresentation schema={laboratoryTemplatePreviewSchema} designerDraft={visibleDraft} language={language} initialHeaderRef={sharedPreviewHeaderRef} readOnly editor={renderLaboratoryEditor(true)} grid={{ rows: sharedPresentationRows, columns }} footer={renderLaboratoryFooter(true)} /></div></section></div>, document.body)}
    {behaviorEditorOpen&&<FormDocumentDialog language={language} title="مدیریت رفتار و قرارداد فرم‌ها" onClose={()=>setBehaviorEditorOpen(false)}><FormBehaviorControls schema={documentSchema} forms={[documentSchema,...managedForms.forms.filter(form=>form.id!==documentSchema.id).map(form=>form.schema)]} onChange={commitManagedStructure} onPublished={()=>refreshBehavior(value=>value+1)} onTest={(library,id)=>{setRuntimeBehaviorPreview({library,id});setBehaviorEditorOpen(false);setFormRuntimeTesting(true);setComponentTestMode(true)}}/><DocumentDialogCloseButton>بستن مدیریت رفتار</DocumentDialogCloseButton></FormDocumentDialog>}
    {componentLibraryOpen&&<ComponentLibraryEditor forms={[documentSchema,...managedForms.forms.filter(form=>form.id!==documentSchema.id).map(form=>form.schema)]} onClose={()=>setComponentLibraryOpen(false)} onSaveBlueprint={saveBlueprint}/>}
    {import.meta.env.DEV && managedFormsListOpen && createPortal(<div role="dialog" aria-modal="true" aria-label={fa ? 'مدیریت فرم‌ها و انتخاب فرم فعال' : 'Manage forms and active document'} dir={fa ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, zIndex: 1301, display: 'grid', placeItems: 'center', padding: 20, background: 'rgb(13 39 43 / 45%)' }}>
      <section className="form-laboratory-page" style={{ width: 'min(760px, calc(100vw - 40px))', maxHeight: 'min(720px, calc(100vh - 40px))', overflow: 'auto', padding: 20, borderRadius: 14, background: 'var(--surface, #fff)', boxShadow: '0 18px 52px rgb(0 0 0 / 30%)' }}>
        <header className="form-laboratory-banner"><div className="laboratory-banner-title"><strong>{fa ? 'مدیریت فرم‌ها و انتخاب فرم فعال' : 'Manage forms and active document'}</strong></div><button type="button" onClick={() => setManagedFormsListOpen(false)}>{fa ? 'بستن' : 'Close'}</button></header>
        {recoveryStatus && <p role="alert" className="laboratory-document-notice">{recoveryStatus}</p>}
        <button type="button" className="laboratory-select-master" aria-pressed={!activeManagedForm} onClick={switchToLaboratory}>{fa ? 'کار روی قالب اصلی آزمایشگاه' : 'Edit original Laboratory template'}</button>
        <FormCatalogList onRedesign={beginOperationalRedesign} onOpenOriginal={contract => { const leaving = latestRecoverySnapshot(); if (leaving && !persistRecoverySnapshot(leaving, 'بازکردن مسیر عملیاتی')) return; setManagedFormsListOpen(false); window.dispatchEvent(new CustomEvent('open-operational-form', { detail: contract.route })) }} />
        <p>{fa ? 'فرم‌های مستقل — انتخاب هر فرم فقط سند فعال را تغییر می‌دهد.' : 'Independent forms — choose the active document.'}</p>
        {!managedForms.forms.length && !Object.keys(recoveryCollection?.documents ?? {}).length && <p>{fa ? 'هنوز پیش‌نویس مستقلی ذخیره نشده است. با «ایجاد فرم از قالب آزمایشگاه» یک پیش‌نویس بسازید.' : 'No independent drafts saved yet. Use “Create form from Laboratory template” to start one.'}</p>}
        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>{Array.from(new Map([...managedForms.forms, ...Object.values(recoveryCollection?.documents ?? {}).map(document => document.current.form)].map(form => [form.id, form])).values()).map(form => <article key={form.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border, #cbd6d3)', borderRadius: 8 }}><div><strong>{form.schema.title[language]}</strong><div><small>{form.id} · {form.schema.mode}</small></div></div><button type="button" onClick={() => openManagedForm(form.id)}>{activeManagedForm?.id === form.id ? (fa ? 'فرم فعال' : 'Active form') : (fa ? 'بازکردن و طراحی این فرم' : 'Open and design this form')}</button></article>)}</div>
      </section>
    </div>, document.body)}
    {designerOpen && contextMenu && createPortal(<><div ref={contextMenuRef} className="designer-context-menu" role="menu" aria-label={fa?"ویژگی‌های انتخاب":"Selection properties"} dir={fa?"rtl":"ltr"} style={{ left: contextMenu.left, top: contextMenu.top }} onPointerOverCapture={event => { const item = (event.target as Element).closest('button'); if (item && !item.hasAttribute('data-grid-submenu') && !item.closest('.designer-context-submenu')) setGridSubmenu(null) }} onFocusCapture={event => { const item = (event.target as Element).closest('button'); if (item && !item.hasAttribute('data-grid-submenu') && !item.closest('.designer-context-submenu')) setGridSubmenu(null) }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      {activeManagedForm && (contextMenu.part!=='toolbar'||contextMenu.toolbarPart?.startsWith('header')) && contextGroup('structure',fa?'ساختار و ارتباطات':'Structure and links',<>
        {contextMenu.part === 'grid' && <>{contextMenu.gridTarget === 'header' && contextMenu.columnId && <button type="button" role="menuitem" onClick={() => { const column=documentSchema.tables?.find(table=>table.id===activeTableId)?.columns.find(item=>item.id===contextMenu.columnId); if(column)setLabelEditDialog({kind:'column',id:column.id,tableId:activeTableId,value:column.label[language]}); setContextMenu(null) }}>{fa ? 'ویرایش متن سرستون…' : 'Edit header text…'}</button>}<button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'table', tableId: activeTableId }); setContextMenu(null) }}>{fa ? 'افزودن و ویرایش ستون‌های جدول…' : 'Add and edit table columns…'}</button>{contextMenu.columnId && <button type="button" role="menuitem" onClick={() => { commitManagedStructure(removeDocumentColumn(documentSchema, activeTableId, contextMenu.columnId!)); setContextMenu(null) }}>{fa ? 'حذف ستون از ساختار فرم' : 'Remove column from form structure'}</button>}<button type="button" role="menuitem" onClick={() => { commitManagedStructure(removeDocumentTable(documentSchema, activeTableId)); setContextMenu(null) }}>{fa ? 'حذف جدول از این فرم' : 'Remove table from this form'}</button></>}
        <button type="button" role="menuitem" onClick={() => {
          const table = documentSchema.tables?.find(item => item.sectionId === contextMenu.sectionId || (contextMenu.part === 'grid' || contextMenu.part === 'toolbar') && item.id === activeTableId)
          let destination = contextMenu.sectionId ?? editorSectionId
          if (table) { const panelId=contextMenu.part==='toolbar'?toolbarHeaderFor(contextMenu.toolbarPart!,(table.settings?.toolbar??{}) as GridToolbarSettings):undefined; const row = documentSchema.sections.find(section => section.tableHeaderFor === table.id && section.settings?.toolbarPanelId===panelId); destination = row?.id ?? 'report-row.' + crypto.randomUUID(); if (!row) commitManagedStructure(panelId?addTableHeaderRow(documentSchema, table.id, destination,panelId):addTableHeaderRow(documentSchema, table.id, destination)) }
          setStructureDialog({ kind: 'addField', sectionId: destination }); setContextMenu(null)
        }}>{fa ? 'افزودن فیلد یا کامپوننت…' : 'Add field or component…'}</button>
        {contextMenu.fieldId && <><button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'editField', fieldId: contextMenu.fieldId }); setContextMenu(null) }}>{fa ? 'برچسب، نوع و ارتباط ستون…' : 'Field label, type and column links…'}</button><button type="button" role="menuitem" onClick={() => { commitManagedStructure(removeManagedFormField(documentSchema, contextMenu.fieldId!)); setContextMenu(null) }}>{fa ? 'حذف از این فرم' : 'Remove from this form'}</button></>}
        <button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'addAction', sectionId: documentSchema.sections.find(section => section.id === contextMenu.sectionId && section.kind === 'footer')?.id }); setContextMenu(null) }}>{fa ? 'افزودن کلید…' : 'Add action…'}</button>
        {(contextMenu.part === 'grid' || contextMenu.part === 'structure' || contextMenu.part === 'toolbar') && <button type="button" role="menuitem" onClick={() => { commitManagedStructure(addTableHeaderRow(documentSchema, activeTableId, 'report-row.' + crypto.randomUUID(),contextMenu.part==='toolbar'?toolbarHeaderFor(contextMenu.toolbarPart!,(documentSchema.tables?.find(table=>table.id===activeTableId)?.settings?.toolbar??{}) as GridToolbarSettings):undefined)); setContextMenu(null) }}>{fa ? 'افزودن ردیف فیلد بالای جدول' : 'Add report field row'}</button>}
        {contextMenu.actionId && <button type="button" role="menuitem" onClick={() => { commitManagedStructure({ ...documentSchema, actions: documentSchema.actions?.filter(action => action.id !== contextMenu.actionId) }); setContextMenu(null) }}>{fa ? 'حذف کلید از این فرم' : 'Remove action from this form'}</button>}
        <button type="button" role="menuitem" onClick={() => { setManagedSidebarCollapsed(false); setManagedSettingsTab('settings'); setDesignerOpen(true); setContextMenu(null); setGridSubmenu(null) }}>{fa ? 'تنظیمات ساختار فرم…' : 'Form structure settings…'}</button>
      </>)}

      {contextMenu.part==='toolbar'?<>
        <strong>{toolbarPartLabel(contextMenu.toolbarPart!)}</strong>
        {contextGroup('text',fa?'متن و قلم':'Text and font',<><button type="button" role="menuitem" onClick={()=>openToolbarFont(activeTableId,contextMenu.toolbarPart!)}>تنظیم فونت</button>{appearanceColors.filter(command=>command.property==='textColor').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}</>)}
        {contextGroup('appearance',fa?'ظاهر و حاشیه':'Appearance and border',<>{appearanceColors.filter(command=>command.property!=='textColor').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}{appearanceBoxCommands.filter(command=>command.property!=='width').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}</>)}
        {contextGroup('layout',fa?'اندازه و چیدمان':'Size and layout',<>{appearanceBoxCommands.filter(command=>command.property==='width').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}<button type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,'textAlign')}>تراز</button>{contextMenu.toolbarPart?.startsWith('header')&&<><button type="button" role="menuitem" onClick={()=>addHeaderPanel('beside')}>افزودن هدر کنار این هدر</button><button type="button" role="menuitem" onClick={()=>addHeaderPanel('below')}>افزودن هدر زیر این هدر</button><button type="button" role="menuitem" onClick={()=>{setContextMenu(null);selectToolbar(activeTableId,toolbarHeaderFor(contextMenu.toolbarPart!, (documentSchema.tables?.find(table=>table.id===activeTableId)?.settings?.toolbar??{}) as GridToolbarSettings))}}>انتخاب کل پنل هدر</button></>}</>)}
        {contextMenu.toolbarPart?.startsWith('header')&&gridSubmenuTriggers}
      </>:contextMenu.part==='structure'?null:contextMenu.part==='grid'?<>
        {contextMenu.gridTarget === 'header' ? <>
          <strong>تنظیم سرستون «{activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? ''}»</strong>
          {gridSubmenuTriggers}
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
        {contextGroup('text',fa?'متن و برچسب':'Text and label',<>{contextMenu.part === 'label' && <button type="button" role="menuitem" onClick={() => { const field=documentSchema.fields.find(item=>item.id===contextMenu.fieldId); if(field)setLabelEditDialog({kind:'field',id:field.id,value:field.label[language]}); setContextMenu(null) }}>{fa ? 'ویرایش متن برچسب…' : 'Edit label text…'}</button>}<button type="button" role="menuitem" onClick={()=>requestProperty('font')}>تنظیم فونت</button>{contextColors&&appearanceColors.filter(command=>command.property==='textColor').map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty('color',contextMenu.part==='label'?'labelColor':command.property)}>{command.label}</button>)}</>)}
        {contextSize&&contextGroup('appearance',fa?'ظاهر و حاشیه':'Appearance and border',<>
          {contextColors&&appearanceColors.filter(command=>command.property!=='textColor').map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty('color',command.property)}>{command.label}</button>)}
          {appearanceBoxCommands.filter(command=>command.property!=='width').map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty(command.section,command.property)}>{command.label}</button>)}
          <button type="button" role="menuitem" onClick={()=>requestProperty('appearance')}>سبک و جلوه ظاهری</button><button type="button" role="menuitem" onClick={()=>requestProperty('shadow')}>تنظیم سایه</button><button type="button" role="menuitem" onClick={()=>requestProperty('gradient')}>تنظیم گرادیان</button><button type="button" role="menuitem" onClick={()=>requestProperty('appearanceMore')}>تنظیمات بیشتر ظاهری</button>
        </>)}
        {contextGroup('layout',fa?'اندازه و چیدمان':'Size and layout',<>
          {contextSize&&appearanceBoxCommands.filter(command=>(command.property==='width'&&geometryEditable)).map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty(command.section,command.property)}>{command.label}</button>)}
          <button type="button" role="menuitem" onClick={()=>requestProperty(contextLayout?'align':'textAlign')}>تراز</button>{contextLayout&&<button type="button" role="menuitem" onClick={()=>requestProperty('spacing')}>فاصله‌گذاری</button>}
          {geometryEditable&&contextMenu.fieldId&&<><button type="button" role="menuitem" onClick={()=>centerEditorFields(false)}>{fa?'وسط‌کردن فیلدهای انتخاب‌شده':'Center selected fields'}</button><button type="button" role="menuitem" onClick={()=>centerEditorFields(true)}>{fa?'وسط‌کردن همهٔ ردیف‌های پنل':'Center all panel rows'}</button><button type="button" role="menuitemcheckbox" aria-checked={Boolean(canvas?.centeredFieldIds?.length)} onClick={()=>{if(!canvas?.centeredFieldIds?.length){centerEditorFields(true);return}const current=currentLayoutCanvas();if(current)updateDraftState(withCanvas(historyRef.current.present,{...current,centeredFieldIds:undefined}));setContextMenu(null);setGridSubmenu(null)}}>{fa?'حفظ وسط‌چینی هنگام ویرایش':'Keep rows centered while editing'}</button><hr/>{(['horizontal','vertical'] as const).map(axis=><button key={axis} type="button" role="menuitemcheckbox" aria-checked={neighborResizeFor(history.present)[axis]} onClick={()=>changeNeighborResize(axis,!neighborResizeFor(history.present)[axis])}>{neighborResizeFor(history.present)[axis]?'✓ ':''}{axis==='horizontal'?(fa?'تغییر عرض با حفظ فاصله و عرض مجموع':'Resize width with fixed gap and total width'):(fa?'تغییر ارتفاع با حفظ فاصله و ارتفاع مجموع':'Resize height with fixed gap and total height')}</button>)}</>}
        </>)}
        {contextGroup('more',fa?'گزینه‌های بیشتر':'More options',<><button type="button" role="menuitem" onClick={()=>requestProperty('more')}>تنظیمات بیشتر</button><button type="button" role="menuitem" onClick={()=>{setContextMenu(null);resetSelected()}}>بازنشانی به پیش‌فرض</button></>)}
      </>}

    </div>
    {((contextMenu.part === 'grid' && contextMenu.gridTarget === 'header')||(contextMenu.part==='toolbar'&&contextMenu.toolbarPart?.startsWith('header'))) && (gridSubmenu==='header'||gridSubmenu==='column') && <div ref={contextSubmenuRef} className="designer-context-menu designer-context-submenu" role="menu" aria-label={gridSubmenu === 'header' ? 'تنظیمات ظاهری هدر' : 'تنظیمات داده‌های ستون'} dir={fa?"rtl":"ltr"} style={{ left: Math.max(8, Math.min(window.innerWidth - 228, contextMenu.left > 236 ? contextMenu.left - 228 : contextMenu.left + 220)), top: Math.max(8, Math.min(window.innerHeight - 300, contextMenu.top)) }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      {gridSubmenu === 'header' ? <>
        <strong>تغییرات هدر</strong>
        <div className="designer-header-format-scope" role="group" aria-label="محدودهٔ تغییرات هدر"><button type="button" aria-pressed={headerStyleScope === 'selected'} onClick={() => setHeaderStyleScope('selected')}>فقط این سرستون</button><button type="button" aria-pressed={headerStyleScope === 'all'} onClick={() => setHeaderStyleScope('all')}>همهٔ سرستون‌ها</button></div>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('header', activeGridHeaderIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'color', 'textColor')}>رنگ متن هدر…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('header', activeGridHeaderIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'color', 'backgroundColor')}>رنگ پس‌زمینهٔ هدر…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('header', activeGridHeaderIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'color', 'borderColor')}>رنگ کادر هدر…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('header', activeGridHeaderIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'font')}>قلم و اندازهٔ هدر…</button>
        <button type="button" role="menuitemcheckbox" aria-checked={activeGridHeaderIds(contextMenu.columnId).every(id => Boolean(tableDesignerDraft.tableHeaders?.[id]?.bold))} onClick={() => { const ids = activeGridHeaderIds(contextMenu.columnId); const value = !ids.every(id => Boolean(tableDesignerDraft.tableHeaders?.[id]?.bold)); let next = historyRef.current.present; for (const id of ids) next = setDesignerTableHeaderStyle(next, id, 'bold', value); dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }}>{activeGridHeaderIds(contextMenu.columnId).every(id => Boolean(tableDesignerDraft.tableHeaders?.[id]?.bold)) ? 'برداشتن حالت درشت هدرها' : 'درشت‌کردن هدرها'}</button>
        <div className="designer-header-height-controls"><label>ارتفاع سرستون<input type="number" aria-label="ارتفاع سرستون در منو" min={28} max={120} value={tableDesignerDraft.tableHeaderHeight??42} onChange={event=>{const n=event.target.valueAsNumber;if(Number.isFinite(n))setTableHeaderHeight(n)}}/></label><span>ارتفاع سرستون: {tableDesignerDraft.tableHeaderHeight ?? 42}px</span><button type="button" aria-label="کاهش ارتفاع سرستون" onClick={() => changeTableHeaderHeight(-2)}>−</button><button type="button" aria-label="افزایش ارتفاع سرستون" onClick={() => changeTableHeaderHeight(2)}>＋</button></div>
      </> : <>
        <strong>تغییرات داده‌های ستون</strong>
        <button type="button" role="menuitemcheckbox" aria-checked={activeGridColumnIds(contextMenu.columnId).every(id => Boolean(tableDesignerDraft.tableColumns?.[id]?.bold))} onClick={() => { const ids = activeGridColumnIds(contextMenu.columnId); const value = !ids.every(id => Boolean(tableDesignerDraft.tableColumns?.[id]?.bold)); let next = historyRef.current.present; for (const id of ids) next = setDesignerTableColumnStyle(next, id, 'bold', value); dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }}>{activeGridColumnIds(contextMenu.columnId).every(id => Boolean(tableDesignerDraft.tableColumns?.[id]?.bold)) ? 'برداشتن حالت درشت ستون‌ها' : 'درشت‌کردن داده‌های ستون'}</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('column', activeGridColumnIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'color', 'textColor')}>رنگ متن داده‌های ستون…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('column', activeGridColumnIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'color', 'backgroundColor')}>رنگ پس‌زمینهٔ سلول‌های ستون…</button>
        <button type="button" role="menuitem" onClick={() => openGridFormatDialog('column', activeGridColumnIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'font')}>قلم و اندازهٔ داده‌های ستون…</button>
      </>}
    </div>}
    </>, document.body)}
    {designerOpen && labelEditDialog && <LabelEditorDialog schema={documentSchema} target={labelEditDialog} language={language} hidden={Boolean(gridFormatDialog)} onClose={()=>setLabelEditDialog(null)} onFont={openLabelFontDialog} onCommit={commitManagedStructure}/>}
    {designerOpen && gridFormatDialog?.mode === 'font' && createPortal(<div className="designer-grid-format-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) cancelGridFormatDialog() }}><section ref={gridFormatDialogRef} className="designer-grid-format-dialog" role="dialog" aria-modal="true" aria-labelledby="designer-grid-format-title" dir={fa ? 'rtl' : 'ltr'} style={{ transform: `translate3d(${gridFormatDialogOffset.x}px, ${gridFormatDialogOffset.y}px, 0)` }} onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') cancelGridFormatDialog() }}>
      <header onPointerDown={handleGridDialogHeaderPointerDown} onPointerMove={handleGridDialogHeaderPointerMove} onPointerUp={handleGridDialogHeaderPointerEnd} onPointerCancel={handleGridDialogHeaderPointerEnd}><h2 id="designer-grid-format-title">{gridFormatDialog.mode === 'font' ? (fa ? `قلم — ${gridFormatDialog.scope === 'toolbar' ? 'نوار جدول' : gridFormatDialog.scope === 'header' ? 'سرستون' : gridFormatDialog.scope === 'column' ? 'داده‌های ستون' : gridFormatDialog.scope === 'label' ? 'برچسب' : gridFormatDialog.scope === 'action' ? 'دکمه' : 'فیلد'}: ${gridFormatDialog.label}` : `Font — ${gridFormatDialog.scope === 'header' ? 'Header' : gridFormatDialog.scope === 'column' ? 'Column data' : gridFormatDialog.scope === 'label' ? 'Label' : gridFormatDialog.scope === 'action' ? 'Button' : 'Field'}: ${gridFormatDialog.label}`) : (fa ? `رنگ — ${gridFormatDialog.label}` : `Color — ${gridFormatDialog.label}`)}</h2><button type="button" aria-label={fa ? 'بستن' : 'Close'} onClick={cancelGridFormatDialog}>×</button></header>
      {gridFormatDialog.mode === 'font' && <>
        <div className="designer-grid-format-tabs" role="tablist" aria-label={gridWord('دسته‌های قالب‌بندی', 'Formatting categories', '格式类别')}><button type="button" role="tab" aria-selected="true">{gridWord('قلم', 'Font', '字体')}</button></div>
        <div className="designer-grid-format-normal"><label><input type="checkbox" checked={gridFormatDialog.normalFont} onChange={event => updateGridFormatDialog(event.target.checked ? { normalFont: true, fontFamily: 'inherit', fontSize: gridFormatDialog.base.tableFont?.size ?? 13, bold: false, italic: false, underline: 'none', strikeThrough: false, script: 'none', color: '#263a38' } : { normalFont: false })} />{gridWord('قلم معمولی', 'Normal font', '常规字体')}</label></div>
        <div className="designer-grid-font-fields">
          <label className="designer-grid-font-list">{gridWord('قلم', 'Font', '字体')}<select size={7} aria-label={gridWord('قلم', 'Font', '字体')} value={gridFormatDialog.fontFamily} onChange={event => { const support = gridFontStyleSupport[event.target.value] ?? { bold: false, italic: false }; updateGridFormatDialog({ fontFamily: event.target.value, bold: support.bold && gridFormatDialog.bold, italic: support.italic && gridFormatDialog.italic }) }}>{gridFonts.map(([id, faName, enName, zhName]) => <option key={id} value={id}>{gridWord(faName, enName, zhName)}</option>)}</select></label>
          <label className="designer-grid-font-list">{gridWord('حالت قلم', 'Font style', '字形')}<select size={4} aria-label={gridWord('حالت قلم', 'Font style', '字形')} value={gridFormatDialog.bold ? gridFormatDialog.italic ? 'bold-italic' : 'bold' : gridFormatDialog.italic ? 'italic' : 'regular'} onChange={event => updateGridFormatDialog({ bold: event.target.value === 'bold' || event.target.value === 'bold-italic', italic: event.target.value === 'italic' || event.target.value === 'bold-italic' })}><option value="regular">{gridWord('معمولی', 'Regular', '常规')}</option><option value="italic" disabled={!gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic}>{gridWord('ایتالیک', 'Italic', '斜体')}{!gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic ? ` — ${gridWord('پشتیبانی نمی‌شود', 'unavailable', '不可用')}` : ''}</option><option value="bold" disabled={!gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold}>{gridWord('درشت', 'Bold', '粗体')}{!gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold ? ` — ${gridWord('پشتیبانی نمی‌شود', 'unavailable', '不可用')}` : ''}</option><option value="bold-italic" disabled={!gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold || !gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic}>{gridWord('درشت ایتالیک', 'Bold Italic', '粗斜体')}{!gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic || !gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold ? ` — ${gridWord('پشتیبانی نمی‌شود', 'unavailable', '不可用')}` : ''}</option></select></label>
          <label className="designer-grid-font-list">{gridWord('اندازه', 'Size', '字号')}<input type="number" min="8" max="40" value={Number.isFinite(gridFormatDialog.fontSize) ? gridFormatDialog.fontSize : ''} onChange={event => updateGridFormatDialog({ fontSize: Number(event.target.value) })} onBlur={event => updateGridFormatDialog({ fontSize: Math.max(8, Math.min(40, Number(event.currentTarget.value) || 8)) })} /><select size={7} aria-label={gridWord('اندازه', 'Size', '字号')} value={gridFontSizes.includes(gridFormatDialog.fontSize) ? gridFormatDialog.fontSize : ''} onChange={event => updateGridFormatDialog({ fontSize: Number(event.target.value) })}>{gridFontSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <div className="designer-grid-font-options">
          <label className="designer-grid-format-underline">{gridWord('زیرخط', 'Underline', '下划线')}<select value={gridFormatDialog.underline} onChange={event => updateGridFormatDialog({ underline: event.target.value as 'none' | 'single' | 'double' })}><option value="none">{gridWord('بدون', 'None', '无')}</option><option value="single">{gridWord('تک', 'Single', '单线')}</option><option value="double">{gridWord('دوتایی', 'Double', '双线')}</option></select></label>
          <div className="designer-grid-format-color"><span>{gridWord('رنگ قلم', 'Color', '颜色')}</span><ExcelColorPicker language={language} label={gridWord('رنگ قلم', 'Font color', '字体颜色')} value={gridFormatDialog.color} onPreview={previewGridFormatColor} onCommit={handleGridFormatColorCommit} /></div>
        </div>
        <div className="designer-grid-font-bottom">
          <fieldset className="designer-grid-format-effects"><legend>{gridWord('جلوه‌ها', 'Effects', '效果')}</legend>
            <label><input type="checkbox" checked={gridFormatDialog.strikeThrough} onChange={event => updateGridFormatDialog({ strikeThrough: event.target.checked })} />{gridWord('خط‌خورده', 'Strikethrough', '删除线')}</label>
            <label><input type="checkbox" checked={gridFormatDialog.script === 'superscript'} onChange={event => updateGridFormatDialog({ script: event.target.checked ? 'superscript' : 'none' })} />{gridWord('بالانویس', 'Superscript', '上标')}</label>
            <label><input type="checkbox" checked={gridFormatDialog.script === 'subscript'} onChange={event => updateGridFormatDialog({ script: event.target.checked ? 'subscript' : 'none' })} />{gridWord('پایین‌نویس', 'Subscript', '下标')}</label>
          </fieldset>
          <div className="designer-grid-format-preview-wrap"><span>{gridWord('پیش‌نمایش', 'Preview', '预览')}</span><div className="designer-grid-format-preview" style={{ fontFamily: ({ inherit: 'inherit', vazirmatn: "'Vazirmatn',Tahoma,Arial,sans-serif", tahoma: 'Tahoma,Arial,sans-serif', segoe: "'Segoe UI',Tahoma,sans-serif", arial: 'Arial,sans-serif', naskh: "'Noto Naskh Arabic','B Nazanin',serif", aptos: 'Aptos,Arial,sans-serif', calibri: 'Calibri,Arial,sans-serif', cambria: 'Cambria,serif', consolas: 'Consolas,monospace', courier: "'Courier New',monospace", georgia: 'Georgia,serif', times: "'Times New Roman',serif", verdana: 'Verdana,sans-serif' } as Record<string, string>)[gridFormatDialog.fontFamily], fontSize: `${gridFormatDialog.fontSize}px`, fontWeight: gridFormatDialog.bold ? 700 : 400, fontStyle: gridFormatDialog.italic ? 'italic' : 'normal', color: gridFormatDialog.color, textDecorationLine: [gridFormatDialog.underline !== 'none' ? 'underline' : '', gridFormatDialog.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none', textDecorationStyle: gridFormatDialog.underline === 'double' ? 'double' : 'solid' }}>{gridFormatDialog.script === 'superscript' ? <sup>{gridWord('نمونهٔ قلم', 'Font sample', '字体示例')}</sup> : gridFormatDialog.script === 'subscript' ? <sub>{gridWord('نمونهٔ قلم', 'Font sample', '字体示例')}</sub> : gridWord('نمونهٔ قلم', 'Font sample', '字体示例')}</div></div>
        </div>
      </>}
      <footer><button type="button" onClick={cancelGridFormatDialog}>{fa ? 'لغو' : 'Cancel'}</button><button type="button" className="primary" onClick={applyGridFormatDialog}>{fa ? 'تأیید' : 'OK'}</button></footer>
    </section></div>, document.body)}
    {designerOpen && gridFormatDialog?.mode === 'color' && <div className="designer-grid-color-picker-host" aria-hidden="true"><ExcelColorPicker key={`${gridFormatDialog.scope}-${gridFormatDialog.targetIds?.join(',')}-${gridFormatDialog.colorProperty}`} language={language} label={gridWord('انتخاب رنگ', 'Choose color', '选择颜色')} value={gridFormatDialog.color} autoOpen onPreview={previewGridFormatColor} onCommit={handleGridFormatColorCommit} onCancel={cancelGridFormatDialog} /></div>}
  </div>
}
