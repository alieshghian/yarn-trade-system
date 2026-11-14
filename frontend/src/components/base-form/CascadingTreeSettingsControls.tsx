import type {FormSchemaDraft,FormSchemaField} from './formSchema'
import {cascadingTreeSettingsFromField} from './productGroupLaboratoryForm'

/** Authoring/admin schema setting, never a per-user appearance override. */
export function withCascadingTreeDepth(schema:FormSchemaDraft,fieldId:string,count:number):FormSchemaDraft {
  if(!Number.isInteger(count)||count<0||count>4)return schema
  return {...schema,fields:schema.fields.map(field=>field.id===fieldId&&field.componentId==='base-form.cascading-tree-panels'?{...field,settings:{...field.settings,cascadingTree:{...(field.settings?.cascadingTree as Record<string,unknown>??{}),maxSubgroups:count}}}:field)}
}
export function CascadingTreeSettingsControls({schema,field,language,onChange}:{schema:FormSchemaDraft;field:FormSchemaField;language:'fa'|'en'|'zh';onChange:(schema:FormSchemaDraft)=>void}) {
  const fa=language==='fa',count=cascadingTreeSettingsFromField(field.settings).maxSubgroups??4
  return <label>{fa?'تعداد زیرگروه‌های فعال':'Active subgroup levels'}<select aria-label={(fa?'تعداد زیرگروه‌های فعال — ':'Active subgroup levels — ')+field.label[language]} value={count} onChange={event=>onChange(withCascadingTreeDepth(schema,field.id,Number(event.target.value)))}>{[0,1,2,3,4].map(value=><option key={value} value={value}>{value===0?(fa?'فقط گروه اصلی':'Root only'):value+(fa?' زیرگروه':' subgroup levels')}</option>)}</select><small>{fa?'تنظیم مدیر فرم: گروه اصلی همیشه فعال است. سطوح غیرفعال پنهان و غیرقابل استفاده می‌شوند؛ گروه‌ها، شناسه‌ها و داده‌های قبلی حذف نمی‌شوند.':'Form administrator setting: the root remains active. Disabled levels are hidden and unavailable; existing groups, IDs and data are retained.'}</small></label>
}
