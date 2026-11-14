import {revealMenuExpression} from './form-context-navigation.mjs'
import assert from 'node:assert/strict'
import {runNeighborScenarios} from './form-neighbor.scenarios.mjs'
import {runSmartLayoutScenarios} from './form-smart-layout.scenarios.mjs'
import {runToolbarContractScenarios} from './toolbar-contract.scenarios.mjs'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'

// No new dependency. A fresh headless browser owns only this disposable profile.
const base = process.env.FORM_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER; browser checks must not silently skip')
const profile = await mkdtemp(join(tmpdir(), 'yarn-form-regression-'))
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--window-size=1900,1300', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] })
let socket, session, sequence = 0, navigationLoaded,expectedDialog=false
const pending = new Map(), errors = [], results = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  const endpoint = await new Promise((resolve, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools: ' + logs)), 15000)
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome startup exited ' + code + ': ' + logs)) })
    browser.once('error', reject)
    browser.stderr.on('data', chunk => { logs += String(chunk); const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if(data.method==='Page.loadEventFired')navigationLoaded?.()
    if(data.method==='Page.javascriptDialogOpening'){const accept=expectedDialog;expectedDialog=false;if(!accept)errors.push('Unexpected browser dialog: '+data.params.message);void send('Page.handleJavaScriptDialog',{accept})}
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text)
    const call = pending.get(data.id)
    if (call) { pending.delete(data.id); data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result) }
  })
  const send = (method, params = {}, browserLevel = false) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 60000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId:session } : {}) }))
  })
  const loadedNavigation=async(method,params={})=>{
    let timer
    const loaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('New document did not finish loading: '+method)),20000);navigationLoaded=resolve})
    try{await send(method,params);await loaded}finally{clearTimeout(timer);navigationLoaded=undefined}
  }
  const reloadPage=()=>loadedNavigation('Page.reload')
  const navigatePage=params=>loadedNavigation('Page.navigate',params)
  const target = await send('Target.createTarget', { url:'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId:target.targetId, flatten:true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true })
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result.value
  }
  const until = async (expression, label = expression) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) { if (await evaluate('Boolean(' + expression + ')')) return; await pause(100) }
    console.error('DOM_DIAGNOSTIC', await evaluate("JSON.stringify({fields:[...document.querySelectorAll('[data-field-id]')].map(e=>[e.dataset.fieldId,e.closest('.laboratory-form-frame')!==null]),body:document.body.textContent.slice(-2500)})"), errors)
    throw new Error('Browser assertion timed out: ' + label)
  }
  const node = (text, selector = 'button') => `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.getClientRects().length && (e.getAttribute('aria-label')===${JSON.stringify(text)} || e.textContent.trim()===${JSON.stringify(text)}))`
  const clickExpression = async (expression, button = 'left', modifiers=0) => {
    await revealMenuExpression(expression,{evaluate,send,pause})
    await until(`!!(${expression})`, expression)
    const point = await evaluate(`(async()=>{const e=${expression};e.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const current=${expression};const r=current.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', ...point })
    await send('Input.dispatchMouseEvent', { type:'mousePressed', ...point, button, modifiers, clickCount:1 })
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', ...point, button, modifiers, clickCount:1 })
    await pause(100)
  }
  const click = (text, selector) => clickExpression(node(text, selector))
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); results.push(name); console.log('PASS ' + name) }
  const dragRaw=async(expression,dx,dy=0)=>{const p=await evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await pause(180)}

  await navigatePage({url:base+'/tests/form-designer.html?treeGeometry&treeInline'});
  await until("document.querySelectorAll('.cascading-tree-column').length===5");
  await click('آزمایش فرم کامل');
  await until("document.querySelector('[data-runtime-action=\"create\"]')");
  const editor="document.querySelector('.cascading-tree-inline-add input')";
  const press=async(key,code=key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,...(key===' '?{text:' '}: {})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});await pause(100)};
  const type=async(text)=>{await send('Input.insertText',{text});await pause(100)};
  await click('⟳ نمایش همه');
  await evaluate("document.querySelector('[data-tree-depth=\"0\"]').focus()");
  await press('پ','KeyP');
  await check('typing in browse mode focuses and filters the root search', "document.activeElement.matches('.cascading-tree-search')&&document.activeElement.value==='پ'&&!document.querySelector('.cascading-tree-inline-add')");
  await press('ArrowDown');
  await check('browse search ArrowDown focuses matching group', "document.activeElement.dataset.treeNode==='demo-fabric'");
  await press('Enter');
  await check('browse Enter opens children without creating a node', "document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='1'&&!document.querySelector('.cascading-tree-inline-add')");
  await press('ArrowRight');
  await check('RTL ArrowRight returns to parent column', "document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='0'");
  await press('ArrowLeft');
  await check('RTL ArrowLeft enters child column', "document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='1'");
  await press(' ','Space');
  await check('Space on browsed child opens its own subgroup', "document.querySelector('[data-tree-depth=\"2\"] .cascading-tree-inline-add input')===document.activeElement");
  await press('Escape');
  await click('⟳ نمایش همه');
  await clickExpression("document.querySelector('[data-tree-node=\"demo-yarn\"]')");
  await clickExpression("document.querySelector('[data-tree-node=\"demo-yarn-chenille\"]')");
  await check('mouse-selected chenille owns actual keyboard focus', "document.activeElement.dataset.treeNode==='demo-yarn-chenille'");
  await check('only focused group has blue background', "(()=>{const focused=document.activeElement;const color=getComputedStyle(focused).backgroundColor;return [...document.querySelectorAll('[data-tree-node]')].filter(b=>getComputedStyle(b).backgroundColor===color).length===1})()");
  await press(' ','Space');
  await check('Space on chenille opens subgroup two under chenille', "document.querySelector('[data-tree-depth=\"2\"] .cascading-tree-inline-add input')===document.activeElement&&document.querySelector('[data-tree-depth=\"2\"] .cascading-tree-column-head').textContent.includes('شنیل')");
  await check('entry shows only chosen ancestors and no blue stale group', "[...document.querySelectorAll('[data-tree-depth=\"0\"] .cascading-tree-node-row')].length===1&&[...document.querySelectorAll('[data-tree-depth=\"1\"] .cascading-tree-node-row')].length===1&&!document.querySelector('[data-tree-node]:focus')");
  await press('Escape');
  await clickExpression("document.querySelector('.laboratory-footer [data-runtime-action=\"create\"]')");
  await check('main Create retains chenille as parent after focus leaves tree', "document.querySelector('[data-tree-depth=\"2\"] .cascading-tree-inline-add input')===document.activeElement");
  await press('Escape');
  await click('⟳ نمایش همه');
  await clickExpression("document.querySelector('[data-tree-node=\"demo-yarn\"]')");
  await clickExpression("document.querySelector('[data-tree-node=\"demo-yarn-chenille\"]')");
  await evaluate("document.querySelector('[data-tree-node=\"demo-yarn-polyester\"]').focus()");
  await check('focus alone populates both downstream levels', "document.querySelector('[data-tree-depth=\"3\"] [data-tree-node=\"demo-yarn-grade-6\"]')&&document.querySelector('[data-tree-depth=\"4\"] [data-tree-node=\"demo-yarn-grade-6-shiny\"]')&&document.activeElement.dataset.treeNode==='demo-yarn-polyester'");
  await press('ArrowDown');
  await check('keyboard leaf focus clears unrelated downstream groups', "document.activeElement.dataset.treeNode==='demo-yarn-mix'&&!document.querySelector('[data-tree-depth=\"3\"] [data-tree-node]')&&!document.querySelector('[data-tree-depth=\"4\"] [data-tree-node]')");
  await press('ArrowUp');
  await check('keyboard focus restores only the current branch descendants', "document.activeElement.dataset.treeNode==='demo-yarn-polyester'&&document.querySelector('[data-tree-depth=\"4\"] [data-tree-node=\"demo-yarn-grade-6-shiny\"]')&&!document.querySelector('[data-tree-depth=\"4\"] [data-tree-node=\"demo-yarn-matte\"]')");
  await click('⟳ نمایش همه');
  await clickExpression("document.querySelector('.base-grid-table tbody tr[data-row-index=\"6\"] td')");
  await check('left click selects only row and keeps keyboard focus in the grid', "document.activeElement.matches('.base-grid-table-wrap')&&!document.querySelector('.base-grid-table td.is-cell-selected')&&document.querySelector('.base-grid-table tbody tr.is-selected').dataset.rowIndex==='6'");
  await check('table row marks complete upper ancestry without stealing focus', "document.querySelectorAll('[data-report-current=true]').length===3&&[...document.querySelectorAll('[data-report-current=true]')].map(e=>e.textContent).join(' ').includes('پلی‌استر')&&document.activeElement.matches('.base-grid-table-wrap')");
  await press('ArrowDown');
  await check('ArrowDown advances table row and upper path together', "document.querySelector('.base-grid-table tbody tr.is-selected').dataset.rowIndex==='7'&&[...document.querySelectorAll('[data-report-current=true]')].some(e=>e.textContent.includes('مخلوط'))");
  await press('ArrowUp');
  await check('ArrowUp restores previous table row without cell selection', "document.querySelector('.base-grid-table tbody tr.is-selected').dataset.rowIndex==='6'&&!document.querySelector('.base-grid-table td.is-cell-selected')");
  await clickExpression("document.querySelector('.base-grid-table tbody tr[data-row-index=\"6\"] td')", 'right');
  await check('right click selects cell for context operations', "Boolean(document.querySelector('.base-grid-cell-context-menu')&&document.querySelector('.base-grid-table td.is-cell-selected'))");
  await press('Escape');
  await clickExpression("document.querySelector('.base-grid-table tbody tr[data-row-index=\"0\"] td')");
  await check('new row click clears cell highlight and obsolete upper markers', "!document.querySelector('.base-grid-table td.is-cell-selected')&&document.querySelectorAll('[data-report-current=true]').length===1");
  await click('⟳ نمایش همه');
  const height=await evaluate("document.querySelector('.cascading-tree-column').getBoundingClientRect().height");
  await evaluate("document.activeElement?.blur();document.querySelector('[data-form-laboratory]').focus()");
  await press(' ','Space');
  await until(editor);
  await check('tree entry footer exposes only enabled Save and Close', "(()=>{const a=[...document.querySelectorAll('.laboratory-footer [data-runtime-action]')];return a.length===2&&a.every(b=>!b.disabled&&['save','close'].includes(b.dataset.runtimeAction))})()");
  await check('Space invokes root inline creation',"document.activeElement===document.querySelector('.cascading-tree-column .cascading-tree-inline-add input')&&document.querySelectorAll('.cascading-tree-column')[0].contains(document.activeElement)");
  await check('all five Add buttons remain in their bottom footers',"[...document.querySelectorAll('.cascading-tree-column')].every(c=>c.querySelector(':scope > .cascading-tree-column-foot button'))");
  await check('empty input exposes existing groups beneath it', "document.querySelector('.cascading-tree-inline-add input').value===''&&document.querySelectorAll('.cascading-tree-inline-matches [role=option]').length>0");
  await check('save and cancel are in the panel footer', "document.querySelector('.cascading-tree-column-foot button[type=submit]')&&!document.querySelector('.cascading-tree-inline-add button[type=submit]')");
  await press('ArrowDown');
  await check('ArrowDown selects first option without typing', "document.querySelector('.cascading-tree-inline-matches [role=option]').getAttribute('aria-selected')==='true'");
  await press('ArrowDown');await press('ArrowUp');
  await check('ArrowUp returns to first option', "document.querySelector('.cascading-tree-inline-matches [role=option]').getAttribute('aria-selected')==='true'");
  await press('Enter');
  await until("document.querySelectorAll('.cascading-tree-column')[1].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await press('Escape');
  await clickExpression("document.querySelectorAll('.cascading-tree-column')[0].querySelector('[data-tree-add]')");
  await type('ن');await press('ArrowDown');await press('Enter');
  await check('partial search accepts keyboard-selected existing group', "document.querySelectorAll('.cascading-tree-column')[1].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await press('Escape');
  await clickExpression("document.querySelectorAll('.cascading-tree-column')[0].querySelector('[data-tree-add]')");
  await type('نخ');
  await check('live exact duplicate blocks submission',"document.querySelector('.cascading-tree-inline-add input').getAttribute('aria-invalid')==='true'&&document.querySelector('.cascading-tree-column-foot button[type=submit]').disabled");
  await check('inline editor remains in an internally scrollable list viewport',"(()=>{const e=document.querySelector('.cascading-tree-inline-add').closest('.cascading-tree-items');return getComputedStyle(e).overflowY==='auto'&&e.clientHeight>0&&e.closest('.cascading-tree-column').querySelector('.cascading-tree-column-foot').getBoundingClientRect().bottom<=e.closest('.cascading-tree-column').getBoundingClientRect().bottom+1})()");
  await press('Enter');
  await check('duplicate Enter selects existing root and advances',"document.querySelectorAll('.cascading-tree-column')[1].contains(document.querySelector('.cascading-tree-inline-add'))");
  await press('Escape');
  await until('!('+editor+')');
  await clickExpression("document.querySelector('[data-tree-depth=\"0\"] [data-tree-add]')");
  await until(editor);
  await type('گروه');await press(' ','Space');await type('جدید');
  await check('Space while typing stays in the input',"document.querySelector('.cascading-tree-inline-add input').value==='گروه جدید'");
  await press('Enter');
  await check('Enter does not save a new name', "document.querySelector('[data-tree-depth=\"0\"] .cascading-tree-inline-add input').value==='گروه جدید'&&!document.querySelector('.laboratory-grid').textContent.includes('گروه جدید')");
  await press('F3');
  await until("document.querySelectorAll('.cascading-tree-column')[1].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await check('subgroup editor hides internal code', "!document.querySelector('.cascading-tree-inline-add output')");
  await check('root code is recorded in existing report grid',"document.querySelector('.laboratory-grid')?.textContent.includes('001')&&document.querySelector('.laboratory-grid')?.textContent.includes('گروه جدید')");
  await type('فرزند');await press('F3');
  await until("document.querySelectorAll('.cascading-tree-column')[2].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await type('سطح سه');await press('F3');
  await until("document.querySelectorAll('.cascading-tree-column')[3].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await type('سطح چهار');await press('F3');
  await until("document.querySelectorAll('.cascading-tree-column')[4].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await type('سطح پنج');await press('F3');
  await until('!('+editor+')');
  await check('last level save keeps focus on the new group', "document.activeElement.closest('[data-tree-depth]').dataset.treeDepth==='4'&&document.activeElement.textContent.includes('سطح پنج')");
  await check('five levels complete without a sixth editor',"document.querySelectorAll('.cascading-tree-column').length===5&&document.querySelector('.laboratory-grid')?.textContent.includes('سطح پنج')&&!document.querySelector('.laboratory-grid')?.textContent.includes('005')");
  await check('inline entry does not grow panel height',"Math.abs(document.querySelector('.cascading-tree-column').getBoundingClientRect().height-"+height+")<1");
  await check('existing report stays below the hierarchy',"document.querySelector('.laboratory-grid').getBoundingClientRect().top>=document.querySelector('.cascading-tree-panels').getBoundingClientRect().bottom-2&&document.querySelectorAll('[data-table-id]').length===1");
  await click('⟳ نمایش همه');
  await check('missing parents disable subgroup creation',"[...document.querySelectorAll('.cascading-tree-column')].slice(1).every(c=>c.querySelector('.cascading-tree-column-foot button').disabled)");
  await clickExpression("document.querySelectorAll('.cascading-tree-column')[0].querySelector('.cascading-tree-column-foot button')");
  await until(editor); await type('نخ');
  await clickExpression("document.querySelector('.cascading-tree-inline-matches button')");
  await until("document.querySelectorAll('.cascading-tree-column')[1].contains(document.querySelector('.cascading-tree-inline-add input'))");
  await check('selecting an existing match continues under that parent',"document.querySelectorAll('.cascading-tree-column-head')[1].textContent.includes('نخ')");
  await press('Escape');
  await clickExpression("document.querySelectorAll('.cascading-tree-column')[1].querySelector('.cascading-tree-column-foot button')");
  await until(editor);
  await check('bottom subgroup Add opens inside its own panel',"document.querySelectorAll('.cascading-tree-column')[1].contains(document.activeElement)");
  await clickExpression("document.querySelector('.laboratory-footer [data-runtime-action=\"close\"]')");
  await until('!('+editor+')');
  await check('Close restores Create and hides Save', "document.querySelector('.laboratory-footer [data-runtime-action=\"create\"]')&&!document.querySelector('.laboratory-footer [data-runtime-action=\"save\"]')");
  await clickExpression("document.querySelector('[data-tree-depth=\"0\"] [data-tree-add]')");
  await type('ثبت از نوار');
  await clickExpression("document.querySelector('.laboratory-footer [data-runtime-action=\"save\"]')");
  await check('footer Save advances to next level', "document.querySelector('[data-tree-depth=\"1\"] .cascading-tree-inline-add input')===document.activeElement");
  await type('ثبت نشود');await press('Escape');
  await until('!('+editor+')');
  await check('Escape preserves saved parent and restores focus without saving next draft', "document.activeElement.textContent.includes('ثبت از نوار')&&!document.querySelector('.laboratory-grid').textContent.includes('ثبت نشود')");
  await check('footer Save commits the tree and Escape returns to browse actions', "document.querySelector('.laboratory-grid').textContent.includes('ثبت از نوار')&&!document.querySelector('.laboratory-footer [data-runtime-action=\"save\"]')");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results.length,results}));
} catch(error) {
  console.error(error)
  process.exitCode=1
} finally {
  socket?.close(); browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()), 'cleanup stays inside its own temporary directory')
  assert.ok(basename(profile).startsWith('yarn-form-regression-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
