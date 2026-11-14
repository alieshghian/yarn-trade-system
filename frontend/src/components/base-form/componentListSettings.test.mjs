import test from 'node:test'
import assert from 'node:assert/strict'
import {choiceMatches,componentAccessAllowed,resolveListSettings,copyFieldComponentSettings} from './componentListSettings.ts'
import {initialComponentLibrary,addLibraryComponent,publishComponentRevision,resolveComponentCapabilities} from './componentBehavior.ts'
import {addDocumentField,convertDocumentFieldToComponent,fieldComponentChoice,saveFieldBlueprint,loadFieldBlueprints} from './formDocumentControls.ts'

test('search matches mixed-order tokens across code/name, Arabic variants and both numeral systems',()=>{
 assert.ok(choiceMatches('۱۲۳ كيان',['AB123','کیان']))
 assert.ok(choiceMatches('کیان ١٢٣',['AB123','كيان']))
 assert.ok(!choiceMatches('125',['AB123','کیان']))
})
test('role restrictions fail closed and capability layers merge individual permissions',()=>{
 const settings=resolveListSettings({permissions:{add:'admin',edit:'none'}},{permissions:{setDefault:'admin'}})
 assert.equal(componentAccessAllowed(settings.permissions.add),false)
 assert.equal(componentAccessAllowed(settings.permissions.add,'admin'),true)
 assert.equal(componentAccessAllowed(settings.permissions.edit,'admin'),false)
 assert.equal(settings.permissions.remove,'everyone')
})
test('destination copies only selected settings, independently preserving bindings, identity and layout',()=>{
 const fields=[{id:'a',kind:'valueList',componentId:'base-form.value-list',settings:{listSettings:{searchEnabled:true}}},{id:'b',kind:'lookup',componentId:'base-form.system-lookup',label:{fa:'برند'},dataSourceId:'brands',dataBinding:{kind:'dataField',dataFieldId:'brandId'},settings:{lookupSettings:{sourceId:'brands'},layout:{grid:{columns:20}},listSettings:{allowEmpty:false}}}]
 const schema={fields},original=structuredClone(schema),settings=resolveListSettings({searchEnabled:true,allowEmpty:true,permissions:{add:'admin'}})
 const copied=copyFieldComponentSettings(schema,'b','a',['search','permissions'],settings)
 assert.deepEqual(schema,original);assert.equal(copied.fields[1].id,'b');assert.deepEqual(copied.fields[1].dataBinding,fields[1].dataBinding)
 assert.deepEqual(copied.fields[1].settings.lookupSettings,{sourceId:'brands'});assert.deepEqual(copied.fields[1].settings.layout,fields[1].settings.layout)
 assert.equal(copied.fields[1].settings.listSettings.allowEmpty,false)
 settings.permissions.add='none';assert.equal(copied.fields[1].settings.listSettings.permissions.add,'admin')
 assert.equal(copyFieldComponentSettings(schema,'b','b',['search'],settings),schema)
})
test('library revisions preserve permissions, inherited differences and new lookup sources across JSON/blueprints',()=>{
 let library=addLibraryComponent(initialComponentLibrary(),'custom','Custom','base-form.value-list','base-form.value-list',{listSettings:{permissions:{remove:'none'}}})
 library=publishComponentRevision(library,'base-form.value-list',{listSettings:{searchEnabled:true,permissions:{add:'admin'}}})
 assert.deepEqual(resolveListSettings(resolveComponentCapabilities(library,'custom').listSettings).permissions,{add:'admin',edit:'everyone',remove:'none',setDefault:'everyone'})
 const store=new Map(),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)}
 const blueprint={id:'brand.lookup',name:'Brand',componentId:'base-form.system-lookup',kind:'lookup',valueType:'text',listSettings:{allowEmpty:true,permissions:{add:'admin'}},lookupSettings:{sourceId:'brands',returnMode:'selectAfterSave'}}
 assert.ok(saveFieldBlueprint(storage,'u',blueprint))
 const saved=loadFieldBlueprints(storage,'u')[0],schema={sections:[{id:'editor',kind:'editor'}],fields:[]}
 const added=addDocumentField(schema,'editor','brand','برند',saved),field=JSON.parse(JSON.stringify(added)).fields[0]
 assert.equal(field.kind,'lookup');assert.deepEqual(field.settings.lookupSettings,blueprint.lookupSettings);assert.deepEqual(field.settings.listSettings,blueprint.listSettings)
 const converted=convertDocumentFieldToComponent(added,'brand',{componentId:'base-form.value-list',kind:'valueList',valueType:'text'})
 assert.equal(converted.fields[0].settings.lookupSettings,undefined)
})


test('component selector follows the actual field, preset and saved library definition after conversion',()=>{
 const keys=['ordinary','component:base-form.value-list','preset:contact.phone','preset:contact.address','blueprint:custom.phone']
 const field={id:'f',componentId:'definition.field',kind:'text',valueType:'text',label:{fa:'نام'},dataBinding:{kind:'dataField',dataFieldId:'name'},settings:{layout:{grid:{columnStart:3}},ruleSettings:{required:true}}}
 const schema={fields:[field]},original=structuredClone(schema)
 assert.equal(fieldComponentChoice(field,keys),'ordinary')
 let draft=convertDocumentFieldToComponent(schema,'f',{componentId:'base-form.value-list',componentPresetId:'contact.address',kind:'valueList',valueType:'text',multiline:true})
 draft=JSON.parse(JSON.stringify(draft))
 assert.equal(fieldComponentChoice(draft.fields[0],keys),'preset:contact.address')
 assert.equal(draft.fields[0].settings.multiline,true)
 draft=convertDocumentFieldToComponent(draft,'f',{componentId:'base-form.value-list',componentDefinitionId:'custom.phone',kind:'valueList',valueType:'text'})
 assert.equal(fieldComponentChoice(draft.fields[0],keys),'blueprint:custom.phone')
 assert.equal(draft.fields[0].settings.componentPresetId,undefined)
 draft=convertDocumentFieldToComponent(draft,'f',{componentId:'definition.field',kind:'text',valueType:'text'})
 assert.equal(fieldComponentChoice(draft.fields[0],keys),'ordinary')
 assert.deepEqual(draft.fields[0].dataBinding,field.dataBinding)
 assert.deepEqual(draft.fields[0].settings.layout,field.settings.layout)
 assert.deepEqual(draft.fields[0].settings.ruleSettings,field.settings.ruleSettings)
 assert.deepEqual(schema,original)
 assert.equal(fieldComponentChoice({...field,componentId:'external.custom'},keys),'current')
})

test('legacy component identity matches effective list rendering without guessing from field labels',()=>{
 const keys=['ordinary','component:base-form.value-list','component:base-form.number-control','preset:contact.phone','preset:contact.mobile'];
 const field={id:'spinning',componentId:'definition.field',kind:'valueList',label:{fa:'نوع ریس'},settings:{}};
 assert.equal(fieldComponentChoice(field,keys),'component:base-form.value-list');
 for(const kind of ['select','lookup'])assert.equal(fieldComponentChoice({...field,kind,settings:{listSettings:{searchEnabled:true}}},keys),'component:base-form.value-list');
 assert.equal(fieldComponentChoice({...field,kind:'select'},keys),'current');
 assert.equal(fieldComponentChoice({...field,kind:'text',label:{fa:'تلفن'}},keys),'ordinary');
 assert.equal(fieldComponentChoice({...field,componentId:'base-form.number-control'},keys),'component:base-form.number-control');
 assert.equal(fieldComponentChoice({...field,settings:{componentPresetId:'contact.mobile'}},keys),'preset:contact.mobile');
 assert.equal(fieldComponentChoice(JSON.parse(JSON.stringify(field)),keys),'component:base-form.value-list');
})
