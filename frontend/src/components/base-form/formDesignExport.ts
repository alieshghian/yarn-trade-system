import {operationalAcceptanceRequirements} from './operationalAcceptance.ts'
import { behaviorManifest, type FormBehaviorLibrary } from './formBehavior.ts'
import type { RecoverableForm } from './formDocumentRecovery.ts'
import { managedFormWithDesigner } from './laboratoryFormDraftState.ts'
import { formIntegrationTarget } from './formIntegrationTarget.ts'
import { tableGridSections } from './formDocumentStructure.ts'

export function formDesignDiagnosticMessage(code: string): string {
  const messages: Record<string, string> = {
    'table-without-section-binding': 'محل نمایش جدول مشخص نیست؛ در قسمت قرمز «پنل نمایش این جدول»، پنل جدول را انتخاب کنید. این ارتباط با اتصال ستون‌ها به فیلدها متفاوت است.',
    'table-columns-empty': 'این جدول هیچ ستونی ندارد؛ در ساختار جدول، ستون‌های مورد نیاز را اضافه کنید.',
    'tree-report-definition-missing': 'جدول گزارش گروه‌ها تعریف نشده است؛ جدول گزارش را به فرم اضافه کنید.',
    'footer-actions-missing': 'نوار کلیدهای فرم تعریف نشده یا همهٔ کلیدهای آن مخفی شده‌اند؛ نوار کلیدها را اصلاح کنید.'
  }
  return messages[code] ?? 'ساختار فرم کامل نیست؛ بخش مشخص‌شده را بررسی کنید.'
}

/** Pure snapshot: no storage writes, schema repair, template promotion or runtime data collection. */
export function createFormDesignExport(snapshot: RecoverableForm, library: FormBehaviorLibrary, operationalBehaviorContract: object, address: string, exportedAt = new Date().toISOString()) {
  // Unified document history is the current editor state, not a cached form copy.
  const schema = snapshot.designerHistory.document?.present ?? snapshot.structureHistory.present
  if (schema.id !== snapshot.form.id || snapshot.designerHistory.present.formId !== snapshot.form.id) throw new Error('Design snapshot identity mismatch')
  const current = { ...snapshot, form: { ...snapshot.form, schema }, structureHistory: { ...snapshot.structureHistory, present: schema } }
  const form = managedFormWithDesigner(current.form, current.designerHistory.present)
  const diagnostics: { code: string; id: string }[] = []
  for (const table of form.schema.tables ?? []) {
    if (!table.columns.length) diagnostics.push({ code: 'table-columns-empty', id: table.id })
    if (!tableGridSections(form.schema, table).length) diagnostics.push({ code: 'table-without-section-binding', id: table.id })
  }
  if (form.schema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') && !form.schema.tables?.length) diagnostics.push({ code: 'tree-report-definition-missing', id: form.id })
  if (form.schema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels') && !form.schema.actions?.some(action => !action.hidden)) diagnostics.push({ code: 'footer-actions-missing', id: form.id })
  return structuredClone({
    artifact: 'yarn-trade.single-form-design-export', version: 1, exportedAt,
    source: { kind: 'current-designer', address },
    form, designerDraft: snapshot.designerHistory.present,
    snapshotIntegrity: {
      version: 1, schemaSource: snapshot.designerHistory.document ? 'designer-history' : 'structure-history',
      componentBindings: form.schema.fields.map(field => ({fieldId:field.id,componentId:field.componentId,sectionId:field.sectionId})),
      editorGeometry: form.schema.sections.filter(section=>section.kind==='editor').map(section=>({sectionId:section.id,source:snapshot.designerHistory.present.sectionCanvases?.[section.id]?'section-canvas':'root-canvas-or-schema'})),
    },
    integrationTarget: formIntegrationTarget(form.schema),
    operationalBehaviorContract,
    operationalAcceptance: {
      status: 'requires-runtime-verification',
      requirements: operationalAcceptanceRequirements(form.schema),
      approvalMustMatchLatestSnapshot: true,
      requiredChecks: ['footer-visibility-and-actions', 'Space-contextual-create', 'F3-save', 'Escape-focus-restoration', 'F1-contextual-search', 'tree-grid-binding', 'saved-appearance-and-permissions'],
      diagnosticsAreNotRuntimeAcceptance: true,
      activationRequiresPassingEvidence: true,
    },
    behaviorManifest: behaviorManifest(form.schema, library),
    recoverySnapshot: { ...current, form },
    diagnostics,
    scope: {
      kind: 'laboratory-design-and-behavior-handoff',
      includes: ['saved-schema', 'designer-overrides', 'frame', 'customization-permissions', 'referenced-behavior-revisions', 'shared-contracts', 'current-document-undo-redo'],
      excludes: ['live-test-session-records', 'unrelated-forms', 'authentication', 'per-user-browser-preferences', 'historical-recovery-journal', 'component-executable-source'],
      operationalActivation: false,
    },
  })
}
