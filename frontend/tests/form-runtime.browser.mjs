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
  await navigatePage({url:base+'/tests/form-designer.html'});await mode('laboratory')
  await click('ایجاد فرم از قالب آزمایشگاه');await mode('independent')
  const searchInput=`document.querySelector('[data-toolbar-part="searchInput"] input')`
  await clickExpression(searchInput,'right')
  await check('search context groups text appearance and layout without unrelated structural commands',`(()=>{const menu=document.querySelector('.designer-context-menu:not(.designer-context-submenu)');return ['متن و قلم','ظاهر و حاشیه','اندازه و چیدمان'].every(text=>menu.textContent.includes(text))&&menu.querySelectorAll(':scope>button').length===3&&!menu.textContent.includes('افزودن هدر')&&!menu.textContent.includes('تنظیمات ساختار فرم')})()`)
  await clickExpression(menu('تغییر اندازه'))
  await until(`!!document.querySelector('#managed-designer-panel [data-tool-settings="searchInput"]')`)
  await check('Size uses the shared sidebar, never a different settings form',`!document.querySelector('.form-document-dialog-backdrop')`)
  await inputValue(`document.querySelector('#managed-designer-panel input[aria-label="کادر جست‌وجو — borderRadius"]')`,'18')
  await inputValue(`document.querySelector('#managed-designer-panel input[aria-label="کادر جست‌وجو — borderWidth"]')`,'4')
  await check('shared numeric controls update actual search corners and border live',`getComputedStyle(${searchInput}).borderRadius==='18px'&&getComputedStyle(${searchInput}).borderTopWidth==='4px'`)
  const initialSearchBackground=await evaluate(`getComputedStyle(${searchInput}).backgroundColor`)
  const paletteVisible=`!!document.querySelector('.excel-color-popover')&&!document.querySelector('.form-document-dialog-backdrop,.designer-grid-format-dialog')`
  await clickExpression(searchInput,'right');await clickExpression(menu('تغییر رنگ پس‌زمینه'))
  await until(paletteVisible)
  await check('search Color opens the existing palette directly',paletteVisible)
  if(process.env.FORM_APPEARANCE_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.FORM_APPEARANCE_SCREENSHOT+'-palette.png',Buffer.from(shot.data,'base64'))}
  const swatch=`document.querySelector('.excel-color-popover [aria-label="#0070c0"]')`
  const hover=await evaluate(`(()=>{const r=(${swatch}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...hover});await pause(120)
  await check('direct shared palette previews the actual search background',`getComputedStyle(${searchInput}).backgroundColor==='rgb(0, 112, 192)'`)
  await sendKey('Escape');await until(`!document.querySelector('.excel-color-popover')`)
  await check('Escape cancels the direct palette without changing saved appearance',`getComputedStyle(${searchInput}).backgroundColor===${JSON.stringify(initialSearchBackground)}`)
  await clickExpression(searchInput,'right');await clickExpression(menu('تغییر رنگ پس‌زمینه'));await until(paletteVisible)
  await clickExpression(swatch)
  await check('direct palette commits the intended search color',`getComputedStyle(${searchInput}).backgroundColor==='rgb(0, 112, 192)'`)
  await click('واگرد','.form-laboratory-banner button')
  await check('one Undo restores the direct color change',`getComputedStyle(${searchInput}).backgroundColor===${JSON.stringify(initialSearchBackground)}`)
  await click('ازنو','.form-laboratory-banner button')
  await check('Redo restores the direct color change',`getComputedStyle(${searchInput}).backgroundColor==='rgb(0, 112, 192)'`)
  await sendKey('Escape');await until(`!document.querySelector('.excel-color-popover')`)
  const fontShape=`JSON.stringify([...document.querySelector('.designer-grid-format-dialog').querySelectorAll('input,select,button')].map(e=>[e.tagName,e.type,e.getAttribute('aria-label')]))`
  await clickExpression(field('firstName'),'right');await clickExpression(menu('تنظیم فونت'))
  await until(`!!document.querySelector('.designer-grid-format-dialog')`)
  const sharedFontShape=await evaluate(fontShape)
  if(process.env.FORM_APPEARANCE_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.FORM_APPEARANCE_SCREENSHOT+'-font.png',Buffer.from(shot.data,'base64'))}
  await click('لغو','.designer-grid-format-dialog button')
  for(const part of ['searchInput','title','counter','expand','columns','searchOptions','searchOption:exact']){
    await clickExpression(`document.querySelector('[data-toolbar-part="${part}"]')`,'right');const textGroup=await evaluate(`(()=>{const r=document.querySelector('.designer-context-menu:not(.designer-context-submenu) [data-grid-submenu="text"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...textGroup});await pause(120);await clickExpression(menu('تغییر رنگ متن'))
    await until(paletteVisible);await check(part+' opens the same direct color palette',paletteVisible)
    await sendKey('Escape');await until(`!document.querySelector('.excel-color-popover')`)
    await clickExpression(`document.querySelector('[data-toolbar-part="${part}"]')`,'right');const textGroupFont=await evaluate(`(()=>{const e=document.querySelector('.designer-context-menu:not(.designer-context-submenu) [data-grid-submenu="text"]'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...textGroupFont});await pause(120);await clickExpression(menu('تنظیم فونت'))
    await until(`!!document.querySelector('.designer-grid-format-dialog')`)
    assert.equal(await evaluate(fontShape),sharedFontShape,part+' must use the exact same font window as a main field')
    results.push(part+' opens the exact shared font window')
    await click('لغو','.designer-grid-format-dialog button')
  }
  await clickExpression(field('firstName'),'right');await clickExpression(menu('تغییر رنگ پس‌زمینه'))
  await until(paletteVisible);await check('main input still uses the exact same palette',paletteVisible);await sendKey('Escape')
  await clickExpression(`document.querySelector('[data-toolbar-part="title"]')`)
  await clickExpression(`document.querySelector('[data-toolbar-part="counter"]')`,'left',2)
  const groupColors=await evaluate(`['title','counter'].map(part=>getComputedStyle(document.querySelector('[data-toolbar-part="'+part+'"]').closest('[data-toolbar-part]')).color)`)
  await clickExpression(`document.querySelector('[data-toolbar-part="title"]')`,'right');await clickExpression(menu('تغییر رنگ متن'))
  await until(paletteVisible);await clickExpression(swatch)
  await check('direct color honors multiselection as the main field editor does',`['title','counter'].every(part=>getComputedStyle(document.querySelector('[data-toolbar-part="'+part+'"]').closest('[data-toolbar-part]')).color==='rgb(0, 112, 192)')`)
  await click('واگرد','.form-laboratory-banner button')
  assert.deepEqual(await evaluate(`['title','counter'].map(part=>getComputedStyle(document.querySelector('[data-toolbar-part="'+part+'"]').closest('[data-toolbar-part]')).color)`),groupColors,'one Undo restores both selected appearances')
  results.push('group color uses one Undo transaction')
  const openHeaderAppearanceMenu=async()=>{
    await evaluate(`document.querySelector('[data-toolbar-part="header"]').scrollIntoView({block:'nearest'})`)
    const p=await evaluate(`(()=>{const e=document.querySelector('[data-toolbar-part="header"]'),r=e.getBoundingClientRect();for(let y=Math.max(4,r.top+8);y<Math.min(innerHeight-4,r.bottom-4);y+=6)for(let x=Math.max(4,r.left+8);x<Math.min(innerWidth-4,r.right-8);x+=6)if(document.elementFromPoint(x,y)?.closest('[data-toolbar-part]')===e)return {x,y};throw Error('No visible header surface')})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'right',clickCount:1});await pause(120)
  }
  await openHeaderAppearanceMenu();await clickExpression(menu('تغییر رنگ پس‌زمینه'));await until(paletteVisible)
  await check('the whole header opens the same palette directly',paletteVisible);await sendKey('Escape')
  await openHeaderAppearanceMenu();await clickExpression(menu('تنظیم فونت'));await until(`!!document.querySelector('.designer-grid-format-dialog')`)
  assert.equal(await evaluate(fontShape),sharedFontShape,'whole header font window must be identical');results.push('whole header uses the shared font window')
  await click('لغو','.designer-grid-format-dialog button')
  const columnHeader=`document.querySelector('.laboratory-form-frame th[data-column="personCode"]')`
  await clickExpression(columnHeader,'right');await clickExpression('document.querySelector("[data-grid-submenu=header]")');await clickExpression(menu('رنگ متن هدر…'));await until(paletteVisible)
  await check('a table column header uses the same direct color palette',paletteVisible);await sendKey('Escape')
  await clickExpression(columnHeader,'right');await clickExpression('document.querySelector("[data-grid-submenu=header]")');await clickExpression(menu('قلم و اندازهٔ هدر…'));await until(`!!document.querySelector('.designer-grid-format-dialog')`)
  assert.equal(await evaluate(fontShape),sharedFontShape,'column header font window must be identical');results.push('column header uses the shared font window')
  await click('لغو','.designer-grid-format-dialog button')
  await clickExpression(field('firstName'),'right');await clickExpression(menu('گردی گوشه‌ها'))
  await inputValue(`document.querySelector('#designer-effect-borderRadius')`,'18')
  await check('the main input and search use the same live corner editing behavior',`getComputedStyle((${field('firstName')}).querySelector('input')).borderRadius==='18px'&&getComputedStyle(${searchInput}).borderRadius==='18px'`)
  await clickExpression(`document.querySelector('[data-toolbar-part="searchInput"]')`,'right');await clickExpression(menu('گردی گوشه‌ها'))
  await check('corner command reveals the intended control without any settings dialog',`document.activeElement?.getAttribute('aria-label')==='کادر جست‌وجو — borderRadius'&&!document.querySelector('.form-document-dialog-backdrop')`)

  for(const part of ['title','counter','expand','columns','searchOptions']){
    await clickExpression(`document.querySelector('[data-toolbar-part="${part}"]')`,'right')
    await click('ظاهر و حاشیه','[role="menu"] button')
    await check(part+' has context-appropriate appearance actions',`document.querySelector('.designer-context-submenu').textContent.includes('رنگ پس‌زمینه')&&!document.querySelector('.designer-context-menu:not(.designer-context-submenu)').textContent.includes('افزودن هدر')`)
    await sendKey('Escape')
  }
  // Change real designed buttons first; runtime must keep their exact renderer and overrides.
  for(const id of ['new-person','demo-save','reset-sample']){
    await clickExpression(`document.querySelector('[data-action-id="${id}"]>button')`,'right');await clickExpression(menu('تنظیم فونت'))
    await until(`!!document.querySelector('.designer-grid-format-dialog')`)
    await inputValue(`document.querySelector('.designer-grid-format-dialog input[type="number"]')`,'19')
    await click('تأیید','.designer-grid-format-dialog button')
    await clickExpression(`document.querySelector('[data-action-id="${id}"]>button')`,'right');await clickExpression(menu('گردی گوشه‌ها'))
    await inputValue(`document.querySelector('#designer-effect-borderRadius')`,'23')
    await clickExpression(`document.querySelector('[data-action-id="${id}"]>button')`,'right');await clickExpression(menu('تغییر رنگ پس‌زمینه'))
    await until(paletteVisible);await clickExpression(swatch)
  }
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await pause(100)
  const actionAppearance=`(()=>{const ids=['new-person','demo-save','reset-sample','edit-person','delete-person'];return Object.fromEntries(ids.map(id=>{const host=document.querySelector('.laboratory-form-frame [data-action-id="'+id+'"]');if(!host)return [id,null];const e=host.querySelector('button'),k=e.querySelector('kbd'),label=e.querySelector('span'),c=getComputedStyle(e),signature=n=>{const s=getComputedStyle(n);return [s.fontFamily,s.fontSize,s.fontWeight,s.fontStyle,s.color,s.textDecorationLine,n.textContent]};return [id,{hostStyle:Object.fromEntries([...host.style].sort().map(key=>[key,host.style.getPropertyValue(key)])),className:e.className,color:c.color,background:c.backgroundColor,border:c.border,borderRadius:c.borderRadius,width:c.width,height:c.height,font:signature(e).slice(0,6),code:signature(k),label:signature(label),children:[...e.children].map(child=>child.tagName)}]}))})()`
  const designedActions=await evaluate(actionAppearance)
  assert.equal(designedActions['demo-save'].borderRadius,'23px')
  assert.equal(designedActions['demo-save'].background,'rgb(0, 112, 192)')
  assert.equal(designedActions['demo-save'].font[1],'19px')
  const assertActionAppearance=async(ids)=>{
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await pause(100)
    const actual=await evaluate(actionAppearance)
    for(const id of ids)assert.deepEqual(actual[id],designedActions[id],'runtime must preserve exact designed appearance: '+id)
  }
  const captureRuntimeFooter=async(suffix)=>{
    if(!process.env.FORM_FOOTER_SCREENSHOT)return
    await evaluate(`document.querySelector('[data-runtime-actions]').scrollIntoView({block:'center'})`);await pause(120)
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.FORM_FOOTER_SCREENSHOT+'-'+suffix+'.png',Buffer.from(shot.data,'base64'))
  }
  await click('آزمایش فرم کامل')
  await until(`document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='view'`)
  await assertActionAppearance(['new-person','reset-sample'])
  results.push('entering runtime preserves designed button colors, dimensions, corners and code/label typography')
  await check('runtime starts in view mode with native fields disabled',`[...document.querySelectorAll('.laboratory-form-frame [data-field-id] input')].every(e=>e.disabled)`)
  await check('runtime preserves the actual first-row input placement without overlaps',`(()=>{const rows=['personCode','titleId','firstName','lastName','jobId'].map(id=>document.querySelector('.laboratory-form-frame [data-field-id="'+id+'"] .designer-input-part').querySelector('input,textarea,select').getBoundingClientRect());return rows.every((a,i)=>a.width>0&&rows.every((b,j)=>i===j||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1))})()`)
  await evaluate(`(()=>{const input=document.querySelector('.laboratory-form-frame [data-field-id="personCode"] input'),event=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});input.dispatchEvent(event);return event.defaultPrevented})()`)
  await until(`document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='create'`)
  results.push('Space starts Create even when the event target is a disabled view field')
  await assertActionAppearance(['demo-save','reset-sample']);results.push('entry Save and Close retain their own designed appearance');await captureRuntimeFooter('entry')
  await check('create shows only Save and Close and activates sample inputs',`document.querySelector('[data-runtime-mode]').dataset.runtimeMode==='create'&&[...document.querySelectorAll('[data-runtime-action]')].map(e=>e.dataset.runtimeAction).sort().join(',')==='close,save'&&!(${field('personCode')}).querySelector('input').disabled`)
  await clickExpression(`document.querySelector('[data-runtime-action="save"]')`)
  await check('invalid save retains entry mode and identifies missing required fields',`document.querySelector('[data-runtime-mode]').dataset.runtimeMode==='create'&&document.querySelectorAll('.field-error').length>=1`)
  await inputValue(`(${field('personCode')}).querySelector('input')`,'PREVIEW-1')
  await sendKey('Enter')
  await until(`!!document.querySelector('[data-component-popup]')`)
  await inputValue(`document.querySelector('[data-component-popup] .new-number-row textarea')`,'نوع نمونه')
  await sendKey('Enter')
  await check('Enter inside a component adds a row without saving its parent runtime record',`document.querySelectorAll('[data-component-popup] .new-number-row').length===2&&document.querySelector('[data-runtime-mode]').dataset.runtimeMode==='create'`)
  await click('ثبت (F3)','[data-component-popup] button');await until(`!document.querySelector('[data-component-popup]')`)
  await inputValue(`(${field('firstName')}).querySelector('input')`,'نمونه تست')
  await sendKey('Enter')
  await check('Enter uses shared field order after validation',`document.activeElement===(${field('lastName')}).querySelector('input')`)
  await sendKey('F3')
  await until(`document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='view'`)
  await check('F3 saves a sample into the actual table and restores normal footer actions',`document.querySelector('.laboratory-form-frame .base-grid-boundary').textContent.includes('PREVIEW-1')&&document.querySelector('[data-runtime-action="create"]')&&!document.querySelector('[data-runtime-action="save"]')`)
  await assertActionAppearance(['new-person','reset-sample','edit-person','delete-person']);results.push('saving restores normal buttons with their original designed appearance');await captureRuntimeFooter('saved')
  await inputValue(searchInput,'PREVIEW-1')
  await check('full runtime activates the actual search instead of dragging its designer box',`(${searchInput}).value==='PREVIEW-1'&&!document.querySelector('[data-toolbar-part][data-designer-tool-selected="true"]')`)
  await inputValue(searchInput,'')
  if(process.env.FORM_RUNTIME_SCREENSHOT){await evaluate(`(()=>{window.scrollTo(0,0);document.querySelector('.laboratory-form-frame').scrollIntoView({block:'start'});document.querySelector('.laboratory-designer-panel')?.scrollTo(0,0)})()`);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.FORM_RUNTIME_SCREENSHOT,Buffer.from(shot.data,'base64'))}
  await clickExpression(`document.querySelector('[data-runtime-action="edit"]')`)
  await assertActionAppearance(['demo-save','reset-sample']);results.push('editing preserves the same Save and Close appearance as Create')
  await inputValue(`(${field('firstName')}).querySelector('input')`,'ویرایش نشده')
  await sendKey('Escape')
  await check('closing an edit retains the saved sample record',`document.querySelector('.base-grid-boundary').textContent.includes('نمونه تست')&&!document.querySelector('.base-grid-boundary').textContent.includes('ویرایش نشده')`)
  await click('پایان آزمایش عملکرد')
  await check('returning to Design restores actual selection and the changed search style',`document.querySelector('[data-designer-active]')?.dataset.designerActive==='true'&&getComputedStyle(${searchInput}).borderRadius==='18px'`)
  await click('مدیریت رفتار و قرارداد فرم‌ها')
  await clickExpression(`document.querySelector('input[aria-label="enterNavigation"]')`)
  await click('آزمایش رفتار پیش از ثبت','[role="dialog"] button')
  await clickExpression(`document.querySelector('[data-runtime-action="create"]')`)
  await inputValue(`(${field('personCode')}).querySelector('input')`,'DRAFT-POLICY');await sendKey('Enter')
  await check('draft behavior can be tested without publishing or changing form references',`document.activeElement===(${field('personCode')}).querySelector('input')`)
  await clickExpression(`document.querySelector('[data-runtime-action="close"]')`);await click('پایان آزمایش عملکرد')
  await click('مدیریت رفتار و قرارداد فرم‌ها')
  await check('leaving a draft preview preserves the published Laboratory policy',`document.querySelector('input[aria-label="enterNavigation"]').checked`)
  await inputValue(`document.querySelector('input[aria-label="نام قابلیت اختصاصی"]')`,'قابلیت نمونهٔ قابل ارث‌بری')
  await click('ثبت قابلیت قابل استفادهٔ مجدد','[role="dialog"] button')
  const behaviorId=await evaluate(`document.querySelector('select[aria-label="تعریف رفتار در آزمایشگاه"]').value`)
  await inputValue(`document.querySelector('textarea[aria-label="قرارداد رفتار — sourceForm"]')`,'فرم برندها')
  await inputValue(`document.querySelector('textarea[aria-label="قرارداد رفتار — operation"]')`,'انتخاب و افزودن برند مجاز')
  await evaluate(`document.querySelector('input[aria-label="enterNavigation"]').scrollIntoView({block:'nearest'})`)
  await check('scrolling a shared dialog control keeps it below the sticky header and clickable',`(()=>{const e=document.querySelector('input[aria-label="enterNavigation"]'),r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e})()`)
  await clickExpression(`document.querySelector('input[aria-label="enterNavigation"]')`)
  await click('ثبت نسخهٔ رفتار مشترک','[role="dialog"] button')
  await selectValue(`document.querySelector('select[aria-label="رفتار این فرم"]')`,behaviorId)
  await click('بستن مدیریت رفتار','[role="dialog"] button')
  await click('آزمایش فرم کامل');await clickExpression(`document.querySelector('[data-runtime-action="create"]')`)
  await inputValue(`(${field('personCode')}).querySelector('input')`,'PREVIEW-2');await sendKey('Enter')
  await check('a selected reusable child policy changes navigation without duplicated handlers',`document.activeElement===(${field('personCode')}).querySelector('input')&&!document.querySelector('[data-component-popup]')`)
  await clickExpression(`document.querySelector('[data-runtime-action="close"]')`);await click('پایان آزمایش عملکرد')
  await click('مدیریت رفتار و قرارداد فرم‌ها')
  await selectValue(`document.querySelector('select[aria-label="تعریف رفتار در آزمایشگاه"]')`,behaviorId)
  await check('reusable capability retains its operational source instructions in the Laboratory',`document.querySelector('textarea[aria-label="قرارداد رفتار — sourceForm"]').value==='فرم برندها'&&document.querySelector('textarea[aria-label="قرارداد رفتار — operation"]').value.includes('افزودن برند')`)
  await click('تاریخچه و بازیابی رفتار','[role="dialog"] summary')
  await click('بازیابی رفتار نسخهٔ 1','[role="dialog"] button')
  await until(`JSON.parse(localStorage.getItem('yarn-trade:laboratory-behaviors:v1')).definitions.find(item=>item.id===${JSON.stringify(behaviorId)}).revisions.length===3`)
  await click('بستن مدیریت رفتار','[role="dialog"] button')
  await click('آزمایش فرم کامل');await clickExpression(`document.querySelector('[data-runtime-action="create"]')`)
  await inputValue(`(${field('personCode')}).querySelector('input')`,'PREVIEW-3');await sendKey('Enter')
  await until(`!!document.activeElement?.closest('[data-field-id="titleId"]')`)
  await check('restoring a behavior revision restores shared Enter navigation and retained component defaults',`document.activeElement.closest('[data-field-id]').dataset.fieldId==='titleId'&&document.querySelector('[data-runtime-mode]').dataset.runtimeMode==='create'`)
  if(await evaluate(`!!document.querySelector('[data-component-popup]')`))await sendKey('Escape')
  await clickExpression(`document.querySelector('[data-runtime-action="close"]')`);await click('پایان آزمایش عملکرد')
  await click('ذخیرهٔ فرم','.form-laboratory-banner button');await click('تأیید مجوزها و ذخیره','[role="dialog"] button')
  await reloadPage();await mode('independent')
  await check('form behavior reference and versioned library survive reload while sample sessions reset',`document.querySelector('[data-form-laboratory]').dataset.formBehaviorId===${JSON.stringify(behaviorId)}&&JSON.parse(localStorage.getItem('yarn-trade:laboratory-behaviors:v1')).definitions.find(item=>item.id===${JSON.stringify(behaviorId)}).revisions.length===3&&!document.querySelector('[data-runtime-mode]')`)

  const protectedForms=await evaluate("JSON.parse(localStorage.getItem('yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression')).forms")
  await navigatePage({url:base+'/tests/form-designer.html?codeRuntime'});await mode('independent')
  await click('آزمایش فرم کامل');await clickExpression(`document.querySelector('[data-runtime-action="create"]')`)
  const codeInput='('+field('personCode')+').querySelector("input")'
  await check('new code suggestion is selected in the actual input', '(()=>{const e='+codeInput+';return e.value==="AA1"&&document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===3})()')
  await inputValue(codeInput,'ab۸');await pause(250)
  await check('manual code normalizes digits but retains letter case without subsequent auto-overwrite', '('+codeInput+').value==="ab8"')
  await inputValue('('+field('firstName')+').querySelector("input")','نام فارسی')
  await check('code input policy leaves Persian name input unchanged', '('+field('firstName')+').querySelector("input").value==="نام فارسی"')
  await sendKey('F3');await until('document.querySelector("[data-runtime-mode]").dataset.runtimeMode==="view"')
  await clickExpression(`document.querySelector('[data-runtime-action="create"]')`)
  await check('suggestion follows last successful registration and casing', '('+codeInput+').value==="ab9"')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ش',code:'KeyA'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ش',code:'KeyA'});await pause(100)
  await check('physical Persian key is local lowercase Latin input and replaces selected suggestion', '('+codeInput+').value==="a"')
  await inputValue(codeInput,'AC1')
  await evaluate('('+codeInput+').setSelectionRange(1,1)');await send('Input.insertText',{text:'b'});await pause(100)
  await check('preserving mixed case on middle insertion retains the caret', '('+codeInput+').value==="AbC1"&&('+codeInput+').selectionStart===2')
  await inputValue(codeInput,'AC1')
  await evaluate('(()=>{const e='+codeInput+';const data=new DataTransfer();data.setData("text/plain","فارسی");e.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data}))})()')
  await check('invalid paste is rejected atomically', '('+codeInput+').value==="AC1"')
  await evaluate('(()=>{const e='+codeInput+';e.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"فارسی");e.dispatchEvent(new InputEvent("input",{bubbles:true,isComposing:true,data:"فارسی"}));e.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:"فارسی"}))})()')
  await check('invalid composition restores accepted code', '('+codeInput+').value==="AC1"')
  await inputValue(codeInput,'ab۸');await sendKey('F3')
  await check('canonical duplicate cannot be saved', 'document.querySelector("[data-runtime-mode]").dataset.runtimeMode==="create"&&document.querySelector(".field-error").textContent.includes("تکراری")')
  await inputValue(codeInput,'AC1');await sendKey('F3');await until('document.querySelector("[data-runtime-mode]").dataset.runtimeMode==="view"')
  await click('پایان آزمایش عملکرد')
  const retainedForms=await evaluate("JSON.parse(localStorage.getItem('yarn-trade:form-laboratory-managed-forms:v1:isolated-browser-regression')).forms.filter(form=>form.id!=='form.code-regression')")
  assert.deepEqual(retainedForms,protectedForms,'code sample must preserve every prior form and its master snapshot')
  await check('sample cycle preserves strict code configuration in the actual designer', 'document.querySelector("[data-form-design-mode]").dataset.formDesignMode==="independent"&&!!('+field('personCode')+')')
  await click('کتابخانه و آزمایش کامپوننت‌ها')
  await selectValue('document.querySelector(`.component-library-editor [aria-label="کامپوننت کتابخانه"]`)','base-form.code-input')
  await selectValue('document.querySelector(`.component-library-editor [aria-label="قالب کد آزمایشی"]`)','letters')
  await selectValue('document.querySelector(`.component-library-editor [aria-label="سیاست قالب کد"]`)','segments')
  await inputValue('document.querySelector(`.component-library-editor [aria-label="طول ثابت کد"]`)','2')
  await inputValue('document.querySelector(`.component-library-editor [aria-label="حداکثر طول کد"]`)','2')
  await click('ثبت نسخهٔ تنظیمات کد')
  await check('library persisted settings match edited controls', "(()=>{const l=JSON.parse(localStorage.getItem('yarn-trade:component-library:v1')||'{}');const s=l.components?.find(c=>c.id==='base-form.code-input')?.revisions?.at(-1)?.codeSettings;return s?.mode==='letters'&&s?.format==='segments'&&s?.fixedLength===2&&s?.maxLength===2})()")
  await click('بستن کتابخانه')
  await click('کتابخانه و آزمایش کامپوننت‌ها');await selectValue('document.querySelector(`.component-library-editor [aria-label="کامپوننت کتابخانه"]`)','base-form.code-input')
  await check('library code settings persist through publication and reopening', 'document.querySelector(`.component-library-editor [aria-label="قالب کد آزمایشی"]`).value==="letters"&&document.querySelector(`.component-library-editor [aria-label="سیاست قالب کد"]`).value==="segments"&&document.querySelector(`.component-library-editor [aria-label="طول ثابت کد"]`).value==="2"')
  await click('بستن کتابخانه')
  assert.deepEqual(errors,[],'no unexpected requests or browser errors')
  console.log(JSON.stringify({passed:results.length,results},null,2))

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
