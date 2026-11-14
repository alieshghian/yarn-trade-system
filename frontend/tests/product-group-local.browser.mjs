import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { writeFile } from 'node:fs/promises'

const url='http://127.1.0.1:5173/'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Chrome/Edge is required')
const profile = await mkdtemp(join(tmpdir(), 'yarn-product-group-'))
const browser = spawn(executable, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-crash-reporter','--disable-breakpad','--window-size=1500,1000','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], {windowsHide:true, stdio:['ignore','ignore','pipe']})
let socket, session, send, sequence = 0
const calls = new Map(), errors = [], passed = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  const endpoint = await new Promise((resolve,reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(Error('Chrome startup timeout: '+logs)),15000)
    browser.once('error', reject)
    browser.once('exit', code => {clearTimeout(timer);reject(Error('Chrome startup exited '+code+': '+logs))})
    browser.stderr.on('data', chunk => {logs+=String(chunk);const match=logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1])}})
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolve,reject) => {socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if(data.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:data.params.type==='confirm'});
    if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text)
    const call=calls.get(data.id);if(call){calls.delete(data.id);data.error?call.reject(Error(JSON.stringify(data.error))):call.resolve(data.result)}
  })
  send=(method,params={},browserLevel=false)=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{calls.delete(id);reject(Error('CDP timeout '+method))},15000)
    calls.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}})
    socket.send(JSON.stringify({id,method,params,...(!browserLevel&&session?{sessionId:session}:{})}))
  })
  const target=await send('Target.createTarget',{url:'about:blank'},true)
  session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId
  await send('Runtime.enable');await send('Page.enable')
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  const until=async expression=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(50)}console.error('DIAGNOSTIC',await evaluate("JSON.stringify({focus:document.activeElement.tagName,names:window.groupTest?.nodes.map(n=>n.name),requests:window.groupTest?.requests,inputs:[...document.querySelectorAll('.cascading-tree-inline-add input')].map(e=>({disabled:e.disabled,rect:e.getBoundingClientRect().toJSON(),ancestors:[e,e.parentElement,e.parentElement.parentElement,e.closest('.lab-custom-field')].map(n=>({class:n?.className,display:n&&getComputedStyle(n).display,visibility:n&&getComputedStyle(n).visibility}))}))})"));throw Error('Timed out: '+expression)}
  const check=async(name,expression)=>{await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const ok=await evaluate(expression);if(!ok)console.error(await evaluate(`JSON.stringify([...document.querySelectorAll('.operational-form-frame,.base-form-shell,.base-form-editor,.cascading-tree-panels,.base-grid-boundary')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,overflow:getComputedStyle(e).overflow})))`));assert.ok(ok,name);passed.push(name);console.log('PASS '+name)}
  const press=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}


  await send('Page.navigate',{url});
  await until("document.querySelector('.development-login button')");
  await evaluate("document.querySelector('.development-login button').click()");
  await until("[...document.querySelectorAll('button')].some(e=>/تعریف گروه کالاها|Product Groups|商品组/.test(e.textContent))");
  await evaluate("[...document.querySelectorAll('button')].find(e=>/تعریف گروه کالاها|Product Groups|商品组/.test(e.textContent)).click()");
  await until("document.querySelector('.product-group-operational .cascading-tree-panels') && document.querySelectorAll('.product-group-operational .base-grid-table thead th[data-column]').length===6");
  const result=await evaluate("(async()=>{const {api}=await import('/src/api.ts');const nodes=await api('/api/master-data/product-groups');const nav=await api('/api/navigation');return {apiCount:nodes.items.length,treeCount:document.querySelectorAll('.product-group-operational [data-tree-node]').length,columns:document.querySelectorAll('.product-group-operational .base-grid-table thead th[data-column]').length,menu:nav.nodes.find(n=>n.routeId==='productGroups'),alerts:[...document.querySelectorAll('.product-group-operational [role=alert]')].map(e=>e.textContent)}})()");
  assert.equal(result.apiCount,0);assert.equal(result.treeCount,0);assert.equal(result.columns,6);assert.equal(result.menu.parentId,'definitions');assert.deepEqual(result.alerts,[]);assert.deepEqual(errors,[]);
  await evaluate("document.querySelector('.product-group-operational [data-tree-depth=\"0\"]').focus()");
  await press('F1');
  await check('F1 searches the focused hierarchy column instead of the grid',"document.activeElement.matches('[data-tree-depth=\"0\"] .cascading-tree-search')");
  await press(' ');
  await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await press('Escape');
  await until("!document.querySelector('.cascading-tree-inline-add input')");
  await check('Escape on an empty tree restores column focus, not search',"document.activeElement.matches('[data-tree-depth=\"0\"]')");
  await check('Grid tools retain native titles without duplicate CSS tooltips',"[...document.querySelectorAll('.product-group-operational .grid-columns-slot summary,.product-group-operational .grid-expand-toggle,.product-group-operational .grid-export-toggle')].every(e=>e.title && !e.hasAttribute('data-action-tooltip'))");
  await check('Approved footer exists with six browse actions',"document.querySelectorAll('.product-group-operational .laboratory-footer [data-action-id]').length===6");
  await evaluate("document.querySelector('.product-group-operational .laboratory-footer').scrollIntoView({block:'end'})");
  await check('Footer is reachable and not clipped at approved form height',`(()=>{const root=document.querySelector('.product-group-operational'),footer=root.querySelector('.laboratory-footer'),r=footer.getBoundingClientRect(),bounds=root.getBoundingClientRect();return root.scrollHeight>root.clientHeight && r.top>=bounds.top && r.bottom<=bounds.bottom+1 && [...footer.querySelectorAll('button')].every(b=>{const a=b.getBoundingClientRect();return b.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2))})})()`);
  await evaluate("document.querySelector('.product-group-operational [data-action-id=new-person] button').click()");
  await until("document.querySelector('.product-group-operational .cascading-tree-inline-add input')");
  await check('Entry footer keeps Save and Escape only',`JSON.stringify([...document.querySelectorAll('.product-group-operational .laboratory-footer [data-action-id]')].map(e=>e.dataset.actionId))===JSON.stringify(['demo-save','reset-sample'])`);
  await press('Escape');
  await until("!document.querySelector('.product-group-operational .cascading-tree-inline-add input')");
  await check('Escape restores browse footer without inserting data',"document.querySelectorAll('.product-group-operational .laboratory-footer [data-action-id]').length===6 && document.querySelectorAll('.product-group-operational [data-tree-node]').length===0");
  const menuRegression=await evaluate(`(async()=>{
    const {React,createRoot}=await import('/tests/product-group-menu.runtime.tsx');
    const {PendingFormDesignMenu}=await import('/src/components/base-form/PendingFormDesignMenu.tsx');
    const {designReleaseKey}=await import('/src/components/base-form/formDesignReleases.ts');const {encodeRecoveryJournal}=await import('/src/components/base-form/formDocumentRecovery.ts');
    const pinned=(await import('/src/forms/product-group-design.json')).default;
    const userId='isolated-menu-placement';const key=designReleaseKey(userId);const release={id:pinned.provenance.releaseId,formId:pinned.form.id,createdAt:new Date().toISOString(),status:'awaiting-integration',change:'fundamental',snapshot:pinned.form,requirements:[],handoff:{digest:pinned.provenance.digest,backupId:'05d31bb57d1d463d8f2f3025e10645a9',jsonAddress:pinned.provenance.jsonAddress,permissionsConfirmedAt:'2026-11-07T22:44:51.471Z'}};
    const saved=encodeRecoveryJournal({version:1,releases:[release]});localStorage.setItem(key,saved);
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    root.render(React.createElement(PendingFormDesignMenu,{userId,nodes:[],onOpen:()=>{},language:'fa'}));
    await new Promise(r=>setTimeout(r,200));const operationalHidden=host.querySelector('button')===null;
    const historyPreserved=localStorage.getItem(key)===saved;
    const op=document.querySelector('[data-nav-id="productGroups"]');const canonicalParent=op?.parentElement?.closest('.navigation-node')?.getAttribute('data-nav-id');
    const underLaboratory=!!document.querySelector('[data-nav-id="formLaboratory"] [data-nav-id="productGroups"]');
    root.unmount();host.remove();return {operationalHiddenWithStaleMenu:operationalHidden,historyPreserved,canonicalParent,underLaboratory};
  })()`);
  assert.equal(menuRegression.operationalHiddenWithStaleMenu,true);assert.equal(menuRegression.historyPreserved,true);assert.equal(menuRegression.canonicalParent,'definitions');assert.equal(menuRegression.underLaboratory,false);
  await writeFile('../artifacts/product-group-backend/menu-placement-regression.json',JSON.stringify({checkedAtUtc:new Date().toISOString(),passed:true,...menuRegression},null,2));
  console.log('PASS menu destination, stale-menu queue exclusion and release-history preservation');
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'));
  await writeFile('../artifacts/product-group-backend/local-operational-smoke.json',JSON.stringify({checkedAtUtc:new Date().toISOString(),url,passed:true,checks:passed,...result},null,2));console.log(JSON.stringify({passed:true,...result}));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
