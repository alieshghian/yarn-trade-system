import {revealMenuExpression} from './form-context-navigation.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'

// No new dependency. A fresh headless browser owns only this disposable profile.
const base = process.env.FORM_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER; browser checks must not silently skip')
const profile = await mkdtemp(join(tmpdir(), 'yarn-form-regression-'))
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--window-size=1900,1300', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] })
let socket, session, sequence = 0, navigationLoaded,expectedDialog=false
const pending = new Map(), errors = [], results = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  const endpoint = await new Promise((resolve, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools: ' + logs)), 15000)
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome startup exited ' + code + ': ' + logs)) })
    browser.once('error', reject)
    browser.stderr.on('data', chunk => { logs += String(chunk); const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if(data.method==='Page.loadEventFired')navigationLoaded?.()
    if(data.method==='Page.javascriptDialogOpening'){const accept=expectedDialog;expectedDialog=false;if(!accept)errors.push('Unexpected browser dialog: '+data.params.message);void send('Page.handleJavaScriptDialog',{accept})}
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text)
    const call = pending.get(data.id)
    if (call) { pending.delete(data.id); data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result) }
  })
  const send = (method, params = {}, browserLevel = false) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 15000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId:session } : {}) }))
  })
  const loadedNavigation=async(method,params={})=>{
    let timer
    const loaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('New document did not finish loading: '+method)),20000);navigationLoaded=resolve})
    try{await send(method,params);await loaded}finally{clearTimeout(timer);navigationLoaded=undefined}
  }
  const navigatePage=params=>loadedNavigation('Page.navigate',params)
  const target = await send('Target.createTarget', { url:'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId:target.targetId, flatten:true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true }).catch(error=>{throw new Error(error.message+' '+expression.slice(0,160))})
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result.value
  }
  const until = async (expression, label = expression) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100) }
    console.error('DOM_DIAGNOSTIC', await evaluate("JSON.stringify({fields:[...document.querySelectorAll('[data-field-id]')].map(e=>[e.dataset.fieldId,e.closest('.laboratory-form-frame')!==null]),bodyStart:document.body.textContent.slice(0,600),body:document.body.textContent.slice(-2500)})"), errors)
    throw new Error('Browser assertion timed out: ' + label)
  }
  const node = (text, selector = 'button') => `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.getClientRects().length && (e.getAttribute('aria-label')===${JSON.stringify(text)} || e.textContent.trim()===${JSON.stringify(text)}))`
  const clickExpression = async (expression, button = 'left', modifiers=0) => {
    await revealMenuExpression(expression,{evaluate,send,pause})
    await until(`!!(${expression})`, expression)
    const point = await evaluate(`(async()=>{const e=${expression};e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const current=${expression};const r=current.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', ...point })
    await send('Input.dispatchMouseEvent', { type:'mousePressed', ...point, button, modifiers, clickCount:1 })
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', ...point, button, modifiers, clickCount:1 })
    await pause(100)
  }
  const click = (text, selector) => clickExpression(node(text, selector))
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); results.push(name); console.log('PASS ' + name) }

  const surface=()=>evaluate("(()=>{const s=document.querySelector('.base-form-shell').getBoundingClientRect(),g=document.querySelector('.laboratory-grid').getBoundingClientRect(),e=document.querySelector('.base-form-editor').getBoundingClientRect(),w=document.querySelector('.base-grid-table-wrap');return {width:s.width,height:s.height,gridWidth:g.width,gridHeight:g.height,editorHeight:e.height,scrollTop:w.scrollTop,scrollLeft:w.scrollLeft,columns:[...document.querySelectorAll('.laboratory-grid th[data-column]')].map(n=>({id:n.dataset.column,width:n.getBoundingClientRect().width,font:getComputedStyle(n).fontSize})),tableId:document.querySelector('[data-table-id]')?.dataset.tableId,sectionId:document.querySelector('[data-table-id]')?.dataset.sectionId}})()");
  const queries=()=>evaluate('window.layoutPreviewAudit.syntheticQueries');
  const preview=()=>clickExpression("document.querySelector('.laboratory-operational-preview-toggle')");
  const floatingReturn="(()=>{const b=document.querySelector('.laboratory-operational-preview-toggle'),r=b.getBoundingClientRect(),f=document.querySelector('.laboratory-form-frame').getBoundingClientRect(),a=document.querySelector('.laboratory-form-frame-area').getBoundingClientRect(),p=document.querySelector('[data-form-laboratory]').getBoundingClientRect(),s=getComputedStyle(b);return s.position==='absolute'&&s.backdropFilter.includes('blur')&&['rgba(255, 255, 255, 0.48)','rgba(255, 255, 255, 0.8)'].includes(s.backgroundColor)&&Math.abs(r.top-p.top)<2&&Math.abs(r.right-p.right)<2&&Math.abs(f.top-a.top)<2})()";

  const floatingDesign="(()=>{const b=document.querySelector('.laboratory-operational-preview-toggle'),r=b.getBoundingClientRect(),p=document.querySelector('[data-form-laboratory]').getBoundingClientRect(),s=getComputedStyle(b),f=document.querySelector('.laboratory-form-frame'),before=f.getBoundingClientRect().top;b.style.display='none';const after=f.getBoundingClientRect().top;b.style.removeProperty('display');return s.position==='absolute'&&s.backdropFilter.includes('blur')&&Math.abs(r.top-p.top)<2&&Math.abs(r.right-p.right)<2&&Math.abs(before-after)<1})()";
  const sameGeometry=(a,b)=>{for(const k of ['width','height','gridWidth','gridHeight','editorHeight'])assert.ok(Math.abs(a[k]-b[k])<1,k+' is preserved '+JSON.stringify({before:a[k],after:b[k]}));assert.deepEqual(a.columns,b.columns);assert.equal(a.tableId,b.tableId);assert.equal(a.sectionId,b.sectionId)};
  await navigatePage({url:base+'/tests/form-designer.html?layoutPreview'});
  await until("document.querySelectorAll('.base-grid-virtual-row:not([aria-busy=true])').length>0");
  await click('طراحی ظاهری فرم');await pause(600);
  const fieldSelector="document.querySelector('[data-field-id=firstName] .laboratory-field-select')";
  await clickExpression(fieldSelector);
  await check('the main Laboratory enters preview with a real field selection',"!!document.querySelector('[data-field-id=firstName] .designer-part-selected')");
  const split=await evaluate("(()=>{const r=document.querySelector('.base-form-splitter').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...split,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:split.x,y:split.y+55,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:split.x,y:split.y+55,button:'left',clickCount:1});await pause(200);
  await evaluate("(()=>{const w=document.querySelector('.base-grid-table-wrap');w.scrollTop=3300;w.dispatchEvent(new Event('scroll'))})()");await pause(500);
  await evaluate("window.previewGrid=document.querySelector('.base-grid-boundary');window.previewTable=document.querySelector('.base-grid-table');true");
  await evaluate("(()=>{window.previewPaints=[];document.addEventListener('pointerdown',e=>{if(e.target.closest('.laboratory-operational-preview-toggle'))window.previewPress=performance.now()},true);new MutationObserver(()=>{if(window.previewPress!=null){const start=window.previewPress;window.previewPress=null;requestAnimationFrame(()=>requestAnimationFrame(()=>window.previewPaints.push(performance.now()-start)))}}).observe(document.querySelector('[data-form-laboratory]'),{attributes:true,attributeFilter:['data-operational-preview']})})()");
  await check('Design preview button floats at upper-right and reserves no layout space',floatingDesign);
  const before=await surface();assert.ok(before.scrollTop>1000);
  assert.ok(await evaluate("document.querySelector('.base-grid-table').getAttribute('aria-rowcount')==='100001'"));
  for(let i=0;i<3;i++){
    const previousQueries=await queries(),started=Date.now();await preview();await until("!!document.querySelector('[data-operational-preview]')&&!!document.querySelector('[data-layout-preview]')");await pause(350);
    const paint=await evaluate('window.previewPaints.at(-1)');console.log('PREVIEW_PAINT_MS',i,paint);
    assert.ok(Number.isFinite(paint)&&paint<750,'actual pointer-to-paint latency stays below 750ms: '+paint);
    assert.equal(await queries(),previousQueries,'a chrome-only toggle does not recreate the virtual query');
    await check('the same mounted 100000-row grid remains populated and bounded, cycle '+i,"window.previewGrid===document.querySelector('.base-grid-boundary')&&window.previewTable===document.querySelector('.base-grid-table')&&document.querySelector('.base-grid-table').getAttribute('aria-rowcount')==='100001'&&document.querySelectorAll('.base-grid-virtual-row:not([aria-busy=true])').length>0&&document.querySelectorAll('.base-grid-virtual-row').length<150");
    await check('only authoring chrome is hidden, without fake row guides, cycle '+i,"getComputedStyle(document.querySelector('.base-grid-table tbody')).display!=='none'&&getComputedStyle(document.querySelector('.base-grid-table-wrap')).backgroundImage==='none'&&[...document.querySelectorAll('.form-laboratory-banner,.laboratory-form-access,.laboratory-designer-pane,.laboratory-field-select,.designer-edge-handle,.form-table-structure-trigger,.laboratory-form-management,.designer-action-bar-select')].every(n=>!n.getClientRects().length)");
    if(i===0){await pause(5500);await evaluate("window.rerenderPreviewFixture();window.dispatchEvent(new Event('resize'))");await pause(150);}
    await check('selected field chrome is hidden without clearing its selection, cycle '+i,"(()=>{const n=document.querySelector('[data-field-id=firstName] .designer-part-selected');return !!n&&getComputedStyle(n).outlineStyle==='none'})()");
    await check('glass return button floats at the page upper-right without reserving top or side space, cycle '+i,floatingReturn);
    const current=await surface();sameGeometry(before,current);assert.equal(current.scrollTop,before.scrollTop);assert.equal(current.scrollLeft,before.scrollLeft);
    await check('the real form is centered inside the available workspace, cycle '+i,"(()=>{const f=document.querySelector('.laboratory-form-frame').getBoundingClientRect(),a=document.querySelector('.laboratory-form-frame-area').getBoundingClientRect();return f.width>a.width||Math.abs((f.left+f.right)/2-(a.left+a.right)/2)<2})()");
    await evaluate("document.querySelector('.laboratory-form-frame-area').focus({preventScroll:true})");
    for(const [key,code,mods] of [['ArrowDown','ArrowDown',0],['z','KeyZ',2],['l','KeyL',2],['ArrowDown','ArrowDown',1]])for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers:mods});
    sameGeometry(before,await surface());
    if(i===0){const w=await evaluate("(()=>{const r=document.querySelector('.base-grid-table-wrap').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await send('Input.dispatchMouseEvent',{type:'mouseWheel',...w,deltaX:0,deltaY:120});await pause(250);await check('native table scrolling remains available in visual preview',"document.querySelector('.base-grid-table-wrap').scrollTop>"+before.scrollTop);}
    if(i===2)await writeFile(resolve('../review-artifacts/laboratory-preserved-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
    await preview();await until("!document.querySelector('[data-operational-preview]')");await pause(200);
    sameGeometry(before,await surface());assert.equal((await surface()).scrollTop,before.scrollTop);
    await check('return restores authoring chrome even after a background React render, cycle '+i,"document.querySelector('.form-laboratory-banner').getClientRects().length>0&&document.querySelector('.laboratory-form-access').getClientRects().length>0&&!!document.querySelector('[data-field-id=firstName] .designer-part-selected')");
    await check('return preserves the mounted table, split and Designer, cycle '+i,"window.previewTable===document.querySelector('.base-grid-table')&&!!document.querySelector('[data-designer-active]')");
  }
  // The original Laboratory is verified before exercising the inherited form.
  await writeFile(resolve('../review-artifacts/laboratory-preview-return.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await navigatePage({url:base+'/tests/form-designer.html?treeGeometry&treeInline&treeReport&layoutPreview'});await until("document.querySelectorAll('.cascading-tree-column').length===5&&document.querySelectorAll('.laboratory-grid th[data-column]').length===6");await pause(600);
  await check('Product Group design button also floats without reserved space',floatingDesign);
  const treeBefore=await surface(),treeRows=await evaluate("document.querySelectorAll('.laboratory-grid tbody tr').length");assert.ok(treeRows>1);
  const savedBefore=await evaluate("localStorage.getItem('yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression')");
  const recoveryState=()=>evaluate("(async()=>{const {readFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');const d=readFormRecovery(localStorage,'isolated-browser-regression').documents['form.tree-geometry'];return JSON.stringify({present:d.current.designerHistory.present,schema:d.current.form.schema,past:d.current.designerHistory.past.length,versions:d.versions.length})})()");
  const recoveryBefore=await recoveryState();await evaluate("window.previewTable=document.querySelector('.base-grid-table');true");
  await preview();await until("!!document.querySelector('[data-layout-preview]')");await pause(250);
  sameGeometry(treeBefore,await surface());
  await check('Product Group inherits the floating glass return button',floatingReturn);
  await check('Product Group inherits chrome-only preview with the same six columns and every report row',"window.previewTable===document.querySelector('.base-grid-table')&&document.querySelectorAll('.laboratory-grid tbody tr').length==="+treeRows+"&&document.querySelectorAll('.cascading-tree-column').length===5");
  assert.equal(await evaluate("localStorage.getItem('yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression')"),savedBefore);
  await writeFile(resolve('../review-artifacts/layout-preview.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await preview();await until("!document.querySelector('[data-layout-preview]')");sameGeometry(treeBefore,await surface());
  assert.equal(await recoveryState(),recoveryBefore,'preview adds no design-history step or data mutation');
  await check('return retains a disjoint input surface and the complete real report header',"(()=>{const e=document.querySelector('.base-form-editor').getBoundingClientRect(),g=document.querySelector('.laboratory-grid').getBoundingClientRect();return g.top>=e.bottom&&[...document.querySelectorAll('.laboratory-grid th[data-column]')].every(n=>n.getBoundingClientRect().height>20)})()");
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results}));
} catch(error){console.error(error);process.exitCode=1} finally {socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()),'cleanup stays in its temporary directory');await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
