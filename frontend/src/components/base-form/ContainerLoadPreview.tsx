import { useState } from 'react'
import { FormDocumentDialog } from './FormDocumentDialog'
import { emptyContainerModels, type ContainerModelId } from './emptyContainerModels'
import './emptyContainerModels.css'

export type DemoContainer = { number:string; type:'20GP'|'40GP'|'40HC'; capacity?:number; finalized?:boolean; billOfLadingConfirmed?:boolean; priorCbm?:number }

/** Stage 1 is a read-only asset preview; selection never mutates the invoice. */
export function ContainerLoadPreview({ container, onClose, language, embedded=false }: {
  container:DemoContainer; currentCbm:number; onChange:(value:DemoContainer)=>void; onClose:()=>void; language:'fa'|'en'|'zh'; readOnly?:boolean; embedded?:boolean
}) {
  const [selectedId,setSelectedId]=useState<ContainerModelId>(container.type)
  const selected=emptyContainerModels.find(model=>model.id===selectedId)!
  const fa=language==='fa'
  const approval=(approved:boolean)=>approved?(fa?'تأییدشده — قفل':'Approved — locked'):(fa?'پیشنهاد بصری — در انتظار تأیید':'Visual candidate — pending approval')
  const content=<div className="empty-container-preview" dir={fa?'rtl':'ltr'}>
    <p>{fa?'مرحلهٔ ۱: مدل‌های خالی کانتینر؛ انتخاب زیر فقط برای پیش‌نمایش است.':'Stage 1: empty container models. Selection is for preview only.'}</p>
    <div className="empty-container-models" role="group" aria-label={fa?'انتخاب مدل خالی کانتینر':'Select empty container model'}>
      {emptyContainerModels.map(model=><button type="button" key={model.id} aria-pressed={model.id===selectedId} onClick={()=>setSelectedId(model.id)}>
        <strong dir="ltr">{model.id} — {model.label}</strong>
        <img src={model.assetUrl} alt={`${model.id} — ${fa?'کانتینر خالی':'empty container'} — ${model.color}`} />
        <span>{approval(model.approved)}</span>
        <small dir="ltr">{model.filename}</small>
      </button>)}
    </div>
    <section aria-label={fa?'مشخصات مدل انتخاب‌شده':'Selected model dimensions'}>
      <h3 dir="ltr">{selected.id} — {selected.label}</h3>
      <p>{approval(selected.approved)}</p>
      <table><caption>{fa?'ابعاد مرجع برحسب متر؛ طول × عرض × ارتفاع':'Reference dimensions in meters; length × width × height'}</caption><tbody>
        <tr><th>{fa?'بیرونی':'External'}</th><td dir="ltr">{selected.external.length} × {selected.external.width} × {selected.external.height} m</td></tr>
        <tr><th>{fa?'داخلی':'Internal'}</th><td dir="ltr">{selected.internal.length} × {selected.internal.width} × {selected.internal.height} m</td></tr>
        <tr><th>{fa?'دهانهٔ در — عرض × ارتفاع':'Door opening — width × height'}</th><td dir="ltr">{selected.doorOpening.width} × {selected.doorOpening.height} m</td></tr>
        <tr><th>{fa?'حجم اسمی داخلی':'Nominal internal volume'}</th><td dir="ltr">{selected.nominalInternalCBM} m³</td></tr>
      </tbody></table>
    </section>
    <p>{fa?'این تصاویر دوبعدی، مدل سه‌بعدیِ مقیاس‌دار نیستند. ابعاد عددی از فایل مرجع خوانده می‌شوند و مشخصات واقعی تجهیز ممکن است متفاوت باشد.':'These bitmaps are not metrically calibrated 3D models. Dimensions come from the supplied reference; actual equipment may differ.'}</p>
    <p>{fa?'در این مرحله بار، چیدمان و ظرفیت عملی محاسبه نمی‌شود. مدل سه‌بعدی و تنظیمات ظرفیت به مرحلهٔ بعد موکول شده‌اند.':'No cargo, packing or practical-capacity calculations in this stage. Scalable geometry and capacity configuration are deferred.'}</p>
  </div>
  return embedded?content:<FormDocumentDialog title={`${fa?'مدل خالی کانتینر':'Empty container model'} — ${container.number}`} language={language} onClose={onClose}>{content}</FormDocumentDialog>
}
