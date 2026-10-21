import test from 'node:test'
import assert from 'node:assert/strict'
import {designerDraftForEditor} from './formDocumentDesigner.ts'
import {resolveFormLayout} from './formLayoutContract.ts'
import {emptyDesignerDraft,setDesignerTableHeaderStyle,validateDesignerDraft,alignCanvasFields,resizeCanvasHandle} from './designer.ts'
import {normalizeToolbarStyle,moveToolbarPart,toolbarPartStyle,toolbarGesturePatches,patchToolbarParts,toolbarPanels} from './gridToolbarLayout.ts'
import {addTableHeaderRow} from './formDocumentControls.ts'
import {usesFormComposition} from './formDocumentStructure.ts'
import {addToolbarHeaderPanel} from './formDocumentControls.ts'
import {toolbarContainmentDelta} from './toolbarLayoutContract.ts'
const schema={id:'independent',templateFormId:'mother',sections:[{id:'editor',kind:'editor'}],fields:[{id:'a',sectionId:'editor'},{id:'b',sectionId:'editor'}]}
const box=(left,top)=>({left,top,width:140,height:32})

test('toolbar content recovers outside offsets within its own header, including a short header',()=>{
 const parent={left:10,top:20,width:500,height:100}
 assert.deepEqual(toolbarContainmentDelta({left:100,top:-60,width:100,height:24},parent),{x:0,y:80})
 assert.deepEqual(toolbarContainmentDelta({left:490,top:110,width:100,height:40},parent),{x:-80,y:-30})
 assert.deepEqual(toolbarContainmentDelta({left:100,top:40,width:100,height:24},parent),{x:0,y:0})
})

test('own label and selection chrome cannot block horizontal field resize',()=>{
 const source={width:600,height:400,fields:{a:{input:box(100,100),label:{left:100,top:73,width:140,height:24},select:{left:100,top:80,width:24,height:18}}}}
 const after=resizeCanvasHandle(source,['a'],'right',20,0)
 assert.equal(after.fields.a.input.width,160)
 assert.deepEqual(after.fields.a.label,source.fields.a.label)
 assert.equal(after.fields.a.input.left,100)
})

test('new fields join the visible source region, including an empty imported Canvas',()=>{
 const extended={...schema,fields:[...schema.fields,{id:'c',sectionId:'editor'}]}
 const original={...emptyDesignerDraft('mother'),canvas:{width:2200,height:1600,fields:{a:{input:box(1400,40),label:box(1400,4)},b:{input:box(1660,40),label:box(1660,4)}}}}
 const next=designerDraftForEditor(original,extended)
 assert.equal(next.canvas.fields.c.input.left,1400)
 assert.deepEqual(next.canvas.fields.a,original.canvas.fields.a)
 const empty=designerDraftForEditor({...original,canvas:{...original.canvas,fields:{}}},schema)
 assert.equal(empty.canvas.fields.a.input.left,12)
})

test('a stable view origin keeps unselected fields fixed during drag and Undo',()=>{
 const draft={...emptyDesignerDraft('mother'),canvas:{width:3000,height:1200,fields:{a:{input:box(1600,40),label:box(1600,4)},b:{input:box(1800,40),label:box(1800,4)}}}}
 const options={cropEmptyCanvas:true,originX:1588},before=resolveFormLayout(schema,draft,'desktop',1000,options)
 const moved=structuredClone(draft);moved.canvas.fields.a.input.left-=50;moved.canvas.fields.a.label.left-=50
 const after=resolveFormLayout(schema,moved,'desktop',1000,options)
 assert.deepEqual(before.canvas.fields.b,after.canvas.fields.b)
 assert.equal(after.canvas.fields.a.input.left,before.canvas.fields.a.input.left-50)
 assert.deepEqual(resolveFormLayout(schema,draft,'desktop',1000,options),before)
})

test('adding either header preserves all previous panel and child geometry atomically',()=>{
 const source={...schema,tables:[{id:'table',columns:[],settings:{toolbar:{header:{width:700,height:140,x:20,y:30},title:{x:40,y:15,width:240}}}}]}
 for(const placement of ['below','beside']){
  const next=addToolbarHeaderPanel(source,'table','header:new','new-row',placement)
  assert.deepEqual(next.tables[0].settings.toolbar.header,source.tables[0].settings.toolbar.header)
  assert.deepEqual(next.tables[0].settings.toolbar.title,source.tables[0].settings.toolbar.title)
  assert.equal(next.sections.find(item=>item.id==='new-row').settings.toolbarPanelId,'header:new')
  assert.equal(source.sections.length,1)
 }
})
test('legacy independent Canvas crops empty extents without moving fields or modifying stored geometry',()=>{
 const draft={...emptyDesignerDraft('mother'),canvas:{width:2200,height:1600,fields:{a:{input:box(10,40),label:box(10,4)},b:{input:box(210,40),label:box(210,4)}}}}
 const before=structuredClone(draft),editable=designerDraftForEditor(draft,schema),view=resolveFormLayout(schema,editable,'desktop',1440,{cropEmptyCanvas:true})
 assert.equal(editable.canvas.width,2200,'editing must retain the full saved movement/resize bounds')
 assert.equal(view.canvas.width,350);assert.equal(view.canvas.height,80)
 assert.deepEqual(view.canvas.fields.a,before.canvas.fields.a);assert.deepEqual(draft,before)
 const manual=structuredClone(schema);manual.sections[0].settings={viewport:{heightMode:'fixed'}}
 const fixed=resolveFormLayout(manual,designerDraftForEditor(draft,manual),'desktop',1440,{cropEmptyCanvas:true}).canvas
 assert.equal(fixed.width,350,'fixed height must not force horizontal overflow');assert.equal(fixed.height,1600)
 manual.sections[0].settings.viewport.overflowX='scroll'
 assert.equal(resolveFormLayout(manual,designerDraftForEditor(draft,manual),'desktop',1440,{cropEmptyCanvas:true}).canvas.width,2200,'explicit horizontal scroll remains respected')
})

test('automatic horizontal projection removes empty leading space and preserves source coordinates',()=>{
 const draft={...emptyDesignerDraft('mother'),canvas:{width:3000,height:1200,fields:{a:{label:box(1600,0),input:box(1600,40)},b:{label:box(1780,0),input:box(1780,40)}}}}
 const before=structuredClone(draft),view=resolveFormLayout(schema,designerDraftForEditor(draft,schema),'desktop',1000,{cropEmptyCanvas:true}).canvas
 assert.equal(view.fields.a.input.left,12);assert.equal(view.width,332)
 assert.deepEqual(draft,before)
})

test('toolbar corner resize uses field Canvas geometry; a group moves once without double-moving descendants',()=>{
 const boxes={title:{width:200,height:40},counter:{width:100,height:24},search:{width:340,height:70},searchInput:{width:300,height:32},header:{width:900,height:100}}
 const settings={title:{x:5,y:2},searchInput:{fontSize:19}}
 const result=toolbarGesturePatches(settings,['title'],boxes,30,15,'bottom-right')
 assert.deepEqual(result.title,{x:5,y:2,width:230,height:55})
 assert.deepEqual(toolbarGesturePatches(settings,['title'],boxes,20,10,'top-left').title,{x:25,y:12,width:180,height:30})
 const group=toolbarGesturePatches(settings,['title','counter'],boxes,10,20)
 assert.deepEqual(group,{title:{x:15,y:22},counter:{x:10,y:20}})
 assert.deepEqual(toolbarGesturePatches(settings,['search','searchInput'],boxes,10,20),{search:{x:10,y:20}})
 assert.deepEqual(toolbarGesturePatches(settings,['header','title'],boxes,10,20),{header:{x:10,y:20}})
 assert.deepEqual(toolbarGesturePatches(settings,['searchOptions','searchOption:exact'],{searchOptions:{width:300,height:24},'searchOption:exact':{width:80,height:24}},10,20),{searchOptions:{x:10,y:20}})
 const next=patchToolbarParts(settings,'title',group.title,group)
 assert.equal(next.searchInput.fontSize,19);assert.equal(next.counter.x,10)
})

test('toolbar alignment accepts its existing four-pixel row gap without weakening field defaults',()=>{
 const rect=(left,top,width)=>({left,top,width,height:20})
 const a=rect(50,0,200),b=rect(120,24,100),canvas={width:600,height:200,fields:{a:{input:a,label:a},b:{input:b,label:b}}}
 const toolbar=alignCanvasFields(canvas,['a','b'],'a','left',[],0)
 assert.equal(toolbar.blockedBy,undefined);assert.equal(toolbar.canvas.fields.b.input.left,50)
 assert.equal(alignCanvasFields(canvas,['a','b'],'a','left').blockedBy,'a','the original field safety gap remains enforced')
})

test('header panels and search children retain independent styles and stable host identities after reload',()=>{
 let settings=moveToolbarPart({},'header:second',{width:380,height:120,placement:'beside'})
 settings=moveToolbarPart(settings,'title',{panelId:'header:second',fontSize:15})
 settings=moveToolbarPart(settings,'searchInput',{backgroundColor:'#112233',borderRadius:18,width:280})
 settings=moveToolbarPart(settings,'searchOptions',{fontSize:20,textColor:'#334455'})
 settings=JSON.parse(JSON.stringify(settings))
 assert.deepEqual(toolbarPanels(settings),['header','header:second'])
 assert.equal(settings.title.panelId,'header:second');assert.equal(toolbarPartStyle(settings.searchInput).borderRadius,18)
 assert.equal(settings.searchOptions.fontSize,20);assert.equal(normalizeToolbarStyle({panelId:'invalid'}).panelId,undefined)
})
test('nominal frame width does not force scrollbar width; an explicit developer minimum is respected',()=>{
 const template={...schema,fields:[]}
 assert.equal(resolveFormLayout(template,emptyDesignerDraft('mother'),'desktop',1900,{cropEmptyCanvas:true}).minimumWidth,320)
 assert.equal(resolveFormLayout(template,emptyDesignerDraft('mother'),'desktop',1900).minimumWidth,1900,'the original Laboratory contract is unchanged')
 template.sections[0].layout={minimumWidth:900}
 assert.equal(resolveFormLayout(template,emptyDesignerDraft('mother'),'desktop',1900,{cropEmptyCanvas:true}).minimumWidth,900)
})
test('toolbar font and box settings are sanitized and preserve independent controls',()=>{
 const first=moveToolbarPart({},'search',{fontSize:19,bold:true,borderWidth:3,padding:8,textAlign:'center',textColor:'#123456'})
 const next=moveToolbarPart(first,'title',{fontSize:11})
 assert.equal(next.search.fontSize,19);assert.equal(next.title.fontSize,11)
 assert.equal(toolbarPartStyle(next.search)['--grid-tool-font'],'19px')
 assert.equal(toolbarPartStyle(next.search)['--grid-tool-border-width'],'3px')
 assert.equal(normalizeToolbarStyle({borderColor:'url(bad)',borderWidth:99}).borderWidth,12)
 assert.equal(normalizeToolbarStyle({borderColor:'url(bad)'}).borderColor,undefined)
})
test('header alignment survives designer serialization',()=>{
 const draft=setDesignerTableHeaderStyle(emptyDesignerDraft('mother'),'column','textAlign','center')
 assert.equal(validateDesignerDraft(JSON.parse(JSON.stringify(draft)),'mother',[]).tableHeaders.column.textAlign,'center')
 assert.equal(setDesignerTableHeaderStyle(draft,'column','textAlign','invalid'),draft)
})

test('additional header field rows retain their host without changing legacy rows or their source schema',()=>{
 const original={...schema,tables:[{id:'table',columns:[]}]},before=structuredClone(original)
 const legacy=addTableHeaderRow(original,'table','old-row')
 const next=addTableHeaderRow(legacy,'table','new-row','header:second')
 assert.equal(next.sections.find(s=>s.id==='new-row').settings.toolbarPanelId,'header:second')
 assert.equal(next.sections.find(s=>s.id==='old-row').settings,undefined)
 assert.equal(next.sections.find(s=>s.id==='new-row').layout.columns,20)
 assert.deepEqual(original,before);assert.equal(addTableHeaderRow(next,'table','new-row','header:other'),next)
 assert.deepEqual(JSON.parse(JSON.stringify(next)).sections,next.sections)
})

test('report rows never replace the original outer editor grid footer layout or splitter',()=>{
 const original={id:'form',sections:[{id:'editor',kind:'editor'},{id:'grid',kind:'grid'},{id:'footer',kind:'footer'}],tables:[{id:'table',sectionId:'grid',columns:[]}]}
 const rows=addTableHeaderRow(addTableHeaderRow(original,'table','legacy'),'table','hosted','header:second')
 assert.equal(usesFormComposition(original),false);assert.equal(usesFormComposition(rows),false)
 assert.equal(usesFormComposition({...rows,sections:[...rows.sections,{id:'second-editor',kind:'editor'}]}),true,'real extra form panes still use composition')
})
