import {createRoot} from 'react-dom/client'
import {lazy,createElement} from 'react'
import {getSystemLookupSource} from '../src/components/base-form/systemLookupSources'
import PersonsPage from '../src/PersonsPage'
import BrandsPage from '../src/BrandsPage'
import {installFormInteraction} from '../src/formInteraction'
import {setAccessPermissions} from '../src/api'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV)throw Error('Development fixture only')
setAccessPermissions(['persons.view','persons.create','persons.edit','brands.view','brands.create','brands.edit'])
installFormInteraction()
// Deliberately cold source: no empty dialog may be mounted while code loads.
const brandSource=getSystemLookupSource('brands')!,originalCreate=brandSource.Create!
brandSource.Create=lazy(async()=>{await new Promise(resolve=>setTimeout(resolve,350));return {default:(props:React.ComponentProps<typeof originalCreate>)=>createElement(originalCreate,props)}})
Object.assign(window,{lookupRequests:[],personSaves:0})
const records=[{id:'brand-existing',brandCode:'995',brandName:'برند موجود'},{id:'brand-second',brandCode:'997',brandName:'برند دوم'}]
window.fetch=async(input,options)=>{
 const url=String(typeof input==='string'?input:input instanceof URL?input:input.url)
 ;(window as unknown as {lookupRequests:string[]}).lookupRequests.push((options?.method??'GET')+' '+url)
 if(url.includes('/api/master-data/persons')&&options?.method==='POST'&&!url.endsWith('/grid'))(window as unknown as {personSaves:number}).personSaves++
 const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}})
 if(url.includes('/api/system-lookups/brands')){const q=new URL(url,location.origin).searchParams.get('q')??'';await new Promise(resolve=>setTimeout(resolve,80));const matches=records.filter(b=>(b.brandCode+' '+b.brandName).includes(q));return json({items:matches.map(b=>({id:b.id,code:b.brandCode,name:b.brandName})),total:matches.length})}
 if(url.includes('/api/master-data/brands')&&options?.method==='POST'){await new Promise(resolve=>setTimeout(resolve,150));const b={...JSON.parse(String(options.body)),id:'brand-created-'+records.length};records.push(b);return json(b)}
 if(url.includes('/api/master-data/brands/')&&options?.method==='PUT'){const id=url.split('/').pop().split('?')[0];const i=records.findIndex(b=>b.id===id);records[i]={...records[i],...JSON.parse(String(options.body))};return json(records[i])}
 if(url.includes('/api/master-data/brands/'))return json(records.find(b=>url.endsWith(b.id)))
 if(url.includes('/api/master-data/brands'))return json({items:records,total:records.length})
 if(url.includes('/api/master-data/parameters'))return json([{id:'title',parameterType:'Title',code:'MR',nameFa:'آقای',nameEn:'Mr',personType:'Individual'}])
 if(url.includes('/api/sequence-suggestions'))return json({value:'996',suggestion:'996',code:'996'})
 if(url.includes('/api/master-data/persons/grid'))return json({items:[],total:0,page:1,pageSize:50})
 return json({})
}
createRoot(document.getElementById('root')!).render(<><div className="form-tab-pane active"><PersonsPage language="fa"/></div><div className="form-tab-pane" style={{display:'none'}}><BrandsPage language="fa"/></div></>)
