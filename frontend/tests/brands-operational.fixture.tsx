import React from 'react'
import {createRoot} from 'react-dom/client'
import BrandsPage from '../src/BrandsPage'
import FormLaboratoryPage from '../src/FormLaboratoryPage'
import {OperationalFormFrame} from '../src/components/base-form/OperationalFormFrame'
import {setAccessPermissions} from '../src/api'
import design from '../src/forms/brand-design.json'
import {writeFormRecovery} from '../src/components/base-form/formDocumentRecovery'
import {createDesignerHistory,attachDesignerDocument,type DesignerDraft} from '../src/components/base-form/designer'
import type {ManagedLaboratoryForm} from '../src/components/base-form/laboratoryFormDraftState'
import {defaultNavigation,defaultPreferences} from '../src/navigation'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV)throw Error('Isolated brand regression only')
const test=window as unknown as {brandRequests:unknown[];brandEvents:number;createdBrand?:unknown;cancelledBrand?:boolean;rejectBrandDelete?:boolean;conflictBrand?:boolean}
test.brandRequests=[];test.brandEvents=0
window.addEventListener('brands-changed',()=>test.brandEvents++)
setAccessPermissions(['brands.view','brands.create','brands.edit','brands.delete'])
const params=new URLSearchParams(location.search)
if(params.has('fontRegression'))localStorage.setItem('yarn-trade:operational-form-preferences:v1:anonymous:'+design.form.id,JSON.stringify({overrides:{'brandName::input':{bold:true}}}))
const fixtureLanguage=params.has('english')?'en':'fa'
if(params.has('denied'))setAccessPermissions(['brands.view'])
const rows=[{id:'brand-one',brandCode:'aB-200',brandName:'برند نخست',description:'یادداشت',address:'آدرس محفوظ',rowVersion:'AAAAAAAAAAA='},{id:'brand-two',brandCode:'ZZ-900',brandName:'برند دوم',description:'',address:'',rowVersion:'AAAAAAAAAAA='}]
if(params.has('many'))for(let i=0;i<100;i++)rows.push({id:'many-'+i,brandCode:String(1000+i),brandName:'برند '+i,description:'',address:'',rowVersion:'AAAAAAAAAAA='})
window.fetch=(async(input,init)=>{
 const url=new URL(String(input instanceof Request?input.url:input),location.origin),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined
 test.brandRequests.push({path:url.pathname,query:url.search,method,body})
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 if(url.pathname==='/api/field-validation/brands'&&method==='POST'){
  const code=String(body.value??'').trim().toUpperCase()
  const duplicate=rows.some(row=>row.id!==body.currentId&&row.brandCode.toUpperCase()===code)
  return json({error:duplicate?'کد برند تکراری است.':null})
 }
 if(url.pathname==='/api/navigation')return json({nodes:defaultNavigation(),preferences:defaultPreferences(),rowVersion:''})
 if(url.pathname==='/api/form-laboratory/synthetic-grid')return json({items:[],total:0,page:1,pageSize:50})
 if(url.pathname==='/api/sequence-suggestions/brand')return json({suggestion:'aB-201',previous:'aB-200'})
 if(url.pathname==='/api/master-data/brands'&&method==='GET')return json({items:rows,total:rows.length,page:1,pageSize:500})
 if(url.pathname==='/api/master-data/brands'&&method==='POST'){const row={...body,id:'brand-created',rowVersion:'AQAAAAAAAAA='};rows.push(row);return json(row,201)}
 if(url.pathname==='/api/master-data/brands/bulk-delete'&&method==='POST'){
  const selected=body.rows as {id:string,rowVersion:string}[]
  if(!selected.length||selected.some(ref=>!rows.some(row=>row.id===ref.id&&row.rowVersion===ref.rowVersion)))return json({error:'تعارض نسخه'},409)
  if(test.rejectBrandDelete)return json({error:'برند استفاده شده است',blockedIds:selected.map(ref=>ref.id)},409)
  for(const ref of selected)rows.splice(rows.findIndex(row=>row.id===ref.id),1)
  return json({deletedCount:selected.length})
 }
 const row=rows.find(row=>url.pathname==='/api/master-data/brands/'+row.id)
 if(row&&['PUT','DELETE'].includes(method)){
  if(test.conflictBrand)return json({code:'CONCURRENCY_CONFLICT',error:'تعارض نسخه'},409)
  if(url.searchParams.get('rowVersion')!==row.rowVersion)return json({code:'CONCURRENCY_TOKEN_REQUIRED',error:'نسخه لازم است'},400)
  if(method==='DELETE'){if(test.rejectBrandDelete)return json({code:'BRAND_IN_USE',error:'برند استفاده شده است'},409);rows.splice(rows.indexOf(row),1);return new Response(null,{status:204})}
  Object.assign(row,body,{rowVersion:'AgAAAAAAAAA='});return json(row)
 }
 throw Error('Unexpected operational request: '+method+' '+url.pathname)
}) as typeof fetch
if(params.has('reference')){
 const form=design.form as unknown as ManagedLaboratoryForm,draft=design.designerDraft as unknown as DesignerDraft
 writeFormRecovery(localStorage,'isolated-brand-reference',{form,designerHistory:attachDesignerDocument(createDesignerHistory(draft),form.schema),structureHistory:{past:[],present:form.schema,future:[]}},'Pinned reference')
}
createRoot(document.getElementById('root')!).render(params.has('restrictedSettings')?<OperationalFormFrame formId={design.form.id} title="فرم محدود" language="fa" designerDraft={design.designerDraft as unknown as DesignerDraft} permissions={{colors:false,typography:false,formSize:false,tablePresentation:false}} width={design.form.frame.width}>{()=> <div>فرم محدود</div>}</OperationalFormFrame>:params.has('reference')?<FormLaboratoryPage language="fa" authenticatedUserId="isolated-brand-reference"/>:<BrandsPage language={fixtureLanguage} creation={params.has('creation')?{onSaved:brand=>{test.createdBrand=brand},onCancel:()=>{test.cancelledBrand=true}}:undefined}/>)
