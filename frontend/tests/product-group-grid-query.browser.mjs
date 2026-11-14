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
  await evaluate("sessionStorage.setItem('isolated-product-group-records',JSON.stringify(Array.from({length:213},(_,i)=>({id:'node-'+i,parentId:null,name:i===0?'Zulu':i===212?'Alpha':'Group '+String(i).padStart(3,'0'),depth:0,code:String(i+1).padStart(3,'0'),hierarchyCode:'root'+i,rowVersion:'AAAAAAAAAAE='}))))");
  await send('Page.reload');await pause(1500);await until("document.querySelector('.grid-search-control input')");
  await until("document.querySelector('.base-grid-table')?.getAttribute('aria-rowcount')==='214' && document.querySelector('tbody')?.textContent.includes('Zulu')");
  await evaluate("document.querySelector('.base-grid-table').closest('.base-grid-table-wrap').scrollTop=7000");
  await until("groupTest.requests.some(r=>r.method==='POST' && r.body?.page>=2)");
  await check('Report requests subsequent server pages and bounds rendered rows',"document.querySelectorAll('tbody tr').length<100 && groupTest.requests.filter(r=>r.body?.pageSize).every(r=>r.body.pageSize<=100)");
  const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML.slice(0,180)}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1})};
  await evaluate("const w=document.querySelector('.base-grid-table').closest('.base-grid-table-wrap');w.scrollTop=1800" );await pause(200);await click('th[data-column=\"product-group.cascading-tree.level.0\"] .excel-filter-trigger');await check('Filter opens after scrolling 213 rows', "!!document.querySelector('.excel-filter-menu')" );await click('.excel-filter-menu .filter-command:nth-child(2)');
  await click('.grid-search-control input');await send('Input.insertText',{text:'Alpha'});await pause(600);
  await check('Search filters real report rows', "document.querySelector('tbody').textContent.includes('Alpha') && !document.querySelector('tbody').textContent.includes('Zulu')" );
  await check('Search is sent to the report API',"groupTest.requests.some(r=>r.method==='POST' && r.body?.search==='Alpha')");
  await evaluate("document.querySelector('.grid-search-control input').focus();document.querySelector('.grid-search-control input').select()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await pause(500);
  await click('th[data-column="product-group.cascading-tree.level.0"] .column-title');await pause(200);
  await check('Ascending sort orders report rows', "document.querySelector('tbody tr')?.textContent.includes('Alpha') && document.querySelectorAll('tbody tr').length<100" );
  await click('th[data-column="product-group.cascading-tree.level.0"] .excel-filter-trigger');await pause(200);await check('Column filter opens on pointer click', "!!document.querySelector('.excel-filter-menu')" );await click('.excel-filter-menu .filter-command:nth-child(2)');await check('Descending sort reverses actual rows', "document.querySelector('tbody tr')?.textContent.includes('Zulu')" );
  await evaluate("document.querySelector('.base-grid-table').closest('.base-grid-table-wrap').scrollTop=1800");await pause(100);
  await click('th[data-column="product-group.cascading-tree.level.0"] .excel-filter-trigger');
  await click('.filter-values-select-all input');
  await click('.filter-value-search');await send('Input.insertText',{text:'Alpha'});
  await until("document.querySelectorAll('.filter-values>label').length===1");
  await click('.filter-values>label input');await click('.excel-filter-menu .filter-actions .primary');
  await check('Column filter applies to actual report rows', "document.querySelectorAll('tbody tr').length===1 && document.querySelector('tbody').textContent.includes('Alpha')");
  await check('Distinct values and selected filters use the report API',"groupTest.requests.some(r=>r.body?.optionsColumn) && groupTest.requests.some(r=>Object.keys(r.body?.filters ?? {}).length>0)");
  assert.deepEqual(errors,[]);console.log('Passed '+passed.length+' focused grid checks');
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}




