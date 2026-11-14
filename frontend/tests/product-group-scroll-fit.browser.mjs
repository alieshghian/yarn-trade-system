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
  const check=async(name,expression)=>{await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const ok=await evaluate(expression);if(!ok)console.error(await evaluate("JSON.stringify([...document.querySelectorAll('.cascading-tree-items')].map(e=>({client:e.clientHeight,scroll:e.scrollHeight,rect:e.getBoundingClientRect().toJSON(),css:getComputedStyle(e).padding,children:[...e.children].map(c=>({class:c.className,h:c.getBoundingClientRect().height,style:c.getAttribute('style')}))})))"));if(!ok)console.error(await evaluate(`JSON.stringify([...document.querySelectorAll('.operational-form-frame,.base-form-shell,.base-form-editor,.cascading-tree-panels,.base-grid-boundary')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,overflow:getComputedStyle(e).overflow})))`));assert.ok(ok,name);passed.push(name);console.log('PASS '+name)}
  const press=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}




  await send('Page.navigate',{url:url+'tests/product-group-operational.html'});await until('window.groupTest');
  await evaluate("sessionStorage.setItem('isolated-product-group-records',JSON.stringify([{id:'root',parentId:null,name:'DTY',depth:0,code:'004',hierarchyCode:'004',rowVersion:'AAAAAAAAAAE='},{id:'bright',parentId:'root',name:'براق',depth:1,code:'004',hierarchyCode:'004.1',rowVersion:'AAAAAAAAAAE='},{id:'raw',parentId:'bright',name:'خام',depth:2,code:'004',hierarchyCode:'004.1.1',rowVersion:'AAAAAAAAAAE='}]))");
  await send('Page.reload');await pause(350);await until("document.querySelector('.base-grid-table tbody tr td')");
  await evaluate("document.querySelector('.base-grid-table tbody tr td').click()");
  await check('One real child does not create a scrollbar',`(()=>{const e=document.querySelector('[data-tree-depth="1"] .cascading-tree-items');console.log('list');return e.scrollHeight<=e.clientHeight})()`);
  await evaluate("document.querySelector('[data-tree-depth=\"1\"]').style.height='240.5px'");
  await check('Fitting child list stays non-scrollable after fractional height changes',`(()=>{const e=document.querySelector('[data-tree-depth="1"] .cascading-tree-items');return e.scrollHeight<=e.clientHeight})()`);
  await evaluate("for(const depth of [2,3,4])document.querySelector('[data-tree-depth=\"'+depth+'\"]').closest('.cascading-tree-column-host').style.display='none'");
  await check('Hiding downstream columns cannot create a scrollbar in a fitting list',`(()=>{const e=document.querySelector('[data-tree-depth="1"] .cascading-tree-items');return e.scrollHeight<=e.clientHeight})()`);
  await evaluate("document.querySelector('[data-tree-depth=\"1\"]').style.height='310.5px'");
  await check('Growing list recomputes its center instead of retaining stale spacers',`(()=>{const e=document.querySelector('[data-tree-depth="1"] .cascading-tree-items'),r=e.getBoundingClientRect(),n=e.querySelector('[data-tree-path-current=true]').getBoundingClientRect();return e.scrollHeight<=e.clientHeight && Math.abs((r.top+r.bottom-n.top-n.bottom)/2)<2})()`);
  await evaluate("(()=>{const rows=JSON.parse(sessionStorage.getItem('isolated-product-group-records'));for(let i=0;i<30;i++)rows.push({id:'child-'+i,parentId:'root',name:'child '+i,depth:1,code:'004',hierarchyCode:'004.'+(i+2),rowVersion:'AAAAAAAAAAE='});sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("groupTest.nodes.length===33");
  await evaluate("document.querySelector('.base-grid-table tbody tr td').click()");
  await check('Actual overflowing options retain an accessible scrollbar',`(()=>{const e=document.querySelector('[data-tree-depth="1"] .cascading-tree-items');return e.scrollHeight>e.clientHeight && getComputedStyle(e).overflowY==='auto'})()`);
  assert.deepEqual(errors,[]);await writeFile('../artifacts/product-group-backend/tree-overflow-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated standard Laboratory grid and Product Group API fixture'},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
