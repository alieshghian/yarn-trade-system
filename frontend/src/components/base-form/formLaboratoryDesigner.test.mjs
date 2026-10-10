import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createDesignerHistory, designerHistoryReducer, designerStorageKey, designerStyleForField, emptyDesignerDraft, loadDesignerDraft, resetDesignerFields, saveDesignerDraft, setDesignerProperty, validateDesignerDraft } from './designer.ts'

const formId = 'form-laboratory.persons-synthetic'
const ids = ['personCode', 'firstName', 'lastName', 'address']
const page = readFileSync(new URL('../../FormLaboratoryPage.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./FormLaboratoryDesignerPanel.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')

test('individual, group and all-field changes stay sparse per-field and per-property', () => {
  const empty = emptyDesignerDraft(formId)
  const individual = setDesignerProperty(empty, ['personCode'], 'fontSize', 18, ids)
  const group = setDesignerProperty(individual, ['firstName', 'lastName'], 'italic', true, ids)
  const all = setDesignerProperty(group, ids, 'focusColor', '#123456', ids)
  assert.equal(all.overrides.personCode.fontSize, 18)
  assert.equal(all.overrides.firstName.italic, true)
  assert.equal(all.overrides.lastName.italic, true)
  assert.equal(all.overrides.address.focusColor, '#123456')
  assert.deepEqual(empty.overrides, {})
  assert.deepEqual(resetDesignerFields(all, ['firstName', 'lastName']).overrides.firstName, undefined)
})

test('draft validation rejects arbitrary CSS and invalid values while retaining known overrides', () => {
  const clean = validateDesignerDraft({
    format: 'yarn-trade.form-designer-draft', schemaVersion: 1, formId,
    overrides: { personCode: { fontFamily: 'url(javascript:alert(1))', backgroundColor: 'red', textColor: '#AABBCC', customCss: 'body{}' }, unknownField: { fontSize: 20 } }
  }, formId, ids)
  assert.deepEqual(clean.overrides, { personCode: { textColor: '#aabbcc' } })
  assert.equal(validateDesignerDraft({ format: 'wrong', schemaVersion: 2 }, formId, ids).formId, formId)
})

test('all typography and visual-state overrides map to immediate safe field styles and inherit on reset', () => {
  let draft = emptyDesignerDraft(formId)
  const values = { fontFamily: 'tahoma', fontSize: 18, fontWeight: 600, bold: true, italic: true, textAlign: 'center', lineHeight: 1.7, backgroundColor: '#ffffff', textColor: '#202a31', labelColor: '#69747b', borderColor: '#d7dee2', focusColor: '#0e7490', hoverColor: '#e9f4f5', selectedColor: '#d99a30', disabledColor: '#eef1f3', errorColor: '#c24141' }
  for (const [property, setting] of Object.entries(values)) draft = setDesignerProperty(draft, ['personCode'], property, setting, ids)
  const style = designerStyleForField(draft, 'personCode')
  assert.equal(style['--lab-font-size'], '18px')
  assert.equal(style['--lab-text-align'], 'center')
  assert.equal(style['--lab-line-height'], '1.7')
  for (const property of ['--lab-bg', '--lab-text', '--lab-label', '--lab-border', '--lab-focus', '--lab-hover', '--lab-selected', '--lab-disabled', '--lab-error']) assert.ok(property in style)
  draft = setDesignerProperty(draft, ['personCode'], 'fontFamily', undefined, ids)
  assert.equal(designerStyleForField(draft, 'personCode')['--lab-font'], undefined)
})

test('undo and redo keep 30-plus steps; continuous color changes form one undo step', () => {
  let history = createDesignerHistory(emptyDesignerDraft(formId))
  for (let i = 1; i <= 40; i++) history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, ['personCode'], 'lineHeight', 0.8 + i / 100, ids) })
  assert.equal(history.past.length, 40)
  for (let i = 0; i < 30; i++) history = designerHistoryReducer(history, { type: 'undo' })
  assert.ok(Math.abs(history.present.overrides.personCode.lineHeight - 0.9) < 0.000001)
  for (let i = 0; i < 30; i++) history = designerHistoryReducer(history, { type: 'redo' })
  assert.ok(Math.abs(history.present.overrides.personCode.lineHeight - 1.2) < 0.000001)

  history = createDesignerHistory(emptyDesignerDraft(formId))
  history = designerHistoryReducer(history, { type: 'beginTransaction' })
  for (const color of ['#112233', '#223344', '#334455']) history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, ['personCode'], 'backgroundColor', color, ids) })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
})

test('local drafts reload only for their authenticated user and form ID', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['address'], 'lineHeight', 1.8, ids)
  assert.equal(saveDesignerDraft(storage, 'user-1', formId, draft, ids), true)
  assert.equal(designerStorageKey('user-1', formId), [...values.keys()][0])
  assert.equal(loadDesignerDraft(storage, 'user-1', formId, ids).overrides.address.lineHeight, 1.8)
  assert.deepEqual(loadDesignerDraft(storage, 'user-2', formId, ids).overrides, {})
  assert.deepEqual(loadDesignerDraft(storage, 'user-1', 'another-form', ids).overrides, {})
  assert.equal(saveDesignerDraft(storage, undefined, formId, draft, ids), false)
})

test('laboratory UI protects editable keyboard behavior, RTL, cancellation and immutable Golden source', () => {
  assert.match(page, /dir=\{fa \? 'rtl' : 'ltr'\}/)
  assert.match(page, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(page, /target\.matches\('input, textarea, \[contenteditable="true"\]'\)/)
  assert.match(page, /editingBaseline\.current/)
  assert.match(app, /FormLaboratoryPage language=\{language\} authenticatedUserId=\{access\?\.id\}/)
  assert.match(page, /const targets = applyToAll \? fieldIds : selection/)
  assert.match(page, /onSelectAll=\{\(\) => setSelection\(fieldIds\)\}/)
  assert.doesNotMatch(page, /document\.documentElement\.dataset\.theme|setTheme\(/)
  assert.match(page, /<Shortcut code="F3"/)
  assert.match(panel, /type="color"/)
  assert.match(panel, /onBeginColorChange/)
  assert.match(panel, /Select all|انتخاب همه/)
})
