import { useState } from 'react'
import { operationalFormCatalog, type OperationalFormContract } from './operationalFormCatalog'
export function FormCatalogList({onRedesign,onOpenOriginal}:{onRedesign:(contract:OperationalFormContract,newVersion?:boolean)=>void;onOpenOriginal:(contract:OperationalFormContract)=>void}){
 const [search,setSearch]=useState('')
 return <section className="form-system-catalog" aria-label="فرم‌های موجود سیستم"><h3>فرم‌های موجود سیستم</h3><p>بازکردن طراحی، همان سند موجود را ادامه می‌دهد. نسخهٔ جدا فقط با «ایجاد نسخهٔ جدید» ساخته می‌شود؛ فرم عملیاتی تغییر نمی‌کند.</p><label>جست‌وجوی فرم<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label>
 {operationalFormCatalog.filter(item=>item.availability!=='laboratory'&&(item.title+' '+item.route).includes(search)).map(item=><article key={item.route} data-catalog-route={item.route}><div><strong>{item.title}</strong><small>{({operational:'فرم عملیاتی موجود',partial:'اتصال موجود؛ صفحه مستقل ناقص',placeholder:'مسیر موجود؛ فرم هنوز پیاده‌سازی نشده',laboratory:'قالب مادر'})[item.availability]}</small></div><div><button type="button" onClick={()=>onRedesign(item)}>{item.availability==='placeholder'?'بازکردن یا شروع طراحی':'بازکردن طراحی'}</button><button type="button" onClick={()=>onRedesign(item,true)}>ایجاد نسخهٔ جدید</button>{(item.availability==='operational'||item.availability==='partial')&&<button type="button" onClick={()=>onOpenOriginal(item)}>بازکردن مسیر اصلی</button>}</div></article>)}
 </section>
}
