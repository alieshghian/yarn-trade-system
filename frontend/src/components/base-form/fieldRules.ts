import type { FormSchemaDraft, FormSchemaField } from './formSchema.ts'

/** Shared Laboratory contract; labels are presentation and never choose behavior. */
export const laboratoryFieldRuleContract = { version: 1, markers: { required: '*', unique: 'U', composite: 'U₂', dependency: '↔' }, normalizeText: true, scope: 'form-records', partialComposite: 'validate-when-complete', emptyUnique: 'ignore-unless-required', edit: 'exclude-current-record', close: 'save-discard-continue' } as const
export function effectiveFieldRules(field:FormSchemaField) {
  const code=['base-form.code-input','base-form.incremental-code'].includes(field.componentId), settings=field.settings?.componentSettings as {required?:boolean;unique?:boolean}|undefined
  return { required:field.required??(code?settings?.required??true:false),unique:field.validation?.some(rule=>rule.type==='unique')===true||(code?(settings?.unique??true):false),code }
}
export function normalizeRuleText(value: unknown, normalize = true): string {
  const text = String(value ?? '')
  return normalize ? text.normalize('NFC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').trim().replace(/\s+/g, ' ') : text
}
export function fieldRuleMarkers(schema: FormSchemaDraft, field: FormSchemaField): { symbol: string; description: string }[] {
  const rules=effectiveFieldRules(field)
  return [
    ...(rules.required ? [{ symbol: '*', description: 'اجباری؛ مقدار خالی پذیرفته نمی‌شود' }] : []),
    ...(rules.unique ? [{ symbol: 'U', description: 'مقدار یکتا در دامنهٔ تعیین‌شده' }] : []),
    ...(schema.uniqueConstraints?.some(rule => rule.fieldIds.includes(field.id)) ? [{ symbol: 'U₂', description: 'یکتایی ترکیبی با فیلدهای گروه' }] : []),
    ...(field.ruleSettings?.dependencies?.length ? [{ symbol: '↔', description: 'دارای قانون وابستگی به فیلد دیگر' }] : [])
  ]
}
export function validateRecordRules(schema: FormSchemaDraft, values: Record<string, string>, records: readonly { id: string; values: Record<string, string> }[] = [], currentId?: string | null): Record<string, string> {
  const errors: Record<string,string> = {}
  const duplicate = (ids: readonly string[], scope: readonly string[], normalize: boolean) => records.some(row => row.id !== currentId && [...ids, ...scope].every(id => normalizeRuleText(row.values[id], normalize) === normalizeRuleText(values[id], normalize)))
  for (const field of schema.fields) {
    if (field.readOnly || field.kind === 'hidden') continue
    const settings = field.ruleSettings, normalize = settings?.normalizeText !== false, value = normalizeRuleText(values[field.id], normalize)
    const scope = settings?.scopeFieldIds ?? []
    if (effectiveFieldRules(field).unique && (scope.some(id=>!schema.fields.some(item=>item.id===id)))) errors[field.id]='فیلد دامنهٔ یکتایی حذف شده است؛ قانون را اصلاح کنید.'
    else if (value && effectiveFieldRules(field).unique && duplicate([field.id], scope, normalize)) errors[field.id]='این مقدار در دامنهٔ تعیین‌شده تکراری است.'
    for (const rule of settings?.dependencies ?? []) {
      const source = schema.fields.find(item=>item.id===rule.fieldId)
      if (!source || source.id===field.id) { errors[field.id]='فیلد وابسته نامعتبر است؛ قانون را اصلاح کنید.'; continue }
      const other = normalizeRuleText(values[source.id], normalize)
      if (rule.mode==='requiredWhenFilled' && other && !value) errors[field.id]=`با تکمیل «${source.label.fa}»، این فیلد اجباری است.`
      if (rule.mode==='sameValue' && (value || other) && value!==other) errors[field.id]=`مقدار باید با «${source.label.fa}» برابر باشد.`
      if (rule.mode==='differentValue' && value && other && value===other) errors[field.id]=`مقدار باید با «${source.label.fa}» متفاوت باشد.`
    }
  }
  for (const rule of schema.uniqueConstraints ?? []) {
    const ids=[...new Set(rule.fieldIds)], normalize=rule.normalizeText!==false, scope=rule.scopeFieldIds??[]
    if(ids.length<2 || [...ids,...scope].some(id=>!schema.fields.some(field=>field.id===id))) { const targets=ids.filter(id=>schema.fields.some(field=>field.id===id));for(const id of targets.length?targets:['unique:'+rule.id])errors[id]='ساختار گروه یکتایی ناقص است؛ منابع قانون را اصلاح کنید.';continue }
    if(ids.every(id=>normalizeRuleText(values[id],normalize)) && duplicate(ids,scope,normalize))for(const id of ids)errors[id]='این ترکیب در دامنهٔ تعیین‌شده قبلاً ثبت شده است.'
  }
  return errors
}
