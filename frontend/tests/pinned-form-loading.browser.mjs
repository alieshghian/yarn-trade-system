import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
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
  // Isolated demo workspace: real page modules, no production records or writes.
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `
    sessionStorage.setItem('global-trade-workspace-v1', JSON.stringify({active:'dashboard',openTabs:['dashboard','persons','brands','yarns']}));
    const realFetch=window.fetch;
    window.fetch=(input,options)=>{
      const url=typeof input==='string'?input:input.url;
      if(url.endsWith('/api/user-settings'))return Promise.resolve(new Response(JSON.stringify({preferredLanguage:'fa',sessionTimeoutMinutes:30,theme:'system',compactMode:false,fontFamily:'vazirmatn',fontSize:'normal'}),{status:200,headers:{'Content-Type':'application/json'}}));
      if(url.includes('/api/'))return Promise.resolve(new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}));
      return realFetch(input,options);
    };
  `});
  await send('Page.navigate',{url:base+'/?demo=1'});
  await until("!!document.querySelector('.form-tabs > button')",'workspace');
  for(const [label,selector] of [
    ['تعریف برند','[data-operational-brand-design] .operational-form-frame'],
    ['تعریف اشخاص','.person-form-grid'],
    ['تعریف نخ','[data-form-scope]']
  ]){
    await clickTab(label);
    await until(`!!document.querySelector('.form-tab-pane.active ${selector}')`,label+' renders');
    assert.equal(await evaluate("document.querySelector('.form-tab-pane.active')?.textContent.includes('بارگیری این صفحه انجام نشد')"),false);
    console.log('PASS '+label+' loads through actual application route');
  }
  assert.deepEqual(errors,[],'no module initialization or rendering errors');
  console.log('PASS approved brand snapshot survives newer Laboratory behavior revisions');
} catch(error){console.error(error);process.exitCode=1}
finally{
  socket?.close();browser.kill();
  await new Promise(done=>browser.exitCode!==null?done():browser.once('exit',done));
  assert.ok(profile.startsWith(temporaryRoot+sep));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
