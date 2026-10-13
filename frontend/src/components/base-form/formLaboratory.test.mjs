import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const lab = read('../../FormLaboratoryPage.tsx')
const adapter = read('./BaseFormGridBoundary.tsx')
const data = read('./syntheticPersons.ts')
const shell = read('./BaseFormShell.tsx')
const navigation = read('../../navigation.ts')
const app = read('../../App.tsx')
const backendNavigation = read('../../../../src/YarnTrade.Api/Controllers/NavigationController.cs')
const laboratoryApi = read('../../../../src/YarnTrade.Api/Controllers/FormLaboratoryGridController.cs')
const permissions = read('../../../../src/YarnTrade.Api/Security/PermissionCatalog.cs')
const golden = read('./specs/persons.golden.v1.json')
const interaction = read('../../formInteraction.ts')
const css = read('../../styles.css')

test('Form Laboratory is an authorized stable route under Definitions & Settings', () => {
  assert.match(navigation, /formLaboratory/)
  assert.match(backendNavigation, /new\("formLaboratory", "formLaboratory", "formLaboratory\.view"\)/)
  assert.match(permissions, /P\("formLaboratory\.view"/)
  assert.match(app, /tab === 'formLaboratory'/)
})

test('Laboratory loads synthetic data through its server endpoint, with a 100k option', () => {
  assert.doesNotMatch(lab, /PersonsPage|\/api\/persons|\/api\/master-data\/persons/)
  assert.match(lab, /data-synthetic-only="true"/)
  assert.match(lab, /\/api\/form-laboratory\/synthetic-grid/)
  assert.match(laboratoryApi, /ApplyFilters\(rows, filters\)/)
  assert.match(laboratoryApi, /SearchIndexes/)
  assert.match(laboratoryApi, /StartsWithWord/)
  assert.match(laboratoryApi, /new List<SyntheticGridPerson>\(pageSize\)/)
  assert.match(laboratoryApi, /foreach \(var row in rows\)/)
  assert.match(data, /createSyntheticPersons/)
  assert.match(data, /laboratoryDatasetSizes = \[100, 1000, 10000, 100000\]/)
})

test('Stable laboratory IDs and shared composition are explicit', () => {
  assert.match(lab, /id: 'form-laboratory\.persons-synthetic'/)
  for (const id of ['laboratory.editor', 'laboratory.grid', 'laboratory.footer', 'personCode', 'address', 'notes']) assert.ok(lab.includes(id))
  assert.match(lab, /BaseFormShell/)
  assert.match(shell, /BaseFormSection/)
})

test('Laboratory responsive layout, splitter and server-paged DOM table are protected', () => {
  assert.match(css, /\.laboratory-form-grid\{display:grid;grid-template-columns:repeat\(20,minmax\(0,1fr\)\)/)
  assert.match(css, /@media\(max-width:760px\)\{\.form-laboratory-banner/)
  assert.match(shell, /base-form-splitter/)
  assert.match(adapter, /pageSize: 100/)
  assert.match(adapter, /remotePage\?\.items/)
})

test('Golden baseline and global F3 interaction remain independent', () => {
  assert.match(golden, /"baselineImmutable": true/)
  assert.match(interaction, /event\.key !== 'F3'/)
  assert.match(lab, /handleDesignerKey/)
})
