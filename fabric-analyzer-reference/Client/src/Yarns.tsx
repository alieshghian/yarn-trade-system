import { useEffect, useState } from 'react'
import { api, bases, kinds, localDate, makeYarn, number } from './model'
import type { YarnInput, YarnRow } from './model'
import { EntryForm, Message, Section, useAction, useNew, Table } from './ui'
import { YarnFields, yarnPayload } from './YarnFields'

export default function Yarns() {
  const [rows,setRows]=useState<YarnRow[]>([]),[form,setForm]=useState<YarnInput>(),[current,setCurrent]=useState<YarnRow>()
  const [term,setTerm]=useState(''),[filter,setFilter]=useState(''),[ascending,setAscending]=useState(false)
  const [tex,setTex]=useState<number>(),[loadError,setLoadError]=useState('')
  const action=useAction()
  useEffect(()=>{void api<YarnRow[]>('/yarns').then(list=>{setRows(list);setCurrent(list[0])}).catch(e=>setLoadError(e.message))},[])
  const watch = (list:YarnRow[])=>list.filter(y=>(!filter||y.input.kind===filter) &&
    [y.input.name,y.input.color,y.id].some(x=>String(x).toLowerCase().includes(term.trim().toLowerCase())))
    .sort((a,b)=>ascending?a.id-b.id:b.id-a.id)
  function create(){setForm(makeYarn());setTex(undefined)}
  useNew(create,!form&&!action.busy)
  function submit(preview=false){
    if(!form) return
    void action.run(async ()=>{
      const payload=yarnPayload(form)
      const saved=await api<{id:number;tex:number}>(preview?'/yarns/tex':'/yarns','POST',payload)
      if(preview){setTex(saved.tex);return}
      const list=await api<YarnRow[]>('/yarns')
      setRows(list);setCurrent(list.find(y=>y.id===saved.id));setForm(undefined)
    },preview?'':'نخ ذخیره شد.')
  }
  return <>
    <div className="page-head"><div><h1>تعریف نخ</h1><p>نمره، رنگ و وزن خطی نخ‌های مصرفی</p></div>
      {!form && <button className="new" onClick={create}>＋ ایجاد نخ <kbd>Space</kbd></button>}</div>
    <Message error={action.error||loadError} success={action.success}/>
    {form ? <Section title="نخ جدید">
      <EntryForm id="yarn-form" onSave={()=>submit()} busy={action.busy} footer={<>
        <button type="button" onClick={()=>{if((document.getElementById('yarn-form') as HTMLFormElement).reportValidity())submit(true)}}>محاسبه Tex</button>
        <button type="button" onClick={()=>setForm(undefined)}>انصراف</button></>}>
        <YarnFields draft={form} onChange={v=>{setForm(v);setTex(undefined)}}/>
        {tex!==undefined && <p className="notice success">وزن خطی {number(tex,6)} Tex</p>}
      </EntryForm>
    </Section> : current && <Section title={current.input.name} aside={<strong dir="ltr">{number(current.tex,6)} Tex</strong>}>
      <dl className="specs"><div><dt>کد و جنس نخ</dt><dd>{current.input.code || "—"} · {current.input.material || "—"}</dd></div><div><dt>رنگ</dt><dd>{current.input.color}</dd></div><div><dt>نوع</dt><dd>{kinds[current.input.kind]}</dd></div>
        <div><dt>نمره و سیستم</dt><dd>{current.input.count} {current.input.system}</dd></div>
        <div><dt>تعداد لا و مبنا</dt><dd>{current.input.plies} · {current.input.basis && bases[current.input.basis]}</dd></div>
        <div><dt>منبع Tex</dt><dd>{current.input.useMeasured ? current.input.measureSource : 'تبدیل نمره'}</dd></div>
      </dl>{current.input.notes && <p>{current.input.notes}</p>}</Section>}
    <Section title="سوابق نخ" aside={<span className="muted">{number(rows.length)} رکورد</span>}>
      <div className="filters"><input placeholder="جست‌وجوی نام، رنگ یا شناسه" aria-label="جست‌وجوی نخ" value={term} onChange={e=>setTerm(e.target.value)}/>
        <select aria-label="فیلتر نوع نخ" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="">همه نوع‌ها</option>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></div>
      <Table empty={!watch(rows).length} heads={[<button type="button" className="sort" onClick={()=>setAscending(!ascending)}>شناسه {ascending?'↑':'↓'}</button>,'نخ','نوع','رنگ','سیستم','Tex','تاریخ','']}>
        {watch(rows).map(y=><tr key={y.id} className={!form&&y.id===current?.id?'selected':''}><td>{y.id}</td><td>{y.input.name}</td>
          <td>{kinds[y.input.kind]}</td><td>{y.input.color}</td><td>{y.input.system}</td><td>{number(y.tex,6)}</td><td>{localDate(y.createdAt)}</td>
          <td><button className="small" disabled={!!form} onClick={()=>setCurrent(y)}>نمایش</button></td></tr>)}
      </Table>
    </Section>
  </>
}
