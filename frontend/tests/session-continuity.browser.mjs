import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

// Run against `npm run preview`; the browser profile and workspace are disposable.
const base = process.env.FORM_TEST_URL || 'http://127.1.0.1:5173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER')
const temporaryRoot = resolve(tmpdir())
const profile = resolve(await mkdtemp(join(temporaryRoot, 'yarn-focus-test-')))
assert.ok(profile.startsWith(temporaryRoot + sep), 'Browser profile must remain in the temporary directory')
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let socket, session, sequence = 0
const pending = new Map(), errors = []
const pause = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools: ' + logs)), 15000)
    browser.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome startup exited ' + code + ': ' + logs)) })
    browser.once('error', reject)
    browser.stderr.on('data', chunk => {
      logs += String(chunk)
      const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]) }
    })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if(data.method==='Page.javascriptDialogOpening'&&data.params.type==='beforeunload')void send('Page.handleJavaScriptDialog',{accept:true})
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text)
    const call = pending.get(data.id)
    if (call) { pending.delete(data.id); data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result) }
  })
  const send = (method, params = {}, browserLevel = false) => new Promise((resolveCall, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 20000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolveCall(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && session ? { sessionId: session } : {}) }))
  })
  const target = await send('Target.createTarget', { url: 'about:blank' }, true)
  session = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, true)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async (expression, label) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) { if (await evaluate("Boolean("+expression+")")) return; await pause(100) }
    throw new Error('Timed out: ' + label + '\n' +JSON.stringify(errors)+'\n'+ await evaluate('document.body.innerText.slice(0,1500)'))
  }






 await send('Page.navigate',{url:base+'/tests/form-storage.fixture.html'});await until("document.readyState==='complete'",'test document');
 const apiResults=await evaluate(`(async()=>{
   const original=window.fetch,counts={refresh:0,writes:0,network:0,expired:0};let failRefresh=false;
   window.addEventListener('auth-expired',()=>counts.expired++);
   const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
   window.fetch=async(url,init)=>{
     if(String(url).endsWith('/api/auth/login'))return json({accessToken:'old',refreshToken:'refresh-old'});
     if(String(url).endsWith('/api/auth/refresh')){counts.refresh++;await new Promise(r=>setTimeout(r,35));return failRefresh?json({},401):json({accessToken:'renewed',refreshToken:'refresh-new'})}
     if(String(url).includes('/api/network')){counts.network++;throw Error('offline')}
     if(String(url).includes('/api/forbidden'))return json({},403);
     if(String(url).includes('/api/check')){if(new Headers(init.headers).get('Authorization')!=='Bearer renewed')return json({},401);if(init.method==='POST')counts.writes++;return json({ok:true})}
     return original(url,init);
   };
   const api=await import('/src/api.ts');await api.login('same@example.com','test-only');
   const responses=await Promise.all(Array.from({length:8},(_,i)=>api.apiRequest('/api/check/'+i,{method:i===0?'POST':'GET',...(i===0?{body:'{}'}:{})})));
   try{await api.apiRequest('/api/network',{method:'POST',body:'{}'})}catch{}
   try{await api.api('/api/forbidden')}catch{}
   const first={...counts,allOk:responses.every(x=>x.ok),refreshStored:sessionStorage.getItem('refreshToken')==='refresh-new'};
   await api.login('same@example.com','test-only');failRefresh=true;await Promise.allSettled([api.api('/api/check/a'),api.api('/api/check/b')]);
   return {first,failed:{...counts,authenticated:api.isAuthenticated()}};
 })()`);
 assert.equal(apiResults.first.refresh,1);assert.equal(apiResults.first.writes,1);assert.equal(apiResults.first.network,1);assert.equal(apiResults.first.expired,0);assert.ok(apiResults.first.allOk&&apiResults.first.refreshStored);assert.equal(apiResults.failed.refresh,2);assert.equal(apiResults.failed.expired,1);assert.equal(apiResults.failed.authenticated,true,'expired auth must not erase local workspace session');
 console.log('PASS concurrent 401 refresh, token rotation, one write, no unsafe network retry, one expiry notification');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
   sessionStorage.setItem('accessToken','test-session');sessionStorage.setItem('refreshToken','test-refresh');sessionStorage.setItem('currentUser','same@example.com');
   sessionStorage.setItem('global-trade-workspace-v1',JSON.stringify({active:'settings',openTabs:['dashboard','settings']}));
   localStorage.setItem('language','fa');localStorage.setItem('session-timeout','1');
   window.failBootstrap=location.search.includes('bootstrapFailure');
   window.confirmCalls=[];window.confirm=message=>{window.confirmCalls.push(message);return false};
   const realFetch=window.fetch,json=(x,status=200)=>Promise.resolve(new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}}));
   window.fetch=(url,init)=>{
    if(String(url).endsWith('/api/auth/login'))return json({accessToken:'test-restored',refreshToken:'test-new'});
    if(String(url).endsWith('/api/user-access')&&window.failBootstrap)return json({error:'temporary'},503);
    if(String(url).endsWith('/api/user-access'))return json({id:'test-user',email:'same@example.com',displayName:'تست',preferredLanguage:'fa',sessionTimeoutMinutes:1,theme:'system',compactMode:false,fontFamily:'vazirmatn',fontSize:'normal',roles:['Administrator'],permissions:['settings.view','settings.edit']});
    if(String(url).endsWith('/api/user-settings'))return json({preferredLanguage:'fa',sessionTimeoutMinutes:1,theme:'system',compactMode:false,fontFamily:'vazirmatn',fontSize:'normal'});
    if(String(url).includes('/api/purchases'))return json({items:[],total:0});
    if(String(url).includes('/api/work-items'))return json([]);
    if(String(url).endsWith('/api/presence/notice'))return json(null);
    if(String(url).includes('/api/'))return json({},503);
    return realFetch(url,init);
   };
   // A legacy one-minute idle timeout would run immediately in this isolated test.
   const timeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===60000?20:ms,...args);
 `});
 await send('Page.navigate',{url:base+'/?sessionHarness=1'});await until("document.querySelector('.settings-page')",'real settings');
 await evaluate("(()=>{const input=document.querySelectorAll('.settings-page select')[1];window.preservedInput=input;input.value='ocean';input.dispatchEvent(new Event('change',{bubbles:true}))})()");await pause(150);
 assert.ok(await evaluate("document.querySelector('.app-shell')&&!document.querySelector('[data-session-recovery]')"),'legacy idle timeout cannot log user out');
 await evaluate("document.querySelector('.sidebar .user button').click()");assert.equal(await evaluate('window.confirmCalls.length'),1);assert.ok(await evaluate("!!document.querySelector('.app-shell')"),'cancel signout preserves workspace');
 await evaluate("window.dispatchEvent(new Event('close-active-form'))");assert.equal(await evaluate('window.confirmCalls.length'),2);assert.ok(await evaluate("document.querySelector('.form-tabs .active').textContent.includes('تنظیمات')"),'cancel Escape preserves active form');
 await evaluate("import('/tests/session-popup.fixture.tsx').then(m=>{window.removePendingComponent=m.mountPendingComponent()})");await until("document.querySelector('[data-field=pending-session-title]')",'pending component mounted');await evaluate("document.querySelector('[data-field=pending-session-title]').closest('.person-number-control').querySelector('.number-add-button').click()");await until("document.querySelector('.new-number-row textarea')",'pending component open');await evaluate("(()=>{const input=document.querySelector('.new-number-row textarea');window.preservedPopupInput=input;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'ریسندگی ثبت نشده');input.dispatchEvent(new Event('input',{bubbles:true}))})()");
 await evaluate("window.dispatchEvent(new Event('auth-expired'))");await until("document.querySelector('[data-session-recovery] input[type=password]')",'reauth overlay');
 assert.ok(await evaluate("document.querySelector('.app-shell').inert&&window.preservedInput.isConnected&&window.preservedInput.value==='ocean'"),'auth expiry keeps real unsaved form mounted and inert');
 const press=async selector=>{const point=await evaluate("(()=>{const r=document.querySelector("+JSON.stringify(selector)+").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})};
 await press('[data-session-recovery] input[type=password]');assert.ok(await evaluate("document.activeElement===document.querySelector('[data-session-recovery] input[type=password]')"),'open component must not steal focus from reauthentication');await send('Input.insertText',{text:'test-only'});assert.equal(await evaluate("document.querySelector('[data-session-recovery] input[type=password]').value"),'test-only');await press('[data-session-recovery] button[type=submit]');
 await until("!document.querySelector('[data-session-recovery]')",'same user restored');assert.ok(await evaluate("window.preservedInput.isConnected&&window.preservedInput.value==='ocean'&&!document.querySelector('.app-shell').inert"),'reauth resumes same unsaved controls');
 assert.ok(await evaluate("window.preservedPopupInput.isConnected&&window.preservedPopupInput.value==='ریسندگی ثبت نشده'"),'open component draft survives real mouse/keyboard reauthentication');await evaluate('window.removePendingComponent()');
 assert.ok(await evaluate("!document.querySelector('[data-field=sessionTimeoutMinutes]')"),'obsolete idle setting removed');
 await send('Page.navigate',{url:base+'/?sessionHarness=1&bootstrapFailure=1'});await until("document.querySelector('.app-language-loading button')",'bootstrap failure recovery');assert.ok(await evaluate("!document.querySelector('.login-page')&&sessionStorage.getItem('accessToken')==='test-session'"),'temporary access load failure must not sign user out');await evaluate("window.failBootstrap=false;document.querySelector('.app-language-loading button').click()");await until("document.querySelector('.settings-page')",'retry restores app without restart');
 assert.deepEqual(errors,[]);console.log('PASS real App: no timed logout, confirmation on signout/Escape, expired session preserves unsaved form and resumes same user');
} finally {
  if (socket) socket.close()
  browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}



