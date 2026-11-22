import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frontend } from './approved-contract-integrity.mjs'

const app = fileURLToPath(frontend)
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Use npm run test:approved:faults')

const person = 'src/PersonsPage.tsx'
const style = 'src/personsToolbar.css'
const grid = 'src/components/base-form/BaseFormGridBoundary.tsx'
const faults = [
  ['persons-editor-field-shift', 'person-brand-lookup', style, /\s*$/, '\n.persons-page .person-first-name-field { transform: translateX(5px); }\n', 'Persons editor Golden tracks for firstName'],
  ['persons-editor-label-size', 'person-brand-lookup', style, /\s*$/, '\n.persons-page .person-form-grid .person-phone-field > span { font-size: 14px !important; line-height: 21.4375px !important; }\n', 'phone label typography'],
  ['shared-xlsx-hidden-column', 'person-brand-lookup', 'src/components/base-form/BaseFormGridBoundary.tsx',
    'columns: visible, rows: exportRows', 'columns, rows: exportRows', 'Hidden column and values are excluded'],
  ['contract-amendment-link', 'person-brand-lookup', 'src/BusinessContractPage.tsx',
    'previousVersionId: current.id, versionNumber:', "previousVersionId: 'wrong-version', versionNumber:", 'Amendment references its immutable predecessor'],
  ['excel-button', 'person-brand-lookup', grid, "panel==='header'&&operationalBehavior.gridExport.enabled", "panel==='header'&&!operational?.clearColumnFilters&&operationalBehavior.gridExport.enabled", 'Approved toolbar icons and appearance entry'],
  ['grid-header-height', 'production', style, /\s*$/, '\n.persons-shared-grid .excel-filter-trigger {display:none !important}\n', 'Persons production shared table geometry'],
  ['footer-hidden', 'production', style, /\s*$/, '\n.persons-page .shortcut-bar { display: none !important; }\n', 'Golden Persons desktop geometry'],
  ['create-shortcut', 'person-brand-lookup', person, 'shortcutMatches(event, shortcuts.new)', "shortcutMatches(event, 'F9')", 'Configured F7 enters create mode'],
  ['column-management', 'person-brand-lookup', grid, 'visible: !item.visible','visible: item.visible', 'Phone column hidden'],
  ['popup-escape', 'person-brand-lookup', person, "event.key !== 'Escape' || !shortcutsTrigger.current", "event.key !== 'F10' || !shortcutsTrigger.current", 'Escape dismisses and returns focus'],
  ['field-persistence', 'person-brand-lookup', person, '  ...draft,', "  ...draft, notes: '',", 'Person note survived API Save and page reload'],
  ['required-test-skipped', 'unit', 'tests/approved-contract-integrity.test.mjs', "test('immutable records permit append", "test.skip('immutable records permit append", 'Required Node test was skipped or omitted'],
  ['persons-search-missing', 'person-brand-lookup', grid, "inPanel('search',panel)&&<div", "inPanel('search',panel)&&!operational?.clearColumnFilters&&<div", 'Shared Persons global search exists'],
  ['persons-search-focus', 'person-brand-lookup', grid, "functionKeyFromEvent(event) !== 'F1'", "functionKeyFromEvent(event) !== 'F10'", 'Persons F1 focuses actual search'],
  ['persons-search-mode', 'person-brand-lookup', grid, 'setSearchMode(mode)', "setSearchMode('startsWith')", 'Persons contains search results'],
  ['persons-reverse-search', 'person-brand-lookup', grid, 'setReverseSearch(value => !value)', 'setReverseSearch(false)', 'Persons reverse returns complementary result'],
  ['persons-toolbar-alignment', 'person-brand-lookup', style, /\s*$/, '\n.persons-shared-grid [data-toolbar-part=counter] {margin-left:60px !important}\n', 'persons title and counter are centered in the shared lane'],
  ['persons-maximize-selection', 'person-brand-lookup', grid, '    setExpanded(true)', '    setSelectedRow(null); setExpanded(true)', 'Expanded grid retains selected row'],
  ['persons-appearance-scope', 'person-brand-lookup', 'src/components/base-form/OperationalFormFrame.tsx', 'encodeURIComponent(p.userId ?? currentUserKey())', "encodeURIComponent(p.formId==='persons'?'global':p.userId ?? currentUserKey())", 'Appearance is isolated by user'],
]

function executeGate(directory, lane) {
  return new Promise((resolveRun, reject) => {
    const { APPROVAL_BASE_REF, ...environment } = process.env
    const child = spawn(process.execPath, [npmCli, 'run', 'test:approved', '--', lane], {
      cwd: directory, env: { ...environment, APPROVED_FORM_ARCHIVE_REPO: resolve(app, '..') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8').on('data', chunk => { output += chunk })
    }
    child.once('error', reject)
    child.once('close', code => resolveRun({code, output}))
  })
}

const selected = process.argv.slice(2)
assert.ok(selected.every(id => faults.some(([key]) => key === id)), 'Unknown fault ID')
const scenarios = selected.length ? faults.filter(([id]) => selected.includes(id)) : faults
const outputDirectory = resolve(app, 'test-results', 'fault-injection')
await mkdir(outputDirectory, { recursive: true })
const temporary = await mkdtemp(join(await realpath(tmpdir()), 'yarn-approved-faults-'))
const copy = join(temporary, 'frontend')
const reports = []
try {
  await cp(app, copy, {
    recursive: true,
    filter: source => !['node_modules', 'dist', 'test-results', '.vite', '.vite-approved'].includes(relative(app, source).split(/[\\/]/)[0]),
  })
  // Keeping dependencies local to the disposable tree also isolates Vite watchers.
  await cp(join(app, 'node_modules'), join(copy, 'node_modules'), {
    recursive: true, verbatimSymlinks: true,
    filter: source => !['.vite', '.vite-temp'].includes(relative(join(app, 'node_modules'), source).split(/[\\/]/)[0]),
  })
  // The Golden unit suite inspects the source-level Persons query contract.
  const controller = 'src/YarnTrade.Api/Controllers/PersonsGridController.cs'
  const fixtureController = join(temporary, controller)
  await mkdir(dirname(fixtureController), { recursive: true })
  await cp(resolve(app, '..', controller), fixtureController)
  for (const lane of new Set(scenarios.map(([, current]) => current))) {
    const run = await executeGate(copy, lane)
    await writeFile(join(outputDirectory, `clean-${lane}.log`), run.output)
    assert.equal(run.code, 0, `Clean comparison failed in ${lane}. See clean-${lane}.log`)
    console.log(`PASS clean comparison: ${lane}`)
  }
  for (const [id, lane, file, pattern, replacement, detection] of scenarios) {
    const path = join(copy, file)
    const original = await readFile(path, 'utf8')
    const mutated = original.replace(pattern, replacement)
    assert.notEqual(mutated, original, `Mutation no longer applies: ${id}`)
    try {
      await writeFile(path, mutated)
      const {code, output} = await executeGate(copy, lane)
      await writeFile(join(outputDirectory, `${id}.log`), output)
      const passed = code === 1 && output.includes(detection)
      reports.push({ id, lane, code, detector: detection, verdict: passed ? 'PASS' : 'FAIL' })
      console.log(`${passed ? 'PASS' : 'FAIL'} ${id} — ${detection}`)
    } finally {
      await writeFile(path, original)
      assert.equal(await readFile(path, 'utf8'), original)
    }
  }
} finally {
  await writeFile(join(outputDirectory, 'summary.json'), JSON.stringify({ scenarios: reports }, null, 2) + '\n')
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
assert.ok(reports.every(report => report.verdict === 'PASS'), 'A planned regression was not detected by the intended assertion.')
