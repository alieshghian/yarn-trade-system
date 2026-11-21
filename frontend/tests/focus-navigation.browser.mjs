import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

// Run against `npm run preview`; the browser profile and workspace are disposable.
const base = process.env.FORM_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER')
const temporaryRoot = resolve(tmpdir())
const profile = resolve(await mkdtemp(join(temporaryRoot, 'yarn-focus-test-')))
assert.ok(profile.startsWith(temporaryRoot + sep), 'Browser profile must remain in the temporary directory')
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let socket, session, sequence = 0
const pending = new Map(), errors = []
const pause = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools: ' + logs)), 15000)
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome startup exited ' + code + ': ' + logs)) })
    browser.once('error', reject)
    browser.stderr.on('data', chunk => {
      logs += String(chunk)
      const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]) }
    })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text)
    const call = pending.get(data.id)
    if (call) { pending.delete(data.id); data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result) }
  })
  const send = (method, params = {}, browserLevel = false) => new Promise((resolveCall, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 20000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolveCall(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId: session } : {}) }))
  })
  const target = await send('Target.createTarget', { url: 'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async (expression, label) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100) }
    throw new Error('Timed out: ' + label + '\n' + await evaluate('document.body.innerText.slice(0,1500)'))
  }
  const clickTab = async label => {
    const expression = `Array.from(document.querySelectorAll('.form-tabs > button')).find(button => Array.from(button.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ${JSON.stringify(label)}))`
    await until(`!!(${expression})`, label + ' tab')
    await evaluate(`(${expression}).click()`)
  }

  const activeField = "document.activeElement?.closest('[data-field-id]')?.dataset.fieldId"
  const fieldInput = id => 'document.querySelector(' + JSON.stringify(`[data-field-id="${id}"] input, [data-field-id="${id}"] select`) + ')'
  const press = async key => {
    const code = { Enter: 13, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27 }[key]
    await send('Input.dispatchKeyEvent', {type:'keyDown',key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code})
    await send('Input.dispatchKeyEvent', {type:'keyUp',key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code})
    await pause(100)
  }
  const expectFocus = async id => until(activeField + ' === ' + JSON.stringify(id), 'focus ' + id)
  const clickText = async (selector, label) => {
    const expression = 'Array.from(document.querySelectorAll(' + JSON.stringify(selector) + ')).find(node => node.textContent.trim() === ' + JSON.stringify(label) + ')'
    await until('!!(' + expression + ')', label)
    await evaluate('(' + expression + ').click()')
  }
  const startRuntime = async language => {
    await clickText('.laboratory-form-access button', language === 'fa' ? 'ورود اطلاعات آزمایشی' : 'Test data entry')
    await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode === 'view'", 'runtime view')
    await evaluate("document.querySelector('[data-field-id=code] input').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}))")
    await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode === 'create'", 'runtime create')
  }
  await send('Page.navigate',{url:base+'/tests/form-designer.html?smartLayout=1&language=fa&scrollExtent=1'})
  await until("!!document.querySelector('.laboratory-form-grid.has-fixed-geometry')",'fixed editor extent fixture')
  await evaluate("(()=>{const pane=document.querySelector('.laboratory-editor');pane.style.height='480px';pane.style.flex='none';pane.parentElement.style.height='480px'})()")
  await until("document.querySelector('.laboratory-form-grid').getBoundingClientRect().height<500",'empty canvas tail cropped')
  assert.equal(await evaluate("(()=>{const pane=document.querySelector('.laboratory-editor');return pane.scrollHeight>pane.clientHeight+1})()"),false,'fitting fields have no vertical overflow')
  await evaluate("document.querySelector('.laboratory-editor').style.height='220px'")
  await until("(()=>{const pane=document.querySelector('.laboratory-editor');return pane.scrollHeight>pane.clientHeight+1})()",'genuine content overflow remains scrollable')
  console.log('PASS fixed editor ignores empty canvas tail and scrolls only for genuine field overflow')
  for (const language of ['en','fa']) {
    await send('Page.navigate', {url:base+'/tests/form-designer.html?smartLayout=1&language='+language})
    await until("document.querySelectorAll('.laboratory-form-grid [data-field-id]').length === 13", 'smart form')
    await startRuntime(language)
    await evaluate("(()=>{const e=document.querySelector('[data-laboratory-test-role] select');e.value='user';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await until("!!document.querySelector('[data-test-actor-role=user]')",'ordinary user runtime');
    const expected = language === 'fa' ? ['code','name','material','luster','group'] : ['group','luster','material','name','code']
    await expectFocus(expected[0])
    assert.equal(await evaluate('getComputedStyle(document.activeElement).backgroundColor'),'rgb(255, 255, 224)')
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'none')
    for (const id of expected.slice(1)) { await press('Enter'); await expectFocus(id) }
    console.log('PASS '+language+' Enter follows visual row order')
    if (language === 'fa') {
      await evaluate("(()=>{const e=document.querySelector('[data-field-id=name] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'نام آزمایشی');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();e.setSelectionRange(3,3)})()");await press('ArrowLeft');await expectFocus('name');await press('ArrowRight');await expectFocus('name');await evaluate(fieldInput('name')+'.setSelectionRange(11,11)');await press('ArrowLeft');await expectFocus('material');await press('ArrowRight');await expectFocus('name');await evaluate(fieldInput('name')+'.setSelectionRange(0,0)');await press('ArrowRight');await expectFocus('code');
      await evaluate(fieldInput('code')+'.focus()'); await press('ArrowDown'); await expectFocus('code')
      await evaluate(fieldInput('code')+'.focus()'); await press('ArrowLeft'); await expectFocus('name')
      await evaluate(fieldInput('group')+'.focus()'); await press('ArrowLeft'); await expectFocus('number')
      await press('ArrowRight'); await expectFocus('group')
      await evaluate("window.__oldMaterialLeft=document.querySelector('[data-field-id=material] .designer-input-part').style.left;document.querySelector('[data-field-id=material] .designer-input-part').style.left='30px'")
      await evaluate(fieldInput('name')+'.focus()'); await press('Enter'); await expectFocus('luster')
      await evaluate("document.querySelector('[data-field-id=material] .designer-input-part').style.left=window.__oldMaterialLeft")
      console.log('PASS Left/Right follow Enter order across row boundaries in both directions; Up/Down stay local')
      await evaluate("document.querySelector('.form-runtime-banner button').click()")
      await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode === 'view'", 'return to view')
      await evaluate("document.querySelector('.form-runtime-banner button').click()")
      await until("!document.querySelector('[data-runtime-mode]')", 'return to designer')
      await evaluate("document.querySelector('[data-field-id=code] .designer-input-part').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:400,clientY:300}))")
      await until("!!document.querySelector('[data-grid-submenu=structure]')", 'structure menu')
      await evaluate("document.querySelector('[data-grid-submenu=structure]').click()")
      await clickText('[role=menuitem]', 'قواعد گروهی و ارتباط فیلدهای فرم…')
      await until("!!document.querySelector('[role=dialog] [aria-label=\"شمارهٔ Enter جنس\"]')", 'focus numbering')
      await evaluate("document.querySelector('[role=dialog] .form-focus-order-disclosure>summary').click()")
      await evaluate("(()=>{const select=document.querySelector('[role=dialog] [aria-label=\"شمارهٔ Enter جنس\"]');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}))})()")
      await until("document.querySelector('[data-field-id=material]')?.dataset.focusOrder === '1'", 'manual order applied')
      await evaluate("document.querySelector('[role=dialog] [aria-label=\"یک پله پایین: جنس\"]').click()")
      await until("document.querySelector('[data-field-id=material]')?.dataset.focusOrder === '2'",'down arrow reorders')
      await evaluate("document.querySelector('[role=dialog] [aria-label=\"یک پله بالا: جنس\"]').click()")
      await until("document.querySelector('[data-field-id=material]')?.dataset.focusOrder === '1'",'up arrow reorders')
      const numbers = await evaluate("Array.from(document.querySelector('[role=dialog] .form-focus-order-disclosure').querySelectorAll('[aria-label^=\"شمارهٔ Enter \"]')).map(node=>Number(node.value))")
      assert.equal(numbers.length,13); assert.equal(new Set(numbers).size,13); assert.deepEqual([...numbers].sort((a,b)=>a-b),Array.from({length:13},(_,i)=>i+1))
      await evaluate("document.querySelector('[role=dialog] [data-enter-row=code] input[type=checkbox]').click()")
      await until("document.querySelector('[data-field-id=code]')?.dataset.enterEnabled === 'false'",'Enter checkbox committed')
      assert.equal(await evaluate("new Set(Array.from(document.querySelectorAll('[role=dialog] .form-focus-order-row:not(.is-readonly)')).map(el=>Math.round(el.querySelector('select').getBoundingClientRect().left))).size"),1,'order columns align')
      await clickText('[role=dialog] button', 'بستن')
      await clickText('[role=alertdialog] button', 'ثبت و بستن')
      await until("!document.querySelector('[role=dialog][aria-label=\"ویرایش ساختار فرم مستقل\"]')", 'close field settings')
      await evaluate("document.querySelector('[data-field-id=code] .designer-input-part').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:400,clientY:300}))")
      await until("!!document.querySelector('[data-grid-submenu=structure]')",'relationships menu')
      await evaluate("document.querySelector('[data-grid-submenu=structure]').click()")
      await clickText('[role=menuitem]','قواعد گروهی و ارتباط فیلدهای فرم…')
      await clickText('[role=dialog] .form-relationship-controls button','افزودن گروه یکتایی ترکیبی U₂')
      await until("document.querySelectorAll('[role=dialog] .form-relationship-controls legend').length===1",'one shared composite rule')
      await clickText('[role=dialog] .form-relationship-controls button','افزودن قانون وابستگی ↔')
      await until("document.querySelectorAll('[role=dialog] .form-relationship-controls legend').length===2",'shared dependency')
      await clickText('[role=dialog] button','بستن')
      await clickText('[role=alertdialog] button','ثبت و بستن')
      await until("!document.querySelector('[role=dialog] .form-relationship-controls')",'rules committed')
      console.log('PASS form-wide composite/dependency editor commits through existing schema')
      await startRuntime(language); await expectFocus('material'); await press('Enter'); await expectFocus('name'); await evaluate(fieldInput('code')+'.focus()'); await expectFocus('code'); await press('Enter'); await expectFocus('name')
      console.log('PASS manual positions are unique and drive entry focus')
    }
  }
  await send('Page.navigate',{url:base+'/tests/form-designer.html?entryContract=1'})
  await until("!!document.querySelector('[data-field=material]')",'compound order fixture')
  await evaluate("document.querySelector('[data-field=material]').focus()")
  await press('ArrowDown')
  assert.equal(await evaluate("document.querySelector('[data-field=material]').value"),'براق')
  assert.equal(await evaluate("document.querySelectorAll('.person-number-list').length"),0,'value list stays closed')
  await press('ArrowUp')
  assert.equal(await evaluate("document.querySelector('[data-field=material]').value"),'مات')
  await press('Enter');await until("!!document.querySelector('[data-component-popup]')",'Enter opens populated multi-choice component');assert.equal(await evaluate("!!document.activeElement.closest('[data-component-popup]')"),true,'focus remains inside choice list');await press('Enter');await until("!document.querySelector('[data-component-popup]')",'explicit choice confirmed');await expectFocus('next')
  await press('ArrowRight'); await expectFocus('material')
  await press('ArrowLeft'); await expectFocus('next')
  await evaluate("document.querySelector('[data-field=choice]').focus()")
  await press('ArrowRight'); await expectFocus('skipped')
  await press('ArrowLeft'); await expectFocus('choice')
  await press('ArrowDown'); await expectFocus('choice')
  assert.equal(await evaluate("document.querySelector('[data-field=choice]').value"),'b')
  await evaluate("(()=>{const e=document.querySelector('[data-field=choice]'),original=e.showPicker.bind(e);e.showPicker=()=>{window.nativePickerCount=(window.nativePickerCount??0)+1;original()}})()");await press('Enter');await expectFocus('choice');assert.equal(await evaluate('window.nativePickerCount'),1,'Enter invokes real native multi-option picker');await press('Escape');
  await evaluate("document.querySelector('[data-field=next]').focus()")
  assert.equal(await evaluate("getComputedStyle(document.activeElement).backgroundColor"),'rgb(255, 255, 224)')
  await evaluate("document.querySelector('[data-field-id=next]').dataset.enterEnabled='false';document.querySelector('[data-field=material]').focus()")
  await press('Enter');await until("!!document.querySelector('[data-component-popup]')",'confirm multiple choices before skip');await press('Enter');await expectFocus('skipped')
  await evaluate("document.querySelector('[data-field=next]').focus()")
  await expectFocus('next'); await press('Enter'); await expectFocus('skipped')
  await evaluate("document.querySelector('[data-field=single]').focus()");assert.equal(await evaluate("document.querySelectorAll('[data-component-popup]').length"),0);await press('Enter');await expectFocus('singleNext');assert.equal(await evaluate("document.querySelector('[data-field=single]').value"),'تنها گزینه');assert.equal(await evaluate("document.querySelectorAll('[data-component-popup]').length"),0,'single choice selected without opening list');
  console.log('PASS compound value list Enter skips unchecked fields while preserving mouse access')
  await send('Page.navigate',{url:base+'/tests/form-designer.html?personsDemo=1'})
  const shortcutTrigger = "document.querySelector('.person-header-settings button[aria-label=\"میان‌برهای صفحه‌کلید\"]')"
  const shortcutPanel = `document.getElementById((${shortcutTrigger}).getAttribute('aria-controls'))`
  await until(`(${shortcutTrigger})?.getAttribute('aria-expanded')==='false'`,'Persons keyboard settings')
  assert.equal(await evaluate(`${shortcutPanel}.hidden`), true)
  await evaluate(`(${shortcutTrigger}).click()`)
  await until(`(${shortcutTrigger}).getAttribute('aria-expanded')==='true' && !${shortcutPanel}.hidden`,'settings opens')
  assert.equal(await evaluate(`${shortcutPanel}.querySelectorAll('select').length`),4)
  await evaluate(`(${shortcutTrigger}).click()`)
  await until(`(${shortcutTrigger}).getAttribute('aria-expanded')==='false' && ${shortcutPanel}.hidden`,'settings closes')
  console.log('PASS Persons separate keyboard settings retains all shortcut assignments')
  await send('Page.navigate',{url:base+'/tests/form-designer.html?smartLayout=1&language=fa'})
  await until("!!document.querySelector('.laboratory-form-manager')",'design manager')
  await evaluate("document.querySelector('.laboratory-form-manager').click()")
  await clickText('[role=dialog] button','حذف‌شده‌ها (قابل بازیابی)')
  await until("!!document.querySelector('.managed-design-list-return')",'deleted list exit')
  await evaluate("document.querySelector('.managed-design-list-return').click()")
  await until("!document.querySelector('.managed-design-list-return')",'return to active designs')
  console.log('PASS deleted designs view returns to active designs without deleting records')
  assert.deepEqual(errors, [], 'browser must not report uncaught exceptions')
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
