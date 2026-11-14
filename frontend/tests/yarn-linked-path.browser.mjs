import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    const result = await send('Runtime.evaluate', { expression: '{'+expression+'}', returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async (expression, label) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) { if (await evaluate("Boolean("+expression+")")) return; await pause(100) }
    throw new Error('Timed out: ' + label + '\n' + await evaluate('document.body.innerText.slice(0,1500)'))
  }







 await send('Page.navigate',{url:base+'/tests/approved-yarns.html'});await until("document.querySelectorAll('tbody tr[data-row-index]').length===2",'loaded');
 await evaluate("document.querySelector('tbody tr[data-row-index]').click()");await until("document.querySelector('[data-field=name]').value==='DTY'",'selected');
 await evaluate("[...document.querySelectorAll('.laboratory-footer button')].find(b=>b.textContent.includes('ویرایش')).click()");
 await evaluate("document.querySelector('[data-field-id=yarnGroup] .number-chevron').focus();document.querySelector('[data-field-id=yarnGroup] .number-chevron').click()");await until("document.querySelector('.component-choice-search')",'lookup');
 await evaluate("document.querySelector('.component-choice-search').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Insert',code:'Insert',windowsVirtualKeyCode:45});
 await pause(1200);
 console.log('INSERT_STATE',await evaluate("JSON.stringify({creating:!!document.querySelector('.system-lookup-create-dialog'),popups:document.querySelectorAll('.person-number-list').length,focus:document.activeElement.outerHTML.slice(0,180)})"));
 assert.equal(await evaluate("!!document.querySelector('.system-lookup-create-dialog')"),true,'Insert opens the actual source form');
 await until("document.querySelector('.system-lookup-create-dialog .cascading-tree-inline-add input')",'group creation');
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/yarn-operational-integration/linked-group-after.png',Buffer.from(shot.data,'base64'));
 const geometry=await evaluate("[...document.querySelectorAll('.system-lookup-create-dialog .cascading-tree-search')].map(n=>n.getBoundingClientRect().height)");
 assert.ok(geometry.length>=5&&geometry.every(h=>h===34),'all nested column searches retain standard 34px height');
 assert.equal(await evaluate("document.querySelector('.system-lookup-create-dialog .cascading-tree-inline-add input').getBoundingClientRect().height"),30,'inline editor retains 30px height');
 await evaluate("[...document.querySelectorAll('.system-lookup-create-dialog button')].find(b=>b.textContent.includes('انصراف')).click()");
 await evaluate("window.confirm=()=>true;document.querySelector('.form-document-dialog-close').click()").catch(async()=>{await evaluate("document.querySelector('.form-document-dialog header button').click()")});
 await until("!document.querySelector('.system-lookup-create-dialog')",'source closed');
 assert.equal(await evaluate("document.querySelector('[data-field=name]').value"),'DTY','parent draft survives cancellation');
 await evaluate("const n=document.querySelector('[data-field=countValue]');n.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'30');n.dispatchEvent(new Event('input',{bubbles:true}))");
 await until("document.querySelector('.numeric-field-suggestions [role=option]')",'saved numeric suggestions');
 assert.equal(await evaluate("document.querySelector('.numeric-field-suggestions [role=option]').textContent"),'300');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until("document.querySelector('[data-field=countValue]').value==='300'",'numeric selection');
 await evaluate("document.querySelector('[data-field-id=yarnGroup] .number-chevron').click()");
 await until("document.querySelector('.component-choice-search')",'lookup reopened');
 const fills=await evaluate("[...document.querySelectorAll('[data-field-id=yarnGroup] .person-number-control, [data-field-id=yarnGroup] .person-number-control>textarea, [data-field-id=yarnGroup] .number-chevron')].map(n=>getComputedStyle(n).backgroundColor)");console.log('FOCUS_FILLS',fills,await evaluate("document.querySelector('[data-field-id=yarnGroup] .designer-input-part').outerHTML.slice(0,700)"));assert.ok(fills.length>=3&&fills.every(v=>v===fills[0]),'whole composite focus fill is uniform');
 const rect=await evaluate("document.querySelector('.person-number-list').getBoundingClientRect().toJSON()");
 async function search(value){await evaluate("const n=document.querySelector('.component-choice-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}))")}
 await search('slow');await pause(170);await search('latest');await pause(650);
 assert.ok(await evaluate("document.querySelector('.person-number-list').textContent.includes('latest')"),'latest query wins');
 const after=await evaluate("document.querySelector('.person-number-list').getBoundingClientRect().toJSON()");
 assert.equal(after.width,rect.width,'search does not resize popup width');assert.equal(after.height,rect.height,'search does not resize popup height');
 assert.equal(await evaluate("document.activeElement.className"),'component-choice-search','typing focus retained');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Unidentified',code:'Insert',windowsVirtualKeyCode:45});
 await until("document.querySelector('.system-lookup-create-dialog .cascading-tree-inline-add input')",'physical Insert after asynchronous query');
 console.log('PASS linked source Insert, nested geometry, cancellation, numeric suggestion, stale response, stable popup/focus');

} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



