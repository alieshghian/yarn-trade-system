import { useEffect, useMemo, useState } from 'react'
import { api, beamNames, fabricBases, makeBeam, number } from './model'
import type { AnalysisInput, Configuration, Theory, WarpBeam, YarnRow } from './model'
import { Cycle, yarnName } from './Calculations'
import { DateField, EntryForm, Field, Message, Notes, Num, Section, Select, Table, TextInput, useAction } from './ui'
import { YarnDialog } from './YarnFields'

const emptyPick = {yarnId:0,picks:1,measuredPickCm:null}
const refs = (rows:YarnRow[])=>rows.map(y=>({id:y.id,name:y.input.name,color:y.input.color,tex:y.tex}))
function editable(input:AnalysisInput):AnalysisInput {
  return {...input,basis:input.basis??'Meter',weftColors:input.weftColors??[...new Set(input.weft.map(w=>w.yarnId))],
    beams:input.beams??[{beam:'Single',ends:input.warp.reduce((sum,w)=>sum+(w.ends??0),0),
      steps:input.warp.length?input.warp.map(w=>({yarnId:w.yarnId,repeat:w.ends??1,extra:w.extra})):makeBeam('Single').steps}]}
}
export function AnalysisEditor({initial,yarns,editing,onSave,onCancel}:
  {initial:AnalysisInput;yarns:YarnRow[];editing?:{id:number;rowVersion:string};onSave:(id:number)=>Promise<void>;onCancel:()=>void}) {
  const [draft,setDraft]=useState(()=>editable(initial)),[reason,setReason]=useState('')
  const [created,setCreated]=useState<YarnRow[]>([]),[newYarn,setNewYarn]=useState<((id:number)=>void)>()
  const [config,setConfig]=useState<Configuration>(),[configError,setConfigError]=useState('')
  const [preview,setPreview]=useState<Theory>(),[previewError,setPreviewError]=useState('')
  const action=useAction()
  const available=useMemo(()=>[...created,...yarns], [created,yarns])
  const yarnRefs=useMemo(()=>refs(available),[available])
  const colors=draft.weftColors!
  const beams=draft.beams!
  const max=config?.maxWeftCycleSlots
  const used=draft.weft.reduce((sum,w)=>sum+w.picks,0)
  const capacityError = max && (used>max || colors.length>max) ? `تعداد رنگ یا مجموع تکرارها از ظرفیت ${max} جایگاه بیشتر است.` : ''
  const widthError = draft.fabricCm>0 && draft.reedCm>0 && draft.fabricCm>draft.reedCm ? 'عرض خام نباید از عرض شانه بیشتر باشد.' : ''
  const cycleError = draft.startPick>used ? 'پود آغاز باید در محدودهٔ سیکل باشد.' : ''
  useEffect(()=>{void api<Configuration>('/configuration').then(setConfig).catch(e=>setConfigError(e.message))},[])
  useEffect(()=>{
    setPreview(undefined);setPreviewError('')
    if (!config || widthError || capacityError || cycleError || !draft.date || !draft.reedCm || !draft.fabricCm ||
      !draft.warpDensity || !draft.weftDensity || colors.some(c=>!c) || !draft.weft.length ||
      draft.weft.some(w=>!w.yarnId || !w.picks) || beams.some(b=>!b.ends || b.steps.some(w=>!w.yarnId || !w.repeat))) return
    let active=true
    const task=window.setTimeout(()=>{
      const input={...draft,code:draft.code||'PREVIEW',description:draft.description||'برآورد',
        responsible:draft.responsible||'برآورد',machine:draft.machine||'برآورد'}
      void api<Theory>('/analyses/preview','POST',input).then(value=>{if(active)setPreview(value)})
        .catch(e=>{if(active)setPreviewError(e.message)})
    },220)
    return ()=>{active=false;window.clearTimeout(task)}
  },[draft,config,widthError,capacityError,cycleError,colors,beams])
  const set=<K extends keyof AnalysisInput>(key:K,value:AnalysisInput[K])=>setDraft(d=>({...d,[key]:value}))
  function updateBeam(i:number,mutate:(beam:WarpBeam)=>WarpBeam) {set('beams',beams.map((b,j)=>i===j?mutate(b):b))}
  function setCount(count:number){
    const discarded=colors.slice(count).filter(Boolean)
    if(discarded.length && !window.confirm('رنگ‌های انتهایی و مراحل مرتبط از پیش‌نویس حذف شوند؟'))return
    setDraft(d=>({...d,weftColors:Array.from({length:count},(_,i)=>colors[i]??0),
      weft:d.weft.filter(w=>!discarded.includes(w.yarnId))}))
  }
  function setColor(index:number,id:number){
    setDraft(d=>{
      const options=d.weftColors!
      const previous=options[index]
      const updated=options.map((c,i)=>i===index?id:c)
      const steps=d.weft.some(w=>w.yarnId===previous)
        ?d.weft.map(w=>w.yarnId===previous?{...w,yarnId:id}:w)
        :[...d.weft,{...emptyPick,yarnId:id}]
      return {...d,weftColors:updated,weft:steps}
    })
  }
  function numeric(label:string,key:'version'|'reedCm'|'fabricCm'|'warpDensity'|'weftDensity'|'warpExtra'|'weftExtra'|'startPick',
    min=0,max=100000000,integer=false) {
    return <Field label={label}><Num value={draft[key]} onChange={v=>set(key,v??0)} min={min} max={max} integer={integer} blankZero={min>0}/></Field>
  }
  function yarnSelect(id:number,update:(id:number)=>void,exclude:number[]=[]){
    return <div className="inline-actions yarn-lookup"><select value={id||''} required aria-label="نخ و رنگ" onChange={e=>update(Number(e.target.value))}>
      <option value="">انتخاب نخ</option>{available.filter(y=>y.id===id||!exclude.includes(y.id)).map(y=><option value={y.id} key={y.id}>
        {yarnName(yarnRefs.find(r=>r.id===y.id))} · {y.input.count} {y.input.system} · {number(y.tex)} Tex</option>)}</select>
      <button type="button" className="small" onClick={()=>setNewYarn(()=>update)}>＋ نخ جدید</button></div>
  }
  function submit(){
    void action.run(async()=>{
      if(!config || widthError || capacityError || cycleError)throw new Error(widthError||capacityError||cycleError||'تنظیمات دستگاه در دسترس نیست.')
      const result=await api<{id:number}>(editing?'/analyses/'+editing.id:'/analyses',editing?'PUT':'POST',
        {...draft,rowVersion:editing?.rowVersion,reason})
      await onSave(result.id)
    })
  }
  function reorder<T>(rows:T[],i:number,offset:number){const copy=[...rows];[copy[i],copy[i+offset]]=[copy[i+offset],copy[i]];return copy}
  function arrows(index:number,length:number,move:(offset:number)=>void){return <div className="inline-actions nowrap">
    <button className="small" type="button" aria-label="بالا" disabled={index===0} onClick={()=>move(-1)}>↑</button>
    <button className="small" type="button" aria-label="پایین" disabled={index===length-1} onClick={()=>move(1)}>↓</button></div>}
  return <>
    <Message error={action.error||configError}/>
    <Section title={editing?'اصلاح پیش‌نویس':'تعریف آنالیز پارچه'}>
      <EntryForm id="analysis-form" onSave={submit} busy={action.busy} footer={<button type="button" onClick={onCancel}>انصراف</button>}>
        <div className="fields">
          <Field label="کد کالا"><input value={draft.code} dir="ltr" autoFocus required readOnly={!!editing} maxLength={80} onChange={e=>set('code',e.target.value)}/></Field>
          <Field label="شرح کالا"><TextInput value={draft.description} onChange={v=>set('description',v)}/></Field>
          {editing?<Field label="شماره نسخه"><input readOnly dir="ltr" value={draft.version}/></Field>:numeric('شماره نسخه','version',1,1000000,true)}
          <DateField label="تاریخ آنالیز" value={draft.date} onChange={v=>set('date',v)}/>
          <Field label="مسئول تولید"><TextInput value={draft.responsible} onChange={v=>set('responsible',v)}/></Field>
          <Field label="نوع دستگاه بافندگی"><TextInput value={draft.machine} onChange={v=>set('machine',v)}/></Field>
          <Field label="مبنای پارچه"><Select label="مبنای پارچه" value={draft.basis} options={fabricBases} onChange={v=>set('basis',v)}/></Field>
          {numeric('عرض شانه (cm)','reedCm',0.000001,2000)}
          <div>{numeric('عرض پارچه خام (cm)','fabricCm',0.000001,2000)}{widthError&&<small className="field-error" role="alert">{widthError}</small>}</div>
          <Field label="عرض مرجع تراکم تار (cm)" hint="اگر خالی باشد عرض شانه مبناست.">
            <Num value={draft.warpBasisCm} required={false} min={0.000001} max={2000} onChange={v=>set('warpBasisCm',v)}/></Field>
          {numeric('تراکم تار در هر cm','warpDensity',0.000001,2000)}
          {numeric('تراکم کل پود در هر cm','weftDensity',0.000001,2000)}
          {numeric('اضافه‌طول تار (%)','warpExtra',0,100)}
          {numeric('اضافه‌طول پود (%)','weftExtra',0,100)}
          <Notes value={draft.notes??''} onChange={v=>set('notes',v)}/>
        </div>
        <div className="subsection preview" aria-live="polite">
          <h3>برآورد خودکار مصرف</h3>
          {preview?<><p><strong>{number(preview.totalGPerM)} گرم نخ در هر متر</strong> · تار {number(preview.warpGPerM)} · پود {number(preview.weftGPerM)}</p>
            <p>تراکم حاصل {number(preview.warpDensityActual)} سرنخ در cm روی عرض مرجع {number(preview.warpReferenceCm)} cm · سرنخ ثبت‌شده {number(preview.totalEnds)} / سرنخ مورد انتظار {number(preview.expectedEnds)}</p>
            {preview.totalEnds!==preview.expectedEnds&&<p className="field-error">تعداد سرنخ با تراکم اعلام‌شده و عرض مرجع پس از گردکردن مغایرت دارد.</p>}
            {draft.basis==='Kilogram'&&<p>مصرف به ازای هر کیلوگرم با وزن خالص پارچهٔ سالم در آزمایش محاسبه می‌شود.</p>}
            <Table heads={['جهت / چله','نخ','گرم در متر']} >{preview.yarns.map(u=><tr key={u.axis+u.yarnId+(u.beam??'')}>
              <td>{u.beam?beamNames[u.beam]:u.axis==='Weft'?'پود':'تار'}</td><td>{yarnName(yarnRefs.find(y=>y.id===u.yarnId))}</td><td>{number(u.gramsPerMeter)}</td>
            </tr>)}</Table></> : <p className="muted">{previewError||'با تکمیل ساختار و اندازه‌ها، برآورد نمایش داده می‌شود.'}</p>}
        </div>
        <div className="subsection"><div className="section-label"><h3>چله و ترتیب تار</h3>
          <button type="button" disabled={!!editing&&initial.beams?.length===2} onClick={()=>{
            if(beams.length===1)set('beams',[{...beams[0],beam:'Upper'},makeBeam('Lower')])
            else if(window.confirm('چله پایین از این پیش‌نویس برداشته شود؟'))set('beams',[{...beams[0],beam:'Single'}])
          }}>{beams.length===1?'＋ افزودن چله پایین':'برداشتن چله پایین'}</button></div>
          {beams.map((b,i)=><div className="beam-panel" key={b.beam}>
            <div className="section-label"><h3>{beamNames[b.beam]}</h3><button type="button" onClick={()=>updateBeam(i,x=>({...x,steps:[...x.steps,{yarnId:0,repeat:1,extra:0}]}))}>＋ افزودن مرحله تار</button></div>
            <div className="short"><Field label={'سرنخ '+beamNames[b.beam]}><Num value={b.ends} integer min={1} max={4000000} blankZero onChange={v=>updateBeam(i,x=>({...x,ends:v??0}))}/></Field></div>
            <Table heads={['ترتیب','نخ و رنگ','تکرار سرنخ','اضافه‌طول گروه (%)','جابه‌جایی','']}>
              {b.steps.map((step,j)=>{
                const patch=(value:Partial<typeof step>)=>updateBeam(i,x=>({...x,steps:x.steps.map((row,k)=>k===j?{...row,...value}:row)}))
                return <tr key={j}><td>{j+1}</td><td>{yarnSelect(step.yarnId,id=>patch({yarnId:id}))}</td>
                  <td><Num label="تکرار سرنخ" value={step.repeat} integer min={1} max={4000000} onChange={v=>patch({repeat:v??0})}/></td>
                  <td><Num label="اضافه‌طول گروه" value={step.extra} max={100} onChange={v=>patch({extra:v??0})}/></td>
                  <td>{arrows(j,b.steps.length,offset=>updateBeam(i,x=>({...x,steps:reorder(x.steps,j,offset)})))}</td>
                  <td><button type="button" className="small" disabled={b.steps.length===1} onClick={()=>updateBeam(i,x=>({...x,steps:x.steps.filter((_,k)=>k!==j)}))}>برداشتن</button></td></tr>
              })}
            </Table>
          </div>)}
        </div>
        <div className="subsection"><h3>سیکل پودگذاری</h3>
          <Cycle input={draft} yarns={yarnRefs} limit={max}/>
          <div className="fields settings-row">
            <Field label="تعداد رنگ پود"><select value={colors.length} disabled={!max} aria-label="تعداد رنگ پود" onChange={e=>setCount(Number(e.target.value))}>
              {Array.from({length:Math.max(max??1,colors.length)},(_,i)=><option key={i+1} disabled={!!max&&i+1>max} value={i+1}>{i+1}</option>)}</select></Field>
            {numeric('پود آغاز سیکل','startPick',1,max??12,true)}
            {draft.weft.some(w=>w.measuredPickCm!=null)&&<Field label="منبع طول واقعی پود"><TextInput value={draft.weftLengthSource??''} onChange={v=>set('weftLengthSource',v)} maxLength={500}/></Field>}
          </div>
          {capacityError&&<p className="field-error" role="alert">{capacityError}</p>}
          {cycleError&&<p className="field-error" role="alert">{cycleError}</p>}
          <Table heads={['رنگ','نخ و رنگ']}>{colors.map((c,i)=><tr key={i}><td>{i+1}</td>
            <td>{yarnSelect(c,id=>setColor(i,id),colors.filter((_,j)=>j!==i))}</td></tr>)}</Table>
          <div className="section-label settings-row"><h3>مراحل مرتب پود</h3><span>{number(used)} / {number(max)} جایگاه</span>
            <button type="button" disabled={!max||used>=max||!colors.some(Boolean)} onClick={()=>set('weft',[...draft.weft,{...emptyPick,yarnId:colors.find(Boolean)!}])}>＋ افزودن مرحله پود</button>
          </div>
          <Table heads={['ترتیب','نخ و رنگ','تکرار متوالی','طول واقعی هر پود (cm)','جابه‌جایی','']} empty={!draft.weft.length}>
            {draft.weft.map((w,i)=>{
              const patch=(value:Partial<typeof w>)=>set('weft',draft.weft.map((row,j)=>j===i?{...row,...value}:row))
              return <tr key={i}><td>{i+1}</td><td><select aria-label="نخ مرحله پود" required value={w.yarnId||''} onChange={e=>patch({yarnId:Number(e.target.value)})}>
                <option value="">انتخاب نخ</option>{colors.filter(Boolean).map(id=><option key={id} value={id}>{yarnName(yarnRefs.find(y=>y.id===id))}</option>)}</select></td>
                <td><Num value={w.picks} integer min={1} max={max??12} label="تکرار متوالی پود" onChange={v=>patch({picks:v??0})}/></td>
                <td><Num value={w.measuredPickCm} required={false} min={0.000001} max={5000} label="طول واقعی هر پود" onChange={v=>patch({measuredPickCm:v})}/></td>
                <td>{arrows(i,draft.weft.length,offset=>set('weft',reorder(draft.weft,i,offset)))}</td>
                <td><button className="small" type="button" disabled={draft.weft.length===1} onClick={()=>set('weft',draft.weft.filter((_,j)=>j!==i))}>برداشتن</button></td></tr>
            })}
          </Table>
          <p className="muted">در آزمایش، حاصل تراکم کل × طول بر حسب cm به نزدیک‌ترین پود کامل گرد می‌شود. مقدار نیم به بالا گرد می‌شود.</p>
        </div>
        {editing&&<Field label="علت اصلاح"><TextInput value={reason} maxLength={1000} onChange={setReason}/></Field>}
      </EntryForm>
    </Section>
    {newYarn&&<YarnDialog onClose={()=>setNewYarn(undefined)} onSave={row=>{
      setCreated(items=>[row,...items]);newYarn(row.id);setNewYarn(undefined)
    }}/>}
  </>
}
