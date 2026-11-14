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




 await send('Page.navigate',{url:base+'/tests/brands-operational.html?fontRegression'});
 await until("!!document.querySelector('[data-field=brandName]')",'brand loaded');
 const click=async text=>evaluate("[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&(e.textContent.trim()==="+JSON.stringify(text)+"||e.getAttribute('aria-label')==="+JSON.stringify(text)+")).click()");
 await until("getComputedStyle(document.querySelector('[data-field=brandName]')).fontWeight==='700'",'fixture bold applied');
 await click('تنظیمات فرم');
 await evaluate("(()=>{const e=document.querySelector('[data-field=brandName]');e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:300}))})()");
 await click('متن و قلم');
 await click('تنظیم قلم…');
 await until("!!document.querySelector('.designer-grid-font-fields')",'font dialog');
 assert.equal(await evaluate("document.querySelector('select[aria-label=\"حالت قلم\"]').value"),'bold','actual bold style loaded');
 const box=await evaluate("(()=>{const r=document.querySelector('.operational-font-dialog').getBoundingClientRect(),h=document.querySelector('.operational-font-dialog header h2').getBoundingClientRect();return {x:r.x,y:r.y,hx:h.x+20,hy:h.y+10}})()");
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.hx,y:box.hy});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.hx,y:box.hy,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.hx-50,y:box.hy+25,buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.hx-50,y:box.hy+25,button:'left',clickCount:1});
 assert.ok(await evaluate("(()=>{const r=document.querySelector('.operational-font-dialog').getBoundingClientRect();return Math.abs(r.x-"+(box.x-50)+")<2&&Math.abs(r.y-"+(box.y+25)+")<2})()"),'font dialog draggable from title');
 const ink=()=>evaluate("(()=>{const b=document.querySelector('.designer-font-apply'),s=getComputedStyle(b);return [s.backgroundColor,s.color,s.borderColor]})()");
 const normal=await ink();const point=await evaluate("(()=>{const r=document.querySelector('.designer-font-apply').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});assert.deepEqual(await ink(),normal,'apply colors stay identical on hover');assert.equal(normal[0],'rgb(29, 125, 115)');
 await evaluate("(()=>{const s=document.querySelector('select[aria-label=\"حالت قلم\"]');s.value='regular';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
 await click('تأیید');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-field=brandName]')).fontWeight"),'400','regular style reaches real input');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-field=brandName]')).textDecorationLine"),'none','regular must not introduce underline');

 await evaluate("sessionStorage.setItem('isolated-product-group-records',JSON.stringify([{id:'font-root',parentId:null,name:'گروه تست',depth:0,code:'001',hierarchyCode:'001',rowVersion:'AAAAAAAAAAE='}]))");
 await send('Page.navigate',{url:base+'/tests/product-group-operational.html'});
 await until("!!document.querySelector('.cascading-tree-node')",'tree available');
 await evaluate("document.querySelector('.cascading-tree-node').click()");
 const treeWasBold=await evaluate("Number(getComputedStyle(document.querySelector('.cascading-tree-node')).fontWeight)>=600");
 await click('تنظیمات فرم');
 await evaluate("(()=>{const e=document.querySelector('.cascading-tree-node');e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:300}))})()");
 await click('متن و قلم');await click('تنظیم قلم…');
 await until("!!document.querySelector('.designer-grid-font-fields')",'tree font dialog');
 assert.equal(await evaluate("document.querySelector('select[aria-label=\"حالت قلم\"]').value"),treeWasBold?'bold':'regular','selected tree actual weight visible');
 await evaluate("(()=>{const s=document.querySelector('select[aria-label=\"حالت قلم\"]');s.value='"+(treeWasBold?'regular':'bold')+"';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.cascading-tree-node')).fontWeight"),treeWasBold?'400':'700','weight previews on real tree before Apply');
 await click('لغو');
 assert.equal(await evaluate("Number(getComputedStyle(document.querySelector('.cascading-tree-node')).fontWeight)>=600"),treeWasBold,'Cancel restores original real tree weight');
 await evaluate("(()=>{const e=document.querySelector('.cascading-tree-node');e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:300}))})()");
 await click('متن و قلم');await click('تنظیم قلم…');
 await evaluate("(()=>{const s=document.querySelector('select[aria-label=\"حالت قلم\"]');s.value='regular';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
 await click('تأیید');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.cascading-tree-node')).fontWeight"),'400','regular customization reaches green tree row');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.cascading-tree-node')).textDecorationLine"),'none','tree row has no underline');
 console.log('PASS operational font effective bold, title drag, invariant green hover, regular without underline');
 assert.deepEqual(errors,[]);
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



