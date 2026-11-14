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
  await evaluate("(()=>{const rows=[];const add=(id,parentId,name,depth)=>rows.push({id,parentId,name,depth,code:'001',hierarchyCode:id,rowVersion:'AAAAAAAAAAE='});add('r',null,'DTY',0);add('m','r','مات',1);add('b','r','براق',1);add('md','m','دوب داید',2);add('bd','b','دوب داید',2);add('n150','md','150D',3);add('n300','md','300D',3);add('existing','bd','150D',3);add('foreign',null,'شنیل',0);add('f1','foreign','پلی استر',1);add('f2','f1','پرو',2);add('f3','f2','خام',3);rows.filter(n=>n.id==='foreign'||n.id.startsWith('f')).forEach(n=>n.code='002');sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("window.groupTest?.nodes.length===12 && document.querySelector('[data-tree-node=r]')");
  await evaluate("document.querySelector('[data-tree-node=r]').click()");await until("document.querySelector('[data-tree-node=b]')");
  await evaluate("document.querySelector('[data-tree-node=b]').click()");await until("document.querySelector('[data-tree-node=bd]')");
  await evaluate("document.querySelector('[data-tree-node=bd]').click()");
  await evaluate("document.querySelectorAll('[data-tree-add]')[3].click()");await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await check('Empty entry has no name suggestions or false no-name message',"!document.querySelector('[role=option]') && !document.querySelector('.cascading-tree-inline-matches').textContent.trim()");
  await send('Input.insertText',{text:'D'});
  await check('Typed suggestions contain remote missing name only',"document.querySelectorAll('[role=option]').length===1 && document.querySelector('[role=option]').textContent.includes('300D') && !document.querySelector('[role=option]').textContent.includes('150D')");
  await press('Enter');await check('Suggestion preserves current parent and creates no record',"document.querySelector('.cascading-tree-inline-add input').value==='300D' && groupTest.nodes.length===12");
  await press('F2');await until("document.querySelector('.cascading-tree-copy')");
  await check('F2 lists same-level missing names from distant parent',"document.querySelectorAll('.cascading-tree-copy input[type=checkbox]').length===1 && document.querySelector('.cascading-tree-copy').textContent.includes('300D')");
  await check('Copy rows keep checkbox beside text without foreign-root entries',"(()=>{const labels=[...document.querySelectorAll('.cascading-tree-copy>label')];return !document.querySelector('.cascading-tree-copy').textContent.includes('خام') && labels.every(e=>{const a=e.querySelector('input').getBoundingClientRect(),b=e.querySelector('span').getBoundingClientRect();return Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<3})})()");
  await press('F3');await until('groupTest.nodes.length===13');
  await check('Copy inserts under current bright branch and keeps source',"groupTest.nodes.filter(n=>n.parentId==='bd').length===2 && groupTest.nodes.filter(n=>n.parentId==='md').length===2 && groupTest.nodes.some(n=>n.parentId==='bd' && n.name==='300D')");
  assert.deepEqual(errors,[]);
  await writeFile('../artifacts/product-group-backend/level-reuse-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated browser and API fixture'},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
