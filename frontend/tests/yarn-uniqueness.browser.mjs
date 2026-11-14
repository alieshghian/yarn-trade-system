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
    throw new Error('Timed out: ' + label + '\n' + await evaluate(`JSON.stringify({body:document.querySelector(".laboratory-form-frame")?.innerText,fields:[...document.querySelectorAll(".laboratory-form-frame [data-field-id]")].map(e=>[e.dataset.fieldId,e.querySelector("input")?.value])})`))
  }






 await send('Page.navigate',{url:base+'/tests/form-designer.html'});await until("document.querySelector('[data-form-laboratory]')",'Laboratory');
 await evaluate(`(async()=>{
 const {createManagedLaboratoryForm,saveManagedLaboratoryForm}=await import('/src/components/base-form/laboratoryFormDraftState.ts');
 const {emptyDesignerDraft,createDesignerHistory,attachDesignerDocument}=await import('/src/components/base-form/designer.ts');
 const {writeFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');
 const id='form.redesign.f743b7d0-d9f9-49e0-a7a8-bb05a00ddde1',user='isolated-browser-regression';
 const names={code:'کد',material:'جنس',countValue:'نمره'};
 const fields=Object.keys(names).map((key,i)=>({id:key,componentId:'definition.field',kind:'text',label:{fa:names[key],en:names[key],zh:names[key]},sectionId:'editor',required:true,focusOrder:i+1,validation:key==='countValue'?[]:[{type:'unique'}]}));
 const template={id,schemaVersion:1,version:1,mode:'operational',title:{fa:'آزمایش یکتایی نخ',en:'Yarn',zh:'Yarn'},sections:[{id:'editor',kind:'editor'},{id:'footer',kind:'footer'}],fields,uniqueConstraints:[{id:'spec',fieldIds:['material','countValue']}],actions:[{id:'new-person',sectionId:'footer',code:'Space',label:{fa:'جدید'}},{id:'demo-save',sectionId:'footer',code:'F3',label:{fa:'ذخیره'}},{id:'reset-sample',sectionId:'footer',code:'Esc',label:{fa:'خروج'}}]};
 const form=createManagedLaboratoryForm({id,name:'آزمایش یکتایی نخ',mode:'hybrid',templateSchema:template,templateDesigner:emptyDesignerDraft(id),frame:{device:'desktop',width:1200,height:800,fitToPage:true}});
 if(!saveManagedLaboratoryForm(localStorage,user,form)||!writeFormRecovery(localStorage,user,{form,designerHistory:attachDesignerDocument(createDesignerHistory(emptyDesignerDraft(id)),form.schema),structureHistory:{past:[],present:form.schema,future:[]}},'isolated regression'))throw Error('seed failed');
 })()`);
 await send('Page.navigate',{url:base+'/tests/form-designer.html'});
 await until("document.querySelector('[data-managed-form-id]')?.dataset.managedFormId==='form.redesign.f743b7d0-d9f9-49e0-a7a8-bb05a00ddde1'",'approved document');
 await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='ورود اطلاعات آزمایشی').click()");
 const action=async text=>evaluate("document.querySelector('[data-runtime-action="+(text==='جدید'?'create':'save')+"]').click()");
 const fill=async(id,value)=>evaluate("(()=>{const e=document.querySelector('[data-field-id='+"+JSON.stringify(JSON.stringify(id))+"+'] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await action('جدید');await fill('code','001');await fill('material','پلی استر');await fill('countValue','300');await action('ذخیره');await until("document.querySelector('[data-form-laboratory]').dataset.runtimeMode==='view'",'first save');
 await action('جدید');await fill('code','002');await fill('material','پلی استر');await fill('countValue','150');await action('ذخیره');await until("document.querySelector('[data-form-laboratory]').dataset.runtimeMode==='view'",'same material allowed');
 await action('جدید');await fill('code','001');await fill('material','پلی استر');await fill('countValue','75');await action('ذخیره');
 await until("document.querySelector('.form-runtime-validation')?.textContent.includes('یکتایی مستقل')",'named rule diagnostic');
 assert.equal(await evaluate("document.activeElement.closest('[data-field-id]').dataset.fieldId"),'code');
 assert.equal(await evaluate("document.querySelector('[data-field-id=material] input').value"),'پلی استر');
 await fill('code','003');await fill('countValue','300');await action('ذخیره');
 await until("document.querySelector('.form-runtime-validation')?.textContent.includes('این ترکیب')",'duplicate tuple blocked');
 assert.equal(await evaluate("document.querySelector('[data-form-laboratory]').dataset.runtimeMode"),'create');
 assert.deepEqual(errors,[]);console.log('PASS actual Laboratory approved repair; repeated material saves; duplicate identity/tuple blocked; named diagnostics, focus and draft preserved');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



