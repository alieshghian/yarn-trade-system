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
    throw new Error('Timed out: ' + label + '\n' + await evaluate("JSON.stringify([...document.querySelectorAll('.warehouse-page [data-field=code]')].map(e=>({tag:e.tagName,value:e.value,html:e.outerHTML})))") + '\n' + await evaluate('document.body.innerText.slice(0,1500)'))
  }

  await send('Page.navigate',{url:base+'/'})
  await until("document.readyState==='complete'",'main application')
  assert.equal(await evaluate("(async()=>{const a=await import('/src/api.ts');return await a.tryDevelopmentSession()})()"),true)
  await send('Page.reload')
  await until("!!document.querySelector('[data-nav-id=warehouses]')",'warehouse menu')
  await evaluate("document.querySelector('[data-nav-id=warehouses] button')?.click() || document.querySelector('[data-nav-id=warehouses]').click()")
  await until("!!document.querySelector('.warehouse-page')",'live warehouse page')
  await until("document.querySelector('.warehouse-page .base-grid-table tbody')?.textContent.trim().length>0",'real warehouse rows')
  await until("!!document.querySelector('.warehouse-page .base-grid-table tbody tr[data-row-index]:not([aria-busy]) td')",'loaded selectable row')
  await evaluate("document.querySelector('.warehouse-page .base-grid-table tbody tr[data-row-index]:not([aria-busy])').click()")
  await until("!!document.querySelector('.warehouse-page [data-field=code]').value",'real row binding')
  assert.equal(await evaluate("document.querySelector('[data-field=floorCount]').max"),'5')
  assert.equal(await evaluate("document.querySelector('[data-field=location]').required"),true)
  assert.equal(await evaluate("document.querySelector('[data-field=location]').value"),'')
  const actual=await evaluate("(async()=>{const {apiRequest}=await import('/src/api.ts');const page=await apiRequest('/api/warehouses/grid',{method:'POST',body:JSON.stringify({page:1,pageSize:10})});const zones=page.items.length?await apiRequest('/api/warehouses/'+page.items[0].id+'/zones'):[];return {total:page.total,docks:zones.filter(z=>z.isDefaultReceiving).length}})()")
  assert.ok(actual.total>=1);assert.equal(actual.docks,1)
  await evaluate("[...document.querySelectorAll('.warehouse-page .laboratory-footer button')].find(b=>b.textContent.includes('Space')).click()")
  await until("!document.querySelector('.warehouse-page [data-field=code]').disabled",'live create')
  assert.equal(await evaluate("document.querySelectorAll('.warehouse-page .laboratory-footer button').length"),2)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await until("document.querySelector('.warehouse-page [data-field=code]').disabled",'live cancel')
  await evaluate("[...document.querySelectorAll('.warehouse-page .laboratory-footer button')].find(b=>b.textContent==='زون‌ها').click()")
  await until("document.querySelector('.warehouse-zones-page .base-grid-table tbody')?.innerText.includes('بارانداز')",'live receiving dock')
  await send('Page.captureScreenshot',{format:'png'}).then(r=>import('node:fs/promises').then(fs=>fs.writeFile(resolve('..','artifacts','warehouse-location','zone-live.png'),Buffer.from(r.data,'base64'))))
  await evaluate("document.querySelector('.form-document-dialog-close').click()")
  await until("!document.querySelector('[role=dialog]')",'close zones')
  assert.deepEqual(errors,[])
  await send('Page.captureScreenshot',{format:'png'}).then(r=>import('node:fs/promises').then(fs=>fs.writeFile(resolve('..','artifacts','warehouse-location','warehouse-live.png'),Buffer.from(r.data,'base64'))))
  console.log(JSON.stringify({passed:true,menu:'definitions/warehouses',...actual,liveDataWrites:0}))
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
