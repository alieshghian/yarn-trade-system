import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installFormInteraction } from './formInteraction.ts'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const persian = moduleUrl(readFileSync(new URL('./persianDate.ts', import.meta.url), 'utf8'))
const calendar = await import(moduleUrl(readFileSync(new URL('./dateCalendar.ts', import.meta.url), 'utf8').replace("'./persianDate'", JSON.stringify(persian))))

test('Jalali short years and leading zeros preserve the requested dates; invalid dates fail', () => {
  assert.equal(calendar.expandShortYear('05', 'persian'), 1405)
  assert.equal(calendar.expandShortYear('95', 'persian'), 1395)
  assert.equal(calendar.calendarPartsToIso({year:1405,month:7,day:1}, 'persian'), '2026-09-23')
  assert.equal(calendar.calendarPartsToIso({year:1395,month:7,day:1}, 'persian'), '2016-09-22')
  assert.equal(calendar.calendarPartsToIso({year:1405,month:12,day:31}, 'persian'), null)
})
test('English and Chinese Gregorian dates render with the existing full-year convention', () => {
  assert.equal(calendar.expandShortYear('2026','gregorian'), 2026)
  assert.equal(calendar.calendarPartsToIso({year:2026,month:2,day:30},'gregorian'), null)
  for (const lang of ['en','zh']) assert.ok(calendar.fullDateLabel('2026-01-01','gregorian',lang).includes('2026'))
})

test('F3 invokes the visible enabled save, and never an amendment or hidden/disabled action', () => {
  let handler, clicks = 0
  const root = { addEventListener: (name, fn, capture) => { if (name === 'keydown' && capture) handler = fn }, removeEventListener() {}, querySelector: () => ({ querySelectorAll: () => buttons }) }
  const button = (text, disabled = false, visible = true) => ({ textContent: text, disabled, dataset: {}, getClientRects: () => visible ? [1] : [], click: () => clicks++ })
  let buttons = [button('Save F3')]
  const cleanup = installFormInteraction(root)
  const press = () => handler({ key: 'F3', preventDefault() {}, stopImmediatePropagation() {} })
  buttons[0].click(); assert.equal(clicks, 1)
  press(); assert.equal(clicks, 2)
  buttons = [button('Edit'), button('Save F3', true)]; press(); assert.equal(clicks, 2)
  buttons = [button('Create Amendment'), button('Save F3', false, false)]; press(); assert.equal(clicks, 2)
  const closed = button('Save F3'); closed.closest = selector => selector === 'details:not([open])' ? {} : null
  buttons = [closed]; press(); assert.equal(clicks, 2)
  buttons = []; press(); assert.equal(clicks, 2)
  cleanup()
})

test('F3 saves the focused nested editor and otherwise only the main form', () => {
  const previous = globalThis.HTMLElement
  let handler, mainClicks=0, nestedClicks=0
  const nested = {querySelectorAll:()=>[nestedButton]}
  const nestedButton = {disabled:false,dataset:{saveAction:'true'},getClientRects:()=>[1],closest:s=>s==='[data-form-scope]' ? nested : null,click:()=>nestedClicks++}
  const mainButton = {disabled:false,dataset:{saveAction:'true'},getClientRects:()=>[1],closest:()=>null,click:()=>mainClicks++}
  class Element { closest(){return nested} }
  globalThis.HTMLElement=Element
  try {
    const pane={querySelectorAll:()=>[nestedButton,mainButton],contains:()=>true}
    const root={addEventListener:(name,fn,capture)=>{if(name==='keydown'&&capture)handler=fn},removeEventListener(){},querySelector:()=>pane}
    const cleanup=installFormInteraction(root)
    const press=target=>handler({key:'F3',target,preventDefault(){},stopImmediatePropagation(){}})
    press(undefined); assert.equal(mainClicks,1); assert.equal(nestedClicks,0)
    press(new Element()); assert.equal(mainClicks,1); assert.equal(nestedClicks,1)
    cleanup()
  } finally { previous===undefined ? delete globalThis.HTMLElement : globalThis.HTMLElement=previous }
})

for (const direction of ['rtl','ltr']) test(`Shared ${direction} navigation preserves validation, skips unavailable fields and respects caret/select keys`, () => {
  const names = ['HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','getComputedStyle']
  const previous = names.map(name => globalThis[name])
  let root, pane
  class Element {
    closest(selector) { return selector === '.form-tab-pane.active' ? pane : null }
    getClientRects() { return this.hidden ? [] : [1] }
    checkValidity() { return this.valid !== false }
    reportValidity() { this.reported = true }
    focus() { root.activeElement = this; listeners.get('focusin:false')({target:this}) }
  }
  class Input extends Element {
    type = 'text'; value = 'Filled'; disabled = false; readOnly = false; selectionStart = 0; selectionEnd = 0
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length }
  }
  class Textarea extends Input {}
  class Select extends Element { type = 'select-one'; disabled = false }
  const listeners = new Map()
  globalThis.HTMLElement = Element; globalThis.HTMLInputElement = Input; globalThis.HTMLTextAreaElement = Textarea; globalThis.HTMLSelectElement = Select
  globalThis.getComputedStyle = () => ({direction})
  try {
    const first = new Input(), hidden = new Input(), disabled = new Input(), readonly = new Input(), numeric = new Input(), select = new Select()
    hidden.hidden = true; disabled.disabled = true; readonly.readOnly = true; numeric.type = 'number'; numeric.value = '123'
    pane = { querySelectorAll: () => [first,hidden,disabled,readonly,numeric,select] }
    root = { activeElement:null, addEventListener:(name,fn,capture=false)=>listeners.set(`${name}:${capture}`,fn), removeEventListener(){}, querySelector:()=>pane }
    const cleanup = installFormInteraction(root)
    const press = (key, defaultPrevented=false) => {
      const event = {key,target:root.activeElement,defaultPrevented,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){}}
      listeners.get('keydown:false')(event); return event
    }
    first.focus(); assert.deepEqual([first.selectionStart,first.selectionEnd],[0,6])
    first.valid = false; press('Enter'); assert.equal(root.activeElement,first); assert.equal(first.reported,true)
    first.valid = true; press('Enter',true); assert.equal(root.activeElement,first)
    press('Enter'); assert.equal(root.activeElement,numeric)
    press(direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'); assert.equal(root.activeElement,first)
    // Click within an already-focused field to position the caret: horizontal arrows stay native.
    listeners.get('pointerdown:true')({target:first}); first.selectionStart=first.selectionEnd=2
    assert.equal(press('ArrowRight').defaultPrevented,false); assert.equal(root.activeElement,first)
    numeric.focus(); press('Enter'); assert.equal(root.activeElement,select)
    assert.equal(press('ArrowDown').defaultPrevented,false); assert.equal(press('ArrowUp').defaultPrevented,false)
    first.focus(); assert.deepEqual([first.selectionStart,first.selectionEnd],[0,6])
    cleanup()
  } finally { names.forEach((name,i)=>previous[i]===undefined ? delete globalThis[name] : globalThis[name]=previous[i]) }
})
