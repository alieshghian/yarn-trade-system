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



 await send('Page.navigate',{url:base+'/tests/zone-batch.html'});
 await until("document.querySelectorAll('.base-grid-table tbody tr').length===2",'existing rows');
 const editorDesign = await evaluate(`(() => {
   const editor = document.querySelector('.zone-editor');
   const fields = [...editor.querySelectorAll('[data-field]')];
   return {
     id: editor.dataset.operationalDesign,
     fields: fields.map(field => field.dataset.field),
     parts: fields.every(field => field.closest('.designer-input-part') &&
       field.closest('.laboratory-designer-field')?.querySelector('.designer-label-part')),
     codeHeight: editor.querySelector('.zone-code').getBoundingClientRect().height
   };
 })()`);
 assert.equal(editorDesign.id, 'operational.warehouse-zones');
 assert.deepEqual(editorDesign.fields, ['code', 'name', 'description', 'isActive'], 'Single-floor view shows the four Zone fields and omits the floor selector');
 assert.ok(editorDesign.parts, 'Zone controls use the shared personal-appearance targets');
 assert.equal(editorDesign.codeHeight, 34, 'Zone rendered geometry follows its section Canvas control height');
 const fill=async(selector,text)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(text)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");
 const key=async(name,vk)=>send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name==='+'?'NumpadAdd':name,windowsVirtualKeyCode:vk});
 await evaluate("[...document.querySelectorAll('.laboratory-footer button')].find(b=>b.textContent.includes('Space')).click()");
 await until("document.querySelector('[data-field=code]').value==='11'",'starting code');
 await fill('[data-field=name]','Zone A');await evaluate("document.querySelector('[data-field=name]').focus()");await key('+',107);
 await until("document.querySelector('.zone-batch-rows output')?.textContent==='1-11'",'first queued code');
 assert.ok(await evaluate("document.activeElement.matches('[data-field=name]')&&document.activeElement.value===''"),'keyboard queues and clears same input');
 await fill('[data-field=name]','Zone B');await evaluate("document.querySelector('.zone-name button').click()");
 await until("document.querySelectorAll('.zone-batch-rows output').length===2&&[...document.querySelectorAll('.zone-batch-rows output')].at(-1).textContent==='1-13'",'skip occupied code 12');
 assert.ok(await evaluate("document.activeElement.matches('[data-field=name]')&&document.activeElement.value===''"),'mouse queues and retains same input');
 await fill('[data-field=name]','Zone A');await key('+',107);
 assert.equal(await evaluate("document.querySelectorAll('.zone-batch-rows li').length"),2,'duplicate queue prevented');
 await fill('[data-field=name]','Zone C');
 assert.ok(await evaluate("(()=>{const i=document.querySelector('[data-field=name]').getBoundingClientRect(),b=document.querySelector('.zone-name button').getBoundingClientRect();return b.left>=i.left&&b.right<=i.right&&Math.abs(b.top-i.top)<12})()"),'plus immediately at physical left of input');
 assert.ok(await evaluate("(()=>{const q=document.querySelector('.zone-batch-popup').getBoundingClientRect(),i=document.querySelector('[data-field=name]').getBoundingClientRect();return Math.abs(q.top-i.bottom-4)<2&&q.right<=i.right+1&&getComputedStyle(document.querySelector('.zone-batch-popup')).position==='fixed'})()"),'queue overlays directly below name without editor reflow');
 const screenshot=await send('Page.captureScreenshot',{format:'png'});await (await import('node:fs/promises')).writeFile('../artifacts/zone-batch-entry.png',Buffer.from(screenshot.data,'base64'));
 assert.equal(await evaluate("document.querySelectorAll('.base-grid-table tbody tr').length"),2,'grid stays visible during entry');
 await key('F3',114);await key('F3',114);
 await until("document.body.innerText.includes('تعارض آزمایشی')",'server rejection');
 assert.equal(await evaluate('window.batchWrites'),1,'pending duplicate submission blocked');
 assert.equal(await evaluate("document.querySelector('[data-field=name]').value"),'Zone C','all drafts retained');
 await until("document.activeElement?.matches('[data-field=name]')",'restore input after rejected save');
 await evaluate("document.querySelector('.zone-name button').click()");
 await until("document.querySelectorAll('.zone-batch-rows li').length===3&&!document.querySelector('.laboratory-footer button').disabled",'empty current input permits queued batch');
 assert.equal(await evaluate("document.querySelector('[data-field=name]').value"),'','current input empty');
 await evaluate('window.batchReject=false');await key('F3',114);
 await until("document.querySelectorAll('.base-grid-table tbody tr').length===5",'all three saved');
 assert.ok(await evaluate("!document.querySelector('.zone-batch-rows')"),'batch editor closes after success');
 assert.ok(await evaluate("document.querySelector('.base-grid-table').textContent.includes('1-14')"),'visible saved codes');
 console.log('PASS zone batch +/keyboard, visible codes skipping occupied, atomic request, pending guard, failure retains drafts, F3 all rows and visible grid');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
