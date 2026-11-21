import assert from 'node:assert/strict'
import { connectChromeDevTools } from './chrome-devtools.mjs'
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
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let socket, session, sequence = 0
const pending = new Map(), errors = []
const pause = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

try {
  socket = await connectChromeDevTools(browser, profile, executable)
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
    while (Date.now() < deadline) { if (await evaluate("Boolean("+expression+")")) return; await pause(100) }
    throw new Error('Timed out: ' + label + '\n' + await evaluate("JSON.stringify({popup:document.querySelector('[data-component-popup]')?.innerText,rows:[...document.querySelectorAll('.new-number-row textarea')].map(e=>({value:e.value,error:e.validationMessage})),display:document.querySelector('[data-field-id=colors] textarea')?.value})"))
  }






 await send('Page.navigate',{url:base+'/tests/form-designer.html?permissionRuntime'});await until("document.querySelector('[data-managed-form-id]')",'managed form');
 const click=expression=>evaluate(expression+'.click()');
 await click("[...document.querySelectorAll('button')].find(b=>b.textContent==='ورود اطلاعات آزمایشی')");await click("document.querySelector('[data-runtime-action=create]')");await until("document.querySelector('[data-laboratory-test-role] select')",'role selector');assert.equal(await evaluate("document.querySelector('[data-laboratory-test-role] select').value"),'admin');
 await click("document.querySelector('[data-field-id=colors] .number-add-button')");await until("document.querySelector('.new-number-row textarea')",'admin add input');assert.equal(await evaluate("document.querySelector('[data-component-popup]').dataset.componentRole"),'admin');
 const fill=async(index,value)=>evaluate("(()=>{const e=document.querySelectorAll('.new-number-row textarea')["+index+"];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await fill(0,'ریسندگی');await click("document.querySelector('.new-number-row .number-row-add')");await fill(1,'ذوب ریسی');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F3',code:'F3',windowsVirtualKeyCode:114});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F3',code:'F3',windowsVirtualKeyCode:114});await until("!document.querySelector('[data-component-popup]')",'administrator commit with admin-only permissions');
 await click("document.querySelector('[data-field-id=colors] .number-add-button')");await until("document.querySelector('.new-number-row textarea')",'reopen existing title list');await fill(0,'ذوب ریسی');await click("document.querySelector('.number-confirm')");await until("document.querySelector('[data-component-popup] [role=alert]')?.textContent.includes('قبلاً')",'precise duplicate message');assert.equal(await evaluate("document.querySelector('.new-number-row textarea').value"),'ذوب ریسی');await fill(0,'ریس اصلاح‌شده');assert.equal(await evaluate("document.querySelector('.new-number-row textarea').validationMessage"),'','correcting duplicate clears native validity');await click("document.querySelector('.number-confirm')");await until("!document.querySelector('[data-component-popup]')",'corrected title saves on first retry');
 await evaluate("(()=>{const e=document.querySelector('[data-laboratory-test-role] select');e.value='user';e.dispatchEvent(new Event('change',{bubbles:true}))})()");await until("document.querySelector('[data-test-actor-role=user]')",'user role');assert.equal(await evaluate("document.querySelectorAll('[data-field-id=colors] .number-add-button').length"),0,'add trigger hidden from user');
 await click("document.querySelector('[data-field-id=colors] .number-chevron')");await until("document.querySelector('[data-component-popup]')",'user browsing');assert.equal(await evaluate("document.querySelectorAll('[data-component-popup] .number-row-add,[data-component-popup] .number-row-edit,[data-component-popup] .number-row-remove,[data-component-popup] .new-number-row').length"),0,'no forbidden actions or entry rows');assert.ok(await evaluate("[...document.querySelectorAll('[data-component-popup] .person-number-row textarea')].every(e=>e.readOnly)"),'user cannot type into existing definitions');
 await evaluate("(()=>{const e=document.querySelector('.component-choice-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'ذوب');e.dispatchEvent(new Event('input',{bubbles:true}))})()");await until("document.querySelectorAll('[data-component-popup] .person-number-row').length===1",'search allowed');await click("document.querySelector('[data-component-popup] .person-primary')");await click("document.querySelector('.number-confirm')");await until("!document.querySelector('[data-component-popup]')",'user changes default');assert.ok(await evaluate("document.querySelector('[data-field-id=colors] .person-number-control textarea').value.includes('ذوب')"));
 assert.deepEqual(errors,[]);console.log('PASS actual Laboratory role selector; admin-only creation/F3; user search/default without add/edit/delete or editable definition inputs');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



