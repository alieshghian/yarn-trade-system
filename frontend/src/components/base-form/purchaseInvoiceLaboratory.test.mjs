import test from 'node:test'
import assert from 'node:assert/strict'
import { purchaseInvoiceLaboratoryId, purchaseInvoiceLaboratorySchema } from './purchaseInvoiceLaboratory.ts'
import { emptyDesignerDraft } from './designer.ts'
import { createManagedLaboratoryForm, loadManagedLaboratoryForms, saveManagedLaboratoryForm } from './laboratoryFormDraftState.ts'

test('purchase design retains its fields, sections and edited labels through save and reload', () => {
  const schema = purchaseInvoiceLaboratorySchema()
  assert.deepEqual(schema.tables.map(table => table.id), ['items', 'containers', 'attachments', 'orders'])
  for (const id of ['internalNumber', 'invoiceDate', 'supplierId', 'billOfLadingNumber', 'paymentTerms', 'internationalFreight', 'comparisonStatus', 'containerNumber', 'documentFile', 'warehouseId']) assert.ok(schema.fields.some(field => field.id === id), id)
  const form = createManagedLaboratoryForm({ id: purchaseInvoiceLaboratoryId, name: schema.title.fa, mode: 'operational', templateSchema: schema, templateDesigner: emptyDesignerDraft('template'), frame: { device:'desktop', width:1440, height:null, fitToPage:true } })
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  assert.equal(saveManagedLaboratoryForm(storage, 'owner', form), true)
  const reopened = loadManagedLaboratoryForms(storage, 'owner').forms[0]
  reopened.schema.fields[0].label.fa = 'شماره داخلی ویرایش‌شده'
  assert.equal(saveManagedLaboratoryForm(storage, 'owner', reopened), true)
  assert.equal(loadManagedLaboratoryForms(storage, 'owner').forms[0].schema.fields[0].label.fa, 'شماره داخلی ویرایش‌شده')
})
