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
  await evaluate("(()=>{const rows=[];const add=(id,parentId,name,depth,code='004')=>rows.push({id,parentId,name,depth,code,hierarchyCode:id,rowVersion:'AAAAAAAAAAE='});add('r',null,'DTY',0);add('b','r','براق',1);add('raw','b','خام',2);add('d150','raw','150D',3);add('d300','raw','300D',3);add('f','d300','96F',4);add('single',null,'گروه تنها',0,'005');sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("document.querySelectorAll('.base-grid-table tbody tr').length===3");
  await check('Standard grid shows unfinished branch, finished branch and isolated root',"(()=>{const rows=[...document.querySelectorAll('.base-grid-table tbody tr')];return rows.some(e=>e.textContent.includes('150D')) && rows.some(e=>e.textContent.includes('96F')) && rows.some(e=>e.textContent.includes('گروه تنها'))})()");
  await check('Unfinished branch keeps unused last subgroup empty',"(()=>{const row=[...document.querySelectorAll('.base-grid-table tbody tr')].find(e=>e.textContent.includes('150D'));return row.querySelectorAll('td').length===6 && [...row.querySelectorAll('td')].some(e=>!e.textContent.trim())})()");
  await evaluate("[...document.querySelectorAll('.base-grid-table tbody tr')].find(e=>e.textContent.includes('150D')).querySelector('td').click()");
  await check('Unfinished report row selects its exact tree ancestry',"document.querySelectorAll('[data-tree-path-current=true]').length===4 && document.querySelector('[data-tree-depth=\"4\"] .cascading-tree-column-head').textContent.includes('150D')");
  await evaluate("document.querySelector('[data-tree-depth=\"4\"] [data-tree-add]').click()");await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await send('Input.insertText',{text:'48F'});await press('F3');await until("[...document.querySelectorAll('.base-grid-table tbody tr')].some(e=>e.textContent.includes('48F'))");
  await check('Adding child replaces the prefix row without duplicate parent rows',"(()=>{const rows=[...document.querySelectorAll('.base-grid-table tbody tr')];return rows.length===3 && rows.filter(e=>e.textContent.includes('150D')).length===1 && rows.find(e=>e.textContent.includes('150D')).textContent.includes('48F')})()");
  await evaluate("(()=>{const rows=JSON.parse(sessionStorage.getItem('isolated-product-group-records'));for(const name of ['288F','144F','96F','24F','36F','72F','192F','384F'])rows.push({id:'sibling-'+name,parentId:'d150',name,depth:4,code:'004',hierarchyCode:'sibling-'+name,rowVersion:'AAAAAAAAAAE='});sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("[...document.querySelectorAll('.base-grid-table tbody tr')].some(e=>e.textContent.includes('288F'))");
  await evaluate("[...document.querySelectorAll('.base-grid-table tbody tr')].find(e=>e.textContent.includes('288F')).querySelector('td').click()");
  await evaluate("document.querySelector('[data-tree-depth=\"4\"] [data-tree-add]').click()");await until("document.activeElement.matches('.cascading-tree-inline-add input')");
  await send('Input.insertText',{text:'574F'});await press('F3');await until("document.activeElement.dataset.treeNode && document.activeElement.textContent.includes('574F')");
  await check('Final-level save keeps 574F and every ancestor green, centered and aligned',`(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')],centers=rows.map(e=>(e.getBoundingClientRect().top+e.getBoundingClientRect().bottom)/2);return rows.length===5 && Math.max(...centers)-Math.min(...centers)<2 && rows.every(e=>{const list=e.closest('.cascading-tree-items'),r=list.getBoundingClientRect();return Math.abs((e.getBoundingClientRect().top+e.getBoundingClientRect().bottom-r.top-r.bottom)/2)<2 && getComputedStyle(e).backgroundColor==='rgb(215, 235, 230)'})})()`);
  assert.deepEqual(errors,[]);await writeFile('../artifacts/product-group-backend/report-leaves-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated standard Laboratory grid and API fixture'},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
