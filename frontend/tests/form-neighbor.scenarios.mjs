import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Runs inside the existing disposable Designer browser, never operational storage. */
export async function runNeighborScenarios({evaluate,reloadPage,until,click,clickExpression,inputValue,drag,check,send,pause,navigatePage,base,onlyGroupDrag=false,onlyLegacy=false}) {
 await pause(250) // Capture the preceding UI operation after the recovery debounce.
 const original=await evaluate(`Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]))`)
 const restore=async()=>{await navigatePage({url:base+'/tests/form-storage.fixture.html'});await evaluate(`(()=>{const original=${JSON.stringify(original)};for(const key of Object.keys(localStorage))if(!(key in original))localStorage.removeItem(key);for(const [key,value] of Object.entries(original))localStorage.setItem(key,value)})()`);await navigatePage({url:base+'/tests/form-designer.html'});await until(`!!document.querySelector('[data-field-id="personCode"]')`)}
 const codeLabel=await evaluate(`(async()=>{const {readFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');const j=readFormRecovery(localStorage,'isolated-browser-regression');return j.documents[j.activeFormId].current.form.schema.fields.find(f=>f.id==='personCode').label.fa})()`)
 const seed=async(kind)=>{
  await navigatePage({url:base+'/tests/form-storage.fixture.html'});await evaluate(`(async()=>{
   const {readFormRecovery,writeFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');const {designerHistoryReducer}=await import('/src/components/base-form/designer.ts');const {addDocumentColumn,updateDocumentColumn}=await import('/src/components/base-form/formTableStructure.ts');const {addTableHeaderRow,addDocumentField}=await import('/src/components/base-form/formDocumentControls.ts');
   const journal=readFormRecovery(localStorage,'isolated-browser-regression'),snapshot=journal.documents[journal.activeFormId].current;let schema=snapshot.form.schema,draft=snapshot.designerHistory.present;
   if(${JSON.stringify(kind)}==='label'){
    // The complete browser suite may already have a Notes-owned column. This
    // isolated legacy fixture needs exactly one owner, regardless of earlier cases.
    schema={...schema,tables:schema.tables.map((table,index)=>index===0?{...table,columns:table.columns.filter(column=>!(column.binding.kind==='formField'&&column.binding.fieldId==='notes')&&column.id!=='notes.owned').map(column=>column.sourceFieldIds?.includes('notes')?{...column,sourceFieldIds:column.sourceFieldIds.filter(id=>id!=='notes')}:column)}:table)};
    schema=addDocumentColumn(schema,schema.tables[0].id,'notes.owned','توضیحات','text','notes');
    // Deliberately seed a legacy invalid relationship. Current editing APIs correctly reject it.
    schema={...schema,tables:schema.tables.map((table,index)=>index===0?{...table,columns:table.columns.map(column=>column.id==='personCode'?{...column,sourceFieldIds:['personCode','notes'],sourceLinkIntent:undefined,valueComposition:undefined,valueSeparator:undefined,labelSyncDecision:'primary-field',labelSyncFieldId:'personCode'}:column)}:table)};
   }else{
    schema={...schema,fields:schema.fields.filter(field=>['personCode','firstName','notes','titleId'].includes(field.id))};
    if (${JSON.stringify(kind)} === 'group-drag') {
      // The four-field fixture also needs four valid report bindings to exercise Save.
      schema = {...schema, fields: schema.fields.map(field => ({...field, columnLinks: []})),
        tables: schema.tables.map(table => ({...table, columns: []}))}
      for (const field of schema.fields) schema = addDocumentColumn(schema, schema.tables[0].id, field.id, field.label.fa, 'text', field.id)
    }
    schema=addTableHeaderRow(schema,schema.tables[0].id,'paired.header');
    for(const id of ['header.a','header.b','header.c','header.d'])schema=addDocumentField(schema,'paired.header',id,id,{kind:'text',componentId:'definition.field',valueType:'text'});
    const field=(left,top,width,height)=>({input:{left,top,width,height},label:{left:left+width-65,top:top-25,width:65,height:18},select:{left:left+4,top:top-25,width:19,height:18}});
    const make=(ids)=>{const canvas={width:900,height:420,fields:{[ids[0]]:field(100,70,220,80),[ids[1]]:field(350,70,220,80),[ids[2]]:field(100,230,220,100),[ids[3]]:field(350,230,220,100)}};canvas.fields[ids[0]].select.left=-75;return canvas};
    const overrides={...draft.overrides};for(const [id,field] of Object.entries({...make(['personCode','firstName','notes','titleId']).fields,...make(['header.a','header.b','header.c','header.d']).fields}))overrides[id+'::input']={...overrides[id+'::input'],width:field.input.width,height:field.input.height};
    draft={...draft,overrides,neighborResize:{horizontal:false,vertical:false},layoutMode:'canvas',canvas:make(['personCode','firstName','notes','titleId']),sectionCanvases:{...draft.sectionCanvases,[schema.fields.find(field=>field.id==='personCode').sectionId]:make(['personCode','firstName','notes','titleId']),'paired.header':make(['header.a','header.b','header.c','header.d'])}};
    if(${JSON.stringify(kind)}==='legacy'){
     const legacy=c=>({...c,width:2200,fields:Object.fromEntries(Object.entries(c.fields).map(([id,field])=>[id,Object.fromEntries(Object.entries(field).map(([part,r])=>[part,{...r,left:r.left+1380}]))]))});
     const main=schema.fields.find(field=>field.id==='personCode').sectionId;
     draft={...draft,canvas:legacy(draft.canvas),sectionCanvases:{...draft.sectionCanvases,[main]:legacy(draft.sectionCanvases[main])}};
    }
    if(${JSON.stringify(kind)}==='rename'){
     schema=updateDocumentColumn(schema,schema.tables[0].id,'displayName',{sourceFieldIds:['firstName'],sourceLinkIntent:'single',labelSyncDecision:'primary-field',labelSyncFieldId:'firstName'});
     const narrow=canvas=>({...canvas,fields:{...canvas.fields,firstName:{...canvas.fields.firstName,label:{...canvas.fields.firstName.label,left:555,width:15}}}});
     draft={...draft,canvas:narrow(draft.canvas),sectionCanvases:{...draft.sectionCanvases,[schema.fields.find(field=>field.id==='firstName').sectionId]:narrow(draft.sectionCanvases[schema.fields.find(field=>field.id==='firstName').sectionId])}};
    }
   }
   const history=designerHistoryReducer(snapshot.designerHistory,{type:'change',draft,schema});if(!writeFormRecovery(localStorage,'isolated-browser-regression',{form:{...snapshot.form,schema},designerHistory:history,structureHistory:{present:schema,past:history.document.past,future:history.document.future}},'Isolated neighbour regression'))throw Error('Could not seed test draft');
  })()`)
  await navigatePage({url:base+'/tests/form-designer.html'});await until(`!!document.querySelector('[data-field-id="notes"] .designer-label-part')`)
 }
 const verifyGroupDrag=async()=>{
  const selectInput=id=>`document.querySelector('[data-field-id="${id}"] .designer-input-part')`
  for(const id of ['personCode','firstName','notes'])await clickExpression(selectInput(id),'left',2)
  await check('three field inputs can be selected together',`document.querySelectorAll('.designer-input-part.designer-part-selected').length===3`)
  await clickExpression(selectInput('firstName'))
  await check('clicking a selected field again clears the whole selection without moving fields',`!document.querySelector('.designer-part-selected,.designer-edge-handle')`)
  for(const id of ['personCode','firstName','notes'])await clickExpression(selectInput(id),'left',2)
  await clickExpression(`(${selectInput('personCode')}).closest('.laboratory-editor')`)
  await check('blank panel space outside the short Canvas clears all field selections',`!document.querySelector('.designer-part-selected,.designer-edge-handle')`)
  await clickExpression(selectInput('firstName'),'left',2);await clickExpression(selectInput('notes'),'left',2)
  const ids = ['firstName', 'notes', 'personCode', 'titleId']
  const selectedIds = ids.slice(0, 2)
  const coordinates = () => evaluate(`(${JSON.stringify(ids)}).map(id => {
    const field = document.querySelector('[data-field-id="' + id + '"] .designer-input-part')
    const grid = field.closest('.laboratory-form-grid')
    const rect = field.getBoundingClientRect(), canvas = grid.getBoundingClientRect()
    // Reload can recenter the cropped view. Convert its CSS coordinates back to design coordinates.
    const shift = Number(grid.dataset.canvasViewShift ?? 0), origin = Number(grid.dataset.canvasCoordinateOrigin ?? 0)
    return { id, x: rect.left - canvas.left - shift + origin, y: rect.top - canvas.top, width: rect.width, height: rect.height }
  })`)
  const reveal = async () => {
    const point = await evaluate(`(async () => {
      const target = ${selectInput('firstName')}
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = target.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      return { x, y, hit: target.contains(document.elementFromPoint(x, y)), zoom: visualViewport.scale }
    })()`)
    assert.equal(point.zoom, 1, 'Use normal application zoom')
    assert.ok(point.hit, 'Drag start must hit the selected field: ' + JSON.stringify(point))
    await check('both intended fields remain selected after scrolling', `JSON.stringify([...document.querySelectorAll('.designer-input-part.designer-part-selected')].map(e => e.closest('[data-field-id]').dataset.fieldId).sort()) === '${JSON.stringify([...selectedIds].sort())}'`)
  }
  const screenshot = async name => {
    if (!onlyGroupDrag || !process.env.FORM_TEST_GROUP_DRAG_SCREENSHOTS) return
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.FORM_TEST_GROUP_DRAG_SCREENSHOTS, name + '.png'), Buffer.from(data, 'base64'))
  }
  await reveal()
  const before = await coordinates()
  const moved = before.map(rect => selectedIds.includes(rect.id) ? { ...rect, x: rect.x + 10, y: rect.y + 6 } : rect)
  await screenshot('before')
  await drag(selectInput('firstName'), 10, 6, false, async () => {
    await pause(50)
    assert.deepEqual(await coordinates(), moved, 'Live mouse drag translates only the two selected inputs')
  })
  assert.deepEqual(await coordinates(), moved, 'Mouse release commits group placement and preserves size and spacing')
  await screenshot('after')
  await click('واگرد','.form-laboratory-banner button')
  assert.deepEqual(await coordinates(), before, 'One Undo restores both inputs and leaves their peers fixed')

  if (onlyGroupDrag) {
    // Redo the real drag through history and persist it through the normal Save dialog.
    await click('ازنو','.form-laboratory-banner button')
    assert.deepEqual(await coordinates(), moved)
    await click('ذخیرهٔ فرم','.form-laboratory-banner button')
    await click('تأیید مجوزها و ذخیره','[role=dialog] button')
    await until(`!document.querySelector('[role=dialog]') && window.testServerBackupVersions.some(item => item.reason === 'ذخیرهٔ فرم')`)
    const saved = await evaluate(`(() => {
      const snapshot = window.testServerBackupVersions.findLast(item => item.reason === 'ذخیرهٔ فرم').document.snapshot
      const section = snapshot.form.schema.fields.find(field => field.id === 'firstName').sectionId
      return snapshot.designerHistory.present.sectionCanvases[section].fields
    })()`)
    for (const rect of moved) {
      const input = saved[rect.id].input
      assert.deepEqual(input, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }, rect.id + ' saved rectangle')
    }
    await reloadPage()
    await until(`!!(${selectInput('notes')})`)
    assert.deepEqual(await coordinates(), moved, 'Reload restores the saved coordinates of the group and its peers')
    console.log('PASS real group drag, stationary peers, Undo, Redo, Save and reload')
  }
  await clickExpression(`(${selectInput('personCode')}).closest('.laboratory-editor')`)
 }
 try {
  if(onlyGroupDrag){await seed('group-drag');await verifyGroupDrag();return}
  if(onlyLegacy){
   await seed('legacy')
   const target=`document.querySelector('[data-field-id="firstName"] .designer-input-part')`,peer=`document.querySelector('[data-field-id="personCode"] .designer-input-part')`
   await clickExpression(target)
   const boxes=()=>evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}};return {target:box(${target}),peer:box(${peer})}})()`)
   const before=await boxes();await drag(target,20,12,false);const after=await boxes()
   assert.ok(Math.abs(after.target.left-before.target.left-20)<.1&&Math.abs(after.target.top-before.target.top-12)<.1,'cropped legacy Canvas preserves the actual 20px/12px manual move '+JSON.stringify({before,after}))
   assert.deepEqual(after.peer,before.peer,'cropped legacy Canvas keeps every unselected peer fixed')
   console.log('PASS cropped legacy Canvas uses its complete rendered origin for manual movement without changing peers')
   return
  }
  await seed('label')
  await clickExpression(`document.querySelector('[data-field-id="notes"] .designer-label-part')`,'right');await click('ویرایش متن برچسب…','[role="menu"] button')
  await inputValue(`document.querySelector('input[aria-label="متن برچسب یا سرستون"]')`,'توضیحات برند');await click('ثبت متن','.form-document-dialog button')
  await check('legacy extra links produce one owned-column question without checkboxes or manual deletions',`document.querySelectorAll('.label-sync-proposal').length===1&&!document.querySelector('.label-sync-proposals input')&&!document.querySelector('.label-sync-proposals').textContent.includes('حذف این ارتباط')&&document.querySelector('.label-sync-proposals').textContent.includes('عنوان فعلی: توضیحات')`)
  await click('بله، تغییر کند','.form-document-dialog button')
  await until(`document.querySelector('[data-field-id="notes"] .designer-label-part').textContent.includes('توضیحات برند')`)
  await pause(250) // Recovery writes intentionally debounce by 180ms.
  await check('one confirmation renames Notes and repairs the extra source while preserving Brand Code',`(async()=>{const {readFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');const j=readFormRecovery(localStorage,'isolated-browser-regression'),s=j.documents[j.activeFormId].current.form.schema;return s.tables[0].columns.find(c=>c.id==='personCode').sourceFieldIds.join(',')==='personCode'&&s.tables[0].columns.find(c=>c.id==='notes.owned').label.fa==='توضیحات برند'&&s.fields.find(f=>f.id==='notes').label.fa==='توضیحات برند'&&s.fields.find(f=>f.id==='personCode').label.fa===${JSON.stringify(codeLabel)}})()`)
  await click('واگرد','.form-laboratory-banner button')
  await until(`!document.querySelector('[data-field-id="notes"] .designer-label-part').textContent.includes('توضیحات برند')`)
  await pause(250)
  await check('one Undo restores both the rename and repaired relationship',`(async()=>{const {readFormRecovery}=await import('/src/components/base-form/formDocumentRecovery.ts');const j=readFormRecovery(localStorage,'isolated-browser-regression'),s=j.documents[j.activeFormId].current.form.schema;return s.tables[0].columns.find(c=>c.id==='personCode').sourceFieldIds.includes('notes')&&s.fields.find(f=>f.id==='notes').label.fa==='توضیحات'})()`)
  await restore();await seed('rename')
  const nameLabel=`document.querySelector('[data-field-id="firstName"] .designer-label-part')`
  const readableName=`(()=>{const label=${nameLabel},range=document.createRange();range.selectNodeContents(label.firstChild);const lines=[...range.getClientRects()],text=range.getBoundingClientRect(),input=label.closest('[data-field-id]').querySelector('.designer-input-part').getBoundingClientRect();return label.firstChild.textContent==='نام برندها'&&lines.length===1&&text.width>label.getBoundingClientRect().width&&text.right<=input.right+1&&text.bottom<=input.top+1&&document.querySelector('th[data-column="displayName"]').textContent.includes('نام برندها')})()`
  await clickExpression(nameLabel,'right');await click('ویرایش متن برچسب…','[role="menu"] button')
  await inputValue(`document.querySelector('input[aria-label="متن برچسب یا سرستون"]')`,'نام برندها');await click('ثبت متن','.form-document-dialog button');await click('بله، تغییر کند','.form-document-dialog button')
  await check('renamed field text and linked header remain readable above the input despite an old fifteen-pixel label box',readableName)
  await check('the old wrapping behavior reproduces hidden label lines',`(()=>{const label=${nameLabel};label.style.whiteSpace='normal';const range=document.createRange();range.selectNodeContents(label.firstChild);const broken=range.getClientRects().length>1;label.style.removeProperty('white-space');return broken})()`)
  await pause(250);await reloadPage();await until(`!!${nameLabel}`)
  await check('complete renamed label and matching header survive reload without vertical wrapping',readableName)
  await click('واگرد','.form-laboratory-banner button')
  await check('one Undo restores both field and header names after the long-label rename',`!(${nameLabel}).firstChild.textContent.includes('نام برندها')&&!document.querySelector('th[data-column="displayName"]').textContent.includes('نام برندها')`)
  await restore();await seed('resize')
  await verifyGroupDrag()
  await clickExpression(`document.querySelector('[data-field-id="firstName"] .designer-input-part')`,'right')
  await check('field context exposes its text, appearance, layout and additional option groups',`(()=>{const groups=new Set([...document.querySelectorAll('.designer-context-menu:not(.designer-context-submenu)>button[data-grid-submenu]')].map(button=>button.dataset.gridSubmenu));return ['text','appearance','layout','more'].every(id=>groups.has(id))})()`)
  await click('اندازه و چیدمان','[role="menu"] button')
  await check('Persian flyout and chevron point left and stay within the viewport',`(()=>{const p=document.querySelector('.designer-context-menu:not(.designer-context-submenu)').getBoundingClientRect(),s=document.querySelector('.designer-context-submenu').getBoundingClientRect(),a=document.querySelector('[data-grid-submenu="layout"] .designer-submenu-arrow');return getComputedStyle(a).transform.startsWith('matrix(-')&&s.left>=0&&s.right<=innerWidth&&s.bottom<=innerHeight&&(p.left<s.width+16||s.right<=p.left)})()`)
  await click('تغییر عرض با حفظ فاصله و عرض مجموع','[role="menu"] button');await click('تغییر ارتفاع با حفظ فاصله و ارتفاع مجموع','[role="menu"] button')
  await check('context spacing toggles share the sidebar state on both axes',`document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]').checked&&document.querySelector('[aria-label="حفظ فاصله و ارتفاع مجموع"]').checked&&document.querySelectorAll('.designer-context-submenu [aria-checked="true"]').length===2`)
  const rect=id=>`document.querySelector('[data-field-id="${id}"] .designer-input-part')`
  const box=async id=>evaluate(`(()=>{const r=(${rect(id)}).getBoundingClientRect();const o=(${rect(id)}).closest('.laboratory-form-grid').getBoundingClientRect();return {x:r.x-o.x,y:r.y-o.y,w:r.width,h:r.height}})()`)
  const choose=async id=>{const selected=await evaluate(`({count:document.querySelectorAll('.designer-input-part.designer-part-selected').length,target:(${rect(id)}).classList.contains('designer-part-selected')})`);if(!selected.target||selected.count!==1){await click('پاک‌کردن انتخاب','.designer-selection-actions button');await clickExpression(rect(id))}await until(`document.querySelector('#designer-width')&&!document.querySelector('#designer-width').disabled`)}
  const undo=()=>click('واگرد','.form-laboratory-banner button')
  const dimensions=async(id,property,value)=>{await choose(id);await inputValue(`document.querySelector('#designer-${property}')`,value);await evaluate(`document.querySelector('#designer-${property}').blur()`);await pause(300)}
  for(const [a,b,c,d,host] of [['personCode','firstName','notes','titleId','main'],['header.a','header.b','header.c','header.d','header']]){
   await choose(a)
   await check(host+' old displaced selection button follows the visible field label without changing saved geometry',`(()=>{const input=(${rect(a)}).getBoundingClientRect(),button=document.querySelector('[data-field-id="${a}"] .laboratory-field-select').getBoundingClientRect(),editor=(${rect(a)}).closest('.laboratory-editor');const label=document.querySelector('[data-field-id="${a}"] .designer-label-part').getBoundingClientRect();return Math.abs(button.left-Math.min(input.left,label.left))<1&&Math.abs(button.top-label.top)<1&&editor.scrollWidth<=editor.clientWidth+1})()`)
   const before=await box(a),neighbor=await box(b),unrelated=await box(d)
   await dimensions(a,'width',before.w+30)
   const after=await box(a),other=await box(b)
   assert.ok(Math.abs(after.w-before.w-30)<1&&Math.abs(other.w-neighbor.w+30)<1,host+' numeric horizontal compensation')
   await check(host+' numeric width preserves the physical gap and outer span',`(()=>{const a=(${rect(a)}).getBoundingClientRect(),b=(${rect(b)}).getBoundingClientRect();return Math.abs((b.left-a.right)-${neighbor.x-before.x-before.w})<1&&Math.abs(b.right-(${rect(b)}).closest('.laboratory-form-grid').getBoundingClientRect().left-${neighbor.x+neighbor.w})<1})()`)
   assert.deepEqual(await box(d),unrelated)
   await check(host+' actual nested inputs match the paired widths',`['${a}','${b}'].every(id=>{const e=document.querySelector('[data-field-id="'+id+'"] .designer-input-part'),input=e.querySelector('input');return Math.abs(input.getBoundingClientRect().width-e.getBoundingClientRect().width)<2})`)
   await undo();assert.deepEqual(await box(a),before);assert.deepEqual(await box(b),neighbor)
   await choose(a)
   const low=await box(c)
   await drag(`document.querySelector('[data-field-id="${a}"] .designer-edge-bottom')`,0,20,false)
   const tall=await box(a),short=await box(c)
   assert.ok(Math.abs(tall.h-before.h-20)<1&&Math.abs(short.h-low.h+20)<1,host+' pointer vertical compensation')
   await check(host+' pointer height preserves the vertical gap and bottom outer edge',`(()=>{const a=(${rect(a)}).getBoundingClientRect(),b=(${rect(c)}).getBoundingClientRect();return Math.abs((b.top-a.bottom)-${low.y-before.y-before.h})<1&&Math.abs(b.bottom-(${rect(c)}).closest('.laboratory-form-grid').getBoundingClientRect().top-${low.y+low.h})<1})()`)
   await check(host+' actual nested inputs match the paired heights',`['${a}','${c}'].every(id=>{const e=document.querySelector('[data-field-id="'+id+'"] .designer-input-part');return Math.abs(e.querySelector('input').getBoundingClientRect().height-e.getBoundingClientRect().height)<2})`)
   await undo();assert.deepEqual(await box(c),low)
   await dimensions(a,'height',before.h+15);assert.ok(Math.abs((await box(c)).h-low.h+15)<1);await undo()
   await choose(a);await drag(`document.querySelector('[data-field-id="${a}"] .designer-edge-right')`,25,0,false)
   assert.ok(Math.abs((await box(b)).w-neighbor.w+25)<1,host+' pointer horizontal compensation');await undo()
   await choose(b);await drag(`document.querySelector('[data-field-id="${b}"] .designer-edge-left')`,20,0,false)
   assert.ok(Math.abs((await box(a)).w-before.w-20)<1&&Math.abs((await box(b)).w-neighbor.w+20)<1,host+' physical left edge compensation');await undo()
   await choose(b);await drag(`document.querySelector('[data-field-id="${b}"] .designer-edge-left')`,-150,0,false)
   await check(host+' shrinking neighbour keeps its selection button on the label row without horizontal overflow',`(()=>{const input=(${rect(a)}).getBoundingClientRect(),button=document.querySelector('[data-field-id="${a}"] .laboratory-field-select').getBoundingClientRect(),editor=(${rect(a)}).closest('.laboratory-editor');const label=document.querySelector('[data-field-id="${a}"] .designer-label-part').getBoundingClientRect();return Math.abs(button.left-Math.min(input.left,label.left))<1&&Math.abs(button.top-label.top)<1&&editor.scrollWidth<=editor.clientWidth+1})()`)
   await undo()
   await choose(c);await drag(`document.querySelector('[data-field-id="${c}"] .designer-edge-top')`,0,10,false)
   assert.ok(Math.abs((await box(a)).h-before.h-10)<1&&Math.abs((await box(c)).h-low.h+10)<1,host+' physical top edge compensation');await undo()
   await choose(a);await drag(`document.querySelector('[data-field-id="${a}"] .designer-edge-bottom-right')`,15,10,false)
   assert.ok(Math.abs((await box(b)).w-neighbor.w+15)<1&&Math.abs((await box(c)).h-low.h+10)<1,host+' corner compensation on both axes')
   assert.deepEqual(await box(d),unrelated);await undo()
   await dimensions(a,'width',999)
   assert.ok((await box(b)).w>=48&&Math.abs((await box(a)).w+(await box(b)).w-before.w-neighbor.w)<1,host+' minimum and total width clamp');await undo()
   // Arrow operation on the actual resize handle, including its neighbour.
   await clickExpression(`document.querySelector('[data-field-id="${a}"] .designer-edge-bottom')`)
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
   assert.ok(Math.abs((await box(c)).h-low.h+1)<1,host+' keyboard vertical compensation');await undo()
  }
  await choose('personCode');await dimensions('personCode','width',250)
  await reloadPage();await until(`!!document.querySelector('[data-field-id="header.a"]')`)
  await check('both axis preferences and paired rectangles survive reload across main and header hosts',`document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]').checked&&document.querySelector('[aria-label="حفظ فاصله و ارتفاع مجموع"]').checked&&Math.abs((${rect('personCode')}).getBoundingClientRect().width-250)<1&&Math.abs((${rect('firstName')}).getBoundingClientRect().width-190)<1`)
  await undo();assert.ok(Math.abs((await box('personCode')).w-220)<1)
  await clickExpression(rect('personCode'),'right');await click('وسط‌کردن همهٔ ردیف‌های پنل','[role="menu"] button')
  const centered=()=>`(()=>{const a=(${rect('personCode')}).getBoundingClientRect(),b=(${rect('firstName')}).getBoundingClientRect(),e=(${rect('personCode')}).closest('.laboratory-editor'),left=e.getBoundingClientRect().left+e.clientLeft,right=left+e.clientWidth;return Math.abs(Math.min(a.left,b.left)-left-(right-Math.max(a.right,b.right)))<2})()`
  await check('center command equalizes physical panel margins without resizing inputs',centered())
  assert.ok(Math.abs((await box('personCode')).w-220)<1)
  await dimensions('personCode','width',245)
  await check('paired resizing preserves centered row margins',centered())
  await reloadPage();await until(`!!document.querySelector('[data-field-id="header.a"]')`)
  await check('centering is retained after reload',centered())
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1300,deviceScaleFactor:1,mobile:false});await pause(200)
  await until(centered(),'centered rows settle after editor viewport resize')
  await check('centered rows remain centered when available editor width changes',centered())
  await send('Emulation.clearDeviceMetricsOverride');await pause(200)
  await navigatePage({url:base+'/tests/form-designer.html?language=en'});await until(`!!document.querySelector('[data-field-id="firstName"]')`)
  await clickExpression(rect('firstName'),'right');await click('Size and layout','[role="menu"] button')
  await check('English menu chevron points right and flyout prefers the right side',`(()=>{const p=document.querySelector('.designer-context-menu:not(.designer-context-submenu)').getBoundingClientRect(),s=document.querySelector('.designer-context-submenu').getBoundingClientRect(),a=document.querySelector('[data-grid-submenu="layout"] .designer-submenu-arrow');return document.querySelector('.designer-context-submenu').dir==='ltr'&&getComputedStyle(a).transform.startsWith('matrix(0.707')&&s.left>=0&&s.right<=innerWidth&&s.bottom<=innerHeight&&(p.right+s.width+16>innerWidth||s.left>=p.right)})()`)
  await navigatePage({url:base+'/tests/form-designer.html?numberEditor=1'})
  await until(`!!document.querySelector('[data-number-changes]')`)
  await clickExpression(`document.querySelector('[aria-label="عدد آزمایش کنترل مشترک"]')`);await click('خروج از عدد')
  await check('focusing and blurring the shared numeric editor without edits commits nothing',`document.querySelector('[data-number-changes]').dataset.numberChanges==='0'`)
  await inputValue(`document.querySelector('[aria-label="عدد آزمایش کنترل مشترک"]')`,141);await click('خروج از عدد')
  await check('live numeric edits commit once without an extra blur history operation',`document.querySelector('[data-number-changes]').dataset.numberChanges==='1'&&document.querySelector('input').value==='141'`)
 } finally { await restore() }
}
