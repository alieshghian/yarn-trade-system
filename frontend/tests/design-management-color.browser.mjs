import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

// Run against `npm run preview`; the browser profile and workspace are disposable.
const base = process.env.APP_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER')
const temporaryRoot = resolve(tmpdir())
const profile = resolve(await mkdtemp(join(temporaryRoot, 'yarn-lazy-test-')))
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
    if (data.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true});
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

  await send('Page.navigate',{url:base+'/tests/design-management-color.html'});
  await until("document.querySelectorAll('article').length===2",'Design list loaded');
  const click=async text=>{await evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+JSON.stringify(text)+");if(!b)throw Error('Missing button');b.click()})()");await pause(80)};
  assert.ok(await evaluate("document.querySelector('article').textContent.includes('بازبینی: 7')"));
  assert.ok(await evaluate("document.querySelector('article').textContent.includes('آخرین ویرایش:')"));
  await until("!!document.querySelector('.pending-form-design-menu [data-form-id=one]')",'Pending release visible');
  await click('بایگانی');
  assert.equal(await evaluate("!!document.querySelector('.pending-form-design-menu [data-form-id=one]')"),false);
  assert.equal(await evaluate("document.querySelectorAll('article').length"),1);
  await click('بایگانی‌شده‌ها');
  assert.ok(await evaluate("document.querySelector('article').textContent.includes('one')"));
  await click('بازگردانی به فهرست طراحی');await click('فرم‌های طراحی');
  assert.equal(await evaluate("document.querySelectorAll('article').length"),2);
  assert.ok(await evaluate("!!document.querySelector('.pending-form-design-menu [data-form-id=one]')"));
  await click('حذف از فهرست');await click('حذف‌شده‌ها (قابل بازیابی)');
  assert.equal(await evaluate("document.querySelectorAll('article').length"),1);
  await send('Page.reload');
  await until("document.querySelectorAll('article').length===1",'Lifecycle survives reload');
  await click('حذف‌شده‌ها (قابل بازیابی)');await click('بازگردانی به فهرست طراحی');await click('فرم‌های طراحی');
  assert.equal(await evaluate("document.querySelectorAll('article').length"),2);
  await evaluate("document.querySelector('.excel-color-trigger').click()");
  await until("!!document.querySelector('.excel-more-colors')",'Color menu');
  await evaluate("document.querySelector('.excel-more-colors').click()");
  await until("!!document.querySelector('.excel-color-dialog-backdrop')",'More colors');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.excel-color-dialog-backdrop')).backgroundColor"),'rgba(0, 0, 0, 0)');
  const before=await evaluate("(()=>{const r=document.querySelector('.excel-color-dialog').getBoundingClientRect();return {x:r.x,y:r.y}})()");
  const point=await evaluate("(()=>{const r=document.querySelector('.excel-color-dialog-heading strong').getBoundingClientRect();return {x:r.x+20,y:r.y+10}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x-65,y:point.y+45,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x-65,y:point.y+45,button:'left'});
  assert.ok(await evaluate("Math.abs(document.querySelector('.excel-color-dialog').getBoundingClientRect().y-"+before.y+")>20"),'Color palette is draggable');
  await evaluate("document.querySelector('.excel-color-dialog-heading button[aria-label=بستن]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.excel-color-dialog-backdrop').length"),0);
  assert.deepEqual(errors,[]);
  console.log('PASS actual design list archive/remove/restore/reload; More Colors transparent backdrop, drag and close');
} catch(error){console.error(error);process.exitCode=1}
finally{
 socket?.close();browser.kill();await new Promise(done=>browser.exitCode!==null?done():browser.once('exit',done));assert.ok(profile.startsWith(temporaryRoot+sep));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}

