import type { FormSchemaField } from './formSchema'

export type DerivedSourceFormat={mode?:'value'|'valueLabel'|'labelValue'|'label';label?:string}
export type DerivedFieldSettings = { sourceFieldIds: readonly string[]; separator?: string; sourceFormats?:Readonly<Record<string,DerivedSourceFormat>> }
export type DerivedFieldParts = { parts: string[]; separator: string }

export function moveDerivedSource(sourceFieldIds: readonly string[], fieldId: string, offset: -1 | 1): string[] {
  const next = [...new Set(sourceFieldIds)]
  const index = next.indexOf(fieldId), target = index + offset
  if (index < 0 || target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
export function derivedFieldSettings(field: Pick<FormSchemaField, 'settings'>): DerivedFieldSettings {
  const raw = field.settings?.derivedSettings
  if (!raw || typeof raw !== 'object') return { sourceFieldIds: [], separator: ' ' }
  const config = raw as Partial<DerivedFieldSettings>
  return {
    sourceFieldIds: Array.isArray(config.sourceFieldIds) ? [...new Set(config.sourceFieldIds.filter(id => typeof id === 'string'))] : [],
    separator: typeof config.separator === 'string' ? config.separator : ' ',
    ...(config.sourceFormats&&typeof config.sourceFormats==='object'?{sourceFormats:Object.fromEntries(Object.entries(config.sourceFormats).filter(([,v])=>v&&typeof v==='object').map(([id,v])=>[id,{mode:['value','valueLabel','labelValue','label'].includes(v.mode??'')?v.mode:'value',...(typeof v.label==='string'?{label:v.label}:{})}]))}:{})
  }
}

function createDerivedResolver(fields: readonly FormSchemaField[], values: Readonly<Record<string, string>>, language: keyof FormSchemaField['label'] = 'fa') {
  const byId = new Map(fields.map(field => [field.id, field]))
  const memo = new Map<string, string>()
  const part=(config:DerivedFieldSettings,id:string,path:ReadonlySet<string>):string=>{const value=resolve(id,path);if(!value.trim())return '';const format=config.sourceFormats?.[id];if(!format||format.mode==='value')return value;const label=format.label??byId.get(id)?.label[language]??'';return format.mode==='label'?label:format.mode==='labelValue'?[label,value].filter(Boolean).join(' '):[value,label].filter(Boolean).join(' ');}
  const resolve = (id: string, path: ReadonlySet<string>): string => {
    if (path.has(id)) return ''
    const field = byId.get(id)
    if (!field || field.componentId !== 'base-form.derived-display') return values[id] ?? ''
    if (memo.has(id)) return memo.get(id)!
    const nextPath = new Set(path); nextPath.add(id)
    const config = derivedFieldSettings(field)
    const result = config.sourceFieldIds.map(sourceId => part(config,sourceId, nextPath)).filter(value => value.trim()).join(config.separator ?? ' ')
    memo.set(id, result)
    return result
  }
  return { byId, resolve, part }
}

/** Keeps configured source order while exposing isolated display parts for mixed-direction locales. */
export function evaluateDerivedFieldParts(fields: readonly FormSchemaField[], values: Readonly<Record<string, string>>, fieldId: string, language: keyof FormSchemaField['label'] = 'fa'): DerivedFieldParts {
  const { byId, resolve, part } = createDerivedResolver(fields, values,language)
  const field = byId.get(fieldId)
  if (!field || field.componentId !== 'base-form.derived-display') return { parts: [values[fieldId] ?? ''], separator: ' ' }
  const config = derivedFieldSettings(field)
  const path = new Set([fieldId])
  const parts = config.sourceFieldIds.map(sourceId => part(config,sourceId, path)).filter(value => value.trim())
  return { parts, separator: config.separator ?? ' ' }
}

/** Resolves composed fields recursively and safely; cycles and missing sources contribute no text. */
export function evaluateDerivedFields(fields: readonly FormSchemaField[], values: Readonly<Record<string, string>>, language: keyof FormSchemaField['label'] = 'fa'): Record<string, string> {
  const {resolve}=createDerivedResolver(fields,values,language)
  const result={...values}
  for(const field of fields)if(field.componentId==='base-form.derived-display')result[field.id]=resolve(field.id,new Set())
  return result
}
