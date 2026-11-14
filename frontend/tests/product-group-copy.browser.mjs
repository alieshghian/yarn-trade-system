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




  await send('Page.navigate',{url:url+'tests/product-group-operational.html'});
  await until('window.groupTest');
  await evaluate(`(()=>{const list=[];const add=(name,parentId,depth)=>{const id=crypto.randomUUID();list.push({id,parentId,name,depth,code:'009',hierarchyCode:'009.'+list.length,rowVersion:'AAAAAAAAAAE='});return id};const r=add('نخ',null,0),one=add('شنیل',r,1),two=add('پلی استر',one,2),raw=add('خام',two,3),double=add('دوب داید',two,3);add('رنگرزی',two,3);add('نمره ۳',raw,4);add('نمره ۵',raw,4);add('نمره ۱۰',raw,4);add('نمره ۳',double,4);sessionStorage.setItem('isolated-product-group-records',JSON.stringify(list))})()`);
  await send('Page.reload');await pause(350);await until("window.groupTest?.nodes.length===10 && document.querySelector('[data-tree-depth=\"0\"] [data-tree-node]')");
  await evaluate(`document.querySelector('[data-action-id="new-person"] button').click()`);
  await until(`document.activeElement.matches('.cascading-tree-inline-add input')`);
  await send('Input.insertText',{text:'نخ'});await press('Enter');
  await until(`document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='1'`);
  await check('One Enter selects a searched existing group and advances without saving',`groupTest.nodes.length===10`);
  await press('Escape');await until(`!document.querySelector('.cascading-tree-inline-add')`);
  await evaluate(`document.querySelector('[data-tree-depth="0"] [data-tree-node]').click()`);
  await until(`[...document.querySelectorAll('[data-tree-depth="3"] [data-tree-node]')].some(e=>e.textContent.includes('رنگرزی'))`);
  await evaluate(`[...document.querySelectorAll('[data-tree-depth="3"] [data-tree-node]')].find(e=>e.textContent.includes('رنگرزی')).click()`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-add]')?.click()`);await until(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]')`);
  await check('Add buttons hidden during entry and Delete returns after cancellation',`!document.querySelector('[data-tree-add]') && !document.querySelector('[data-action-id="delete-person"]')`);
  await check('Copy is available only in the active entry column',`document.querySelectorAll('[data-tree-copy-children]').length===1 && document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]')!==null`);
  await press('F2');
  await until(`document.querySelector('.cascading-tree-copy')`);
  await check('Copy shows one deduplicated missing list without source or destination controls',`!document.querySelector('[aria-label="گروه مبدأ کپی"]') && document.querySelectorAll('.cascading-tree-copy input[type=checkbox]').length===3`);
  await check('Suggestions are preselected and final save is green and visible',`document.querySelectorAll('.cascading-tree-copy input:checked').length===3 && !document.querySelector('.cascading-tree-copy-actions button[type=submit]').disabled && getComputedStyle(document.querySelector('.cascading-tree-copy-actions button[type=submit]')).backgroundColor==='rgb(23, 107, 89)' && document.querySelector('.cascading-tree-copy-actions').getBoundingClientRect().height>0`);
  {const pos=await evaluate(`(()=>{const r=document.querySelector('.cascading-tree-copy-actions button[type=submit]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...pos});}
  await check('Copy save retains green background and white text on hover',`(()=>{const e=document.querySelector('.cascading-tree-copy-actions button[type=submit]'),s=getComputedStyle(e);return e.matches(':hover') && s.backgroundColor==='rgb(23, 107, 89)' && s.color==='rgb(255, 255, 255)'})()`);
  {const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/copy-preview-open.png',Buffer.from(shot.data,'base64'));}
  await press('Escape');await until(`!document.querySelector('.cascading-tree-copy')`);
  await check('Escape closes only copy without a write or losing the form',`groupTest.nodes.length===10 && !!document.querySelector('.cascading-tree-panels')`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-add]')?.click()`);await until(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]')`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]').click()`);
  await until(`document.querySelector('[data-action-id="reset-sample"] button')`);
  await evaluate(`document.querySelector('[data-action-id="reset-sample"] button').click()`);
  await until(`!document.querySelector('.cascading-tree-copy')`);
  await check('Bottom Escape action closes copy, not the whole form',`!!document.querySelector('.cascading-tree-panels') && groupTest.nodes.length===10`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-add]')?.click()`);await until(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]')`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]').click()`);
  await evaluate(`[...document.querySelectorAll('.cascading-tree-copy button')].find(e=>e.textContent.includes('انتخاب همه')).click()`);
  await evaluate(`groupTest.fail=true;document.querySelector('.cascading-tree-copy-actions button[type=submit]').click()`);
  await until(`document.querySelector('.cascading-tree-copy [role=status]')?.textContent.includes('انجام نشد')`);
  await check('Rejected copy retains selected preview without phantom nodes',`groupTest.nodes.length===10 && document.querySelectorAll('.cascading-tree-copy input:checked').length===3`);
  await evaluate(`groupTest.fail=false;document.querySelector('.cascading-tree-copy-actions button[type=submit]').click()`);
  await until('groupTest.nodes.length===13 && !document.querySelector(".cascading-tree-copy")');
  await check('One batch fills only current group and closes copy after confirmation',`(()=>{const counts=name=>groupTest.nodes.filter(n=>n.parentId===groupTest.nodes.find(p=>p.name===name).id).length;return counts('خام')===3 && counts('دوب داید')===1 && counts('رنگرزی')===3 && !document.querySelector('.cascading-tree-copy fieldset')})()`);
  await check('Copied child is selected under target with green bold aligned ancestry',`(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')],centers=rows.map(e=>(e.getBoundingClientRect().top+e.getBoundingClientRect().bottom)/2);const node=groupTest.nodes.find(n=>n.id===document.activeElement.dataset.treeNode);return rows.length===5 && Math.max(...centers)-Math.min(...centers)<2 && rows.every(e=>getComputedStyle(e).backgroundColor==='rgb(215, 235, 230)') && node?.parentId===groupTest.nodes.find(n=>n.name==='رنگرزی').id})()`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-add]').click()`);
  await until(`document.querySelector('.cascading-tree-inline-add input')`);await press('F2');
  await check('No missing items hides copy button and F2 opens nothing',`!document.querySelector('[data-tree-copy-children]') && !document.querySelector('.cascading-tree-copy') && !!document.querySelector('.cascading-tree-inline-add input') && groupTest.nodes.length===13`);
  await press('Escape');
  await press('ArrowRight');
  await evaluate(`[...document.querySelectorAll('[data-tree-depth="3"] [data-tree-node]')].find(e=>e.textContent.includes('دوب داید')).click()`);
  await until(`document.querySelector('[data-tree-depth="4"] .cascading-tree-column-head').textContent.includes('دوب داید')`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-add]').click()`);await send('Input.insertText',{text:'پیش‌نویس حفظ شود'});await until(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]')`);
  await evaluate(`document.querySelector('[data-tree-depth="4"] [data-tree-copy-children]').click()`);
  await until(`document.querySelector('.cascading-tree-copy')`);await press('Escape');
  await check('Cancel copy restores suspended editor and its unsaved text',`document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.value==='پیش‌نویس حفظ شود' && groupTest.nodes.length===13`);
  {const pos=await evaluate(`(()=>{const r=document.querySelector('.cascading-tree-add-actions button[type=submit]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...pos});}
  await check('Group save retains green background and white text on hover',`(()=>{const e=document.querySelector('.cascading-tree-add-actions button[type=submit]'),s=getComputedStyle(e);return e.matches(':hover') && s.backgroundColor==='rgb(23, 107, 89)' && s.color==='rgb(255, 255, 255)'})()`);
  await press('Escape');await until(`document.querySelector('[data-tree-add]')`);
  await check('Browse restores Add and existing Delete action',`document.querySelectorAll('[data-tree-add]').length===5 && !!document.querySelector('[data-action-id="delete-person"] button')`);assert.deepEqual(errors,[]);
  await writeFile('../artifacts/product-group-backend/copy-preview-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated browser and API fixture',checkedAtUtc:new Date().toISOString()},null,2));
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/copy-preview-regression.png',Buffer.from(shot.data,'base64'));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
