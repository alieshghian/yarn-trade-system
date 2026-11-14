import '../src/warehouses.css'
import {createRoot} from 'react-dom/client'
import {WarehouseZones} from '../src/WarehouseZones'
import {installFormInteraction} from '../src/formInteraction'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
sessionStorage.setItem('permissions',JSON.stringify(['warehouses.view','warehouses.zones']))
const zones:any[]=[{id:'dock',code:'1-DOCK',name:'بارانداز',floorNumber:1,isDefaultReceiving:true,isActive:true},{id:'old',code:'1-12',name:'Existing',floorNumber:1,isActive:true}]
Object.assign(window,{batchWrites:0,batchReject:true});
window.fetch=async(input,init)=>{const url=String(input),q=JSON.parse(String(init?.body??'{}')),response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 if(url.includes('/zones/edit-session'))return response({active:true,expiresInSeconds:120});
 if(url.includes('/field-validation/'))return response({error:null});
 if(url.includes('/zones/grid')){const rows=q.filters?.code?zones.filter(z=>q.filters.code.selectedValues.includes('string:'+z.code)):zones;return response({items:rows,total:rows.length,page:1,pageSize:100})}
 if(url.includes('/suggest-code'))return response({suggestion:'1-11'});
 if(url.endsWith('/batch-preview')){await new Promise(r=>setTimeout(r,120));let n=Number(q.startCode.split('-')[1]),codes=[];while(codes.length<q.count){const code='1-'+n++;if(!zones.some(z=>z.code===code))codes.push(code)}return response({codes})}
 if(url.endsWith('/batch')){(window as any).batchWrites++;await new Promise(r=>setTimeout(r,300));if((window as any).batchReject)return response({error:'تعارض آزمایشی؛ اطلاعات حفظ شد.'},409);const items=q.items.map((x:any,i:number)=>({...x,id:'saved-'+i,rowVersion:'AAAAAAAAAAA='}));zones.push(...items);return response({items})}
 throw Error('Unexpected fixture request: '+url)
};installFormInteraction();createRoot(document.getElementById('root')!).render(<WarehouseZones language="fa" warehouse={{id:'batch-warehouse',nameFa:'انبار تست',floorCount:1} as any} canEdit onClose={()=>{}}/>);
