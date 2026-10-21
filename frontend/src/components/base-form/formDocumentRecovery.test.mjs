import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyDesignerDraft, attachDesignerDocument, createDesignerHistory, designerHistoryReducer, layoutDesignerFields, alignCanvasFields, fieldGroupRect, translateCanvasField, validateCanvasArrangement } from './designer.ts'
import { createManagedLaboratoryForm, createManagedFormStructureHistory, commitManagedFormStructure, removeManagedFormField, undoManagedFormStructure, redoManagedFormStructure, managedLaboratoryFormsStorageKey } from './laboratoryFormDraftState.ts'
import { readFormRecovery, writeFormRecovery, writeFormRecoveryResult, encodeRecoveryJournal, decodeRecoveryJournal, formRecoveryKey, closeFormRecovery, recoverableDeletedFields, recoverableDeletedTables, restoreRecoverableTable, restoreRecoverableField } from './formDocumentRecovery.ts'
import { unresolvedTableColumns, unresolvedFormFields, normalizeFormLinks, preserveFormLinks, fieldColumnLinks, linkFieldToColumn, keepIndependentField, addDocumentColumn, removeDocumentColumn, updateDocumentColumn, removeDocumentTable } from './formTableStructure.ts'
import { reconcileGridColumns } from './excelGrid.ts'

const text = value => ({ fa: value, en: value, zh: value })
const schema = () => ({ id: 'form-laboratory.persons-synthetic', schemaVersion: 1, version: 1, status: 'draft', mode: 'operational', title: text('Template'), fields: ['personCode', 'mobile', 'notes'].map((id, index) => ({ id, sectionId: 'editor', componentId: 'definition.field', kind: 'text', label: text(id), minTracks: 1, span: 5, settings: { layout: { grid: { columns: 20, columnStart: index * 5 + 1, columnSpan: 5, rowStart: 1 } } } })), sections: [{ id: 'editor', kind: 'editor' }, { id: 'grid', kind: 'grid' }, { id: 'footer', kind: 'footer' }], tables: [{ id: 'table', sectionId: 'grid', dataSourceId: 'synthetic.local', columns: ['personCode', 'mobile'].map(id => ({ id, label: text(id), binding: { kind: 'dataField', dataFieldId: id } })) }] })
const snapshot = (id = 'form.recovery') => {
  const form = createManagedLaboratoryForm({ id, name: id, mode: 'hybrid', templateSchema: schema(), templateDesigner: emptyDesignerDraft('form-laboratory.persons-synthetic'), frame: { width: 1280, height: 720, fitToPage: false, device: 'desktop' } })
  const designer = { ...emptyDesignerDraft(id), overrides: { 'mobile::input': { bold: true, textColor: '#123456' } }, canvas: { width: 1000, height: 500, fields: { mobile: { input: { left: 100, top: 200, width: 210, height: 36 }, label: { left: 100, top: 170, width: 210, height: 24 } } } } }
  return { form, designerHistory: createDesignerHistory(designer), structureHistory: createManagedFormStructureHistory(form.schema) }
}
const memory = () => { const values = new Map(); return { values, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } } }

test('unsaved schema, geometry, typography and native Undo/Redo survive reload independently of explicit saves', () => {
  const { storage, values } = memory(), before = snapshot()
  values.set(managedLaboratoryFormsStorageKey('owner'), 'saved-form-untouched')
  assert.equal(writeFormRecovery(storage, 'owner', before, 'before delete', '2026-10-17T10:00:00Z'), true)
  const removed = removeManagedFormField(before.form.schema, 'mobile')
  const changed = { ...before, form: { ...before.form, schema: removed }, structureHistory: commitManagedFormStructure(before.structureHistory, removed), designerHistory: designerHistoryReducer(before.designerHistory, { type: 'change', draft: { ...before.designerHistory.present, tableFont: { size: 19 } } }) }
  assert.equal(writeFormRecovery(storage, 'owner', changed), true)
  const restored = readFormRecovery(storage, 'owner').documents[before.form.id].current
  assert.equal(restored.form.schema.fields.some(field => field.id === 'mobile'), false)
  assert.equal(undoManagedFormStructure(restored.structureHistory).present.fields.some(field => field.id === 'mobile'), true)
  assert.deepEqual(redoManagedFormStructure(undoManagedFormStructure(restored.structureHistory)), restored.structureHistory)
  assert.equal(designerHistoryReducer(restored.designerHistory, { type: 'undo' }).present.tableFont, undefined)
  assert.equal(values.get(managedLaboratoryFormsStorageKey('owner')), 'saved-form-untouched')
  assert.equal(readFormRecovery(storage, 'someone-else').activeFormId, null)
})

test('versions are immutable, independent forms are retained and close clears only the resume pointer', () => {
  const { storage } = memory(), one = snapshot(), two = snapshot('form.second')
  writeFormRecovery(storage, 'owner', one, 'first version', '2026-10-17T10:00:00Z')
  const first = JSON.stringify(readFormRecovery(storage, 'owner').documents[one.form.id].versions[0])
  writeFormRecovery(storage, 'owner', { ...one, form: { ...one.form, frame: { ...one.form.frame, width: 1500 } } }, 'second version', '2026-10-17T10:00:01Z')
  writeFormRecovery(storage, 'owner', two)
  assert.equal(closeFormRecovery(storage, 'owner'), true)
  const journal = readFormRecovery(storage, 'owner')
  assert.equal(journal.activeFormId, null)
  assert.equal(Object.keys(journal.documents).length, 2)
  assert.equal(JSON.stringify(journal.documents[one.form.id].versions[0]), first)
})

test('recovery refuses malformed data and quota failures without replacing an existing journal', () => {
  const { storage, values } = memory(), state = snapshot()
  values.set(formRecoveryKey('owner'), '{broken')
  assert.equal(writeFormRecovery(storage, 'owner', state), false)
  assert.equal(values.get(formRecoveryKey('owner')), '{broken')
  assert.equal(writeFormRecovery(undefined, 'owner', state), false)
  values.clear(); writeFormRecovery(storage, 'owner', state)
  const original = values.get(formRecoveryKey('owner'))
  const full = { ...storage, setItem: () => { throw new Error('QuotaExceededError') } }
  assert.equal(writeFormRecovery(full, 'owner', state, 'cannot save'), false)
  assert.equal(values.get(formRecoveryKey('owner')), original)
})

test('removed fields recover their exact identity, metadata, geometry and appearance without reverting other fields', () => {
  const before = snapshot(), removed = removeManagedFormField(before.form.schema, 'mobile')
  const current = { ...before, form: { ...before.form, schema: removed }, structureHistory: commitManagedFormStructure(before.structureHistory, removed) }
  assert.deepEqual(recoverableDeletedFields(removed, [before.form.schema]).map(field => field.id), ['mobile'])
  const restored = restoreRecoverableField(current, 'mobile', [before])
  assert.deepEqual(restored.form.schema.fields.find(field => field.id === 'mobile'), before.form.schema.fields.find(field => field.id === 'mobile'))
  assert.deepEqual(restored.designerHistory.present.canvas.fields.mobile, before.designerHistory.present.canvas.fields.mobile)
  assert.equal(restored.designerHistory.present.overrides['mobile::input'].bold, true)
  assert.equal(undoManagedFormStructure(restored.structureHistory).present.fields.some(field => field.id === 'mobile'), false)
  assert.equal(current.form.schema.fields.some(field => field.id === 'mobile'), false)
})

test('legacy and explicit column links require review after field deletion; independent purpose is explicit and reversible', () => {
  const original = snapshot().form.schema, removed = removeManagedFormField(original, 'mobile')
  assert.deepEqual(unresolvedTableColumns(removed, 'table').map(column => column.id), ['mobile'])
  const kept = updateDocumentColumn(removed, 'table', 'mobile', { independentPurpose: 'Read historical contact from report source' })
  assert.equal(unresolvedTableColumns(kept, 'table').length, 0)
  assert.equal(original.tables[0].columns.length, 2)
  assert.equal(removeDocumentColumn(removed, 'table', 'mobile').tables[0].columns.length, 1)
  const added = addDocumentColumn(removed, 'table', 'column.new', 'Notes', 'text', 'notes')
  assert.equal(added.tables[0].columns.at(-1).binding.fieldId, 'notes')
  const state = commitManagedFormStructure(createManagedFormStructureHistory(original), removeDocumentTable(added, 'table'))
  assert.equal(state.present.tables.length, 0)
  assert.deepEqual(undoManagedFormStructure(state).present, original)
})

const measured = (id, left, top, width = 200, height = 36) => ({ id, left, top, right: left + width, bottom: top + height + 30, width, height: height + 30, inputWidth: width, inputHeight: height, labelWidth: width, labelHeight: 24 })
test('equal dimensions use the chosen reference or explicit numbers; automatic arrangement never shrinks inputs', () => {
  const draft = emptyDesignerDraft('layout'), fields = [measured('wide', 300, 20, 400, 48), measured('small', 20, 20, 120, 28)]
  const reference = layoutDesignerFields(draft, fields, { operation: 'equalSize', orientation: 'horizontal', gap: 20, rtl: true, referenceId: 'wide' }, ['wide', 'small'])
  assert.equal(reference.overrides['small::input'].width, 400)
  assert.equal(reference.overrides['small::input'].height, 48)
  const explicit = layoutDesignerFields(draft, fields, { operation: 'equalSize', orientation: 'vertical', gap: 12, rtl: false, width: 250, height: 40 }, ['wide', 'small'])
  assert.equal(explicit.overrides['wide::input'].width, 250)
  const arranged = layoutDesignerFields(draft, fields, { operation: 'arrange', orientation: 'horizontal', gap: 20, verticalGap: 30, wrapWidth: 650, rtl: true }, ['wide', 'small'])
  assert.equal(arranged.overrides['wide::input']?.width, undefined)
  assert.equal(arranged.overrides['small::input']?.width, undefined)
})

test('seven fields wrap with explicit horizontal and vertical distances without changing any input size', () => {
  const fields = Array.from({ length: 7 }, (_, i) => measured('f' + i, i * 260, 20, 200, 36))
  const draft = layoutDesignerFields(emptyDesignerDraft('layout'), fields, { operation: 'arrange', orientation: 'horizontal', gap: 16, verticalGap: 24, wrapWidth: 650, rtl: false }, fields.map(field => field.id))
  const positions = fields.map(field => ({ left: field.left + (draft.overrides[field.id + '::input']?.offsetX ?? 0), top: field.top + (draft.overrides[field.id + '::input']?.offsetY ?? 0) }))
  assert.equal(positions[1].left - positions[0].left - 200, 16)
  assert.equal(positions[2].top - positions[0].top - 66, 24)
  assert.equal(new Set(positions.map(position => position.top)).size, 4)
  assert.ok(fields.every(field => draft.overrides[field.id + '::input']?.width === undefined))
})

test('alignment changes real Canvas coordinates and collision blocking preserves the original', () => {
  const field = (left, top) => ({ input: { left, top: top + 30, width: 200, height: 36 }, label: { left, top, width: 200, height: 24 } })
  const canvas = { width: 1000, height: 800, fields: { a: field(500, 20), b: field(250, 150) } }
  const aligned = alignCanvasFields(canvas, ['a', 'b'], 'a', 'left')
  assert.equal(aligned.blockedBy, undefined)
  assert.equal(aligned.canvas.fields.b.input.left, canvas.fields.a.input.left)
  const blocked = alignCanvasFields(canvas, ['a', 'b'], 'a', 'top')
  assert.equal(blocked.blockedBy, undefined)
  const overlapping = { ...canvas, fields: { a: field(500, 20), b: field(250, 20) } }
  const failure = alignCanvasFields(overlapping, ['a', 'b'], 'a', 'left')
  assert.ok(failure.blockedBy)
  assert.equal(failure.canvas, overlapping)
})

test('structural grid reconciliation adds/removes columns immediately while preserving personal visibility and widths', () => {
  const original = [{ id: 'a', label: 'A', width: 100, type: 'text', value: () => '' }, { id: 'b', label: 'B', width: 120, type: 'text', value: () => '' }]
  const current = [{ ...original[0], visible: false, width: 145 }, { ...original[1], visible: true }]
  const added = { id: 'c', label: 'New', width: 160, type: 'text', value: () => '' }
  const next = reconcileGridColumns([{ ...original[0], label: 'Renamed' }, added], current, original)
  assert.deepEqual(next.map(column => column.id), ['a', 'c'])
  assert.equal(next[0].visible, false)
  assert.equal(next[0].width, 145)
  assert.equal(next[0].label, 'Renamed')
  assert.equal(next[1].visible, true)
  assert.equal(reconcileGridColumns([{ ...original[0], width: 200 }], current, original)[0].width, 200)
})

function documentState() {
  const state = snapshot()
  state.form.schema = normalizeFormLinks(state.form.schema)
  state.structureHistory = createManagedFormStructureHistory(state.form.schema)
  state.designerHistory = attachDesignerDocument(state.designerHistory, state.form.schema)
  return state
}
const changeSchema = (history, schema) => designerHistoryReducer(history, { type: 'change', draft: history.present, schema })

test('one native Undo/Redo timeline restores fields, columns, links, decisions and visuals in chronological order', () => {
  const before = documentState(), initial = before.form.schema
  let h = before.designerHistory
  const deleted = removeDocumentColumn(initial, 'table', 'mobile')
  h = changeSchema(h, deleted)
  assert.deepEqual(unresolvedFormFields(h.document.present).map(field => field.id), ['mobile'])
  h = changeSchema(h, keepIndependentField(h.document.present, 'mobile', 'Input only'))
  assert.equal(unresolvedFormFields(h.document.present).length, 0)
  h = designerHistoryReducer(h, { type: 'change', draft: { ...h.present, tableHeaderHeight: 60 } })
  h = designerHistoryReducer(h, { type: 'undo' })
  assert.equal(h.present.tableHeaderHeight, undefined)
  assert.equal(unresolvedFormFields(h.document.present).length, 0)
  h = designerHistoryReducer(h, { type: 'undo' })
  assert.equal(unresolvedFormFields(h.document.present)[0].id, 'mobile')
  h = designerHistoryReducer(h, { type: 'undo' })
  assert.deepEqual(h.document.present, initial)
  assert.deepEqual(h.present, before.designerHistory.present)
  for (let index = 0; index < 3; index++) h = designerHistoryReducer(h, { type: 'redo' })
  assert.equal(h.present.tableHeaderHeight, 60)
  assert.equal(h.document.present.fields.find(field => field.id === 'mobile').independentPurpose, 'Input only')
  const branched = changeSchema(designerHistoryReducer(h, { type: 'undo' }), removeManagedFormField(h.document.present, 'notes'))
  assert.equal(branched.future.length, 0)
  assert.equal(branched.document.future.length, 0)
})

test('links are bidirectional and independent fields/columns are explicit; role removal flags only its column', () => {
  let s = normalizeFormLinks({ ...schema(), fields: [...schema().fields, { ...schema().fields[0], id: 'jobId' }, { ...schema().fields[0], id: 'firstName' }, { ...schema().fields[0], id: 'lastName' }], tables: [{ ...schema().tables[0], columns: [...schema().tables[0].columns, ...['job', 'displayName'].map(id => ({ id, label: text(id), binding: { kind: 'dataField', dataFieldId: id } }))] }] })
  s = preserveFormLinks(s, removeManagedFormField(s, 'jobId'))
  assert.deepEqual(unresolvedTableColumns(s, 'table').map(column => column.id), ['job'])
  assert.equal(s.tables[0].columns.some(column => column.id === 'displayName'), true)
  s = updateDocumentColumn(s, 'table', 'job', { sourceFieldIds: [], independentPurpose: 'Report source' })
  assert.equal(unresolvedTableColumns(s, 'table').length, 0)
  s = addDocumentColumn(s, 'table', 'standalone', 'Standalone', 'text')
  assert.deepEqual(fieldColumnLinks(s, 'notes'), [])
  s = linkFieldToColumn(s, 'notes', 'table', 'standalone')
  assert.deepEqual(fieldColumnLinks(s, 'notes'), [{ tableId: 'table', columnId: 'standalone' }])
  const separated = keepIndependentField(s, 'notes', 'Input only')
  assert.deepEqual(unresolvedTableColumns(separated, 'table').map(column => column.id), ['standalone'])
  s = removeDocumentColumn(s, 'table', 'standalone')
  assert.deepEqual(unresolvedFormFields(s).map(field => field.id), ['notes'])
  s = linkFieldToColumn(s, 'notes', 'table', 'personCode')
  assert.equal(unresolvedFormFields(s).length, 0)
  assert.deepEqual(s.tables[0].columns.find(column => column.id === 'personCode').sourceFieldIds, ['personCode', 'notes'])
})

test('restoring a field recovers its removed table at the original position; restoring individual columns is reversible', () => {
  const before = documentState(), original = before.form.schema
  let h = changeSchema(before.designerHistory, removeDocumentTable(original, 'table'))
  assert.deepEqual(unresolvedFormFields(h.document.present).map(field => field.id), ['personCode', 'mobile'])
  h = changeSchema(h, removeManagedFormField(h.document.present, 'mobile'))
  const state = { ...before, form: { ...before.form, schema: h.document.present }, designerHistory: h, structureHistory: { ...h.document } }
  const restored = restoreRecoverableField(state, 'mobile', [before])
  assert.deepEqual(restored.form.schema.tables, original.tables)
  assert.equal(restored.form.schema.sections.findIndex(section => section.id === 'grid'), original.sections.findIndex(section => section.id === 'grid'))
  assert.deepEqual(restored.designerHistory.present.canvas.fields.mobile, before.designerHistory.present.canvas.fields.mobile)
  assert.equal(unresolvedFormFields(restored.form.schema).length, 0)
  const undo = designerHistoryReducer(restored.designerHistory, { type: 'undo' })
  assert.equal(undo.document.present.tables.length, 0)
  assert.equal(undo.document.present.fields.some(field => field.id === 'mobile'), false)
  const removedColumn = removeDocumentColumn(original, 'table', 'mobile')
  const deleted = { ...before, form: { ...before.form, schema: removedColumn }, designerHistory: changeSchema(before.designerHistory, removedColumn), structureHistory: commitManagedFormStructure(before.structureHistory, removedColumn) }
  assert.deepEqual(recoverableDeletedTables(removedColumn, [original]).map(item => item.columnId), ['mobile'])
  const column = restoreRecoverableTable(deleted, 'table', [before], 'mobile')
  assert.deepEqual(column.form.schema.tables, original.tables)
  assert.equal(designerHistoryReducer(column.designerHistory, { type: 'undo' }).document.present.tables[0].columns.length, 1)
})

test('joined legacy histories and unified transactions survive a journal reload without dropping either stack', () => {
  const state = snapshot(), s = normalizeFormLinks(state.form.schema)
  const removed = removeManagedFormField(s, 'mobile')
  const visual = designerHistoryReducer(state.designerHistory, { type: 'change', draft: { ...state.designerHistory.present, tableFont: { size: 18 } } })
  let h = attachDesignerDocument(visual, removed, { past: [s], future: [] })
  assert.equal(h.past.length, 2)
  h = designerHistoryReducer(h, { type: 'beginTransaction' })
  h = changeSchema(h, removeDocumentColumn(removed, 'table', 'mobile'))
  h = designerHistoryReducer(h, { type: 'change', draft: { ...h.present, tableHeaderHeight: 52 } })
  h = designerHistoryReducer(h, { type: 'commitTransaction' })
  assert.equal(h.past.length, 3)
  const { storage } = memory()
  assert.equal(writeFormRecovery(storage, 'owner', { ...state, form: { ...state.form, schema: h.document.present }, designerHistory: h, structureHistory: { ...h.document } }), true)
  h = readFormRecovery(storage, 'owner').documents[state.form.id].current.designerHistory
  h = designerHistoryReducer(h, { type: 'undo' })
  assert.equal(h.document.present.tables[0].columns.length, 2)
  assert.equal(h.present.tableHeaderHeight, undefined)
  h = designerHistoryReducer(h, { type: 'undo' })
  assert.equal(h.present.tableFont, undefined)
  h = designerHistoryReducer(h, { type: 'undo' })
  assert.equal(h.document.present.fields.some(field => field.id === 'mobile'), true)
})


test('lossless recovery compaction retains every version and both Undo histories within a realistic quota', () => {
  const { storage, values } = memory(), state = snapshot()
  state.designerHistory = attachDesignerDocument(state.designerHistory, state.form.schema)
  for (let i = 0; i < 35; i++) state.designerHistory = designerHistoryReducer(state.designerHistory, { type: 'change', draft: { ...state.designerHistory.present, tableFont: { size: i + 8 } } })
  state.structureHistory = { present: state.form.schema, past: state.designerHistory.document.past, future: [] }
  const bounded = { ...storage, setItem(key, value) { if (value.length > 200000) throw new DOMException('full', 'QuotaExceededError'); storage.setItem(key, value) } }
  for (let i = 0; i < 45; i++) assert.equal(writeFormRecoveryResult(bounded, 'owner', state, 'before delete ' + i), 'saved')
  const journal = readFormRecovery(storage, 'owner')
  assert.equal(journal.documents[state.form.id].versions.length, 45)
  assert.deepEqual(journal.documents[state.form.id].current.designerHistory, JSON.parse(JSON.stringify(state.designerHistory)))
  const plain = JSON.stringify(journal), packed = values.get(formRecoveryKey('owner'))
  assert.ok(plain.length > 200000, 'old repeated snapshots exceeded quota')
  assert.ok(packed.length < plain.length / 4, 'history is deduplicated without removing versions')
  values.set(formRecoveryKey('owner'), plain) // Legacy journal migrates on next successful write.
  assert.equal(writeFormRecovery(storage, 'owner', state), true)
  assert.equal(readFormRecovery(storage, 'owner').documents[state.form.id].versions.length, 45)
  assert.deepEqual(decodeRecoveryJournal(encodeRecoveryJournal(journal)), JSON.parse(plain))
})

test('failure reports distinguish quota, damaged journal and inconsistent snapshot and retain old bytes', () => {
  const { storage, values } = memory(), state = snapshot()
  assert.equal(writeFormRecoveryResult(undefined, 'owner', state), 'unavailable')
  assert.equal(writeFormRecoveryResult(storage, 'owner', { ...state, form: { ...state.form, id: 'wrong' } }), 'invalid-snapshot')
  values.set(formRecoveryKey('owner'), '{broken')
  assert.equal(writeFormRecoveryResult(storage, 'owner', state), 'invalid-journal')
  assert.equal(values.get(formRecoveryKey('owner')), '{broken')
  values.clear(); writeFormRecovery(storage, 'owner', state)
  const previous = values.get(formRecoveryKey('owner'))
  assert.equal(writeFormRecoveryResult({ ...storage, setItem() { throw new DOMException('full', 'QuotaExceededError') } }, 'owner', state), 'quota')
  assert.equal(values.get(formRecoveryKey('owner')), previous)
  assert.throws(() => decodeRecoveryJournal(JSON.stringify({ format: 'yarn-trade.recovery-interned', version: 1, root: [0], nodes: [{ a: [[0]] }] })))
})
