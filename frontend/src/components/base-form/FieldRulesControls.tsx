import {numericFieldPlaces} from './numericField'
import type { FormSchemaDraft, FormSchemaField, FormSchemaLocale } from './formSchema'
import { effectiveFieldRules, laboratoryFieldRuleContract } from './fieldRules'

export function FieldRuleLegend() {
  return <p className="field-rule-legend"><b>{laboratoryFieldRuleContract.markers.required}</b> اجباری؛ <b>U</b> یکتای مستقل؛ <b>U₂</b> ترکیب یکتا؛ <b>↔</b> وابستگی. علامت‌ها از قانون ساخته می‌شوند و بخشی از متن برچسب نیستند.</p>
}
export function FieldRulesControls({ schema, field, language, onChange }: { schema: FormSchemaDraft; field: FormSchemaField; language: FormSchemaLocale; onChange: (schema: FormSchemaDraft) => void }) {
  const patch = (change: Partial<FormSchemaField>) => onChange({ ...schema, fields: schema.fields.map(item=>item.id===field.id?{...item,...change}:item) })
  const settings = field.ruleSettings ?? {}
  const effective=effectiveFieldRules(field)
  const codeSetting=(key:'required'|'unique',value:boolean)=>effective.code?{settings:{...field.settings,componentSettings:{...(field.settings?.componentSettings as Record<string,unknown>??{}),[key]:value}}}:{}
  const scopeControls=(ids:readonly string[],excluded:readonly string[],update:(ids:string[])=>void)=><details><summary>دامنهٔ یکتایی: {ids.length?ids.map(id=>schema.fields.find(item=>item.id===id)?.label[language]??id).join('، '):'همهٔ رکوردهای همین فرم'}</summary><small>انتخاب شرکت یا شعبه، تکرار را فقط در همان شرکت یا شعبه بررسی می‌کند.</small>{schema.fields.filter(item=>!excluded.includes(item.id)).map(item=><label className="form-document-check" key={item.id}><input type="checkbox" checked={ids.includes(item.id)} onChange={event=>update(event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>{item.label[language]}</label>)}</details>
  return <details className="form-structure-disclosure form-field-rules-disclosure"><summary>قوانین فیلد — {field.label[language]}</summary><fieldset className="field-rules-controls"><FieldRuleLegend/>
    <label className="form-document-check"><input aria-label="قانون اجباری" type="checkbox" checked={effective.required} onChange={event=>patch({required:event.target.checked,...codeSetting('required',event.target.checked)})}/> * — اجباری</label>
    <label className="form-document-check"><input aria-label="قانون یکتای مستقل" type="checkbox" checked={effective.unique} onChange={event=>patch({validation:[...(field.validation??[]).filter(rule=>rule.type!=='unique'),...(event.target.checked?[{type:'unique' as const}]:[])],...codeSetting('unique',event.target.checked)})}/> U — مقدار تکراری پذیرفته نشود</label>
    <small>یکتایی مستقل، استفادهٔ دوباره از این مقدار در رکوردهای فرم را ممنوع می‌کند؛ برای مشخصات مشترک مثل جنس، رنگ یا واحد از این قانون استفاده نکنید. جلوگیری از گزینهٔ تکراری داخل خودِ کامپوننت، جداگانه برقرار است.</small>
    <label className="form-document-check"><input aria-label="یکسان‌سازی متن برای مقایسه" type="checkbox" checked={settings.normalizeText!==false} onChange={event=>patch({ruleSettings:{...settings,normalizeText:event.target.checked}})}/> حذف فاصله‌های اضافی و یکسان‌سازی «ی/ي» و «ک/ك» برای مقایسه</label>
    {effective.unique&&scopeControls(settings.scopeFieldIds??[],[field.id],ids=>patch({ruleSettings:{...settings,scopeFieldIds:ids}}))}
    {(field.kind==='number'||field.valueType==='number')&&!effective.code&&<label>تعداد رقم اعشار مجاز<select aria-label="تعداد رقم اعشار مجاز" value={numericFieldPlaces(field)??'any'} onChange={event=>patch({settings:{...field.settings,numericSettings:{decimalPlaces:event.target.value==='any'?null:Number(event.target.value)}},validation:(field.validation??[]).filter(rule=>rule.type!=='integer')})}><option value="any">اعشار آزاد</option>{Array.from({length:13},(_,n)=><option key={n} value={n}>{n===0?'بدون اعشار؛ عدد صحیح':n+' رقم اعشار'}</option>)}</select><small>مقدار گرد نمی‌شود؛ اعشار بیش از حد تعیین‌شده با پیام فارسی مشخص می‌شود.</small></label>}
    <small>یکتایی ترکیبی و وابستگی بین فیلدها در «قواعد گروهی و ارتباط فیلدهای فرم» مدیریت می‌شود.</small>
    <small>یکتایی روی رکوردهای آزمایشی کنترل می‌شود. هنگام اتصال عملیاتی، همین قرارداد باید سمت سرور و دیتابیس اعمال شود؛ رکورد جاری در ویرایش با خودش مقایسه نمی‌شود.</small>
  </fieldset></details>
}
