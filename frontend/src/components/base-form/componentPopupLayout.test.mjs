import assert from 'node:assert/strict'
import test from 'node:test'
import { componentPopupLeft, estimateComponentPopupWidth } from './componentPopupLayout.ts'

const measureText = text => text.length * 10

test('automatic width fits at least six characters, longest options and both footer actions', () => {
  const base = { fieldWidth: 72, viewportWidth: 1200, measureText, content: ['ثبت', 'لغو'], minimumActionWidth: 210 }
  assert.equal(estimateComponentPopupWidth(base), 210, 'minimum width also fits the configurable action pair')
  assert.equal(estimateComponentPopupWidth({ ...base, minimumActionWidth: 0 }), 100, 'six-character width is the default minimum')
  assert.equal(estimateComponentPopupWidth({ ...base, content: ['کالای بسیار طولانی'], minimumActionWidth: 0 }), 220, 'the widest current option drives automatic width')
})

test('configured width is honored but capped by the viewport gutter', () => {
  const base = { fieldWidth: 120, viewportWidth: 800, measureText, content: [] }
  assert.equal(estimateComponentPopupWidth({ ...base, configuredWidth: 430 }), 430)
  assert.equal(estimateComponentPopupWidth({ ...base, configuredWidth: 900 }), 776)
})

test('popup opening edge follows the application language and clamps at viewport edges', () => {
  const field = { fieldLeft: 500, fieldRight: 620, width: 180, viewportWidth: 1000 }
  assert.equal(componentPopupLeft({ ...field, language: 'fa' }), 440, 'Persian keeps its right edge anchored')
  assert.equal(componentPopupLeft({ ...field, language: 'en' }), 500, 'English keeps its left edge anchored')
  assert.equal(componentPopupLeft({ ...field, language: 'zh' }), 500, 'Chinese keeps its left edge anchored')
  assert.equal(componentPopupLeft({ ...field, fieldLeft: 10, fieldRight: 90, width: 240, language: 'fa' }), 12, 'a narrow viewport preserves the minimum outer gutter')
})
