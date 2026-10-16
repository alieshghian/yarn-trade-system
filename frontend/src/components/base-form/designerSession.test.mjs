import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { createDesignerHistory, designerHistoryReducer, designerStorageKey, emptyDesignerDraft, loadDesignerDraft, saveDesignerDraft, setDesignerProperty } from './designer.ts'

// Execute the real hook with deterministic hook slots; no DOM or extra test package.
const source = stripTypeScriptTypes(readFileSync(new URL('./useDesignerSession.ts', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')
function sessionHarness(initialOptions, storage) {
  const slots = [], effects = []
  let cursor = 0, dirty = false, options = initialOptions, session
  const state = initial => {
    const i = cursor++
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
    return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true }]
  }
  const memo = (factory, deps) => {
    const i = cursor++, previous = slots[i]
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) slots[i] = { value: factory(), deps }
    return slots[i].value
  }
  const useDesignerSession = runInNewContext(source + '\nuseDesignerSession', {
    window: { get localStorage() { if (storage instanceof Error) throw storage; return storage } },
    createDesignerHistory, designerHistoryReducer, loadDesignerDraft, saveDesignerDraft,
    useState: state,
    useReducer: (reducer, arg, init) => {
      const [value, set] = state(() => init(arg))
      return [value, action => set(current => reducer(current, action))]
    },
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value } },
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => memo(() => { effects.push(effect) }, deps)
  })
  const render = (next = options) => {
    options = next
    let iterations = 0
    do {
      dirty = false; cursor = 0; session = useDesignerSession(options)
      effects.splice(0).forEach(effect => effect())
      assert.ok(++iterations < 10, 'session must settle without a reload loop')
    } while (dirty)
    return session
  }
  return { render }
}
const memoryStorage = () => {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
const identity = { formId: 'pilot.one', fieldIds: ['name'], userId: 'owner' }
const change = (session, size) => session.dispatchHistory({ type: 'change', draft: setDesignerProperty(session.historyRef.current.present, ['name::input'], 'fontSize', size, ['name']) })

test('batched transactions expose the latest draft, preview never persists, undo/redo keep one history step', () => {
  const storage = memoryStorage(), harness = sessionHarness(identity, storage)
  let session = harness.render()
  session.dispatchHistory({ type: 'beginTransaction' })
  change(session, 18); change(session, 22)
  assert.equal(session.historyRef.current.present.overrides['name::input'].fontSize, 22)
  session.dispatchHistory({ type: 'commitTransaction' })
  session.setPreviewDraft(setDesignerProperty(session.historyRef.current.present, ['name::input'], 'fontSize', 30, ['name']))
  session = harness.render()
  assert.equal(session.visibleDraft.overrides['name::input'].fontSize, 30)
  assert.equal(session.history.past.length, 1)
  assert.equal(session.save(), true)
  assert.equal(loadDesignerDraft(storage, 'owner', 'pilot.one', ['name']).overrides['name::input'].fontSize, 22)
  session.setPreviewDraft(null); session.undo(); session = harness.render()
  assert.deepEqual(Object.keys(session.visibleDraft.overrides), [])
  session.redo(); session = harness.render()
  assert.equal(session.visibleDraft.overrides['name::input'].fontSize, 22)
})

test('saved geometry and appearance reopen independently for different forms and users', () => {
  const storage = memoryStorage(), harness = sessionHarness(identity, storage)
  let session = harness.render()
  const rect = { left: 10, top: 10, width: 100, height: 30 }
  const draft = { ...session.history.present, appearance: { formBackground: '#abcdef' }, canvas: { width: 600, height: 300, fields: { name: { input: rect, label: { ...rect, top: 45 } } } } }
  session.dispatchHistory({ type: 'change', draft })
  assert.equal(session.save(), true)
  const original = storage.getItem(designerStorageKey('owner', 'pilot.one'))
  session.setPreviewDraft({ ...draft, appearance: { formBackground: '#112233' } })
  session.editingBaseline.current = draft
  session = harness.render({ ...identity, formId: 'pilot.two' })
  assert.equal(session.history.present.formId, 'pilot.two')
  assert.equal(session.previewDraft, null)
  assert.equal(session.editingBaseline.current, null)
  change(session, 16); assert.equal(session.save(), true)
  session = harness.render({ ...identity, userId: 'another-owner' })
  assert.deepEqual(Object.keys(session.history.present.overrides), [])
  session = harness.render(identity)
  assert.equal(session.history.present.appearance.formBackground, '#abcdef')
  assert.equal(session.history.present.canvas.fields.name.input.left, 10)
  assert.equal(session.history.past.length, 0)
  assert.equal(storage.getItem(designerStorageKey('owner', 'pilot.one')), original)
})

test('legacy loader retains the editing baseline across renders and reloads only for identity changes', () => {
  let loads = 0
  const loader = ({ formId, userId }) => { loads++; return { ...emptyDesignerDraft(formId), appearance: { formBackground: userId === 'owner' ? '#abcdef' : '#123456' } } }
  const options = { ...identity, initialDraftLoader: loader }
  const harness = sessionHarness(options, memoryStorage())
  let session = harness.render(), baseline = session.history.present
  session.editingBaseline.current = baseline
  change(session, 24)
  const previousLoads = loads
  session = harness.render({ ...options, fieldIds: [...identity.fieldIds], initialDraftLoader: value => loader(value) })
  assert.equal(loads, previousLoads)
  assert.equal(session.editingBaseline.current, baseline)
  session.dispatchHistory({ type: 'replace', draft: session.editingBaseline.current })
  session.editingBaseline.current = null
  session = harness.render()
  assert.equal(session.history.present, baseline)
  assert.equal(session.history.past.length, 0)
  session = harness.render({ ...options, userId: 'another-owner' })
  assert.equal(session.history.present.appearance.formBackground, '#123456')
  assert.equal(session.editingBaseline.current, null)
})

test('blocked storage, missing users and corrupt drafts do not prevent session use', () => {
  for (const storage of [new Error('blocked'), { getItem: () => '{invalid', setItem: () => { throw new Error('quota') } }]) {
    const harness = sessionHarness(identity, storage)
    let session = harness.render()
    assert.equal(session.history.present.formId, identity.formId)
    change(session, 20)
    assert.equal(session.save(), false)
    session = harness.render({ ...identity, userId: undefined })
    assert.deepEqual(Object.keys(session.history.present.overrides), [])
    assert.equal(session.save(), false)
  }
})
