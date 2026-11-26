import { axes, beamNames, checks, fabricBases, localDate, number, signed, states } from './model'
import type { AnalysisInput, FabricWeights, Theory, TrialResult, YarnRef } from './model'
import { Badge, Section, Table } from './ui'

export const yarnName = (y:YarnRef|undefined) => y ? `${y.name} · ${y.color}` : 'نخ ثبت‌نشده'
export function Cycle({input,yarns,limit}:{input:AnalysisInput;yarns:YarnRef[];limit?:number}) {
  const total=input.weft.reduce((sum,w)=>sum+w.picks,0)
  if (!total || total>500) return null
  const items=input.weft.flatMap(step=>Array.from({length:Math.floor(step.picks)},()=>step.yarnId))
  if (!items.length) return null
  const colors=[...new Set(items)]
  return <div className="cycle-wrap"><div className="section-label"><strong>ترتیب پودگذاری</strong><span>{number(colors.filter(Boolean).length)} رنگ · {number(items.length)} پود در سیکل{limit?' / '+limit+' جایگاه':''}</span></div>
    <div className="cycle" aria-label="نمای شماره‌گذاری‌شده سیکل">
      {items.map((id,i)=><span key={i} style={{backgroundColor:'hsl('+((colors.indexOf(id)*137)%360)+' 58% 90%)'}} className={i+1===input.startPick?'start':''}
        title={yarnName(yarns.find(y=>y.id===id))}><b>{i+1}</b><span>{yarnName(yarns.find(y=>y.id===id))}</span></span>)}
    </div></div>
}
export function Metrics({items}:{items:[string,string|number|null,string?][]}) {
  return <div className="metrics">{items.map(([label,value,unit])=><div className="metric" key={label}>
    <span>{label}</span><strong>{typeof value==='string'?value:number(value,3)}</strong>{unit && <small>{unit}</small>}
  </div>)}</div>
}
export function TheoryView({theory,yarns,title='مصرف تئوری'}:{theory:Theory;yarns:YarnRef[];title?:string}) {
  return <Section title={title} aside={<span className="muted">مبنای رول {number(theory.lengthM)} متر</span>}>
    {theory.estimatedWarp && <p className="notice warning">تعداد سرنخ یا عرض مبنای چله‌کشی تخمینی است. برای تأیید، مقدار دقیق لازم است.</p>}
    <Metrics items={[
      ['تار در متر',theory.warpGPerM,'گرم'],['پود در متر',theory.weftGPerM,'گرم'],['مجموع در متر',theory.totalGPerM,'گرم'],
      ['تخمین مصرف نخ در طول مبنا',theory.totalG,'گرم']
    ]}/>
    <p className="muted">سرنخ {number(theory.totalEnds)} از مبنای {number(theory.expectedEnds)} · تعداد پود رول {number(theory.totalPicks)} · شروع {theory.startPick} · پود بعد از پایان {theory.nextPick}</p>
    <Table heads={['جهت','نخ / رنگ','سرنخ','پود در سیکل','سهم سیکل','پود در سانتی‌متر (میانگین)','پود در 1 متر','پود در رول','طول نخ (متر)','رول (گرم)','در 1 متر (گرم)','سهم وزنی']}>
      {theory.yarns.map(u=><tr key={u.axis+u.yarnId+(u.beam??'')}><td>{u.beam?beamNames[u.beam]:axes[u.axis]}</td><td>{yarnName(yarns.find(y=>y.id===u.yarnId))}</td>
        <td>{number(u.ends)}</td><td>{u.axis==='Weft'?number(u.cyclePicks):'—'}</td><td>{u.sharePercent==null?'—':number(u.sharePercent)+'%'}</td>
        <td>{number(u.picksPerCm)}</td><td>{number(u.picksInOneMeter)}</td><td>{number(u.picks)}</td><td>{number(u.meters)}</td>
        <td>{number(u.grams)}</td><td>{number(u.gramsPerMeter)}</td><td>{number(u.weightSharePercent)}%</td></tr>)}
    </Table>
    {!!theory.warpGroups?.length && <details className="subsection">
      <summary>مصرف هر گروه تار</summary>
      <Table heads={['گروه','نخ / رنگ','سرنخ','مبنای سرنخ','طول نخ (متر)','وزن در 1 متر (گرم)']}>
        {theory.warpGroups.map(g=><tr key={g.position}><td>{g.position}{g.beam&&' · '+beamNames[g.beam]}</td><td>{yarnName(yarns.find(y=>y.id===g.yarnId))}</td>
          <td>{number(g.ends)}</td><td>{g.estimated?'تخمینی':'ثبت‌شده'}</td><td>{number(g.meters)}</td><td>{number(g.gramsPerMeter)}</td></tr>)}
      </Table>
    </details>}
  </Section>
}
export function ResultView({result,yarns,weights}:{result:TrialResult;yarns:YarnRef[];weights?:FabricWeights|null}) {
  const unit=result.theory.basis==='Kilogram'?'گرم / کیلوگرم':'گرم / متر'
  return <Section title="نتیجه کنترل آزمایش" aside={<Badge tone={result.lengthEstimated&&result.state==='Pass'?'Review':result.state}>{result.lengthEstimated&&result.state==='Pass'?'نیازمند بررسی طول تقریبی':states[result.state]}</Badge>}>
    <Metrics items={[['مصرف واقعی نخ',result.consumedG,'گرم'],['وزن پارچه سالم',result.clothG,'گرم'],
      ['ضایعات توزین‌شده',result.wasteG,'گرم'],['مانده تراز',result.balanceG,'گرم'],['مصرف واقعی در واحد مبنا',result.actualRate??null,unit]]}/>
    {result.lengthEstimated&&<p className="notice warning">متراژ تقریبی است. مقایسه‌های وابسته به طول برای بررسی مدیر نمایش داده می‌شوند.</p>}
    {result.actualGsm!=null&&<p>وزن سطحی واقعی پارچه خام {number(result.actualGsm)} گرم / مترمربع</p>}
    {weights&&<Metrics items={[["رول ناخالص",weights.rollGrossG,'گرم'],["مغزی و بسته‌بندی",weights.rollTareG,'گرم'],["نمونه جداشده",weights.sampleG,'گرم'],["ضایعات نخ",weights.yarnWasteG,'گرم'],["ضایعات پارچه",weights.fabricWasteG,'گرم']]}/>}
    {weights&&<p className="muted">{weights.sampleInRoll?'نمونه در وزن رول منظور شده است.':'نمونه خارج از وزن رول توزین شده است.'}{weights.fabricWasteM!=null&&' · متراژ ضایعات پارچه '+number(weights.fabricWasteM)+' متر'}</p>}
    {!!result.rates?.length&&<Table heads={['جهت / چله','نخ','برآورد ('+unit+')','واقعی ('+unit+')']}>
      {result.rates.map(r=><tr key={r.axis+r.yarnId+(r.beam??'')}><td>{r.beam?beamNames[r.beam]:axes[r.axis]}</td>
        <td>{yarnName(yarns.find(y=>y.id===r.yarnId))}</td><td>{number(r.estimate)}</td><td>{number(r.actual)}</td></tr>)}
    </Table>}
    <p className="muted">تلورانس {number(result.tolerance)}٪ · اختلاف درصدی = 100 × (واقعی − تئوری) ÷ تئوری</p>
    <Table heads={['کنترل','جهت','نخ','مبنای کنترل','واقعی','اختلاف','نتیجه']}>
      {result.checks.map((c,i)=><tr key={i}><td>{checks[c.check] ?? c.check}</td><td>{c.beam?beamNames[c.beam]:c.axis?axes[c.axis]:'—'}</td>
        <td>{c.yarnId?yarnName(yarns.find(y=>y.id===c.yarnId)):'—'}</td>
        <td>{number(c.expected)}</td><td>{number(c.actual)}</td><td dir="ltr">{signed(c.difference)}</td>
        <td><Badge tone={c.state}>{c.advisory?'برآورد با طول تقریبی':states[c.state]}</Badge></td></tr>)}
    </Table>
  </Section>
}
export function Specifications({input,yarns}:{input:AnalysisInput;yarns:YarnRef[]}) {
  return <Section title="مشخصات پارچه و سیکل">
    <dl className="specs">
      {([
        ['مبنای پارچه',fabricBases[input.basis??'Meter']],['ظرفیت ثبت‌شده پود',input.settings?.maxWeftCycleSlots??null],['تاریخ آنالیز',localDate(input.date)],['مسئول تولید',input.responsible],['دستگاه',input.machine],
        ['عرض شانه (cm)',input.reedCm],['عرض پارچه خام (cm)',input.fabricCm],['عرض مبنای چله (cm)',input.warpBasisCm],
        ['تراکم تار (در cm)',input.warpDensity],['تراکم پود (در cm)',input.weftDensity],
        ['اضافه‌مصرف تار (%)',input.warpExtra],['اضافه‌مصرف پود (%)',input.weftExtra]
      ] as [string,string|number|null][]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{typeof value==='string'?value:number(value)}</dd></div>)}
    </dl>
    {input.notes && <p>{input.notes}</p>}
    <Cycle input={input} yarns={yarns} limit={input.settings?.maxWeftCycleSlots}/>
    {input.beams?.map(b=><div className="settings-row" key={b.beam}><strong>{beamNames[b.beam]} · {number(b.ends)} سرنخ</strong><div className="cycle">{b.steps.map((s,i)=><span key={i}>{yarnName(yarns.find(y=>y.id===s.yarnId))} × {s.repeat}</span>)}</div></div>)}
  </Section>
}
