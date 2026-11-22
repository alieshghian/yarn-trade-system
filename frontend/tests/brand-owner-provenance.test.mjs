import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const originalPath = new URL('./references/brand-owner-export-20261023.json', import.meta.url)
const companionPath = new URL('../src/forms/brand-design.json', import.meta.url)

test('Brand owner export matches the historical hash and companion preserves geometry', async () => {
  const [original, companion] = await Promise.all([readFile(originalPath), readFile(companionPath)])
  assert.equal(createHash('sha256').update(original).digest('hex'), '6c2f801d8076d73007e31f5999cc588d8cb77c7a40bdb6365f5a82115cff543f')
  const owner = JSON.parse(original), runtime = JSON.parse(companion)
  assert.equal(owner.form.id, 'form.redesign.805deb77-bec5-41fa-af97-77b7007ca3a4')
  assert.equal(runtime.form.id, owner.form.id)
  const geometry = ({form, designerDraft}) => ({
    frame:form.frame, fields:form.schema.fields, sections:form.schema.sections, tables:form.schema.tables,
    canvas:designerDraft.canvas, overrides:designerDraft.overrides, formOverrides:form.designerOverrides,
  })
  assert.deepEqual(geometry(runtime), geometry(owner))
  assert.equal(runtime.operationalBehaviorContract.version, 81)
  assert.equal(runtime.form.customization.tablePresentation, true)
  assert.equal(owner.form.customization.tablePresentation, false)
  const runtimeActions = runtime.form.schema.actions.map(action => action.id)
  assert.deepEqual(runtimeActions.filter(id => !owner.form.schema.actions.some(action => action.id === id)),
    ['operational.copyLast','operational.copySelected'])
  const originalShape = structuredClone(runtime)
  delete originalShape.operationalBehaviorContractFile
  delete originalShape.operationalBehaviorContract
  for (const schema of [originalShape.form.schema, originalShape.form.template.schema,
    originalShape.form.schema.settings.specific.values.operationalSource.baseline]) {
    schema.actions = schema.actions.filter(action => !['operational.copyLast','operational.copySelected'].includes(action.id))
  }
  for (const defaults of [originalShape.designerDraft.defaults, originalShape.form.schema.settings.shared.designer.defaults]) {
    delete defaults.input.bold
    delete defaults.label
  }
  delete originalShape.form.schema.settings.fieldValidation
  originalShape.form.customization.tablePresentation = false
  assert.deepEqual(originalShape, owner, 'The documented integration changes account for every content difference')
})
