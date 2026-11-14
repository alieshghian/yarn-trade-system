import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type CloseGuard = { dirty: boolean; onSave?: () => boolean | void; onDiscard?: () => void }
const DialogContext=createContext<{ close:()=>void; register:(guard:CloseGuard|null)=>void }|null>(null)
export function useDocumentDialogGuard(guard: CloseGuard) {
  const register=useContext(DialogContext)?.register
  useLayoutEffect(()=>{register?.(guard);return()=>register?.(null)},[register,guard.dirty,guard.onSave,guard.onDiscard])
}
export function DocumentDialogCloseButton({children}:{children:ReactNode}) {
  const dialog=useContext(DialogContext)
  return <button type="button" onClick={()=>dialog?.close()}>{children}</button>
}
export function FormDocumentDialog({language,title,children,onClose,dirty=false,onSave,onDiscard,hidden=false,panelClassName=''}:{language:'fa'|'en'|'zh';title:string;children:ReactNode;onClose:()=>void;hidden?:boolean;panelClassName?:string}&Partial<CloseGuard>) {
  const [confirm,setConfirm]=useState(false), [position,setPosition]=useState({x:0,y:0}), [dragging,setDragging]=useState(false), guard=useRef<CloseGuard|null>(null), section=useRef<HTMLElement|null>(null)
  const drag=useRef<{pointerId:number;pointerX:number;pointerY:number;left:number;top:number;width:number;height:number;x:number;y:number}|null>(null)
  const register=useCallback((value:CloseGuard|null)=>{guard.current=value},[])
  const activeGuard=()=>guard.current??{dirty,onSave,onDiscard}
  const close=()=>{if(activeGuard().dirty)setConfirm(true);else onClose()}
  const beginDrag=(event:ReactPointerEvent<HTMLElement>)=>{
    if(hidden||event.button!==0||(event.target as Element).closest('button,a,input,select,textarea,[data-dialog-no-drag]'))return
    const rect=section.current?.getBoundingClientRect()
    if(!rect)return
    event.preventDefault()
    drag.current={pointerId:event.pointerId,pointerX:event.clientX,pointerY:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height,x:position.x,y:position.y}
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const moveDrag=(event:ReactPointerEvent<HTMLElement>)=>{
    const start=drag.current
    if(!start||start.pointerId!==event.pointerId)return
    const margin=16,left=Math.min(Math.max(margin,start.left+event.clientX-start.pointerX),Math.max(margin,window.innerWidth-margin-start.width)),top=Math.min(Math.max(margin,start.top+event.clientY-start.pointerY),Math.max(margin,window.innerHeight-margin-start.height))
    setPosition({x:start.x+left-start.left,y:start.y+top-start.top})
  }
  const finishDrag=(event:ReactPointerEvent<HTMLElement>)=>{
    if(drag.current?.pointerId!==event.pointerId)return
    drag.current=null
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
  }
  useLayoutEffect(()=>{
    if(hidden)return
    const previous=document.activeElement as HTMLElement|null
    if(!section.current?.contains(document.activeElement))section.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button')?.focus({preventScroll:true})
    return()=>{if(previous?.isConnected)previous.focus({preventScroll:true})}
  },[hidden,confirm])
  useLayoutEffect(()=>{if(hidden){drag.current=null;setPosition({x:0,y:0});setDragging(false)}},[hidden])
  return createPortal(<DialogContext.Provider value={{close,register}}><div className="form-document-dialog-backdrop" style={hidden?{display:'none'}:undefined} role="dialog" aria-modal="true" aria-label={title} dir={language==='fa'?'rtl':'ltr'} onKeyDownCapture={event=>{
    if((event.target as Element).closest('[role="dialog"]')!==event.currentTarget)return
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(confirm)setConfirm(false);else close()}
    if(event.key==='Tab'){const root=confirm?section.current?.querySelector('[role="alertdialog"]'):section.current;const controls=[...(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')??[])].filter(item=>item.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
  }}><section ref={section} className={'form-document-dialog '+panelClassName} style={position.x||position.y?{left:position.x,top:position.y}:undefined}><header className={'form-document-dialog-header'+(dragging?' is-dragging':'')} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={()=>{drag.current=null;setDragging(false)}}><h2>{title}</h2><button type="button" className="form-document-dialog-close" aria-label="بستن پنجره" title="بستن (Escape)" onClick={close}>×</button></header>{children}
    {confirm&&<div className="form-dialog-confirm-shade"><div className="form-dialog-close-confirm" role="alertdialog" aria-label="تغییرات ثبت‌نشده"><p>تغییرات ثبت‌نشده دارید. چگونه پنجره بسته شود؟</p><div className="form-document-settings-buttons"><button type="button" disabled={!activeGuard().onSave} onClick={()=>{const saved=activeGuard().onSave?.();setConfirm(false);if(saved!==false)onClose()}}>ثبت و بستن</button><button type="button" onClick={()=>{activeGuard().onDiscard?.();setConfirm(false);onClose()}}>بستن بدون ثبت</button><button type="button" autoFocus onClick={()=>setConfirm(false)}>ادامهٔ ویرایش</button></div></div></div>}
  </section></div></DialogContext.Provider>,document.body)
}
