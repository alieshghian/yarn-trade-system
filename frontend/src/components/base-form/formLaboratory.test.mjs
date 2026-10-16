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
  assert.match(lab, /useState<\(typeof laboratoryDatasetSizes\)\[number\]>\(100000\)/)
})

test('Stable laboratory IDs and shared composition are explicit', () => {
  assert.match(lab, /id: 'form-laboratory\.persons-synthetic'/)
  for (const id of ['laboratory.editor', 'laboratory.grid', 'laboratory.footer', 'personCode', 'address', 'notes']) assert.ok(lab.includes(id))
  assert.match(lab, /BaseFormShell/)
  assert.match(shell, /BaseFormSection/)
})

test('Laboratory responsive layout, splitter and virtual server-paged DOM table are protected', () => {
  assert.match(css, /\.laboratory-form-grid\{display:grid;grid-template-columns:repeat\(20,minmax\(0,1fr\)\)/)
  assert.match(css, /@media\(max-width:760px\)\{\.form-laboratory-banner/)
  assert.match(shell, /base-form-splitter/)
  assert.match(adapter, /pageSize: 100/)
  assert.match(adapter, /aria-rowcount=/)
  assert.match(adapter, /data-grid-index=/)
  assert.match(lab, /remoteQueryScope=\{datasetSize\}/)
  assert.match(adapter, /width: '100%'/)
  assert.match(css, /\.base-grid-virtual-wrap\{direction:ltr;overflow-y:scroll;scrollbar-gutter:stable/)
})

test('Golden baseline and global F3 interaction remain independent', () => {
  assert.match(golden, /"baselineImmutable": true/)
  const keyNavigationHandler = interaction.slice(interaction.indexOf('const keydown ='), interaction.indexOf('const invokeSave ='))
  const saveHandlers = interaction.slice(interaction.indexOf('const invokeSave ='), interaction.indexOf("root.addEventListener('keydown', saveKeydown"))
  assert.match(keyNavigationHandler, /functionKeyFromEvent\(event\) === 'F3'\) return/)
  assert.match(saveHandlers, /functionKeyFromEvent\(event\) !== 'F3'/)
  assert.match(saveHandlers, /!button\.disabled && button\.getClientRects\(\)\.length > 0/)
  assert.match(saveHandlers, /save\?\.click\(\)/)
  assert.match(lab, /handleDesignerKey/)
})

test('Synthetic grid removes the server status note and supports multi-cell filter context actions', () => {
  assert.doesNotMatch(adapter, /فیلتر و مرتب‌سازی در سرور انجام می‌شود|Filtering and sorting run on the server/)
  assert.match(adapter, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(adapter, /event\.shiftKey/)
  assert.match(adapter, /selectedCells: selection/)
  assert.match(adapter, /فقط مقادیر انتخاب‌شده/)
  assert.match(adapter, /به‌جز مقادیر انتخاب‌شده/)
  assert.match(adapter, /grouped\.set\(cell\.columnId, values\)/)
  assert.match(css, /\.base-grid-table td\.is-cell-selected/)
})
