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
  await evaluate("(()=>{const names=['شنیل','بوکله','DTY','FDY'];const rows=names.map((name,i)=>({id:'r'+i,parentId:null,name,depth:0,code:String(i+1),hierarchyCode:String(i+1),rowVersion:'AAAAAAAAAAE='}));for(let i=0;i<3;i++)rows.push({id:'a'+i,parentId:'r3',name:'child '+i,depth:1,code:'4',hierarchyCode:'4.'+i,rowVersion:'AAAAAAAAAAE='});rows.push({id:'leaf',parentId:'a0',name:'288F',depth:2,code:'4',hierarchyCode:'4.0.1',rowVersion:'AAAAAAAAAAE='});sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("document.querySelector('[data-tree-node=\"r3\"]')");
  await evaluate("document.querySelector('[data-tree-node=\"r3\"]').click()");
  await check('last root and first descendants remain on one shared line',"(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')].map(e=>{const r=e.getBoundingClientRect();return (r.top+r.bottom)/2});return rows.length===3 && Math.max(...rows)-Math.min(...rows)<2})()");
  await check('selected root is centered instead of dropping one row',"(()=>{const list=document.querySelector('[data-tree-depth=\"0\"] .cascading-tree-items'),a=list.getBoundingClientRect(),b=list.querySelector('[data-tree-path-current=true]').getBoundingClientRect();return Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<2})()");
  await check('create is right of copy with equal single-line height at narrow widths',"(()=>{for(const host of document.querySelectorAll('.cascading-tree-column-host'))host.style.width='165px';return [...document.querySelectorAll('.cascading-tree-browse-actions')].every(row=>{const copy=row.querySelector('[data-tree-copy-branch]'),add=row.querySelector('[data-tree-add]');if(!copy)return true;const a=add.getBoundingClientRect(),b=copy.getBoundingClientRect();return a.left>=b.right && a.height===b.height && a.height===36 && getComputedStyle(add).whiteSpace==='nowrap'})})()");
  await pause(100);await check('path stays aligned after footer resizing',"(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')].map(e=>{const r=e.getBoundingClientRect();return (r.top+r.bottom)/2});return Math.max(...rows)-Math.min(...rows)<2})()");
  assert.deepEqual(errors,[]);await writeFile('../artifacts/product-group-backend/branch-actions-alignment.json',JSON.stringify({passed:true,checks:passed,context:'isolated real shared tree and standard grid'},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
