import {createRoot} from 'react-dom/client'
import {useState} from 'react'
import {ManagedDesignList} from '../src/components/base-form/ManagedDesignList'
import {readDesignLifecycles,setDesignLifecycle} from '../src/components/base-form/formDesignLifecycle'
import {ExcelColorPicker} from '../src/components/base-form/ExcelColorPicker'
import {PendingFormDesignMenu} from '../src/components/base-form/PendingFormDesignMenu'
import {designReleaseKey} from '../src/components/base-form/formDesignReleases'
import {createManagedLaboratoryForm} from '../src/components/base-form/laboratoryFormDraftState'
import {emptyDesignerDraft} from '../src/components/base-form/designer'
import '../src/styles.css'
if(!import.meta.env.DEV)throw Error('Development fixture only')
const template={id:'template',schemaVersion:1,version:1,status:'draft',mode:'operational',title:{fa:'قالب',en:'Template',zh:'模板'},fields:[],sections:[]} as const
const forms=['one','two'].map(id=>createManagedLaboratoryForm({id,name:'نسخهٔ هم‌نام',mode:'hybrid',templateSchema:structuredClone(template) as any,templateDesigner:emptyDesignerDraft('template'),frame:{width:1000,height:700,device:'desktop',fitToPage:false}}))
if(!localStorage.getItem(designReleaseKey('test-owner')))localStorage.setItem(designReleaseKey('test-owner'),JSON.stringify({version:1,releases:[{id:'test-release',formId:'one',createdAt:'2026-11-09T10:00:00Z',status:'awaiting-integration',change:'fundamental',snapshot:forms[0],requirements:[],handoff:{permissionsConfirmedAt:'2026-11-09T10:00:00Z',digest:'a'.repeat(64),backupId:'b'.repeat(32),jsonAddress:'/api/form-design-backups/'+ 'b'.repeat(32)+'?handoff=true'}}]}))
function Fixture(){
 const [states,refresh]=useState(()=>readDesignLifecycles(localStorage,'test-owner')??{})
 const [color,setColor]=useState('#FFFFFF')
 return <main style={{padding:20}}><ManagedDesignList forms={forms} states={states} updatedAt={{one:'2026-11-09T10:00:00Z'}} revisions={{one:7}} busy={false} onOpen={id=>{document.body.dataset.opened=id}} onClose={()=>{}} onStateChange={(id,state)=>{setDesignLifecycle(localStorage,'test-owner',id,state);refresh(readDesignLifecycles(localStorage,'test-owner')??{});window.dispatchEvent(new Event('form-design-releases-updated'))}}/>
 <PendingFormDesignMenu userId="test-owner" onOpen={()=>{}}/>
 <ExcelColorPicker language="fa" label="رنگ آزمون" value={color} onCommit={value=>setColor(value??'')}/><output data-color>{color}</output></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
