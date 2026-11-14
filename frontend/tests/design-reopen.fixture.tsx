import {createRoot} from 'react-dom/client'
import FormLaboratoryPage from '../src/FormLaboratoryPage'
import {createOperationalRedesign,operationalFormCatalog} from '../src/components/base-form/operationalFormCatalog'
import {emptyDesignerDraft,createDesignerHistory} from '../src/components/base-form/designer'
import {createManagedFormStructureHistory,saveManagedLaboratoryForm,loadManagedLaboratoryForms} from '../src/components/base-form/laboratoryFormDraftState'
import {writeFormRecovery,readFormRecovery} from '../src/components/base-form/formDocumentRecovery'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV)throw Error('Development fixture only')
const owner='reopen-test'
const contract=operationalFormCatalog.find(form=>form.route===(new URLSearchParams(location.search).get('route')??'brands'))!
if(!loadManagedLaboratoryForms(localStorage,owner)?.forms.length){
 for(const [id,at] of [['old','2026-11-01T10:00:00Z'],['recent','2026-11-09T10:00:00Z']]){
  const form=createOperationalRedesign(contract,id,emptyDesignerDraft('form-laboratory.persons-synthetic'),{device:'desktop',width:1000,height:700,fitToPage:false})
  saveManagedLaboratoryForm(localStorage,owner,form)
  const designer={...emptyDesignerDraft(id),overrides:{'brandName::input':{fontSize:23}}}
  writeFormRecovery(localStorage,owner,{form,designerHistory:createDesignerHistory(designer),structureHistory:createManagedFormStructureHistory(form.schema)},'initial',at)
 }
}
window.fetch=async input=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url
 return new Response(JSON.stringify(url.includes('form-design-backups')?{versions:[],id:'test-backup'}:url.includes('navigation')?{nodes:[]}:{items:[],total:0,page:1,pageSize:100}),{status:200,headers:{'Content-Type':'application/json'}})
}
Object.assign(window,{testDesignRecords:()=>({forms:loadManagedLaboratoryForms(localStorage,owner),recovery:readFormRecovery(localStorage,owner)})})
createRoot(document.getElementById('root')!).render(<FormLaboratoryPage language="fa" authenticatedUserId={owner}/>)

