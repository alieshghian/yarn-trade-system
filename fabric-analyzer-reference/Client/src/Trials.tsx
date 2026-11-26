import { useState } from 'react'
import { api, axes, beamNames, isoDate, localTime, number, states, todayIso } from './model'
import type { Axis, Beam, Detail, FabricWeights, Trial, TrialInput, Weigh } from './model'
import { ResultView, TheoryView, yarnName } from './Calculations'
import { Badge, DateField, EntryForm, Field, Message, Notes, Num, Section, Table, TextInput, useAction } from './ui'

export type TrialMode = {kind:'prepare'|'complete'|'correct'|'direct'; from?:Trial}
const makeWeights=():FabricWeights=>({rollGrossG:null,rollTareG:null,sampleG:null,sampleInRoll:null,yarnWasteG:null,fabricWasteG:null,fabricWasteM:null})
const makeRow=(axis:Axis,yarnId:number,beam?:Beam|null):Weigh=>({axis,yarnId,beam,package:'',initialG:0,remainingG:null,gross:false,
  initialTareG:0,remainingTareG:0,wasteG:null,notes:''})
export function TrialEditor({detail,mode,onSaved,onCancel}:{detail:Detail;mode:TrialMode;onSaved:(id:number)=>Promise<void>;onCancel:()=>void}) {
  const preparation=mode.kind==='prepare'
  const refs=detail.yarns
  const uses=detail.theory.yarns
  const modern=!!detail.input.beams
  const [input,setInput]=useState<TrialInput>(()=>mode.from?{
    ...mode.from.input, date:mode.kind==='complete'?todayIso():mode.from.input.date, reason:'',
    weights:mode.from.input.weights??(modern?makeWeights():null),
    replacesId:mode.kind==='correct'?mode.from.id:undefined,
    preparationId:mode.kind==='complete'?mode.from.id:mode.from.input.preparationId ?? undefined,
    lengthM:mode.kind==='complete'?(modern?0:detail.input.sampleM):mode.from.input.lengthM,
    widthCm:mode.kind==='complete'?(modern?0:detail.input.fabricCm):mode.from.input.widthCm
  }:{
    number:'',date:todayIso(),machine:detail.input.machine,operator:detail.input.responsible,lengthM:modern?0:detail.input.sampleM,
    widthCm:modern?0:detail.input.fabricCm,clothG:0,weights:modern?makeWeights():null,lengthEstimated:false,startPick:detail.input.startPick,observedNextPick:null,notes:'',
    weighings:uses.map(u=>makeRow(u.axis,u.yarnId,u.beam))
  })
  const [initialCorrection,setInitialCorrection]=useState(false)
  const locked=mode.kind==='complete'&&!initialCorrection
  const action=useAction()
  const set=<K extends keyof TrialInput>(key:K,value:TrialInput[K])=>setInput(t=>({...t,[key]:value}))
  const labels={prepare:'ثبت توزین اولیه',complete:'تکمیل آزمایش پس از بافت',correct:'اصلاح مستند آزمایش',direct:'ثبت یکجای آزمایش'}
  function submit(){
    void action.run(async ()=>{
      const value=await api<{id:number}>(`/analyses/${detail.id}/${preparation?'preparations':'trials'}`,'POST',
        {...input,weights:preparation?null:input.weights,date:await isoDate(input.date),rowVersion:detail.rowVersion})
      await onSaved(value.id)
    })
  }
  return <Section title={labels[mode.kind]}>
    <Message error={action.error}/>
    <EntryForm onSave={submit} busy={action.busy} footer={<button type="button" onClick={onCancel}>انصراف</button>}>
      <div className="fields">
        <Field label="شماره آزمایش"><input autoFocus required maxLength={80} dir="ltr" value={input.number} readOnly={!!mode.from} onChange={e=>set('number',e.target.value)}/></Field>
        <DateField label={preparation?'تاریخ توزین اولیه':'تاریخ آزمایش'} value={input.date} onChange={v=>set('date',v)}/>
        <Field label="دستگاه"><TextInput value={input.machine} onChange={v=>set('machine',v)}/></Field>
        <Field label="اپراتور"><TextInput value={input.operator} onChange={v=>set('operator',v)}/></Field>
        {!preparation && <>
          <Field label="متراژ تولید (متر)"><Num value={input.lengthM} min={0.000001} max={10000} blankZero onChange={v=>set('lengthM',v??0)}/></Field>
          <div><Field label="عرض واقعی (cm)"><Num value={input.widthCm} min={0.000001} max={detail.input.reedCm} blankZero onChange={v=>set('widthCm',v??0)}/></Field>
            {input.widthCm>detail.input.reedCm&&<small className="field-error">عرض خام نمونه نباید از عرض شانه بیشتر باشد.</small>}</div>
          {detail.input.basis==='Kilogram'&&<label className="checkbox"><input type="checkbox" checked={!!input.lengthEstimated}
            onChange={e=>set('lengthEstimated',e.target.checked)}/> متراژ تقریبی است</label>}
          <Field label="وزن پارچه سالم (گرم)"><Num value={input.clothG} min={0.000001} blankZero onChange={v=>set('clothG',v??0)}/></Field>
        </>}
        <Field label="پود آغاز سیکل"><Num value={input.startPick} min={1} max={detail.theory.cyclePicks} integer onChange={v=>set('startPick',v??0)}/></Field>
        {!preparation && <Field label="پود بعد از پایان (مشاهده‌شده)" hint="شماره پودی که دستگاه در صورت ادامه می‌زند.">
          <Num value={input.observedNextPick} min={1} max={detail.theory.cyclePicks} integer required={false} onChange={v=>set('observedNextPick',v)}/></Field>}
        {(mode.kind==='correct'||initialCorrection) && <Field label="علت مستند اصلاح">
          <TextInput value={input.reason??''} maxLength={1000} onChange={v=>set('reason',v)}/></Field>}
        {!preparation && input.weights && <FabricWeightFields weights={input.weights} onChange={weights=>set('weights',weights)}/>}
        <Notes value={input.notes} onChange={v=>set('notes',v)}/>
      </div>
      <div className="subsection"><div className="section-label"><h3>وزن‌کشی بسته‌ها (گرم)</h3><div className="inline-actions">
        {mode.kind==='complete' && !initialCorrection && <button type="button" onClick={()=>setInitialCorrection(true)}>اصلاح توزین اولیه</button>}
        {!locked && <button type="button" onClick={()=>set('weighings',[...input.weighings,makeRow(uses[0].axis,uses[0].yarnId,uses[0].beam)])}>＋ افزودن بسته</button>}
      </div></div>
      <p className="muted">{preparation?'وزن ظرف هر بسته را در حالت ناخالص جداگانه وارد کنید.':
        modern?'ثبت ضایعات هر بسته اختیاری است. مجموع ضایعات نخ در بالای فرم الزامی است.':'برای ضایعات توزین‌شده صفر را صریح وارد کنید. خانه خالی یعنی ضایعات نامعلوم.'}</p>
      <Table heads={['نخ و جهت','شماره بسته','مبنای وزن','اولیه','ظرف اولیه',...(!preparation?['باقی‌مانده','ظرف باقی‌مانده','ضایعات']:[]),'یادداشت','']}>
        {input.weighings.map((w,i)=>{
          const patch=(value:Partial<Weigh>)=>set('weighings',input.weighings.map((row,j)=>j===i?{...row,...value}:row))
          return <tr key={i}><td>
            <select aria-label="نخ و جهت" disabled={locked} value={w.axis+':'+w.yarnId+':'+(w.beam??'')} onChange={e=>{
              const [axis,id,beam]=e.target.value.split(':');patch({axis:axis as Axis,yarnId:Number(id),beam:beam?beam as Beam:null})
            }}>{uses.map(u=><option key={u.axis+u.yarnId+(u.beam??'')} value={u.axis+':'+u.yarnId+':'+(u.beam??'')}>{u.beam?beamNames[u.beam]:axes[u.axis]} · {yarnName(refs.find(y=>y.id===u.yarnId))}</option>)}</select>
          </td><td><input required aria-label="شماره بسته" disabled={locked} maxLength={100} value={w.package} onChange={e=>patch({package:e.target.value})}/></td>
          <td><select aria-label="مبنای وزن" disabled={locked} value={w.gross?'gross':'net'} onChange={e=>patch(e.target.value==='gross'?{gross:true}:{gross:false,initialTareG:0,remainingTareG:0})}>
            <option value="net">خالص</option><option value="gross">ناخالص</option></select></td>
          <td><Num label="وزن اولیه" value={w.initialG} disabled={locked} blankZero min={0.000001} onChange={v=>patch({initialG:v??0})}/></td>
          <td><Num label="وزن ظرف اولیه" value={w.initialTareG} disabled={locked||!w.gross} onChange={v=>patch({initialTareG:v??0})}/></td>
          {!preparation && <>
            <td><Num label="وزن باقی‌مانده" value={w.remainingG} required={false} onChange={v=>patch({remainingG:v, ...(v===null?{wasteG:null,remainingTareG:0}:{})})}/></td>
            <td><Num label="وزن ظرف باقی‌مانده" value={w.remainingTareG} disabled={!w.gross||w.remainingG===null} onChange={v=>patch({remainingTareG:v??0})}/></td>
            <td><Num label="وزن ضایعات" value={w.wasteG} required={false} disabled={w.remainingG===null} onChange={v=>patch({wasteG:v})}/></td>
          </>}
          <td><input aria-label="یادداشت بسته" maxLength={200} value={w.notes??''} onChange={e=>patch({notes:e.target.value})}/></td>
          <td><button type="button" className="small" disabled={locked||input.weighings.length===1} onClick={()=>set('weighings',input.weighings.filter((_,j)=>j!==i))}>برداشتن</button></td></tr>
        })}
      </Table></div>
    </EntryForm>
  </Section>
}

function FabricWeightFields({weights,onChange}:{weights:FabricWeights;onChange:(value:FabricWeights)=>void}) {
  const fields = [
    ['وزن ناخالص رول (گرم)','rollGrossG'],['وزن مغزی و بسته‌بندی (گرم)','rollTareG'],
    ['وزن نمونه جداشده (گرم)','sampleG'],['ضایعات نخ (گرم)','yarnWasteG'],
    ['ضایعات پارچه (گرم)','fabricWasteG'],['متراژ ضایعات پارچه (متر)','fabricWasteM']
  ] as const
  return <>
    {fields.map(([label,id])=><Field key={id} label={label}><Num value={weights[id]} required={id!=='fabricWasteM'}
      min={id==='rollGrossG'?0.000001:0} onChange={v=>onChange({...weights,[id]:v})}/></Field>)}
    <Field label="شمول نمونه در وزن رول" hint="مبنای توزین را مشخص کنید. برای نبود نمونه، وزن آن را 0 وارد کنید.">
      <select aria-label="شمول نمونه در وزن رول" required value={weights.sampleInRoll==null?'':weights.sampleInRoll?'in':'out'}
        onChange={e=>onChange({...weights,sampleInRoll:e.target.value?e.target.value==='in':null})}>
        <option value="">انتخاب وضعیت</option><option value="in">نمونه در وزن رول حساب شده</option>
        <option value="out">نمونه خارج از وزن رول است</option>
      </select>
    </Field>
  </>
}

export function TrialHistory({detail,selected,select,onEdit,editable}:{detail:Detail;selected?:Trial;select:(id:number)=>void;
  onEdit:(mode:TrialMode)=>void;editable:boolean}) {
  return <>
    <Section title="سوابق توزین و آزمایش" aside={editable && <div className="inline-actions">
      <button className="new" onClick={()=>onEdit({kind:'prepare'})}>＋ توزین اولیه</button>
      <button onClick={()=>onEdit({kind:'direct'})}>ثبت یکجای آزمایش</button></div>}>
      <Table empty={!detail.trials.length} heads={['شماره آزمایش','مرحله','تاریخ','ثبت‌کننده','نتیجه','']}>
        {[...detail.trials].reverse().map(t=><tr key={t.id} className={selected?.id===t.id?'selected':''}>
          <td>{t.input.number}</td><td>{t.preparation?'توزین اولیه':t.replacesId?'اصلاح آزمایش':'آزمایش'}</td><td>{localTime(t.at)}</td><td>{t.user}</td>
          <td>{t.superseded?<Badge tone="Missing">{t.preparation?'تکمیل شده':'اصلاح شده'}</Badge>:
            t.result?<Badge tone={t.result.state}>{states[t.result.state]}</Badge>:<Badge tone="Ready">در انتظار بافت</Badge>}</td>
          <td><button className="small" onClick={()=>select(t.id)}>نمایش</button></td></tr>)}
      </Table>
    </Section>
    {selected && <>
      <Section title={`بسته‌های آزمایش ${selected.input.number}`} aside={editable && !selected.superseded &&
        <button onClick={()=>onEdit({kind:selected.preparation?'complete':'correct',from:selected})}>
          {selected.preparation?'ثبت وزن باقی‌مانده و تکمیل':'ثبت اصلاح'}</button>}>
        {selected.input.reason && <p>علت اصلاح {selected.input.reason}</p>}
        {selected.input.notes && <p>{selected.input.notes}</p>}
        <Table heads={['جهت','نخ و رنگ','شماره بسته','مبنای وزن','اولیه','ظرف اولیه','باقی‌مانده','ظرف باقی‌مانده','خالص مصرفی','ضایعات','یادداشت']}>
          {selected.input.weighings.map((w,i)=><tr key={i}><td>{w.beam?beamNames[w.beam]:axes[w.axis]}</td><td>{yarnName(detail.yarns.find(y=>y.id===w.yarnId))}</td><td>{w.package}</td>
            <td>{w.gross?'ناخالص':'خالص'}</td><td>{number(w.initialG)}</td><td>{number(w.initialTareG)}</td>
            <td>{number(w.remainingG)}</td><td>{number(w.remainingTareG)}</td><td>{number(selected.packageUse?.[i])}</td><td>{number(w.wasteG)}</td><td>{w.notes}</td></tr>)}
        </Table>
      </Section>
      {selected.result && <>
        <ResultView result={selected.result} yarns={detail.yarns} weights={selected.input.weights}/>
        <TheoryView theory={selected.result.theory} yarns={detail.yarns} title="مصرف تئوری بر اساس طول واقعی آزمایش"/>
      </>}
    </>}
  </>
}
