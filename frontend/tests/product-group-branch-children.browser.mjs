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
  await evaluate("(()=>{const rows=[{id:'r',parentId:null,name:'DTY',depth:0},{id:'bright',parentId:'r',name:'BRIGHT',depth:1},{id:'s',parentId:'bright',name:'RW',depth:2},{id:'t',parentId:'bright',name:'RW STEAMED',depth:2},...['300','150'].flatMap(id=>[{id,parentId:'s',name:id+'D',depth:3},...['96','288'].map(n=>({id:id+n,parentId:id,name:n+'F',depth:4}))])].map(n=>({...n,code:'004',hierarchyCode:n.id,rowVersion:'AAAAAAAAAAE='}));sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("document.querySelector('[data-tree-node=\"r\"]')");
  await evaluate("document.querySelector('[data-tree-node=\"r\"]').click()");await until("document.querySelector('[data-tree-node=\"t\"]')");
  await evaluate("document.querySelector('[data-tree-node=\"t\"]').click()")
  await until("document.querySelector('[data-tree-depth=\"2\"] [data-tree-copy-branch]')");await evaluate("document.querySelector('[data-tree-depth=\"2\"] [data-tree-copy-branch]').click()");
  await until("document.querySelector('[aria-label=\"گروه مبدأ کپی شاخه\"]')");
  await evaluate("(()=>{const e=document.querySelector('[aria-label=\"گروه مبدأ کپی شاخه\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'s');e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  const clickCheck=async index=>{const point=await evaluate('(()=>{const e=document.querySelectorAll(\'.cascading-tree-copy input\')['+index+'];e.scrollIntoView({block:\'nearest\'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})};
  await clickCheck(0);await clickCheck(3);await check('deselecting both parents clears all descendants',"document.querySelectorAll('.cascading-tree-copy input:checked').length===0");
  for(const index of [1,2,4,5])await clickCheck(index);
  await check('four real mouse checkbox choices retain all children and both parents',"document.querySelectorAll('.cascading-tree-copy input:checked').length===6");
  await evaluate("document.querySelector('.cascading-tree-copy').focus()");await press('F3');await until("!document.querySelector('.cascading-tree-copy')");
  await check('all selected children are sent and displayed under the correct destination parents',"(()=>{const req=groupTest.requests.find(r=>r.body?.selectedIds),parents=groupTest.nodes.filter(n=>n.parentId==='t');return req.body.selectedIds.length===6 && parents.length===2 && parents.every(p=>groupTest.nodes.filter(n=>n.parentId===p.id).length===2)})()");
  await evaluate("(()=>{const copied=groupTest.nodes.filter(n=>n.parentId==='t');const rows=groupTest.nodes.filter(n=>!copied.some(p=>n.parentId===p.id && ((p.name==='300D' && n.name==='288F') || (p.name==='150D' && n.name==='96F'))));sessionStorage.setItem('isolated-product-group-records',JSON.stringify(rows))})()");
  await send('Page.reload');await pause(350);await until("document.querySelector('[data-tree-node=\"r\"]')");await evaluate("document.querySelector('[data-tree-node=\"r\"]').click()");await until("document.querySelector('[data-tree-node=\"t\"]')");await evaluate("document.querySelector('[data-tree-node=\"t\"]').click()");
  for(let i=0;i<6;i++) {
    const name=i%2?'150D':'300D';await evaluate("[...document.querySelectorAll('[data-tree-depth=\"3\"] [data-tree-node]')].find(e=>e.textContent.includes('"+name+"')).click()");
    await check('single child stays green and aligned on parent switch '+i,"(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')].map(e=>{const r=e.getBoundingClientRect();return (r.top+r.bottom)/2});return rows.length===5 && Math.max(...rows)-Math.min(...rows)<2})()");
  }

  const openAgain=async()=>{
    await evaluate(`document.querySelector('[data-tree-depth="2"] [data-tree-copy-branch]').click()`);
    await until(`document.querySelector('[aria-label="گروه مبدأ کپی شاخه"]')`);
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="گروه مبدأ کپی شاخه"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(e,"s");e.dispatchEvent(new Event("change",{bubbles:true}))})()`);
  };
  await openAgain();
  await check('only missing leaves are selectable, existing parents are context only',"document.querySelectorAll('.cascading-tree-copy input[type=checkbox]').length===2 && [...document.querySelectorAll('.cascading-tree-copy label')].filter(e=>!e.querySelector('input')).length===2");
  const width=await evaluate("document.querySelector('[data-tree-copy-expand]').closest('section').getBoundingClientRect().width");
  await evaluate("document.querySelector('[data-tree-copy-expand]').click()");
  await check('copy opens square for a short list above all form content',"(()=>{const d=document.querySelector('dialog.cascading-tree-copy-dialog');const r=d.getBoundingClientRect();const footer=d.querySelector('.cascading-tree-column-foot').getBoundingClientRect();return d.matches(':modal') && r.width<=440 && Math.abs(r.height-r.width)<3 && footer.bottom<=r.bottom && footer.top>=r.top && d.contains(document.elementFromPoint(r.left+20,r.top+20))})()");
  {const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/branch-copy-modal.png',Buffer.from(shot.data,'base64'))}

  await check('selected count shows only selectable missing items',"document.querySelector('[data-tree-copy-count]').textContent.includes('2 از 2')");
  await evaluate("document.querySelector('.cascading-tree-copy input[type=checkbox]').click()");
  await check('selected count updates immediately',"document.querySelector('[data-tree-copy-count]').textContent.includes('1 از 2')");
  await evaluate("document.querySelector('.cascading-tree-copy input[type=checkbox]').click()");
  await evaluate("(()=>{const f=document.querySelector('.cascading-tree-copy');for(let i=0;i<40;i++){const e=document.createElement('label');e.dataset.testLong='true';e.textContent='Test branch '+i;f.append(e)}})()");
  await until("document.querySelector('dialog').getBoundingClientRect().height>700");
  await check('long list grows to viewport and then scrolls with footer visible',"(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect(),list=d.querySelector('.cascading-tree-items'),footer=d.querySelector('.cascading-tree-column-foot').getBoundingClientRect();return r.bottom<=innerHeight && list.scrollHeight>list.clientHeight && footer.bottom<=r.bottom})()");
  await evaluate("document.querySelectorAll('[data-test-long]').forEach(e=>e.remove())");
  await until("Math.abs(document.querySelector('dialog').getBoundingClientRect().height-420)<3");
  await evaluate("document.querySelector('[data-tree-depth=\"0\"] [data-tree-node]').focus()");
  await check('background cannot receive focus while modal is open',"document.querySelector('dialog').contains(document.activeElement)");
  for(let i=0;i<9;i++)await press('Tab');
  await check('Tab remains inside the copy modal',"document.querySelector('dialog').contains(document.activeElement)");
  await evaluate("document.querySelector('.cascading-tree-copy').focus()");await press('Escape');
  await check('cancel restores normal size',"!document.querySelector('.is-branch-expanded') && !document.querySelector('.cascading-tree-copy')");
  await openAgain();await evaluate("document.querySelector('[data-tree-copy-expand]').click()");await evaluate("document.querySelector('dialog .cascading-tree-copy-actions button[type=submit]').click()");await until("!document.querySelector('.cascading-tree-copy')");
  await check('save restores normal size and merges only missing leaves',"!document.querySelector('.is-branch-expanded') && groupTest.nodes.filter(n=>n.parentId==='t').every(p=>groupTest.nodes.filter(n=>n.parentId===p.id).length===2)");

  const originalPath=await evaluate("[...document.querySelectorAll('[data-tree-path-current=true] [data-tree-node]')].map(e=>e.dataset.treeNode).join(',')");
  for(const depth of [2,3,2,3]) for(const expanded of [false,true]) {
    await evaluate('document.querySelector(`[data-tree-depth="'+depth+'"] [data-tree-copy-branch]`).click()');
    await until("document.querySelector('.cascading-tree-copy')");
    if(expanded) await evaluate("document.querySelector('[data-tree-copy-expand]').click()");
    await evaluate("document.querySelector('[data-tree-cancel-copy]').click()");
    await until("!document.querySelector('.cascading-tree-copy')");await pause(150);
    await check('cancel restores same aligned path at depth '+depth+' expanded '+expanded,"(()=>{const rows=[...document.querySelectorAll('[data-tree-path-current=true]')],ids=rows.map(r=>r.querySelector('[data-tree-node]').dataset.treeNode).join(',');const centers=rows.map(r=>{const b=r.getBoundingClientRect();return (b.top+b.bottom)/2});return ids==="+JSON.stringify(originalPath)+" && centers.length===5 && Math.max(...centers)-Math.min(...centers)<2})()");
  }
  assert.deepEqual(errors,[]);await writeFile('../artifacts/product-group-backend/branch-copy-multiple-children.json',JSON.stringify({passed:true,checks:passed,context:'isolated real UI, mouse checkbox events, mock API transport'},null,2));
} catch(error){console.error(error,errors);if(socket && session){const d=await send('Runtime.evaluate',{expression: "JSON.stringify({title:document.title,location:location.href,buttons:[...document.querySelectorAll('aside button')].map(e=>e.title),permissions:JSON.parse(sessionStorage.getItem('permissions')||'[]').filter(x=>x.startsWith('productGroups')),errors:document.querySelector('.login-page')?.textContent?.slice(0,100)})",returnByValue:true});console.error(d.result?.value);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('../artifacts/product-group-backend/local-operational-smoke.png',Buffer.from(shot.data,'base64'))}process.exitCode=1}
finally{socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
