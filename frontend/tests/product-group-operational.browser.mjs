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

  await send('Page.navigate',{url});await until('window.groupTest && document.querySelector(".cascading-tree-panels")')
  await check('Empty API means empty tree and standard six-column grid', 'groupTest.nodes.length===0&&!document.querySelector("[data-tree-node]")&&document.querySelectorAll(".base-grid-table thead th[data-column]").length===6')
  const tree='document.querySelector(".cascading-tree-panels")',grid='document.querySelector(".base-grid-boundary")'
  await check('Real shared report grid is below the tree',grid+' && '+grid+'.getBoundingClientRect().top >= '+tree+'.getBoundingClientRect().bottom')
  const measure = `(()=>{const parts=['body','back','all','path','status','limit','0.column','1.column','2.column','3.column','4.column'];return Object.fromEntries(parts.map(id=>{const e=document.querySelector('[data-field-id="product-group.cascading-tree.tree.'+id+'"] .designer-input-part');if(!e)return[id,null];const n=e.firstElementChild,s=getComputedStyle(n),r=e.getBoundingClientRect();return[id,{width:r.width,height:r.height,...(id==='body'?{viewportInset:e.closest('.base-form-editor').clientWidth-r.width}:{}),font:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,radius:s.borderRadius}]}))})()`
  const extraMeasure=`(()=>{const selectors={title:document.querySelector('.cascading-tree-header h2')?'.cascading-tree-header h2':'.form-laboratory-banner strong',header:document.querySelector('.cascading-tree-header')?'.cascading-tree-header':'.form-laboratory-banner',grid:'.base-grid-table thead th[data-column]',footer:'.laboratory-footer .laboratory-action-button button'};return Object.fromEntries(Object.entries(selectors).map(([k,q])=>{const e=document.querySelector(q);if(!e)return[k,null];const s=getComputedStyle(e),r=e.getBoundingClientRect();return[k,{height:r.height,fontSize:s.fontSize,font:s.fontFamily,color:s.color,background:s.backgroundColor,radius:s.borderRadius,fontWeight:s.fontWeight}]}))})()`
  const operationalVisual=await evaluate(measure), operationalExtra=await evaluate(extraMeasure)
  if(!process.argv.includes("--visual-only")) {
  await evaluate(`document.querySelector('[data-action-id="new-person"] button').click()`);await until('document.querySelector(".cascading-tree-inline-add input")===document.activeElement')
  await send('Input.insertText',{text:'ریشه واقعی'});await press('F3');await until('groupTest.nodes.length===1&&document.activeElement.closest("[data-tree-depth]")?.dataset.treeDepth==="1"')
  await check('Server root identity and assigned code reach the shared report','document.querySelector(".base-grid-table").textContent.includes("007")&&document.querySelector(".base-grid-table").textContent.includes("ریشه واقعی")')
  await send('Input.insertText',{text:'فرزند واقعی'});await press('F3');await until('groupTest.nodes.length===2&&document.activeElement.closest("[data-tree-depth]")?.dataset.treeDepth==="2"');await press('Escape');await until('document.querySelectorAll(".base-grid-table tbody tr").length===1&&["ریشه واقعی","فرزند واقعی"].every(name=>document.querySelector(".base-grid-table tbody tr").textContent.includes(name))')
  await check('Descendant inherits root code without changing technical parent','groupTest.nodes[1].parentId===groupTest.nodes[0].id&&groupTest.nodes[1].code==="007"')
  await evaluate('document.querySelectorAll(".base-grid-table tbody tr")[0].querySelector("td").click()');await until('document.querySelectorAll("[data-tree-depth]")[1].querySelector(".cascading-tree-column-head").textContent.includes("ریشه واقعی")')
  await check('Report selection requests the matching tree ancestry', 'document.querySelectorAll("[data-tree-depth]")[1].textContent.includes("فرزند واقعی")')
  await evaluate('sessionStorage.setItem("isolated-product-group-records",JSON.stringify(groupTest.nodes))');await evaluate('delete window.groupTest');await send('Page.reload');await until('window.groupTest && document.querySelectorAll("[data-tree-node]").length')
  await check('Reload uses persisted test server records, no demo fallback','groupTest.nodes.length===2&&document.querySelector(".base-grid-table").textContent.includes("ریشه واقعی")&&!document.querySelector("[data-tree-node^=demo]")')
  await evaluate(`groupTest.fail=true;document.querySelector('[data-tree-depth="0"] [data-tree-add]').click()`);await until('document.querySelector(".cascading-tree-inline-add input")===document.activeElement')
  await send('Input.insertText',{text:'نام مردود'});await press('F3');await until('document.querySelector(".cascading-tree-inline-add [role=alert]")')
  await check('API failure preserves input without phantom rows','groupTest.nodes.length===2&&document.querySelector(".cascading-tree-inline-add input").value==="نام مردود"')

  await press('Escape');await until('!document.querySelector(".cascading-tree-inline-add")&&document.activeElement.dataset.treeNode===groupTest.nodes[0].id');await evaluate('groupTest.fail=false')
  await evaluate('document.querySelectorAll(".base-grid-table tbody tr")[0].querySelector("td").click()');await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await press('Insert')
  await until('document.querySelector(".cascading-tree-inline-add input")===document.activeElement')
  await check('Edit reuses the same name editor with the selected node', 'document.activeElement.value==="فرزند واقعی"&&document.querySelectorAll(".cascading-tree-inline-add").length===1')
  await until('document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length');await send('Input.insertText',{text:'ویرایش شده'});await press('F3');await until('groupTest.nodes[1].name==="ویرایش شده"&&!document.querySelector(".cascading-tree-inline-add")')
  await check('Edit commits the same identity and parent then restores focus','groupTest.nodes.length===2&&groupTest.nodes[1].code==="007"&&document.activeElement.dataset.treeNode===groupTest.nodes[1].id')
  await evaluate('groupTest.fail=true');await press('Insert');await until('document.activeElement.matches(".cascading-tree-inline-add input")&&document.activeElement.selectionEnd===document.activeElement.value.length');await send('Input.insertText',{text:'ویرایش مردود'});await press('F3');await until('document.querySelector(".cascading-tree-inline-add [role=alert]")&&document.activeElement.matches(".cascading-tree-inline-add input")');
  await check('Rejected edit keeps input, identity and parent context','document.activeElement.value==="ویرایش مردود"&&groupTest.nodes[1].name==="ویرایش شده"&&groupTest.nodes.length===2')
  await press('Escape');await until('!document.querySelector(".cascading-tree-inline-add")&&document.querySelector("[data-action-id=copy-selected] button")');await evaluate('groupTest.fail=false')
  await until('document.activeElement.dataset.treeNode===groupTest.nodes[1].id');await evaluate('groupTest.deferRename=true;groupTest.beforeRename=groupTest.requests.filter(r=>r.method==="PUT").length');await press('Insert');await until('document.activeElement.matches(".cascading-tree-inline-add input")&&document.activeElement.selectionEnd===document.activeElement.value.length');await send('Input.insertText',{text:'پاسخ دیررس'});await press('F3');await until('document.querySelector(".cascading-tree-inline-add").getAttribute("aria-busy")==="true"');await press('F3')
  await check('Pending edit prevents repeated requests and preserves the visible tree','groupTest.requests.filter(r=>r.method==="PUT").length===groupTest.beforeRename+1&&document.querySelector(".cascading-tree-inline-add input").readOnly&&groupTest.nodes[1].name==="ویرایش شده"')
  await press('Escape');await until('!document.querySelector(".cascading-tree-inline-add")&&document.activeElement.dataset.treeNode===groupTest.nodes[1].id');await evaluate('groupTest.finishRename()');await pause(50)
  await check('Cancelled edit aborts its signal and discards late confirmation','groupTest.renameSignal.aborted&&!document.querySelector(".cascading-tree-inline-add")&&document.querySelector(".base-grid-table").textContent.includes("ویرایش شده")&&!document.querySelector(".base-grid-table").textContent.includes("پاسخ دیررس")')
  await press('F4');await until('document.querySelector(".cascading-tree-inline-add input")===document.activeElement')
  await check('F4 restores selected ancestry with an empty draft and no implicit write','document.activeElement.value===""&&document.activeElement.closest("[data-tree-depth]").dataset.treeDepth==="2"&&groupTest.nodes.length===2')
  await send('Input.insertText',{text:'کپی منتخب'});await press('F3');await until('groupTest.nodes.length===3&&document.activeElement.closest("[data-tree-depth]")?.dataset.treeDepth==="3"');await press('Escape')
  await check('F3 creates exactly one child under the selected node','groupTest.nodes[2].parentId===groupTest.nodes[1].id&&groupTest.nodes[2].id!==groupTest.nodes[1].id')
  await press('F2');await until('document.querySelector(".cascading-tree-inline-add input")===document.activeElement')
  await check('F2 restores the newest path at the next permitted depth without saving','document.activeElement.value===""&&document.activeElement.closest("[data-tree-depth]").dataset.treeDepth==="3"&&groupTest.nodes.length===3')
  await press('Escape');await until('document.querySelector("[data-action-id=delete-person] button")&&!document.querySelector("[data-action-id=delete-person] button").disabled');await press('Delete');await until('groupTest.nodes.length===2&&!document.querySelector(".cascading-tree-inline-add")')
  await check('Delete removes only the confirmed leaf and reloads real rows','!groupTest.nodes.some(n=>n.name==="کپی منتخب")&&document.querySelector(".base-grid-table").textContent.includes("ویرایش شده")')
  const rootPoint=await evaluate('(()=>{const button=document.querySelector("[data-tree-node="+CSS.escape(groupTest.nodes[0].id)+"]");button.scrollIntoView({block:"nearest"});const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...rootPoint,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...rootPoint,button:'left',clickCount:1})
  await until('document.activeElement.dataset.treeNode===groupTest.nodes[0].id')
  await press('Delete');await until('document.querySelector("[role=alert]")?.textContent.includes("زیرگروه")')
  await check('Parent deletion is rejected without losing descendants','groupTest.nodes.length===2')
  await evaluate('document.querySelector(".form-settings-button").click()');await until('document.querySelector(".product-group-depth-settings input")')
  const setDepth=async n=>{await evaluate(`(()=>{const e=document.querySelector('.product-group-depth-settings input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${n}');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await evaluate('document.querySelector(".product-group-depth-settings button").click()')}
  await setDepth(2);await until('groupTest.maxSubgroups===2&&document.querySelectorAll("[data-tree-depth]").length===3')
  await check('Admin depth uses the existing settings entry and policy API','document.querySelectorAll("[data-tree-depth]").length===3&&groupTest.nodes.length===2')
  await setDepth(0);await until('document.querySelector("[role=alert]")?.textContent.includes("سطوح پایین")')
  await check('Reducing depth cannot hide or delete existing deeper groups','groupTest.maxSubgroups===2&&groupTest.nodes.length===2&&document.querySelectorAll("[data-tree-depth]").length===3')
  await evaluate('delete window.groupTest');await send('Page.navigate',{url:url+'?denied&nonadmin'});await until('window.groupTest&&document.querySelector(".form-settings-button")')
  await check('Unauthorized CRUD actions remain unavailable','["new-person","copy-last","copy-selected","edit-person","delete-person"].every(id=>document.querySelector(`[data-action-id="${id}"] button`).disabled)')
  await evaluate('document.querySelector(".form-settings-button").click()');await pause(100)
  await check('Non-administrators have no depth control','!document.querySelector(".product-group-depth-settings")')

  }
  await evaluate('delete window.groupTest');await send('Page.navigate',{url:url+'?reference&formDesign=form.new.8e77aae6-9477-41f9-b473-9d52511535a1'});await until('window.groupTest&&document.querySelector(".cascading-tree-panels")')
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='نمای عملیاتی')?.click()`)
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const referenceVisual=await evaluate(measure)
  const referenceExtra=await evaluate(extraMeasure)
  for(const [id,expected] of Object.entries(referenceVisual)) {
    const actual=operationalVisual[id];assert.ok(actual && expected,'Missing visual target '+id)
    for(const key of ['font','fontSize','fontWeight','color','background','radius']) assert.equal(actual[key],expected[key],id+' '+key)
    assert.ok(Math.abs(actual.height-expected.height)<0.25,id+' height')
    assert.ok(Math.abs((id==='body'?actual.viewportInset:actual.width)-(id==='body'?expected.viewportInset:expected.width))<0.25,id+' width/insets')
  }
  assert.deepEqual(operationalExtra,referenceExtra)
  console.log('PASS Approved Laboratory visual parity: 11 parts, header, title, grid and footer; fluid body normalized to pane client width')
  passed.push('Approved Laboratory computed visual parity')
  const {mkdir,writeFile}=await import('node:fs/promises')
  await mkdir('../artifacts/product-group-backend',{recursive:true})
  await writeFile('../artifacts/product-group-backend/visual-comparison.json',JSON.stringify({operational:operationalVisual,laboratory:referenceVisual,operationalExtra,laboratoryExtra:referenceExtra,passed:true},null,2))
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:passed.length}))
} catch(error) {console.error(error);process.exitCode=1}
finally {
  socket?.close();browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-product-group-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await vite.close()
}
