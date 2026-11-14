import {revealMenuExpression} from './form-context-navigation.mjs'
import assert from 'node:assert/strict'
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
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1900,1300', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] })
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
    if(data.method==='Runtime.consoleAPICalled'&&data.params.type==='error')console.error('PAGE_ERROR',data.params.args.map(arg=>arg.value??arg.description))
    if(data.method==='Log.entryAdded'&&data.params.entry.level==='error')console.error('PAGE_LOG',data.params.entry.text)
    const call = pending.get(data.id)
    if (call) { pending.delete(data.id); data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result) }
  })
  const send = (method, params = {}, browserLevel = false) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 20000)
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
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable')
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
  const clickPoint = async point => { await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await pause(100) }
  const clickToolbarSurface = async selector => { const point=await evaluate(`(()=>{const panel=document.querySelector(${JSON.stringify(selector)});if(!panel)throw Error('Toolbar panel is missing');const r=panel.getBoundingClientRect();for(let y=Math.ceil(r.top+2);y<r.bottom-2;y+=3)for(let x=Math.ceil(r.left+2);x<r.right-2;x+=3){const hit=document.elementFromPoint(x,y);if(hit?.closest('[data-toolbar-part]')===panel)return{x,y}}throw Error('No selectable empty toolbar surface')})()`);await clickPoint(point) }
  const click = (text, selector) => clickExpression(node(text, selector))
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); results.push(name); console.log('PASS ' + name) }
  const field = id => `document.querySelector('.laboratory-form-frame [data-field-id="${id}"]')`
  const count = () => evaluate(`document.querySelectorAll('.laboratory-form-frame [data-field-id]').length`)
  const mode = expected => until(`document.querySelector('[data-form-design-mode]')?.dataset.formDesignMode===${JSON.stringify(expected)}`)
  const menu = text => node(text, '[role="menu"] button')
  const layout = `(()=>{const grid=document.querySelector('.laboratory-form-grid');const ids=['personCode','titleId','firstName','lastName','jobId'];return {display:getComputedStyle(grid).display,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,fields:ids.map(id=>{const e=document.querySelector('.laboratory-form-frame [data-field-id="'+id+'"]');const r=e.getBoundingClientRect();return {id,x:r.x-grid.getBoundingClientRect().x,y:r.y-grid.getBoundingClientRect().y,w:r.width,h:r.height}})}})()`
  const selectValue=async(expression,value)=>{
    await until(`!!(${expression})`)
    await evaluate(`(()=>{const e=${expression};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(120)
  }
  const inputValue=async(expression,value)=>{
    await clickExpression(expression)
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,commands:['selectAll']})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2})
    await send('Input.insertText',{text:String(value)});await pause(120)
  }
  const sendKey=async(key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});await pause(140)}

  const action=id=>clickExpression('document.querySelector('+JSON.stringify('[data-action-id="operational.'+id+'"] button')+')');
  await navigatePage({url:base+'/tests/brands-operational.html?reference'});
  await until("document.querySelectorAll('.laboratory-form-grid .designer-input-part input,.laboratory-form-grid .designer-input-part textarea').length===3");
  const rectangles="(()=>{const root=document.querySelector('.laboratory-form-grid'),origin=root.getBoundingClientRect();return [...root.querySelectorAll('.designer-input-part')].map(e=>{const r=e.getBoundingClientRect();return [r.x-origin.x,r.y-origin.y,r.width,r.height]})})()";
  const reference=await evaluate(rectangles);
  await navigatePage({url:base+'/tests/brands-operational.html'});
  await until("document.querySelectorAll('.laboratory-form-grid input,.laboratory-form-grid textarea').length===3&&document.querySelector('input[data-field=brandCode]').value==='aB-200'");
  const actual=await evaluate(rectangles);
  assert.equal(actual.length,3);for(let i=0;i<3;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(actual[i][j]-reference[i][j])<1.1,'pinned Canvas rectangle '+i+': '+JSON.stringify({actual,reference}));
  results.push('three operational fields retain the exact pinned Designer Canvas rectangles');
  await check('exactly three saved columns and no address control',"document.querySelectorAll('.base-grid-table thead th').length===3&&!document.querySelector('[data-field=address]')");
  await check('new action is named Brand, not Person',"document.querySelector('[data-action-id=\"operational.new\"]').textContent.includes('برند جدید')");
  const frameGeometry="(()=>{const f=document.querySelector('.operational-form-frame').getBoundingClientRect(),footer=document.querySelector('.base-form-footer').getBoundingClientRect();return [f.height,footer.top-f.top]})()";
  const fixedGeometry=await evaluate(frameGeometry);
  const assertFixed=async label=>{const current=await evaluate(frameGeometry);current.forEach((value,index)=>assert.ok(Math.abs(value-fixedGeometry[index])<0.1,label+JSON.stringify({current,fixedGeometry})));};
  await check('table viewport has equal visible inset on both sides',"(()=>{const f=document.querySelector('.operational-form-frame').getBoundingClientRect(),g=document.querySelector('.base-grid-table-wrap').getBoundingClientRect(),left=g.left-f.left,right=f.right-g.right;return left>=10&&right>=10&&Math.abs(left-right)<1.1})()");
  await check('the visible selected row matches the editor record',"document.querySelector('tr[aria-selected=true]')?.textContent.includes('aB-200')");
  await clickExpression('document.querySelector(\'[data-toolbar-part="searchOption:exact"] input\')');
  await inputValue("document.querySelector('.grid-search-control input')",'ZZ-900');await sendKey('Enter');
  await until("document.querySelectorAll('.base-grid-table tbody tr').length===1&&document.querySelector('.base-grid-table tbody').textContent.includes('ZZ-900')");
  await check('shared search filters operational API rows',"document.querySelector('.base-grid-table tbody').textContent.includes('ZZ-900')");
  await assertFixed('search must not resize the frame or move its footer');
  await inputValue("document.querySelector('.grid-search-control input')",'missing-brand');
  await until("document.querySelector('.base-grid-table tbody').textContent.includes('رکوردی یافت نشد')");
  await assertFixed('empty results retain frame and footer geometry');
  await inputValue("document.querySelector('.grid-search-control input')",'');await sendKey('Enter');
  await until("document.querySelectorAll('.base-grid-table tbody tr').length===2");
  await action('edit');
  await inputValue("document.querySelector('[data-field=brandName]')",'برند اصلاح‌شده');
  await sendKey('F3');
  await until("window.brandRequests.some(r=>r.method==='PUT')");
  await check('edit preserves hidden address and sends rowVersion',"(()=>{const r=window.brandRequests.find(r=>r.method==='PUT');return r.body.address==='آدرس محفوظ'&&r.body.description==='یادداشت'&&new URLSearchParams(r.query).get('rowVersion')==='AAAAAAAAAAA='})()");
  await action('new');
  await until("document.querySelector('[data-field=brandCode]').value==='aB-201'");
  await check('suggested code follows the API last-created suggestion',"document.querySelector('[data-field=brandCode]').value==='aB-201'");
  await clickExpression("document.querySelector('[data-field=brandCode]')");
  const editorBackground=await evaluate("(()=>{const r=document.querySelector('.laboratory-editor').getBoundingClientRect();return {x:r.left+12,y:r.bottom-12}})()");await clickPoint(editorBackground);
  await check('entry focus marker remains after the active input loses browser focus',"document.querySelector('[data-field=brandCode]')?.closest('.designer-input-part')?.dataset.entryFocusIndicator==='true'");
  await clickExpression("document.querySelector('[data-field=brandName]')");await clickPoint(editorBackground);
  await check('entry focus marker moves to another field and then remains visible',"document.querySelector('[data-field=brandName]')?.closest('.designer-input-part')?.dataset.entryFocusIndicator==='true'&&!document.querySelector('[data-field=brandCode]')?.closest('.designer-input-part')?.dataset.entryFocusIndicator");
  await inputValue("document.querySelector('[data-field=brandCode]')",'MiXeD-۱۲۳');
  await inputValue("document.querySelector('[data-field=brandName]')",'برند جدید آزمایشی');
  await action('save');
  await until("window.brandRequests.some(r=>r.method==='POST')");
  await check('save clears the entry focus indicator',"!document.querySelector('[data-entry-focus-indicator=true]')");
  await check('shared code preserves mixed case, normalizes digits and fires brands-changed',"window.brandRequests.find(r=>r.method==='POST').body.brandCode==='MiXeD-123'&&window.brandEvents===2");
  await check('saved record is selected in both table and editor',"document.querySelector('tr[aria-selected=true]')?.textContent.includes('MiXeD-123')&&document.querySelector('[data-field=brandCode]').value==='MiXeD-123'");
  await assertFixed('adding a record must not change the form height');
  await evaluate('window.rejectBrandDelete=true');expectedDialog=true;await action('delete');
  await until("document.querySelector('[role=alert]')?.textContent.includes('استفاده')");
  results.push('referenced-brand API error is visible and record is retained');
  await evaluate('window.rejectBrandDelete=false');expectedDialog=true;await action('delete');
  await until('window.brandEvents===3');results.push('confirmed delete sends version and publishes brands-changed');
  await action('edit');await inputValue("document.querySelector('[data-field=brandName]')",'تعارض');
  await evaluate('window.conflictBrand=true');await action('save');
  await until("document.querySelector('[role=alert]')?.textContent.includes('کاربر دیگری')");results.push('stale update displays API error and reloads current data');
  await navigatePage({url:base+'/tests/brands-operational.html?creation'});
  await until("document.querySelector('[data-field=brandCode]').value==='aB-201'");
  await inputValue("document.querySelector('[data-field=brandName]')",'از فرم اشخاص');await action('save');
  await until("window.createdBrand?.brandName==='از فرم اشخاص'");results.push('Persons creation callback receives the API-created brand');
  await navigatePage({url:base+'/tests/brands-operational.html?denied'});
  await until("!!document.querySelector('[data-action-id=\"operational.new\"] button')");
  await check('write permissions disable create edit and delete',"['new','edit','delete'].every(id=>document.querySelector('[data-action-id=\"operational.'+id+'\"] button').disabled)");
  await navigatePage({url:base+'/tests/brands-operational.html?many'});
  await until("document.querySelectorAll('.base-grid-table tbody tr').length>50");
  await assertFixed('many records retain the same frame and footer geometry');
  await check('many records scroll inside the fixed table viewport',"(()=>{const e=document.querySelector('.base-grid-table-wrap');return e.scrollHeight>e.clientHeight+20&&getComputedStyle(e).overflowY==='auto'})()");

  await check('operational caption has no redesign suffix',"document.querySelector('.laboratory-banner-title strong').textContent==='تعریف برند'");
  await check('Persian table opens at logical right with brand code visible',"(()=>{const v=document.querySelector('.base-grid-table-wrap'),c=document.querySelector('th[data-column=brandCode]');return v.dir==='rtl'&&v.scrollLeft===0&&Math.abs(c.getBoundingClientRect().right-v.getBoundingClientRect().right)<2})()");
  await check('active search mode is emphasized in addition to its radio',"(()=>{const a=[...document.querySelectorAll('.grid-search-options label')];return a.filter(e=>getComputedStyle(e).fontWeight==='700').length===1&&a.find(e=>e.querySelector('input').checked)?.classList.contains('is-active-search-mode')})()");
  const sizes="[...document.querySelectorAll('.base-grid-table thead th')].map(e=>e.getBoundingClientRect().width)";
  const widths=await evaluate(sizes);
  const handle=await evaluate("(()=>{const r=document.querySelector('th[data-column=brandName] .base-grid-resizer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...handle,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x+35,y:handle.y,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:handle.x+35,y:handle.y,button:'left',clickCount:1});await pause(200);
  const resized=await evaluate(sizes);assert.ok(Math.abs(resized[1]-widths[1]+35)<1.1);assert.ok(Math.abs(resized[0]-widths[0])<1.1&&Math.abs(resized[2]-widths[2])<1.1);results.push('RTL mouse column resize changes only the selected column');
  const growRtl=await evaluate("(()=>{const r=document.querySelector('th[data-column=brandName] .base-grid-resizer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await send('Input.dispatchMouseEvent',{type:'mousePressed',...growRtl,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:growRtl.x-20,y:growRtl.y,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:growRtl.x-20,y:growRtl.y,button:'left',clickCount:1});await pause(200);const grownRtl=await evaluate(sizes);assert.ok(Math.abs(grownRtl[1]-resized[1]-20)<1.1&&Math.abs(grownRtl[0]-resized[0])<1.1&&Math.abs(grownRtl[2]-resized[2])<1.1);results.push('RTL dragging the same edge left expands only the selected column');
  const smaller=await evaluate("(()=>{const r=document.querySelector('th[data-column=brandCode] .base-grid-resizer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...smaller,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:smaller.x+80,y:smaller.y,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:smaller.x+80,y:smaller.y,button:'left',clickCount:1});await pause(200);
  const compact=await evaluate(sizes);assert.ok(Math.abs(compact[2]-grownRtl[2])<1.1&&Math.abs(compact[1]-grownRtl[1])<1.1);await check('compact columns keep spare space without stretching neighbours or horizontal overflow',"(()=>{const e=document.querySelector('.base-grid-table-wrap');return e.scrollWidth<=e.clientWidth+1})()");
  await click('تنظیمات فرم');
  await check('settings gear is replaced by save and exit actions in the top bar',"!document.querySelector('[aria-label=\"تنظیمات فرم\"]')&&!![...document.querySelectorAll('.operational-settings-header-actions button')].find(e=>e.textContent.includes('ذخیره تنظیمات'))&&!![...document.querySelectorAll('.operational-settings-header-actions button')].find(e=>e.textContent.includes('خروج بدون ذخیره'))");
   await check('personal editing uses mouse handles without the old numeric settings form',"document.querySelectorAll('.operational-form-frame>[aria-label^=\"Resize form\"]').length===8&&!document.querySelector('[aria-label=\"ارتفاع ثابت شخصی فرم\"]')");
  const dragHandle=async(label,dx,dy)=>{const p=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify('[aria-label="'+label+'"]').toString()+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await pause(300)};
  await clickToolbarSurface('.grid-toolbar-panels>.grid-toolbar[data-toolbar-part="header"]');
  await check('selecting the table toolbar reveals and focuses its visible height grip',"(()=>{const h=document.querySelector('.operational-region-resize-handle[data-resize-kind=toolbarHeight]');if(!h)return false;const r=h.getBoundingClientRect();return r.width>=60&&r.height>=14&&document.activeElement===h&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===h})()");
  const toolbarHeight=()=>evaluate("document.querySelector('.grid-toolbar-panels>.grid-toolbar[data-toolbar-part=header]').getBoundingClientRect().height");
  const toolbarBeforeKeys=await toolbarHeight();await sendKey('ArrowDown');const toolbarAfterKeys=await toolbarHeight();assert.ok(toolbarAfterKeys>=toolbarBeforeKeys+1.9,'ArrowDown must increase the selected toolbar height');results.push('ArrowDown changes the selected table toolbar height');
  const toolbarAfterUp=await (async()=>{await sendKey('ArrowUp');return toolbarHeight()})();assert.ok(toolbarAfterUp<=toolbarAfterKeys-1.9,'ArrowUp must decrease the selected toolbar height');results.push('ArrowUp changes the selected table toolbar height');
  const dragElement=async(expression,dx,dy)=>{const p=await evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await pause(300)};
  const toolbarBeforeDrag=await toolbarHeight();await dragElement("document.querySelector('.operational-region-resize-handle[data-resize-kind=toolbarHeight]')",0,14);const toolbarAfterDrag=await toolbarHeight();assert.ok(toolbarAfterDrag>=toolbarBeforeDrag+12,'dragging the selected toolbar grip must increase its height');results.push('mouse drag changes the selected table toolbar height');
  await clickExpression("document.querySelector('.laboratory-banner-title')");
  await check('selecting the form header reveals and focuses its visible height grip',"(()=>{const h=document.querySelector('.operational-region-resize-handle[data-resize-kind=formHeaderHeight].is-bottom');if(!h)return false;const r=h.getBoundingClientRect();return r.width>=60&&r.height>=14&&document.activeElement===h&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===h})()");
  const formHeaderHeight=()=>evaluate("document.querySelector('.form-laboratory-banner').getBoundingClientRect().height");
  const formHeaderBeforeKeys=await formHeaderHeight();await sendKey('ArrowDown');const formHeaderAfterKeys=await formHeaderHeight();assert.ok(formHeaderAfterKeys>=formHeaderBeforeKeys+1.9,'ArrowDown must increase the selected form header height');results.push('ArrowDown changes the selected form header height');
  const formHeaderAfterUp=await (async()=>{await sendKey('ArrowUp');return formHeaderHeight()})();assert.ok(formHeaderAfterUp<=formHeaderAfterKeys-1.9,'ArrowUp must decrease the selected form header height');results.push('ArrowUp changes the selected form header height');
  const formHeaderBeforeDrag=await formHeaderHeight();await dragElement("document.querySelector('.operational-region-resize-handle[data-resize-kind=formHeaderHeight].is-bottom')",0,14);const formHeaderAfterDrag=await formHeaderHeight();assert.ok(formHeaderAfterDrag>=formHeaderBeforeDrag+12,'dragging the selected form header grip must increase its height');results.push('mouse drag changes the selected form header height');
  await click('ذخیره تنظیمات');await reloadPage();
  await check('table toolbar and form header heights persist after reload',`Math.abs(document.querySelector('.grid-toolbar-panels>.grid-toolbar[data-toolbar-part=header]').getBoundingClientRect().height-${toolbarAfterDrag})<2&&Math.abs(document.querySelector('.form-laboratory-banner').getBoundingClientRect().height-${formHeaderAfterDrag})<2`);
  await click('تنظیمات فرم');
  await dragHandle('Resize form bottom',0,40);
  await dragHandle('Resize form right',-70,0);
  await clickExpression("document.querySelector('[data-field=\"brandName\"]')");
  await check('mouse selects a permitted field for personal formatting',"!!document.querySelector('.personal-selected')");
  await evaluate("(()=>{const e=document.querySelector('[data-field=\"brandName\"]'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))})()");
  await check('right click opens the Laboratory-style personal formatting menu',"!!document.querySelector('.designer-context-menu [role=menuitem]')&&!![...document.querySelectorAll('.designer-context-menu button')].find(e=>e.textContent.includes('قلم'))");
  await click('متن و قلم');await click('تنظیم قلم…');await until("!!document.querySelector('.designer-grid-font-fields')");
  await selectValue("document.querySelector('.designer-grid-font-fields select[aria-label=\"اندازه\"]')",'24');await click('تأیید');
  await evaluate("(()=>{const e=document.querySelector('[data-field=\"brandName\"]'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))})()");
  await click('ظاهر و حاشیه');await click('رنگ پس‌زمینه…');await until("!!document.querySelector('.excel-color-popover')");
  await clickExpression("document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]')");
  await click('ذخیره تنظیمات');await reloadPage();
  await until("Math.abs(document.querySelector('.operational-form-frame')?.getBoundingClientRect().height-800)<1");
  await check('shared Laboratory font and palette changes persist personally',"getComputedStyle(document.querySelector('[data-field=brandName]')).fontSize==='24px'&&getComputedStyle(document.querySelector('[data-field=brandName]')).backgroundColor==='rgb(0, 112, 192)'");
  await click('تنظیمات فرم');
  await evaluate("(()=>{const e=document.querySelector('th[data-column=brandCode]'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))})()");
  await check('table header exposes its own format target',"document.querySelector('.designer-context-menu strong')?.textContent.includes('سرستون')");
  await click('ظاهر و حاشیه');await click('رنگ پس‌زمینه…');await until("!!document.querySelector('.excel-color-popover')");
  await clickExpression("document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]')");await click('ذخیره تنظیمات');await reloadPage();
  await check('table header background preference persists and is applied',"getComputedStyle(document.querySelector('th[data-column=brandCode]')).backgroundColor==='rgb(0, 112, 192)'");
  await click('تنظیمات فرم');
  await evaluate("(()=>{const e=document.querySelector('.grid-search-control input'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))})()");
  await check('search control has an independent formatting target',"document.querySelector('.designer-context-menu strong')?.textContent.includes('کادر جست‌وجو')&&!!document.querySelector('.designer-context-menu [data-grid-submenu=appearance]')");
  await click('ظاهر و حاشیه');await click('رنگ پس‌زمینه…');await until("!!document.querySelector('.excel-color-popover')");
  await clickExpression("document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]')");await click('ذخیره تنظیمات');await reloadPage();
  await check('search input background preference persists and reaches the input',"getComputedStyle(document.querySelector('.grid-search-control input')).backgroundColor==='rgb(0, 112, 192)'");
  await click('تنظیمات فرم');
  await evaluate("(()=>{const e=document.querySelector('.laboratory-banner-title'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+5,clientY:r.top+5}))})()");
  await check('form title is independently styleable but has no movement command',"document.querySelector('.designer-context-menu strong')?.textContent==='عنوان فرم'&&!document.querySelector('.designer-context-menu [data-grid-submenu=layout]')");
  await click('ظاهر و حاشیه');await click('رنگ پس‌زمینه…');await until("!!document.querySelector('.excel-color-popover')");
  await clickExpression("document.querySelector('.excel-color-popover [aria-label=\"#0070c0\"]')");await click('ذخیره تنظیمات');await reloadPage();
  await check('form title background styling persists without changing layout',"getComputedStyle(document.querySelector('.laboratory-banner-title')).backgroundColor==='rgb(0, 112, 192)'");
  await click('تنظیمات فرم');await dragHandle('Resize form bottom',0,25);await click('خروج بدون ذخیره');
  await check('exit without saving discards this session and clears selection',"Math.abs(document.querySelector('.operational-form-frame').getBoundingClientRect().height-800)<1&&!!document.querySelector('[aria-label=\"تنظیمات فرم\"]')&&!document.querySelector('.personal-selected')");
  await check('toolbar search and table viewport are inside the frame',"(()=>{const f=document.querySelector('.operational-form-frame').getBoundingClientRect();return [...document.querySelectorAll('.grid-search-control,.base-grid-table-wrap')].every(e=>{const r=e.getBoundingClientRect();return r.left>=f.left&&r.right<=f.right})})()");
  await navigatePage({url:base+'/tests/brands-operational.html?restrictedSettings'});await until("!!document.querySelector('.operational-form-frame')");
  await check('revoked customization ignores stored dimensions',"Math.abs(document.querySelector('.operational-form-frame').getBoundingClientRect().height-760)<1");await click('تنظیمات فرم');
  await check('revoked permissions hide font color and resize tools',"!document.querySelector('[aria-label^=\"Resize form\"]')&&![...document.querySelectorAll('.operational-settings-tools button')].some(e=>['قلم…','رنگ…'].includes(e.textContent))");
  await navigatePage({url:base+'/tests/brands-operational.html?english'});await until("!!document.querySelector('.base-grid-table-wrap')");
  await check('English table opens at logical left',"(()=>{const v=document.querySelector('.base-grid-table-wrap'),c=document.querySelector('th[data-column=brandCode]');return v.dir==='ltr'&&v.scrollLeft===0&&Math.abs(c.getBoundingClientRect().left-v.getBoundingClientRect().left)<2})()");
  const enSizes=await evaluate(sizes);const enHandle=await evaluate("(()=>{const r=document.querySelector('th[data-column=brandCode] .base-grid-resizer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...enHandle,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:enHandle.x+24,y:enHandle.y,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:enHandle.x+24,y:enHandle.y,button:'left',clickCount:1});await pause(200);const enResized=await evaluate(sizes);
  assert.ok(Math.abs(enResized[0]-enSizes[0]-24)<1.1&&Math.abs(enResized[1]-enSizes[1])<1.1&&Math.abs(enResized[2]-enSizes[2])<1.1);results.push('LTR mouse resize expands toward the right and changes only the selected column');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results},null,2));
} catch(error) {
  console.error('BROWSER_ERRORS',errors)
  console.error(error)
  process.exitCode=1
} finally {
  socket?.close(); browser.kill()
  await new Promise(resolve=>browser.exitCode!==null?resolve():browser.once('exit',resolve))
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()), 'cleanup stays inside its own temporary directory')
  assert.ok(basename(profile).startsWith('yarn-form-regression-'))
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
