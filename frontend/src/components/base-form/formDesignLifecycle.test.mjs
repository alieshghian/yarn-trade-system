import test from 'node:test'
import assert from 'node:assert/strict'
import {readDesignLifecycles,setDesignLifecycle,isDesignAvailable,formDesignLifecycleKey} from './formDesignLifecycle.ts'
import {finalizeDesign} from './formDesignReleases.ts'
import {managedDesignGroups,forkManagedDesign} from './managedDesignVersions.ts'
import {createOperationalRedesign,operationalFormCatalog} from './operationalFormCatalog.ts'
import {emptyDesignerDraft} from './designer.ts'
import {saveManagedLaboratoryForm,loadManagedLaboratoryForms} from './laboratoryFormDraftState.ts'
const memory=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}
test('route designs reuse the newest document; only explicit forks advance editions and preserve customization',()=>{
 const contract=operationalFormCatalog.find(form=>form.route==='brands')
 const a=createOperationalRedesign(contract,'old',emptyDesignerDraft('template'),{device:'desktop',width:1000,height:null,fitToPage:true})
 const b=structuredClone(a);b.id=b.schema.id='recent';b.customization.colors=true;b.designerOverrides={overrides:{'brandName::input':{fontSize:23}}}
 const forms=[a,b],before=JSON.stringify(forms),dates={old:'2026-11-01',recent:'2026-11-09'}
 for(let i=0;i<5;i++)assert.equal(managedDesignGroups(forms,dates)[0][0].id,'recent')
 assert.equal(JSON.stringify(forms),before)
 assert.equal(managedDesignGroups(forms,dates,'old')[0][0].id,'old')
 const version2=forkManagedDesign(b,'v2',forms,'2026-11-09T10:00:00Z')
 assert.equal(version2.designEdition.number,2);assert.equal(version2.designEdition.sourceFormId,'recent')
 assert.deepEqual(version2.designerOverrides,b.designerOverrides);assert.deepEqual(version2.customization,b.customization)
 assert.equal(version2.schema.id,'v2');assert.equal(b.id,'recent')
 const storage=memory();assert.equal(saveManagedLaboratoryForm(storage,'owner',version2),true)
 assert.equal(loadManagedLaboratoryForms(storage,'owner').forms[0].designEdition.number,2)
 assert.equal(forkManagedDesign(version2,'v3',[...forms,version2]).designEdition.number,3)
 const unrelated=structuredClone(b);unrelated.id=unrelated.schema.id='other';delete unrelated.schema.settings.specific.values.operationalSource
 assert.equal(managedDesignGroups([b,unrelated],dates).length,2,'identical titles do not merge unrelated designs')
})
test('archive/remove/restore affect only the exact owner and design ID, preserving source records',()=>{
 const storage=memory();storage.setItem('saved-design','unchanged');storage.setItem('recovery','history');
 assert.equal(isDesignAvailable(storage,'owner','one'),true)
 for(const state of ['archived','removed']){
  assert.equal(setDesignLifecycle(storage,'owner','one',state),true)
  assert.equal(isDesignAvailable(storage,'owner','one'),false)
  assert.equal(finalizeDesign(storage,'owner',{id:'one'},'release'),undefined)
  assert.equal(isDesignAvailable(storage,'owner','two'),true)
  assert.equal(isDesignAvailable(storage,'other-owner','one'),true)
 }
 assert.equal(setDesignLifecycle(storage,'owner','one','active'),true)
 assert.equal(isDesignAvailable(storage,'owner','one'),true)
 assert.equal(storage.getItem('saved-design'),'unchanged');assert.equal(storage.getItem('recovery'),'history')
 assert.equal(readDesignLifecycles(storage,'owner').one.state,'active')
})
test('invalid storage and write failure cannot grant integration or erase lifecycle data',()=>{
 const storage=memory();storage.setItem(formDesignLifecycleKey('owner'),'{bad')
 assert.equal(readDesignLifecycles(storage,'owner'),null)
 assert.equal(isDesignAvailable(storage,'owner','one'),false)
 assert.equal(setDesignLifecycle(storage,'owner','one','active'),false)
 assert.equal(storage.getItem(formDesignLifecycleKey('owner')),'{bad')
 const failing={getItem:()=>null,setItem:()=>{throw Error('quota')}}
 assert.equal(setDesignLifecycle(failing,'owner','one','removed'),false)
})
