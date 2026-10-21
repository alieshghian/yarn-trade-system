import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initialFormBehaviors,addFormBehavior,publishFormBehavior,resolveFormBehavior,resolveColumnLinkBehavior,readFormBehaviors,writeFormBehaviors,formBehaviorKey,laboratoryBehaviorId,emptyBehaviorInstructions,behaviorManifest,formTestReducer,initialFormTest,formTestActionFor,testActionVisible,validateTestRecord} from './formBehavior.ts'
import {registerTemplateRevision} from './formTemplateInheritance.ts'
import {finalizeDesign,loadDesignReleases} from './formDesignReleases.ts'
import {createManagedLaboratoryForm} from './laboratoryFormDraftState.ts'
import {fieldRuleMarkers,validateRecordRules} from './fieldRules.ts'
const field=(id,required=false)=>({id,kind:'text',componentId:'text',label:{fa:id,en:id,zh:id},sectionId:'editor',required})
const schema={schemaVersion:1,version:1,id:'form-laboratory',mode:'operational',title:{fa:'فرم',en:'Form',zh:'Form'},sections:[{id:'editor',kind:'editor'}],fields:[field('code',true),field('name')],actions:[]}

test('spacing defaults inherit from the Laboratory while child overrides and integration contracts persist',()=>{
 let library=initialFormBehaviors()
 library=publishFormBehavior(library,laboratoryBehaviorId,{preserveHorizontalSpacing:true,preserveVerticalSpacing:true},emptyBehaviorInstructions(),'spacing')
 library=addFormBehavior(library,'paired.child','Child')
 library=publishFormBehavior(library,'paired.child',{preserveVerticalSpacing:false},emptyBehaviorInstructions(),'override')
 assert.equal(resolveFormBehavior(library,'paired.child').preserveHorizontalSpacing,true)
 assert.equal(resolveFormBehavior(library,'paired.child').preserveVerticalSpacing,false)
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}
 writeFormBehaviors(storage,library)
 const saved=readFormBehaviors(storage),manifest=behaviorManifest({...schema,settings:{shared:{behaviorId:'paired.child'}}},saved)
 assert.equal(manifest.resizeContract.preserveOuterSpan,true)
 assert.equal(manifest.toolbarContract.containContents,true)
 assert.equal(manifest.toolbarContract.documentLocalGeometry,true)
 assert.equal(manifest.toolbarContract.version,2)
 assert.equal(manifest.toolbarContract.searchPartsSelectableIndependently,true)
 assert.equal(manifest.toolbarContract.multiSelectModifier,'ctrl-or-command')
 assert.equal(manifest.toolbarContract.defaultSearch,'right')
 assert.equal(manifest.toolbarContract.flexibleSpace,'center')
 assert.equal(manifest.labelChangeContract.preserveExplicitCompositeSources,true)
 assert.equal(manifest.policies['paired.child'].preserveVerticalSpacing,false)
})

test('composite uniqueness compares normalized tuples, scopes records and excludes the edited record',()=>{
 const form={...schema,fields:[field('first'),field('last'),field('company')],uniqueConstraints:[{id:'full-name',fieldIds:['first','last'],scopeFieldIds:['company']}]}
 const records=[{id:'1',values:{first:'علي',last:'فلاح',company:'A'}}]
 assert.deepEqual(validateRecordRules(form,{first:'حسن',last:'فلاح',company:'A'},records),{})
 assert.ok(validateRecordRules(form,{first:' علی ',last:'فلاح',company:'A'},records).first)
 assert.deepEqual(validateRecordRules(form,{first:'علی',last:'فلاح',company:'B'},records),{})
 assert.deepEqual(validateRecordRules(form,{first:'علی',last:'فلاح',company:'A'},records,'1'),{})
 assert.deepEqual(validateRecordRules(form,{first:'علی',last:'',company:'A'},records),{})
 const collision=[{id:'2',values:{first:'ab',last:'c',company:'A'}}]
 assert.deepEqual(validateRecordRules(form,{first:'a',last:'bc',company:'A'},collision),{},'compare tuples, never concatenated text')
})
test('rules remain structured through label changes and enforce independent uniqueness and dependencies',()=>{
 const form={...schema,fields:[{...field('code'),validation:[{type:'unique'}]},{...field('name'),ruleSettings:{dependencies:[{fieldId:'code',mode:'requiredWhenFilled'}]}}]}
 const rows=[{id:'1',values:{code:'کد یک',name:'نام'}}]
 assert.ok(validateTestRecord(form,{code:'كد   يك',name:''},rows).code)
 assert.ok(validateTestRecord(form,{code:'كد   يك',name:''},rows).name)
 assert.deepEqual(fieldRuleMarkers(form,form.fields[0]).map(item=>item.symbol),['U'])
 assert.equal(fieldRuleMarkers({...schema,fields:[{...field('name'),label:{fa:'نام *',en:'name',zh:'name'}}]},field('name')).length,0)
 const exact={...form,fields:form.fields.map(item=>item.id==='code'?{...item,ruleSettings:{normalizeText:false}}:item)}
 assert.equal(validateTestRecord(exact,{code:'كد   يك',name:'نام'},rows).code,undefined)
 const different={...form,fields:[field('code'),{...field('name'),ruleSettings:{dependencies:[{fieldId:'code',mode:'differentValue'}]}}]}
 assert.ok(validateRecordRules(different,{code:'یک',name:'یک'}).name)
 const codeForm={...schema,fields:[{...field('code',true),componentId:'base-form.code-input',settings:{componentSettings:{unique:true,required:true}}}]}
 assert.ok(validateRecordRules(codeForm,{code:'کد یک'},rows).code)
 assert.deepEqual(fieldRuleMarkers(codeForm,codeForm.fields[0]).map(item=>item.symbol),['*','U'])
 const optional={...codeForm,fields:[{...codeForm.fields[0],required:false,settings:{componentSettings:{unique:false,required:false}}}]}
 assert.deepEqual(validateTestRecord(optional,{code:'کد یک'},rows),{})
 assert.deepEqual(fieldRuleMarkers(optional,optional.fields[0]),[])
})

test('runtime binds the existing designed action by stable identity without replacing its presentation',()=>{
 const source={id:'demo-save',code:'F3',label:{fa:'ثبت ویژه'},primary:true}
 const before=structuredClone(source)
 assert.equal(formTestActionFor(source),'save')
 assert.deepEqual(source,before)
 assert.equal(formTestActionFor({...source,label:{fa:'نام دیگر'}}),'save')
 assert.equal(formTestActionFor({id:'custom',code:'X',operationId:'create'}),'create')
 assert.equal(formTestActionFor({id:'custom',code:'F3'}),'save')
 assert.equal(formTestActionFor({id:'action-settings',code:'⚙'}),undefined)
 for(const [id,action] of Object.entries({'new-person':'create','edit-person':'edit','delete-person':'delete','reset-sample':'close','browse-records':'next','first-record':'first','last-record':'last','previous-page':'previous','next-page':'next'}))assert.equal(formTestActionFor({id,code:''}),action)
})

test('runtime footer uses the design renderer and its exact action and text styles',()=>{
 const source=readFileSync(new URL('../../FormLaboratoryPage.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(source,/renderRuntimeFooter/)
 const footer=source.slice(source.indexOf('  const renderLaboratoryFooter'),source.indexOf('  const latestRecoverySnapshot'))
 for(const name of ['designerActionStyle','designerActionTextStyle','designerActionCode','designerActionLabel','testActionVisible','runRuntimeAction'])assert.ok(footer.includes(name),name)
 assert.match(footer,/<Shortcut code=\{entryActive/)
 assert.match(footer,/runtimeAction=\{runtimeAction\} codeStyle=/)
 assert.match(footer,/if \(formRuntimeTesting \|\|/)
})
test('form behavior has one Laboratory root, reusable child differences and immutable rollback',()=>{
 assert.deepEqual(resolveColumnLinkBehavior(initialFormBehaviors()),{allowMultipleSources:true,defaultComposition:'space',requireMismatchResolution:true})
 let library=addFormBehavior(initialFormBehaviors(),'special','ویژه')
 library=publishFormBehavior(library,'special',{trapTab:false},{...emptyBehaviorInstructions(),sourceForm:'brands',operation:'lookup'},'اختصاصی',{defaultComposition:'comma'})
 const old=structuredClone(library)
 library=publishFormBehavior(library,laboratoryBehaviorId,{enterNavigation:false,confirmCancel:true},emptyBehaviorInstructions(),'مادر')
 assert.equal(resolveFormBehavior(library,'special').enterNavigation,false)
 assert.equal(resolveFormBehavior(library,'special').trapTab,false)
 assert.equal(resolveFormBehavior(library,'special').confirmCancel,true)
 assert.equal(resolveColumnLinkBehavior(library,'special').defaultComposition,'comma')
 assert.equal(resolveColumnLinkBehavior(library,'special').requireMismatchResolution,true)
 assert.equal(old.definitions[0].revisions.length,1)
 const renamed={...schema,fields:[{...field('component'),label:{fa:'نام دیگر',en:'Other',zh:'Other'},settings:{behaviorId:'special'}}]}
 const manifest=behaviorManifest(renamed,library)
 assert.equal(manifest.definitions.length,2)
 assert.equal(manifest.definitions[1].revisions.at(-1).instructions.sourceForm,'brands')
 assert.equal(manifest.definitions[1].revisions.at(-1).columnLinks.defaultComposition,'comma')
 assert.equal(manifest.columnLinkPolicies.special.defaultComposition,'comma')
 const changedPolicy=publishFormBehavior(library,'special',{trapTab:true},emptyBehaviorInstructions(),'فقط پیمایش')
 assert.equal(resolveColumnLinkBehavior(changedPolicy,'special').defaultComposition,'comma')
 library=publishFormBehavior(library,laboratoryBehaviorId,old.definitions[0].revisions[0].policy,emptyBehaviorInstructions(),'بازگشت')
 assert.equal(resolveFormBehavior(library,'special').enterNavigation,true)
 assert.equal(resolveFormBehavior(library,'special').trapTab,false)
})
test('behavior storage rejects corruption and cycles without overwriting previous definitions',()=>{
 const values=new Map([[formBehaviorKey,'broken']]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}
 assert.throws(()=>writeFormBehaviors(storage,initialFormBehaviors()));assert.equal(values.get(formBehaviorKey),'broken')
 const library=addFormBehavior(initialFormBehaviors(),'child','child');library.definitions[0].parentId='child'
 assert.throws(()=>readFormBehaviors({getItem:()=>JSON.stringify(library)}))
})
test('shared runtime creates edits saves cancels and resets synthetic records without changing schema',()=>{
 const before=structuredClone(schema);let state=initialFormTest()
 state=formTestReducer(state,{type:'create',defaults:{code:''}})
 for(const action of ['create','edit','delete','browse'])assert.equal(testActionVisible(state.mode,action),false)
 assert.equal(testActionVisible(state.mode,'save'),true);assert.equal(testActionVisible(state.mode,'close'),true)
 assert.ok(validateTestRecord(schema,state.draft).code)
 state=formTestReducer(state,{type:'change',field:'code',value:'TEST-1'})
 assert.deepEqual(validateTestRecord(schema,state.draft),{})
 state=formTestReducer(state,{type:'save',id:'r1'})
 assert.equal(state.records.length,1);assert.equal(state.mode,'view');assert.equal(testActionVisible(state.mode,'create'),true)
 state=formTestReducer(state,{type:'edit'});state=formTestReducer(state,{type:'change',field:'code',value:'changed'});state=formTestReducer(state,{type:'close'})
 assert.equal(state.records[0].values.code,'TEST-1');assert.equal(state.draft.code,'TEST-1')
 state=formTestReducer(state,{type:'edit'});state=formTestReducer(state,{type:'change',field:'code',value:'EDIT'});state=formTestReducer(state,{type:'save',id:'unused'})
 assert.equal(state.records.length,1);assert.equal(state.records[0].id,'r1');assert.equal(state.records[0].values.code,'EDIT')
 assert.deepEqual(formTestReducer(state,{type:'reset'}),initialFormTest());assert.deepEqual(schema,before)
})
test('preview validates built-in rules and blocks unimplemented custom validators honestly',()=>{
 const document={...schema,fields:[{...field('code',true),validation:[{type:'minLength',value:3}]},{...field('quantity'),validation:[{type:'minimum',value:2},{type:'integer'}]}]}
 assert.ok(validateTestRecord(document,{code:'x',quantity:'1.2'}).code)
 assert.ok(validateTestRecord(document,{code:'xxx',quantity:'1.2'}).quantity)
 assert.deepEqual(validateTestRecord(document,{code:'xxx',quantity:'2'}),{})
 assert.ok(validateTestRecord({...schema,fields:[{...field('x'),validation:[{type:'custom',validatorId:'server-rule'}]}]},{x:'test'}).x)
})
test('final design freezes behavior references policies and instructions for integration review',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}
 let library=addFormBehavior(initialFormBehaviors(),'custom','ویژه')
 library=publishFormBehavior(library,'custom',{}, {...emptyBehaviorInstructions(),sourceForm:'purchaseOrders',operation:'select-only'},'قرارداد')
 writeFormBehaviors(storage,library)
 const form=createManagedLaboratoryForm({id:'child',name:'فرم جدید',mode:'operational',templateSchema:{...schema,settings:{shared:{behaviorId:'custom'}}},templateDesigner:{overrides:{}},frame:{width:1100,height:null,fitToPage:true}})
 const release=finalizeDesign(storage,'owner',form,'release')
 assert.ok(release);assert.equal(release.behavior.definitions.find(item=>item.id==='custom').revisions.at(-1).instructions.operation,'select-only')
 const previous=structuredClone(release.behavior)
 writeFormBehaviors(storage,publishFormBehavior(library,'custom',{enterNavigation:false},emptyBehaviorInstructions(),'جدید'))
 assert.deepEqual(loadDesignReleases(storage,'owner')[0].behavior,previous)
})
