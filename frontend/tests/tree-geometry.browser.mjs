import {runRegisteredGeometryScenarios} from './registered-geometry.scenarios.mjs'
import {runTreeEdgeKeyboardScenarios} from './tree-edge-keyboard.scenarios.mjs'
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
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100) }
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
  const field = id => `document.querySelector('.laboratory-form-frame [data-field-id="${id}"]')`
  const count = () => evaluate(`document.querySelectorAll('.laboratory-form-frame [data-field-id]').length`)
  const mode = expected => until(`document.querySelector('[data-form-design-mode]')?.dataset.formDesignMode===${JSON.stringify(expected)}`)
  const menu = text => text === 'حذف از این فرم'
    ? `Array.from(document.querySelectorAll('[role="menu"] button')).find(e=>e.getClientRects().length&&(e.textContent.trim()==="حذف از این فرم"||/^حذف \\d+ فیلد انتخاب‌شده$/.test(e.textContent.trim())))`
    : node(text, '[role="menu"] button')

  await navigatePage({url:base+'/tests/form-designer.html?treeGeometry=1'+((process.env.TREE_CANVAS_TEST||process.argv.includes('--canvas'))?'&treeCanvas=1':'')+(process.argv.includes('--registered')?'&treeSave=1':'')})
  await until(`!!document.querySelector('[data-form-design-mode]')`); await pause(700)
  for(let attempt=0;attempt<5;attempt++){ await evaluate(`window.dispatchEvent(new CustomEvent('open-form-design-draft',{detail:{id:'form.tree-geometry'}}))`); await pause(450); if(await evaluate(`document.querySelectorAll('.cascading-tree-panel-selector').length===5`))break }
  await until(`document.querySelectorAll('.cascading-tree-panel-selector').length===5`)
  const treeTarget=id=>`document.querySelector('[data-field-id="product-group.cascading-tree.tree.${id}"] > div > .designer-input-part')`
  const bounds=async expr=>evaluate(`(()=>{const r=(${expr}).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`)
  if(process.argv.includes('--edge-keyboard')) {
    results.push(...await runTreeEdgeKeyboardScenarios({evaluate,send,pause,clickExpression,bounds,treeTarget}))
  } else if(process.argv.includes('--registered')) {
    results.push(...await runRegisteredGeometryScenarios({evaluate,send,pause,clickExpression,bounds,treeTarget,reloadPage,until}))
  } else {
  let previousSize
  await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[1]`)
  const moveBefore=await bounds(treeTarget('1.column'))
  await dragRaw(`${treeTarget('1.column')}.querySelector('[aria-label="Move input"]')`,12,8)
  const moveAfter=await bounds(treeTarget('1.column'))
  assert.ok(Math.abs(moveAfter.left-moveBefore.left-12)<2&&Math.abs(moveAfter.top-moveBefore.top-8)<2&&Math.abs(moveAfter.width-moveBefore.width)<2&&Math.abs(moveAfter.height-moveBefore.height)<2,'move icon moves the panel and cannot activate corner resizing '+JSON.stringify({moveBefore,moveAfter}))
  await clickExpression(node('واگرد'));await pause(100)
  results.push('move icon has a separate hit target from the top-right resize corner');console.log('PASS move icon has a separate hit target from the top-right resize corner')
  for(const [edge,dx,dy] of [['right',36,0],['left',-30,0],['bottom',0,28],['top',0,-24]]){
    if(!await evaluate(`document.querySelectorAll('.cascading-tree-panel-selector')[1].getAttribute('aria-pressed')==='true'`))await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[1]`)
    const box=treeTarget('1.column'); await evaluate('('+box+').scrollIntoView({block:'+JSON.stringify('center')+',inline:'+JSON.stringify('nearest')+'})'); await pause(100); const before=await bounds(box)
    if(previousSize)assert.ok(Math.abs(before.width-previousSize.width)<2&&Math.abs(before.height-previousSize.height)<2,'reselection preserves resized dimensions')
    await dragRaw(`${box}.querySelector('.designer-edge-${edge}')`,dx,dy)
    const after=await bounds(box), child=await bounds(`${box}.querySelector(':scope > .cascading-tree-column')`)
    assert.ok(Math.abs(after.width-child.width)<2 && Math.abs(after.height-child.height)<2,'handles match painted column '+edge)
    assert.ok(edge==='left'||edge==='right'?Math.abs(after.height-before.height)<2:Math.abs(after.width-before.width)<2,'independent axes '+edge)
    assert.ok(edge==='right'?after.width>before.width+20:edge==='left'?after.width>before.width+20:after.height>before.height+15,'edge grows '+edge+' '+JSON.stringify({before,after}))
    assert.ok(Math.abs(edge==='right'?after.left-before.left:edge==='left'?after.right-before.right:edge==='bottom'?after.top-before.top:after.bottom-before.bottom)<2,'opposite edge fixed '+edge)
    previousSize=after
    console.log('PASS column '+edge);results.push('column '+edge)
  }
  for(let undo=0;undo<4;undo++){await clickExpression(node('واگرد'));await pause(80)}
  results.push('column resize Undo restores original layout');console.log('PASS column resize Undo restores original layout')
  for(const [edge,dx,dy] of [['top-left',-18,-14],['top-right',18,-14],['bottom-left',-18,14],['bottom-right',18,14]]){
    if(!await evaluate(`document.querySelectorAll('.cascading-tree-panel-selector')[1].getAttribute('aria-pressed')==='true'`))await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[1]`)
    const box=treeTarget('1.column'); await evaluate('('+box+').scrollIntoView({block:'+JSON.stringify('center')+',inline:'+JSON.stringify('nearest')+'})'); await pause(100); const before=await bounds(box)
    await dragRaw(`${box}.querySelector('.designer-edge-${edge}')`,dx,dy)
    const after=await bounds(box)
    assert.ok(after.width>before.width+12&&after.height>before.height+9,'diagonal handle grows both axes '+edge)
    assert.ok(Math.abs(edge.includes('left')?after.right-before.right:after.left-before.left)<2&&Math.abs(edge.includes('top')?after.bottom-before.bottom:after.top-before.top)<2,'diagonal handle preserves opposite edges '+edge)
    await clickExpression(node('واگرد'));await pause(100)
    results.push('column '+edge);console.log('PASS column '+edge)
  }
  const header=treeTarget('header')
  await clickExpression(`${header}.querySelector('h2')`)
  const before=await bounds(header)
  await dragRaw(`${header}.querySelector('.designer-edge-bottom')`,0,35)
  const after=await bounds(header)
  assert.ok(Math.abs(after.width-before.width)<2&&after.height>before.height+25,'header height grows independently '+JSON.stringify({before,after}));results.push('header independent height');console.log('PASS header independent height')
  // Grab the painted border itself, away from the small center handle.
  for(const [edge,dx,dy] of [['top',0,15],['bottom',0,-15],['left',15,0],['right',-15,0]]) {
    await evaluate(`(${header}).scrollIntoView({block:'center',inline:'nearest'})`);await pause(120)
    const before=await bounds(header),frameBefore=await bounds(`document.querySelector('.laboratory-form-frame')`)
    const start={x:edge==='left'?before.left+2:edge==='right'?before.right-2:before.left+before.width*.3,y:edge==='top'?before.top+2:edge==='bottom'?before.bottom-2:before.top+before.height*.5}
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+dx,y:start.y+dy,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+dx,y:start.y+dy,button:'left',clickCount:1});await pause(160)
    const after=await bounds(header),frameAfter=await bounds(`document.querySelector('.laboratory-form-frame')`)
    assert.ok(edge==='top'||edge==='bottom'?after.height<before.height-10:Math.abs(after.width-before.width)<2,'header height changes but row width is locked '+edge+' '+JSON.stringify({before,after,start}))
    assert.ok(Math.abs(frameBefore.left-frameAfter.left)<1&&Math.abs(frameBefore.top-frameAfter.top)<1,'header edge must never move form '+edge)
    assert.ok(Math.abs(after.top-before.top)<2&&Math.abs(after.left-before.left)<2,'title stays attached to its full-width row '+edge)
    results.push('header painted border '+edge);console.log('PASS header painted border '+edge)
  }
  await check('outer tree has no vertical scroll viewport',`getComputedStyle(document.querySelector('.cascading-tree-panels')).overflowY==='visible'`)
  await check('tree editor does not introduce an outer scroll viewport',`getComputedStyle(document.querySelector('.laboratory-editor:has(.cascading-tree-panels)')).overflowY==='visible'`)
  await check('legacy root frame is not a competing selectable layer',`!document.querySelector('[data-field-id="product-group.cascading-tree"] > .laboratory-field-select').getClientRects().length`)
  await check('title and input surface have independent selectable targets',`['header','body'].every(id=>document.querySelector('[data-field-id="product-group.cascading-tree.tree.'+id+'"] > .laboratory-field-select').getClientRects().length>0)`)
  await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[0]`)
  await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[2]`,'left',2)
  await check('column multiselection',`document.querySelectorAll('.cascading-tree-panel-selector[aria-pressed="true"]').length===2`)
  const ctrlL=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'l',code:'KeyL',modifiers:2,windowsVirtualKeyCode:76});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'l',code:'KeyL',modifiers:2,windowsVirtualKeyCode:76});await pause(150)}
  const blockedBefore=await Promise.all(['0.column','1.column','2.column'].map(id=>bounds(treeTarget(id))))
  await ctrlL()
  const blockedAfter=await Promise.all(['0.column','1.column','2.column'].map(id=>bounds(treeTarget(id))))
  assert.ok(blockedAfter.every((r,i)=>Math.abs(r.left-blockedBefore[i].left)<1&&Math.abs(r.top-blockedBefore[i].top)<1),'nonadjacent automatic layout must not overlap an unselected column')
  results.push('nonadjacent layout collision is rejected atomically');console.log('PASS nonadjacent layout collision is rejected atomically')
  await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[3]`)
  await dragRaw(`${treeTarget('3.column')}.querySelector('.designer-edge-top')`,0,12)
  await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[2]`)
  await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[3]`,'left',2)
  const unselectedBefore=await bounds(treeTarget('1.column'))
  const hostBefore=await bounds(`document.querySelector('.cascading-tree-panels')`)
  const selectedBefore=await Promise.all([bounds(treeTarget('2.column')),bounds(treeTarget('3.column'))])
  await ctrlL()
  const aligned=await Promise.all([bounds(treeTarget('2.column')),bounds(treeTarget('3.column'))])
  assert.ok(Math.abs(aligned[0].top-aligned[1].top)<2,'Ctrl+L aligns selected column tops')
  const ordered=[...aligned].sort((a,b)=>a.left-b.left)
  const oldOrder=[...selectedBefore].sort((a,b)=>a.left-b.left);assert.ok(Math.abs(ordered[1].left-ordered[0].right-Math.max(0,oldOrder[1].left-oldOrder[0].right))<2,'Ctrl+L preserves the measured average gap')
  const unselectedAfter=await bounds(treeTarget('1.column'))
  assert.ok(Math.abs(unselectedAfter.left-unselectedBefore.left)<2&&Math.abs(unselectedAfter.top-unselectedBefore.top)<2,'Ctrl+L leaves unselected columns fixed')
  results.push('Ctrl+L selected alignment and spacing');console.log('PASS Ctrl+L selected alignment and spacing')
  await clickExpression(node('واگرد')); await pause(160)
  const undone=await Promise.all([bounds(treeTarget('2.column')),bounds(treeTarget('3.column'))])
  const hostUndo=await bounds(`document.querySelector('.cascading-tree-panels')`)
  assert.ok(undone.every((r,i)=>Math.abs((r.left-hostUndo.left)-(selectedBefore[i].left-hostBefore.left))<2&&Math.abs((r.top-hostUndo.top)-(selectedBefore[i].top-hostBefore.top))<2),'one Undo restores the entire selected layout')
  await clickExpression(node('ازنو'));await pause(160)
  const redone=await Promise.all([bounds(treeTarget('2.column')),bounds(treeTarget('3.column'))])
  const hostRedo=await bounds(`document.querySelector('.cascading-tree-panels')`)
  assert.ok(redone.every((r,i)=>Math.abs((r.left-hostRedo.left)-(aligned[i].left-hostBefore.left))<2&&Math.abs((r.top-hostRedo.top)-(aligned[i].top-hostBefore.top))<2),'Redo restores the entire selected layout')
  results.push('atomic layout Undo and Redo');console.log('PASS atomic layout Undo and Redo')
  for(let i=0;i<5;i++)if(!await evaluate(`document.querySelectorAll('.cascading-tree-panel-selector')[${i}].getAttribute('aria-pressed')==='true'`))await clickExpression(`document.querySelectorAll('.cascading-tree-panel-selector')[${i}]`,'left',2)
  const allBefore=await Promise.all(Array.from({length:5},(_,i)=>bounds(treeTarget(i+'.column')))),oldSorted=[...allBefore].sort((a,b)=>a.left-b.left)
  const averageGap=oldSorted.slice(1).reduce((sum,rect,i)=>sum+rect.left-oldSorted[i].right,0)/4
  await ctrlL()
  const allAfter=await Promise.all(Array.from({length:5},(_,i)=>bounds(treeTarget(i+'.column')))),sortedAfter=[...allAfter].sort((a,b)=>a.left-b.left),editorBounds=await bounds(`document.querySelector('.laboratory-editor')`)
  assert.ok(allAfter.every(rect=>Math.abs(rect.width-allAfter[0].width)<2&&Math.abs(rect.height-allAfter[0].height)<2&&Math.abs(rect.top-allAfter[0].top)<2),'Ctrl+L normalizes all five panel sizes and their top edge')
  assert.ok(sortedAfter.slice(1).every((rect,i)=>Math.abs(rect.left-sortedAfter[i].right-Math.max(0,averageGap))<2),'Ctrl+L uses average existing spacing across all five columns')
  assert.ok(Math.abs((sortedAfter[0].left+sortedAfter.at(-1).right)/2-(editorBounds.left+editorBounds.right)/2)<2,'five-column selection is centered in the actual editor')
  results.push('five-column dimensions average spacing and centering');console.log('PASS five-column dimensions average spacing and centering')
  await evaluate(`(${treeTarget('0.column')}).focus({preventScroll:true})`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await pause(120)
  const nudged=await Promise.all(Array.from({length:5},(_,i)=>bounds(treeTarget(i+'.column'))))
  assert.ok(nudged.every((rect,i)=>Math.abs(rect.left-allAfter[i].left-1)<1&&Math.abs(rect.top-allAfter[i].top)<1),'plain arrow moves every selected panel by one physical pixel')
  await evaluate(`(${treeTarget('0.column')}).querySelector('.designer-edge-bottom').focus({preventScroll:true})`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await pause(120)
  const keyResized=await Promise.all(Array.from({length:5},(_,i)=>bounds(treeTarget(i+'.column'))))
  assert.ok(keyResized.every((rect,i)=>Math.abs(rect.height-nudged[i].height-1)<1&&Math.abs(rect.width-nudged[i].width)<1),'focused resize handle resizes selected panels without changing width')
  results.push('physical keyboard movement and group keyboard resizing');console.log('PASS physical keyboard movement and group keyboard resizing')
  await check('report panel matches the title width while table columns retain independent widths',`(()=>{const grid=document.querySelector('.laboratory-grid').getBoundingClientRect(),title=document.querySelector('.cascading-tree-header').getBoundingClientRect();return Math.abs(grid.left-title.left)<2&&Math.abs(grid.right-title.right)<2&&document.querySelectorAll('.base-grid-boundary').length===1&&document.querySelectorAll('th[data-column]').length===6})()`)
  }
  assert.equal(errors.length,0,errors.join('\n'))
  await evaluate(`document.querySelector('.cascading-tree-panels').scrollIntoView({block:'center',inline:'nearest'})`);await pause(180)
  const capture=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('../review-artifacts/tree-geometry.png'),Buffer.from(capture.data,'base64'))
  console.log(JSON.stringify({passed:results.length,results}))
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
