import {planCascadingBranchCopy} from '../src/components/base-form/cascadingTree'
import {productGroupReportRows} from '../src/components/base-form/productGroupLaboratoryForm'
import {applyGridFiltersAndSort,gridRowMatchesSearch,type GridQuery} from '../src/components/base-form/excelGrid'
import {createRoot} from 'react-dom/client'
import {ProductGroupOperationalPage} from '../src/forms/ProductGroupOperationalPage'
import type {ProductGroupRecord} from '../src/forms/productGroupApi'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV) throw Error('Isolated tests only')
const params=new URLSearchParams(location.search)
const state = {nodes:JSON.parse(sessionStorage.getItem('isolated-product-group-records') ?? '[]') as ProductGroupRecord[],requests:[] as {method:string;body:unknown}[],fail:false,maxSubgroups:4,policyVersion:"AAAAAAAAAAE=",deferRename:false,finishRename:undefined as (()=>void)|undefined,renameSignal:undefined as AbortSignal|null|undefined}
window.fetch = (async(input, init) => {
 const path = new URL(String(input),location.origin).pathname, method=init?.method ?? 'GET'
 const json=(data:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}))
 const body=init?.body ? JSON.parse(String(init.body)) : undefined
 if(path.endsWith('/assignment'))return json({selectable:!state.fail,message:state.fail?'گروه قابل انتخاب نیست.':''})
 if(path==='/api/master-data/product-groups/grid') {
   state.requests.push({method,body})
   const query=body as GridQuery,field='product-group.cascading-tree'
   const columns=['code',...Array.from({length:5},(_,i)=>'level.'+i)].map(key=>({id:field+'.'+key,label:key,width:160,type:'text' as const,value:(row:ReturnType<typeof productGroupReportRows>[number])=>row.__runtimeValues[field+'.'+key]}))
   let rows=productGroupReportRows(field,state.nodes)
   if(query.search)rows=rows.filter(row=>gridRowMatchesSearch(row,columns,query.search,query.searchMode)!==!!query.reverseSearch)
   const filters={...query.filters};if(query.optionsColumn)delete filters[query.optionsColumn]
   rows=applyGridFiltersAndSort(rows,columns,filters,query.sort,query.language ?? 'fa')
   if(query.optionsColumn) return json({items:[],total:0,page:query.page,pageSize:query.pageSize,filterValues:[...new Set(rows.map(row=>row.__runtimeValues[query.optionsColumn!]))].filter(value=>!query.optionsSearch || value.includes(query.optionsSearch)).slice(0,500)})
   return json({items:rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize).map(row=>({id:row.id,code:row.__runtimeValues[field+'.code'],...Object.fromEntries(Array.from({length:5},(_,i)=>['level'+i,row.__runtimeValues[field+'.level.'+i]]))})),total:rows.length,page:query.page,pageSize:query.pageSize})
 }
 if(path==='/api/master-data/product-groups/batch') {
   state.requests.push({method,body})
   if(state.fail) return json({error:'ثبت گروهی انجام نشد'},409)
   const items:ProductGroupRecord[]=body.items.map((item:{name:string;parentId:string|null},index:number)=>{const parent=state.nodes.find(n=>n.id===item.parentId);return {id:crypto.randomUUID(),parentId:item.parentId,name:item.name,code:parent?.code ?? String(index+1).padStart(3,'0'),hierarchyCode:(parent?.hierarchyCode ?? '')+'.'+(index+1),depth:parent?parent.depth+1:0,rowVersion:'AAAAAAAAAAE='}})
   state.nodes.push(...items);return json({items})
 }
 if(path==='/api/master-data/product-groups/copy-branch') {
   state.requests.push({method,body})
   if(state.fail) return json({error:'کپی شاخه انجام نشد'},409)
   const plan=planCascadingBranchCopy(state.nodes,body.sourceParentId,body.targetParentId,body.selectedIds,state.maxSubgroups,()=>crypto.randomUUID())
   const items=plan.items.map(node=>{const parent=state.nodes.find(n=>n.id===node.parentId) ?? plan.items.find(n=>n.id===node.parentId);return {...node,depth:parent && 'depth' in parent ? Number(parent.depth)+1 : 1,hierarchyCode:node.id,rowVersion:'AAAAAAAAAAE='} as ProductGroupRecord})
   const merged=new Map(state.nodes.map(n=>[n.id,n]));items.forEach(n=>merged.set(n.id,n));state.nodes=[...merged.values()];return json({items,processedSourceIds:body.selectedIds,created:plan.created,existing:plan.existing})
 }
 if(path==='/api/master-data/product-groups/copy-children') {
   state.requests.push({method,body})
   if(state.fail) return json({error:'کپی انجام نشد'},409)
   const source=state.nodes.find(n=>n.id===body.sourceParentId)!
   const copied=state.nodes.filter(n=>body.poolLevelSources ? n.code===source.code && n.depth===source.depth+1 && n.parentId!==source.id : body.poolSiblingSources ? n.parentId!==source.id && state.nodes.some(p=>p.id===n.parentId && p.parentId===source.parentId) : n.parentId===source.id)
   const targets=body.targets ?? [{targetParentId:body.targetParentId,sourceChildIds:copied.map(n=>n.id)}]
   for(const target of targets) {
     const parent=state.nodes.find(n=>n.id===target.targetParentId)!
     for(const child of copied.filter(n=>target.sourceChildIds.includes(n.id))) if(!state.nodes.some(n=>n.parentId===parent.id && n.name.replace(/\s/g,'')===child.name.replace(/\s/g,''))) state.nodes.push({...child,id:crypto.randomUUID(),parentId:parent.id,code:parent.code,hierarchyCode:parent.hierarchyCode+'.'+crypto.randomUUID(),depth:parent.depth+1})
   }
   return json({items:state.nodes.filter(n=>targets.some((target:{targetParentId:string})=>target.targetParentId===n.parentId))})
 }
 if(path.endsWith('/policy')) {
   state.requests.push({method,body})
   if(method==='PUT') {
     if(state.nodes.some(n=>n.depth>body.maxSubgroups)) return json({error:'در سطوح پایین‌تر گروه ثبت شده است؛ کاهش سطح مجاز نیست.'},409)
     state.maxSubgroups=body.maxSubgroups;state.policyVersion='AAAAAAAAAAI='
   }
   return json({maxSubgroups:state.maxSubgroups,rowVersion:state.policyVersion})
 }
 const existingNode=state.nodes.find(n=>path.endsWith('/'+n.id))
 if(existingNode && ['PUT','DELETE'].includes(method)) {
   state.requests.push({method,body})
   if(state.fail) return json({error:'تعارض نسخه'},409)
   if(method==='PUT' && state.deferRename) return new Promise<Response>(resolve=>{state.renameSignal=init?.signal;state.finishRename=()=>{state.deferRename=false;void json({...existingNode,name:body.name,rowVersion:'AAAAAAAAAAM='}).then(resolve)}})
   if(method==='PUT') {existingNode.name=body.name;existingNode.rowVersion='AAAAAAAAAAI=';return json(existingNode)}
   if(state.nodes.some(n=>n.parentId===existingNode.id)) return json({error:'گروه دارای زیرگروه قابل حذف نیست.'},409)
   state.nodes.splice(state.nodes.indexOf(existingNode),1);return Promise.resolve(new Response(null,{status:204}))
 }
 if(path==='/api/navigation') return json({nodes:[],preferences:{},rowVersion:''})
 if(path==='/api/form-laboratory/synthetic-grid') return json({items:[],total:0,page:1,pageSize:50})
 if(path!=='/api/master-data/product-groups') throw Error('Unexpected test request: '+path)
 state.requests.push({method,body})
 if(method==='GET') return json({items:state.nodes})
 if(state.fail) return json({error:'نام تکراری است'},409)
 const parent=state.nodes.find(n=>n.id===body.parentId)
 const node:ProductGroupRecord={id:crypto.randomUUID(),parentId:body.parentId,name:body.name,code:parent?.code ?? '007',hierarchyCode:parent ? parent.hierarchyCode+'.001' : '007',depth:parent ? parent.depth+1 : 0,rowVersion:'AAAAAAAAAAE='}
 state.nodes.push(node);return json(node,201)
}) as typeof fetch
const root=createRoot(document.getElementById('root')!)
if(params.has('reference')) {
 const [{default:FormLaboratoryPage},{writeFormRecovery},{createDesignerHistory,attachDesignerDocument},{default:design}] = await Promise.all([import('../src/FormLaboratoryPage'),import('../src/components/base-form/formDocumentRecovery'),import('../src/components/base-form/designer'),import('../src/forms/product-group-design.json')])
 const form=design.form as unknown as import('../src/components/base-form/laboratoryFormDraftState').ManagedLaboratoryForm
 const draft=design.designerDraft as unknown as import('../src/components/base-form/designer').DesignerDraft
 writeFormRecovery(localStorage,'isolated-product-group-reference',{form,designerHistory:attachDesignerDocument(createDesignerHistory(draft),form.schema),structureHistory:{past:[],present:form.schema,future:[]}},'Pinned Product Group reference')
 root.render(<FormLaboratoryPage language="fa" authenticatedUserId="isolated-product-group-reference"/>)
} else root.render(<ProductGroupOperationalPage language="fa" can={operation=>!params.has("denied") || !["create","edit","delete","configure"].includes(operation)} isAdministrator={!params.has("nonadmin")} lookupCreation={params.has('lookup')?{onSelected:async id=>{Object.assign(window,{chosenGroup:id})}}:undefined}/>)
Object.assign(window,{groupTest:state})
