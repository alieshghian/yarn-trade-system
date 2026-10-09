import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8'))
const { defaultNavigation, moveNavigation, orderedChildren } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('Brand route starts under Definitions and moves into and out of permitted groups', () => {
  const nodes = defaultNavigation()
  assert.equal(nodes.find(x => x.routeId === 'brands').parentId, 'definitions')
  nodes.push({ id: 'custom', parentId: null, routeId: null, label: 'Custom', icon: 'settings', enabled: true })
  const moved = moveNavigation(nodes, 'brands', 'custom', 'inside')
  assert.equal(moved.find(x => x.routeId === 'brands').parentId, 'custom')
  assert.deepEqual(moved.filter(x => x.id !== 'brands').sort((a,b) => a.id.localeCompare(b.id)), nodes.filter(x => x.id !== 'brands').sort((a,b) => a.id.localeCompare(b.id)))
  assert.equal(moveNavigation(moved, 'brands', 'persons', 'after').find(x => x.routeId === 'brands').parentId, null)
})

test('Existing personal ordering remains authoritative when the Brand route is added', () => {
  const nodes = defaultNavigation()
  assert.deepEqual(orderedChildren(nodes, 'definitions', ['settings', 'businessContract']).map(x => x.routeId), ['settings', 'businessContract', 'brands'])
  assert.throws(() => moveNavigation(nodes, 'brands', 'persons', 'inside'))
})
