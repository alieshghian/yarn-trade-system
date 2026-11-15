import { useRef, useState, type ReactNode } from 'react'
import { ContainerLoadPreview, type DemoContainer } from './ContainerLoadPreview'
import type { DemoGridSettings } from './LaboratoryEntryGrid'
import './invoiceDetailsTabs.css'

type DetailsDemo=DemoGridSettings & {containers?:DemoContainer[]}

export function InvoiceDetailsTabs({ tabs, renderContent }: {
  tabs: {id:string;title:string}[]; renderContent:(id:string)=>ReactNode
}) {
  const [active,setActive]=useState<string|null>(null)
  const triggers=useRef<Record<string,HTMLButtonElement|null>>({})
  const selected=tabs.find(tab=>tab.id===active)
  const close=()=>{setActive(null);if(active)triggers.current[active]?.focus({preventScroll:true})}
  return <div className="invoice-details-tabs" dir="rtl">
    <div role="tablist" aria-label="جزئیات فاکتور" className="invoice-details-tabbar">
      {tabs.map((tab,index)=><button key={tab.id} ref={node=>{triggers.current[tab.id]=node}} type="button" role="tab" id={'details-tab-'+tab.id} aria-selected={active===tab.id} aria-controls={'details-panel-'+tab.id} onClick={()=>setActive(tab.id)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;setActive(tabs[next].id);triggers.current[tabs[next].id]?.focus()}}>{tab.title}</button>)}
    </div>
    {selected&&<section className="invoice-details-overlay" role="dialog" aria-modal="false" aria-labelledby={'details-tab-'+selected.id} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();close()}}}>
      <header><strong>{selected.title}</strong><button type="button" onClick={close} aria-label="بستن جزئیات">× بستن</button></header>
      <div className="invoice-details-content" role="tabpanel" id={'details-panel-'+selected.id} aria-labelledby={'details-tab-'+selected.id}>{renderContent(selected.id)}</div>
    </section>}
  </div>
}

export function InvoiceContainerDetails({demo,onChange,language,readOnly=false}:{demo:DetailsDemo;onChange:(value:DetailsDemo)=>void;language:'fa'|'en'|'zh';readOnly?:boolean}) {
  const containers=demo.containers??[{number:'CNU 482193-4',type:'40HC' as const,capacity:68,priorCbm:31.2}]
  const numbers=[...new Set([...containers.map(item=>item.number),...demo.rows.map(row=>String(row.containerNumber??'')).filter(Boolean)])]
  const [selection,setSelection]=useState('')
  const number=numbers.includes(selection)?selection:numbers[0]
  if(!number)return <p>هنوز کانتینری انتخاب نشده است.</p>
  const container:DemoContainer=containers.find(item=>item.number===number)??{number,type:'40HC',capacity:68}
  const currentCbm=demo.rows.filter(row=>row.containerNumber===number).reduce((sum,row)=>sum+Math.round(Number(row.packageCount||0)*(row.packaging==='کارتن'?.12:.10)*100)/100,0)
  return <div className="invoice-container-details"><label>کانتینر <select aria-label="کانتینر جزئیات" value={number} onChange={event=>setSelection(event.target.value)}>{numbers.map(value=><option key={value}>{value}</option>)}</select></label><ContainerLoadPreview embedded readOnly={readOnly} language={language} container={container} currentCbm={currentCbm} onClose={()=>{}} onChange={value=>onChange({...demo,containers:[...containers.filter(item=>item.number!==value.number),value]})}/></div>
}
