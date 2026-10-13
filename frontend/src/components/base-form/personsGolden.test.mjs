import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const golden = JSON.parse(read('./specs/persons.golden.v1.json'))
const persons = read('../../PersonsPage.tsx')
const excelHeader = read('./ExcelGridColumnHeader.tsx')
const excelGrid = read('./excelGrid.ts')
const laboratoryGrid = read('./BaseFormGridBoundary.tsx')
const personsGridApi = read('../../../../src/YarnTrade.Api/Controllers/PersonsGridController.cs')
const controls = read('../../DefinitionControls.tsx')
const interaction = read('../../formInteraction.ts')
const app = read('../../App.tsx')
const settings = read('../../UserSettingsPage.tsx')
const css = read('../../styles.css')

test('Golden reference is versioned, stable-ID based and contains no Person records', () => {
  assert.equal(golden.schemaVersion, 1)
  assert.equal(golden.form.id, 'persons.definition')
  assert.equal(golden.form.baselineImmutable, true)
  assert.equal(golden.form.dataPolicy, 'metadata-only-no-person-records')
  const editorFields = golden.sections.find(section => section.id === 'persons.editor').rows.flatMap(row => row.fields)
  assert.deepEqual(editorFields.map(field => field.id), [
    'personCode', 'titleId', 'firstName', 'lastName', 'directorName', 'jobId', 'brandIds',
    'defaultBrandId', 'nationalityId', 'phone', 'mobile', 'address', 'notes-active-group'
  ])
  assert.ok(!Object.hasOwn(golden, 'records'))
  assert.ok(!JSON.stringify(golden).includes('995'))
})

test('Golden editor track proportions, rows, and responsive breakpoints remain anchored to CSS', () => {
  assert.match(css, /persons-page\.person-layout-five \.person-editor \.person-form-grid\{grid-template-columns:repeat\(20,minmax\(0,1fr\)\)/)
  assert.match(css, /person-code-field\{grid-column:1 \/ span 2;grid-row:1\}/)
  assert.match(css, /person-address-field\{grid-column:1 \/ span 10;grid-row:3\}/)
  assert.match(css, /@media\(max-width:760px\).*person-form-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/)
  assert.match(css, /@media\(max-width:520px\).*person-form-grid\{grid-template-columns:minmax\(0,1fr\)!important\}/)
})

test('Golden grid retains sorting, Excel filtering, column search, resize, ordering and visibility', () => {
  for (const behavior of ['ExcelGridColumnHeader', 'applyGridFiltersAndSort', 'applyFilter', 'columnDragOver', 'dropColumn', 'resizeColumn', 'toggleColumn']) assert.ok(persons.includes(behavior), `${behavior} remains integrated in PersonsPage`)
  for (const behavior of ['Sort Ascending', 'Sort Descending', 'Filter by Color', 'Select All', 'Cancel', 'gridDistinctValues', 'Top 10…', 'Above Average']) assert.ok(excelHeader.includes(behavior) || excelHeader.includes(behavior.replaceAll(' ', '')) || excelGrid.includes(behavior), `${behavior} remains in the shared grid`)
  assert.match(excelHeader, /ExcelGridFilterScope/)
  assert.match(excelHeader, /document\.addEventListener\('pointerdown', outside, true\)/)
  assert.match(excelHeader, /document\.addEventListener\('keydown', escape, true\)/)
  assert.match(laboratoryGrid, /ExcelGridColumnHeader/)
  assert.deepEqual(golden.sections.find(section => section.id === 'persons.grid').defaultColumns.map(column => column.id),
    ['personCode', 'displayName', 'job', 'nationality', 'mobile', 'phone', 'isActive'])
})

test('Search, filters, counts and paging run against the full server-side Persons query', () => {
  assert.match(persons, /applyGridFiltersAndSort/)
  assert.match(persons, /\/api\/master-data\/persons\/grid/)
  assert.match(personsGridApi, /ApplyFilters\(query, filters, language\)/)
  assert.match(personsGridApi, /CountAsync\(ct\)/)
  assert.match(personsGridApi, /Skip\(\(page - 1\) \* pageSize\)\.Take\(pageSize\)/)
  assert.match(laboratoryGrid, /remoteQuery\(\{ page, pageSize: 100/)
  const grid = golden.sections.find(section => section.id === 'persons.grid')
  assert.equal(grid.capabilities.globalSearchAboveGrid, 'server-side over the full Persons query')
  assert.equal(grid.capabilities.filteringAndCounts, 'server-side over all Persons records')
})

test('Editor/grid splitter retains pointer resize bounds and per-user storage', () => {
  assert.match(persons, /persons-split:\$\{userKey\}/)
  assert.match(persons, /setTopHeight\(Math\.max\(260, Math\.min\(frameHeight - 260/)
  assert.match(persons, /className="split-handle" onPointerDown=\{resizeStart\}/)
  assert.equal(golden.editorGridSplitter.defaultEditorHeightPx, 330)
})

test('Footer actions, per-user shortcut settings and F3 behavior remain protected', () => {
  assert.match(persons, /persons-shortcuts:\$\{userKey\}/)
  assert.match(persons, /shortcutOptions = \['Space', 'Insert', 'Delete'/)
  assert.match(persons, /<Shortcut code="F3"/)
  assert.match(persons, /<Shortcut code="Esc"/)
  assert.match(interaction, /event\.key !== 'F3'/)
  assert.match(interaction, /save\?\.click\(\)/)
  assert.match(interaction, /closest\('\[data-form-scope\]'\)/)
  assert.match(controls, /export function Shortcut/)
})

test('Global user theme and font preferences remain inherited by the form', () => {
  assert.match(app, /dataset\.theme = theme/)
  assert.match(app, /dataset\.userFont = fontFamily/)
  assert.match(app, /dataset\.userFontSize = fontSize/)
  assert.match(settings, /api<UserPreferences>\('\/api\/user-settings'\)/)
  for (const token of ['--user-font-family', '--ink', '--muted', '--line', '--cream', '--teal', '--gold']) assert.ok(css.includes(token))
  assert.match(css, /\.persons-page \.person-table,\.persons-page \.person-table td\{font-size:13px\}/)
})

test('RTL/LTR direction and existing field error/disabled states remain represented', () => {
  assert.match(app, /language === 'fa' \? 'rtl' : 'ltr'/)
  assert.match(persons, /aria-invalid=\{Boolean\(fieldErrors\./)
  assert.match(css, /\.invalid-field/)
  assert.match(css, /input:disabled/)
  assert.equal(golden.languageAndDirection.fa, 'RTL; grid starts at inline-start (right)')
})
