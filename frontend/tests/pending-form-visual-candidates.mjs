import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = process.env.FORM_VISUAL_CANDIDATE_DIR
const status = 'PENDING OWNER VISUAL APPROVAL'
const viewport = {width:1600,height:1000,deviceScaleFactor:1,mobile:false}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function captureVisualCandidate({send,evaluate}, id, root, reference) {
  if (!output) return
  await mkdir(output,{recursive:true})
  await send('Emulation.setDeviceMetricsOverride',viewport)
  try {
    await evaluate("document.activeElement?.blur();window.scrollTo(0,0);document.querySelectorAll('.base-grid-table-wrap,.contract-scroll-content,.person-table-wrap').forEach(e=>e.scrollTop=0)")
    const settled = "document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))))"
    const capture = async () => {
      await evaluate(settled)
      const {data} = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
      return Buffer.from(data,'base64')
    }
    const first = await capture()
    const second = await capture()
    assert.equal(digest(first),digest(second),'Candidate stabilizes on successive paints: '+id)
    const geometry = await evaluate('('+measure.toString()+')('+JSON.stringify(root)+')')
    assert.ok(geometry.fields.length || geometry.headers.length,'Candidate includes actual rendered controls: '+id)
    const file = 'pending-'+id+'.png'
    await writeFile(resolve(output,file),first)
    const browser = (await send('Browser.getVersion',{},true)).product
    await writeFile(resolve(output,'pending-'+id+'.json'),JSON.stringify({status,file,sha256:digest(first),viewport,browser,reference,geometry},null,2)+'\n')
    console.log('PENDING OWNER VISUAL APPROVAL '+id+' '+digest(first))
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }
}

function measure(selector) {
  const root = document.querySelector(selector), origin = root.getBoundingClientRect()
  const rect = element => {
    const r=element.getBoundingClientRect()
    return [r.x-origin.x,r.y-origin.y,r.width,r.height].map(value=>Number(value.toFixed(2)))
  }
  const visible = selector => Array.from(root.querySelectorAll(selector)).filter(element=>element.getClientRects().length)
  const title = element => (element.getAttribute('aria-label') || element.textContent || '').trim()
  return {
    fixture:location.pathname + location.search,
    direction:getComputedStyle(root).direction,
    frame:rect(root),
    fields:visible('input:not([type=hidden]),textarea,select').filter(e=>!e.closest('thead')).map(e=>({id:e.dataset.field||e.closest('[data-field-id]')?.dataset.fieldId||e.name||e.type,rect:rect(e),font:getComputedStyle(e).fontFamily})),
    labels:visible('.designer-label-part,.contract-field > span,.person-form-grid label > span,.zone-fields label > span').map(e=>({title:title(e),rect:rect(e)})),
    headers:visible('thead th').map(e=>({title:title(e),rect:rect(e)})),
    footer:visible('footer,.laboratory-footer,.shortcut-bar').filter(e=>!e.closest('.base-grid-table')).map(rect),
  }
}
