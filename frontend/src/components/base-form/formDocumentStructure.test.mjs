import test from 'node:test'
import assert from 'node:assert/strict'
import { addFormSection, assignFormFieldSection, formSectionChildren, moveFormSection, sectionFormSchema, updateFormSection, usesFormComposition } from './formDocumentStructure.ts'
import { designerDraftForEditor, designerDraftForTable, designerRectStyle, updateTableDesigner } from './formDocumentDesigner.ts'
import { createManagedLaboratoryForm, createManagedFormStructureHistory, commitManagedFormStructure, undoManagedFormStructure, redoManagedFormStructure, loadManagedLaboratoryForms, saveManagedLaboratoryForm, managedLaboratoryFormsStorageKey, resolveManagedLaboratoryDesigner, managedFormWithDesigner, renameManagedFormField, removeManagedFormFields } from './laboratoryFormDraftState.ts'
import { emptyDesignerDraft, setDesignerTableColumnStyle, validateDesignerDraft } from './designer.ts'
import { registerTemplateRevision } from './formTemplateInheritance.ts'
import { inspectRegisteredFormLayouts, inspectRenderedFormLayout, resolveFormLayout } from './formLayoutContract.ts'
import { addDocumentField, addDocumentAction, removeOptionalDocumentActions, addTableHeaderRow, setTableMaster, parseFrameDimension, copyFormDimensions, saveFieldBlueprint, loadFieldBlueprints } from './formDocumentControls.ts'
import { columnLabelMismatch, composeColumnFieldValue, fieldColumnLinks, keepColumnLabelIndependent, moveDocumentColumn, removeDocumentColumns, setColumnSourceSelection, syncColumnLabelFromField, syncColumnLabelToField, unresolvedTableColumns, updateDocumentColumn, unlinkFieldFromColumn } from './formTableStructure.ts'
import {applyLabelChange,labelChangeSuggestions,labelChangePlan} from './labelChanges.ts'

const localized = value => ({ fa: value, en: value, zh: value })
const template = () => ({ id: 'form-laboratory.persons-synthetic', templateFormId: 'form-laboratory.persons-synthetic', schemaVersion: 1, version: 1, status: 'draft', mode: 'operational', title: localized('Master'), layout: { direction: 'vertical', gap: 8 }, sections: [{ id: 'editor', kind: 'editor' }, { id: 'grid', kind: 'grid' }, { id: 'footer', kind: 'footer' }], fields: [{ id: 'firstName', sectionId: 'editor', minTracks: 1, span: 1, kind: 'text', componentId: 'shared.text', label: localized('Name') }], tables: [{ id: 'table', sectionId: 'grid', dataSourceId: 'synthetic.local', columns: [{ id: 'name', binding: { kind: 'dataField', dataFieldId: 'name' }, label: localized('Name') }] }], actions: [{ id: 'save', code: 'F3', required: true, label: localized('Save') }] })
const frame = { device: 'desktop', width: 1440, height: null, fitToPage: true }
const createForm = id => createManagedLaboratoryForm({ id, name: id, mode: 'hybrid', templateSchema: template(), templateDesigner: { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), appearance: { inputBackground: '#eeeeee' }, overrides: { firstName: { textColor: '#112233' } } }, frame })

test('drag-reordering a table column preserves its identity and settings while saving its new order', () => {
 const base=template()
 const schema={...base,tables:[{...base.tables[0],columns:[
  {id:'code',binding:{kind:'dataField',dataFieldId:'code'},label:localized('Code'),width:120,sourceFieldIds:['firstName']},
  {id:'name',binding:{kind:'dataField',dataFieldId:'name'},label:localized('Name'),width:210,sourceFieldIds:['firstName','lastName']},
  {id:'notes',binding:{kind:'dataField',dataFieldId:'notes'},label:localized('Notes'),width:180,sourceFieldIds:[]}
 ]}]}
 const moved=moveDocumentColumn(schema,'table','name','code','before')
 const columns=moved.tables[0].columns
 assert.deepEqual(columns.map(column=>column.id),['name','code','notes'])
 assert.deepEqual(columns.map(column=>column.order),[0,1,2])
 assert.equal(columns[0].width,210)
 assert.deepEqual(columns[0].sourceFieldIds,['firstName','lastName'])
 assert.deepEqual(schema.tables[0].columns.map(column=>column.id),['code','name','notes'])
 assert.equal(moveDocumentColumn(moved,'table','name','missing','after'),moved)
})

test('one confirmation renames the owned column and repairs only an unconfirmed legacy extra source',()=>{
 const base=template(),schema={...base,fields:[{...base.fields[0],id:'personCode',label:localized('کد برند')},{...base.fields[0],id:'notes',label:localized('توضیحات')}],tables:[{...base.tables[0],columns:[
  {id:'personCode',label:localized('کد برند'),binding:{kind:'dataField',dataFieldId:'personCode'},sourceFieldIds:['personCode','notes'],labelSyncDecision:'primary-field',labelSyncFieldId:'personCode'},
  {id:'notes',label:localized('توضیحات'),binding:{kind:'formField',fieldId:'notes'},sourceFieldIds:['notes']}
 ]}]}
 const target={kind:'field',id:'notes',value:'توضیحات'},plan=labelChangePlan(schema,target,'fa')
 assert.equal(plan.ambiguous,false);assert.equal(plan.repaired,true)
 assert.deepEqual(plan.suggestions.map(x=>x.columnId),['notes'])
 const next=applyLabelChange(schema,target,'توضیحات برند','fa','sync',plan.preferred)
 assert.deepEqual(next.tables[0].columns[0].sourceFieldIds,['personCode'])
 assert.equal(next.tables[0].columns[0].label.fa,'کد برند')
 assert.equal(next.tables[0].columns[1].label.fa,'توضیحات برند')
 assert.deepEqual(next.fields[1].columnLinks,[{tableId:'table',columnId:'notes'}])
 assert.deepEqual(schema.tables[0].columns[0].sourceFieldIds,['personCode','notes'])
 assert.deepEqual(applyLabelChange(schema,target,'توضیحات برند','fa','review').tables[0].columns[0].sourceFieldIds,['personCode','notes'],'review does not silently remove data links')
 const reverse=labelChangePlan(schema,{kind:'column',tableId:'table',id:'personCode',value:'کد برند'},'fa')
 assert.deepEqual(reverse.suggestions.map(x=>x.fieldId),['personCode'])
 for(const extra of [{sourceLinkIntent:'composite'},{valueComposition:'space'},{labelSyncDecision:undefined}]){
  const intentional={...schema,tables:[{...schema.tables[0],columns:schema.tables[0].columns.map(c=>c.id==='personCode'?{...c,...extra}:c)}]}
  assert.equal(labelChangePlan(intentional,target,'fa').repaired,false,'explicit composition or ambiguous ownership must remain intact')
 }
})

test('repair an accidental code/notes link without renaming or disconnecting independent fields',()=>{
 const base=template(),schema={...base,fields:[{...base.fields[0],id:'personCode',label:localized('کد برند')},{...base.fields[0],id:'notes',label:localized('توضیحات')}],tables:[{...base.tables[0],columns:[
  {id:'personCode',label:localized('کد برند'),binding:{kind:'formField',fieldId:'personCode'},sourceFieldIds:['personCode','notes']},
  {id:'notes',label:localized('توضیحات'),binding:{kind:'formField',fieldId:'notes'},sourceFieldIds:['notes']}
 ]}]}
 const target={kind:'field',id:'notes',value:'توضیحات'}
 assert.equal(labelChangeSuggestions(schema,target,'fa').length,2)
 const repaired=unlinkFieldFromColumn(schema,'notes','table','personCode')
 assert.deepEqual(fieldColumnLinks(repaired,'notes'),[{tableId:'table',columnId:'notes'}])
 assert.deepEqual(fieldColumnLinks(repaired,'personCode'),[{tableId:'table',columnId:'personCode'}])
 assert.deepEqual(labelChangeSuggestions(repaired,target,'fa').map(item=>item.columnId),['notes'])
 const renamed=applyLabelChange(repaired,target,'توضیحات برند','fa','sync',['table::notes'])
 assert.equal(renamed.tables[0].columns[0].label.fa,'کد برند')
 assert.equal(renamed.fields[0].label.fa,'کد برند')
 assert.equal(renamed.tables[0].columns[1].label.fa,'توضیحات برند')
 assert.deepEqual(schema.tables[0].columns[0].sourceFieldIds,['personCode','notes'],'repair must not mutate the saved draft before commit')
 const removedPrimary=unlinkFieldFromColumn(schema,'personCode','table','personCode')
 assert.deepEqual(removedPrimary.tables[0].columns[0].binding,{kind:'formField',fieldId:'notes'})
 const removedLast=unlinkFieldFromColumn(repaired,'notes','table','notes')
 assert.deepEqual(removedLast.tables[0].columns[1].sourceFieldIds,[])
 assert.equal(removedLast.tables[0].columns[1].requiresSourceDecision,true)
})

test('label suggestions synchronize both directions in one immutable schema and preserve composite sources',()=>{
 const base=template(),schema={...base,fields:[{...base.fields[0],id:'firstName',label:localized('نام')},{...base.fields[0],id:'lastName',label:localized('خانوادگی')}],tables:[{...base.tables[0],columns:[{...base.tables[0].columns[0],id:'displayName',sourceFieldIds:['firstName','lastName'],label:localized('نام')}]}]}
 const edit={kind:'field',id:'firstName',value:'نام'},suggestions=labelChangeSuggestions(schema,edit,'fa')
 assert.equal(suggestions[0].composite,true)
 const next=applyLabelChange(schema,edit,'نام برند','fa','sync',[suggestions[0].key])
 assert.equal(next.tables[0].columns[0].label.fa,'نام برند');assert.equal(next.fields[1].label.fa,'خانوادگی')
 const header={kind:'column',tableId:'table',id:'displayName',value:'نام برند'}
 const reversed=applyLabelChange(next,header,'نام اصلی','fa','sync',['lastName'])
 assert.equal(reversed.fields[1].label.fa,'نام اصلی');assert.equal(reversed.fields[0].label.fa,'نام برند')
 assert.deepEqual(reversed.tables[0].columns[0].sourceFieldIds,['firstName','lastName'])
 const later=applyLabelChange(schema,edit,'نام برند','fa','review')
 assert.ok(columnLabelMismatch(later,later.tables[0].columns[0],'fa').length)
 const independent=applyLabelChange(schema,edit,'نام برند','fa','independent')
 assert.deepEqual(columnLabelMismatch(independent,independent.tables[0].columns[0],'fa'),[])
 const reviewedAgain=applyLabelChange(independent,{...edit,value:'نام برند'},'نام تازه','fa','review')
 assert.ok(columnLabelMismatch(reviewedAgain,reviewedAgain.tables[0].columns[0],'fa').length,'a new deferred decision invalidates an earlier independent-label approval')
 assert.deepEqual(reviewedAgain.tables[0].columns[0].sourceFieldIds,independent.tables[0].columns[0].sourceFieldIds,'review never disconnects the field')
 assert.equal(schema.fields[0].label.fa,'نام')
})

test('field or column rename preserves the relation and marks both labels for explicit review', () => {
  const schema = { ...template(), fields: [{ id: 'brandCode', sectionId: 'editor', minTracks: 1, span: 1, kind: 'text', componentId: 'shared.text', label: localized('کد') }], tables: [{ ...template().tables[0], columns: [{ id: 'brandCode', binding: { kind: 'formField', fieldId: 'brandCode' }, sourceFieldIds: ['brandCode'], label: localized('کد') }] }] }
  const renamed = renameManagedFormField(schema, 'brandCode', 'fa', 'کد برند')
  assert.equal(renamed.tables[0].columns[0].label.fa, 'کد')
  assert.deepEqual(columnLabelMismatch(renamed, renamed.tables[0].columns[0], 'fa'), ['brandCode'])
  const columnRenamed = updateDocumentColumn(renamed, 'table', 'brandCode', { label: { ...renamed.tables[0].columns[0].label, fa: 'شناسهٔ برند' } })
  assert.deepEqual(columnLabelMismatch(columnRenamed, columnRenamed.tables[0].columns[0], 'fa'), ['brandCode'])
  const synchronized = syncColumnLabelToField(columnRenamed, 'table', 'brandCode', 'fa')
  assert.equal(synchronized.fields[0].label.fa, 'شناسهٔ برند')
  const independent = keepColumnLabelIndependent(columnRenamed, 'table', 'brandCode')
  assert.deepEqual(columnLabelMismatch(independent, independent.tables[0].columns[0], 'fa'), [])
  assert.equal(independent.fields[0].columnLinks, undefined, 'a label decision must preserve the data relationship')
})

test('composite table columns join two or more fields with the selected separator',()=>{
  assert.equal(composeColumnFieldValue(['نام','خانوادگی'],{valueComposition:'space'}),'نام خانوادگی')
  assert.equal(composeColumnFieldValue(['AB','12'],{valueComposition:'direct'}),'AB12')
  assert.equal(composeColumnFieldValue(['نام','خانوادگی'],{valueComposition:'comma'}),'نام، خانوادگی')
  assert.equal(composeColumnFieldValue(['A','','B'],{valueComposition:'custom',valueSeparator:' / '}),'A / B')
})

test('one table column can retain multiple bidirectional source-field links',()=>{
  const base=template(),schema={...base,fields:[{...base.fields[0],id:'firstName'},{...base.fields[0],id:'lastName'}],tables:[{...base.tables[0],columns:[{...base.tables[0].columns[0],id:'displayName',binding:{kind:'formField',fieldId:'firstName'},sourceFieldIds:['firstName']}]}]}
  const next=updateDocumentColumn(schema,'table','displayName',{sourceFieldIds:['firstName','lastName'],binding:{kind:'formField',fieldId:'firstName'}})
  assert.deepEqual(fieldColumnLinks(next,'firstName'),[{tableId:'table',columnId:'displayName'}])
  assert.deepEqual(fieldColumnLinks(next,'lastName'),[{tableId:'table',columnId:'displayName'}])
  const removed=updateDocumentColumn(next,'table','displayName',{sourceFieldIds:['lastName'],binding:{kind:'formField',fieldId:'lastName'}})
  assert.deepEqual(fieldColumnLinks(removed,'firstName'),[])
  assert.deepEqual(fieldColumnLinks(removed,'lastName'),[{tableId:'table',columnId:'displayName'}])
})

test('explicitly reconnecting a column replaces stale sources and supports read-only derived fields',()=>{
 const base=template(),derived={...base.fields[0],id:'comprehensiveName',label:localized('نام کامل'),readOnly:true,componentId:'base-form.derived-display'}
 const schema={...base,fields:[derived],tables:[{...base.tables[0],columns:[{...base.tables[0].columns[0],id:'comprehensiveName',label:localized('نام کامل'),binding:{kind:'formField',fieldId:'removed-old-field'},sourceFieldIds:['removed-old-field'],requiresSourceDecision:true}]}]}
 const linked=setColumnSourceSelection(schema,'table','comprehensiveName','comprehensiveName',true,false)
 assert.deepEqual(linked.tables[0].columns[0].sourceFieldIds,['comprehensiveName'])
 assert.deepEqual(linked.tables[0].columns[0].binding,{kind:'formField',fieldId:'comprehensiveName'})
 assert.deepEqual(fieldColumnLinks(linked,'comprehensiveName'),[{tableId:'table',columnId:'comprehensiveName'}])
 assert.equal(linked.fields[0].readOnly,true,'linking must not change a derived field’s read-only behavior')
 assert.deepEqual(unresolvedTableColumns(linked,'table'),[],'an explicit live selection resolves stale source IDs')
})

test('composite column label changes flag its source fields and can explicitly follow a chosen primary field',()=>{
  const base=template(),schema={...base,fields:[{...base.fields[0],id:'firstName',label:localized('نام')},{...base.fields[0],id:'lastName',label:localized('نام خانوادگی')}],tables:[{...base.tables[0],columns:[{...base.tables[0].columns[0],id:'displayName',sourceFieldIds:['firstName','lastName'],label:localized('نام')}]}]}
  const initial=schema.tables[0].columns[0]
  assert.deepEqual(columnLabelMismatch(schema,initial,'fa'),[])
  const renamedSource=renameManagedFormField(schema,'lastName','fa','نام خانوادگی جدید')
  assert.deepEqual(columnLabelMismatch(renamedSource,renamedSource.tables[0].columns[0],'fa'),['lastName'])
  const reviewed=syncColumnLabelFromField(renamedSource,'table','displayName','lastName','fa')
  assert.deepEqual(columnLabelMismatch(reviewed,reviewed.tables[0].columns[0],'fa'),[])
  const secondaryChanged=renameManagedFormField(reviewed,'firstName','fa','نام جدید')
  assert.deepEqual(columnLabelMismatch(secondaryChanged,secondaryChanged.tables[0].columns[0],'fa'),['firstName'])
  const changed=updateDocumentColumn(schema,'table','displayName',{label:{...initial.label,fa:'نام برند'}})
  assert.deepEqual(columnLabelMismatch(changed,changed.tables[0].columns[0],'fa'),['firstName','lastName'])
  const linked=syncColumnLabelFromField(changed,'table','displayName','lastName','fa')
  assert.equal(linked.tables[0].columns[0].labelSyncDecision,'primary-field')
  assert.equal(linked.tables[0].columns[0].label.fa,'نام خانوادگی')
  assert.deepEqual(columnLabelMismatch(linked,linked.tables[0].columns[0],'fa'),[])
})

test('one editor can have two tables, and one table can have three more below it, before the action bar', () => {
  let schema = template()
  assert.equal(usesFormComposition(schema), false)
  for (let count = 1; count <= 3; count++) schema = addFormSection(schema, 'grid', `grid.${count}`)
  assert.equal(schema.tables.length, 4)
  assert.equal(new Set(schema.tables.map(table => table.id)).size, 4)
  assert.deepEqual(formSectionChildren(schema).map(section => section.kind), ['editor', 'grid', 'grid', 'grid', 'grid', 'footer'])
  assert.equal(usesFormComposition(schema), true)
  assert.equal(template().tables.length, 1)
  assert.equal(addFormSection(schema, 'grid', 'grid.1'), schema)
})

test('nested horizontal and vertical groups move and hide without deleting field or table data', () => {
  let schema = addFormSection(addFormSection(template(), 'group', 'group'), 'editor', 'second.editor')
  schema = updateFormSection(schema, 'group', { layout: { direction: 'horizontal', gap: 14 } })
  schema = updateFormSection(schema, 'editor', { parentId: 'group' })
  schema = updateFormSection(schema, 'second.editor', { parentId: 'group' })
  schema = assignFormFieldSection(schema, 'firstName', 'second.editor')
  assert.deepEqual(formSectionChildren(schema, 'group').map(section => section.id), ['editor', 'second.editor'])
  assert.equal(sectionFormSchema(schema, schema.sections.find(section => section.id === 'second.editor')).fields[0].id, 'firstName')
  schema = moveFormSection(schema, 'second.editor', -1)
  assert.deepEqual(formSectionChildren(schema, 'group').map(section => section.id), ['second.editor', 'editor'])
  assert.equal(updateFormSection(schema, 'group', { parentId: 'group' }), schema)
  const hidden = updateFormSection(schema, 'group', { enabled: false })
  assert.equal(formSectionChildren(hidden).some(section => section.id === 'group'), false)
  assert.equal(hidden.fields.length, 1)
  assert.equal(hidden.tables.length, 1)
})

test('the existing structure history and persistence retain whole documents, section IDs and decisions', () => {
  const form = createForm('form.structure')
  const changed = addFormSection(form.schema, 'grid', 'grid.extra')
  const history = commitManagedFormStructure(createManagedFormStructureHistory(form.schema), changed)
  assert.deepEqual(undoManagedFormStructure(history).present, form.schema)
  assert.deepEqual(redoManagedFormStructure(undoManagedFormStructure(history)).present, changed)
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const original = JSON.stringify(form)
  assert.equal(saveManagedLaboratoryForm(storage, 'owner', { ...form, schema: changed }), true)
  for (let cycle = 0; cycle < 10; cycle++) {
    const reopened = loadManagedLaboratoryForms(storage, 'owner').forms[0]
    assert.equal(reopened.id, form.id)
    assert.deepEqual(reopened.schema.sections, changed.sections)
    assert.equal(saveManagedLaboratoryForm(storage, 'owner', reopened), true)
  }
  assert.equal(JSON.stringify(form), original)
  assert.equal(values.size, 1)
})

test('Canvas coordinates are applied as absolute positions and split editors retain their own geometry', () => {
  const rect = { left: 25, top: 18, width: 160, height: 34 }
  assert.deepEqual(designerRectStyle(rect), { ...rect, position: 'absolute', transform: 'none', margin: 0 })
  const schema = addFormSection(template(), 'editor', 'second')
  const draft = { ...emptyDesignerDraft(schema.id), canvas: { width: 1440, height: 200, fields: { firstName: { input: rect, label: { ...rect, top: 0, height: 18 } } } } }
  assert.deepEqual(designerDraftForEditor(draft, schema, 'editor').canvas, draft.canvas)
  assert.equal(designerDraftForEditor(draft, schema, 'second').canvas, undefined)
  const moved = assignFormFieldSection(schema, 'firstName', 'second')
  assert.equal(Object.keys(designerDraftForEditor(draft, moved, 'editor').canvas.fields).length, 0)
})

test('formatting one table does not change another table or its inherited global defaults', () => {
  const draft = { ...emptyDesignerDraft('form.tables'), tableFont: { size: 13 }, tableColumns: { name: { textColor: '#112233', bold: true } } }
  const changed = updateTableDesigner(draft, 'table.two', table => setDesignerTableColumnStyle(table, 'name', 'textColor', '#ff0000'))
  assert.equal(designerDraftForTable(changed, 'table.one').tableColumns.name.textColor, '#112233')
  assert.equal(designerDraftForTable(changed, 'table.two').tableColumns.name.textColor, '#ff0000')
  assert.equal(designerDraftForTable(changed, 'table.two').tableColumns.name.bold, true)
  assert.equal(changed.tables['table.two'].tableColumns.name.bold, undefined)
  assert.deepEqual(validateDesignerDraft(changed, changed.formId, []).tables, changed.tables)
})

test('registering the master asks for explicit targets, preserves overrides and retains prior revisions', () => {
  let customized = createForm('form.custom')
  customized.schema.fields[0].label.fa = 'نام اختصاصی'
  customized = managedFormWithDesigner(customized, { ...resolveManagedLaboratoryDesigner(customized), overrides: { firstName: { textColor: '#ff0000' } } })
  const untouched = createForm('form.untouched')
  const collection = { version: 1, activeFormId: null, forms: [customized, untouched] }
  const source = { schema: template(), designer: { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), appearance: { inputBackground: '#aabbcc' }, overrides: { firstName: { textColor: '#445566' } } }, frame, createdAt: '2026-10-17T12:00:00Z' }
  source.schema.fields[0].label.en = 'Updated name'
  const next = registerTemplateRevision(collection, source, ['form.custom'])
  assert.equal(next.forms[1], untouched)
  assert.equal(next.forms[0].schema.fields[0].label.fa, 'نام اختصاصی')
  assert.equal(next.forms[0].schema.fields[0].label.en, 'Updated name')
  assert.equal(resolveManagedLaboratoryDesigner(next.forms[0]).appearance.inputBackground, '#aabbcc')
  assert.equal(resolveManagedLaboratoryDesigner(next.forms[0]).overrides.firstName.textColor, '#ff0000')
  assert.equal(next.forms[0].schema.id, customized.id)
  assert.equal(registerTemplateRevision(next, source, []).templateRevisions.length, 2)
  assert.throws(() => registerTemplateRevision(collection, source, ['unknown']))
})

test('legacy full designer snapshots do not prevent inherited updates, while legacy structure is preserved', () => {
  const form = createForm('form.legacy')
  form.designerOverrides = resolveManagedLaboratoryDesigner(form)
  delete form.template.schema
  form.schema.mode = 'combined'
  const source = { schema: addFormSection(template(), 'grid', 'new.table'), designer: { ...emptyDesignerDraft('form-laboratory.persons-synthetic'), appearance: { inputBackground: '#abcdef' } }, frame, createdAt: '2026-10-17T12:00:00Z' }
  const next = registerTemplateRevision({ version: 1, activeFormId: null, forms: [form] }, source, [form.id])
  assert.deepEqual(next.forms[0].schema.sections, form.schema.sections)
  assert.equal(resolveManagedLaboratoryDesigner(next.forms[0]).appearance.inputBackground, '#abcdef')
  const values = new Map([[managedLaboratoryFormsStorageKey('legacy'), JSON.stringify(next)]])
  const loaded = loadManagedLaboratoryForms({ getItem: key => values.get(key) ?? null }, 'legacy')
  assert.equal(loaded.forms[0].schema.mode, 'combined')
  assert.equal(loaded.templateRevision.version, 2)
})

test('twenty computed tracks alone cannot pass when inherited rules have created unequal implicit columns', () => {
  const grid = { children: [], getBoundingClientRect: () => ({ left: 0, top: 0 }) }
  const contract = { formId: 'form.tracks', device: 'desktop', kind: 'schema-grid', fieldIds: [], columns: 20, invalidCanvas: false }
  assert.equal(inspectRenderedFormLayout(grid, contract, () => ({ display: 'grid', gridTemplateColumns: Array(20).fill('60px').join(' ') })).length, 0)
  assert.ok(inspectRenderedFormLayout(grid, contract, () => ({ display: 'grid', gridTemplateColumns: ['685px', '0px', ...Array(18).fill('29px')].join(' ') })).some(issue => issue.includes('unequal')))
})

test('choosing the grid layout preserves a saved manual Canvas and persists the choice independently', () => {
  const form = createForm('form.mode')
  const rect = { left: 10, top: 40, width: 150, height: 34 }
  const canvas = { width: 1440, height: 200, fields: { firstName: { input: rect, label: { ...rect, top: 10, height: 18 } } } }
  const draft = { ...resolveManagedLaboratoryDesigner(form), canvas, layoutMode: 'schema' }
  const saved = managedFormWithDesigner(form, draft)
  const resolved = validateDesignerDraft(resolveManagedLaboratoryDesigner(saved), form.id, ['firstName'])
  assert.deepEqual(resolved.canvas, canvas)
  assert.equal(resolveFormLayout(saved.schema, resolved, 'desktop').kind, 'schema-grid')
  assert.equal(resolveFormLayout(saved.schema, { ...resolved, layoutMode: 'canvas' }, 'desktop').kind, 'designer-canvas')
})


test('field instances and header report rows have independent stable IDs, no bindings, and reversible saved structure', () => {
  const original = template()
  let schema = addTableHeaderRow(original, original.tables[0].id, 'report.row')
  assert.equal(formSectionChildren(schema).some(section => section.id === 'report.row'), false)
  const blueprint = { componentId: 'definition.field', kind: 'text', valueType: 'alphanumeric' }
  schema = addDocumentField(schema, 'report.row', 'report.field', 'کد گزارش', blueprint)
  schema = addDocumentField(schema, 'editor', 'custom.field', 'کد دیگر', blueprint)
  assert.equal(new Set(schema.fields.map(field => field.id)).size, schema.fields.length)
  assert.equal(schema.fields.find(field => field.id === 'report.field').sectionId, 'report.row')
  assert.equal(schema.fields.find(field => field.id === 'report.field').dataBinding, undefined)
  assert.equal(addDocumentField(schema, 'editor', 'custom.field', 'Duplicate', blueprint), schema)
  const history = commitManagedFormStructure(createManagedFormStructureHistory(original), schema)
  assert.deepEqual(undoManagedFormStructure(history).present, original)
  assert.deepEqual(redoManagedFormStructure(undoManagedFormStructure(history)).present, schema)
  assert.equal(original.fields.length, 1)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const form = { ...createForm('form.header'), schema: { ...schema, settings: createForm('form.header').schema.settings, id: 'form.header', templateFormId: 'form-laboratory.persons-synthetic' } }
  assert.equal(saveManagedLaboratoryForm(storage, 'developer', form), true)
  assert.equal(loadManagedLaboratoryForms(storage, 'developer').forms[0].schema.sections.find(section => section.id === 'report.row').tableHeaderFor, 'table')
})

test('Master–Detail is a declarative relation, rejects cycles and keeps behavior instructions', () => {
  let schema = addFormSection(template(), 'grid', 'detail')
  const master = schema.tables[0].id, detail = schema.tables[1].id
  schema = setTableMaster(schema, detail, master, 'id', 'masterId', 'Show matching rows')
  assert.deepEqual(schema.tables[1].masterDetail, { masterTableId: master, masterField: 'id', detailField: 'masterId', instruction: 'Show matching rows' })
  assert.equal(setTableMaster(schema, master, detail), schema)
  assert.equal(setTableMaster(schema, detail, 'missing'), schema)
  assert.equal(setTableMaster(schema, detail, '').tables[1].masterDetail, undefined)
  const added = addDocumentAction(schema, 'footer', 'report.print', 'چاپ گزارش')
  assert.equal(added.actions.at(-1).operationId, undefined)
  assert.deepEqual(added.actions.at(-1).keys, [])
})

test('group removal deletes selected optional footer actions and preserves required actions', () => {
  const schema = { ...template(), actions: [
    { id: 'save', code: 'F3', required: true, label: localized('Save') },
    { id: 'end', code: 'End', required: false, label: localized('End') },
    { id: 'home', code: 'Home', required: false, label: localized('Home') }
  ] }
  const removed = removeOptionalDocumentActions(schema, ['save', 'end', 'home'])
  assert.deepEqual(removed.actions.map(action => action.id), ['save'])
  assert.equal(removeOptionalDocumentActions(schema, ['save']), schema, 'a required-only selection is an identity no-op')
  assert.equal(removeOptionalDocumentActions(schema, ['missing']), schema, 'unknown IDs are ignored without replacing the document')
})

test('group removal deletes only selected structural fields and table columns in one immutable schema', () => {
  const source = template()
  const schema = {
    ...source,
    fields: [...source.fields, { ...source.fields[0], id: 'lastName', label: localized('Last name') }, { ...source.fields[0], id: 'phone', label: localized('Phone') }],
    tables: [{ ...source.tables[0], columns: [
      ...source.tables[0].columns,
      { id: 'code', binding: { kind: 'dataField', dataFieldId: 'code' }, label: localized('Code') },
      { id: 'status', binding: { kind: 'dataField', dataFieldId: 'status' }, label: localized('Status') }
    ] }]
  }
  const withoutFields = removeManagedFormFields(schema, ['firstName', 'lastName', 'missing', 'lastName'])
  assert.deepEqual(withoutFields.fields.map(field => field.id), ['phone'], 'a batch removes each selected field once and leaves unselected fields intact')
  assert.equal(removeManagedFormFields(schema, ['missing']), schema, 'a batch with no valid IDs is an identity no-op')
  const withoutColumns = removeDocumentColumns(schema, 'table', ['name', 'code', 'missing', 'code'])
  assert.deepEqual(withoutColumns.tables[0].columns.map(column => column.id), ['status'], 'a batch removes only selected columns')
  assert.equal(removeDocumentColumns(schema, 'table', ['missing']), schema, 'a batch with no valid columns is an identity no-op')
  assert.deepEqual(schema.fields.map(field => field.id), ['firstName', 'lastName', 'phone'], 'batch edits never mutate their source schema')
})

test('reusable definitions persist per user and instantiate without sharing field identity', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const blueprint = { id: 'library.code', name: 'کد', kind: 'text', componentId: 'definition.field', valueType: 'text' }
  assert.equal(saveFieldBlueprint(storage, 'a', blueprint).length, 1)
  assert.equal(loadFieldBlueprints(storage, 'b').length, 0)
  assert.equal(saveFieldBlueprint(storage, 'a', blueprint), null)
  assert.deepEqual(loadFieldBlueprints(storage, 'a'), [{...blueprint,componentDefinitionId:blueprint.id}])
  assert.equal(saveFieldBlueprint(null, 'a', blueprint), null)
})

test('frame dimensions accept complete manual Persian numbers, incomplete typing and exact size reuse', () => {
  assert.equal(parseFrameDimension('1'), undefined)
  assert.equal(parseFrameDimension(''), undefined)
  assert.equal(parseFrameDimension('', true), null)
  assert.equal(parseFrameDimension('۱۴۱۰'), 1410)
  assert.equal(parseFrameDimension('١٢٨٠'), 1280)
  assert.equal(parseFrameDimension('2401'), undefined)
  assert.deepEqual(copyFormDimensions({ device: 'mobile', width: 390, height: null, fitToPage: true }, { device: 'desktop', width: 1200, height: 750, fitToPage: true }), { device: 'mobile', width: 1200, height: 750, fitToPage: false })
})

test('adding and removing fields projects Canvas without changing saved rectangles or discarding the source', () => {
  const schema = template()
  const source = { ...emptyDesignerDraft(schema.id), canvas: { width: 1000, height: 100, fields: { firstName: { input: { left: 20, top: 40, width: 200, height: 30 }, label: { left: 20, top: 10, width: 200, height: 20 } } } } }
  const changed = addDocumentField(schema, 'editor', 'new', 'Added', { kind: 'text', componentId: 'definition.field', valueType: 'text' })
  const projected = designerDraftForEditor(source, changed, 'editor')
  assert.deepEqual(projected.canvas.fields.firstName, source.canvas.fields.firstName)
  assert.ok(projected.canvas.fields.new.input.top > 70)
  assert.equal(source.canvas.fields.new, undefined)
  assert.equal(resolveFormLayout(changed, projected, 'desktop').kind, 'designer-canvas')
})


test('layout observer uses each committed renderer contract, including empty panels and Canvas, instead of a stale page Schema', () => {
  const node = (sectionId, children, display = 'grid') => ({ dataset: { sectionId }, children, isConnected: true, getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, top: 0 }), display })
  const field = { dataset: { fieldId: 'firstName' }, getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }), querySelector: () => null }
  const real = node('editor', [field])
  const emptyA = node('empty-a', [])
  const emptyB = node('empty-b', [], 'block')
  const unrelated = node('unregistered-copy', [])
  const current = resolveFormLayout(template(), emptyDesignerDraft('current'), 'desktop')
  const empty = { ...current, fieldIds: [], firstRowFieldIds: undefined }
  const roots = new Map([[real, current], [emptyA, empty], [emptyB, { ...empty, kind: 'designer-canvas', canvas: { width: 100, height: 100, fields: {} } }]])
  const frame = { contains: node => [real, emptyA, emptyB, unrelated].includes(node) }
  const style = node => ({ display: node.display, gridTemplateColumns: Array(20).fill('20px').join(' '), position: 'static' })
  const check = () => inspectRegisteredFormLayouts(frame, roots, style)
  assert.ok(check().every(result => result.issues.length === 0))
  assert.equal(unrelated.dataset.layoutValidation, undefined)
  // A previously scheduled observer sees the new DOM contract immediately,
  // without closing over the prior document's full field list.
  roots.set(real, { ...empty, formId: 'next-document' })
  real.children = []
  const results = check()
  assert.equal(results[0].formId, 'next-document')
  assert.ok(results.every(result => result.issues.length === 0))
  assert.equal(emptyA.dataset.layoutValidation, 'passed')
  assert.equal(emptyB.dataset.layoutValidation, 'passed')
})

test('registered layout checks still report genuine missing fields and ignore detached or other-frame roots', () => {
  const contract = resolveFormLayout(template(), emptyDesignerDraft('current'), 'desktop')
  const grid = { children: [], dataset: { sectionId: 'editor', layoutWarning: 'old' }, isConnected: true, getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, top: 0 }) }
  const detached = { ...grid, isConnected: false }
  const otherFrame = { ...grid }
  const style = () => ({ display: 'grid', gridTemplateColumns: Array(20).fill('20px').join(' '), position: 'static' })
  const roots = new Map([[grid, contract], [detached, contract], [otherFrame, contract]])
  const result = inspectRegisteredFormLayouts({ contains: node => node !== otherFrame }, roots, style)
  assert.equal(result.length, 1)
  assert.ok(result[0].issues.some(issue => issue.includes('Schema fields missing from DOM: firstName')))
  assert.equal(grid.dataset.layoutValidation, 'warning')
  roots.set(grid, { ...contract, fieldIds: [] })
  assert.equal(inspectRegisteredFormLayouts({ contains: node => node === grid }, roots, style)[0].issues.length, 0)
  assert.equal(grid.dataset.layoutWarning, undefined)
})
