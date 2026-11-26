import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api, localDate, localTime, roles, states } from './model'
import type { Account, Configuration, Report, Role, Session, Summary } from './model'
import { Badge, EntryForm, Field, Message, Num, Section, Select, Table, TextInput, useAction } from './ui'
import Analyses, { AnalysisRows } from './Analyses'
import Yarns from './Yarns'
import { ResultView, Specifications, TheoryView } from './Calculations'
import './style.css'

function Mark(){return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 5.5h16M4 12h16M4 18.5h16M6 3v18M12 3v18M18 3v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  <path d="M6 5.5h6M12 12h6M6 18.5h6" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/>
</svg>}
function Login({session,reload}:{session:Session;reload:()=>Promise<void>}) {
  const [user,setUser]=useState(''),[password,setPassword]=useState('')
  const action=useAction()
  function sign(role?:Role){void action.run(async()=>{
    await api(role?'/dev/'+role:'/login','POST',role?undefined:{user,password});await reload()
  })}
  return <main className="login">
    <Section title="ورود به Fabric Analyzer">
      <Message error={action.error}/>
      {session.sample?<><p className="notice warning">محیط نمونه با پایگاه داده جداگانه</p>
        <div className="quick-roles">{(Object.keys(roles) as Role[]).map(role=><button key={role} disabled={action.busy} onClick={()=>sign(role)}>
          ورود آزمایشی · {roles[role]}</button>)}</div></>:<EntryForm onSave={()=>sign()} busy={action.busy} saveLabel="ورود">
        <div className="login-fields"><Field label="نام کاربری"><TextInput value={user} onChange={setUser} dir="ltr" maxLength={80}/></Field>
          <Field label="رمز عبور"><TextInput value={password} onChange={setPassword} dir="ltr" type="password"/></Field></div>
      </EntryForm>}
    </Section>
  </main>
}
function Reports() {
  const [rows,setRows]=useState<Summary[]>([]),[report,setReport]=useState<Report>(),[trialId,setTrialId]=useState<number>()
  const action=useAction()
  function choose(result:Report){setReport(result);setTrialId(result.trials.at(-1)?.id)}
  useEffect(()=>{
    void action.run(async()=>{
      const list=await api<Summary[]>('/reports');setRows(list)
      if(list[0])choose(await api<Report>('/reports/'+list[0].id))
    })
  },[])
  const trial=report?.trials.find(t=>t.id===trialId)
  return <>
    <div className="page-head"><div><h1>گزارش مصرف نخ</h1><p>نسخه فعال کالا برای فروش و قیمت‌گذاری</p></div>
      {report&&<button onClick={()=>window.print()}>چاپ گزارش</button>}</div>
    <Message error={action.error}/>
    <div className="no-print"><AnalysisRows rows={rows} selected={report?.id} disabled={action.busy} report
      onSelect={id=>void action.run(async()=>choose(await api<Report>('/reports/'+id)))}/></div>
    {report && <>
      <Section title={`${report.input.code} · ${report.input.description} · نسخه ${report.input.version}`}
        aside={<Badge tone="Approved">تأییدشده و فعال</Badge>}>
        <p>تأییدکننده {report.approved.user} · {localTime(report.approved.at)}</p>
        {report.approved.reason&&<p>علت مستند تأیید {report.approved.reason}</p>}
        <div className="report-trial"><label htmlFor="report-trial">آزمایش مبنای گزارش</label>
          <select id="report-trial" value={trialId??''} onChange={e=>setTrialId(Number(e.target.value))}>
            {report.trials.map(t=><option key={t.id} value={t.id}>{t.number} · {localDate(t.date)} · {states[t.result.state]}</option>)}</select>
        </div>
      </Section>
      <Specifications input={report.input} yarns={report.yarns}/>
      {trial && <><TheoryView theory={trial.result.theory} yarns={report.yarns} title="مصرف تئوری در طول واقعی"/>
        <ResultView result={trial.result} yarns={report.yarns} weights={trial.weights}/></>}
    </>}
  </>
}
const freshAccount = () => ({id:0,user:'',name:'',role:'Production' as Role,enabled:true,password:''})
function UserEditor({initial,onSaved,onCancel}:{initial:ReturnType<typeof freshAccount>;onSaved:()=>Promise<void>;onCancel:()=>void}) {
  const [edit,setEdit]=useState(initial)
  const action=useAction()
  return <Section title={edit.id?'ویرایش کاربر':'کاربر جدید'}>
    <Message error={action.error}/>
    <EntryForm onSave={()=>void action.run(async()=>{
      await api(edit.id?'/users/'+edit.id:'/users',edit.id?'PUT':'POST',edit);await onSaved()
    })} busy={action.busy} footer={<button type="button" onClick={onCancel}>انصراف</button>}>
      <div className="fields">
        <Field label="نام کاربری"><input value={edit.user} required readOnly={!!edit.id} dir="ltr" onChange={e=>setEdit({...edit,user:e.target.value})}/></Field>
        <Field label="نام نمایشی"><TextInput value={edit.name} onChange={name=>setEdit({...edit,name})}/></Field>
        <Field label="نقش"><Select options={roles} value={edit.role} onChange={role=>setEdit({...edit,role})}/></Field>
        <Field label="رمز عبور" hint="حداقل 12 نویسه. در ویرایش، خالی یعنی حفظ رمز فعلی.">
          <input type="password" dir="ltr" autoComplete="new-password" value={edit.password} onChange={e=>setEdit({...edit,password:e.target.value})}
            required={!edit.id} minLength={12} maxLength={200}/></Field>
        <label className="checkbox"><input type="checkbox" checked={edit.enabled} onChange={e=>setEdit({...edit,enabled:e.target.checked})}/> حساب فعال</label>
      </div>
    </EntryForm>
  </Section>
}
function Admin() {
  const [tolerance,setTolerance]=useState(5),[users,setUsers]=useState<Account[]>([]),[edit,setEdit]=useState<ReturnType<typeof freshAccount>>()
  const [ready,setReady]=useState(false)
  const [slots,setSlots]=useState<number|null>(null),[settingReason,setSettingReason]=useState('')
  const [revisions,setRevisions]=useState<(Configuration&{id:number;user:string;at:string;reason:string})[]>([])
  const action=useAction()
  useEffect(()=>{void action.run(async()=>{
    const [s,rows,history]=await Promise.all([api<Configuration>('/settings'),api<Account[]>('/users'),api<typeof revisions>('/settings/history')])
    setTolerance(s.tolerance);setSlots(s.maxWeftCycleSlots);setRevisions(history);setUsers(rows);setReady(true)
  })},[])
  return <>
    <div className="page-head"><div><h1>تنظیمات و کاربران</h1><p>تلورانس مصوب و دسترسی نقش‌ها</p></div>
      {!edit&&<button className="new" onClick={()=>setEdit(freshAccount())}>＋ ایجاد کاربر</button>}</div>
    <Message error={action.error} success={action.success}/>
    {edit ? <UserEditor initial={edit} onCancel={()=>setEdit(undefined)} onSaved={async()=>{
      setUsers(await api<Account[]>('/users'));setEdit(undefined)
    }}/> : <Section title="ظرفیت دستگاه و تلورانس اعتبارسنجی">
      <EntryForm onSave={()=>void action.run(async()=>{await api('/settings','PUT',{tolerance,maxWeftCycleSlots:slots,reason:settingReason});setSettingReason('');setRevisions(await api<typeof revisions>('/settings/history'))},'تنظیمات ذخیره شد.')}
        busy={action.busy||!ready}>
        <div className="fields"><Field label="تلورانس مصرف و تراز (%)"><Num value={tolerance} onChange={v=>setTolerance(v??0)} max={100}/></Field>
          <Field label="ظرفیت جایگاه پود"><Num value={slots} integer min={1} max={12} onChange={setSlots}/></Field>
          <Field label="علت تغییر تنظیمات"><TextInput value={settingReason} onChange={setSettingReason} required={false}/></Field></div>
      </EntryForm></Section>}
    <Section title="تاریخچه تنظیمات">
      <Table empty={!revisions.length} heads={['نسخه','زمان اثر','ظرفیت پود','تلورانس','کاربر','علت']}>
        {revisions.map(r=><tr key={r.id}><td>{r.id}</td><td>{localTime(r.at)}</td><td>{r.maxWeftCycleSlots}</td><td>{r.tolerance}%</td><td>{r.user}</td><td>{r.reason}</td></tr>)}
      </Table>
    </Section>
    <Section title="کاربران">
      <Table empty={!users.length} heads={['نام کاربری','نام','نقش','وضعیت','']}>
        {users.map(u=><tr key={u.id}><td dir="ltr">{u.user}</td><td>{u.name}</td><td>{roles[u.role]}</td><td>{u.enabled?'فعال':'غیرفعال'}</td>
          <td><button className="small" disabled={!!edit} onClick={()=>setEdit({...u,password:''})}>ویرایش</button></td></tr>)}
      </Table>
    </Section>
  </>
}

const navigation = [
  {id:'analyses',label:'آنالیز پارچه',icon:'▤',roles:['Production','Manager']},
  {id:'yarns',label:'تعریف نخ',icon:'≋',roles:['Production','Manager']},
  {id:'reports',label:'گزارش مصرف',icon:'▥',roles:['Production','Manager','Sales','Pricing']},
  {id:'admin',label:'تنظیمات و کاربران',icon:'⚙',roles:['Administrator']}
]
function App(){
  const [session,setSession]=useState<Session>(),[path,setPath]=useState(window.location.hash.slice(1)),[error,setError]=useState('')
  async function reload(){setSession(await api<Session>('/session'))}
  useEffect(()=>{void reload().catch(e=>setError(e.message))},[])
  useEffect(()=>{
    const handler=()=>setPath(window.location.hash.slice(1))
    window.addEventListener('hashchange',handler)
    return ()=>window.removeEventListener('hashchange',handler)
  },[])
  const menu=navigation.filter(tab=>session?.role && tab.roles.includes(session.role))
  const page=menu.find(tab=>tab.id===path)??menu[0]
  return <>
    <header className="topbar">
      <div className="brand"><span className="mark"><Mark/></span><div><b dir="ltr">Fabric Analyzer</b><span>آنالیز فنی پارچه</span></div></div>
      <div className="top-actions">
        {session?.sample&&<Badge tone="Sample">دادهٔ نمونه</Badge>}
        {session?.role&&<><div className="identity"><b>{roles[session.role]}</b><small>{session.name||session.user}</small></div>
          <button onClick={()=>void api('/logout','POST').then(reload).catch(e=>setError(e.message))}>خروج</button></>}
      </div>
    </header>
    <Message error={error}/>
    {!session ? <main className="login">{!error && <p>در حال اتصال به برنامه…</p>}</main> :
      !session.user||!page ? <Login session={session} reload={reload}/> :
      <div className="workspace">
        <aside className="sidebar"><p>منوی کار</p><nav aria-label="صفحه‌های برنامه">
          {menu.map(tab=><a key={tab.id} href={'#'+tab.id} aria-current={page.id===tab.id?'page':undefined}><span aria-hidden="true">{tab.icon}</span>{tab.label}</a>)}
        </nav><div className="shortcuts"><span><kbd>F3</kbd> ذخیره فرم</span><span><kbd>Enter</kbd> فیلد بعدی</span><span><kbd>Space</kbd> رکورد جدید</span></div></aside>
        <main className="content" key={session.user+'-'+page.id}>
          {page.id==='analyses'?<Analyses manager={session.role==='Manager'}/>:page.id==='yarns'?<Yarns/>:page.id==='reports'?<Reports/>:<Admin/>}
        </main>
      </div>}
  </>
}
createRoot(document.getElementById('root')!).render(<App/>)
