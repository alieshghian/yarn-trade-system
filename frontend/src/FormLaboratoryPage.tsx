import { DualCalendarInput } from './components/base-form/DualCalendarInput'
import './components/base-form/invoicePrototype.css'
import { yarnPurchasePrototype, yarnPurchasePrototypeId } from './components/base-form/yarnPurchasePrototype'
import {PackagingVolumeControl} from './components/base-form/PackagingVolumeControl'
import {repairApprovedYarnRules} from './components/base-form/approvedYarnRuleRepair'
import type {PackagingVolumeItem} from './components/base-form/packagingVolume'
import {batchValueReportRows,type BatchValueDetails} from './components/base-form/batchValueRecords'
import {NumericFieldInput} from './components/base-form/NumericFieldInput'
import {numericFieldInputProps} from './components/base-form/numericField'
import {BatchValueList,type BatchValueItem} from './components/base-form/BatchValueList'
import {FormRelationshipControls} from './components/base-form/FormRelationshipControls'
import { resolveDesignerNeighborResize,designerCanvasInteractionBounds} from './components/base-form/designer'
import {FormDocumentHeader} from './components/base-form/FormDocumentHeader'
import { measureDesignerGeometry, commitMeasuredDesignerGeometry, type DesignerGeometryPolicy, type MeasuredDesignerGeometry } from './components/base-form/designerGeometry'
import { captureDesignerVisualPointer, createDesignerGeometryPreview, createDesignerStylePreview, scheduleAfterDesignerGesture } from './components/base-form/designerGesturePreview'
import { FormSettingsButton } from './components/base-form/FormSettingsButton'
import { captureLaboratoryPreview } from './components/base-form/laboratoryLayoutPreview'
import { layoutDesignerCanvasSelection, levelDesignerInputRow } from './components/base-form/designer'
import { NewLaboratoryFormDialog } from './components/base-form/NewLaboratoryFormDialog'
import { purchaseInvoiceLaboratoryId, purchaseInvoiceLaboratorySchema } from './components/base-form/purchaseInvoiceLaboratory'
import {SystemLookup} from './components/base-form/SystemLookup'
import {ComponentListProvider} from './components/base-form/ComponentListContext'
import {createSampleLookupSource} from './components/base-form/sampleLookupSource'
import {isListComponentField,normalizeListSettings} from './components/base-form/componentListSettings'
import type {SystemLookupSource} from './components/base-form/systemLookupSources'
import {DesignerFontPanel} from './components/base-form/DesignerFontPanel'
import { hasInvalidFieldFocusOrders, visualFocusOrder } from './components/base-form/fieldFocusOrder'
import { orderedEntryControls } from './formInteraction'
import laboratoryOperationalBehavior from './components/base-form/laboratoryOperationalBehavior.json'
import { createFormDesignExport, formDesignDiagnosticMessage } from './components/base-form/formDesignExport'
import { createLabelTranslationQueue, type LabelLocale, type LabelTranslations } from './components/base-form/labelTranslationQueue'
import { markDesignerActionLabelManual, applyDesignerActionTranslations } from './components/base-form/designer'
import { alignDesignerCanvasFieldsToEdge, autoAlignDesignerCanvas, capDesignerCanvasWidth, centerCanvasRows, expandDesignerCanvasBounds, fitDesignerCanvasToViewportWithHysteresis, isDesignerShortcutKey, levelDesignerCanvas, snapResizedCanvasInputsToPeers, toggleDesignerCanvasAlignmentException, translateDesignerActionLabel } from './components/base-form/designer'
import {appearanceColors,appearanceBoxCommands} from './components/base-form/appearanceCommands'
import {FormBehaviorControls} from './components/base-form/FormBehaviorControls'
import { LabelEditorDialog } from './components/base-form/LabelEditorDialog'
import { DocumentDialogCloseButton } from './components/base-form/FormDocumentDialog'
import { effectiveFieldRules, fieldRuleMarkers, validateRecordRules, formRuleStructureIssues } from './components/base-form/fieldRules'
import {behaviorIdFor,currentFormPolicy,resolveFormBehavior,readFormBehaviors,resolveColumnLinkBehavior,type FormBehaviorLibrary,formBehaviorEvent,formTestReducer,initialFormTest,formTestActionFor,formActionVisible,validateTestRecord} from './components/base-form/formBehavior'
import {ComponentLibraryEditor} from './components/base-form/ComponentLibraryEditor'
import {evaluateDerivedFields,evaluateDerivedFieldParts} from './components/base-form/derivedField'
import { moveToolbarPart, patchToolbarParts, toolbarHeaderFor, toolbarPartLabel, toolbarPartLabels, type GridToolbarPart, type GridToolbarPartStyle, type GridToolbarSettings } from './components/base-form/gridToolbarLayout'
import { editorViewport, fitAutomaticEditors } from './components/base-form/formEditorViewport'
import { LaboratoryThemeEditor } from './components/base-form/ThemeDesignControls'
import { GridToolbarControls } from './components/base-form/GridToolbarControls'
import { FormCatalogList } from './components/base-form/FormCatalogList'
import { FormMenuPlacement } from './components/base-form/PendingFormDesignMenu'
import { createOperationalRedesign, operationalSource, operationalFormCatalog, type OperationalFormContract } from './components/base-form/operationalFormCatalog'
import { invalidateChangedDesignReleases, approveSavedDesign, savedDesignApproval, designDigest, classifyRedesign, finalizeDesign, loadDesignReleases, type DesignHandoff } from './components/base-form/formDesignReleases'
import {readDesignLifecycles, setDesignLifecycle, isDesignAvailable, type DesignLifecycle} from './components/base-form/formDesignLifecycle'
import {ManagedDesignList} from './components/base-form/ManagedDesignList'
import {forkManagedDesign, managedDesignGroups} from './components/base-form/managedDesignVersions'
import { normalizeManagedLaboratoryForm } from './components/base-form/laboratoryFormDraftState'
import { laboratoryContentTitle, renameLaboratoryForm } from './components/base-form/formDocumentControls'
import React, { useCallback, useReducer, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Field, Shortcut } from './DefinitionControls'
import { NumberControl } from './components/base-form/NumberControl'
import { CascadingTreePanels, cascadingTreeDesignParts } from './components/base-form/CascadingTreePanels'
import { cascadingTreeSettingsFromField, ensureProductGroupReportTable, productGroupReportRows } from './components/base-form/productGroupLaboratoryForm'
import SystemDateInput from './SystemDateInput'
import {suggestComponentCode,codeInputProps,formatComponentCode} from './components/base-form/serialCode'
import {fieldCodeSettings} from './components/base-form/componentBehavior'
import { PersonTitleControl } from './components/base-form/PersonTitleControl'
import { FormValueList } from './components/base-form/FormValueList'
import { FormBuilderSandbox } from './components/base-form/FormBuilderSandbox'
import { useDesignerSession } from './components/base-form/useDesignerSession'
import type { PersonTitleOption } from './components/base-form/PersonTitleControl'
import { type GridColumn } from './components/base-form/BaseFormGridBoundary'
import { FormSchemaPresentation } from './components/base-form/FormSchemaPresentation'
import { FormTableStructureControls } from './components/base-form/FormTableStructureControls'
import { laboratoryColumnFieldLinks, columnLabelMismatch, composeColumnFieldValue, unresolvedTableColumns, unresolvedFormFields, normalizeFormLinks, preserveFormLinks, removeDocumentColumns, removeDocumentTable, updateDocumentColumn, moveDocumentColumn } from './components/base-form/formTableStructure'
import { readFormRecovery, writeFormRecovery, writeFormRecoveryResult, closeFormRecovery, recoverableDeletedFields, recoverableDeletedTables, restoreRecoverableTable, restoreRecoverableField, type RecoverableForm } from './components/base-form/formDocumentRecovery'
import { FieldCreationControls, FieldEditingControls, ActionCreationControls } from './components/base-form/FormFieldStructureControls'
import { addToolbarHeaderPanel, addTableHeaderRow, loadFieldBlueprints, removeOptionalDocumentActions, saveFieldBlueprint, type FieldBlueprint } from './components/base-form/formDocumentControls'
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
import { alignCanvasFields, designerActionCode, designerActionLabel, designerActionTextStyle, designerAppearanceStyle, existingCanvasCollisions, fieldGroupRect, moveCanvasFields, resizeCanvasHandle, resizeCanvasDimension, designerResizeHandles, type DesignerResizeHandle, translateCanvasField, validateCanvasArrangement, captureDesignerPointer, designerStyleForPart, layoutDesignerFields, loadDesignerDraft, resetDesignerFields, saveDesignerDraft, selectDesignerPart, selectedDesignerInputs, setDesignerActionText, setDesignerActionTextProperty, setDesignerAppearanceProperty, setDesignerActionBarHeight, setDesignerActionBarOffsetY, setDesignerButtonPressEffect, setDesignerFilterPopupFontSize as setFilterSizeBase, setDesignerGridSearchPosition as setSearchPositionBase, setDesignerTableColumnStyle as setTableColumnBase, setDesignerTableHeaderStyle as setTableHeaderBase, setDesignerTableHeaderHeight as setTableHeightBase, setDesignerTableFont as setTableFontBase, setDesignerProperty, stopDesignerHandleClick, type DesignerActionTextPart, type DesignerAppearanceProperty, type DesignerDraft, type DesignerCanvas, type DesignerRect, type DesignerAlignment, type DesignerLayoutOperation, type DesignerLayoutOrientation, type DesignerProperty, type DesignerValue, type GridSearchPosition } from './components/base-form/designer'
import type { FormSchemaDraft } from './components/base-form/formSchema'
import type { BaseFormAction, BaseFormDefinition } from './components/base-form/types'
import type { Language } from './i18n'
import { designerActionVisible, designerShortcutAction, setDesignerActionVisibility } from './components/base-form/designer'
import { contextDesignerSelection, designerActionStyle, designerEffectiveValues, designerElementAppearanceProperties, resizeDesignerActions, setDesignerActionProperty, setDesignerColorProperty } from './components/base-form/designer'
import { commitManagedFormStructure, createManagedFormStructureHistory, createManagedLaboratoryForm, laboratoryTemplateVersion, loadManagedLaboratoryForms, redoManagedFormStructure, removeManagedFormFields, renameManagedFormField, resolveManagedLaboratoryDesigner, saveManagedLaboratoryForm, managedFormWithDesigner, managedLaboratoryFormsStorageKey, ensureLaboratoryTemplateFieldLayout, undoManagedFormStructure, type ManagedFormFrame, type ManagedFormMode, type ManagedFormStructureHistory, type ManagedLaboratoryForm, type ManagedLaboratoryForms } from './components/base-form/laboratoryFormDraftState'

const laboratoryDefinition: BaseFormDefinition = {
  id: 'form-laboratory.persons-synthetic',
  actions: [
    { id: 'new-person', code: 'Space', keys: [' '], label: { fa: 'شخص جدید', en: 'New person', zh: '新建人员' }, primary: true, required: true },
    { id: 'copy-last', code: 'F2', keys: ['F2'], label: { fa: 'کپی آخرین', en: 'Copy last', zh: '复制上一条' }, required: true },
    { id: 'copy-selected', code: 'F4', keys: ['F4'], label: { fa: 'کپی انتخابی', en: 'Copy selected', zh: '复制所选' }, required: true },
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
  const loaded = loadLaboratoryDraft(userId)
  const stored: DesignerDraft = { ...loaded, defaults: { ...loaded.defaults,
    input: { ...loaded.defaults?.input, ...(loaded.defaults?.input?.bold === undefined && loaded.defaults?.input?.fontWeight === undefined ? { bold: false } : {}) },
    label: { ...loaded.defaults?.label, ...(loaded.defaults?.label?.bold === undefined && loaded.defaults?.label?.fontWeight === undefined ? { bold: false } : {}) }
  } }
  let storage: Storage | undefined
  try { storage = window.localStorage } catch { /* Use the corrected session palette without storage. */ }
  const key = `yarn-trade:form-lab-field-palette:v1:${encodeURIComponent(userId ?? '')}:${laboratoryDefinition.id}`
  try { if (userId && storage?.getItem(key) === 'restored') return stored } catch { /* Restore only the field fills below. */ }
  const clearFill = (values: DesignerDraft['overrides'][string] = {}) => {
    const { backgroundColor: _background, disabledColor: _disabled, componentAddBackground: _add, ...rest } = values
    return rest
  }
  const overrides = Object.fromEntries(Object.entries(stored.overrides).map(([id, values]) => [id, id.endsWith('::label') ? values : clearFill(values)]))
  const inputDefaults = { ...clearFill(stored.defaults?.input), backgroundColor: '#f4f6f5', ...(stored.defaults?.input?.bold === undefined && stored.defaults?.input?.fontWeight === undefined ? { bold: false } : {}) }
  const labelDefaults = { ...stored.defaults?.label, ...(stored.defaults?.label?.bold === undefined && stored.defaults?.label?.fontWeight === undefined ? { bold: false } : {}) }
  const next: DesignerDraft = {
    ...stored, overrides,
    defaults: { ...stored.defaults, input: inputDefaults, label: labelDefaults },
    appearance: { ...stored.appearance, entryFieldBackground: '#d8d8d8' }
  }
  if (userId && storage) {
    try {
      if (!storage.getItem(`${key}:previous-draft`)) storage.setItem(`${key}:previous-draft`, JSON.stringify(loaded))
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

function focusSelectionButton(event: React.PointerEvent<HTMLButtonElement>) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.focus({ preventScroll: true })
}

export default function FormLaboratoryPage({ language, authenticatedUserId, requestedDesign, registerCloseGuard }: { language: Language, authenticatedUserId?: string, requestedDesign?: { id: string; sequence: number }; registerCloseGuard?: (guard:(()=>Promise<boolean>)|null)=>void }) {
  const lookupSamples=useRef(new Map<string,SystemLookupSource>())
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
  const [showRuleMarkersInDesigner, setShowRuleMarkersInDesigner] = useState(false)
  const dataEntryActiveRef = useRef(false)
  const [selectedPerson, setSelectedPerson] = useState<SyntheticPerson | null>(null)
  const [gridRecordCount, setGridRecordCount] = useState(0)
  const entryDraftBaseline = useRef<typeof defaultPersonDraft | null>(null)
  const designerEntrySnapshot = useRef<typeof defaultPersonDraft | null>(null)
  const runActionRef = useRef<(id: string) => void>(() => {})
  const [startupRecovery] = useState(() => readFormRecovery(browserFormStorage(), authenticatedUserId))
  const recoveredStartup = startupRecovery?.activeFormId && isDesignAvailable(browserFormStorage(), authenticatedUserId, startupRecovery.activeFormId) ? startupRecovery.documents[startupRecovery.activeFormId]?.current : undefined
  const [recoveryStatus, setRecoveryStatus] = useState('')
  const [serverBackupVersions, setServerBackupVersions] = useState<Array<{id:string;formId:string;createdAt:string;reason:string}>>([])
  const [allServerBackupVersions, setAllServerBackupVersions] = useState<Array<{id:string;formId:string;createdAt:string;reason:string}>>([])
  const [serverBackupBusy, setServerBackupBusy] = useState(false)
  const recoverySnapshotRef = useRef<RecoverableForm | null>(null)
  const [recoveryRevision, setRecoveryRevision] = useState(0)
  const [designerOpen, setDesignerOpen] = useState(Boolean(recoveredStartup))
  const [themeEditorOpen, setThemeEditorOpen] = useState(false)
  const [formsManagerOpen, setFormsManagerOpen] = useState(false)
  const [sharedTemplatePreviewOpen, setSharedTemplatePreviewOpen] = useState(false)
  const sharedPreviewHeaderRef = useRef<HTMLElement>(null)
  const [managedForms, setManagedForms] = useState<ManagedLaboratoryForms>(() => loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId) ?? { version: 1, activeFormId: null, forms: [] })
  const motherRecoveryKey = 'yarn-trade:mother-design-recovery:v1:' + encodeURIComponent(authenticatedUserId || 'developer-local')
  const [motherSchema, setMotherSchema] = useState<FormSchemaDraft | null>(() => { try { const saved=JSON.parse(localStorage.getItem(motherRecoveryKey)??'null') as FormSchemaDraft|null; if(saved?.id===laboratoryDefinition.id&&Array.isArray(saved.fields)&&Array.isArray(saved.sections))return saved } catch { /* Retain the registered template when no valid recovery draft exists. */ } return managedForms.templateRevision?.schema ?? null })
  const [motherStructureHistory, setMotherStructureHistory] = useState<ManagedFormStructureHistory<FormSchemaDraft> | null>(null)
  const [activeEditorSectionId, setActiveEditorSectionId] = useState('laboratory.editor')
  const [selectedTableId, setSelectedTableId] = useState('laboratory.synthetic-persons')
  const activeTableIdRef = useRef(selectedTableId)
  const [managedSaveDialogOpen, setManagedSaveDialogOpen] = useState(false)
  const [templateRegistrationOpen, setTemplateRegistrationOpen] = useState(false)
  const [templateTargetIds, setTemplateTargetIds] = useState<string[]>([])
  const [templateRegistrationStatus, setTemplateRegistrationStatus] = useState('')
  const [fieldBlueprints, setFieldBlueprints] = useState<FieldBlueprint[]>(() => loadFieldBlueprints(browserFormStorage(), authenticatedUserId))
  const [structureDialog, setStructureDialog] = useState<{ kind: 'addField' | 'editField' | 'addAction' | 'table' | 'relationships'; tableId?: string; columnId?: string; focusColumnLinks?: boolean; issueMessage?:string; issueGroupId?:string; sectionId?: string; fieldId?: string; sourceId?: string } | null>(null)
  const [externalSidebarHost, setExternalSidebarHost] = useState<HTMLDivElement | null>(null)
  const saveBlueprint = (blueprint: FieldBlueprint) => { const next = saveFieldBlueprint(browserFormStorage(), authenticatedUserId, blueprint); if (!next) return false; setFieldBlueprints(next); return true }
  const [componentLibraryOpen,setComponentLibraryOpen]=useState(false)
  const [managedFormsListOpen, setManagedFormsListOpen] = useState(false)
  const [designLifecycles, setDesignLifecycles] = useState(() => readDesignLifecycles(browserFormStorage(), authenticatedUserId) ?? {})
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  useEffect(() => {
    const refresh = () => setDesignLifecycles(readDesignLifecycles(browserFormStorage(), authenticatedUserId) ?? {})
    refresh()
    window.addEventListener('form-design-releases-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {window.removeEventListener('form-design-releases-updated', refresh); window.removeEventListener('storage', refresh)}
  }, [authenticatedUserId])
  const [newFormOpen, setNewFormOpen] = useState(false)
  const [managedFormEditorOpen, setManagedFormEditorOpen] = useState(Boolean(recoveredStartup))
  const [managedSettingsTab, setManagedSettingsTab] = useState<'design' | 'settings'>('design')
  const [managedFormDraft, setManagedFormDraft] = useState<ManagedLaboratoryForm | null>(recoveredStartup?.form ?? null)
  const [managedFormSaved, setManagedFormSaved] = useState(false)
  const handoffInProgress=useRef(false)
  const [handoffBusy,setHandoffBusy]=useState(false)
  const [preparedHandoff,setPreparedHandoff]=useState<{form:ManagedLaboratoryForm;id:string;metadata:DesignHandoff}|null>(null)
  const saveInProgress=useRef(false)
  const [managedFormStatus, setManagedFormStatus] = useState('')
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)
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
  const treeDesignTargets = ((activeManagedForm?.schema ?? motherSchema)?.fields ?? []).filter(field => field.componentId === 'base-form.cascading-tree-panels').flatMap(field => {
    const configuredNodes = cascadingTreeSettingsFromField(field.settings).nodes ?? []
    return [...cascadingTreeDesignParts.map(part => ({ id: field.id + '.tree.' + part.id, label: part.label, sectionId: field.sectionId })), ...configuredNodes.map(node => ({ id: field.id + '.tree.node.' + encodeURIComponent(node.id), label: 'گروه: ' + node.name, sectionId: field.sectionId }))]
  })
  const activeFieldIds = [...((activeManagedForm?.schema ?? motherSchema)?.fields.map(field => field.id) ?? fieldIds), ...treeDesignTargets.map(part => part.id)]
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
  const activeFieldLabels = Object.fromEntries(activeFieldIds.map(id => [id, (activeManagedForm?.schema ?? motherSchema)?.fields.find(field => field.id === id)?.label[language] ?? treeDesignTargets.find(part => part.id === id)?.label ?? labels[id]?.[language] ?? id]))
  const { history, dispatchHistory, historyRef, setPreviewDraft: setColorPreviewDraft, visibleDraft, editingBaseline, save: saveSessionDraft, undo: undoHistory, redo: redoHistory, restoreHistory: restoreDesignerHistory } = useDesignerSession({
    formId: activeManagedForm?.id ?? laboratoryDefinition.id, fieldIds: activeFieldIds, userId: authenticatedUserId,
    documentSchema: activeManagedForm ? normalizeFormLinks(activeManagedForm.schema, activeManagedForm.template.schema) : undefined, legacyStructureHistory: managedStructureHistory ?? undefined,
    initialHistoryLoader: identity => readFormRecovery(browserFormStorage(), identity.userId)?.documents[identity.formId]?.current.designerHistory,
    initialDraftLoader: identity => activeManagedForm ? resolveManagedLaboratoryDesigner(activeManagedForm) : loadLaboratoryColorBaseline(identity.userId)
  })
  const documentSchema = history.document?.present ?? activeManagedForm?.schema ?? motherSchema ?? createLaboratorySchemaTemplate(visibleDraft)
  useEffect(()=>{
    if(!activeManagedForm)return
    const repaired=repairApprovedYarnRules(documentSchema)
    if(repaired===documentSchema)return
    commitManagedStructure(repaired)
    setRuntimeErrors({})
  },[activeManagedForm?.id,documentSchema])
  useEffect(()=>{
    if(!activeManagedForm||!documentSchema.fields.some(field=>field.componentId==='base-form.cascading-tree-panels'))return
    const renamed=renameLaboratoryForm(documentSchema,language,documentSchema.title[language])
    if(renamed!==documentSchema)commitManagedStructure(renamed)
  },[documentSchema.id,documentSchema.title[language]])
  useEffect(() => {
    if (activeManagedForm?.id !== 'form.new.8e77aae6-9477-41f9-b473-9d52511535a1') return
    const repaired = ensureProductGroupReportTable(documentSchema, activeManagedForm.template.schema)
    if (repaired !== documentSchema) commitManagedStructure(repaired)
  }, [activeManagedForm?.id, documentSchema])
  const componentPopupFieldIds = documentSchema.fields.filter(field => isListComponentField(field) && (field.kind === 'valueList' || Boolean(field.settings?.listSettings) || ['persons.title-control', 'base-form.number-control', 'base-form.value-list', 'form-laboratory.titleId', 'base-form.system-lookup'].includes(field.componentId))).map(field => field.id)
  const currentDocumentSchemaRef = useRef(documentSchema)
  currentDocumentSchemaRef.current = documentSchema
  const structureDialogBaseline=useRef<{history:typeof history;schema:FormSchemaDraft}|null>(null)
  const permissionsDialogBaseline=useRef(activeManagedForm?.customization)
  useLayoutEffect(()=>{if(structureDialog)structureDialogBaseline.current={history:structuredClone(historyRef.current),schema:structuredClone(documentSchema)};else structureDialogBaseline.current=null},[structureDialog])
  useLayoutEffect(()=>{if(!structureDialog?.issueMessage)return;const frame=requestAnimationFrame(()=>{const alert=document.querySelector<HTMLElement>('[data-handoff-error]');if(structureDialog.kind==='editField'){const rules=alert?.parentElement?.querySelector<HTMLDetailsElement>('.form-field-rules-disclosure');if(rules){rules.open=true;rules.scrollIntoView({block:'center'});rules.querySelector<HTMLElement>('input,select,button')?.focus({preventScroll:true});return}}if(!structureDialog.issueGroupId&&!structureDialog.fieldId){alert?.scrollIntoView({block:'nearest'});alert?.focus({preventScroll:true})}});return()=>cancelAnimationFrame(frame)},[structureDialog])
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
  const geometryFieldIds = editorGeometryScoped ? [...documentSchema.fields.filter(field => field.sectionId === editorSectionId).map(field => field.id), ...treeDesignTargets.filter(part => part.sectionId === editorSectionId).map(part => part.id)] : activeFieldIds
  const geometryTextareaFieldIds = documentSchema.fields.filter(field => geometryFieldIds.includes(field.id) && field.kind === 'textarea').map(field => field.id)
  const geometryCheckboxFieldIds = documentSchema.fields.filter(field => geometryFieldIds.includes(field.id) && field.kind === 'checkbox').map(field => field.id)
  const geometryActiveFieldIds = documentSchema.fields.filter(field => geometryCheckboxFieldIds.includes(field.id) && (/active/i.test(field.id) || /فعال|active/i.test(field.label.fa + ' ' + field.label.en))).map(field => field.id)
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
  const activePreviewFrameRef = useRef(activePreviewFrame)
  activePreviewFrameRef.current = activePreviewFrame
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
    const restored = recovery?.activeFormId && isDesignAvailable(browserFormStorage(), authenticatedUserId, recovery.activeFormId) ? recovery.documents[recovery.activeFormId]?.current : undefined
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
  const hoveredInputResize = useRef<{ fieldId: string; edge: DesignerResizeHandle; element: HTMLElement } | null>(null)
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
    if (operationalPreviewRef.current) return
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
    if (operationalPreviewRef.current) return
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
    if (operationalPreviewRef.current) return
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
  const [actionBarSelected, setActionBarSelected] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ left: number, top: number, part: 'input' | 'label' | 'action' | 'grid' | 'structure' | 'toolbar', toolbarPart?: GridToolbarPart, sectionId?: string, fieldId?: string, actionId?: string, gridTarget?: 'header' | 'row' | 'search', columnId?: string } | null>(null)
  const [gridSubmenu, setGridSubmenu] = useState<string | null>(null)
  const [fieldAlignmentPopup, setFieldAlignmentPopup] = useState<null | { fieldId: string; anchorLeft: number; anchorRight: number; anchorTop: number }>(null)
  const [gridAlignmentPopup, setGridAlignmentPopup] = useState<null | { header: boolean; ids: string[]; anchorLeft: number; anchorRight: number; anchorTop: number; title: string }>(null)
  const [alignmentPopupOffset, setAlignmentPopupOffset] = useState({ x: 0, y: 0 })
  const alignmentPopupDrag = useRef<null | { pointerId: number; startX: number; startY: number; baseLeft: number; baseTop: number; width: number; height: number; originX: number; originY: number }>(null)
  const [gridFormatDialog, setGridFormatDialogState] = useState<null | { scope: 'header' | 'column' | 'field' | 'label' | 'action' | 'toolbar'; baseSchema?:FormSchemaDraft; tableId?:string; mode: 'font' | 'color'; id: string; targetIds?: string[]; actionPart?: DesignerActionTextPart | 'button'; label: string; base: DesignerDraft; fontFamily: string; fontSize: number; bold: boolean; italic: boolean; underline: 'none' | 'single' | 'double'; strikeThrough: boolean; script: 'none' | 'superscript' | 'subscript'; normalFont: boolean; color: string; textAlign?: 'start' | 'center' | 'end' | 'left' | 'right'; colorProperty: 'textColor' | 'backgroundColor' | 'borderColor' }>(null)
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
  const fieldAlignmentRef = useRef<HTMLDivElement>(null)
  const gridAlignmentRef = useRef<HTMLDivElement>(null)
  const [propertyRequest, setPropertyRequest] = useState<DesignerPropertyRequest>()
  const [applyToAll, setApplyToAll] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const formGridRef = useRef<HTMLDivElement | null>(null)
  const [editorViewportWidth, setEditorViewportWidth] = useState(0)
  // Keep each editor section's viewport projection independent. A shared
  // single-value ref lets another rendered section overwrite the projection
  // between pointer frames, which makes centered Canvas fields move only half
  // the pointer delta when their content bounds change during a drag.
  const canvasViewProjection = useRef(new Map<string, { width: number; shift: number; overflowing: boolean; originX: number }>())
  const canvasProjectionKey = (schema: FormSchemaDraft, sectionId?: string) => schema.id + ':' + (sectionId ?? 'editor') + ':' + schema.fields.map(field => field.id).join('|')
  useLayoutEffect(() => {
    const grid = formGridRef.current
    const editor = grid?.closest<HTMLElement>('.laboratory-editor')
    if (!editor) return
    const measure = () => {
      const style = window.getComputedStyle(editor)
      const padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0')
      const width = Math.max(0, editor.clientWidth - padding)
      const stableWidth = Math.round(width * 4) / 4
      setEditorViewportWidth(current => Math.abs(current - stableWidth) < 0.25 ? current : stableWidth)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(editor)
    measure()
    return () => observer.disconnect()
  }, [documentSchema.id, activeManagedForm?.id, activeEditorSectionId, activePreviewFrame.device, activePreviewFrame.width])
  const gestureCleanup = useRef<(() => void) | null>(null)
  const canvasViewOrigins=useRef(new Map<string,number>())
  const [layoutGuideStep,setLayoutGuideStep]=useState(0)
  const [formRuntimeTesting,setFormRuntimeTesting]=useState(false)
  const [runtimeBehaviorPreview,setRuntimeBehaviorPreview]=useState<{library:FormBehaviorLibrary;id:string}|null>(null)
  const effectiveBehaviorId=formRuntimeTesting&&runtimeBehaviorPreview?runtimeBehaviorPreview.id:behaviorIdFor(documentSchema)
  const neighborResizeFor=(draft:DesignerDraft=historyRef.current.present)=>{
    return resolveDesignerNeighborResize(draft)
  }
  const previewPolicy=(id:string)=>formRuntimeTesting&&runtimeBehaviorPreview?JSON.stringify(resolveFormBehavior(runtimeBehaviorPreview.library,id)):undefined
  const [runtime,dispatchRuntime]=useReducer(formTestReducer,undefined,initialFormTest)
  const [runtimeErrors,setRuntimeErrors]=useState<Record<string,string>>({})
  const suggestedCodeFields=useRef(new Set<string>())
  const [behaviorEditorOpen,setBehaviorEditorOpen]=useState(false)
  const [toolbarPropertyRequest,setToolbarPropertyRequest]=useState<{sequence:number;tableId:string;part:GridToolbarPart;property:string}>()
  const toolbarPropertySequence=useRef(0)
  const [,refreshBehavior]=useState(0)
  useEffect(()=>{const refresh=()=>refreshBehavior(value=>value+1);window.addEventListener(formBehaviorEvent,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(formBehaviorEvent,refresh);window.removeEventListener('storage',refresh)}},[])
  const [componentTestMode,setComponentTestMode]=useState(false)
  const [testActorRole,setTestActorRole]=useState<'admin'|'user'>('admin')
  const [treeReportRows, setTreeReportRows] = useState<Record<string, { id: string; [key: string]: unknown }[]>>({})
  const [treeRowSelection, setTreeRowSelection] = useState<{formId:string;fieldId:string;nodeId:string;sequence:number;markerColor?:string}|null>(null)
  const selectTreeReportRow = (tableId: string, row: SyntheticPerson | null) => {
    const record = row as unknown as { __treeNodeId?: string; __treeFieldId?: string } | null
    if (!record?.__treeNodeId || !record.__treeFieldId) { setTreeRowSelection(null); return }
    const grid = Array.from(formFrameRef.current?.querySelectorAll<HTMLElement>('[data-table-id]') ?? []).find(grid => grid.dataset.tableId === tableId)?.querySelector<HTMLElement>('.base-grid-boundary')
    const markerColor = grid ? getComputedStyle(grid).getPropertyValue('--lab-row-selected-bg').trim() || undefined : undefined
    setTreeRowSelection(current => ({ formId: documentSchema.id, fieldId: record.__treeFieldId!, nodeId: record.__treeNodeId!, markerColor, sequence: (current?.sequence ?? 0) + 1 }))
  }
  const [treeCreateRequest, setTreeCreateRequest] = useState<{ formId: string; fieldId: string; sequence: number } | null>(null)
  const [treeEntry, setTreeEntry] = useState<{ formId: string; active: boolean } | null>(null)
  const treeEntryActive = treeEntry?.formId === documentSchema.id && treeEntry.active
  const startTreeCreate = () => {
    const field = documentSchema.fields.find(field => field.componentId === 'base-form.cascading-tree-panels')
    if (!field) return false
    setTreeCreateRequest(current => ({ formId: documentSchema.id, fieldId: field.id, sequence: (current?.sequence ?? 0) + 1 }))
    return true
  }
  const operationalPreviewRef = useRef(false)
  const previewSurface = useRef<ReturnType<typeof captureLaboratoryPreview>>(undefined)
  const [componentTestValues,setComponentTestValues]=useState<Record<string,{value:string;options:string[];defaultValue?:string;batchItems?:BatchValueItem[]}>>({})
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
  useLayoutEffect(() => {
    if (!fieldAlignmentPopup || !fieldAlignmentRef.current) return
    const popup = fieldAlignmentRef.current
    const rect = popup.getBoundingClientRect()
    const preferred = fa ? fieldAlignmentPopup.anchorLeft - rect.width - 8 : fieldAlignmentPopup.anchorRight + 8
    const fallback = fa ? fieldAlignmentPopup.anchorRight + 8 : fieldAlignmentPopup.anchorLeft - rect.width - 8
    const left = preferred >= 8 && preferred + rect.width <= window.innerWidth - 8 ? preferred : fallback
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`
    popup.style.top = `${Math.max(8, Math.min(fieldAlignmentPopup.anchorTop, window.innerHeight - rect.height - 8))}px`
  }, [fieldAlignmentPopup, fa])
  useLayoutEffect(() => {
    if (!gridAlignmentPopup || !gridAlignmentRef.current) return
    const popup = gridAlignmentRef.current
    const rect = popup.getBoundingClientRect()
    const preferred = fa ? gridAlignmentPopup.anchorLeft - rect.width - 8 : gridAlignmentPopup.anchorRight + 8
    const fallback = fa ? gridAlignmentPopup.anchorRight + 8 : gridAlignmentPopup.anchorLeft - rect.width - 8
    const left = preferred >= 8 && preferred + rect.width <= window.innerWidth - 8 ? preferred : fallback
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`
    popup.style.top = `${Math.max(8, Math.min(gridAlignmentPopup.anchorTop, window.innerHeight - rect.height - 8))}px`
  }, [gridAlignmentPopup, fa])
  useEffect(() => {
    if (!contextMenu) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (contextMenuRef.current?.contains(target) || contextSubmenuRef.current?.contains(target)) return
      setContextMenu(null)
    }
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
  useEffect(() => {
    if (!fieldAlignmentPopup) return
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); setFieldAlignmentPopup(null)
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [fieldAlignmentPopup])
  useEffect(() => {
    if (!gridAlignmentPopup) return
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); setGridAlignmentPopup(null)
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [gridAlignmentPopup])
  useLayoutEffect(() => {
    const focusGridSearch = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('[data-form-builder-sandbox]')) return
      const roots = [...document.querySelectorAll<HTMLElement>('[data-form-laboratory]')]
      const root = roots.find(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden')
      if (!root || root.dataset.operationalPreview) return
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
      const runtimeCreate = root?.querySelector<HTMLButtonElement>('button[data-runtime-action="create"]:not(:disabled)')
      if (!root || root.dataset.operationalPreview || (designerOpenRef.current && !runtimeCreate)) return
      const target = event.target
      if (target !== document.body && target !== document.documentElement && (!(target instanceof Node) || !root.contains(target))) return
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (runtimeCreate) { runtimeCreate.click(); return }
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
    const sectionId = documentSchema.fields.find(field => field.id === fieldId || fieldId.startsWith(field.id + '.tree.'))?.sectionId
    if (!editorGeometryScoped || !sectionId || sectionId === editorSectionId) return
    const grid = Array.from(formFrameRef.current?.querySelectorAll<HTMLDivElement>('.laboratory-form-grid[data-section-id]') ?? []).find(element => element.dataset.sectionId === sectionId)
    if (grid) formGridRef.current = grid
    setActiveEditorSectionId(sectionId)
    setFrozenCanvas(null)
  }
  const [contextTreeColumnId, setContextTreeColumnId] = useState<string | null>(null)
  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!designerOpen || formRuntimeTesting || operationalPreviewRef.current) return
    const target = event.target as HTMLElement
    if (target.closest('.managed-form-workspace-sidebar, .laboratory-designer-pane, .excel-color-picker, [role="dialog"], [role="menu"]')) return
    event.preventDefault(); event.stopPropagation()
    setFieldAlignmentPopup(null)
    const action = target.closest<HTMLElement>('[data-action-id]')?.dataset.actionId
    const field = target.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId
    const part = target.closest('.designer-label-part') ? 'label' : field ? 'input' : null
    const sectionId = target.closest<HTMLElement>('[data-section-id]')?.dataset.sectionId ?? target.closest<HTMLElement>('[data-document-section-id]')?.dataset.documentSectionId
    if (!action && !field) { if (activeManagedForm) setContextMenu({ left: event.clientX, top: event.clientY, part: 'structure', sectionId }); else setContextMenu(null); return }
    setApplyToAll(false)
    setToolbarSelection(null)
    if (action) { setSelection([]); setSelectedTableColumnIds([]); setActionSelection(current => contextDesignerSelection(current, action, event.ctrlKey || event.metaKey)) }
    else { activateEditorForField(field!); setActionSelection([]); setSelectedTableColumnIds([]); setSelection(current => contextDesignerSelection(current, `${field}::${part}`, event.ctrlKey || event.metaKey)) }
    if (field && activeManagedForm) setManagedSelectedFieldId(field)
    setContextMenu({ left: event.clientX, top: event.clientY, part: action ? 'action' : part!, sectionId, fieldId: field, actionId: action })
  }
  useEffect(() => {
    const commitPopupWidth = (event: Event) => {
      const detail = (event as CustomEvent<{ fieldId: string; anchor: Element; width: number }>).detail
      if (!designerOpenRef.current || dataEntryActiveRef.current || !detail || !formFrameRef.current?.contains(detail.anchor) || !Number.isFinite(detail.width) || !componentPopupFieldIds.includes(detail.fieldId)) return
      finishPropertyChange()
      dispatchHistory({ type: 'change', draft: setDesignerProperty(historyRef.current.present, [detail.fieldId + '::input'], 'componentPopupWidth', Math.max(80, Math.min(1200, detail.width)), activeFieldIds) })
      setManagedFormSaved(false)
    }
    window.addEventListener('component-popup-width-change', commitPopupWidth)
    return () => window.removeEventListener('component-popup-width-change', commitPopupWidth)
  }, [documentSchema.id, activeFieldIds.join('|'), componentPopupFieldIds.join('|')])
  const requestProperty = (section: DesignerPropertyRequest['section'], property?: DesignerPropertyRequest['property']) => {
    setFieldAlignmentPopup(null)
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
    setActionBarSelected(false)
    activateEditorForField(id)
    setToolbarSelection(null);setSelectedTableColumnIds([])
    if (!managedSidebarCollapsed) {
      setManagedSettingsTab('design')
      setPropertyRequest(current=>({sequence:(current?.sequence??0)+1,section:'size'}))
    }
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
      const measured = measuredGeometryFor(ids)
      if (measured) {
        const resized = resizeCanvasDimension(measured.canvas, ids, property, value, neighborResizeFor(start), fa)
        const changedIds = Object.keys(resized.fields).filter(id => resized.fields[id] !== measured.canvas.fields[id])
        next = commitMeasuredDesignerGeometry(start, measured, resized, changedIds, activeFieldIds)
      } else if(ids.length&&ids.every(id=>documentSchema.fields.find(field=>field.id===id)?.sectionId===section)){
        const stored=designerDraftForEditor(start,documentSchema,editorGeometryScoped?section:undefined).canvas
        const options=neighborResizeFor(start),locked=property==='width'?options.horizontal:options.vertical
        const root=formFrameRef.current?.querySelector<HTMLElement>('[data-field-id="'+ids[0]+'"]')?.closest<HTMLDivElement>('.laboratory-form-grid')??null
        const initial=stored??(locked?captureCurrentEditorCanvas(root):undefined)
        if(initial){const resized=resizeCanvasDimension(initial,ids,property,value,options,fa,manualCanvasBounds(initial,root));next=withCanvas(start,resized,section,false);setLayoutStatus(resized===initial&&locked?'همسایهٔ مناسب یا فضای کافی برای این تغییر اندازه وجود ندارد.':'')}
      }
    }
    dispatchHistory({ type:'change',draft:next })
    if (propertyCommitTimer.current !== null) window.clearTimeout(propertyCommitTimer.current)
    propertyCommitTimer.current = window.setTimeout(() => { dispatchHistory({ type: 'commitTransaction' }); propertyCommitTimer.current = null }, 250)
    setSaveStatus('')
  }
  const [actionTranslationStatus, setActionTranslationStatus] = useState<Record<string, string>>({})
  const labelTranslationQueue = useRef<ReturnType<typeof createLabelTranslationQueue> | null>(null)
  if (!labelTranslationQueue.current) labelTranslationQueue.current = createLabelTranslationQueue(async (text, sourceLanguage, signal) => {
    const response = await apiRequest<{ translations: LabelTranslations }>('/api/laboratory/label-translations', { method: 'POST', body: JSON.stringify({ text, sourceLanguage }), signal })
    return response.translations
  })
  useEffect(() => { setActionTranslationStatus({}); return () => labelTranslationQueue.current?.dispose() }, [documentSchema.id])
  const updateActionText = (id: string, part: DesignerActionTextPart, value: string, resetLocale?: LabelLocale) => {
    setColorPreviewDraft(null)
    const translationKey = documentSchema.id + ':' + id
    labelTranslationQueue.current?.cancel(translationKey)
    if (propertyCommitTimer.current === null) dispatchHistory({ type: 'beginTransaction' })
    let nextDraft = historyRef.current.present
    if (part !== 'code') {
      const action = activeActions.find(item => item.id === id)
      const previous = nextDraft.actions?.[id]
      const oldSource = action ? designerActionLabel(nextDraft, action, part) : ''
      const oldTranslations = translateDesignerActionLabel(oldSource, part)
      // Legacy hand-edited translations have no provenance: preserve unfamiliar overrides.
      for (const locale of ['fa', 'en', 'zh'] as const) {
        const existing = previous?.labels?.[locale]
        if (locale !== part && previous?.manualLabels?.[locale] === undefined && existing !== undefined && existing !== previous?.autoLabels?.[locale] && existing !== action?.label[locale] && existing !== oldTranslations?.[locale]) nextDraft = markDesignerActionLabelManual(nextDraft, id, locale)
      }
      nextDraft = markDesignerActionLabelManual(nextDraft, id, part)
      if (resetLocale) nextDraft = markDesignerActionLabelManual(nextDraft, id, resetLocale, false)
      nextDraft = setDesignerActionText(nextDraft, id, part, value)
      const translations = translateDesignerActionLabel(value, part)
      const status = (text: string) => setActionTranslationStatus(current => ({ ...current, [id]: text }))
      if (translations) {
        nextDraft = applyDesignerActionTranslations(nextDraft, id, translations)
        status('ترجمهٔ واژه‌نامه اعمال شد؛ عنوان‌های دستی حفظ شدند.')
      } else if (value.trim() && (['fa', 'en', 'zh'] as const).some(locale => locale !== part && !nextDraft.actions?.[id]?.manualLabels?.[locale])) {
        const formId = documentSchema.id
        labelTranslationQueue.current?.schedule(translationKey, value, part, translated => {
          const current = historyRef.current.present
          if (current.formId !== formId || current.actions?.[id]?.labels?.[part] !== value) return
          dispatchHistory({ type: 'commitTransaction' })
          dispatchHistory({ type: 'change', draft: applyDesignerActionTranslations(current, id, translated) })
        }, state => status(({ pending: 'در انتظار ترجمهٔ آنلاین؛ عنوان‌های قبلی هنوز تأیید نشده‌اند.', online: 'ترجمهٔ آنلاین اعمال شد؛ عنوان‌های دستی حفظ شدند.', unconfigured: 'سرویس ترجمهٔ آنلاین تنظیم نشده است؛ ترجمه‌های قبلی نیاز به بررسی دارند.', error: 'ترجمه انجام نشد؛ ترجمه‌های قبلی نیاز به بررسی دارند. دوباره تلاش کنید.' })[state]))
      } else {
        status(value.trim() ? 'عنوان‌های دیگر دستی هستند و خودکار بازنویسی نمی‌شوند.' : 'عنوان خالی است؛ ترجمه انجام نشد.')
      }
    } else nextDraft = setDesignerActionText(nextDraft, id, part, value)
    dispatchHistory({ type: 'change', draft: nextDraft })
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
  const updateActionBarHeight = (height: number | undefined) => { dispatchHistory({ type: 'change', draft: setDesignerActionBarHeight(historyRef.current.present, height) }); setSaveStatus('') }
  const updateActionBarOffsetY = (offsetY: number) => { dispatchHistory({ type: 'change', draft: setDesignerActionBarOffsetY(historyRef.current.present, offsetY) }); setSaveStatus('') }
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
        if (dialog.scope === 'field') setFieldStyle('textAlign', dialog.textAlign === 'start' ? undefined : dialog.textAlign)
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
    const next = { scope, id, targetIds, label: targetIds.length > 1 ? `${label} (+${targetIds.length - 1})` : label, mode, base, fontFamily: style?.fontFamily ?? table.tableFont?.family ?? 'inherit', fontSize: style?.fontSize ?? table.tableFont?.size ?? 13, bold: style?.bold ?? false, italic: style?.italic ?? false, underline: (style?.underline ?? 'none') as 'none' | 'single' | 'double', strikeThrough: style?.strikeThrough ?? false, script: (style?.script ?? 'none') as 'none' | 'superscript' | 'subscript', normalFont: false, color: currentColor ?? fallbackColor, colorProperty }
    setGridFormatDialogOffset({ x: 0, y: 0 }); setContextMenu(null); setGridSubmenu(null); setGridFormatDialog(next); setColorPreviewDraft(buildGridFormatDraft(next))
  }
  const openTextFormatDialog = (scope: 'field' | 'label' | 'action', label: string, actionPart: DesignerActionTextPart | 'button' = 'button', selectionOverride?: string[]) => {
    const base = historyRef.current.present
    const targetIds = scope === 'action' ? actionSelection : [...new Set((selectionOverride ?? (applyToAll ? activeFieldIds : selection)).map(id => scope === 'label' ? (id.endsWith('::label') ? id : `${id.split('::')[0]}::label`) : `${id.split('::')[0]}::input`))]
    if (!targetIds.length) return
    const id = targetIds[0]
    const style = scope === 'action'
      ? { ...base.actions?.[id], ...(actionPart !== 'button' ? base.actions?.[id]?.textStyles?.[actionPart] : {}) }
      : designerEffectiveValues(base, id.split('::')[0], scope === 'label' ? 'label' : 'input')
    const next = { scope, id, targetIds, actionPart, label, mode: 'font' as const, base, fontFamily: String(style?.fontFamily ?? 'inherit'), fontSize: Number(style?.fontSize ?? 13), bold: Boolean(style?.bold), italic: Boolean(style?.italic), underline: (style?.underline ?? 'none') as 'none' | 'single' | 'double', strikeThrough: Boolean(style?.strikeThrough), script: (style?.script ?? 'none') as 'none' | 'superscript' | 'subscript', normalFont: false, color: String(style?.textColor ?? '#263a38'), textAlign: (style?.textAlign ?? 'start') as 'start' | 'center' | 'end' | 'left' | 'right', colorProperty: 'textColor' as const }
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
    if (!managedSidebarCollapsed) setManagedSettingsTab('design')
  }
  const requestToolbarProperty=(tableId:string,part:GridToolbarPart,property:string)=>{
    setContextMenu(null);setGridSubmenu(null);if(toolbarSelection?.tableId===tableId&&toolbarSelection.parts.includes(part))setToolbarSelectionRequest(current=>current+1);else selectToolbar(tableId,part)
    setManagedSidebarCollapsed(false);setManagedSettingsTab('design')
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
  const selectGridDesignerColumn = (columnId: string, toggle: boolean) => {
    setToolbarSelection(null);setSelection([]);setActionSelection([])
    setSelectedTableColumnIds(current => toggle ? current.includes(columnId) ? current.filter(id => id !== columnId) : [...current, columnId] : [columnId])
    if (!managedSidebarCollapsed) {
      setManagedSettingsTab('design')
      setPropertyRequest(current=>({sequence:(current?.sequence??0)+1,section:'tableHeaderTypography'}))
    }
  }
  const openGridDesignerContextMenu = (target: 'header' | 'row' | 'search', columnId: string | undefined, left: number, top: number, additive = false) => { if (!designerOpen) return; setFieldAlignmentPopup(null); setToolbarSelection(null); setSelection([]); setActionSelection([]); if (columnId) setSelectedTableColumnIds(current => current.includes(columnId) ? current : additive ? [...current, columnId] : [columnId]); else setSelectedTableColumnIds([]); setGridSubmenu(null); setContextMenu({ left, top, part: 'grid', gridTarget: target, columnId }) }
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
    if (treeEntryActive) return action.id !== 'demo-save' && action.id !== 'reset-sample'
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
    if (operationalPreviewRef.current) return
    const action = laboratoryDefinition.actions?.find(item => item.id === id)
    const keyboardCancel = dataEntryActive && id === 'reset-sample'
    if (designerOpen || !action || !designerActionVisible(history.present, action) || (!keyboardCancel && actionDisabled(action))) return
    if (id === 'reset-sample' && treeEntryActive) { formFrameRef.current?.querySelector<HTMLFormElement>('.cascading-tree-inline-add')?.reset(); return }
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
      if (startTreeCreate()) return
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
      const treeEntry = formFrameRef.current?.querySelector<HTMLFormElement>('.cascading-tree-inline-add')
      if (treeEntry) { treeEntry.requestSubmit(); return }
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
  const openFormSettings = () => {
    if(activeManagedForm){setManagedSidebarCollapsed(false);setManagedSettingsTab('settings');if(!designerOpen)openDesigner();return}
    openDesigner()
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
  const saveDraft = async () => {
    if (activeManagedForm) { finishPropertyChange(); setManagedSaveDialogOpen(true); return }
    const current=historyRef.current, schema=documentSchema, frame=activePreviewFrame
    if(!await backupDocumentToServer(laboratoryDefinition.id,{schema,designerHistory:current,frame},'ذخیرهٔ قالب آزمایشگاه'))return
    if(historyRef.current!==current){setSaveStatus(fa?'قالب هنگام پشتیبان‌گیری تغییر کرد؛ دوباره ذخیره کنید.':'The design changed during backup; save again.');return}
    let saved = false
    try { localStorage.setItem(motherRecoveryKey,JSON.stringify(schema)); saved = saveSessionDraft() }
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
    if(layoutRegisteredTargets('align',direction==='top'||direction==='bottom'||direction==='verticalCenter'?'horizontal':'vertical',8,{alignment:direction}))return
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
    updateDraftState(withCanvas(history.present, result.canvas, editorSectionId, false))
    setLayoutStatus('')
  }
  const measuredGeometryFor = (ids: readonly string[]) => measureDesignerGeometry(formGridRef.current, ids)
  const layoutRegisteredTargets = (operation: DesignerLayoutOperation, orientation: DesignerLayoutOrientation, gap: number, options?: { width?: number; height?: number; verticalGap?: number; alignment?: DesignerAlignment }, center = false, normalizeSize = false) => {
    const ids = selectedDesignerInputs(selection, activeFieldIds)
    const measured = measuredGeometryFor(ids)
    if (!measured) return false
    if (ids.length < 2 && !center) { setLayoutStatus(fa ? 'حداقل دو عنصر را انتخاب کنید.' : 'Select at least two elements.'); return true }
    const allPeersSelected = Object.keys(measured.canvas.fields).every(id => ids.includes(id))
    const result = options?.alignment
      ? alignCanvasFields(measured.canvas, ids, ids.includes(referenceId) ? referenceId : ids[0], options.alignment, [], 0)
      : normalizeSize ? levelDesignerInputRow(measured.canvas, ids, fa, allPeersSelected ? formGridRef.current?.closest<HTMLElement>('.laboratory-editor')?.clientWidth : undefined)
      : center ? { canvas: centerCanvasRows(measured.canvas, ids, formGridRef.current?.clientWidth) }
      : layoutDesignerCanvasSelection(measured.canvas, ids, { operation, orientation, gap, rtl: fa, referenceId, ...options })
    if (result.blockedBy) { setLayoutStatus(blockedMessage(result.blockedBy)); return true }
    updateDraftState(commitMeasuredDesignerGeometry(historyRef.current.present, measured, result.canvas, ids, activeFieldIds))
    setLayoutStatus(''); return true
  }
  const applyLayout = (operation: DesignerLayoutOperation, orientation: DesignerLayoutOrientation, gap: number, options?: { width?: number; height?: number; verticalGap?: number }) => {
    if(operation!=='align'&&layoutRegisteredTargets(operation,orientation,gap,options))return
    const canvas = currentLayoutCanvas()
    if (!canvas) { setLayoutStatus(fa ? 'چیدمان در نمای دسکتاپ و پس از انتخاب پنل ورودی فعال است.' : 'Select an input panel in desktop view.'); return }
    if (operation === 'align') { applyAlignment(orientation === 'horizontal' ? 'top' : fa ? 'right' : 'left'); return }
    const ids = selectedDesignerInputs(selection, geometryFieldIds)
    if (ids.length < 2) { setLayoutStatus(fa ? 'حداقل دو فیلد ورودی را انتخاب کنید.' : 'Select at least two input fields.'); return }
    if ((options?.width !== undefined && (!Number.isFinite(options.width) || options.width < 48 || options.width > 1000)) || (options?.height !== undefined && (!Number.isFinite(options.height) || options.height < 24 || options.height > 600))) { setLayoutStatus(fa ? 'عرض معیار باید ۴۸ تا ۱۰۰۰ و ارتفاع معیار ۲۴ تا ۶۰۰ پیکسل باشد.' : 'Target width must be 48–1000px and height 24–600px.'); return }
    const result = layoutDesignerCanvasSelection(canvas, ids, { operation, orientation, gap, rtl: fa, referenceId, ...options, wrapWidth: Math.min(canvas.width, activePreviewFrame.width) })
    if (result.blockedBy) { setLayoutStatus(blockedMessage(result.blockedBy)); return }
    updateDraftState(withCanvas(historyRef.current.present, result.canvas, editorSectionId, false)); setLayoutStatus('')
  }

  const updateDirectProperty = (targetId: string, property: DesignerProperty, value: DesignerValue) => {
    dispatchHistory({ type: 'change', draft: setDesignerProperty(history.present, [targetId], property, value, activeFieldIds) })
    setSaveStatus('')
  }
  const updateSelectedInputAlignment = (property: 'textAlign' | 'verticalTextAlign', value: 'left' | 'center' | 'right' | 'top' | 'bottom') => {
    const fieldId = fieldAlignmentPopup?.fieldId ?? contextMenu?.fieldId
    if (!fieldId) return
    const selectedIds = [...new Set(selection.filter(key => !key.endsWith('::label')).map(key => key.split('::')[0]).filter(id => activeFieldIds.includes(id)))]
    const fieldIds = selectedIds.includes(fieldId) ? selectedIds : [fieldId]
    let next = historyRef.current.present
    for (const id of fieldIds) next = setDesignerProperty(next, [`${id}::input`], property, value, activeFieldIds)
    dispatchHistory({ type: 'change', draft: next })
    setSaveStatus('')
  }
  const openFieldAlignment = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!contextMenu?.fieldId) return
    const anchor = event.currentTarget.getBoundingClientRect()
    setAlignmentPopupOffset({ x: 0, y: 0 })
    setFieldAlignmentPopup({ fieldId: contextMenu.fieldId, anchorLeft: anchor.left, anchorRight: anchor.right, anchorTop: anchor.top })
    setContextMenu(null)
    setGridSubmenu(null)
  }
  const beginAlignmentPopupDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const popup = event.currentTarget.closest<HTMLElement>('.designer-context-menu')
    if (!popup) return
    const rect = popup.getBoundingClientRect()
    alignmentPopupDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseLeft: rect.left - alignmentPopupOffset.x, baseTop: rect.top - alignmentPopupOffset.y, width: rect.width, height: rect.height, originX: alignmentPopupOffset.x, originY: alignmentPopupOffset.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveAlignmentPopupDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = alignmentPopupDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = drag.originX + event.clientX - drag.startX
    const y = drag.originY + event.clientY - drag.startY
    setAlignmentPopupOffset({
      x: Math.max(8, Math.min(window.innerWidth - drag.width - 8, drag.baseLeft + x)) - drag.baseLeft,
      y: Math.max(8, Math.min(window.innerHeight - drag.height - 8, drag.baseTop + y)) - drag.baseTop,
    })
  }
  const endAlignmentPopupDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (alignmentPopupDrag.current?.pointerId !== event.pointerId) return
    alignmentPopupDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const renderFieldTextAlignment = () => {
    const fieldId = fieldAlignmentPopup?.fieldId ?? contextMenu?.fieldId
    if (!fieldId) return null
    const horizontal = (fa ? ['right', 'center', 'left'] as const : ['left', 'center', 'right'] as const).map(value => {
      const effective = designerEffectiveValues(history.present, fieldId, 'input').textAlign
      const selected = effective === value || ((effective === undefined || effective === 'start') && (fa ? value === 'right' : value === 'left'))
      const label = fa ? ({ left: 'چپ‌چین', center: 'وسط‌چین', right: 'راست‌چین' } as const)[value] : ({ left: 'Align left', center: 'Align center', right: 'Align right' } as const)[value]
      const lines = value === 'left' ? [[2,20],[2,15],[2,11],[2,6]] : value === 'right' ? [[22,20],[22,15],[22,11],[22,6]] : [[12,20],[12,15],[12,11],[12,6]]
      const widths = [16,11,19,14]
      return <button key={value} type="button" aria-label={label} title={label} aria-pressed={selected} onClick={() => updateSelectedInputAlignment('textAlign', value)}><svg viewBox="0 0 24 20" aria-hidden="true">{lines.map(([x,y],index) => { const width=widths[index]; return <line key={index} x1={value==='left'?x:value==='right'?x-width:x-width/2} x2={value==='left'?x+width:value==='right'?x:x+width/2} y1={y} y2={y}/> })}</svg></button>
    })
    const vertical = (['top', 'center', 'bottom'] as const).map(value => {
      const effective = designerEffectiveValues(history.present, fieldId, 'input').verticalTextAlign
      const selected = effective === value || (effective === undefined && value === 'center')
      const label = fa ? ({ top: 'بالاچین', center: 'وسط‌چین عمودی', bottom: 'پایین‌چین' } as const)[value] : ({ top: 'Align top', center: 'Align middle', bottom: 'Align bottom' } as const)[value]
      return <button key={value} type="button" aria-label={label} title={label} aria-pressed={selected} onClick={() => updateSelectedInputAlignment('verticalTextAlign', value)}><svg viewBox="0 0 24 20" aria-hidden="true">{(value==='top'?[2,6,10]:value==='bottom'?[8,12,16]:[5,9,13]).map((y,index)=>{const width=[14,18,11][index];return <line key={index} x1={(24-width)/2} x2={(24+width)/2} y1={y} y2={y}/>})}</svg></button>
    })
    return <div className="designer-context-alignment" role="toolbar" aria-label={fa ? 'تراز متن داخل فیلد' : 'Text alignment inside field'}><div className="designer-context-alignment-row" role="group" aria-label={fa ? 'تراز افقی' : 'Horizontal alignment'}>{horizontal}</div><div className="designer-context-alignment-row" role="group" aria-label={fa ? 'تراز عمودی' : 'Vertical alignment'}>{vertical}</div></div>
  }
  const captureCurrentEditorCanvas = (grid:HTMLDivElement|null=formGridRef.current): DesignerCanvas | undefined => {
    if (!grid) return undefined
    const origin = grid.getBoundingClientRect()
    const editor=grid.closest<HTMLElement>('.laboratory-editor'),editorBottom=editor?.getBoundingClientRect().bottom
    const availableHeight=editorBottom===undefined?origin.height:Math.max(origin.height,editorBottom-origin.top)
    const viewShift = Number(grid.dataset.canvasViewShift ?? 0)
    const storedWidthValue = Number(grid.dataset.canvasStoredWidth)
    const storedWidth = Number.isFinite(storedWidthValue) && storedWidthValue > 0 ? storedWidthValue : origin.width
    const rect = (element: Element): DesignerRect => { const r = element.getBoundingClientRect(); return { left: r.left - origin.left - viewShift, top: r.top - origin.top, width: r.width, height: r.height } }
    const fields: DesignerCanvas['fields'] = {}
    for (const element of grid.querySelectorAll<HTMLElement>('[data-field-id]')) {
      if (element.dataset.fieldId?.includes('.tree.')) continue
      const input = element.querySelector('.designer-input-part'), label = element.querySelector('.designer-label-part')
      if (!input || !label) continue
      const select = element.querySelector('.laboratory-field-select'), error = element.querySelector('.field-error')
      fields[element.dataset.fieldId!] = { input: rect(input), label: rect(label), ...(select && select.getClientRects().length ? { select: rect(select) } : {}), ...(error && error.getClientRects().length ? { error: rect(error) } : {}) }
    }
    const captured = { width: storedWidth, height: Math.max(availableHeight, ...Object.values(fields).flatMap(field => Object.values(field).map(part => part.top + part.height))), fields }
    return captured
  }
  const manualCanvasBounds=(source:DesignerCanvas,grid:HTMLDivElement|null=formGridRef.current)=>{
    let shift=Number(grid?.dataset.canvasViewShift??0)
    // The visible Canvas may have cropped an old leading empty area. Its CSS
    // centering shift alone is then not the origin of the stored rectangles.
    // Measure the complete render-only translation without changing the draft.
    if(grid){
      for(const node of grid.querySelectorAll<HTMLElement>('[data-field-id]')){
        const saved=source.fields[node.dataset.fieldId??'']?.input,input=node.querySelector<HTMLElement>('.designer-input-part')
        if(saved&&input?.getClientRects().length){shift=input.getBoundingClientRect().left-grid.getBoundingClientRect().left-saved.left;break}
      }
    }
    return designerCanvasInteractionBounds(source,grid?.clientWidth??source.width,shift)
  }
  const expandCanvasToEditorViewport = (source:DesignerCanvas,grid:HTMLDivElement|null,keepCenteredRowsStable=false):DesignerCanvas => {
    if(!grid)return source
    const editor=grid.closest<HTMLElement>('.laboratory-editor')
    if(!editor)return source
    const bounds=editor.getBoundingClientRect(),gridBounds=grid.getBoundingClientRect(),style=getComputedStyle(editor)
    const availableHeight=Math.max(0,bounds.bottom-gridBounds.top-parseFloat(style.paddingBottom||'0'))
    // Canvas coordinates are measured from the grid's border-box origin. Use
    // the same visible edge as the width when aligning; the editor content box
    // can be a few pixels wider because of borders and the reserved scrollbar
    // gutter, which otherwise leaves the requested half-centimeter inset short.
    const availableWidth=Math.max(0,gridBounds.width)
    // Growing a centered Canvas would change its CSS center offset and visibly
    // move every centered row before the gesture applies its selected delta.
    // Keep that width stable during field gestures; uncentered geometry can grow
    // bounds without changing any field coordinates.
    const width=keepCenteredRowsStable&&source.centeredFieldIds?.length?source.width:availableWidth
    return expandDesignerCanvasBounds(source,width,availableHeight)
  }
  // Capture the responsive grid once; commands can also capture synchronously.
  useLayoutEffect(() => {
    if (!designerOpen || !geometryEditable || storedEditorCanvas || frozenCanvas || !formGridRef.current) return
    const captured = captureCurrentEditorCanvas()
    if (!captured) return
    const aligned = autoAlignDesignerCanvas(captured, {
      rtl: fa,
      textareaFieldIds: geometryTextareaFieldIds,
      checkboxFieldIds: geometryCheckboxFieldIds
    })
    // Let the browser finish the responsive grid's first layout before freezing it.
    const frame = window.requestAnimationFrame(() => {
      setFrozenCanvas(current => current ?? aligned)
      if (aligned !== captured) updateDraftState(withCanvas(historyRef.current.present, aligned))
    })
    if (existingCanvasCollisions(captured).length) setLayoutStatus(fa ? 'طرح فعلی هم‌پوشانی دارد؛ موقعیت عناصر موجود حفظ شده است.' : 'Existing overlaps were preserved.')
    return () => window.cancelAnimationFrame(frame)
  }, [designerOpen, geometryEditable, storedEditorCanvas, editorSectionId, documentSchema.id, frozenCanvas, geometryFieldIds.join('|'), geometryTextareaFieldIds.join('|'), geometryCheckboxFieldIds.join('|'), fa])
  useEffect(() => {
    const ids = selectedDesignerInputs(selection, geometryFieldIds)
    if (!ids.includes(referenceId)) setReferenceId(ids[0] ?? '')
  }, [selection, referenceId])
  useEffect(() => {
    if (!designerOpen) gestureCleanup.current?.()
    return () => gestureCleanup.current?.()
  }, [designerOpen])
  const withCanvas = (draft: DesignerDraft, nextCanvas: DesignerCanvas, sectionId=editorSectionId, recenterRows=true): DesignerDraft => {
    if(recenterRows&&nextCanvas.centeredFieldIds?.length)nextCanvas=centerCanvasRows(nextCanvas)
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
    if(layoutRegisteredTargets('align','horizontal',8,undefined,true))return
    const current=currentLayoutCanvas();if(!current)return
    const grid=formGridRef.current,editor=grid?.parentElement
    const style=editor?getComputedStyle(editor):undefined
    const available=editor?editor.clientWidth-parseFloat(style!.paddingLeft)-parseFloat(style!.paddingRight):current.width
    const selected=selectedDesignerInputs(selection,geometryFieldIds)
    const ids=all?Object.keys(current.fields):selected.length?selected:contextMenu?.fieldId?[contextMenu.fieldId]:[]
    if(!ids.length)return
    const next=centerCanvasRows(current,ids,Math.max(320,available))
    const projectionSection=editorGeometryScoped?editorSectionId:undefined
    const projectionDefinition=projectionSection?documentSchema.sections.find(section=>section.id===projectionSection):undefined
    const projectionSchema=projectionDefinition?sectionFormSchema(documentSchema,projectionDefinition):documentSchema
    canvasViewProjection.current.delete(canvasProjectionKey(projectionSchema,projectionSection))
    updateDraftState(withCanvas(historyRef.current.present,next));setContextMenu(null);setGridSubmenu(null)
  }
  const changeNeighborResize = (axis:'horizontal'|'vertical',value:boolean|undefined) => {finishPropertyChange();const start=historyRef.current.present,neighborResize={...start.neighborResize};if(value===undefined)delete neighborResize[axis];else neighborResize[axis]=value;updateDraftState({...start,neighborResize})}
  const finishGesture = () => { gestureCleanup.current = null; dispatchHistory({ type: 'commitTransaction' }) }
  // A pointer gesture is an explicit edit. Do not run the layout engine at
  // commit time: it can move unselected peers or snap the edited field back.
  const finishCanvasGesture = () => finishGesture()
  const beginActionResize = (event: React.PointerEvent<HTMLElement>, actionId: string, edge: 'left' | 'right' | 'top' | 'bottom') => {
    if (!designerOpen || event.button !== 0) return
    const footer = event.currentTarget.closest<HTMLElement>('.laboratory-footer')
    const selectedIds = actionSelection.includes(actionId) ? actionSelection : [actionId]
    const wrappers = [...footer?.querySelectorAll<HTMLElement>('[data-action-id]') ?? []]
    const starts = selectedIds.flatMap(id => {
      const button = wrappers.find(wrapper => wrapper.dataset.actionId === id)?.querySelector<HTMLButtonElement>('button:not(.designer-edge-handle)')
      if (!button) return []
      const rect = button.getBoundingClientRect()
      return [{ id, size: edge === 'left' || edge === 'right' ? rect.width : rect.height, node:button.parentElement! }]
    })
    if (!starts.length) return
    gestureCleanup.current?.()
    const horizontal = edge === 'left' || edge === 'right', startDraft = historyRef.current.present
    const visual=createDesignerStylePreview(formFrameRef.current!,starts.map(item=>item.node))
    let final=startDraft
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerVisualPointer(event, (dx, dy) => {
      const next = resizeDesignerActions(startDraft, starts, horizontal ? 'width' : 'height', edge, horizontal ? dx : dy)
      final=next
      for(const item of starts)item.node.style.setProperty(horizontal?'--lab-width':'--lab-height',String(next.actions?.[item.id]?.[horizontal?'width':'height']??item.size)+'px')
    },visual.restore,()=>flushSync(()=>dispatchHistory({type:'change',draft:final})),finishGesture)
    setSaveStatus('')
  }
  const beginActionBarResize = (event: React.PointerEvent<HTMLElement>) => {
    if (!designerOpen || !geometryEditable || !actionBarSelected || event.button !== 0) return
    const footer = event.currentTarget.closest<HTMLElement>('.laboratory-footer')
    if (!footer) return
    event.preventDefault()
    event.stopPropagation()
    const original = historyRef.current.present
    const startHeight = original.actionBarHeight ?? footer.getBoundingClientRect().height
    const visual=createDesignerStylePreview(formFrameRef.current!,[footer])
    let final=original
    gestureCleanup.current?.()
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerVisualPointer(event, (_dx, dy) => {
      // The footer is anchored at the form bottom: lowering its top edge gives
      // the report more room while keeping the shortcut bar's bottom in place.
      const nextHeight = Math.max(48, Math.min(220, startHeight - dy))
      final=setDesignerActionBarHeight(original,nextHeight);footer.style.setProperty('--lab-action-bar-height',nextHeight+'px')
    },visual.restore,()=>flushSync(()=>dispatchHistory({type:'change',draft:final})),finishGesture)
    setSaveStatus('')
  }
  const beginActionBarMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!designerOpen || !geometryEditable || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-action-id],.designer-edge-handle,button,input,select,textarea,a,[contenteditable="true"]')) return
    const footer = event.currentTarget.closest<HTMLElement>('.laboratory-footer')
    if (!footer) return
    event.preventDefault(); event.stopPropagation()
    setActionBarSelected(true); setSelection([]); setActionSelection([]); setSelectedTableColumnIds([])
    const original = historyRef.current.present
    const startOffset = original.actionBarOffsetY ?? 0
    const nodes=[footer.closest<HTMLElement>('.laboratory-footer-stack')!,...formFrameRef.current?.querySelectorAll<HTMLElement>('.base-form-shell')??[]]
    const visual=createDesignerStylePreview(formFrameRef.current!,nodes)
    let final=original
    gestureCleanup.current?.()
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerVisualPointer(event, (_dx, dy) => {
      const nextOffset = Math.max(-600, Math.min(600, startOffset + dy))
      final=setDesignerActionBarOffsetY(original,nextOffset);for(const node of nodes)node.style.setProperty('--lab-action-bar-offset-y',nextOffset+'px')
    },visual.restore,()=>flushSync(()=>dispatchHistory({type:'change',draft:final})),finishGesture)
    setSaveStatus('')
  }
  const registeredGeometryCanvas = (start: DesignerDraft, measured: MeasuredDesignerGeometry, ids: string[], dx: number, dy: number, edge?: DesignerResizeHandle) => {
    // A manual gesture edits its selection only. Stationary peers participate in
    // explicit alignment commands, not in an implicit rearrangement on release.
    const fields = Object.fromEntries(ids.map(id => [id, measured.canvas.fields[id]]))
    const preserve = neighborResizeFor(start)
    const joinsNeighbor = edge && ((preserve.horizontal && (edge.includes('left') || edge.includes('right'))) || (preserve.vertical && (edge.includes('top') || edge.includes('bottom'))))
    const canvas = joinsNeighbor ? measured.canvas : { ...measured.canvas, fields }
    const verticalOnly = ids.every(id => measured.policies[id]?.resize === 'vertical')
    const proposed = edge
      ? resizeCanvasHandle(canvas, ids, edge, verticalOnly ? 0 : dx, dy, preserve)
      : moveCanvasFields(canvas, ids, dx, dy)
    const next={...proposed,fields:Object.fromEntries(Object.entries(proposed.fields).map(([id,field])=>{const before=measured.canvas.fields[id]?.input,policy=measured.policies[id];return [id,!before?field:{...field,input:{...field.input,...(policy?.move==='none'?{left:before.left,top:before.top}:policy?.move==='vertical'?{left:before.left}:{}),...(policy?.resize==='vertical'?{width:before.width}:{})}}]}))}
    const changedIds = joinsNeighbor ? Object.keys(next.fields).filter(id => next.fields[id] !== canvas.fields[id]) : ids
    return {next,changedIds}
  }
  const changeRegisteredGeometry = (start: DesignerDraft, measured: MeasuredDesignerGeometry, ids: string[], dx: number, dy: number, edge?: DesignerResizeHandle) => {
    const {next,changedIds}=registeredGeometryCanvas(start,measured,ids,dx,dy,edge)
    return commitMeasuredDesignerGeometry(start, measured, next, changedIds, activeFieldIds)
  }
  const beginRegisteredGeometry = (event: React.PointerEvent<HTMLElement>, id: string, edge?: DesignerResizeHandle) => {
    const selected = selectedDesignerInputs(selection, activeFieldIds)
    const targets = selected.includes(id) ? selected : [id]
    const measured = measuredGeometryFor(targets)
    if (!measured) return false
    if (!edge && targets.every(target => measured.policies[target]?.move === 'none')) return true
    event.preventDefault(); event.stopPropagation(); gestureCleanup.current?.()
    const input = event.currentTarget.closest('[data-field-id]')?.querySelector<HTMLElement>(':scope > div > .designer-input-part')
    input?.focus({ preventScroll: true })
    const start = historyRef.current.present
    // Recovery must also wait while the pointer is held before its first paint.
    const frame = formFrameRef.current!
    frame.dataset.designerGesture = 'true'
    let visual: ReturnType<typeof createDesignerGeometryPreview> | undefined
    let final=measured.canvas,changedIds=targets,didMove=false
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerVisualPointer(event, (dx, dy) => {
      if (!didMove && Math.hypot(dx, dy) < 1) return
      didMove=true
      visual ??= createDesignerGeometryPreview(frame,measured.canvas,measured.slots)
      const result=registeredGeometryCanvas(start,measured,targets,dx/measured.scaleX,dy/measured.scaleY,edge)
      final=result.next;changedIds=result.changedIds;visual.paint(final)
    },()=>{visual?.restore();delete frame.dataset.designerGesture},()=>{if(didMove)flushSync(()=>dispatchHistory({type:'change',draft:commitMeasuredDesignerGeometry(start,measured,final,changedIds,activeFieldIds)}))},()=>finishGesture())
    return true
  }
  const nudgeDesignerSelection = (key: string, shift: boolean, target?: HTMLElement) => {
    const ids = selectedDesignerInputs(selection, activeFieldIds)
    if (!ids.length) return false
    const step = shift ? 10 : 1, dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    const measured = measuredGeometryFor(ids)
    if (measured) { updateDraftState(changeRegisteredGeometry(historyRef.current.present, measured, ids, dx, dy)); return true }
    let current = currentLayoutCanvas()
    if (ids.some(id => !current?.fields[id])) current = captureCurrentEditorCanvas(target?.closest<HTMLDivElement>('.laboratory-form-grid')) ?? current
    if (!current || ids.some(id => !current?.fields[id])) return false
    const moved = moveCanvasFields(current, ids, dx, dy,manualCanvasBounds(current,target?.closest<HTMLDivElement>('.laboratory-form-grid')??formGridRef.current))
    updateDraftState(withCanvas(historyRef.current.present, moved, editorSectionId, false)); setFrozenCanvas(moved)
    return true
  }
  const beginInputResize = (event: React.PointerEvent<HTMLElement>, fieldId: string, edge: DesignerResizeHandle) => {
    if (!designerOpen || componentTestMode || event.button !== 0) return
    if (beginRegisteredGeometry(event, fieldId, edge)) return
    gestureCleanup.current?.()
    const ids = selectedDesignerInputs(selection, geometryFieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    event.currentTarget.focus({ preventScroll: true })
    const startDraft=historyRef.current.present,sourceSection=documentSchema.fields.find(field=>field.id===fieldId)?.sectionId
    const grid=event.currentTarget.closest<HTMLDivElement>('.laboratory-form-grid')
    const candidateCanvas=designerDraftForEditor(startDraft,documentSchema,editorGeometryScoped?sourceSection:undefined).canvas??(sourceSection===editorSectionId&&canvas?.fields[fieldId]?canvas:null)??captureCurrentEditorCanvas(grid)
    const initialCanvas=candidateCanvas
    const interactionBounds=initialCanvas?manualCanvasBounds(initialCanvas,grid):undefined
    if(!initialCanvas?.fields[fieldId])return
    const visual=createDesignerGeometryPreview(formFrameRef.current!,initialCanvas)
    let final=initialCanvas
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerVisualPointer(event, (dx, dy) => {
      const resized = resizeCanvasHandle(initialCanvas, targets, edge, dx, dy,neighborResizeFor(startDraft),interactionBounds)
      final=resized;visual.paint(resized)
    },visual.restore,()=>{
      const snapped=snapResizedCanvasInputsToPeers(final,targets,edge,neighborResizeFor(startDraft),interactionBounds)
      flushSync(()=>dispatchHistory({type:'change',draft:withCanvas(startDraft,snapped,sourceSection,false)}))
    },()=>finishGesture())
  }
  const resizeInputByKey = (fieldId: string, handle: DesignerResizeHandle, key: string, shift: boolean, element: HTMLElement) => {
    const start = historyRef.current.present
    const selected = selectedDesignerInputs(selection, activeFieldIds), targetsForResize = selected.includes(fieldId) ? selected : [fieldId]
    const measured = measuredGeometryFor(targetsForResize)
    if (measured) {
      const step = shift ? 10 : 1
      updateDraftState(changeRegisteredGeometry(start, measured, targetsForResize, key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0, handle)); return
    }
    const sourceSection=documentSchema.fields.find(field=>field.id===fieldId)?.sectionId
    const grid=element.closest<HTMLDivElement>('.laboratory-form-grid')
    const stored=designerDraftForEditor(start,documentSchema,editorGeometryScoped?sourceSection:undefined).canvas??frozenCanvas
    const candidate=stored?.fields[fieldId]?stored:captureCurrentEditorCanvas(grid)
    const currentCanvas=candidate
    if (!currentCanvas) return
    const ids = selectedDesignerInputs(selection, geometryFieldIds), targets = ids.includes(fieldId) ? ids : [fieldId]
    const step = shift ? 10 : 1
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    const resized = resizeCanvasHandle(currentCanvas, targets, handle, dx, dy,neighborResizeFor(start),manualCanvasBounds(currentCanvas,grid))
    if (resized !== currentCanvas) updateDraftState(withCanvas(start, resized, sourceSection, false))
  }
  const handleInputResizeKey = (event: React.KeyboardEvent<HTMLElement>, fieldId: string, handle: DesignerResizeHandle) => {
    if (!designerOpen || !geometryEditable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault(); event.stopPropagation()
    resizeInputByKey(fieldId,handle,event.key,event.shiftKey,event.currentTarget)
  }
  const clearDesignerSelection = () => {setSelection([]);setActionSelection([]);setActionBarSelected(false);setToolbarSelection(null);setSelectedTableColumnIds([]);setManagedSelectedFieldId(null);setApplyToAll(false)}
  const beginFieldMove = (event: React.PointerEvent<HTMLElement>, targetId: string, part: 'label' | 'input', onTap?:()=>void) => {
    if (!designerOpen || componentTestMode || event.button !== 0) return
    if (beginRegisteredGeometry(event, targetId.split('::')[0])) return
    gestureCleanup.current?.()
    const fieldId = targetId.split('::')[0], ids = selectedDesignerInputs(selection, geometryFieldIds)
    const targets = part === 'input' && ids.includes(fieldId) ? ids : [fieldId]
    const startDraft=historyRef.current.present,sourceSection=documentSchema.fields.find(field=>field.id===fieldId)?.sectionId
    const grid=event.currentTarget.closest<HTMLDivElement>('.laboratory-form-grid')
    const candidateCanvas=designerDraftForEditor(startDraft,documentSchema,editorGeometryScoped?sourceSection:undefined).canvas??(sourceSection===editorSectionId&&canvas?.fields[fieldId]?canvas:null)??captureCurrentEditorCanvas(grid)
    // A drag changes only the selected geometry. Expanding to the editor
    // viewport here made the canvas width change during a gesture, which
    // altered scrolling and the apparent placement of centered fields.
    const initialCanvas=candidateCanvas
    const interactionBounds=initialCanvas?manualCanvasBounds(initialCanvas,grid):undefined
    if(!initialCanvas?.fields[fieldId])return
    const visual=createDesignerGeometryPreview(formFrameRef.current!,initialCanvas)
    let final=initialCanvas
    let didMove=false
    dispatchHistory({ type: 'beginTransaction' })
    gestureCleanup.current = captureDesignerVisualPointer(event, (dx, dy) => {
      if(!didMove&&Math.hypot(dx,dy)<1)return
      didMove=true
      let moved = moveCanvasFields(initialCanvas, targets, dx, dy,interactionBounds)
      if (part === 'label') {
        const field = initialCanvas.fields[fieldId], label = field.label
        moved = { ...initialCanvas, fields: { ...initialCanvas.fields, [fieldId]: { ...field, label: { ...label, left: Math.max(0, Math.min(initialCanvas.width - label.width, label.left + dx)), top: Math.max(0, Math.min(initialCanvas.height - label.height, label.top + dy)) } } } }
      }
      final=moved;visual.paint(moved)
    },visual.restore,()=>{if(didMove)flushSync(()=>dispatchHistory({type:'change',draft:withCanvas(startDraft,final,sourceSection,false)}))}, ended=>{
      finishGesture()
      if(!didMove&&ended?.type==='pointerup')onTap?.()
    })
  }
  const rectStyle = designerRectStyle
  const partStyle = (id: string, part: 'input' | 'label'): CSSProperties => ({ ...designerStyleForPart(visibleDraft, id, part), ...rectStyle(canvas?.fields[id]?.[part]) })
  const undo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } undoHistory() }
  const redo = () => { if (propertyCommitTimer.current !== null) { window.clearTimeout(propertyCommitTimer.current); propertyCommitTimer.current = null } redoHistory() }
  useEffect(() => {
    if (!activeManagedForm || !designerOpen) return
    const onDocumentHistoryKey = (event: globalThis.KeyboardEvent) => {
      if (operationalPreviewRef.current) return
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
  }, [activeManagedForm?.id, designerOpen, operationalPreviewRef.current])
  const selectAllGeometryFields = () => {
    setActionSelection([]); setToolbarSelection(null); setSelectedTableColumnIds([])
    setSelection(geometryFieldIds.map(id => `${id}::input`))
    const clearTextSelection = () => window.getSelection()?.removeAllRanges()
    clearTextSelection()
    requestAnimationFrame(() => {
      clearTextSelection()
      formGridRef.current?.querySelector<HTMLElement>('.designer-input-part')?.focus({ preventScroll: true })
    })
    setLayoutStatus(fa ? 'همهٔ فیلدهای بوم انتخاب شدند.' : 'All fields in the form canvas are selected.')
  }
  const applySmartGeometryLayout = (keyboardTarget?: HTMLElement) => {
    if(layoutRegisteredTargets('arrange','horizontal',8,undefined,false,true))return
    const selected = selectedDesignerInputs(selection, geometryFieldIds)
    const allSelected = geometryFieldIds.length > 0 && geometryFieldIds.every(id => selected.includes(id))
    const grid = keyboardTarget?.closest<HTMLDivElement>('.laboratory-form-grid') ?? formGridRef.current
    let current = currentLayoutCanvas()
    if (current && geometryFieldIds.some(id => !current?.fields[id])) {
      const captured = captureCurrentEditorCanvas(grid)
      if (captured) current = { ...captured, ...current, fields: { ...captured.fields, ...current.fields } }
    }
    if (!current) { setLayoutStatus(fa ? 'چیدمان هوشمند فقط در پنل فرمِ نمای دسکتاپ فعال است.' : 'Smart leveling is available in the desktop form panel.'); return }
    if (!allSelected) {
      if (selected.length < 2) { setLayoutStatus(fa ? 'حداقل دو فیلد ورودی را انتخاب کنید.' : 'Select at least two input fields.'); return }
      const result = levelDesignerInputRow(current, selected, fa)
      if (result.blockedBy) { setLayoutStatus(blockedMessage(result.blockedBy)); return }
      updateDraftState(withCanvas(historyRef.current.present, result.canvas, editorSectionId, false))
      setLayoutStatus(fa ? 'عرض، ارتفاع و فاصلهٔ فیلدهای انتخاب‌شده بر اساس میانگین یکسان شد.' : 'Selected widths, heights and gaps were averaged.')
      return
    }
    const editor=grid?.closest<HTMLElement>('.laboratory-editor')
    const editorStyle=editor?getComputedStyle(editor):undefined
    const availableWidth=editor&&editorStyle
      ? Math.max(320,editor.clientWidth-parseFloat(editorStyle.paddingLeft||'0')-parseFloat(editorStyle.paddingRight||'0'))
      : current.width
    // Reuse the current Canvas width when it fits; only cap stale oversized
    // bounds to the editor viewport. levelDesignerCanvas then grows minimally
    // if the normalized rows plus safe edge insets truly need more room.
    const layoutCanvas=capDesignerCanvasWidth(current,availableWidth)
    const leveled = levelDesignerCanvas(layoutCanvas, {
      rtl: fa, fieldIds: geometryFieldIds,
      textareaFieldIds: geometryTextareaFieldIds,
      checkboxFieldIds: geometryCheckboxFieldIds,
      activeFieldIds: geometryActiveFieldIds
    })
    canvasViewProjection.current.clear()
    // levelDesignerCanvas has already positioned complete and incomplete rows.
    // Re-running centerCanvasRows here would undo the RTL/LTR edge anchoring of
    // the final one- or two-field row and discard its intended visual hierarchy.
    updateDraftState(withCanvas(historyRef.current.present, leveled, editorSectionId, false))
    setFrozenCanvas(leveled)
    setLayoutStatus(fa ? 'اندازهٔ فیلدها و برچسب‌ها، فاصله‌ها و تراز ردیف‌ها تنظیم شد؛ ردیف‌های کامل وسط‌چین و ردیف ناقص از سمت خواندن چیده شد.' : 'Field and label sizes, spacing, and row alignment were normalized; complete rows are centered and a short row starts at the reading edge.')
  }
  const alignSelectedGeometryFieldsToSide = (edge: 'left' | 'right', keyboardTarget?: HTMLElement) => {
    const registeredIds = selectedDesignerInputs(selection, activeFieldIds)
    const measured = measuredGeometryFor(registeredIds)
    if (measured) {
      const aligned = alignDesignerCanvasFieldsToEdge(measured.canvas, registeredIds, edge)
      const blocked = validateCanvasArrangement(measured.canvas, aligned, registeredIds, [], 0, true)
      if (blocked) { setLayoutStatus(blockedMessage(blocked)); return }
      updateDraftState(commitMeasuredDesignerGeometry(historyRef.current.present, measured, aligned, registeredIds, activeFieldIds))
      setLayoutStatus(''); return
    }
    const selected = selectedDesignerInputs(selection, geometryFieldIds)
    if (!selected.length) return
    const grid = keyboardTarget?.closest<HTMLDivElement>('.laboratory-form-grid') ?? formGridRef.current
    let current = currentLayoutCanvas()
    if (current && geometryFieldIds.some(id => !current?.fields[id])) {
      const captured = captureCurrentEditorCanvas(grid)
      if (captured) current = { ...captured, ...current, fields: { ...captured.fields, ...current.fields } }
    }
    const expanded = current ? expandCanvasToEditorViewport(current, grid) : undefined
    if (!expanded) return
    const viewShift = Number(grid?.dataset.canvasViewShift ?? 0)
    const aligned = alignDesignerCanvasFieldsToEdge(expanded, selected, edge, undefined, grid?.getBoundingClientRect().width ?? expanded.width, viewShift)
    updateDraftState(withCanvas(historyRef.current.present, aligned, editorSectionId, false))
    setFrozenCanvas(aligned)
    setLayoutStatus(fa
      ? edge === 'left' ? 'فیلدهای انتخاب‌شده با فاصلهٔ نیم سانتی‌متر از لبهٔ چپ تراز شدند.' : 'فیلدهای انتخاب‌شده با فاصلهٔ نیم سانتی‌متر از لبهٔ راست تراز شدند.'
      : edge === 'left' ? 'Selected fields aligned half a centimeter from the left edge.' : 'Selected fields aligned half a centimeter from the right edge.')
  }
  const handleDesignerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (operationalPreviewRef.current) return
    if ((event.target as HTMLElement).closest('.cascading-tree-panels') && (formRuntimeTesting || !designerOpen || componentTestMode) && ['F3', 'Escape', ' '].includes(event.key)) return
    if(formRuntimeTesting){
      const target=event.target as HTMLElement
      if(target.closest('[role="dialog"],.person-number-list,.excel-color-picker'))return
      const copyAction=event.key==='F2'?'copyLast':event.key==='F4'?'copySelected':undefined
      if(runtime.mode==='view'&&copyAction&&documentSchema.actions?.some(action=>formTestActionFor(action)===copyAction&&!(('hidden'in action)&&action.hidden)&&designerActionVisible(visibleDraft,action))&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopPropagation();if(!event.repeat)runRuntimeAction(copyAction);return}
      const nativeControl = !!target.closest('input,textarea,select,button,a,[role="button"],[contenteditable]')
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
    if (designerOpen && geometryEditable && actionBarSelected && ['ArrowUp', 'ArrowDown'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !keyboardTarget.closest('input,textarea,select,[contenteditable],[role="dialog"],.managed-form-workspace-sidebar,.designer-edge-handle')) {
      event.preventDefault(); event.stopPropagation()
      const step = event.shiftKey ? 10 : 1
      updateActionBarOffsetY(Math.max(-600, Math.min(600, (historyRef.current.present.actionBarOffsetY ?? 0) + (event.key === 'ArrowDown' ? step : -step))))
      return
    }
    const designerFunctionKey = functionKeyFromEvent(event.nativeEvent)
    const designerDeleteTarget = !keyboardTarget.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],.excel-color-picker')
    const selectedSchemaFieldIds = [...new Set(selection.map(id => id.split('::')[0]).filter(id => documentSchema.fields.some(field => field.id === id)))]
    if (designerOpen && geometryEditable && !componentTestMode && event.key === 'Delete'
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && designerDeleteTarget
      && (actionSelection.length > 0 || activeManagedForm && selectedTableColumnIds.length > 0 || activeManagedForm && selectedSchemaFieldIds.length > 0)) {
      event.preventDefault(); event.stopPropagation()
      if (!event.repeat) {
        if (actionSelection.length) removeSelectedActions()
        else if (activeManagedForm && selectedTableColumnIds.length) removeSelectedTableColumns()
        else if (activeManagedForm && selectedSchemaFieldIds.length) removeManagedFieldsFromForm(selectedSchemaFieldIds)
        setContextMenu(null)
      }
      return
    }
    const keyboardGrid = keyboardTarget.closest<HTMLDivElement>('.laboratory-form-grid')
    const outsideDesignerCanvas = keyboardTarget.closest('.managed-form-workspace-sidebar, .laboratory-designer-pane, [role="dialog"], .excel-color-picker')
    const geometryInspectorInput = keyboardTarget instanceof HTMLInputElement && keyboardTarget.type === 'number' && keyboardTarget.closest('#form-laboratory-designer')
    const selectedBeforeShortcut = selectedDesignerInputs(selection, geometryFieldIds)
    const canvasShortcutContext = Boolean(keyboardGrid && !outsideDesignerCanvas)
    const layoutShortcutContext = canvasShortcutContext || Boolean(geometryInspectorInput && selectedBeforeShortcut.length)
    if ((event.ctrlKey || event.metaKey) && !event.altKey && isDesignerShortcutKey(event, 'a') && designerOpen && geometryEditable && !componentTestMode
      && canvasShortcutContext) {
      event.preventDefault(); event.stopPropagation()
      selectAllGeometryFields()
      return
    }
    if (event.ctrlKey && !event.metaKey && !event.altKey && isDesignerShortcutKey(event, 'l') && designerOpen && geometryEditable && !componentTestMode
      && layoutShortcutContext) {
      event.preventDefault(); event.stopPropagation()
      applySmartGeometryLayout(keyboardTarget)
      return
    }
    if (designerOpen && geometryEditable && !componentTestMode && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      && keyboardGrid && !outsideDesignerCanvas) {
      if (selectedBeforeShortcut.length) {
        event.preventDefault(); event.stopPropagation()
        alignSelectedGeometryFieldsToSide(event.key === 'ArrowLeft' ? 'left' : 'right', keyboardTarget)
        return
      }
    }
    if (designerFunctionKey === 'F1' && designerOpen && geometryEditable && !componentTestMode && !dataEntryActiveRef.current
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      && keyboardTarget.closest('.laboratory-form-grid')
      && !keyboardTarget.closest('.managed-form-workspace-sidebar, .laboratory-designer-pane, [role="dialog"], .excel-color-picker')) {
      const ids = selectedDesignerInputs(selection, geometryFieldIds)
      if (ids.length) {
        event.preventDefault(); event.stopPropagation()
        if (ids.length !== 1) {
          if (!event.repeat) setLayoutStatus(fa ? 'برای استثنا، فقط یک فیلد را انتخاب کنید.' : 'Select one field to set an alignment exception.')
        } else if (!event.repeat) {
          const current = currentLayoutCanvas()
          if (current) {
            const wasExcluded = new Set(current.alignmentExceptionFieldIds ?? [])
            const removingException = wasExcluded.has(ids[0])
            const toggled = toggleDesignerCanvasAlignmentException(current, [ids[0]])
            const aligned = autoAlignDesignerCanvas(toggled, { rtl: fa, fieldIds: ids })
            updateDraftState(withCanvas(historyRef.current.present, aligned, editorSectionId, false))
            setFrozenCanvas(aligned)
            setLayoutStatus(fa
              ? removingException ? 'استثنای چیدمان برداشته شد؛ فیلد دوباره هم‌تراز می‌شود.' : 'فیلد از هم‌ترازی خودکار مستثنا شد؛ جای آن را تنظیم کنید.'
              : removingException ? 'Alignment exception removed; the field is aligned again.' : 'Field excluded from automatic alignment; adjust its position.')
          }
        }
        return
      }
    }
    if (designerOpen && geometryEditable && !event.defaultPrevented && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !keyboardTarget.closest('input,textarea,select,[contenteditable],.managed-form-workspace-sidebar,[role="dialog"],.designer-edge-handle')) {
      if (nudgeDesignerSelection(event.key, event.shiftKey, keyboardTarget)) { event.preventDefault(); event.stopPropagation(); return }

    }

    if (managedFormEditorOpen && !((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))) return
    const functionKey = functionKeyFromEvent(event.nativeEvent)
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
  useEffect(() => {
    if (!designerOpen || !geometryEditable || componentTestMode || operationalPreviewRef.current) return
    const onInspectorShortcut = (event: globalThis.KeyboardEvent) => {
      if (operationalPreviewRef.current) return
      const target = event.target instanceof HTMLElement ? event.target : undefined
      if (!target || event.altKey) return
      const geometryInput = target instanceof HTMLInputElement && target.type === 'number' && Boolean(target.closest('#form-laboratory-designer'))
      const inCanvas = Boolean(target.closest('.laboratory-form-grid'))
      const selected = selectedDesignerInputs(selection, geometryFieldIds)
      const nativeEditableControl = Boolean(target.closest('.laboratory-form-grid input:not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), .laboratory-form-grid textarea:not([disabled]):not([readonly]), .laboratory-form-grid select:not([disabled]), .laboratory-form-grid [contenteditable="true"]'))
      // Hovering a visible resize edge means Resize, even while focus remains on
      // the selected component. Do not let the capture-phase Move shortcut win.
      const hovered=hoveredInputResize.current
      if(inCanvas&&hovered&&hovered.element.isConnected&&selected.includes(hovered.fieldId)&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation()
        resizeInputByKey(hovered.fieldId,hovered.edge,event.key,event.shiftKey,hovered.element)
        return
      }
      // In the designer, arrows nudge an explicitly selected field even when
      // its native input currently has focus. Operational entry is outside this
      // listener because the designer is closed there, so input caret/select
      // navigation keeps its normal behavior.
      if(inCanvas&&selected.length&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&!target.closest('.designer-edge-handle')){
        if(nudgeDesignerSelection(event.key,event.shiftKey,target)){event.preventDefault();event.stopImmediatePropagation()}
        return
      }
      if ((inCanvas || geometryInput) && selected.length && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault(); event.stopImmediatePropagation()
        alignSelectedGeometryFieldsToSide(event.key === 'ArrowLeft' ? 'left' : 'right', target)
        return
      }
      if ((event.ctrlKey || event.metaKey) && isDesignerShortcutKey(event, 'a')) {
        if (!inCanvas || nativeEditableControl) return
        event.preventDefault(); event.stopImmediatePropagation(); selectAllGeometryFields(); return
      }
      if (event.ctrlKey && !event.metaKey && isDesignerShortcutKey(event, 'l')) {
        if (!(inCanvas || (geometryInput && selected.length))) return
        event.preventDefault(); event.stopImmediatePropagation(); applySmartGeometryLayout(target)
      }
    }
    window.addEventListener('keydown', onInspectorShortcut, true)
    return () => window.removeEventListener('keydown', onInspectorShortcut, true)
  }, [designerOpen, geometryEditable, componentTestMode, operationalPreviewRef.current, selection, geometryFieldIds.join('|'), fa, geometryTextareaFieldIds.join('|'), geometryCheckboxFieldIds.join('|'), geometryActiveFieldIds.join('|')])
  const renderField = (id: string, layoutClass: string, control: React.ReactNode, error?: string, options: { readOnly?: boolean; designerSelectable?: boolean; designerDraft?: DesignerDraft; canvas?: DesignerCanvas; gridStyle?: CSSProperties; label?: string; structureSelection?: { selected: boolean; onSelect: (event: React.MouseEvent) => void }; geometry?: DesignerGeometryPolicy } = {}) => {
    const readOnly = options.readOnly === true
    const renderDraft = options.designerDraft ?? visibleDraft
    const renderCanvas = options.canvas
    const positionedRect = (rect?:DesignerRect):CSSProperties => ({...rectStyle(rect),...(rect&&renderCanvas?.centeredFieldIds?.includes(id)?{left:`calc(${rect.left}px + var(--lab-center-shift, 0px))`}:{})})
    // The selector belongs to the field, but is not an editable canvas part.
    // Anchor it to the field's actual label/input bounds instead of the legacy
    // independently saved `select` rectangle, which could drift away.
    const fieldDefinition = documentSchema.fields.find(field => field.id === id)
    const controlProps = React.isValidElement(control) ? control.props as { value?: unknown; primary?: unknown; selectedId?: string; items?: readonly {id:string;value:string;isDefault?:boolean}[]; children?: React.ReactNode } : undefined
    const visibleValue = controlProps?.value ?? controlProps?.primary ?? controlProps?.items?.find(item=>item.id===controlProps.selectedId)?.value ?? controlProps?.items?.find(item=>item.isDefault)?.value
    const controlHasContent = (typeof visibleValue === 'string' && visibleValue.trim().length > 0) || (typeof visibleValue === 'number' && Number.isFinite(visibleValue)) || (visibleValue === undefined && controlProps?.children !== undefined && React.Children.toArray(controlProps.children).length > 0)
    const showFormattingSample = !id.includes('.tree.') && fieldDefinition?.kind !== 'custom' && designerOpen && !componentTestMode && !formRuntimeTesting && !dataEntryActive && fieldDefinition?.kind !== 'checkbox' && fieldDefinition?.kind !== 'file' && !controlHasContent
    const selectorParts = [renderCanvas?.fields[id]?.label, renderCanvas?.fields[id]?.input].filter((rect): rect is DesignerRect => Boolean(rect))
    const selectorStyle = selectorParts.length ? positionedRect({
      left: Math.min(...selectorParts.map(rect => rect.left)),
      // Regular selectors share the field-label row; the checkbox selector keeps its compact legacy anchor.
      top: fieldDefinition?.kind === 'checkbox' ? Math.min(...selectorParts.map(rect => rect.top)) - 22 : renderCanvas?.fields[id]?.label?.top ?? Math.min(...selectorParts.map(rect => rect.top)) - 22,
      width: 19,
      height: 18
    }) : fieldDefinition?.kind === 'checkbox' ? { top: 3, left: 4, right: 'auto', width: 19, height: 18 } : undefined
    const fieldDesignerOpen = designerOpen && !componentTestMode && !formRuntimeTesting && (!readOnly || options.designerSelectable === true)
    const fieldGeometryEditable = geometryEditable && !componentTestMode && !formRuntimeTesting && (!readOnly || options.designerSelectable === true)
    const required = fieldDefinition?.required === true
    const showRuleMarkers = dataEntryActive || (formRuntimeTesting && runtime.mode !== 'view') || (designerOpen && !componentTestMode && showRuleMarkersInDesigner)
    const selected = fieldDesignerOpen && selection.includes(`${id}::field`)
    const inputSelected = fieldDesignerOpen && (selected || selection.includes(`${id}::input`))
    const labelSelected = fieldDesignerOpen && (selected || selection.includes(`${id}::label`))
    const fieldLabel = options.label ?? labels[id]?.[language] ?? id
    const alignmentException = renderCanvas?.alignmentExceptionFieldIds?.includes(id) === true
    const inputDesignerStyle = designerStyleForPart(renderDraft, id, 'input')
    const geometryValues = designerEffectiveValues(renderDraft, id, 'input')
    const selectionMarkerStyle: CSSProperties | undefined = options.geometry ? {
      position: 'absolute', left: 0, right: 'auto', top: -22, width: 19, height: 18,
      transform: `translate(${Number(geometryValues.offsetX ?? 0)}px, ${Number(geometryValues.offsetY ?? 0)}px)`
    } : selectorStyle
    const registeredSizeStyle: CSSProperties = options.geometry ? {
      ...(options.geometry.resize !== 'vertical' && typeof geometryValues.width === 'number' ? { width: geometryValues.width } : {}),
      ...(typeof geometryValues.height === 'number' ? { height: geometryValues.height } : {})
    } : {}
    const treeStyleProperties: Record<string, keyof CSSProperties> = { '--lab-bg': 'backgroundColor', '--lab-text': 'color', '--lab-border': 'borderColor', '--lab-font': 'fontFamily', '--lab-font-size': 'fontSize', '--lab-font-weight': 'fontWeight', '--lab-bold': 'fontWeight', '--lab-font-style': 'fontStyle', '--lab-text-align': 'textAlign', '--lab-radius': 'borderRadius', '--lab-text-decoration': 'textDecoration', '--lab-border-width': 'borderWidth', '--lab-border-style': 'borderStyle', '--lab-padding-x': 'paddingInline', '--lab-padding-y': 'paddingBlock', '--lab-shadow': 'boxShadow', '--lab-gradient': 'backgroundImage', '--lab-line-height': 'lineHeight', '--lab-text-decoration-style': 'textDecorationStyle' }
    const treeInputStyle = (id.includes('.tree.') || fieldDefinition?.componentId === 'base-form.cascading-tree-panels') ? Object.fromEntries(Object.entries(treeStyleProperties).flatMap(([variable, property]) => { const value = inputDesignerStyle[variable]; return value === undefined ? [] : [[property, value]] })) as CSSProperties : {}
    // Text-only component surfaces use the same saved alignment as native inputs.
    // Align their content, never the composite panel or its neighboring fields.
    const textSurface = React.isValidElement(control) && typeof control.type === 'string' &&
      (['button', 'small', 'span', 'output'].includes(control.type) ||
        String((control.props as { className?: string }).className ?? '').split(' ').includes('cascading-tree-path-text'))
    if (textSurface && (geometryValues.textAlign !== undefined || geometryValues.verticalTextAlign !== undefined)) {
      const vertical = geometryValues.verticalTextAlign
      Object.assign(treeInputStyle, {
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        justifyContent: vertical === 'top' ? 'flex-start' : vertical === 'bottom' ? 'flex-end' : 'center',
        textAlign: geometryValues.textAlign ?? 'start',
        '--lab-inline-content-align': geometryValues.textAlign === 'center' ? 'center'
          : geometryValues.textAlign === 'left' ? (fa ? 'flex-end' : 'flex-start')
          : geometryValues.textAlign === 'right' ? (fa ? 'flex-start' : 'flex-end')
          : geometryValues.textAlign === 'end' ? 'flex-end' : 'flex-start'
      })
    }
    if (/\.tree\.body$/.test(id)) {
      const own = { ...renderDraft.overrides[id], ...renderDraft.overrides[id + '::input'] }
      treeInputStyle.backgroundColor = typeof own.backgroundColor === 'string' ? own.backgroundColor : 'var(--surface,#fff)'
    }
    if (/\.tree\.[0-4]\.column$/.test(id)) {
      const treeStyle = treeInputStyle as Record<string, unknown>
      if (inputDesignerStyle['--lab-bg'] !== undefined) treeStyle['--tree-column-fill'] = inputDesignerStyle['--lab-bg']
      if (inputDesignerStyle['--lab-radius'] !== undefined) treeStyle['--tree-column-radius'] = inputDesignerStyle['--lab-radius']
    }
    if (id.includes('.tree.') || fieldDefinition?.componentId === 'base-form.cascading-tree-panels') {
      const fixed = Boolean(renderCanvas?.fields[id]?.input)
      if (fixed || inputDesignerStyle['--lab-width'] !== undefined) treeInputStyle.width = '100%'
      if (fixed || inputDesignerStyle['--lab-height'] !== undefined) treeInputStyle.height = '100%'
      treeInputStyle.boxSizing = 'border-box'
    }
    const structureSelected = options.structureSelection?.selected === true
    const compositeResizeEdgeAt = (x:number,y:number):DesignerResizeHandle|undefined => {
      if (!inputSelected || !fieldGeometryEditable || !options.geometry) return
      const element = formFrameRef.current?.querySelector<HTMLElement>('[data-field-id="'+id+'"] > div > .designer-input-part')
      if(!element)return
      const r=element.getBoundingClientRect(),hit=12
      if(x<r.left-hit||x>r.right+hit||y<r.top-hit||y>r.bottom+hit)return
      const verticalHit=Math.min(10,r.height*.2),horizontalHit=Math.min(10,r.width*.2)
      const vertical=Math.abs(y-r.top)<=verticalHit?'top':Math.abs(y-r.bottom)<=verticalHit?'bottom':''
      const horizontal=options.geometry?.resize === 'vertical'?'':Math.abs(x-r.left)<=horizontalHit?'left':Math.abs(x-r.right)<=horizontalHit?'right':''
      return (vertical&&horizontal?vertical+'-'+horizontal:vertical||horizontal||undefined) as DesignerResizeHandle|undefined
    }
    const partPointer=(event:React.PointerEvent<HTMLElement>,part:'input'|'label')=>{
      const target=event.target as Element
      if (target.closest('[data-field-id]')?.getAttribute('data-field-id') !== id) return
      if (target.closest('.designer-edge-handle,.designer-move-handle,.designer-type-tools,.laboratory-field-select,.cascading-tree-panel-selector,.form-settings-button')) return
      if (/\.tree\.[0-4]\.column$/.test(id) && target.closest('.cascading-tree-panels')) return
      if(!fieldDesignerOpen||event.button!==0||(!id.includes('.tree.') && (event.target as Element).closest('button,.excel-color-picker')))return
      event.stopPropagation()
      const wasSelected=selection.includes(id+'::'+part)||selection.includes(id+'::field')
      if(!wasSelected||event.ctrlKey||event.metaKey)selectField(id,event as unknown as React.MouseEvent,part)
      event.currentTarget.focus({preventScroll:true})
      if(fieldGeometryEditable&&!event.ctrlKey&&!event.metaKey)beginFieldMove(event,id+'::'+part,part,wasSelected?clearDesignerSelection:undefined)
    }
    return <div key={id} className={'laboratory-designer-field ' + layoutClass + ((fieldDesignerOpen && selection.some(key => key.startsWith(`${id}::`))) || structureSelected ? ' is-selected' : '')} data-field-id={id} data-designer-storage={options.geometry?.storage} data-designer-move={options.geometry?.move} data-designer-resize={options.geometry?.resize} data-designer-preserve-slot={options.geometry?.preserveSlot} data-focus-order={fieldDefinition?.focusOrder} data-enter-enabled={fieldDefinition?.enterEnabled===false||fieldDefinition?.readOnly||fieldDefinition?.componentId==='base-form.derived-display'?false:undefined} data-structure-selected={structureSelected || undefined} data-field-review={fieldReviewIds.has(id) || undefined} data-form-behavior-id={String(fieldDefinition?.settings?.behaviorId??effectiveBehaviorId)} data-form-policy={previewPolicy(String(fieldDefinition?.settings?.behaviorId??effectiveBehaviorId))} data-enter-target={typeof fieldDefinition?.settings?.enterTarget==='string'?fieldDefinition.settings.enterTarget:undefined} data-auto-alignment-exception={alignmentException && fieldDesignerOpen || undefined} style={{ ...options.gridStyle, ...(options.geometry?.preserveSlot && renderDraft.flowSlots?.[id] ? { width: renderDraft.flowSlots[id].width, height: renderDraft.flowSlots[id].height, flex: '0 0 auto', alignSelf: 'center' } : {}), ...(structureSelected ? { outline: '2px solid var(--accent, #208579)', outlineOffset: 2 } : {}), ...(renderCanvas?.fields[id]?.error ? { '--canvas-error-left': renderCanvas.centeredFieldIds?.includes(id)?`calc(${renderCanvas.fields[id].error!.left}px + var(--lab-center-shift, 0px))`:renderCanvas.fields[id].error!.left + 'px', '--canvas-error-top': renderCanvas.fields[id].error!.top + 'px', '--canvas-error-width': renderCanvas.fields[id].error!.width + 'px', '--canvas-error-height': renderCanvas.fields[id].error!.height + 'px' } : {}) } as CSSProperties} role="group" aria-label={alignmentException && fieldDesignerOpen ? fieldLabel + (fa ? '؛ مستثنا از چینش خودکار' : '; excluded from automatic alignment') : fieldLabel} onPointerMoveCapture={event => { if ((event.target as Element).closest('[data-field-id]')?.getAttribute('data-field-id') !== id) return; const handle=(event.target as Element).closest<HTMLElement>('[data-field-resize-edge]'); const edge=(handle?.dataset.fieldResizeEdge as DesignerResizeHandle|undefined)??compositeResizeEdgeAt(event.clientX,event.clientY); const element=event.currentTarget.querySelector<HTMLElement>(':scope > div > .designer-input-part'); if(element){element.style.cursor=edge?previewCursorForEdge(edge):''; if(edge&&inputSelected&&fieldGeometryEditable)hoveredInputResize.current={fieldId:id,edge,element}} }} onPointerDownCapture={event => { const target=event.target as Element; if (!(id.includes('.tree.') || fieldDefinition?.componentId === 'base-form.cascading-tree-panels') || !fieldDesignerOpen || event.button !== 0 || target.closest('[data-field-id]')?.getAttribute('data-field-id') !== id || target.closest('.designer-edge-handle,.designer-move-handle,.designer-type-tools,.laboratory-field-select,.cascading-tree-panel-selector,.form-settings-button')) return; if (/\.tree\.[0-4]\.column$/.test(id) && !inputSelected) return; event.stopPropagation(); const edge=compositeResizeEdgeAt(event.clientX,event.clientY); if(edge){beginInputResize(event,id,edge);return} const wasSelected=selection.includes(id+'::input')||selection.includes(id+'::field'); if(!wasSelected||event.ctrlKey||event.metaKey)selectField(id,event,'input'); if(fieldGeometryEditable&&!event.ctrlKey&&!event.metaKey)beginFieldMove(event,id+'::input','input') }} onClickCapture={event => { if (id.includes('.tree.') && fieldDesignerOpen && (event.target as Element).closest('[data-field-id]')?.getAttribute('data-field-id') === id && !(event.target as Element).closest('.designer-edge-handle,.designer-move-handle,.designer-type-tools,.laboratory-field-select,.cascading-tree-panel-selector,.form-settings-button')) { event.preventDefault(); event.stopPropagation() } }}>
      {(!componentTestMode&&(!readOnly || options.designerSelectable || options.structureSelection)) && <button type="button" className="laboratory-field-select" onPointerDown={focusSelectionButton} style={selectionMarkerStyle} aria-label={(fa ? 'انتخاب فیلد ' : language === 'zh' ? '选择字段 ' : 'Select field ') + fieldLabel} aria-pressed={inputSelected || labelSelected || structureSelected} title={fa ? "انتخاب کل فیلد" : language === 'zh' ? "选择整个字段" : "Select the whole field"} onClick={event => { event.stopPropagation(); if (options.structureSelection) options.structureSelection.onSelect(event); else selectField(id, event) }}>{inputSelected || labelSelected || structureSelected ? '✓' : '+'}</button>}
       <Field container={id.includes('.tree.') || fieldDefinition?.kind === 'custom' ? 'div' : undefined} className={fieldDefinition?.kind === 'checkbox' ? 'active-check' : undefined} label={fieldLabel} labelId={`laboratory-label-${id}`} labelContent={<span className={'designer-label-part' + (labelSelected ? ' designer-part-selected' : '')} style={{ ...designerStyleForPart(renderDraft, id, 'label'), ...positionedRect(renderCanvas?.fields[id]?.label) }} tabIndex={fieldDesignerOpen?0:undefined} onPointerDown={event=>partPointer(event,'label')} onClick={event => { if (fieldDesignerOpen) { event.stopPropagation(); if ((event.target as HTMLElement).closest('button,input')) { return } } }}>{fieldLabel}{showRuleMarkers&&fieldDefinition&&fieldRuleMarkers(documentSchema,fieldDefinition).map(marker=><span key={marker.symbol} className="field-rule-marker" title={marker.description} aria-label={marker.description}>{marker.symbol}</span>)}{labelSelected && <>{fieldGeometryEditable && <button type="button" className="designer-move-handle" aria-label="Move label" onClick={stopDesignerHandleClick} onPointerDown={event => beginFieldMove(event, `${id}::label`, 'label')}>↕</button>}<span className="designer-type-tools"><button type="button" aria-label="Decrease label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.max(8, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) - 1)) }}>A−</button><button type="button" aria-label="Increase label font size" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'fontSize', Math.min(40, Number((history.present.overrides[`${id}::label`]?.fontSize ?? 14)) + 1)) }}>A+</button><button type="button" aria-label="Toggle label bold" onClick={event => { event.stopPropagation(); updateDirectProperty(`${id}::label`, 'bold', !(history.present.overrides[`${id}::label`]?.bold ?? false)) }}>B</button><ExcelColorPicker language={language} label="Label color" value={String(designerEffectiveValues(renderDraft, id, 'label').textColor ?? getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() ?? '#71817e')} onPreview={value => previewColorProperty('labelColor', value, [`${id}::label`])} onCommit={value => commitColorProperty('labelColor', value, [`${id}::label`])} /></span></>}</span>} controlContent={<span className={'designer-input-part' + (inputSelected ? ' designer-part-selected' : '')} style={{ ...designerStyleForPart(renderDraft, id, 'input'), ...positionedRect(renderCanvas?.fields[id]?.input), ...registeredSizeStyle }} tabIndex={fieldDesignerOpen?0:undefined} onPointerDown={event=>partPointer(event,'input')} onClick={event => { const target=event.target as HTMLElement; if(fieldDesignerOpen&&(fieldDefinition?.componentId==='base-form.cascading-tree-panels'||/\.tree\.[0-4]\.column$/.test(id))&&target.closest('.cascading-tree-panels'))return; if (fieldDesignerOpen) { event.stopPropagation(); if (target.closest('button')) { return } event.preventDefault(); /* Pointer selection is owned by partPointer, including Ctrl toggles. */ } }}>{React.isValidElement(control) ? React.cloneElement(control as React.ReactElement<any>, { style: { ...inputDesignerStyle as CSSProperties, ...treeInputStyle, ...((control as React.ReactElement<{ style?: CSSProperties }>).props.style ?? {}) }, ...(typeof control.type === 'string' ? { 'data-field': id, ...(required ? { required: !designerOpen, 'aria-required': !designerOpen, onInput: (event: React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => event.currentTarget.setCustomValidity(''), onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { if (!(event.relatedTarget instanceof Element && event.relatedTarget.closest('.laboratory-designer-toggle, .laboratory-designer-pane'))) validateRequiredField(id, event.currentTarget) } } : {}) } : { required, designerMode: fieldDesignerOpen }) }) : control}{showFormattingSample && <span className="designer-input-sample" aria-hidden="true">{fa ? 'نمونه متن' : language === 'zh' ? '示例文本' : 'Sample text'}</span>}{inputSelected && fieldGeometryEditable && <><button type="button" className="designer-move-handle" aria-label="Move input" onClick={stopDesignerHandleClick} onPointerDown={event=>beginFieldMove(event, `${id}::input`, 'input')}>↕</button>{designerResizeHandles.filter(edge=>options.geometry?.resize!=='vertical'||edge==='top'||edge==='bottom').map(edge=><button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize input ${edge}`} title={fa?`تغییر اندازه ${edge}؛ کلیدهای جهت‌دار، Shift برای ۱۰ پیکسل`:`Resize ${edge}: arrows; Shift for 10 pixels`} data-field-resize-edge={edge} onKeyDown={event=>handleInputResizeKey(event,id,edge)} onClick={stopDesignerHandleClick} onPointerDown={event=>beginInputResize(event,id,edge)}/>)}</>}</span>} error={error} style={designerStyleForPart(renderDraft, id, 'field') as CSSProperties}>{control}</Field>
    </div>
  }
  const title = fa ? 'آزمایشگاه فرم‌ها' : language === 'zh' ? '表单实验室' : 'Form Laboratory'
  const settingsLabel = fa ? 'طراحی ظاهری فرم' : language === 'zh' ? '表单外观设计' : 'Visual form designer'
  const layoutExtents = Object.values(history.present.overrides).reduce<{ width: number, height: number }>((extent, override) => ({
    width: Math.max(extent.width, Number(override.offsetX ?? 0)),
    height: Math.max(extent.height, Number(override.offsetY ?? 0))
  }), { width: 0, height: 0 })
  const extraCanvasWidth = Math.max(0, layoutExtents.width)
  // Transformed fields already contribute their visual bounds to native overflow.
  // Appending their offsets again creates empty scrollable space after the grid.
  const canvasStyle = { '--lab-canvas-extra-width': `${extraCanvasWidth ? extraCanvasWidth + 64 : 0}px`, '--lab-canvas-extra-height': '0px' } as CSSProperties
  const appearanceStyle = designerAppearanceStyle(visibleDraft) as CSSProperties
  const contextInputs = selection.length > 0 && selection.every(key => !key.endsWith('::label'))
  const contextLabels = selection.length > 0 && selection.every(key => key.endsWith('::label') || key.endsWith('::field'))
  const contextColors = contextMenu?.part === 'action' || (contextMenu?.part === 'input' ? contextInputs : contextLabels)
  const contextSize = contextMenu?.part === 'action' || (contextMenu?.part === 'input' && contextInputs)
  const layoutSelection = selectedDesignerInputs(selection, activeFieldIds)
  const measuredLayoutGeometry = designerOpen && geometryEditable ? measuredGeometryFor(layoutSelection) : undefined
  // Registered component parts use the same commands through measured geometry;
  // they do not need a legacy saved editor Canvas to expose those commands.
  const contextLayout = geometryEditable && !actionSelection.length && contextInputs && layoutSelection.length > 1
    && Boolean(measuredLayoutGeometry || (canvas && layoutSelection.every(id => canvas.fields[id])))
  const selectedTableColumnId = selectedTableColumnIds[0]
  const selectedTableColumn = selectedTableColumnId ? activeDesignerColumns.find(column => column.id === selectedTableColumnId) : undefined
  const contextFieldIds = contextMenu?.fieldId
    ? (() => { const ids = [...new Set(selection.map(id => id.split('::')[0]).filter(id => documentSchema.fields.some(field => field.id === id)))]; return ids.includes(contextMenu.fieldId!) ? ids : [contextMenu.fieldId!] })()
    : []
  const contextActionIds = contextMenu?.actionId && actionSelection.includes(contextMenu.actionId) ? actionSelection : contextMenu?.actionId ? [contextMenu.actionId] : []
  const contextColumnIds = contextMenu?.columnId && selectedTableColumnIds.includes(contextMenu.columnId) ? selectedTableColumnIds : contextMenu?.columnId ? [contextMenu.columnId] : []
  const activeGridColumnIds = (id?: string) => id ? selectedTableColumnIds.includes(id) ? selectedTableColumnIds : [id] : selectedTableColumnIds.length?selectedTableColumnIds:activeDesignerColumns.map(column=>column.id)
  const activeGridHeaderIds = (id?: string) => headerStyleScope === 'all' ? activeDesignerColumns.map(column => column.id) : activeGridColumnIds(id)
  const openGridTextAlignment = () => {
    if (!contextMenu?.columnId) return
    const id=contextMenu.columnId, ids=selectedTableColumnIds.includes(id)?selectedTableColumnIds:[id]
    setGridAlignmentPopup({header:contextMenu.gridTarget==='header',ids,anchorLeft:contextMenu.left,anchorRight:contextMenu.left+220,anchorTop:contextMenu.top,title:fa?'تراز متن ستون':'Column text alignment'})
    setContextMenu(null);setGridSubmenu(null)
  }
  const renderGridTextAlignment = () => {
    if (contextMenu?.part !== 'grid' || !contextMenu.columnId || !['header', 'row'].includes(contextMenu.gridTarget ?? '')) return null
    const header = contextMenu.gridTarget === 'header'
    const ids = header ? activeGridHeaderIds(contextMenu.columnId) : activeGridColumnIds(contextMenu.columnId)
    const styleFor = (id: string) => header ? tableDesignerDraft.tableHeaders?.[id] : tableDesignerDraft.tableColumns?.[id]
    const normalizedHorizontal = (value: string | undefined) => value === 'start' ? (fa ? 'right' : 'left') : value === 'end' ? (fa ? 'left' : 'right') : value ?? (fa ? 'right' : 'left')
    const setAlignment = (property: 'textAlign' | 'verticalTextAlign', value: 'left' | 'center' | 'right' | 'top' | 'bottom') => {
      let next = historyRef.current.present
      for (const id of ids) next = header
        ? setDesignerTableHeaderStyle(next, id, property, value)
        : setDesignerTableColumnStyle(next, id, property, value)
      dispatchHistory({ type: 'change', draft: next })
      setSaveStatus('')
    }
    const horizontal = (fa ? ['right', 'center', 'left'] as const : ['left', 'center', 'right'] as const).map(value => {
      const selected = ids.length > 0 && ids.every(id => normalizedHorizontal(styleFor(id)?.textAlign) === value)
      const label = fa ? ({ left: 'چپ‌چین', center: 'وسط‌چین', right: 'راست‌چین' } as const)[value] : ({ left: 'Align left', center: 'Align center', right: 'Align right' } as const)[value]
      const lines = value === 'left' ? [[2,20],[2,15],[2,11],[2,6]] : value === 'right' ? [[22,20],[22,15],[22,11],[22,6]] : [[12,20],[12,15],[12,11],[12,6]]
      const widths = [16,11,19,14]
      return <button key={value} type="button" aria-label={label} title={label} aria-pressed={selected} onClick={() => setAlignment('textAlign', value)}><svg viewBox="0 0 24 20" aria-hidden="true">{lines.map(([x,y],index) => { const width=widths[index]; return <line key={index} x1={value==='left'?x:value==='right'?x-width:x-width/2} x2={value==='left'?x+width:value==='right'?x:x+width/2} y1={y} y2={y}/> })}</svg></button>
    })
    const vertical = (['top', 'center', 'bottom'] as const).map(value => {
      const selected = ids.length > 0 && ids.every(id => (styleFor(id)?.verticalTextAlign ?? 'center') === value)
      const label = fa ? ({ top: 'بالاچین', center: 'وسط‌چین عمودی', bottom: 'پایین‌چین' } as const)[value] : ({ top: 'Align top', center: 'Align middle', bottom: 'Align bottom' } as const)[value]
      return <button key={value} type="button" aria-label={label} title={label} aria-pressed={selected} onClick={() => setAlignment('verticalTextAlign', value)}><svg viewBox="0 0 24 20" aria-hidden="true">{(value==='top'?[2,6,10]:value==='bottom'?[8,12,16]:[5,9,13]).map((y,index)=>{const width=[14,18,11][index];return <line key={index} x1={(24-width)/2} x2={(24+width)/2} y1={y} y2={y}/>})}</svg></button>
    })
    return <div className="designer-context-alignment" role="toolbar" aria-label={fa ? 'تراز متن جدول' : 'Table text alignment'}><div className="designer-context-alignment-row" role="group" aria-label={fa ? 'تراز افقی' : 'Horizontal alignment'}>{horizontal}</div><div className="designer-context-alignment-row" role="group" aria-label={fa ? 'تراز عمودی' : 'Vertical alignment'}>{vertical}</div></div>
  }
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
    const storedDesignerDraft = designerDraftForEditor(sourceDesignerDraft, documentSchema, sectionId)
    const treeOnly = layoutSchema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') && layoutSchema.fields.every(field => field.componentId === 'base-form.cascading-tree-panels' || field.kind === 'hidden')
    // The tree shell is a full-width layout host. Keep its legacy geometry in
    // storage, while projecting this host through schema flow; child geometry
    // and appearance continue to use the existing designer overrides.
    const designerDraft = treeOnly ? { ...storedDesignerDraft, canvas: undefined, layoutMode: 'schema' as const, overrides: Object.fromEntries(Object.entries(storedDesignerDraft.overrides).map(([key,value]) => {
      const shell=layoutSchema.fields.some(field=>field.componentId==='base-form.cascading-tree-panels' && (key===field.id || key===field.id+'::input' || key===field.id+'::label'))
      if(!shell)return [key,value]
      const {width:_width,height:_height,offsetX:_x,offsetY:_y,...appearance}=value
      return [key,appearance]
    })) } : storedDesignerDraft
    const viewKey=canvasProjectionKey(layoutSchema,sectionId)
    if(!canvasViewOrigins.current.has(viewKey))canvasViewOrigins.current.set(viewKey,designerDraft.canvas?designerCanvasViewOrigin(designerDraft.canvas):0)
    const layout = resolveFormLayout(layoutSchema, designerDraft, activePreviewFrame.device, activePreviewFrame.width, {cropEmptyCanvas:Boolean(activeManagedForm),originX:canvasViewOrigins.current.get(viewKey)})
    const editorCanvas = layout.canvas
    const viewport = editorViewport(layoutSchema.sections.find(section => section.id === (sectionId ?? layoutSchema.sections.find(item => item.kind === 'editor')?.id)))
    const previousProjection = canvasViewProjection.current.get(viewKey)
    // Content-cropped layouts render in coordinates relative to originX. Once a
    // manual edit preserves the full saved Canvas, translate the view by the
    // inverse origin delta so unselected fields stay at the same screen pixels.
    const sourceCanvas = designerDraft.canvas
    const coordinateOriginX = editorCanvas && sourceCanvas && Object.entries(editorCanvas.fields).some(([id, field]) => {
      const source = sourceCanvas.fields[id]
      return source && source.input.left !== field.input.left
    }) ? canvasViewOrigins.current.get(viewKey) ?? 0 : 0
    const measuredCanvasViewport = editorCanvas && editorViewportWidth > 0
      ? fitDesignerCanvasToViewportWithHysteresis(editorCanvas, editorViewportWidth, layoutSchema.fields.map(field => field.id), previousProjection?.overflowing)
      : undefined
    // Keep a manual geometry edit visible at the current viewport width. The
    // normal fit projection centers the entire group on every render; after a
    // one-pixel nudge that would cancel the movement on screen. A later resize
    // recomputes the projection and restores equal side margins as usual.
    const canvasViewport = measuredCanvasViewport && editorCanvas?.preserveHorizontalBounds === true
      && previousProjection?.width === editorViewportWidth
      ? { ...measuredCanvasViewport, shift: previousProjection.shift + coordinateOriginX - previousProjection.originX }
      : measuredCanvasViewport
    if (canvasViewport) canvasViewProjection.current.set(viewKey, { width: editorViewportWidth, shift: canvasViewport.shift, overflowing: canvasViewport.overflowing, originX: coordinateOriginX })
    else canvasViewProjection.current.delete(viewKey)
    const displayCanvas = canvasViewport?.canvas ?? editorCanvas
    const treeRoot = treeOnly ? layoutSchema.fields.find(field => field.componentId === 'base-form.cascading-tree-panels') : undefined
    const treeBodyAppearance = treeRoot ? { ...designerDraft.overrides[treeRoot.id + '.tree.body'], ...designerDraft.overrides[treeRoot.id + '.tree.body::input'] } : undefined
    const treeHeaderAppearance = treeRoot ? { ...designerDraft.overrides[treeRoot.id + '.tree.header'], ...designerDraft.overrides[treeRoot.id + '.tree.header::input'] } : undefined
    const treeBodyFill = typeof treeBodyAppearance?.backgroundColor === 'string' ? treeBodyAppearance.backgroundColor : 'var(--surface,#fff)'
    const treeBodyRadius = Number.isFinite(treeBodyAppearance?.borderRadius) ? `${treeBodyAppearance?.borderRadius}px` : '0px'
    const treeHeaderRadius = Number.isFinite(treeHeaderAppearance?.borderRadius) ? `${treeHeaderAppearance?.borderRadius}px` : '0px'
    const fieldLabelFor = (id: string) => schema?.fields.find(field => field.id === id)?.label[language] ?? labels[id]?.[language] ?? id
    const renderEditorField = (id: string, layoutClass: string, control: React.ReactNode, error?: string) => ((formRuntimeTesting||Boolean(operationalSource(layoutSchema))) && layoutClass !== 'lab-custom-field') || schema && !schema.fields.some(field => field.id === id) ? null : <ComponentListProvider key={id} settings={normalizeListSettings(layoutSchema.fields.find(field=>field.id===id)?.settings?.listSettings)} behaviorOverrides={layoutSchema.fields.find(field=>field.id===id)?.settings?.behaviorOverrides as import('./components/base-form/componentBehavior').ListCapabilities|undefined} role={componentTestMode||formRuntimeTesting?testActorRole:'admin'}>{renderField(id, layoutClass, control, error, { readOnly, designerSelectable, designerDraft, canvas: displayCanvas, gridStyle: layout.fieldStyles[id], label: fieldLabelFor(id), structureSelection: structureSelection ? { selected: structureSelection.selectedFieldId === id, onSelect: event => structureSelection.onSelect(id, event) } : undefined })}</ComponentListProvider>
    const values = readOnly ? defaultPersonDraft : draft
    const disabled = readOnly || !dataEntryActive
    return <div className="person-editor panel laboratory-editor" data-tree-editor={treeOnly || undefined} onClick={event=>{if(designerOpen&&!componentTestMode&&(!readOnly||designerSelectable)&&!(event.target as Element).closest('[data-field-id],button,input,select,textarea,[role="menu"]'))clearDesignerSelection()}} style={{ ...designerAppearanceStyle(designerDraft), ...(treeOnly ? { '--lab-tree-body-fill': treeBodyFill, '--lab-tree-body-radius': treeBodyRadius, '--lab-tree-header-radius': treeHeaderRadius, backgroundColor: 'var(--surface,#fff)' } : {}), overflowX: canvasViewport && displayCanvas!.width > editorViewportWidth ? 'auto' : viewport.overflowX, overflowY: viewport.overflowY, ...(editorCanvas ? { scrollbarGutter: 'stable' } : {}) } as CSSProperties}><div ref={node => {
      if (!node) return
      renderedLayoutRoots.current.set(node, layout)
      if (!(readOnly && !designerSelectable || sectionId && sectionId !== editorSectionId)) formGridRef.current = node
      return () => { renderedLayoutRoots.current.delete(node); if (formGridRef.current === node) formGridRef.current = null }
    }} className={'person-form-grid laboratory-form-grid' + (editorCanvas ? ' has-fixed-geometry' : '')} data-layout-guides={designerOpen&&!componentTestMode&&layoutGuideStep>0||undefined} data-layout-form-id={layout.formId} data-layout-kind={layout.kind} data-layout-device={layout.device} data-layout-columns={layout.columns} data-canvas-view-shift={canvasViewport?.shift} data-canvas-coordinate-origin={coordinateOriginX} data-canvas-overflowing={canvasViewport?.overflowing ? 'true' : undefined} data-canvas-stored-width={editorCanvas?.width ?? ''} style={{ ...(layoutGuideStep>0?{'--designer-guide-step':layoutGuideStep+'px'}:{}), ...(displayCanvas ? { width: canvasViewport ? displayCanvas.width : displayCanvas.centeredFieldIds?.length?'100%':displayCanvas.width, '--lab-center-shift': canvasViewport ? `${canvasViewport.shift}px` : displayCanvas.centeredFieldIds?.length?`calc(50% - ${displayCanvas.width/2}px)`:'0px', height: displayCanvas.height, minWidth: canvasViewport ? displayCanvas.width : displayCanvas.centeredFieldIds?.length?0:displayCanvas.width, marginInlineStart: canvasViewport ? 0 : displayCanvas.centeredFieldIds?.length?'auto':0, marginInlineEnd: canvasViewport ? 0 : 'auto' } : {}), ...(layout.columns ? { '--form-schema-grid-columns': String(layout.columns) } : {}), ...(layout.minimumWidth ? { '--form-schema-grid-min-width': `${layout.minimumWidth}px` } : {}) } as CSSProperties} data-section-id={sectionId ?? layoutSchema.sections.find(section => section.kind === 'editor')?.id} onClick={event => { if (designerOpen && (!readOnly || designerSelectable) && event.target === event.currentTarget) setSelection([]) }}>
      {renderEditorField('personCode', 'lab-person-code', <input aria-label={fieldLabelFor('personCode')} value={values.personCode} disabled={disabled} onChange={readOnly ? undefined : event => update('personCode', event.target.value)} />)}
      {renderEditorField('titleId', 'lab-title laboratory-shared-contact', <FormValueList onSelectValue={value => { if (!readOnly) { if(!value){update('titleId','');return}const option = labTitles.find(item => titleName(item) === value); if (option) update('titleId', option.id) } }} field="titleId" label={fieldLabelFor('titleId')} primary={labTitles.find(option => option.id === values.titleId) ? titleName(labTitles.find(option => option.id === values.titleId)!) : ''} numbers={labTitles.map(titleName)} listPrimary={labTitles.find(option => option.id === defaultTitleId) ? titleName(labTitles.find(option => option.id === defaultTitleId)!) : ''} disabled={disabled} fa={fa} multiline minListWidth={240} addLabel={fa ? 'افزودن عنوان' : 'Add title'} listLabel={fa ? 'نمایش عنوان‌ها' : 'Show titles'} getItemKey={original => labTitles.find(option => titleName(option) === original)?.id ?? original} className="laboratory-title-text-control" canEdit={original => !titleInUse(labTitles.find(option => titleName(option) === original)?.id ?? '')} canRemove={original => !titleInUse(labTitles.find(option => titleName(option) === original)?.id ?? '')} onChange={readOnly ? () => false : commitLaboratoryTitles} />)}
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
        const testKey=documentSchema.id+':'+field.id, storedSample=componentTestValues[testKey]??{value:String(field.settings?.demoValue??''),options:(field.settings?.demoOptions??[]) as string[]},runtimeRecord=formRuntimeTesting&&runtime.mode==='view'?runtime.records.find(row=>row.id===runtime.selectedId):undefined,sample=formRuntimeTesting?{...storedSample,...(runtime.mode==='view'&&['base-form.batch-values','base-form.packaging-volume'].includes(field.componentId)?{batchItems:runtimeRecord?.details?.[field.id]??[]}:{}),value:runtime.draft[field.id]??runtimeRecord?.values[field.id]??''}:storedSample
        const recordValues=formRuntimeTesting?runtime.draft:Object.fromEntries(layoutSchema.fields.map(item=>[item.id,componentTestValues[documentSchema.id+':'+item.id]?.value??'']))
        const derivedParts=field.componentId==='base-form.derived-display'?evaluateDerivedFieldParts(documentSchema.fields,recordValues,field.id,language):{parts:[],separator:' '}
        const setSample=(value:string,options?:string[],defaultValue?:string,batchItems?:BatchValueItem[])=>{setComponentTestValues(current=>({...current,[testKey]:{value,options:options??current[testKey]?.options??[],defaultValue:defaultValue??current[testKey]?.defaultValue,batchItems:batchItems??current[testKey]?.batchItems}}));if(formRuntimeTesting){dispatchRuntime({type:'change',field:field.id,value});setRuntimeErrors(current=>{const next={...current};for(const item of documentSchema.fields)if(item.id===field.id||effectiveFieldRules(item).unique||item.ruleSettings?.dependencies?.length||documentSchema.uniqueConstraints?.some(rule=>rule.fieldIds.includes(item.id)))delete next[item.id];return {...next,...validateRecordRules(documentSchema,{...runtime.draft,[field.id]:value},runtime.records,runtime.mode==='edit'?runtime.selectedId:null)}})}}
        const systemGenerated=field.componentId==='base-form.incremental-code',testing=(componentTestMode||documentSchema.settings?.demoPrototype===true)&&(Boolean(activeManagedForm)||formRuntimeTesting)&&(!formRuntimeTesting||runtime.mode!=='view')&&!field.readOnly&&!systemGenerated
        const common = { 'aria-label': field.label[language], disabled: !testing, readOnly: !testing, value: sample.value,onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setSample(event.target.value) }
        const listProps = { componentDefinitionId:typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId,field: field.id, label: field.label[language], primary: sample.value, numbers: sample.options, disabled: !testing, fa, onChange: (value:string,options:string[]) => setSample(value,options,value) }
        const codeSettings=fieldCodeSettings(field)
        const existingCodes=runtime.records.filter(row=>row.id!==runtime.selectedId).map(row=>row.values[field.id]??'')
        const codeError=validateRecordRules(documentSchema,{...runtime.draft,[field.id]:sample.value},formRuntimeTesting?runtime.records:[],runtime.mode==='edit'?runtime.selectedId:null)[field.id]
        const changeCode=(value:string)=>{suggestedCodeFields.current.delete(field.id);setSample(formatComponentCode(value))}
        const lookupKey=documentSchema.id+':'+String((field.settings?.lookupSettings as {sourceId?:string}|undefined)?.sourceId??'')
        if(field.componentId==='base-form.system-lookup'&&!lookupSamples.current.has(lookupKey))lookupSamples.current.set(lookupKey,createSampleLookupSource(lookupKey))
        if(field.componentId==='base-form.cascading-tree-panels') {
          const treeSettings = cascadingTreeSettingsFromField(field.settings)
          return renderEditorField(field.id,'lab-custom-field',<CascadingTreePanels title={laboratoryContentTitle(documentSchema.title[language])} onEntryChange={active => setTreeEntry(current => current?.formId === documentSchema.id && current.active === active ? current : { formId: documentSchema.id, active })} settingsAction={<FormSettingsButton language={language} onClick={openFormSettings}/>} key={field.id + ':' + (treeSettings.nodes?.map(node => node.id).join('|') ?? 'default')} onNodesChange={nodes => setTreeReportRows(current => ({ ...current, [documentSchema.id + ':' + field.id]: productGroupReportRows(field.id, nodes) }))} selectionRequest={treeRowSelection?.formId === documentSchema.id && treeRowSelection.fieldId === field.id ? treeRowSelection : undefined} maxSubgroups={treeSettings.maxSubgroups} initialNodes={treeSettings.nodes} initialPath={treeSettings.initialPath} createRequest={treeCreateRequest?.formId === documentSchema.id && treeCreateRequest.fieldId === field.id ? treeCreateRequest.sequence : 0} columnTitles={treeSettings.columnTitles} renderColumnSelector={designerOpen && !componentTestMode && !formRuntimeTesting ? (depth, title) => { const id = field.id + '.tree.' + depth + '.column'; const selected = selection.some(key => key.split('::')[0] === id); return <button type="button" className="cascading-tree-panel-selector" aria-label={`${selected ? 'لغو انتخاب' : 'انتخاب'} پنل ${title}`} aria-pressed={selected} title="برای انتخاب یا لغو انتخاب کلیک کنید؛ پس از انتخاب، دستگیره‌های استاندارد جابه‌جایی و تغییر اندازه فعال می‌شوند" onPointerDown={event => { if(event.button===0){event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true})} }} onClick={event => { event.preventDefault(); event.stopPropagation(); selectField(id,{ctrlKey:selected||event.ctrlKey,metaKey:event.metaKey},'input') }}>{selected ? '✓' : '+'}</button> } : undefined} renderPart={(partId, partLabel, content) => renderField(field.id + '.tree.' + partId, 'lab-tree-part', content, undefined, { readOnly, designerSelectable, designerDraft, label: partLabel, geometry: { storage: 'flow', preserveSlot: ['back','all','path','status','limit'].includes(partId), ...(['header','body'].includes(partId) ? { move: 'none', resize: 'vertical' } as const : {}) } })} />)
        }
        const control = field.kind==='custom'&&field.componentId==='base-form.custom-field' ? <div className="laboratory-composite-sample" aria-label={field.label[language]}><span>پیش‌نمایش بخش ترکیبی</span></div> : field.componentId==='base-form.packaging-volume' ? <PackagingVolumeControl componentDefinitionId={typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId} field={field.id} label={field.label[language]} language={language} items={(sample.batchItems??[]) as PackagingVolumeItem[]} selectedId={sample.batchItems?.find(item=>item.value===sample.value)?.id??''} settings={field.settings?.packagingVolumeSettings} disabled={!testing&&!formRuntimeTesting} readOnly={!testing} onSelect={id=>{const value=sample.batchItems?.find(item=>item.id===id)?.value??'';if(formRuntimeTesting&&runtime.mode==='view'&&runtime.selectedId)dispatchRuntime({type:'select',id:runtime.selectedId,values:{...runtime.draft,[field.id]:value}});else setSample(value)}} onCommit={(items,id)=>setSample(items.find(item=>item.id===id)?.value??'',items.map(item=>item.value),undefined,items)}/> : field.componentId==='base-form.batch-values' ? <BatchValueList componentDefinitionId={typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId} field={field.id} label={field.label[language]} items={sample.batchItems??[]} selectedId={sample.batchItems?.find(item=>item.value===sample.value)?.id??''} disabled={!testing&&!formRuntimeTesting} readOnly={!testing} fa={fa} onSelect={id=>{const value=sample.batchItems?.find(item=>item.id===id)?.value??'';if(formRuntimeTesting&&runtime.mode==='view'&&runtime.selectedId)dispatchRuntime({type:'select',id:runtime.selectedId,values:{...runtime.draft,[field.id]:value}});else setSample(value)}} onCommit={(items,id)=>setSample(items.find(item=>item.id===id)?.value??'',items.map(item=>item.value),undefined,items)} /> : field.componentId==='base-form.system-lookup' ? <SystemLookup field={field.id} label={field.label[language]} value={sample.value} onChange={value=>setSample(value)} language={language} disabled={!testing} settings={field.settings?.lookupSettings} sourceOverride={lookupSamples.current.get(lookupKey)} componentDefinitionId={typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId}/> : field.componentId==='base-form.derived-display' ? <output aria-label={field.label[language]} aria-readonly="true" data-derived-field="true" dir={fa?'rtl':'ltr'} style={{userSelect:'none',WebkitUserSelect:'none'}}><span data-derived-text style={{display:'block',width:'100%',minWidth:0,whiteSpace:'pre-wrap',textAlign:'inherit'}}>{derivedParts.parts.map((part,index)=><React.Fragment key={index}>{index>0&&<bdi dir="auto">{derivedParts.separator}</bdi>}<bdi dir="auto">{part}</bdi></React.Fragment>)}</span></output> : field.componentId==='base-form.date-input' && field.settings?.dualCalendar===true ? <DualCalendarInput value={sample.value} onChange={setSample} disabled={!testing} label={field.label[language]}/> : field.componentId==='base-form.date-input' ? <SystemDateInput value={sample.value} onChange={setSample} disabled={!testing} required={field.required} language={language} ariaLabel={field.label[language]} suggestToday={field.settings?.suggestToday===true}/> : field.componentId==='base-form.code-input'||field.componentId==='base-form.incremental-code' ? <div className="laboratory-code-control"><input {...common} {...codeInputProps(sample.value,codeSettings,changeCode)} onFocus={event=>{if(formRuntimeTesting&&suggestedCodeFields.current.has(field.id))event.currentTarget.select()}} required={effectiveFieldRules(field).required} aria-invalid={Boolean(codeError)||undefined}/></div> : (field.componentId === 'persons.title-control'||field.componentId === 'form-laboratory.titleId') ? <PersonTitleControl label={field.label[language]} field={field.id} componentDefinitionId={typeof field.settings?.componentDefinitionId==='string'?field.settings.componentDefinitionId:field.componentId} defaultValue={sample.defaultValue??sample.value} onCommit={async(primary,names)=>{setSample(primary,names,primary);return {options:names.map(name=>({id:name,nameFa:name,nameEn:name,personType:'Individual' as const})),defaultId:primary}}} value={sample.value} options={sample.options.map(name=>({id:name,nameFa:name,nameEn:name,personType:'Individual' as const}))} disabled={!testing} canCreate={testing} fa={fa} language={language} onChange={value=>setSample(value)} onCreate={async name=>{setSample(name,[...sample.options,name]);return {id:name,nameFa:name,nameEn:name,personType:'Individual'}}} /> : field.componentId === 'base-form.number-control' ? <NumberControl {...listProps} /> : field.kind === 'valueList' || isListComponentField(field)&&Boolean(field.settings?.listSettings) ? <FormValueList {...listProps} listPrimary={sample.defaultValue??sample.value} onSelectValue={value=>setSample(value)} multiline={field.settings?.multiline === true} /> : ['select','lookup','multiSelect'].includes(field.kind) ? <select aria-label={field.label[language]} disabled={!testing} value={sample.value} onChange={event=>setSample(event.target.value)}><option value="">{field.placeholder?.[language] ?? ''}</option>{['نمونهٔ یک','نمونهٔ دو',...sample.options].map(value=><option key={value}>{value}</option>)}</select> : field.kind === 'textarea' ? <textarea {...common} /> : field.kind==='number'||field.valueType==='number' ? <NumericFieldInput {...common} {...numericFieldInputProps(field)} options={[...sample.options,...runtime.records.map(row=>row.values[field.id]??'')]} /> : <input {...common} {...numericFieldInputProps(field)} type={field.kind === 'checkbox' ? 'checkbox' : field.kind === 'date' ? 'date' : field.kind === 'file' ? 'file' : 'text'} />

        return renderEditorField(field.id, 'lab-custom-field', control,runtimeErrors[field.id]||(testing?codeError:undefined))
      })}

    </div>{!readOnly && !editorCanvas && geometryEditable && <div className="designer-canvas-spacer" aria-hidden="true" style={canvasStyle} />}</div>
  }
  const renderLaboratoryFooter = (readOnly = false, designerDraft: DesignerDraft = visibleDraft, actions: BaseFormAction[] = laboratoryDefinition.actions ?? [], designerSelectable = false) => {
    const footerActions = treeEntryActive && !actions.some(action => formTestActionFor(action) === 'save')
      ? [...actions, laboratoryDefinition.actions!.find(action => action.id === 'demo-save')!]
      : actions
    const actionMode = formRuntimeTesting ? runtime.mode : treeEntryActive || dataEntryActive ? 'create' : designerOpen && !componentTestMode ? 'design' : 'view'
    const isActionAvailable = (action: BaseFormAction) => formActionVisible(actionMode,action)
    const visibleActions = footerActions.filter(action => !('hidden' in action && action.hidden) && designerActionVisible(designerDraft, action) && isActionAvailable(action))
    const canSelectBar = !formRuntimeTesting && (!readOnly || designerSelectable) && designerOpen && geometryEditable
    const barOffset = designerDraft.actionBarOffsetY ?? 0
    return <div className="laboratory-footer-stack" dir={fa ? 'rtl' : 'ltr'} style={{ '--lab-action-bar-offset-y': `${barOffset}px` } as CSSProperties}><div className={`shortcut-bar laboratory-footer${!readOnly && dataEntryActive ? ' is-entry-active' : ''}${actionBarSelected && canSelectBar ? ' designer-action-bar-selected' : ''}`} dir={fa ? 'rtl' : 'ltr'} data-runtime-actions={formRuntimeTesting||undefined} role="group" aria-label={fa ? 'دکمه‌های پایین فرم' : 'Form actions'} aria-live="polite" onPointerDownCapture={canSelectBar ? beginActionBarMove : undefined} onClickCapture={event => { if (!canSelectBar) return; const target = event.target as HTMLElement; if (target.closest('[data-action-id],.designer-edge-handle,.designer-action-bar-select,button,input,select,textarea,a')) return; setActionBarSelected(true); setSelection([]); setActionSelection([]); setSelectedTableColumnIds([]) }} style={{ ...designerAppearanceStyle(designerDraft), '--lab-action-bar-height': designerDraft.actionBarHeight === undefined ? undefined : `${designerDraft.actionBarHeight}px` } as CSSProperties}>{canSelectBar && <button type="button" className="designer-action-bar-select" aria-label={actionBarSelected ? 'لغو انتخاب نوار کلیدها' : 'انتخاب نوار کلیدها'} aria-pressed={actionBarSelected} title={actionBarSelected ? 'لغو انتخاب نوار کلیدها' : 'انتخاب کل نوار کلیدها'} onPointerDown={event => { event.stopPropagation() }} onClick={event => { event.preventDefault(); event.stopPropagation(); const next = !actionBarSelected; setActionBarSelected(next); if(next){setSelection([]);setActionSelection([]);setSelectedTableColumnIds([])} }}>
      {actionBarSelected ? '✓' : '+'}
    </button>}{visibleActions.map(action => {
    const runtimeAction=formRuntimeTesting?formTestActionFor(action):undefined
    const disabled = formRuntimeTesting ? !runtimeAction || (['copySelected','edit','delete','first','last','previous','next'].includes(runtimeAction)&&!runtime.selectedId) || runtimeAction==='copyLast'&&!runtime.records.length : (readOnly && !designerSelectable) || (!designerOpen && actionDisabled(action))
    const entryActive = !formRuntimeTesting && !readOnly && dataEntryActive
    return <span key={action.id} data-action-id={action.id} data-action-operation={formTestActionFor(action)} className={'laboratory-action-button' + (action.iconOnly ? ' is-icon-action' : '') + (!formRuntimeTesting && (!readOnly || designerSelectable) && designerOpen && actionSelection.includes(action.id) ? ' designer-part-selected' : '')} style={designerActionStyle(designerDraft, action.id) as CSSProperties} title={disabled ? action.id === 'edit-person' ? (fa ? 'برای ویرایش باید جدول رکورد داشته باشد.' : 'The table must contain records to edit.') : fa ? 'این کلید در حالت فعلی فرم قابل استفاده نیست.' : 'This action is unavailable in the current form mode.' : undefined} onClickCapture={event => {
      if (formRuntimeTesting || (readOnly && !designerSelectable) || !designerOpen || (event.target as HTMLElement).closest('.designer-edge-handle')) return
      event.preventDefault(); event.stopPropagation(); setSelection([]); setActionBarSelected(false)
      setActionSelection(current => event.ctrlKey || event.metaKey ? current.includes(action.id) ? current.filter(id => id !== action.id) : [...current, action.id] : [action.id])
    }}><Shortcut code={entryActive ? action.code : designerActionCode(designerDraft, action)} label={entryActive ? action.label[language] : designerActionLabel(designerDraft, action, language)} runtimeAction={runtimeAction} codeStyle={designerActionTextStyle(designerDraft, action.id, 'code')} labelStyle={designerActionTextStyle(designerDraft, action.id, language)} disabled={disabled} primary={action.primary} danger={action.id === 'delete-person' || action.id === 'operational.delete'} onClick={() => { if (runtimeAction) runRuntimeAction(runtimeAction); else if (!formRuntimeTesting&&!readOnly) runAction(action.id) }} />{!formRuntimeTesting && (!readOnly || designerSelectable) && designerOpen && geometryEditable && actionSelection.includes(action.id) && (['left', 'right', 'top', 'bottom'] as const).map(edge => <button key={edge} type="button" className={`designer-edge-handle designer-edge-${edge}`} aria-label={`Resize action ${action.id} ${edge}`} onClick={stopDesignerHandleClick} onPointerDown={event => beginActionResize(event, action.id, edge)} />)}</span>
  })}{canSelectBar && actionBarSelected && <button type="button" className="designer-edge-handle designer-footer-resize-handle" aria-label={fa ? 'تغییر ارتفاع نوار کلیدهای پایین' : 'Resize bottom action bar'} title={fa ? 'برای تغییر ارتفاع نوار کلیدها بکشید' : 'Drag to resize the action bar'} onClick={stopDesignerHandleClick} onPointerDown={beginActionBarResize} />}</div></div>
  }
  const latestRecoverySnapshot = (): RecoverableForm | null => {
    if (!activeManagedForm) return null
    return recoverySnapshotRef.current
  }
  const persistRecoverySnapshot = (snapshot: RecoverableForm, reason?: string) => {
    const result = writeFormRecoveryResult(browserFormStorage(), authenticatedUserId, snapshot, reason)
    const success = result === 'saved'
    if (!success) {
      const reasons = { unavailable: 'حافظهٔ محلی در دسترس نیست', 'invalid-snapshot': 'نسخهٔ جاری با تاریخچهٔ فرم سازگار نیست', 'invalid-journal': 'دادهٔ بازیابی قبلی نامعتبر یا ناسازگار است', quota: 'ظرفیت حافظهٔ محلی پر شده است', 'storage-error': 'نوشتن در حافظهٔ محلی ممکن نشد' }
      setRecoveryStatus(fa ? `ذخیرهٔ بازیابی انجام نشد: ${reasons[result as keyof typeof reasons]}. دادهٔ قبلی حفظ شد؛ فرم را نبندید.` : `Recovery failed (${result}); previous data was kept. Keep this form open.`)
    }
    else { setRecoveryStatus(''); setRecoveryRevision(value => value + 1) }
    return success
  }
  const backupDocumentToServer = async (formId:string, snapshot:object, reason: string) => {
    try {
      const browserData:Record<string,string> = {}
      for (let index=0; index<localStorage.length; index++) { const key=localStorage.key(index); if(key?.startsWith('yarn-trade:')) { const value=localStorage.getItem(key); if(value!==null)browserData[key]=value } }
      await apiRequest('/api/form-design-backups', {method:'POST',body:JSON.stringify({format:'yarn-trade.form-design-backup',version:1,formId,reason,createdAt:new Date().toISOString(),snapshot,browserData})})
      return true
    } catch {
      const message=fa?'پشتیبان سرور ثبت نشد؛ اتصال و دسترسی را بررسی کنید. فرم باز و اطلاعات محلی محفوظ است.':'Server backup failed; check connection and access. The form remains open.'
      setRecoveryStatus(message); setManagedFormStatus(message)
      return false
    }
  }
  const backupToServer = (snapshot:RecoverableForm,reason:string) => backupDocumentToServer(snapshot.form.id,snapshot,reason)
  const backupLaboratoryBeforeSwitch = async (reason:string) => {
    // Startup layout hydration can finish while the first backup is in flight.
    // Back up the latest snapshot again; never switch using an older snapshot.
    for(let attempt=0;attempt<3;attempt++){
      const current=historyRef.current, schema=currentDocumentSchemaRef.current, frame=activePreviewFrameRef.current
      if(!await backupDocumentToServer(laboratoryDefinition.id,{schema,designerHistory:current,frame},reason)) return false
      if(JSON.stringify(historyRef.current)!==JSON.stringify(current) || JSON.stringify(currentDocumentSchemaRef.current)!==JSON.stringify(schema) || JSON.stringify(activePreviewFrameRef.current)!==JSON.stringify(frame)) continue
      try { localStorage.setItem(motherRecoveryKey,JSON.stringify(schema)); if(!saveSessionDraft()) throw new Error('Local save failed'); return true }
      catch { setRecoveryStatus(fa?'ذخیرهٔ محلی قالب انجام نشد؛ فرم را باز نگه دارید.':'Could not save the laboratory draft; keep it open.'); return false }
    }
    setRecoveryStatus(fa?'قالب هنگام پشتیبان‌گیری تغییر کرد؛ دوباره اقدام کنید.':'The design changed during backup; try again.')
    return false
  }

  const refreshServerBackups = async () => {
    const formId=activeManagedForm?.id??laboratoryDefinition.id
    setServerBackupBusy(true)
    try { setServerBackupVersions(await apiRequest<Array<{id:string;formId:string;createdAt:string;reason:string}>>('/api/form-design-backups?formId='+encodeURIComponent(formId))) }
    catch { setRecoveryStatus(fa?'خواندن نسخه‌های سرور ممکن نشد.':'Could not load server backups.') }
    finally { setServerBackupBusy(false) }
  }
  const refreshAllServerBackups = async () => {
    setServerBackupBusy(true)
    try { setAllServerBackupVersions(await apiRequest<Array<{id:string;formId:string;createdAt:string;reason:string}>>('/api/form-design-backups')) }
    catch { setRecoveryStatus(fa?'خواندن نسخه‌های سرور ممکن نشد.':'Could not load server backups.') }
    finally { setServerBackupBusy(false) }
  }
  const recoverMissingServerForm = async (id:string) => {
    if(!id)return
    setServerBackupBusy(true)
    try {
      const backup=await apiRequest<{format:string;formId:string;snapshot:RecoverableForm;browserData?:Record<string,string>}>('/api/form-design-backups/'+encodeURIComponent(id))
      const snapshot=backup.snapshot
      if(backup.format!=='yarn-trade.form-design-backup'||!snapshot?.form||backup.formId!==snapshot.form.id)throw new Error('Invalid backup')
      const data=new Map<string,string>(), testStorage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}}
      if(writeFormRecoveryResult(testStorage,authenticatedUserId,snapshot,'verify')!=='saved')throw new Error('Invalid snapshot')
      const existing=loadManagedLaboratoryForms(browserFormStorage(),authenticatedUserId)
      if(!existing||existing.forms.some(form=>form.id===snapshot.form.id)||readFormRecovery(browserFormStorage(),authenticatedUserId)?.documents[snapshot.form.id]){setRecoveryStatus(fa?'این فرم در مرورگر موجود است؛ آن را باز کنید و نسخهٔ سرور را از تنظیمات همان فرم بازیابی کنید.':'Open the existing form and restore its server version in form settings.');return}
      for(const [key,value] of Object.entries(backup.browserData??{}))if(key.startsWith('yarn-trade:')&&typeof value==='string'&&localStorage.getItem(key)===null&&!key.startsWith('yarn-trade:form-document-recovery:')&&!key.startsWith('yarn-trade:form-laboratory-managed-forms:'))localStorage.setItem(key,value)
      if(writeFormRecoveryResult(browserFormStorage(),authenticatedUserId,snapshot,'بازیابی از سرور')!=='saved')throw new Error('Could not restore recovery journal')
      if(!saveManagedLaboratoryForm(browserFormStorage(),authenticatedUserId,managedFormWithDesigner(snapshot.form,snapshot.designerHistory.present)))throw new Error('Could not restore form')
      setManagedForms(loadManagedLaboratoryForms(browserFormStorage(),authenticatedUserId)??existing)
      await openManagedForm(snapshot.form.id)
    } catch { setRecoveryStatus(fa?'بازیابی فرم از سرور انجام نشد؛ داده‌های قبلی حفظ شدند.':'Could not restore the form from the server.') }
    finally { setServerBackupBusy(false) }
  }
  const restoreServerBackup = async (id:string) => {
    if (!id) return
    const formId=activeManagedForm?.id??laboratoryDefinition.id
    setServerBackupBusy(true)
    try {
      const backup=await apiRequest<{format:string;formId:string;snapshot:RecoverableForm & {schema?:FormSchemaDraft;designerHistory:typeof history;frame?:ManagedFormFrame}}>('/api/form-design-backups/'+encodeURIComponent(id))
      if(backup.format!=='yarn-trade.form-design-backup'||backup.formId!==formId)throw new Error('Invalid backup')
      if(!activeManagedForm) {
        const snapshot=backup.snapshot, schema=snapshot?.schema, savedHistory=snapshot?.designerHistory
        if(!schema||schema.id!==formId||!Array.isArray(schema.fields)||!Array.isArray(schema.sections)||savedHistory?.present?.formId!==formId||!Array.isArray(savedHistory.past)||!Array.isArray(savedHistory.future))throw new Error('Invalid laboratory snapshot')
        if(!await backupDocumentToServer(formId,{schema:documentSchema,designerHistory:historyRef.current,frame:activePreviewFrame},'پیش از بازیابی قالب مادر'))return
        localStorage.setItem(motherRecoveryKey,JSON.stringify(schema))
        if(!saveDesignerDraft(browserFormStorage(),authenticatedUserId,formId,savedHistory.present,schema.fields.map(field=>field.id)))throw new Error('Could not save recovered designer')
        restoreDesignerHistory(savedHistory)
        setMotherSchema(schema); setMotherStructureHistory(createManagedFormStructureHistory(schema))
        if(snapshot.frame)updateActivePreviewFrame(snapshot.frame)
        setRecoveryStatus('');setSaveStatus(fa?'نسخهٔ قالب مادر بازیابی شد.':'Laboratory backup restored.')
        return
      }
      if(backup.snapshot?.form?.id!==activeManagedForm.id)throw new Error('Invalid backup')
      const data=new Map<string,string>(), testStorage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}}
      if(writeFormRecoveryResult(testStorage,authenticatedUserId,backup.snapshot,'verify')!=='saved')throw new Error('Invalid snapshot')
      const current=latestRecoverySnapshot()
      if(current&&!await backupToServer(current,'پیش از بازیابی از سرور'))return
      restoreRecoverySnapshot(backup.snapshot)
    } catch { setRecoveryStatus(fa?'بازیابی ممکن نشد؛ نسخهٔ سرور نامعتبر یا غیرقابل دسترس است.':'The server backup is invalid or unavailable.') }
    finally { setServerBackupBusy(false) }
  }
  recoverySnapshotRef.current = activeManagedForm ? { form: { ...activeManagedForm, schema: documentSchema }, designerHistory: history, structureHistory: history.document ? { present: history.document.present, past: history.document.past, future: history.document.future } : managedStructureHistory ?? createManagedFormStructureHistory(documentSchema) } : null
  const currentHandoffForm=useMemo(()=>activeManagedForm?normalizeManagedLaboratoryForm(managedFormWithDesigner({...activeManagedForm,schema:documentSchema},history.present)):null,[activeManagedForm,documentSchema,history.present])
  const handoffSignature=useMemo(()=>JSON.stringify(currentHandoffForm),[currentHandoffForm])
  const canFinalizeDesign=Boolean(preparedHandoff&&JSON.stringify(preparedHandoff.form)===handoffSignature)
  useLayoutEffect(()=>{if(preparedHandoff&&!canFinalizeDesign)setPreparedHandoff(null)},[preparedHandoff,canFinalizeDesign])
  useEffect(()=>{setPreparedHandoff(null)},[activeManagedForm?.id,authenticatedUserId])
  useLayoutEffect(()=>{const snapshot=recoverySnapshotRef.current;if(!snapshot)return;try{if(invalidateChangedDesignReleases(browserFormStorage(),authenticatedUserId,managedFormWithDesigner(snapshot.form,snapshot.designerHistory.present)))window.dispatchEvent(new Event('form-design-releases-updated'))}catch{window.dispatchEvent(new CustomEvent('form-design-release-unsafe',{detail:{formId:snapshot.form.id}}))}},[activeManagedForm,history,authenticatedUserId])
  useEffect(() => {
    const snapshot = recoverySnapshotRef.current
    const formId = snapshot?.form.id ?? laboratoryDefinition.id
    const document = snapshot ?? { schema:documentSchema, designerHistory:history, frame:activePreviewFrame }
    return scheduleAfterDesignerGesture(()=>formFrameRef.current,()=>{void backupDocumentToServer(formId,document,'پشتیبان خودکار')},5000)
  }, [activeManagedForm,history,managedStructureHistory,authenticatedUserId,motherSchema,activePreviewFrame.device,activePreviewFrame.width,activePreviewFrame.height,activePreviewFrame.fitToPage])
  useEffect(()=>{if(!motherSchema)return;try{if(localStorage.getItem(motherRecoveryKey)!==null)localStorage.setItem(motherRecoveryKey,JSON.stringify(motherSchema))}catch{setRecoveryStatus(fa?'ذخیرهٔ محلی قالب بازیابی‌شده ممکن نشد.':'Could not save the recovered laboratory draft.')}},[motherSchema,motherRecoveryKey])
  useEffect(() => {
    const snapshot = recoverySnapshotRef.current
    if (!snapshot) return
    return scheduleAfterDesignerGesture(()=>formFrameRef.current,()=>{persistRecoverySnapshot(snapshot)},180)
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
  const createManagedFormFromLaboratory = () => setNewFormOpen(true)
  const createConfiguredLaboratoryForm = async (schema: FormSchemaDraft, frame: ManagedFormFrame, copyTemplate: boolean, useSchemaLayout: boolean): Promise<boolean> => {
    finishPropertyChange()
    const leaving = latestRecoverySnapshot()
    if (leaving) {
      if (!persistRecoverySnapshot(leaving, 'پیش از ایجاد فرم جدید') || !await backupToServer(leaving, 'پیش از ایجاد فرم جدید')) return false
      if (JSON.stringify(recoverySnapshotRef.current) !== JSON.stringify(leaving)) return false
    } else if (!await backupLaboratoryBeforeSwitch('پیش از ایجاد فرم جدید')) return false
    const templateDesigner = activeManagedForm ? managedForms.templateRevision?.designer ?? loadLaboratoryColorBaseline(authenticatedUserId) : historyRef.current.present
    const baseline = copyTemplate ? { ...structuredClone(templateDesigner), ...(useSchemaLayout ? { layoutMode: 'schema' as const } : {}) } : {
      ...structuredClone(templateDesigner), overrides: {}, actions: {}, canvas: undefined,
      sectionCanvases: {}, tables: {}, tableColumns: {}, tableHeaders: {}, layoutMode: 'schema' as const
    }
    const name = schema.title[language].trim()
    const normalized = { ...schema, title: { fa: name, en: name, zh: name, ...Object.fromEntries(Object.entries(schema.title).filter(([, value]) => value.trim())) } }
    const form = createManagedLaboratoryForm({ id: schema.id, name, mode: schema.mode === 'combined' ? 'hybrid' : schema.mode, templateSchema: normalized, templateDesigner: baseline, frame, templateVersion: managedForms.templateRevision?.version })
    form.schema.title = normalized.title
    const createdSnapshot: RecoverableForm = { form, designerHistory: { present: { ...baseline, formId: form.id }, past: [], future: [], document: { present: form.schema, past: [], future: [] } }, structureHistory: createManagedFormStructureHistory(form.schema) }
    if (!await backupToServer(createdSnapshot, 'ایجاد فرم جدید')) return false
    if (!persistRecoverySnapshot(createdSnapshot, 'ایجاد فرم جدید')) return false
    if (!saveManagedLaboratoryForm(browserFormStorage(), authenticatedUserId, form)) { setRecoveryStatus('ذخیرهٔ فرم جدید ممکن نشد.'); return false }
    setManagedForms(loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId) ?? managedForms)
    setManagedFormDraft(form); setManagedStructureHistory(createManagedFormStructureHistory(form.schema))
    setManagedSettingsTab('settings'); setManagedSidebarCollapsed(false); setManagedStructureEditing(true)
    setManagedSelectedFieldId(null); setManagedFormSaved(true); setManagedFormStatus('')
    prepareManagedFormDesigner(); setManagedFormEditorOpen(false)
    setSharedTemplatePreviewOpen(false); setManagedFormsListOpen(true); setNewFormOpen(false)
    return true
  }
  const updateManagedForm = (update: (current: ManagedLaboratoryForm) => ManagedLaboratoryForm) => {
    setManagedFormDraft(current => current ? update(current) : current)
    setManagedFormSaved(false)
    setManagedFormStatus('')
  }
  const commitManagedStructure = (schema: FormSchemaDraft) => {
    const current = documentSchema
    if (schema === current) return
    if (hasInvalidFieldFocusOrders(schema.fields) && schema.fields.some(field => field.focusOrder !== current.fields.find(previous => previous.id === field.id)?.focusOrder)) {
      setManagedFormStatus(fa ? 'شمارهٔ حرکت Enter باید برای هر فیلد یکتا و بزرگ‌تر از صفر باشد.' : 'Enter positions must be unique positive numbers.')
      return
    }
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
  const removeDocumentActions = (ids: readonly string[]) => {
    const removableIds = [...new Set(ids)].filter(id => documentSchema.actions?.some(action => action.id === id && !action.required))
    if (!removableIds.length) {
      setLayoutStatus(fa ? 'کلیدهای ضروری فرم قابل حذف نیستند.' : 'Required form actions cannot be removed.')
      return
    }
    finishPropertyChange()
    const next = removeOptionalDocumentActions(documentSchema, removableIds)
    if (next === documentSchema) return
    commitManagedStructure(next)
    setActionSelection([])
    setLayoutStatus(fa ? 'کلیدهای انتخاب‌شده حذف شدند؛ کلیدهای ضروری حفظ شدند.' : 'Selected actions removed; required actions were preserved.')
  }
  const removeSelectedActions = () => removeDocumentActions(actionSelection)
  const removeManagedFieldsFromForm = (ids: readonly string[]) => {
    if (!activeManagedForm) return
    const removableIds = [...new Set(ids)].filter(id => documentSchema.fields.some(field => field.id === id))
    if (!removableIds.length) return
    const next = removeManagedFormFields(documentSchema, removableIds)
    if (next === documentSchema) return
    finishPropertyChange()
    commitManagedStructure(next)
    setSelection([])
    setManagedSelectedFieldId(null)
    setLayoutStatus(fa ? `فیلدهای انتخاب‌شده حذف شدند (${removableIds.length}).` : `Selected fields removed (${removableIds.length}).`)
  }
  const removeSelectedManagedFields = () => removeManagedFieldsFromForm([...new Set(selection.map(id => id.split('::')[0]).filter(id => documentSchema.fields.some(field => field.id === id)))])
  const removeSelectedTableColumns = (ids: readonly string[] = selectedTableColumnIds) => {
    if (!activeManagedForm) return
    const table = documentSchema.tables?.find(item => item.id === activeTableId)
    if (!table) return
    const removableIds = [...new Set(ids)].filter(id => table.columns.some(column => column.id === id))
    if (!removableIds.length) return
    const next = removeDocumentColumns(documentSchema, table.id, removableIds)
    if (next === documentSchema) return
    finishPropertyChange()
    commitManagedStructure(next)
    setSelectedTableColumnIds([])
    setLayoutStatus(fa ? `ستون‌های انتخاب‌شده از ساختار جدول حذف شدند (${removableIds.length}).` : `Selected table columns removed (${removableIds.length}).`)
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
  const removeSelectedManagedField = () => { if (managedSelectedFieldId) removeManagedFieldsFromForm([managedSelectedFieldId]) }
  const prepareSavedHandoff = async (snapshot:RecoverableForm,form:ManagedLaboratoryForm,approval:{confirmedAt:string}) => {
    try{
    const ruleIssue=formRuleStructureIssues(form.schema)[0]
    if(ruleIssue){setManagedFormStatus(ruleIssue.message);setManagedSaveDialogOpen(false);setStructureDialog({kind:ruleIssue.section==='field'?'editField':'relationships',fieldId:ruleIssue.fieldId,issueGroupId:ruleIssue.groupId,issueMessage:ruleIssue.message});return}
    const pendingLabels=form.schema.tables?.find(table=>table.columns.some(column=>columnLabelMismatch(form.schema,column,language).length>0))
    if(columnLinkDefaults.requireMismatchResolution&&pendingLabels){setManagedFormStatus('پیش از ثبت طراحی نهایی، ارتباط عنوان‌های قرمز را همگام یا مستقل تأیید کنید.');setStructureDialog({kind:'table',tableId:pendingLabels.id});return}
      const releaseId=crypto.randomUUID()
      const handoffSnapshot={...snapshot,form,structureHistory:{...snapshot.structureHistory,present:form.schema},designerHistory:{...snapshot.designerHistory,...(snapshot.designerHistory.document?{document:{...snapshot.designerHistory.document,present:form.schema}}:{})}}
      const output={...createFormDesignExport(handoffSnapshot,readFormBehaviors(browserFormStorage()),laboratoryOperationalBehavior,formDirectAddress.href),integrationHandoff:{releaseId,permissionsConfirmedAt:approval.confirmedAt,status:'awaiting-integration',operationalTitle:{fa:laboratoryContentTitle(form.schema.title.fa),en:laboratoryContentTitle(form.schema.title.en),zh:laboratoryContentTitle(form.schema.title.zh)},registrationFile:'frontend/src/components/base-form/formIntegrationRegistry.ts'}}
      if(output.diagnostics.length){const issue=output.diagnostics[0],table=form.schema.tables?.find(item=>item.id===issue.id);const message='تحویل متوقف شد؛ '+(table?'جدول «'+(table.title?.fa??table.id)+'»: ':'')+formDesignDiagnosticMessage(issue.code);setManagedFormStatus(message);setManagedSaveDialogOpen(false);setStructureDialog({kind:table?'table':'relationships',tableId:table?.id,issueMessage:message});return}
      const digest=await designDigest(output)
      const result=await apiRequest<{id:string}>('/api/form-design-backups',{method:'POST',body:JSON.stringify({formId:form.id,reason:'integration-handoff',releaseId,digest,snapshot:output})})
      if(!/^[a-f0-9]{32}$/.test(result.id))throw Error('Invalid backup ID')
      const address='/api/form-design-backups/'+result.id+'?handoff=true'
      const restored=await apiRequest<typeof output>(address)
      if(await designDigest(restored)!==digest)throw Error('Handoff read-back mismatch')
      const current=latestRecoverySnapshot()
      if(!current||await designDigest(normalizeManagedLaboratoryForm(managedFormWithDesigner(current.form,current.designerHistory.present)))!==await designDigest(form))throw Error('Form changed during handoff')
      return {form,id:releaseId,metadata:{digest,backupId:result.id,jsonAddress:address,permissionsConfirmedAt:approval.confirmedAt}}
    }catch{setManagedFormStatus('تحویل تأیید نشد؛ فرم را نبندید. اتصال سرور یا تغییر هم‌زمان فرم را بررسی و دوباره ثبت کنید.');return}
  }
  const saveManagedFormDraft = async () => {
    if(saveInProgress.current||handoffInProgress.current)return false
    saveInProgress.current=true
    setHandoffBusy(true)
    setPreparedHandoff(null)
    try{
    finishPropertyChange()
    setColorPreviewDraft(null)
    const formId = managedFormDraft?.id
    const snapshotToSave = latestRecoverySnapshot()
    const formToSave = snapshotToSave ? managedFormWithDesigner(snapshotToSave.form, historyRef.current.present) : null
    if (!formToSave || !formId || !snapshotToSave) {
      setManagedFormStatus(fa ? 'ذخیرهٔ محلی ممکن نشد؛ دادهٔ قبلی حفظ شد.' : 'Local save failed; existing data was preserved.')
      return false
    }
    const saveSnapshot = { ...snapshotToSave, form: formToSave, structureHistory: { ...snapshotToSave.structureHistory, present: formToSave.schema } }
    if (!persistRecoverySnapshot(saveSnapshot, fa ? 'ذخیرهٔ نهایی پیش‌نویس' : 'Explicit draft save')) return false
    if (!await backupToServer(saveSnapshot, 'ذخیرهٔ فرم')) return false
    if (JSON.stringify(recoverySnapshotRef.current) !== JSON.stringify(snapshotToSave)) { setRecoveryStatus(fa?'فرم هنگام پشتیبان‌گیری تغییر کرد؛ دوباره ذخیره کنید.':'The form changed during backup; save again.'); return false }
    if (!saveManagedLaboratoryForm(browserFormStorage(), authenticatedUserId, formToSave)) {
      setManagedFormStatus(fa ? 'ذخیرهٔ فرم انجام نشد؛ نسخهٔ بازیابی محفوظ است.' : 'Form save failed; the recovery version was retained.')
      return false
    }
    const restored = loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId)
    const saved = restored?.forms.find(form => form.id === formId)
    if (!restored || !saved || await designDigest(saved)!==await designDigest(normalizeManagedLaboratoryForm(formToSave))) {
      setManagedFormStatus(fa ? 'تأیید بازیابی پیش‌نویس انجام نشد.' : 'Draft reload verification failed.')
      return false
    }
    if(!await approveSavedDesign(browserFormStorage(),authenticatedUserId,saved)){setManagedFormStatus('فرم ذخیره شد، اما تأیید مجوزهای همین نسخه ثبت نشد؛ دوباره تأیید مجوزها و ذخیره را بزنید.');return false}
    const latestConfirmed=latestRecoverySnapshot()
    if(!latestConfirmed||JSON.stringify(normalizeManagedLaboratoryForm(managedFormWithDesigner(latestConfirmed.form,latestConfirmed.designerHistory.present)))!==JSON.stringify(normalizeManagedLaboratoryForm(formToSave))){setManagedFormStatus('فرم حین تأیید تغییر کرد؛ آخرین وضعیت را دوباره تأیید و ذخیره کنید.');return false}
    const approval=await savedDesignApproval(browserFormStorage(),authenticatedUserId,saved)
    if(!approval)return false
    const handoff=await prepareSavedHandoff(saveSnapshot,saved,approval)
    if(!handoff)return false
    const finalCurrent=latestRecoverySnapshot()
    if(!finalCurrent||JSON.stringify(normalizeManagedLaboratoryForm(managedFormWithDesigner(finalCurrent.form,finalCurrent.designerHistory.present)))!==JSON.stringify(saved)||!await savedDesignApproval(browserFormStorage(),authenticatedUserId,saved)){setManagedFormStatus('فرم هنگام آماده‌سازی JSON تغییر کرد؛ دوباره ذخیره کنید.');return false}
    setPreparedHandoff(handoff)
    setManagedForms(restored)
    setManagedFormDraft(saved)
    setManagedStructureHistory(current => current ? { ...current, present: saved.schema } : createManagedFormStructureHistory(saved.schema))
    setManagedFormSaved(true)
    setManagedSaveDialogOpen(false)
    setManagedFormStatus(fa ? 'فرم و مجوزها ذخیره و بررسی شدند؛ برای افزودن مورد زرد در آزمایشگاه، «ثبت اتصال به منو» کنار ذخیره را بزنید.' : 'Form and permissions saved and verified. Use Register menu handoff beside Save to add the pending menu entry.')
    return true
    }finally{saveInProgress.current=false;setHandoffBusy(false)}
  }
  const registerMotherTemplate = async () => {
    finishPropertyChange()
    const storage = browserFormStorage()
    const current = loadManagedLaboratoryForms(storage, authenticatedUserId)
    if (!storage || !current) { setTemplateRegistrationStatus(fa ? 'خواندن حافظهٔ محلی ممکن نشد.' : 'Local storage is unavailable.'); return false }
    const before=historyRef.current, schema=motherSchema ?? createLaboratorySchemaTemplate(before.present)
    if(!await backupDocumentToServer(laboratoryDefinition.id,{schema,designerHistory:before,frame:activePreviewFrame},'ثبت قالب مادر'))return false
    if(historyRef.current!==before){setTemplateRegistrationStatus(fa?'قالب هنگام پشتیبان‌گیری تغییر کرد؛ دوباره ثبت کنید.':'The design changed during backup; retry.');return false}
    try {
      const designer = { ...historyRef.current.present, formId: laboratoryDefinition.id }
      const next = registerTemplateRevision(current, { schema: motherSchema ?? createLaboratorySchemaTemplate(designer), designer, frame: activePreviewFrame, createdAt: new Date().toISOString() }, templateTargetIds)
      storage.setItem(managedLaboratoryFormsStorageKey(authenticatedUserId), JSON.stringify(next))
      const restored = loadManagedLaboratoryForms(storage, authenticatedUserId)
      if (!restored || restored.templateRevision?.version !== next.templateRevision?.version) throw new Error('Template reload verification failed.')
      setManagedForms(restored)
      saveSessionDraft()
      localStorage.removeItem(motherRecoveryKey)
      setTemplateRegistrationOpen(false)
      setTemplateRegistrationStatus(fa ? 'نسخهٔ قالب مادر ثبت شد؛ فقط فرم‌های انتخاب‌شده به‌روزرسانی شدند.' : 'Master template registered; only selected forms were updated.')
      return true
    } catch { setTemplateRegistrationStatus(fa ? 'ثبت نسخه ممکن نشد؛ فرم باز را نبندید.' : 'Registration failed; keep the current form open.'); return false }
  }
  const openManagedForm = async (formId: string) => {
    if (!isDesignAvailable(browserFormStorage(), authenticatedUserId, formId)) {setRecoveryStatus('این نسخه بایگانی یا از فهرست حذف شده است؛ ابتدا از مدیریت فرم‌ها آن را بازگردانید.'); return}
    if (activeManagedForm?.id === formId) { setManagedFormsListOpen(false); setManagedSidebarCollapsed(false); setDesignerOpen(true); return }
    finishPropertyChange()
    const leaving = latestRecoverySnapshot()
    if (leaving && !persistRecoverySnapshot(leaving, fa ? 'تغییر فرم فعال' : 'Switch active form')) return
    if (leaving && !await backupToServer(leaving, 'تغییر فرم فعال')) return
    if (!leaving && !await backupLaboratoryBeforeSwitch('پیش از تغییر فرم فعال')) return
    if (leaving && JSON.stringify(recoverySnapshotRef.current) !== JSON.stringify(leaving)) { setRecoveryStatus(fa?'فرم هنگام پشتیبان‌گیری تغییر کرد؛ دوباره اقدام کنید.':'The form changed during backup; try again.'); return }
    const recovered = readFormRecovery(browserFormStorage(), authenticatedUserId)?.documents[formId]?.current
    const form = recovered?.form ?? managedForms.forms.find(item => item.id === formId) ?? loadDesignReleases(browserFormStorage(), authenticatedUserId)?.slice().reverse().find(item => item.formId === formId)?.snapshot
    if (!form) { setRecoveryStatus(fa ? 'فرم این نشانی در حساب و مرورگر فعلی پیدا نشد؛ هیچ فرمی جایگزین نشد.' : 'This form was not found in the current account and browser; no form was replaced.'); return }
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
  const closeManagedFormEditor = async (keepDesigner = false) => {
    finishPropertyChange()
    const latest = latestRecoverySnapshot()
    if (latest && !persistRecoverySnapshot(latest, fa ? 'بستن فرم' : 'Close form')) return false
    if (latest && !await backupToServer(latest, 'بستن فرم')) return false
    if (latest && JSON.stringify(recoverySnapshotRef.current) !== JSON.stringify(latest)) { setRecoveryStatus(fa?'فرم هنگام پشتیبان‌گیری تغییر کرد؛ دوباره بستن را انتخاب کنید.':'The form changed during backup; close again.'); return false }
    if (latest && !saveManagedLaboratoryForm(browserFormStorage(), authenticatedUserId, managedFormWithDesigner(latest.form, latest.designerHistory.present))) { setRecoveryStatus(fa?'ذخیرهٔ فرم انجام نشد؛ پشتیبان سرور محفوظ است.':'Form save failed; the server backup was retained.'); return false }
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
  const changeDesignLifecycle = async (id: string, state: DesignLifecycle) => {
    if (lifecycleBusy) return
    const message = state === 'active' ? 'این نسخه به فهرست طراحی بازگردد؟'
      : state === 'archived' ? 'این نسخه بایگانی و از منوی انتظار اتصال پنهان شود؟ طراحی و سوابق آن و فرم عملیاتی محفوظ می‌مانند.'
      : 'این نسخه از فهرست طراحی و منوی انتظار اتصال حذف شود؟ برای جلوگیری از حذف اشتباه، در بخش حذف‌شده‌ها قابل بازیابی می‌ماند. داده‌های عملیاتی حذف نمی‌شوند.'
    if (!window.confirm(message)) return
    setLifecycleBusy(true)
    try {
      // Close through the existing backup gate before hiding the active document.
      if (activeManagedForm?.id === id && state !== 'active' && !await closeManagedFormEditor(true)) return
      if (!setDesignLifecycle(browserFormStorage(), authenticatedUserId, id, state)) {setRecoveryStatus('ذخیرهٔ وضعیت انجام نشد؛ هیچ فرم یا سابقه‌ای حذف نشد.'); return}
      setDesignLifecycles(readDesignLifecycles(browserFormStorage(), authenticatedUserId) ?? {})
      setRecoveryStatus(state === 'active' ? 'نسخه به فهرست طراحی بازگشت.' : 'نسخه از فهرست فعال کنار گذاشته شد؛ طراحی، پشتیبان‌ها و داده‌های عملیاتی محفوظ‌اند.')
      window.dispatchEvent(new Event('form-design-releases-updated'))
    } finally {setLifecycleBusy(false)}
  }
  const switchToLaboratory = async () => {
    if (activeManagedForm && !await closeManagedFormEditor(true)) return
    setManagedFormsListOpen(false); setManagedSidebarCollapsed(false); setManagedSettingsTab('design')
    designerOpenRef.current = true; setDesignerOpen(true)
  }
  useEffect(()=>{
    if(!registerCloseGuard)return
    registerCloseGuard(async()=>{
      if(activeManagedForm)return closeManagedFormEditor()
      const current=historyRef.current, schema=documentSchema, frame=activePreviewFrame
      if(!await backupDocumentToServer(laboratoryDefinition.id,{schema,designerHistory:current,frame},'بستن آزمایشگاه'))return false
      if(historyRef.current!==current){setRecoveryStatus(fa?'قالب هنگام پشتیبان‌گیری تغییر کرد؛ دوباره ببندید.':'The design changed during backup; close again.');return false}
      try{localStorage.setItem(motherRecoveryKey,JSON.stringify(schema));if(!saveSessionDraft())return false;return true}catch{setRecoveryStatus(fa?'ذخیرهٔ محلی قالب انجام نشد.':'Could not save the laboratory draft.');return false}
    })
    return ()=>registerCloseGuard(null)
  },[registerCloseGuard,activeManagedForm,history,motherSchema,authenticatedUserId,activePreviewFrame.device,activePreviewFrame.width,activePreviewFrame.height,activePreviewFrame.fitToPage])
  const designOpening = useRef(false)
  const beginIndependentDesignVersion = async (formId: string) => {
    if(designOpening.current)return
    if(!isDesignAvailable(browserFormStorage(),authenticatedUserId,formId))return
    if(!window.confirm('نسخهٔ مستقل جدیدی از همین طراحی ساخته شود؟ نسخهٔ قبلی و سوابقش محفوظ می‌مانند.'))return
    designOpening.current=true
    try{
      finishPropertyChange()
      const leaving=latestRecoverySnapshot()
      if(leaving&&!persistRecoverySnapshot(leaving,'پیش از ایجاد نسخهٔ جدید'))return
      if(leaving&&!await backupToServer(leaving,'پیش از ایجاد نسخهٔ جدید'))return
      if(!leaving&&!await backupLaboratoryBeforeSwitch('پیش از ایجاد نسخهٔ جدید'))return
      if(leaving&&JSON.stringify(recoverySnapshotRef.current)!==JSON.stringify(leaving)){setRecoveryStatus('فرم هنگام پشتیبان‌گیری تغییر کرد؛ دوباره اقدام کنید.');return}
      const documents=readFormRecovery(browserFormStorage(),authenticatedUserId)?.documents??{}
      const forms=Array.from(new Map([...managedForms.forms,...Object.values(documents).map(document=>document.current.form)].map(form=>[form.id,form])).values())
      const source=leaving?.form.id===formId?managedFormWithDesigner(leaving.form,leaving.designerHistory.present):forms.find(form=>form.id===formId)
      if(!source){setRecoveryStatus('سند طراحی پیدا نشد؛ نسخهٔ جدیدی ساخته نشد.');return}
      const form=forkManagedDesign(source,'form.version.'+crypto.randomUUID(),forms)
      setManagedFormDraft(form);setManagedStructureHistory(createManagedFormStructureHistory(form.schema));setManagedFormSaved(false)
      setManagedSettingsTab('design');setManagedSidebarCollapsed(false);setManagedFormStatus('');setManagedFormsListOpen(false)
      prepareManagedFormDesigner();setManagedFormEditorOpen(true)
    }finally{designOpening.current=false}
  }
  const beginOperationalRedesign = async (contract: OperationalFormContract, newVersion = false) => {
    if (designOpening.current) return
    designOpening.current = true
    try {
    const documents = readFormRecovery(browserFormStorage(), authenticatedUserId)?.documents ?? {}
    const allForms = Array.from(new Map([...managedForms.forms, ...Object.values(documents).map(document=>document.current.form)].map(form=>[form.id,form])).values())
    if(activeManagedForm){const index=allForms.findIndex(form=>form.id===activeManagedForm.id);if(index>=0)allForms.splice(index,1);allForms.push(activeManagedForm)}
    const routeForms = allForms.filter(form=>(operationalSource(form.schema)?.route===contract.route||form.schema.id==='operational.'+contract.route)&&isDesignAvailable(browserFormStorage(),authenticatedUserId,form.id))
    const dates = Object.fromEntries(Object.entries(documents).map(([id,document])=>[id,document.editedAt??document.updatedAt]))
    const existing = managedDesignGroups(routeForms,dates,activeManagedForm?.id)[0]?.[0]
    if(existing && !newVersion){await openManagedForm(existing.id);return}
    if(newVersion && !window.confirm('نسخهٔ مستقل جدید ساخته شود؟ نسخهٔ قبلی محفوظ می‌ماند و بازکردن عادی طراحی، نسخهٔ دیگری ایجاد نمی‌کند.'))return
    finishPropertyChange()
    const leaving = latestRecoverySnapshot()
    if (leaving && !persistRecoverySnapshot(leaving, 'پیش از بازکردن بازطراحی مستقل')) return
    if (leaving && !await backupToServer(leaving, 'پیش از بازکردن بازطراحی مستقل')) return
    if (!leaving && !await backupLaboratoryBeforeSwitch('پیش از بازکردن بازطراحی مستقل')) return
    if (leaving && JSON.stringify(recoverySnapshotRef.current) !== JSON.stringify(leaving)) { setRecoveryStatus(fa?'فرم هنگام پشتیبان‌گیری تغییر کرد؛ دوباره اقدام کنید.':'The form changed during backup; try again.'); return }
    const isRouteForm=(form:ManagedLaboratoryForm)=>operationalSource(form.schema)?.route===contract.route||form.schema.id==='operational.'+contract.route
    const activeRouteForm=activeManagedForm&&isRouteForm(activeManagedForm)
      ? managedFormWithDesigner({...activeManagedForm,schema:historyRef.current.document?.present??activeManagedForm.schema},historyRef.current.present)
      : undefined
    const sourceForm=activeRouteForm??existing
    const pin = managedForms.catalogTemplates?.[contract.route] ?? managedForms.templateRevision
    const currentDesigner = sourceForm ? activeRouteForm ? historyRef.current.present : resolveManagedLaboratoryDesigner(sourceForm) : activeManagedForm ? loadLaboratoryColorBaseline(authenticatedUserId) : historyRef.current.present
    const sourceSchema = sourceForm?.schema ?? pin?.schema ?? motherSchema ?? createLaboratorySchemaTemplate(currentDesigner)
    const template = sourceForm ? currentDesigner : pin?.designer ?? currentDesigner
    const frame = sourceForm?.frame ?? pin?.frame ?? (activeManagedForm ? initialPreviewFrame : activePreviewFrame)
    const version = sourceForm?.template.version ?? pin?.version ?? 1
    const id = 'form.redesign.' + crypto.randomUUID()
    const form = sourceForm ? forkManagedDesign(sourceForm,id,allForms) : createOperationalRedesign(contract,id,template,frame,version,sourceSchema)
    setManagedFormDraft(form); setManagedStructureHistory(createManagedFormStructureHistory(form.schema)); setManagedFormSaved(false)
    setManagedSettingsTab('design'); setManagedSidebarCollapsed(false); setManagedFormStatus(''); setManagedFormsListOpen(false)
    prepareManagedFormDesigner(); setManagedFormEditorOpen(true)
    } finally {designOpening.current=false}
  }
  const finalizeActiveDesign = async () => {
    if(handoffInProgress.current)return
    handoffInProgress.current=true
    setHandoffBusy(true)
    try{
    finishPropertyChange()
    const snapshot = latestRecoverySnapshot()
    if (!snapshot) return
    const form = normalizeManagedLaboratoryForm(managedFormWithDesigner(snapshot.form, snapshot.designerHistory.present))
    if(!form){setManagedFormStatus('ساختار فرم برای ذخیره معتبر نیست.');return}
    const approval=await savedDesignApproval(browserFormStorage(),authenticatedUserId,form)
    if(!approval){setManagedFormStatus('ابتدا مجوزهای کاربران را مشخص کنید و «تأیید مجوزها و ذخیره» را بزنید؛ تغییرات ذخیره‌نشده قابل تحویل نیستند.');setManagedSaveDialogOpen(true);return}
    const handoff=preparedHandoff
    if(!handoff||JSON.stringify(handoff.form)!==JSON.stringify(form)){setManagedFormStatus('ابتدا همین نسخه را ذخیره کنید تا JSON کامل آماده شود.');return}
    try{
      const restored=await apiRequest(handoff.metadata.jsonAddress)
      if(await designDigest(restored)!==handoff.metadata.digest)throw Error('Handoff read-back mismatch')
    }catch{setPreparedHandoff(null);setManagedFormStatus('JSON ذخیره‌شده قابل تأیید نیست؛ دوباره ذخیره کنید.');return}
    const finalSnapshot=latestRecoverySnapshot()
    if(!finalSnapshot||JSON.stringify(normalizeManagedLaboratoryForm(managedFormWithDesigner(finalSnapshot.form,finalSnapshot.designerHistory.present)))!==JSON.stringify(form)||!await savedDesignApproval(browserFormStorage(),authenticatedUserId,form)){setManagedFormStatus('آخرین نسخه تغییر کرده یا تأیید آن معتبر نیست؛ دوباره تأیید و ذخیره کنید.');return}
    const afterApproval=latestRecoverySnapshot()
    if(!afterApproval||JSON.stringify(normalizeManagedLaboratoryForm(managedFormWithDesigner(afterApproval.form,afterApproval.designerHistory.present)))!==JSON.stringify(form)){setManagedFormStatus('نسخه هنگام بررسی تغییر کرد؛ دوباره تأیید کنید.');return}
    const release = finalizeDesign(browserFormStorage(), authenticatedUserId, form, handoff.id,undefined,handoff.metadata)
    if (!release) { setManagedFormStatus('ثبت نسخه نهایی ممکن نشد؛ فرم و نسخه‌های قبلی محفوظ هستند.'); return }
    setManagedForms(loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId)!)
    setManagedFormStatus('آخرین نسخهٔ ذخیره‌شده با مجوزهای تأییدشده تحویل شد؛ اطلاعات JSON به همان فرم در منوی انتظار پیوست است.')
    setRecoveryRevision(value => value + 1)
    window.dispatchEvent(new Event('form-design-releases-updated'))
    setPreparedHandoff(null)
    }finally{handoffInProgress.current=false;setHandoffBusy(false)}
  }
  useEffect(() => {
    const open = (event: Event) => { const id = (event as CustomEvent<string>).detail; if (typeof id === 'string') openManagedForm(id) }
    window.addEventListener('open-form-design-draft', open)
    return () => window.removeEventListener('open-form-design-draft', open)
  })
  useEffect(() => {
    if (!requestedDesign) return
    if (requestedDesign.id === laboratoryDefinition.id) {
      if (activeManagedForm) closeManagedFormEditor(true)
    } else openManagedForm(requestedDesign.id)
  }, [requestedDesign?.sequence])
  const formDirectAddress = new URL(window.location.href)
  formDirectAddress.searchParams.set('formDesign', activeManagedForm?.id ?? laboratoryDefinition.id)
  formDirectAddress.hash = ''
  const startFullFormTest = () => {
    finishPropertyChange()
    setSelection([]); setToolbarSelection(null)
    setFormRuntimeTesting(true); setComponentTestMode(true)
  }
  const exportActiveForm = () => {
    const snapshot = latestRecoverySnapshot()
    if (!snapshot) return
    let output: ReturnType<typeof createFormDesignExport>
    try { output = createFormDesignExport(snapshot, readFormBehaviors(browserFormStorage()), laboratoryOperationalBehavior, formDirectAddress.href) }
    catch { setManagedFormStatus('خروجی ساخته نشد؛ ابتدا مرجع رفتارهای فرم را بررسی کنید. هیچ داده‌ای تغییر نکرد.'); return }
    const form = output.form
    const url = URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json;charset=utf-8'}))
    const link = document.createElement('a')
    link.href=url; link.download=`form-design-${form.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`
    document.body.append(link); link.click(); link.remove()
    setManagedFormStatus(output.diagnostics.length ? 'خروجی همراه هشدار ساختار جدول ذخیره شد؛ پیش از تحویل، بخش diagnostics فایل بررسی شود.' : 'خروجی طراحی، قرارداد رفتارها و تاریخچهٔ همین سند ذخیره شد؛ داده‌های زندهٔ آزمایش و اتصال عملیاتی جزو این خروجی نیستند.')
    window.setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
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
  const metricsCanvas = measuredLayoutGeometry?.canvas ?? canvas
  const layoutMetrics = layoutSelection.flatMap(id => {
    const rect = metricsCanvas?.fields[id]?.input
    if (!rect) return []
    const others = Object.entries(metricsCanvas?.fields??{}).filter(([key]) => key !== id).map(([, field]) => field.input)
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
  const sharedDesignerPanel = designerOpen && <FormLaboratoryDesignerPanel selectionLabel={toolbarSelection?'انتخاب نوار جدول: '+toolbarSelection.parts.map(part=>toolbarPartLabel(part)).join('، '):selectedTableColumnIds.length?'سرستون انتخاب‌شده: '+selectedTableColumnIds.map(id=>activeDesignerColumns.find(column=>column.id===id)?.label??id).join('، '):selection.length?'فیلد انتخاب‌شده: '+selection.map(id=>activeFieldLabels[id.split('::')[0]]??id).join('، '):undefined} toolbarControls={<><button type="button" onClick={()=>setBehaviorEditorOpen(true)}>مدیریت رفتار و قرارداد فرم‌ها</button><button type="button" title="اجرای فرم کامل با دادهٔ آزمایشی، اعتبارسنجی و کلیدهای فرم" onClick={startFullFormTest}>آزمایش فرم کامل</button><button type="button" title="آزمایش فهرست و رفتار یک کامپوننت در کتابخانه" onClick={()=>setComponentLibraryOpen(true)}>کتابخانه و آزمایش کامپوننت‌ها</button><label className="designer-guide-control"><input type="checkbox" aria-label="نمایش خطوط راهنمای چیدمان" checked={layoutGuideStep>0} onChange={event=>setLayoutGuideStep(event.target.checked?20:0)}/>نمایش خطوط راهنمای چیدمان</label>{layoutGuideStep>0&&<label>گام خطوط راهنما (px)<input type="number" aria-label="گام خطوط راهنما" min="4" max="100" value={layoutGuideStep} onChange={event=>setLayoutGuideStep(Math.max(4,Math.min(100,Number(event.target.value)||20)))}/></label>}{toolbarSelection&&documentSchema.tables?.filter(table=>table.id===toolbarSelection.tableId).map(table=><GridToolbarControls key={table.id} schema={documentSchema} table={table} onPreview={(part,patch)=>setToolbarColorPreview(patch?{tableId:table.id,part,patch,parts:toolbarSelection.parts}:null)} onChange={commitManagedStructure} selectedParts={toolbarSelection.parts} selectionRequest={toolbarSelectionRequest} propertyRequest={toolbarPropertyRequest?.tableId===table.id?toolbarPropertyRequest:undefined} onSelect={part=>selectToolbar(table.id,part)} onFont={part=>openToolbarFont(table.id,part)} onAlign={applyAlignment}/>)}</>} externalFormManagement neighborResize={neighborResizeFor(visibleDraft)} onNeighborResizeChange={changeNeighborResize} layoutMetrics={layoutMetrics} documentLibrary={activeManagedForm ? { blueprints: fieldBlueprints, onCreate: sourceId => setStructureDialog({ kind: 'addField', sectionId: editorSectionId, sourceId }), onManageForms: () => setManagedFormsListOpen(true) } : undefined} geometryEditable={geometryEditable} propertyRequest={propertyRequest} onElementAppearanceCommit={commitElementAppearance} onElementAppearancePreview={previewElementAppearance} onFinishPropertyChange={finishPropertyChange} language={language} draft={tableDesignerDraft} onTableFontChange={updateTableFont} selectedTableColumn={selectedTableColumn ? { id: selectedTableColumn.id, label: selectedTableColumn.label, style: tableDesignerDraft.tableColumns?.[selectedTableColumn.id] } : undefined} selectedTableHeader={selectedTableHeader ? { id: selectedTableHeader.id, label: selectedTableHeader.label, style: tableDesignerDraft.tableHeaders?.[selectedTableHeader.id] } : undefined} tableHeaderScope={headerStyleScope} onTableHeaderScopeChange={setHeaderStyleScope} tableHeaderHeight={tableDesignerDraft.tableHeaderHeight ?? 42} onTableHeaderHeightChange={setTableHeaderHeight} onTableColumnStyleChange={updateTableColumnStyle} onTableHeaderStyleChange={updateTableHeaderStyle} onTableColumnColorCommit={(id, color) => commitTableStyleColor('column', id, color)} onTableColumnColorPreview={(id, color) => previewTableStyleColor('column', id, color)} onTableColumnBackgroundColorCommit={commitTableColumnBackgroundColor} onTableColumnBackgroundColorPreview={previewTableColumnBackgroundColor} onTableHeaderColorCommit={(id, property, color) => commitTableStyleColor('header', id, color, property)} onTableHeaderColorPreview={(id, property, color) => previewTableStyleColor('header', id, color, property)} filterPopupFontSize={tableDesignerDraft.filterPopupFontSize ?? 16} onFilterPopupFontSizeChange={updateFilterPopupFontSize} gridSearchPosition={tableDesignerDraft.gridSearchPosition ?? 'right'} onGridSearchPositionChange={updateGridSearchPosition} buttonPressEffectEnabled={history.present.buttonPressEffect !== false} onButtonPressEffectChange={updateButtonPressEffect} onBeginFilterPopupFontSizeChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitFilterPopupFontSizeChange={() => dispatchHistory({ type: 'commitTransaction' })} selectedFieldIds={selection} selectedActionIds={actionSelection} actions={activeActions} actionBarHeight={visibleDraft.actionBarHeight} onActionBarHeightChange={updateActionBarHeight} onActionVisibilityChange={changeActionVisibility} onSelectAction={(id, extend = false) => { setSelection([]); setActionSelection(current => extend ? current.includes(id) ? current.filter(item => item !== id) : [...current, id] : [id]); setApplyToAll(false) }} onRemoveSelectedActions={removeSelectedActions} onActionTextChange={updateActionText} actionTranslationStatus={actionTranslationStatus} onActionAutoTranslate={(id, locale) => { const action = activeActions.find(item => item.id === id); if (action) updateActionText(id, language, designerActionLabel(historyRef.current.present, action, language), locale) }} onActionTextPropertyChange={updateActionTextProperty} onActionColorCommit={commitActionColor} onActionColorPreview={previewActionColor} onClearSelection={() => { setSelection([]); setActionSelection([]);setToolbarSelection(null);setSelectedTableColumnIds([]);setActionBarSelected(false) }} fieldIds={activeFieldIds} listComponentFieldIds={componentPopupFieldIds} fieldLabels={activeFieldLabels} applyToAll={applyToAll} canSave={Boolean(authenticatedUserId || activeManagedForm)} saveStatus={saveStatus} onApplyToAllChange={setApplyToAll} onChange={updateProperty} onOpenFontFormatDialog={part => openSelectedTextFormatDialog(part)} onColorCommit={commitColorProperty} onColorPreview={previewColorProperty} onAppearanceColorCommit={commitAppearanceColor} onAppearanceColorPreview={previewAppearanceColor} onBeginColorChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitColorChange={() => dispatchHistory({ type: 'commitTransaction' })} onUndo={undo} onRedo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onResetSelected={resetSelected} onResetAll={resetAll} onSave={saveDraft} onCancel={cancelDesigner} onSelectAll={selectAllGeometryFields} onSmartLayout={applySmartGeometryLayout} onLayout={applyLayout} onAlign={applyAlignment} referenceFieldId={referenceId} onReferenceChange={setReferenceId}  managedStructure={activeManagedForm ? { enabled: managedStructureEditing, onEnabledChange: enabled => setManagedStructureEditing(enabled), selectedFieldId: managedSelectedFieldId, selectedFieldCount: selectedDesignerInputs(selection, documentSchema.fields.map(field => field.id)).length, onRemoveSelectedFields: removeSelectedManagedFields, selectedFieldLabel: selectedManagedField?.label[language], onRename: label => selectedManagedField && renameManagedField(selectedManagedField.id, label), onRemove: removeSelectedManagedField, canUndo: Boolean(history.past.length), canRedo: Boolean(history.future.length), onUndo: undoManagedStructure, onRedo: redoManagedStructure } : undefined} layoutStatus={layoutStatus} />
  const runRuntimeAction=(action:'create'|'copyLast'|'copySelected'|'save'|'close'|'edit'|'delete'|'first'|'last'|'previous'|'next')=>{
    if (treeEntryActive && action === 'close') { formFrameRef.current?.querySelector<HTMLFormElement>('.cascading-tree-inline-add')?.reset(); return }
    if (action === 'create' && startTreeCreate()) return
    if (action === 'save') {
      const treeEntry = formFrameRef.current?.querySelector<HTMLFormElement>('.cascading-tree-inline-add')
      if (treeEntry) { treeEntry.requestSubmit(); return }
    }
    if(['first','last','previous','next'].includes(action)){
      const current=runtime.records.findIndex(row=>row.id===runtime.selectedId),index=action==='first'?0:action==='last'?runtime.records.length-1:Math.max(0,Math.min(runtime.records.length-1,current+(action==='previous'?-1:1)))
      const row=runtime.records[index];if(row)dispatchRuntime({type:'select',id:String((row as unknown as {__parentId?:string}).__parentId??row.id),values:(row as unknown as {__runtimeValues?:Record<string,string>}).__runtimeValues});return
    }
    if(action==='close'&&runtime.mode==='view'){setFormRuntimeTesting(false);setComponentTestMode(false);setRuntimeBehaviorPreview(null);return}
    if(action==='create'||action==='copyLast'||action==='copySelected'){
      const source=action==='copyLast'?runtime.records.at(-1):action==='copySelected'?runtime.records.find(row=>row.id===runtime.selectedId):undefined
      if(action!=='create'&&(!source||runtime.mode!=='view'))return
      const defaults:Record<string,string>=action==='create'
        ?Object.fromEntries(documentSchema.fields.filter(field=>field.kind!=='hidden'&&!field.readOnly&&!['base-form.batch-values','base-form.packaging-volume'].includes(field.componentId)).map(field=>[field.id,componentTestValues[documentSchema.id+':'+field.id]?.defaultValue??'']))
        :Object.fromEntries(documentSchema.fields.filter(field=>field.kind!=='hidden'&&!field.readOnly&&!['id','rowversion','createdatutc','updatedatutc'].includes(field.id.toLowerCase())).map(field=>[field.id,effectiveFieldRules(field).unique||effectiveFieldRules(field).code?'':source!.values[field.id]??'']))
      const batchSamples=Object.fromEntries(documentSchema.fields.filter(f=>['base-form.batch-values','base-form.packaging-volume'].includes(f.componentId)).map(field=>{const items=(source?.details?.[field.id]??[]).map(item=>({...item,id:crypto.randomUUID()}));const initial=field.componentId==='base-form.packaging-volume'?items.find(item=>(item as PackagingVolumeItem).isDefault):items[0];defaults[field.id]=initial?.value??'';return [documentSchema.id+':'+field.id,{value:initial?.value??'',options:items.map(item=>item.value),batchItems:items}]}));setComponentTestValues(current=>({...current,...batchSamples}))
      const errors:Record<string,string>={};suggestedCodeFields.current.clear()
      for(const field of documentSchema.fields)if(effectiveFieldRules(field).code&&fieldCodeSettings(field).incremental&&!defaults[field.id]){const suggestion=suggestComponentCode(runtime.records.map(row=>row.values[field.id]??''),fieldCodeSettings(field));defaults[field.id]=suggestion.value;if(suggestion.value)suggestedCodeFields.current.add(field.id);if(suggestion.error)errors[field.id]=suggestion.error}
      if(action==='create')dispatchRuntime({type:'create',defaults})
      else dispatchRuntime({type:'copy',source:action==='copyLast'?'last':'selected',defaults})
      setRuntimeErrors(errors);requestAnimationFrame(()=>{const grid=formFrameRef.current?.querySelector<HTMLElement>('.laboratory-form-grid');const input=grid?orderedEntryControls(grid)[0]?.value:undefined;input?.focus();if(input instanceof HTMLInputElement&&suggestedCodeFields.current.has(input.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId??''))input.select()});return
    }
    if(action==='save'){
      const draft=evaluateDerivedFields(documentSchema.fields,{...runtime.draft},language);for(const field of documentSchema.fields)if(effectiveFieldRules(field).code)draft[field.id]=formatComponentCode(draft[field.id]??'')
      const details:BatchValueDetails=Object.fromEntries(documentSchema.fields.filter(field=>['base-form.batch-values','base-form.packaging-volume'].includes(field.componentId)).map(field=>[field.id,componentTestValues[documentSchema.id+':'+field.id]?.batchItems??[]]));
      const errors=validateTestRecord(documentSchema,draft,runtime.records,runtime.mode==='edit'?runtime.selectedId:null,details);setRuntimeErrors(errors)
      if(Object.keys(errors).length){const field=formFrameRef.current?.querySelector<HTMLElement>('[data-field-id="'+Object.keys(errors)[0]+'"]');field?.scrollIntoView({block:'nearest',inline:'nearest'});field?.querySelector<HTMLElement>('input,textarea,select')?.focus({preventScroll:true});return}
      dispatchRuntime({type:'save',id:'sample.'+crypto.randomUUID(),values:draft,details});return
    }
    if(action==='close'&&runtime.mode!=='view'&&(runtimeBehaviorPreview?resolveFormBehavior(runtimeBehaviorPreview.library,effectiveBehaviorId):currentFormPolicy(effectiveBehaviorId)).confirmCancel&&!window.confirm('ورود اطلاعات آزمایشی بسته شود؟'))return
    if(action==='edit'){const record=runtime.records.find(row=>row.id===runtime.selectedId);setComponentTestValues(current=>{const next={...current};for(const field of documentSchema.fields.filter(f=>['base-form.batch-values','base-form.packaging-volume'].includes(f.componentId))){const items=structuredClone(record?.details?.[field.id]??[]);next[documentSchema.id+':'+field.id]={value:runtime.draft[field.id]??'',options:items.map(item=>item.value),batchItems:items}}return next})}
    dispatchRuntime({type:action as 'close'|'edit'|'delete'});setRuntimeErrors({})
  }
  const batchFieldForTable=(table:NonNullable<FormSchemaDraft['tables']>[number])=>documentSchema.fields.find(field=>field.componentId==='base-form.batch-values'&&table.columns.some(column=>column.sourceFieldIds?.includes(field.id)||column.binding.kind==='formField'&&column.binding.fieldId===field.id))??(table.id===documentSchema.tables?.[0]?.id?documentSchema.fields.find(field=>field.componentId==='base-form.batch-values'):undefined)
  const runtimeRows=(table:NonNullable<FormSchemaDraft['tables']>[number])=>batchValueReportRows(runtime.records,batchFieldForTable(table)?.id).map(row=>{const values=evaluateDerivedFields(documentSchema.fields,row.values,language);return {...values,id:row.id,__parentId:row.parentId,__runtimeValues:values}}) as unknown as SyntheticPerson[]
  const runtimeColumns=(table:NonNullable<FormSchemaDraft['tables']>[number])=>{const columns=table.columns.map(column=>({id:column.id,label:column.label[language],width:column.width??160,type:'text' as const,multiline:column.valueComposition==='newline',value:(row:SyntheticPerson)=>{const values=(row as unknown as {__runtimeValues:Record<string,string>}).__runtimeValues;const binding=column.binding;const key=binding.kind==='formField'?binding.fieldId:binding.kind==='dataField'?binding.dataFieldId:'';const linked=column.sourceFieldIds?.map(id=>values[id]??'')??[];return linked.length>1?composeColumnFieldValue(linked,column):values[key]??linked[0]??''}}));const field=batchFieldForTable(table);if(field&&!table.columns.some(column=>column.sourceFieldIds?.includes(field.id)||column.binding.kind==='formField'&&column.binding.fieldId===field.id))columns.push({id:'batch-report:'+field.id,label:field.label[language],width:160,type:'text',multiline:false,value:(row:SyntheticPerson)=>(row as unknown as {__runtimeValues:Record<string,string>}).__runtimeValues[field.id]??''});return columns}
  const basePresentationSchema = gridFormatDialog?.scope==='toolbar'?toolbarSchemaFromDialog(gridFormatDialog):activeManagedForm?documentSchema:motherSchema ?? { ...laboratoryPresentationSchema, tables: documentSchema.tables, fields: documentSchema.fields }
  const structuralSelection = activeManagedForm ? { selectedFieldId: managedSelectedFieldId, onSelect: (id: string, event: React.MouseEvent) => { activateEditorForField(id); setManagedSelectedFieldId(id); selectField(id, event, 'input') } } : undefined
  const activePresentationSchema=toolbarColorPreview?{...basePresentationSchema,tables:basePresentationSchema.tables?.map(table=>table.id===toolbarColorPreview.tableId?{...table,settings:{...table.settings,toolbar:(toolbarColorPreview.parts??[toolbarColorPreview.part]).reduce((settings,part)=>moveToolbarPart(settings,part,toolbarColorPreview.patch),(table.settings?.toolbar??{}) as GridToolbarSettings)}}:table)}:basePresentationSchema
  const addHeaderPanel=(placement:'beside'|'below')=>{const id=('header:'+crypto.randomUUID()) as GridToolbarPart;commitManagedStructure(addToolbarHeaderPanel(documentSchema,activeTableId,id,'report-row.'+crypto.randomUUID(),placement));setContextMenu(null);selectToolbar(activeTableId,id)}
  const applyInvoiceHeaderGeometry = () => {
    const width=Math.max(900,(formFrameRef.current?.clientWidth??1200)-48), gap=14
    const internal=width*.18, external=width*.22, date=width*.31, supplier=width-internal-external-date-gap*3
    const positions:Record<string,{left:number;top:number;width:number}>={internalNumber:{left:0,top:0,width:internal},externalInvoiceNumber:{left:internal+gap,top:0,width:external},invoiceDate:{left:internal+external+gap*2,top:0,width:date},supplierId:{left:width-supplier,top:0,width:supplier},paymentTerms:{left:width-supplier-date-gap,top:64,width:date},payer:{left:width-supplier,top:64,width:supplier}}
    const current=designerDraftForEditor(historyRef.current.present,documentSchema,'demo.header').canvas
    const fields={...current?.fields}
    for(const [id,rect] of Object.entries(positions))fields[id]={...fields[id],label:{...rect,height:22},input:{...rect,top:rect.top+25,height:34}}
    updateDraftState(withCanvas(historyRef.current.present,{...current,width,height:126,fields},'demo.header',false))
  }
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
  // Keep saved test records visible when returning to design.
  const showSavedTestReport = formRuntimeTesting || runtime.records.length > 0
  const presentationGrids = Object.fromEntries((documentSchema.tables ?? []).map(table => [table.id, {
    rows: (table.id === documentSchema.id + '.report' && documentSchema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') ? documentSchema.fields.filter(field => field.componentId === 'base-form.cascading-tree-panels').flatMap(field => treeReportRows[documentSchema.id + ':' + field.id] ?? productGroupReportRows(field.id, cascadingTreeSettingsFromField(field.settings).nodes ?? [])) : showSavedTestReport ? runtimeRows(table) : sharedPresentationRows) as SyntheticPerson[], columns: table.columns.length ? (showSavedTestReport ? runtimeColumns(table) : schemaGridColumns(table)) : documentSchema.fields.filter(field => field.componentId === 'base-form.cascading-tree-panels').flatMap(field => ['کد گروه', 'گروه اصلی', 'زیرگروه ۱', 'زیرگروه ۲', 'زیرگروه ۳', 'زیرگروه ۴'].map((label, index) => ({ id: field.id + (index === 0 ? '.code' : '.level.' + (index - 1)), label, width: index === 0 ? 100 : 160, type: 'text' as const, value: (row: SyntheticPerson) => String((row as unknown as Record<string, unknown>)[field.id + (index === 0 ? '.code' : '.level.' + (index - 1))] ?? '') }))),
    designerMode: designerOpen&&!formRuntimeTesting, designerSelectedColumnIds: table.id === activeTableId ? selectedTableColumnIds : [], onDesignerHeaderHeightChange: updateTableHeaderHeight, onDesignerColumnSelect: selectGridDesignerColumn, onDesignerContextMenu: (target: 'header' | 'row' | 'search', columnId: string | undefined, left: number, top: number, additive = false) => { activateTable(table.id); openGridDesignerContextMenu(target, columnId, left, top, additive) },
    ...(designerOpen&&!formRuntimeTesting?{onDesignerColumnWidthChange:(columnId:string,width:number)=>persistDesignerColumnWidth(table.id,columnId,width),onDesignerColumnOrderChange:(source:string,target:string,position:'before'|'after')=>persistDesignerColumnOrder(table.id,source,target,position)}:{}),
    ...(table.id === documentSchema.id + '.report' && documentSchema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') ? {onRowSelectionChange:(row:SyntheticPerson|null)=>selectTreeReportRow(table.id,row)} : formRuntimeTesting?{onRowSelectionChange:(row:SyntheticPerson|null)=>row&&dispatchRuntime({type:'select',id:String((row as unknown as {__parentId?:string}).__parentId??row.id),values:(row as unknown as {__runtimeValues?:Record<string,string>}).__runtimeValues})}:{}),
    ...(!formRuntimeTesting&&!activeManagedForm && table.id === 'laboratory.synthetic-persons' ? { rows: [], remoteQuery: remoteGridQuery, remoteQueryScope: datasetSize, resetRequest: gridResetRequest, navigationRequest, onRowSelectionChange: setSelectedPerson, onTotalChange: setGridRecordCount } : {})
  }]))
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const frameElement = formFrameRef.current
    if (!frameElement) return
    const check = () => {
      if(frameElement.dataset.designerGesture==='true')return
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
  const recoverySchemas = [...(history.document?.past ?? managedStructureHistory?.past ?? []).slice().reverse(), ...recoveryVersions.slice().reverse().map(version => version.snapshot.form.schema), ...(activeManagedForm?.template.schema ? [activeManagedForm.template.schema] : [])]
  const deletedTables = activeManagedForm ? recoverableDeletedTables(documentSchema, recoverySchemas) : []
  const deletedTableHeaderFieldIds = new Set<string>()
  for (const item of deletedTables) {
    if (item.columnId) continue
    const source = recoverySchemas.find(schema => schema.tables?.some(table => table.id === item.table.id))
    if (!source) continue
    const headerSectionIds = new Set(source.sections.filter(section => section.tableHeaderFor === item.table.id).map(section => section.id))
    for (const field of source.fields) if (headerSectionIds.has(field.sectionId)) deletedTableHeaderFieldIds.add(field.id)
  }
  const deletedFields = activeManagedForm ? recoverableDeletedFields(activeManagedForm.schema, recoverySchemas).filter(field => !deletedTableHeaderFieldIds.has(field.id)) : []
  const recycleItemCount = deletedFields.length + deletedTables.length
  const recycleBinButtonRef = useRef<HTMLButtonElement>(null)
  const [recyclePopoverPosition, setRecyclePopoverPosition] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!recycleBinOpen || !recycleItemCount) { setRecyclePopoverPosition(null); return }
    const updatePosition = () => {
      const anchor = recycleBinButtonRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect(), width = Math.min(380, window.innerWidth - 32), maxHeight = Math.min(420, window.innerHeight * .55)
      const rawLeft = fa ? rect.right - width : rect.left
      const left = Math.max(16, Math.min(rawLeft, window.innerWidth - width - 16))
      const below = rect.bottom + 8
      const top = below + maxHeight <= window.innerHeight - 16 ? below : Math.max(16, rect.top - maxHeight - 8)
      setRecyclePopoverPosition(current => current?.left === left && current.top === top ? current : { left, top })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true) }
  }, [recycleBinOpen, recycleItemCount, fa])
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
  const renderRecycleBin = () => {
    if (!activeManagedForm || componentTestMode || formRuntimeTesting) return null
    const itemSummary = fa ? `${recycleItemCount} مورد حذف‌شده؛ ${deletedFields.length} فیلد و ${deletedTables.length} جدول یا ستون` : language === 'zh' ? `${recycleItemCount} 项；${deletedFields.length} 个字段，${deletedTables.length} 个表或列` : `${recycleItemCount} deleted items; ${deletedFields.length} fields and ${deletedTables.length} tables or columns`
    const emptyLabel = fa ? 'سطل بازیافت خالی است' : language === 'zh' ? '回收站为空' : 'Recycle bin is empty'
    const accessibleLabel = recycleItemCount ? `${fa ? 'سطل بازیافت' : language === 'zh' ? '回收站' : 'Recycle bin'} — ${itemSummary}` : emptyLabel
    return <div className="laboratory-recycle-bin-control">
      <button ref={recycleBinButtonRef} type="button" className="laboratory-recycle-bin-trigger" data-recycle-count={recycleItemCount} data-recycle-field-count={deletedFields.length} data-recycle-structure-count={deletedTables.length} data-recycle-empty={!recycleItemCount || undefined} disabled={!recycleItemCount} aria-expanded={recycleBinOpen && recycleItemCount > 0} aria-controls="laboratory-recycle-bin-popover" aria-label={accessibleLabel} title={recycleItemCount ? accessibleLabel : emptyLabel} onClick={() => setRecycleBinOpen(open => !open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" /></svg><strong aria-hidden="true">{recycleItemCount}</strong>
      </button>
      {recycleBinOpen && recycleItemCount > 0 && recyclePopoverPosition && createPortal(<section id="laboratory-recycle-bin-popover" className="laboratory-recycle-popover" style={{ left: recyclePopoverPosition.left, top: recyclePopoverPosition.top }} aria-label={fa ? 'سطل بازیافت فیلدها و جدول‌ها' : language === 'zh' ? '字段和表格回收站' : 'Deleted fields and tables'}>
        <header><strong>{fa ? 'سطل بازیافت' : language === 'zh' ? '回收站' : 'Recycle bin'}</strong><span>{recycleItemCount}</span><button type="button" aria-label={fa ? 'بستن سطل بازیافت' : language === 'zh' ? '关闭回收站' : 'Close recycle bin'} onClick={() => setRecycleBinOpen(false)}>×</button></header>
        {deletedFields.length > 0 && <div className="laboratory-recycle-group"><h3>{fa ? 'فیلدها' : language === 'zh' ? '字段' : 'Fields'}</h3><ul className="form-recycle-list">{deletedFields.map(field => <li key={`field:${field.id}`} data-recycle-kind="field"><span><strong>{field.label[language] || field.id}</strong><small dir="ltr">{field.id} · {field.kind}</small></span><button type="button" onClick={() => { restoreDeletedField(field.id); if (recycleItemCount <= 1) setRecycleBinOpen(false) }}>{fa ? 'بازگرداندن' : language === 'zh' ? '恢复' : 'Restore'}</button></li>)}</ul></div>}
        {deletedTables.length > 0 && <div className="laboratory-recycle-group"><h3>{fa ? 'جدول‌ها و ستون‌ها' : language === 'zh' ? '表和列' : 'Tables and columns'}</h3><ul className="form-recycle-list">{deletedTables.map(item => {
          const column = item.columnId ? item.table.columns.find(candidate => candidate.id === item.columnId) : undefined
          const label = item.columnId ? (column?.label[language] ?? item.columnId) : (item.table.title?.[language] ?? item.table.id)
          const kind = item.columnId ? 'column' : 'table'
          return <li key={`${kind}:${item.table.id}:${item.columnId ?? ''}`} data-recycle-kind={kind} data-recycle-table-id={item.table.id} data-recycle-column-id={item.columnId}><span><strong>{label}</strong><small dir="ltr">{item.table.id}{item.columnId ? ` · ${item.columnId}` : ''}</small></span><button type="button" aria-label={`${fa ? 'بازگرداندن' : language === 'zh' ? '恢复' : 'Restore'}: ${label}`} onClick={() => { restoreDeletedTable(item.table.id, item.columnId); if (recycleItemCount <= 1) setRecycleBinOpen(false) }}>{fa ? 'بازگرداندن' : language === 'zh' ? '恢复' : 'Restore'}</button></li>
        })}</ul></div>}
      </section>, document.body)}
    </div>
  }
  const currentStructureHistory = activeManagedForm ? history : motherStructureHistory
  const managedSettingsContent = <div className="managed-form-editor-metadata-panel">
    <h2>{fa ? (activeManagedForm ? 'تنظیمات فرم مستقل' : 'تنظیمات قالب مادر') : 'Developer form settings'}</h2>
    <p>{activeManagedForm ? (fa ? `ارث‌بری از قالب آزمایشگاه — نسخهٔ ${activeManagedForm.template.version}` : `Laboratory template — version ${activeManagedForm.template.version}`) : (fa ? `نسخهٔ ثبت‌شدهٔ قالب مادر: ${managedForms.templateRevision?.version ?? laboratoryTemplateVersion}` : `Registered master version: ${managedForms.templateRevision?.version ?? laboratoryTemplateVersion}`)}</p>
    {activeManagedForm && <fieldset className="form-recovery-controls" data-recovery-revision={recoveryRevision}><legend>{fa ? 'بازیابی و نسخه‌های طراحی' : 'Design recovery and versions'}</legend><p>{fa ? 'تغییرات جاری و تاریخچه خودکار نگهداری می‌شوند؛ ذخیرهٔ نهایی جدا است.' : 'Current edits and history are recovered separately from explicit saves.'}</p>{recoveryStatus && <p role="alert">{recoveryStatus}</p>}<button type="button" onClick={() => { const snapshot=latestRecoverySnapshot(); if(snapshot && persistRecoverySnapshot(snapshot, fa ? 'نسخهٔ دستی' : 'Manual version')) void backupToServer(snapshot, 'نسخهٔ دستی') }}>{fa ? 'ثبت نسخهٔ بازیابی' : 'Create recovery version'}</button><label>{fa ? 'نسخهٔ قابل بازیابی' : 'Recoverable version'}<select value="" onChange={event => { const version = recoveryVersions.find(version => version.id === event.target.value); if (version) restoreRecoverySnapshot(version.snapshot) }}><option value="">{fa ? 'انتخاب نسخه…' : 'Choose version…'}</option>{recoveryVersions.slice().reverse().map(version => <option key={version.id} value={version.id}>{version.reason} · {new Date(version.at).toLocaleString(fa ? 'fa-IR' : 'en-US')}</option>)}</select></label></fieldset>}
    <fieldset className="form-recovery-controls"><legend>{fa?'نسخه‌های پشتیبان سرور':'Server backups'}</legend>{recoveryStatus&&<p role="alert">{recoveryStatus}</p>}<button type="button" disabled={serverBackupBusy} onClick={()=>void refreshServerBackups()}>{fa?'دریافت فهرست نسخه‌ها':'Load backups'}</button><label>{fa?'بازیابی نسخهٔ سرور':'Restore server backup'}<select value="" disabled={serverBackupBusy} onChange={event=>{if(event.target.value)void restoreServerBackup(event.target.value)}}><option value="">{fa?'انتخاب نسخه…':'Choose version…'}</option>{serverBackupVersions.filter(version=>version.formId===(activeManagedForm?.id??laboratoryDefinition.id)).map(version=><option key={version.id} value={version.id}>{version.reason} · {new Date(version.createdAt).toLocaleString(fa?'fa-IR':'en-US')}</option>)}</select></label></fieldset>
    {activeManagedForm && <fieldset className="form-release-settings"><legend>نسخه و وضعیت اتصال</legend>
      <p>{operationalSource(documentSchema) ? 'بازطراحی مستقل؛ فرم عملیاتی قبلی بدون تغییر فعال است.' : 'فرم جدید؛ اتصال عملیاتی هنوز پیاده‌سازی نشده است.'}</p>
      <label>نوع بازطراحی<select value={documentSchema.settings?.specific?.values?.redesignIntent === 'fundamental' ? 'fundamental' : 'appearance'} onChange={event => commitManagedStructure({ ...documentSchema, settings: { ...documentSchema.settings, specific: { ...documentSchema.settings?.specific, values: { ...documentSchema.settings?.specific?.values, redesignIntent: event.target.value } } } })}><option value="appearance">تغییر ظاهر با حفظ رفتار</option><option value="fundamental">تغییر بنیادین؛ نیازمند اصلاح سورس و اتصال‌ها</option></select></label>
      <p role="status">تشخیص قرارداد: {classifyRedesign(documentSchema) === 'fundamental' ? 'تغییر بنیادین / اتصال جدید' : 'ظاهری؛ آزمون حفظ رفتار همچنان الزامی است'}</p>
      <FormMenuPlacement value={documentSchema.menuPlacement?.menuId ?? ''} onChange={menuId=>commitManagedStructure({...documentSchema,menuPlacement:{...documentSchema.menuPlacement,menuId}})}/>
      {loadDesignReleases(browserFormStorage(), authenticatedUserId)?.filter(item=>item.formId===activeManagedForm.id).slice().reverse().map(item=><details key={item.id}><summary>نسخه {new Date(item.createdAt).toLocaleString()} — در انتظار اتصال</summary><ul>{item.requirements.map(requirement=><li key={requirement}>{requirement}</li>)}</ul><button type="button" onClick={()=>restoreRecoverySnapshot({form:item.snapshot,designerHistory:{...historyRef.current,present:resolveManagedLaboratoryDesigner(item.snapshot)},structureHistory:createManagedFormStructureHistory(item.snapshot.schema)})}>بازیابی این نسخه طراحی — با حفظ نسخه‌های دیگر</button></details>)}
    </fieldset>}
    <FormDocumentSettings visualFieldIds={currentVisualFocusFieldIds()} onToolbarFont={openToolbarFont} onToolbarSelect={(tableId,part)=>selectToolbar(tableId,part)} onToolbarPreview={(tableId,part,patch)=>setToolbarColorPreview(patch?{tableId,part,patch}:null)} actionVisible={id => { const action = activeActions.find(item => item.id === id); return Boolean(action && designerActionVisible(visibleDraft, action)) }} onActionVisibilityChange={changeActionVisibility} onActionLabelChange={(id, label) => updateActionText(id, language, label)} independent={Boolean(activeManagedForm)} blueprints={fieldBlueprints} onSaveBlueprint={saveBlueprint} savedSizes={managedForms.forms.map(form => ({ id: form.id, name: form.schema.title[language], frame: form.frame }))} defaultColumnComposition={columnLinkDefaults.defaultComposition} allowMultipleColumnSources={columnLinkDefaults.allowMultipleSources} language={language} schema={documentSchema} frame={activePreviewFrame} customization={activeManagedForm?.customization} onSchemaChange={commitManagedStructure} onFrameChange={frame => updateActivePreviewFrame(frame)} onCustomizationChange={permissions => updateManagedForm(form => ({ ...form, customization: permissions }))} onUndo={undoManagedStructure} onRedo={redoManagedStructure} onUseGridLayout={() => { setFrozenCanvas(null); updateDraftState({ ...historyRef.current.present, layoutMode: 'schema' }) }} canUndo={Boolean(currentStructureHistory?.past.length)} canRedo={Boolean(currentStructureHistory?.future.length)} />
    {managedFormStatus && <p role="status">{managedFormStatus}</p>}
    {!activeManagedForm && import.meta.env.DEV && <details onToggle={event=>setThemeEditorOpen(event.currentTarget.open)}><summary>تم و ظاهر مشترک کل برنامه</summary>{themeEditorOpen && <LaboratoryThemeEditor />}</details>}
    {templateRegistrationStatus && !activeManagedForm && <p role="status">{templateRegistrationStatus}</p>}
    {activeManagedForm ? <div className="form-document-settings-buttons" data-design-save-actions><button type="button" disabled={handoffBusy} onClick={() => setManagedSaveDialogOpen(true)}>{fa ? 'تأیید و ذخیرهٔ فرم' : 'Confirm and save form'}</button>{canFinalizeDesign&&<button type="button" disabled={handoffBusy} onClick={finalizeActiveDesign}>{handoffBusy?(fa?'در حال ثبت…':'Registering…'):(fa?'ثبت اتصال به منو':'Register menu handoff')}</button>}</div> : <button type="button" onClick={() => { setTemplateTargetIds([]); setTemplateRegistrationOpen(true) }}>{fa ? 'ثبت نسخهٔ قالب مادر' : 'Register master template version'}</button>}
  </div>
  const sharedSidebar = activeManagedForm || designerOpen ? <aside className="managed-form-workspace-sidebar" aria-label={activeManagedForm ? (fa ? 'تنظیمات و طراحی فرم مستقل' : 'Independent form design and settings') : (fa ? 'تنظیمات قالب اصلی آزمایشگاه' : 'Laboratory template settings')} dir={fa ? 'rtl' : 'ltr'}>
        {import.meta.env.DEV && <button type="button" className="laboratory-form-manager" hidden={managedSidebarCollapsed} onClick={() => setManagedFormsListOpen(true)}>{fa ? 'مدیریت فرم‌ها و انتخاب فرم فعال' : 'Manage forms and active document'}</button>}
        <div className="laboratory-sidebar-document-mode" role="status">{activeManagedForm ? (fa ? 'ساخت/ویرایش فرم مستقل — ' : 'Independent form — ') + documentSchema.title[language] : (fa ? 'ویرایش قالب اصلی آزمایشگاه' : 'Original Laboratory template')}</div>
        <div className="managed-form-sidebar-heading">
          <div className="managed-form-editor-tabs" role="tablist" aria-label={fa ? 'بخش تنظیمات فرم' : 'Form settings sections'} hidden={managedSidebarCollapsed}>
            <button id="managed-designer-tab" type="button" role="tab" aria-controls="managed-designer-panel" aria-selected={managedSettingsTab === 'design'} tabIndex={managedSettingsTab === 'design' ? 0 : -1} onClick={() => setManagedSettingsTab('design')}>{fa ? 'طراحی ظاهری' : language === 'zh' ? '外观设计' : 'Visual design'}</button>
            <button id="managed-settings-tab" type="button" role="tab" aria-controls="managed-settings-panel" aria-selected={managedSettingsTab === 'settings'} tabIndex={managedSettingsTab === 'settings' ? 0 : -1} onClick={() => setManagedSettingsTab('settings')}>{fa ? 'تنظیمات فرم' : language === 'zh' ? '表单设置' : 'Form settings'}</button>
          </div>
          <button type="button" className="managed-form-sidebar-toggle" aria-label={managedSidebarCollapsed ? (fa ? 'بازکردن پنل Designer' : 'Expand Designer sidebar') : (fa ? 'جمع‌کردن پنل Designer' : 'Collapse Designer sidebar')} aria-expanded={!managedSidebarCollapsed} aria-controls="managed-form-sidebar-content" onClick={() => setManagedSidebarCollapsed(current => !current)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={managedSidebarCollapsed ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} /></svg><span className="sr-only">{managedSidebarCollapsed ? (fa ? 'بازکردن پنل Designer' : 'Expand Designer sidebar') : (fa ? 'جمع‌کردن پنل Designer' : 'Collapse Designer sidebar')}</span></button>
        </div>
        <div id="managed-form-sidebar-content" className="managed-form-sidebar-content">
          <div id="managed-designer-panel" className="managed-form-editor-tabpanel managed-form-designer-slot" role="tabpanel" aria-labelledby="managed-designer-tab" hidden={managedSettingsTab !== 'design'}>{designerOpen ? sharedDesignerPanel : <button type="button" onClick={openDesigner}>{fa ? 'بازکردن Designer همین فرم' : 'Open this form Designer'}</button>}</div>
          <section id="managed-settings-panel" className="managed-form-editor-tabpanel managed-form-metadata-slot" role="tabpanel" aria-labelledby="managed-settings-tab" hidden={managedSettingsTab !== 'settings'}>{managedSettingsContent}</section>
        </div>
      </aside> : sharedDesignerPanel
  function currentVisualFocusFieldIds() {
    const nodes = Array.from(formFrameRef.current?.querySelectorAll<HTMLElement>('.laboratory-form-grid [data-field-id]') ?? [])
    const items = nodes.flatMap(node => { const input = node.querySelector<HTMLElement>('.designer-input-part'); const id = node.dataset.fieldId; if (!input || !id || !input.getClientRects().length) return []; const rect = input.getBoundingClientRect(); return [{ value: id, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } }] })
    return [...new Set(visualFocusOrder(items, fa).map(item => item.value))]
  }
  const toggleOperationalPreview = () => {
    const frame=formFrameRef.current, root=frame?.closest<HTMLElement>('[data-form-laboratory]')
    if(!frame||!root)return
    if (!operationalPreviewRef.current) {
      previewSurface.current = captureLaboratoryPreview(frame)
      operationalPreviewRef.current=true
      root.dataset.operationalPreview='true'
      previewSurface.current?.apply()
    } else {
      operationalPreviewRef.current=false
      delete root.dataset.operationalPreview
      previewSurface.current?.restore()
      previewSurface.current=undefined
    }
    const toggle=root.querySelector<HTMLButtonElement>('.laboratory-operational-preview-toggle')
    if(toggle){toggle.setAttribute('aria-pressed',String(operationalPreviewRef.current));toggle.textContent=operationalPreviewRef.current?'بازگشت به طراحی':'نمای عملیاتی'}
  }
  return <div className="form-laboratory-page" data-operational-preview={operationalPreviewRef.current || undefined} dir={fa ? 'rtl' : 'ltr'} data-form-laboratory data-form-design-mode={activeManagedForm ? 'independent' : 'laboratory'} data-synthetic-only="true" data-test-actor-role={testActorRole} data-managed-form-id={activeManagedForm?.id} data-form-behavior-id={effectiveBehaviorId} data-form-policy={previewPolicy(effectiveBehaviorId)} data-runtime-mode={formRuntimeTesting?runtime.mode:undefined} data-entry-active={(formRuntimeTesting?runtime.mode!=='view':dataEntryActive) || undefined} data-designer-active={designerOpen&&!componentTestMode&&!formRuntimeTesting || undefined} data-button-press-effect={history.present.buttonPressEffect !== false ? "true" : "false"} onPointerMoveCapture={()=>{hoveredInputResize.current=null}} onPointerLeave={()=>{hoveredInputResize.current=null}} onKeyDown={handleDesignerKey} onContextMenu={openContextMenu}>
    <button type="button" className="laboratory-operational-preview-toggle" aria-pressed={operationalPreviewRef.current} onClick={toggleOperationalPreview}>{operationalPreviewRef.current ? 'بازگشت به طراحی' : 'نمای عملیاتی'}</button>
    {formRuntimeTesting&&<section className="form-runtime-banner" role="status"><strong>آزمایش عملکرد فرم — دادهٔ موقت؛ {runtime.mode==='view'?'نمایش':runtime.mode==='create'?'ایجاد':'ویرایش'}</strong><button type="button" onClick={()=>{if(runtime.mode!=='view'){runRuntimeAction('close');return}setFormRuntimeTesting(false);setComponentTestMode(false);setRuntimeBehaviorPreview(null)}}>پایان آزمایش عملکرد</button><span role="alert" className="form-runtime-validation">{Object.entries(runtimeErrors).map(([id,message])=><span key={id}>«{documentSchema.fields.find(field=>field.id===id)?.label[language]??id}»: {message} </span>)}</span><details><summary>گزارش رفتار همین آزمایش</summary><ol>{runtime.log.map((item,index)=><li key={index}>{item}</li>)}</ol></details></section>}
    {recoveryStatus && <p role="alert" className="laboratory-document-notice">{recoveryStatus}</p>}
    {import.meta.env.DEV && !activeManagedForm && <div className="laboratory-form-management"><button type="button" onClick={() => setManagedFormsListOpen(true)}>{fa ? 'مدیریت فرم‌ها' : language === 'zh' ? '表单管理' : 'Form management'}</button></div>}
    {import.meta.env.DEV && formsManagerOpen && <FormBuilderSandbox language={language} onClose={() => setFormsManagerOpen(false)} />}
    <div className={activeManagedForm ? "laboratory-independent-environment" + (managedSidebarCollapsed ? " managed-form-sidebar-collapsed" : "") : "laboratory-environment"}>
    {activeManagedForm && <div ref={setExternalSidebarHost} className="laboratory-external-sidebar" />}
    <div ref={formFrameAreaRef} className="laboratory-form-frame-area" dir={fa ? 'rtl' : 'ltr'} role="region" aria-label={activeManagedForm ? (fa ? 'فضای طراحی فرم مستقل' : 'Independent form design workspace') : (fa ? 'فضای فرم؛ برای تغییر اندازه موس را به لبه‌های بیرونی ببرید و برای جابه‌جایی نوار عنوان را بکشید.' : 'Form workspace. Move the pointer to an outer edge to resize; drag the title bar to move.')} tabIndex={0} onPointerMove={handlePreviewPointerMove} onPointerLeave={event => { if (!previewInteractionRef.current) event.currentTarget.style.cursor = '' }} onPointerDown={beginPreviewPointer} onKeyDown={handlePreviewKeyDown}>
    <div ref={formFrameRef} className="laboratory-form-frame" data-invoice-visual={documentSchema.settings?.invoiceVisual===true||undefined} data-preview-device={activePreviewFrame.device} data-preview-width={activePreviewFrame.width} dir={fa ? 'rtl' : 'ltr'} style={activeManagedForm ? { width: activePreviewFrame.fitToPage && activePreviewFrame.device === 'desktop' ? '100%' : activePreviewFrame.width, minWidth: activePreviewFrame.fitToPage && activePreviewFrame.device === 'desktop' ? 0 : activePreviewFrame.width, height: activePreviewFrame.height ?? undefined, minHeight: activePreviewFrame.height ?? undefined, left: activePreviewOffset.x, top: activePreviewOffset.y } : { width: previewFitToPage && previewDevice === 'desktop' ? '100%' : previewWidth, height: previewHeight ?? undefined, minHeight: previewHeight ?? undefined, left: previewOffset.x, top: previewOffset.y }}>
    <header ref={formBannerRef} className="form-laboratory-banner" data-document-mode={activeManagedForm ? "independent" : "laboratory"}><div className="laboratory-banner-title"><strong>{activeManagedForm?.schema.title[language] ?? motherSchema?.title[language] ?? title}</strong><span className="laboratory-document-mode" title={activeManagedForm?.id}>{activeManagedForm ? (fa ? 'ساخت/ویرایش فرم مستقل' : 'Independent form design') : (fa ? 'ویرایش قالب اصلی آزمایشگاه' : 'Original Laboratory template')}</span></div><div className="laboratory-banner-actions"><div className="laboratory-banner-variable-controls">{activeManagedForm&&<button type="button" aria-label="آزمایش کامپوننت‌ها" aria-pressed={componentTestMode} onClick={()=>{setComponentTestMode(value=>!value);setSelection([]);setToolbarSelection(null)}}>{componentTestMode?'بازگشت به طراحی':'آزمایش کامپوننت‌ها'}</button>}<div className="laboratory-device-toolbar" role="group" aria-label={fa ? 'پیش‌نمایش دستگاه' : 'Device preview'}>{(Object.keys(previewWidths) as PreviewDevice[]).map(device => <button key={device} type="button" aria-label={activeManagedForm ? (fa ? ({ desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' })[device] : ({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]) : undefined} aria-pressed={activePreviewFrame.device === device} onClick={() => { updateActivePreviewFrame({ device, fitToPage: device === 'desktop', width: previewWidths[device], height: null }); setActivePreviewOffset({ x: 0, y: 0 }) }} title={previewWidths[device] + 'px'}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">{device === 'desktop' ? <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M7 21h10" /></> : <><rect x={device === 'tablet' ? 5 : 7} y="2" width={device === 'tablet' ? 14 : 10} height="20" rx="2" /><path d="M11 19h2" /></>}</svg><span className="laboratory-device-label">{fa ? ({ desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' })[device] : ({ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' })[device]}</span></button>)}{activePreviewFrame.device === 'mobile' && <select aria-label={fa ? 'عرض موبایل' : 'Mobile width'} value={activePreviewFrame.width === 320 || activePreviewFrame.width === 390 ? activePreviewFrame.width : 'custom'} onChange={event => { const width = Number(event.target.value); if (width) { updateActivePreviewFrame({ fitToPage: false, width }); setActivePreviewOffset(current => ({ ...current, x: 0 })) } }}><option value="custom">{fa ? 'اندازهٔ دلخواه' : 'Custom width'}</option><option value="390">390px</option><option value="320">320px</option></select>}</div>{!activeManagedForm && <label>{fa ? 'اندازهٔ داده' : language === 'zh' ? '数据量' : 'Dataset size'}<select value={datasetSize} onChange={event => setDatasetSize(Number(event.target.value) as typeof datasetSize)}>{laboratoryDatasetSizes.map(size => <option key={size} value={size}>{size.toLocaleString()}</option>)}</select></label>}<button type="button" className="laboratory-history-button" aria-label={fa ? 'واگرد' : 'Undo'} title="Ctrl+Z" disabled={!history.past.length} onClick={undo}>↶</button><button type="button" className="laboratory-history-button" aria-label={fa ? 'ازنو' : 'Redo'} title="Ctrl+Y" disabled={!history.future.length} onClick={redo}>↷</button>{renderRecycleBin()}</div>{activeManagedForm && <><button type="button" className="laboratory-history-button laboratory-managed-save" aria-label={fa ? 'ذخیرهٔ فرم' : 'Save form'} onClick={() => setManagedSaveDialogOpen(true)}><span className="laboratory-toolbar-icon" aria-hidden="true">✓</span><span className="laboratory-toolbar-label">{fa ? 'ذخیرهٔ فرم' : 'Save form'}</span></button><button type="button" className="laboratory-history-button laboratory-managed-close" aria-label={fa ? 'بستن فرم' : 'Close form'} onClick={() => closeManagedFormEditor()}><span className="laboratory-toolbar-icon" aria-hidden="true">×</span><span className="laboratory-toolbar-label">{fa ? 'بستن فرم' : 'Close form'}</span></button></>}{import.meta.env.DEV && !activeManagedForm && <button type="button" className="laboratory-history-button" aria-label={fa ? 'پیش‌نمایش قالب مشترک' : 'Shared template preview'} title={fa ? 'پیش‌نمایش قالب مشترک' : 'Shared template preview'} style={{ width: 'auto', paddingInline: 10, fontSize: 12, whiteSpace: 'nowrap' }} disabled={designerOpen} onClick={() => setSharedTemplatePreviewOpen(true)}>{fa ? 'پیش‌نمایش قالب مشترک' : language === 'zh' ? '共享模板预览' : 'Shared template preview'}</button>}{import.meta.env.DEV && !activeManagedForm && <><button type="button" onClick={createManagedFormFromLaboratory}>{fa ? 'ایجاد فرم از قالب آزمایشگاه' : language === 'zh' ? '从实验室模板创建表单' : 'Create form from Laboratory template'}</button><button type="button" onClick={() => setManagedFormsListOpen(true)}>{fa ? 'فرم‌های مستقل' : language === 'zh' ? '独立表单' : 'Independent forms'}</button></>}{!activeManagedForm && !documentSchema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') && <FormSettingsButton language={language} label={activeManagedForm ? (fa ? "تنظیمات فرم" : "Form settings") : settingsLabel} expanded={designerOpen} className="laboratory-designer-toggle" onClick={openFormSettings} />}</div></header>
    <section className="laboratory-form-access" aria-label={fa ? 'دسترسی مستقیم و آزمایش فرم' : 'Form access and testing'} onPointerDown={event=>event.stopPropagation()} style={{display:'flex',flexWrap:'wrap',gap:8,padding:10,alignItems:'center',borderBottom:'1px solid #cbdad7'}}>
      <button type="button" disabled={formRuntimeTesting} onClick={startFullFormTest}>{fa?'ورود اطلاعات آزمایشی':'Test data entry'}</button>
      {(componentTestMode||formRuntimeTesting)&&<label data-laboratory-test-role style={{display:'inline-flex',alignItems:'center',gap:6}}>{fa?'نقش آزمایش':'Test role'}<select aria-label={fa?'نقش ورود آزمایشی':'Test entry role'} value={testActorRole} onChange={event=>setTestActorRole(event.target.value as 'admin'|'user')}><option value="admin">{fa?'مدیر':'Administrator'}</option><option value="user">{fa?'کاربر عادی':'Regular user'}</option></select></label>}
      {activeManagedForm?.id===yarnPurchasePrototypeId && <button type="button" onClick={()=>{const snapshot=latestRecoverySnapshot();if(snapshot&&!persistRecoverySnapshot(snapshot,'پیش از تنظیم ظاهر فاکتور'))return;commitManagedStructure({...documentSchema,settings:{...documentSchema.settings,invoiceVisual:true},fields:documentSchema.fields.map(field=>field.id==='invoiceDate'?{...field,settings:{...field.settings,dualCalendar:true}}:field),tables:documentSchema.tables?.map(table=>({...table,settings:{...table.settings,toolbar:{...((table.settings?.toolbar??{}) as GridToolbarSettings),header:{...((table.settings?.toolbar as GridToolbarSettings|undefined)?.header??{}),height:52}}}}))});applyInvoiceHeaderGeometry()}}>اعمال ظاهر فاکتور تأییدشده</button>}
      {activeManagedForm?.id===yarnPurchasePrototypeId&&<button type="button" onClick={()=>{const snapshot=latestRecoverySnapshot();if(snapshot&&!persistRecoverySnapshot(snapshot,'پیش از تبدیل جزئیات به تب'))return;commitManagedStructure({...documentSchema,sections:documentSchema.sections.map(section=>['demo.containers','demo.payments','demo.documents'].includes(section.id)?{...section,settings:{...section.settings,detailsGroup:'invoice-lower'}}:section)})}}>نمای تب‌های جزئیات</button>}
      {activeManagedForm && <button type="button" onClick={exportActiveForm}>{fa?'خروجی JSON همین فرم':'Export this form JSON'}</button>}
      <label style={{display:'flex',flex:'1 1 280px',gap:8,alignItems:'center',minWidth:0}}>{fa?'آدرس مستقیم فرم':'Direct form address'}<input aria-label={fa?'آدرس مستقیم فرم':'Direct form address'} dir="ltr" readOnly value={formDirectAddress.href} onFocus={event=>event.currentTarget.select()} style={{flex:1,minWidth:0}} /></label>
      <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(formDirectAddress.href);setSaveStatus(fa?'آدرس فرم کپی شد.':'Form address copied.')}catch{const input=formFrameRef.current?.querySelector<HTMLInputElement>('.laboratory-form-access input');input?.focus();input?.select();setSaveStatus(fa?'آدرس انتخاب شد؛ با Ctrl+C کپی کنید.':'Address selected; press Ctrl+C to copy.')}}}>{fa?'کپی آدرس':'Copy address'}</button>
      <span>{fa?'آزمایش با دادهٔ موقت؛ نشانی مربوط به همین مرورگر و حساب است.':'Temporary test data; address uses this browser and account.'}</span>
    </section>
    {import.meta.env.DEV && layoutWarningMessages.length > 0 && <div role="alert" className="form-document-layout-warning">{fa ? 'هشدار چیدمان فرم — داده‌های ذخیره‌شده تغییر نکرده‌اند.' : 'Form layout warning — saved data was not changed.'}{layoutWarningMessages.map(message => <div key={message} dir="ltr">{message}</div>)}</div>}
    {activeManagedForm && !documentSchema.fields.some(field=>field.componentId==='base-form.cascading-tree-panels') && <FormDocumentHeader title={laboratoryContentTitle(documentSchema.title[language])} style={designerAppearanceStyle(visibleDraft) as CSSProperties} actions={<FormSettingsButton language={language} expanded={designerOpen} onClick={openFormSettings}/>} />}
    <div className={"laboratory-workspace" + (activeManagedForm ? " has-external-sidebar" + (designerOpen ? " has-designer" : "") : designerOpen ? " has-designer" : "") + (activeManagedForm || designerOpen ? " managed-form-workspace" : "") + ((activeManagedForm || designerOpen) && managedSidebarCollapsed ? " managed-form-sidebar-collapsed" : "")}>
      {activeManagedForm ? externalSidebarHost && createPortal(sharedSidebar, externalSidebarHost) : sharedSidebar}

    <FormSchemaPresentation schema={activePresentationSchema} designerDraft={visibleDraft} validationMode={formRuntimeTesting||dataEntryActive&&!designerOpen?"local":"off"} presentationMode={formRuntimeTesting||componentTestMode?"operational":"design"} toolbarSelection={toolbarSelection??undefined} onToolbarSelect={selectToolbar} onToolbarContextMenu={(tableId,part,left,top)=>{if(toolbarSelection?.tableId!==tableId||!toolbarSelection.parts.includes(part))selectToolbar(tableId,part);setContextMenu({left,top,part:'toolbar',toolbarPart:part})}} language={language} initialHeaderRef={formBannerRef}
      columnReview={activeManagedForm ? Object.fromEntries((documentSchema.tables ?? []).map(table => [table.id, unresolvedTableColumns(documentSchema, table.id).map(column => column.id)])) : undefined} onToolbarChange={(tableId,part,patch,related)=>commitManagedStructure({...documentSchema,tables:documentSchema.tables?.map(table=>table.id===tableId?{...table,settings:{...table.settings,toolbar:patchToolbarParts((table.settings?.toolbar??{}) as GridToolbarSettings,part,patch,related)}}:table)})} onTableStructure={tableId => setStructureDialog({ kind: 'table', tableId })}
      onTableDemoChange={(tableId,demo)=>commitManagedStructure({...documentSchema,tables:documentSchema.tables?.map(table=>table.id===tableId?{...table,settings:{...table.settings,demoEntries:demo}}:table)})} editor={activeEditor} renderEditor={renderDocumentEditor} renderFooter={renderDocumentFooter} grids={presentationGrids} onGridActivate={activateTable} onSectionExpandedChange={(sectionId,expanded)=>commitManagedStructure({...documentSchema,sections:documentSchema.sections.map(section=>section.id===sectionId?{...section,settings:{...section.settings,expanded}}:section)})}
      grid={{ rows: activeManagedForm ? sharedPresentationRows : [], columns: activeDesignerColumns, remoteQuery: activeManagedForm ? undefined : remoteGridQuery, remoteQueryScope: activeManagedForm ? undefined : datasetSize, resetRequest: activeManagedForm ? undefined : gridResetRequest, navigationRequest: activeManagedForm ? undefined : navigationRequest, designerMode: designerOpen, onDesignerHeaderHeightChange: updateTableHeaderHeight, ...(designerOpen&&!formRuntimeTesting?{onDesignerColumnWidthChange:(columnId:string,width:number)=>persistDesignerColumnWidth(activeTableId,columnId,width),onDesignerColumnOrderChange:(source:string,target:string,position:'before'|'after')=>persistDesignerColumnOrder(activeTableId,source,target,position)}:{}), designerSelectedColumnIds: selectedTableColumnIds, onDesignerColumnSelect: selectGridDesignerColumn, onDesignerContextMenu: openGridDesignerContextMenu, onRowSelectionChange: activeManagedForm ? undefined : setSelectedPerson, onTotalChange: activeManagedForm ? undefined : setGridRecordCount }}
      footer={activeManagedForm ? renderLaboratoryFooter(true, visibleDraft, activeActions, true) : renderLaboratoryFooter()}
      readOnly={Boolean(activeManagedForm)&&!formRuntimeTesting}
    />
    </div>
    {activeManagedForm && (['top', 'bottom', 'left', 'right'] as const).map(edge => <span key={edge} className={'form-frame-resize-edge form-frame-resize-' + edge} data-frame-resize={edge} role="separator" aria-label={'Resize form ' + edge} />)}
    </div></div></div>
    {import.meta.env.DEV && activeManagedForm && structureDialog && <FormDocumentDialog language={language} title={fa ? 'ویرایش ساختار فرم مستقل' : 'Edit independent form structure'} onClose={()=>setStructureDialog(null)} dirty={Boolean(structureDialogBaseline.current&&JSON.stringify(documentSchema)!==JSON.stringify(structureDialogBaseline.current.schema))} onSave={()=>true} onDiscard={()=>{if(structureDialogBaseline.current)restoreDesignerHistory(structureDialogBaseline.current.history)}}>
      {structureDialog.issueMessage && <p role="alert" tabIndex={-1} data-handoff-error style={{color:'#b42318'}}>{structureDialog.issueMessage}</p>}
      {structureDialog.kind === 'relationships' && <FormRelationshipControls focusIssue={structureDialog.issueMessage?{groupId:structureDialog.issueGroupId,fieldId:structureDialog.fieldId}:undefined} schema={documentSchema} language={language} visualFieldIds={currentVisualFocusFieldIds()} onChange={commitManagedStructure}/>}
      {structureDialog.kind === 'addField' && <FieldCreationControls schema={documentSchema} language={language} onChange={commitManagedStructure} initialSectionId={structureDialog.sectionId} initialSourceId={structureDialog.sourceId} blueprints={fieldBlueprints} onSaveBlueprint={saveBlueprint} />}
      {structureDialog.kind === 'editField' && documentSchema.fields.filter(field => field.id === structureDialog.fieldId).map(field => <FieldEditingControls key={field.id} schema={documentSchema} language={language} onChange={commitManagedStructure} field={field} focusColumnLinks={structureDialog.focusColumnLinks} visualFieldIds={currentVisualFocusFieldIds()} blueprints={fieldBlueprints} allowRemove />)}
      {structureDialog.kind === 'table' && documentSchema.tables?.filter(table => table.id === structureDialog.tableId).map(table => <FormTableStructureControls key={table.id} schema={documentSchema} table={table} language={language} focusColumnId={structureDialog.columnId} defaultComposition={columnLinkDefaults.defaultComposition} allowMultipleSources={columnLinkDefaults.allowMultipleSources} onChange={schema => { commitManagedStructure(schema); if (!schema.tables?.some(item => item.id === table.id)) setStructureDialog(null) }} />)}
      {structureDialog.kind === 'addAction' && <ActionCreationControls schema={documentSchema} language={language} onChange={commitManagedStructure} initialSectionId={structureDialog.sectionId} />}
      <DocumentDialogCloseButton>{fa ? 'بستن' : 'Close'}</DocumentDialogCloseButton>
    </FormDocumentDialog>}
    {import.meta.env.DEV && managedSaveDialogOpen && activeManagedForm && <FormDocumentDialog language={language} title={fa ? 'مجوزهای کاربر و ذخیرهٔ فرم' : 'User permissions and save form'} onClose={()=>setManagedSaveDialogOpen(false)} dirty={JSON.stringify(activeManagedForm.customization)!==JSON.stringify(permissionsDialogBaseline.current)} onSave={()=>{void saveManagedFormDraft();return false}} onDiscard={()=>{if(permissionsDialogBaseline.current)updateManagedForm(form=>({...form,customization:permissionsDialogBaseline.current!}))}}>
      <FormCustomizationPermissions language={language} value={activeManagedForm.customization} onChange={permissions => updateManagedForm(form => ({ ...form, customization: permissions }))} />
      <p>{fa ? 'ساختار، فیلدها، تعداد و ستون‌های جدول و منطق عملیاتی برای کاربر عادی قابل تغییر نیست.' : 'Structure, fields, table schema and business behavior remain developer-owned.'}</p>
      <div className="form-document-settings-buttons"><>{managedFormStatus && <p role="status">{managedFormStatus}</p>}<button type="button" disabled={handoffBusy} onClick={saveManagedFormDraft}>{fa ? 'تأیید مجوزها و ذخیره' : 'Confirm permissions and save'}</button></><DocumentDialogCloseButton>{fa ? 'بازگشت به طراحی' : 'Back to design'}</DocumentDialogCloseButton></div>{managedFormStatus && <p role="status">{managedFormStatus}</p>}
    </FormDocumentDialog>}
    {import.meta.env.DEV && templateRegistrationOpen && !activeManagedForm && <FormDocumentDialog language={language} title={fa ? 'ثبت نسخهٔ قالب مادر' : 'Register master template version'} onClose={()=>setTemplateRegistrationOpen(false)} dirty={templateTargetIds.length>0} onSave={()=>{void registerMotherTemplate();return false}}>
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
    {newFormOpen && <NewLaboratoryFormDialog language={language} template={motherSchema ?? createLaboratorySchemaTemplate(historyRef.current.present)} defaultActions={laboratoryDefinition.actions} frame={activePreviewFrame} blueprints={fieldBlueprints} onSaveBlueprint={saveBlueprint} onClose={() => setNewFormOpen(false)} onCreate={createConfiguredLaboratoryForm} />}
    {import.meta.env.DEV && managedFormsListOpen && createPortal(<div role="dialog" aria-modal="true" aria-label={fa ? 'مدیریت فرم‌ها و انتخاب فرم فعال' : 'Manage forms and active document'} dir={fa ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, zIndex: 1301, display: 'grid', placeItems: 'center', padding: 20, background: 'rgb(13 39 43 / 45%)' }}>
      <section className="form-laboratory-page" style={{ width: 'min(760px, calc(100vw - 40px))', maxHeight: 'min(720px, calc(100vh - 40px))', overflow: 'auto', padding: 20, borderRadius: 14, background: 'var(--surface, #fff)', boxShadow: '0 18px 52px rgb(0 0 0 / 30%)' }}>
        <header className="form-laboratory-banner laboratory-management-sticky"><div className="laboratory-banner-title"><strong>{fa ? 'مدیریت فرم‌ها و انتخاب فرم فعال' : 'Manage forms and active document'}</strong></div><button type="button" onClick={() => setManagedFormsListOpen(false)}>{fa ? 'بستن' : 'Close'}</button></header>
        {recoveryStatus && <p role="alert" className="laboratory-document-notice">{recoveryStatus}</p>}
        <button type="button" onClick={() => setNewFormOpen(true)}>{fa ? 'ایجاد فرم جدید…' : 'Create new form…'}</button>
        <button type="button" onClick={() => {
          const existing = loadManagedLaboratoryForms(browserFormStorage(), authenticatedUserId)?.forms.find(form => form.id === purchaseInvoiceLaboratoryId)
          if (existing) void openManagedForm(existing.id)
          else void createConfiguredLaboratoryForm(purchaseInvoiceLaboratorySchema(), activePreviewFrame, false, true)
        }}>{fa ? 'فاکتور خرید نخ — طرح مستقل' : 'Purchase invoice — independent design'}</button>
        <button type="button" onClick={()=>{const existing=managedForms.forms.find(form=>form.id===yarnPurchasePrototypeId);if(existing)void openManagedForm(existing.id);else void createConfiguredLaboratoryForm(yarnPurchasePrototype(),{...activePreviewFrame,width:1390,fitToPage:true,height:null},false,true)}}>ثبت خرید نخ — دموی جدید</button>
        <button type="button" className="laboratory-select-master" aria-pressed={!activeManagedForm} onClick={switchToLaboratory}>{fa ? 'کار روی قالب اصلی آزمایشگاه' : 'Edit original Laboratory template'}</button>
        <ManagedDesignList
          forms={Array.from(new Map([...managedForms.forms, ...Object.values(recoveryCollection?.documents ?? {}).map(document => document.current.form), ...(activeManagedForm ? [{ ...activeManagedForm, schema: documentSchema }] : [])].map(form => [form.id, form])).values())}
          states={designLifecycles} activeId={activeManagedForm?.id} busy={lifecycleBusy}
          updatedAt={Object.fromEntries(Object.entries(recoveryCollection?.documents ?? {}).map(([id, document]) => [id, document.editedAt ?? document.updatedAt]))}
          revisions={Object.fromEntries(Object.entries(recoveryCollection?.documents ?? {}).map(([id, document]) => [id, document.revision ?? 1]))}
          onOpen={id => {void openManagedForm(id)}} onClose={() => {void closeManagedFormEditor(true)}}
          onNewVersion={id => {void beginIndependentDesignVersion(id)}}
          onStateChange={(id, state) => {void changeDesignLifecycle(id, state)}}>
        <FormCatalogList onRedesign={beginOperationalRedesign} onOpenOriginal={async contract => { const leaving = latestRecoverySnapshot(); if (leaving && !persistRecoverySnapshot(leaving, 'بازکردن مسیر عملیاتی')) return; if(leaving&&!await backupToServer(leaving,'بازکردن مسیر عملیاتی'))return; if(!leaving&&!await backupLaboratoryBeforeSwitch('بازکردن مسیر عملیاتی'))return; if(leaving&&JSON.stringify(recoverySnapshotRef.current)!==JSON.stringify(leaving)){setRecoveryStatus(fa?'فرم هنگام پشتیبان‌گیری تغییر کرد؛ دوباره اقدام کنید.':'The form changed during backup; try again.');return} setManagedFormsListOpen(false); window.dispatchEvent(new CustomEvent('open-operational-form', { detail: contract.route })) }} />
        <p>{fa ? 'فرم‌های مستقل — انتخاب هر فرم فقط سند فعال را تغییر می‌دهد.' : 'Independent forms — choose the active document.'}</p>
        <fieldset><legend>{fa?'بازیابی فرم‌های موجود در سرور':'Recover server forms'}</legend><button type="button" disabled={serverBackupBusy} onClick={()=>void refreshAllServerBackups()}>{fa?'دریافت نسخه‌های سرور':'Load server backups'}</button><label>{fa?'بازیابی فرم غایب از مرورگر':'Restore a missing form'}<select value="" disabled={serverBackupBusy} onChange={event=>{if(event.target.value)void recoverMissingServerForm(event.target.value)}}><option value="">{fa?'انتخاب نسخه…':'Choose version…'}</option>{allServerBackupVersions.filter(version=>version.formId!==laboratoryDefinition.id).map(version=><option key={version.id} value={version.id}>{version.formId} · {version.reason} · {new Date(version.createdAt).toLocaleString(fa?'fa-IR':'en-US')}</option>)}</select></label></fieldset>
        {!managedForms.forms.length && !Object.keys(recoveryCollection?.documents ?? {}).length && <p>{fa ? 'هنوز پیش‌نویس مستقلی ذخیره نشده است. با «ایجاد فرم از قالب آزمایشگاه» یک پیش‌نویس بسازید.' : 'No independent drafts saved yet. Use “Create form from Laboratory template” to start one.'}</p>}
        </ManagedDesignList>
      </section>
    </div>, document.body)}
    {designerOpen && contextMenu && createPortal(<><div ref={contextMenuRef} className="designer-context-menu" role="menu" aria-label={fa?"ویژگی‌های انتخاب":"Selection properties"} dir={fa?"rtl":"ltr"} style={{ left: contextMenu.left, top: contextMenu.top }} onPointerOverCapture={event => { const item = (event.target as Element).closest('button'); if (item && !item.hasAttribute('data-grid-submenu') && !item.closest('.designer-context-submenu')) setGridSubmenu(null) }} onFocusCapture={event => { const item = (event.target as Element).closest('button'); if (item && !item.hasAttribute('data-grid-submenu') && !item.closest('.designer-context-submenu')) setGridSubmenu(null) }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      <button type="button" className="designer-context-close" aria-label={fa?'بستن منو':'Close menu'} title={fa?'بستن':'Close'} onClick={()=>{setContextMenu(null);setGridSubmenu(null)}}>×</button>
      {activeManagedForm && (contextMenu.part!=='toolbar'||contextMenu.toolbarPart?.startsWith('header')) && contextGroup('structure',fa?'ساختار و ارتباطات':'Structure and links',<>
         {contextMenu.part === 'grid' && <>{contextMenu.gridTarget === 'header' && contextMenu.columnId && <><button type="button" role="menuitem" onClick={() => { const column=documentSchema.tables?.find(table=>table.id===activeTableId)?.columns.find(item=>item.id===contextMenu.columnId); if(column)setLabelEditDialog({kind:'column',id:column.id,tableId:activeTableId,value:column.label[language]}); setContextMenu(null) }}>{fa ? 'ویرایش متن سرستون…' : 'Edit header text…'}</button><button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'table', tableId: activeTableId, columnId: contextMenu.columnId }); setContextMenu(null) }}>{fa ? `مشاهده و تنظیم فیلدهای متصل به «${activeDesignerColumns.find(column=>column.id===contextMenu.columnId)?.label??''}»…` : `View and edit fields linked to “${activeDesignerColumns.find(column=>column.id===contextMenu.columnId)?.label??''}”…`}</button></>}<button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'table', tableId: activeTableId, columnId: contextMenu.gridTarget === 'header' ? contextMenu.columnId : undefined }); setContextMenu(null) }}>{fa ? 'افزودن و ویرایش ستون‌های جدول…' : 'Add and edit table columns…'}</button>{contextMenu.columnId && <button type="button" role="menuitem" onClick={() => { removeSelectedTableColumns(contextColumnIds); setContextMenu(null) }}>{contextColumnIds.length > 1 ? (fa ? `حذف ${contextColumnIds.length} ستون انتخاب‌شده` : `Remove ${contextColumnIds.length} selected columns`) : (fa ? 'حذف ستون از ساختار فرم' : 'Remove column from form structure')}</button>}<button type="button" role="menuitem" onClick={() => { commitManagedStructure(removeDocumentTable(documentSchema, activeTableId)); setContextMenu(null) }}>{fa ? 'حذف جدول از این فرم' : 'Remove table from this form'}</button></>}
        <button type="button" role="menuitem" onClick={() => {
          const table = documentSchema.tables?.find(item => item.sectionId === contextMenu.sectionId || (contextMenu.part === 'grid' || contextMenu.part === 'toolbar') && item.id === activeTableId)
          let destination = contextMenu.sectionId ?? editorSectionId
          if (table) { const panelId=contextMenu.part==='toolbar'?toolbarHeaderFor(contextMenu.toolbarPart!,(table.settings?.toolbar??{}) as GridToolbarSettings):undefined; const row = documentSchema.sections.find(section => section.tableHeaderFor === table.id && section.settings?.toolbarPanelId===panelId); destination = row?.id ?? 'report-row.' + crypto.randomUUID(); if (!row) commitManagedStructure(panelId?addTableHeaderRow(documentSchema, table.id, destination,panelId):addTableHeaderRow(documentSchema, table.id, destination)) }
          setStructureDialog({ kind: 'addField', sectionId: destination }); setContextMenu(null)
        }}>{fa ? 'افزودن فیلد یا کامپوننت…' : 'Add field or component…'}</button>
         {contextTreeColumnId && <><button type="button" role="menuitem" onClick={() => { selectField(contextTreeColumnId, { ctrlKey: false, metaKey: false }, 'input'); setContextMenu(current => current ? { ...current, fieldId: contextTreeColumnId, part: 'input' } : current) }}>انتخاب کل پنل این ستون</button><button type="button" role="menuitem" onClick={() => { setSelection(current => [...new Set([...current.filter(key => /\.tree\.[0-4]\.column::/.test(key)), contextTreeColumnId + '::input'])]); setContextMenu(current => current ? { ...current, fieldId: contextTreeColumnId, part: 'input' } : current) }}>افزودن کل پنل به انتخاب گروهی</button><hr /></>}
         {contextMenu.fieldId && <><button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'editField', fieldId: contextMenu.fieldId }); setContextMenu(null) }}>{fa ? 'قوانین و رفتار همین فیلد…' : 'Rules for this field…'}</button><button type="button" role="menuitem" onClick={()=>{setStructureDialog({kind:'relationships'});setContextMenu(null)}}>قواعد گروهی و ارتباط فیلدهای فرم…</button><button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'editField', fieldId: contextMenu.fieldId, focusColumnLinks: true }); setContextMenu(null) }}>{fa ? 'مشاهده و تنظیم ستون‌های متصل…' : 'View and edit linked columns…'}</button><button type="button" role="menuitem" onClick={() => { removeManagedFieldsFromForm(contextFieldIds); setContextMenu(null) }}>{contextFieldIds.length > 1 ? (fa ? `حذف ${contextFieldIds.length} فیلد انتخاب‌شده` : `Remove ${contextFieldIds.length} selected fields`) : (fa ? 'حذف از این فرم' : 'Remove from this form')}</button></>}
        <button type="button" role="menuitem" onClick={() => { setStructureDialog({ kind: 'addAction', sectionId: documentSchema.sections.find(section => section.id === contextMenu.sectionId && section.kind === 'footer')?.id }); setContextMenu(null) }}>{fa ? 'افزودن کلید…' : 'Add action…'}</button>
        {(contextMenu.part === 'grid' || contextMenu.part === 'structure' || contextMenu.part === 'toolbar') && <button type="button" role="menuitem" onClick={() => { commitManagedStructure(addTableHeaderRow(documentSchema, activeTableId, 'report-row.' + crypto.randomUUID(),contextMenu.part==='toolbar'?toolbarHeaderFor(contextMenu.toolbarPart!,(documentSchema.tables?.find(table=>table.id===activeTableId)?.settings?.toolbar??{}) as GridToolbarSettings):undefined)); setContextMenu(null) }}>{fa ? 'افزودن ردیف فیلد بالای جدول' : 'Add report field row'}</button>}
        {contextMenu.actionId && <button type="button" role="menuitem" onClick={() => { removeDocumentActions(contextActionIds); setContextMenu(null) }}>{contextActionIds.length > 1 ? (fa ? `حذف ${contextActionIds.length} کلید انتخاب‌شده` : `Remove ${contextActionIds.length} selected actions`) : (fa ? 'حذف کلید از این فرم' : 'Remove action from this form')}</button>}
        <button type="button" role="menuitem" onClick={() => { setManagedSidebarCollapsed(false); setManagedSettingsTab('settings'); setDesignerOpen(true); setContextMenu(null); setGridSubmenu(null) }}>{fa ? 'تنظیمات ساختار فرم…' : 'Form structure settings…'}</button>
      </>)}

       {contextMenu.part==='toolbar'?<>
        <strong>{toolbarPartLabel(contextMenu.toolbarPart!)}</strong>
        {contextGroup('text',fa?'متن و قلم':'Text and font',<><button type="button" role="menuitem" onClick={()=>openToolbarFont(activeTableId,contextMenu.toolbarPart!)}>تنظیم فونت</button>{appearanceColors.filter(command=>command.property==='textColor').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}</>)}
        {contextGroup('appearance',fa?'ظاهر و حاشیه':'Appearance and border',<>{appearanceColors.filter(command=>command.property!=='textColor').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}{appearanceBoxCommands.filter(command=>command.property!=='width').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}</>)}
        {contextGroup('layout',fa?'اندازه و چیدمان':'Size and layout',<>{appearanceBoxCommands.filter(command=>command.property==='width').map(command=><button key={command.property} type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)}>{command.label}</button>)}<button type="button" role="menuitem" onClick={()=>requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,'textAlign')}>تراز</button>{contextMenu.toolbarPart?.startsWith('header')&&<><button type="button" role="menuitem" onClick={()=>addHeaderPanel('beside')}>افزودن هدر کنار این هدر</button><button type="button" role="menuitem" onClick={()=>addHeaderPanel('below')}>افزودن هدر زیر این هدر</button><button type="button" role="menuitem" onClick={()=>{setContextMenu(null);selectToolbar(activeTableId,toolbarHeaderFor(contextMenu.toolbarPart!, (documentSchema.tables?.find(table=>table.id===activeTableId)?.settings?.toolbar??{}) as GridToolbarSettings))}}>انتخاب کل پنل هدر</button></>}</>)}
        {contextMenu.toolbarPart?.startsWith('header')&&gridSubmenuTriggers}
       </>:contextMenu.part==='structure'?null:contextMenu.part==='grid'?<>
         {contextMenu.columnId&&['header','row'].includes(contextMenu.gridTarget??'')&&<button type="button" role="menuitem" onClick={openGridTextAlignment}>{fa?'تراز متن ستون…':'Column text alignment…'}</button>}
        {contextMenu.gridTarget === 'header' ? <>
          <strong>تنظیم سرستون «{activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? ''}»</strong>
          {gridSubmenuTriggers}
        </> : <>
        <strong>{contextMenu.gridTarget === 'search' ? 'تنظیمات جست‌وجوی جدول' : 'تنظیمات جدول و ردیف'}</strong>
        <button type="button" role="menuitem" onClick={() => requestProperty('tableTypography')}>قلم و اندازهٔ کل جدول</button>
        {contextMenu.gridTarget === 'row' && <>
          <button type="button" role="menuitem" onClick={() => openGridFormatDialog('column', activeGridColumnIds(contextMenu.columnId), activeDesignerColumns.find(column => column.id === contextMenu.columnId)?.label ?? '', 'font')}>قلم و اندازهٔ متن ستون…</button>
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
        {activeManagedForm&&contextMenu.fieldId&&<button type="button" role="menuitem" onClick={()=>{setStructureDialog({kind:'editField',fieldId:contextMenu.fieldId});setContextMenu(null)}}>{fa?'تبدیل فیلد به کامپوننت…':'Convert field to component…'}</button>}
        {contextMenu.fieldId && componentPopupFieldIds.includes(contextMenu.fieldId) && <button type="button" role="menuitem" onClick={() => {
          const id = contextMenu.fieldId!
          const anchor = Array.from(formFrameRef.current?.querySelectorAll<HTMLElement>('[data-field-id]') ?? []).find(node => node.dataset.fieldId === id)
          if (anchor) window.dispatchEvent(new CustomEvent('component-popup-design', { detail: { fieldId: id, anchor } }))
          setContextMenu(null); setGridSubmenu(null)
        }}>{fa ? 'تنظیم عرض کشویی با ماوس…' : 'Resize dropdown…'}</button>}
        {contextMenu.fieldId&&<button type="button" role="menuitemcheckbox" aria-checked={showRuleMarkersInDesigner} onClick={()=>setShowRuleMarkersInDesigner(value=>!value)}>{showRuleMarkersInDesigner?'✓ ':''}{showRuleMarkersInDesigner?(fa?'پنهان‌کردن نشانگرهای اجباری و وابستگی':'Hide required and dependency markers'):(fa?'نمایش نشانگرهای اجباری و وابستگی':'Show required and dependency markers')}</button>}
        {contextGroup('text',fa?(contextMenu.part==='action'?'متن کلید':contextMenu.part==='input'?'متن داخل فیلد':'متن برچسب'):(contextMenu.part==='action'?'Button text':contextMenu.part==='input'?'Text inside field':'Label text'),<>{contextMenu.part === 'action' && contextMenu.actionId && <button type="button" role="menuitem" onClick={() => { setActionSelection([contextMenu.actionId!]); requestProperty('actionText') }}>{fa ? 'ویرایش متن فارسی، انگلیسی و میان‌بر…' : 'Edit Persian, English and shortcut text…'}</button>}{contextMenu.part === 'label' && <button type="button" role="menuitem" onClick={() => { const field=documentSchema.fields.find(item=>item.id===contextMenu.fieldId); if(field)setLabelEditDialog({kind:'field',id:field.id,value:field.label[language]}); setContextMenu(null) }}>{fa ? 'ویرایش متن برچسب…' : 'Edit label text…'}</button>}<button type="button" role="menuitem" onClick={()=>requestProperty('font')}>{fa?(contextMenu.part==='input'?'قلم متن داخل فیلد…':'قلم برچسب…'):(contextMenu.part==='input'?'Font inside field…':'Label font…')}</button>{contextMenu.part==='input'&&<button type="button" role="menuitem" aria-haspopup="menu" onClick={openFieldAlignment}>{fa?'تراز متن داخل فیلد…':'Text alignment inside field…'}<span className="designer-submenu-arrow" aria-hidden="true"/></button>}{contextColors&&appearanceColors.filter(command=>command.property==='textColor').map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty('color',contextMenu.part==='label'?'labelColor':command.property)}>{command.label}</button>)}</>)}
        {contextSize&&contextGroup('appearance',fa?'ظاهر و حاشیه':'Appearance and border',<>
          {contextColors&&appearanceColors.filter(command=>command.property!=='textColor').map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty('color',command.property)}>{command.label}</button>)}
          {appearanceBoxCommands.filter(command=>command.property!=='width').map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty(command.section,command.property)}>{command.label}</button>)}
          <button type="button" role="menuitem" onClick={()=>requestProperty('appearance')}>سبک و جلوه ظاهری</button><button type="button" role="menuitem" onClick={()=>requestProperty('shadow')}>تنظیم سایه</button><button type="button" role="menuitem" onClick={()=>requestProperty('gradient')}>تنظیم گرادیان</button><button type="button" role="menuitem" onClick={()=>requestProperty('appearanceMore')}>تنظیمات بیشتر ظاهری</button>
        </>)}
        {contextGroup('layout',fa?'اندازه و چیدمان':'Size and layout',<>
          {contextSize&&appearanceBoxCommands.filter(command=>(command.property==='width'&&geometryEditable)).map(command=><button type="button" role="menuitem" key={command.property} onClick={()=>requestProperty(command.section,command.property)}>{command.label}</button>)}
          <button type="button" role="menuitem" aria-haspopup={contextMenu.part==='input'&&!contextLayout?'menu':undefined} onClick={event=>contextMenu.part==='input'&&!contextLayout?openFieldAlignment(event):requestProperty(contextLayout?'align':'textAlign')}>{fa?(contextLayout?'تراز جای فیلدها':'تراز متن داخل فیلد'):(contextLayout?'Align field positions':'Align text inside field')}</button>{contextLayout&&<button type="button" role="menuitem" onClick={()=>requestProperty('spacing')}>فاصله‌گذاری</button>}
          {geometryEditable&&contextMenu.fieldId&&<><button type="button" role="menuitem" onClick={()=>{applySmartGeometryLayout();setContextMenu(null);setGridSubmenu(null)}}>{fa?'یکسان‌سازی اندازه و فاصلهٔ انتخاب‌شده‌ها (Ctrl+L)':'Average selected sizes and spacing (Ctrl+L)'}</button><button type="button" role="menuitem" onClick={()=>centerEditorFields(false)}>{fa?'وسط‌کردن فیلدهای انتخاب‌شده':'Center selected fields'}</button><button type="button" role="menuitem" onClick={()=>centerEditorFields(true)}>{fa?'وسط‌کردن همهٔ ردیف‌های پنل':'Center all panel rows'}</button><button type="button" role="menuitemcheckbox" aria-checked={Boolean(canvas?.centeredFieldIds?.length)} onClick={()=>{if(!canvas?.centeredFieldIds?.length){centerEditorFields(true);return}const current=currentLayoutCanvas();if(current)updateDraftState(withCanvas(historyRef.current.present,{...current,centeredFieldIds:undefined}));setContextMenu(null);setGridSubmenu(null)}}>{fa?'حفظ وسط‌چینی هنگام ویرایش':'Keep rows centered while editing'}</button><hr/>{(['horizontal','vertical'] as const).map(axis=><button key={axis} type="button" role="menuitemcheckbox" aria-checked={neighborResizeFor(history.present)[axis]} onClick={()=>changeNeighborResize(axis,!neighborResizeFor(history.present)[axis])}>{neighborResizeFor(history.present)[axis]?'✓ ':''}{axis==='horizontal'?(fa?'تغییر عرض با حفظ فاصله و عرض مجموع':'Resize width with fixed gap and total width'):(fa?'تغییر ارتفاع با حفظ فاصله و ارتفاع مجموع':'Resize height with fixed gap and total height')}</button>)}</>}
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
    {designerOpen && gridAlignmentPopup && createPortal(<div ref={gridAlignmentRef} className="designer-context-menu designer-context-alignment-popup" role="menu" aria-label={fa ? 'تراز متن جدول' : 'Table text alignment'} dir={fa ? 'rtl' : 'ltr'} style={{ left: 8, top: 8, transform: `translate3d(${alignmentPopupOffset.x}px,${alignmentPopupOffset.y}px,0)` }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}><div className="designer-context-alignment-titlebar" onPointerDown={beginAlignmentPopupDrag} onPointerMove={moveAlignmentPopupDrag} onPointerUp={endAlignmentPopupDrag} onPointerCancel={endAlignmentPopupDrag}><strong>{gridAlignmentPopup.title}</strong><button type="button" className="designer-context-close" aria-label={fa ? 'بستن تنظیمات تراز' : 'Close alignment'} title={fa ? 'بستن' : 'Close'} onClick={() => setGridAlignmentPopup(null)}>×</button></div>{renderGridTextAlignment()}</div>, document.body)}
    {designerOpen && fieldAlignmentPopup && createPortal(<div ref={fieldAlignmentRef} className="designer-context-menu designer-context-alignment-popup" role="menu" aria-label={fa ? 'تراز متن داخل فیلد' : 'Text alignment inside field'} dir={fa ? 'rtl' : 'ltr'} style={{ left: 8, top: 8, transform: `translate3d(${alignmentPopupOffset.x}px,${alignmentPopupOffset.y}px,0)` }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}><div className="designer-context-alignment-titlebar" onPointerDown={beginAlignmentPopupDrag} onPointerMove={moveAlignmentPopupDrag} onPointerUp={endAlignmentPopupDrag} onPointerCancel={endAlignmentPopupDrag}><strong>{fa?'تراز متن داخل فیلد':'Text inside field'}</strong><button type="button" className="designer-context-close" aria-label={fa ? 'بستن تنظیمات تراز' : 'Close alignment'} title={fa ? 'بستن' : 'Close'} onClick={() => setFieldAlignmentPopup(null)}>×</button></div>{renderFieldTextAlignment()}</div>, document.body)}
    {designerOpen && labelEditDialog && <LabelEditorDialog schema={documentSchema} target={labelEditDialog} language={language} hidden={Boolean(gridFormatDialog)} onClose={()=>setLabelEditDialog(null)} onFont={openLabelFontDialog} onCommit={commitManagedStructure}/>}
    {designerOpen && gridFormatDialog?.mode === 'font' && createPortal(<div className="designer-grid-format-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) cancelGridFormatDialog() }}><section ref={gridFormatDialogRef} className="designer-grid-format-dialog" role="dialog" aria-modal="true" aria-labelledby="designer-grid-format-title" dir={fa ? 'rtl' : 'ltr'} style={{ transform: `translate3d(${gridFormatDialogOffset.x}px, ${gridFormatDialogOffset.y}px, 0)` }} onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') cancelGridFormatDialog() }}>
      <header onPointerDown={handleGridDialogHeaderPointerDown} onPointerMove={handleGridDialogHeaderPointerMove} onPointerUp={handleGridDialogHeaderPointerEnd} onPointerCancel={handleGridDialogHeaderPointerEnd}><h2 id="designer-grid-format-title">{gridFormatDialog.mode === 'font' ? (fa ? `قلم — ${gridFormatDialog.scope === 'toolbar' ? 'نوار جدول' : gridFormatDialog.scope === 'header' ? 'سرستون' : gridFormatDialog.scope === 'column' ? 'داده‌های ستون' : gridFormatDialog.scope === 'label' ? 'برچسب' : gridFormatDialog.scope === 'action' ? 'دکمه' : 'فیلد'}: ${gridFormatDialog.label}` : `Font — ${gridFormatDialog.scope === 'header' ? 'Header' : gridFormatDialog.scope === 'column' ? 'Column data' : gridFormatDialog.scope === 'label' ? 'Label' : gridFormatDialog.scope === 'action' ? 'Button' : 'Field'}: ${gridFormatDialog.label}`) : (fa ? `رنگ — ${gridFormatDialog.label}` : `Color — ${gridFormatDialog.label}`)}</h2><button type="button" aria-label={fa ? 'بستن' : 'Close'} onClick={cancelGridFormatDialog}>×</button></header>
      {gridFormatDialog.mode === 'font' && <DesignerFontPanel value={gridFormatDialog} language={language} allowTextAlign={gridFormatDialog.scope==='field'} onChange={updateGridFormatDialog} onPreviewColor={previewGridFormatColor} onCommitColor={handleGridFormatColorCommit}/>}

      <footer><button type="button" onClick={cancelGridFormatDialog}>{fa ? 'لغو' : 'Cancel'}</button><button type="button" className="primary" onClick={applyGridFormatDialog}>{fa ? 'تأیید' : 'OK'}</button></footer>
    </section></div>, document.body)}
    {designerOpen && gridFormatDialog?.mode === 'color' && <div className="designer-grid-color-picker-host" aria-hidden="true"><ExcelColorPicker key={`${gridFormatDialog.scope}-${gridFormatDialog.targetIds?.join(',')}-${gridFormatDialog.colorProperty}`} language={language} label={gridWord('انتخاب رنگ', 'Choose color', '选择颜色')} value={gridFormatDialog.color} autoOpen onPreview={previewGridFormatColor} onCommit={handleGridFormatColorCommit} onCancel={cancelGridFormatDialog} /></div>}
  </div>
}
