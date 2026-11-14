import {normalizeListSettings,type ListSettingsPatch} from './componentListSettings.ts'
import type {FormStorage} from './laboratoryFormDraftState'
import {normalizeCodeComponentSettings,type CodeComponentSettings} from './serialCode.ts'

export const componentLibraryKey='yarn-trade:component-library:v1'
export const componentLibraryEvent='yarn-component-library-changed'
export type ListCapabilities={searchChoices:boolean;confirmRemoval:boolean;maxEntryLength:number;listSettings?:ListSettingsPatch}
export type ComponentRevision={version:number;createdAt:string;capabilities:Partial<ListCapabilities>;codeSettings?:Partial<CodeComponentSettings>}
export type LibraryComponent={id:string;name:string;parentId?:string;rendererId:string;revisions:ComponentRevision[]}
export type ComponentLibrary={version:1;components:LibraryComponent[]}
export const defaultListCapabilities:ListCapabilities={searchChoices:false,confirmRemoval:false,maxEntryLength:1000}
export const canonicalBehaviorId=(id:string)=>['persons.title-control','base-form.number-control'].includes(id)?'base-form.value-list':id
export function initialComponentLibrary():ComponentLibrary{return {version:1,components:[{id:'base-form.value-list',name:'فهرست مقادیر مشترک — عنوان و آدرس',rendererId:'base-form.value-list',revisions:[{version:1,createdAt:'',capabilities:{...defaultListCapabilities}}]},{id:'base-form.date-input',name:'تاریخ مشترک',rendererId:'base-form.date-input',revisions:[{version:1,createdAt:'',capabilities:{}}]},{id:'base-form.code-input',name:'کد قابل تنظیم',rendererId:'base-form.code-input',revisions:[{version:1,createdAt:'',capabilities:{}}]},{id:'base-form.incremental-code',name:'شماره افزایشی یکتا',rendererId:'base-form.incremental-code',revisions:[{version:1,createdAt:'',capabilities:{}}]},{id:'base-form.derived-display',name:'نمایش محاسبه‌شدهٔ فقط‌خواندنی',rendererId:'base-form.derived-display',revisions:[{version:1,createdAt:'',capabilities:{}}]},{id:'base-form.system-lookup',name:'انتخاب از تعاریف سیستم',rendererId:'base-form.system-lookup',revisions:[{version:1,createdAt:'',capabilities:{listSettings:{searchEnabled:true,allowEmpty:true,addPlacement:'popup'}}}]},{id:'base-form.batch-values',name:'رنگ‌ها و مقادیر با ثبت گروهی',rendererId:'base-form.batch-values',parentId:'base-form.value-list',revisions:[{version:1,createdAt:'',capabilities:{searchChoices:true}}]},{id:'base-form.packaging-volume',name:'بسته‌بندی و حجم کالا',rendererId:'base-form.packaging-volume',parentId:'base-form.value-list',revisions:[{version:1,createdAt:'',capabilities:{searchChoices:true}}]}]}}
export function normalizeCapabilities(value:Partial<ListCapabilities>):Partial<ListCapabilities>{
 const next:Partial<ListCapabilities>={}
 for(const key of ['searchChoices','confirmRemoval'] as const)if(typeof value[key]==='boolean')next[key]=value[key]
 if(typeof value.maxEntryLength==='number'&&Number.isFinite(value.maxEntryLength))next.maxEntryLength=Math.max(1,Math.min(10000,Math.round(value.maxEntryLength)))
 if(value.listSettings)next.listSettings=normalizeListSettings(value.listSettings)
 return next
}
export function readComponentLibrary(storage?:FormStorage|null):ComponentLibrary{
 const raw=storage?.getItem(componentLibraryKey);if(!raw)return initialComponentLibrary()
 const parsed=JSON.parse(raw) as ComponentLibrary
 if(parsed.version!==1||!Array.isArray(parsed.components)||!parsed.components.some(item=>item.id==='base-form.value-list'))throw Error('کتابخانهٔ کامپوننت نامعتبر است؛ نسخهٔ ذخیره‌شده حفظ شد.')
 const ids=new Set<string>()
 for(const item of parsed.components){if(!item.id||ids.has(item.id)||!item.revisions?.length)throw Error('تعریف کامپوننت نامعتبر است.');ids.add(item.id);for(const revision of item.revisions)if(!Number.isInteger(revision.version)||revision.version<1||!revision.capabilities)throw Error('نسخهٔ کامپوننت نامعتبر است.')}
 for(const item of parsed.components)resolveComponentCapabilities(parsed,item.id)
 const builtins=initialComponentLibrary().components
 const existing=new Set(parsed.components.map(item=>item.id))
 return {...parsed,components:[...parsed.components,...builtins.filter(item=>!existing.has(item.id))]}
}
export function resolveComponentCapabilities(library:ComponentLibrary,id:string,seen=new Set<string>()):ListCapabilities{
 const key=canonicalBehaviorId(id)
 if(seen.has(key))throw Error('ارتباط حلقه‌ای کامپوننت‌ها مجاز نیست.')
 const definition=library.components.find(item=>item.id===key)
 if(!definition){if(key!=='base-form.value-list')return resolveComponentCapabilities(library,'base-form.value-list',seen);throw Error('مرجع رفتار مشترک موجود نیست.')}
 seen.add(key)
 const parent=definition.parentId?resolveComponentCapabilities(library,definition.parentId,seen):defaultListCapabilities
 const child=normalizeCapabilities(definition.revisions.at(-1)!.capabilities)
 return {...parent,...child,...(parent.listSettings||child.listSettings?{listSettings:{...parent.listSettings,...child.listSettings,permissions:{...parent.listSettings?.permissions,...child.listSettings?.permissions}}}:{})}
}
export function addLibraryComponent(library:ComponentLibrary,id:string,name:string,rendererId:string,parentId=rendererId,capabilities:Partial<ListCapabilities>={},codeSettings?:Partial<CodeComponentSettings>):ComponentLibrary{
 if(library.components.some(item=>item.id===id))throw Error('شناسهٔ کامپوننت تکراری است.')
 const candidate=canonicalBehaviorId(parentId),parent=library.components.some(item=>item.id===candidate)?candidate:'base-form.value-list';resolveComponentCapabilities(library,parent)
 return {...library,components:[...library.components,{id,name:name.trim(),rendererId,parentId:parent,revisions:[{version:1,createdAt:new Date().toISOString(),capabilities:normalizeCapabilities(capabilities),...(codeSettings?{codeSettings:structuredClone(codeSettings)}:{})}]}]}
}
export function publishComponentRevision(library:ComponentLibrary,id:string,capabilities:Partial<ListCapabilities>,codeSettings?:Partial<CodeComponentSettings>):ComponentLibrary{
 if(!library.components.some(item=>item.id===id))throw Error('کامپوننت پیدا نشد.')
 return {...library,components:library.components.map(item=>item.id!==id?item:{...item,revisions:[...item.revisions,{version:item.revisions.at(-1)!.version+1,createdAt:new Date().toISOString(),capabilities:normalizeCapabilities(capabilities),...((codeSettings??item.revisions.at(-1)!.codeSettings)?{codeSettings:structuredClone(codeSettings??item.revisions.at(-1)!.codeSettings)}:{})}]})}
}
export function resolveComponentCodeSettings(library:ComponentLibrary,id:string,overrides?:Partial<CodeComponentSettings>):CodeComponentSettings {
 const visit=(key:string,seen=new Set<string>()):Partial<CodeComponentSettings>=>{
  if(seen.has(key))throw Error('ارتباط حلقه‌ای کامپوننت‌ها مجاز نیست.')
  seen.add(key);const definition=library.components.find(item=>item.id===key)
  if(!definition)return {}
  return {...(definition.parentId?visit(definition.parentId,seen):{}),...definition.revisions.at(-1)?.codeSettings}
 }
 return normalizeCodeComponentSettings({...visit(id),...overrides})
}
export function fieldCodeSettings(field:{componentId:string;settings?:Record<string,unknown>},library?:ComponentLibrary):CodeComponentSettings {
 const overrides=field.settings?.componentSettings as Partial<CodeComponentSettings>|undefined
 const id=String(field.settings?.componentDefinitionId??field.componentId)
 try{const config=resolveComponentCodeSettings(library??readComponentLibrary(typeof localStorage==='undefined'?null:localStorage),id,overrides);return {...config,incremental:field.componentId==='base-form.incremental-code'||config.incremental}}
 catch{const config=normalizeCodeComponentSettings(overrides);return {...config,incremental:field.componentId==='base-form.incremental-code'||config.incremental}}
}
export function writeComponentLibrary(storage:FormStorage,library:ComponentLibrary){
 // Validate before writing. Never replace a malformed stored library implicitly.
 readComponentLibrary(storage)
 const serialized=JSON.stringify(library);readComponentLibrary({getItem:()=>serialized,setItem:()=>{}})
 storage.setItem(componentLibraryKey,serialized)
 if(typeof window!=='undefined')window.dispatchEvent(new Event(componentLibraryEvent))
}
export function componentDescendsFrom(library:ComponentLibrary,id:string,ancestor:string):boolean{
 let next:string|undefined=canonicalBehaviorId(id);const visited=new Set<string>()
 while(next&&!visited.has(next)){if(next===canonicalBehaviorId(ancestor))return true;visited.add(next);next=library.components.find(item=>item.id===next)?.parentId}
 return false
}
