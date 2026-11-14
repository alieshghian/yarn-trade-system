import test from 'node:test'
import assert from 'node:assert/strict'
import {initialComponentLibrary,addLibraryComponent,publishComponentRevision,resolveComponentCapabilities,writeComponentLibrary,readComponentLibrary,componentLibraryKey} from './componentBehavior.ts'
import {saveFieldBlueprint,loadFieldBlueprints,addDocumentField} from './formDocumentControls.ts'
import {readFileSync} from 'node:fs'
import {nextIncrementalCode,validateComponentCode,defaultCodeComponentSettings} from './serialCode.ts'
import {evaluateDerivedFields,evaluateDerivedFieldParts,moveDerivedSource} from './derivedField.ts'

test('date, configurable code and incremental code are reusable library targets',()=>{
 const registry=readFileSync(new URL('./componentRegistry.ts',import.meta.url),'utf8')
 for(const id of ['base-form.date-input','base-form.code-input','base-form.incremental-code'])assert.ok(registry.includes(`id:'${id}'`))
 assert.ok(registry.includes("schemaKind:'date'"))
})
test('derived display and incremental code are built-in reusable library components',()=>{
 const registry=readFileSync(new URL('./componentRegistry.ts',import.meta.url),'utf8'),library=initialComponentLibrary()
 for(const id of ['base-form.incremental-code','base-form.derived-display']){assert.ok(registry.includes(`id:'${id}'`));assert.ok(library.components.some(item=>item.id===id))}
})
test('derived display composes ordered values, skips blanks and safely breaks cycles',()=>{
 const field=(id,componentId,sourceFieldIds,separator=' ')=>({id,componentId,settings:{derivedSettings:{sourceFieldIds,separator}}})
 const fields=[field('full','base-form.derived-display',['first','middle','last'],' '),field('cycleA','base-form.derived-display',['cycleB']),field('cycleB','base-form.derived-display',['cycleA']),{id:'first',componentId:'base-form.code-input'},{id:'middle',componentId:'base-form.code-input'},{id:'last',componentId:'base-form.code-input'}]
 assert.deepEqual(evaluateDerivedFields(fields,{first:'Ada',middle:'',last:'Lovelace',cycleA:'old'}),{first:'Ada',middle:'',last:'Lovelace',cycleA:'',full:'Ada Lovelace',cycleB:''})
})
test('derived display source order is explicit, reversible, persists and isolates mixed-direction values',()=>{
 const full={id:'full',componentId:'base-form.derived-display',settings:{derivedSettings:{sourceFieldIds:['nameFa','brandEn','weight'],separator:' · '}}}
 const fields=[full,{id:'nameFa',componentId:'definition.field'},{id:'brandEn',componentId:'definition.field'},{id:'weight',componentId:'definition.field'},{id:'productCode',componentId:'base-form.incremental-code'}]
 const values={nameFa:'نخ پلی استر',brandEn:'Global Trade NM',weight:'300',productCode:'AA17'}
 assert.deepEqual(evaluateDerivedFieldParts(fields,values,'full'),{parts:['نخ پلی استر','Global Trade NM','300'],separator:' · '})
 assert.equal(evaluateDerivedFields(fields,values).full,'نخ پلی استر · Global Trade NM · 300')
 assert.deepEqual(JSON.parse(JSON.stringify(full.settings.derivedSettings)),{sourceFieldIds:['nameFa','brandEn','weight'],separator:' · '})
 assert.deepEqual(moveDerivedSource(full.settings.derivedSettings.sourceFieldIds,'weight',-1),['nameFa','weight','brandEn'])
 assert.deepEqual(moveDerivedSource(full.settings.derivedSettings.sourceFieldIds,'nameFa',-1),['nameFa','brandEn','weight'])
 assert.ok(!evaluateDerivedFieldParts(fields,values,'full').parts.includes(values.productCode),'unselected fields such as the product code do not appear')
})
test('new derived fields are saved as read-only text with per-form source settings',()=>{
 const schema={fields:[{id:'name',label:{fa:'نام',en:'Name',zh:'名称'},componentId:'base-form.code-input'}],sections:[{id:'editor',kind:'editor',layout:{columns:20}}]}
 const next=addDocumentField(schema,'editor','full-name','نام کامل',{kind:'text',componentId:'base-form.derived-display',valueType:'text',derivedSettings:{sourceFieldIds:['name'],separator:' — '}})
 const field=next.fields.find(item=>item.id==='full-name')
 assert.equal(field.readOnly,true);assert.equal(field.kind,'text');assert.deepEqual(field.settings.derivedSettings,{sourceFieldIds:['name'],separator:' — '})
})

test('Title aliases and renamed components inherit one stable behavior reference',()=>{
 let library=initialComponentLibrary()
 library=addLibraryComponent(library,'brand-origin','منشأ برند','persons.title-control')
 const before=structuredClone(library)
 library=publishComponentRevision(library,'base-form.value-list',{searchChoices:true,maxEntryLength:80})
 assert.equal(resolveComponentCapabilities(library,'persons.title-control').searchChoices,true)
 assert.equal(resolveComponentCapabilities(library,'brand-origin').searchChoices,true)
 assert.equal(resolveComponentCapabilities(library,'brand-origin').maxEntryLength,80)
 assert.deepEqual(before.components[0].revisions[0].capabilities.searchChoices,false)
 library=publishComponentRevision(library,'brand-origin',{maxEntryLength:50})
 library=publishComponentRevision(library,'base-form.value-list',{searchChoices:false,maxEntryLength:120})
 assert.equal(resolveComponentCapabilities(library,'brand-origin').maxEntryLength,50)
 assert.equal(resolveComponentCapabilities(library,'brand-origin').searchChoices,false)
 assert.equal(library.components.find(item=>item.id==='brand-origin')?.name,'منشأ برند')
})
test('rollback creates an immutable new revision and invalid/cyclic storage is never overwritten',()=>{
 let library=initialComponentLibrary();const old=structuredClone(library)
 library=publishComponentRevision(library,'base-form.value-list',{searchChoices:true})
 library=publishComponentRevision(library,'base-form.value-list',old.components[0].revisions[0].capabilities)
 assert.equal(library.components[0].revisions.length,3)
 assert.equal(resolveComponentCapabilities(library,'persons.title-control').searchChoices,false)
 assert.equal(library.components[0].revisions[1].capabilities.searchChoices,true)
 const store=new Map([[componentLibraryKey,'broken']]),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}
 assert.throws(()=>writeComponentLibrary(storage,library));assert.equal(store.get(componentLibraryKey),'broken')
 const cycle=addLibraryComponent(initialComponentLibrary(),'child','child','persons.title-control');cycle.components[0].parentId='child'
 assert.throws(()=>readComponentLibrary({getItem:()=>JSON.stringify(cycle)}))
})
test('older component libraries gain built-in date and code choices in memory without rewriting saved bytes',()=>{
 const legacy={version:1,components:[{id:'base-form.value-list',name:'فهرست',rendererId:'base-form.value-list',revisions:[{version:1,createdAt:'',capabilities:{searchChoices:false,confirmRemoval:false,maxEntryLength:1000}}]}]},bytes=JSON.stringify(legacy),writes=[]
 const library=readComponentLibrary({getItem:()=>bytes,setItem:(key,value)=>writes.push([key,value])})
 assert.ok(library.components.some(item=>item.id==='base-form.date-input'))
 assert.ok(library.components.some(item=>item.id==='base-form.code-input'))
 assert.ok(library.components.some(item=>item.id==='base-form.incremental-code'))
 assert.deepEqual(writes,[])
})
test('saved components retain library identity after label changes and across users without sharing fields',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}
 const definition={id:'brand-origin',name:'منشأ برند',kind:'select',componentId:'persons.title-control',valueType:'text'}
 saveFieldBlueprint(storage,'owner',definition)
 const saved=loadFieldBlueprints(storage,'owner')[0]
 const schema={id:'form',sections:[{id:'editor',kind:'editor',layout:{columns:20}}],fields:[]}
 const next=addDocumentField(schema,'editor','a','نام متفاوت',saved)
 assert.equal(next.fields[0].componentId,'persons.title-control')
 assert.equal(next.fields[0].settings.componentDefinitionId,'brand-origin')
 assert.equal(loadFieldBlueprints(storage,'other').length,0)
 assert.equal(readComponentLibrary(storage).components.find(item=>item.id==='brand-origin').parentId,'base-form.value-list')
})

test('code component settings survive reusable-library save and field installation',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
 const settings={...defaultCodeComponentSettings,mode:'alphanumeric',required:true,unique:true,incremental:true,suffixWidth:3}
 const blueprint={id:'serial-product-code',name:'کد کالا افزایشی',kind:'text',componentId:'base-form.incremental-code',valueType:'alphanumeric',componentSettings:settings}
 saveFieldBlueprint(storage,'owner',blueprint)
 const saved=loadFieldBlueprints(storage,'owner')[0]
 const schema={id:'form',sections:[{id:'editor',kind:'editor',layout:{columns:20}}],fields:[]}
 const installed=addDocumentField(schema,'editor','product.code','کد کالا',saved).fields[0]
 assert.deepEqual(installed.settings.componentSettings,settings)
 assert.equal(installed.required,true)
 assert.deepEqual(installed.validation,[{type:'unique'}])
 assert.equal(nextIncrementalCode(['AB999'],settings),'AC001')
 assert.match(validateComponentCode('AB001',settings,['AB001'])??'',/استفاده/)
})

import {resolveComponentCodeSettings} from './componentBehavior.ts'
import {createManagedLaboratoryForm,saveManagedLaboratoryForm,loadManagedLaboratoryForms,createManagedFormStructureHistory,commitManagedFormStructure,undoManagedFormStructure,redoManagedFormStructure} from './laboratoryFormDraftState.ts'
import {emptyDesignerDraft} from './designer.ts'
test('code settings persist in immutable library revisions, schema history, saved documents and independent copies',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
 const settings={...defaultCodeComponentSettings,format:'segments',segments:[{kind:'number',length:2},{kind:'letters',length:1}],incrementOrder:[1,0],fixedLength:3,maxLength:3,incremental:true}
 let library=initialComponentLibrary();const originalLibrary=structuredClone(library)
 library=publishComponentRevision(library,'base-form.code-input',{},settings)
 library=addLibraryComponent(library,'code.child','کد فرزند','base-form.code-input','base-form.code-input',{}, {maxLength:4,fixedLength:undefined})
 writeComponentLibrary(storage,library)
 assert.deepEqual(resolveComponentCodeSettings(readComponentLibrary(storage),'base-form.code-input'),settings)
 assert.equal(resolveComponentCodeSettings(library,'code.child').maxLength,4)
 assert.deepEqual(originalLibrary,initialComponentLibrary())
 const template={id:'form-laboratory.persons-synthetic',schemaVersion:1,version:1,status:'draft',mode:'hybrid',title:{fa:'مادر',en:'Master',zh:'Master'},sections:[{id:'editor',kind:'editor'}],fields:[]}
 const originalTemplate=structuredClone(template),blueprint={id:'new.code',name:'کد',kind:'text',componentId:'base-form.code-input',valueType:'text',componentSettings:settings}
 assert.ok(saveFieldBlueprint(storage,'owner',blueprint));assert.deepEqual(resolveComponentCodeSettings(readComponentLibrary(storage),'new.code'),settings)
 const form=createManagedLaboratoryForm({id:'form.code-a',name:'Code A',mode:'hybrid',templateSchema:template,templateDesigner:emptyDesignerDraft(template.id),frame:{width:1280,height:null,fitToPage:true,device:'desktop'}})
 let history=createManagedFormStructureHistory(form.schema)
 history=commitManagedFormStructure(history,addDocumentField(form.schema,'editor','a','کد الف',loadFieldBlueprints(storage,'owner')[0]))
 assert.equal(undoManagedFormStructure(history).present.fields.length,0)
 assert.deepEqual(redoManagedFormStructure(undoManagedFormStructure(history)).present.fields[0].settings.componentSettings,settings)
 form.schema=history.present;assert.equal(saveManagedLaboratoryForm(storage,'owner',form),true)
 const loaded=loadManagedLaboratoryForms(storage,'owner').forms[0];assert.deepEqual(loaded.schema.fields[0].settings.componentSettings,settings)
 const copy=createManagedLaboratoryForm({id:'form.code-b',name:'Code B',mode:'hybrid',templateSchema:loaded.schema,templateDesigner:emptyDesignerDraft(loaded.id),frame:loaded.frame})
 copy.schema.fields[0].settings.componentSettings.segments[0].length=3
 assert.deepEqual(form.schema.fields[0].settings.componentSettings,settings)
 assert.deepEqual(template,originalTemplate)
 assert.equal(loadManagedLaboratoryForms(storage,'other').forms.length,0)
})

test('old numeric code blueprints remain string-valued on installation without rewriting stored settings',()=>{
 const raw=JSON.stringify([{id:'old-code',name:'Old',kind:'number',componentId:'base-form.code-input',valueType:'number',componentSettings:{mode:'number',suffixWidth:4}}])
 const storage={getItem:()=>raw,setItem:()=>{throw Error('Read must not write')}}
 const old=loadFieldBlueprints(storage,'owner')[0]
 assert.equal(old.componentSettings.format,'legacy')
 const schema={id:'code-form',sections:[{id:'editor',kind:'editor'}],fields:[]}
 const field=addDocumentField(schema,'editor','code','Code',old).fields[0]
 assert.equal(field.kind,'text');assert.equal(field.valueType,'text')
 assert.equal(nextIncrementalCode(['۰۰۰۹'],old.componentSettings),'0010')
 assert.equal(storage.getItem(),raw)
})
