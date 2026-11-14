import {Suspense,useCallback,useEffect,useRef,useState} from 'react'
import {FormValueList} from './FormValueList'
import {FormDocumentDialog} from './FormDocumentDialog'
import {getSystemLookupSource,canReadLookup,canCreateLookup,normalizeLookupSettings,type LookupItem,type SystemLookupSource} from './systemLookupSources'
import {resolveListSettings,componentAccessAllowed,type ListSettingsPatch} from './componentListSettings'
import {useComponentListContext} from './ComponentListContext'
import {useComponentBehavior} from './useComponentBehavior'
import type {Language} from '../../i18n'

export type SystemLookupProps={field:string;label:string;value:string;onChange:(id:string)=>void;language:Language;disabled?:boolean;settings?:unknown;listSettings?:ListSettingsPatch;componentDefinitionId?:string;sourceOverride?:SystemLookupSource;actorRole?:'admin'|'user';ownerId?:string;onCreationChange?:(creating:boolean)=>void;onSelected?:()=>void}
/** Stable record IDs are values; the shared value-list engine owns browsing and keyboard selection. */
export function SystemLookup({field,label,value,onChange,language,disabled=false,settings,componentDefinitionId='base-form.system-lookup',listSettings,sourceOverride,actorRole,ownerId,onCreationChange,onSelected}:SystemLookupProps){
 const config=normalizeLookupSettings(settings),context=useComponentListContext(),behavior=useComponentBehavior(componentDefinitionId,undefined,context.behaviorOverrides)
 const rules=resolveListSettings(behavior.listSettings,context.settings,listSettings),role=actorRole??context.role??'user'
 const source=sourceOverride??getSystemLookupSource(config.sourceId),permitted=Boolean(source&&(sourceOverride||canReadLookup(source)))
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(1),[items,setItems]=useState<LookupItem[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 const [creating,setCreating]=useState(false),[saved,setSaved]=useState<LookupItem|null>(null),[selected,setSelected]=useState<LookupItem|null>(null)
 const host=useRef<HTMLDivElement>(null),generation=useRef(0),fa=language==='fa'
 useEffect(()=>{onCreationChange?.(creating);return()=>onCreationChange?.(false)},[creating,onCreationChange])
 const fieldsKey=rules.searchFields.filter(f=>['code','name'].includes(f)).join(',')||'code,name'
 const resetSearch=useCallback((text:string)=>{setQuery(text);setPage(1)},[])
 useEffect(()=>{setItems([]);setSelected(null);setSaved(null);setPage(1);setQuery('');setError('');setCreating(false)},[source])
 useEffect(()=>{
   if(!value){setSelected(null);return}
   if(!source||!permitted)return
   // A selected/search-created item already carries the authoritative display data.
   if(selected?.id===value)return
   const abort=new AbortController();setSelected(null)
   source.byId(value,abort.signal).then(item=>{if(!abort.signal.aborted)setSelected(item)}).catch(e=>{if(!abort.signal.aborted)setError(String(e instanceof Error?e.message:e))})
   return()=>abort.abort()
 },[source,value,permitted])
 useEffect(()=>{
   if(!open||!source||!permitted)return
   const abort=new AbortController(),ticket=++generation.current
   setLoading(true);setError('')
   const timer=setTimeout(()=>{void source.search(query,page,fieldsKey.split(','),abort.signal,ownerId).then(result=>{
     if(abort.signal.aborted||generation.current!==ticket)return
     setItems(current=>[...new Map([...(page===1?[]:current),...result.items].map(item=>[item.id,item])).values()]);setTotal(result.total)
   }).catch(e=>{if(!abort.signal.aborted&&generation.current===ticket)setError(e instanceof Error?e.message:String(e))}).finally(()=>{if(!abort.signal.aborted&&generation.current===ticket)setLoading(false)})},query?140:0)
   return()=>{clearTimeout(timer);abort.abort()}
 },[open,source,permitted,query,page,fieldsKey,retry,ownerId])
 const mayCreate=Boolean(source?.Create&&permitted&&(sourceOverride||canCreateLookup(source))&&componentAccessAllowed(rules.permissions.add,role))
 const refocus=()=>requestAnimationFrame(()=>host.current?.querySelector<HTMLElement>('[data-field]')?.focus({preventScroll:true}))
 const choose=(item:LookupItem)=>{setSelected(item);onChange(item.id);setSaved(null);setCreating(false);setOpen(false);if(onSelected)requestAnimationFrame(onSelected);else refocus()}
 const cancelCreation=()=>{setCreating(false);setSaved(null);refocus()}
 useEffect(()=>{if(open&&mayCreate)void source?.preloadCreate?.().catch(()=>{/* The create dialog owns load failures. */})},[open,mayCreate,source])
 const Create=source?.Create
 const all=[...items,...(selected?[selected]:[]),...(saved?[saved]:[])]
 const rootNameOnly=config.sourceId==='productGroups'||source?.id==='productGroups'
 const selectedPath=rootNameOnly?all.find(item=>item.id===value)?.name:undefined
 const display=(id:string)=>{const item=all.find(item=>item.id===id);return item?[item.code,item.name].filter(Boolean).join(' — '):id}
 return <div ref={host} className="system-lookup" data-lookup-source={source?.id??''} data-lookup-selected-display={rootNameOnly?'root-name':undefined} title={selectedPath||undefined}>
   <FormValueList field={field} label={label} primary={value} numbers={items.map(item=>item.id)} listPrimary="" disabled={disabled||!permitted||creating} fa={fa} multiline emptyChoiceLabel=" "
     componentDefinitionId={componentDefinitionId} listSettings={{...rules,searchEnabled:true,addPlacement:rules.addPlacement==='beside'?'popup':rules.addPlacement,permissions:{...rules.permissions,edit:'none',remove:'none',setDefault:'none'}}}
     addLabel={fa?`ایجاد ${source?.title.fa.replace(/^تعریف\s*/,'')??label} (Insert)`:`Create — ${source?.title.en??label} (Insert)`} actorRole={role} formatSelectedValue={rootNameOnly?id=>all.find(item=>item.id===id)?.name.split(' / ')[0].trim()??'':config.selectedDisplay==='name'?id=>all.find(item=>item.id===id)?.name??'':undefined} formatValue={display} onSearchChange={resetSearch} onPopupChange={setOpen} canAdd={mayCreate} onCreateRequested={()=>{if(mayCreate&&!disabled){setCreating(true);setSaved(null);setOpen(false)}}}
     searchPending={loading} onSelectValue={id=>{if(loading)return;if(!id){setSelected(null);onChange('')}else{const item=items.find(item=>item.id===id);if(item)choose(item)}}} onChange={()=>false}
     listLabel={(fa?'جست‌وجو و انتخاب ':'Search and select ')+label}
     searchFooter={<div className="system-lookup-search-status">{loading&&<span role="status">{fa?'در حال جست‌وجو…':'Searching…'}</span>}{error&&<div role="alert">{error}<button type="button" onClick={()=>setRetry(v=>v+1)}>{fa?'تلاش دوباره':'Retry'}</button></div>}{!loading&&!error&&!items.length&&<span>{fa?'موردی پیدا نشد.':'No matches.'}</span>}{!loading&&items.length<total&&<button type="button" onClick={()=>setPage(v=>v+1)}>{fa?'نتایج بیشتر':'More results'}</button>}</div>}/>
   {!source&&<small role="status">{fa?'منبع تعاریف را در تنظیمات فیلد انتخاب کنید.':'Choose a source in field settings.'}</small>}
   {source&&!permitted&&<small role="alert">{fa?'مجوز مشاهدهٔ این منبع را ندارید.':'You do not have access to this source.'}</small>}
   {creating&&Create&&<Suspense fallback={<small role="status">{fa?'در حال بازکردن فرم…':'Opening form…'}</small>}><FormDocumentDialog language={language} title={(fa?'افزودن — ':'Create — ')+source!.title[language]} onClose={()=>{if(saved||window.confirm(fa?'فرم ایجاد بسته شود؟ اطلاعات ثبت‌نشده از دست می‌رود.':'Close the create form and discard unsaved changes?'))cancelCreation()}} panelClassName="system-lookup-create-dialog">
     {saved?<div className="lookup-saved-record"><p>{fa?'رکورد با موفقیت ثبت شد: ':'Record saved: '}{display(saved.id)}</p><button type="button" onClick={()=>choose(saved)}>{fa?'انتخاب و بازگشت':'Select and return'}</button><button type="button" onClick={cancelCreation}>{fa?'بازگشت بدون انتخاب':'Return without selection'}</button></div>:<Create language={language} onCancel={cancelCreation} onSaved={item=>{if(config.returnMode==='selectAfterSave')setSaved(item);else choose(item)}}/>}
   </FormDocumentDialog></Suspense>}
 </div>
}
