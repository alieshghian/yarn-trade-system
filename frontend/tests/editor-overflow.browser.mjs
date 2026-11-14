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

  for (const kind of ['1','legacy']) {
    await send('Page.navigate',{url:base+'/tests/form-designer.html?smartLayout=1&language=fa&scrollExtent='+kind})
    await until("!!document.querySelector('.laboratory-form-grid.has-fixed-geometry')",'editor fixture')
    await evaluate("(()=>{const pane=document.querySelector('.laboratory-editor');pane.style.height='480px';pane.style.flex='none';pane.parentElement.style.height='480px'})()")
    await until("document.querySelector('.laboratory-form-grid').getBoundingClientRect().height<500",'empty canvas tail cropped')
    const result=await evaluate("(()=>{const pane=document.querySelector('.laboratory-editor');return {overflow:getComputedStyle(pane).overflowY,client:pane.clientHeight,scroll:pane.scrollHeight}})()")
    assert.equal(result.overflow,'auto','even legacy forced scrolling uses content overflow')
    assert.ok(result.scroll<=result.client+1,JSON.stringify(result))
    await evaluate("document.querySelector('.laboratory-editor').style.height='220px'")
    await until("(()=>{const pane=document.querySelector('.laboratory-editor');return pane.scrollHeight>pane.clientHeight+1})()",'real overflow scrolls')
    console.log('PASS fitting fields do not scroll; genuine overflow remains accessible ('+kind+')')
  }
  await send('Page.navigate',{url:base+'/tests/form-designer.html?smartLayout=1&language=fa&scrollExtent=schema'})
  await until("!!document.querySelector('.laboratory-form-grid:not(.has-fixed-geometry) [data-field-id=code]')",'schema offsets fixture')
  await evaluate("(()=>{const pane=document.querySelector('.laboratory-editor'),grid=pane.querySelector('.laboratory-form-grid');pane.style.height=(grid.getBoundingClientRect().height+84)+'px';pane.style.flex='none';pane.parentElement.style.height=pane.style.height})()")
  assert.equal(await evaluate("(()=>{const pane=document.querySelector('.laboratory-editor');return pane.scrollHeight>pane.clientHeight+1})()"),false,'schema offset spacer must not duplicate field displacement')
  console.log('PASS schema field offsets do not append empty scroll space')
  assert.deepEqual(errors,[])
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
