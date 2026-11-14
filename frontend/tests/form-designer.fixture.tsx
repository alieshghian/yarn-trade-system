import {FormValueList} from '../src/components/base-form/FormValueList'
import {createProductGroupLaboratorySchema} from '../src/components/base-form/productGroupLaboratoryForm'
import {integratedDesignReleases,integratedDesignRoute,type FormIntegrationReceipt} from '../src/components/base-form/formIntegrationRegistry.ts'
Object.assign(window,{testDeploymentReceipt:(receipt:FormIntegrationReceipt)=>{(integratedDesignReleases as FormIntegrationReceipt[]).push(receipt);window.dispatchEvent(new Event('form-design-releases-updated'))},testIntegratedDesignRoute:integratedDesignRoute})
import {createSyntheticPersons} from '../src/components/base-form/syntheticPersons'
import PersonsPage from '../src/PersonsPage'
import {setAccessPermissions} from '../src/api'
// Isolated browser fixture: real page and global interactions, synthetic data only.
import React from 'react'
import {AppearanceNumberInput} from '../src/components/base-form/AppearanceNumberInput'

function EntryContractFixture(){
 const [value,setValue]=React.useState('مات'),[single,setSingle]=React.useState('')
 return <div className="person-form-grid editing" data-form-fields dir="rtl" style={{gridTemplateColumns:'repeat(4,160px)'}}><label data-field-id="material" data-focus-order="1"><FormValueList field="material" listPrimary="مات" label="جنس" primary={value} numbers={['مات','براق']} disabled={false} fa formatValue={value=>value} onSelectValue={setValue} onChange={primary=>setValue(primary)}/></label><label data-field-id="skipped" data-focus-order="3"><input data-field="skipped"/></label><label data-field-id="next" data-focus-order="2"><input data-field="next"/></label><label data-field-id="choice" data-focus-order="4"><select data-field="choice" defaultValue="a"><option value="a">اول</option><option value="b">دوم</option></select></label><label data-field-id="single" data-focus-order="5"><FormValueList field="single" label="تک گزینه" primary={single} listPrimary="" numbers={['تنها گزینه']} disabled={false} fa onSelectValue={setSingle} onChange={setSingle}/></label><label data-field-id="singleNext" data-focus-order="6"><input data-field="singleNext"/></label></div>
}
function NumberEditorFixture(){
 const [value,setValue]=React.useState<number|undefined>(140),[changes,setChanges]=React.useState(0)
 return <div><AppearanceNumberInput aria-label="عدد آزمایش کنترل مشترک" value={value} onValueChange={next=>{setValue(next);setChanges(count=>count+1)}}/><button type="button">خروج از عدد</button><output data-number-changes={changes}>{changes}</output></div>
}
import { createRoot } from 'react-dom/client'
import FormLaboratoryPage from '../src/FormLaboratoryPage'
import { installFormInteraction } from '../src/formInteraction'
import { defaultNavigation,defaultPreferences,icons,type MenuKey } from '../src/navigation'
import NavigationSidebar from '../src/NavigationSidebar'
import { defaultDesignTheme } from '../src/components/base-form/themeDesignSystem'
import {createManagedLaboratoryForm,loadManagedLaboratoryForms,resolveManagedLaboratoryDesigner,managedFormWithDesigner,saveManagedLaboratoryForm} from '../src/components/base-form/laboratoryFormDraftState'
import {readFormRecovery,writeFormRecovery} from '../src/components/base-form/formDocumentRecovery'
import {emptyDesignerDraft,attachDesignerDocument,createDesignerHistory} from '../src/components/base-form/designer'
import type {FormSchemaDraft} from '../src/components/base-form/formSchema'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if (!import.meta.env.DEV) throw new Error('Developer regression fixture only')
// Match the application's bounded tab host for the populated virtual-grid case.
// An unbounded fixture lets the virtual spacer become the viewport itself.
const interactionAudit=new URLSearchParams(location.search).has('interactionAudit')
const designerRenderAudit={commits:0};Object.assign(window,{designerRenderAudit})
if(interactionAudit||new URLSearchParams(location.search).has('layoutPreview'))document.getElementById('root')!.style.height='100dvh'
let themeRevision=0
let themes=[structuredClone(defaultDesignTheme)]
const backupDatabase=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('regression-server-backups',1);request.onupgradeneeded=()=>request.result.createObjectStore('versions',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
async function readServerBackups(){const db=await backupDatabase;return new Promise<any[]>((resolve,reject)=>{const request=db.transaction('versions').objectStore('versions').getAll();request.onsuccess=()=>{const versions=request.result.sort((a:any,b:any)=>a.createdAt.localeCompare(b.createdAt));Object.assign(window,{testServerBackupVersions:versions});resolve(versions)};request.onerror=()=>reject(request.error)})}
const layoutPreviewAudit = { syntheticQueries: 0 }
Object.assign(window, { layoutPreviewAudit })
window.fetch = (async (input: RequestInfo | URL,init?:RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const respond=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
  if(url.includes('/api/form-design-backups')){
    if(sessionStorage.getItem('test-backup-failure')==='1')return new Response(JSON.stringify({error:'backup unavailable'}),{status:503,headers:{'Content-Type':'application/json'}})
    const saved=await readServerBackups()
    if(init?.method==='POST'){const document=JSON.parse(String(init.body));const id=crypto.randomUUID().replaceAll('-','');saved.push({id,formId:document.formId,createdAt:new Date().toISOString(),reason:document.reason,document});const db=await backupDatabase;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('versions','readwrite');tx.objectStore('versions').put(saved.at(-1));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});return respond({id})}
    const parsed=new URL(url,location.href), id=parsed.pathname.split('/').at(-1)
    if(id&&id!=='form-design-backups'){const document=saved.find(item=>item.id===id)?.document;return respond(parsed.searchParams.get('handoff')==='true'?document?.snapshot:document)}
    const formId=parsed.searchParams.get('formId');return respond(saved.filter(item=>!formId||item.formId===formId).map(({id,formId,createdAt,reason})=>({id,formId,createdAt,reason})).reverse())
  }
  if(url.includes('/api/navigation'))return respond({nodes:defaultNavigation(),preferences:defaultPreferences(),rowVersion:''})
  if(url.includes('/api/design-system/themes')){
    if(init?.method==='PUT'){themes=JSON.parse(String(init.body)).themes;themeRevision++;return respond({rowVersion:String(themeRevision)})}
    return respond({rowVersion:String(themeRevision),library:{version:themeRevision,themes,previous:[]},preferences:null})
  }
  if (url.includes('/api/form-laboratory/synthetic-grid')) {
    layoutPreviewAudit.syntheticQueries++
    const populated = new URLSearchParams(location.search).has('layoutPreview')
    const query = JSON.parse(String(init?.body ?? '{}')), size = query.pageSize ?? 100
    return respond({ items: populated ? createSyntheticPersons(size) : [], total: populated ? 100000 : 0, page: query.page ?? 1, pageSize: size })
  }
  throw new Error('Unexpected operational request in Designer regression: ' + url)
}) as typeof fetch
installFormInteraction()
// Disposable geometry case with the same multi-span and flexible-row pattern as a definition form.
const smartLayout=new URLSearchParams(location.search).has('smartLayout')
const scrollExtent=new URLSearchParams(location.search).has('scrollExtent')
const smartLayoutDragRegression=new URLSearchParams(location.search).has('dragRegression')
const smartLayoutUserId=scrollExtent?'isolated-scroll-extent-regression':smartLayout?(smartLayoutDragRegression?'isolated-smart-layout-drag-regression':'isolated-smart-layout-regression'):'isolated-browser-regression'
const smartLayoutSeedKey=(scrollExtent?'scroll-extent-'+new URLSearchParams(location.search).get('scrollExtent')+'-':'')+(smartLayoutDragRegression?'smart-layout-drag-seeded-v1-':'smart-layout-seeded-v2-')+new URLSearchParams(location.search).get('language')
if(smartLayout&&!sessionStorage.getItem(smartLayoutSeedKey)){
 const user=smartLayoutUserId,id=smartLayoutDragRegression?'form.smart-layout-drag-regression':'form.smart-layout-regression',sectionId='smart.editor'
 const names:Record<string,string>={code:'کد نمونه',name:'نام نمونه',material:'جنس',luster:'درخشندگی',group:'گروه',number:'شماره',countType:'نوع نمره',filament:'تعداد فیلامنت',unit:'واحد',twist:'نوع تاب',amount:'مقدار تاب',notes:'توضیحات',active:'فعال'}
 const field=(left:number,top:number,width:number,height=34)=>({input:{left,top,width,height},label:{left,top:top-24,width,height:18},select:{left:left+4,top:top-24,width:19,height:18}})
 const fields={code:field(1190,70,153),name:field(810,70,340),material:field(620,70,151),luster:field(430,70,154),group:field(240,70,149),number:field(1190,170,153),countType:field(1000,173,148),filament:field(810,168,155),unit:field(620,172,152),twist:field(430,169,150),amount:field(240,171,151),notes:field(200,290,1600,80),active:{input:{left:70,top:320,width:171,height:14},label:{left:245,top:320,width:45,height:18},select:{left:74,top:296,width:19,height:18}}}
 if(smartLayoutDragRegression)fields.notes={...field(500,290,900,36),label:{left:0,top:266,width:1400,height:18},select:{left:0,top:266,width:19,height:18}}
 const schema:FormSchemaDraft={id,schemaVersion:1,version:1,status:'draft',mode:'hybrid',title:{fa:'آزمایش تراز فرم',en:'Layout regression',zh:'Layout regression'},layout:{direction:'vertical',gap:12},sections:[{id:sectionId,kind:'editor',layout:{columns:20,gap:12,minimumWidth:1440}},{id:'smart.footer',kind:'footer'}],fields:Object.keys(fields).map(key=>({id:key,sectionId,componentId:'definition.field',kind:key==='notes'?'textarea':key==='active'?'checkbox':'text',label:{fa:names[key],en:key,zh:key},span:4})),actions:[]}
 if(new URLSearchParams(location.search).has('footerMode'))schema.actions=[['new-person','Space'],['demo-save','F3'],['reset-sample','Esc'],['edit-person','Insert'],['delete-person','Delete'],['copy-last','F2'],['copy-selected','F4']].map(([id,code])=>({id,code,sectionId:'smart.footer',label:{fa:id,en:id,zh:id}}))
 if(new URLSearchParams(location.search).has('emptyFields'))schema.fields=[]
 if(scrollExtent)schema.sections[0].settings={viewport:{heightMode:'fixed',overflowY:new URLSearchParams(location.search).get('scrollExtent')==='legacy'?'scroll':'auto'}}
 const canvas={width:1440,height:scrollExtent?2000:500,fields,centeredFieldIds:Object.keys(fields),alignmentExceptionFieldIds:smartLayoutDragRegression?[]:['notes']}
 const draft={...emptyDesignerDraft(id),layoutMode:'canvas' as const,canvas,sectionCanvases:{[sectionId]:canvas}}
 if(new URLSearchParams(location.search).get('scrollExtent')==='schema'){
   Object.assign(draft,{layoutMode:'schema',overrides:{'code::input':{offsetY:60}}})
 }
 const form=createManagedLaboratoryForm({id,name:'آزمایش تراز فرم',mode:'hybrid',templateSchema:schema,templateDesigner:draft,frame:{device:'desktop',width:1440,height:1000,fitToPage:true}})
 if(!saveManagedLaboratoryForm(localStorage,user,form)||!writeFormRecovery(localStorage,user,{form,designerHistory:attachDesignerDocument(createDesignerHistory({...draft,formId:id}),form.schema),structureHistory:{past:[],present:form.schema,future:[]}},'Smart layout regression'))throw new Error('Smart layout fixture could not preserve the draft')
 sessionStorage.setItem(smartLayoutSeedKey,'true')
}
// Reproduce an old oversized Canvas only in this disposable browser fixture.
const leadingCanvas=new URLSearchParams(location.search).has('leadingCanvas')
const canvasSeedKey=leadingCanvas?'leading-canvas-seeded':'legacy-canvas-seeded'
if((leadingCanvas||new URLSearchParams(location.search).has('legacyCanvas'))&&!sessionStorage.getItem(canvasSeedKey)){
 const user='isolated-browser-regression',collection=loadManagedLaboratoryForms(localStorage,user),recovery=readFormRecovery(localStorage,user)
 const snapshot=recovery?.activeFormId?recovery.documents[recovery.activeFormId]?.current:undefined
 const form=snapshot?.form??collection?.forms.find(item=>item.id===collection.activeFormId)
 if(!form)throw new Error('Legacy Canvas test needs an existing synthetic draft')
 const fields=Object.fromEntries(form.schema.fields.map((field,index)=>{const left=(leadingCanvas?1400:20)+(index%2)*260,top=44+Math.floor(index/2)*100;return [field.id,{label:{left,top:top-26,width:220,height:22},input:{left,top,width:220,height:36}}]}))
 const draft={...resolveManagedLaboratoryDesigner(form),layoutMode:'canvas' as const,canvas:{width:2200,height:1600,fields}}
 const next=managedFormWithDesigner(leadingCanvas?{...form,schema:{...form.schema,sections:form.schema.sections.map(section=>section.kind==='editor'?{...section,settings:{...section.settings,viewport:{heightMode:'fixed',overflowX:'auto',overflowY:'auto'}}}:section)}}:form,draft)
 if(!saveManagedLaboratoryForm(localStorage,user,next)||!writeFormRecovery(localStorage,user,{form:next,designerHistory:attachDesignerDocument(createDesignerHistory(draft),next.schema),structureHistory:{past:[],present:next.schema,future:[]}},'Synthetic old Canvas'))throw new Error('Legacy Canvas fixture could not preserve the draft')
 sessionStorage.setItem(canvasSeedKey,'true')
}
// A separate synthetic document; neither source form nor Laboratory template is rewritten.
if(new URLSearchParams(location.search).has('codeRuntime')||new URLSearchParams(location.search).has('derivedRuntime')||new URLSearchParams(location.search).has('batchRuntime')||new URLSearchParams(location.search).has('packagingRuntime')||new URLSearchParams(location.search).has('permissionRuntime')){
 const user='isolated-browser-regression',collection=loadManagedLaboratoryForms(localStorage,user),source=collection?.forms.find(item=>item.id===collection.activeFormId)
 const templateSchema:FormSchemaDraft=source?.schema??{id:'form.component-runtime-template',schemaVersion:1,version:1,status:'draft',mode:'hybrid',title:{fa:'آزمایش کامپوننت',en:'Component runtime test',zh:'组件运行测试'},sections:[{id:'laboratory.editor',kind:'editor',layout:{columns:20,gap:12}},{id:'laboratory.grid',kind:'grid'},{id:'laboratory.footer',kind:'footer'}],fields:[],actions:[{id:'new-person',sectionId:'laboratory.footer',code:'Space',keys:[' '],label:{fa:'شخص جدید',en:'New',zh:'新建'},primary:true,required:true},{id:'demo-save',sectionId:'laboratory.footer',code:'F3',keys:['F3'],label:{fa:'ذخیره',en:'Save',zh:'保存'},primary:true,required:true},{id:'reset-sample',sectionId:'laboratory.footer',code:'Esc',keys:['Escape'],label:{fa:'خروج',en:'Exit',zh:'退出'},required:true}]}
 const sectionId=templateSchema.sections.find(section=>section.kind==='editor')!.id
 const permissionRuntime=new URLSearchParams(location.search).has('permissionRuntime')
 const packagingRuntime=new URLSearchParams(location.search).has('packagingRuntime')
 const batchRuntime=new URLSearchParams(location.search).has('batchRuntime')||packagingRuntime||permissionRuntime
 const derivedRuntime=new URLSearchParams(location.search).has('derivedRuntime')
 const ids=batchRuntime?['personCode','firstName','colors']:derivedRuntime?['personCode','firstName','gender','fullName']:['personCode','firstName']
 const labels:Record<string,string>={personCode:'کد خودکار',firstName:'نام',gender:'جنس',fullName:'نام کامل',colors:packagingRuntime?'بسته‌بندی':'رنگ'}
 const fields=ids.map((id,index)=>({id,sectionId,kind:(id==='colors'?'valueList':'text') as 'text'|'valueList',componentId:id==='colors'?(permissionRuntime?'persons.title-control':packagingRuntime?'base-form.packaging-volume':'base-form.batch-values'):id==='personCode'?'base-form.incremental-code':id==='fullName'?'base-form.derived-display':'definition.field',label:{fa:labels[id],en:labels[id],zh:labels[id]},span:ids.length===2?10:5,minTracks:1,...(packagingRuntime&&id==='colors'?{valueType:'number' as const,required:true,validation:[{type:'positive' as const},{type:'minimum' as const,value:0.01}]}:{}),...(id==='fullName'?{readOnly:true}:{}),settings:{...(permissionRuntime&&id==='colors'?{listSettings:{searchEnabled:true,permissions:{add:'admin',edit:'admin',remove:'admin',setDefault:'everyone'}}}:{}),layout:{grid:{columns:20,columnStart:index*(ids.length===2?10:5)+1,columnSpan:ids.length===2?10:5,rowStart:1}},...(id==='personCode'?{componentSettings:{mode:'alphanumeric',required:true,unique:true,incremental:true,suffixWidth:1,format:'segments',segments:[{kind:'letters',length:2},{kind:'number',length:1}]}}:{}),...(id==='fullName'?{derivedSettings:{sourceFieldIds:['firstName','gender'],separator:' — '}}:{})}}))
 const form=createManagedLaboratoryForm({id:derivedRuntime?'form.derived-runtime-regression':'form.code-regression',name:derivedRuntime?'آزمایش خروجی محاسبه‌شده':'آزمایش موتور کد',mode:'hybrid',templateSchema:{...templateSchema,fields,uniqueConstraints:[],...(batchRuntime?{tables:[{id:'batch.report',sectionId:templateSchema.sections.find(section=>section.kind==='grid')!.id,dataSourceId:'batch',columns:fields.filter(field=>field.id!=='colors'||packagingRuntime).map(field=>({id:field.id,binding:{kind:'formField' as const,fieldId:field.id},sourceFieldIds:[field.id],label:field.label,width:160}))}]}:{})},templateDesigner:emptyDesignerDraft(templateSchema.id),frame:source?.frame??{device:'desktop',width:1440,height:900,fitToPage:true}})
 if(!saveManagedLaboratoryForm(localStorage,user,form)||!writeFormRecovery(localStorage,user,{form,designerHistory:attachDesignerDocument(createDesignerHistory(emptyDesignerDraft(form.id)),form.schema),structureHistory:{past:[],present:form.schema,future:[]}},derivedRuntime?'Derived runtime regression':'Code regression'))throw Error('Component runtime fixture save failed')
}
const personsDemo=new URLSearchParams(location.search).has('personsDemo')
if(personsDemo)setAccessPermissions(['persons.view','persons.create','persons.edit','persons.delete'])
const treeGeometry = new URLSearchParams(location.search).has('treeGeometry')
if(treeGeometry && !sessionStorage.getItem('tree-geometry-seed')) {
 const id='form.tree-geometry'; let draft=emptyDesignerDraft(id)
 const template:FormSchemaDraft={id,schemaVersion:1,version:1,status:'draft',mode:'operational',title:{fa:'درخت آزمایش',en:'Tree',zh:'Tree'},sections:[],fields:[],actions:[]}
 const schema=createProductGroupLaboratorySchema(template,id)
 if(new URLSearchParams(location.search).has('treeReport')){
  const tree=schema.fields[0].settings!.cascadingTree as {nodes:{id:string;parentId:string|null;name:string;code?:string}[]}
  tree.nodes=tree.nodes.map((node,index)=>({...node,code:String(index+1).padStart(3,'0')})).concat(Array.from({length:40},(_,index)=>({id:'report-fixture-'+index,parentId:null,name:'گروه آزمایش '+index,code:String(index+18).padStart(3,'0')})))
  draft={...draft,overrides:{'product-group.cascading-tree.tree.1.column::input':{height:358}}}
 }
 if(new URLSearchParams(location.search).has('treeInline')||new URLSearchParams(location.search).has('treeSave'))schema.actions=[
  {id:'new-person',sectionId:'product-group.footer',code:'Space',keys:[' '],required:true,primary:true,label:{fa:'ایجاد',en:'Create',zh:'创建'}},
  {id:'reset-sample',sectionId:'product-group.footer',code:'Escape',keys:['Escape'],label:{fa:'خروج',en:'Close',zh:'关闭'}}
 ]
 if(new URLSearchParams(location.search).has('treeCanvas')){const canvas={width:1480,height:480,preserveHorizontalBounds:true,fields:{'product-group.cascading-tree':{input:{left:12,top:38,width:1400,height:400},label:{left:12,top:10,width:1400,height:20}}}};draft={...draft,layoutMode:'canvas',canvas}}
 const form=createManagedLaboratoryForm({id,name:'درخت آزمایش',mode:'operational',templateSchema:schema,templateDesigner:draft,frame:{device:'desktop',width:1500,height:new URLSearchParams(location.search).has('layoutPreview')?1100:null,fitToPage:true}})
 if(!saveManagedLaboratoryForm(localStorage,'isolated-browser-regression',form)||!writeFormRecovery(localStorage,'isolated-browser-regression',{form,designerHistory:attachDesignerDocument(createDesignerHistory({...draft,formId:id}),form.schema),structureHistory:{past:[],present:form.schema,future:[]}},'Tree geometry regression'))throw Error('tree fixture save failed')
 sessionStorage.setItem('tree-geometry-seed','true')
}
const fixture=()=>(new URLSearchParams(location.search).has('entryContract')?<EntryContractFixture/>:new URLSearchParams(location.search).has('numberEditor')?<NumberEditorFixture/>:personsDemo?<PersonsPage language="fa" demoMode authenticatedUserId="isolated-browser-regression"/>:<><FormLaboratoryPage requestedDesign={treeGeometry?{id:'form.tree-geometry',sequence:1}:undefined} language={new URLSearchParams(location.search).get('language')==='en'?'en':'fa'} authenticatedUserId={smartLayoutUserId} /><section data-regression-navigation dir="rtl"><NavigationSidebar language="fa" userId="isolated-browser-regression" administrator demoMode={false} allowedRoutes={Object.keys(icons) as MenuKey[]} active="formLaboratory" onOpen={()=>{}} onOpenDesign={id=>window.dispatchEvent(new CustomEvent('open-form-design-draft',{detail:{id}}))} commerceCount={0}/></section></>)

const fixtureRoot=createRoot(document.getElementById('root')!)
const renderFixture=()=>fixtureRoot.render(interactionAudit?<React.Profiler id="interaction-audit" onRender={()=>{designerRenderAudit.commits++}}>{fixture()}</React.Profiler>:fixture())
if(new URLSearchParams(location.search).has('layoutPreview'))Object.assign(window,{rerenderPreviewFixture:renderFixture})
renderFixture()
