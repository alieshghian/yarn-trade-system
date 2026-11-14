import assert from 'node:assert/strict'

export async function runManualBoundsScenarios({base,navigatePage,evaluate,until,send,pause,check,clickExpression}) {
  const key=async(key,modifiers=0)=>{
    const windowsVirtualKeyCode={ArrowLeft:37,ArrowRight:39}[key]??key.toUpperCase().charCodeAt(0)
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key.length===1?'Key'+key.toUpperCase():key,windowsVirtualKeyCode,modifiers})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key.length===1?'Key'+key.toUpperCase():key,windowsVirtualKeyCode,modifiers})
    await pause(20)
  }
  const measure=`(()=>{const grid=document.querySelector('.laboratory-form-grid'),g=grid.getBoundingClientRect();return {width:grid.clientWidth,stored:Number(grid.dataset.canvasStoredWidth),shift:Number(grid.dataset.canvasViewShift),fields:Object.fromEntries([...grid.querySelectorAll('[data-field-id]')].map(e=>{const r=e.querySelector('.designer-input-part').getBoundingClientRect();return [e.dataset.fieldId,{left:r.left-g.left,right:r.right-g.left,top:r.top-g.top,width:r.width,height:r.height}]}))}})()`
  await navigatePage({url:base+'/tests/form-designer.html?smartLayout=1&dragRegression=1&language=fa'})
  await until(`document.querySelectorAll('.laboratory-form-grid [data-field-id]').length===13`)
  await evaluate(`(()=>{const e=document.querySelector('.laboratory-editor');Object.assign(e.style,{width:'1900px',minWidth:'1900px',maxWidth:'none',flex:'0 0 1900px'})})()`)
  await pause(200)
  await clickExpression(`document.querySelector('[data-field-id="code"] .laboratory-field-select')`)
  await evaluate(`document.querySelector('[data-field-id="code"] .designer-input-part').focus({preventScroll:true})`)
  await key('a',2);await key('l',2)
  await check('neighbour compensation is visible and off by default',`(()=>{const e=document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]');return e&&!e.checked&&!e.closest('[hidden]')})()`)
  await clickExpression(`document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]')`)
  await check('explicit compensation can be enabled in the selection panel',`document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]').checked`)
  const initial=await evaluate(measure)
  assert.ok(initial.width>initial.stored+30,'fixture must have free viewport space beyond saved layout')
  for(const [id,edge,direction] of [['code','right','ArrowRight'],['group','left','ArrowLeft']]){
    await clickExpression(`document.querySelector('[data-field-id="${id}"] .laboratory-field-select')`)
    await until(`!!document.querySelector('[data-field-id="${id}"] .designer-input-part .designer-edge-${edge}')`)
    await evaluate(`document.querySelector('[data-field-id="${id}"] .designer-input-part').scrollIntoView({block:'center'})`)
    const before=await evaluate(measure)
    const h=`document.querySelector('[data-field-id="${id}"] .designer-input-part .designer-edge-${edge}')`
    const start=await evaluate(`(()=>{const r=(${h}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...start})
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1})
    const dx=edge==='right'?70:-70
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+dx,y:start.y,buttons:1,button:'left'})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+dx,y:start.y,button:'left',clickCount:1})
    await pause(200)
    const resized=await evaluate(measure)
    assert.ok(resized.fields[id].width>before.fields[id].width+50,`${edge} edge must grow into free viewport space after Ctrl+L: `+JSON.stringify({before,resized,start,hit:await evaluate(`document.elementFromPoint(${start.x},${start.y})?.outerHTML`)} ))
    for(const peer of Object.keys(before.fields).filter(p=>p!==id))assert.deepEqual(resized.fields[peer],before.fields[peer],'unselected geometry must stay fixed')
    await evaluate(`(${h}).focus({preventScroll:true})`)
    for(let i=0;i<50;i++)await key(direction,8)
    const atEdge=await evaluate(measure),margin=edge==='right'?atEdge.width-atEdge.fields[id].right:atEdge.fields[id].left
    assert.ok(Math.abs(margin-96/2.54/2)<1,'manual resize must stop at the visible half-centimeter margin: '+margin)
    await check(`Ctrl+L leaves ${edge} field edge editable by mouse and keyboard up to panel margin`,`document.querySelectorAll('.laboratory-form-grid [data-field-id]').length===13`)
    // Reset this independent fixture between physical sides.
    if(edge==='right'){
      await clickExpression(`document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]')`)
      await check('compensation can be switched off without resetting the layout',`!document.querySelector('[aria-label="حفظ فاصله و عرض مجموع"]').checked`)
      await clickExpression(`document.querySelector('[data-field-id="code"] .laboratory-field-select')`)
      await evaluate(`document.querySelector('[data-field-id="code"] .designer-input-part').focus({preventScroll:true})`)
  await key('a',2);await key('l',2)
    }
  }
  const ids=['number','countType','filament','unit','twist','amount']
  const chooseRow=async()=>{
    await clickExpression(`[...document.querySelectorAll('.laboratory-designer-panel button')].find(e=>e.textContent.includes('پاک')&&e.textContent.includes('انتخاب'))`)
    for(const id of ids)await clickExpression(`document.querySelector('[data-field-id="${id}"] .laboratory-field-select')`,'left',2)
  }
  await chooseRow()
  const beforeRow=await evaluate(measure)
  await evaluate(`document.querySelector('[data-field-id="number"] .designer-input-part').focus({preventScroll:true})`)
  await key('l',2)
  const afterRow=await evaluate(measure)
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length
  for(const id of ids){assert.ok(Math.abs(afterRow.fields[id].width-mean(ids.map(x=>beforeRow.fields[x].width)))<1);assert.ok(Math.abs(afterRow.fields[id].height-mean(ids.map(x=>beforeRow.fields[x].height)))<1)}
  for(const id of Object.keys(beforeRow.fields).filter(id=>!ids.includes(id)))assert.deepEqual(afterRow.fields[id],beforeRow.fields[id])
  await check('Ctrl+L normalizes only the selected six canvas fields',`document.querySelectorAll('.designer-input-part.designer-part-selected').length===6`)
  await clickExpression(`document.querySelector('[data-field-id="number"] .designer-input-part')`,'right')
  await clickExpression(`[...document.querySelectorAll('[role="menu"] button')].find(e=>e.textContent.trim()==='اندازه و چیدمان')`)
  await clickExpression(`[...document.querySelectorAll('[role="menu"] button')].find(e=>e.textContent.includes('یکسان‌سازی اندازه و فاصله'))`)
  await check('the same averaging command is available from the selected row context menu',`!document.querySelector('.designer-context-menu')&&document.querySelectorAll('.designer-input-part.designer-part-selected').length===6`)

}
