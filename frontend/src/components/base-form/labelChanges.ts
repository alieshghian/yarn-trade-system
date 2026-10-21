import type { FormSchemaDraft, FormSchemaLocale } from './formSchema.ts'
import { renameManagedFormField } from './laboratoryFormDraftState.ts'
import { columnSourceFields, keepColumnLabelIndependent, syncColumnLabelFromField, syncColumnLabelToField, updateDocumentColumn } from './formTableStructure.ts'

export type LabelEditTarget={kind:'field'|'column';id:string;tableId?:string;value:string}
export const laboratoryLabelChangeContract={singleConfirmation:true,matchByStableIds:true,repairUnconfirmedLegacyExtras:true,preserveExplicitCompositeSources:true,atomicUndo:true} as const
export function labelChangeSuggestions(schema:FormSchemaDraft,target:LabelEditTarget,locale:FormSchemaLocale) {
  return (schema.tables??[]).flatMap(table=>table.columns.flatMap(column=>{
    const sources=columnSourceFields(schema,column)
    if(target.kind==='field')return sources.includes(target.id)?[{key:table.id+'::'+column.id,tableId:table.id,columnId:column.id,fieldId:target.id,current:column.label[locale],source:table.title?.[locale]??table.id,composite:sources.length>1}]:[]
    return table.id===target.tableId&&column.id===target.id?sources.flatMap(id=>{const field=schema.fields.find(item=>item.id===id);return field?[{key:id,tableId:table.id,columnId:column.id,fieldId:id,current:field.label[locale],source:field.label[locale],composite:sources.length>1}]:[]}):[]
  }))
}
/** Repair only a legacy, unconfirmed extra source with a different explicit primary
 * owner and a separate single-source column of its own. Names never infer links. */
export function labelChangePlan(schema:FormSchemaDraft,target:LabelEditTarget,locale:FormSchemaLocale) {
  let next=schema
  for(const table of schema.tables??[])for(const column of table.columns){
    const sources=columnSourceFields(schema,column)
    if(target.kind==='column'&&(table.id!==target.tableId||column.id!==target.id))continue
    if(target.kind==='field'&&!sources.includes(target.id))continue
    const primary=column.binding.kind==='formField'?column.binding.fieldId:column.binding.kind==='dataField'?column.binding.dataFieldId:undefined
    if(!primary||!schema.fields.some(field=>field.id===primary)||column.labelSyncDecision!=='primary-field'||column.labelSyncFieldId!==primary||column.sourceLinkIntent==='composite'||column.valueComposition!==undefined||column.valueSeparator!==undefined)continue
    const extras=sources.filter(id=>id!==primary&&(target.kind==='column'||id===target.id)&&table.columns.some(other=>{
      const owned=other.binding.kind==='formField'?other.binding.fieldId:other.binding.kind==='dataField'?other.binding.dataFieldId:undefined
      return other.id!==column.id&&owned===id&&columnSourceFields(schema,other).length===1&&columnSourceFields(schema,other)[0]===id
    }))
    if(!extras.length)continue
    const snapshot={...column.sourceFieldLabelSnapshot};for(const id of extras)delete snapshot[id]
    next=updateDocumentColumn(next,table.id,column.id,{sourceFieldIds:sources.filter(id=>!extras.includes(id)),sourceFieldLabelSnapshot:snapshot,labelSyncDecision:column.labelSyncDecision,labelSyncFieldId:primary})
  }
  const suggestions=labelChangeSuggestions(next,target,locale)
  const preferred=suggestions.filter(item=>{
    const column=next.tables?.find(table=>table.id===item.tableId)?.columns.find(column=>column.id===item.columnId)
    return !item.composite||column?.labelSyncFieldId===item.fieldId||item.current.trim()===target.value.trim()
  }).map(item=>item.key)
  const ambiguous=target.kind==='column'?suggestions.length>1&&preferred.length!==1:preferred.length!==suggestions.length
  return {schema:next,suggestions,preferred,ambiguous,repaired:next!==schema}
}
export function applyLabelChange(schema:FormSchemaDraft,target:LabelEditTarget,label:string,locale:FormSchemaLocale,decision:'sync'|'review'|'independent',selected:readonly string[]=[]):FormSchemaDraft {
  const plan=labelChangePlan(schema,target,locale)
  const suggestions=decision==='sync'?plan.suggestions:labelChangeSuggestions(schema,target,locale)
  let next=decision==='sync'?plan.schema:schema
  if(target.kind==='field')next=renameManagedFormField(next,target.id,locale,label)
  else{const column=next.tables?.find(table=>table.id===target.tableId)?.columns.find(item=>item.id===target.id);if(column&&target.tableId)next=updateDocumentColumn(next,target.tableId,target.id,{label:{...column.label,[locale]:label}})}
  for(const item of suggestions){if(decision==='independent')next=keepColumnLabelIndependent(next,item.tableId,item.columnId);else if(decision==='sync'&&selected.includes(item.key))next=target.kind==='field'?syncColumnLabelFromField(next,item.tableId,item.columnId,item.fieldId,locale):syncColumnLabelToField(next,item.tableId,item.columnId,locale,item.fieldId)}
  return next
}
