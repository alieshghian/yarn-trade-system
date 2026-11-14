import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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



  await send('Page.navigate',{url:base+'/tests/design-reopen.html?route=yarns'});
  await until("!!document.querySelector('[data-form-document-header]')",'Yarn document header');
  const snapshot=()=>evaluate("(()=>{const h=document.querySelector('[data-form-document-header]'),r=h.getBoundingClientRect();return {title:h.textContent,visible:getComputedStyle(h).display!=='none'&&r.height>0,width:r.width,gear:!!h.querySelector('.form-settings-button'),fields:Array.from(document.querySelectorAll('.laboratory-form-grid [data-field-id]')).map(e=>e.dataset.fieldId)}})()");
  const geometry=()=>evaluate("(()=>{const h=document.querySelector('[data-form-document-header]'),b=h.querySelector('button'),f=document.querySelector('.base-form-footer'),s=document.querySelector('.base-form-shell'),r=document.querySelector('.laboratory-form-frame');const rect=e=>e?{top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}:null;return {gear:rect(b),header:rect(h),footer:rect(f),shell:rect(s),frame:rect(r),actions:f?.querySelectorAll('[data-action-id]').length}})()");
  const designGeometry=await geometry();assert.ok(designGeometry.gear.width<=40,'settings is a compact icon');assert.ok(designGeometry.actions>0,'footer actions exist');
  const before=await snapshot();assert.ok(before.title.includes('تعریف نخ'));assert.ok(before.gear);assert.ok(before.visible);
  await evaluate("document.querySelector('.laboratory-operational-preview-toggle').click()");
  const previewGeometry=await geometry();assert.ok(previewGeometry.gear.width<=40);assert.ok(previewGeometry.footer.bottom<=previewGeometry.frame.bottom+1,'preview must contain the complete footer');assert.equal(previewGeometry.actions,designGeometry.actions);assert.equal(previewGeometry.footer.height,designGeometry.footer.height);
  const preview=await snapshot();assert.ok(preview.visible);assert.ok(preview.gear);assert.equal(preview.width,before.width);assert.deepEqual(preview.fields,before.fields);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/yarn-footer-preview.png',Buffer.from(screenshot.data,'base64'));
  await evaluate("document.querySelector('[data-form-document-header] .form-settings-button').click()");
  await until("document.querySelector('[data-form-document-header] .form-settings-button').getAttribute('aria-expanded')==='true'",'Header settings action');
  await evaluate("document.querySelector('.laboratory-operational-preview-toggle').click()");
  const restoredGeometry=await geometry();assert.ok(restoredGeometry.footer.bottom<=restoredGeometry.frame.bottom+1,'return to design retains footer');
  for(let i=0;i<3;i++){
    await evaluate("document.querySelector('.laboratory-operational-preview-toggle').click()");
    const g=await geometry();assert.ok(g.footer.bottom<=g.frame.bottom+1);assert.equal(g.actions,designGeometry.actions);assert.ok(g.gear.width<=40);
    await evaluate("document.querySelector('.laboratory-operational-preview-toggle').click()");
  }
  await send('Page.reload');await until("performance.getEntriesByType('navigation')[0]?.type==='reload' && document.readyState==='complete'",'Reload completed');await until("!!document.querySelector('[data-form-document-header]')",'Header after reopen');
  assert.ok((await snapshot()).visible);assert.ok((await snapshot()).title.includes('تعریف نخ'));
  assert.deepEqual(errors,[]);
  console.log('PASS yarn redesign: compact settings, complete footer in design/preview/return/reload, repeated preview; field identity retained');
} catch(error){console.error(error);console.error(errors);process.exitCode=1}
finally{
 socket?.close();browser.kill();await new Promise(done=>browser.exitCode!==null?done():browser.once('exit',done));assert.ok(profile.startsWith(temporaryRoot+sep));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
