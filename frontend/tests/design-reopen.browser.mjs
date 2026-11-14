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
    if (data.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true});
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


  await send('Page.navigate',{url:base+'/tests/design-reopen.html'});
  await until("!!document.querySelector('.laboratory-form-manager')",'Laboratory design loaded');
  const manager="document.querySelector('[aria-label=\"مدیریت فرم‌ها و انتخاب فرم فعال\"]')";
  const clickManager=async()=>{const target="Array.from(document.querySelectorAll('button')).find(b=>['مدیریت فرم‌ها و انتخاب فرم فعال','مدیریت فرم‌ها','فرم‌های مستقل'].includes(b.textContent.trim())&&b.getBoundingClientRect().width>0)";await until('!!('+target+')','Manager button');await evaluate('('+target+').click()');await until('!!'+manager,'Manager open')};
  const count=()=>evaluate("(()=>{const r=window.testDesignRecords();return new Set([...r.forms.forms.map(f=>f.id),...Object.keys(r.recovery.documents)]).size})()");
  await clickManager();
  assert.equal(await count(),2);
  assert.ok(await evaluate(manager+".querySelector('[data-design-id=recent][aria-current=true]').textContent.includes('فرم جاری — در حال کار')"));
  assert.equal(await evaluate(manager+".querySelectorAll('[data-design-id]').length"),2);
  assert.equal(await evaluate(manager+".querySelectorAll('details:not([open]) [data-design-id]').length"),1,'Earlier duplicate is collapsed');
  const reopen=manager+".querySelector('[data-catalog-route=brands] button')";
  for(let i=0;i<3;i++){
   await evaluate(reopen+'.click()');await until('!'+manager,'Design opened');
   await clickManager();assert.equal(await count(),2,'Viewing must not create a document');
  }
  await evaluate(manager+".querySelector('.laboratory-management-sticky button').click()");
  await evaluate("document.querySelector('.laboratory-managed-close').click()");
  await until("!document.querySelector('.laboratory-managed-close')",'Design closed with backup');
  await clickManager();
  await evaluate(reopen+'.click()');await until('!'+manager,'Same design reopened after close');
  assert.equal(await count(),2);
  await clickManager();
  await evaluate(manager+".querySelectorAll('[data-catalog-route=brands] button')[1].click()");
  await until('!'+manager,'Explicit new edition opened');
  await until("Object.keys(window.testDesignRecords().recovery.documents).length===3",'New edition recovered');
  const created=await evaluate("Object.values(window.testDesignRecords().recovery.documents).map(d=>d.current.form).find(f=>f.designEdition?.number===2)");
  assert.equal(created.designEdition.sourceFormId,'recent');assert.equal(created.schema.settings.specific.values.operationalSource.route,'brands');
  assert.equal(await count(),3);
  await clickManager();
  assert.ok(await evaluate(manager+".querySelector('[aria-current=true]').textContent.includes('نسخهٔ طراحی: 2')"));
  await evaluate(reopen+'.click()');await until('!'+manager,'New edition reused');assert.equal(await count(),3);
  assert.deepEqual(errors,[]);
  console.log('PASS actual Laboratory reopen x3, close/reopen: no extra document; explicit edition 2; current indicator; collapsed legacy history');
} catch(error){console.error(error);console.error(errors);process.exitCode=1}
finally{
 socket?.close();browser.kill();await new Promise(done=>browser.exitCode!==null?done():browser.once('exit',done));assert.ok(profile.startsWith(temporaryRoot+sep));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}

