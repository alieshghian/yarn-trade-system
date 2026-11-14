import test from 'node:test'
import assert from 'node:assert/strict'
import { createLabelTranslationQueue } from './labelTranslationQueue.ts'
import { emptyDesignerDraft, setDesignerActionText, markDesignerActionLabelManual, applyDesignerActionTranslations, translateDesignerActionLabel, validateDesignerDraft } from './designer.ts'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async condition => { for (let i = 0; i < 100; i++) { if (condition()) return; await pause(5) } throw Error('Timed out') }

test('group dictionary works in all three directions and manual corrections survive validation', () => {
  assert.deepEqual(translateDesignerActionLabel('گروه جدید', 'fa'), { en: 'New group', zh: '新建分组' })
  assert.equal(translateDesignerActionLabel('New group', 'en').zh, '新建分组')
  assert.equal(translateDesignerActionLabel('新建分组', 'zh').fa, 'گروه جدید')
  for (const text of ['گروه جديد', 'گروه جدید\u200f', '\u202bگروه\u00a0جديد\u202c', 'گروه\u200cجدید', 'گروه جَدید', 'گروه جـدید']) assert.deepEqual(translateDesignerActionLabel(text, 'fa'), { en: 'New group', zh: '新建分组' }, text)
  let draft = emptyDesignerDraft('test.form')
  draft = setDesignerActionText(draft, 'new-person', 'en', 'My custom caption')
  draft = markDesignerActionLabelManual(draft, 'new-person', 'en')
  draft = applyDesignerActionTranslations(draft, 'new-person', { en: 'New group', zh: '新建分组' })
  const restored = validateDesignerDraft(JSON.parse(JSON.stringify(draft)), 'test.form', [])
  assert.equal(restored.actions['new-person'].labels.en, 'My custom caption')
  assert.equal(restored.actions['new-person'].manualLabels.en, true)
  assert.equal(restored.actions['new-person'].autoLabels.zh, '新建分组')
  draft = markDesignerActionLabelManual(restored, 'new-person', 'en', false)
  assert.equal(applyDesignerActionTranslations(draft, 'new-person', { en: 'New group' }).actions['new-person'].labels.en, 'New group')
})

test('typing is debounced, cached and older in-flight responses never apply', async () => {
  const requests = [], applied = [], status = []
  const queue = createLabelTranslationQueue((text, source, signal) => new Promise(resolve => requests.push({ text, source, signal, resolve })), 10)
  try {
    queue.schedule('form:action', 'first letter', 'fa', v => applied.push(v), s => status.push(s))
    queue.schedule('form:action', 'complete', 'fa', v => applied.push(v), s => status.push(s))
    await until(() => requests.length === 1)
    assert.equal(requests[0].text, 'complete')
    queue.schedule('form:action', 'latest', 'fa', v => applied.push(v), s => status.push(s))
    await until(() => requests.length === 2)
    assert.equal(requests[0].signal.aborted, true)
    requests[1].resolve({ en: 'Latest', zh: '最新' })
    await until(() => applied.length === 1)
    requests[0].resolve({ en: 'Old', zh: '旧' }); await pause(10)
    assert.deepEqual(applied, [{ en: 'Latest', zh: '最新' }])
    queue.schedule('other-form:action', 'latest', 'fa', v => applied.push(v), s => status.push(s))
    await until(() => applied.length === 2)
    assert.equal(requests.length, 2)
  } finally { queue.dispose() }
})

test('unconfigured provider is explicit and cancellation never writes labels', async () => {
  const states = [], applied = []
  const queue = createLabelTranslationQueue(async () => { throw { details: { code: 'TRANSLATION_NOT_CONFIGURED' } } }, 0)
  queue.schedule('a', 'text', 'fa', v => applied.push(v), s => states.push(s))
  await until(() => states.includes('unconfigured'))
  assert.deepEqual(applied, [])
  queue.schedule('a', 'cancel', 'fa', v => applied.push(v), s => states.push(s)); queue.dispose(); await pause(10)
  assert.deepEqual(applied, [])
})
