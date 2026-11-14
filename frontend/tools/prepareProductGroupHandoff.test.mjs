import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareProductGroupHandoff, productGroupFormId } from './prepareProductGroupHandoff.mjs'
import { formTestActionFor } from '../src/components/base-form/formBehavior.ts'

const fixture = () => {
  const schema = { id: productGroupFormId, fields: [{ id: 'tree', componentId: 'base-form.cascading-tree-panels', settings: { cascadingTree: { nodes: [{ id: 'root', parentId: null, name: 'test', code: '201' }] } } }], sections: [{ id: productGroupFormId + '.report-panel', tableIds: [productGroupFormId + '.report'] }], tables: [{ id: productGroupFormId + '.report', columns: Array.from({ length: 6 }, (_, i) => ({ id: 'column-' + i, width: 111 + i })) }], actions: ['new-person', 'copy-last', 'copy-selected', 'edit-person', 'delete-person', 'demo-save', 'reset-sample'].map(id => ({ id, code: id, label: { fa: id } })) }
  const form = { id: productGroupFormId, schema, frame: { width: 1218, height: 975 }, designerOverrides: { overrides: { tree: { width: 200, height: 343 } } }, template: { version: 1 }, structurePermissions: { tableSchemaChange: false }, customization: { colors: false, typography: false, formSize: false, tablePresentation: false } }
  return { artifact: 'yarn-trade.single-form-design-export', version: 1, form, designerDraft: { formId: productGroupFormId }, behaviorManifest: { componentContracts: [{ componentId: 'base-form.cascading-tree-panels' }] }, operationalBehaviorContract: { version: 13 }, recoverySnapshot: { form: structuredClone(form), structureHistory: { present: structuredClone(schema), past: [structuredClone(schema)], future: [] }, designerHistory: { present: {}, past: [{ existing: true }], future: [], document: { present: structuredClone(schema), past: [structuredClone(schema)], future: [] } } } }
}

test('only authorized metadata changes; original design, IDs, data and history remain intact', () => {
  const input = fixture(), original = structuredClone(input)
  const output = prepareProductGroupHandoff(input, 'source-hash')
  assert.deepEqual(input, original)
  assert.ok(Object.values(output.form.customization).every(Boolean))
  assert.deepEqual(output.form.frame, original.form.frame)
  assert.deepEqual(output.form.designerOverrides, original.form.designerOverrides)
  assert.deepEqual(output.form.schema.tables, original.form.schema.tables)
  assert.deepEqual(output.form.schema.fields[0].settings.cascadingTree.nodes, original.form.schema.fields[0].settings.cascadingTree.nodes)
  assert.equal(output.form.schema.fields[0].settings.cascadingTree.maxSubgroups, 4)
  assert.deepEqual(output.recoverySnapshot.structureHistory.present, output.form.schema)
  assert.deepEqual(output.recoverySnapshot.designerHistory.document.present, output.form.schema)
  assert.deepEqual(output.recoverySnapshot.structureHistory.past, original.recoverySnapshot.structureHistory.past)
  assert.deepEqual(output.form.structurePermissions, original.form.structurePermissions)
  assert.deepEqual(output.form.schema.actions.map(a => a.id), original.form.schema.actions.map(a => a.id))
  assert.deepEqual(output.form.schema.actions.map(formTestActionFor), ['create', 'copyLast', 'copySelected', 'edit', 'delete', 'save', 'close'])
  assert.deepEqual(JSON.parse(JSON.stringify(output)), output)
})

test('explicit admin depth is retained and conflicting inputs fail closed', () => {
  const input = fixture()
  for (const schema of [input.form.schema, input.recoverySnapshot.form.schema, input.recoverySnapshot.structureHistory.present, input.recoverySnapshot.designerHistory.document.present]) schema.fields[0].settings.cascadingTree.maxSubgroups = 2
  assert.equal(prepareProductGroupHandoff(input, '').form.schema.fields[0].settings.cascadingTree.maxSubgroups, 2)
  const conflict = fixture()
  for (const schema of [conflict.form.schema, conflict.recoverySnapshot.form.schema, conflict.recoverySnapshot.structureHistory.present, conflict.recoverySnapshot.designerHistory.document.present]) schema.actions[0].operationId = 'other.operation'
  assert.throws(() => prepareProductGroupHandoff(conflict, ''), /Conflicting action/)
  const broken = fixture(); broken.recoverySnapshot.structureHistory.present.tables = []
  assert.throws(() => prepareProductGroupHandoff(broken, ''), /Recovery present/)
})
