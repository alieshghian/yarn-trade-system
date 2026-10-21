import { useState } from 'react'
import type { FormSchemaDraft, FormSchemaLocale } from './formSchema'
import { DocumentDialogCloseButton, FormDocumentDialog } from './FormDocumentDialog'
import { FieldRulesControls } from './FieldRulesControls'
import { applyLabelChange, labelChangePlan, type LabelEditTarget } from './labelChanges'

export function LabelEditorDialog({schema,target,language,hidden,onClose,onFont,onCommit}:{schema:FormSchemaDraft;target:LabelEditTarget;language:FormSchemaLocale;hidden?:boolean;onClose:()=>void;onFont:()=>void;onCommit:(schema:FormSchemaDraft)=>void}) {
  const [draft,setDraft]=useState(schema),[label,setLabel]=useState(target.value),[review,setReview]=useState(false),[selected,setSelected]=useState<string[]>([])
  const field=draft.fields.find(item=>item.id===target.id), plan=labelChangePlan(draft,target,language), suggestions=plan.suggestions
  const invalid=(draft.uniqueConstraints??[]).some(rule=>rule.fieldIds.length<2||[...rule.fieldIds,...(rule.scopeFieldIds??[])].some(id=>!draft.fields.some(item=>item.id===id))) || draft.fields.some(item=>item.ruleSettings?.dependencies?.some(rule=>!draft.fields.some(source=>source.id===rule.fieldId)||rule.fieldId===item.id))
  const dirty=label!==target.value||JSON.stringify(draft)!==JSON.stringify(schema)
  const commit=(decision:'sync'|'review'|'independent')=>{onCommit(applyLabelChange(draft,target,label.trim(),language,decision,selected));onClose()}
  const submit=()=>{
    if(!label.trim()||invalid)return false
    if(label.trim()!==target.value&&suggestions.length){setSelected(plan.preferred);setReview(true);return false}
    commit('review');return true
  }
  return <FormDocumentDialog language={language} title={target.kind==='field'?'ویرایش متن برچسب فیلد':'ویرایش متن سرستون'} onClose={onClose} hidden={hidden} dirty={dirty} onSave={submit}>
    {!review?<><label>{target.kind==='field'?'متن برچسب':'متن سرستون'}<input autoFocus aria-label="متن برچسب یا سرستون" value={label} onFocus={event=>event.currentTarget.select()} onChange={event=>setLabel(event.target.value)}/></label>
      {target.kind==='field'&&field&&<FieldRulesControls schema={draft} field={field} language={language} onChange={setDraft}/>}
      <p>پس از ثبت عنوان جدید، پیشنهاد آمادهٔ تغییر عنوان مرتبط نمایش داده می‌شود. ارتباط داده‌ها حفظ می‌شود.</p>
      {invalid&&<p role="alert">گروه یکتایی یا وابستگی ناقص است؛ فیلدهای آن را مشخص کنید.</p>}
      <div className="form-document-settings-buttons"><button type="button" onClick={onFont}>انتخاب قلم و اندازه…</button><button type="button" disabled={!label.trim()||invalid} onClick={submit}>ثبت متن</button></div>
    </>:<section className="label-sync-proposals" aria-label="پیشنهاد همگام‌سازی عنوان"><h3>{suggestions.length===1?`عنوان ${target.kind==='field'?'ستون':'فیلد'} «${suggestions[0].current}» هم «${label.trim()}» شود؟`:`عنوان مرتبط هم «${label.trim()}» شود؟`}</h3>
      {plan.ambiguous&&<p>این ستون چند منبع معتبر دارد؛ مشخص کنید عنوان کدام مورد تغییر کند. ترکیب داده‌ها حفظ می‌شود.</p>}
      {suggestions.map(item=><div className="label-sync-card" key={item.key}><label className="label-sync-proposal">{plan.ambiguous&&<input type={target.kind==='column'?'radio':'checkbox'} name="label-sync-target" aria-label={'همگام‌سازی '+item.current} checked={selected.includes(item.key)} onChange={event=>setSelected(target.kind==='column'?[item.key]:event.target.checked?[...selected,item.key]:selected.filter(key=>key!==item.key))}/>}<span><span>عنوان فعلی: {item.current}</span><strong>عنوان پیشنهادی: {label.trim()}</strong></span></label></div>)}
      <div className="form-document-settings-buttons"><button type="button" className="form-dialog-primary" disabled={!selected.length} onClick={()=>commit('sync')}>بله، تغییر کند</button><button type="button" onClick={()=>commit('review')}>فقط این عنوان؛ بررسی بعداً</button><button type="button" onClick={()=>commit('independent')}>عنوان‌ها مستقل باشند</button><button type="button" onClick={()=>setReview(false)}>بازگشت به ویرایش</button></div>
    </section>}
    <DocumentDialogCloseButton>انصراف</DocumentDialogCloseButton>
  </FormDocumentDialog>
}
