import assert from 'node:assert/strict'
import test from 'node:test'
import { createManagedLaboratoryForm, ensureLaboratoryTemplateFieldLayout, formSchemaGridColumnCount, formSchemaFieldGridStyle, loadManagedLaboratoryForms, managedLaboratoryFormsStorageKey, resolveManagedLaboratoryDesigner, saveManagedLaboratoryForm } from './laboratoryFormDraftState.ts'
import { emptyDesignerDraft } from './designer.ts'

function sampleTemplate() {
  return {
    id: 'form-laboratory.persons-synthetic', schemaVersion: 1, version: 1, status: 'draft', mode: 'operational',
    title: { fa: 'آزمایشگاه', en: 'Laboratory', zh: '实验室' }, sections: [{ id: 'editor', kind: 'editor' }],
    fields: [{ id: 'name', sectionId: 'editor', minTracks: 1, span: 1, kind: 'text', componentId: 'form-laboratory.name', label: { fa: 'نام', en: 'Name', zh: '名称' } }],
    layout: { direction: 'vertical', gap: 0 }
  }
}

const laboratoryLayoutIds = ['personCode', 'titleId', 'firstName', 'lastName', 'jobId', 'nationalityId', 'phone', 'mobile', 'disabledExample', 'address', 'notes', 'errorExample']
function laboratoryTemplate() {
  return {
    ...sampleTemplate(), id: 'form-laboratory.persons-synthetic', templateFormId: 'form-laboratory.persons-synthetic',
    fields: laboratoryLayoutIds.map((id, order) => ({ id, sectionId: 'editor', minTracks: 1, span: 1, kind: 'text', componentId: `form-laboratory.${id}`, label: { fa: id, en: id, zh: id }, order }))
  }
}

test('laboratory copy has independent schema and designer identity while retaining the pinned template', () => {
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.test', name: 'تعریف برند — پیش‌نویس', mode: 'hybrid', templateSchema: sampleTemplate(), templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  assert.equal(form.schema.id, form.id)
  assert.equal(form.schema.templateFormId, 'form-laboratory.persons-synthetic')
  assert.equal(form.schema.settings?.shared?.version, 1)
  assert.equal(resolveManagedLaboratoryDesigner(form).formId, form.id)
  assert.equal(form.schema.fields[0].id, 'name')
  assert.deepEqual(form.structurePermissions, { fieldAddRemove: false, fieldTypeChange: false, tableSchemaChange: false, businessBehaviorChange: false })
})

test('same-version template styles inherit; version changes keep the pinned baseline and form overrides', () => {
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.inheritance', name: 'Brand draft', mode: 'operational', templateSchema: sampleTemplate(), templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  const newerTemplateDraft = emptyDesignerDraft('form-laboratory.persons-synthetic')
  newerTemplateDraft.tableFont = { family: 'arial', size: 18 }
  assert.equal(resolveManagedLaboratoryDesigner(form, newerTemplateDraft, 1).tableFont?.size, 18)
  assert.equal(resolveManagedLaboratoryDesigner(form, newerTemplateDraft, 2).tableFont, undefined)
  form.designerOverrides.tableFont = { size: 20 }
  assert.equal(resolveManagedLaboratoryDesigner(form, newerTemplateDraft, 2).tableFont?.size, 20)
})

test('managed laboratory form save and reload preserve its independent identity and settings', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.persist', name: 'تعریف برند — پیش‌نویس', mode: 'reporting', templateSchema: sampleTemplate(), templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'tablet', width: 768, height: 900, fitToPage: false } })
  form.customization.colors = true
  assert.equal(saveManagedLaboratoryForm(storage, 'developer-1', form), true)
  const loaded = loadManagedLaboratoryForms(storage, 'developer-1')
  assert.equal(loaded?.activeFormId, form.id)
  assert.equal(loaded?.forms[0].schema.mode, 'reporting')
  assert.equal(loaded?.forms[0].frame.width, 768)
  assert.equal(loaded?.forms[0].customization.colors, true)
  assert.equal(storage.getItem(managedLaboratoryFormsStorageKey('developer-1')) !== null, true)
})

test('Laboratory schema stores the approved 20-column positions for every editor field', () => {
  const template = laboratoryTemplate()
  template.sections = [{ id: 'editor', kind: 'editor' }]
  const normalized = ensureLaboratoryTemplateFieldLayout(template)
  const expected = ['1 / span 2', '3 / span 3', '6 / span 5', '11 / span 5', '16 / span 5', '1 / span 5', '6 / span 5', '11 / span 5', '16 / span 5', '1 / span 10', '11 / span 10', '1 / span 10']
  assert.equal(formSchemaGridColumnCount(normalized), 20)
  assert.deepEqual(normalized.fields.map(field => formSchemaFieldGridStyle(normalized, field.id)?.gridColumn), expected)
  assert.deepEqual(normalized.fields.slice(0, 5).map(field => field.settings.layout.grid.columnStart), [1, 3, 6, 11, 16])
})

test('existing valid per-form field placement is retained when template defaults are applied', () => {
  const template = laboratoryTemplate()
  template.fields[2].settings = { layout: { grid: { columns: 20, columnStart: 7, columnSpan: 6 } } }
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.custom-layout', name: 'Draft', mode: 'operational', templateSchema: template, templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  assert.deepEqual(formSchemaFieldGridStyle(form.schema, 'firstName'), { gridColumn: '7 / span 6' })
  assert.deepEqual(formSchemaFieldGridStyle(form.schema, 'lastName'), { gridColumn: '11 / span 5' })
})

test('legacy saved forms without grid metadata reopen and receive only missing template positions', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const oldCanvas = { width: 1440, height: 600, fields: Object.fromEntries(laboratoryLayoutIds.map(id => [id, { input: { left: 0, top: 0, width: 120, height: 34 }, label: { left: 0, top: 0, width: 120, height: 18 } }])) }
  const oldDesigner = { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), canvas: oldCanvas }
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.legacy-layout', name: 'تعریف برند — پیش‌نویس', mode: 'operational', templateSchema: laboratoryTemplate(), templateDesigner: oldDesigner, frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  form.schema.fields = form.schema.fields.map(({ settings: _settings, ...field }) => field)
  form.schema.sections = form.schema.sections.map(section => ({ ...section, layout: { columns: 1, direction: 'vertical', gap: 12 } }))
  values.set(managedLaboratoryFormsStorageKey('legacy-user'), JSON.stringify({ version: 1, activeFormId: form.id, forms: [form] }))
  const reopened = loadManagedLaboratoryForms(storage, 'legacy-user')?.forms[0]
  assert.equal(reopened?.id, form.id)
  assert.equal(reopened?.schema.title.fa, 'تعریف برند — پیش‌نویس')
  assert.equal(formSchemaGridColumnCount(reopened.schema), 20)
  assert.equal(reopened.schema.sections.find(section => section.id === 'editor')?.layout.columns, 20)
  assert.deepEqual(formSchemaFieldGridStyle(reopened.schema, 'jobId'), { gridColumn: '16 / span 5' })
  assert.deepEqual(reopened.schema.settings.shared.designer.canvas, oldCanvas)
})
