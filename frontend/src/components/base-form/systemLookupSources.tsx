import {lazy,type ComponentType} from 'react'
import {apiRequest,hasPermission} from '../../api'
import type {Language} from '../../i18n'

export type LookupItem={id:string;code:string;name:string}
export type LookupPage={items:LookupItem[];total:number}
export type LookupCreationProps={language:Language;onSaved:(item:LookupItem)=>void;onCancel:()=>void}
export type SystemLookupSource={id:string;formId?:string;route?:string;codeField?:string;nameField?:string;title:Record<Language,string>;viewPermission:string;createPermission?:string;search:(query:string,page:number,fields:readonly string[],signal:AbortSignal,ownerId?:string)=>Promise<LookupPage>;byId:(id:string,signal:AbortSignal)=>Promise<LookupItem>;preloadCreate?:()=>Promise<unknown>;Create?:ComponentType<LookupCreationProps>}
export type SystemLookupSettings={selectedDisplay?:'name'|'codeAndName';sourceId:string;returnMode:'saveAndSelect'|'selectAfterSave'}
export function normalizeLookupSettings(value:unknown):SystemLookupSettings{
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{}
 return {selectedDisplay:raw.selectedDisplay==='name'?'name':'codeAndName',sourceId:typeof raw.sourceId==='string'?raw.sourceId:'',returnMode:raw.returnMode==='selectAfterSave'?'selectAfterSave':'saveAndSelect'}
}
const BrandCreator=lazy(async()=>{const {default:Page}=await import('../../BrandsPage');return {default:({language,onSaved,onCancel}:LookupCreationProps)=><Page language={language} creation={{onCancel,onSaved:brand=>onSaved({id:brand.id,code:brand.brandCode,name:brand.brandName})}}/>}})
const PersonCreator=lazy(async()=>{const {default:Page}=await import('../../PersonsPage');return {default:({language,onSaved,onCancel}:LookupCreationProps)=><Page language={language} lookupCreation={{onCancel,onSaved:person=>onSaved({id:person.id,code:person.personCode,name:person.displayName})}}/>}})
const loadProductGroup=()=>import('../../forms/ProductGroupOperationalPage')
const ProductGroupCreator=lazy(async()=>{const {ProductGroupOperationalPage:Page}=await loadProductGroup();return {default:({language,onSaved,onCancel}:LookupCreationProps)=><Page language={language} can={operation=>hasPermission('productGroups.'+operation)} onClose={onCancel} lookupCreation={{onSelected:async(id,signal)=>{const item=await apiRequest<LookupItem>('/api/system-lookups/productGroups/'+encodeURIComponent(id),{signal});if(!signal.aborted)onSaved(item)}}}/>}})
const sources=new Map<string,SystemLookupSource>()
export function registerSystemLookupSource(source:SystemLookupSource){if(!source.id||sources.has(source.id))throw Error('Duplicate lookup source');sources.set(source.id,source)}
export const getSystemLookupSource=(id:string)=>sources.get(id)
export const getSystemLookupSources=()=>[...sources.values()]
export const canReadLookup=(source:SystemLookupSource)=>hasPermission(source.viewPermission)
export const canCreateLookup=(source:SystemLookupSource)=>Boolean(source.Create&&source.createPermission&&hasPermission(source.createPermission))
for(const id of ['persons','brands'] as const){
 registerSystemLookupSource({id,formId:id==='brands'?'form.redesign.805deb77-bec5-41fa-af97-77b7007ca3a4':undefined,route:id,codeField:id==='brands'?'brandCode':'personCode',nameField:id==='brands'?'brandName':'displayName',title:id==='persons'?{fa:'تعریف اشخاص',en:'Persons',zh:'人员'}:{fa:'تعریف برند',en:'Brands',zh:'品牌'},viewPermission:id+'.view',createPermission:id+'.create',Create:id==='persons'?PersonCreator:BrandCreator,
 search:(query,page,fields,signal,ownerId)=>apiRequest<LookupPage>(`/api/system-lookups/${id}?q=${encodeURIComponent(query)}&page=${page}&fields=${encodeURIComponent(fields.filter(f=>['code','name'].includes(f)).join(','))}${ownerId!==undefined?'&ownerPersonId='+encodeURIComponent(ownerId||'00000000-0000-0000-0000-000000000000'):''}`,{signal}),
 byId:async(key,signal)=>{const row=await apiRequest<Record<string,string>>(`/api/master-data/${id}/${encodeURIComponent(key)}`,{signal});return {id:row.id,code:row[id==='persons'?'personCode':'brandCode'],name:row[id==='persons'?'displayName':'brandName']}}
 })
}

// Only registered operational data adapters are offered; Laboratory drafts are never sources.
for(const source of [
 {id:'productGroups',route:'productGroups',formId:'form.new.8e77aae6-9477-41f9-b473-9d52511535a1',codeField:'rootCode',nameField:'path',title:{fa:'تعریف گروه کالاها',en:'Product groups',zh:'产品组'}},
 {id:'warehouses',route:'warehouses',formId:'operational.warehouses',codeField:'code',nameField:'nameFa',title:{fa:'تعریف انبار',en:'Warehouses',zh:'仓库'}}
])registerSystemLookupSource({...source,...(source.id==='productGroups'?{createPermission:'productGroups.create',Create:ProductGroupCreator,preloadCreate:loadProductGroup}:{}),viewPermission:source.id+'.view',search:(query,page,fields,signal)=>apiRequest<LookupPage>('/api/system-lookups/'+source.id+'?q='+encodeURIComponent(query)+'&page='+page+'&fields='+encodeURIComponent(fields.filter(f=>['code','name'].includes(f)).join(',')),{signal}),byId:(id,signal)=>apiRequest<LookupItem>('/api/system-lookups/'+source.id+'/'+encodeURIComponent(id),{signal})})
