import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {FieldComponentSettingsControls} from '../src/components/base-form/ComponentListSettingsControls'
import {SystemLookup} from '../src/components/base-form/SystemLookup'
import {setAccessPermissions} from '../src/api'
import type {FormSchemaDraft} from '../src/components/base-form/formSchema'
import '../src/styles.css'
setAccessPermissions(['productGroups.view','warehouses.view']);
const items=[{id:'root',code:'004',name:'DTY'},{id:'incomplete',code:'004',name:'DTY / براق'},{id:'deep',code:'004',name:'DTY / مات / 150D'}];
window.fetch=async(input)=>{const url=new URL(String(input),location.origin);if(!url.pathname.startsWith('/api/system-lookups/productGroups'))throw Error('Unexpected request '+url.pathname);const id=url.pathname.split('/')[4];return new Response(JSON.stringify(id?items.find(i=>i.id===id):{items:items.filter(i=>i.name.includes(url.searchParams.get('q')||'')),total:items.length}),{headers:{'Content-Type':'application/json'}})};
function Fixture(){const [schema,setSchema]=useState<FormSchemaDraft>({schemaVersion:1,version:1,id:'lookup-test',title:{fa:'test',en:'test',zh:'test'},mode:'operational',sections:[{id:'e',kind:'editor'}],fields:[{id:'group',label:{fa:'گروه نخ',en:'Group',zh:'Group'},componentId:'base-form.system-lookup',kind:'lookup',sectionId:'e'}]}),[value,setValue]=useState('');return <main data-form-scope className="form-document-dialog form-structure-controls" style={{padding:24,maxWidth:760}}><FieldComponentSettingsControls schema={schema} field={schema.fields[0]} language="fa" onChange={setSchema}/><SystemLookup field="group" label="گروه نخ" value={value} onChange={setValue} language="fa" settings={schema.fields[0].settings?.lookupSettings}/><output data-lookup-settings>{JSON.stringify(schema.fields[0].settings?.lookupSettings)}</output><output data-chosen>{value}</output></main>};createRoot(document.getElementById('root')!).render(<Fixture/>);
