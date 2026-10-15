import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyDesignerDraft, setDesignerProperty, validateDesignerDraft, designerStyleForPart, createDesignerHistory, designerHistoryReducer } from './designer.ts'

const formId = 'laboratory'
const ids = ['titleId', 'phone', 'mobile', 'address', 'firstName']

test('popup and attached button settings survive serialization and stay independent of main field styling', () => {
  let draft = emptyDesignerDraft(formId)
  for (const [key, value] of Object.entries({ componentPopupBackground: '#abc123', componentPopupFontSize: 22, componentAddWidth: 38, componentAddHeight: 30, componentAddBackground: '#abcdef', componentAddTextColor: '#123456', fontSize: 16, backgroundColor: '#eeeeee' })) {
    draft = setDesignerProperty(draft, ['phone::input'], key, value, ids)
  }
  const restored = validateDesignerDraft(JSON.parse(JSON.stringify(draft)), formId, ids)
  assert.deepEqual(restored.overrides, draft.overrides)
  const style = designerStyleForPart(restored, 'phone', 'input')
  assert.equal(style['--component-popup-bg'], '#abc123')
  assert.equal(style['--component-popup-font-size'], '22px')
  assert.equal(style['--component-add-width'], '38px')
  assert.equal(style['--component-add-height'], '30px')
  assert.equal(style['--component-add-bg'], '#abcdef')
  assert.equal(style['--component-add-text'], '#123456')
  assert.equal(style['--lab-font-size'], '16px')
  assert.equal(style['--lab-bg'], '#eeeeee')
  assert.equal(designerStyleForPart(restored, 'phone', 'label')['--component-popup-bg'], undefined)
  assert.deepEqual(designerStyleForPart(restored, 'mobile', 'input'), {})
})

test('multi-selection settings can be undone and redone together', () => {
  const initial = emptyDesignerDraft(formId)
  const changed = setDesignerProperty(initial, ['phone::input', 'address::input'], 'componentPopupFontSize', 24, ids)
  let history = designerHistoryReducer(createDesignerHistory(initial), { type: 'change', draft: changed })
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.equal(history.present.overrides['phone::input'].componentPopupFontSize, 24)
  assert.equal(history.present.overrides['address::input'].componentPopupFontSize, 24)
})

test('invalid popup colors and out-of-range dimensions are discarded during restore', () => {
  const draft = emptyDesignerDraft(formId)
  draft.overrides['phone::input'] = { componentPopupBackground: 'transparent', componentPopupFontSize: 100, componentAddWidth: -1, componentAddHeight: 500 }
  assert.deepEqual(validateDesignerDraft(draft, formId, ids).overrides, {})
})
