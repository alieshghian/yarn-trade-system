import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

function worksheet(workbook) {
  for (let offset = 0; offset + 30 < workbook.length && workbook.readUInt32LE(offset) === 0x04034b50;) {
    const size = workbook.readUInt32LE(offset + 18)
    const nameLength = workbook.readUInt16LE(offset + 26)
    const name = workbook.toString('utf8', offset + 30, offset + 30 + nameLength)
    const start = offset + 30 + nameLength + workbook.readUInt16LE(offset + 28)
    if (name === 'xl/worksheets/sheet1.xml') {
      assert.equal(workbook.readUInt16LE(offset + 8), 0)
      return workbook.toString('utf8', start, start + size)
    }
    offset = start + size
  }
  assert.fail('Downloaded workbook has no worksheet')
}

export async function checkPersonsToolbar({ base, send, evaluate, until, profile }) {
  const url = base + '/tests/person-brand-lookup.html?toolbar=1'
  const panel = '.active .persons-page'
  const field = panel + ' input[data-field="personCode"]'
  const find = selector => `document.querySelector(${JSON.stringify(selector)})`
  const button = label => `[...document.querySelectorAll('button,[role=button],[role=menuitem]')].find(e=>e.getClientRects().length&&(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)}))`
  async function mouse(expression, button = 'left') {
    await until(`!!(${expression})`, 'Available control: ' + expression)
    const point = await evaluate(`(async()=>{const e=${expression};e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(requestAnimationFrame);const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))}})()`)
    assert.ok(point.hit, 'Pointer does not hit intended control: ' + expression)
    const { x, y } = point
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 })
  }
  const click = label => mouse(button(label))
  const snapshot = async suffix => {
    if (!process.env.PERSONS_SCREENSHOTS) return
    const image = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(process.env.PERSONS_SCREENSHOTS + '-' + suffix + '.png', Buffer.from(image.data, 'base64'))
  }
  const load = async () => {
    const previousDocument = await evaluate('performance.timeOrigin')
    await send('Page.navigate', { url })
    await until(`performance.timeOrigin!==${previousDocument}&&location.href===${JSON.stringify(url)}&&!!${find(panel + ' tr[data-person-id]')}`, 'Synthetic Persons loaded')
  }
  const select = async (selector, value) => evaluate(`(()=>{const e=${find(selector)};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()`)
  const selected = () => evaluate(`${find(panel + ' tr.selected')}?.dataset.personId`)
  const rect = () => evaluate(`(()=>{const r=${find(panel + ' .person-grid-panel')}.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`)
  const visibleTableHeight = () => evaluate(`(()=>{const r=${find(panel + ' .person-table-wrap')}.getBoundingClientRect();return Math.min(innerHeight,r.bottom)-Math.max(0,r.top)})()`)
  const appearance = () => evaluate(`(()=>{const s=getComputedStyle(${find(field)});return [s.fontFamily,s.fontSize,s.color,s.backgroundColor]})()`)
  const appearanceMenu = async (group, command) => {
    await mouse(find(field), 'right')
    await mouse(find(`.designer-context-menu [data-grid-submenu="${group}"]`))
    await click(command)
  }

  await load()
  const missing = await evaluate(`['columns','expand','export'].filter(part=>!document.querySelector('.persons-grid-actions [data-toolbar-part="'+part+'"] svg'))`)
  await mouse(find(panel + ' .form-settings-button'))
  const appearanceAvailable = await evaluate(`!!(${button('ذخیره تنظیمات')})`)
  assert.deepEqual({ missing, appearanceAvailable }, { missing: [], appearanceAvailable: true }, 'Approved toolbar icons and appearance entry')
  await click('خروج بدون ذخیره')
  await mouse(find(panel + ' tr[data-person-id="person-4"] td'))
  await until(`${find(panel + ' tr.selected')}?.dataset.personId==='person-4'`, 'Selected row')
  await snapshot('toolbar')
  await click('ستون‌ها')
  await mouse("Array.from(document.querySelectorAll('.person-column-menu label')).find(e=>e.textContent.trim()==='تلفن').querySelector('input')")
  await until(`!${find(panel + ' th[data-column="phone"]')}`, 'Phone column hidden')
  await click('ستون‌ها')
  await until(`!${find('.person-column-menu')}`, 'Column menu closed')
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
  const before = await rect()
  const beforeTable = await visibleTableHeight()
  await click('بزرگ کردن فرم')
  await until(`${find(panel + ' [data-toolbar-part="expand"] button')}?.getAttribute('aria-pressed')==='true'`, 'Grid expanded')
  assert.ok(await visibleTableHeight() > beforeTable, 'Expanded grid has more visible table space')
  assert.equal(await selected(), 'person-4')
  await snapshot('maximized')
  await click('کوچک کردن فرم')
  await until(`${find(panel + ' [data-toolbar-part="expand"] button')}?.getAttribute('aria-pressed')==='false'`, 'Grid restored')
  assert.deepEqual((await rect()).slice(0, 3), before.slice(0, 3))
  assert.equal(await visibleTableHeight(), beforeTable, 'Restored visible table geometry')
  assert.equal(await selected(), 'person-4')
  assert.equal(await evaluate(`!!${find(panel + ' th[data-column="phone"]')}`), false)

  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile }, true)
  await click('خروجی اکسل')
  let file
  for (let deadline = Date.now() + 10_000; !file && Date.now() < deadline;) {
    file = (await readdir(profile)).find(name => name.endsWith('.xlsx'))
    if (!file) await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(file, 'Chrome downloaded the Excel workbook')
  const xml = worksheet(await readFile(join(profile, file)))
  assert.match(xml, /PERSON-101<\/t>/, 'Server-paged export includes the second page')
  assert.match(xml, /PERSON-4<\/t>/, 'Export includes visible person data')
  assert.doesNotMatch(xml, /تلفن<\/t>|02112345678/, 'Hidden column and values are excluded')
  assert.equal(await selected(), 'person-4', 'Export preserves selection')

  const initial = await appearance()
  await mouse(find(panel + ' .form-settings-button'))
  await appearanceMenu('text', 'تنظیم قلم…')
  await snapshot('font')
  assert.equal(await select('.operational-font-dialog select[aria-label="قلم"]', 'georgia'), 'georgia')
  assert.equal(await select('.operational-font-dialog select[aria-label="اندازه"]', '24'), '24')
  await click('تأیید')
  await appearanceMenu('text', 'رنگ متن…')
  await mouse(find('.excel-color-popover [aria-label="#0070c0"]'))
  await appearanceMenu('appearance', 'رنگ پس‌زمینه…')
  await mouse(find('.excel-color-popover [aria-label="#ffff00"]'))
  const expected = await appearance()
  assert.match(expected[0], /Georgia/i)
  assert.deepEqual(expected.slice(1), ['24px', 'rgb(0, 112, 192)', 'rgb(255, 255, 0)'])
  await snapshot('appearance')
  await click('ذخیره تنظیمات')
  await load()
  assert.deepEqual(await appearance(), expected)
  await evaluate("sessionStorage.setItem('currentUser','toolbar-other-viewer')")
  await load()
  assert.deepEqual(await appearance(), initial, 'Appearance is isolated by user')
  await mouse(find(panel + ' .form-settings-button'))
  await until(`!!(${button('ذخیره تنظیمات')})`, 'Another authorized viewer can edit their own appearance')
  await click('خروج بدون ذخیره')
  await evaluate("sessionStorage.setItem('currentUser','toolbar-denied')")
  await load()
  assert.equal(await evaluate(`!!${find(panel + ' button[aria-label="تنظیمات فرم"]')}`), false, 'Appearance requires access to Persons')
  await evaluate("sessionStorage.removeItem('currentUser')")
  await load()
  assert.deepEqual(await appearance(), expected, 'Original viewer preferences remain intact')

  await click('میان‌برهای صفحه‌کلید')
  assert.equal(await select('.shortcut-settings select', 'F7'), 'F7')
  await click('میان‌برهای صفحه‌کلید')
  assert.equal(await evaluate(`[...document.querySelectorAll('${panel} .shortcut-bar button')].length`), 8)
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key:'F7', code:'F7', windowsVirtualKeyCode:118 })
  await until(`${find(panel)}?.dataset.recordPresentation==='entry'`, 'Configured F7 enters create mode')
  await click('Escانصراف')
  await load()
  await click('میان‌برهای صفحه‌کلید')
  assert.equal(await evaluate(`${find('.shortcut-settings select')}.value`), 'F7')
  assert.equal(await select('.shortcut-settings select', 'Space'), 'Space')
  console.log('PASS Persons icon toolbar, paged XLSX, saved appearance, user isolation and keyboard shortcuts')
}
