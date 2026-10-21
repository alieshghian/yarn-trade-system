import PersonsPage from '../src/PersonsPage'
import {setAccessPermissions} from '../src/api'
// Isolated browser fixture: real page and global interactions, synthetic data only.
import React from 'react'
import {AppearanceNumberInput} from '../src/components/base-form/AppearanceNumberInput'

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
import {loadManagedLaboratoryForms,resolveManagedLaboratoryDesigner,managedFormWithDesigner,saveManagedLaboratoryForm} from '../src/components/base-form/laboratoryFormDraftState'
import {readFormRecovery,writeFormRecovery} from '../src/components/base-form/formDocumentRecovery'
import {attachDesignerDocument,createDesignerHistory} from '../src/components/base-form/designer'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if (!import.meta.env.DEV) throw new Error('Developer regression fixture only')
let themeRevision=0
let themes=[structuredClone(defaultDesignTheme)]
window.fetch = (async (input: RequestInfo | URL,init?:RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const respond=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
  if(url.includes('/api/navigation'))return respond({nodes:defaultNavigation(),preferences:defaultPreferences(),rowVersion:''})
  if(url.includes('/api/design-system/themes')){
    if(init?.method==='PUT'){themes=JSON.parse(String(init.body)).themes;themeRevision++;return respond({rowVersion:String(themeRevision)})}
    return respond({rowVersion:String(themeRevision),library:{version:themeRevision,themes,previous:[]},preferences:null})
  }
  if (url.includes('/api/form-laboratory/synthetic-grid')) return new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { headers: { 'Content-Type': 'application/json' } })
  throw new Error('Unexpected operational request in Designer regression: ' + url)
}) as typeof fetch
installFormInteraction()
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
const personsDemo=new URLSearchParams(location.search).has('personsDemo')
if(personsDemo)setAccessPermissions(['persons.view','persons.create','persons.edit','persons.delete'])
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('numberEditor')?<NumberEditorFixture/>:personsDemo?<PersonsPage language="fa" demoMode authenticatedUserId="isolated-browser-regression"/>:<><FormLaboratoryPage language={new URLSearchParams(location.search).get('language')==='en'?'en':'fa'} authenticatedUserId="isolated-browser-regression" /><section data-regression-navigation dir="rtl"><NavigationSidebar language="fa" userId="isolated-browser-regression" administrator demoMode={false} allowedRoutes={Object.keys(icons) as MenuKey[]} active="formLaboratory" onOpen={()=>{}} onOpenDesign={id=>window.dispatchEvent(new CustomEvent('open-form-design-draft',{detail:{id}}))} commerceCount={0}/></section></>)
