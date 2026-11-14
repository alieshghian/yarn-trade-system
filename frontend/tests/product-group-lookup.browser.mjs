import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { createServer } from 'vite'

// Only this component, isolated Vite server and disposable browser storage.
const vite = await createServer({configFile:false, root:process.cwd(), server:{host:'127.0.0.1', port:0}})
await vite.listen()
const url = `http://127.0.0.1:${vite.httpServer.address().port}/tests/product-group-operational.html`
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Chrome/Edge is required')
const profile = await mkdtemp(join(tmpdir(), 'yarn-product-group-'))
const browser = spawn(executable, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-crash-reporter','--disable-breakpad','--window-size=1500,1000','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], {windowsHide:true, stdio:['ignore','ignore','pipe']})
let socket, session, sequence = 0
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
  const send=(method,params={},browserLevel=false)=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{calls.delete(id);reject(Error('CDP timeout '+method))},15000)
    calls.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}})
    socket.send(JSON.stringify({id,method,params,...(!browserLevel&&session?{sessionId:session}:{})}))
  })
  const target=await send('Target.createTarget',{url:'about:blank'},true)
  session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId
  await send('Runtime.enable');await send('Page.enable')
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  const until=async expression=>{for(let i=0;i<80;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(50)}console.error('DIAGNOSTIC',await evaluate("JSON.stringify({focus:document.activeElement.tagName,names:window.groupTest?.nodes.map(n=>n.name),requests:window.groupTest?.requests,inputs:[...document.querySelectorAll('.cascading-tree-inline-add input')].map(e=>({disabled:e.disabled,rect:e.getBoundingClientRect().toJSON(),ancestors:[e,e.parentElement,e.parentElement.parentElement,e.closest('.lab-custom-field')].map(n=>({class:n?.className,display:n&&getComputedStyle(n).display,visibility:n&&getComputedStyle(n).visibility}))}))})"));throw Error('Timed out: '+expression)}
  const check=async(name,expression)=>{await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const ok=await evaluate(expression);if(!ok)console.error(await evaluate(`JSON.stringify([...document.querySelectorAll('.operational-form-frame,.base-form-shell,.base-form-editor,.cascading-tree-panels,.base-grid-boundary')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,overflow:getComputedStyle(e).overflow})))`));assert.ok(ok,name);passed.push(name);console.log('PASS '+name)}
  const press=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}


  await send('Page.navigate',{url:url+'?lookup'});
  await until('window.groupTest && document.activeElement.closest(".cascading-tree-inline-add")');
  await check('lookup opens existing operational group form in create mode','groupTest.nodes.length===0');
  await send('Input.insertText',{text:'گروه جدید'});await press('F3');
  await until('groupTest.nodes.length===1');await press('Escape');
  await until('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("انتخاب")&&!b.disabled)');
  await evaluate('groupTest.fail=true;[...document.querySelectorAll(".laboratory-footer button")].find(b=>b.textContent.includes("انتخاب")).click()');
  await until('document.body.textContent.includes("گروه قابل انتخاب نیست")');
  await check('server rejects invalid selection without returning','!window.chosenGroup && groupTest.nodes.length===1');
  await evaluate('groupTest.fail=false;[...document.querySelectorAll(".laboratory-footer button")].find(b=>b.textContent.includes("انتخاب")).click()');
  await until('window.chosenGroup===groupTest.nodes[0].id');
  await check('select returns authoritative persisted group identity','window.chosenGroup===groupTest.nodes[0].id');
  assert.deepEqual(errors,[]);
  console.log('PASS Product Group lookup creation and selection');
} catch(error) {console.error(error);process.exitCode=1}
finally {
  socket?.close();browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await vite.close()
}
