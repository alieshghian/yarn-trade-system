import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import * as designer from './designer.ts'
import { applyGridFiltersAndSort, gridValueKey } from './excelGrid.ts'
import { VirtualPageCache, virtualRange } from './virtualGrid.ts'

// Execute the current source handlers with isolated state/storage and API doubles.
// No application preferences, browser, backend or database are accessed.
const page = readFileSync(new URL('../../FormLaboratoryPage.tsx', import.meta.url), 'utf8')
const grid = readFileSync(new URL('./BaseFormGridBoundary.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./FormLaboratoryDesignerPanel.tsx', import.meta.url), 'utf8')
const slice = (source, from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start)
  assert.ok(start >= 0 && end > start, `Source handler boundaries: ${from}`)
  return stripTypeScriptTypes(source.slice(start, end))
}
const definitions = slice(page, 'const laboratoryDefinition', 'const columns')
const definition = runInNewContext(definitions + '\nlaboratoryDefinition')
const actions = definition.actions
const fieldIds = Array.from(definition.fields, field => field.id)
const formId = definition.id
const plain = value => JSON.parse(JSON.stringify(value))
const storageDouble = () => {
  const values = new Map()
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const load = window => runInNewContext(slice(page, 'function loadLaboratoryDraft', 'const previewWidths') + '\nloadLaboratoryDraft', { ...designer, window, laboratoryDefinition: definition, fieldIds })

test('all five mandatory actions remain checked/locked with legacy hidden settings after save/reload', () => {
  const required = actions.filter(action => action.required)
  assert.deepEqual(Array.from(required, action => action.id), ['new-person', 'edit-person', 'delete-person', 'demo-save', 'reset-sample'])
  const storage = storageDouble()
  let draft = designer.emptyDesignerDraft(formId)
  draft.actions = Object.fromEntries(required.map(action => [action.id, { visible: false }]))
  assert.equal(designer.saveDesignerDraft(storage, 'review', formId, draft, fieldIds), true)
  draft = designer.loadDesignerDraft(storage, 'review', formId, fieldIds)
  for (const action of required) {
    assert.equal(designer.designerActionVisible(draft, action), true)
    assert.equal(designer.setDesignerActionVisibility(draft, action, false), draft)
  }
  assert.match(panel, /checked=\{designerActionVisible\(props.draft, action\)\} disabled=\{action.required\}/)
})

test('one-time restoration respects later hidden choices and preserves per-user styles/labels/history', () => {
  const storage = storageDouble(), user = 'review'
  // The pre-existing appearance migration has already been applied for this user.
  storage.setItem(`yarn-trade:form-lab-persons-appearance:v3:${user}:${formId}`, 'persons')
  const original = { ...designer.emptyDesignerDraft(formId), appearance: { actionText: '#123456' },
    actions: { 'next-page': { visible: false, width: 180, code: 'Next', labels: { fa: 'بعدی' } } } }
  designer.saveDesignerDraft(storage, user, formId, original, fieldIds)
  const loader = load({ localStorage: storage })
  const restored = loader(user)
  assert.equal(designer.designerActionVisible(restored, actions.find(action => action.id === 'next-page')), true)
  assert.equal(restored.actions['next-page'].width, 180)
  assert.deepEqual(plain(restored.appearance), original.appearance)
  const hidden = designer.setDesignerActionVisibility(restored, { id: 'next-page' }, false)
  let history = designer.designerHistoryReducer(designer.createDesignerHistory(restored), { type: 'change', draft: hidden })
  history = designer.designerHistoryReducer(history, { type: 'undo' }); assert.deepEqual(history.present, restored)
  history = designer.designerHistoryReducer(history, { type: 'redo' }); assert.deepEqual(history.present, hidden)
  designer.saveDesignerDraft(storage, user, formId, history.present, fieldIds)
  const reloaded = loader(user)
  assert.equal(designer.designerShortcutAction(reloaded, actions, 'PageDown'), undefined)
  assert.deepEqual(plain(reloaded.actions['next-page']), plain(hidden.actions['next-page']))
  assert.deepEqual(designer.loadDesignerDraft(storage, 'other-user', formId, fieldIds).overrides, {})
})

test('storage access/read/write failures never crash or delete existing preferences', () => {
  const inaccessibleWindow = Object.defineProperty({}, 'localStorage', { get() { throw Error('blocked storage') } })
  assert.doesNotThrow(() => load(inaccessibleWindow)('review'))
  const storage = storageDouble()
  designer.saveDesignerDraft(storage, 'review', formId, designer.emptyDesignerDraft(formId), fieldIds)
  const before = [...storage.values]
  const writeBlocked = { getItem: storage.getItem, setItem() { throw Error('quota') } }
  assert.doesNotThrow(() => load({ localStorage: writeBlocked })('review'))
  assert.deepEqual([...storage.values], before)
  assert.equal(designer.saveDesignerDraft(writeBlocked, 'review', formId, designer.emptyDesignerDraft(formId), fieldIds), false)
  assert.doesNotThrow(() => load({ localStorage: { getItem() { throw Error('blocked read') }, setItem() { throw Error('blocked write') } } })('review'))
})

function actionHarness(overrides = {}) {
  const state = { active: false, deleted: [], draft: { personCode: 'baseline' }, selected: null, navigation: null }
  const context = { ...designer, laboratoryDefinition: definition, history: { present: designer.emptyDesignerDraft(formId) },
    designerOpen: false, dataEntryActive: false, gridRecordCount: 100000, fa: false, language: 'en', selectedPerson: null,
    draft: state.draft, defaultPersonDraft: { personCode: 'default' }, emptyPersonDraft: () => ({ personCode: '' }),
    entryDraftBaseline: { current: null }, dataEntryActiveRef: { current: false }, formGridRef: { current: null },
    requestAnimationFrame: callback => callback(), window: { confirm: () => true, alert: () => {} },
    openDesigner: () => {}, setDataEntryActive: value => { state.active = value }, updateDraft: value => { state.draft = value },
    setSelectedPerson: value => { state.selected = value }, setDeletedCodes: update => { state.deleted = update(state.deleted) },
    setNavigationRequest: update => { state.navigation = update(state.navigation) }, ...overrides }
  const handlers = runInNewContext(slice(page, '  const actionDisabled =', '  runActionRef.current =') + '\n({ actionDisabled, beginEntry, runAction })', context)
  return { state, context, ...handlers }
}

test('Save/Exit mode guards, cancellation baseline and synthetic-only Delete confirmation', () => {
  const row = { personCode: 'LAB-000001' }
  let harness = actionHarness({ selectedPerson: row, window: { confirm: () => false, alert: () => {} } })
  harness.runAction('delete-person'); assert.deepEqual(harness.state.deleted, [])
  harness = actionHarness({ selectedPerson: row })
  harness.runAction('delete-person'); assert.deepEqual(plain(harness.state.deleted), [row.personCode]); assert.equal(harness.state.selected, null)
  assert.equal(harness.actionDisabled(actions.find(action => action.id === 'demo-save')), true)
  harness.runAction('demo-save'); assert.equal(harness.state.active, false)
  for (const action of actions.filter(action => action.required)) assert.equal(designer.designerActionVisible(harness.context.history.present, action), true)
  harness = actionHarness({ dataEntryActive: true, entryDraftBaseline: { current: { personCode: 'before-edit' } } })
  const preferences = plain(harness.context.history.present)
  assert.equal(harness.actionDisabled(actions.find(action => action.id === 'demo-save')), false)
  harness.runAction('reset-sample'); assert.equal(harness.state.draft.personCode, 'before-edit'); assert.equal(harness.context.entryDraftBaseline.current, null)
  assert.deepEqual(plain(harness.context.history.present), preferences)
  harness = actionHarness({ dataEntryActive: true })
  harness.runAction('demo-save'); assert.equal(harness.state.active, false); assert.deepEqual(harness.state.deleted, [])
  assert.deepEqual(plain(harness.context.history.present), preferences)
  assert.doesNotMatch(page.slice(page.indexOf("    if (id === 'demo-save')"), page.indexOf('  runActionRef.current =')), /apiRequest|saveDesignerDraft|localStorage/)
})

test('saving designer settings handles unavailable localStorage without throwing', () => {
  const window = Object.defineProperty({}, 'localStorage', { get() { throw Error('blocked storage') } })
  let status
  const save = runInNewContext(slice(page, '  const saveDraft =', '  const resetSelected =') + '\nsaveDraft', {
    ...designer, window, authenticatedUserId: 'review', laboratoryDefinition: definition,
    history: { present: designer.emptyDesignerDraft(formId) }, fieldIds, editingBaseline: { current: null },
    dispatchHistory: () => {}, fa: false, language: 'en', setSaveStatus: value => { status = value }
  })
  assert.doesNotThrow(save); assert.equal(status, 'Local draft could not be saved.')
})

test('session deletion intersects personCode include/exclude/custom and other column filters', async () => {
  const rows = ['A', 'B', 'C'].map(personCode => ({ personCode, job: personCode === 'C' ? 'seller' : 'customer' }))
  const columns = ['personCode', 'job'].map(id => ({ id, value: row => row[id], type: 'text' }))
  const cases = [
    [{}, ['A', 'C']],
    [{ personCode: { selectedValues: ['A', 'B'] } }, ['A']],
    [{ personCode: { selectedValues: ['B'] } }, []],
    [{ personCode: { selectedValues: [] } }, []],
    [{ personCode: { selectedValues: ['A'], selectionMode: 'exclude' } }, ['C']],
    [{ personCode: { custom: { logic: 'and', first: { operator: 'contains', value: 'B' } } } }, []],
    [{ job: { selectedValues: ['customer'] } }, ['A']]
  ]
  for (const [filters, expected] of cases) {
    for (const filter of Object.values(filters)) if (filter.selectedValues) filter.selectedValues = filter.selectedValues.map(gridValueKey)
    const before = plain(filters)
    const query = runInNewContext(slice(page, '  const remoteGridQuery =', '  const [draft, updateDraft]') + '\nremoteGridQuery', {
      useCallback: callback => callback, deletedCodes: ['B'], datasetSize: 100000, gridValueKey,
      apiRequest: async (path, options) => {
        assert.equal(path, '/api/form-laboratory/synthetic-grid')
        const request = JSON.parse(options.body)
        return { items: applyGridFiltersAndSort(rows, columns, request.filters, [], 'en') }
      }
    })
    const result = await query({ filters })
    assert.deepEqual(result.items.map(row => row.personCode), expected)
    assert.deepEqual(filters, before)
  }
})

const navigationSource = slice(grid, '  useEffect(() => {\n    if (!navigationRequest', '  useLayoutEffect(() => {\n    if (!remoteQuery || !tableWrap.current)')
function navigationHarness(cache) {
  const context = { navigationRequest: undefined, total: 100000, lastNavigationSequence: { current: undefined },
    pendingNavigation: { current: null }, selectedIndex: { current: null }, range: { first: 0 },
    viewport: { top: 0, height: 330 }, rowHeight: 33, queryKey: 'initial', tableWrap: { current: { scrollTop: 0 } },
    remoteQuery: true, activeCache: cache, cacheRevision: 0, filtered: [], selected: null, selectedKey: null,
    setSelectedRow: value => { context.selectedKey = value }, setSelectedCells: () => {}, setSelectionAnchor: () => {}, setCellMenu: () => {},
    onRowSelectionChange: value => { context.selected = value }, setViewport: update => { context.viewport = update(context.viewport) } }
  const render = () => { const effects = []; runInNewContext(navigationSource, { ...context, useEffect: callback => effects.push(callback) }); effects.forEach(effect => effect()) }
  const request = command => { context.navigationRequest = { sequence: (context.navigationRequest?.sequence ?? 0) + 1, command }; render() }
  return { context, render, request }
}

test('navigation selects first/last, viewport steps, arrows and clamps boundaries', () => {
  const cache = { row: index => ({ id: `row-${index}` }) }
  const harness = navigationHarness(cache)
  for (const [command, expected] of [['first', 0], ['up', 0], ['next', 10], ['down', 11], ['up', 10], ['previous', 0], ['last', 99999], ['down', 99999], ['next', 99999]]) {
    harness.request(command); assert.equal(harness.context.selectedIndex.current, expected); assert.equal(harness.context.selected.id, `row-${expected}`)
  }
})

test('rapid unloaded navigation waits for latest target and fetches target pages directly', async () => {
  const pending = new Map(), calls = []
  const cache = new VirtualPageCache('initial', (page) => { calls.push(page); return new Promise(resolve => pending.set(page, resolve)) })
  cache.total = 100000 // Known total from the initial query, before a jump to unloaded pages.
  const harness = navigationHarness(cache)
  harness.request('last'); harness.request('up')
  assert.equal(harness.context.selected, null)
  const range = virtualRange(100000, harness.context.viewport.top, 330, 33)
  cache.setViewport(range.first, range.start, range.end)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [1000])
  pending.get(1000)({ items: Array.from({ length: 100 }, (_, i) => ({ id: `row-${99900 + i}` })), total: 100000, page: 1000, pageSize: 100 })
  await new Promise(resolve => setImmediate(resolve)); harness.render()
  assert.equal(harness.context.selected.id, 'row-99998'); cache.dispose()
})

test('query changes invalidate deferred selection and navigation issued before results existed', () => {
  const resetSource = slice(grid, '  useLayoutEffect(() => {\n    if (!remoteQuery)', '  const activeCache =')
  for (const scope of ['dataset', 'search', 'filter', 'sort']) {
    const harness = navigationHarness({ row: () => undefined })
    harness.context.total = 0
    harness.request('last')
    harness.context.queryKey = scope
    runInNewContext(resetSource, { ...harness.context, VirtualPageCache, VIRTUAL_PAGE_SIZE: 100, remoteQuery: async () => ({ items: [], total: 0 }),
      searchQuery: { text: '', mode: 'startsWith', reverse: false }, filters: {}, sort: [], language: 'en',
      useLayoutEffect: callback => callback(), setRemoteCache: () => {}, setCacheRevision: () => {} })
    harness.context.total = 100000
    harness.render()
    assert.equal(harness.context.pendingNavigation.current, null, `${scope}: stale request replayed`)
    assert.equal(harness.context.selected, null)
  }
})
