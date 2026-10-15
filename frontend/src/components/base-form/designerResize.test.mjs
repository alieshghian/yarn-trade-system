import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyDesignerDraft, layoutDesignerFields, resizeCanvasHandle, designerResizeHandles } from './designer.ts'

const canvas = () => ({ width: 600, height: 400, fields: { field: { input: { left: 100, top: 100, width: 120, height: 40 }, label: { left: 100, top: 60, width: 120, height: 20 } } } })

test('all eight handles move only the selected sides while keeping opposite sides anchored', () => {
  for (const handle of designerResizeHandles) {
    const original = canvas()
    const dx = handle.includes('left') ? -1 : handle.includes('right') ? 1 : 0
    const dy = handle.includes('top') ? -1 : handle.includes('bottom') ? 1 : 0
    const resized = resizeCanvasHandle(original, ['field'], handle, dx, dy)
    const rect = resized.fields.field.input
    assert.equal(rect.left, 100 + (handle.includes('left') ? -1 : 0), handle)
    assert.equal(rect.top, 100 + (handle.includes('top') ? -1 : 0), handle)
    assert.equal(rect.width, 120 + (dx ? 1 : 0), handle)
    assert.equal(rect.height, 40 + (dy ? 1 : 0), handle)
    assert.deepEqual(resized.fields.field.label, original.fields.field.label)
    assert.equal(original.fields.field.input.width, 120)
  }
})

test('irrelevant arrow axes do not create a resize and the canvas boundary remains enforced', () => {
  const original = canvas()
  assert.equal(resizeCanvasHandle(original, ['field'], 'top', 10, 0), original)
  const resized = resizeCanvasHandle(original, ['field'], 'left', -1000, 0)
  assert.equal(resized.fields.field.input.left, 0)
  assert.equal(resized.fields.field.input.left + resized.fields.field.input.width, 220)
})

const measured = [
  { id: 'a', left: 0, top: 0, right: 120, bottom: 70, width: 120, height: 70, inputWidth: 120, inputHeight: 30, labelWidth: 100, labelHeight: 20 },
  { id: 'b', left: 220, top: 0, right: 380, bottom: 90, width: 160, height: 90, inputWidth: 160, inputHeight: 50, labelWidth: 100, labelHeight: 20 }
]

test('equal width preserves independent heights and positions', () => {
  const result = layoutDesignerFields(emptyDesignerDraft('test'), measured, { operation: 'equalWidth', orientation: 'horizontal', gap: 12, rtl: false }, ['a', 'b'])
  assert.deepEqual(result.overrides, { 'a::input': { width: 120 }, 'b::input': { width: 120 } })
})

test('equal height preserves independent widths and positions', () => {
  const result = layoutDesignerFields(emptyDesignerDraft('test'), measured, { operation: 'equalHeight', orientation: 'horizontal', gap: 12, rtl: true }, ['a', 'b'])
  assert.deepEqual(result.overrides, { 'a::input': { height: 30 }, 'b::input': { height: 30 } })
})
