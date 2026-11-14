import assert from 'node:assert/strict'

export async function runRegisteredGeometryScenarios({ evaluate, send, pause, clickExpression, bounds, treeTarget, reloadPage, until }) {
  const parts = ['back', 'all', 'path', 'status', 'limit']
  const key = async (key, modifiers = 0) => {
    const code = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key]
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key, modifiers, windowsVirtualKeyCode: code })
    await pause(80)
  }
  const same = (a, b) => Math.abs(a.left - b.left) < .3 && Math.abs(a.top - b.top) < .3 && Math.abs(a.width - b.width) < .3 && Math.abs(a.height - b.height) < .3
  for (const part of parts) {
    await clickExpression(`document.querySelector('[data-field-id="product-group.cascading-tree.tree.${part}"] > .laboratory-field-select')`)
    await evaluate(`(()=>{const e=${treeTarget(part)};const child=e.querySelector('button:not([disabled]):not(.designer-edge-handle):not(.designer-move-handle)');(child??e).focus({preventScroll:true})})()`)
    // The count starts at the physical canvas edge; first place it inside the
    // canvas through the same keyboard command before testing both directions.
    if (part === 'limit') for (let i = 0; i < 3; i++) await key('ArrowRight', 8)
    for (const [direction, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) {
      const before = await bounds(treeTarget(part))
      const peers = await Promise.all(parts.filter(id => id !== part).map(id => bounds(treeTarget(id))))
      await key(direction)
      const after = await bounds(treeTarget(part)), afterPeers = await Promise.all(parts.filter(id => id !== part).map(id => bounds(treeTarget(id))))
      assert.ok(Math.abs(after.left - before.left - dx) < .3 && Math.abs(after.top - before.top - dy) < .3, part + ' ' + direction + ' must move immediately by one physical pixel: ' + JSON.stringify({ before, after }))
      assert.ok(peers.every((rect, index) => same(rect, afterPeers[index])), 'moving ' + part + ' leaves unselected controls fixed')
    }
    console.log('PASS registered control physical arrows: ' + part)
  }
  await clickExpression(`document.querySelector('[data-field-id="product-group.cascading-tree.tree.path"] > .laboratory-field-select')`)
  for (const [edge, direction, axis, delta] of [['right', 'ArrowLeft', 'width', -10], ['bottom', 'ArrowDown', 'height', 10]]) {
    const before = await bounds(treeTarget('path')), peers = await Promise.all(parts.filter(id => id !== 'path').map(id => bounds(treeTarget(id))))
    await evaluate(`(${treeTarget('path')}).querySelector('.designer-edge-${edge}').focus({preventScroll:true})`)
    await key(direction, 8)
    const after = await bounds(treeTarget('path')), afterPeers = await Promise.all(parts.filter(id => id !== 'path').map(id => bounds(treeTarget(id))))
    assert.ok(Math.abs(after[axis] - before[axis] - delta) < .5, 'breadcrumb ' + axis + ' is independently resizable: ' + JSON.stringify({ before, after }))
    assert.ok(peers.every((rect, index) => same(rect, afterPeers[index])), 'resizing the breadcrumb leaves unselected controls fixed: ' + JSON.stringify({ peers, afterPeers }))
  }
  console.log('PASS registered text width/height use the standard handles without reflowing peers')
  for (let i = 0; i < parts.length; i++) await clickExpression(`document.querySelector('[data-field-id="product-group.cascading-tree.tree.${parts[i]}"] > .laboratory-field-select')`, 'left', i ? 2 : 0)
  await evaluate(`(${treeTarget('path')}).focus({preventScroll:true})`)
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'l', code: 'KeyL', modifiers: 2, windowsVirtualKeyCode: 76 })
  await pause(120)
  const arranged = await Promise.all(parts.map(part => bounds(treeTarget(part))))
  assert.ok(arranged.every(rect => Math.abs(rect.width - arranged[0].width) < 1 && Math.abs(rect.height - arranged[0].height) < 1 && Math.abs(rect.top - arranged[0].top) < 1), 'Ctrl+L applies the shared size and row normalization to all top controls: ' + JSON.stringify(arranged))
  console.log('PASS top controls share Ctrl+L size normalization and row alignment')
  const rootBefore = await bounds(`document.querySelector('.laboratory-form-grid')`)
  await clickExpression(`document.querySelector('.form-laboratory-banner button[aria-label*="ذخیره"]')`)
  await until(`!![...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='تأیید مجوزها و ذخیره')`)
  await clickExpression(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='تأیید مجوزها و ذخیره')`)
  await until(`document.body.textContent.includes('فرم و مجوزها ذخیره و بررسی شدند')`)
  await reloadPage()
  await until(`document.querySelectorAll('.cascading-tree-panel-selector').length===5`)
  const reopened = await Promise.all(parts.map(part => bounds(treeTarget(part))))
  const rootAfter = await bounds(`document.querySelector('.laboratory-form-grid')`)
  assert.ok(reopened.every((rect, i) => Math.abs(rect.width - arranged[i].width) < .5 && Math.abs(rect.height - arranged[i].height) < .5 && Math.abs((rect.left - rootAfter.left) - (arranged[i].left - rootBefore.left)) < 1 && Math.abs((rect.top - rootAfter.top) - (arranged[i].top - rootBefore.top)) < 1), 'saved registered layout reopens with the same dimensions and coordinates: ' + JSON.stringify({ arranged, reopened, rootBefore, rootAfter }))
  console.log('PASS registered layout save/reopen in isolated browser storage')
  return [...parts.map(part => 'registered physical arrows: ' + part), 'registered text independent resize', 'registered top row smart layout', 'registered layout save/reopen']
}
