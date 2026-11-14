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


  await send('Page.navigate',{url:base+'/tests/grid-reset-validation.html'});
  await until("!!document.querySelector('#local table')",'grid');
  const key=async(name,vk)=>send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:vk});
  const filter=async()=>{await evaluate("document.querySelector('#local .excel-filter-trigger').click()");await until("!!document.querySelector('.shared-excel-filter-menu')",'filter');await evaluate("(()=>{const a=[...document.querySelectorAll('.filter-values input[type=checkbox]')];a[1].click();document.querySelector('.filter-actions button:first-child').click()})()");};
  await filter();
  await until("document.querySelectorAll('#local tbody tr').length===2",'filter applied');
  await evaluate("document.querySelector('#local .grid-search-control input').focus()");
  await key('F8',119);
  await until("document.querySelectorAll('#local tbody tr').length===3",'F8 clears filters from toolbar');
  await filter();
  await evaluate("document.querySelector('#local .excel-filter-trigger').click()");
  await until("!!document.querySelector('.shared-excel-filter-menu')",'reopen filter');
  await evaluate("document.querySelector('.shared-excel-filter-menu input:not([type=checkbox])').focus()");
  await key('F8',119);
  await until("!document.querySelector('.shared-excel-filter-menu')&&document.querySelectorAll('#local tbody tr').length===3",'F8 in portal clears/closes');
  await filter();
  await evaluate("document.querySelector('#open-modal').click()");
  await until("!!window.lastQuery",'remote query');
  await evaluate("document.querySelector('#modal .grid-search-control input').focus()");
  await send('Input.insertText',{text:'Alpha'});
  await until("window.lastQuery.search==='Alpha'",'remote search applied');
  await key('F8',119);
  await until("window.lastQuery.search===''&&Object.keys(window.lastQuery.filters).length===0",'server query reset');
  assert.equal(await evaluate("document.querySelectorAll('#local tbody tr').length"),2,'background filter preserved');
  await evaluate("document.querySelector('#modal>button').click()");
  const before=await evaluate("document.querySelector('[data-field=other]').getBoundingClientRect().top");
  await evaluate("document.querySelector('[data-field=name]').focus()");await key('Enter',13);
  await until("!!document.querySelector('.shared-field-error')",'required error');
  assert.equal(await evaluate("document.querySelector('[data-field=other]').getBoundingClientRect().top"),before,'no reflow');
  assert.equal(await evaluate("document.activeElement.dataset.field"),'name','focus retained');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.shared-field-error')).position"),'fixed');
  await send('Input.insertText',{text:'A'});
  await until("!document.querySelector('.shared-field-error')",'typing clears tooltip');
  console.log('PASS F8 local/portal/remote/modal isolation; validation tooltip no reflow, retained focus and clear on typing');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
