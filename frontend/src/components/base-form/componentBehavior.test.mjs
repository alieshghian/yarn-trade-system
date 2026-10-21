import test from 'node:test'
import assert from 'node:assert/strict'
import {initialComponentLibrary,addLibraryComponent,publishComponentRevision,resolveComponentCapabilities,writeComponentLibrary,readComponentLibrary,componentLibraryKey} from './componentBehavior.ts'
import {saveFieldBlueprint,loadFieldBlueprints,addDocumentField} from './formDocumentControls.ts'
import {readFileSync} from 'node:fs'
import {nextIncrementalCode,validateComponentCode,defaultCodeComponentSettings} from './serialCode.ts'

test('date, configurable code and incremental code are reusable library targets',()=>{
 const registry=readFileSync(new URL('./componentRegistry.ts',import.meta.url),'utf8')
 for(const id of ['base-form.date-input','base-form.code-input','base-form.incremental-code'])assert.ok(registry.includes(`id:'${id}'`))
 assert.ok(registry.includes("schemaKind:'date'"))
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
