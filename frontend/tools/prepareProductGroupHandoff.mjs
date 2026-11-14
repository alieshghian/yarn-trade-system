import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const productGroupFormId = 'form.new.8e77aae6-9477-41f9-b473-9d52511535a1'
const operations = { 'new-person': 'create', 'copy-last': 'copyLast', 'copy-selected': 'copySelected', 'edit-person': 'edit', 'delete-person': 'delete', 'demo-save': 'save', 'reset-sample': 'close' }
const permissionKeys = ['colors', 'typography', 'formSize', 'tablePresentation']
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const requireValue = (condition, message) => { if (!condition) throw new Error(message) }
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** Authorized handoff-only transformation. Never accesses browser storage or changes geometry. */
export function prepareProductGroupHandoff(input, sourceHash) {
  requireValue(input.artifact === 'yarn-trade.single-form-design-export' && input.version === 1, 'Unsupported export')
  requireValue(input.form?.id === productGroupFormId && input.form.schema?.id === productGroupFormId && input.designerDraft?.formId === productGroupFormId, 'Form identity mismatch')
  requireValue(input.behaviorManifest?.componentContracts?.some(c => c.componentId === 'base-form.cascading-tree-panels'), 'Missing tree contract')
  requireValue(input.operationalBehaviorContract && input.recoverySnapshot, 'Missing behavior or recovery snapshot')
  const original = input.form.schema, recovery = input.recoverySnapshot
  requireValue(same(recovery.form?.schema, original) && same(recovery.structureHistory?.present, original), 'Recovery present differs from export')
  const output = structuredClone(input)
  const patchSchema = schema => {
    const trees = schema.fields.filter(f => f.componentId === 'base-form.cascading-tree-panels')
    requireValue(trees.length === 1, 'Expected exactly one existing hierarchy')
    const tree = trees[0], config = tree.settings?.cascadingTree
    requireValue(config && Array.isArray(config.nodes), 'Missing saved hierarchy configuration')
    const depth = config.maxSubgroups ?? 4
    requireValue(Number.isInteger(depth) && depth >= 0 && depth <= 4, 'Invalid subgroup depth')
    config.maxSubgroups = depth
    for (const [id, operation] of Object.entries(operations)) {
      const action = schema.actions?.find(a => a.id === id)
      requireValue(action, 'Missing existing action: ' + id)
      const expected = 'cascadingTree.' + operation
      requireValue(!action.operationId || action.operationId === expected, 'Conflicting action operation: ' + id)
      action.operationId = expected
    }
    const report = schema.tables?.find(t => t.id === productGroupFormId + '.report')
    requireValue(report?.columns?.length === 6 && new Set(report.columns.map(c => c.id)).size === 6, 'Report definition is incomplete')
    requireValue(schema.sections.some(s => s.id === productGroupFormId + '.report-panel' && s.tableIds?.includes(report.id)), 'Report section binding missing')
  }
  patchSchema(output.form.schema)
  for (const key of permissionKeys) output.form.customization[key] = true
  output.recoverySnapshot.form = structuredClone(output.form)
  output.recoverySnapshot.structureHistory.present = structuredClone(output.form.schema)
  const document = output.recoverySnapshot.designerHistory?.document
  if (document) {
    requireValue(same(document.present, original), 'Designer document present differs from export')
    document.present = structuredClone(output.form.schema)
  }
  output.handoffPreparation = {
    version: 1, sourceSHA256: sourceHash,
    changes: ['enable-four-user-appearance-permissions', 'explicit-existing-subgroup-depth', 'explicit-action-operations-preserving-ids'],
    administratorOnly: ['hierarchy-depth', 'structure', 'bindings', 'business-behavior'],
    operational: { activated: false, persistence: 'requires-API-and-database-integration', authorization: 'enforce-permissions-and-depth-on-server', testFixtures: 'do-not-import-as-operational-records' },
  }
  // Prove that the current schema differs only at the authorized metadata leaves.
  const withoutMetadata = schema => {
    const value = structuredClone(schema)
    for (const f of value.fields) if (f.componentId === 'base-form.cascading-tree-panels') delete f.settings.cascadingTree.maxSubgroups
    for (const a of value.actions ?? []) if (operations[a.id]) delete a.operationId
    return value
  }
  requireValue(same(withoutMetadata(output.form.schema), withoutMetadata(original)), 'Unexpected schema change')
  for (const key of ['frame', 'designerOverrides', 'template', 'structurePermissions']) requireValue(same(output.form[key], input.form[key]), 'Unexpected form change: ' + key)
  requireValue(same(output.designerDraft, input.designerDraft), 'Designer appearance changed')
  requireValue(same(output.recoverySnapshot.structureHistory.past, recovery.structureHistory.past), 'Structure history changed')
  requireValue(same(output.recoverySnapshot.designerHistory.past, recovery.designerHistory.past), 'Designer history changed')
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , source, destination] = process.argv
  requireValue(source && destination, 'Usage: node prepareProductGroupHandoff.mjs source.json NEW-destination.json')
  const bytes = readFileSync(source), input = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
  const output = prepareProductGroupHandoff(input, sha256(bytes))
  const serialized = JSON.stringify(output, null, 2) + '\n'
  // Exclusive creation: source and any existing destination remain untouched.
  writeFileSync(destination, serialized, { flag: 'wx' })
  console.log(JSON.stringify({ file: destination, sha256: sha256(serialized), formId: output.form.id, changes: output.handoffPreparation.changes }))
}
