import assert from 'node:assert/strict'
import test from 'node:test'
import { commitManagedFormStructure, createManagedFormStructureHistory, createManagedLaboratoryForm, ensureLaboratoryTemplateFieldLayout, formSchemaGridColumnCount, formSchemaFieldGridStyle, loadManagedLaboratoryForms, managedLaboratoryFormsStorageKey, redoManagedFormStructure, removeManagedFormField, renameManagedFormField, resolveManagedLaboratoryDesigner, saveManagedLaboratoryForm, undoManagedFormStructure } from './laboratoryFormDraftState.ts'
import { inspectRenderedFormLayout, resolveFormLayout } from './formLayoutContract.ts'
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
  assert.deepEqual(normalized.fields.map(field => formSchemaFieldGridStyle(normalized, field.id)?.gridRow), ['1 / span 1', '1 / span 1', '1 / span 1', '1 / span 1', '1 / span 1', '2 / span 1', '2 / span 1', '2 / span 1', '2 / span 1', '3 / span 1', '3 / span 1', '4 / span 1'])
})

test('independent form keeps its Designer canvas while rendering the approved first-row schema placement', () => {
  const canvas = { width: 1440, height: 600, fields: Object.fromEntries(laboratoryLayoutIds.map(id => [id, { input: { left: 0, top: 0, width: 120, height: 34 }, label: { left: 0, top: 0, width: 120, height: 18 } }])) }
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.grid', name: 'تعریف برند — پیش‌نویس', mode: 'operational', templateSchema: laboratoryTemplate(), templateDesigner: { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), canvas }, frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  assert.deepEqual(form.schema.settings.shared.designer.canvas, canvas)
  assert.equal(formSchemaGridColumnCount(form.schema), 20)
  assert.deepEqual(form.schema.fields.slice(0, 5).map(field => [field.id, formSchemaFieldGridStyle(form.schema, field.id)?.gridColumn]), [
    ['personCode', '1 / span 2'], ['titleId', '3 / span 3'], ['firstName', '6 / span 5'], ['lastName', '11 / span 5'], ['jobId', '16 / span 5']
  ])
})

test('existing valid per-form field placement is retained when template defaults are applied', () => {
  const template = laboratoryTemplate()
  template.fields[2].settings = { layout: { grid: { columns: 20, columnStart: 7, columnSpan: 6 } } }
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.custom-layout', name: 'Draft', mode: 'operational', templateSchema: template, templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  assert.deepEqual(formSchemaFieldGridStyle(form.schema, 'firstName'), { gridColumn: '7 / span 6' })
  assert.deepEqual(formSchemaFieldGridStyle(form.schema, 'lastName'), { gridColumn: '11 / span 5', gridRow: '1 / span 1' })
})

test('custom schema row placement is preserved and does not claim the default first row', () => {
  const template = laboratoryTemplate()
  template.fields[2].settings = { layout: { grid: { columns: 20, columnStart: 6, columnSpan: 5, rowStart: 2 } } }
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.custom-row', name: 'Draft', mode: 'operational', templateSchema: template, templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  assert.deepEqual(formSchemaFieldGridStyle(form.schema, 'firstName'), { gridColumn: '6 / span 5', gridRow: '2 / span 1' })
  const customLayout = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop', 320)
  assert.deepEqual(customLayout.firstRowFieldIds, undefined)
  assert.equal(customLayout.minimumWidth, 320)
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
  assert.deepEqual(formSchemaFieldGridStyle(reopened.schema, 'jobId'), { gridColumn: '16 / span 5', gridRow: '1 / span 1' })
  assert.deepEqual(reopened.schema.settings.shared.designer.canvas, oldCanvas)
})

test('developer field edits rename and remove independently, undo/redo, and persist across reopen', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const sourceTemplate = laboratoryTemplate()
  const form = createManagedLaboratoryForm({ id: 'form.brand-draft.structure', name: 'تعریف برند — پیش‌نویس', mode: 'operational', templateSchema: sourceTemplate, templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  const originalIds = form.schema.fields.map(field => field.id)
  let history = createManagedFormStructureHistory(form.schema.fields)
  let schema = renameManagedFormField(form.schema, 'phone', 'fa', 'شماره تماس')
  history = commitManagedFormStructure(history, schema.fields)
  assert.equal(schema.fields.find(field => field.id === 'phone')?.label.fa, 'شماره تماس')
  assert.equal(schema.fields.find(field => field.id === 'phone')?.label.en, 'phone')
  history = undoManagedFormStructure(history)
  schema = { ...schema, fields: history.present }
  assert.equal(schema.fields.find(field => field.id === 'phone')?.label.fa, 'phone')
  history = redoManagedFormStructure(history)
  schema = { ...schema, fields: history.present }
  assert.equal(schema.fields.find(field => field.id === 'phone')?.label.fa, 'شماره تماس')

  schema = removeManagedFormField(schema, 'firstName')
  history = commitManagedFormStructure(history, schema.fields)
  assert.equal(schema.fields.some(field => field.id === 'firstName'), false)
  assert.deepEqual(schema.fields.map(field => field.id), originalIds.filter(id => id !== 'firstName'))

  history = undoManagedFormStructure(history)
  schema = { ...schema, fields: history.present }
  assert.equal(schema.fields.some(field => field.id === 'firstName'), true)
  assert.equal(schema.fields.find(field => field.id === 'phone')?.label.fa, 'شماره تماس')
  history = redoManagedFormStructure(history)
  schema = { ...schema, fields: history.present }
  assert.equal(schema.fields.some(field => field.id === 'firstName'), false)
  assert.deepEqual(schema.fields.map(field => field.id), originalIds.filter(id => id !== 'firstName'))

  assert.equal(saveManagedLaboratoryForm(storage, 'developer-1', { ...form, schema }), true)
  const reopened = loadManagedLaboratoryForms(storage, 'developer-1')?.forms[0]
  assert.equal(reopened?.id, form.id)
  assert.equal(reopened?.schema.fields.find(field => field.id === 'phone')?.label.fa, 'شماره تماس')
  assert.equal(reopened?.schema.fields.some(field => field.id === 'firstName'), false)
  assert.deepEqual(reopened?.schema.fields.map(field => field.id), originalIds.filter(id => id !== 'firstName'))
  assert.deepEqual(sourceTemplate.fields.map(field => field.id), originalIds)
  assert.equal(sourceTemplate.fields.find(field => field.id === 'phone')?.label.fa, 'phone')
})

test('one layout contract resolves default Schema grids and explicit device projections', () => {
  const form = createManagedLaboratoryForm({ id: 'form.layout.default', name: 'Layout', mode: 'operational', templateSchema: laboratoryTemplate(), templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  const desktop = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop')
  assert.equal(desktop.kind, 'schema-grid')
  assert.equal(desktop.columns, 20)
  assert.deepEqual(desktop.firstRowFieldIds, ['personCode', 'titleId', 'firstName', 'lastName', 'jobId'])
  assert.deepEqual(desktop.firstRowFieldIds.map(id => desktop.fieldStyles[id].gridColumn), ['1 / span 2', '3 / span 3', '6 / span 5', '11 / span 5', '16 / span 5'])
  assert.deepEqual(desktop.firstRowFieldIds.map(id => desktop.fieldStyles[id].gridRow), Array(5).fill('1 / span 1'))
  assert.equal(desktop.minimumWidth, 1440)
  const narrowAvailableSpace = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop', 320)
  assert.equal(narrowAvailableSpace.minimumWidth, 1440)
  assert.deepEqual(narrowAvailableSpace.firstRowFieldIds, desktop.firstRowFieldIds)

  assert.equal(resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'tablet').columns, 2)
  assert.equal(resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'tablet', 768).minimumWidth, undefined)
  assert.equal(resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'mobile').columns, 1)
  assert.equal(resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'mobile').firstRowFieldIds, undefined)
})

test('valid Designer Canvas has the same layout precedence for Laboratory and copied forms', () => {
  const canvas = { width: 1440, height: 600, fields: Object.fromEntries(laboratoryLayoutIds.map((id, index) => {
    const top = index < 5 ? 20 : 120 + Math.floor((index - 5) / 4) * 80
    return [id, { input: { left: index * 90, top: top + 22, width: 80, height: 34 }, label: { left: index * 90, top, width: 80, height: 18 } }]
  })) }
  const source = laboratoryTemplate()
  const designer = { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), canvas }
  const form = createManagedLaboratoryForm({ id: 'form.layout.canvas', name: 'Canvas layout', mode: 'operational', templateSchema: source, templateDesigner: designer, frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  const sourceLayout = resolveFormLayout(source, designer, 'desktop')
  const copiedLayout = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop')
  assert.equal(sourceLayout.kind, 'designer-canvas')
  assert.equal(copiedLayout.kind, sourceLayout.kind)
  assert.deepEqual(copiedLayout.canvas, canvas)
  assert.equal(copiedLayout.firstRowFieldIds, undefined, 'custom Canvas geometry is checked against its stored rectangles, not a forced default row')
})

test('rendered-layout guard checks actual computed grid columns, first-row geometry, missing fields and overlap', () => {
  const form = createManagedLaboratoryForm({ id: 'form.layout.dom-check', name: 'DOM check', mode: 'operational', templateSchema: laboratoryTemplate(), templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  const contract = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop')
  const rows = [
    ['personCode', 0, 100, 35], ['titleId', 40, 100, 55], ['firstName', 100, 100, 95], ['lastName', 200, 100, 95], ['jobId', 300, 100, 95],
    ['nationalityId', 0, 180, 95], ['phone', 100, 180, 95], ['mobile', 200, 180, 95], ['disabledExample', 300, 180, 95],
    ['address', 0, 260, 195], ['notes', 200, 260, 195], ['errorExample', 0, 340, 195]
  ]
  const nodes = rows.map(([id, left, top, width]) => ({ dataset: { fieldId: id }, getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + 40, width, height: 40 }), querySelector: () => null }))
  const grid = { children: nodes, dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500 }) }
  const style = { display: 'grid', gridTemplateColumns: Array(20).fill('20px').join(' '), position: 'static' }
  assert.deepEqual(inspectRenderedFormLayout(grid, contract, () => style), [])

  nodes[2].getBoundingClientRect = () => ({ left: 50, top: 150, right: 95, bottom: 190, width: 45, height: 40 })
  nodes[5].getBoundingClientRect = () => ({ left: 20, top: 150, right: 65, bottom: 190, width: 45, height: 40 })
  const issues = inspectRenderedFormLayout({ ...grid, children: nodes.slice(0, -1) }, contract, () => ({ ...style, gridTemplateColumns: Array(1).fill('400px').join(' ') }))
  assert.ok(issues.some(issue => issue.includes('Expected 20 grid columns')))
  assert.ok(issues.some(issue => issue.includes('Schema fields missing from DOM')))
  assert.ok(issues.some(issue => issue.includes('Default desktop first row is split')))
  assert.ok(issues.some(issue => issue.includes('Fields overlap')))
})

test('saved old Canvas draft keeps its layout through reopen and ten Designer open/close cycles', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const canvas = { width: 1440, height: 600, fields: Object.fromEntries(laboratoryLayoutIds.map((id, index) => [id, { input: { left: (index % 5) * 250, top: Math.floor(index / 5) * 110 + 24, width: 220, height: 34 }, label: { left: (index % 5) * 250, top: Math.floor(index / 5) * 110, width: 220, height: 18 } }])) }
  const form = createManagedLaboratoryForm({ id: 'form.layout.old-canvas', name: 'Old Canvas', mode: 'operational', templateSchema: laboratoryTemplate(), templateDesigner: { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), canvas }, frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  form.schema.fields = form.schema.fields.map(({ settings: _settings, ...field }) => field)
  form.schema.sections = form.schema.sections.map(section => ({ ...section, layout: { columns: 1, direction: 'vertical', gap: 12 } }))
  assert.equal(saveManagedLaboratoryForm(storage, 'cycle-user', form), true)
  const expectedCanvas = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop').canvas
  for (let cycle = 0; cycle < 10; cycle++) {
    const reopened = loadManagedLaboratoryForms(storage, 'cycle-user')?.forms[0]
    assert.equal(reopened?.id, form.id)
    assert.equal(resolveFormLayout(reopened.schema, resolveManagedLaboratoryDesigner(reopened), 'desktop').kind, 'designer-canvas')
    assert.deepEqual(resolveFormLayout(reopened.schema, resolveManagedLaboratoryDesigner(reopened), 'desktop').canvas, expectedCanvas)
    // Closing the Designer, switching back to the Laboratory and refreshing are view changes only.
    const laboratoryLayout = resolveFormLayout(laboratoryTemplate(), emptyDesignerDraft('form-laboratory.persons-synthetic'), 'desktop')
    assert.equal(laboratoryLayout.kind, 'schema-grid')
    assert.equal(laboratoryLayout.columns, 20)
    assert.equal(saveManagedLaboratoryForm(storage, 'cycle-user', reopened), true)
  }
  const final = loadManagedLaboratoryForms(storage, 'cycle-user')?.forms[0]
  assert.deepEqual(resolveFormLayout(final.schema, resolveManagedLaboratoryDesigner(final), 'desktop').canvas, expectedCanvas)
})

test('mobile and tablet project a saved desktop Canvas without changing source geometry or persistence', () => {
  const source = laboratoryTemplate()
  const canvas = { width: 1440, height: 600, fields: Object.fromEntries(source.fields.map((field, index) => [field.id, { input: { left: (index % 5) * 250, top: Math.floor(index / 5) * 110 + 24, width: 220, height: 34 }, label: { left: (index % 5) * 250, top: Math.floor(index / 5) * 110, width: 220, height: 18 } }])) }
  const draft = { ...emptyDesignerDraft(source.id), canvas, layoutMode: 'canvas' }
  const form = createManagedLaboratoryForm({ id: 'form.responsive', name: 'Responsive', mode: 'operational', templateSchema: source, templateDesigner: draft, frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  const original = JSON.stringify(form)
  for (const [device, width, count] of [['mobile', 320, 1], ['mobile', 390, 1], ['tablet', 768, 2]]) {
    const projection = resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), device, width)
    assert.equal(projection.kind, 'schema-grid')
    assert.equal(projection.columns, count)
    assert.equal(projection.canvas, undefined)
    assert.equal(projection.invalidCanvas, false)
    assert.equal(JSON.stringify(form), original)
    assert.deepEqual(resolveFormLayout(form.schema, resolveManagedLaboratoryDesigner(form), 'desktop').canvas, canvas)
  }
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveManagedLaboratoryForm(storage, 'responsive-user', { ...form, frame: { ...form.frame, device: 'mobile', width: 390 } }), true)
  const restored = loadManagedLaboratoryForms(storage, 'responsive-user').forms[0]
  assert.equal(resolveFormLayout(restored.schema, resolveManagedLaboratoryDesigner(restored), 'mobile', 390).columns, 1)
  assert.deepEqual(resolveFormLayout(restored.schema, resolveManagedLaboratoryDesigner(restored), 'desktop').canvas, canvas)
  assert.equal(JSON.stringify(source), JSON.stringify(laboratoryTemplate()))
})
