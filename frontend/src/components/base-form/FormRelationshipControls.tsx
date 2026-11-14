import {FieldFocusOrderControls} from './FieldFocusOrderControls'
import {useState,useLayoutEffect,useRef} from 'react'
import {formRuleStructureIssues} from './fieldRules'
import type {FormSchemaDraft, FormSchemaLocale, FormSchemaField} from './formSchema'

/** One editor for existing schema-wide relationships; no copied per-field rules. */
export function FormRelationshipControls({schema,language,onChange,visualFieldIds,focusIssue}:{focusIssue?:{groupId?:string;fieldId?:string};visualFieldIds?:readonly string[];schema:FormSchemaDraft;language:FormSchemaLocale;onChange:(schema:FormSchemaDraft)=>void}) {
  const root=useRef<HTMLElement>(null)
  const issues=formRuleStructureIssues(schema)
  useLayoutEffect(()=>{if(!focusIssue)return;const element=[...root.current?.querySelectorAll<HTMLElement>('[data-rule-group],[data-rule-field]')??[]].find(node=>focusIssue.groupId?node.dataset.ruleGroup===focusIssue.groupId:node.dataset.ruleField===focusIssue.fieldId);if(element){element.querySelectorAll('details').forEach(node=>node.open=true);element.scrollIntoView({block:'center'});element.querySelector<HTMLElement>('input,select,button')?.focus({preventScroll:true})}},[focusIssue?.groupId,focusIssue?.fieldId])
  const fields=schema.fields.filter(field=>field.kind!=='hidden')
  const [target,setTarget]=useState(fields[0]?.id??'')
  const patch=(id:string,change:Partial<FormSchemaField>)=>onChange({...schema,fields:schema.fields.map(field=>field.id===id?{...field,...change}:field)})
  return <section ref={root} className="form-relationship-controls" aria-label="قواعد گروهی و ارتباط فیلدهای فرم">
    <h3>قواعد گروهی و ارتباط فیلدهای فرم</h3>
    <p>هر قانون یک‌بار برای همین فرم ذخیره می‌شود. اجباری‌بودن، یکتایی مستقل و رفتار مقدار هر فیلد در تنظیمات همان فیلد باقی می‌ماند.</p>
    <FieldFocusOrderControls schema={schema} language={language} visualFieldIds={visualFieldIds??fields.map(field=>field.id)} onChange={onChange}/>
    {(schema.uniqueConstraints??[]).map(group=><fieldset key={group.id} data-rule-group={group.id} aria-invalid={issues.some(issue=>issue.groupId===group.id)} style={issues.some(issue=>issue.groupId===group.id)?{borderColor:'#b42318'}:undefined}><legend>ترکیب یکتا U₂</legend>
      <p>تکرار هر جزء به‌تنهایی مجاز است؛ ترکیب انتخاب‌شده نباید تکراری باشد.</p>
      {fields.map(field=><label className="form-document-check" key={field.id}><input type="checkbox" checked={group.fieldIds.includes(field.id)} onChange={event=>onChange({...schema,uniqueConstraints:schema.uniqueConstraints?.map(rule=>rule.id===group.id?{...rule,fieldIds:event.target.checked?[...rule.fieldIds,field.id]:rule.fieldIds.filter(id=>id!==field.id)}:rule)})}/>{field.label[language]}</label>)}
      {issues.filter(issue=>issue.groupId===group.id).map(issue=><p role="alert" key={issue.message} style={{color:'#b42318'}}>{issue.message}</p>)}
      <details><summary>دامنهٔ بررسی یکتایی</summary>{fields.filter(field=>!group.fieldIds.includes(field.id)).map(field=><label key={field.id}><input type="checkbox" checked={group.scopeFieldIds?.includes(field.id)??false} onChange={event=>onChange({...schema,uniqueConstraints:schema.uniqueConstraints?.map(rule=>rule.id===group.id?{...rule,scopeFieldIds:event.target.checked?[...rule.scopeFieldIds??[],field.id]:rule.scopeFieldIds?.filter(id=>id!==field.id)}:rule)})}/>{field.label[language]}</label>)}</details>
      <label><input type="checkbox" checked={group.normalizeText!==false} onChange={event=>onChange({...schema,uniqueConstraints:schema.uniqueConstraints?.map(rule=>rule.id===group.id?{...rule,normalizeText:event.target.checked}:rule)})}/>یکسان‌سازی متن برای مقایسه</label>
      <button type="button" onClick={()=>onChange({...schema,uniqueConstraints:schema.uniqueConstraints?.filter(rule=>rule.id!==group.id)})}>حذف این گروه یکتایی</button>
    </fieldset>)}
    <button type="button" disabled={fields.length<2} onClick={()=>onChange({...schema,uniqueConstraints:[...schema.uniqueConstraints??[],{id:'unique.'+crypto.randomUUID(),fieldIds:fields.slice(0,2).map(field=>field.id),normalizeText:true}]})}>افزودن گروه یکتایی ترکیبی U₂</button>
    <h4>وابستگی فیلدها ↔</h4>
    {fields.flatMap(field=>(field.ruleSettings?.dependencies??[]).map((rule,index)=><fieldset key={field.id+':'+index} data-rule-field={field.id}><legend>{field.label[language]}</legend>
      <label>فیلد مرتبط<select aria-label={'فیلد مرتبط با '+field.label[language]} value={rule.fieldId} onChange={event=>patch(field.id,{ruleSettings:{...field.ruleSettings,dependencies:field.ruleSettings?.dependencies?.map((item,i)=>i===index?{...item,fieldId:event.target.value}:item)}})}>{fields.filter(item=>item.id!==field.id).map(item=><option key={item.id} value={item.id}>{item.label[language]}</option>)}</select></label>
      <label>نوع وابستگی<select value={rule.mode} onChange={event=>patch(field.id,{ruleSettings:{...field.ruleSettings,dependencies:field.ruleSettings?.dependencies?.map((item,i)=>i===index?{...item,mode:event.target.value as typeof rule.mode}:item)}})}><option value="requiredWhenFilled">با تکمیل فیلد مرتبط، اجباری شود</option><option value="sameValue">دو مقدار برابر باشند</option><option value="differentValue">دو مقدار متفاوت باشند</option></select></label>
      <button type="button" onClick={()=>patch(field.id,{ruleSettings:{...field.ruleSettings,dependencies:field.ruleSettings?.dependencies?.filter((_,i)=>i!==index)}})}>حذف وابستگی</button>
    </fieldset>))}
    <label>فیلد مقصد قانون<select aria-label="فیلد مقصد قانون وابستگی" value={target} onChange={event=>setTarget(event.target.value)}>{fields.map(field=><option key={field.id} value={field.id}>{field.label[language]}</option>)}</select></label>
    <button type="button" disabled={!fields.some(field=>field.id===target)||fields.length<2} onClick={()=>{const field=fields.find(field=>field.id===target);const source=fields.find(field=>field.id!==target);if(field&&source)patch(field.id,{ruleSettings:{...field.ruleSettings,dependencies:[...field.ruleSettings?.dependencies??[],{fieldId:source.id,mode:'requiredWhenFilled'}]}})}}>افزودن قانون وابستگی ↔</button>
  </section>
}
