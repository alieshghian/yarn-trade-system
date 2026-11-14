// A local, one-draft repair for the owner's supplied export. No operational API calls.
import { attachDesignerDocument, designerHistoryReducer } from '../src/components/base-form/designer.ts'
import { decodeRecoveryJournal, readFormRecovery, writeFormRecoveryResult } from '../src/components/base-form/formDocumentRecovery.ts'
import { updateDocumentColumn } from '../src/components/base-form/formTableStructure.ts'

export const repairTarget = Object.freeze({
  formId: 'form.laboratory-copy.3c2efb1c-a20a-4583-a11a-da3b8f78d354',
  tableId: 'laboratory.synthetic-persons', columnId: 'personCode', fieldId: 'notes'
})
export function prepareRelationshipRepair(raw, now = new Date().toISOString()) {
  const journal = decodeRecoveryJournal(raw), doc = journal?.documents?.[repairTarget.formId]
  if (!doc || journal.activeFormId !== repairTarget.formId) throw Error('پیش‌نویس برند موردنظر فعال نیست؛ چیزی تغییر نکرد.')
  const current = doc.current, schema = current.form.schema
  const table = schema.tables?.find(item => item.id === repairTarget.tableId)
  const column = table?.columns.find(item => item.id === repairTarget.columnId)
  const field = schema.fields.find(item => item.id === repairTarget.fieldId)
  if (!column || !field || !column.sourceFieldIds?.includes('personCode') || !table.columns.some(item => item.id !== column.id && item.sourceFieldIds?.includes(field.id))) throw Error('ساختار فرم با اتصال بررسی‌شده مطابقت ندارد؛ چیزی تغییر نکرد.')
  const linked = column.sourceFieldIds.includes(field.id) || field.columnLinks?.some(item => item.tableId === table.id && item.columnId === column.id)
  if (!linked) return { changed: false, snapshot: current, journal }
  const snapshots = { ...column.sourceFieldLabelSnapshot }; delete snapshots[field.id]
  let next = updateDocumentColumn(schema, table.id, column.id, {
    sourceFieldIds: column.sourceFieldIds.filter(id => id !== field.id),
    sourceFieldLabelSnapshot: snapshots,
    labelSyncDecision: column.labelSyncDecision,
    labelSyncFieldId: column.labelSyncFieldId
  })
  // Also repair an orphan reverse link, if one side was already removed.
  next = { ...next, fields: next.fields.map(item => item.id === field.id ? { ...item, columnLinks: item.columnLinks?.filter(link => !(link.tableId === table.id && link.columnId === column.id)) } : item) }
  const baseline = designerHistoryReducer(attachDesignerDocument(current.designerHistory, schema, current.structureHistory), { type: 'commitTransaction' })
  if (JSON.stringify(baseline.document.present) !== JSON.stringify(schema)) throw Error('تاریخچه با پیش‌نویس همخوان نیست؛ چیزی تغییر نکرد.')
  const history = designerHistoryReducer(baseline, { type: 'change', draft: baseline.present, schema: next })
  const snapshot = { ...current, form: { ...current.form, schema: next }, designerHistory: history, structureHistory: { present: next, past: history.document.past, future: history.document.future } }
  return { changed: true, snapshot, journal, now }
}
export function applyRelationshipRepair(storage, key, expectedRaw, now = new Date().toISOString()) {
  if (!key.startsWith('yarn-trade:form-document-recovery:v1:')) throw Error('کلید بازیابی نامعتبر است.')
  if (storage.getItem(key) !== expectedRaw) throw Error('فرم پس از بررسی تغییر کرده؛ صفحهٔ ترمیم را دوباره باز کنید.')
  const userId = decodeURIComponent(key.slice('yarn-trade:form-document-recovery:v1:'.length))
  if (!readFormRecovery(storage, userId)) throw Error('فایل بازیابی معتبر نیست؛ چیزی تغییر نکرد.')
  const plan = prepareRelationshipRepair(expectedRaw, now)
  if (!plan.changed) return { changed: false }
  const backupKey = `yarn-trade:relationship-repair-backup:${repairTarget.formId}:${now}`
  storage.setItem(backupKey, expectedRaw)
  if (storage.getItem(backupKey) !== expectedRaw) throw Error('ذخیرهٔ پشتیبان تأیید نشد؛ ترمیم اجرا نشد.')
  const result = writeFormRecoveryResult(storage, userId, plan.snapshot, 'حذف اتصال اشتباه توضیحات به ستون کد برند', now)
  if (result !== 'saved') throw Error('ترمیم ثبت نشد؛ نسخهٔ پیشین محفوظ است: ' + result)
  return { changed: true, backupKey }
}
