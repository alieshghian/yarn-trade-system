import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {loadDesignReleases,removeDesignRelease,invalidatedDesignReleases,savedDesignApproval,verifyHandoffDocument,type DesignRelease} from './formDesignReleases'
import type {createFormDesignExport} from './formDesignExport'
import {integratedDesignRoute} from './formIntegrationRegistry.ts'
import type {MenuKey} from '../../navigation'
import {api,apiRequest} from '../../api'
import {defaultNavigation,type NavigationNode} from '../../navigation'
import type {Language} from '../../i18n'
import {laboratoryContentTitle} from './formDocumentControls'
import {formIntegrationTarget} from './formIntegrationTarget'
import {designDigest} from './formDesignReleases'
import {operationalSource} from './operationalFormCatalog'
import {isDesignAvailable} from './formDesignLifecycle'
export function FormMenuPlacement({value,onChange}:{value:string;onChange:(id:string)=>void}){
 const [nodes,setNodes]=useState<NavigationNode[]>(defaultNavigation),[error,setError]=useState('')
 useEffect(()=>{let active=true;api<{nodes:NavigationNode[]}>('/api/navigation').then(result=>{if(active)setNodes(result.nodes)}).catch(()=>{if(active)setError('منوی سرور در دسترس نیست؛ گروه‌های پیش‌فرض نمایش داده می‌شوند.')});return()=>{active=false}},[])
 const groups=nodes.filter(node=>!node.routeId&&node.enabled)
 const label=(node:NavigationNode):string=>{const parent=groups.find(item=>item.id===node.parentId);return (parent?parent.label+' / ':'')+(node.label||node.id)}
 return <label>منو یا گروه مقصد<select value={value} onChange={event=>onChange(event.target.value)}><option value="">سطح اصلی منو</option>{groups.map(group=><option key={group.id} value={group.id}>{label(group)}</option>)}{value&&!groups.some(group=>group.id===value)&&<option value={value}>{value} — گروه فعلاً در دسترس نیست</option>}</select>{error&&<small role="status">{error}</small>}</label>
}
export function PendingFormDesignMenu({userId,onOpen,onOpenOperational,language='fa'}:{userId?:string;onOpen:(id:string)=>void;onOpenOperational?:(route:MenuKey)=>void;nodes?:NavigationNode[];language?:Language}){
 const [releases,setReleases]=useState<DesignRelease[]>([])
 const [contextMenu,setContextMenu]=useState<{releaseId:string;title:string;left:number;top:number}|null>(null)
 const [error,setError]=useState('')
 const [invalidated,setInvalidated]=useState<Record<string,true>>({})
 const [requesting,setRequesting]=useState(false)
 const contextAction=useRef<HTMLButtonElement>(null)
 useEffect(()=>{const read=()=>{try{setReleases(loadDesignReleases(window.localStorage,userId)??[]);setInvalidated(invalidatedDesignReleases(window.localStorage,userId))}catch{setReleases([])}};const unsafe=(event:Event)=>{const id=(event as CustomEvent<{formId:string}>).detail.formId;setInvalidated(current=>({...current,...Object.fromEntries((loadDesignReleases(localStorage,userId)??[]).filter(r=>r.formId===id).map(r=>[r.id,true as const]))}))};read();window.addEventListener('form-design-releases-updated',read);window.addEventListener('storage',read);window.addEventListener('form-design-release-unsafe',unsafe);return()=>{window.removeEventListener('form-design-releases-updated',read);window.removeEventListener('storage',read);window.removeEventListener('form-design-release-unsafe',unsafe)}},[userId])
 useEffect(()=>{if(!contextMenu)return;contextAction.current?.focus();const close=(event?:Event)=>{if(event?.type==='pointerdown'&&event.target instanceof Element&&event.target.closest('.pending-form-design-context-menu'))return;setContextMenu(null)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setContextMenu(null)}};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key,true);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true)}},[contextMenu])
 // Legacy queue records are history, not evidence of an approved saved handoff.
 // Operational releases belong to their registered navigation destination, even
 // while an already-open sidebar is still refreshing its older server menu.
 const latest=[...new Map(releases.map(release=>[release.formId,release])).values()].filter(release=>{if(!isDesignAvailable(localStorage,userId,release.formId))return false;const handoff=release.handoff;if(!handoff||!handoff.permissionsConfirmedAt||!/^[a-f0-9]{64}$/.test(handoff.digest)||!/^[a-f0-9]{32}$/.test(handoff.backupId)||handoff.jsonAddress!==`/api/form-design-backups/${handoff.backupId}?handoff=true`)return false;return !integratedDesignRoute(release)})
 const fa=language==='fa',zh=language==='zh'
 const word=(faText:string,enText:string,zhText:string)=>fa?faText:zh?zhText:enText
 const openContextMenu=(release:DesignRelease,left:number,top:number)=>{
  const width=window.innerWidth||document.documentElement.clientWidth,height=window.innerHeight||document.documentElement.clientHeight
  setError('')
  setContextMenu({releaseId:release.id,title:release.snapshot.schema.title[language]||release.snapshot.schema.title.fa,left:Math.max(8,Math.min(left,width-228)),top:Math.max(8,Math.min(top,height-92))})
 }
 const removeFromQueue=()=>{
  if(!contextMenu)return
  const selected=contextMenu
  setContextMenu(null)
  const confirmation=word(`نسخهٔ «${selected.title}» فقط از فهرست انتظار اتصال برداشته می‌شود؛ فرم طراحی‌شده در فهرست فرم‌ها باقی می‌ماند. ادامه می‌دهید؟`,`Remove “${selected.title}” from the integration queue? Its designed form will remain in the form list.`,`将“${selected.title}”从集成队列中移除？设计表单仍会保留在表单列表中。`)
  if(!window.confirm(confirmation))return
  try{if(!removeDesignRelease(window.localStorage,userId,selected.releaseId)){setError(word('حذف از فهرست انجام نشد؛ فرم و نسخهٔ طراحی‌شده محفوظ هستند.','Could not remove the queue entry; the designed form is still preserved.','无法从队列移除；设计表单仍然保留。'));return}}catch{setError(word('ذخیره‌سازی مرورگر در دسترس نیست؛ هیچ نسخه‌ای حذف نشد.','Browser storage is unavailable; no design release was removed.','浏览器存储不可用；未移除任何设计版本。'));return}
  setReleases(current=>current.filter(release=>release.id!==selected.releaseId))
  window.dispatchEvent(new Event('form-design-releases-updated'))
 }
 const contextRelease=releases.find(item=>item.id===contextMenu?.releaseId)
 const contextTarget=contextRelease?formIntegrationTarget(contextRelease.snapshot.schema):null
 const requestIntegration=async(kind:'new'|'replacement')=>{
  const release=releases.find(item=>item.id===contextMenu?.releaseId)
  if(!release||requesting)return
  const target=formIntegrationTarget(release.snapshot.schema)
  if(target.kind!==kind){setError('هویت فرم اصلی یا نوع درخواست معتبر نیست؛ ابتدا مشخصات بازطراحی را بررسی کنید.');return}
  const current=()=>isDesignAvailable(localStorage,userId,release.formId)&&!invalidated[release.id]&&!invalidatedDesignReleases(localStorage,userId)[release.id]&&(loadDesignReleases(localStorage,userId)??[]).filter(item=>item.formId===release.formId).at(-1)?.id===release.id
  if(!current()){setError('فرم تغییر کرده است؛ ابتدا آخرین نسخه را دوباره تأیید و ذخیره و ثبت نهایی کنید.');return}
  if(!window.confirm(kind==='replacement'?`درخواست جایگزینی فرم اصلی «${target.kind==='replacement'?target.originalRoute:''}» با همین نسخه ثبت شود؟ مسیر و داده‌های قبلی تا موفقیت اتصال، آزمون و آماده‌بودن بازگشت حفظ می‌شوند.`:'درخواست اتصال همین نسخهٔ تأییدشده به API و دیتابیس ثبت شود؟ عملیاتی‌شدن پس از اجرای اتصال و موفقیت کنترل‌ها انجام می‌شود.'))return
  setRequesting(true)
  try{
   if(!await savedDesignApproval(localStorage,userId,release.snapshot)||!current())throw Error()
   const document=await api<ReturnType<typeof createFormDesignExport>>(release.handoff!.jsonAddress)
   if(!await verifyHandoffDocument(document,release)||JSON.stringify(document.integrationTarget)!==JSON.stringify(target)||!current())throw Error()
   const source=operationalSource(release.snapshot.schema)
   const sourceBaselineDigest=kind==='replacement'&&source?await designDigest(source.baseline):undefined
   if(!current()||!await savedDesignApproval(localStorage,userId,release.snapshot)||!current())throw Error()
   const response=await apiRequest<{id:string}>('/api/form-design-backups',{method:'POST',body:JSON.stringify({formId:release.formId,reason:'integration-request',releaseId:release.id,digest:release.handoff!.digest,snapshot:{artifact:'yarn-trade.integration-request',operation:kind==='replacement'?'replace-existing':'create-new',integrationTarget:target,sourceBaselineDigest,releaseId:release.id,formId:release.formId,digest:release.handoff!.digest,jsonAddress:release.handoff!.jsonAddress,menuPlacement:release.snapshot.schema.menuPlacement,status:'awaiting-developer-integration',requiresCurrentApproval:true,requestedAt:new Date().toISOString()}})})
   if(!response.id||!current())throw Error()
   setContextMenu(null);setError('درخواست همان نسخه ثبت شد؛ اجرای خودکار اتصال هنوز در این پروژه پیاده نشده و فرم عملیاتی نشده است.')
  }catch{setError('درخواست اتصال تأیید نشد؛ تغییر نسخه، تأیید ذخیره و اتصال سرور را بررسی کنید.')}
  finally{setRequesting(false)}
 }
 return latest.length?<section className="pending-form-design-menu" aria-label={word('تحویل فرم‌ها','Form handoffs','表单交接')} dir={fa?'rtl':'ltr'}>
  {error&&<small role="status">{error}</small>}
  {latest.map(release=>{const route=integratedDesignRoute(release);const changed=invalidated[release.id];return <button key={release.formId} data-form-id={release.formId} data-release-id={release.id} data-handoff-json={changed?undefined:release.handoff!.jsonAddress} data-handoff-digest={release.handoff!.digest} type="button" data-design-status={changed?'changed':route?'operational':release.status} onClick={()=>{setContextMenu(null);if(route)onOpenOperational?.(route);else onOpen(release.formId)}} onContextMenu={event=>{event.preventDefault();event.stopPropagation();if(!route)openContextMenu(release,event.clientX,event.clientY)}} onKeyDown={event=>{if(!route&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();openContextMenu(release,rect.left,rect.bottom)}}}>
    <b>{laboratoryContentTitle(release.snapshot.schema.title[language]||release.snapshot.schema.title.fa)}{changed?word(' — تغییر کرده؛ نیازمند تأیید مجدد',' — Changed; approval required',' — 已更改，需要重新批准'):!route&&word(" — آزمایشی، در انتظار اتصال"," — Draft, awaiting integration"," — 草稿，等待集成")}</b>
   </button>})}
  {contextMenu&&createPortal(<div className="pending-form-design-context-menu" role="menu" dir={fa?'rtl':'ltr'} style={{left:contextMenu.left,top:contextMenu.top}} onPointerDown={event=>event.stopPropagation()}><strong>{contextMenu.title}</strong><button type="button" role="menuitem" disabled={requesting||!!invalidated[contextMenu.releaseId]||contextTarget?.kind==='blocked'} onClick={()=>void requestIntegration(contextTarget?.kind==='replacement'?'replacement':'new')}>{contextTarget?.kind==='replacement'?'درخواست جایگزینی فرم اصلی':'درخواست اتصال API و دیتابیس'}</button><button ref={contextAction} type="button" role="menuitem" onClick={removeFromQueue}>{word('حذف از این فهرست','Remove from this list','从此列表移除')}</button></div>,document.body)}
 </section>:null
}
