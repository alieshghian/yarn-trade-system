import assert from 'node:assert/strict'
import { captureVisualCandidate } from './pending-form-visual-candidates.mjs'
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
  if (process.env.FORM_VISUAL_CANDIDATE_DIR) await wait('!!'+find(grid+' tbody tr[data-row-index]:not([aria-busy=true]) td'),'Populated candidate: brand')
  await captureVisualCandidate({send,evaluate}, "brand", ".operational-form-frame", "Original owner export 6c2f801d; unchanged Brand companion frame and Canvas")
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
  const brandCode = find('[data-field=brandCode]')
  const sequenceRequests = 'brandRequests.filter(request=>request.path==="/api/sequence-suggestions/brand").length'
  const beforeShortcut = await evaluate(sequenceRequests)
  await key('F4', 115)
  assert.equal(await evaluate(brandCode + '.disabled'), true, 'Disabled F4 does not create a draft')
  assert.equal(await evaluate(sequenceRequests), beforeShortcut, 'Disabled F4 does not request a copy code')
  await key('F2', 113)
  await wait('!' + brandCode + '.disabled&&' + brandCode + '.value==="aB-201"', 'Brand F2 still creates a draft with the copy code')
  await mouse(brandCode)
  await wait('document.activeElement===' + brandCode, 'Copy draft input owns keyboard focus')
  await key('Escape', 27)
  await wait(brandCode + '.disabled&&' + brandCode + '.value==="aB-200"', 'Brand Escape cancels copy draft')
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
  if (process.env.FORM_VISUAL_CANDIDATE_DIR) await wait('!!'+find(grid+' tbody tr[data-row-index]:not([aria-busy=true]) td'),'Populated candidate: product-group')
  await captureVisualCandidate({send,evaluate}, "product-group", ".operational-form-frame", "Published Product Group receipt 71bde8e8 and Canvas")
  await gridTools('Product Group', ['981','ریشه محافظت'], 'product-group.cascading-tree.level.1')
  await settings('Product Group', '.laboratory-banner-title')
  await navigate('approved-yarns.html')
  if (process.env.FORM_VISUAL_CANDIDATE_DIR) await wait('!!'+find(grid+' tbody tr[data-row-index]:not([aria-busy=true]) td'),'Populated candidate: yarn')
  await captureVisualCandidate({send,evaluate}, "yarn", ".operational-form-frame", "Published Yarn receipt a348e3e7, Canvas and behavior manifest")
  await gridTools('Yarn', ['110','120'], 'material')
  await settings('Yarn', '[data-field="code"]')

  await navigate('warehouses.html?large&size=102')
  if (process.env.FORM_VISUAL_CANDIDATE_DIR) await wait('!!'+find(grid+' tbody tr[data-row-index]:not([aria-busy=true]) td'),'Populated candidate: warehouse')
  await captureVisualCandidate({send,evaluate}, "warehouse", ".operational-form-frame", "Pinned Warehouse design and fixed operational frame")
  await gridTools('Warehouse', ['WH-0','WH-101'], 'description')
  await settings('Warehouse', '[data-field="name"]')

  await navigate('warehouses.html?zone')
  if (process.env.FORM_VISUAL_CANDIDATE_DIR) await wait('!!'+find(grid+' tbody tr[data-row-index]:not([aria-busy=true]) td'),'Populated candidate: zone')
  await captureVisualCandidate({send,evaluate}, "zone", ".warehouse-zones-page .operational-form-frame", "Pinned Warehouse Zone report schema and actual modal runtime; no separate approved Zone Canvas")
  const zoneTitle = '.warehouse-zones-page .laboratory-banner-title'
  const originalZoneColor = await evaluate('getComputedStyle('+find(zoneTitle)+').backgroundColor')
  await gridTools('Zone', ['1-DOCK','1-SEC'], 'description')
  await settings('Zone', zoneTitle)
  const fonts = label('تنظیم قلم…')
  await mouse(label('تنظیمات فرم'));await mouse(find(zoneTitle),'right')
  await revealMenuExpression(fonts,{evaluate,send,pause});await mouse(fonts)
  const familySelect = find('.operational-font-dialog select[aria-label="قلم"]')
  await wait('!!'+familySelect,'Zone uses the shared font dialog')
  await evaluate('(()=>{const select='+familySelect+';select.value="georgia";select.dispatchEvent(new Event("change",{bubbles:true}))})()')
  await mouse(label('تأیید'));await mouse(label('ذخیره تنظیمات'))
  await navigate('warehouses.html?zone')
  const titleFont = 'getComputedStyle('+find(zoneTitle+' strong')+').fontFamily'
  await wait('/Georgia/i.test('+titleFont+')','Zone saved font applies to title text after navigation')
  await navigate('warehouses.html?zone&alternateUser')
  assert.equal(await evaluate('getComputedStyle('+find(zoneTitle)+').backgroundColor'),originalZoneColor,'Personal Zone color is account scoped')
  assert.doesNotMatch(await evaluate(titleFont),/Georgia/i,'Personal Zone font is account scoped')
  await navigate('warehouses.html?zone')
  console.log('PASS Zone shared font typography and color survive reload without leaking to another account')
  await wait('!!'+find('.warehouse-zones-page .excel-filter-trigger'), 'Zone grid ready after preference reload')
  await click('.warehouse-zones-page th[data-column=code] .excel-filter-trigger')
  await wait("zoneRequests.some(r=>r.body.optionsColumn==='code')", 'Zone requested server-side filter choices')
  const dockOption = "[...document.querySelectorAll('.filter-values label')].find(e=>e.textContent.trim()==='1-DOCK')?.querySelector('input')"
  await mouse(dockOption)
  await click('.filter-invert-selection')
  await wait(find('.filter-invert-selection')+'.getAttribute("aria-pressed")==="true"','Zone enables inverted filter selection')
  await click('.filter-invert-selection')
  await wait(find('.filter-invert-selection')+'.getAttribute("aria-pressed")==="false"','Zone restores inverted filter selection')
  await click('.filter-actions .primary')
  const zoneRows = find('.warehouse-zones-page tbody')
  await wait(zoneRows+'.innerText.includes("1-SEC")&&!'+zoneRows+'.innerText.includes("1-DOCK")','Zone filter excludes the unchecked dock only')
  assert.ok(await evaluate("zoneRequests.some(r=>r.body.optionsColumn==='code')"),'Zone obtains filter choices from the API');
  await click('.warehouse-zones-page tbody tr[data-row-index] td')
  await key('Insert',45)
  const zoneName = find('.warehouse-zones-page input[data-field=name]')
  await wait('!'+zoneName+'.disabled','Insert edits the selected non-dock Zone')
  await mouse(zoneName);await key('Escape',27)
  await wait(zoneName+'.disabled','Escape discards Zone editing')
  console.log('PASS Zone filter inversion stays reversible and physical Insert and Escape preserve selected zone')

  const page = '.business-contract-page'
  const footer = page + ' footer'
  const contractName = "[...document.querySelectorAll('.contract-field')].find(e=>e.firstElementChild.textContent==='نام قرارداد')?.querySelector('input')"
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
  await wait('!!' + save + '&&(' + contractName + ')?.disabled===false', 'Editable settings open for the writer')
  const structure = "[...document.querySelectorAll('.contract-field')].find(e=>e.firstElementChild.textContent==='ساختار کسب‌وکار').querySelector('select')"
  await mouse(structure);await key('End',35);await key('Enter',13)
  await wait("document.querySelectorAll('.allocation-row:first-of-type input').length===2||document.querySelector('.allocation-row')?.querySelectorAll('input').length===2", 'Partnership exposes the paired allocations')
  const pair = ".allocation-row .percent-input input"
  await click(pair)
  await send('Input.insertText',{text:'۳۵'})
  await key('Enter',13)
  await wait("[...document.querySelector('.allocation-row').querySelectorAll('input')].map(e=>e.value).join(',')==='35,65'",'Persian percentage entry preserves both shares as complements')
  const credit = "[...document.querySelectorAll('.contract-toggle')].find(e=>e.textContent.trim()==='فروش اعتباری مجاز است').querySelector('input')"
  await mouse(credit)
  await wait("!!document.querySelector('.contract-fields input[type=number]')",'Credit fields appear only when enabled')
  await mouse(credit)
  await wait("!document.querySelector('.contract-fields input[type=number]')",'Disabling credit hides dependent inputs')
  await key('Escape', 27)
  await wait('!!' + edit + '&&(' + contractName + ')?.disabled===true', 'Escape cancels editing and reloads original data')
  assert.equal(await evaluate('contractEvidence.writes.length'), 0, 'Cancellation sends no mutations')
  await wait(structure+'.value==="SoleOwnership"','Reload after cancellation restores the saved ownership structure')
  console.log('PASS Contract partnership percentages and conditional credit inputs respond and Escape restores the stored draft')

  await navigate('business-contract-coverage.html', page)
  assert.equal(await evaluate('!!' + edit), false, 'A posted contract cannot use direct edit')
  assert.equal(await evaluate(contractName + '.disabled'), true)
  const geometry = await evaluate("(()=>{const area=document.querySelector('.contract-scroll-content'),heading=area.querySelector('header'),box=area.getBoundingClientRect(),r=heading.getBoundingClientRect();return {headingInPanel:r.top>=box.top && r.left>=box.left && r.right<=box.right,costRows:area.querySelectorAll('.cost-row').length,footerOutsideScroll:!area.contains(document.querySelector('.business-contract-page footer')),direction:getComputedStyle(area).direction}})()")
  assert.deepEqual(geometry, {headingInPanel:true,costRows:11,footerOutsideScroll:true,direction:'rtl'}, 'Contract settings retain all cost rows and keep footer outside the scroll panel')
  console.log('PASS Business Contract RTL state header and eleven cost rows share a contained editor and independent footer')
  for (const width of [1600,740]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
    await wait('innerWidth==='+width,'Contract viewport width')
    const layout = await evaluate("(()=>{const p=document.querySelector('.business-contract-page'),r=p.getBoundingClientRect(),parts=[...p.querySelector('.contract-middle-row').children].map(e=>e.getBoundingClientRect()),footer=p.querySelector('footer').getBoundingClientRect();const controls=[...p.querySelectorAll('.contract-section input,.contract-section select')].filter(e=>e.getClientRects().length);return {horizontal:parts[0].right<=parts[1].left+1||parts[1].right<=parts[0].left+1,vertical:parts[0].bottom<=parts[1].top+1,contained:controls.every(e=>{const c=e.getBoundingClientRect();return c.left>=r.left-1&&c.right<=r.right+1}),footerWidth:footer.width<=r.width}})()")
    assert.deepEqual(layout,{horizontal:width>760,vertical:width<=760,contained:true,footerWidth:true},'Contract sections and real controls fit at '+width+'px')
  }
  await send('Emulation.clearDeviceMetricsOverride')
  console.log('PASS Contract real inputs stay contained and sections stack at the documented RTL breakpoint')
  await captureVisualCandidate({send,evaluate}, "contract", ".business-contract-page", "Contract Rules document and existing runtime layout; no owner geometry or grid approval")

  await mouse(amendment)
  await wait('!!' + save + '&&(' + contractName + ')?.disabled===false', 'Locked contract offers amendment draft')
  assert.equal(await evaluate(find('[data-field="identity0Name"]') + '.disabled'), true, 'Amendment keeps a locked investor identity read-only')
  await mouse(contractName)
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65,commands:['selectAll']})
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65})
  await send('Input.insertText', {text:'قرارداد اصلاح شده'})
  await key('F3', 114)
  await wait('!!' + find('[role=alert]') + '&&contractEvidence.writes.length===1', 'Rejected amendment surfaces a conflict')
  assert.equal(await evaluate(contractName + '.value'), 'قرارداد اصلاح شده', 'Rejected amendment retains the draft')
  await key('F3', 114)
  await wait('!' + save + '&&contractEvidence.writes.length===2&&(' + contractName + ')?.disabled===true', 'Successful amendment returns to view')
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
