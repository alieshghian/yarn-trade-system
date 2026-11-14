import { apiRequest, withRowVersion } from '../api'
import { normalizeCascadingSiblingName, type CascadingTreeNode } from '../components/base-form/cascadingTree'
import type { CascadingTreeCreateAdapter } from '../components/base-form/CascadingTreePanels'
import type { GridPage, GridQuery } from '../components/base-form/excelGrid'
import type { productGroupReportRows } from '../components/base-form/productGroupLaboratoryForm'

export type ProductGroupReportRow = ReturnType<typeof productGroupReportRows>[number]
/** Keep the existing grid's server-query/filter protocol and approved data bindings. */
export async function queryProductGroupReport(query: GridQuery, signal?: AbortSignal): Promise<GridPage<ProductGroupReportRow>> {
  const page = await apiRequest<GridPage<{id:string;code:string;level0:string;level1:string;level2:string;level3:string;level4:string}>>(productGroupApiPath+'/grid', {method:'POST',signal,body:JSON.stringify(query)})
  const fieldId='product-group.cascading-tree'
  return {...page,items:page.items.map(row=>{
    const levels=[row.level0,row.level1,row.level2,row.level3,row.level4]
    const values:Record<string,string>={[fieldId+'.code']:row.code,[fieldId]:levels.filter(Boolean).join(' ‹ ')}
    levels.forEach((name,depth)=>{values[fieldId+'.level.'+depth]=name})
    return {id:row.id,...values,__treeFieldId:fieldId,__treeNodeId:row.id,__runtimeValues:values}
  })}
}

export type ProductGroupRecord = CascadingTreeNode & {code: string; hierarchyCode: string; depth: number; rowVersion: string}
export const productGroupApiPath = '/api/master-data/product-groups'
export const readProductGroups = async (signal?: AbortSignal) => (await apiRequest<{items: ProductGroupRecord[]}>(productGroupApiPath, {signal})).items
export const readProductGroupPolicy = (signal?: AbortSignal) => apiRequest<{maxSubgroups: number; rowVersion: string}>(productGroupApiPath + '/policy', {signal})
export const saveProductGroupPolicy = (maxSubgroups: number, rowVersion: string) => apiRequest<{maxSubgroups: number; rowVersion: string}>(productGroupApiPath + '/policy', {method:'PUT',body:JSON.stringify({maxSubgroups,rowVersion})})
export const renameProductGroup = (node: ProductGroupRecord, name: string, signal?: AbortSignal) => apiRequest<ProductGroupRecord>(withRowVersion(productGroupApiPath+'/'+encodeURIComponent(node.id),node.rowVersion),{method:'PUT',signal,body:JSON.stringify({name})})
export const deleteProductGroup = (node: ProductGroupRecord) => apiRequest<void>(withRowVersion(productGroupApiPath+'/'+encodeURIComponent(node.id),node.rowVersion),{method:'DELETE'})
export const copyProductGroupChildren = async (request: {sourceParentId:string;poolSiblingSources?:boolean;poolLevelSources?:boolean;targets:{targetParentId:string;sourceChildIds:string[]}[];signal:AbortSignal}) => (await apiRequest<{items:ProductGroupRecord[]}>(productGroupApiPath+'/copy-children',{method:'POST',signal:request.signal,body:JSON.stringify({sourceParentId:request.sourceParentId,poolSiblingSources:request.poolSiblingSources,poolLevelSources:request.poolLevelSources,targets:request.targets})})).items

/** Keep request identity across an uncertain network result; server verifies payload on reuse.
 * No local allocation, optimistic insertion, synthetic seed or empty-result fallback.
 */
export function productGroupCreateAdapter(): CascadingTreeCreateAdapter {
  const requests = new Map<string,string>()
  return async ({name,parentId,signal}) => {
    const key = JSON.stringify([parentId,normalizeCascadingSiblingName(name)])
    const requestId = requests.get(key) ?? crypto.randomUUID()
    requests.set(key,requestId)
    const node = await apiRequest<ProductGroupRecord>(productGroupApiPath,{method:'POST',signal,body:JSON.stringify({name,parentId,requestId})})
    if (node.parentId !== parentId || !node.id || !node.code || !node.rowVersion) throw Error('پاسخ ثبت گروه معتبر نیست.')
    requests.delete(key)
    return node
  }
}

export function productGroupBatchCreateAdapter() {
 const requests = new Map<string,string[]>()
 return async ({names,parentId,signal}: {names:string[];parentId:string|null;signal:AbortSignal}) => {
  const key=JSON.stringify([parentId,names.map(normalizeCascadingSiblingName)])
  const ids=requests.get(key) ?? names.map(()=>crypto.randomUUID());requests.set(key,ids)
  const result=await apiRequest<{items:ProductGroupRecord[]}>(productGroupApiPath+'/batch',{method:'POST',signal,body:JSON.stringify({items:names.map((name,index)=>({name,parentId,requestId:ids[index]}))})})
  if(result.items.length!==names.length || result.items.some(node=>node.parentId!==parentId || !node.id || !node.code || !node.rowVersion)) throw Error('پاسخ ثبت گروهی معتبر نیست.')
  requests.delete(key);return result.items
 }
}

export const copyProductGroupBranch = async (request: {sourceParentId: string; targetParentId: string; selectedIds: string[]; versions: Record<string,string>; signal: AbortSignal}) => {
  const {signal,...body}=request
  const result=await apiRequest<{items: ProductGroupRecord[]; processedSourceIds: string[]; created: number; existing: number}>('/api/master-data/product-groups/copy-branch',{method:'POST',signal,body:JSON.stringify(body)})
  if (!Array.isArray(result.items) || !Array.isArray(result.processedSourceIds) || result.items.length!==body.selectedIds.length || result.created+result.existing!==body.selectedIds.length || new Set(result.processedSourceIds).size!==body.selectedIds.length || body.selectedIds.some(id=>!result.processedSourceIds.includes(id))) throw Error('تعداد موارد تأییدشده با انتخاب شما برابر نیست؛ اطلاعات سرور را تازه‌سازی کنید و دوباره بررسی کنید.')
  return result.items
}
