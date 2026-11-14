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




 const click=async text=>{await until("[...document.querySelectorAll('button')].some(e=>e.getClientRects().length&&e.textContent.trim()==="+JSON.stringify(text)+")",text);await evaluate("[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()==="+JSON.stringify(text)+").click()")};
 await send('Page.navigate',{url:base+'/tests/form-designer.html?batchRuntime'});await until("document.querySelector('[data-managed-form-id]')",'managed batch form');await evaluate("document.querySelector('.laboratory-management-sticky button')?.click()");await click('ورود اطلاعات آزمایشی');await until("document.querySelector('[data-runtime-action=create]')",'runtime view');await evaluate("document.querySelector('[data-runtime-action=create]').click()");await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='create'",'create');
 assert.ok(!await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('پیشنهاد شمارهٔ بعدی'))"));const code=await evaluate("document.querySelector('[data-field-id=personCode] input').value");assert.ok(code);
 await evaluate("document.querySelector('[data-field-id=colors] .number-add-button').click()");await until("document.querySelector('.new-number-row textarea')",'batch editor');
 for(let i=0;i<20;i++){await evaluate("(()=>{const e=[...document.querySelectorAll('.new-number-row textarea')].at(-1);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(String(1100+i*100))+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");if(i<19){await evaluate("[...document.querySelectorAll('.new-number-row .number-row-add')].at(-1).click()");await pause(30);}}
 await until("document.querySelector('[data-batch-count]')?.textContent.includes('20')",'twenty staged');assert.ok(await evaluate("document.querySelector('.number-confirm').textContent.includes('ثبت گروهی')"));await evaluate("document.querySelector('.number-confirm').click()");await until("!document.querySelector('[data-component-popup]')",'component stage accepted');assert.equal(await evaluate("document.querySelector('[data-runtime-mode]').dataset.runtimeMode"),'create');await evaluate("document.querySelector('[data-runtime-action=save]').click()");await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='view'",'parent save');
 await until("document.querySelectorAll('tbody tr[data-row-index]').length===20",'twenty report variants');assert.ok(await evaluate("[...document.querySelectorAll('tbody tr[data-row-index]')].every(r=>r.textContent.includes("+JSON.stringify(code)+"))"));await evaluate("document.querySelector('tbody tr[data-row-index=\"3\"]').click()");await until("document.querySelector('[data-field-id=colors] textarea')?.value==='1400'",'row binds selected color and master');
 await evaluate("document.querySelector('[data-field-id=colors] .number-chevron').click()");await until("document.querySelector('[data-batch-count]')?.textContent.includes('20')",'view exposes all saved colors');assert.ok(!await evaluate("!!document.querySelector('[data-component-popup] .number-confirm')"));await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until("!document.querySelector('[data-component-popup]')",'view popup closes');

 await evaluate("document.querySelector('.form-runtime-banner > button').click()");await until("!document.querySelector('[data-runtime-mode]')",'return to design');
 assert.equal(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length"),20);
 assert.ok(await evaluate("[...document.querySelectorAll('tbody tr[data-row-index]')].some(r=>r.textContent.includes('1400'))"));
 assert.equal(await evaluate("document.querySelectorAll('[data-field-id=colors] .designer-input-sample').length"),0);
 assert.ok(await evaluate("document.querySelector('[data-field-id=colors] textarea').value.length>0"));
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='ورود اطلاعات آزمایشی').click()");await until("document.querySelector('[data-runtime-mode]')",'resume test');
 await evaluate("document.querySelector('[data-runtime-action=create]').click()");await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='create'",'next master');assert.equal(await evaluate("document.querySelector('[data-field-id=colors] textarea').value"),'');assert.equal(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length"),20);assert.deepEqual(errors,[]);console.log('PASS actual Laboratory: 20 colors, one master code, group count/F3, visible grid variants, row-to-color binding, view-only browsing, no code suggestion button, placeholder overlap, lost report on design return or cross-master leakage');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



