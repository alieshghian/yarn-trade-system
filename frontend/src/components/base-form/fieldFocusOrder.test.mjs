import assert from 'node:assert/strict'
import test from 'node:test'
import { fieldFocusSequence, hasInvalidFieldFocusOrders, moveFieldFocusOrder, orderedFocusItems, spatialFocusNeighbor, visualFocusOrder } from './fieldFocusOrder.ts'

const item = (value, left, top, width = 100, height = 40, order) => ({ value, rect: { left, right: left + width, top, bottom: top + height }, order })

test('default order follows visual rows in the current reading direction', () => {
  const fields = [item('group', 0, 3), item('name', 240, 0, 200), item('material', 120, 1), item('code', 460, 2), item('lower', 460, 110)]
  assert.deepEqual(visualFocusOrder(fields, true).map(field => field.value), ['code', 'name', 'material', 'group', 'lower'])
  assert.deepEqual(visualFocusOrder(fields, false).map(field => field.value), ['group', 'material', 'name', 'code', 'lower'])
  assert.deepEqual(visualFocusOrder(fields.map(field => field.value === 'group' ? item('group', 350, 112) : field), true).map(field => field.value), ['code', 'name', 'material', 'lower', 'group'])
})

test('manual positions are unique and moving one shifts the remaining positions', () => {
  const fields = ['code', 'name', 'material', 'unit'].map(id => ({ id }))
  const changed = moveFieldFocusOrder(fields, ['code', 'name', 'material', 'unit'], 'unit', 2)
  assert.deepEqual(fieldFocusSequence(changed, []), ['code', 'unit', 'name', 'material'])
  assert.deepEqual(changed.map(field => field.focusOrder), [1, 3, 4, 2])
  assert.equal(hasInvalidFieldFocusOrders(changed), false)
  const again = moveFieldFocusOrder(changed, [], 'code', 4)
  assert.deepEqual(fieldFocusSequence(again, []), ['unit', 'name', 'material', 'code'])
  assert.equal(hasInvalidFieldFocusOrders(again), false)
  assert.deepEqual(JSON.parse(JSON.stringify(again)), again, 'positions survive form JSON serialization')
})

test('read-only and derived fields are excluded from Enter order', () => {
  const fields = [
    { id: 'name', focusOrder: 1 },
    { id: 'fullName', focusOrder: 2, readOnly: true },
    { id: 'description', focusOrder: 3 },
    { id: 'computed', componentId: 'base-form.derived-display', readOnly: true, focusOrder: 4 },
  ]
  assert.deepEqual(fieldFocusSequence(fields, []), ['name', 'description'])
  assert.equal(hasInvalidFieldFocusOrders(fields), false)
  const changed = moveFieldFocusOrder(fields, [], 'description', 1)
  assert.deepEqual(fieldFocusSequence(changed, []), ['description', 'name'])
  assert.equal(changed.find(field => field.id === 'fullName').focusOrder, undefined)
  assert.equal(changed.find(field => field.id === 'computed').focusOrder, undefined)
})

test('invalid or duplicate positions fall back to visual order without altering stored data', () => {
  const fields = [{ id: 'a', focusOrder: 1 }, { id: 'b', focusOrder: 1 }]
  assert.equal(hasInvalidFieldFocusOrders(fields), true)
  assert.deepEqual(fieldFocusSequence(fields, ['b', 'a']), ['b', 'a'])
  assert.deepEqual(orderedFocusItems([item('a', 0, 0, 100, 40, 1), item('b', 120, 0, 100, 40, 1)], true).map(field => field.value), ['b', 'a'])
  assert.deepEqual(fields, [{ id: 'a', focusOrder: 1 }, { id: 'b', focusOrder: 1 }])
})

test('arrow directions choose physical neighbors without moving fields', () => {
  const fields = [item('top-left', 0, 0), item('top-right', 120, 0), item('bottom-left', 0, 90), item('bottom-right', 120, 90)]
  assert.equal(spatialFocusNeighbor(fields, fields[1], 'ArrowLeft')?.value, 'top-left')
  assert.equal(spatialFocusNeighbor(fields, fields[1], 'ArrowDown')?.value, 'bottom-right')
  assert.equal(spatialFocusNeighbor(fields, fields[2], 'ArrowRight')?.value, 'bottom-right')
  assert.equal(spatialFocusNeighbor(fields, fields[0], 'ArrowUp'), undefined)
})

test('fractional validation offsets keep controls in the same visual row',()=>{
 const fields=[item('title',200,251,200,34),item('code',420,268.1875,130,34),item('name',0,268.1875,180,34),item('nextRow',420,356,130,34)]
 assert.deepEqual(visualFocusOrder(fields,true).map(field=>field.value),['code','title','name','nextRow'])
})

 test('Enter participation defaults on and skips unchecked/readonly fields without losing saved ranks',()=>{
 const fields=[{id:'a'},{id:'b',enterEnabled:false},{id:'c'},{id:'derived',componentId:'base-form.derived-display'},{id:'readonly',readOnly:true}]
 assert.deepEqual(fieldFocusSequence(fields,['c','b','a','derived','readonly']),['c','a'])
 assert.deepEqual(fieldFocusSequence(fields,['c','b','a'],true),['c','b','a'])
 const moved=moveFieldFocusOrder(fields,['c','b','a'],'a',1)
 assert.equal(moved.find(f=>f.id==='b').enterEnabled,false)
 assert.deepEqual(fieldFocusSequence(JSON.parse(JSON.stringify(moved)),['c','b','a']),['a','c'])
 assert.deepEqual(fieldFocusSequence(moved.map(f=>f.id==='b'?{...f,enterEnabled:true}:f),['c','b','a']),['a','c','b'])
 })

import {arrowLeavesText} from './fieldArrowNavigation.ts';
test('horizontal navigation preserves editing caret until the physical RTL/LTR text edge',()=>{
 for(const rtl of [true,false]){const forward=rtl?'ArrowLeft':'ArrowRight',back=rtl?'ArrowRight':'ArrowLeft';assert.equal(arrowLeavesText(forward,3,3,8,rtl),false);assert.equal(arrowLeavesText(back,3,3,8,rtl),false);assert.equal(arrowLeavesText(forward,8,8,8,rtl),true);assert.equal(arrowLeavesText(back,0,0,8,rtl),true);assert.equal(arrowLeavesText(back,8,8,8,rtl),false);assert.equal(arrowLeavesText(forward,0,0,8,rtl),false);assert.equal(arrowLeavesText(forward,0,8,8,rtl),true);assert.equal(arrowLeavesText(forward,2,4,8,rtl),false);assert.equal(arrowLeavesText(forward,null,null,8,rtl),true)}
});
