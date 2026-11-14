import {useState} from 'react'
import {normalizeCapabilities,readComponentLibrary,resolveComponentCapabilities} from './componentBehavior'
import {copyFieldComponentSettings,isListComponentField,resolveListSettings,type ComponentListSettings,type ComponentSettingsCopyGroup,type ListSettingsPatch} from './componentListSettings'
import {getSystemLookupSources,normalizeLookupSettings} from './systemLookupSources'
import type {FormSchemaDraft,FormSchemaField,FormSchemaLocale} from './formSchema'

export function effectiveFieldListSettings(field:FormSchemaField):ComponentListSettings{
 let inherited;try{inherited=resolveComponentCapabilities(readComponentLibrary(localStorage),String(field.settings?.componentDefinitionId??field.componentId))}catch{/* Defaults also work without storage. */}
 const overrides=normalizeCapabilities((field.settings?.behaviorOverrides??{}) as Parameters<typeof normalizeCapabilities>[0])
 return resolveListSettings({searchEnabled:inherited?.searchChoices},inherited?.listSettings,{searchEnabled:overrides.searchChoices},overrides.listSettings,field.settings?.listSettings)
}
export function ListSettingsControls({settings,onChange,language='fa',lookup=false}:{settings:ComponentListSettings;onChange:(settings:ListSettingsPatch)=>void;language?:FormSchemaLocale;lookup?:boolean}){
 const fa=language==='fa',text=(f:string,e:string)=>fa?f:e
 return <>
 <details className="form-structure-disclosure"><summary>{text('جست‌وجو و انتخاب خالی','Search and empty selection')}</summary><fieldset>
 <label><input type="checkbox" checked={lookup||settings.searchEnabled} disabled={lookup} onChange={e=>onChange({searchEnabled:e.target.checked})}/>{text('جست‌وجو در گزینه‌ها','Search choices')}</label>
 <label>{text('جست‌وجو بر اساس','Search by')}<select value={settings.searchFields.includes('code')&&settings.searchFields.includes('name')?'both':settings.searchFields.includes('code')?'code':'name'} onChange={e=>onChange({searchFields:e.target.value==='both'?['code','name','value']:[e.target.value]})}><option value="both">{text('کد و نام','Code and name')}</option><option value="code">{text('کد','Code')}</option><option value="name">{text('نام','Name')}</option></select></label>
 <label><input type="checkbox" checked={settings.allowEmpty} onChange={e=>onChange({allowEmpty:e.target.checked})}/>{text('اجازهٔ پاک‌کردن انتخاب؛ بدون انتخاب','Allow clearing the selection')}</label>
 </fieldset></details>
 <details className="form-structure-disclosure"><summary>{text('دسترسی مدیر و کاربر','Administrator and user permissions')}</summary><fieldset>
 {(['add','edit','remove','setDefault'] as const).map(key=><label key={key}>{({add:text('افزودن','Add'),edit:text('ویرایش','Edit'),remove:text('حذف','Remove'),setDefault:text('تعیین پیش‌فرض','Set default')})[key]}<select disabled={lookup&&key!=='add'} value={lookup&&key!=='add'?'none':settings.permissions[key]} onChange={e=>onChange({permissions:{[key]:e.target.value as ComponentListSettings['permissions'][typeof key]}})}><option value="everyone">{text('مدیر و کاربر مجاز','Authorized administrators and users')}</option><option value="admin">{text('فقط مدیر','Administrators only')}</option><option value="none">{text('هیچ‌کس','Nobody')}</option></select></label>)}
 <small>{text('مجوز کامپوننت، مجوز عملیاتی منبع را افزایش نمی‌دهد. ویرایش و حذف تعاریف از فرم اصلی انجام می‌شود.','Component settings never grant source permissions. Edit or delete master records in their source form.')}</small>
 </fieldset></details>
 <details className="form-structure-disclosure"><summary>{text('نمایش دکمهٔ افزودن','Add button placement')}</summary><fieldset><select aria-label={text('محل دکمه افزودن','Add button placement')} value={settings.addPlacement} onChange={e=>onChange({addPlacement:e.target.value as ComponentListSettings['addPlacement']})}>
 {!lookup&&<option value="beside">{text('کنار فیلد؛ سازگاری با فرم موجود','Beside the field; existing layout')}</option>}<option value="inside">{text('داخل خود فیلد','Inside the field')}</option><option value="popup">{text('داخل فهرست بازشده','Inside the open list')}</option><option value="hidden">{text('مخفی','Hidden')}</option></select><small>{text('قلم، رنگ و ابعاد از تنظیمات ظاهری مشترک طراح فرم قابل تغییر است.','Use the shared Designer appearance commands for font, color and dimensions.')}</small></fieldset></details>
 </>
}
export function FieldComponentSettingsControls({schema,field,language,onChange}:{schema:FormSchemaDraft;field:FormSchemaField;language:FormSchemaLocale;onChange:(schema:FormSchemaDraft)=>void}){
 const [sourceId,setSourceId]=useState(''),[groups,setGroups]=useState<ComponentSettingsCopyGroup[]>(['search','permissions','selection','presentation']),[status,setStatus]=useState('')
 const lookup=field.componentId==='base-form.system-lookup',effective=effectiveFieldListSettings(field),fa=language==='fa'
 const update=(patch:ListSettingsPatch)=>{const current=resolveListSettings(effective,patch);onChange({...schema,fields:schema.fields.map(item=>item.id===field.id?{...item,settings:{...item.settings,listSettings:current}}:item)})}
 const config=normalizeLookupSettings(field.settings?.lookupSettings)
 const updateLookup=(patch:Partial<typeof config>)=>onChange({...schema,fields:schema.fields.map(item=>item.id===field.id?{...item,settings:{...item.settings,lookupSettings:{...config,...patch}}}:item)})
 return <details className="form-structure-disclosure" data-component-settings={field.id}><summary>{fa?'تنظیمات کامپوننت در این فرم':'Component settings in this form'}</summary>
 {lookup&&<fieldset><legend>{fa?'منبع تعاریف و بازگشت رکورد':'Master-data source and return behavior'}</legend><label>{fa?'فرم منبع اطلاعات':'Source form'}<select aria-label={fa?'فرم منبع اطلاعات':'Source form'} value={config.sourceId} onChange={e=>updateLookup({sourceId:e.target.value})}><option value="">—</option>{getSystemLookupSources().map(source=><option key={source.id} value={source.id}>{source.title[language]}</option>)}</select></label><label>{fa?'پس از ثبت':'After saving'}<select value={config.returnMode} onChange={e=>updateLookup({returnMode:e.target.value as typeof config.returnMode})}><option value="saveAndSelect">{fa?'ثبت و انتخاب خودکار':'Save and select automatically'}</option><option value="selectAfterSave">{fa?'ثبت، سپس دکمهٔ انتخاب و بازگشت':'Save, then Select and return'}</option></select></label><small>{fa?'منبع انتخاب‌شده در سند فرم و خروجی JSON ذخیره می‌شود. انتخاب خالی یعنی بدون ارتباط؛ Insert فرم منبع را برای ثبت و انتخاب باز می‌کند.':'The selected source is retained in the form JSON. Blank means no association; Insert opens the source form to save and select.'}</small></fieldset>}
 <ListSettingsControls settings={effective} language={language} lookup={lookup} onChange={update}/>
 <button type="button" onClick={()=>onChange({...schema,fields:schema.fields.map(item=>{if(item.id!==field.id)return item;const settings={...item.settings};delete settings.listSettings;delete settings.behaviorOverrides;return {...item,settings}})})}>{fa?'بازگشت قابلیت‌ها به پیش‌فرض کتابخانه':'Inherit library capabilities'}</button>
 <details className="form-structure-disclosure"><summary>{fa?'دریافت تنظیمات از فیلد دیگر…':'Get settings from another field…'}</summary>
 <label>{fa?'فیلد مبدأ':'Source field'}<select aria-label={fa?'فیلد مبدأ تنظیمات':'Settings source field'} value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">—</option>{schema.fields.filter(item=>item.id!==field.id&&isListComponentField(item)).map(item=><option key={item.id} value={item.id}>{item.label[language]} ({item.id})</option>)}</select></label>
 {(['search','permissions','selection','presentation'] as const).map(key=><label key={key}><input type="checkbox" checked={groups.includes(key)} onChange={e=>setGroups(current=>e.target.checked?[...current,key]:current.filter(item=>item!==key))}/>{({search:fa?'جست‌وجو':'Search',permissions:fa?'مجوزها':'Permissions',selection:fa?'انتخاب خالی':'Empty selection',presentation:fa?'محل افزودن':'Add placement'})[key]}</label>)}
 <button type="button" disabled={!sourceId||!groups.length} onClick={()=>{const source=schema.fields.find(item=>item.id===sourceId);if(source){onChange(copyFieldComponentSettings(schema,field.id,sourceId,groups,effectiveFieldListSettings(source)));setStatus(fa?'تنظیمات به‌صورت مستقل دریافت شد؛ اتصال داده و عنوان مقصد حفظ شد.':'Settings copied independently; target label and data bindings preserved.')}}}>{fa?'دریافت تنظیمات انتخاب‌شده':'Apply selected settings'}</button>{status&&<p role="status">{status}</p>}
 </details></details>
}
