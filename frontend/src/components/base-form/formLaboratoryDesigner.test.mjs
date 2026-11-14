import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { resolveDesignerNeighborResize, resizeCanvasHandle, resizeCanvasDimension, attachDesignerDocument, centerCanvasRows, expandDesignerCanvasBounds, fitDesignerCanvasToViewport, fitDesignerCanvasToViewportWithHysteresis, moveCanvasFields } from './designer.ts'
import { designerDraftForEditor } from './formDocumentDesigner.ts'
import { resolveFormLayout } from './formLayoutContract.ts'
import { layoutDesignerCanvasSelection, levelDesignerInputRow } from './designer.ts'
import {designerCanvasInteractionBounds,designerCanvasEdgeInset} from './designer.ts'

test('manual geometry can leave a centered saved layout without crossing the visible editor inset',()=>{
  const field=left=>({input:{left,top:40,width:90,height:30},label:{left,top:10,width:90,height:20}})
  const canvas={width:400,height:200,fields:{left:field(40),right:field(270)},centeredFieldIds:['left','right']}
  const original=structuredClone(canvas),bounds=designerCanvasInteractionBounds(canvas,800,200)
  for(const [id,edge,delta] of [['left','left',-1000],['right','right',1000]]){
    const moved=moveCanvasFields(canvas,[id],delta,0,bounds)
    assert.ok(Math.abs((edge==='left'?moved.fields[id].input.left:moved.fields[id].input.left+moved.fields[id].input.width)-(edge==='left'?bounds.left+designerCanvasEdgeInset:bounds.left+bounds.width-designerCanvasEdgeInset))<.001)
    const resized=resizeCanvasHandle(canvas,[id],edge,delta,0,undefined,bounds)
    assert.ok(resized.fields[id].input.width>canvas.fields[id].input.width)
    const peer=id==='left'?'right':'left'
    assert.deepEqual(resized.fields[peer],canvas.fields[peer])
    assert.equal(resized.width,canvas.width,'manual bounds do not rewrite saved canvas width')
  }
  assert.deepEqual(canvas,original)
})
import { commitMeasuredDesignerGeometry } from './designerGeometry.ts'

test('registered surfaces share physical move/resize calculations and preserve unrelated overrides', () => {
  const field = { input: { left: 100, top: 90, width: 200, height: 280 }, label: { left: 100, top: 90, width: 200, height: 0 } }
  const canvas = { width: 900, height: 650, fields: { panel: field } }
  const draft = { formId: 'custom-form', overrides: { 'panel::input': { offsetX: 8, offsetY: -3, borderRadius: 37 }, 'other::input': { fontSize: 19 } } }
  const measured = { canvas, scaleX: 1, scaleY: 1, policies: { panel: { move: 'both', resize: 'both' } } }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const moved = moveCanvasFields(canvas, ['panel'], dx, dy)
    const next = commitMeasuredDesignerGeometry(draft, measured, moved, ['panel'], ['panel', 'other'])
    assert.equal(next.overrides['panel::input'].offsetX, 8 + dx)
    assert.equal(next.overrides['panel::input'].offsetY, -3 + dy)
    assert.equal(next.overrides['panel::input'].borderRadius, 37)
    assert.deepEqual(next.overrides['other::input'], draft.overrides['other::input'])
  }
  for (const edge of ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const resized = resizeCanvasHandle(canvas, ['panel'], edge, 7, 9)
    const next = commitMeasuredDesignerGeometry(draft, measured, resized, ['panel'], ['panel'])
    const rect = resized.fields.panel.input
    assert.equal(next.overrides['panel::input'].width ?? field.input.width, rect.width)
    assert.equal(next.overrides['panel::input'].height ?? field.input.height, rect.height)
    assert.equal(field.input.left + (next.overrides['panel::input'].offsetX - 8), rect.left)
    assert.equal(field.input.top + (next.overrides['panel::input'].offsetY + 3), rect.top)
  }
})

test('the shared row command normalizes sizes and measured gaps without changing unselected controls', () => {
  const field = (left, top, width, height) => ({ input: { left, top, width, height }, label: { left, top, width, height: 0 } })
  const canvas = { width: 1000, height: 650, fields: { a: field(50, 100, 180, 290), b: field(260, 110, 200, 310), c: field(510, 105, 190, 300), untouched: field(30, 500, 100, 40) } }
  const result = levelDesignerInputRow(canvas, ['a', 'b', 'c'], true, 1000)
  assert.equal(result.blockedBy, undefined)
  const rects = ['a', 'b', 'c'].map(id => result.canvas.fields[id].input).sort((a, b) => a.left - b.left)
  assert.ok(rects.every(rect => rect.width === 190 && rect.height === 300 && rect.top === 105))
  assert.ok(rects.slice(1).every((rect, index) => Math.abs(rect.left - rects[index].left - 190 - 40) < .1))
  assert.ok(Math.abs(rects[0].left + rects[2].left + 190 - 1000) < .1)
  assert.deepEqual(result.canvas.fields.untouched, canvas.fields.untouched)
  const aligned = alignCanvasFields(canvas, ['a', 'b', 'c'], 'a', 'top', [], 0)
  assert.ok(['a', 'b', 'c'].every(id => aligned.canvas.fields[id].input.top === 100))
  const spaced = layoutDesignerCanvasSelection(canvas, ['a', 'b', 'c'], { operation: 'equalSpacing', orientation: 'horizontal', gap: 17, rtl: true })
  assert.equal(spaced.blockedBy, undefined)
  const ordered = ['a', 'b', 'c'].map(id => spaced.canvas.fields[id].input).sort((a, b) => a.left - b.left)
  assert.ok(ordered.slice(1).every((rect, i) => rect.left - ordered[i].left - ordered[i].width === 17))
})

test('registered pinned full-width surfaces retain their constraints through common geometry commands', () => {
  const input = { left: 12, top: 10, width: 860, height: 60 }
  const canvas = { width: 900, height: 650, fields: { header: { input, label: { ...input, height: 0 } } } }
  const measured = { canvas, policies: { header: { move: 'none', resize: 'vertical' } } }
  const draft = { overrides: { 'header::input': { backgroundColor: '#123456' } } }
  const proposed = resizeCanvasHandle(canvas, ['header'], 'bottom-right', 40, 20)
  const next = commitMeasuredDesignerGeometry(draft, measured, proposed, ['header'], ['header'])
  assert.deepEqual(next.overrides['header::input'], { backgroundColor: '#123456', height: 80 })
})

test('adjacent selected inputs do not block one-pixel group resizing', () => {
  const field = left => ({ input: { left, top: 40, width: 180, height: 280 }, label: { left, top: 40, width: 180, height: 0 } })
  const canvas = { width: 900, height: 650, fields: { a: field(30), b: field(217), c: field(404) } }
  const changed = resizeCanvasHandle(canvas, ['a', 'b', 'c'], 'bottom', 0, 1)
  for (const id of ['a', 'b', 'c']) assert.deepEqual(changed.fields[id].input, { ...canvas.fields[id].input, height: 281 })
})

test('manual nudges near an inset never jump or reverse direction', () => {
  const input = { left: 2, top: 3, width: 100, height: 40 }
  const canvas = { width: 400, height: 200, fields: { item: { input, label: { ...input, height: 0 } } } }
  assert.equal(moveCanvasFields(canvas, ['item'], -1, 0).fields.item.input.left, 2)
  assert.equal(moveCanvasFields(canvas, ['item'], 1, 0).fields.item.input.left, 3)
  const outside = { ...canvas, fields: { item: { input: { ...input, left: -8, top: -4 }, label: { ...input, left: -8, top: -4, height: 0 } } } }
  const inward = moveCanvasFields(outside, ['item'], 1, 1)
  assert.equal(inward.fields.item.input.left, -7)
  assert.equal(inward.fields.item.input.top, -3)
})

test('flow layout baselines survive validation and save/reopen without changing the schema', () => {
  const id = 'registered-form', ids = ['control'], draft = { ...emptyDesignerDraft(id), flowSlots: { control: { width: 215.5, height: 38 }, unrelated: { width: 999, height: 999 } } }
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.ok(saveDesignerDraft(storage, 'isolated-test', id, draft, ids))
  const reopened = loadDesignerDraft(storage, 'isolated-test', id, ids)
  assert.deepEqual(reopened.flowSlots, { control: { width: 215.5, height: 38 } })
  assert.deepEqual(reopened.overrides, {})
  assert.equal(validateDesignerDraft({ ...draft, flowSlots: { control: { width: Infinity, height: -1 } } }, id, ids).flowSlots, undefined)
})

test('viewport growth preserves saved field geometry and dragging moves only its selected field',()=>{
 const canvas={width:500,height:240,fields:{notes:{input:{left:280,top:120,width:190,height:54},label:{left:280,top:92,width:190,height:18},select:{left:284,top:94,width:18,height:18}},other:{input:{left:30,top:40,width:150,height:34},label:{left:30,top:16,width:150,height:18}}},centeredFieldIds:['notes'],alignmentExceptionFieldIds:['notes']}
 const expanded=expandDesignerCanvasBounds(canvas,900,360)
 assert.equal(expanded.width,900);assert.equal(expanded.height,360)
 assert.strictEqual(expanded.fields,canvas.fields,'bounds-only expansion retains the complete saved geometry object')
 assert.deepEqual(expanded.fields,canvas.fields)
 const moved=moveCanvasFields(expanded,['notes'],-24,0)
 assert.equal(moved.fields.notes.input.left,256);assert.equal(moved.fields.notes.label.left,256);assert.equal(moved.fields.notes.select.left,260)
 assert.deepEqual(moved.fields.other,canvas.fields.other,'a one-field drag leaves every unselected field and part untouched')
 assert.strictEqual(expandDesignerCanvasBounds(canvas,400,200),canvas,'no-op viewport sizing preserves canvas identity')
})

test('responsive Canvas uses a 5mm enter and 8mm release threshold without moving stored fields',()=>{
 const canvas={width:400,height:120,fields:{name:{input:{left:20,top:40,width:200,height:40},label:{left:20,top:15,width:200,height:18}}}}
 const minWidth=210,releaseWidth=216,edgeInset=5,releaseInset=8
 const roomy=fitDesignerCanvasToViewportWithHysteresis(canvas,minWidth+11,['name'],false,edgeInset,releaseInset)
 assert.equal(roomy.overflowing,false)
 const entering=fitDesignerCanvasToViewportWithHysteresis(canvas,minWidth,['name'],false,edgeInset,releaseInset)
 assert.equal(entering.overflowing,true,'scrolling enters at a 5mm margin')
 assert.equal(entering.canvas.width,minWidth+1,'a one-pixel overflow keeps the scroll state latched')
 assert.strictEqual(entering.canvas.fields,canvas.fields,'responsive fitting does not mutate stored field geometry')
 const held=fitDesignerCanvasToViewportWithHysteresis(canvas,releaseWidth-1,['name'],true,edgeInset,releaseInset)
 assert.equal(held.overflowing,true,'scrolling remains active below the 8mm release margin')
 const released=fitDesignerCanvasToViewportWithHysteresis(canvas,releaseWidth,['name'],true,edgeInset,releaseInset)
 assert.equal(released.overflowing,false,'scrolling releases at the 8mm margin')
 assert.equal(fitDesignerCanvasToViewportWithHysteresis(canvas,minWidth+2,['name'],false,edgeInset,releaseInset).overflowing,false,'after release the viewport can shrink within the hysteresis band without toggling')
 assert.equal(fitDesignerCanvasToViewportWithHysteresis(canvas,minWidth,['name'],false,edgeInset,releaseInset).overflowing,true,'shrinking to the 5mm margin re-enters scrolling')
})

test('persistent row centering keeps input widths and gaps and survives resize validation and Undo',()=>{
 const field=(left,top,width)=>({input:{left,top,width,height:40},label:{left:left+width-60,top:top-25,width:60,height:18}})
 const canvas={width:900,height:300,fields:{a:field(20,50,200),b:field(250,50,250),c:field(20,160,500)}}
 const centered=centerCanvasRows(canvas,['a','b','c'])
 for(const ids of [['a','b'],['c']]){const left=Math.min(...ids.map(id=>centered.fields[id].input.left)),right=Math.max(...ids.map(id=>centered.fields[id].input.left+centered.fields[id].input.width));assert.equal(left,900-right)}
 assert.equal(centered.fields.b.input.left-centered.fields.a.input.left-centered.fields.a.input.width,30)
 assert.equal(centered.fields.a.input.width,200)
 const resized=centerCanvasRows(resizeCanvasHandle(centered,['b'],'left',-30,0,{horizontal:true}))
 assert.equal(resized.fields.a.input.left,centered.fields.a.input.left)
 assert.deepEqual(validateDesignerDraft({...emptyDesignerDraft('center'),canvas:centered},'center',['a','b','c']).canvas.centeredFieldIds,['a','b','c'])
 const history=createDesignerHistory({...emptyDesignerDraft('center'),canvas})
 assert.deepEqual(designerHistoryReducer(designerHistoryReducer(history,{type:'change',draft:{...history.present,canvas:centered}}),{type:'undo'}).present.canvas,canvas)
})

test('paired resize keeps selection buttons anchored to their own input rather than its label edge',()=>{
 const field=(left,width)=>({input:{left,top:60,width,height:40},label:{left:left+width-60,top:30,width:60,height:18},select:{left:left+4,top:32,width:19,height:18}})
 const canvas={width:650,height:240,fields:{a:field(12,250),b:field(282,250)}}
 const next=resizeCanvasHandle(canvas,['b'],'left',-170,0,{horizontal:true})
 assert.equal(next.fields.a.input.width,80)
 assert.equal(next.fields.a.select.left,16,'shrinking neighbour keeps its button at the unchanged left edge')
 assert.equal(next.fields.b.select.left,next.fields.b.input.left+4)
 assert.equal(next.fields.a.label.left,canvas.fields.a.label.left-170,'label still follows its right anchor')
 assert.deepEqual(canvas.fields.a.select,{left:16,top:32,width:19,height:18})
})

test('ordinary input resize keeps a width-matched label, selection control and error overlay attached',()=>{
 const canvas={width:900,height:300,fields:{note:{input:{left:120,top:80,width:240,height:56},label:{left:120,top:54,width:240,height:18},select:{left:124,top:56,width:18,height:18},error:{left:120,top:138,width:240,height:14}},peer:{input:{left:600,top:80,width:160,height:36},label:{left:600,top:56,width:160,height:18}}}}
 const resized=resizeCanvasHandle(canvas,['note'],'left',24,0)
 assert.deepEqual(resized.fields.note.input,{left:144,top:80,width:216,height:56})
 assert.deepEqual(resized.fields.note.label,{left:144,top:54,width:216,height:18},'the label tracks the input left edge and its width')
 assert.deepEqual(resized.fields.note.select,{left:148,top:56,width:18,height:18},'selection chrome follows the resized input')
 assert.deepEqual(resized.fields.note.error,{left:144,top:138,width:216,height:14},'the error overlay tracks the input width and edge')
 assert.deepEqual(resized.fields.peer,canvas.fields.peer,'resizing one input never repositions another field')
 const taller=resizeCanvasHandle(canvas,['note'],'bottom',0,12)
 assert.equal(taller.fields.note.input.height,68)
 assert.equal(taller.fields.note.error.top,150,'a bottom-anchored error overlay follows vertical growth as well')
})

test('resizing a persistently centered field keeps the opposite edge fixed while peers and canvas bounds stay fixed',()=>{
 const canvas={width:900,height:320,fields:{note:{input:{left:350,top:80,width:200,height:48},label:{left:350,top:54,width:200,height:18}},peer:{input:{left:80,top:180,width:140,height:36},label:{left:80,top:156,width:140,height:18}}},centeredFieldIds:['note','peer']}
 const originalRight=canvas.fields.note.input.left+canvas.fields.note.input.width
 const resized=resizeCanvasHandle(canvas,['note'],'right',80,0)
 assert.equal(resized.fields.note.input.width,280)
 assert.equal(resized.fields.note.input.left,canvas.fields.note.input.left,'resizing the right edge cannot drag the opposite edge')
 assert.equal(resized.fields.note.input.left+resized.fields.note.input.width,originalRight+80)
 const resizedFromLeft=resizeCanvasHandle(canvas,['note'],'left',-40,0)
 assert.equal(resizedFromLeft.fields.note.input.left,canvas.fields.note.input.left-40)
 assert.equal(resizedFromLeft.fields.note.input.left+resizedFromLeft.fields.note.input.width,originalRight,'resizing the left edge keeps the opposite edge fixed')
 assert.deepEqual(resized.fields.peer,canvas.fields.peer,'center preservation must not move unselected fields')
 assert.equal(resized.width,canvas.width,'resizing does not expand the editor canvas or change its scroll range')
})

test('resizing any field snaps only its dragged edge to a nearby stationary edge',()=>{
 const canvas={width:900,height:360,fields:{
  reference:{input:{left:300,top:40,width:160,height:36},label:{left:300,top:16,width:160,height:18}},
  note:{input:{left:292,top:140,width:210,height:36},label:{left:292,top:116,width:210,height:18}},
  vertical:{input:{left:620,top:48,width:140,height:36},label:{left:620,top:24,width:140,height:18}},
  peer:{input:{left:50,top:270,width:140,height:36},label:{left:50,top:246,width:140,height:18}}
 }}
 const originalRight=canvas.fields.note.input.left+canvas.fields.note.input.width
 const horizontal=snapResizedCanvasInputsToPeers(canvas,['note'],'left')
 assert.equal(horizontal.fields.note.input.left,300,'a near left edge snaps to the matching stationary vertical line')
 assert.equal(horizontal.fields.note.input.left+horizontal.fields.note.input.width,originalRight,'snapping retains the opposite right edge')
 assert.equal(horizontal.fields.note.input.width,originalRight-300,'only the resized field changes size by the snap correction')
 assert.deepEqual(horizontal.fields.reference,canvas.fields.reference)
 assert.deepEqual(horizontal.fields.vertical,canvas.fields.vertical)
 assert.deepEqual(horizontal.fields.peer,canvas.fields.peer)
 assert.equal(horizontal.width,canvas.width,'edge snapping never changes canvas bounds')
 assert.deepEqual(snapResizedCanvasInputsToPeers(canvas,['note'],'left',{horizontal:true}),canvas,'shared horizontal-boundary resize is not snapped away on release')
 const originalVerticalTop=canvas.fields.vertical.input.top
 const vertical=snapResizedCanvasInputsToPeers(canvas,['vertical'],'bottom')
 assert.equal(vertical.fields.vertical.input.top,originalVerticalTop,'vertical snapping keeps the opposite top edge fixed')
 assert.equal(vertical.fields.vertical.input.top+vertical.fields.vertical.input.height,canvas.fields.reference.input.top+canvas.fields.reference.input.height)
 assert.deepEqual(snapResizedCanvasInputsToPeers(canvas,['vertical'],'bottom',{vertical:true}),canvas,'shared vertical-boundary resize is not snapped away on release')
 const exempt={...canvas,alignmentExceptionFieldIds:['note']}
 assert.deepEqual(snapResizedCanvasInputsToPeers(exempt,['note'],'left').fields.note,canvas.fields.note,'F1-exempt fields retain their manual edge')
})

test('a moved field snaps exactly to nearby stationary rows and columns without moving its references',()=>{
 const columnCanvas={width:900,height:360,fields:{reference:{input:{left:400,top:40,width:160,height:36},label:{left:400,top:14,width:160,height:18}},added:{input:{left:397,top:150,width:164,height:36},label:{left:397,top:124,width:164,height:18}},other:{input:{left:80,top:260,width:140,height:36},label:{left:80,top:234,width:140,height:18}}}}
 const columnAligned=autoAlignDesignerCanvas(columnCanvas,{rtl:true,fieldIds:['added']})
 assert.equal(columnAligned.fields.added.input.left+columnAligned.fields.added.input.width,560,'a new RTL field snaps to the nearby stationary right edge')
 assert.equal(columnAligned.fields.added.input.width,162,'a nearby field adopts the local average width')
 assert.deepEqual(columnAligned.fields.reference,columnCanvas.fields.reference)
 assert.deepEqual(columnAligned.fields.other,columnCanvas.fields.other)

 const rowCanvas={width:900,height:280,fields:{reference:{input:{left:90,top:40,width:140,height:36},label:{left:90,top:14,width:140,height:18}},added:{input:{left:500,top:47,width:140,height:36},label:{left:500,top:21,width:140,height:18}},other:{input:{left:760,top:180,width:100,height:30},label:{left:760,top:156,width:100,height:18}}}}
 const rowAligned=autoAlignDesignerCanvas(rowCanvas,{rtl:true,fieldIds:['added']})
 assert.equal(rowAligned.fields.added.input.top,rowCanvas.fields.reference.input.top,'a moved field snaps onto the reference row instead of stopping halfway')
 assert.equal(rowAligned.fields.added.label.top,rowCanvas.fields.reference.label.top)
 assert.deepEqual(rowAligned.fields.reference,rowCanvas.fields.reference)
 assert.deepEqual(rowAligned.fields.other,rowCanvas.fields.other)

 const excluded={...columnCanvas,alignmentExceptionFieldIds:['added']}
 assert.equal(autoAlignDesignerCanvas(excluded,{rtl:true,fieldIds:['added']}),excluded,'F1-pinned fields remain exempt from automatic snapping')
})

test('new fields inherit shared label typography from the form defaults',()=>{
 const draft={...emptyDesignerDraft('new-label'),defaults:{label:{fontFamily:'Vazirmatn',fontSize:17,textColor:'#102030'}},overrides:{existing:{},'existing::label':{fontSize:19}}}
 const schema={fields:[{id:'existing',sectionId:'editor'},{id:'newField',sectionId:'editor'}],sections:[{id:'editor',kind:'editor'}]}
 const projected=designerDraftForEditor(draft,schema,'editor')
 assert.equal(designerEffectiveValues(projected,'newField','label').fontFamily,'Vazirmatn')
 assert.equal(designerEffectiveValues(projected,'newField','label').fontSize,17)
 assert.equal(projected.overrides['newField::label'],undefined,'a new field inherits instead of creating a divergent per-field style')
 assert.equal(projected.overrides['existing::label'].fontSize,19,'existing explicit typography stays independent')
})

test('coupled physical resizing preserves horizontal and vertical gaps, outer span, limits and unrelated fields',()=>{
 const field=(left,top,width,height)=>({input:{left,top,width,height},label:{left:left+width-70,top:top-25,width:70,height:18}})
 const horizontal={width:700,height:400,fields:{a:field(20,40,180,80),b:field(220,40,160,80),c:field(450,230,100,60)}}
 const moved=resizeCanvasHandle(horizontal,['a'],'right',40,0,{horizontal:true})
 assert.equal(moved.fields.a.input.width,220);assert.equal(moved.fields.b.input.width,120)
 assert.equal(moved.fields.b.input.left-(moved.fields.a.input.left+moved.fields.a.input.width),20)
 assert.equal(moved.fields.b.input.left+moved.fields.b.input.width,380)
 assert.deepEqual(moved.fields.c,horizontal.fields.c)
 assert.deepEqual(resizeCanvasHandle(horizontal,['b'],'left',40,0,{horizontal:true}),moved)
 assert.deepEqual(resizeCanvasDimension(horizontal,['a'],'width',220,{horizontal:true}),moved)
 const min=resizeCanvasHandle(horizontal,['a'],'right',900,0,{horizontal:true})
 assert.ok(min.fields.b.input.width>=48);assert.equal(min.fields.b.input.left+min.fields.b.input.width,380)
 const vertical={width:500,height:600,fields:{a:field(20,40,180,100),b:field(20,180,180,100),c:field(300,400,100,60)}}
 const down=resizeCanvasHandle(vertical,['a'],'bottom',0,35,{vertical:true})
 assert.equal(down.fields.a.input.height,135);assert.equal(down.fields.b.input.height,65)
 assert.equal(down.fields.b.input.top-down.fields.a.input.top-down.fields.a.input.height,40)
 assert.equal(down.fields.b.input.top+down.fields.b.input.height,280)
 assert.equal(down.fields.b.label.top,vertical.fields.b.label.top+35)
 assert.deepEqual(down.fields.c,vertical.fields.c)
 assert.deepEqual(resizeCanvasDimension(vertical,['a'],'height',135,{vertical:true}),down)
 assert.deepEqual(resizeCanvasHandle(vertical,['b'],'top',0,35,{vertical:true}),down)
 assert.deepEqual(horizontal.fields.a.input,{left:20,top:40,width:180,height:80})
 assert.equal(resizeCanvasHandle(horizontal,['a','b'],'right',20,0,{horizontal:true}),horizontal,'ambiguous multiselection is atomic')
 assert.equal(resizeCanvasHandle(horizontal,['c'],'right',20,0,{horizontal:true}).fields.c.input.width,120,'an isolated field can resize independently even with compensation enabled')
 const draft={...emptyDesignerDraft('paired'),neighborResize:{horizontal:true,vertical:false},canvas:moved}
 const clean=validateDesignerDraft(draft,'paired',['a','b','c'])
 assert.deepEqual(clean.neighborResize,{horizontal:true,vertical:false})
 const schema={id:'paired',fields:[],sections:[]},history=attachDesignerDocument(createDesignerHistory({...draft,canvas:horizontal}),schema)
 const changed=designerHistoryReducer(history,{type:'change',draft})
 assert.deepEqual(designerHistoryReducer(changed,{type:'undo'}).present.canvas,horizontal)
 assert.deepEqual(designerHistoryReducer(designerHistoryReducer(changed,{type:'undo'}),{type:'redo'}).present.canvas,moved)
})
test('moving a canvas field ignores stale selection-chrome bounds and preserves every other field',()=>{
 const canvas={width:900,height:500,fields:{notes:{input:{left:520,top:180,width:300,height:70},label:{left:0,top:156,width:900,height:18},select:{left:0,top:156,width:19,height:18},error:{left:0,top:252,width:900,height:16}},active:{input:{left:40,top:300,width:160,height:24},label:{left:40,top:276,width:160,height:18}}}}
 const moved=moveCanvasFields(canvas,['notes'],-36,-12)
 assert.deepEqual(moved.fields.notes,{input:{left:484,top:168,width:300,height:70},label:{left:-36,top:144,width:900,height:18},select:{left:-36,top:144,width:19,height:18},error:{left:-36,top:240,width:900,height:16}})
 assert.deepEqual(moved.fields.active,canvas.fields.active,'dragging a field must leave all unselected geometry unchanged')
})

test('single-field drag keeps a half-centimeter edge inset and uses canvas edges only when the input cannot fit both insets',()=>{
 const inset=96/2.54/2
 const field=left=>({input:{left,top:40,width:100,height:34},label:{left,top:16,width:100,height:18}})
 const leftCanvas={width:500,height:160,fields:{target:field(30),peer:field(200)}}
 const left=moveCanvasFields(leftCanvas,['target'],-200,0)
 assert.ok(Math.abs(left.fields.target.input.left-inset)<0.01)
 assert.deepEqual(left.fields.peer,leftCanvas.fields.peer)
 const rightCanvas={...leftCanvas,fields:{target:field(370),peer:field(200)}}
 const right=moveCanvasFields(rightCanvas,['target'],200,0)
 assert.ok(Math.abs(right.fields.target.input.left+right.fields.target.input.width-(500-inset))<0.01)
 const nearFullCanvas={width:500,height:160,fields:{target:{input:{left:0,top:40,width:490,height:34},label:{left:0,top:16,width:490,height:18}}}}
 const oversized=moveCanvasFields(nearFullCanvas,['target'],200,0)
 assert.equal(oversized.fields.target.input.left,10,'a near-full-width input remains movable without changing canvas width')
 assert.equal(oversized.width,nearFullCanvas.width)
})
import { alignDesignerCanvasFieldsToEdge, autoAlignDesignerCanvas, capDesignerCanvasWidth, contextDesignerSelection, designerActionLabel, designerActionTextStyle, designerAppearancePresets, designerElementAppearanceValues, fieldGroupRect, levelDesignerCanvas, setDesignerActionText, snapResizedCanvasInputsToPeers } from './designer.ts'
import { alignCanvasFields, anchorDesignerInputs, captureDesignerPointer, createDesignerHistory, designerAppearanceStyle, designerHistoryReducer, designerStorageKey, designerStyleForField, designerStyleForPart, emptyDesignerDraft, existingCanvasCollisions, layoutDesignerFields, loadDesignerDraft, moveDesignerFieldGroup, resizeCanvasInputs, resizeDesignerEdge, resizeDesignerInputs, resizeDesignerWidth, resetDesignerFields, saveDesignerDraft, selectDesignerPart, selectedDesignerInputs, setDesignerAppearanceProperty, setDesignerProperty, setDesignerTableHeaderHeight, stopDesignerHandleClick, validateDesignerDraft } from './designer.ts'

const formId = 'form-laboratory.persons-synthetic'
const ids = ['personCode', 'firstName', 'lastName', 'address']
const layoutFields = [
  { id: 'personCode', left: 300, top: 10, right: 400, bottom: 65, width: 100, height: 55, inputWidth: 100, inputHeight: 30, labelWidth: 75, labelHeight: 18 },
  { id: 'firstName', left: 170, top: 80, right: 310, bottom: 150, width: 140, height: 70, inputWidth: 140, inputHeight: 36, labelWidth: 90, labelHeight: 20 },
  { id: 'lastName', left: 20, top: 160, right: 160, bottom: 230, width: 140, height: 70, inputWidth: 140, inputHeight: 40, labelWidth: 95, labelHeight: 22 }
]
const page = readFileSync(new URL('../../FormLaboratoryPage.tsx', import.meta.url), 'utf8')
const gesturePreview = readFileSync(new URL('./designerGesturePreview.ts', import.meta.url), 'utf8')
test('background recovery waits for a visual gesture and superseded snapshots cancel every retry',()=>{
 const pending=new Map();let sequence=0,saves=0
 const window={setTimeout:(fn,delay)=>{const id=++sequence;pending.set(id,{fn,delay});return id},clearTimeout:id=>pending.delete(id)}
 const schedule=runInNewContext(stripTypeScriptTypes(gesturePreview.slice(gesturePreview.indexOf('export function scheduleAfterDesignerGesture'))).replace('export function','function')+'\nscheduleAfterDesignerGesture',{window})
 const frame={dataset:{designerGesture:'true'}},fire=()=>{const [id,task]=pending.entries().next().value;pending.delete(id);task.fn()}
 const cancel=schedule(()=>frame,()=>saves++,180)
 assert.equal([...pending.values()][0].delay,180);fire();assert.equal(saves,0);assert.equal([...pending.values()][0].delay,50)
 fire();assert.equal(saves,0);cancel();assert.equal(pending.size,0)
 schedule(()=>frame,()=>saves++,180);fire();delete frame.dataset.designerGesture;fire()
 assert.equal(saves,1);assert.equal(pending.size,0)
})
const designerPanel = readFileSync(new URL('./FormLaboratoryDesignerPanel.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./FormLaboratoryDesignerPanel.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
const picker = readFileSync(new URL('./ExcelColorPicker.tsx', import.meta.url), 'utf8')
// Exercise the actual pure functions in the TSX file without a React/DOM test harness.
const pickerMath = runInNewContext(stripTypeScriptTypes(picker.slice(picker.indexOf('const clamp'), picker.indexOf('export function ExcelColorPicker'))).replace(/^export\s+/gm, '') + '\n({ hexToHsv, hsvToHex, colorProposal, hsvProposal, honeycombColors, colorPickerNavigation })')
import { designerActionDimensionLimits, designerActionStyle, designerActionVisible, designerColorScope, designerEffectiveValues, designerShortcutAction, resizeDesignerActions, setDesignerActionProperty, setDesignerActionTextProperty, setDesignerActionVisibility, setDesignerColorProperty } from './designer.ts'

const laboratoryActions = runInNewContext(stripTypeScriptTypes(page.slice(page.indexOf('const laboratoryDefinition'), page.indexOf('const columns'))) + '\nlaboratoryDefinition.actions')

test('field palette restoration removes old fills once, preserves other settings and backs up the original', () => {
  const stored = { ...emptyDesignerDraft(formId), overrides: { 'firstName::input': { backgroundColor: '#f8cbad', disabledColor: '#d8d8d8', fontSize: 19 }, 'firstName::label': { textColor: '#112233' } }, appearance: { entryFieldBackground: '#ffffff', headerBackground: '#123456' } }
  const values = new Map()
  let saved, saves = 0
  const load = runInNewContext(stripTypeScriptTypes(page.slice(page.indexOf('function loadLaboratoryColorBaseline'), page.indexOf('const previewWidths'))) + '\nloadLaboratoryColorBaseline', {
    loadLaboratoryDraft: () => saved ?? stored, laboratoryDefinition: { id: formId }, fieldIds: ids,
    window: { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } },
    saveDesignerDraft: (_storage, _user, _form, next) => { saved = next; saves++; return true }
  })
  const restored = load('owner')
  assert.equal(restored.overrides['firstName::input'].backgroundColor, undefined)
  assert.equal(restored.overrides['firstName::input'].fontSize, 19)
  assert.equal(restored.defaults.input.backgroundColor, '#f4f6f5')
  assert.equal(restored.appearance.entryFieldBackground, '#d8d8d8')
  assert.equal(restored.appearance.headerBackground, '#123456')
  assert.deepEqual(JSON.parse([...values.entries()].find(([key]) => key.endsWith(':previous-draft'))[1]), stored)
  saved.overrides['firstName::input'].backgroundColor = '#abcdef'
  assert.equal(load('owner').overrides['firstName::input'].backgroundColor, '#abcdef')
  assert.equal(saves, 1)
})

test('designer suspends entry without losing unsaved data and restores it when closed', () => {
  const entered = { personCode: 'unsaved-entry' }, displayed = { personCode: 'display-record' }
  let current = entered
  const context = {
    draft: entered, defaultPersonDraft: displayed, entryDraftBaseline: { current: displayed },
    designerEntrySnapshot: { current: null }, dataEntryActiveRef: { current: true }, designerOpenRef: { current: false }, designerOpen: false,
    editingBaseline: { current: null }, history: { present: emptyDesignerDraft(formId) },
    formGridRef: { current: { querySelectorAll: () => [{ setCustomValidity: value => assert.equal(value, '') }] } },
    updateDraft: next => { current = next }, setDataEntryActive: value => { context.active = value },
    setFrozenCanvas: () => {}, setDesignerOpen: update => { context.designerOpen = update(context.designerOpen) }
  }
  const open = runInNewContext(stripTypeScriptTypes(page.slice(page.indexOf('  const restoreDesignerEntry ='), page.indexOf('  const cancelDesigner ='))) + '\nopenDesigner', context)
  open()
  assert.equal(current, displayed)
  assert.equal(context.dataEntryActiveRef.current, false)
  assert.equal(context.active, false)
  assert.equal(context.designerEntrySnapshot.current, entered)
  assert.equal(context.history.present.formId, formId)
  open()
  assert.equal(current, entered)
  assert.equal(context.dataEntryActiveRef.current, true)
  assert.equal(context.designerEntrySnapshot.current, null)
})

test('field validation is inactive during design and display but remains active during entry', () => {
  let checks = 0
  const context = { designerOpenRef: { current: true }, dataEntryActiveRef: { current: true },
    laboratoryDefinition: { fields: [{ id: 'firstName', required: true }] } }
  const validate = runInNewContext(stripTypeScriptTypes(page.slice(page.indexOf('  const validateRequiredField ='), page.indexOf('  const validateRequiredFields ='))) + '\nvalidateRequiredField', context)
  const control = { setCustomValidity: () => {}, checkValidity: () => { checks++; return true } }
  assert.equal(validate('firstName', control), true)
  context.designerOpenRef.current = false; context.dataEntryActiveRef.current = false
  assert.equal(validate('firstName', control), true)
  assert.equal(checks, 0)
  context.dataEntryActiveRef.current = true
  assert.equal(validate('firstName', control), true)
  assert.equal(checks, 1)
})

test('table header height persists and its designer controls render live font styles without the blank color modal', () => {
  const draft = setDesignerTableHeaderHeight(emptyDesignerDraft(formId), 58)
  assert.equal(draft.tableHeaderHeight, 58)
  assert.equal(validateDesignerDraft(draft, formId, ids).tableHeaderHeight, 58)
  assert.equal(setDesignerTableHeaderHeight(draft, 121), draft)
  assert.match(page, /gridFormatDialog\?\.mode === 'font'/)
  assert.match(page, /gridFormatDialog\?\.mode === 'color'/)
  assert.match(page, /onDesignerHeaderHeightChange:\s*updateTableHeaderHeight/)
  assert.match(page, /setTableStyle\(next, id, 'italic', dialog\.italic\)/)
  assert.doesNotMatch(page, /fontSynthesis:\s*'none'/)
})

test('picker has one navigation state: each Back moves one stage and More always starts Standard', () => {
  const navigate = pickerMath.colorPickerNavigation
  assert.equal(navigate('closed', 'open'), 'quick')
  assert.equal(navigate('quick', 'more'), 'standard')
  assert.equal(navigate('standard', 'custom'), 'custom')
  assert.equal(navigate('custom', 'back'), 'standard')
  assert.equal(navigate('standard', 'back'), 'quick')
  assert.equal(navigate('quick', 'more'), 'standard')
  assert.equal(navigate('custom', 'standard'), 'standard')
  for (const stage of ['quick', 'standard', 'custom']) assert.equal(navigate(stage, 'close'), 'closed')
  assert.doesNotMatch(picker, /setDialogOpen|setTab|setOpen/)
  assert.match(picker, /navigate\('back'\)/)
  assert.doesNotMatch(picker, /setProposed\(colorProposal\(original\)\);.*navigate\('back'\)/)
})

test('all appearance presets share rendering while preserving colors, typography, size and defaults', () => {
  let draft = { ...emptyDesignerDraft(formId), defaults: { input: { backgroundColor: '#d6e6f5' } } }
  draft = setDesignerActionProperty(draft, ['a'], 'backgroundColor', '#4472c4')
  draft = setDesignerActionProperty(draft, ['a'], 'fontSize', 20)
  draft = setDesignerActionProperty(draft, ['a'], 'width', 195)
  draft = setDesignerActionProperty(draft, ['a'], 'appearancePreset', 'raised')
  draft = setDesignerActionProperty(draft, ['b'], 'backgroundColor', '#ff0000')
  draft = setDesignerActionProperty(draft, ['b'], 'appearancePreset', 'flat')
  assert.match(designerActionStyle(draft, 'a')['--lab-shadow'], /inset.*rgb\(0 0 0 \/ 24%\)/)
  assert.equal(designerActionStyle(draft, 'b')['--lab-shadow'], 'none')
  draft = setDesignerProperty(draft, ['firstName::input'], 'appearancePreset', 'inset', ids)
  assert.match(designerStyleForPart(draft, 'firstName', 'input')['--lab-shadow'], /^inset /)
  assert.equal(designerStyleForPart(draft, 'firstName', 'label')['--lab-shadow'], undefined)
  for (const preset of Object.keys(designerAppearancePresets)) {
    const next = setDesignerProperty(draft, ['firstName::input'], 'appearancePreset', preset, ids)
    const style = designerStyleForPart(next, 'firstName', 'input')
    assert.equal(style['--lab-bg'], '#d6e6f5')
    assert.ok(style['--lab-shadow'])
    assert.deepEqual(next.actions, draft.actions)
    assert.deepEqual(next.defaults, draft.defaults)
  }
  draft = setDesignerActionProperty(draft, ['a'], 'shadowBlur', 20)
  draft = setDesignerActionProperty(draft, ['a'], 'appearancePreset', 'pill')
  assert.equal(draft.actions.a.shadowBlur, undefined)
  assert.equal(designerActionStyle(draft, 'a')['--lab-radius'], '100px')
  assert.equal(draft.actions.a.backgroundColor, '#4472c4')
  assert.equal(draft.actions.a.fontSize, 20)
  assert.equal(draft.actions.a.width, 195)
  assert.equal(designerElementAppearanceValues(draft.actions.a).borderRadius, 100)
  assert.deepEqual(designerStyleForPart(emptyDesignerDraft(formId), 'firstName', 'input'), {})
})

test('appearance batches undo atomically and persist all validated effect properties', () => {
  let history = createDesignerHistory(emptyDesignerDraft(formId))
  const targets = ['firstName::input', 'lastName::input']
  history = designerHistoryReducer(history, { type: 'beginTransaction' })
  history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, targets, 'appearancePreset', 'gradient', ids) })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  const batch = history.present
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, batch)
  let draft = history.present
  const settings = { gradientStartColor: '#123456', gradientEndColor: '#abcdef', gradientAngle: 270, gradientEnabled: true, borderWidth: 3, borderStyle: 'dashed', borderRadius: 12, shadowOpacity: 40, shadowOffsetX: -4, shadowOffsetY: 5, shadowBlur: 8, shadowSpread: -2, shadowInset: true, paddingX: 10, paddingY: 6 }
  for (const [key, value] of Object.entries(settings)) {
    draft = setDesignerProperty(draft, targets, key, value, ids)
    draft = setDesignerActionProperty(draft, ['a', 'b'], key, value)
  }
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveDesignerDraft(storage, 'effects-user', formId, draft, ids), true)
  const restored = loadDesignerDraft(storage, 'effects-user', formId, ids)
  assert.deepEqual(restored, draft)
  assert.match(designerStyleForPart(restored, 'firstName', 'input')['--lab-gradient'], /^linear-gradient\(270deg, #123456, #abcdef\)$/)
  assert.match(designerActionStyle(restored, 'a')['--lab-shadow'], /^inset -4px 5px 8px -2px/)
  assert.equal(restored.canvas, undefined)
})

test('appearance rejects unsafe values and context menu opens the same eligible panel controls', () => {
  const draft = emptyDesignerDraft(formId)
  for (const [key, value] of Object.entries({ appearancePreset: '__proto__', borderStyle: 'url(x)', borderWidth: 13, shadowOpacity: 101, shadowOffsetX: -41, shadowBlur: -1, shadowSpread: 41, gradientAngle: 361, gradientStartColor: 'url(x)', gradientEndColor: '#123', paddingX: 41, gradientEnabled: 'yes', shadowInset: 1 })) {
    assert.equal(setDesignerProperty(draft, ['firstName::input'], key, value, ids), draft)
    assert.equal(setDesignerActionProperty(draft, ['a'], key, value), draft)
  }
  assert.match(page, /onElementAppearanceCommit=\{commitElementAppearance\}/)
  assert.match(page, /requestProperty\('appearance'\)/)
  assert.match(page, /requestProperty\('shadow'\)/)
  assert.match(page, /requestProperty\('gradient'\)/)
  assert.match(panel, /supportsAppearance && <details/)
  assert.match(panel, /onBlur=\{props.onFinishPropertyChange\}/)
})

test('context targeting preserves included parts, groups and stable action IDs without mutating selection', () => {
  const fields = ['firstName::input', 'lastName::field']
  assert.deepEqual(contextDesignerSelection(fields, 'firstName::input'), fields)
  assert.deepEqual(contextDesignerSelection(fields, 'lastName::label'), fields)
  assert.deepEqual(contextDesignerSelection(fields, 'address::input'), ['address::input'])
  assert.deepEqual(contextDesignerSelection(['firstName::input'], 'firstName::label'), ['firstName::input'], 'right-clicking another part of a selected field retains the complete field selection')
  assert.deepEqual(contextDesignerSelection(fields, 'address::input', true), [...fields, 'address::input'], 'Ctrl/Command-right-click adds a new target to the current selection')
  assert.deepEqual(contextDesignerSelection(fields, 'firstName::label', true), fields, 'Ctrl/Command-right-click on a selected target does not toggle it out')
  const actions = ['new-person', 'edit-person']
  assert.deepEqual(contextDesignerSelection(actions, 'edit-person'), actions)
  assert.deepEqual(contextDesignerSelection(actions, 'delete-person'), ['delete-person'])
  assert.notEqual(contextDesignerSelection(actions, 'edit-person'), actions)
  assert.deepEqual(fields, ['firstName::input', 'lastName::field'])
})

test('context actions use existing panel controls and exclude incompatible color or sizing targets', () => {
  assert.match(page, /onContextMenu=\{openContextMenu\}/)
  assert.match(page, /createPortal\(<><div ref=\{contextMenuRef\}/)
  assert.match(page, /<div ref=\{contextSubmenuRef\}/)
  assert.match(page, /if \(!action && !field\) \{ if \(activeManagedForm\) setContextMenu\(\{[^}]*part: 'structure'[^}]*\}\); else setContextMenu\(null\); return \}/)
  assert.match(page, /selection.every\(key => !key.endsWith\('::label'\)\)/)
  assert.match(page, /appearanceColors.filter\(command=>command.property==='textColor'\)/)
  assert.match(page, /contextMenu.part==='label'\?'labelColor':command.property/)
  assert.match(panel, /control.querySelector<HTMLButtonElement>\('\.excel-color-trigger'\)\?\.click\(\)/)
  assert.match(panel, /editingAction && id === 'actions' \? keys.filter\(key => key === 'actionBarBackground'\)/)
  assert.match(page, /document.addEventListener\('keydown', escape, true\)/)
})

test('bottom bar represents reference actions once and retains required save metadata', () => {
  assert.deepEqual(Array.from(laboratoryActions, action => action.code), ['Space', 'F2', 'F4', 'Insert', 'Delete', 'Home', 'PgUp', '↑ ↓', 'PgDn', 'End', '⚙', 'F3', 'Esc'])
  assert.equal(new Set(laboratoryActions.map(action => action.id)).size, laboratoryActions.length)
  assert.deepEqual(Array.from(laboratoryActions.filter(action => action.required), action => action.id), ['new-person', 'copy-last', 'copy-selected', 'edit-person', 'delete-person', 'demo-save', 'reset-sample'])
  assert.match(page, /if \(designerOpen \|\| !action \|\| !designerActionVisible/)
  assert.match(panel, /disabled=\{action.required\}/)
})

test('optional action visibility preserves styles through undo, redo, restore and draft reload', () => {
  const optional = { id: 'optional-action' }, required = { id: 'arbitrary-required-action', required: true }
  let draft = setDesignerActionProperty(emptyDesignerDraft(formId), [optional.id], 'backgroundColor', '#112233')
  draft = setDesignerActionProperty(draft, [optional.id], 'width', 183)
  draft = setDesignerActionProperty(draft, [optional.id], 'fontWeight', 600)
  assert.equal(designerActionVisible(draft, optional), true)
  assert.equal(setDesignerActionVisibility(draft, required, false), draft)
  assert.equal(designerActionVisible({ ...draft, actions: { [required.id]: { visible: false } } }, required), true)
  const hidden = setDesignerActionVisibility(draft, optional, false)
  assert.equal(designerActionVisible(hidden, optional), false)
  assert.equal(hidden.actions[optional.id].backgroundColor, '#112233')
  let history = designerHistoryReducer(createDesignerHistory(draft), { type: 'change', draft: hidden })
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, draft)
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, hidden)
  const storageValues = new Map(), storage = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => storageValues.set(key, value) }
  saveDesignerDraft(storage, 'actions-user', formId, hidden, ids)
  const loaded = loadDesignerDraft(storage, 'actions-user', formId, ids)
  assert.deepEqual(loaded, hidden)
  const restored = setDesignerActionVisibility(loaded, optional, true)
  assert.equal(designerActionVisible(restored, optional), true)
  assert.equal(restored.actions[optional.id].width, 183)
  assert.equal(restored.actions[optional.id].fontWeight, 600)
  assert.equal(restored.actions[optional.id].backgroundColor, '#112233')
  assert.equal(setDesignerActionVisibility(draft, { id: '../invalid' }, false), draft)
  assert.equal(validateDesignerDraft({ ...draft, actions: { invalid: { visible: 'false' } } }, formId, ids).actions, undefined)
})

test('shortcuts respect optional visibility; mandatory visibility is independent of mode guards', () => {
  const draft = emptyDesignerDraft(formId)
  assert.equal(designerShortcutAction(draft, laboratoryActions, 'F3').id, 'demo-save')
  assert.equal(designerShortcutAction(draft, laboratoryActions, 'Escape').id, 'reset-sample')
  assert.equal(designerShortcutAction(setDesignerActionVisibility(draft, { id: 'reset-sample' }, false), laboratoryActions, 'Escape').id, 'reset-sample')
  assert.equal(designerShortcutAction(setDesignerActionVisibility(draft, { id: 'next-page' }, false), laboratoryActions, 'PageDown'), undefined)
  for (const key of [' ', 'Insert', 'Delete', 'Home', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'End']) assert.ok(designerShortcutAction(draft, laboratoryActions, key))
  assert.match(page, /const canHandleSpaceNatively = nativeControl && !target\.matches\(':disabled'\)/)
  assert.match(page, /const editingField = target instanceof HTMLElement && \(\(target\.matches\('input, select, textarea'\) && !target\.matches\(':disabled'\)/)
  assert.match(page, /const shortcutKey = laboratoryDefinition.actions\?\.some/)
  assert.match(page, /event.stopPropagation\(\)[\s\S]*target.matches\('input, select, textarea/)
  assert.match(page, /if \(action\) runAction\(action.id, event.key\)/)
  assert.match(page, /target.closest\('\[role="dialog"\], \.excel-color-picker.is-open'\)/)
  assert.match(page, /window.addEventListener\('keydown', startWithSpace, true\)/)
})

test('action numeric and pointer dimensions share limits without touching other action styles', () => {
  let draft = setDesignerActionProperty(emptyDesignerDraft(formId), ['a'], 'width', 150)
  draft = setDesignerActionProperty(draft, ['b'], 'width', 195)
  draft = setDesignerActionProperty(draft, ['b'], 'height', 60)
  draft = setDesignerActionProperty(draft, ['b'], 'backgroundColor', '#4472c4')
  const other = draft.actions.b
  for (const property of ['width', 'height']) {
    const { min, max } = designerActionDimensionLimits[property]
    assert.equal(setDesignerActionProperty(draft, ['a'], property, min - 1), draft)
    assert.equal(setDesignerActionProperty(draft, ['a'], property, max + 1), draft)
    draft = setDesignerActionProperty(draft, ['a'], property, min)
    assert.equal(draft.actions.a[property], min)
    draft = setDesignerActionProperty(draft, ['a'], property, max)
    assert.equal(draft.actions.a[property], max)
  }
  assert.deepEqual(draft.actions.b, other)
  assert.match(page, /resizeDesignerActions\(startDraft, starts, horizontal \? 'width' : 'height', edge, horizontal \? dx : dy\)/)
  assert.match(panel, /designerActionDimensionLimits\[key\]/)
  const resizedGroup = resizeDesignerActions(draft, [{ id: 'a', size: 80 }, { id: 'b', size: 120 }], 'width', 'right', 20)
  assert.equal(resizedGroup.actions.a.width, 100)
  assert.equal(resizedGroup.actions.b.width, 140, 'a group drag applies one delta without collapsing the selected actions to one width')
  assert.equal(resizeDesignerActions(draft, [{ id: 'a', size: 80 }], 'height', 'right', 12), draft, 'horizontal handles cannot alter height')
})

test('footer action multi-select supports group appearance and deletion but keeps text editing singular', () => {
  const panel = readFileSync(new URL('./FormLaboratoryDesignerPanel.tsx', import.meta.url), 'utf8')
  let styled = setDesignerActionProperty(emptyDesignerDraft(formId), ['a', 'b'], 'fontSize', 18)
  styled = setDesignerActionProperty(styled, ['a', 'b'], 'textColor', '#ff0000')
  styled = setDesignerActionTextProperty(styled, ['a', 'b'], 'fa', 'fontSize', 17)
  assert.equal(styled.actions.a.fontSize, 18)
  assert.equal(styled.actions.b.fontSize, 18)
  assert.equal(styled.actions.a.textColor, '#ff0000')
  assert.equal(styled.actions.b.textColor, '#ff0000')
  assert.equal(styled.actions.a.textStyles.fa.fontSize, 17)
  assert.equal(styled.actions.b.textStyles.fa.fontSize, 17)
  assert.equal(styled.actions.a.labels, undefined, 'group typography never changes action text')
  assert.equal(styled.actions.b.labels, undefined, 'group typography never changes action text')
  assert.match(panel, /onSelectAction\(action\.id, event\.ctrlKey \|\| event\.metaKey\)/)
  assert.match(panel, /designer-action-selection-hint/)
  assert.match(panel, /props\.selectedActionIds\.length === 1 && \(\(\) =>/)
  assert.match(panel, /onRemoveSelectedActions/)
  assert.match(page, /event\.key === 'Delete'[\s\S]*?!event\.ctrlKey && !event\.metaKey/)
  assert.match(page, /removeSelectedActions\(\)/)
  assert.match(page, /removeSelectedTableColumns\(\)/)
  assert.match(page, /removeManagedFieldsFromForm\(selectedSchemaFieldIds\)/)
  assert.match(page, /resizeDesignerActions\(startDraft, starts/)
})

test('color scopes resolve compatible selections independently for inputs and labels', () => {
  assert.deepEqual(designerColorScope([], 'backgroundColor', ids), { part: 'input', targets: [], global: true })
  assert.equal(designerColorScope(['firstName::label'], 'borderColor', ids).global, true)
  assert.equal(designerColorScope(['firstName::input'], 'labelColor', ids).global, true)
  assert.deepEqual(designerColorScope(['firstName::input', 'lastName::field', 'address::label'], 'textColor', ids).targets, ['firstName::input', 'lastName::input'])
})

test('palette hover and confirmed colors remain visible on disabled laboratory preview fields', () => {
  const theme = readFileSync(new URL('./formTheme.css', import.meta.url), 'utf8')
  assert.match(picker, /onMouseEnter: \(\) => updateHoverPreview\(color\)/)
  assert.match(picker, /onMouseLeave: \(\) => updateHoverPreview\(null\)/)
  assert.match(page, /onColorPreview=\{previewColorProperty\}/)
  assert.match(page, /onColorCommit=\{commitColorProperty\}/)
  assert.match(page, /setColorPreviewDraft\(setDesignerColorProperty\(historyRef\.current\.present,/)
  assert.match(page, /const partStyle = .*designerStyleForPart\(visibleDraft, id, part\)/)
  assert.match(theme, /background:var\(--lab-disabled,var\(--lab-bg,var\(--form-disabled-fill\)\)\)/)
  assert.match(theme, /#root \.form-laboratory-page:not\(\[data-entry-active\]\) \.laboratory-designer-field:not\(\.laboratory-shared-contact\) \.designer-input-part>:is\(input,select,textarea\) \{\s*background-color:var\(--lab-bg,/)
  assert.match(theme, /\.laboratory-shared-contact \.designer-input-part \.person-number-control \{\s*background:var\(--lab-bg,/)
})

test('shared picker resets repeated confirmations and removes the compact palette behind More Colors', () => {
  const openPicker = picker.slice(picker.indexOf('const openPicker ='), picker.indexOf('const closePicker ='))
  assert.match(openPicker, /activePickerToken = pickerToken.current/)
  assert.match(openPicker, /pointerAction.current = false/)
  assert.match(picker, /const popover = open && !dialogOpen/)
  assert.match(picker, /commitTarget.current = onCommit/)
  assert.match(picker, /const confirm = \(\) => commitColor\(draft\)/)
  assert.match(picker, /if \(\(next \?\? ''\)\.toLowerCase\(\) !== \(original \?\? ''\)\.toLowerCase\(\)\) commitTarget\.current\(next\)/)
  assert.match(picker, /if \(pointerAction\.current\) \{ pointerAction\.current = false; return \}/)
  assert.match(picker, /event.key === 'Escape'/)
})

test('background palette exposes solid and gradient modes, colors, direction and live preview', () => {
  assert.match(picker, /excel-gradient-controls/)
  assert.match(picker, /Solid color/)
  assert.match(picker, /Gradient preview/)
  assert.match(picker, /type="color" value=\{gradient\.start\}/)
  assert.match(picker, /type="color" value=\{gradient\.end\}/)
  assert.match(picker, /gradient\.onChange\(\{ enabled: false \}\)/)
  assert.match(panel, /gradient=\{gradient\}/)
  assert.match(panel, /onElementAppearanceCommit\('gradientEnabled', false\)/)
  assert.match(panel, /gradient: '\[data-designer-color-property="backgroundColor"\] \.excel-color-trigger'/)
})

test('Standard honeycomb has 217 distinct hexagonal colors across all hue families', () => {
  const tiles = pickerMath.honeycombColors
  assert.equal(tiles.length, 217)
  assert.equal(new Set(tiles.map(tile => tile.color)).size, 217)
  assert.equal(new Set(tiles.filter(tile => pickerMath.hexToHsv(tile.color)[1] > 0.1).map(tile => Math.floor(pickerMath.hexToHsv(tile.color)[0] / 45))).size, 8)
  assert.ok(tiles.every(tile => tile.x > 0 && tile.x < 300 && tile.y > 0 && tile.y < 264))
  assert.ok(tiles.filter(tile => Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(tile.q + tile.r)) === 8).every(tile => pickerMath.hexToHsv(tile.color)[2] < 0.56))
  assert.match(picker, /role="button"[\s\S]*aria-pressed=\{draft\?\.toLowerCase\(\) === tile.color\}/)
  assert.match(picker, /<svg className="excel-grayscale"/)
})

test('HSV picker round-trips RGB, covers all primaries and retains achromatic pointer positions', () => {
  const primaries = [[0, 1, 1, '#ff0000'], [120, 1, 1, '#00ff00'], [240, 1, 1, '#0000ff'], [60, 1, 1, '#ffff00'], [180, 1, 1, '#00ffff'], [300, 1, 1, '#ff00ff'], [0, 0, 1, '#ffffff'], [0, 1, 0, '#000000']]
  for (const [h, s, v, hex] of primaries) assert.equal(pickerMath.hsvToHex(h, s, v), hex)
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')
    assert.equal(pickerMath.hsvToHex(...pickerMath.hexToHsv(hex)), hex)
  }
  assert.deepEqual([...pickerMath.colorProposal('#000000', [240, 0.75, 1]).hsv], [240, 0.75, 0])
  assert.deepEqual([...pickerMath.colorProposal('#ffffff', [240, 0.75, 1]).hsv], [240, 0, 1])
  assert.equal(pickerMath.hsvProposal([180, 1, 1]).hexInput, '#00FFFF')
  assert.match(picker, /setPointerCapture\(event.pointerId\)/)
  assert.match(picker, /hasPointerCapture\(event.pointerId\)/)
  assert.match(picker, /aria-orientation="vertical"/)
  assert.match(picker, /const hue = Math.round\(clamp\(\(event.clientX - rect.left\) \/ rect.width, 0, 1\) \* 360\)/)
  assert.match(picker, /return \[hue, saturation, spectrumValue\]/)
  assert.match(picker, /const chooseSpectrum = \(event: ReactPointerEvent<HTMLDivElement>\) => \{[\s\S]*?const next = hsvProposal\(\[hue, saturation, proposed\.hsv\[2\]\]\)/)
})

test('global color defaults stay sparse and preserve selected overrides and legacy drafts', () => {
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['firstName::input'], 'backgroundColor', '#112233', ids)
  draft = setDesignerColorProperty(draft, [], 'backgroundColor', '#aabbcc', ids)
  draft = setDesignerColorProperty(draft, [], 'labelColor', '#ccbbdd', ids)
  assert.deepEqual(draft.defaults, { input: { backgroundColor: '#aabbcc' }, label: { textColor: '#ccbbdd' } })
  assert.deepEqual(Object.keys(draft.overrides), ['firstName::input'])
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-bg'], '#112233')
  assert.equal(designerStyleForPart(draft, 'lastName', 'input')['--lab-bg'], '#aabbcc')
  assert.equal(designerStyleForPart(draft, 'lastName', 'label')['--lab-text'], '#ccbbdd')
  draft = setDesignerColorProperty(draft, ['firstName::input'], 'backgroundColor', undefined, ids)
  assert.equal(designerEffectiveValues(draft, 'firstName', 'input').backgroundColor, '#aabbcc')
  draft = setDesignerProperty(draft, ['address'], 'textColor', '#abcdef', ids)
  draft = setDesignerColorProperty(draft, ['address::input'], 'textColor', undefined, ids)
  assert.equal(designerEffectiveValues(draft, 'address', 'label').textColor, '#abcdef')
  assert.equal(designerEffectiveValues(draft, 'address', 'input').textColor, undefined)
  assert.deepEqual(validateDesignerDraft(draft, formId, ids), draft)
})

test('selected color batches are atomic and persist separately from global defaults', () => {
  let history = createDesignerHistory(setDesignerColorProperty(emptyDesignerDraft(formId), [], 'textColor', '#aabbcc', ids))
  history = designerHistoryReducer(history, { type: 'change', draft: setDesignerColorProperty(history.present, ['firstName::input', 'lastName::input'], 'textColor', '#112233', ids) })
  assert.equal(history.past.length, 1)
  assert.equal(designerEffectiveValues(history.present, 'address', 'input').textColor, '#aabbcc')
  const changed = history.present
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.equal(designerEffectiveValues(history.present, 'firstName', 'input').textColor, '#aabbcc')
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, changed)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveDesignerDraft(storage, 'scope-user', formId, changed, ids)
  assert.deepEqual(loadDesignerDraft(storage, 'scope-user', formId, ids), changed)
})

test('action identities keep color, dimensions and typography independent through history and reload', () => {
  let draft = setDesignerActionProperty(emptyDesignerDraft(formId), ['first-action'], 'backgroundColor', '#112233')
  draft = setDesignerActionProperty(draft, ['future-action'], 'backgroundColor', '#aabbcc')
  draft = setDesignerActionProperty(draft, ['first-action'], 'width', 180)
  draft = setDesignerActionProperty(draft, ['first-action'], 'height', 60)
  draft = setDesignerActionProperty(draft, ['first-action'], 'fontSize', 20)
  draft = setDesignerActionProperty(draft, ['first-action'], 'hoverTextColor', '#ffffff')
  assert.equal(designerActionStyle(draft, 'first-action')['--lab-width'], '180px')
  assert.equal(designerActionStyle(draft, 'first-action')['--lab-action-hover-text'], '#ffffff')
  assert.equal(designerActionStyle(draft, 'future-action')['--lab-width'], undefined)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveDesignerDraft(storage, 'actions-user', formId, draft, ids)
  assert.deepEqual(loadDesignerDraft(storage, 'actions-user', formId, ids), draft)
  let history = designerHistoryReducer(createDesignerHistory(emptyDesignerDraft(formId)), { type: 'change', draft })
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.equal(history.present.actions, undefined)
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present.actions, draft.actions)
  assert.equal(setDesignerActionProperty(draft, ['first-action'], 'width', -1), draft)
})

const canvas = {
  width: 800, height: 400,
  fields: {
    firstName: { input: { left: 100, top: 100, width: 120, height: 32 }, label: { left: 100, top: 74, width: 80, height: 18 } },
    lastName: { input: { left: 260, top: 100, width: 120, height: 32 }, label: { left: 260, top: 74, width: 90, height: 18 } },
    phone: { input: { left: 100, top: 190, width: 120, height: 32 }, label: { left: 100, top: 164, width: 60, height: 18 } }
  }
}

test('fixed-edge resize clamps to visible obstacles without moving unrelated fields', () => {
  const before = JSON.parse(JSON.stringify(canvas))
  const grown = resizeCanvasInputs(canvas, ['firstName'], 'right', 200)
  assert.equal(grown.fields.firstName.input.left, 100)
  assert.equal(grown.fields.firstName.input.right ?? grown.fields.firstName.input.left + grown.fields.firstName.input.width, 252)
  assert.deepEqual(grown.fields.lastName, before.fields.lastName)
  assert.deepEqual(grown.fields.phone, before.fields.phone)
  const top = resizeCanvasInputs(canvas, ['firstName'], 'bottom', 140)
  assert.equal(top.fields.firstName.input.top, 100)
  assert.equal(top.fields.firstName.input.height, 56)
  assert.deepEqual(top.fields.phone, before.fields.phone)
})

test('alignment uses a fixed reference and is atomic when an obstacle blocks it', () => {
  const aligned = alignCanvasFields(canvas, ['firstName', 'phone'], 'firstName', 'left')
  assert.equal(aligned.blockedBy, undefined)
  assert.equal(aligned.canvas.fields.firstName.input.left, 100)
  assert.equal(aligned.canvas.fields.phone.input.left, 100)
  const blocked = alignCanvasFields(canvas, ['firstName', 'lastName'], 'firstName', 'right')
  assert.ok(blocked.blockedBy)
  assert.deepEqual(blocked.canvas, canvas)
  assert.deepEqual(existingCanvasCollisions(canvas), [])
})

test('captured canvas geometry survives draft validation and reload', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const draft = { ...emptyDesignerDraft(formId), canvas }
  const canvasIds = ['firstName', 'lastName', 'phone']
  assert.equal(saveDesignerDraft(storage, 'geometry-user', formId, draft, canvasIds), true)
  assert.deepEqual(loadDesignerDraft(storage, 'geometry-user', formId, ids).canvas, undefined)
  assert.deepEqual(loadDesignerDraft(storage, 'geometry-user', formId, canvasIds).canvas, canvas)
})

test('individual, group and all-field changes stay sparse per-field and per-property', () => {
  const empty = emptyDesignerDraft(formId)
  const individual = setDesignerProperty(empty, ['personCode'], 'fontSize', 18, ids)
  const group = setDesignerProperty(individual, ['firstName', 'lastName'], 'italic', true, ids)
  const all = setDesignerProperty(group, ids, 'focusColor', '#123456', ids)
  assert.equal(all.overrides.personCode.fontSize, 18)
  assert.equal(all.overrides.firstName.italic, true)
  assert.equal(all.overrides.lastName.italic, true)
  assert.equal(all.overrides.address.focusColor, '#123456')
  assert.deepEqual(empty.overrides, {})
  assert.deepEqual(resetDesignerFields(all, ['firstName', 'lastName']).overrides.firstName, undefined)
})

test('label and input can be selected, styled, reset and persisted independently', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerProperty(draft, ['firstName::label'], 'textColor', '#123456', ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'backgroundColor', '#abcdef', ids)
  assert.equal(draft.overrides.firstName, undefined)
  assert.equal(designerStyleForPart(draft, 'firstName', 'label')['--lab-text'], '#123456')
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-bg'], '#abcdef')
  assert.equal(designerStyleForPart(draft, 'lastName', 'input')['--lab-bg'], undefined)
  const restored = validateDesignerDraft(draft, formId, ids)
  assert.deepEqual(restored.overrides, draft.overrides)
  assert.deepEqual(resetDesignerFields(restored, ['firstName::label']).overrides['firstName::label'], undefined)
})

test('element dimensions and grid-relative position are validated, styled and preserved', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerProperty(draft, ['firstName::input'], 'width', 240, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'height', 42, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetX', 12, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetY', -6, ids)
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-width'], '240px')
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-height'], '42px')
  assert.equal(designerStyleForPart(draft, 'firstName', 'label')['--lab-offset'], 'translate(12px, -6px)')
  assert.deepEqual(validateDesignerDraft(draft, formId, ids).overrides, draft.overrides)
})

test('moving an input group preserves label spacing and leaves both element sizes unchanged', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetX', 8, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetY', 3, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'offsetX', 8, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'offsetY', 35, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'width', 220, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'fontSize', 17, ids)
  const moved = moveDesignerFieldGroup(draft, 'firstName', 24, 12, ids)
  assert.equal(moved.overrides['firstName::label'].offsetX, 32)
  assert.equal(moved.overrides['firstName::input'].offsetX, 32)
  assert.equal(moved.overrides['firstName::label'].offsetY, 15)
  assert.equal(moved.overrides['firstName::input'].offsetY, 47)
  assert.equal(moved.overrides['firstName::input'].width, 220)
  assert.equal(moved.overrides['firstName::label'].fontSize, 17)
})

test('mouse width resizing follows the visual handle edge and clamps dimensions', () => {
  assert.equal(resizeDesignerWidth(200, 20, 'left'), 180)
  assert.equal(resizeDesignerWidth(200, -20, 'left'), 220)
  assert.equal(resizeDesignerWidth(200, -20, 'right'), 180)
  assert.equal(resizeDesignerWidth(200, 20, 'right'), 220)
  assert.equal(resizeDesignerWidth(55, 20, 'left'), 48)
  assert.equal(resizeDesignerWidth(990, -20, 'left'), 1000)
})

test('four-edge resizing follows physical pointer movement and keeps the opposite edge fixed', () => {
  assert.deepEqual(resizeDesignerEdge(200, 20, 'left', 48, 1000), { size: 180, positionDelta: 20 })
  assert.deepEqual(resizeDesignerEdge(200, -20, 'left', 48, 1000), { size: 220, positionDelta: -20 })
  assert.deepEqual(resizeDesignerEdge(200, 20, 'right', 48, 1000), { size: 220, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(200, -20, 'right', 48, 1000), { size: 180, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(40, 10, 'top', 24, 600), { size: 30, positionDelta: 10 })
  assert.deepEqual(resizeDesignerEdge(40, -10, 'top', 24, 600), { size: 50, positionDelta: -10 })
  assert.deepEqual(resizeDesignerEdge(40, 10, 'bottom', 24, 600), { size: 50, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(40, -10, 'bottom', 24, 600), { size: 30, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(50, 20, 'left', 48, 1000), { size: 48, positionDelta: 2 })
  assert.deepEqual(resizeDesignerEdge(590, 20, 'bottom', 24, 600), { size: 600, positionDelta: 0 })
  assert.match(page, /designer-edge-\$\{edge\}/)
  assert.match(page, /resizeCanvasHandle\(initialCanvas, targets, edge, dx, dy,neighborResizeFor\(startDraft\),interactionBounds\)/)
})

test('direct input selection replaces a parent selection, supports Ctrl selection and never selects a label', () => {
  const single = selectDesignerPart(['firstName::field'], 'firstName', 'input', false)
  assert.deepEqual(single, ['firstName::input'])
  const multiple = selectDesignerPart(single, 'lastName', 'input', true)
  assert.deepEqual(multiple, ['firstName::input', 'lastName::input'])
  assert.deepEqual(selectDesignerPart(multiple, 'lastName', 'input', true), single)
  assert.deepEqual(selectedDesignerInputs([...multiple, 'address::label', 'firstName::field'], ids), ['firstName', 'lastName'])
})

class PointerHandle extends EventTarget {
  captured = new Set()
  releases = 0
  setPointerCapture(id) { this.captured.add(id) }
  hasPointerCapture(id) { return this.captured.has(id) }
  releasePointerCapture(id) { this.captured.delete(id); this.releases++; this.send('lostpointercapture', id) }
  send(type, pointerId = 7, clientX = 100, clientY = 50) {
    this.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY }))
  }
}

function pointerStart(handle) {
  return { currentTarget: handle, button: 0, pointerId: 7, clientX: 100, clientY: 50, prevented: false, stopped: false,
    preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
}

test('pointer completion distinguishes a released click from cancellation and cleanup',()=>{
 for(const type of ['pointerup','pointercancel','lostpointercapture','cleanup']){
  const handle=new PointerHandle();let reason='pending'
  const cleanup=captureDesignerPointer(pointerStart(handle),()=>{},event=>{reason=event?.type})
  if(type==='cleanup')cleanup();else handle.send(type)
  assert.equal(reason,type==='cleanup'?undefined:type)
 }
})

test('resize handle owns capture, ignores other pointers, releases once and blocks parent click selection', () => {
  const handle = new PointerHandle(), start = pointerStart(handle), deltas = []
  let ended = 0
  const cleanup = captureDesignerPointer(start, (dx, dy) => deltas.push([dx, dy]), () => ended++)
  assert.equal(start.prevented, true)
  assert.equal(start.stopped, true)
  assert.equal(handle.hasPointerCapture(7), true)
  handle.send('pointermove', 8, 500, 500)
  handle.send('pointerup', 8)
  handle.send('pointermove', 7, 115, 42)
  assert.deepEqual(deltas, [[15, -8]])
  handle.send('pointerup')
  cleanup()
  handle.send('pointermove', 7, 130, 60)
  assert.equal(ended, 1)
  assert.equal(handle.releases, 1)
  assert.equal(handle.hasPointerCapture(7), false)
  assert.deepEqual(deltas, [[15, -8]])
  const click = pointerStart(handle)
  let selection = ['firstName::input', 'lastName::input']
  stopDesignerHandleClick(click)
  if (!click.stopped) selection = selectDesignerPart(selection, 'firstName', 'input', false)
  assert.equal(click.prevented, true)
  assert.deepEqual(selection, ['firstName::input', 'lastName::input'])
})

test('pointer cancellation, lost capture and component cleanup each finish a gesture once', () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'cleanup']) {
    const handle = new PointerHandle()
    let ended = 0
    const cleanup = captureDesignerPointer(pointerStart(handle), () => {}, () => ended++)
    if (reason === 'cleanup') cleanup()
    else handle.send(reason)
    cleanup()
    assert.equal(ended, 1)
    assert.equal(handle.hasPointerCapture(7), false)
  }
})

test('all four edges resize rendered inputs only, retain labels and anchor the opposite edge after RTL reflow', () => {
  let initial = emptyDesignerDraft(formId)
  initial = setDesignerProperty(initial, ['firstName::label'], 'width', 260, ids)
  initial = setDesignerProperty(initial, ['firstName::label'], 'fontSize', 17, ids)
  // A stale/inherited width must not replace the actual rendered input measurement.
  initial = setDesignerProperty(initial, ['firstName'], 'width', 400, ids)
  const input = { id: 'firstName', left: 100, top: 50, width: 200, height: 40, labelLeft: 100, labelTop: 20 }
  for (const [edge, inward, dimension, expected, anchoredLeft, anchoredTop] of [
    ['left', 20, 'width', 180, 120, 50], ['right', -20, 'width', 180, 100, 50],
    ['top', 10, 'height', 30, 100, 60], ['bottom', -10, 'height', 30, 100, 50]
  ]) {
    const result = resizeDesignerInputs(initial, [input], edge, inward, ids)
    assert.equal(result.draft.overrides['firstName::input'][dimension], expected)
    assert.deepEqual(result.draft.overrides['firstName::label'], initial.overrides['firstName::label'])
    assert.deepEqual(result.anchors[0], { id: 'firstName', left: anchoredLeft, top: anchoredTop, labelLeft: 100, labelTop: 20 })
    const corrected = anchorDesignerInputs(result.draft, result.anchors, [{ ...input, left: 120, top: 60, labelTop: 30 }], ids)
    assert.equal(120 + Number(corrected.overrides['firstName::input'].offsetX ?? 0), anchoredLeft)
    assert.equal(60 + Number(corrected.overrides['firstName::input'].offsetY ?? 0), anchoredTop)
    assert.equal(corrected.overrides['firstName::label'].width, 260)
    assert.equal(corrected.overrides['firstName::label'].fontSize, 17)
    assert.equal(30 + Number(corrected.overrides['firstName::label'].offsetY ?? 0), 20)
    const outward = resizeDesignerInputs(initial, [input], edge, -inward, ids)
    assert.equal(outward.draft.overrides['firstName::input'][dimension], dimension === 'width' ? 220 : 50)
  }
  const resizeHandler = page.slice(page.indexOf('const beginInputResize'), page.indexOf('const beginFieldMove'))
  assert.doesNotMatch(resizeHandler, /moveDesignerFieldGroup/)
  assert.match(resizeHandler, /captureDesignerVisualPointer/, 'snapping uses the release-only shared commit callback')
  assert.match(gesturePreview, /if\(ended\?\.type==='pointerup'\)commit\(\)/, 'snapping happens only after a completed pointer-up')
  assert.match(resizeHandler, /snapResizedCanvasInputsToPeers\(final,targets,edge,neighborResizeFor\(startDraft\),interactionBounds\)/, 'edge snapping respects the active shared-boundary resize policy')
  assert.match(resizeHandler, /withCanvas\(startDraft,snapped,sourceSection,false\)/, 'snap commit does not recenter the canvas')
  assert.doesNotMatch(resizeHandler, /autoAlignDesignerCanvas/, 'a resize never runs full layout or moves peer fields')
  assert.ok(page.includes("element.querySelector('.designer-input-part')"), 'capture the shared input wrapper, including composite controls')
  assert.doesNotMatch(page, /className=\{selected \? 'designer-part-selected'/)
})

test('bottom action editing exposes per-button bilingual text and separate locale formatting',()=>{
 assert.match(designerPanel,/className="designer-action-edit-text"/)
 assert.match(designerPanel,/setPendingActionTextEditor\(action.id\)/)
 assert.match(designerPanel,/onSelectAction\(action.id, false\)/)
 assert.match(designerPanel,/data-action-label=\{locale\}/)
 assert.match(designerPanel,/onOpenFontFormatDialog\(locale\)/,'each locale has its own font, size and color editor')
 assert.match(designerPanel,/input\.focus\(\{ preventScroll: true \}\)/,'the edit action reveals and focuses the Persian label field')
 const initial=emptyDesignerDraft('action-labels')
 const action={id:'new-person',code:'Space',label:{fa:'شخص جدید',en:'New person',zh:'新增'}}
 const editedFa=setDesignerActionText(initial,action.id,'fa','نخ جدید')
 const editedBoth=setDesignerActionText(editedFa,action.id,'en','New yarn')
 assert.equal(designerActionLabel(editedBoth,action,'fa'),'نخ جدید')
 assert.equal(designerActionLabel(editedBoth,action,'en'),'New yarn')
 assert.equal(designerActionLabel(editedBoth,action,'zh'),'新增','editing one button language leaves the others intact')
 const faStyled=setDesignerActionTextProperty(editedBoth,[action.id],'fa','fontSize',18)
 const independentlyStyled=setDesignerActionTextProperty(faStyled,[action.id],'en','textColor','#ff0000')
 assert.equal(designerActionTextStyle(independentlyStyled,action.id,'fa').fontSize,'18px')
 assert.equal(designerActionTextStyle(independentlyStyled,action.id,'en').color,'#ff0000')
 assert.equal(designerActionTextStyle(independentlyStyled,action.id,'zh').fontSize,undefined)
 assert.equal(designerActionLabel(initial,action,'fa'),'شخص جدید','edits do not mutate the source draft')
})

test('manual field drags commit the selected placement without a second layout pass',()=>{
 const moveHandler=page.slice(page.indexOf('const beginFieldMove'),page.indexOf('const rectStyle'))
 assert.match(moveHandler,/const initialCanvas=candidateCanvas/,'dragging preserves the existing Canvas bounds')
 assert.doesNotMatch(moveHandler,/expandCanvasToEditorViewport/,'moving a field does not expand the form viewport')
 assert.doesNotMatch(moveHandler,/autoAlignDesignerCanvas\(/,'release must not snap an explicit placement back to a previous row')
 assert.match(moveHandler,/final=moved;visual.paint\(moved\)/,'movement paints the shared calculated geometry')
 assert.match(moveHandler,/withCanvas\(startDraft,final,sourceSection,false\)/,'release preserves the surrounding geometry and row origin')
 assert.match(moveHandler,/finishGesture\(\)/,'the complete gesture is committed atomically')
})

test('multi-input pointer resize remains one undo/redo operation and never changes label dimensions', () => {
  const inputs = ['firstName', 'lastName'].map((id, index) => ({ id, left: index * 240, top: 50, width: 200 + index * 30, height: 40, labelLeft: index * 240, labelTop: 20 }))
  let initial = setDesignerProperty(emptyDesignerDraft(formId), ['firstName::label', 'lastName::label'], 'fontSize', 18, ids)
  initial = setDesignerProperty(initial, ['firstName::label', 'lastName::label'], 'height', 25, ids)
  let history = designerHistoryReducer(createDesignerHistory(initial), { type: 'beginTransaction' })
  const handle = new PointerHandle()
  captureDesignerPointer(pointerStart(handle), dx => {
    const result = resizeDesignerInputs(initial, inputs, 'right', dx, ids)
    history = designerHistoryReducer(history, { type: 'change', draft: result.draft })
  }, () => { history = designerHistoryReducer(history, { type: 'commitTransaction' }) })
  handle.send('pointermove', 7, 110, 50)
  handle.send('pointermove', 7, 125, 50)
  handle.send('pointerup')
  const resized = history.present
  assert.equal(resized.overrides['firstName::input'].width, 225)
  assert.equal(resized.overrides['lastName::input'].width, 255)
  assert.deepEqual(resized.overrides['firstName::label'], initial.overrides['firstName::label'])
  assert.deepEqual(resized.overrides['lastName::label'], initial.overrides['lastName::label'])
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, initial)
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, resized)
})

test('moving inputs retains inherited offsets and preserves both elements sizes', () => {
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['firstName'], 'offsetX', 30, ids)
  draft = setDesignerProperty(draft, ['firstName'], 'offsetY', 20, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'width', 150, ids)
  const moved = moveDesignerFieldGroup(draft, 'firstName', 12, -5, ids)
  assert.equal(moved.overrides['firstName::input'].offsetX, 42)
  assert.equal(moved.overrides['firstName::label'].offsetX, 42)
  assert.equal(moved.overrides['firstName::input'].offsetY, 15)
  assert.equal(moved.overrides['firstName::label'].offsetY, 15)
  assert.equal(moved.overrides['firstName::input'].width, 150)
  assert.equal(moved.overrides['firstName::label'].width, undefined)
})

test('horizontal layout arranges RTL field groups without resizing inputs, with chosen gaps and independent labels', () => {
  const start = emptyDesignerDraft(formId)
  const arranged = layoutDesignerFields(start, layoutFields, { operation: 'arrange', orientation: 'horizontal', gap: 18, rtl: true }, ids)
  const groups = layoutFields.map(field => {
    const dx = Number(arranged.overrides[`${field.id}::input`]?.offsetX ?? 0)
    const width = Math.max(field.labelWidth, field.width)
    return { field, left: field.left + dx, right: field.left + dx + width }
  }).sort((a, b) => b.right - a.right)
  assert.equal(arranged.overrides['personCode::input']?.width, undefined)
  assert.equal(arranged.overrides['personCode::input']?.height, undefined)
  assert.equal(arranged.overrides['firstName::input']?.width, undefined)
  assert.equal(arranged.overrides['lastName::input']?.height, undefined)
  assert.equal(arranged.overrides['firstName::label'].width, undefined)
  assert.equal(arranged.overrides['firstName::label'].height, undefined)
  assert.equal(arranged.overrides['firstName::label'].offsetX, arranged.overrides['firstName::input'].offsetX)
  assert.equal(arranged.overrides['firstName::label'].offsetY, arranged.overrides['firstName::input'].offsetY)
  assert.ok(Math.abs((groups[0].left - groups[1].right) - 18) < 1)
  assert.ok(Math.abs((groups[1].left - groups[2].right) - 18) < 1)
  assert.ok(groups[0].field.labelWidth !== groups[1].field.labelWidth)
})

test('vertical layout aligns field groups and distributes exact non-overlapping gaps', () => {
  const start = emptyDesignerDraft(formId)
  const arranged = layoutDesignerFields(start, layoutFields, { operation: 'arrange', orientation: 'vertical', gap: 21, rtl: true }, ids)
  const groups = layoutFields.map(field => ({ field, top: field.top + Number(arranged.overrides[`${field.id}::input`]?.offsetY ?? 0), left: field.left + Number(arranged.overrides[`${field.id}::input`]?.offsetX ?? 0) })).sort((a, b) => a.top - b.top)
  assert.equal(arranged.overrides['personCode::input'].width, undefined)
  assert.equal(arranged.overrides['lastName::input'].height, undefined)
  assert.equal(arranged.overrides['lastName::label'].width, undefined)
  assert.equal(arranged.overrides['lastName::label'].height, undefined)
  assert.equal(arranged.overrides['lastName::label'].offsetX, arranged.overrides['lastName::input'].offsetX)
  assert.equal(arranged.overrides['lastName::label'].offsetY, arranged.overrides['lastName::input'].offsetY)
  assert.ok(groups.every(group => group.left + Math.max(group.field.width, group.field.labelWidth) === groups[0].left + Math.max(groups[0].field.width, groups[0].field.labelWidth)))
  const groupHeights = layoutFields.map(field => Math.max(field.labelHeight, field.height))
  assert.ok(Math.abs((groups[1].top - groups[0].top) - (groupHeights[0] + 21)) < 1)
  assert.ok(Math.abs((groups[2].top - groups[1].top) - (groupHeights[1] + 21)) < 1)
})

test('large RTL rows retain non-overlapping gaps beyond the normal drag offset range', () => {
  const manyIds = Array.from({ length: 12 }, (_, index) => `field${index}`)
  const manyFields = manyIds.map((id, index) => ({ id, left: 0, top: index * 64, right: 100, bottom: index * 64 + 50, width: 100, height: 50, inputWidth: 100, inputHeight: 30, labelWidth: 80, labelHeight: 18 }))
  const arranged = layoutDesignerFields(emptyDesignerDraft(formId), manyFields, { operation: 'arrange', orientation: 'horizontal', gap: 20, rtl: true }, manyIds)
  const groups = manyFields.map(field => {
    const dx = Number(arranged.overrides[`${field.id}::input`]?.offsetX ?? 0)
    return { left: field.left + dx, right: field.left + dx + 100 }
  }).sort((a, b) => b.right - a.right)
  assert.ok(Math.max(...manyIds.map(id => Math.abs(Number(arranged.overrides[`${id}::input`]?.offsetX ?? 0)))) > 500)
  assert.ok(groups.slice(1).every((group, index) => Math.abs((groups[index].left - group.right) - 20) < 1))
})

test('each batch layout is one undo and redo step and persists through draft save and load', () => {
  const start = emptyDesignerDraft(formId)
  const batch = layoutDesignerFields(start, layoutFields, { operation: 'arrange', orientation: 'horizontal', gap: 16, rtl: false }, ids)
  let history = designerHistoryReducer(createDesignerHistory(start), { type: 'change', draft: batch })
  assert.equal(history.past.length, 1)
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveDesignerDraft(storage, 'user-layout', formId, history.present, ids), true)
  assert.deepEqual(loadDesignerDraft(storage, 'user-layout', formId, ids).overrides, batch.overrides)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present.overrides, batch.overrides)
})

test('draft validation rejects arbitrary CSS and invalid values while retaining known overrides', () => {
  const clean = validateDesignerDraft({
    format: 'yarn-trade.form-designer-draft', schemaVersion: 1, formId,
    overrides: { personCode: { fontFamily: 'url(javascript:alert(1))', backgroundColor: 'red', textColor: '#AABBCC', customCss: 'body{}' }, unknownField: { fontSize: 20 } }
  }, formId, ids)
  assert.deepEqual(clean.overrides, { personCode: { textColor: '#aabbcc' } })
  assert.equal(validateDesignerDraft({ format: 'wrong', schemaVersion: 2 }, formId, ids).formId, formId)
})

test('all typography and visual-state overrides map to immediate safe field styles and inherit on reset', () => {
  let draft = emptyDesignerDraft(formId)
  const values = { fontFamily: 'tahoma', fontSize: 18, fontWeight: 600, bold: true, italic: true, textAlign: 'center', lineHeight: 1.7, backgroundColor: '#ffffff', textColor: '#202a31', labelColor: '#69747b', borderColor: '#d7dee2', focusColor: '#0e7490', focusBackgroundColor: '#fff4cc', focusTextColor: '#153e75', focusBorderColor: '#0b6e4f', focusLabelColor: '#8a4b08', hoverColor: '#e9f4f5', selectedColor: '#d99a30', disabledColor: '#eef1f3', errorColor: '#c24141' }
  for (const [property, setting] of Object.entries(values)) draft = setDesignerProperty(draft, ['personCode'], property, setting, ids)
  const style = designerStyleForField(draft, 'personCode')
  assert.equal(style['--lab-font-size'], '18px')
  assert.equal(style['--lab-text-align'], 'center')
  assert.equal(style['--lab-line-height'], '1.7')
  for (const property of ['--lab-bg', '--lab-text', '--lab-label', '--lab-border', '--lab-focus', '--lab-focus-bg', '--lab-focus-text', '--lab-focus-border', '--lab-focus-label', '--lab-hover', '--lab-selected', '--lab-disabled', '--lab-error']) assert.ok(property in style)
  draft = setDesignerProperty(draft, ['personCode'], 'fontFamily', undefined, ids)
  assert.equal(designerStyleForField(draft, 'personCode')['--lab-font'], undefined)
})

test('Ctrl+L levels labels with fields, uses the densest row as its size unit, and centers each row', () => {
  const field = (left, top, width, labelWidth = 42) => ({
    input: { left, top, width, height: 34 },
    label: { left: left + width - labelWidth, top: top - 24, width: labelWidth, height: 18 }
  })
  const fields = {
    code: field(930, 70, 102), name: field(690, 70, 210), material: field(520, 70, 103),
    gender: field(370, 70, 99), luster: field(220, 70, 101),
    yarnGroup: field(660, 165, 98), unit: field(540, 165, 102), filament: field(420, 165, 101),
    countType: field(300, 165, 99), yarnNumber: field(180, 165, 103), countValue: field(60, 165, 100)
  }
  const leveled = levelDesignerCanvas({ width: 1200, height: 340, fields }, { rtl: true, fieldIds: Object.keys(fields) })
  assert.equal(leveled.width, 1200, 'Ctrl+L must preserve the existing width when the normalized rows fit')
  const denseRow = ['yarnGroup', 'unit', 'filament', 'countType', 'yarnNumber', 'countValue'].map(id => leveled.fields[id])
  assert.ok(denseRow.every(item => Math.abs(item.input.width - denseRow[0].input.width) < 0.1))
  assert.ok(denseRow.every(item => Math.abs(item.input.height - 34) < 0.1))
  const ordered = [...denseRow].sort((a, b) => a.input.left - b.input.left)
  const gaps = ordered.slice(1).map((item, index) => item.input.left - (ordered[index].input.left + ordered[index].input.width))
  assert.ok(gaps.every(gap => Math.abs(gap - gaps[0]) < 0.1))
  const cellWidth = denseRow[0].input.width
  const horizontalGap = gaps[0]
  assert.ok(Math.abs(leveled.fields.name.input.width - (cellWidth * 2 + horizontalGap)) < 0.1)
  for (const ids of [['code', 'name', 'material', 'gender', 'luster'], ['yarnGroup', 'unit', 'filament', 'countType', 'yarnNumber', 'countValue']]) {
    const row = ids.map(id => leveled.fields[id])
    const left = Math.min(...row.map(item => Math.min(item.input.left, item.label.left)))
    const right = Math.max(...row.map(item => Math.max(item.input.left + item.input.width, item.label.left + item.label.width)))
    assert.ok(Math.abs((left + right) / 2 - leveled.width / 2) < 0.1)
    assert.ok(row.every(item => Math.abs(item.label.width - item.input.width) < 0.1))
    assert.ok(row.every(item => Math.abs(item.label.top - row[0].label.top) < 0.1))
    assert.ok(row.every(item => Math.abs(item.input.top - item.label.top - item.label.height - 6) < 0.1))
  }
})

test('automatic alignment snaps a newly added field to the nearby input row without merging the next row', () => {
  const field = (left, top) => ({
    input: { left, top, width: 140, height: 34 },
    label: { left, top: top - 24, width: 140, height: 18 }
  })
  const fields = {
    code: field(1500, 37), name: field(1200, 37), gender: field(900, 37),
    luster: field(600, 47), newlyAdded: field(300, 57),
    separateNextRow: field(1450, 157)
  }
  const aligned = autoAlignDesignerCanvas({ width: 1800, height: 300, fields }, { rtl: true })
  const firstRow = ['code', 'name', 'gender', 'luster', 'newlyAdded'].map(id => aligned.fields[id])
  assert.ok(firstRow.every(item => Math.abs(item.input.top - firstRow[0].input.top) < 0.1), 'the 20px baseline drift from a new field is corrected with its label')
  assert.equal(aligned.fields.separateNextRow.input.top, 157, 'a genuinely separate row is not pulled into the first row')
  assert.equal(aligned.fields.newlyAdded.label.top, firstRow[0].label.top, 'the field label moves with its input')
})

test('wide fields that share a column edge cannot undo horizontal row alignment during vertical spacing', () => {
  const field = (left, top, width) => ({
    input: { left, top, width, height: 34 },
    label: { left: left + width - Math.min(width, 70), top: top - 24, width: Math.min(width, 70), height: 18 }
  })
  const fields = {
    code: field(1674, 37, 172), title: field(1398, 37, 264), firstName: field(938, 37, 448),
    lastName: field(478, 45, 448), job: field(19, 37, 448),
    mobile: field(478, 126, 448), notes: field(19, 208, 908)
  }
  const aligned = autoAlignDesignerCanvas({ width: 1845, height: 300, fields }, { rtl: true, textareaFieldIds: ['notes'] })
  const firstRow = ['code', 'title', 'firstName', 'lastName', 'job'].map(id => aligned.fields[id].input.top)
  assert.ok(firstRow.every(top => Math.abs(top - firstRow[0]) < 0.1), 'vertical gap balancing must not shift the wide notes field’s regular-width peer out of row')
})

test('Ctrl+L caps an oversized Canvas and grows only to content plus half-centimeter side insets', () => {
  const field = left => ({ input: { left, top: 100, width: 180, height: 34 }, label: { left: left + 70, top: 76, width: 110, height: 18 } })
  const fields = { a: field(850), b: field(600), c: field(350) }
  const oversized = { width: 1600, height: 260, fields }
  const capped = capDesignerCanvasWidth(oversized, 1200)
  assert.equal(capped.width, 1200)
  assert.deepEqual(capped.fields, oversized.fields, 'capping width must not translate source geometry')
  assert.equal(capDesignerCanvasWidth({ ...oversized, width: 1000 }, 1200).width, 1000, 'a viewport must not expand an already narrower Canvas')
  const fit = levelDesignerCanvas(capped, { rtl: true, fieldIds: Object.keys(fields) })
  assert.equal(fit.width, 1200, 'rows that fit must not expand the editor Canvas')

  const narrow = capDesignerCanvasWidth({ ...oversized, width: 600 }, 500)
  const grown = levelDesignerCanvas(narrow, { rtl: true, fieldIds: Object.keys(fields) })
  assert.ok(grown.width > 500, 'the Canvas may grow when its normalized row cannot fit')
  const row = Object.values(grown.fields).map(fieldGroupRect)
  const left = Math.min(...row.map(rect => rect.left))
  const right = Math.max(...row.map(rect => rect.left + rect.width))
  const halfCentimeter = 96 / 2.54 / 2
  assert.ok(Math.abs(left - halfCentimeter) < 0.2, 'minimum-width layout keeps a half-centimeter leading inset')
  assert.ok(Math.abs(grown.width - right - halfCentimeter) < 0.2, 'minimum-width layout keeps a half-centimeter trailing inset')
})

test('responsive editor fitting consumes side whitespace to half-centimeter margins without changing saved geometry', () => {
  const canvas = {
    width: 900,
    height: 260,
    fields: {
      first: { input: { left: 80, top: 70, width: 120, height: 34 }, label: { left: 110, top: 46, width: 90, height: 18 }, select: { left: 84, top: 48, width: 18, height: 18 } },
      last: { input: { left: 430, top: 160, width: 170, height: 34 }, label: { left: 390, top: 136, width: 75, height: 18 } }
    }
  }
  const originalFields = structuredClone(canvas.fields)
  const inset = 96 / 2.54 / 2
  const content = [canvas.fields.first, canvas.fields.last].map(fieldGroupRect)
  const contentLeft = Math.min(...content.map(rect => rect.left))
  const contentRight = Math.max(...content.map(rect => rect.left + rect.width))
  const contentWidth = contentRight - contentLeft

  const roomy = fitDesignerCanvasToViewport(canvas, 900)
  assert.equal(roomy.canvas.width, 900, 'a roomy editor uses its available width')
  assert.ok(Math.abs(contentLeft + roomy.shift - (900 - contentWidth) / 2) < 0.01, 'the group is centered when it fits')
  assert.deepEqual(roomy.canvas.fields, originalFields)
  assert.strictEqual(roomy.canvas.fields, canvas.fields, 'render fitting retains the source geometry object')
  assert.deepEqual(roomy.canvas.centeredFieldIds, ['first', 'last'], 'the render-only projection shifts all its rendered fields together')

  const narrow = fitDesignerCanvasToViewport(canvas, 500)
  assert.ok(Math.abs(narrow.canvas.width - (contentWidth + inset * 2)) < 0.01, 'overflow grows only to content plus both edge insets')
  assert.ok(Math.abs(contentLeft + narrow.shift - inset) < 0.01, 'the leading edge keeps a half-centimeter margin')
  assert.ok(Math.abs(narrow.canvas.width - (contentRight + narrow.shift) - inset) < 0.01, 'the trailing edge keeps a half-centimeter margin')
  assert.equal(canvas.width, 900, 'the persisted canvas width is unchanged')
  assert.deepEqual(canvas.fields, originalFields, 'responsive fitting never translates saved field rectangles')
})

test('responsive centering recalculates equal real margins at every width and after geometry changes', () => {
  const canvas = {
    width: 900,
    height: 260,
    fields: {
      first: { input: { left: 110.25, top: 70, width: 120, height: 34 }, label: { left: 110.25, top: 46, width: 90, height: 18 } },
      last: { input: { left: 470.5, top: 160, width: 170, height: 34 }, label: { left: 440.5, top: 136, width: 75, height: 18 } }
    }
  }
  const inset = 96 / 2.54 / 2
  const measure = source => {
    const bounds = Object.values(source.fields).map(fieldGroupRect)
    return { left: Math.min(...bounds.map(rect => rect.left)), right: Math.max(...bounds.map(rect => rect.left + rect.width)) }
  }
  for (const width of [1200, 900, 720, 560, 400]) {
    const { left, right } = measure(canvas)
    const fit = fitDesignerCanvasToViewportWithHysteresis(canvas, width, Object.keys(canvas.fields), false)
    const actualLeft = left + fit.shift
    const actualRight = fit.canvas.width - (right + fit.shift)
    if (fit.overflowing) {
      assert.ok(Math.abs(actualLeft - inset) < 0.1, `left inset at ${width}px`)
      assert.ok(Math.abs(actualRight - inset) < 0.1, `right inset at ${width}px`)
    } else {
      assert.ok(Math.abs(actualLeft - actualRight) < 0.1, `visible margins match at ${width}px`)
    }
  }
  const changed = { ...canvas, fields: { ...canvas.fields, last: { ...canvas.fields.last, input: { ...canvas.fields.last.input, left: 530.75 } } } }
  const { left, right } = measure(changed)
  const fitAfterChange = fitDesignerCanvasToViewportWithHysteresis(changed, 900)
  assert.ok(Math.abs((left + fitAfterChange.shift) - (fitAfterChange.canvas.width - right - fitAfterChange.shift)) < 0.1, 'a same-width geometry update gets a newly measured center shift')
  const page = readFileSync(new URL('../../FormLaboratoryPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /const canvasViewport = measuredCanvasViewport/, 'rendering uses the freshly measured projection')
  assert.doesNotMatch(page, /previousProjection\?\.width === editorViewportWidth \? previousProjection\.shift/, 'a stale shift is not reused after edits at the same viewport width')
})

test('Ctrl+L keeps side labels beside their inputs with one measured gap', () => {
  const sideField = (inputLeft, labelSide) => ({
    input: { left: inputLeft, top: 100, width: 110, height: 34 },
    label: labelSide === 'left'
      ? { left: inputLeft - 78, top: 108, width: 68, height: 18 }
      : { left: inputLeft + 120, top: 108, width: 68, height: 18 }
  })
  const fields = { leftLabel: sideField(680, 'left'), rightLabel: sideField(300, 'right') }
  const leveled = levelDesignerCanvas({ width: 1100, height: 240, fields }, { rtl: true, fieldIds: Object.keys(fields) })
  const left = leveled.fields.leftLabel
  const right = leveled.fields.rightLabel
  assert.ok(Math.abs(left.input.left - left.label.left - left.label.width - 10) < 0.1)
  assert.ok(Math.abs(right.label.left - right.input.left - right.input.width - 10) < 0.1)
  for (const item of [left, right]) {
    assert.ok(Math.abs(item.label.top + item.label.height / 2 - item.input.top - item.input.height / 2) < 0.1)
  }
})

test('Ctrl+L averages widths for labels that stay beside their inputs', () => {
  const sideField = (inputLeft, labelWidth) => ({
    input: { left: inputLeft, top: 100, width: 110, height: 34 },
    label: { left: inputLeft - labelWidth - 10, top: 108, width: labelWidth, height: 18 }
  })
  const fields = { shortLabel: sideField(700, 50), longLabel: sideField(300, 80) }
  const leveled = levelDesignerCanvas({ width: 1100, height: 220, fields }, { rtl: true, fieldIds: Object.keys(fields) })
  const first = leveled.fields.shortLabel
  const second = leveled.fields.longLabel

  assert.ok(Math.abs(first.label.width - second.label.width) < 0.1)
  for (const item of [first, second]) {
    assert.ok(Math.abs(item.input.left - item.label.left - item.label.width - 10) < 0.1)
    assert.ok(Math.abs(item.label.top + item.label.height / 2 - item.input.top - item.input.height / 2) < 0.1)
  }
})

test('Ctrl+L contains an oversized notes and checkbox row within the regular grid in RTL and LTR', () => {
  const field = (left, top, width, height = 34) => ({
    input: { left, top, width, height },
    label: { left, top: top - 24, width, height: 18 }
  })
  const bounds = fields => {
    const rects = fields.map(fieldGroupRect)
    return { left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.left + rect.width)) }
  }
  for (const rtl of [true, false]) {
    const fields = {
      code: field(800, 60, 102), name: field(500, 60, 222), material: field(350, 60, 98),
      a: field(800, 160, 100), b: field(680, 160, 102), c: field(560, 160, 98), d: field(440, 160, 100),
      notes: field(80, 290, 1800, 80),
      active: { input: { left: 15, top: 340, width: 18, height: 18 }, label: { left: 37, top: 340, width: 45, height: 18 } }
    }
    const canvas = { width: 1100, height: 500, fields, centeredFieldIds: Object.keys(fields), alignmentExceptionFieldIds: ['notes'] }
    const leveled = levelDesignerCanvas(canvas, { rtl, textareaFieldIds: ['notes'], checkboxFieldIds: ['active'] })
    const grid = bounds(['a', 'b', 'c', 'd'].map(id => leveled.fields[id]))
    const footer = bounds([leveled.fields.notes, leveled.fields.active])
    assert.equal(leveled.width, 1100, 'the old oversized notes box must not enlarge the canvas')
    assert.ok(Math.abs(footer.left - grid.left) < 0.11)
    assert.ok(Math.abs(footer.right - grid.right) < 0.11)
    const notes = leveled.fields.notes.input, active = leveled.fields.active.input
    assert.equal(notes.height, leveled.fields.a.input.height)
    assert.ok(Math.abs(notes.top + notes.height / 2 - active.top - active.height / 2) < 0.11)
    const a = leveled.fields.a.input, b = leveled.fields.b.input
    const gap = Math.abs(a.left - b.left) - a.width
    const notesGroup = fieldGroupRect(leveled.fields.notes), activeGroup = fieldGroupRect(leveled.fields.active)
    const footerGap = rtl ? notesGroup.left - activeGroup.left - activeGroup.width : activeGroup.left - notesGroup.left - notesGroup.width
    assert.ok(Math.abs(footerGap - gap) < 0.11)
    assert.deepEqual(leveled.centeredFieldIds, Object.keys(fields).filter(id => id !== 'notes'), 'future resizes preserve the newly centered regular fields while the flexible notes group keeps its own layout')
    assert.deepEqual(leveled.alignmentExceptionFieldIds, ['notes'], 'explicit leveling includes F1 fields without deleting their later exception')
  }
})

test('Ctrl+L centers the dense row and anchors later incomplete rows, including a newly added single field, at the reading edge',()=>{
 const field=(left,top)=>({input:{left,top,width:100,height:36},label:{left,top:top-24,width:100,height:18}})
 const fields={}
 for(let index=0;index<6;index++)fields['full'+index]=field(40+index*120,60)
 fields.shortA=field(180,150);fields.shortB=field(420,150);fields.cbm=field(840,240)
 const ids=Object.keys(fields),canvas={width:1000,height:340,fields,centeredFieldIds:ids}
 for(const rtl of [true,false]){
  const leveled=levelDesignerCanvas(canvas,{rtl})
  const full=ids.slice(0,6).map(id=>fieldGroupRect(leveled.fields[id]))
  const short=ids.slice(6,8).map(id=>fieldGroupRect(leveled.fields[id]))
  const cbm=fieldGroupRect(leveled.fields.cbm)
  const fullLeft=Math.min(...full.map(rect=>rect.left)),fullRight=Math.max(...full.map(rect=>rect.left+rect.width))
  const shortLeft=Math.min(...short.map(rect=>rect.left)),shortRight=Math.max(...short.map(rect=>rect.left+rect.width))
  const denseEdge=rtl?fullRight:fullLeft
  const shortEdge=rtl?shortRight:shortLeft
  const cbmEdge=rtl?cbm.left+cbm.width:cbm.left
  assert.ok(Math.abs(fullLeft+fullRight-leveled.width)<0.11,'the densest row stays centered')
  assert.ok(Math.abs(shortEdge-denseEdge)<0.11,rtl?'an incomplete Persian row shares the dense row right edge':'an incomplete English row shares the dense row left edge')
  assert.ok(Math.abs(cbmEdge-denseEdge)<0.11,rtl?'a newly added single Persian field follows the same right-aligned grid':'a newly added single English field follows the same left-aligned grid')
  assert.ok(Math.abs(leveled.fields.cbm.input.width-leveled.fields.full0.input.width)<0.11,'a newly added single field inherits the normalized dense-row cell width')
  assert.ok(Math.abs(leveled.fields.cbm.label.width-leveled.fields.cbm.input.width)<0.11,'the new field label follows its normalized input width')
  assert.deepEqual(leveled.centeredFieldIds,ids,'Ctrl+L persists the centering contract for subsequent field edits')
 }
})

test('edge alignment translates only the selection with a half-centimeter margin and releases persistent centering', () => {
  const field = left => ({ input: { left, top: 60, width: 120, height: 34 }, label: { left, top: 36, width: 120, height: 18 } })
  const canvas = { width: 1000, height: 240, fields: { a: { ...field(200), select: { left: -150, top: 36, width: 19, height: 18 } }, b: field(340), untouched: field(700) }, centeredFieldIds: ['a', 'b', 'untouched'] }
  const inset = 96 / 2.54 / 2
  const left = alignDesignerCanvasFieldsToEdge(canvas, ['a', 'b'], 'left')
  const right = alignDesignerCanvasFieldsToEdge(left, ['a', 'b'], 'right')
  assert.ok(Math.abs(left.fields.a.input.left - inset) < 0.01)
  assert.ok(Math.abs(1000 - right.fields.b.input.left - right.fields.b.input.width - inset) < 0.01)
  for (const moved of [left, right]) {
    assert.deepEqual(moved.fields.untouched, canvas.fields.untouched)
    assert.equal(moved.fields.b.input.left - moved.fields.a.input.left, 140)
    assert.equal(moved.fields.a.input.top, 60)
    assert.deepEqual(moved.centeredFieldIds, ['untouched'])
  }
  const leftAgain = alignDesignerCanvasFieldsToEdge(right, ['a', 'b'], 'left')
  assert.ok(Math.abs(leftAgain.fields.a.input.left - inset) < 0.01, 'alternating physical directions works repeatedly')
  const viewportAligned = alignDesignerCanvasFieldsToEdge(canvas, ['a', 'b'], 'right', undefined, 800)
  assert.equal(viewportAligned.width, canvas.width, 'aligning to the editor viewport retains an independently wider scroll canvas')
  assert.ok(Math.abs(800 - viewportAligned.fields.b.input.left - viewportAligned.fields.b.input.width - inset) < 0.01, 'a selection that fits aligns to the visible edge, not the oversized Canvas edge')
  const shiftedViewportAligned = alignDesignerCanvasFieldsToEdge(canvas, ['a', 'b'], 'right', undefined, 800, 3)
  assert.ok(Math.abs(800 - (shiftedViewportAligned.fields.b.input.left + shiftedViewportAligned.fields.b.input.width + 3) - inset) < 0.01, 'render-only viewport translation is compensated without changing other fields')
  const saved = validateDesignerDraft({ ...emptyDesignerDraft('edge'), canvas: right }, 'edge', ['a', 'b', 'untouched'])
  assert.equal(saved.canvas.preserveHorizontalBounds, true)
  const schema = { id: 'edge', fields: ['a', 'b', 'untouched'].map(id => ({ id, kind: 'text' })), sections: [{ id: 'editor', kind: 'editor' }] }
  const rendered = resolveFormLayout(schema, { ...saved, canvas: { ...saved.canvas, centeredFieldIds: [] } }, 'desktop', 1000, { cropEmptyCanvas: true, originX: 200 })
  assert.equal(rendered.canvas.width, 1000, 'explicit alignment bounds survive the old empty-space crop setting')
  assert.deepEqual(rendered.canvas.fields, saved.canvas.fields)
})

test('form-lab appearance colors are scoped, validated and persisted as one undoable draft', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerAppearanceProperty(draft, 'headerBackground', '#123456')
  draft = setDesignerAppearanceProperty(draft, 'rowAlternateBackground', '#abcdef')
  draft = setDesignerAppearanceProperty(draft, 'cellBackground', '#f0f0f0')
  draft = setDesignerAppearanceProperty(draft, 'actionBorder', '#fedcba')
  draft = setDesignerAppearanceProperty(draft, 'tableBackground', 'red')
  assert.deepEqual(draft.appearance, { headerBackground: '#123456', rowAlternateBackground: '#abcdef', cellBackground: '#f0f0f0', actionBorder: '#fedcba' })
  const style = designerAppearanceStyle(draft)
  assert.equal(style['--lab-header-bg'], '#123456')
  assert.equal(style['--lab-row-alt-bg'], '#abcdef')
  assert.equal(style['--lab-cell-bg'], '#f0f0f0')
  assert.equal(style['--lab-action-border'], '#fedcba')
  let history = designerHistoryReducer(createDesignerHistory(emptyDesignerDraft(formId)), { type: 'beginTransaction' })
  history = designerHistoryReducer(history, { type: 'change', draft: setDesignerAppearanceProperty(history.present, 'tableBackground', '#101010') })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveDesignerDraft(storage, 'appearance-user', formId, draft, ids), true)
  assert.deepEqual(loadDesignerDraft(storage, 'appearance-user', formId, ids).appearance, draft.appearance)
})

test('undo and redo keep 30-plus steps; continuous color changes form one undo step', () => {
  let history = createDesignerHistory(emptyDesignerDraft(formId))
  for (let i = 1; i <= 40; i++) history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, ['personCode'], 'lineHeight', 0.8 + i / 100, ids) })
  assert.equal(history.past.length, 40)
  for (let i = 0; i < 30; i++) history = designerHistoryReducer(history, { type: 'undo' })
  assert.ok(Math.abs(history.present.overrides.personCode.lineHeight - 0.9) < 0.000001)
  for (let i = 0; i < 30; i++) history = designerHistoryReducer(history, { type: 'redo' })
  assert.ok(Math.abs(history.present.overrides.personCode.lineHeight - 1.2) < 0.000001)

  history = createDesignerHistory(emptyDesignerDraft(formId))
  history = designerHistoryReducer(history, { type: 'beginTransaction' })
  for (const color of ['#112233', '#223344', '#334455']) history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, ['personCode'], 'backgroundColor', color, ids) })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
})

test('local drafts reload only for their authenticated user and form ID', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['address'], 'lineHeight', 1.8, ids)
  assert.equal(saveDesignerDraft(storage, 'user-1', formId, draft, ids), true)
  assert.equal(designerStorageKey('user-1', formId), [...values.keys()][0])
  assert.equal(loadDesignerDraft(storage, 'user-1', formId, ids).overrides.address.lineHeight, 1.8)
  assert.deepEqual(loadDesignerDraft(storage, 'user-2', formId, ids).overrides, {})
  assert.deepEqual(loadDesignerDraft(storage, 'user-1', 'another-form', ids).overrides, {})
  assert.equal(saveDesignerDraft(storage, undefined, formId, draft, ids), false)
})

test('laboratory UI protects editable keyboard behavior, RTL, cancellation and immutable Golden source', () => {
  assert.match(page, /dir=\{fa \? 'rtl' : 'ltr'\}/)
  assert.match(page, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(page, /target\.matches\('input, textarea, \[contenteditable="true"\]'\)/)
  assert.match(page, /editingBaseline\.current/)
  assert.match(app, /FormLaboratoryPage language=\{language\} authenticatedUserId=\{access\?\.id\}/)
  assert.match(page, /const targets = applyToAll \? activeFieldIds : selection/)
  assert.match(page, /setSelection\(geometryFieldIds\.map\(id => `\$\{id\}::input`\)\)/)
  assert.doesNotMatch(page, /document\.documentElement\.dataset\.theme|setTheme\(/)
  assert.match(page, /<Shortcut code=\{entryActive \? action.code : designerActionCode\(designerDraft, action\)\}/)
  assert.match(panel, /type="color"/)
  assert.match(panel, /onBeginColorChange/)
  assert.match(panel, /رنگ و ظاهر/)
  assert.match(panel, /رنگ‌های حالت فوکوس/)
  assert.match(page, /appearanceStyle/)
  assert.match(panel, /Select all|انتخاب همه/)
})

test('device previews use real viewport widths and keep desktop canvas editing isolated', () => {
  const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')
  assert.match(page, /const previewWidths = \{ desktop: 1440, tablet: 768, mobile: 390 \}/)
  assert.match(page, /const geometryEditable = activePreviewFrame\.device === 'desktop'/)
  assert.match(page, /const width = typeof stored\.width[\s\S]*?Math\.max\(320, Math\.min\(2400, stored\.width\)\)/)
  assert.match(page, /data-preview-device=\{activePreviewFrame\.device\} data-preview-width=\{activePreviewFrame\.width\}/)
  assert.match(page, /activePreviewFrame\.fitToPage && activePreviewFrame\.device === 'desktop' \? '100%' : activePreviewFrame\.width/)
  assert.match(page, /const canvas = geometryEditable \? storedEditorCanvas \?\? \(designerOpen \? frozenCanvas : null\) : null/)
  assert.match(page, /geometryEditable=\{geometryEditable\}/)
  assert.match(page, /if \(!designerOpen \|\| !geometryEditable \|\| storedEditorCanvas/)
  assert.match(styles, /\.laboratory-form-frame\{[^}]*container-type:inline-size;container-name:laboratory-preview/)
  assert.match(styles, /@container laboratory-preview \(max-width:\s*600px\)/)
  assert.match(styles, /@container laboratory-preview \(max-width:\s*420px\)/)
  assert.match(styles, /\.laboratory-form-frame-area\{[^}]*overflow:auto/)
})

test('Form Laboratory preview and operational forms share the 12px left, right and bottom content inset', () => {
  const theme = readFileSync(new URL('./formTheme.css', import.meta.url), 'utf8')
  const operationalFrame = readFileSync(new URL('./operationalFormFrame.css', import.meta.url), 'utf8')
  const globalStyles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')
  const behavior = JSON.parse(readFileSync(new URL('./laboratoryOperationalBehavior.json', import.meta.url), 'utf8'))
  const brand = JSON.parse(readFileSync(new URL('../../forms/brand-design.json', import.meta.url), 'utf8'))

  assert.match(theme, /--form-frame-content-inset-inline:\s*12px/)
  assert.match(theme, /--form-frame-content-inset-bottom:\s*12px/)
  assert.match(theme, /\.form-laboratory-page \.base-form-shell>\.base-form-editor,[\s\S]*?padding:0 var\(--form-frame-content-inset-inline,12px\) var\(--form-frame-content-inset-bottom,12px\)/)
  assert.match(globalStyles, /\.laboratory-form-frame>\.form-laboratory-banner\{[^}]*margin-inline:var\(--form-frame-content-inset-inline,12px\)/)
  assert.match(operationalFrame, /\.operational-form-frame>\.form-laboratory-banner\{[^}]*margin:0 var\(--form-frame-content-inset-inline,12px\)/)
  assert.match(operationalFrame, /\.operational-form-frame \.base-form-editor\{[^}]*padding:0 var\(--form-frame-content-inset-inline,12px\) var\(--form-frame-content-inset-bottom,12px\)/)
  assert.match(operationalFrame, /\.operational-form-frame \.base-form-grid\{padding:0 var\(--form-frame-content-inset-inline,12px\) var\(--form-frame-content-inset-bottom,12px\)/)
  assert.ok(behavior.version >= 13)
  assert.deepEqual(behavior.futureFormPolicy.presentationInheritance.frameContentInsets, {
    unit: 'css-px', inline: 12, blockEnd: 12, approximateMillimetersAt96Dpi: 3.2,
    edges: ['left', 'right', 'bottom'], laboratoryAndOperationalPreviewMustMatch: true,
  })
  assert.deepEqual(brand.operationalBehaviorContract, behavior)
})

test('fixed Laboratory frames keep their size, align to language direction, and stay put when a field is selected', () => {
  const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')
  const behavior = JSON.parse(readFileSync(new URL('./laboratoryOperationalBehavior.json', import.meta.url), 'utf8'))
  const brand = JSON.parse(readFileSync(new URL('../../forms/brand-design.json', import.meta.url), 'utf8'))
  const selectField = page.slice(page.indexOf('const selectField ='), page.indexOf('const mapDesignerPropertyTargets'))
  const selectToolbar = page.slice(page.indexOf('const selectToolbar='), page.indexOf('const requestToolbarProperty='))
  const frameArea = page.split('\n').find(line => line.includes('className="laboratory-form-frame-area"'))
  const frame = page.split('\n').find(line => line.includes('className="laboratory-form-frame"'))

  assert.ok(frameArea?.includes("dir={fa ? 'rtl' : 'ltr'}"))
  assert.match(styles, /\.laboratory-form-frame-area\{[^}]*justify-content:safe flex-start/)
  assert.match(styles, /\.laboratory-form-frame-area\[dir=rtl\]\{direction:rtl\}/)
  assert.match(styles, /\.laboratory-form-frame-area\[dir=ltr\]\{direction:ltr\}/)
  assert.ok(frame?.includes("activePreviewFrame.fitToPage && activePreviewFrame.device === 'desktop' ? '100%' : activePreviewFrame.width"))
  assert.ok(frame?.includes("previewFitToPage && previewDevice === 'desktop' ? '100%' : previewWidth"))
  assert.doesNotMatch(frame ?? '', /marginInline:\s*'auto'/)
  assert.doesNotMatch(selectField, /setManagedSidebarCollapsed\(false\)|setDesignerOpen\(true\)/)
  assert.doesNotMatch(selectToolbar, /setManagedSidebarCollapsed\(false\)|setDesignerOpen\(true\)/)
  assert.ok(behavior.version >= 13)
  assert.deepEqual(behavior.futureFormPolicy.workspaceLayout, {
    fixedFrameDimensionsRemainUnchangedOnViewportChange: true,
    fitToPageModeResizesToAvailableWorkspace: true,
    framePlacementByDirection: { rtl: { anchor: 'right', unusedSpace: 'left' }, ltr: { anchor: 'left', unusedSpace: 'right' } },
    fieldSelectionExpandsCollapsedDesignerSidebar: false,
    toolbarSelectionExpandsCollapsedDesignerSidebar: false,
  })
  assert.deepEqual(brand.operationalBehaviorContract, behavior)
})

test('neighbour compensation is opt-in and isolated fields remain resizable on every physical edge',()=>{
 assert.deepEqual(resolveDesignerNeighborResize({}),{horizontal:false,vertical:false})
 assert.deepEqual(resolveDesignerNeighborResize({neighborResize:{horizontal:true}}),{horizontal:true,vertical:false})
 const canvas={width:400,height:250,fields:{a:{input:{left:100,top:80,width:100,height:50},label:{left:100,top:50,width:100,height:20}}}}
 const bounds=designerCanvasInteractionBounds(canvas,800,0)
 for(const [edge,dx,dy] of [['left',-30,0],['right',30,0],['top',0,-20],['bottom',0,20]]){
  const next=resizeCanvasHandle(canvas,['a'],edge,dx,dy,{horizontal:true,vertical:true},bounds)
  assert.equal(next.fields.a.input.width,100+Math.abs(dx))
  assert.equal(next.fields.a.input.height,50+Math.abs(dy))
 }
 const page=readFileSync(new URL('../../FormLaboratoryPage.tsx',import.meta.url),'utf8')
 const resolver=page.slice(page.indexOf('const neighborResizeFor='),page.indexOf('const previewPolicy='))
 assert.ok(resolver.includes('resolveDesignerNeighborResize(draft)'))
 assert.ok(!resolver.includes('currentFormPolicy'))
})

test('partial row leveling averages input sizes and gaps and leaves unselected fields untouched',()=>{
 const field=(left,width,height)=>({input:{left,top:80,width,height},label:{left,top:50,width,height:20}})
 const canvas={width:1000,height:300,fields:{a:field(60,80,30),b:field(180,120,40),c:field(360,100,80),other:field(650,100,50)}}
 for(const rtl of [false,true]){
  const result=levelDesignerInputRow(canvas,['c','a','b'],rtl)
  assert.equal(result.blockedBy,undefined)
  for(const id of ['a','b','c']){assert.equal(result.canvas.fields[id].input.width,100);assert.equal(result.canvas.fields[id].input.height,50)}
  assert.equal(result.canvas.fields.b.input.left-result.canvas.fields.a.input.left-100,50)
  assert.equal(result.canvas.fields.c.input.left-result.canvas.fields.b.input.left-100,50)
  assert.equal(result.canvas.fields.other,canvas.fields.other)
 }
})

test('explicit none effects never create underline or subscript in field and action rendering',()=>{
 const d={...emptyDesignerDraft(),overrides:{name:{underline:'none',script:'none',bold:false,strikeThrough:false}},actions:{save:{textStyles:{fa:{underline:'none',script:'none',fontSize:16,bold:false}}}}};
 assert.equal(designerStyleForField(d,'name')['--lab-text-decoration'],'none');
 assert.equal(designerStyleForField(d,'name')['--lab-script-align'],'baseline');
 assert.equal(designerStyleForField(d,'name')['--lab-script-size'],'1em');
 assert.equal(designerActionTextStyle(d,'save','fa').textDecorationLine,'none');
 assert.equal(designerActionTextStyle(d,'save','fa').fontSize,'16px');
});
