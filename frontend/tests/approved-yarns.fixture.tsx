import {createRoot} from 'react-dom/client'
import ApprovedYarnsPage from '../src/forms/ApprovedYarnsPage'
import {approvedYarnDefinition as design,approvedYarnSchema as schema} from '../src/forms/approvedYarnDesign'
import {ComponentListProvider} from '../src/components/base-form/ComponentListContext'
import {installFormInteraction} from '../src/formInteraction'
import {setAccessPermissions} from '../src/api'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV)throw Error('Isolated integration fixture only')
setAccessPermissions(['yarns.view','yarns.create','yarns.edit','yarns.delete','productGroups.view','productGroups.create'])
const calls:unknown[]=[],empty=new URLSearchParams(location.search).has('empty'),large=new URLSearchParams(location.search).has('large')
const references=schema.fields.filter(f=>f.componentId==='persons.title-control').flatMap(f=>[1,2].map(i=>({id:crypto.randomUUID(),fieldId:f.id,name:f.label.fa+' '+i,isDefault:i===1,rowVersion:'AAAAAAAAAAA='})))
references.push({id:crypto.randomUUID(),fieldId:'packaging',name:'کارتن',isDefault:true,rowVersion:'AAAAAAAAAAA='})
let master:any={id:'11111111-1111-1111-1111-111111111111',code:'001',name:'DTY',productGroupId:'22222222-2222-2222-2222-222222222222',unitOfMeasure:'کیلو',material:'پلی استر',luster:'براق',continuityType:'اینترمینگل',countType:'دنیر',twistType:'ریس',countValue:300,filamentNumber:288,plyCount:2,isActive:true,comprehensiveName:'DTY پلی استر براق 300 دنیر 288 فیلامنت 2 لا',rowVersion:'AAAAAAAAAAA=',definition:{releaseId:design.integrationHandoff.releaseId,values:{},colors:[{id:'33333333-3333-3333-3333-333333333333',value:'110',isDefault:true},{id:'44444444-4444-4444-4444-444444444444',value:'120',isDefault:false}],packaging:[{id:crypto.randomUUID(),packagingId:references.at(-1)!.id,packagingName:'کارتن',cbmPerTon:2.74,isDefault:true}]}}
Object.assign(window,{approvedYarnCalls:calls,approvedYarnMaster:()=>master,approvedYarnSchema:schema,approvedYarnDesigner:design.designerDraft})
window.fetch=(async(input,init)=>{
 const u=new URL(String(input instanceof Request?input.url:input),location.origin),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({path:u.pathname,method,body})
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 if(method==='PUT'&&u.pathname==='/api/yarns/'+master.id&&(window as any).failNextYarnSave){const kind=(window as any).failNextYarnSave;delete (window as any).failNextYarnSave;if(kind==='network')throw new TypeError('Network unavailable');return json({error:'نسخه همزمان تغییر کرده است.'},409)}
 if(u.pathname==='/api/yarns/definition-number-options')return json([300,305,310])
 if(u.pathname==='/api/yarns/definition-references')return json(references)
 if(u.pathname==='/api/yarns/definition-latest')return json(master)
 if(u.pathname==='/api/yarns/definition-grid'){let rows=empty?[]:master.definition.colors.map((c:any)=>({id:c.id,yarnId:master.id,colorId:c.id,code:master.code,comprehensiveName:master.comprehensiveName,color:c.value,material:master.material,luster:master.luster,countValue:String(master.countValue),countType:master.countType,status:'فعال',yarnGroup:'گروه واقعی',filamentNumber:String(master.filamentNumber),continuityType:master.continuityType}));const page=body.page??1,size=Math.min(body.pageSize??100,500);if(large)rows=Array.from({length:size},(_,i)=>({...rows[i%rows.length],id:'report-'+((page-1)*size+i)}));return json({items:body.optionsColumn?[]:rows,total:large?100000:rows.length,page:large?page:1,pageSize:large?size:100,...(body.optionsColumn?{filterValues:['001','002']}: {})})}
 if(u.pathname==='/api/yarns/'+master.id&&method==='GET')return json(master)
 if(u.pathname==='/api/yarns/'+master.id&&method==='PUT'){master={...master,...body,definition:{...body.definition,packaging:body.definition.packaging.map((p:any)=>({...p,packagingName:'کارتن'}))},rowVersion:'AQAAAAAAAAA='};return json(master)}
 if(u.pathname==='/api/field-validation/yarns')return json({error:null})
 if(u.pathname==='/api/master-data/product-groups/policy')return json({maxSubgroups:4,rowVersion:'AAAAAAAAAAA='})
 if(u.pathname==='/api/master-data/product-groups/grid')return json({items:[],total:0,page:1,pageSize:100})
 if(u.pathname==='/api/master-data/product-groups')return json({items:[]})
 if(u.pathname==='/api/system-lookups/productGroups'){const q=u.searchParams.get('q')??'';await new Promise(r=>setTimeout(r,q==='slow'?450:40));return json({items:[{id:master.productGroupId,code:'001',name:q||'گروه واقعی'}],total:1})}
 if(u.pathname.startsWith('/api/system-lookups/productGroups'))return json({id:master.productGroupId,code:'001',name:'گروه واقعی'})
 if(u.pathname.endsWith('/assignment'))return json({selectable:true,requiresConfirmation:false,terminalDepth:0,message:''})
 if(u.pathname==='/api/yarns/definition-suggest-code')return json({suggestion:'002'})
 throw Error('Unexpected approved integration request: '+method+' '+u.pathname)
}) as typeof fetch
createRoot(document.getElementById('root')!).render(<ComponentListProvider role="admin"><ApprovedYarnsPage language="fa"/></ComponentListProvider>)
installFormInteraction()
