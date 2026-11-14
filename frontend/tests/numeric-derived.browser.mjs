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




 await send('Page.navigate',{url:base+'/tests/numeric-derived.html'});await until("document.querySelector('[data-cbm]')",'numeric editor');
 await evaluate("document.querySelectorAll('details').forEach(e=>e.open=true)");
 assert.equal(await evaluate("document.querySelector('[data-cbm]').checkValidity()"),true);
 const select=async(label,value)=>evaluate("(()=>{const e=document.querySelector('select[aria-label='+"+JSON.stringify(JSON.stringify(label))+"+']');e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}))})()");
 await select('تعداد رقم اعشار مجاز','2');assert.equal(await evaluate("document.querySelector('[data-cbm]').step"),'0.01');assert.equal(await evaluate("document.querySelector('[data-cbm]').checkValidity()"),true);
 await evaluate("(()=>{const e=document.querySelector('[data-cbm]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'11.234');e.dispatchEvent(new Event('input',{bubbles:true}))})()");await until("document.querySelector('[data-numeric-error]').textContent.includes('2')",'precision error localized');
 for(const [name,unit] of [['نمره نخ','دنیر'],['تعداد لا','لا']]){await select('ترکیب '+name,'valueLabel');await select('نوع برچسب '+name,'custom');await evaluate("(()=>{const e=document.querySelector('input[aria-label='+"+JSON.stringify(JSON.stringify('متن همراه '+name))+"+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(unit)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");}
 await until("document.querySelector('[data-full-name]').textContent==='300 دنیر 2 لا'",'live composed units');const json=await evaluate("JSON.parse(document.querySelector('[data-json]').textContent)");assert.equal(json.config.sourceFormats.plies.label,'لا');assert.equal(json.schema.fields[0].settings.numericSettings.decimalPlaces,2);await select('نوع برچسب نمره نخ','word:1');await until("document.querySelector('[data-full-name]').textContent==='300 نخ 2 لا'",'partial field label live');assert.equal(await evaluate("JSON.parse(document.querySelector('[data-json]').textContent).config.sourceFormats.count.label"),'نخ');assert.deepEqual(errors,[]);console.log('PASS decimal entry, configurable two-place validation, live custom units and JSON settings');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



