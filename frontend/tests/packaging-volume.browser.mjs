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





 await send('Page.navigate',{url:base+'/tests/packaging-volume.html'});await until("document.querySelector('[data-packaging-volume] .number-add-button')",'shared packaging list');
 const click=expr=>evaluate(expr+'.click()');
 const fill=async(label,value,index=0)=>evaluate("(()=>{const e=[...document.querySelectorAll('input[aria-label='+"+JSON.stringify(JSON.stringify(label))+"+']')]["+index+"];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-packaging-volume] .person-number-control textarea')).backgroundColor"),await evaluate("getComputedStyle(document.querySelector('[data-title-standard] .person-number-control textarea')).backgroundColor"));
 await click("document.querySelector('[data-packaging-volume] .number-add-button')");await until("document.querySelectorAll('.new-number-row .number-pair-inputs input').length===2",'two shared entry slots');assert.equal(await evaluate("document.querySelectorAll('.form-document-dialog').length"),0);
 const pairGeometry=await evaluate("(()=>{const inputs=[...document.querySelectorAll('.new-number-row .number-pair-inputs input')];return inputs.map(e=>{const r=e.getBoundingClientRect();return{width:r.width,x:r.left+r.width/2,y:r.top+r.height/2,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e}})})()");assert.ok(pairGeometry.every(r=>r.width>=55&&r.hit),'both paired inputs must be usable at a narrow 220px host');
 const compact=await evaluate("document.querySelector('[data-component-popup]').getBoundingClientRect().width");assert.ok(compact<300,'compact paired popup follows 220px field instead of the old fixed 420px minimum');assert.ok(pairGeometry[0].width<175,'packaging name uses less than half its previous 350px width');
 await evaluate("document.querySelector('[data-packaging-volume]').parentElement.style.width='320px'");await until("document.querySelector('[data-component-popup]').getBoundingClientRect().width>350",'popup grows with main field');await evaluate("document.querySelector('[data-packaging-volume]').parentElement.style.width='220px'");await until("document.querySelector('[data-component-popup]').getBoundingClientRect().width<300",'popup shrinks with main field');
 for (const [index, value] of [[0, 'پالت'], [1, '1.5']]) {
   const input = `document.querySelectorAll('.new-number-row .number-pair-inputs input')[${index}]`
   await until(`(()=>{const e=${input};const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e})()`, 'paired input hit target after resize')
   const point = await evaluate(`(()=>{const r=${input}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
   await send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1})
   await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1})
   await until(`document.activeElement===${input}`, 'physical click focuses the intended packaging input')
   await send('Input.insertText', {text:value})
   assert.equal(await evaluate(`${input}.value`), value, 'physical keyboard input reaches its own packaging field')
 }
 assert.equal(await evaluate("document.querySelector('.number-pair-inputs input').value"),'پالت','real pointer and keyboard type in packaging input');
 const initialPopup=await evaluate("(()=>{const r=document.querySelector('[data-component-popup]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()");
 const grip=await evaluate("(()=>{const r=document.querySelector('[data-popup-resize=left]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...grip,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x-140,y:grip.y+100,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x-140,y:grip.y+100,button:'left',clickCount:1});
 await until("document.querySelector('[data-component-popup]').getBoundingClientRect().width>="+(initialPopup.width+130),'popup resize');
 const resizedWidth=await evaluate("document.querySelector('[data-component-popup]').getBoundingClientRect().width");
 await click("document.querySelector('.new-number-row .number-row-add')");await pause(70);await fill('نوع بسته‌بندی','کارتن',1);await fill('CBM هر تن','2',1);await click("document.querySelectorAll('.new-number-row .person-primary')[1]");
 const color=await evaluate("getComputedStyle(document.querySelector('.number-confirm')).backgroundColor");const buttonBox=await evaluate("(()=>{const r=document.querySelector('.number-confirm').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await send('Input.dispatchMouseEvent',{type:'mouseMoved',...buttonBox});assert.equal(await evaluate("getComputedStyle(document.querySelector('.number-confirm')).backgroundColor"),color);
 await evaluate("window.rejectPackaging=true");await click("document.querySelector('.number-confirm')");await until("document.querySelector('[data-component-popup] [role=alert]')",'failed commit preserved');assert.equal(await evaluate("document.querySelectorAll('.new-number-row').length"),2);
 await evaluate("window.rejectPackaging=false");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F3',code:'F3',windowsVirtualKeyCode:114});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F3',code:'F3',windowsVirtualKeyCode:114});await until("!document.querySelector('[data-component-popup]')",'shared F3 save');
 const records=await evaluate("JSON.parse(document.querySelector('[data-records]').textContent)");assert.equal(records.a.length,2);assert.equal(records.a[0].cbmPerTon,1.5);assert.equal(records.a[1].isDefault,true);assert.ok(await evaluate("document.querySelector('[data-packaging-volume] textarea').value.includes('کارتن')"));
 const fieldBefore=await evaluate("(()=>{const r=document.querySelector('[data-packaging-volume]').getBoundingClientRect();return {width:r.width,height:r.height}})()");assert.equal(await evaluate("document.querySelector('[data-packaging-volume] textarea').value"),'کارتن — 2');assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-packaging-volume] textarea')).whiteSpace"),'nowrap');
 await click("document.querySelector('[data-packaging-volume] .number-add-button')");await until("document.querySelector('.new-number-row')",'edit saved coefficient');await fill('CBM هر تن','0',1);await click("document.querySelector('.number-confirm')");await until("document.querySelector('[role=alert]')?.textContent.includes('صفر')",'invalid coefficient rejected');await fill('CBM هر تن','۲٫۷۴',1);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F3',code:'F3',windowsVirtualKeyCode:114});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F3',code:'F3',windowsVirtualKeyCode:114});await until("!document.querySelector('[data-component-popup]')",'corrected existing coefficient saved');assert.equal(await evaluate("document.querySelector('[data-packaging-volume] textarea').value"),'کارتن — 2.74');assert.deepEqual(await evaluate("(()=>{const r=document.querySelector('[data-packaging-volume]').getBoundingClientRect();return {width:r.width,height:r.height}})()"),fieldBefore,'selected details never grow field geometry');
 await click("document.querySelector('[data-master]')");await click("document.querySelector('[data-role]')");assert.equal(await evaluate("document.querySelector('[data-packaging-volume] textarea').value"),'');await click("document.querySelector('[data-packaging-volume] .number-chevron')");await until("document.querySelector('datalist')?.children.length===2",'shared reference suggestions');assert.ok(Math.abs(await evaluate("document.querySelector('[data-component-popup]').getBoundingClientRect().width")-resizedWidth)<2,'user popup size survives close and reopen on another product');await fill('نوع بسته‌بندی','پالت');await fill('CBM هر تن','3');await click("document.querySelector('.number-confirm')");await until("!document.querySelector('[data-component-popup]')",'second product saved');assert.equal(await evaluate("document.querySelectorAll('[data-packaging-volume] .number-add-button').length"),0,'ordinary user enters coefficients without permission to create reference types');const second=await evaluate("JSON.parse(document.querySelector('[data-records]').textContent)");assert.equal(second.b[0].packagingId,second.a[0].packagingId);assert.equal(second.b[0].cbmPerTon,3);await click("document.querySelector('[data-packaging-volume] .number-chevron')");await until("document.querySelectorAll('.new-number-row').length===2",'ordinary coefficient edit');await fill('CBM هر تن','4');await click("document.querySelector('.number-confirm')");await until("!document.querySelector('[data-component-popup]')",'ordinary user saves coefficient while default permission remains admin-only');const changed=await evaluate("JSON.parse(document.querySelector('[data-records]').textContent)");assert.equal(changed.b[0].id,second.b[0].id);assert.equal(changed.b[0].cbmPerTon,4);assert.equal(changed.b[0].isDefault,true);
 await click("document.querySelector('[data-role]')");await click("document.querySelector('[data-packaging-volume] .number-add-button')");await until("document.querySelectorAll('.new-number-row').length===2",'fixed reference entries');assert.ok(await evaluate("[...document.querySelectorAll('.number-pair-inputs input:first-child')].every(e=>e.readOnly)"));assert.equal(await evaluate("document.querySelectorAll('.new-number-row .number-row-remove').length"),0);await click("document.querySelector('.number-actions>.number-row-add')");await fill('نوع بسته‌بندی',' پالت ',2);await fill('CBM هر تن','4',2);await click("document.querySelector('.number-confirm')");assert.ok(await evaluate("!!document.querySelector('[data-component-popup]')"));await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until("!document.querySelector('[data-component-popup]')",'shared Escape');assert.equal((await evaluate("JSON.parse(document.querySelector('[data-records]').textContent)")).b.length,1);
 await send('Page.navigate',{url:base+'/tests/form-designer.html?packagingRuntime'});await until("document.querySelector('[data-managed-form-id]')",'actual form');await click("[...document.querySelectorAll('button')].find(b=>b.textContent==='ورود اطلاعات آزمایشی')");await click("document.querySelector('[data-runtime-action=create]')");await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='create'",'parent create');await fill('نام','نخ نمونه');await click("document.querySelector('[data-packaging-volume] .number-add-button')");await until("document.querySelector('.new-number-row .number-pair-inputs')",'shared popup inside actual form');await fill('نوع بسته‌بندی','پالت');await fill('CBM هر تن','1.5');await fill('نوع بسته‌بندی','کارتن',1);await fill('CBM هر تن','2.74',1);await click("document.querySelector('.number-confirm')");await until("!document.querySelector('[data-component-popup]')",'stage actual details');await click("document.querySelector('[data-runtime-action=save]')");await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='view'",'parent saved');assert.equal(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length"),1);await click("document.querySelector('[data-packaging-volume] .number-chevron')");await until("document.querySelectorAll('[data-component-popup] .person-number-row').length===2",'persisted packaging rows');assert.equal(await evaluate("document.querySelectorAll('[data-component-popup] .number-confirm').length"),0);
 await send('Page.navigate',{url:base+'/tests/packaging-volume.html'});await until("document.querySelector('[data-packaging-volume] .number-add-button')",'reload fixture');await click("document.querySelector('[data-packaging-volume] .number-add-button')");await until("document.querySelector('[data-component-popup]')",'reloaded popup');assert.ok(Math.abs(await evaluate("document.querySelector('[data-component-popup]').getBoundingClientRect().width")-resizedWidth)<2,'user popup size persists after reload');
 assert.deepEqual(errors,[]);console.log('PASS actual parent/detail persistence; packaging uses the actual title/list popup, two entry slots, matching field background, shared actions/F3/Escape, per-product coefficients and common packaging reference');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



