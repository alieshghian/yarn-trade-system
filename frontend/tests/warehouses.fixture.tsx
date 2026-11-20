import {createRoot} from 'react-dom/client'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
import {installFormInteraction} from '../src/formInteraction'
sessionStorage.setItem('permissions',JSON.stringify([...['view','create','edit','delete','zones'].map(p=>'warehouses.'+p),'persons.view']))
sessionStorage.setItem('currentUser','warehouse-fixture')
localStorage.removeItem('operational-form:operational.warehouses')
let record:Record<string,unknown>|null=null
let zones=[{id:'dock',floorNumber:1,code:'1-DOCK',name:'بارانداز',description:'',isDefaultReceiving:true,isActive:true,rowVersion:'AAAAAAAAAAA='}]
Object.assign(window,{warehouseWrites:0})
window.fetch=async(input,init)=>{
 const url=String(input),response=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})
 if(url.endsWith('/api/warehouses/latest'))return record?response(record):new Response(null,{status:404})
 if(url.includes('/zones/edit-session'))return response({active:true,expiresInSeconds:120});
 if(url.includes('/api/field-validation/')){
  const q=JSON.parse(String(init?.body??'{}'))
  if(q.value==='DELAY')await new Promise(resolve=>setTimeout(resolve,500))
  if(q.value==='OFFLINE')throw Error('fixture network failure')
  const normalize=(v:unknown)=>String(v??'').trim().replaceAll('ي','ی').replaceAll('ك','ک').replace(/\s+/g,' ').toUpperCase()
  const duplicate=url.endsWith('/zones')?zones.some(z=>z.id!==q.currentId&&z.floorNumber===q.floorNumber&&normalize(q.field==='code'?z.code:z.name)===normalize(q.value)):q.field==='code'&&record?.id!==q.currentId&&normalize(record?.code)===normalize(q.value)
  return response({error:duplicate?'مقدار تکراری است.':null})
 }
 if(url.includes('/zones/grid?floor=')){const floor=Number(url.split('floor=')[1]),q=JSON.parse(String(init?.body??'{}'));let rows=zones.filter(z=>z.floorNumber===floor);if(q.filters?.code)rows=rows.filter(z=>q.filters.code.selectedValues.includes('string:'+z.code));return response({items:rows,total:rows.length,page:1,pageSize:100})}
 if(url.includes('/zones/suggest-code')){await new Promise(resolve=>setTimeout(resolve,350));return response({suggestion:'2-001'})}
 if(url.includes('/floors/2/dock')){const z={...zones[0],id:'dock2',floorNumber:2,code:'2-DOCK'};zones.push(z);return response(z)}
 if(url.includes('/zones/copy-options')){const q=new URL(url,'http://test').searchParams,source=Number(q.get('sourceFloor')),target=Number(q.get('targetFloor'));return response({items:zones.filter(z=>z.floorNumber===source&&!z.isDefaultReceiving&&!zones.some(t=>t.floorNumber===target&&t.name===z.name)),hasMore:false})}
 if(url.endsWith('/zones/copy')){const q=JSON.parse(String(init?.body));const items=zones.filter(z=>q.zoneIds.includes(z.id)).map(z=>({...z,id:z.id+'-copy',floorNumber:q.targetFloor,code:q.targetFloor+'-'+z.code.split('-').slice(1).join('-')}));zones.push(...items);return response({items,skipped:0})}
 if(url.endsWith('/zones')&&init?.method==='POST'){const z={...JSON.parse(String(init.body)),id:'new-zone',isDefaultReceiving:false,rowVersion:'AAAAAAAAAAA='};zones.push(z);return response(z)}
 if(url.endsWith('/suggest-code')){await new Promise(resolve=>setTimeout(resolve,350));return response({suggestion:'WH-0001'})}
 if(url.endsWith('/api/master-data/persons/person-fixture'))return response({id:'person-fixture',personCode:'P001',displayName:'انباردار تست'})
 if(url.includes('/api/system-lookups'))return response({items:[{id:'person-fixture',code:'P001',name:'انباردار تست'}],total:1,page:1,pageSize:50})
 if(url.endsWith('/grid')&&location.search.includes('large')){
  const q=JSON.parse(String(init?.body??'{}')), total=Number(new URLSearchParams(location.search).get('size')??100000)
  const page=q.page??1, pageSize=Math.min(q.pageSize??100,100), start=(page-1)*pageSize
  const items=Array.from({length:Math.max(0,Math.min(pageSize,total-start))},(_,offset)=>{
   const index=start+offset
   return {id:'load-'+index,code:'WH-'+index,name:'انبار '+index,custodian:'',address:'',description:''}
  })
  Object.assign(window,{lastWarehouseQuery:q})
  return response({items,total,page,pageSize})
 }
 if(url.endsWith('/grid'))return response({items:record?[{...record,name:record.nameFa,custodian:''}]:[],total:record?1:0,page:1,pageSize:100})
 if(url.endsWith('/zones'))return response([{id:'dock',code:'DOCK',name:'بارانداز',isDefaultReceiving:true,isActive:true,rowVersion:'AAAAAAAAAAA='}])
 if(url.endsWith('/api/warehouses')&&init?.method==='POST'){
  const value=JSON.parse(String(init.body));record={...value,id:'fixture-warehouse',nameFa:value.name,addressesJson:JSON.stringify(value.addresses),rowVersion:'AAAAAAAAAAA=',isActive:true};Object.assign(window,{warehouseWrites:1});return response(record)
 }
 if(url.includes('/api/warehouses/fixture-warehouse'))return response(record)
 throw Error('Unexpected fixture request: '+url)
}
const {default:Page}=await import('../src/WarehousesPage')
installFormInteraction()
const page=<Page language="fa" onClose={()=>{}}/>
createRoot(document.getElementById('root')!).render(location.search.includes('modal')?<div role="dialog" aria-modal="true">{page}</div>:page)
