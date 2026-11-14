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




  await send('Page.navigate',{url:url+'tests/product-group-operational.html'});await until('window.groupTest');
  await evaluate("sessionStorage.setItem('isolated-product-group-records',JSON.stringify([{id:'root',parentId:null,name:'DTY',depth:0,code:'004',hierarchyCode:'004',rowVersion:'AAAAAAAAAAE='},{id:'bright',parentId:'root',name:'براق',depth:1,code:'004',hierarchyCode:'004.1',rowVersion:'AAAAAAAAAAE='},{id:'raw',parentId:'bright',name:'خام',depth:2,code:'004',hierarchyCode:'004.1.1',rowVersion:'AAAAAAAAAAE='}]))");
  await send('Page.reload');await pause(350);await until("document.querySelector('.base-grid-table tbody tr td')");
  for (const [id,depth] of [['raw',2],['bright',1],['root',0]]) {
    await evaluate("document.querySelector('.base-grid-table tbody tr td').click()");
    await check('Report displays path '+id,"document.querySelectorAll('[data-tree-path-current=true]').length===3");
    const rect=await evaluate(`(()=>{const r=document.querySelector('[data-tree-node="${id}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});
    await check('Mouse gives actual focus to report node '+id,`document.activeElement.dataset.treeNode==='${id}'`);
    await check('Mouse focus remains visually distinct on green path '+id,`(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle!=='none' && parseFloat(s.outlineWidth)>=2})()`);
    await press('Insert');await until(`document.activeElement.matches('.cascading-tree-inline-add input') && document.activeElement.value==='${id==='raw'?'خام':id==='bright'?'براق':'DTY'}'`);
    await check('Edit targets exact clicked group '+id,`document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='${depth}'`);
    await press('Escape');await until("!document.querySelector('.cascading-tree-inline-add')");
  }
  await evaluate("document.querySelector('.base-grid-table tbody tr td').click()");
  await evaluate("document.querySelector('[data-tree-node=raw]').click()");await press('Delete');await until("groupTest.nodes.length===2");
  await check('Delete removes only the focused unused report node in isolated API',"groupTest.nodes.every(n=>n.id!=='raw') && groupTest.nodes.some(n=>n.id==='bright') && groupTest.nodes.some(n=>n.id==='root') && groupTest.requests.filter(r=>r.method==='DELETE').length===1");
  await evaluate("sessionStorage.setItem('isolated-product-group-records',JSON.stringify(groupTest.nodes.map(n=>({...n,isProtected:true}))))");
  await send('Page.reload');await pause(350);await until("document.querySelector('[data-tree-node=root]')");
  await evaluate("document.querySelector('.base-grid-table tbody tr td').click()");await until("document.querySelector('[data-tree-node=bright]')");
  await evaluate("document.querySelector('[data-tree-node=bright]').click()");
  await check('Used group remains focusable but edit and delete remain protected',"document.activeElement.dataset.treeNode==='bright' && !document.querySelector('[data-action-id=edit-person]') && !document.querySelector('[data-action-id=delete-person]')");
  assert.deepEqual(errors,[]);await writeFile('../artifacts/product-group-backend/report-focus-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated standard Laboratory grid and Product Group API fixture'},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
