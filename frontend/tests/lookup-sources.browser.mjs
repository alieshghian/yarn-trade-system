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




 await send('Page.navigate',{url:base+'/tests/lookup-sources.html'});
 await until("!!document.querySelector('[data-component-settings]')",'settings available');
 await evaluate("document.querySelector('[data-component-settings]').open=true");
 const selector="document.querySelector('select[aria-label=\"فرم منبع اطلاعات\"]')";
 assert.deepEqual(await evaluate("[...("+selector+").options].map(o=>o.value)"),['','persons','brands','productGroups','warehouses'],'only registered operational sources');
 await evaluate("(()=>{const e="+selector+";e.value='productGroups';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
 await until("document.querySelector('[data-lookup-settings]').textContent.includes('productGroups')",'source persisted in field settings');
 await evaluate("document.querySelectorAll('[data-component-settings] details').forEach(e=>e.open=true)");
 const checks=await evaluate("[...document.querySelectorAll('[data-component-settings] label:has(>input[type=checkbox])')].map(label=>{const box=label.querySelector('input').getBoundingClientRect();const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());const range=document.createRange();range.selectNode(text);const r=range.getBoundingClientRect();return {offset:Math.abs((box.top+box.bottom-r.top-r.bottom)/2),gap:Math.max(r.left-box.right,box.left-r.right),width:box.width,height:box.height}})");
 assert.ok(checks.length>=6);for(const c of checks){assert.ok(c.offset<=4,JSON.stringify(c));assert.ok(c.gap>=0&&c.gap<=10,JSON.stringify(c));assert.equal(c.width,17);assert.equal(c.height,17);}
 console.log('PASS component checkboxes align with adjacent text at compact native size');
 await evaluate("document.querySelector('.system-lookup [data-field=group]').click()");
 await until("document.querySelector('[data-component-popup]')?.textContent.includes('DTY / براق')",'incomplete branches offered');
 assert.ok(await evaluate("document.querySelector('[data-component-popup]').textContent.includes('150D')"),'deep branches offered too');
 await evaluate("[...document.querySelectorAll('[data-component-popup] [role=option]')].find(e=>e.textContent.includes('براق')).click()");
 await until("document.querySelector('[data-chosen]').textContent==='incomplete'",'stable source id selected without depth restriction');
 console.log('PASS source list operational-only, Product Group binding stored, all group depths selectable with stable IDs');
 assert.deepEqual(errors,[]);
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



