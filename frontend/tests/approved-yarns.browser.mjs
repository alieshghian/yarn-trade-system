import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    if (data.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true})
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






 const press = async (key, code, windowsVirtualKeyCode) => {
  for (const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode})
 }
 await send('Page.navigate',{url:base+'/tests/approved-yarns.html?empty'});await until("document.querySelector('[data-approved-yarn-release]')",'approved form');
 await until("document.body.innerText.includes('رکوردی یافت نشد')",'empty persisted dataset');assert.equal(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length"),0);
 await send('Page.navigate',{url:base+'/tests/approved-yarns.html'});await until("document.querySelectorAll('tbody tr[data-row-index]').length===2",'two real color rows');
 await evaluate("document.querySelector('tbody tr[data-row-index]').click()");
 await until("document.querySelector('[data-field=name]')?.value==='DTY'",'master loaded from selected report row');
 assert.equal(await evaluate("document.querySelectorAll('[data-field-id]').length"),18,'all approved fields retained');
 assert.equal(await evaluate("document.querySelectorAll('[data-runtime-action=save]').length"),0,'save hidden during view');
 // Compare to the saved section Canvas, not the legacy root Canvas.
 const visual=await evaluate(`(()=>{const d=window.approvedYarnDesigner,s=window.approvedYarnSchema,section=s.sections.find(x=>x.kind==='editor'),c=d.sectionCanvases[section.id],parts=['input','label'];return s.fields.flatMap(f=>parts.map(part=>{const e=document.querySelector('[data-field-id="'+f.id+'"] .designer-'+part+'-part'),r=e.getBoundingClientRect();return {id:f.id,part,actual:{left:r.left,top:r.top,width:r.width,height:r.height},expected:c.fields[f.id][part]}}))})()`);
 await writeFile('../artifacts/yarn-operational-integration/owner-visual-geometry.json',JSON.stringify(visual,null,2));
 const origin=visual.find(x=>x.id==='code'&&x.part==='input');
 for(const r of visual){for(const key of ['width','height'])assert.ok(Math.abs(r.actual[key]-r.expected[key])<0.11,r.id+' '+r.part+' saved '+key);for(const key of ['left','top'])assert.ok(Math.abs((r.actual[key]-origin.actual[key])-(r.expected[key]-origin.expected[key]))<0.11,r.id+' '+r.part+' section-relative '+key)}
 assert.equal(await evaluate("document.querySelectorAll('[data-derived-field]').length"),1,'derived name uses the Laboratory output instead of an input box');
 console.log('PASS all 18 fields and labels match the owner section Canvas within 0.1px; derived display uses the Laboratory output');

 await evaluate("document.querySelector('.excel-filter-trigger').click()");
 await until("document.querySelector('.shared-excel-filter-menu')",'operational filter overlays form');
 await until("window.approvedYarnCalls.some(c=>c.body?.optionsColumn)",'filter values requested from server');
 await evaluate("[...document.querySelectorAll('.shared-excel-filter-menu button')].find(b=>b.textContent.includes('مرتب‌سازی صعودی')).click()");
 await until("window.approvedYarnCalls.some(c=>c.body?.sort?.length)",'sort delegated to server');
 await evaluate("document.querySelector('.grid-search-control input').focus()");await send('Input.insertText',{text:'DTY'});
 await until("window.approvedYarnCalls.some(c=>c.body?.search==='DTY')",'search delegated to server');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119});
 await until("window.approvedYarnCalls.filter(c=>c.path.endsWith('definition-grid')).at(-1)?.body.search===''",'F8 resets server query');
 await evaluate("[...document.querySelectorAll('.laboratory-footer button')].find(b=>b.textContent.includes('ویرایش')).click()");
 await until("document.querySelector('[data-entry-active]')",'edit mode');assert.equal(await evaluate("document.querySelectorAll('.laboratory-footer button').length"),2,'only save and cancel during entry');
 assert.equal(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length"),2,'grid remains populated during entry');
 await evaluate("document.querySelector('[data-field-id=material] .number-add-button').click()");
 await until("document.querySelector('.person-number-list .new-number-row textarea')",'saved title component opens a text entry');
 assert.equal(await evaluate("document.querySelectorAll('.person-number-list input[type=tel],.person-number-list .dial-code-input').length"),0,'material never opens a phone editor');
 await send('Input.insertText',{text:'پلی‌استر آزمایش'});
 assert.equal(await evaluate("document.querySelector('.person-number-list .new-number-row textarea').value"),'پلی‌استر آزمایش','text entry preserves Persian letters');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until("!document.querySelector('.person-number-list')",'text editor cancellation');
 console.log('PASS saved title component uses text entry with no phone/dial-code controls');

 await evaluate("document.querySelector('[data-field=name]').focus();document.querySelector('[data-field=name]').setSelectionRange(0,0)");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 await until("document.activeElement.dataset.field!=='name'",'shared caret-aware previous field navigation');
 await evaluate("document.querySelector('[data-field=code]').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until("document.activeElement.dataset.field==='name'",'approved Enter order');
 await evaluate("document.querySelector('[data-field=code]').focus()");
 const entryFill=await evaluate(`['name','notes','filamentNumber'].map(id=>getComputedStyle(document.querySelector('[data-field="'+id+'"]')).backgroundColor)`);
 assert.deepEqual(entryFill,['rgb(216, 216, 216)','rgb(216, 216, 216)','rgb(216, 216, 216)'],'native controls inherit the shared gray entry fill');
 await evaluate("document.querySelector('[data-field=name]').focus()");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-field=name]')).backgroundColor"),await evaluate("(()=>{const e=document.createElement('span');e.style.color='var(--form-entry-focus-background,#ffffe0)';document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c})()"),'focused name inherits the shared pale yellow fill');
 console.log('PASS shared entry colors for name, notes and numeric controls');

 await evaluate("(()=>{const e=document.querySelector('[data-field=name]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'FDY');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await until("document.querySelector('[data-derived-field]').textContent.includes('FDY')",'shared derived-name rules');
 for(const failure of ['conflict','network']){
  await evaluate(`window.failNextYarnSave=${JSON.stringify(failure)};document.querySelector('[data-runtime-action=save]').click();document.querySelector('[data-runtime-action=save]').click()`);
  await until("document.querySelector('[role=alert]')&&!document.querySelector('[data-runtime-action=save]').disabled",'failed save reports error and permits retry');
  assert.equal(await evaluate("document.querySelector('[data-field=name]').value"),'FDY','failed save retains editor input');
  assert.equal(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length"),2,'failed save retains real rows');
 }
 await evaluate("document.querySelector('[data-runtime-action=save]').click();document.querySelector('[data-runtime-action=save]').click()");await until("!document.querySelector('[data-entry-active]')",'one-click save');
 assert.equal(await evaluate("window.approvedYarnCalls.filter(c=>c.method==='PUT'&&c.path.startsWith('/api/yarns/')).length"),3,'one authoritative submission per attempt even during async validation');
 const saved=await evaluate("window.approvedYarnMaster()");assert.equal(saved.name,'FDY');assert.equal(saved.definition.colors.length,2);assert.equal(saved.definition.packaging[0].cbmPerTon,2.74);
 assert.equal(await evaluate("document.querySelectorAll('[data-runtime-action=save]').length"),0);
 const geometry=await evaluate(`Array.from(document.querySelectorAll('[data-field-id]')).map(e=>{const part=e.querySelector('.designer-input-part'),control=part.querySelector('input,textarea,select,.person-number-control');return {id:e.dataset.fieldId,part:part.getBoundingClientRect().toJSON(),control:control?.getBoundingClientRect().toJSON()}})`);
 await writeFile('../artifacts/yarn-operational-integration/approved-geometry.json',JSON.stringify(geometry,null,2));
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('../artifacts/yarn-operational-integration/approved-preview.png',Buffer.from(shot.data,'base64'));
 await evaluate("document.querySelector('.base-grid-table-wrap').focus()");
 const latestRequests=await evaluate("approvedYarnCalls.filter(c=>c.path.endsWith('/definition-latest')).length");
 await press('F4','F4',115);
 await until("document.querySelector('[data-field=code]')?.value==='002'",'copy uses approved server code suggestion');
 await evaluate("document.querySelector('[data-field=code]').focus()");
 assert.equal(await evaluate("document.querySelector('[data-field=code]').selectionEnd"),3,'suggestion selected for replacement');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until("!document.querySelector('[data-entry-active]')&&document.querySelector('[data-field=name]')?.value==='FDY'",'copy cancellation restores selected original');
 assert.equal(await evaluate("approvedYarnCalls.filter(c=>c.path.endsWith('/definition-latest')).length"),latestRequests,'F4 copies selection without loading latest');
 await evaluate("document.querySelector('.base-grid-table-wrap').focus()");await press('F2','F2',113);
 await until("document.querySelector('[data-entry-active]')&&document.querySelector('[data-field=name]').value==='FDY'",'F2 copies the server latest');
 assert.equal(await evaluate("approvedYarnCalls.filter(c=>c.path.endsWith('/definition-latest')).length"),latestRequests+1);
 await press('Escape','Escape',27);await until("!document.querySelector('[data-entry-active]')",'cancel F2 draft');
 await evaluate("document.querySelector('.base-grid-table-wrap').focus()");await press(' ','Space',32);
 await until("document.querySelector('[data-field=code]')?.value==='002'",'new entry from existing selection');
 assert.equal(await evaluate("document.querySelector('[data-field=name]').value"),'','new entry has no demo values');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until("!document.querySelector('[data-entry-active]')&&document.querySelector('[data-field=name]')?.value==='FDY'",'new cancellation restores original without inserting a row');
 await evaluate("document.querySelector('.base-grid-table-wrap').focus()");await press('Insert','Insert',45);
 await until("document.querySelector('[data-entry-active]')&&document.querySelector('[data-field=name]').value==='FDY'",'Insert edits selected Yarn');
 await press('F3','F3',114);await until("!document.querySelector('[data-entry-active]')&&approvedYarnCalls.filter(c=>c.method==='PUT'&&c.path.startsWith('/api/yarns/')).length===4",'F3 commits one edit');
 await evaluate("document.querySelector('tbody tr[data-row-index] td').click()");
 await until("!!document.querySelector('tbody tr.is-selected')",'Yarn row selected before Delete');
 await press('Delete','Delete',46);
 await until("approvedYarnMaster().definition.colors.length===1&&document.querySelectorAll('tbody tr[data-row-index]').length===1",'Delete removes only the selected color');
 const deleted=await evaluate("approvedYarnCalls.find(c=>c.path==='/api/yarns/bulk-delete').body.rows");
 assert.deepEqual(deleted.map(r=>r.id),['33333333-3333-3333-3333-333333333333']);
 await send('Page.navigate',{url:base+'/tests/approved-yarns.html?viewer'});
 await until("document.querySelector('[data-action-id=\"operational.new\"] button')?.disabled",'viewer actions disabled');
 await evaluate("document.querySelector('.base-grid-table-wrap').focus()");
 for(const [key,code,vk] of [[' ','Space',32],['F2','F2',113],['F4','F4',115],['Insert','Insert',45],['Delete','Delete',46],['F3','F3',114]]) await press(key,code,vk);
 assert.equal(await evaluate("!!document.querySelector('[data-entry-active]') || approvedYarnCalls.some(c=>['PUT','DELETE'].includes(c.method)||c.path.endsWith('/bulk-delete'))"),false,'Read-only keyboard cannot enter mutation paths');
 console.log('PASS Approved Yarn physical Space F2 F4 Insert F3 Escape and Delete protect mode, selection and permissions');
 await send('Page.navigate',{url:base+'/tests/approved-yarns.html?large'});
 await until("document.querySelectorAll('tbody tr[data-row-index]').length>10",'bounded large report page');
 assert.ok(await evaluate("document.querySelectorAll('tbody tr[data-row-index]').length<=500"),'100000 total records never render the whole dataset');
 const header=await evaluate(`(()=>{const h=document.querySelector('thead th'),r=h.getBoundingClientRect();let s=h.parentElement;while(s&&!(s.scrollHeight>s.clientHeight+5&&['auto','scroll'].includes(getComputedStyle(s).overflowY)))s=s.parentElement;if(!s)throw Error('Missing internal report scroller');s.dataset.acceptanceScroll='true';return {top:r.top}})()`);
 await evaluate("document.querySelector('[data-acceptance-scroll]').scrollTop=200");await pause(200);
 assert.ok(await evaluate(`Math.abs(document.querySelector('thead th').getBoundingClientRect().top-${header.top})<2`),'header stays fixed during report scroll');
 await evaluate("document.querySelector('.excel-filter-trigger').click()");await until("document.querySelector('.shared-excel-filter-menu')",'sticky header filter remains usable');
 if(process.env.FORM_TEST_EXPECT_ACTIVATED==='1'){
  assert.deepEqual(await evaluate(`(async()=>{const {approvedYarnRouteActive}=await import('/src/forms/YarnsOperationalRoute.tsx');const {integratedDesignReleases}=await import('/src/components/base-form/formIntegrationRegistry.ts');const changed=patch=>integratedDesignReleases.map(item=>item.route==='yarns'?patch(structuredClone(item)):item);return {active:approvedYarnRouteActive(),withoutReceipt:approvedYarnRouteActive([]),wrongDigest:approvedYarnRouteActive(changed(item=>({...item,digest:'0'.repeat(64)}))),wrongBaseline:approvedYarnRouteActive(changed(item=>({...item,replacement:{...item.replacement,sourceBaselineDigest:'0'.repeat(64)}}))),missingEvidence:approvedYarnRouteActive(changed(item=>({...item,acceptance:undefined})))}})()`),{active:true,withoutReceipt:false,wrongDigest:false,wrongBaseline:false,missingEvidence:false});
  console.log('PASS exact approved release activates; missing receipt, wrong digest/baseline or missing acceptance retain the legacy route');
 }
 assert.deepEqual(errors,[]);console.log('PASS approved immutable schema, empty API dataset, master/colors grid binding, populated grid during edit, derived name, saved identity, one-click Save, bounded 100000-total report and sticky header controls');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



