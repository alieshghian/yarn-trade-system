import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const golden = JSON.parse(read('./specs/persons.golden.v1.json'))
const persons = read('../../PersonsPage.tsx')
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
  for (const behavior of ['sortBy', 'openFilterMenu', 'applyFilter', 'filterSearch', 'Select All', 'columnDragOver', 'dropColumn', 'resizeColumn', 'toggleColumn']) {
    if (behavior === 'Select All') assert.match(persons, /انتخاب همه|Select All/)
    else assert.ok(persons.includes(behavior), `${behavior} remains in PersonsPage`)
  }
  assert.deepEqual(golden.sections.find(section => section.id === 'persons.grid').defaultColumns.map(column => column.id),
    ['personCode', 'displayName', 'job', 'nationality', 'mobile', 'phone', 'isActive'])
})

test('Search and counts keep their observed client-side scope explicit', () => {
  assert.match(persons, /filterValues = useMemo/)
  assert.match(persons, /filtered\.length.*persons\.length/)
  const grid = golden.sections.find(section => section.id === 'persons.grid')
  assert.equal(grid.capabilities.globalSearchAboveGrid, 'NOT IMPLEMENTED')
  assert.equal(grid.capabilities.filteringAndCounts, 'client-side over the loaded persons collection')
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
