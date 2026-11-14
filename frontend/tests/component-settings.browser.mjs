import {revealMenuExpression} from './form-context-navigation.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'

// No new dependency. A fresh headless browser owns only this disposable profile.
const base = process.env.FORM_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER; browser checks must not silently skip')
const profile = await mkdtemp(join(tmpdir(), 'yarn-form-regression-'))
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1900,1300', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] })
let socket, session, sequence = 0, navigationLoaded,expectedDialog=false
const pending = new Map(), errors = [], results = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  const endpoint = await new Promise((resolve, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools: ' + logs)), 15000)
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome startup exited ' + code + ': ' + logs)) })
    browser.once('error', reject)
    browser.stderr.on('data', chunk => { logs += String(chunk); const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if(data.method==='Page.loadEventFired')navigationLoaded?.()
    if(data.method==='Page.javascriptDialogOpening'){const accept=expectedDialog;expectedDialog=false;if(!accept)errors.push('Unexpected browser dialog: '+data.params.message);void send('Page.handleJavaScriptDialog',{accept})}
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text)
    const call = pending.get(data.id)
    if (call) { pending.delete(data.id); data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result) }
  })
  const send = (method, params = {}, browserLevel = false) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 20000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId:session } : {}) }))
  })
  const loadedNavigation=async(method,params={})=>{
    let timer
    const loaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('New document did not finish loading: '+method)),20000);navigationLoaded=resolve})
    try{await send(method,params);await loaded}finally{clearTimeout(timer);navigationLoaded=undefined}
  }
  const reloadPage=()=>loadedNavigation('Page.reload')
  const navigatePage=params=>loadedNavigation('Page.navigate',params)
  const target = await send('Target.createTarget', { url:'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId:target.targetId, flatten:true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true })
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result.value
  }
  const until = async (expression, label = expression) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100) }
    console.error('DOM_DIAGNOSTIC', await evaluate("JSON.stringify({fields:[...document.querySelectorAll('[data-field-id]')].map(e=>[e.dataset.fieldId,e.closest('.laboratory-form-frame')!==null]),body:document.body.textContent.slice(-2500)})"), errors)
    throw new Error('Browser assertion timed out: ' + label)
  }
  const node = (text, selector = 'button') => `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.getClientRects().length && (e.getAttribute('aria-label')===${JSON.stringify(text)} || e.textContent.trim()===${JSON.stringify(text)}))`
  const clickExpression = async (expression, button = 'left', modifiers=0) => {
    await revealMenuExpression(expression,{evaluate,send,pause})
    await until(`!!(${expression})`, expression)
    const point = await evaluate(`(async()=>{const e=${expression};e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const current=${expression};const r=current.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', ...point })
    await send('Input.dispatchMouseEvent', { type:'mousePressed', ...point, button, modifiers, clickCount:1 })
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', ...point, button, modifiers, clickCount:1 })
    await pause(100)
  }
  const click = (text, selector) => clickExpression(node(text, selector))
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); results.push(name); console.log('PASS ' + name) }
  const field = id => `document.querySelector('.laboratory-form-frame [data-field-id="${id}"]')`
  const count = () => evaluate(`document.querySelectorAll('.laboratory-form-frame [data-field-id]').length`)
  const mode = expected => until(`document.querySelector('[data-form-design-mode]')?.dataset.formDesignMode===${JSON.stringify(expected)}`)
  const menu = text => node(text, '[role="menu"] button')
  const layout = `(()=>{const grid=document.querySelector('.laboratory-form-grid');const ids=['personCode','titleId','firstName','lastName','jobId'];return {display:getComputedStyle(grid).display,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,fields:ids.map(id=>{const e=document.querySelector('.laboratory-form-frame [data-field-id="'+id+'"]');const r=e.getBoundingClientRect();return {id,x:r.x-grid.getBoundingClientRect().x,y:r.y-grid.getBoundingClientRect().y,w:r.width,h:r.height}})}})()`
  const selectValue=async(expression,value)=>{
    await until(`!!(${expression})`)
    await evaluate(`(()=>{const e=${expression};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(120)
  }
  const inputValue=async(expression,value)=>{
    await clickExpression(expression)
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,commands:['selectAll']})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2})
    await send('Input.insertText',{text:String(value)});await pause(120)
  }
  const sendKey=async(key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});await pause(140)}
  await navigatePage({url:base+'/tests/component-settings.html'});
  await until("!!document.querySelector('.system-lookup')")
  const lookup=`document.querySelector('.system-lookup')`
  const popup=`document.querySelector('[data-component-popup]')`
  const search=`document.querySelector('[data-component-popup] .component-choice-search')`
  const open=async()=>{await clickExpression(lookup+`.querySelector('.number-chevron')`);await until(`!!${popup}`);await until(`${popup}.querySelectorAll('.person-number-row').length>0`)}
  const close=async()=>{if(await evaluate(`!!${popup}`))await click('انصراف (Esc)')}
  await open()
  await check('ordinary user can search but cannot create',`!!${search}&&!${popup}.querySelector('.number-actions>.number-row-add')`)
  await clickExpression(search);await sendKey('Insert')
  await check('Insert respects create permissions',`!document.querySelector('.lookup-sample-create')`)
  await inputValue(search,'۱۲۳ کیان')
  await until(`${popup}.querySelectorAll('.person-number-row').length===1&&${popup}.textContent.includes('كيان')`)
  await clickExpression(popup+`.querySelector('.person-number-row textarea')`)
  await until(`document.querySelector('[data-selected-id]').textContent==='row1'`)
  await check('lookup stores stable ID and displays code/name',`${lookup}.querySelector('[data-field]').value.includes('C001')`)
  await open();await click('بدون انتخاب');await check('empty selection clears actual ID',`document.querySelector('[data-selected-id]').textContent===''`)
  await open();await until(`${popup}.querySelectorAll('.person-number-row').length===40`);await click('نتایج بیشتر');await until(`${popup}.querySelectorAll('.person-number-row').length===80`);await close()
  await selectValue(`document.querySelector('[aria-label="Role"]')`,'admin')
  await open();await click('افزودن مورد')
  await until(`!!document.querySelector('.lookup-sample-create')`)
  await inputValue(`document.querySelector('[aria-label="کد آزمایشی تعریف"]')`,'NEW1')
  await inputValue(`document.querySelector('[aria-label="نام آزمایشی تعریف"]')`,'Created record')
  await click('ثبت');await until(`!document.querySelector('.lookup-sample-create')&&!!document.querySelector('[data-selected-id]').textContent`)
  await check('successful save returns and selects created record',`${lookup}.querySelector('[data-field]').value.includes('Created record')`)
  const selected=await evaluate(`document.querySelector('[data-selected-id]').textContent`)
  await clickExpression(lookup+`.querySelector('[data-field]')`);await sendKey('Shift')
  await check('Shift alone does not open the source form',`!document.querySelector('.lookup-sample-create')`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Insert',code:'Insert',modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Insert',code:'Insert',modifiers:8});await pause(140)
  await check('Shift+Insert remains a paste shortcut, not source creation',`!document.querySelector('.lookup-sample-create')`)
  await clickExpression(lookup+`.querySelector('[data-field]')`);await sendKey('Insert');await until(`!!document.querySelector('.lookup-sample-create')`)
  await check('Insert opens the source form in create mode',`!!document.querySelector('.lookup-sample-create')`)
  await click('انصراف');await check('cancel preserves previous selection',`document.querySelector('[data-selected-id]').textContent===${JSON.stringify(selected)}`)
  await selectValue(`document.querySelector('[aria-label="Return"]')`,'selectAfterSave')
  await clickExpression(lookup+`.querySelector('[data-field]')`);await sendKey('+');await until(`!!document.querySelector('.lookup-sample-create')`)
  await inputValue(`document.querySelector('[aria-label="کد آزمایشی تعریف"]')`,'NEW2');await inputValue(`document.querySelector('[aria-label="نام آزمایشی تعریف"]')`,'Explicit record');await click('ثبت')
  await until(`!!document.querySelector('.lookup-saved-record')`);await check('explicit return waits for selection',`document.querySelector('[data-selected-id]').textContent===${JSON.stringify(selected)}`)
  await click('انتخاب و بازگشت');await check('explicit selection returns the new record',`${lookup}.querySelector('[data-field]').value.includes('Explicit record')`)
  await open();await inputValue(search,'slow');await pause(250);await inputValue(search,'C002');await until(`${popup}.querySelectorAll('.person-number-row').length===1&&${popup}.textContent.includes('C002')`);await pause(700);await check('late search response never replaces latest results',`${popup}.textContent.includes('C002')&&!${popup}.textContent.includes('C001')`)
  await inputValue(search,'fail');await until(`${popup}.textContent.includes('Test search failed')`);await check('search failure is visible with retry',`${popup}.textContent.includes('تلاش دوباره')`);await inputValue(search,'C003');await until(`${popup}.textContent.includes('C003')`);await close()
  await clickExpression(`document.querySelector('[data-field="local"]')`);await until(`!!${popup}`);await inputValue(search,'کیان 123');await until(`${popup}.querySelectorAll('.person-number-row').length===1`);await click('بدون انتخاب');await check('local lists clear independently without changing lookup',`document.querySelector('[data-local-value]').textContent===''&&${lookup}.querySelector('[data-field]').value.includes('Explicit record')`)
  await selectValue(`document.querySelector('[aria-label="Placement"]')`,'inside');await check('inside add placement has no visible external plus',`!!${lookup}.querySelector('.component-inline-add')&&![...${lookup}.querySelectorAll('.number-add-button')].some(e=>e.getClientRects().length)`)
  await clickExpression(lookup+`.querySelector('.component-inline-add')`);await until(`!!document.querySelector('.lookup-sample-create')`);await click('انصراف');await check('inside plus opens creation and cancel preserves lookup selection',`document.querySelector('[data-selected-id]').textContent!==''&&!document.querySelector('.lookup-sample-create')`)
  assert.deepEqual(errors,[],'no browser exceptions or operational requests');console.log(JSON.stringify({passed:results.length,results},null,2))

} catch(error) {
  console.error('BROWSER_ERRORS',errors)
  console.error(error)
  process.exitCode=1
} finally {
  socket?.close(); browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()), 'cleanup stays inside its own temporary directory')
  assert.ok(basename(profile).startsWith('yarn-form-regression-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
