import type { FormSchemaDraft } from './formSchema'
import type { ManagedLaboratoryForm, FormStorage } from './laboratoryFormDraftState'
import { encodeRecoveryJournal, decodeRecoveryJournal } from './formDocumentRecovery.ts'
import { operationalSource } from './operationalFormCatalog.ts'
import { columnSourceFields, fieldColumnLinks } from './formTableStructure.ts'
import {behaviorManifest,readFormBehaviors} from './formBehavior.ts'

export type DesignRelease = { id:string; formId:string; createdAt:string; status:'awaiting-integration'; change:'appearance'|'fundamental'; snapshot:ManagedLaboratoryForm; behavior?:ReturnType<typeof behaviorManifest>; requirements:string[] }
export const designReleaseKey=(userId?:string)=>'yarn-trade:form-design-releases:v1:'+encodeURIComponent(userId||'developer-local')
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
const structure=(schema:FormSchemaDraft)=>({
 behaviorId:schema.settings?.shared?.behaviorId,
 uniqueConstraints:schema.uniqueConstraints,
 fields:schema.fields.map(field=>({id:field.id,kind:field.kind,required:field.required,validation:field.validation,ruleSettings:field.ruleSettings,dataBinding:field.dataBinding,dataSourceId:field.dataSourceId,behaviorId:field.settings?.behaviorId,enterTarget:field.settings?.enterTarget,columnLinks:[...fieldColumnLinks(schema,field.id)].sort((a,b)=>(a.tableId+a.columnId).localeCompare(b.tableId+b.columnId))})).sort((a,b)=>a.id.localeCompare(b.id)),
 tables:schema.tables?.map(table=>({id:table.id,dataSourceId:table.dataSourceId,masterDetail:table.masterDetail,filters:table.filters,defaultSort:table.defaultSort,groupBy:table.groupBy,summary:table.summary,columns:table.columns.map(column=>({id:column.id,binding:column.binding,valueType:column.valueType,sourceFieldIds:[...columnSourceFields(schema,column)],valueComposition:column.valueComposition??'space',valueSeparator:column.valueComposition==='custom'?column.valueSeparator??'':undefined})).sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.id.localeCompare(b.id)),
 actions:schema.actions?.map(action=>({id:action.id,operationId:action.operationId,permissionId:action.permissionId})).sort((a,b)=>a.id.localeCompare(b.id)),resources:schema.resources,behaviorInstruction:schema.behaviorInstruction
})
export function classifyRedesign(schema:FormSchemaDraft):'appearance'|'fundamental' {
  const source=operationalSource(schema)
  if(!source||schema.settings?.specific?.values?.redesignIntent==='fundamental')return 'fundamental'
  return canonical(structure(schema))===canonical(structure(source.baseline))?'appearance':'fundamental'
}
export function loadDesignReleases(storage:FormStorage|undefined,userId?:string):DesignRelease[]|null {
  if(!storage)return null
  try{const raw=storage.getItem(designReleaseKey(userId));if(!raw)return []
    const value=decodeRecoveryJournal(raw) as {version:number;releases:DesignRelease[]}
    if(value?.version!==1||!Array.isArray(value.releases)||value.releases.some(release=>!release?.id||release.formId!==release.snapshot?.id||release.status!=='awaiting-integration'||!Array.isArray(release.snapshot.schema?.fields)))return null
    return value.releases
  }catch{return null}
}
/** Remove only the integration-queue entry; the saved design form remains in laboratory storage. */
export function removeDesignRelease(storage:FormStorage|undefined,userId:string|undefined,releaseId:string):boolean {
  if(!storage||!releaseId)return false
  const releases=loadDesignReleases(storage,userId)
  if(!releases||!releases.some(release=>release.id===releaseId))return false
  try{
    storage.setItem(designReleaseKey(userId),encodeRecoveryJournal({version:1,releases:releases.filter(release=>release.id!==releaseId)}))
    return true
  }catch{return false}
}
export function finalizeDesign(storage:FormStorage|undefined,userId:string|undefined,form:ManagedLaboratoryForm,id:string,now=new Date().toISOString()):DesignRelease|undefined {
  const releases=loadDesignReleases(storage,userId)
  if(!storage||!releases||!id||releases.some(item=>item.id===id))return undefined
  const source=operationalSource(form.schema),change=classifyRedesign(form.schema)
  const release:DesignRelease={id,formId:form.id,createdAt:now,status:'awaiting-integration',change,snapshot:structuredClone(form),requirements:[...(source?.api??[]).map(api=>'بررسی و آزمون اتصال '+api),...(source?.sourceFiles??[]).map(file=>'بررسی قرارداد '+file),...(change==='fundamental'?['بررسی تغییرات دیتابیس و مهاجرت سازگار با فرم سالم','آزمون رفتار، اعتبارسنجی، ارتباط جدول‌ها، مرتب‌سازی و مجوزها']:['آزمون حفظ رفتار و اتصال‌های قبلی']), 'تأیید بصری مالک پیش از جایگزینی','نسخه سالم تا تأیید نهایی در مسیر قبلی فعال بماند']}
  try{release.behavior=behaviorManifest(form.schema,readFormBehaviors(storage));storage.setItem(designReleaseKey(userId),encodeRecoveryJournal({version:1,releases:[...releases,release]}));return release}catch{return undefined}
}
/** A client-side design record cannot authorize operational activation. Source/API integration is required. */
export function mayActivateDesign(_release:DesignRelease):false{return false}
