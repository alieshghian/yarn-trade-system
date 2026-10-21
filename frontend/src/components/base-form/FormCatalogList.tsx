import { useState } from 'react'
import { operationalFormCatalog, type OperationalFormContract } from './operationalFormCatalog'
export function FormCatalogList({onRedesign,onOpenOriginal}:{onRedesign:(contract:OperationalFormContract)=>void;onOpenOriginal:(contract:OperationalFormContract)=>void}){
 const [search,setSearch]=useState('')
 return <section className="form-system-catalog" aria-label="فرم‌های موجود سیستم"><h3>فرم‌های موجود سیستم</h3><p>بازطراحی، نسخه مستقلی می‌سازد؛ فرم عملیاتی سالم تغییر نمی‌کند. اتصال و آماده‌بودن نسخه جدید باید جداگانه تأیید شود.</p><label>جست‌وجوی فرم<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label>
 {operationalFormCatalog.filter(item=>item.availability!=='laboratory'&&(item.title+' '+item.route).includes(search)).map(item=><article key={item.route} data-catalog-route={item.route}><div><strong>{item.title}</strong><small>{({operational:'فرم عملیاتی موجود',partial:'اتصال موجود؛ صفحه مستقل ناقص',placeholder:'مسیر موجود؛ فرم هنوز پیاده‌سازی نشده',laboratory:'قالب مادر'})[item.availability]}</small></div><div><button type="button" onClick={()=>onRedesign(item)}>{item.availability==='placeholder'?'ساخت از قالب مادر':'ایجاد نسخه مستقل بازطراحی'}</button>{(item.availability==='operational'||item.availability==='partial')&&<button type="button" onClick={()=>onOpenOriginal(item)}>بازکردن مسیر اصلی</button>}</div></article>)}
 </section>
}
