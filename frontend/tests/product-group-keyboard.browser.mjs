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
  await until("window.groupTest && document.querySelector('[data-tree-depth=\"0\"]')");
  await evaluate("document.activeElement.blur()");await press(' ');
  await until("document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='0'");
  await check('Space with no focus starts root entry',"groupTest.nodes.length===0");await press('Escape');
  await evaluate("document.querySelector('[data-action-id=new-person] button').focus()");await press(' ');
  await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await send('Input.insertText',{text:'ریشه آزمون میانبر'});await press('F3');
  await until("groupTest.nodes.length===1 && document.activeElement.closest('[data-tree-depth]')?.dataset.treeDepth==='1'");
  await press('Escape');await until("!document.querySelector('.cascading-tree-inline-add')");
  await check('Escape restores last saved node',"document.activeElement.dataset.treeNode===groupTest.nodes[0].id");
  await press(' ');await until("document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='1'");
  await send('Input.insertText',{text:'زیرگروه آزمون'});await press('F3');
  await until("groupTest.nodes.length===2 && document.activeElement.closest('[data-tree-depth]')?.dataset.treeDepth==='2'");
  await press('Escape');await until("document.activeElement.dataset.treeNode===groupTest.nodes[1].id");
  await press('F1');
  await check('F1 searches subgroup at its focused depth',"document.activeElement.matches('[data-tree-depth=\"1\"] .cascading-tree-search')");
  await send('Input.insertText',{text:'زیر'});await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',text:' '});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
  await check('Space remains text while typing a search',"document.activeElement.value==='زیر ' && !document.querySelector('.cascading-tree-inline-add')");


  await evaluate("document.activeElement.blur()");await press(' ');
  await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await check('Neutral Space ignores stale subgroup context and starts root',"document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='0'");await press('Escape');
  await evaluate("document.activeElement.blur();document.querySelector('[data-action-id=new-person] button').focus();document.querySelector('[data-action-id=new-person] button').click()");
  await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await check('Main Create with no group focus starts root',"document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='0'");await press('Escape');
  await evaluate("document.querySelector('[data-tree-depth=\"1\"] [data-tree-node]').focus();document.querySelector('[data-action-id=new-person] button').focus();document.querySelector('[data-action-id=new-person] button').click()");
  await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await check('Main Create retains immediately focused group context',"document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='2'");await press('Escape');
  // Complete all five levels with the same F3 path, then exercise the leaf boundary twice.
  await evaluate("document.querySelector('[data-tree-depth=\"1\"] [data-tree-node]').focus()");await press(' ');
  await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  for(const text of ['پلی استر','رنگرزی','نمره ۱۲']) { await send('Input.insertText',{text});await press('F3');await pause(80); }
  await until("groupTest.nodes.length===5 && document.activeElement.dataset.treeNode===groupTest.nodes[4].id");
  for(let i=0;i<2;i++) {await press(' ');await until("document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='4'");await press('Escape');await until("document.activeElement.dataset.treeNode===groupTest.nodes[4].id");}
  await check('Space repeatedly creates at last allowed level under the same parent',"groupTest.nodes.length===5");
  await evaluate("document.activeElement.blur()");await press(' ');await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  const writesBeforeTraversal=await evaluate("groupTest.requests.filter(r=>r.method==='POST').length");
  await check('Empty root editor visibly preselects the first existing group',"document.querySelector('.cascading-tree-inline-matches [aria-selected=true]')?.textContent==='ریشه آزمون میانبر'");
  for(const [key,depth] of [['Enter','1'],['ArrowLeft','2'],['Enter','3'],['ArrowLeft','4']]) { await press(key);await until(`document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='${depth}'`); }
  await check('Enter and left traverse existing hierarchy without typing or saving',`groupTest.requests.filter(r=>r.method==='POST').length===${writesBeforeTraversal} && groupTest.nodes.length===5`);
  await press('ArrowRight');await until("document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='3'");await press('Enter');await until("document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='4'");
  await check('Right returns to prior entry level and Enter advances again',"groupTest.nodes.length===5");await press('Escape');

  await evaluate("document.querySelector('[data-tree-depth=\"4\"] [data-tree-add]').click()");await send('Input.insertText',{text:'نمره ۳'});await press('F3');await until('groupTest.nodes.length===6');
  await evaluate("document.querySelector('[data-tree-depth=\"3\"] [data-tree-add]').click()");await send('Input.insertText',{text:'خام'});await press('F3');await until("groupTest.nodes.length===7 && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='4'");
  await send('Input.insertText',{text:'نمره12'});
  await until("document.querySelectorAll('.cascading-tree-inline-matches [role=option]').length===1");await press('Enter');
  await check('Cross-branch Enter reuses name without changing target or saving',"groupTest.nodes.length===7 && document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='4' && document.querySelector('.cascading-tree-inline-add input').value==='نمره ۱۲'");
  await press('F3');await until('groupTest.nodes.length===8');
  await check('F3 saves reused name beneath the current parent',"groupTest.nodes[7].parentId===groupTest.nodes[6].id");
  await evaluate("document.querySelector('[data-tree-depth=\"4\"] [data-tree-add]').click()");
  await evaluate("document.querySelector('[data-tree-depth=\"4\"] [data-tree-copy-children]').click()");
  await evaluate("document.querySelector('.cascading-tree-copy-actions button[type=submit]').click()");await until('groupTest.nodes.length===9');
  await press('Escape');await until("!document.querySelector('.cascading-tree-copy')");
  await check('Bulk copy preserves source and skips names already in destination',"groupTest.nodes.filter(n=>n.parentId===groupTest.nodes[3].id).length===2 && groupTest.nodes.filter(n=>n.parentId===groupTest.nodes[6].id).length===2");

  await evaluate("document.querySelector('[data-tree-depth=\"4\"] [data-tree-add]').click()");await send('Input.insertText',{text:'متن حفظ شود'});await press('ArrowRight');
  await until("document.activeElement.closest('[data-tree-depth]')?.dataset.treeDepth==='3' && document.activeElement.matches('.cascading-tree-inline-add input')");
  await press('ArrowLeft');
  await check('Entry arrows restore per-parent draft without saving',"document.activeElement.closest('[data-tree-depth]')?.dataset.treeDepth==='4' && document.activeElement.value==='متن حفظ شود' && groupTest.nodes.length===9");
  await press('Escape');
  await evaluate("document.querySelector('[data-tree-depth=\"3\"] [data-tree-add]').click()");await send('Input.insertText',{text:'خام'});await press('Enter');
  await until("document.activeElement.closest('[data-tree-depth]')?.dataset.treeDepth==='4'");
  await check('Enter chooses existing parent and advances without saving',"groupTest.nodes.length===9");await press('Escape');
  assert.deepEqual(errors,[]);
  await writeFile('../artifacts/product-group-backend/keyboard-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated API fixture; no database writes',checkedAtUtc:new Date().toISOString()},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
