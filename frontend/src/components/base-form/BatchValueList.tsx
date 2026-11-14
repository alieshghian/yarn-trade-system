import type {ComponentProps} from 'react'
import {NumberControl} from './NumberControl'
import {gridDisplayValue} from './excelGrid'
import {batchValueKey,suggestBatchValue,reconcileBatchValues,type BatchValueItem} from './batchValuePattern'
export type {BatchValueItem} from './batchValuePattern'
type Props=Omit<ComponentProps<typeof NumberControl>,'primary'|'numbers'|'listPrimary'|'onChange'|'onSelectValue'|'multiline'|'getItemKey'|'protectedMode'|'keyboardPrimarySelection'|'suggestNextEntry'|'normalizeEntry'> & {
 readOnly?:boolean;items:BatchValueItem[];selectedId:string;onSelect:(id:string)=>void;
 onCommit:(items:BatchValueItem[],selectedId:string)=>boolean|void|Promise<boolean|void>
}
/** Text colors/codes share the existing list editor; technical identities never appear as user codes. */
export function BatchValueList({items,selectedId,onSelect,onCommit,readOnly=false,...props}:Props){
 const selected=items.find(item=>item.id===selectedId)?.value??'';
 return <NumberControl {...props} formatValue={props.formatValue??gridDisplayValue} canAdd={!readOnly&&props.canAdd!==false} browseOnly={readOnly} listSettings={readOnly?{...props.listSettings,permissions:{add:'none',edit:'none',remove:'none',setDefault:'none'}}:props.listSettings} componentDefinitionId={props.componentDefinitionId??'base-form.batch-values'} multiline protectedMode keyboardPrimarySelection primary={selected} listPrimary={selected} numbers={items.map(item=>item.value)} getItemKey={value=>items.find(item=>item.value===value)?.id??value} onSelectValue={value=>onSelect(items.find(item=>item.value===value)?.id??'')} suggestNextEntry={suggestBatchValue} normalizeEntry={batchValueKey} onChange={async(primary,values,origins)=>{const next=reconcileBatchValues(items,values,origins,()=>crypto.randomUUID());return onCommit(next,next.find(item=>item.value===primary)?.id??'')}} />
}
