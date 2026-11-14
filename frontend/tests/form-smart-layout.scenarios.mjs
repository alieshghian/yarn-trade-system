import assert from 'node:assert/strict'

export async function runSmartLayoutScenarios({base,navigatePage,evaluate,until,send,pause,check,clickExpression}) {
  const keys = async (key, modifiers = 0) => {
    const code = key.length === 1 ? 'Key' + key.toUpperCase() : key
    const windowsVirtualKeyCode = { ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40 }[key] ?? key.toUpperCase().charCodeAt(0)
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,modifiers})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers})
    await pause(120)
  }
  const measure = `(()=>{const grid=document.querySelector('.laboratory-form-grid');const origin=grid.getBoundingClientRect();const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left-origin.left,top:r.top-origin.top,width:r.width,height:r.height,right:r.right-origin.left,styleLeft:e.style.left}};return {width:origin.width,left:origin.left,top:origin.top,dataset:{storedWidth:grid.dataset.canvasStoredWidth,viewShift:grid.dataset.canvasViewShift},viewport:{left:origin.left,top:origin.top,scrollLeft:grid.scrollLeft,scrollTop:grid.scrollTop,windowX:scrollX,windowY:scrollY},fields:Object.fromEntries([...grid.querySelectorAll('[data-field-id]')].map(e=>[e.dataset.fieldId,{input:rect(e.querySelector('.designer-input-part')),label:rect(e.querySelector('.designer-label-part'))}]))}})()`
  const bounds = (state,ids) => ({left:Math.min(...ids.flatMap(id=>[state.fields[id].input.left,state.fields[id].label.left])),right:Math.max(...ids.flatMap(id=>[state.fields[id].input.right,state.fields[id].label.right]))})
  const allIds=['code','name','material','luster','group','number','countType','filament','unit','twist','amount','notes','active']
  for(const language of ['fa','en']) {
    await navigatePage({url:base+'/tests/form-designer.html?smartLayout=1&language='+language})
    await until(`document.querySelectorAll('.laboratory-form-grid [data-field-id]').length===13`)
    await clickExpression(`document.querySelector('[data-field-id="code"] .laboratory-field-select')`)
    await evaluate(`document.querySelector('[data-field-id="code"] .designer-input-part').focus()`)
    await keys('a',2)
    await check(language+' Ctrl+A selects the complete canvas without selecting page text',`document.querySelectorAll('.laboratory-form-grid .designer-input-part.designer-part-selected').length===13&&!String(window.getSelection())`)
    const beforeLayout=await evaluate(measure)
    await keys('l',2)
    const state=await evaluate(measure), dense=bounds(state,['number','countType','filament','unit','twist','amount']), footer=bounds(state,['notes','active'])
    assert.ok(state.width<=beforeLayout.width+1,language+' Ctrl+L must keep the existing Canvas width when this layout fits: '+JSON.stringify({before:beforeLayout.width,after:state.width}))
    assert.ok(Math.abs(dense.left-footer.left)<.2&&Math.abs(dense.right-footer.right)<.2,'notes and active share both outer grid borders: '+JSON.stringify({dense,footer}))
    assert.ok(Math.abs(state.fields.notes.input.height-state.fields.number.input.height)<.2)
    assert.ok(Math.abs(state.fields.notes.input.top+state.fields.notes.input.height/2-state.fields.active.input.top-state.fields.active.input.height/2)<.2)
    const gap=state.fields.number.input.left-state.fields.countType.input.right
    const active=bounds(state,['active']), notes=bounds(state,['notes'])
    const footerGap=language==='fa'?notes.left-active.right:active.left-notes.right
    assert.ok(Math.abs(Math.abs(gap)-footerGap)<.3,'the footer uses the same horizontal gap as regular fields')
    await check(language+' Ctrl+L aligns the notes row, checkbox and labels inside the regular grid',`document.querySelectorAll('.laboratory-form-grid .designer-input-part.designer-part-selected').length===13`)
    const centered=bounds(state,allIds)
    assert.ok(Math.abs(centered.left+centered.right-state.width)<.3,'global layout centers its complete group')
    await keys('ArrowRight')
    const nudged=await evaluate(measure)
    for(const id of allIds)assert.ok(Math.abs(nudged.fields[id].input.left-state.fields[id].input.left-1)<.15,'plain Right nudges every selected field by one physical pixel: '+JSON.stringify({id,before:state.fields[id].input.left,after:nudged.fields[id].input.left,canvasBefore:state.width,canvasAfter:nudged.width}))
    await keys('ArrowLeft');await keys('ArrowUp');await keys('ArrowDown')
    const returned=await evaluate(measure)
    for(const id of allIds)assert.ok(Math.abs(returned.fields[id].input.left-state.fields[id].input.left)<.15&&Math.abs(returned.fields[id].input.top-state.fields[id].input.top)<.15)
    for(const edge of ['right','left','right']) {
      await keys(edge==='right'?'ArrowRight':'ArrowLeft',2)
      const aligned=await evaluate(measure), group=bounds(aligned,allIds), inset=96/2.54/2
      assert.ok(Math.abs((edge==='right'?aligned.width-group.right:group.left)-inset)<.2,language+' Ctrl+'+edge+' respects a half-centimeter inset: '+JSON.stringify({group,width:aligned.width,canvas:aligned.dataset,viewport:aligned.viewport,first:aligned.fields.code}))
      for(const id of allIds)assert.ok(Math.abs(aligned.fields[id].input.top-state.fields[id].input.top)<.15,'edge alignment preserves vertical geometry')
    }
    await check(language+' Ctrl+arrows repeatedly align in physical directions while plain arrows nudge',`document.querySelectorAll('.laboratory-form-grid .designer-input-part.designer-part-selected').length===13`)
    // A partial selection must leave every other field untouched.
    await clickExpression(`document.querySelector('[data-field-id="name"] .laboratory-field-select')`)
    const partialBefore=await evaluate(measure)
    await keys('ArrowLeft',2)
    const partialAfter=await evaluate(measure)
    for(const id of allIds.filter(id=>id!=='name'))assert.deepEqual(partialAfter.fields[id],partialBefore.fields[id])
    await check(language+' Ctrl+arrow moves only the selected field',`document.querySelectorAll('.laboratory-form-grid .designer-input-part.designer-part-selected').length===1`)
    await clickExpression(`document.querySelector('.form-laboratory-banner button[aria-label="${language==='fa'?'واگرد':'Undo'}"]')`)
    const undone=await evaluate(measure)
    assert.deepEqual(undone.fields,partialBefore.fields,'edge alignment is one undo step')
  }

  // Reproduce the RTL regression with a real pointer drag while the editor is
  // wider than its persisted Canvas. Expansion must not shift the other fields.
  await navigatePage({url:base+'/tests/form-designer.html?smartLayout=1&dragRegression=1&language=fa'})
  await until(`document.querySelectorAll('.laboratory-form-grid [data-field-id]').length===13`)
  const editorWidth=await evaluate(`(()=>{const editor=document.querySelector('.laboratory-editor');editor.style.width='1900px';editor.style.minWidth='1900px';editor.style.maxWidth='none';editor.style.flex='0 0 1900px';return editor.clientWidth})()`)
  assert.ok(editorWidth>1440,'RTL regression fixture must have a viewport wider than its persisted Canvas')
  await pause(160)
  await clickExpression(`document.querySelector('[data-field-id="notes"] .laboratory-field-select')`)
  await evaluate(`document.querySelector('[data-field-id="notes"] .designer-move-handle').scrollIntoView({block:'center',inline:'center'})`)
  await pause(120)
  const dragBefore=await evaluate(measure)
  const start=await evaluate(`(()=>{const r=document.querySelector('[data-field-id="notes"] .designer-move-handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  const moveHit=await evaluate(`(()=>{const h=document.querySelector('[data-field-id="notes"] .designer-move-handle'),r=h.getBoundingClientRect();return document.elementFromPoint(r.right-6,r.y+r.height/2)?.getAttribute('aria-label')})()`)
  assert.equal(moveHit,'Move input','the Move input target must not be covered by an edge-resize handle')
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...start})
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x-32,y:start.y,button:'left',buttons:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x-32,y:start.y,button:'left',clickCount:1})
  await pause(220)
  const dragAfter=await evaluate(measure)
  assert.ok(dragAfter.fields.notes.input.left<dragBefore.fields.notes.input.left-20,'the selected RTL textarea must move left when dragged left')
  assert.equal(dragAfter.fields.notes.input.width,dragBefore.fields.notes.input.width,'moving must not change the textarea width')
  for(const id of allIds.filter(id=>id!=='notes'))assert.deepEqual(dragAfter.fields[id],dragBefore.fields[id],'dragging notes must not shift unselected field '+id)
  assert.deepEqual(dragAfter.viewport,dragBefore.viewport,'dragging one RTL field must preserve the canvas origin and all scroll offsets')
  await clickExpression(`document.querySelector('.form-laboratory-banner button[aria-label="واگرد"]')`)
  const dragUndo=await evaluate(measure)
  assert.deepEqual(dragUndo.fields,dragBefore.fields,'Undo restores the original field rectangles')
  assert.deepEqual(dragUndo.viewport,dragBefore.viewport,'Undo preserves the canvas origin and all scroll offsets')
  await clickExpression(`document.querySelector('.form-laboratory-banner button[aria-label="ازنو"]')`)
  const dragRedo=await evaluate(measure)
  assert.deepEqual(dragRedo.fields,dragAfter.fields,'Redo restores only the selected field movement')
  assert.deepEqual(dragRedo.viewport,dragAfter.viewport,'Redo preserves the canvas origin and all scroll offsets')
  const resizeBefore=await evaluate(measure)
  const leftHit=await evaluate(`(()=>{const h=document.querySelector('[data-field-id="notes"] .designer-edge-left'),r=h.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.getAttribute('aria-label')})()`)
  assert.equal(leftHit,'Resize input left','the left resize target must remain independently reachable')
  const resizeStart=await evaluate(`(()=>{const r=document.querySelector('[data-field-id="notes"] .designer-edge-left').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...resizeStart})
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...resizeStart,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:resizeStart.x-28,y:resizeStart.y,button:'left',buttons:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:resizeStart.x-28,y:resizeStart.y,button:'left',clickCount:1})
  await pause(220)
  const resizeAfter=await evaluate(measure)
  assert.ok(resizeAfter.fields.notes.input.left<resizeBefore.fields.notes.input.left-20,'dragging the left edge left must grow the selected textarea toward the left')
  assert.ok(Math.abs(resizeAfter.fields.notes.input.right-resizeBefore.fields.notes.input.right)<.2,'left-edge growth keeps the opposite edge fixed')
  for(const id of allIds.filter(id=>id!=='notes'))assert.deepEqual(resizeAfter.fields[id],resizeBefore.fields[id],'resizing notes must not shift unselected field '+id)
  assert.deepEqual(resizeAfter.viewport,resizeBefore.viewport,'left-edge resizing preserves the canvas origin and all scroll offsets')
  await check('RTL textarea Move and left resize handles work independently near the inline edge',`document.querySelectorAll('.laboratory-form-grid [data-field-id]').length===13`)

  // Narrow the upper editor only. The fixed-geometry layout must use the
  // viewport width until its content reaches half-centimeter side margins,
  // then scroll without changing the independently sized lower table.
  await navigatePage({url:base+'/tests/form-designer.html?smartLayout=1&responsiveWidth=1&language=fa'})
  await until(`document.querySelectorAll('.laboratory-form-grid [data-field-id]').length===13`)
  await clickExpression(`document.querySelector('[data-field-id="code"] .laboratory-field-select')`)
  await keys('a',2);await keys('l',2)
  await until(`!!document.querySelector('.laboratory-form-grid')?.dataset.canvasStoredWidth`,'responsive fixed Canvas capture')
  const widthState=()=>evaluate(`(()=>{const editor=document.querySelector('.laboratory-editor'),grid=document.querySelector('.laboratory-form-grid'),table=document.querySelector('.laboratory-grid'),style=getComputedStyle(editor);const boxes=[...grid.querySelectorAll('[data-field-id]')].flatMap(field=>['.designer-input-part','.designer-label-part'].map(selector=>field.querySelector(selector)?.getBoundingClientRect()).filter(Boolean));const left=Math.min(...boxes.map(rect=>rect.left)),right=Math.max(...boxes.map(rect=>rect.right));return {editorWidth:editor.clientWidth,availableWidth:editor.clientWidth-parseFloat(style.paddingLeft||'0')-parseFloat(style.paddingRight||'0'),editorScrollWidth:editor.scrollWidth,gridWidth:grid.getBoundingClientRect().width,gridLeft:grid.getBoundingClientRect().left,contentLeft:left,contentRight:right,lowerWidth:table?.getBoundingClientRect().width,storedWidth:grid.dataset.canvasStoredWidth,viewShift:grid.dataset.canvasViewShift,overflowing:grid.dataset.canvasOverflowing==='true',scrollbarGutter:style.scrollbarGutter,layoutWarning:grid.dataset.layoutWarning??''}})()`)
  const beforeWidth=await widthState(),inset=96/2.54/2,contentWidth=beforeWidth.contentRight-beforeWidth.contentLeft,minimumWidth=contentWidth+2*inset
  const setEditorWidth=async width=>evaluate(`(()=>{const editor=document.querySelector('.laboratory-editor');editor.style.boxSizing='border-box';const gutter=editor.offsetWidth-editor.clientWidth,target=${width}+gutter;editor.style.width=target+'px';editor.style.minWidth='0';editor.style.maxWidth=target+'px';editor.style.flex='0 0 '+target+'px';return editor.clientWidth})()`)
  await setEditorWidth(Math.ceil(minimumWidth+100))
  await until(`(()=>{const e=document.querySelector('.laboratory-editor'),g=document.querySelector('.laboratory-form-grid');return Math.abs(e.clientWidth-g.clientWidth)<2})()`,'wide responsive Canvas fit')
  const roomyWidth=await widthState()
  assert.ok(roomyWidth.editorScrollWidth<=roomyWidth.editorWidth+2,'a wide editor must not retain horizontal scroll just because the stored Canvas was wider')
  assert.ok(Math.abs(roomyWidth.gridWidth-roomyWidth.editorWidth)<2,'the visible Canvas fills the upper viewport while content fits')
  assert.equal(roomyWidth.lowerWidth,beforeWidth.lowerWidth,'upper editor fitting does not resize the lower table panel')

  await setEditorWidth(Math.floor(minimumWidth-60))
  await until(`(()=>{const e=document.querySelector('.laboratory-editor'),g=document.querySelector('.laboratory-form-grid');return e.scrollWidth>e.clientWidth+2&&Math.abs(g.clientWidth-${minimumWidth})<2})()`,'narrow responsive Canvas overflow')
  const narrowWidth=await widthState()
  const leading=narrowWidth.contentLeft-narrowWidth.gridLeft,trailing=narrowWidth.gridLeft+narrowWidth.gridWidth-narrowWidth.contentRight
  assert.ok(Math.abs(leading-inset)<1,'the upper editor begins scrolling only after its leading half-centimeter margin is reached: '+JSON.stringify({leading,inset,narrowWidth}))
  assert.ok(Math.abs(trailing-inset)<1,'the upper editor keeps a half-centimeter trailing margin when it overflows: '+JSON.stringify({trailing,inset,narrowWidth}))
  assert.equal(narrowWidth.storedWidth,beforeWidth.storedWidth,'responsive resizing leaves the persisted Canvas width untouched')
  assert.equal(narrowWidth.lowerWidth,beforeWidth.lowerWidth,'the lower table remains independent while the upper editor scrolls')

  // Enter scrolling at a 5mm margin and release it at 8mm to avoid oscillation.
  // The vertical gutter stays reserved, and view translation must not look like
  // a stored geometry mismatch.
  const releaseInset=96/2.54*8/10,releaseWidth=minimumWidth+2*(releaseInset-inset)
  const hysteresisSteps=[
    {width:Math.ceil(minimumWidth+10),overflowing:true,name:'keep scrolling inside the 5–8mm band'},
    {width:Math.ceil(releaseWidth+3),overflowing:false,name:'release scrolling after the 8mm margin'},
    {width:Math.ceil(minimumWidth+10),overflowing:false,name:'keep scrolling released while shrinking inside the band'},
    {width:Math.floor(minimumWidth-3),overflowing:true,name:'re-enter scrolling at the 5mm margin'}
  ]
  for(const step of hysteresisSteps) {
    await setEditorWidth(step.width)
    await pause(120)
    await until(`Boolean(document.querySelector('.laboratory-form-grid')?.dataset.canvasOverflowing)===${step.overflowing}`,'hysteresis state: '+step.name)
    await until(`!document.querySelector('.laboratory-form-grid')?.dataset.layoutWarning?.includes('Canvas geometry differs from saved layout')`,'view-only translation is normalized by the layout inspector')
    const sample=await widthState()
    assert.equal(sample.overflowing,step.overflowing,step.name+': '+JSON.stringify(sample))
    assert.equal(sample.scrollbarGutter,'stable','a fixed-geometry editor reserves its vertical scrollbar gutter')
    assert.ok(Math.abs(sample.availableWidth-sample.editorWidth)<1,'the viewport width is measured consistently while horizontal overflow changes')
    assert.ok(!sample.layoutWarning.includes('Canvas geometry differs from saved layout'),'view-only centering does not raise a saved-layout warning: '+sample.layoutWarning)
    if(step.overflowing)assert.ok(sample.gridWidth>sample.availableWidth,'the active scroll state retains a real, minimal horizontal overflow: '+JSON.stringify(sample))
    const leading=sample.contentLeft-sample.gridLeft,trailing=sample.gridLeft+sample.gridWidth-sample.contentRight
    assert.ok(Math.abs(leading-trailing)<1,'crossing the scroll threshold does not jump the centered field group: '+JSON.stringify({leading,trailing,sample}))
  }
  await check('upper Canvas consumes side whitespace before scrolling and keeps table width independent',`(()=>{const e=document.querySelector('.laboratory-editor'),g=document.querySelector('.laboratory-form-grid');return e.scrollWidth>e.clientWidth&&g.dataset.canvasStoredWidth!=='0'})()`)
}
