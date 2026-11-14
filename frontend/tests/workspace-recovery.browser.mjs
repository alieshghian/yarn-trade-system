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
  const clickTab = async label => {
    const expression = `Array.from(document.querySelectorAll('.form-tabs > button')).find(button => Array.from(button.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ${JSON.stringify(label)}))`
    await until(`!!(${expression})`, label + ' tab')
    await evaluate(`(${expression}).click()`)
  }

  const activeField = "document.activeElement?.closest('[data-field-id]')?.dataset.fieldId"
  const fieldInput = id => 'document.querySelector(' + JSON.stringify(`[data-field-id="${id}"] input, [data-field-id="${id}"] select`) + ')'
  const press = async key => {
    const code = { Enter: 13, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27 }[key]
    await send('Input.dispatchKeyEvent', {type:'keyDown',key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code})
    await send('Input.dispatchKeyEvent', {type:'keyUp',key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code})
    await pause(100)
  }
  const expectFocus = async id => until(activeField + ' === ' + JSON.stringify(id), 'focus ' + id)
  const clickText = async (selector, label) => {
    const expression = 'Array.from(document.querySelectorAll(' + JSON.stringify(selector) + ')).find(node => node.textContent.trim() === ' + JSON.stringify(label) + ')'
    await until('!!(' + expression + ')', label)
    await evaluate('(' + expression + ').click()')
  }
  const startRuntime = async language => {
    await clickText('.laboratory-form-access button', language === 'fa' ? 'ورود اطلاعات آزمایشی' : 'Test data entry')
    await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode === 'view'", 'runtime view')
    await evaluate("document.querySelector('[data-field-id=code] input').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}))")
    await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode === 'create'", 'runtime create')
  }
  await send('Page.navigate',{url:base+'/tests/workspace-recovery.html'})
  await until("!!document.querySelector('[role=alert]')",'load failure')
  assert.equal(await evaluate("document.querySelectorAll('[role=alert] button').length"),4)
  await clickText('[role=alert] button','تلاش دوباره')
  await until("!!document.querySelector('[data-loaded]')",'successful retry')
  assert.equal(await evaluate("document.querySelector('input').value"),'unsaved')
  await evaluate("document.querySelector('#reopen').click()")
  await until("!!document.querySelector('[role=alert]')",'second failure')
  await clickText('[role=alert] button','بستن صفحه')
  await until("!!document.querySelector('[data-home]')",'close leaves failure screen')
  await evaluate("document.querySelector('#reopen').click()")
  await until("!!document.querySelector('[role=alert]')",'reopened failure')
  await clickText('[role=alert] button','تلاش دوباره')
  await until("!!document.querySelector('[data-loaded]')",'retry after reopening')
  assert.equal(await evaluate("document.querySelector('input').value"),'unsaved')
  assert.ok(errors.every(error=>error.includes('Intentional unavailable page')))
  console.log('PASS retry rejected loader; close/reopen recovery; other unsaved state preserved; all recovery controls available')
  errors.length=0
  await send('Page.navigate',{url:base+'/tests/form-designer.html?smartLayout=1&emptyFields=1&language=fa'})
  await until("!!document.querySelector('#form-laboratory-designer')",'empty document designer')
  assert.equal(await evaluate("document.querySelectorAll('[data-field-id]').length"),0)
  assert.deepEqual(errors,[],'empty field selection must not crash appearance defaults')
  console.log('PASS Laboratory designer opens an empty document without a selected field')
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
