import { FormDocumentDialog } from './FormDocumentDialog'

export type DemoContainer = { number:string; type:'20GP'|'40GP'|'40HC'; capacity?:number; finalized?:boolean; billOfLadingConfirmed?:boolean; priorCbm?:number }
export function ContainerLoadPreview({ container, currentCbm, onChange, onClose, language, readOnly=false, embedded=false }: {
  container:DemoContainer; currentCbm:number; onChange:(value:DemoContainer)=>void; onClose:()=>void; language:'fa'|'en'|'zh'; readOnly?:boolean; embedded?:boolean
}) {
  const capacity=container.capacity??(container.type==='40HC'?68:undefined)
  const previous=container.priorCbm??0,loaded=previous+currentCbm
  const fraction=capacity?Math.min(1,loaded/capacity):0
  const content = <>
    <p>نمایش آزمایشی حجم بار؛ تصویر بسته‌ها نشان‌دهندهٔ تعداد واقعی بسته‌ها نیست.</p>
    <fieldset disabled={readOnly} style={{display:'flex',gap:12,flexWrap:'wrap',border:0}}>
      <label>نوع کانتینر<select value={container.type} onChange={event=>onChange({...container,type:event.target.value as DemoContainer['type'],capacity:event.target.value==='40HC'?68:undefined})}>{['20GP','40GP','40HC'].map(type=><option key={type}>{type}</option>)}</select></label>
      <label>ظرفیت عملیاتی CBM<input aria-label="ظرفیت عملیاتی CBM" type="number" min="0.01" step="0.01" value={capacity??''} onChange={event=>onChange({...container,capacity:event.target.value?Number(event.target.value):undefined})}/></label>
      <label>بار قبلی CBM<input type="number" min="0" step="0.01" value={previous} onChange={event=>onChange({...container,priorCbm:Math.max(0,Number(event.target.value))})}/></label>
      <label><input type="checkbox" checked={container.finalized??false} onChange={event=>onChange({...container,finalized:event.target.checked})}/>نهایی‌شده (آزمایشی)</label>
      <label><input type="checkbox" checked={container.billOfLadingConfirmed??false} onChange={event=>onChange({...container,billOfLadingConfirmed:event.target.checked})}/>بارنامه تأییدشده (آزمایشی)</label>
    </fieldset>
    <svg viewBox="0 0 620 240" role="img" aria-label="نمای شفاف کانتینر با کارتن، گونی، عدل و پالت" style={{width:'100%',maxHeight:270}}>
      <path d="M70 70 145 25 575 25 575 170 500 215 70 215Z" fill="#cfeee933" stroke="#288572" strokeWidth="2"/>
      <path d="M70 70H500V215M500 70 575 25M500 215 575 170M145 25V170L70 215M145 170H575" fill="none" stroke="#4e9d8c"/>
      {Array.from({length:18},(_,i)=><path key={i} d={`M${80+i*23} 76v132`} stroke="#a4ccc5" opacity=".5"/>)}
      <rect x="76" y="190" width={420*fraction} height="20" fill="#74b99c" opacity=".35"/>
      {Array.from({length:Math.ceil(fraction*10)},(_,i)=>{
        const x=90+i*39,y=i%2?122:145,color=i<Math.round(previous/(loaded||1)*10)?'#d3aa79':'#55b89a'
        return <g key={i}>{i%4===0?<><rect x={x} y={y} width="33" height="43" rx="2" fill={color}/><path d={`M${x} ${y+12}h33m-16-12v43`} stroke="#705a39"/></>:i%4===1?<ellipse cx={x+16} cy={y+25} rx="17" ry="25" fill={color} stroke="#658575"/>:i%4===2?<><rect x={x} y={y} width="34" height="44" rx="8" fill={color}/><path d={`M${x+8} ${y}v44m18-44v44`} stroke="#64836f"/></>:<><rect x={x} y={y} width="33" height="35" fill={color}/><path d={`M${x-3} ${y+40}h39m-35 6h31m-28-6v10m12-10v10m12-10v10`} stroke="#a77c45" strokeWidth="4"/></>}</g>
      })}
      <path d="M70 70H500V215H70Z" fill="#c2f1ef18" stroke="#288572" strokeWidth="2"/>
    </svg>
    <div style={{display:'flex',gap:16,flexWrap:'wrap'}}><span>بار قبلی تأمین‌کنندگان / فاکتورهای دیگر: {previous.toFixed(2)} CBM</span><span>فاکتور جاری: {currentCbm.toFixed(2)} CBM</span><strong>بار کل: {loaded.toFixed(2)} / {capacity??'ظرفیت تعیین نشده'} CBM</strong><strong>باقی‌مانده: {capacity===undefined?'—':(capacity-loaded).toFixed(2)} CBM</strong></div>
    <p>■ قهوه‌ای: بار قبلی؛ ■ سبز: فاکتور جاری. این تنظیمات فقط در نمونهٔ آزمایشگاه نگهداری می‌شوند.</p>
  </>
  return embedded ? content : <FormDocumentDialog title={`کانتینر و بارگیری — ${container.number}`} language={language} onClose={onClose}>{content}</FormDocumentDialog>
}
