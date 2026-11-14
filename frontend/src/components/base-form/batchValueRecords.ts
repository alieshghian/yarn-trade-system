import type {BatchValueItem} from './batchValuePattern'
export type BatchValueDetails=Record<string,BatchValueItem[]>
export type BatchMasterRecord={id:string;values:Record<string,string>;details?:BatchValueDetails}
/** Reporting projects children without cloning the business master/public code. */
export function batchValueReportRows(records:readonly BatchMasterRecord[],fieldId?:string){return records.flatMap(record=>{
 const children=fieldId?record.details?.[fieldId]:undefined;
 return children?.length?children.map(item=>({id:record.id+':'+item.id,parentId:record.id,detailId:item.id,values:{...record.values,[fieldId!]:item.value}})):[{id:record.id,parentId:record.id,detailId:'',values:{...record.values}}];
})}
