import assert from 'node:assert/strict'
import { connectChromeDevTools } from './chrome-devtools.mjs'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { checkPersonsToolbar } from './persons-toolbar.scenarios.mjs'
import { checkOperationalTools } from './approved-operational-tools.scenarios.mjs'
import { checkPersonsEditorGeometry } from './persons-editor-geometry.scenarios.mjs'

// Run against `npm run preview`; the browser profile and workspace are disposable.
const base = process.env.APP_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER')
const temporaryRoot = resolve(tmpdir())
const profile = resolve(await mkdtemp(join(temporaryRoot, 'yarn-lazy-test-')))
assert.ok(profile.startsWith(temporaryRoot + sep), 'Browser profile must remain in the temporary directory')
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let socket, session, sequence = 0
const pending = new Map(), errors = []
const pause = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

const closed = new Promise(resolveClose => browser.once('close', resolveClose))
try {
  socket = await connectChromeDevTools(browser, profile, executable)
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
  const clickTab = async label => {
    const expression = `Array.from(document.querySelectorAll('.form-tabs > button')).find(button => Array.from(button.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ${JSON.stringify(label)}))`
    await until(`!!(${expression})`, label + ' tab')
    await evaluate(`(${expression}).click()`)
  }

  for (const company of [false,true]) {
    const token = await evaluate('performance.timeOrigin')
    await send('Page.navigate', {url:base+'/tests/person-brand-lookup.html?toolbar=1'+(company?'&company=1':'')})
    await until('performance.timeOrigin!=='+token+'&&!!document.querySelector(".active tr[data-person-id]")','Persons geometry fixture')
    await until(company ? '!!document.querySelector(".person-director-field")' : '!!document.querySelector(".person-first-name-field")','Persons identity variant')
    await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))))')
    await checkPersonsEditorGeometry(evaluate, company)
  }
  console.log('PASS Persons full desktop editor geometry matches Golden tracks in both identity variants and combined Brand footprint')
  await checkPersonsToolbar({ base, send, evaluate, until, profile })
  assert.deepEqual(errors, [])
  if (!process.env.PERSONS_TOOLBAR_ONLY) {
  await send('Page.navigate',{url:base+'/tests/person-brand-lookup.html'});
  await until("!!document.querySelector('.active .shortcut-bar button')",'Persons loaded');
  await evaluate("Array.from(document.querySelectorAll('.active .shortcut-bar button')).find(e=>e.textContent.includes('شخص جدید')).click()");
  await until("!!document.querySelector('.system-lookup [data-field]')&&!document.querySelector('.system-lookup [data-field]').disabled",'Person create lookup');
  const lookup="document.querySelector('.system-lookup')";
  for(const field of ['phone','mobile']){
    await evaluate("document.querySelector('.person-"+field+"-field .number-add-button').click()");
    await until("!!document.querySelector('.new-number-row .person-primary')",'New contact default control');
    await evaluate("(()=>{const c=document.querySelector('.new-number-row .dial-code-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(c,'+98');c.dispatchEvent(new Event('input',{bubbles:true}));const e=document.querySelector('.new-number-row input[type=tel]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1234567');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await evaluate("document.querySelector('.new-number-row .number-row-add').click()");
    await until("document.querySelectorAll('.new-number-row').length===2",'Second contact entry');
    await evaluate("(()=>{const c=document.querySelectorAll('.new-number-row .dial-code-input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(c,'+98');c.dispatchEvent(new Event('input',{bubbles:true}));const e=document.querySelectorAll('.new-number-row input[type=tel]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'7654321');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await evaluate("document.querySelectorAll('.new-number-row .person-primary')[1].click()");
    assert.equal(await evaluate("document.querySelectorAll('.new-number-row .person-primary.selected').length"),1);
    await evaluate("document.querySelectorAll('.new-number-row .number-row-add')[1].click()");
    await until("document.querySelectorAll('.new-number-row').length===3",'Draft removal available');
    await evaluate("document.querySelectorAll('.number-row-remove')[2].click()");
    assert.equal(await evaluate("document.querySelectorAll('.new-number-row').length"),2);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.number-confirm')).backgroundColor"),'rgb(52, 125, 112)');
    assert.ok(await evaluate("parseFloat(getComputedStyle(document.querySelector('.number-confirm')).fontSize)<=15"));
    await evaluate("document.querySelector('.number-confirm').click()");
    await until("document.querySelector('.person-"+field+"-field [data-field]').value.includes('765')",'Default contact retained');
    // Confirm advances to the next contact, which may auto-open its editor.
    for(let n=0;n<4&&await evaluate("!!document.querySelector('.number-cancel')");n++){await evaluate("document.querySelector('.number-cancel').click()");await pause(60)}
  }

  await evaluate("document.querySelector('.person-address-field .number-add-button').click()");
  await until("!!document.querySelector('.new-number-row textarea')",'Address uses shared entry');
  assert.ok(await evaluate("parseFloat(getComputedStyle(document.querySelector('.new-number-row textarea')).fontSize)>=15"));
  assert.ok(await evaluate("!!document.querySelector('.new-number-row .person-primary')&&!!document.querySelector('.new-number-row .number-row-remove')"));
  await evaluate("(()=>{const e=document.querySelector('.new-number-row textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'نشانی خوانا');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await evaluate("document.querySelector('.number-confirm').click()");
  await until("document.querySelector('[data-field=address]').value.includes('نشانی خوانا')",'Address saved');
  await evaluate("document.querySelector('.person-address-field .number-chevron').click()");
  await until("!!document.querySelector('.person-number-row:not(.new-number-row)')",'Existing address row');
  assert.ok(await evaluate("!!document.querySelector('.number-row-edit')&&!!document.querySelector('.person-number-row button[aria-label=حذف]')"));
  await evaluate("document.querySelector('.number-cancel').click()");
  assert.equal(await evaluate("document.querySelectorAll('.person-brands-field').length"),1);
  assert.equal(await evaluate("!!document.querySelector('select[multiple]')"),false);
  const heights=await evaluate("[document.querySelector('.system-lookup .person-number-control').getBoundingClientRect().height,document.querySelector('[data-field=firstName]').getBoundingClientRect().height]");
  assert.ok(Math.abs(heights[0]-heights[1])<5,JSON.stringify(heights));
  await evaluate("(()=>{let e=document.querySelector('[data-field=firstName]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'نام حفظ شده');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await evaluate(lookup+".querySelector('.number-chevron').click()");
  await until("!!document.querySelector('.person-number-row')",'Search records');
  assert.equal(await evaluate("document.querySelector('.component-clear-choice').textContent.trim()"),'');
  const key=async(key,code=key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code})};
  await until("document.querySelector('.component-clear-choice')?.getAttribute('aria-pressed')==='true' && !document.querySelector('[data-component-popup][aria-busy=true]')",'Optional lookup starts on the blank choice');
  await key('ArrowDown');
  await until("!!document.querySelector('.person-number-row.is-active-row')",'ArrowDown activates the first result');
  assert.ok(await evaluate("document.querySelector('.is-active-row').textContent.includes('995')||document.querySelector('.is-active-row textarea').value.includes('995')"));
  await key('ArrowDown');
  assert.ok(await evaluate("document.querySelector('.is-active-row textarea').value.includes('997')"));
  await key('ArrowUp');
  await key('Enter');
  await until(lookup+".querySelector('[data-field]').value.includes('995')",'Code and name selection');
  await evaluate(lookup+".querySelector('.number-chevron').click()");
  await until("!!document.querySelector('.lookup-create-actions button')",'Visible Insert button');
  assert.ok(await evaluate("(()=>{const b=document.querySelector('.lookup-create-actions button');const r=b.getBoundingClientRect();return r.height>0&&r.bottom<=window.innerHeight&&getComputedStyle(b).display!=='none'})()"));
  await evaluate("document.querySelector('.lookup-create-actions button').click()");
  assert.equal(await evaluate("!!document.querySelector('.system-lookup-create-dialog')"),false,'Cold source never shows an empty wide dialog');
  await until("!!document.querySelector('.system-lookup-create-dialog [data-field=brandName]:not(:disabled)')",'Create via button');
  await evaluate("Array.from(document.querySelectorAll('.system-lookup-create-dialog button')).find(e=>e.textContent.includes('خروج')).click()");
  await until("!document.querySelector('.system-lookup-create-dialog')",'Cancel create');
  await evaluate(lookup+".querySelector('.number-chevron').click()");
  await until("!!document.querySelector('.component-choice-search')",'Search opened');
  await evaluate("(()=>{const e=document.querySelector('.component-choice-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'997');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()");
  await until("document.querySelectorAll('.person-number-row').length===1&&document.querySelector('.is-active-row textarea')?.value.includes('997')",'Async search result active');
  await evaluate("(()=>{const e=document.querySelector('.component-choice-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'missing');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await until("document.querySelectorAll('.person-number-row').length===0&&document.querySelector('.lookup-create-actions button')?.getBoundingClientRect().height>0",'No matches retains visible Insert action');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Insert',code:'Insert',windowsVirtualKeyCode:45});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Insert',code:'Insert',windowsVirtualKeyCode:45});
  await until("!!document.querySelector('.system-lookup-create-dialog [data-field=brandName]:not(:disabled)')",'Actual brand form opens in Create');
  assert.equal(await evaluate("document.querySelector('.system-lookup-create-dialog').textContent.includes('ثبت و انتخاب')"),false);
  await until("document.querySelector('.system-lookup-create-dialog').textContent.includes('برند موجود')",'Existing brands visible during creation');
  await evaluate("(()=>{for(const [field,value] of [['brandCode','996'],['brandName','برند تازه']]){let e=document.querySelector('.system-lookup-create-dialog [data-field='+field+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F3',code:'F3',windowsVirtualKeyCode:114});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F3',code:'F3',windowsVirtualKeyCode:114});
  await until("!!Array.from(document.querySelectorAll('.system-lookup-create-dialog button')).find(e=>e.textContent.includes('انتخاب')&&!e.textContent.includes('کپی'))",'Save keeps source open for review');
  assert.ok(await evaluate("document.querySelector('.system-lookup-create-dialog tr.is-selected').textContent.includes('برند تازه')"));
  await key('Insert');
  await until("!document.querySelector('.system-lookup-create-dialog [data-field=brandName]').disabled",'Review edit available');
  await evaluate("(()=>{const e=document.querySelector('.system-lookup-create-dialog [data-field=brandName]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'برند اصلاح شده');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await key('F3');
  await until("!!document.querySelector('.system-lookup-create-dialog tr.is-selected')?.textContent.includes('برند اصلاح شده')",'Edited brand stays selected');
  await evaluate("document.querySelector('.system-lookup-create-dialog .base-grid-table-wrap').focus()");
  await key('Enter');
  await until("!document.querySelector('.system-lookup-create-dialog')",'Explicit select returns');
  await until(lookup+".querySelector('[data-field]').value.includes('برند اصلاح شده')",'New brand selected');
  assert.equal(await evaluate("document.querySelector('[data-field=firstName]').value"),'نام حفظ شده');
  await until("document.activeElement?.getAttribute('data-field')==='nationalityId'",'Brand selection restores focus to nationality');
  assert.equal(await evaluate("window.personSaves"),0,'F3 never saves parent person');
  assert.equal(await evaluate("document.querySelector('[data-field=firstName]').disabled"),false,'Person remains in entry mode');
  assert.equal(await evaluate("window.lookupRequests.filter(x=>x==='POST /api/master-data/brands').length"),1,'Exactly one brand save');
  await evaluate(lookup+".querySelector('[data-field]').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8});
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'A',code:'KeyA',modifiers:8});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'A',code:'KeyA',modifiers:8});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft'});
  assert.equal(await evaluate("!!document.querySelector('.system-lookup-create-dialog')"),false,'Shift combination must not create');
  await key('Insert','Insert');
  await until("!!document.querySelector('.system-lookup-create-dialog [data-field=brandCode]:not(:disabled)')",'Insert from display opens once');
  await evaluate("(()=>{for(const [field,value] of [['brandCode','998'],['brandName','برند کلیکی']]){const e=document.querySelector('.system-lookup-create-dialog [data-field='+field+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}document.querySelector('.system-lookup-create-dialog [data-field=brandCode]').focus()})()");
  const saveRect=await evaluate("(()=>{const b=Array.from(document.querySelectorAll('.system-lookup-create-dialog button')).find(e=>e.closest('[data-action-id]')?.dataset.actionId==='operational.save');const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:saveRect.x+saveRect.width/2,y:saveRect.y+saveRect.height/2});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:saveRect.x+saveRect.width/2,y:saveRect.y+saveRect.height/2});
  const afterDown=await evaluate("(()=>{const r=Array.from(document.querySelectorAll('.system-lookup-create-dialog button')).find(e=>e.closest('[data-action-id]')?.dataset.actionId==='operational.save').getBoundingClientRect();return {x:r.x,y:r.y}})()");
  assert.ok(Math.abs(afterDown.x-saveRect.x)<1&&Math.abs(afterDown.y-saveRect.y)<1,'Blur never moves Save button');
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:saveRect.x+saveRect.width/2,y:saveRect.y+saveRect.height/2});
  await until("!!document.querySelector('.system-lookup-create-dialog tr.is-selected')?.textContent.includes('برند کلیکی')",'One real mouse click saves for review');
  await evaluate("document.querySelector('.system-lookup-create-dialog .base-grid-table-wrap').focus()");
  await key('Enter');
  await until("!document.querySelector('.system-lookup-create-dialog')",'Explicit mouse selection returns');
  await until("document.activeElement?.getAttribute('data-field')==='nationalityId'",'Brand selection restores focus to nationality');
  assert.equal(await evaluate("window.personSaves"),0);
  assert.equal(await evaluate("window.lookupRequests.filter(x=>x==='POST /api/master-data/brands').length"),2);
  assert.ok(await evaluate(lookup+".querySelector('[data-field]').value.includes('998')"));
  await evaluate(lookup+".querySelector('.number-chevron').click()");
  await until("!!document.querySelector('.component-clear-choice')",'Blank choice');
  await evaluate("document.querySelector('.component-clear-choice').click()");
  await until(lookup+".querySelector('[data-field]').value===''",'Blank clears brand');
  assert.deepEqual(errors,[]);
  console.log('PASS optional blank choice and first result highlight, ArrowUp/Down, single Enter, visible create button, Insert from search; actual Persons lookup: standard height, blank choice, code/name, Insert real Brands create, save/select, preserved draft');
    await checkOperationalTools({ base, send, evaluate, until, profile })
    assert.deepEqual(errors, [])
  }
} catch(error){console.error(error);process.exitCode=1}
finally{
 socket?.close()
 browser.kill()
 await closed
 assert.ok(profile.startsWith(temporaryRoot + sep))
 await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
