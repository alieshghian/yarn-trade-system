import {createRoot} from 'react-dom/client'
import {lazy,createElement} from 'react'
import {getSystemLookupSource} from '../src/components/base-form/systemLookupSources'
import PersonsPage, { type Person } from '../src/PersonsPage'
import BrandsPage from '../src/BrandsPage'
import {installFormInteraction} from '../src/formInteraction'
import {setAccessPermissions} from '../src/api'
import {applyGridFiltersAndSort, type ExcelGridColumn, type GridQuery} from '../src/components/base-form/excelGrid'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV)throw Error('Development fixture only')
const params = new URLSearchParams(location.search)
const toolbarFixture = params.has('toolbar')
const company = params.has('company')
if (toolbarFixture) document.documentElement.style.scrollbarGutter = 'stable'
const actor = toolbarFixture ? sessionStorage.getItem('currentUser') ?? 'toolbar-owner' : undefined
setAccessPermissions(actor === 'toolbar-denied' ? [] : actor === 'toolbar-other-viewer' ? ['persons.view'] :
  ['persons.view','persons.create','persons.edit','brands.view','brands.create','brands.edit'])
installFormInteraction()
// Deliberately cold source: no empty dialog may be mounted while code loads.
const brandSource=getSystemLookupSource('brands')!,originalCreate=brandSource.Create!
brandSource.Create=lazy(async()=>{await new Promise(resolve=>setTimeout(resolve,350));return {default:(props:React.ComponentProps<typeof originalCreate>)=>createElement(originalCreate,props)}})
Object.assign(window,{lookupRequests:[],personSaves:0})
const records=[{id:'brand-existing',brandCode:'995',brandName:'برند موجود'},{id:'brand-second',brandCode:'997',brandName:'برند دوم'}]
const savedPersonKey = 'persons-toolbar-fixture-record'
const savedPerson = toolbarFixture ? JSON.parse(sessionStorage.getItem(savedPersonKey) ?? 'null') as Person | null : null
const people: Person[] = toolbarFixture ? Array.from({length: 102}, (_, index) => savedPerson?.id === 'person-'+index ? savedPerson : ({
  id: 'person-'+index, personCode: 'PERSON-'+index, personType: company ? 'Company' : 'Individual', firstName: 'Test',
  lastName: 'Person '+index, displayName: 'Test Person '+index, titleId: company ? 'company-title' : 'title',
  preferredLanguage: 'fa', creditLimitIRR: 0, isActive: true, phone: '02112345678', rowVersion: 'fixture-1'
})) : []
const peopleColumns: ExcelGridColumn<typeof people[number]>[] = [
  {id:'personCode',label:'Code',type:'text',width:130,value:person=>person.personCode},
]
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
 if(url.includes('/api/master-data/parameters'))return json([{id:'title',parameterType:'Title',code:'MR',nameFa:'آقای',nameEn:'Mr',personType:'Individual'}, {id:'company-title',parameterType:'Title',code:'CO',nameFa:'شرکت',nameEn:'Company',personType:'Company'}])
 if(url.includes('/api/sequence-suggestions'))return json({value:'996',suggestion:'996',code:'996'})
 const requestUrl = new URL(url, location.origin)
 if(toolbarFixture && options?.method === 'PUT' && /\/api\/master-data\/persons\/person-\d+$/.test(requestUrl.pathname)){
   const index = people.findIndex(person => requestUrl.pathname.endsWith('/' + person.id))
   if (index === -1) return Response.json({}, {status:404})
   if (requestUrl.searchParams.get('rowVersion') !== people[index].rowVersion)
     return Response.json({code:'CONCURRENCY_CONFLICT'}, {status:409})
   const edited = JSON.parse(String(options.body)) as Partial<Person>
   people[index] = {...people[index], ...edited, rowVersion:'fixture-2'}
   sessionStorage.setItem(savedPersonKey, JSON.stringify(people[index]))
   return json(people[index])
 }
 if(toolbarFixture && url.endsWith('/api/master-data/persons/latest'))return json(savedPerson ?? people[0])
 if(url.includes('/api/master-data/persons/grid')){
   const {page,pageSize,filters,sort,optionsColumn}=JSON.parse(String(options?.body)) as GridQuery & {optionsColumn?: string}
   const matches=applyGridFiltersAndSort(people,peopleColumns,filters,sort,'fa')
   if(optionsColumn==='personCode')return json({filterValues:people.map(person=>person.personCode)})
   return json({items:matches.slice((page-1)*pageSize,page*pageSize),total:matches.length,page,pageSize})
 }
 return json({})
}
const toolbarHost = toolbarFixture ? { height: 'calc(100dvh - 110px)', overflow: 'auto' } : undefined
createRoot(document.getElementById('root')!).render(<><div className="form-tab-pane active" style={toolbarHost}><PersonsPage language="fa" authenticatedUserId={actor}/></div><div className="form-tab-pane" style={{display:'none'}}><BrandsPage language="fa"/></div></>)
