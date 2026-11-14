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
  const until=async expression=>{for(let i=0;i<160;i++){try {if(await evaluate(`Boolean(${expression})`))return} catch(error) {if(!/navigated or closed|context was destroyed/i.test(String(error)))throw error} await pause(50)}console.error('DIAGNOSTIC',await evaluate("JSON.stringify({focus:document.activeElement.tagName,names:window.groupTest?.nodes.map(n=>n.name),requests:window.groupTest?.requests,inputs:[...document.querySelectorAll('.cascading-tree-inline-add input')].map(e=>({disabled:e.disabled,rect:e.getBoundingClientRect().toJSON(),ancestors:[e,e.parentElement,e.parentElement.parentElement,e.closest('.lab-custom-field')].map(n=>({class:n?.className,display:n&&getComputedStyle(n).display,visibility:n&&getComputedStyle(n).visibility}))}))})"));throw Error('Timed out: '+expression)}
  const check=async(name,expression)=>{await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const ok=await evaluate(expression);if(!ok)console.error(await evaluate(`JSON.stringify([...document.querySelectorAll('.operational-form-frame,.base-form-shell,.base-form-editor,.cascading-tree-panels,.base-grid-boundary')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,overflow:getComputedStyle(e).overflow})))`));assert.ok(ok,name);passed.push(name);console.log('PASS '+name)}
  const press=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}




  await send('Page.navigate',{url:url+'tests/product-group-operational.html'});
  await until('window.groupTest');
  await evaluate(`(()=>{const list=Array.from({length:25},(_,i)=>({id:crypto.randomUUID(),parentId:null,name:'گروه '+String(i).padStart(2,'0'),depth:0,code:String(i+1).padStart(3,'0'),hierarchyCode:String(i+1).padStart(3,'0'),rowVersion:'AAAAAAAAAAE='}));sessionStorage.setItem('isolated-product-group-records',JSON.stringify(list))})()`);
  await send('Page.reload');await pause(350);await until(`window.groupTest?.nodes.length===25 && document.querySelectorAll('[data-tree-depth="0"] [data-tree-node]').length===25`);
  await evaluate(`window.contextVisible=(selector,rowSelector,activeSelector)=>{const list=document.querySelector(selector),rows=[...list.querySelectorAll(rowSelector)],active=list.querySelector(activeSelector),i=rows.indexOf(active),r=list.getBoundingClientRect();if(i<2||i>rows.length-3)return false;return rows[i-2].getBoundingClientRect().top>=r.top-1 && rows[i+2].getBoundingClientRect().bottom<=r.bottom+1 && Math.abs((active.getBoundingClientRect().top+active.getBoundingClientRect().bottom)/2-(r.top+r.bottom)/2)<30}`);
  await evaluate(`document.querySelectorAll('[data-tree-depth="0"] [data-tree-node]')[12].click()`);
  await check('Mouse selection shows two rows above and below in the panel',`contextVisible('[data-tree-depth="0"] .cascading-tree-items','[data-tree-node]','[aria-pressed=true]')`);
  await press('ArrowDown');
  await check('Directional movement retains centered selection and neighbours',`contextVisible('[data-tree-depth="0"] .cascading-tree-items','[data-tree-node]','[aria-pressed=true]')`);
  await press('F1');await send('Input.insertText',{text:'گروه'});
  await check('Typing immediately marks closest search result green',`(()=>{const e=document.querySelector('[data-search-current=true]');return e && e.textContent.includes('00') && getComputedStyle(e).backgroundColor==='rgb(215, 235, 230)' && document.activeElement.matches('.cascading-tree-search')})()`);
  for(let i=0;i<12;i++)await press('ArrowDown');
  await check('Search arrows move green candidate while focus stays in search',`document.activeElement.matches('.cascading-tree-search') && document.querySelector('[data-search-current=true]').textContent.includes('12')`);
  await press('Enter');
  await check('One Enter focuses green candidate in same column and restores neighbours',`document.activeElement.matches('[data-search-current=true]') && document.activeElement.textContent.includes('12') && document.querySelector('.cascading-tree-search').value==='' && groupTest.nodes.length===25`);
  await check('Search navigation retains two visible neighbours either side',`contextVisible('[data-tree-depth="0"] .cascading-tree-items','[data-tree-node]','[aria-pressed=true]')`);
  await evaluate(`document.activeElement.blur();document.querySelector('[data-action-id="new-person"] button').click()`);
  await until(`document.activeElement.matches('.cascading-tree-inline-add input')`);
  await send('Input.insertText',{text:'گروه'});
  for(let i=0;i<12;i++)await press('ArrowDown');
  await check('Inline suggestions center the selected result with two above and below',`contextVisible('.cascading-tree-inline-matches','[role=option]','[aria-selected=true]')`);
  await evaluate(`window.outerScrollBefore=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+1 && !e.closest('.cascading-tree-items')).map(e=>[e,e.scrollTop]);void 0;`);
  await press('ArrowDown');
  await check('Suggestion movement scrolls its own list without moving outer form',`outerScrollBefore.every(([e,top])=>e.scrollTop===top)`);
  await press('Escape');
  await evaluate(`document.querySelectorAll('.base-grid-table tbody tr')[12].querySelector('td').click()`);
  await check('Report lists still scroll when actual records exceed their height',`(()=>{const e=document.querySelector('[data-tree-depth="0"] [data-report-list]');return e && e.scrollHeight>e.clientHeight})()`);
  await evaluate(`(()=>{const list=groupTest.nodes.slice(0,2);list.push({id:crypto.randomUUID(),parentId:list[0].id,name:'فرزند کم‌تعداد',depth:1,code:list[0].code,hierarchyCode:list[0].hierarchyCode+'.001',rowVersion:'AAAAAAAAAAE='});sessionStorage.setItem('isolated-product-group-records',JSON.stringify(list))})()`);
  await send('Page.reload');await pause(350);await until(`window.groupTest?.nodes.length===3 && document.querySelectorAll('.base-grid-table tbody tr').length===2`);
  await evaluate(`[...document.querySelectorAll('.base-grid-table tbody tr')].find(e=>e.textContent.includes('فرزند کم‌تعداد')).querySelector('td').click()`);
  await check('Short report-linked lists have no overflow from artificial context spacers',`[...document.querySelectorAll('[data-report-list]')].every(e=>e.scrollHeight<=e.clientHeight+1)`);
  await check('Report marker keeps short related groups aligned without unnecessary scrolling',`(()=>{const rows=[...document.querySelectorAll('[data-report-current=true]')];return rows.length===2 && Math.abs(rows[0].getBoundingClientRect().top-rows[1].getBoundingClientRect().top)<2})()`);
  await evaluate(`document.querySelector('[data-tree-depth="0"] .cascading-tree-search').focus()`);await send('Input.insertText',{text:'گروه 00'});await press('Enter');
  await check('Short search selection centers vertically without creating a scrollbar',`(()=>{const list=document.querySelector('[data-tree-depth="0"] .cascading-tree-items'),row=document.activeElement;return row.matches('[data-tree-node]') && Math.abs((row.getBoundingClientRect().top+row.getBoundingClientRect().bottom-list.getBoundingClientRect().top-list.getBoundingClientRect().bottom)/2)<2 && list.scrollHeight<=list.clientHeight+1})()`);
  await press('ArrowLeft');
  await check('Ancestor siblings remain visible around the selected path',`(()=>{const list=document.querySelector('[data-tree-depth="0"] .cascading-tree-items');return list.querySelectorAll('.cascading-tree-node-row').length>1 && !!list.querySelector('[data-tree-path-current=true]')})()`);
  await check('Direct sibling navigation replaces change text and dims unselected names',`(()=>{const list=document.querySelector('[data-tree-depth="0"] .cascading-tree-items'),peer=list.querySelector('.cascading-tree-node:not([aria-pressed="true"])');return !document.querySelector('.cascading-tree-change') && peer && getComputedStyle(peer).color==='rgb(188, 190, 192)'})()`);
  await press('F4');
  await until(`document.querySelector('[data-tree-depth="2"] .cascading-tree-inline-add input')`);
  await check('F4 restores selected ancestry and opens blank next-level entry without inserting',`document.querySelector('[data-tree-depth="2"] .cascading-tree-inline-add input').value==='' && groupTest.nodes.length===3`);
  await check('Independent panel searches are disabled during entry',`[...document.querySelectorAll('.cascading-tree-search')].every(e=>e.disabled)`);
  await press('F1');
  await check('F1 cannot escape entry into search',`document.activeElement.matches('.cascading-tree-inline-add input')`);
  await evaluate(`document.querySelector('[data-tree-depth="1"] .cascading-tree-column-head').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}))`);
  await until(`document.querySelector('[data-tree-depth="1"] .cascading-tree-inline-add input')`);
  await check('Mouse switches entry panel without leaving entry mode',`document.activeElement.matches('[data-tree-depth="1"] .cascading-tree-inline-add input') && [...document.querySelectorAll('.cascading-tree-search')].every(e=>e.disabled)`);
  await press('Escape');
  await check('Escape restores normal browsing searches',`document.querySelector('[data-tree-depth="0"] .cascading-tree-search').disabled===false`);
  await press('F4');await until(`document.querySelector('[data-tree-depth="2"] .cascading-tree-inline-add input')`);
  await send('Input.insertText',{text:'CN'});await press('F3');await until(`document.querySelector('[data-tree-depth="3"] .cascading-tree-inline-add input')`);
  await send('Input.insertText',{text:'نمره 2'});await press('F3');await until(`document.querySelector('[data-tree-depth="4"] .cascading-tree-inline-add input')`);
  await check('New subgroup keeps authoritative parent and full ancestry',`(()=>{const n=groupTest.nodes.find(n=>n.name==='نمره 2'),p=groupTest.nodes.find(n=>n.name==='CN');return n && p && n.parentId===p.id && p.parentId===groupTest.nodes.find(n=>n.name==='فرزند کم‌تعداد').id})()`);
  await check('Saved path stays green and horizontally aligned while next editor is active',`(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')],centers=rows.map(e=>(e.getBoundingClientRect().top+e.getBoundingClientRect().bottom)/2);return rows.length===4 && Math.max(...centers)-Math.min(...centers)<2 && rows.every(e=>getComputedStyle(e).backgroundColor==='rgb(215, 235, 230)' && Number(getComputedStyle(e.querySelector('.cascading-tree-ancestor,.cascading-tree-node')).fontWeight)>=700)})()`);
  await check('Next-level draft remains empty and focused after save',`document.activeElement.matches('[data-tree-depth="4"] .cascading-tree-inline-add input') && document.activeElement.value===''`);
  await press('Escape');
  await evaluate(`(()=>{const list=groupTest.nodes.filter(n=>n.depth<=1);list.find(n=>n.parentId===null && list.some(c=>c.parentId===n.id)).lockedDepth=1;sessionStorage.setItem('isolated-product-group-records',JSON.stringify(list))})()`);
  await send('Page.reload');await pause(350);await until(`window.groupTest?.nodes.some(n=>n.lockedDepth===1) && [...document.querySelectorAll('.base-grid-table tbody tr')].some(e=>e.textContent.includes('فرزند کم‌تعداد'))`);
  await evaluate(`[...document.querySelectorAll('.base-grid-table tbody tr')].find(e=>e.textContent.includes('فرزند کم‌تعداد')).querySelector('td').click()`);
  await until(`document.querySelectorAll('[data-tree-depth]').length===2`);
  await check('Used root hides deeper levels without deleting its records',`groupTest.nodes.length===3 && document.querySelectorAll('[data-tree-depth]').length===2`);
  await press('F4');await until(`document.querySelector('[data-tree-depth="1"] .cascading-tree-inline-add input')`);
  await check('F4 at locked final level retains manual parent context and never inserts',`document.querySelector('[data-tree-depth="1"] .cascading-tree-inline-add input').value==='' && groupTest.nodes.length===3`);
  await press('Escape');
  await evaluate(`(()=>{const list=groupTest.nodes;for(const n of list)if(n.parentId!==null || n.lockedDepth===1)n.isProtected=true;sessionStorage.setItem('isolated-product-group-records',JSON.stringify(list))})()`);
  await send('Page.reload');await pause(350);await until(`window.groupTest?.nodes.some(n=>n.isProtected) && [...document.querySelectorAll('.base-grid-table tbody tr')].some(e=>e.textContent.includes('فرزند کم‌تعداد'))`);
  await evaluate(`[...document.querySelectorAll('.base-grid-table tbody tr')].find(e=>e.textContent.includes('فرزند کم‌تعداد')).querySelector('td').click()`);
  await evaluate(`document.querySelector('[data-tree-depth="1"] [data-tree-node]').click()`);
  await check('Used group allows sibling navigation while hiding protected edit/delete',`!document.querySelector('.cascading-tree-change') && !!document.querySelector('[data-tree-depth="0"] [data-tree-node]') && !document.querySelector('[data-action-id="edit-person"]') && !document.querySelector('[data-action-id="delete-person"]')`);
  assert.deepEqual(errors,[]);
  await writeFile('../artifacts/product-group-backend/selection-context-regression.json',JSON.stringify({passed:true,checks:passed,context:'isolated browser and API fixture',checkedAtUtc:new Date().toISOString()},null,2));
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/selection-context-regression.png',Buffer.from(shot.data,'base64'));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
