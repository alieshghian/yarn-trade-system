import { useEffect, useState } from 'react'
import { actions, api, localDate, localTime, makeAnalysis, number, statuses, todayIso } from './model'
import type { AnalysisInput, Detail, Summary, YarnRow } from './model'
import { AnalysisEditor } from './AnalysisEditor'
import { Specifications, TheoryView } from './Calculations'
import { TrialEditor, TrialHistory } from './Trials'
import type { TrialMode } from './Trials'
import { Badge, Field, Message, Section, Table, TextInput, useAction, useNew } from './ui'

export function AnalysisRows({rows,selected,onSelect,disabled=false,report=false}:
  {rows:Summary[];selected?:number;onSelect:(id:number)=>void;disabled?:boolean;report?:boolean}) {
  const [search,setSearch]=useState(''),[filter,setFilter]=useState(''),[sort,setSort]=useState<'date'|'code'|'version'>('date')
  const [asc,setAsc]=useState(false)
  const shown=rows.filter(r=>(!filter||r.status===filter) &&
    (r.code+' '+r.description).toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>{
      const difference=sort==='version'?a.version-b.version:String(a[sort]).localeCompare(String(b[sort]),'en',{numeric:true})
      return (difference || a.id-b.id)*(asc?1:-1)
    })
  function heading(label:string,field:typeof sort) {
    return <button className="sort" onClick={()=>{if(sort===field)setAsc(!asc);else{setSort(field);setAsc(true)}}}>{label} {sort===field?(asc?'↑':'↓'):''}</button>
  }
  return <Section title={report?'کالاهای تأییدشده':'سوابق آنالیز'} aside={<span className="muted">{number(shown.length)} رکورد</span>}>
    <div className="filters"><input placeholder="جست‌وجوی کد یا شرح کالا" aria-label="جست‌وجوی کالا" value={search} onChange={e=>setSearch(e.target.value)}/>
      {!report && <select aria-label="فیلتر وضعیت" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">همه وضعیت‌ها</option>
        {Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}</div>
    <Table empty={!shown.length} heads={[heading('کد کالا','code'),'شرح کالا',heading('نسخه','version'),heading('تاریخ','date'),'وضعیت','']}>
      {shown.map(r=><tr key={r.id} className={selected===r.id?'selected':''}><td dir="ltr">{r.code}</td><td>{r.description}</td>
        <td>{r.version}</td><td>{localDate(r.date)}</td><td><Badge tone={r.status}>{statuses[r.status]}</Badge></td>
        <td><button className="small" disabled={disabled} onClick={()=>onSelect(r.id)}>نمایش</button></td></tr>)}
    </Table>
  </Section>
}
type Edit = {initial:AnalysisInput;existing?:{id:number;rowVersion:string}}
export default function Analyses({manager}:{manager:boolean}) {
  const [rows,setRows]=useState<Summary[]>([]),[yarns,setYarns]=useState<YarnRow[]>([]),[detail,setDetail]=useState<Detail>()
  const [editing,setEditing]=useState<Edit>(),[trialMode,setTrialMode]=useState<TrialMode>(),[trialId,setTrialId]=useState<number>()
  const [approval,setApproval]=useState(false),[reason,setReason]=useState(''),[loadError,setLoadError]=useState('')
  const action=useAction()
  const editable=detail?.status==='Ready'||detail?.status==='Review'
  async function load(id:number,chosenTrial?:number){
    const result=await api<Detail>('/analyses/'+id)
    setDetail(result);setTrialId(chosenTrial??[...result.trials].reverse().find(t=>!t.superseded)?.id)
    setApproval(false);setReason('')
  }
  useEffect(()=>{
    let live=true
    void Promise.all([api<Summary[]>('/analyses'),api<YarnRow[]>('/yarns')]).then(async ([list,store])=>{
      if(!live)return
      setRows(list);setYarns(store)
      if(list[0]){
        const result=await api<Detail>('/analyses/'+list[0].id)
        if(live){setDetail(result);setTrialId([...result.trials].reverse().find(t=>!t.superseded)?.id)}
      }
    }).catch(e=>{if(live)setLoadError(e.message)})
    return ()=>{live=false}
  },[])
  async function refresh(id:number,chosenTrial?:number){
    const [next]=await Promise.all([api<Summary[]>('/analyses'),load(id,chosenTrial)])
    setRows(next)
  }
  function create(){setTrialMode(undefined);setApproval(false);setEditing({initial:makeAnalysis()})}
  useNew(create,!editing&&!trialMode&&!approval&&!action.busy)
  function copy(){
    if(!detail)return
    const max=Math.max(detail.input.version,...rows.filter(r=>r.code===detail.input.code).map(r=>r.version))
    setEditing({initial:{...detail.input,version:max+1,date:todayIso()}})
  }
  useEffect(()=>{
    const handler=(e:globalThis.KeyboardEvent)=>{
      if(e.key!=='F4'||e.ctrlKey||e.altKey||e.shiftKey||e.metaKey||editing||trialMode||approval||action.busy||!detail)return
      e.preventDefault();copy()
    }
    document.addEventListener('keydown',handler)
    return ()=>document.removeEventListener('keydown',handler)
  })
  function command(kind:'ready'|'approve'){
    if(!detail)return
    void action.run(async()=>{
      await api('/analyses/'+detail.id+'/'+kind,'POST',{rowVersion:detail.rowVersion,reason})
      await refresh(detail.id)
    },kind==='ready'?'نسخه آماده آزمایش است.':'نسخه تأیید و برای فروش فعال شد.')
  }
  const selected=detail?.trials.find(t=>t.id===trialId)
  return <>
    <div className="page-head"><div><h1>آنالیز پارچه</h1><p>تعریف ساختار، وزن‌کشی آزمایش و تأیید نسخه</p></div>
      {!editing&&!trialMode&&!approval&&<button className="new" onClick={create} disabled={action.busy}>＋ ایجاد آنالیز <kbd>Space</kbd></button>}</div>
    <Message error={action.error||loadError} success={action.success}/>
    {editing ? <AnalysisEditor initial={editing.initial} editing={editing.existing} yarns={yarns}
      onSave={async id=>{await refresh(id);setEditing(undefined)}} onCancel={()=>setEditing(undefined)}/> :
      detail && (trialMode ? <TrialEditor detail={detail} mode={trialMode} onCancel={()=>setTrialMode(undefined)}
        onSaved={async id=>{await refresh(detail.id,id);setTrialMode(undefined)}}/> : <>
        <Section title={`${detail.input.code} · ${detail.input.description} · نسخه ${detail.input.version}`}
          aside={<Badge tone={detail.status}>{statuses[detail.status]}</Badge>}>
          {detail.status!=='Approved'&&<p className="notice warning">{detail.status==='Obsolete'?'این نسخه از چرخه استفاده جاری خارج شده است.':'این نسخه هنوز برای قیمت‌گذاری نهایی تأیید نشده است.'}</p>}
          {detail.approved && <p>تأییدکننده {detail.approved.user} · {localTime(detail.approved.at)} {detail.approved.reason && ' · '+detail.approved.reason}</p>}
          <div className="inline-actions">
            <button disabled={action.busy||approval} onClick={copy}>ایجاد نسخه جدید از این آنالیز <kbd>F4</kbd></button>
            {detail.status==='Draft' && <>
              <button disabled={action.busy} onClick={()=>setEditing({initial:detail.input,existing:{id:detail.id,rowVersion:detail.rowVersion}})}>ویرایش پیش‌نویس</button>
              <button className="save" disabled={action.busy} onClick={()=>command('ready')}>آماده آزمایش</button>
            </>}
            {manager&&editable&&!approval&&<button className="save" disabled={action.busy} onClick={()=>setApproval(true)}>بررسی و تأیید</button>}
          </div>
          {approval && <div className="approval-form">
            <Field label="علت مستند تأیید مدیر" hint="برای نتیجه خارج از تلورانس یا اختلاف بالاتر از 5٪، علت بررسی الزامی است.">
              <TextInput value={reason} required={false} maxLength={1000} onChange={setReason}/>
            </Field>
            <div className="inline-actions"><button className="save" disabled={action.busy} onClick={()=>command('approve')}>ثبت تأیید</button>
              <button disabled={action.busy} onClick={()=>{setApproval(false);setReason('')}}>انصراف</button></div>
          </div>}
        </Section>
        <AnalysisRows rows={rows} selected={detail.id} disabled={action.busy||approval}
          onSelect={id=>void action.run(()=>load(id))}/>
        <TrialHistory detail={detail} selected={selected} select={setTrialId} editable={editable&&!approval&&!action.busy} onEdit={setTrialMode}/>
        <Specifications input={detail.input} yarns={detail.yarns}/>
        <TheoryView theory={detail.theory} yarns={detail.yarns}/>
        <details className="panel audit"><summary>تاریخچه نسخه</summary>
          <Table heads={['رویداد','کاربر','زمان','علت','اطلاعات قبلی']}>
            {[...detail.audit].reverse().map(h=><tr key={h.id}><td>{actions[h.action]??h.action}</td><td>{h.user}</td>
              <td>{localTime(h.at)}</td><td>{h.reason||'—'}</td><td>{h.previous?<details><summary>مشاهده</summary>
                <Specifications input={h.previous} yarns={yarns.map(y=>({id:y.id,name:y.input.name,color:y.input.color,tex:y.tex}))}/>
              </details>:'—'}</td></tr>)}
          </Table>
        </details>
      </>)}
    {!detail&&!editing&&<AnalysisRows rows={rows} disabled={action.busy} onSelect={id=>void action.run(()=>load(id))}/>}
  </>
}
