import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {loadDesignReleases,removeDesignRelease,type DesignRelease} from './formDesignReleases'
import {api} from '../../api'
import {defaultNavigation,type NavigationNode} from '../../navigation'
import type {Language} from '../../i18n'
export function FormMenuPlacement({value,onChange}:{value:string;onChange:(id:string)=>void}){
 const [nodes,setNodes]=useState<NavigationNode[]>(defaultNavigation),[error,setError]=useState('')
 useEffect(()=>{let active=true;api<{nodes:NavigationNode[]}>('/api/navigation').then(result=>{if(active)setNodes(result.nodes)}).catch(()=>{if(active)setError('منوی سرور در دسترس نیست؛ گروه‌های پیش‌فرض نمایش داده می‌شوند.')});return()=>{active=false}},[])
 const groups=nodes.filter(node=>!node.routeId&&node.enabled)
 const label=(node:NavigationNode):string=>{const parent=groups.find(item=>item.id===node.parentId);return (parent?parent.label+' / ':'')+(node.label||node.id)}
 return <label>منو یا گروه مقصد<select value={value} onChange={event=>onChange(event.target.value)}><option value="">سطح اصلی منو</option>{groups.map(group=><option key={group.id} value={group.id}>{label(group)}</option>)}{value&&!groups.some(group=>group.id===value)&&<option value={value}>{value} — گروه فعلاً در دسترس نیست</option>}</select>{error&&<small role="status">{error}</small>}</label>
}
export function PendingFormDesignMenu({userId,onOpen,parentId=null,nodes=[],language='fa'}:{userId?:string;onOpen:(id:string)=>void;parentId?:string|null;nodes?:NavigationNode[];language?:Language}){
 const [releases,setReleases]=useState<DesignRelease[]>([])
 const [contextMenu,setContextMenu]=useState<{releaseId:string;title:string;left:number;top:number}|null>(null)
 const [error,setError]=useState('')
 const contextAction=useRef<HTMLButtonElement>(null)
 useEffect(()=>{const read=()=>{try{setReleases(loadDesignReleases(window.localStorage,userId)??[])}catch{setReleases([])}};read();window.addEventListener('form-design-releases-updated',read);window.addEventListener('storage',read);return()=>{window.removeEventListener('form-design-releases-updated',read);window.removeEventListener('storage',read)}},[userId])
 useEffect(()=>{if(!contextMenu)return;contextAction.current?.focus();const close=(event?:Event)=>{if(event?.type==='pointerdown'&&event.target instanceof Element&&event.target.closest('.pending-form-design-context-menu'))return;setContextMenu(null)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setContextMenu(null)}};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key,true);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true)}},[contextMenu])
 const latest=[...new Map(releases.map(release=>[release.formId,release])).values()].filter(release=>{const target=release.snapshot.schema.menuPlacement?.menuId;const valid=nodes.some(node=>node.id===target&&!node.routeId&&node.enabled);return (valid?target:null)===parentId})
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
 return latest.length?<section className="pending-form-design-menu" aria-label={word('فرم‌های در انتظار اتصال','Forms awaiting integration','待集成表单')} dir={fa?'rtl':'ltr'}><strong>{word('نسخه‌های طراحی — در انتظار اتصال','Design releases — awaiting integration','设计版本 — 等待集成')}</strong>{error&&<small role="status">{error}</small>}{latest.map(release=><button key={release.formId} type="button" data-design-status={release.status} title={word('برای بازکردن کلیک کنید؛ برای حذف از این فهرست راست‌کلیک کنید.','Click to open; right-click to remove from this list.','点击打开；右键可从此列表移除。')} onClick={()=>{setContextMenu(null);onOpen(release.formId)}} onContextMenu={event=>{event.preventDefault();event.stopPropagation();openContextMenu(release,event.clientX,event.clientY)}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();openContextMenu(release,rect.left,rect.bottom)}}}><b>{release.snapshot.schema.title[language]||release.snapshot.schema.title.fa}</b><small>{release.snapshot.schema.menuPlacement?.menuId||word('بدون گروه مقصد','No destination group','无目标组')} · {word('فرم اصلی محفوظ است','Original form is preserved','原始表单已保留')}</small></button>)}{contextMenu&&createPortal(<div className="pending-form-design-context-menu" role="menu" aria-label={word('عملیات نسخهٔ طراحی','Design release actions','设计版本操作')} dir={fa?'rtl':'ltr'} style={{left:contextMenu.left,top:contextMenu.top}} onPointerDown={event=>event.stopPropagation()}><strong>{contextMenu.title}</strong><button ref={contextAction} type="button" role="menuitem" onClick={removeFromQueue}>{word('حذف از این فهرست','Remove from this list','从此列表移除')}</button></div>,document.body)}</section>:null
}
