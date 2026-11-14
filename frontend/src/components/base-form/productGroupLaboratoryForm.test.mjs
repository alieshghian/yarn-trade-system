import assert from 'node:assert/strict'
import test from 'node:test'
import { createManagedLaboratoryForm, loadManagedLaboratoryForms, saveManagedLaboratoryForm } from './laboratoryFormDraftState.ts'
import { emptyDesignerDraft } from './designer.ts'
import { createProductGroupLaboratorySchema, productGroupCascadingTreeTitles, productGroupLaboratoryFormTitle, ensureProductGroupReportTable, productGroupReportRows, productGroupTerminalNodes } from './productGroupLaboratoryForm.ts'

const template = () => ({
  id: 'form-laboratory.template', schemaVersion: 1, version: 1, status: 'draft', mode: 'operational',
  title: { fa: 'آزمایشگاه', en: 'Laboratory', zh: '实验室' }, sections: [{ id: 'editor', kind: 'editor' }], fields: [], tables: [], actions: [], resources: {}, uniqueConstraints: [], layout: { direction: 'vertical', gap: 12 }
})

test('Product Group starter stores the five-column cascading tree configuration independently', () => {
  const schema = createProductGroupLaboratorySchema(template(), 'form.product-group.test')
  assert.equal(schema.title.fa, productGroupLaboratoryFormTitle)
  assert.equal(schema.tables.length, 1)
  assert.equal(schema.tables[0].columns.length, 6)
  assert.deepEqual(schema.tables[0].columns.map(c => c.label.fa), ['کد گروه', ...productGroupCascadingTreeTitles])
  assert.equal(schema.fields.length, 1)
  const field = schema.fields[0]
  assert.equal(field.componentId, 'base-form.cascading-tree-panels')
  assert.deepEqual(field.settings.cascadingTree.columnTitles, productGroupCascadingTreeTitles)
  assert.deepEqual(field.settings.cascadingTree.initialPath, ['demo-yarn', 'demo-yarn-chenille', 'demo-yarn-polyester', 'demo-yarn-grade-8'])
  assert.equal(field.settings.cascadingTree.nodes.length > 0, true)
  assert.equal(field.settings.layout.grid.columnSpan, 20)
})

test('Product Group form save and reopen retain the tree settings without modifying its source template', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const source = template()
  const schema = createProductGroupLaboratorySchema(source, 'form.product-group.persist')
  const form = createManagedLaboratoryForm({ id: schema.id, name: productGroupLaboratoryFormTitle, mode: 'operational', templateSchema: schema, templateDesigner: emptyDesignerDraft(source.id), frame: { device: 'desktop', width: 1440, height: null, fitToPage: true } })
  assert.equal(saveManagedLaboratoryForm(storage, 'developer', form), true)
  const reopened = loadManagedLaboratoryForms(storage, 'developer')?.forms[0]
  assert.equal(reopened?.schema.fields[0]?.componentId, 'base-form.cascading-tree-panels')
  assert.deepEqual(reopened?.schema.fields[0]?.settings?.cascadingTree?.columnTitles, productGroupCascadingTreeTitles)
  assert.deepEqual(reopened?.schema.fields[0]?.settings?.cascadingTree?.initialPath, ['demo-yarn', 'demo-yarn-chenille', 'demo-yarn-polyester', 'demo-yarn-grade-8'])
  assert.deepEqual(source.fields, [])
  assert.deepEqual(reopened.schema.tables, schema.tables)
})

test('repairs only the known empty default and preserves IDs, settings, geometry and source', () => {
  const schema = createProductGroupLaboratorySchema(template(), 'form.test-safe')
  schema.tables[0].columns = []
  schema.tables[0].settings = { toolbar: { title: { x: 9 } }, fillViewport: false }
  schema.sections[0].initialSize = { height: 480 }
  const original = structuredClone(schema)
  const next = ensureProductGroupReportTable(schema)
  assert.equal(next.tables[0].id, 'form.test-safe.report')
  assert.equal(next.tables[0].sectionId, 'form.test-safe.report-panel')
  assert.equal(next.tables[0].columns.length, 6)
  assert.deepEqual(next.tables[0].settings, original.tables[0].settings)
  assert.deepEqual(next.sections, original.sections)
  assert.deepEqual(next.fields, original.fields)
  assert.deepEqual(schema, original)
  assert.equal(ensureProductGroupReportTable(next), next)
  const customized = structuredClone(next)
  customized.tables[0].columns[0].width = 243
  assert.equal(ensureProductGroupReportTable(customized), customized)
  for (const mutate of [s => s.tables = [], s => s.tables[0].id = 'custom', s => s.tables[0].dataSourceId = 'operational', s => s.sections.find(x => x.kind === 'grid').enabled = false]) {
    const untouched = structuredClone(original); mutate(untouched)
    assert.equal(ensureProductGroupReportTable(untouched), untouched)
  }
})

test('report contains full and unfinished leaf paths with root public code', () => {
  const nodes=[{id:'r',parentId:null,name:'اصل',code:'001'},{id:'c',parentId:'r',name:'فرزند'},{id:'l',parentId:'c',name:'برگ'},{id:'short',parentId:'r',name:'ناقص'}]
  const before=structuredClone(nodes),rows=productGroupReportRows('tree',nodes)
  assert.deepEqual(rows.map(row=>row.id),['l','short'])
  assert.equal(rows[0]['tree.code'],'001')
  assert.equal(rows[0]['tree.level.2'],'برگ')
  assert.deepEqual(nodes,before)
})
test('terminal depth is root-wide, locked persistently, and independent between roots',()=>{
 const nodes=[{id:'r',parentId:null,name:'r',lockedDepth:2},{id:'a',parentId:'r',name:'a'},{id:'b',parentId:'r',name:'b'},{id:'l',parentId:'a',name:'l'},{id:'s',parentId:null,name:'s'},{id:'x',parentId:'y',name:'x'},{id:'y',parentId:'x',name:'y'}]
 assert.deepEqual(productGroupTerminalNodes(nodes).map(n=>n.id),['l','s'])
 assert.deepEqual(productGroupTerminalNodes(nodes.filter(n=>n.id!=='l')).map(n=>n.id),['s'])
})

test('different branches share their own root code without leaking internal codes or fabricating missing ones', () => {
  const nodes = [
    {id:'r1',parentId:null,name:'نخ',code:'001'},
    {id:'a',parentId:'r1',name:'اکریلیک',code:'internal-a'},
    {id:'b',parentId:'a',name:'براق',code:'internal-b'},
    {id:'c',parentId:'a',name:'مات'},
    {id:'r2',parentId:null,name:'پارچه',code:'002'},
    {id:'d',parentId:'r2',name:'ساده',code:'internal-d'},
    {id:'missing',parentId:null,name:'بدون کد'},
    {id:'e',parentId:'missing',name:'فرزند',code:'internal-e'},
    {id:'orphan',parentId:'absent',name:'یتیم',code:'internal-orphan'}
  ]
  const before = structuredClone(nodes), rows = productGroupReportRows('tree',nodes)
  assert.deepEqual(rows.map(row=>row['tree.code']), ['001','001','002',''])
  assert.equal(new Set(rows.map(row=>row.id)).size,4)
  assert.equal(rows.find(row=>row.id==='b')['tree.level.2'],'براق')
  assert.deepEqual(nodes,before)
})

test('report includes shallow branches and isolated roots while product eligibility stays strict',()=>{
 const nodes=[{id:'r',parentId:null,name:'DTY',code:'004',lockedDepth:4},{id:'bright',parentId:'r',name:'براق'},{id:'raw',parentId:'bright',name:'خام'},{id:'d150',parentId:'raw',name:'150D'},{id:'d300',parentId:'raw',name:'300D'},{id:'f',parentId:'d300',name:'96F'},{id:'single',parentId:null,name:'تنها',code:'005'}]
 const rows=productGroupReportRows('tree',nodes)
 assert.deepEqual(rows.map(row=>row.id),['d150','f','single'])
 assert.equal(rows[0]['tree.level.4'],'')
 assert.equal(rows[0]['tree.level.3'],'150D')
 assert.equal(rows[0]['tree.code'],'004')
 assert.deepEqual(productGroupTerminalNodes(nodes).map(node=>node.id),['f','single'])
 const extended=[...nodes,{id:'new',parentId:'d150',name:'48F'}]
 assert.deepEqual(productGroupReportRows('tree',extended).map(row=>row.id),['f','single','new'])
})
test('report suppresses only identical normalized complete paths, not different leaf names',()=>{
 const nodes=[{id:'r',parentId:null,name:'نخ'},{id:'a',parentId:'r',name:'نمره ۱۲'},{id:'b',parentId:'r',name:'نمره١٢'},{id:'c',parentId:'r',name:'نمره ۵'}]
 assert.deepEqual(productGroupReportRows('tree',nodes).map(row=>row.id),['a','c'])
})
