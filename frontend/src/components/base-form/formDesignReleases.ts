import {isDesignAvailable} from './formDesignLifecycle.ts'
import type { FormSchemaDraft } from './formSchema'
import type { ManagedLaboratoryForm, FormStorage } from './laboratoryFormDraftState'
import { encodeRecoveryJournal, decodeRecoveryJournal } from './formDocumentRecovery.ts'
import { operationalSource } from './operationalFormCatalog.ts'
import { columnSourceFields, fieldColumnLinks } from './formTableStructure.ts'
import {behaviorManifest,readFormBehaviors} from './formBehavior.ts'
import { loadManagedLaboratoryForms, normalizeManagedLaboratoryForm } from './laboratoryFormDraftState.ts'
import type { createFormDesignExport } from './formDesignExport.ts'

export type DesignHandoff = { digest:string; backupId:string; jsonAddress:string; permissionsConfirmedAt:string }
export type DesignRelease = { id:string; formId:string; createdAt:string; status:'awaiting-integration'; change:'appearance'|'fundamental'; snapshot:ManagedLaboratoryForm; behavior?:ReturnType<typeof behaviorManifest>; requirements:string[]; handoff?:DesignHandoff }
export const designReleaseKey=(userId?:string)=>'yarn-trade:form-design-releases:v1:'+encodeURIComponent(userId||'developer-local')
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
const approvalKey=(userId?:string)=>designReleaseKey(userId)+':save-approvals'
const invalidationKey=(userId?:string)=>designReleaseKey(userId)+':invalidated'
export function invalidatedDesignReleases(storage:FormStorage|undefined,userId?:string):Record<string,true>{
 try{const value=JSON.parse(storage?.getItem(invalidationKey(userId))??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}
}
/** Latch invalidation. Undo and an ordinary save cannot approve a changed release. */
export function invalidateChangedDesignReleases(storage:FormStorage|undefined,userId:string|undefined,form:ManagedLaboratoryForm):boolean{
 if(!storage)return false
 const changes=invalidatedDesignReleases(storage,userId),current=normalizeManagedLaboratoryForm(form)
 if(!current)return false
 let changed=false
 for(const release of loadDesignReleases(storage,userId)??[]){if(release.formId===form.id&&release.handoff&&!changes[release.id]&&canonical(normalizeManagedLaboratoryForm(release.snapshot))!==canonical(current)){changes[release.id]=true;changed=true}}
 if(!changed)return false
 storage.setItem(invalidationKey(userId),JSON.stringify(changes))
 const approvals=JSON.parse(storage.getItem(approvalKey(userId))??'{}');delete approvals[form.id];storage.setItem(approvalKey(userId),JSON.stringify(approvals));return true
}
export async function designDigest(value:unknown):Promise<string>{
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))
 return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')
}
/** Explicit permissions/save approval is tied to the exact read-back form, including all overrides. */
export async function approveSavedDesign(storage:FormStorage|undefined,userId:string|undefined,form:ManagedLaboratoryForm):Promise<boolean>{
 if(!storage)return false
 try{const saved=loadManagedLaboratoryForms(storage,userId)?.forms.find(item=>item.id===form.id);if(!saved||canonical(saved)!==canonical(normalizeManagedLaboratoryForm(form)))return false
 const approvals=JSON.parse(storage.getItem(approvalKey(userId))??'{}');const next={...approvals,[form.id]:{digest:await designDigest(saved),confirmedAt:new Date().toISOString()}};storage.setItem(approvalKey(userId),JSON.stringify(next));return storage.getItem(approvalKey(userId))===JSON.stringify(next)}catch{return false}
}
export async function savedDesignApproval(storage:FormStorage|undefined,userId:string|undefined,form:ManagedLaboratoryForm):Promise<{confirmedAt:string}|undefined>{
 if(!storage)return
 try{const saved=loadManagedLaboratoryForms(storage,userId)?.forms.find(item=>item.id===form.id);const approval=JSON.parse(storage.getItem(approvalKey(userId))??'{}')[form.id];if(saved&&canonical(saved)===canonical(normalizeManagedLaboratoryForm(form))&&approval?.digest===await designDigest(saved)&&typeof approval.confirmedAt==='string')return {confirmedAt:approval.confirmedAt}}catch{/* Never infer approval from legacy or unreadable records. */}
}
export async function verifyHandoffDocument(document:ReturnType<typeof createFormDesignExport>,release:DesignRelease):Promise<boolean>{return document?.artifact==='yarn-trade.single-form-design-export'&&document.form?.id===release.formId&&Boolean(release.handoff)&&await designDigest(document)===release.handoff!.digest}
const structure=(schema:FormSchemaDraft)=>({
 behaviorId:schema.settings?.shared?.behaviorId,
 uniqueConstraints:schema.uniqueConstraints,
 fields:schema.fields.map(field=>({id:field.id,kind:field.kind,required:field.required,validation:field.validation,ruleSettings:field.ruleSettings,dataBinding:field.dataBinding,dataSourceId:field.dataSourceId,behaviorId:field.settings?.behaviorId,focusOrder:field.focusOrder,enterTarget:field.settings?.enterTarget,columnLinks:[...fieldColumnLinks(schema,field.id)].sort((a,b)=>(a.tableId+a.columnId).localeCompare(b.tableId+b.columnId))})).sort((a,b)=>a.id.localeCompare(b.id)),
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
export function finalizeDesign(storage:FormStorage|undefined,userId:string|undefined,form:ManagedLaboratoryForm,id:string,now=new Date().toISOString(),handoff?:DesignHandoff):DesignRelease|undefined {
  if(!isDesignAvailable(storage,userId,form.id))return undefined
  const releases=loadDesignReleases(storage,userId)
  if(!storage||!releases||!id||releases.some(item=>item.id===id))return undefined
  const source=operationalSource(form.schema),change=classifyRedesign(form.schema)
  const release:DesignRelease={id,formId:form.id,createdAt:now,status:'awaiting-integration',change,snapshot:structuredClone(form),requirements:[...(source?.api??[]).map(api=>'بررسی و آزمون اتصال '+api),...(source?.sourceFiles??[]).map(file=>'بررسی قرارداد '+file),...(change==='fundamental'?['بررسی تغییرات دیتابیس و مهاجرت سازگار با فرم سالم','آزمون رفتار، اعتبارسنجی، ارتباط جدول‌ها، مرتب‌سازی و مجوزها']:['آزمون حفظ رفتار و اتصال‌های قبلی']), 'تأیید بصری مالک پیش از جایگزینی','نسخه سالم تا تأیید نهایی در مسیر قبلی فعال بماند']}
  try{release.behavior=behaviorManifest(form.schema,readFormBehaviors(storage));if(handoff)release.handoff=structuredClone(handoff);storage.setItem(designReleaseKey(userId),encodeRecoveryJournal({version:1,releases:[...releases,release]}));return release}catch{return undefined}
}
/** A client-side design record cannot authorize operational activation. Source/API integration is required. */
export function mayActivateDesign(_release:DesignRelease):false{return false}
