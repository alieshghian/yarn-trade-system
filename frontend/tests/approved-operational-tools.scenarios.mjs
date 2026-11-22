import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { revealMenuExpression } from './form-context-navigation.mjs'

export function worksheet(workbook) {
  for (let offset = 0; offset + 30 < workbook.length && workbook.readUInt32LE(offset) === 0x04034b50;) {
    const size = workbook.readUInt32LE(offset + 18)
    const length = workbook.readUInt16LE(offset + 26)
    const entry = workbook.toString('utf8', offset + 30, offset + 30 + length)
    const start = offset + 30 + length + workbook.readUInt16LE(offset + 28)
    if (entry === 'xl/worksheets/sheet1.xml') {
      assert.equal(workbook.readUInt16LE(offset + 8), 0, 'Expected the application’s stored worksheet entry')
      return workbook.toString('utf8', start, start + size)
    }
    offset = start + size
  }
  assert.fail('Downloaded workbook has no worksheet')
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const find = selector => 'document.querySelector(' + JSON.stringify(selector) + ')'
const label = value => "[...document.querySelectorAll('button,summary,[role=menuitem]')].find(e=>e.getClientRects().length&&(e.getAttribute('aria-label')===" + JSON.stringify(value) + '||e.textContent.trim()===' + JSON.stringify(value) + '))'

export async function checkOperationalTools({ base, send, evaluate, until, profile }) {
  const grid = '.operational-form-frame .base-grid-boundary'
  const wait = (expression, name) => until(expression, name)
  async function mouse(expression, button = 'left') {
    await wait('!!(' + expression + ')', expression)
    await evaluate('(' + expression + ").scrollIntoView({block:'nearest',inline:'nearest'})")
    for (let i = 0; i < 5; i++) {
      const point = await evaluate('(async()=>{await new Promise(requestAnimationFrame);const r=(' + expression + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
      if (!await evaluate('(' + expression + ').contains(document.elementFromPoint(' + point.x + ',' + point.y + '))')) continue
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...point, button, clickCount: 1 })
      return
    }
    assert.fail('Pointer could not reach ' + expression)
  }
  const click = selector => mouse(find(selector))
  const key = async (key, windowsVirtualKeyCode) => {
    for (const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent', {type, key, code:key, windowsVirtualKeyCode})
  }
  const navigate = async (path, ready = grid) => {
    const token = await evaluate('performance.timeOrigin')
    await send('Page.navigate', {url: base + '/tests/' + path})
    await wait('performance.timeOrigin!==' + token + '&&!!' + find(ready), 'Operational fixture ' + path)
  }
  await send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:profile}, true)

  async function gridTools(name, values, hiddenColumn) {
    const body = grid + ' tbody tr[data-row-index]:not([aria-busy=true])'
    const row = find(body + ' td')
    const selected = find(grid + ' tbody tr.is-selected')
    const rect = '(()=>{const r=' + find(grid) + '.getBoundingClientRect();return [r.width,r.height]})()'
    const expand = find(grid + ' .grid-expand-toggle')
    const columns = grid + ' .grid-columns-slot summary'
    const hiddenHeader = find(grid + ' th[data-column="' + hiddenColumn + '"]')
    await wait('!!' + row, name + ' populated row')
    await wait('!!' + hiddenHeader, name + ' provided the approved column ' + hiddenColumn)
    const header = await evaluate(hiddenHeader + '.innerText')
    await mouse(row)
    await wait('!!' + selected, name + ' selected row')
    const selectedCells = 'Array.from(' + selected + '.cells, cell=>[cell.dataset.column,cell.textContent])'
    const expectedCells = (await evaluate(selectedCells)).filter(([column])=>column!==hiddenColumn)
    const selectedIndex = await evaluate(selected + '.dataset.rowIndex')
    const selection = async phase => {
      assert.equal(await evaluate(selected + '.dataset.rowIndex'), selectedIndex, name + ' selected row ' + phase)
      assert.deepEqual(await evaluate(selectedCells), expectedCells, name + ' selected data ' + phase)
    }
    await click(columns)
    const menu = '.grid-column-visibility-list label'
    const choice = '[...document.querySelectorAll(' + JSON.stringify(menu) + ')].find(e=>e.textContent.trim()===' + JSON.stringify(header.trim()) + ')?.querySelector("input")'
    await mouse(choice)
    await wait('!' + hiddenHeader, name + ' hidden export column')
    await click(columns)
    await wait('!' + find('.grid-column-visibility-list'), name + ' column popup closes')
    const before = await evaluate(rect)
    await selection('after hiding a column')
    await mouse(expand)
    await wait(expand + '.getAttribute("aria-pressed")==="true"', name + ' expanded')
    assert.notDeepEqual(await evaluate(rect), before, name + ' changes rendered grid size')
    await selection('after maximize')
    await mouse(expand)
    await wait(expand + '.getAttribute("aria-pressed")==="false"&&JSON.stringify(' + rect + ')===' + JSON.stringify(JSON.stringify(before)), name + ' restored grid geometry')
    await selection('after restore')
    assert.equal(await evaluate('!!' + hiddenHeader), false, name + ' hidden column survives restore')

    const existing = new Set(await readdir(profile))
    assert.ok(await evaluate('!!' + find(grid + ' .grid-export-toggle[title] svg')), name + ' icon-only export control')
    await click(grid + ' .grid-export-toggle')
    let file
    const deadline = Date.now() + 10000
    while (!file && Date.now() < deadline) {
      file = (await readdir(profile)).find(path => path.endsWith('.xlsx') && !existing.has(path))
      if (!file) await pause(100)
    }
    assert.ok(file, name + ' downloaded XLSX')
    const xml = worksheet(await readFile(join(profile, file)))
    for (const value of values) assert.ok(xml.includes('>' + value + '</t>'), name + ' workbook includes ' + value)
    assert.ok(!xml.includes('>' + header.trim() + '</t>'), name + ' workbook excludes hidden column ' + header)
    await selection('after export')
    console.log('PASS ' + name + ' workbook contents and maximize restore preserve the selected row and hidden column')
  }

  async function settings(name, field) {
    const input = find(field)
    const color = 'getComputedStyle(' + input + ').backgroundColor'
    const original = await evaluate(color)
    async function paint() {
      await mouse(label('تنظیمات فرم'))
      await mouse(input, 'right')
      const command = label('رنگ پس‌زمینه…')
      await revealMenuExpression(command, {evaluate, send, pause})
      await mouse(command)
      await click('.excel-color-popover [aria-label="#0070c0"]')
      await wait(color + '==="rgb(0, 112, 192)"', name + ' previews field color')
    }
    await paint()
    await mouse(label('خروج بدون ذخیره'))
    await wait(color + '===' + JSON.stringify(original), name + ' discards personal draft')
    await paint()
    await mouse(label('ذخیره تنظیمات'))
    const token = await evaluate('performance.timeOrigin')
    await send('Page.reload')
    await wait('performance.timeOrigin!==' + token + '&&!!' + input + '&&' + color + '==="rgb(0, 112, 192)"', name + ' applies saved preferences after reload')
    console.log('PASS ' + name + ' personal appearance previews, cancels and survives reload')
  }

  await navigate('brands-operational.html?many')
  await gridTools('Brand', ['aB-200','1099'], 'description')
  const shortcut = '.shortcut-settings summary'
  const selectedAction = '[data-action-id="operational.copySelected"] button'
  await click(shortcut)
  const f4Preference = "[...document.querySelectorAll('.shortcut-settings label')].find(e=>e.textContent.includes('F4')).querySelector('input')"
  await wait('document.querySelector(".shortcut-settings").open', 'Brand shortcut options opened')
  await key('Tab', 9)
  await key('Tab', 9)
  assert.equal(await evaluate('document.activeElement===' + f4Preference), true, 'Brand F4 preference is keyboard accessible')
  await key(' ', 32)
  await wait('!' + find(selectedAction), 'Brand disables configured F4 action')
  await navigate('brands-operational.html?many')
  assert.equal(await evaluate('!!' + find(selectedAction)), false, 'Brand F4 preference survives navigation')
  await click(grid + ' tbody tr[data-row-index] td')
  await key('F4', 115)
  assert.equal(await evaluate(find('[data-field=brandCode]') + '.disabled'), true, 'Disabled F4 does not create a draft')
  await key('F2', 113)
  await wait('!' + find('[data-field=brandCode]') + '.disabled', 'Brand F2 still creates a draft')
  await key('Escape', 27)
  await wait(find('[data-field=brandCode]') + '.disabled', 'Brand Escape cancels copy draft')
  console.log('PASS Brand F4 setting persists without disabling F2 copy and Escape cancellation')

  await click(grid + ' tbody tr[data-row-index] td')
  await key('F1', 112)
  const search = find(grid + ' .grid-search-control input')
  await wait('document.activeElement===' + search, 'F1 focuses the actual grid search')
  await send('Input.insertText', {text:'B-200'})
  const resultContains = value => find(grid + ' tbody') + '.textContent.includes(' + JSON.stringify(value) + ')'
  await click(grid + ' [data-toolbar-part="searchOption:contains"] input')
  await wait(resultContains('aB-200') + '&&!' + resultContains('ZZ-900'), 'Contains returns matching Brand rows only')
  await click(grid + ' [data-toolbar-part="searchOption:exact"] input')
  await wait('!' + resultContains('aB-200'), 'Exact rejects a substring')
  await click(grid + ' [data-toolbar-part="searchOption:contains"] input')
  await click(grid + ' .grid-search-reverse')
  await wait('!' + resultContains('aB-200') + '&&' + resultContains('ZZ-900'), 'Reverse displays the complementary result')
  console.log('PASS Shared grid F1, search mode selection and reverse operate on actual Brand results')

  await evaluate("sessionStorage.setItem('isolated-product-group-records',JSON.stringify([{id:'root-1',parentId:null,name:'ریشه محافظت',code:'981',hierarchyCode:'981',depth:0,rowVersion:'AAAAAAAAAAE='},{id:'leaf-1',parentId:'root-1',name:'برگ محافظت',code:'981',hierarchyCode:'981.1',depth:1,rowVersion:'AAAAAAAAAAE='}]))")
  await navigate('product-group-operational.html')
  await gridTools('Product Group', ['981','ریشه محافظت'], 'product-group.cascading-tree.level.1')
  await settings('Product Group', '.laboratory-banner-title')
  await navigate('approved-yarns.html')
  await gridTools('Yarn', ['110','120'], 'material')
  await settings('Yarn', '[data-field="code"]')

  await navigate('warehouses.html?large&size=102')
  await gridTools('Warehouse', ['WH-0','WH-101'], 'description')
  await settings('Warehouse', '[data-field="name"]')

  const page = '.business-contract-page'
  const footer = page + ' footer'
  const contractName = "[...document.querySelectorAll('.contract-field')].find(e=>e.firstElementChild.textContent==='نام قرارداد').querySelector('input')"
  const save = find(footer + ' [data-save-action]')
  const edit = "[...document.querySelectorAll('.business-contract-page footer button')].find(e=>e.textContent.trim()==='ویرایش')"
  const amendment = find(footer + ' button')
  await navigate('business-contract-coverage.html?viewer', page)
  assert.equal(await evaluate('document.querySelectorAll(' + JSON.stringify(footer + ' button') + ').length'), 0, 'Viewer has no amendment or edit control')
  assert.equal(await evaluate(contractName + '.disabled'), true, 'Viewer cannot edit contract fields')
  await evaluate(find(page) + '.focus()')
  await key('F3', 114)
  assert.equal(await evaluate('contractEvidence.writes.length'), 0, 'Read-only role sends no mutations on F3')

  await navigate('business-contract-coverage.html?editable', page)
  assert.ok(await evaluate('!!' + edit), 'Editable contract exposes Edit')
  await mouse(edit)
  await wait('!!' + save + '&&!' + contractName + '.disabled', 'Editable settings open for the writer')
  await key('Escape', 27)
  await wait('!!' + edit + '&&' + contractName + '.disabled', 'Escape cancels editing and reloads original data')
  assert.equal(await evaluate('contractEvidence.writes.length'), 0, 'Cancellation sends no mutations')

  await navigate('business-contract-coverage.html', page)
  assert.equal(await evaluate('!!' + edit), false, 'A posted contract cannot use direct edit')
  assert.equal(await evaluate(contractName + '.disabled'), true)
  const geometry = await evaluate("(()=>{const area=document.querySelector('.contract-scroll-content'),heading=area.querySelector('header'),box=area.getBoundingClientRect(),r=heading.getBoundingClientRect();return {headingInPanel:r.top>=box.top && r.left>=box.left && r.right<=box.right,costRows:area.querySelectorAll('.cost-row').length,footerOutsideScroll:!area.contains(document.querySelector('.business-contract-page footer')),direction:getComputedStyle(area).direction}})()")
  assert.deepEqual(geometry, {headingInPanel:true,costRows:11,footerOutsideScroll:true,direction:'rtl'}, 'Contract settings retain all cost rows and keep footer outside the scroll panel')
  console.log('PASS Business Contract RTL state header and eleven cost rows share a contained editor and independent footer')
  await mouse(amendment)
  await wait('!!' + save + '&&!' + contractName + '.disabled', 'Locked contract offers amendment draft')
  assert.equal(await evaluate(find('[data-field="identity0Name"]') + '.disabled'), true, 'Amendment keeps a locked investor identity read-only')
  await mouse(contractName)
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65,commands:['selectAll']})
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65})
  await send('Input.insertText', {text:'قرارداد اصلاح شده'})
  await key('F3', 114)
  await wait('!!' + find('[role=alert]') + '&&contractEvidence.writes.length===1', 'Rejected amendment surfaces a conflict')
  assert.equal(await evaluate(contractName + '.value'), 'قرارداد اصلاح شده', 'Rejected amendment retains the draft')
  await key('F3', 114)
  await wait('!' + save + '&&contractEvidence.writes.length===2&&' + contractName + '.disabled', 'Successful amendment returns to view')
  const requests = await evaluate('contractEvidence.writes')
  for (const request of requests) {
    assert.equal(request.method, 'POST')
    assert.equal(request.path, '/api/business-contract/amendments')
    assert.equal(request.body.previousVersionId, 'contract-v1', 'Amendment references its immutable predecessor')
    assert.equal(request.body.versionNumber, 2)
    assert.equal(request.body.primaryInvestorId, 'investor-1')
  }
  await navigate('business-contract-coverage.html', page)
  assert.equal(await evaluate(contractName + '.value'), 'قرارداد اصلاح شده', 'Amendment is read back on a fresh document')
  console.log('PASS Business Contract viewer, edit, lock and F3 amendment enforce roles and retain saved version across reload')
}