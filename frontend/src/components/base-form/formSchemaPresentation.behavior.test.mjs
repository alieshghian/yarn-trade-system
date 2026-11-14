import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { addFormSection, updateFormSection } from './formDocumentStructure.ts'
import { emptyDesignerDraft } from './designer.ts'

// Transform only the shared presentation and its direct dependencies; no build or HTTP server.
const server = await createServer({ root: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), configFile: false, plugins: [react()], logLevel: 'error', resolve: { preserveSymlinks: true }, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } })
after(() => server.close())
const { FormSchemaPresentation } = await server.ssrLoadModule('/src/components/base-form/FormSchemaPresentation.tsx')
const {FormSettingsButton}=await server.ssrLoadModule('/src/components/base-form/FormSettingsButton.tsx')
const {withCascadingTreeDepth}=await server.ssrLoadModule('/src/components/base-form/CascadingTreeSettingsControls.tsx')
const text = value => ({ fa: value, en: value, zh: value })
const base = () => ({ id: 'form.render', schemaVersion: 1, version: 1, status: 'draft', mode: 'hybrid', title: text('Preview'), fields: [], layout: { direction: 'vertical', gap: 8 }, sections: [{ id: 'editor', kind: 'editor' }, { id: 'grid', kind: 'grid' }, { id: 'footer', kind: 'footer' }], tables: [{ id: 'table', sectionId: 'grid', title: text('First table'), dataSourceId: 'local.synthetic', columns: [{ id: 'name', binding: { kind: 'dataField', dataFieldId: 'name' }, label: text('Name') }] }] })
const props = schema => ({ schema, designerDraft: emptyDesignerDraft(schema.id), language: 'fa', readOnly: true, editor: React.createElement('div', { 'data-original-editor': true }, 'Original editor'), footer: React.createElement('div', { 'data-original-actions': true }, 'Original actions'), grid: { rows: [{ name: 'Synthetic row' }], columns: [{ id: 'name', label: 'Name', width: 160, type: 'text', value: row => row.name }] } })
const render = schema => renderToStaticMarkup(React.createElement(FormSchemaPresentation, props(schema)))

test('the shared settings entry remains available and hierarchy configuration preserves saved data and presentation',()=>{
  const button=renderToStaticMarkup(React.createElement(FormSettingsButton,{language:'fa',onClick:()=>{}}))
  assert.match(button,/aria-label="تنظیمات فرم"/);assert.match(button,/aria-expanded="false"/)
  const schema=base(),nodes=[{id:'root',parentId:null,name:'گروه',code:'007'},{id:'child',parentId:'root',name:'زیرگروه',code:'008'}]
  schema.fields=[{id:'tree',sectionId:'editor',componentId:'base-form.cascading-tree-panels',settings:{cascadingTree:{maxSubgroups:4,nodes,initialPath:['root','child'],columnTitles:['اول','دوم']},binding:'untouched'}}]
  for(const count of [0,2,3,4]){
    const next=withCascadingTreeDepth(schema,'tree',count)
    assert.equal(next.fields[0].settings.cascadingTree.maxSubgroups,count)
    assert.equal(next.fields[0].settings.cascadingTree.nodes,nodes)
    assert.equal(next.tables,schema.tables);assert.equal(next.sections,schema.sections)
    assert.deepEqual(next.fields[0].settings.cascadingTree.initialPath,['root','child'])
    assert.equal(next.fields[0].settings.binding,'untouched')
  }
  for(const count of [-1,5,2.5,NaN])assert.equal(withCascadingTreeDepth(schema,'tree',count),schema)
  assert.equal(schema.fields[0].settings.cascadingTree.maxSubgroups,4)
})

test('the unchanged three-section template uses the original shared frame and splitter', () => {
  const html = render(base())
  assert.match(html, /base-form-splitter/)
  assert.match(html, /data-original-editor/)
  assert.match(html, /data-original-actions/)
  assert.equal((html.match(/data-table-id=/g) ?? []).length, 1)
  assert.doesNotMatch(html, /form-document-composition/)
})

test('chrome-only layout preview keeps the standard grids, settings and source rows', () => {
  const schema = addFormSection(base(), 'grid', 'grid.two')
  const properties = props(schema)
  const before = structuredClone({ schema, draft: properties.designerDraft, rows: properties.grid.rows })
  const html = renderToStaticMarkup(React.createElement(FormSchemaPresentation, {
    ...properties, layoutPreview: true, readOnly: false,
    grids: { 'grid.two.table': { ...properties.grid, rows: [{ name: 'Private second source' }] } }
  }))
  assert.equal((html.match(/data-layout-preview="true"/g) ?? []).length, 2)
  assert.equal((html.match(/class="base-grid-boundary/g) ?? []).length, 2)
  assert.equal(html.includes('base-form-splitter'), render(schema).includes('base-form-splitter'))
  assert.match(html, /Synthetic row/); assert.match(html, /Private second source/); assert.doesNotMatch(html, /base-grid-virtual-spacer/)
  assert.match(html, /data-original-editor/)
  assert.match(html, /data-original-actions/)
  assert.deepEqual({ schema, draft: properties.designerDraft, rows: properties.grid.rows }, before)
})

test('the real shared React tree renders one input panel and two or four independent grid components', () => {
  let schema = base()
  for (let count = 2; count <= 4; count++) {
    schema = addFormSection(schema, 'grid', `grid.${count}`)
    const html = render(schema)
    assert.equal((html.match(/data-table-id=/g) ?? []).length, count)
    assert.equal((html.match(/class="base-grid-boundary/g) ?? []).length, count)
    assert.equal((html.match(/data-original-editor=/g) ?? []).length, 1)
    assert.equal((html.match(/data-original-actions=/g) ?? []).length, 1)
    assert.ok(html.indexOf('data-document-section-id="footer"') > html.indexOf(`data-document-section-id="grid.${count}"`))
    assert.doesNotMatch(html, /(?:disabled|readOnly)=""[^>]*type="search"|type="search"[^>]*(?:disabled|readOnly)=""/i)
  }
})

test('nested horizontal groups render section-specific editors and hide only the selected branch', () => {
  let schema = addFormSection(addFormSection(base(), 'group', 'group'), 'editor', 'editor.two')
  schema = updateFormSection(schema, 'group', { layout: { direction: 'horizontal', gap: 10 } })
  schema = updateFormSection(schema, 'editor.two', { parentId: 'group' })
  const editorIds = []
  const html = renderToStaticMarkup(React.createElement(FormSchemaPresentation, { ...props(schema), renderEditor: section => { editorIds.push(section.id); return React.createElement('div', { 'data-editor-section': section.id }) } }))
  assert.deepEqual(editorIds, ['editor', 'editor.two'])
  assert.match(html, /form-document-section-children" style="flex-direction:row/)
  const hidden = render(updateFormSection(schema, 'group', { enabled: false }))
  assert.doesNotMatch(hidden, /data-document-section-id="editor.two"/)
  assert.match(hidden, /data-document-section-id="editor"/)
})

test('scoped table typography is emitted on exactly that shared grid boundary', () => {
  const schema = addFormSection(base(), 'grid', 'grid.two')
  const properties = props(schema)
  properties.designerDraft.tableFont = { size: 13 }
  properties.designerDraft.tables = { 'grid.two.table': { tableFont: { size: 19 } } }
  const html = renderToStaticMarkup(React.createElement(FormSchemaPresentation, properties))
  assert.equal((html.match(/--lab-table-font-size:19px/g) ?? []).length, 1)
  assert.match(html, /--lab-table-font-size:13px/)
})


test('report field rows render above only their own table using the shared editor', () => {
  const schema = base()
  schema.sections.push({ id: 'filters', kind: 'editor', tableHeaderFor: 'table' })
  const html = renderToStaticMarkup(React.createElement(FormSchemaPresentation, { ...props(schema), renderEditor: section => React.createElement('div', { 'data-report-editor': section.id }, 'Report filters') }))
  assert.equal((html.match(/data-report-row-id="filters"/g) ?? []).length, 1)
  assert.ok(html.indexOf('data-report-row-id="filters"') < html.indexOf('class="base-grid-boundary'))
  assert.doesNotMatch(html, /data-document-section-id="filters"/)
})


test('review highlighting is a temporary view projection and structural table deletion removes the actual grid', () => {
  const schema = base(), properties = props(schema), originalDraft = JSON.stringify(properties.designerDraft)
  const html = renderToStaticMarkup(React.createElement(FormSchemaPresentation, { ...properties, presentationMode: 'design', columnReview: { table: ['name'] } }))
  assert.match(html, /data-table-review="1"/)
  assert.match(html, /form-table-review-warning/)
  assert.match(html, /#fff0ed/)
  assert.equal(JSON.stringify(properties.designerDraft), originalDraft)
  assert.doesNotMatch(render(schema), /data-table-review=/)
  schema.tables = []; schema.sections = schema.sections.filter(section => section.kind !== 'grid')
  assert.doesNotMatch(render(schema), /class="base-grid-boundary/)
})

test('a presentation-only schema with linked columns renders without requiring editor fields',()=>{
  const schema=base();schema.tables[0].columns[0].sourceFieldIds=['name']
  delete schema.fields
  assert.match(render(schema),/class="base-grid-boundary/)
})

test('a composed multiline value uses the shared grid cell with preserved line breaks',()=>{
  const schema=base(),properties=props(schema)
  properties.grid.rows=[{name:'نام\nنام خانوادگی'}]
  properties.grid.columns[0].multiline=true
  const html=renderToStaticMarkup(React.createElement(FormSchemaPresentation,properties))
  assert.match(html,/class="is-multiline"/)
  assert.match(html,/نام\nنام خانوادگی/)
})
