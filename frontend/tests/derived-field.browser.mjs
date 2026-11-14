import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base=process.env.FORM_TEST_URL||'http://127.1.0.1:5173'
const executable=process.env.FORM_TEST_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable,'Chrome/Edge required for this browser regression')
const profile=await mkdtemp(join(tmpdir(),'yarn-derived-runtime-'))
const browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-crash-reporter','--disable-breakpad','--window-size=1600,1000','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
let socket,session,sequence=0,loaded
const pending=new Map(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
try{
 const endpoint=await new Promise((resolve,reject)=>{let logs='';const timer=setTimeout(()=>reject(Error('Browser DevTools timeout: '+logs)),15000);browser.once('exit',code=>{clearTimeout(timer);reject(Error('Browser exited '+code+': '+logs))});browser.stderr.on('data',chunk=>{logs+=String(chunk);const m=String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1])}})})
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 const send=(method,params={},browserLevel=false)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},20000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});socket.send(JSON.stringify({id,method,params,...(!browserLevel&&session?{sessionId:session}:{})}))})
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Page.loadEventFired')loaded?.();const call=pending.get(data.id);if(call){pending.delete(data.id);data.error?call.reject(Error(JSON.stringify(data.error))):call.resolve(data.result)}})
 const target=await send('Target.createTarget',{url:'about:blank'},true);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;await send('Runtime.enable');await send('Page.enable')
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
 const navigate=async url=>{const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Navigation timed out: '+url)),20000);loaded=()=>{clearTimeout(timer);loaded=undefined;resolve()}});await send('Page.navigate',{url});await done}
 const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(100)}throw Error('Timed out waiting for '+expression+'; page='+JSON.stringify(await evaluate('JSON.stringify({href:location.href,title:document.title,body:document.body.innerText.slice(0,500)})')))}
 const key=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key});await send('Input.dispatchKeyEvent',{type:'keyUp',key})}
 const insert=async(selector,text)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await send('Input.insertText',{text})}
 await navigate(base+'/tests/form-designer.html');await until(`!!document.querySelector('[data-form-design-mode]')`)
 await navigate(base+'/tests/form-designer.html?derivedRuntime');await until(`!!document.querySelector('[data-form-design-mode]')`)
 await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.includes('آزمایش فرم کامل'))?.click()`);await until(`!!document.querySelector('[data-runtime-action="create"]')`)
 await evaluate(`document.querySelector('[data-runtime-action="create"]')?.click()`);await until(`document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='create'`)
 assert.equal(await evaluate(`(()=>{const e=document.querySelector('[data-field-id="personCode"] input');return !!e&&e.disabled&&!!e.value})()`),true,'incremental code is generated and not editable')
 await insert('[data-field-id="firstName"] input','آوا');await key('Enter')
 assert.equal(await evaluate(`document.activeElement?.closest('[data-field-id]')?.dataset.fieldId`),'gender','Enter skips the derived output field')
 await insert('[data-field-id="gender"] input','پنبه');
 assert.equal(await evaluate(`document.querySelector('[data-field-id="fullName"] output')?.textContent`),'آوا — پنبه','derived output updates as sources change')
 assert.equal(await evaluate(`(()=>{const e=document.querySelector('[data-field-id="fullName"] output'),active=document.activeElement;e?.focus();return e?.tabIndex===-1&&document.activeElement===active&&getComputedStyle(e).userSelect==='none'})()`),true,'derived output cannot receive focus or text selection')
 await key('F3');await until(`document.querySelector('[data-runtime-mode]')?.dataset.runtimeMode==='view'`)
 assert.equal(await evaluate(`document.querySelector('[data-field-id="fullName"] output')?.textContent`),'آوا — پنبه','derived value remains available after save')
 assert.equal(await evaluate(`(()=>{const e=document.querySelector('[data-field-id="personCode"] input');return e?.disabled&&e.value==='AA1'})()`),true,'saved system-generated code remains visible without becoming editable')
 console.log('PASS derived output recomputes, skips focus/navigation, persists on save; incremental code is generated and locked')
}finally{try{socket?.close()}catch{};if(browser.exitCode===null){browser.kill();await new Promise(resolve=>{browser.once('exit',resolve);setTimeout(resolve,1200)})};await pause(500);try{await rm(profile,{recursive:true,force:true})}catch(error){console.warn('Temporary browser profile cleanup deferred:',String(error))}}



