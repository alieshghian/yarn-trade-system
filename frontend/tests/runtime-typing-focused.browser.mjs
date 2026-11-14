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




 const click=async text=>{await until("[...document.querySelectorAll('button')].some(e=>e.getClientRects().length&&e.textContent.trim()==="+JSON.stringify(text)+")",text);await evaluate("[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()==="+JSON.stringify(text)+").click()")};
 await send('Page.navigate',{url:base+'/tests/form-designer.html'});
 await click('ایجاد فرم از قالب آزمایشگاه');
 await evaluate("(()=>{const select=[...document.querySelectorAll('.new-form-builder-dialog select')].find(e=>[...e.options].some(o=>o.value==='copy'));select.value='copy';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
 await evaluate("(()=>{const input=[...document.querySelectorAll('.new-form-builder-dialog label')].find(e=>e.textContent.startsWith('نام فرم')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'آزمون زبان');input.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await click('تأیید ساختار و ایجاد فرم');await until("!document.querySelector('.new-form-builder-dialog')",'created');
 await evaluate("[...document.querySelectorAll('[data-design-id] button')].find(b=>b.textContent==='بازکردن')?.click()");
 await until("!!document.querySelector('[data-managed-form-id]')",'active managed form');
 await evaluate("document.querySelector('.laboratory-management-sticky button')?.click()");
 await click('ورود اطلاعات آزمایشی');
 await until("!!document.querySelector('[data-runtime-action=create]')",'runtime view');
 await evaluate("document.querySelector('[data-runtime-action=create] button')?.click()??document.querySelector('[data-runtime-action=create]').click()");
 await until("document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='create'",'entry');
 await evaluate("document.querySelector('[data-field-id=firstName] input').focus()");
 await pause(500);
 const input="document.querySelector('[data-field-id=firstName] input')";
 const button="(()=>{const i="+input+",r=i.getBoundingClientRect();return [...document.querySelectorAll('.field-typing-language')].find(b=>!b.hidden&&Math.abs(b.getBoundingClientRect().left-r.left-4)<2&&Math.abs(b.getBoundingClientRect().top-(r.top+(r.height-24)/2))<2)})()";

 assert.equal(await evaluate(input+".inputMode"),'text','generic text renderer must not inherit decimal inputMode');
 await until("!!("+button+")",'editable sample language button');
 await evaluate(input+".focus()");await evaluate(button+".click()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',windowsVirtualKeyCode:83});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',windowsVirtualKeyCode:83});
 assert.ok(await evaluate(input+".value.endsWith('s')"),'English typing');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18});
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',windowsVirtualKeyCode:83});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',windowsVirtualKeyCode:83});
 assert.ok(await evaluate(input+".value.endsWith('sس')"),'Persian typing through Alt tap');


 const key=async(key,code,vk)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk})};
 await evaluate("document.querySelector('[data-field-id=lastName] input').focus()");await key('a','KeyA',65);assert.equal(await evaluate("document.querySelector('[data-field-id=lastName] input').value"),'ش','next field starts in Persian app language');
 await key('Alt','AltLeft',18);await key('a','KeyA',65);assert.equal(await evaluate("document.querySelector('[data-field-id=lastName] input').value"),'شa');
 await evaluate(input+".focus()");await key('a','KeyA',65);assert.equal(await evaluate(input+".value"),'ش','returning to field resets short toggle to application default');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18});await pause(1600);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18,autoRepeat:true});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18});
 await evaluate("document.querySelector('[data-field-id=lastName] input').focus()");await key('a','KeyA',65);assert.equal(await evaluate("document.querySelector('[data-field-id=lastName] input').value"),'a','bare Alt hold changes default for subsequent fields');
 console.log('PASS application-language default per field, short Alt local only, bare held Alt changes subsequent-field default');
 await send('Page.navigate',{url:base+'/tests/form-storage.fixture.html'});
 await evaluate("(async()=>{const {readFormRecovery,writeFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');const {designerHistoryReducer}=await import('/src/components/base-form/designer.ts');const {saveManagedLaboratoryForm}=await import('/src/components/base-form/laboratoryFormDraftState.ts');const journal=readFormRecovery(localStorage,'isolated-browser-regression'),snapshot=journal.documents[journal.activeFormId].current;const schema={...snapshot.form.schema,fields:snapshot.form.schema.fields.map(f=>f.id==='notes'?{...f,componentId:'base-form.derived-display',kind:'text',readOnly:true,settings:{...f.settings,derivedSettings:{sourceFieldIds:['firstName','lastName'],separator:' '}}}:f)};const draft={...snapshot.designerHistory.present,overrides:{...snapshot.designerHistory.present.overrides,'notes::input':{...snapshot.designerHistory.present.overrides['notes::input'],textAlign:'center',verticalTextAlign:'center'}}};const history=designerHistoryReducer(snapshot.designerHistory,{type:'change',draft,schema});const form={...snapshot.form,schema};if(!saveManagedLaboratoryForm(localStorage,'isolated-browser-regression',form)||!writeFormRecovery(localStorage,'isolated-browser-regression',{form,designerHistory:history,structureHistory:{present:schema,past:[],future:[]}},'Derived layout test'))throw Error('fixture save failed')})()");
 await send('Page.navigate',{url:base+'/tests/form-designer.html'});
 await until("!!document.querySelector('[data-managed-form-id]')",'derived form restored');
 await evaluate("document.querySelector('.laboratory-management-sticky button')?.click()");
 await click('ورود اطلاعات آزمایشی');await until("!!document.querySelector('[data-runtime-action=create]')",'derived view');
 await evaluate("document.querySelector('[data-runtime-action=create]').click()");
 await until("!document.querySelector('[data-field-id=firstName] input').disabled",'derived entry');
 await evaluate("(()=>{for(const [id,value] of [['firstName','DTY'],['lastName','پلی استر']]){const e=document.querySelector('[data-field-id='+id+'] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()");
 await until("document.querySelector('[data-derived-text]')?.textContent==='DTY پلی استر'",'derived text combined');
 assert.ok(await evaluate("(()=>{const e=document.querySelector('[data-derived-text]'),b=[...e.querySelectorAll('bdi')].filter(n=>n.textContent.trim()),r=b.map(n=>n.getBoundingClientRect());return r.length===2&&Math.abs(r[0].top-r[1].top)<4&&getComputedStyle(e).textAlign==='center'})()"),'wide centered derived field keeps source parts on one line');
 console.log('PASS derived source parts remain inline with inherited centered alignment');
 console.log('PASS Laboratory sample-entry typing button, English typing and Alt Persian switching');
 assert.deepEqual(errors,[]);
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



