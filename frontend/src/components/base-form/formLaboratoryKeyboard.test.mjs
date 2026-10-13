import test from 'node:test'
import assert from 'node:assert/strict'
import { handleLaboratorySearchKey } from './formLaboratoryKeyboard.ts'

function keyEvent(overrides = {}) {
  const called = { prevented: false, stopped: false }
  return {
    event: {
      key: 'F1', code: 'F1', keyCode: 112, which: 112,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      preventDefault() { called.prevented = true },
      stopImmediatePropagation() { called.stopped = true },
      ...overrides
    },
    called
  }
}

test('F1 directly focuses search outside active upper-form input', () => {
  const { event, called } = keyEvent()
  let focused = 0
  assert.equal(handleLaboratorySearchKey(event, false, () => focused++), true)
  assert.equal(focused, 1)
  assert.deepEqual(called, { prevented: true, stopped: true })
})

test('F1 does not steal focus while actively entering data in the upper form', () => {
  const { event } = keyEvent()
  let focused = 0
  assert.equal(handleLaboratorySearchKey(event, true, () => focused++), true)
  assert.equal(focused, 0)
})

test('legacy and browser Help representations of F1 focus search', () => {
  for (const fields of [{ key: 'Unidentified', code: 'Unidentified', keyCode: 112, which: 112 }, { key: 'Help', code: 'Help', keyCode: 0, which: 0 }, { key: 'BrowserHelp', code: 'Help', keyCode: 0, which: 0 }]) {
    const { event } = keyEvent(fields)
    let focused = 0
    assert.equal(handleLaboratorySearchKey(event, false, () => focused++), true)
    assert.equal(focused, 1)
  }
})

test('Fn-modified F1 representations and repeated F1 still focus search', () => {
  const functionKey = keyEvent({ altKey: true, key: 'Unidentified', code: 'F1', keyCode: 0, which: 0 })
  const repeated = keyEvent({ repeat: true })
  let focused = 0
  assert.equal(handleLaboratorySearchKey(functionKey.event, false, () => focused++), true)
  assert.equal(handleLaboratorySearchKey(repeated.event, false, () => focused++), true)
  assert.equal(focused, 2)
})
