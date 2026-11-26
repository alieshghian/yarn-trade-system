import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { latin, number } from './model'
import SystemDateInput from './shared/SystemDateInput'
import { functionKeyFromEvent } from './shared/functionKeys'
import './shared/date-controls.css'

export function Field({label,children,hint,wide=false}:{label:string;children:ReactNode;hint?:string;wide?:boolean}) {
  return <div className={wide?'field wide':'field'}><label><span>{label}</span>{children}</label>{hint && <small>{hint}</small>}</div>
}
export function TextInput({value,onChange,required=true,maxLength=200,dir,type='text'}:
  {value:string;onChange:(v:string)=>void;required?:boolean;maxLength?:number;dir?:'ltr';type?:'text'|'password'}) {
  return <input type={type} value={value} required={required} maxLength={maxLength} dir={dir} onChange={e=>onChange(e.target.value)}/>
}
export function Num({value,onChange,required=true,integer=false,min=0,max=100000000,label,disabled=false,blankZero=false}:
  {value:number|null;onChange:(v:number|null)=>void;required?:boolean;integer?:boolean;min?:number;max?:number;label?:string;disabled?:boolean;blankZero?:boolean}) {
  const [typing,setTyping] = useState<string>()
  const shown = value == null || blankZero && value === 0 ? '' : number(value,10)
  return <input aria-label={label} dir="ltr" inputMode={integer ? 'numeric':'decimal'} value={typing ?? shown}
    required={required} disabled={disabled} onBlur={()=>setTyping(undefined)}
    onChange={e=>{
      const next=latin(e.target.value).replace(/[,٬]/g,'')
      if (!(integer ? /^\d*$/ : /^\d*(\.\d*)?$/).test(next)) return
      const val=next === '' || next === '.' ? null : Number(next)
      e.target.setCustomValidity(next === '.' || val !== null && (val < min || val > max) ? `عدد باید بین ${min} و ${max} باشد.` : '')
      setTyping(next); onChange(val)
    }}/>
}
export function Select<T extends string>({value,options,onChange,placeholder,disabled=false,label}:
  {value:T|'';options:Record<T,string>;onChange:(v:T)=>void;placeholder?:string;disabled?:boolean;label?:string}) {
  return <select aria-label={label} value={value} required disabled={disabled} onChange={e=>onChange(e.target.value as T)}>
    {placeholder && <option value="">{placeholder}</option>}
    {(Object.entries(options) as [T,string][]).map(([id,name])=><option key={id} value={id}>{name}</option>)}
  </select>
}
export function DateField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {
  return <div className="field"><span>{label} (شمسی)</span>
    <SystemDateInput value={value} onChange={onChange} required language="fa" ariaLabel={label}/>
  </div>
}
export function Notes({value,onChange,label='توضیحات'}:{value:string;onChange:(v:string)=>void;label?:string}) {
  return <Field label={label} wide><textarea rows={2} value={value} maxLength={2000} onChange={e=>onChange(e.target.value)}/></Field>
}
export function Section({title,children,aside,id}:{title:string;children:ReactNode;aside?:ReactNode;id?:string}) {
  return <section className="panel" id={id}><div className="panel-head"><h2>{title}</h2>{aside}</div>{children}</section>
}
export function Badge({children,tone}:{children:ReactNode;tone:string}) { return <span className={'badge '+tone}>{children}</span> }
export function Table({heads,children,empty=false}:{heads:ReactNode[];children:ReactNode;empty?:boolean}) {
  return <div className="table-wrap"><table><thead><tr>{heads.map((head,i)=><th key={i} scope="col">{head}</th>)}</tr></thead>
    <tbody>{empty ? <tr><td className="empty" colSpan={heads.length}>رکوردی برای نمایش وجود ندارد.</td></tr> : children}</tbody>
  </table></div>
}
export function Message({error,success}:{error?:string;success?:string}) {
  return <>{error && <div className="notice error" role="alert">{error}</div>}
    {success && <div className="notice success" role="status">{success}</div>}</>
}
export function useAction() {
  const [error,setError]=useState(''), [success,setSuccess]=useState(''), [busy,setBusy]=useState(false)
  const active=useRef(false)
  async function run(task:()=>Promise<void>,message='') {
    if(active.current) return
    active.current=true; setBusy(true); setError(''); setSuccess('')
    try { await task(); setSuccess(message) }
    catch(e) { setError(e instanceof Error ? e.message : 'درخواست انجام نشد.') }
    finally { active.current=false; setBusy(false) }
  }
  return {error,success,busy,run}
}
export function useNew(callback:()=>void,enabled=true) {
  useEffect(()=>{
    const handler=(e:globalThis.KeyboardEvent)=>{
      const target=e.target
      if (e.code!=='Space' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !enabled ||
        target instanceof HTMLElement && target.closest('input,select,textarea,button,a,[contenteditable="true"]')) return
      e.preventDefault(); callback()
    }
    document.addEventListener('keydown',handler)
    return ()=>document.removeEventListener('keydown',handler)
  },[callback,enabled])
}
export function EntryForm({children,onSave,busy=false,saveLabel='ذخیره',footer,id}:
  {children:ReactNode;onSave:()=>void;busy?:boolean;saveLabel?:string;footer?:ReactNode;id?:string}) {
  const ref=useRef<HTMLFormElement>(null)
  useEffect(()=>{
    const handler=(e:globalThis.KeyboardEvent)=>{
      if (functionKeyFromEvent(e) !== 'F3' || e.repeat || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || !ref.current ||
        (document.activeElement !== document.body && !ref.current.contains(document.activeElement))) return
      e.preventDefault()
      if (!busy) ref.current.requestSubmit()
    }
    document.addEventListener('keydown',handler)
    return ()=>document.removeEventListener('keydown',handler)
  },[busy])
  function navigate(e:KeyboardEvent<HTMLFormElement>) {
    const field=e.target
    if(e.defaultPrevented || e.target instanceof Element && e.target.closest('.system-date-input') || e.key!=='Enter' || e.nativeEvent.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey ||
      !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return
    e.preventDefault()
    if(!field.reportValidity()) return
    const fields=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled):not([readonly]),select:not(:disabled),textarea:not(:disabled),button[type=submit]:not(:disabled)'))
    fields[fields.indexOf(field)+1]?.focus()
  }
  function submit(e:FormEvent) { e.preventDefault(); if(!busy) onSave() }
  return <form ref={ref} id={id} onKeyDown={navigate} onSubmit={submit} onFocus={e=>{
    const field = e.target
    if (field instanceof HTMLInputElement && !field.readOnly && ['text','search','tel'].includes(field.type)) field.select()
    if (field instanceof HTMLTextAreaElement && !field.readOnly) field.select()
  }}>
    <fieldset disabled={busy}>{children}<div className="form-actions">
      <button type="submit" className="save">{busy?'در حال ذخیره…':saveLabel} <kbd>F3</kbd></button>{footer}
    </div></fieldset>
  </form>
}
