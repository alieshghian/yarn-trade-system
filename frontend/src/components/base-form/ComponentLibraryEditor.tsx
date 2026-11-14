import {BatchValueList,type BatchValueItem} from './BatchValueList'
import {ListSettingsControls} from './ComponentListSettingsControls'
import {resolveListSettings} from './componentListSettings'
import {SystemLookup} from './SystemLookup'
import {createSampleLookupSource} from './sampleLookupSource'
import {useState} from 'react'
import {FormDocumentDialog,DocumentDialogCloseButton} from './FormDocumentDialog'
import {FormValueList} from './FormValueList'
import {resolveComponentCodeSettings,componentDescendsFrom,readComponentLibrary,resolveComponentCapabilities,publishComponentRevision,writeComponentLibrary,type ComponentLibrary,type ListCapabilities} from './componentBehavior'
import type {FieldBlueprint} from './formDocumentControls'
import type {FormSchemaDraft} from './formSchema'
import SystemDateInput from '../../SystemDateInput'
import {normalizeCodeComponentSettings,defaultCodeComponentSettings,suggestComponentCode,validateComponentCode,codeSettingsError,codeInputProps,type CodeComponentSettings} from './serialCode'

import {codeSettingsControls} from './FormFieldStructureControls'

// Retain the original one-digit disposable example until a library revision defines settings.
const libraryCodePreview=(library:ComponentLibrary,id:string)=>{const item=library.components.find(item=>item.id===id),settings=resolveComponentCodeSettings(library,id);return !item?.parentId&&!item?.revisions.at(-1)?.codeSettings?{...settings,suffixWidth:1}:settings}
const capabilityOverrides=(value:Partial<ListCapabilities>,baseline:Partial<ListCapabilities>):Partial<ListCapabilities>=>{
 const diff=(current:unknown,previous:unknown):unknown=>{
  if(!current||typeof current!=='object'||Array.isArray(current))return JSON.stringify(current)===JSON.stringify(previous)?undefined:current
  const before=previous&&typeof previous==='object'&&!Array.isArray(previous)?previous as Record<string,unknown>:{}
  const patch:Record<string,unknown>={}
  for(const [key,next] of Object.entries(current as Record<string,unknown>)){const changed=diff(next,before[key]);if(changed!==undefined)patch[key]=changed}
  return Object.keys(patch).length?patch:undefined
 }
 return (diff(value,baseline)??{}) as Partial<ListCapabilities>
}
type Props={forms:FormSchemaDraft[];onClose:()=>void;onSaveBlueprint:(blueprint:FieldBlueprint)=>boolean}
export function ComponentLibraryEditor({forms,onClose,onSaveBlueprint}:Props){
 const [library,setLibrary]=useState<ComponentLibrary|null>(()=>{try{return readComponentLibrary(localStorage)}catch{return null}})
 const [selected,setSelected]=useState('base-form.value-list'),[status,setStatus]=useState(''),[name,setName]=useState('کامپوننت جدید'),[label,setLabel]=useState('منشأ برند')
 const definition=library?.components.find(item=>item.id===selected)
 const [draft,setDraft]=useState<Partial<ListCapabilities>>(definition?.revisions.at(-1)?.capabilities??{})
 const [sampleLookup]=useState(()=>createSampleLookupSource('library-preview'))
 const [sampleLookupValue,setSampleLookupValue]=useState('')
 const [batchItems,setBatchItems]=useState<BatchValueItem[]>([]),[batchId,setBatchId]=useState('')
 const [sample,setSample]=useState({value:'',defaultValue:'',values:[] as string[]})
 const [sampleCode,setSampleCode]=useState('AB9'),[existingCodes,setExistingCodes]=useState('AB1, AB2'),[codeSettings,setCodeSettings]=useState<CodeComponentSettings>(libraryCodePreview(library??{version:1,components:[]},'base-form.code-input')),[sampleDate,setSampleDate]=useState(''),[suggestToday,setSuggestToday]=useState(false)
 if(!library||!definition)return <FormDocumentDialog language="fa" title="کتابخانه کامپوننت‌ها" onClose={onClose}><p role="alert">کتابخانهٔ ذخیره‌شده نامعتبر است؛ بازنویسی نشد.</p><DocumentDialogCloseButton>بستن</DocumentDialogCloseButton></FormDocumentDialog>
 const source=definition,latest=source.revisions.at(-1)!
 const proposed={...library,components:library.components.map(item=>item.id===selected?{...item,revisions:[...item.revisions.slice(0,-1),{...latest,capabilities:draft,codeSettings}]}:item)}
 const effective=resolveComponentCapabilities(proposed,selected)
 const isListComponent=['base-form.value-list','base-form.number-control','persons.title-control','base-form.batch-values'].includes(source.rendererId)
 const isLookupComponent=source.rendererId==='base-form.system-lookup'
 const isDateComponent=source.rendererId==='base-form.date-input'
 const isCodeComponent=['base-form.code-input','base-form.incremental-code'].includes(source.rendererId)
 const incremental=source.rendererId==='base-form.incremental-code'
 const activeCodeSettings={...codeSettings,incremental:incremental||codeSettings.incremental}
 const codeError=validateComponentCode(sampleCode,activeCodeSettings,existingCodes.split(',').map(value=>value.trim()).filter(Boolean))
 const affected=forms.flatMap(form=>form.fields.filter(field=>componentDescendsFrom(library,String(field.settings?.componentDefinitionId??field.componentId),selected)).map(field=>({id:form.id+':'+field.id,label:form.title.fa+' ← '+field.label.fa})))
 const publish=(capabilities:Partial<ListCapabilities>,reason='نسخهٔ جدید ثبت و برای نمونه‌های وابسته اعمال شد.',code=codeSettings)=>{
  try{if(isCodeComponent&&codeSettingsError(code))throw Error(codeSettingsError(code));if(JSON.stringify(readComponentLibrary(localStorage))!==JSON.stringify(library))throw Error('کتابخانه تغییر کرده است؛ پنجره را دوباره باز کنید.')
   const next=publishComponentRevision(library,selected,capabilities,isCodeComponent?code:undefined);writeComponentLibrary(localStorage,next);setLibrary(next);setDraft(capabilities);if(isCodeComponent)setCodeSettings(code);setStatus(reason);return true
  }catch(error){setStatus(error instanceof Error?error.message:String(error));return false}
 }
 return <FormDocumentDialog language="fa" title="کتابخانه و رفتار مشترک کامپوننت‌ها" panelClassName="component-library-editor" onClose={onClose} dirty={JSON.stringify(draft)!==JSON.stringify(latest.capabilities)||(isCodeComponent&&JSON.stringify(codeSettings)!==JSON.stringify(libraryCodePreview(library,selected)))} onSave={()=>publish(draft)}>
  <p>نام و اتصال داده متعلق به نمونه است؛ رفتار از شناسهٔ ثابت کامپوننت به ارث می‌رسد. دادهٔ این پیش‌نمایش آزمایشی است.</p>
  <label>کامپوننت<select aria-label="کامپوننت کتابخانه" value={selected} onChange={event=>{const item=library.components.find(item=>item.id===event.target.value)!;setSelected(item.id);setDraft(item.revisions.at(-1)!.capabilities);setSample({value:'',defaultValue:'',values:[]});setCodeSettings(libraryCodePreview(library,item.id));setStatus('')}}>{library.components.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <output dir="ltr" data-component-library-reference>{source.id} · v{latest.version} {source.parentId?'← '+source.parentId:''}</output>
  {isListComponent&&<fieldset><legend>قابلیت‌های قابل آزمایش</legend>
   {(['searchChoices','confirmRemoval'] as const).map(key=><div key={key}><label><input type="checkbox" aria-label={key==='searchChoices'?'جست‌وجو در گزینه‌ها':'تأیید حذف گزینه'} checked={effective[key]} onChange={event=>setDraft({...draft,[key]:event.target.checked,...(key==='searchChoices'?{listSettings:{...draft.listSettings,searchEnabled:event.target.checked}}:{})})}/>{key==='searchChoices'?'جست‌وجو در گزینه‌ها':'تأیید حذف گزینه'}</label>{source.parentId&&<button type="button" onClick={()=>{const next={...draft};delete next[key];setDraft(next)}}>ارث‌بری</button>}</div>)}
   <label>حداکثر طول ورودی<input type="number" min="1" max="10000" aria-label="حداکثر طول ورودی کامپوننت" value={effective.maxEntryLength} onChange={event=>setDraft({...draft,maxEntryLength:Math.max(1,Math.min(10000,Number(event.target.value)||1))})}/></label>
   {source.parentId&&<button type="button" onClick={()=>{const next={...draft};delete next.maxEntryLength;setDraft(next)}}>ارث‌بری طول ورودی</button>}
   <small>افزودن، Enter، ثبت F3، انصراف Esc، ویرایش، حذف و پیش‌فرض از قرارداد مشترک‌اند و با تغییر برچسب حذف نمی‌شوند. رفتار خارج از قابلیت‌های موجود نیازمند پیاده‌سازی و تست کد است.</small>
  </fieldset>}
  {(isListComponent||isLookupComponent)&&<ListSettingsControls settings={resolveListSettings({searchEnabled:effective.searchChoices},effective.listSettings)} lookup={isLookupComponent} onChange={patch=>{const current=resolveListSettings({searchEnabled:effective.searchChoices},effective.listSettings,patch);setDraft({...draft,listSettings:current})}}/>}
  {isLookupComponent&&<SystemLookup field="library-lookup" label="انتخاب آزمایشی" value={sampleLookupValue} onChange={setSampleLookupValue} language="fa" sourceOverride={sampleLookup} actorRole="admin" listSettings={resolveListSettings(effective.listSettings)}/>}
  {source.rendererId==='base-form.batch-values'&&<div className="component-library-preview" data-form-fields><BatchValueList field="batch-library-sample" label="رنگ" items={batchItems} selectedId={batchId} onSelect={setBatchId} onCommit={(items,id)=>{setBatchItems(items);setBatchId(id)}} disabled={false} fa componentDefinitionId={selected} behaviorPreview={effective}/></div>}
  {isListComponent&&source.rendererId!=='base-form.batch-values'&&<><label>برچسب نمونه<input aria-label="برچسب آزمایش کامپوننت" value={label} onChange={event=>setLabel(event.target.value)}/></label><div className="component-library-preview" data-form-fields><FormValueList field="component-library-sample" label={label} componentDefinitionId={selected} behaviorPreview={effective} primary={sample.value} numbers={sample.values} listPrimary={sample.defaultValue} fa disabled={false} multiline addLabel={'افزودن '+label} listLabel={'نمایش '+label} onSelectValue={value=>setSample({...sample,value})} onChange={(value,values)=>setSample({value,values,defaultValue:value})}/></div></>}
  {isDateComponent&&<fieldset><legend>آزمایش کامپوننت تاریخ</legend><label><input type="checkbox" checked={suggestToday} onChange={event=>setSuggestToday(event.target.checked)}/>پیشنهاد تاریخ امروز برای مقدار خالی</label><div className="component-library-preview"><SystemDateInput value={sampleDate} onChange={setSampleDate} language="fa" ariaLabel="تاریخ آزمایشی" suggestToday={suggestToday}/></div><small>همان ورودی تقویم مشترک برنامه؛ مقدار نمونه فقط در این پنجره نگهداری می‌شود.</small></fieldset>}
  {isCodeComponent&&<fieldset><legend>{incremental?'آزمایش شمارهٔ افزایشی یکتا':'آزمایش کد قابل تنظیم'}</legend>{codeSettingsControls(codeSettings,setCodeSettings,true,incremental)}<label>آخرین کد ثبت‌شده<input aria-label="آخرین کد آزمایشی" value={sampleCode} {...codeInputProps(sampleCode,activeCodeSettings,setSampleCode)}/></label><output aria-label="پیشنهاد شمارهٔ آزمایشی">{suggestComponentCode([sampleCode],activeCodeSettings).error??('شمارهٔ بعدی: '+suggestComponentCode([sampleCode],activeCodeSettings).value)}</output><label>کدهای نمونهٔ موجود<input aria-label="کدهای موجود آزمایشی" value={existingCodes} onChange={event=>setExistingCodes(event.target.value)}/></label><label>آزمایش یکتایی و قالب<input aria-label="کد برای اعتبارسنجی" value={sampleCode} {...codeInputProps(sampleCode,activeCodeSettings,setSampleCode)}/></label><output role="status">{codeError??'کد نمونه معتبر است.'}</output><button type="button" disabled={Boolean(codeSettingsError(codeSettings))} onClick={()=>publish(draft)}>ثبت نسخهٔ تنظیمات کد</button><small>مقدار نمونه فقط در این پنجره است؛ یکتایی چندکاربره نیازمند کنترل API و پایگاه‌داده است.</small></fieldset>}
  {isListComponent?<fieldset><legend>وابستگی‌ها و تصمیم انتشار</legend><p>قابلیت‌ها برای تمام نمونه‌های وابسته به این مرجع اعمال می‌شوند. برچسب، ظاهر، داده، مجوزها و اتصال فرم‌ها حفظ می‌شوند؛ تنظیم اختصاصی قابلیت در کامپوننت فرزند اولویت دارد.</p>{componentDescendsFrom(library,'persons.title-control',selected)&&<p>فرم عملیاتی تعریف اشخاص و فهرست‌های مشترک برنامه</p>}<ul>{affected.map(item=><li key={item.id}>{item.label}</li>)}</ul><button type="button" onClick={()=>publish(draft)}>ثبت نسخه و اعمال به کامپوننت‌های وابسته</button></fieldset>:<fieldset><legend>نمونه‌های نصب‌شده</legend><ul>{affected.map(item=><li key={item.id}>{item.label}</li>)}</ul><small>قالب تاریخ یا کد هنگام افزودن هر فیلد تنظیم می‌شود و همراه تعریف ذخیره‌شدهٔ همان نمونه می‌ماند.</small></fieldset>}
  <details><summary>نسخه‌های قبلی و بازگشت</summary>{source.revisions.slice(0,-1).map(revision=><button key={revision.version} type="button" onClick={()=>publish(revision.capabilities,'رفتار نسخهٔ '+revision.version+' در نسخهٔ جدید بازیابی شد.',normalizeCodeComponentSettings(revision.codeSettings??defaultCodeComponentSettings))}>بازگشت به نسخهٔ {revision.version}</button>)}</details>
  <label>نام کامپوننت جدید<input aria-label="نام کامپوننت جدید کتابخانه" value={name} onChange={event=>setName(event.target.value)}/></label>
  <button type="button" disabled={!name.trim()||(isCodeComponent&&Boolean(codeSettingsError(codeSettings)))} onClick={()=>{const id='blueprint.'+crypto.randomUUID();if(onSaveBlueprint({id,name:name.trim(),componentId:source.rendererId,componentDefinitionId:source.id,kind:isLookupComponent?'lookup':isDateComponent?'date':isListComponent?(source.rendererId==='persons.title-control'?'select':'valueList'):'text',valueType:'text',...((isListComponent||isLookupComponent)?{multiline:true,behaviorOverrides:capabilityOverrides(draft,latest.capabilities)}:{}),...(isCodeComponent?{componentSettings:activeCodeSettings}:{}),...(isDateComponent?{suggestToday}: {})})){const next=readComponentLibrary(localStorage);setLibrary(next);setSelected(id);setDraft(next.components.find(item=>item.id===id)!.revisions.at(-1)!.capabilities);setStatus('کامپوننت مستقل در کتابخانه ثبت شد؛ رفتار و تنظیمات نمونه حفظ شدند.')}else setStatus('ثبت کامپوننت ممکن نشد؛ دادهٔ قبلی حفظ شد.')}}>ذخیره به عنوان کامپوننت جدید</button>
  {status&&<p role="status">{status}</p>}<DocumentDialogCloseButton>بستن کتابخانه</DocumentDialogCloseButton>
 </FormDocumentDialog>
}
