import {revealMenuExpression} from './form-context-navigation.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'

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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 15000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId:session } : {}) }))
  })
  const loadedNavigation=async(method,params={})=>{
    let timer
    const loaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('New document did not finish loading: '+method)),20000);navigationLoaded=resolve})
    try{await send(method,params);await loaded}finally{clearTimeout(timer);navigationLoaded=undefined}
  }
  const navigatePage=params=>loadedNavigation('Page.navigate',params)
  const target = await send('Target.createTarget', { url:'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId:target.targetId, flatten:true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true }).catch(error=>{throw new Error(error.message+' '+expression.slice(0,160))})
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result.value
  }
  const until = async (expression, label = expression) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100) }
    console.error('DOM_DIAGNOSTIC', await evaluate("JSON.stringify({fields:[...document.querySelectorAll('[data-field-id]')].map(e=>[e.dataset.fieldId,e.closest('.laboratory-form-frame')!==null]),bodyStart:document.body.textContent.slice(0,600),body:document.body.textContent.slice(-2500)})"), errors)
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
  const pass = name => { results.push(name); console.log('PASS ' + name) }
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); pass(name) }

  const bounds=expression=>evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`)
  const transparentHandles=async expression=>{
    const handles=`[...(${expression}).querySelectorAll(':scope > .designer-edge-handle')]`;
    await check('resize hit regions stay transparent with only small green marks',`(${handles}).length===8&&(${handles}).every(n=>{const s=getComputedStyle(n),mark=getComputedStyle(n,'::after');return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.backgroundImage==='none'&&s.boxShadow==='none'&&parseFloat(s.borderTopWidth)===0&&parseFloat(mark.width)<=22&&parseFloat(mark.height)<=22})`);
    const edge=`(${expression}).querySelector('.designer-edge-top')`;
    const r=await bounds(edge);await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.left+r.width*.3,y:r.top+r.height/2});
    await evaluate(`(${edge}).focus()`);
    assert.equal(await evaluate(`getComputedStyle(${edge}).backgroundColor`),'rgba(0, 0, 0, 0)','hover/focus must not paint a white edge');
    await pause(700);
  }
  const pointer=async(type,p)=>send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...(type==='mouseMoved'?{buttons:1,button:'left'}:{button:'left',clickCount:1})})
  const key=async(value,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:value,code:value,modifiers,windowsVirtualKeyCode:value==='Escape'?27:value==='z'?90:0});await pause(150)}
  const tree=id=>`document.querySelector('[data-field-id="product-group.cascading-tree.tree.${id}"] > div > .designer-input-part')`
  const selectTree=(id,modifiers=0)=>clickExpression(id.endsWith('.column')?`document.querySelectorAll('.cascading-tree-panel-selector')[${parseInt(id)}]`:`document.querySelector('[data-field-id="product-group.cascading-tree.tree.${id}"] > .laboratory-field-select')`,'left',modifiers)
  await navigatePage({url:base+'/tests/form-designer.html?treeGeometry&treeReport&interactionAudit'});
  await until("document.querySelectorAll('.cascading-tree-column').length===5");
  await clickExpression("document.querySelector('.cascading-tree-header .form-settings-button')");
  await check('the real form-header settings button opens shared administrator settings',"!!document.querySelector('[data-hierarchy-settings] select')&&document.querySelector('[data-hierarchy-settings]').getClientRects().length>0");
  const treeNodes=()=>evaluate("(async()=>{const {readFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');return JSON.stringify(readFormRecovery(localStorage,'isolated-browser-regression').documents['form.tree-geometry'].current.form.schema.fields[0].settings.cascadingTree.nodes)})()");
  await pause(700);const savedNodes=await treeNodes();
  for(const [depth,columns] of [[2,3],[3,4],[4,5]]){
    await evaluate(`(()=>{const s=document.querySelector('[data-hierarchy-settings] select');s.value='${depth}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await until(`document.querySelectorAll('.cascading-tree-column').length===${columns}`);await pause(600);
    assert.equal(await treeNodes(),savedNodes,'disabling levels retains every node and stable code');
  }
  console.log('PASS admin depth 2/3/4 hides inactive panels without deleting nodes');
  // Return to the same Designer; no alternate tree geometry handler is used.
  await clickExpression("document.querySelector('#managed-designer-tab')");
  await selectTree('2.column');
  const selected=tree('2.column'),before=await bounds(selected),peer=await bounds(tree('1.column'));
  await transparentHandles(selected);
  for(const [edge,x,y,cursor] of [['top',before.left+before.width*.2,before.top,'ns-resize'],['top',before.left+before.width*.65,before.top,'ns-resize'],['bottom',before.left+before.width*.8,before.bottom,'ns-resize'],['left',before.left,before.top+before.height*.2,'ew-resize'],['left',before.left,before.top+before.height*.8,'ew-resize'],['right',before.right,before.top+before.height*.7,'ew-resize'],['top-left',before.left,before.top,'nwse-resize']]){
    const hit=await evaluate(`(()=>{const n=document.elementFromPoint(${x},${y});return {label:n?.getAttribute('aria-label'),cursor:n?getComputedStyle(n).cursor:''}})()`);
    assert.ok(hit.label?.endsWith(edge)&&hit.cursor===cursor,'continuous edge/corner hit '+edge+' '+JSON.stringify(hit));
  }
  console.log('PASS full-length edges and corners expose the standard directional cursors');
  const start={x:before.left+before.width*.2,y:before.bottom};
  await pointer('mousePressed',start);await pause(120);
  const renders=await evaluate('window.designerRenderAudit.commits');
  for(let i=1;i<=8;i++){await pointer('mouseMoved',{x:start.x,y:start.y+i*7.5});await pause(25)}
  const live=await bounds(selected);
  assert.ok(Math.abs(live.height-before.height-60)<1&&Math.abs(live.top-before.top)<1,'live bottom resize follows the mouse with a fixed opposite edge');
  assert.equal(await evaluate('window.designerRenderAudit.commits'),renders,'pointer preview performs no React/history render');
  assert.deepEqual(await bounds(tree('1.column')),peer,'preview leaves every unselected peer fixed');
  await pointer('mouseReleased',{x:start.x,y:start.y+63});await pause(220);
  assert.ok(Math.abs((await bounds(selected)).height-before.height-63)<1,'release flushes its final coordinate');
  await key('z',2);assert.ok(Math.abs((await bounds(selected)).height-before.height)<1,'one Undo restores the complete gesture');
  console.log('PASS smooth visual-only resize commits once on release and undoes atomically');
  await selectTree('path');const pathBefore=await bounds(tree('path'));
  await transparentHandles(tree('path'));
  await writeFile(resolve('../review-artifacts/shared-transparent-edges.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  const p={x:pathBefore.left+pathBefore.width*.4,y:pathBefore.top+pathBefore.height*.5};
  await pointer('mousePressed',p);await pointer('mouseMoved',{x:p.x+12,y:p.y+8});await pause(100);
  await key('Escape');await pointer('mouseReleased',{x:p.x+12,y:p.y+8});await pause(120);
  assert.deepEqual(await bounds(tree('path')),pathBefore,'Escape restores the temporary view without a geometry commit');
  console.log('PASS Escape cancels the live visual gesture');
  const pathSelector="document.querySelector('[data-field-id=\"product-group.cascading-tree.tree.path\"] > .laboratory-field-select')";
  const markerBefore=await bounds(pathSelector),inputBefore=await bounds(tree('path'));
  // Edge hover intentionally owns arrow-key resizing. Leave the edge before testing Move.
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5,buttons:0});
  await evaluate(`(${tree('path')}).focus({preventScroll:true})`);await key('ArrowRight');
  const markerAfter=await bounds(pathSelector),inputAfter=await bounds(tree('path'));
  assert.ok(Math.abs(markerBefore.left-inputBefore.left)<1&&Math.abs(markerBefore.bottom-inputBefore.top+4)<1,'selector is above the physical top-left border');
  assert.ok(Math.abs(markerAfter.left-markerBefore.left-1)<1&&Math.abs(inputAfter.left-inputBefore.left-1)<1,'the selector follows the input keyboard movement');
  await check('selection markers retain standard compact chrome inside composite controls',`(()=>{const n=${pathSelector},s=getComputedStyle(n);return n.getAttribute('aria-pressed')==='true'&&n.textContent==='✓'&&parseFloat(s.paddingLeft)===0&&parseFloat(s.paddingRight)===0&&parseFloat(s.width)===19&&parseFloat(s.height)===18})()`);
  await key('z',2);
  for(const part of ['back','all','path','status','limit']){
    await selectTree(part);
    await evaluate("(()=>{let n=document.querySelector('#designer-effect-borderRadius');while(n){if(n instanceof HTMLDetailsElement)n.open=true;n=n.parentElement}})()");
    await clickExpression("document.querySelector('#designer-effect-borderRadius')");
    await until("document.activeElement?.id==='designer-effect-borderRadius'");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65,commands:['selectAll']});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});
    await send('Input.insertText',{text:'24'});await key('Enter');
    await check('corner radius applies to the actual top control and its surface: '+part,`(()=>{const n=${tree(part)};return getComputedStyle(n).borderTopLeftRadius==='24px'&&getComputedStyle(n.firstElementChild).borderTopLeftRadius==='24px'})()`);
  }
  await check('the header settings button uses rounded shared chrome',"parseFloat(getComputedStyle(document.querySelector('.cascading-tree-header .form-settings-button')).borderTopLeftRadius)>0");
  await click('پاک‌کردن انتخاب');
  const topParts=['back','all','path','status','limit'];
  for(const [index,part] of topParts.entries())await selectTree(part,index?2:0);
  await check('all five top controls participate in the same group-layout selection',`['back','all','path','status','limit'].every(part=>document.querySelector('[data-field-id="product-group.cascading-tree.tree.'+part+'"] > .laboratory-field-select').getAttribute('aria-pressed')==='true')`);
  const topBefore=await Promise.all(topParts.map(part=>bounds(tree(part))));
  await clickExpression(tree('all'),'right');
  await click('اندازه و چیدمان','[role=menuitem]');
  await check('registered top controls expose position alignment and spacing in the real context menu',"!!("+node('تراز جای فیلدها','[role=menuitem]')+")&&!!("+node('فاصله‌گذاری','[role=menuitem]')+")");
  await click('فاصله‌گذاری','[role=menuitem]');
  for(const label of ['چیدمان','تراز','عرض برابر','ارتفاع برابر','اندازه برابر','فاصله برابر'])await check('shared layout command is enabled for top controls: '+label,`(()=>{const b=${node(label,'.designer-layout-tools button')};return !!b&&!b.disabled})()`);
  await click('ارتفاع برابر','.designer-layout-tools button');
  const equalTop=await Promise.all(topParts.map(part=>bounds(tree(part))));
  assert.ok(equalTop.every(rect=>Math.abs(rect.height-equalTop[0].height)<1),'the actual top controls take the reference height');
  await key('z',2);
  for(const [index,part] of topParts.entries())assert.ok(Math.abs((await bounds(tree(part))).height-topBefore[index].height)<1,'one Undo restores each original top-control height');
  await evaluate(`(${node('تراز بالا','.designer-layout-tools button')}).scrollIntoView({block:'center'})`);
  await click('تراز بالا','.designer-layout-tools button');
  const alignedTop=await Promise.all(topParts.map(part=>bounds(tree(part))));
  assert.ok(alignedTop.every(rect=>Math.abs(rect.top-alignedTop[0].top)<1),'all five actual top controls align to the reference top '+JSON.stringify(alignedTop));
  await key('z',2);
  await click('فاصله برابر','.designer-layout-tools button');
  const spaced=(await Promise.all(topParts.map(part=>bounds(tree(part))))).sort((a,b)=>a.left-b.left);
  const gaps=spaced.slice(1).map((rect,index)=>rect.left-spaced[index].right);
  assert.ok(gaps.every(gap=>Math.abs(gap-gaps[0])<1)&&gaps[0]>0,'actual top controls retain a positive equal gap');
  await key('z',2);
  pass('top-control alignment, equal height and positive equal spacing execute and undo through shared geometry');
  const header="document.querySelector('[data-toolbar-part=header]')";
  await evaluate(`(${header}).scrollIntoView({block:'nearest'})`);
  const headerPoint=await evaluate(`(()=>{const n=${header},r=n.getBoundingClientRect();for(const [fx,fy] of [[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75]]){const x=r.left+r.width*fx,y=r.top+r.height*fy;if(document.elementFromPoint(x,y)?.closest('[data-toolbar-part]')===n)return {x,y}}throw Error('Header background not visible')})()`);
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...headerPoint,button:'right',clickCount:1});
  await clickExpression("[...document.querySelectorAll('[role=menuitem]')].find(n=>n.getClientRects().length&&n.textContent.trim()==='انتخاب کل پنل هدر')");
  const initialHeader=await bounds(header);
  for(const [edge,delta] of [['right',-12],['left',12]]){
    const handle=await bounds(`(${header}).querySelector('.designer-edge-${edge}')`),p={x:handle.left+handle.width/2,y:handle.top+handle.height/2};
    await pointer('mousePressed',p);await pointer('mouseMoved',{x:p.x+delta,y:p.y});await pointer('mouseReleased',{x:p.x+delta,y:p.y});await pause(180);
    const after=await bounds(header);
    assert.ok(Math.abs(after.width-initialHeader.width+12)<1&&Math.abs(after[edge==='left'?'right':'left']-initialHeader[edge==='left'?'right':'left'])<1,'header '+edge+' resize preserves opposite edge inside its scroll host');
    await key('z',2);
  }
  console.log('PASS both outer header edges remain reachable and preserve their opposite edge');
  await writeFile(resolve('../review-artifacts/shared-transparent-edges.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await navigatePage({url:base+'/tests/form-designer.html?interactionAudit'});
  await until("!!document.querySelector('.laboratory-form-manager')");
  await click('مدیریت فرم‌ها و انتخاب فرم فعال','.laboratory-form-manager');await click('کار روی قالب اصلی آزمایشگاه');
  await until("document.querySelector('[data-form-design-mode]')?.dataset.formDesignMode==='laboratory'");
  if(!await evaluate("!!document.querySelector('[data-designer-active]')"))await click('طراحی ظاهری فرم');
  const native="document.querySelector('[data-field-id=firstName] .designer-input-part')";
  await clickExpression("document.querySelector('[data-field-id=firstName] > .laboratory-field-select')");
  await transparentHandles(native);
  const n=await bounds(native),a={x:n.left+n.width*.25,y:n.bottom};
  await pointer('mousePressed',a);await pause(100);const nativeRenders=await evaluate('window.designerRenderAudit.commits');
  await pointer('mouseMoved',{x:a.x,y:a.y+12});await pause(100);
  assert.equal(await evaluate('window.designerRenderAudit.commits'),nativeRenders,'ordinary fields use the same visual-only path');
  assert.ok(Math.abs((await bounds(native)).height-n.height-12)<1,'ordinary native field paints the same live resize');
  await pointer('mouseReleased',{x:a.x,y:a.y+12});await pause(180);await key('z',2);
  assert.ok(Math.abs((await bounds(native)).height-n.height)<1,'ordinary field Undo has the same result');
  console.log('PASS native fields and tree panels share full edges and deferred commits');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length}));
} catch(error){console.error(error);if(socket?.readyState===1&&session){const id=++sequence;const capture=new Promise(resolve=>pending.set(id,{resolve,reject:resolve}));socket.send(JSON.stringify({id,method:'Page.captureScreenshot',params:{format:'png'},sessionId:session}));const result=await capture;if(result?.data)await writeFile(resolve('../review-artifacts/shared-interaction-failure.png'),Buffer.from(result.data,'base64'))}process.exitCode=1} finally {socket?.close();browser.kill();await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve));assert.equal(dirname(resolve(profile)),resolve(tmpdir()));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}

