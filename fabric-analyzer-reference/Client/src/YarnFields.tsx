import { useEffect, useRef, useState } from 'react'
import { api, bases, kinds, makeYarn, systems } from './model'
import type { YarnInput, YarnRow } from './model'
import { DateField, EntryForm, Field, Message, Notes, Num, Select, TextInput, useAction } from './ui'

export function YarnFields({draft,onChange}:{draft:YarnInput;onChange:(value:YarnInput)=>void}) {
  const set=<K extends keyof YarnInput>(key:K,value:YarnInput[K])=>onChange({...draft,[key]:value})
  const measure = draft.useMeasured || draft.measureM!=null || draft.measureG!=null || !!draft.measureSource
  return <div className="fields">
    <Field label="کد یکتای نخ"><input autoFocus required value={draft.code} maxLength={80} dir="ltr" onChange={e=>set('code',e.target.value)}/></Field>
    <Field label="نام نخ"><TextInput value={draft.name} onChange={v=>set('name',v)}/></Field>
    <Field label="نوع نخ"><Select label="نوع نخ" value={draft.kind} options={kinds} onChange={v=>set('kind',v)}/></Field>
    <Field label="رنگ یا کد رنگ"><TextInput value={draft.color} onChange={v=>set('color',v)}/></Field>
    <Field label="جنس نخ"><TextInput value={draft.material} onChange={v=>set('material',v)}/></Field>
    <Field label="سیستم نمره‌گذاری"><Select label="سیستم نمره‌گذاری" value={draft.system} options={systems} placeholder="انتخاب سیستم" onChange={v=>set('system',v)}/></Field>
    <Field label="نمره نخ"><Num value={draft.count} blankZero min={0.000001} onChange={v=>set('count',v??0)}/></Field>
    <Field label="تعداد لا"><Num value={draft.plies} integer min={1} max={100} onChange={v=>set('plies',v??0)}/></Field>
    <Field label="مبنای نمره"><Select label="مبنای نمره" value={draft.basis} options={bases} placeholder="انتخاب مبنا" onChange={v=>set('basis',v)}/></Field>
    <Field label="طول توزین Tex (متر)"><Num value={draft.measureM} required={measure} min={0.000001} onChange={v=>set('measureM',v)}/></Field>
    <Field label="وزن توزین Tex (گرم)"><Num value={draft.measureG} required={measure} min={0.000001} onChange={v=>set('measureG',v)}/></Field>
    <Field label="منبع اندازه‌گیری"><TextInput value={draft.measureSource} required={measure} maxLength={500} onChange={v=>set('measureSource',v)}/></Field>
    {measure && <DateField label="تاریخ اندازه‌گیری Tex" value={draft.measureDate} onChange={v=>set('measureDate',v)}/>}
    <label className="checkbox"><input type="checkbox" checked={draft.useMeasured} onChange={e=>set('useMeasured',e.target.checked)}/> استفاده از Tex اندازه‌گیری‌شده</label>
    <Notes value={draft.notes} onChange={v=>set('notes',v)}/>
  </div>
}
export function yarnPayload(draft:YarnInput) {
  return {...draft,system:draft.system||null,basis:draft.basis||null,
    measureDate:draft.measureM!=null || draft.measureG!=null || draft.useMeasured ? draft.measureDate||null : null}
}
export function YarnDialog({onClose,onSave}:{onClose:()=>void;onSave:(yarn:YarnRow)=>void}) {
  const [draft,setDraft]=useState(makeYarn)
  const ref=useRef<HTMLDialogElement>(null)
  const action=useAction()
  useEffect(()=>{ref.current?.showModal()},[])
  return <dialog ref={ref} className="panel yarn-dialog" onCancel={e=>{e.preventDefault();if(!action.busy)onClose()}} aria-labelledby="inline-yarn-title">
    <h2 id="inline-yarn-title">ثبت نخ جدید در فهرست</h2>
    <Message error={action.error}/>
    <EntryForm onSave={()=>void action.run(async()=> {
      const saved=await api<{id:number;tex:number;input:YarnInput}>('/yarns','POST',yarnPayload(draft))
      onSave({...saved,createdAt:new Date().toISOString(),createdBy:''})
    })} busy={action.busy} footer={<button type="button" onClick={onClose}>انصراف</button>}>
      <YarnFields draft={draft} onChange={setDraft}/>
    </EntryForm>
  </dialog>
}
