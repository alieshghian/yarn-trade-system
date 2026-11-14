import {revealMenuExpression} from './form-context-navigation.mjs'
import assert from 'node:assert/strict'
import {runNeighborScenarios} from './form-neighbor.scenarios.mjs'
import {runSmartLayoutScenarios} from './form-smart-layout.scenarios.mjs'
import {runToolbarContractScenarios} from './toolbar-contract.scenarios.mjs'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readFormRecovery } from '../src/components/base-form/formDocumentRecovery.ts'
import { ensureProductGroupReportTable } from '../src/components/base-form/productGroupLaboratoryForm.ts'
import { managedFormWithDesigner, resolveManagedLaboratoryDesigner } from '../src/components/base-form/laboratoryFormDraftState.ts'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'

// No new dependency. A fresh headless browser owns only this disposable profile.
const base = process.env.FORM_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER; browser checks must not silently skip')
const profile = await mkdtemp(join(tmpdir(), 'yarn-form-regression-'))
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--window-size=1900,1300', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] })
let socket, session, sequence = 0, navigationLoaded,expectedDialog=false
const pending = new Map(), errors = [], results = [], failures = []
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 60000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId:session } : {}) }))
  })
  const loadedNavigation=async(method,params={})=>{
    let timer
    const loaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('New document did not finish loading: '+method)),20000);navigationLoaded=resolve})
    try{await send(method,params);await loaded}finally{clearTimeout(timer);navigationLoaded=undefined}
  }
  const reloadPage=()=>loadedNavigation('Page.reload')
  const navigatePage=params=>loadedNavigation('Page.navigate',params)
  const target = await send('Target.createTarget', { url:'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId:target.targetId, flatten:true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true })
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result.value
  }
  const until = async (expression, label = expression) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) { if (await evaluate('Boolean(' + expression + ')')) return; await pause(100) }
    console.error('DOM_DIAGNOSTIC', await evaluate("JSON.stringify({fields:[...document.querySelectorAll('[data-field-id]')].map(e=>[e.dataset.fieldId,e.closest('.laboratory-form-frame')!==null]),body:document.body.textContent.slice(-2500)})"), errors)
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
  const check = async (name, expression) => {if(await evaluate(expression)){results.push(name);console.log('PASS '+name)}else{failures.push(name);console.error('FAIL '+name)}}
  const dragRaw=async(expression,dx,dy=0)=>{const p=await evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await pause(180)}


  await navigatePage({url:base+'/tests/form-designer.html?treeGeometry&treeInline&treeReport'});
  await until("document.querySelectorAll('.cascading-tree-column').length===5&&document.querySelectorAll('.laboratory-grid th[data-column]').length===6");
  await check('exact existing standard grid with six real schema columns',"document.querySelectorAll('.base-grid-boundary').length===1&&document.querySelectorAll('[data-table-id=\"form.tree-geometry.report\"] th[data-column]').length===6");
  await check('default panels compact, explicit height preserved',"(()=>{const c=[...document.querySelectorAll('.cascading-tree-column')].map(e=>e.getBoundingClientRect().height);return Math.abs(c[1]-358)<2&&c.filter((_,i)=>i!==1).every(h=>Math.abs(h-312)<2)})()");
  await check('search stays beneath each heading and Add stays at bottom',"[...document.querySelectorAll('.cascading-tree-column')].every(c=>{const h=c.querySelector('.cascading-tree-column-head').getBoundingClientRect(),s=c.querySelector('.cascading-tree-search').getBoundingClientRect(),b=c.querySelector('.cascading-tree-column-foot').getBoundingClientRect();return s.top>=h.bottom-1&&s.bottom<b.top&&b.bottom<=c.getBoundingClientRect().bottom+1})");
  await check('grid directly follows tree without hidden grid parent',"(()=>{const t=document.querySelector('.cascading-tree-panels').getBoundingClientRect(),g=document.querySelector('.laboratory-grid').getBoundingClientRect();return g.height>200&&g.top>=t.bottom-2&&g.top-t.bottom<100})()");
  await check('grid container initially matches form width',"Math.abs(document.querySelector('.laboratory-grid').getBoundingClientRect().width-document.querySelector('.laboratory-editor').getBoundingClientRect().width)<4");
  await check('independent title begins at editor top and spans the report width',"(()=>{const h=document.querySelector('.cascading-tree-header').getBoundingClientRect(),e=document.querySelector('.laboratory-editor').getBoundingClientRect(),g=document.querySelector('.laboratory-grid').getBoundingClientRect();return Math.abs(h.top-e.top)<2&&Math.abs(h.left-g.left)<2&&Math.abs(h.right-g.right)<2})()");
  await check('schema layout contract has no warnings',"!document.querySelector('.form-document-layout-warning')");
  await writeFile(resolve('../review-artifacts/tree-report-current.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await evaluate("document.querySelector('.cascading-tree-panels').style.height='800px';true");
  await check('tall outer container cannot stretch default columns',"Math.abs(document.querySelector('.cascading-tree-column').getBoundingClientRect().height-312)<2");
  await evaluate("document.querySelector('.cascading-tree-panels').style.height='';true");
  const col="document.querySelector('th[data-column=\"product-group.cascading-tree.level.0\"]')";
  const widths=await evaluate("[...document.querySelectorAll('.laboratory-grid th[data-column]')].map(e=>e.getBoundingClientRect().width)");
  await clickExpression(col);
  await dragRaw(col+".querySelector('.base-grid-resizer')",-32,0);
  await check('actual standard resizer changes only the selected column',"(()=>{const a=[...document.querySelectorAll('.laboratory-grid th[data-column]')].map(e=>e.getBoundingClientRect().width),b="+JSON.stringify(widths)+";return Math.abs(a[1]-b[1])>20&&a.every((w,i)=>i===1||Math.abs(w-b[i])<2)})()");
  const resized=await evaluate(col+'.getBoundingClientRect().width');
  await click('ذخیرهٔ فرم','.form-laboratory-banner button'); await click('تأیید مجوزها و ذخیره','[role=\"dialog\"] button');
  await reloadPage();
  await until("document.querySelectorAll('.laboratory-grid th[data-column]').length===6");
  await check('column width and six-column schema survive save/reopen in isolated storage',"Math.abs(("+col+").getBoundingClientRect().width-"+resized+")<2&&JSON.parse(localStorage.getItem('yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression')).forms.find(f=>f.id==='form.tree-geometry').schema.tables[0].columns.length===6");
  await click('آزمایش فرم کامل');
  await until("document.querySelector('[data-runtime-action=\"create\"]')");
  await check('existing nodes have one report row each with stable data',"document.querySelector('.laboratory-grid').textContent.includes('57')&&document.querySelector('.laboratory-grid').textContent.includes('001')");
  await click('⟳ نمایش همه');
  await check('long root list scrolls internally',"(()=>{const e=document.querySelector('.cascading-tree-items');return e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'})()");
  const search="document.querySelector('.laboratory-grid .grid-search-control input')";
  await clickExpression(search);await send('Input.insertText',{text:'براق'});
  await until("document.querySelector('.laboratory-grid .base-grid-table tbody').textContent.includes('براق')&&!document.querySelector('.laboratory-grid .base-grid-table tbody').textContent.includes('گروه آزمایش')",'debounced standard grid search completes');
  await check('standard grid search operates on bound hierarchy rows',"document.querySelector('.laboratory-grid .base-grid-table tbody').textContent.includes('براق')&&!document.querySelector('.laboratory-grid .base-grid-table tbody').textContent.includes('گروه آزمایش')");
  await clickExpression("document.querySelector('.laboratory-grid .base-grid-table tbody td[data-column=\"product-group.cascading-tree.level.0\"]')");
  await check('supported row selection synchronizes full tree path',"document.querySelector('.cascading-tree-path-text').textContent.includes('براق')");
  await check('standard sort and filter controls remain available',"document.querySelectorAll('.laboratory-grid .excel-filter-trigger').length===6");
  const backupPath=process.env.FORM_TREE_BACKUP||'C:/Users/TechnoDarvish/Downloads/GlobalTrade-ProductGroup-BrowserBackup.json';
  {
    const backupBytes=existsSync(backupPath)?await readFile(backupPath):null, backupHash=backupBytes?createHash('sha256').update(backupBytes).digest('hex'):null;
    const originalId='form.new.8e77aae6-9477-41f9-b473-9d52511535a1';let snapshot;
    if(backupBytes){
      const backup=JSON.parse(backupBytes),records=new Map(backup.records.map(record=>[record.key,record.value]));
      const recoveryKey=[...records.keys()].find(key=>key.startsWith('yarn-trade:form-document-recovery:v1:'));assert.ok(recoveryKey,'Backup recovery record is present');
      const journal=readFormRecovery({getItem:key=>records.get(key)??null},decodeURIComponent(recoveryKey.slice('yarn-trade:form-document-recovery:v1:'.length)));
      snapshot=journal?.documents[originalId]?.current;assert.ok(snapshot,'Exact saved form is readable');
      console.log('Using read-only saved backup in disposable storage');
    }else{
      const form=await evaluate("JSON.parse(localStorage.getItem('yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression')).forms.find(form=>form.id==='form.tree-geometry')");
      const draft=resolveManagedLaboratoryDesigner(form);form.frame={device:'desktop',width:1214,height:920,fitToPage:false};
      draft.layoutMode='canvas';draft.canvas={width:1480,height:480,fields:{'product-group.cascading-tree':{input:{left:24,top:38,width:1338,height:461},label:{left:24,top:8,width:1338,height:20}}}};
      for(let i=0;i<5;i++)draft.overrides['product-group.cascading-tree.tree.'+i+'.column::input']={width:i===0?209:207,height:i===0?370:358};
      snapshot={form,designerHistory:{present:draft,past:[],future:[]},structureHistory:{present:form.schema,past:[],future:[]}};
      console.log('Using synthetic legacy-layout fixture; no user backup accessed');
    }
    const recovered=structuredClone(snapshot); recovered.form.schema=ensureProductGroupReportTable(recovered.form.schema);
    recovered.form=managedFormWithDesigner(recovered.form,recovered.designerHistory.present);
    const seeded=JSON.parse(JSON.stringify(recovered).replaceAll(originalId,'form.tree-geometry'));
    seeded.designerHistory={present:seeded.designerHistory.present,past:[],future:[]}; seeded.structureHistory={present:seeded.form.schema,past:[],future:[]};
    const seedScript=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const snapshot=${JSON.stringify(seeded)},key='yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression',collection=JSON.parse(localStorage.getItem(key));collection.forms=collection.forms.map(form=>form.id===snapshot.form.id?snapshot.form:form);localStorage.setItem(key,JSON.stringify(collection));localStorage.setItem('yarn-trade:form-document-recovery:v1:isolated-browser-regression',JSON.stringify({version:1,activeFormId:snapshot.form.id,documents:{[snapshot.form.id]:{current:snapshot,versions:[],updatedAt:new Date().toISOString()}}}));})()`});
    await reloadPage();await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedScript.identifier});await until("document.querySelectorAll('.cascading-tree-column').length===5&&document.querySelectorAll('.laboratory-grid th[data-column]').length===6");
    await evaluate("window.dispatchEvent(new CustomEvent('open-form-design-draft',{detail:{id:'form.tree-geometry'}}));true");await pause(300);
    await check('saved legacy canvas projects title and full input surface to report edges',"(()=>{const g=document.querySelector('.laboratory-grid').getBoundingClientRect(),h=document.querySelector('.cascading-tree-header').getBoundingClientRect(),b=document.querySelector('.cascading-tree-body').getBoundingClientRect(),e=document.querySelector('.laboratory-editor').getBoundingClientRect();return Math.abs(g.left-h.left)<2&&Math.abs(g.right-h.right)<2&&Math.abs(b.left-h.left)<2&&Math.abs(b.right-h.right)<2&&Math.abs(h.top-e.top)<2})()");
    const originalSizes=seeded.designerHistory.present.overrides;
    await check('saved individual panel dimensions are preserved',`[...document.querySelectorAll('.cascading-tree-column')].every((e,i)=>{const value=${JSON.stringify(originalSizes)}['product-group.cascading-tree.tree.'+i+'.column::input'],r=e.getBoundingClientRect();return (!value?.height||Math.abs(r.height-value.height)<2)&&(!value?.width||Math.abs(r.width-value.width)<2)})`);
    await clickExpression("document.querySelector('[data-field-id=\"product-group.cascading-tree.tree.body\"] > .laboratory-field-select')");
    const closedColorSection="(()=>{let e=document.querySelector('[data-designer-color-property=\"backgroundColor\"] .excel-color-trigger');const a=[];while(e){if(e.tagName==='DETAILS'&&!e.open)a.push(e);e=e.parentElement}return a.at(-1)?.querySelector(':scope > summary')})()";
    for(let i=0;i<5&&await evaluate(`!!(${closedColorSection})`);i++)await clickExpression(closedColorSection);
    await clickExpression("document.querySelector('[data-designer-color-property=\"backgroundColor\"] .excel-color-trigger')");
    await until("document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]')");
    const colorPoint=await evaluate("(()=>{const r=document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...colorPoint});await pause(150);
    await check('live background preview colors the complete surface without coloring the title or columns',"getComputedStyle(document.querySelector('.cascading-tree-body')).backgroundColor==='rgb(0, 112, 192)'&&getComputedStyle(document.querySelector('.cascading-tree-column')).backgroundColor!=='rgb(0, 112, 192)'&&getComputedStyle(document.querySelector('.cascading-tree-header')).backgroundColor!=='rgb(0, 112, 192)'");
    await clickExpression("document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]')");
    await click('ذخیرهٔ فرم','.form-laboratory-banner button');await click('تأیید مجوزها و ذخیره','[role="dialog"] button');await reloadPage();await until("document.querySelector('.cascading-tree-body')");
    await check('surface background survives saved-form reopen',"getComputedStyle(document.querySelector('.cascading-tree-body')).backgroundColor==='rgb(0, 112, 192)'");
    const heights=await evaluate("[...document.querySelectorAll('.cascading-tree-column')].map(e=>e.getBoundingClientRect().height)");
    await dragRaw("document.querySelector('.base-form-splitter')",0,80);
    await check('splitter enlarges surface including empty space beneath columns',"(()=>{const body=document.querySelector('[data-field-id=\"product-group.cascading-tree.tree.body\"] > div > .designer-input-part').getBoundingClientRect(),e=document.querySelector('.laboratory-editor').getBoundingClientRect();return Math.abs(body.bottom-e.bottom)<3&&getComputedStyle(document.querySelector('.cascading-tree-body')).backgroundColor==='rgb(0, 112, 192)'})()");
    await dragRaw("document.querySelector('.base-form-splitter')",0,-400);
    await check('splitter stops at fields without shrinking or covering them',`(()=>{const pane=document.querySelector('.base-form-editor').getBoundingClientRect(),grid=document.querySelector('.laboratory-grid').getBoundingClientRect(),a=[...document.querySelectorAll('.cascading-tree-column')];return a.every((e,i)=>Math.abs(e.getBoundingClientRect().height-${JSON.stringify(heights)}[i])<2&&e.getBoundingClientRect().bottom<=pane.bottom+1)&&grid.top>=pane.bottom})()`);
    await evaluate("window.getSelection()?.removeAllRanges();true");
    await writeFile(resolve('../review-artifacts/tree-report-design.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
    await click('نمای عملیاتی');await pause(300);
    await check('operational preview retains title full width and visible report header',"(()=>{const h=document.querySelector('.cascading-tree-header').getBoundingClientRect(),g=document.querySelector('.laboratory-grid').getBoundingClientRect(),ths=[...document.querySelectorAll('.laboratory-grid th[data-column]')];return Math.abs(h.left-g.left)<2&&Math.abs(h.right-g.right)<2&&h.height>20&&ths.length===6&&ths.every(th=>{const r=th.getBoundingClientRect();return r.top>=g.top&&r.bottom<=g.bottom})})()");
    const captureBounds=await evaluate("(()=>{const r=document.querySelector('.laboratory-form-frame').getBoundingClientRect();return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:r.width,height:r.height,scale:1}})()");
    await writeFile(resolve('../review-artifacts/tree-report-operational.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',clip:captureBounds,captureBeyondViewport:true})).data,'base64'));
    if(backupHash)assert.equal(createHash('sha256').update(await readFile(backupPath)).digest('hex'),backupHash,'Original backup is untouched');
  }
  console.log(JSON.stringify({passed:results.length,results,failures}));assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
} catch(error) {
  console.error(error)
  process.exitCode=1
} finally {
  socket?.close(); browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()), 'cleanup stays inside its own temporary directory')
  assert.ok(basename(profile).startsWith('yarn-form-regression-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
