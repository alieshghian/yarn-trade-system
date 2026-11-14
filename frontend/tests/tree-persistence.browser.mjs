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
const url = `http://127.0.0.1:${vite.httpServer.address().port}/tests/tree-persistence.html`
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Chrome/Edge is required')
const profile = await mkdtemp(join(tmpdir(), 'yarn-tree-persistence-'))
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
  const until=async expression=>{for(let i=0;i<80;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(50)}console.error('DIAGNOSTIC',await evaluate("JSON.stringify({focus:document.activeElement.outerHTML,nodes:treeTest.state.nodes,html:document.querySelector('#root').innerHTML.slice(-4000)})"));throw Error('Timed out: '+expression)}
  const check=async(name,expression)=>{await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.ok(await evaluate(expression),name);passed.push(name);console.log('PASS '+name)}
  const press=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}
  const setup=async(args='true, []')=>{await evaluate(`treeTest.setup(${args})`);await until('document.querySelector(".cascading-tree-panels")')}
  const add=async depth=>{await evaluate(`document.querySelector('[data-tree-depth="${depth}"] [data-tree-add]').click()`);await until(`document.querySelector('[data-tree-depth="${depth}"] .cascading-tree-inline-add input')===document.activeElement`)}
  const type=async text=>{await send('Input.insertText',{text})}
  const form='document.querySelector(".cascading-tree-inline-add")'
  const input=form+'.querySelector("input")'
  const roots=JSON.stringify([{id:'a',parentId:null,name:'الف',code:'010'},{id:'b',parentId:null,name:'ب',code:'020'}])
  await send('Page.navigate',{url});await until('window.treeTest')

  await setup('false, []');await add(0);await type('آزمایشگاه');await press('F3')
  await until('treeTest.state.created.length===1')
  await check('Laboratory synchronous creation, code and next-level focus are unchanged', `treeTest.state.nodes.length===1&&treeTest.state.created[0].code==='001'&&document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='1'`)
  await press('Escape');await until('document.activeElement.dataset.treeNode===treeTest.state.created[0].id')
  await check('Laboratory Escape restores the saved parent', 'document.activeElement.dataset.treeNode===treeTest.state.created[0].id')

  await setup();await add(0);await type('سرور');await press('F3');await until('treeTest.state.requests.length===1')
  await evaluate(`${form}.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));${form}.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`)
  await press('F3')
  await check('Pending request blocks repeated submits and inserts nothing', `treeTest.state.requests.length===1&&treeTest.state.nodes.length===0&&treeTest.state.created.length===0&&${form}.getAttribute('aria-busy')==='true'&&${input}.value==='سرور'`)
  await evaluate(`treeTest.resolve(0,{id:'server-root',parentId:null,name:'نام تأییدشده',code:'901'})`)
  await until('treeTest.state.created.length===1')
  await check('Server identity, name and code are authoritative and focus advances', `treeTest.state.nodes[0].id==='server-root'&&treeTest.state.nodes[0].code==='901'&&treeTest.state.nodes[0].name==='نام تأییدشده'&&document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='1'`)
  await type('فرزند');await press('F3');await until('treeTest.state.requests.length===2')
  await check('Child request retains the authoritative parent', `treeTest.state.requests[1].request.parentId==='server-root'`)
  await evaluate(`treeTest.resolve(1,{id:'server-child',parentId:'server-root',name:'فرزند',code:'901/1'})`)
  await until('treeTest.state.created.length===2')
  await check('Server child code is preserved without local renumbering', `treeTest.state.nodes[1].code==='901/1'&&treeTest.state.nodes[1].parentId==='server-root'`)

  await setup(`true, ${roots}`);await evaluate(`treeTest.select('a')`);await until(`document.querySelector('[data-tree-depth="1"] .cascading-tree-column-head').textContent.includes('الف')`);await add(1);await type('جدید');await press('F3');await until('treeTest.state.requests.length===1')
  await evaluate(`treeTest.reject(0,'نام تکراری است')`);await until(`${form}.querySelector('[role="alert"]')`)
  await check('Duplicate conflict preserves input, parent, focus and tree', `${input}.value==='جدید'&&document.activeElement===${input}&&treeTest.state.nodes.length===2&&treeTest.state.created.length===0&&${form}.textContent.includes('نام تکراری')`)
  await press('F3');await until('treeTest.state.requests.length===2');await evaluate(`treeTest.reject(1,'ارتباط شبکه قطع شد')`);await until(`${form}.textContent.includes('ارتباط شبکه')`)
  await check('Network failure is retryable without a phantom node', `${input}.value==='جدید'&&treeTest.state.requests[1].request.parentId==='a'&&treeTest.state.nodes.length===2&&treeTest.state.created.length===0`)
  await press('F3');await until('treeTest.state.requests.length===3');await press('Escape')
  await evaluate(`treeTest.resolve(2,{id:'cancelled',parentId:'a',name:'جدید',code:'10/3'})`);await pause(80)
  await check('Escape aborts and late confirmation cannot recreate a cancelled editor', `treeTest.state.requests[2].request.signal.aborted&&!${form}&&treeTest.state.nodes.length===2&&treeTest.state.created.length===0`)

  await add(1);await type('قدیمی');await press('F3');await until('treeTest.state.requests.length===4');await evaluate(`treeTest.select('b')`);await until(`!${form}`);await add(1);await type('والد جدید');await press('F3');await until('treeTest.state.requests.length===5')
  await evaluate(`treeTest.resolve(3,{id:'stale',parentId:'a',name:'قدیمی',code:'10/4'})`);await pause(80)
  await check('Parent change rejects stale result without unlocking the new pending request', `treeTest.state.requests[3].request.signal.aborted&&treeTest.state.nodes.length===2&&${form}.getAttribute('aria-busy')==='true'&&treeTest.state.requests[4].request.parentId==='b'`)
  await evaluate(`treeTest.resolve(4,{id:'new-child',parentId:'b',name:'والد جدید',code:'20/1'})`);await until('treeTest.state.created.length===1')
  await check('Only the new parent session receives its confirmed child', `treeTest.state.nodes.length===3&&treeTest.state.nodes[2].parentId==='b'&&!treeTest.state.nodes.some(n=>n.id==='stale')`)

  for(const [label,node] of [['wrong parent',{id:'invalid',parentId:'other',name:'جدید',code:'99'}],['missing code',{id:'invalid',parentId:null,name:'جدید'}],['existing identity',{id:'a',parentId:null,name:'جدید',code:'99'}]]) {
    await setup(`true, ${roots}`);await add(0);await type('جدید');await press('F3');await until('treeTest.state.requests.length===1');await evaluate(`treeTest.resolve(0,${JSON.stringify(node)})`);await until(`${form}.querySelector('[role="alert"]')`)
    await check('Invalid response rejected: '+label, `treeTest.state.nodes.length===2&&treeTest.state.created.length===0&&${input}.value==='جدید'`)
  }
  await setup('true, [], 0');await add(0);await type('آخرین');await press('F3');await until('treeTest.state.requests.length===1');await evaluate(`treeTest.resolve(0,{id:'last',parentId:null,name:'آخرین',code:'999'})`);await until('treeTest.state.created.length===1');await until(`document.activeElement.dataset.treeNode==='last'`)
  await check('Last allowed level exits entry and focuses the confirmed node', `!${form}&&document.activeElement.dataset.treeNode==='last'`)
  await add(0);await type('حذف صفحه');await press('F3');await until('treeTest.state.requests.length===2');await evaluate(`treeTest.unmount();treeTest.resolve(1,{id:'unmounted',parentId:null,name:'حذف صفحه',code:'1000'})`);await pause(80)
  await check('Unmount aborts pending work and suppresses notifications', 'treeTest.state.requests[1].request.signal.aborted&&treeTest.state.created.length===1')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:passed.length}))
} catch(error) {console.error(error);process.exitCode=1}
finally {
  socket?.close();browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('yarn-tree-persistence-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await vite.close()
}
