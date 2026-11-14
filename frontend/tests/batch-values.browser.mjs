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
    while (Date.now() < deadline) { if (await evaluate("Boolean("+expression+")")) return; await pause(100) }
    throw new Error('Timed out: ' + label + '\n' + await evaluate('document.body.innerText.slice(0,1500)'))
  }




 await send('Page.navigate',{url:base+'/tests/batch-values.html'});
 await until("document.querySelector('[data-library] option[value=\"base-form.batch-values\"]')",'library component registered');
 const setValue=async value=>evaluate("(()=>{const e=[...document.querySelectorAll('.new-number-row textarea')].at(-1);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");
 const key=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='F3'?114:key==='Escape'?27:0});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='F3'?114:key==='Escape'?27:0});};
 await evaluate("document.querySelector('.number-add-button').click()");await until("document.querySelector('.new-number-row textarea')",'entry opens');
 for(const v of ['110','120','130']){await setValue(v);await key('+');await pause(80);}
 assert.equal(await evaluate("document.activeElement.value"),'140');assert.deepEqual(await evaluate("[document.activeElement.selectionStart,document.activeElement.selectionEnd]"),[0,3]);
 await setValue('150');await key('F3');await until("JSON.parse(document.querySelector('[data-items]').textContent).length===4",'batch committed');
 const items=await evaluate("JSON.parse(document.querySelector('[data-items]').textContent)");assert.deepEqual(items.map(i=>i.value),['110','120','130','150']);assert.equal(new Set(items.map(i=>i.id)).size,4);
 await evaluate("document.querySelector('.number-add-button').click()");await until("document.querySelector('.new-number-row textarea')",'reopen');await setValue('۱۱۰');await key('F3');await pause(100);assert.ok(await evaluate("!!document.querySelector('[data-component-popup]')"));assert.equal(await evaluate("JSON.parse(document.querySelector('[data-items]').textContent).length"),4);
 await key('Escape');await until("!document.querySelector('[data-component-popup]')",'cancel discards duplicate');
 await evaluate("document.querySelector('.number-add-button').click()");await until("document.querySelector('.new-number-row textarea')",'third open');await setValue('160');await evaluate('window.rejectBatch=true');await key('F3');await until("document.querySelector('[role=alert]')?.textContent.includes('خطای آزمایشی')",'rejection retains editor');assert.equal(await evaluate("document.querySelector('.new-number-row textarea').value"),'160');await evaluate('window.rejectBatch=false');await key('F3');await until("JSON.parse(document.querySelector('[data-items]').textContent).length===5",'retry commits once');
 assert.deepEqual((await evaluate("JSON.parse(document.querySelector('[data-items]').textContent)")).slice(0,4).map(i=>i.id),items.map(i=>i.id));
 assert.deepEqual(errors,[]);console.log('PASS registered batch colors, plus keyboard, selected pattern, override, atomic F3, hidden stable IDs, duplicate rejection, cancel and failed-save retry');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



