import {useEffect,useRef,useState} from 'react'

export type DefinitionRow={id:string;rowVersion?:string}
export const definitionBulkLimit=500
/** Route existing footer Delete actions to the same selected rows as the keyboard. */
export function deleteSelectedDefinitionRows(scope:HTMLElement|null){
 const trigger=scope?.querySelector<HTMLButtonElement>('[data-definition-bulk-delete]');if(!trigger)return false;trigger.click();return true
}
type Options<Row extends {id:string}>={enabled:boolean;scope:string;onDelete?:(rows:Row[])=>Promise<void>;range:(start:number,end:number,signal:AbortSignal)=>Promise<Row[]>;confirmText?:(count:number)=>string}
/** Opt-in for definition tables only. IDs, never row positions, own the selection. */
export function useDefinitionRowSelection<Row extends {id:string}>(options:Options<Row>){
 const current=useRef(options);current.current=options
 const [multiSelection,setMultiSelection]=useState(false)
 const [selection,setSelection]=useState(new Map<string,Row>()),[blocked,setBlocked]=useState(new Set<string>()),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const selected=useRef(selection);selected.current=selection
 const anchor=useRef<number|null>(null),request=useRef<AbortController|null>(null),pending=useRef(false),generation=useRef(0)
 useEffect(()=>{generation.current++;request.current?.abort();pending.current=false;anchor.current=null;setMultiSelection(false);selected.current=new Map();setSelection(new Map());setBlocked(new Set());setError('');setBusy(false);return()=>{generation.current++;request.current?.abort()}},[options.scope,options.enabled])
 async function select(row:Row,index:number,event:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean}){
  if(!current.current.enabled||pending.current)return
  setMultiSelection(event.ctrlKey||event.metaKey||event.shiftKey);setError('');setBlocked(new Set())
  if(event.shiftKey&&anchor.current!==null){
   const start=Math.min(anchor.current,index),end=Math.max(anchor.current,index)
   if(end-start+1>definitionBulkLimit){setError('حداکثر ۵۰۰ ردیف را در یک نوبت انتخاب کنید.');return}
   const abort=new AbortController(),ticket=generation.current;request.current=abort;pending.current=true;setBusy(true)
   try{const rows=await current.current.range(start,end,abort.signal);if(abort.signal.aborted||ticket!==generation.current)return;if(rows.length!==end-start+1||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('بازهٔ انتخاب کامل دریافت نشد؛ دوباره انتخاب کنید.');const next=event.ctrlKey||event.metaKey?new Map(selected.current):new Map<string,Row>();rows.forEach(item=>next.set(item.id,item));if(next.size>definitionBulkLimit)throw Error('حداکثر ۵۰۰ ردیف را در یک نوبت انتخاب کنید.');selected.current=next;setSelection(next)}catch(e){if(!abort.signal.aborted)setError((e as Error).message)}finally{if(ticket===generation.current){pending.current=false;setBusy(false)}}
  }else{
   const next=event.ctrlKey||event.metaKey?new Map(selected.current):new Map<string,Row>()
   if(next.has(row.id)&&(event.ctrlKey||event.metaKey))next.delete(row.id);else next.set(row.id,row)
   if(next.size>definitionBulkLimit){setError('حداکثر ۵۰۰ ردیف را در یک نوبت انتخاب کنید.');return}
   anchor.current=index;selected.current=next;setSelection(next)
  }
 }
 async function remove(){
  const config=current.current,rows=[...selected.current.values()]
  if(!config.enabled||!config.onDelete||pending.current||!rows.length)return
  if(!window.confirm(config.confirmText?.(rows.length)??`${rows.length} ردیف انتخاب شده است؛ حذف شوند؟ در صورت وجود مورد غیرمجاز، هیچ ردیفی حذف نمی‌شود.`))return
  const ticket=generation.current;pending.current=true;setBusy(true);setError('');setBlocked(new Set())
  try{await config.onDelete(rows);if(ticket===generation.current){selected.current=new Map();setSelection(new Map());setMultiSelection(false);anchor.current=null}}
  catch(e){if(ticket===generation.current){setError((e as Error).message);const ids=(e as {details?:{blockedIds?:string[]}}).details?.blockedIds;if(Array.isArray(ids))setBlocked(new Set(ids))}}
  finally{if(ticket===generation.current){pending.current=false;setBusy(false)}}
 }
 function keyDown(event:{key:string;target:EventTarget|null;preventDefault:()=>void;stopPropagation:()=>void;ctrlKey:boolean;altKey:boolean;metaKey:boolean}){
  if(['ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)&&!(event.target instanceof Element&&event.target.closest('input,textarea,select,button,[contenteditable=true]'))&&!pending.current){selected.current=new Map();setSelection(new Map());anchor.current=null;setBlocked(new Set());return}
  if(event.key!=='Delete'||!current.current.enabled||!selection.size||event.ctrlKey||event.altKey||event.metaKey||(event.target instanceof Element&&event.target.closest('input,textarea,select,button,[contenteditable=true]')))return
  event.preventDefault();event.stopPropagation();void remove()
 }
 return {selection,multiSelection,blocked,busy,error,select,remove,keyDown}
}
