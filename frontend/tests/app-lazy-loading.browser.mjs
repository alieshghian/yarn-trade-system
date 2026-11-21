import assert from 'node:assert/strict'
import { connectChromeDevTools } from './chrome-devtools.mjs'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { checkPersonsGoldenVisual } from './persons-golden-visual.mjs'

// Run against `npm run preview`; the browser profile and workspace are disposable.
const base = process.env.APP_TEST_URL || 'http://127.0.0.1:4173'
const executable = process.env.FORM_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(executable, 'Install Chrome/Edge or set FORM_TEST_BROWSER')
const temporaryRoot = resolve(tmpdir())
const profile = resolve(await mkdtemp(join(temporaryRoot, 'yarn-lazy-test-')))
assert.ok(profile.startsWith(temporaryRoot + sep), 'Browser profile must remain in the temporary directory')
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let socket, session, sequence = 0
const pending = new Map(), errors = []
const pause = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

try {
  socket = await connectChromeDevTools(browser, profile, executable)
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
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
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100) }
    throw new Error('Timed out: ' + label + '\n' + await evaluate('document.body.innerText.slice(0,1500)'))
  }
  const clickTab = async label => {
    const expression = `Array.from(document.querySelectorAll('.form-tabs > button')).find(button => Array.from(button.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ${JSON.stringify(label)}))`
    await until(`!!(${expression})`, label + ' tab')
    await evaluate(`(${expression}).click()`)
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.search.includes('demo=1') && !sessionStorage.getItem('global-trade-workspace-v1'))
      sessionStorage.setItem('global-trade-workspace-v1', JSON.stringify({active:'dashboard',openTabs:['dashboard','formLaboratory','settings','persons','brands','yarns','purchaseOrders','commerce','users','dataBackup','businessContract']}));
    const realFetch = window.fetch;
    window.fetch = (input, options) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/api/user-settings') && (!options?.method || options.method === 'GET'))
        return Promise.resolve(new Response(JSON.stringify({preferredLanguage:'fa',sessionTimeoutMinutes:30,theme:'system',compactMode:false,fontFamily:'vazirmatn',fontSize:'normal'}), {status:200,headers:{'Content-Type':'application/json'}}));
      if (url.endsWith('/api/business-contract') && (!options?.method || options.method === 'GET'))
        return Promise.resolve(Response.json({contract:null,hasOperationalTransactions:false,state:'Missing',partners:[],investors:[]}));
      if (url.includes('/api/')) return Promise.resolve(new Response('{}', {status:503,headers:{'Content-Type':'application/json'}}));
      return realFetch(input, options);
    };
  ` })
  await send('Page.navigate', { url: base + '/?demo=1' })
  await until("document.querySelector('.form-tabs > button.active')?.textContent.includes('داشبورد')", 'restored dashboard')
  assert.equal(await evaluate("document.querySelectorAll('.form-tabs > button').length"), 11, 'restored tabs remain visible')
  const resources = () => evaluate("performance.getEntriesByType('resource').map(entry => entry.name)")
  let loaded = await resources()
  assert.ok(!loaded.some(url => /\/assets\/(?:FormLaboratoryPage|UserSettingsPage|PersonsPage|BrandsPage|YarnsOperationalRoute|ApprovedYarnsPage|YarnsPage|PurchaseOrdersPage|CommercePage|UsersPage|DataBackupPage|BusinessContractPage)-/.test(url)), 'inactive restored tabs do not fetch their pages at startup')
  console.log('PASS restored inactive tabs do not load their page code')

  await clickTab('تنظیمات کاربر')
  await until("!!document.querySelector('.form-tab-pane.active .settings-page [data-preference=theme]')", 'settings page')
  loaded = await resources()
  assert.ok(loaded.some(url => /\/assets\/UserSettingsPage-/.test(url)), 'settings code loads on selection')
  const input = "document.querySelector('.form-tab-pane.active .settings-page [data-preference=theme]')"
  await evaluate(`(()=>{const e=${input};e.value='ocean';e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await until(`${input}.value === 'ocean'`, 'unsaved settings value')
  await clickTab('داشبورد')
  await clickTab('تنظیمات کاربر')
  assert.equal(await evaluate(`${input}.value`), 'ocean', 'switching tabs preserves the mounted page and unsaved input')
  console.log('PASS page code loads on selection and tab state survives switching')

  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Network.setBlockedURLs', { urls: ['*FormLaboratoryPage-*.js'] })
  await clickTab('آزمایشگاه فرم‌ها')
  await until("document.querySelector('.form-tab-pane.active [role=alert]')?.textContent.includes('بارگیری این صفحه انجام نشد')", 'page load error')
  await clickTab('تنظیمات کاربر')
  assert.equal(await evaluate(`${input}.value`), 'ocean', 'a failed page load keeps other tabs and their unsaved state available')
  assert.ok(errors.every(error => /Failed to fetch dynamically imported module.*FormLaboratoryPage-/.test(error)), 'only the intentionally blocked import may fail')
  errors.length = 0
  await send('Network.setBlockedURLs', { urls: [] })
  console.log('PASS an unavailable page leaves other tabs and their state usable')

  const designId = 'form-laboratory.persons-synthetic'
  await send('Page.navigate', { url: base + '/?demo=1&formDesign=' + encodeURIComponent(designId) })
  await until(`document.querySelector('.form-tab-pane.active .laboratory-form-access input')?.value.includes(${JSON.stringify('formDesign=' + designId)})`, 'direct laboratory address')
  loaded = await resources()
  assert.ok(loaded.some(url => /\/assets\/FormLaboratoryPage-/.test(url)), 'laboratory code loads when directly opened')
  for (const [label, moduleName] of [
    ['تعریف اشخاص', 'PersonsPage'], ['تعریف برند', 'BrandsPage'], ['تعریف نخ', 'YarnsOperationalRoute'],
    ['سفارش خرید نخ', 'PurchaseOrdersPage'], ['خرید نخ', 'CommercePage'], ['تعریف کاربران', 'UsersPage'],
    ['تهیه و بازخوانی اطلاعات', 'DataBackupPage'], ['قرارداد و قواعد کسب‌وکار', 'BusinessContractPage'],
  ]) {
    await clickTab(label)
    await until(`performance.getEntriesByType('resource').some(entry => entry.name.includes('/assets/${moduleName}-'))`, moduleName + ' code')
    await until("!!document.querySelector('.form-tab-pane.active > :not([role=status])')", moduleName + ' page')
    assert.equal(await evaluate("document.querySelector('.form-tab-pane.active')?.textContent.includes('بارگیری این صفحه انجام نشد')"), false, moduleName + ' renders without a page load error')
    if (moduleName === 'PersonsPage') {
      const persons = '.form-tab-pane.active .persons-page'
      await until(`document.querySelectorAll('${persons} .persons-grid-actions svg').length===4 && !!document.querySelector('${persons} tbody tr.selected')`, 'Persons production toolbar and rows')
      const golden = JSON.parse(await readFile(new URL('./persons-golden-geometry.json', import.meta.url)))
      await send('Emulation.setDeviceMetricsOverride', golden.capture)
      const measure = () => evaluate(`(async () => {
        await document.fonts.ready;
        await new Promise(requestAnimationFrame);
        const p = document.querySelector('${persons}');
        const get = selector => p.querySelector(selector);
        const bounds = selector => get(selector).getBoundingClientRect();
        const origin = p.getBoundingClientRect();
        const footer = bounds('.shortcut-bar');
        return {
          headerHeight: bounds('thead th').height, headingHeight: bounds('.column-heading').height,
          headingFontSize: getComputedStyle(get('.column-title')).fontSize,
          headingPadding: getComputedStyle(get('.column-title')).padding,
          filterWidth: bounds('.excel-filter-trigger').width,
          rowHeight: bounds('tbody tr').height, toolbarHeight: bounds('.grid-toolbar').height,
          toolbarOffset: bounds('.grid-toolbar').top - origin.top,
          formHeaderOffset: bounds('.person-section-head').top - origin.top,
          formHeaderHeight: bounds('.person-section-head').height, editorHeight: bounds('.person-editor').height,
          modeBadgeInlineEndInset: bounds('.mode-badge').left - origin.left,
          fieldHeight: bounds('[data-field=personCode]').height,
          fieldOffset: bounds('[data-field=personCode]').top - origin.top,
          fieldLabelFontSize: getComputedStyle(get('.person-code-field > span')).fontSize,
          footerVisible: footer.bottom <= innerHeight && footer.top >= 0,
          footerBottomInset: origin.bottom - footer.bottom
        };
      })()`)
      await checkPersonsGoldenVisual({ send, evaluate })
      assert.deepEqual(await measure(), golden.measurements, 'Golden Persons desktop geometry')
      await evaluate(`document.querySelector('${persons}').style.setProperty('--grid-header-height', '70px')`)
      assert.deepEqual(await measure(), golden.measurements, 'Shared grid header token cannot change Golden Persons')
      await evaluate(`document.querySelector('${persons}').style.removeProperty('--grid-header-height')`)
      const shortcut = `document.querySelector('${persons} .shortcut-settings button')`
      await evaluate(`${shortcut}.click()`)
      await until(`${shortcut}.getAttribute('aria-expanded')==='true'`, 'Production shortcut popup')
      await clickTab('داشبورد')
      await clickTab('تعریف اشخاص')
      assert.equal(await evaluate(`${shortcut}.getAttribute('aria-expanded')`), 'false', 'Switching tabs closes Persons shortcut settings')
      if (process.env.PERSONS_PRODUCTION_SCREENSHOT) {
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(process.env.PERSONS_PRODUCTION_SCREENSHOT, Buffer.from(screenshot.data, 'base64'))
      }
      await evaluate(`document.querySelector('${persons} button[aria-label="تنظیمات فرم"]').click()`)
      await until(`!!document.querySelector('${persons} .operational-settings-tools')&&!document.querySelector('${persons} .shortcut-settings [aria-expanded="true"]')`, 'Persons production appearance settings')
      await evaluate(`[...document.querySelectorAll('${persons} .operational-settings-header-actions button')].find(button=>button.textContent==='خروج بدون ذخیره').click()`)
      for (const width of [760, 480]) {
        await send('Emulation.setDeviceMetricsOverride', { ...golden.capture, width, height: 800 })
        const available = await evaluate(`(async () => {
          await new Promise(requestAnimationFrame);
          const p = document.querySelector('${persons}');
          const fields = p.querySelector('.person-form-grid');
          const code = fields.querySelector('[data-field=personCode]');
          const toolbar = p.querySelector('.grid-toolbar');
          const footer = p.querySelector('.shortcut-bar');
          return {
            columns: getComputedStyle(fields).gridTemplateColumns.split(' ').length,
            codeUsable: code.getBoundingClientRect().width > 80,
            actionsContained: toolbar.scrollWidth <= toolbar.clientWidth,
            footerReachable: (() => { footer.scrollIntoView({ block: 'end' }); return footer.getBoundingClientRect().top < innerHeight; })()
          };
        })()`)
        assert.deepEqual(available, { columns: width <= 520 ? 1 : 2, codeUsable:true, actionsContained:true, footerReachable:true }, `Persons responsive layout at ${width}px`)
      }
      await send('Emulation.setDeviceMetricsOverride', golden.capture)
    }
    if (moduleName === 'BusinessContractPage') {
      const create = "document.querySelector('.form-tab-pane.active [data-create-action=true]')"
      const save = "document.querySelector('.form-tab-pane.active [data-save-action=true]')"
      await until(`!!${create}`, 'Missing contract offers Create')
      await evaluate(`${create}.click()`)
      await until(`!!${save} && !${create}`, 'New contract offers Save')
      await evaluate(`${save}.nextElementSibling.click()`)
      await until(`!!${create} && !${save}`, 'Cancel discards draft and retains contract tab')
    }
  }
  console.log('PASS all remaining page modules load when selected')
  assert.deepEqual(errors, [], 'browser must not report uncaught exceptions')
  console.log('PASS direct form address opens the requested laboratory form')
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({id: ++sequence, method:'Browser.close'}))
  else browser.kill()
  await new Promise(resolveExit => { if (browser.exitCode !== null) resolveExit(); else { browser.once('exit', resolveExit); setTimeout(resolveExit, 5000) } })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
