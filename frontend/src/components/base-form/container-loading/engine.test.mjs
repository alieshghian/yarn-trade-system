import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateLoading} from './engine.ts'
import {createContainerSpec} from './specs.ts'
import source from '../specs/container_types.stage1.json' with {type:'json'}
import example from './example.json' with {type:'json'}

const box=(length=1000,width=1000,height=1000)=>({length,width,height})
const container=(patch={})=>({id:'20GP',version:'synthetic-v1',internal:box(2000,2000,2000),door:{width:2000,height:2000},permittedPayloadKg:1000,...patch})
const cargo=(id='a',type='CARTON',quantity=1,patch={})=>({id,invoiceRowId:'row-'+id,product:'Synthetic yarn',supplier:'Synthetic supplier',quantity,
  packaging:{type,dimensions:box(),weightKg:10,orientations:['LWH'],stacking:{maxLayers:2,maxLoadAboveKg:100},...(type==='PALLET'?{pallet:{dimensions:box(1000,1000,100),weightKg:2,includedInTotals:true}}:{})},...patch})
const run=(items,c=container())=>calculateLoading(c,items)
test('delivered JSON example reproduces both placements and unplaced packages',()=>{
  assert.deepEqual(calculateLoading(example.container,example.cargo),example.result)
  assert.equal(example.result.placements.length,1)
  assert.equal(example.result.unplaced[0].reason,'OVERSIZED')
})
function invariants(result,items,c) {
  assert.equal(result.status,'calculated')
  assert.equal(result.placements.length+result.unplaced.length,items.reduce((sum,i)=>sum+i.quantity,0))
  assert.equal(new Set([...result.placements,...result.unplaced].map(p=>p.packageId)).size,items.reduce((sum,i)=>sum+i.quantity,0))
  assert.ok(result.placements.reduce((sum,p)=>sum+p.weightKg,0)<=c.permittedPayloadKg+1e-9)
  for (const a of result.placements) {
    assert.ok(a.x>=0&&a.y>=0&&a.z>=0)
    assert.ok(a.x+a.dimensions.length<=c.internal.length&&a.y+a.dimensions.width<=c.internal.width&&a.z+a.dimensions.height<=c.internal.height)
    assert.ok(a.dimensions.width<=c.door.width&&a.dimensions.height<=c.door.height)
    if(a.z>0){const b=result.placements.find(p=>p.packageId===a.supportedBy);assert.ok(b);assert.equal(b.z+b.dimensions.height,a.z);assert.ok(b.x<=a.x&&b.y<=a.y&&b.x+b.dimensions.length>=a.x+a.dimensions.length&&b.y+b.dimensions.width>=a.y+a.dimensions.width)}
    for(const b of result.placements)if(a!==b)assert.ok(a.x+a.dimensions.length<=b.x||b.x+b.dimensions.length<=a.x||a.y+a.dimensions.width<=b.y||b.y+b.dimensions.width<=a.y||a.z+a.dimensions.height<=b.z||b.z+b.dimensions.height<=a.z)
  }
}

test('empty container and canonical metric adapters, no inherited operational capacities',()=>{
  const r=run([]);assert.equal(r.placements.length,0);assert.equal(r.geometricVolume.placedCBM,0);assert.equal(r.remainingCapacity.payloadKg,1000)
  for(const original of source.containerTypes){const {spec,errors}=createContainerSpec(original.id,24000);assert.deepEqual(errors,[]);assert.equal(spec.internal.length,Math.round(original.internal.length*1000));assert.equal(spec.door.height,Math.round(original.doorOpening.height*1000));assert.equal(spec.version,'stage1-v1');if(original.id!=='40HC'){assert.equal(spec.operationalCapacityCBM,undefined);assert.equal(spec.visualGrid,undefined);assert.equal(calculateLoading(spec,[cargo()]).operationalUtilization.status,'unconfigured')}else{assert.equal(spec.visualGrid.palletSectionMm,3*spec.visualGrid.cartonSackSectionMm);assert.equal(spec.operationalCapacityCBM.BALE,undefined)}}
  assert.equal(createContainerSpec('UNKNOWN',1000).spec,null);assert.equal(createContainerSpec('40HC',0).spec,null)
})
for(const type of ['CARTON','SACK','BALE','PALLET'])test(type+' bounding packages fit without duplication or pallet double counting',()=>{
  const items=[cargo('a',type,8)],c=container();const r=run(items,c);invariants(r,items,c);assert.equal(r.placements.length,8);assert.equal(r.geometricVolume.placedCBM,8);assert.equal(r.remainingCapacity.payloadKg,920);assert.equal(r.placements[0].x,0);assert.equal(r.placements[0].y,0);assert.equal(r.placements[0].z,0)
})
test('mixed categories retain item, invoice row and orientation identity',()=>{
  const items=['CARTON','SACK','BALE','PALLET'].map((t,i)=>cargo(String(i),t,2));const c=container();const r=run(items,c);invariants(r,items,c);assert.equal(r.placements.length,8);for(const p of r.placements){assert.equal(p.invoiceRowId,'row-'+p.itemId);assert.equal(p.orientation,'LWH')}
})
test('oversize and door clearance are distinct explicit reasons',()=>{
  const a=cargo();a.packaging.dimensions=box(3000,1000,1000);assert.equal(run([a]).unplaced[0].reason,'OVERSIZED')
  const b=cargo();b.packaging.dimensions=box(1000,1900,1000);assert.equal(run([b],container({door:{width:1800,height:2000}})).unplaced[0].reason,'DOOR_CLEARANCE')
  b.packaging.dimensions=box(1000,1000,1900);assert.equal(run([b],container({door:{width:2000,height:1800}})).unplaced[0].reason,'DOOR_CLEARANCE')
})
test('only permitted rotations are used and pallets cannot be tipped',()=>{
  const a=cargo();a.packaging.dimensions=box(1000,1800,1000);a.packaging.orientations=['LWH','WLH'];const c=container({door:{width:1200,height:2000}});const r=run([a],c);assert.equal(r.placements[0].orientation,'WLH');assert.deepEqual(r.placements[0].dimensions,box(1800,1000,1000));invariants(r,[a],c)
  const p=cargo('p','PALLET');p.packaging.orientations=['LHW'];assert.equal(run([p]).status,'invalid-input')
})
test('no collisions or floating: full footprint support, layer limit and support load limits',()=>{
  const c=container({internal:box(1000,1000,3000),door:{width:1000,height:3000}}),a=cargo('a','CARTON',3)
  let r=run([a],c);invariants(r,[a],c);assert.equal(r.placements.length,2);assert.equal(r.unplaced[0].reason,'STACKING_CONSTRAINT')
  a.packaging.stacking.maxLayers=3;a.packaging.stacking.maxLoadAboveKg=15;r=run([a],c);assert.equal(r.placements.length,2);assert.equal(r.unplaced[0].reason,'STACKING_CONSTRAINT')
  a.packaging.stacking.maxLayers=1;r=run([a],c);assert.equal(r.placements.length,1)
  const small=cargo('a'),big=cargo('b');small.packaging.dimensions=box(500,500,1000);r=run([small,big],container({internal:box(1000,1000,2000)}));assert.equal(r.placements.length,1);assert.equal(r.unplaced[0].reason,'STACKING_CONSTRAINT')
})
test('stack category and cumulative weight restrictions protect lower packages',()=>{
  const bottom=cargo('a'),top=cargo('b','SACK');bottom.packaging.stacking.allowedAboveTypes=['CARTON'];const c=container({internal:box(1000,1000,2000)});const r=run([bottom,top],c);assert.equal(r.placements.length,1);assert.equal(r.unplaced[0].reason,'STACKING_CONSTRAINT')
})
test('ancestor stack limits include all upper layers and distributed sibling loads',()=>{
  const c=container({internal:box(1000,1000,4000),door:{width:1000,height:4000}})
  const a=cargo('a','CARTON',4);a.packaging.stacking={maxLayers:3,maxLoadAboveKg:100}
  let r=run([a],c);invariants(r,[a],c);assert.equal(r.placements.length,3);assert.equal(r.unplaced[0].reason,'STACKING_CONSTRAINT')
  a.packaging.stacking={maxLayers:4,maxLoadAboveKg:20};r=run([a],c);assert.equal(r.placements.length,3);assert.equal(r.unplaced[0].reason,'STACKING_CONSTRAINT')
  const base=cargo('a'),children=cargo('b','CARTON',4);base.packaging.stacking.maxLoadAboveKg=15;children.packaging.dimensions=box(500,500,1000)
  r=run([base,children],container({internal:box(1000,1000,2000)}));assert.equal(r.placements.length,2);assert.ok(r.unplaced.every(p=>p.reason==='STACKING_CONSTRAINT'))
})
test('every permitted dimension permutation is applied exactly, never changing volume',()=>{
  const expected={LWH:[100,200,300],WLH:[200,100,300],LHW:[100,300,200],HLW:[300,100,200],WHL:[200,300,100],HWL:[300,200,100]}
  for(const [orientation,dims]of Object.entries(expected)){const a=cargo();a.packaging.dimensions=box(100,200,300);a.packaging.orientations=[orientation];const r=run([a]);assert.deepEqual(Object.values(r.placements[0].dimensions),dims);assert.equal(r.geometricVolume.placedCBM,0.006)}
})
test('invalid dimensions, weights, constraints and prototype orientation names are rejected without throwing',()=>{
  for(const change of [p=>{p.dimensions.width=NaN},p=>{p.dimensions.length=1.5},p=>{p.weightKg=Infinity},p=>{p.stacking=null},p=>{p.orientations=['toString']},p=>{p.orientations=[]},p=>{p.stacking.maxLayers=0}]){const a=cargo();change(a.packaging);assert.equal(run([a]).status,'invalid-input')}
  assert.equal(run([cargo()],container({operationalCapacityCBM:{CARTON:0}})).status,'invalid-input')
})
test('payload limit and exhausted geometry report all remaining physical packages',()=>{
  let r=run([cargo('a','CARTON',3)],container({permittedPayloadKg:15}));assert.equal(r.placements.length,1);assert.deepEqual(r.unplaced.map(p=>p.reason),['PAYLOAD_LIMIT','PAYLOAD_LIMIT'])
  r=run([cargo('a','CARTON',9)]);assert.equal(r.placements.length,8);assert.equal(r.unplaced[0].reason,'NO_SPACE')
})
test('unloading order puts first-to-unload nearest the doors; contradictory orders are reported',()=>{
  const items=[cargo('early','CARTON',1,{unloadingOrder:1}),cargo('late','CARTON',1,{unloadingOrder:2})],c=container();let r=run(items,c);invariants(r,items,c);assert.equal(r.placements[0].itemId,'late');assert.ok(r.placements.find(p=>p.itemId==='early').x>=r.placements[0].x+r.placements[0].dimensions.length)
  items[0].loadingOrder=1;items[1].loadingOrder=2;r=run(items,c);assert.equal(r.placements.length,1);assert.equal(r.unplaced[0].reason,'ORDER_CONSTRAINT');assert.ok(r.limitations.length)
})
test('repeatability and input immutability, including caller array order',()=>{
  const items=[cargo('z','SACK',3),cargo('a','CARTON',3)],c=container(),before=JSON.stringify({items,c});const r=run(items,c);assert.deepEqual(run(items,c),r);assert.deepEqual(run([...items].reverse(),c),r);assert.equal(JSON.stringify({items,c}),before)
})
test('15 CBM pallets plus 47.6 CBM sacks is advisory 100%; physical fit stays independent',()=>{
  const p=cargo('p','PALLET');p.packaging.dimensions=box(15000,1000,1000)
  const s=cargo('s','SACK');s.packaging.dimensions=box(23800,2000,1000)
  const c=createContainerSpec('40HC',24000).spec,r=run([p,s],c)
  assert.ok(Math.abs(r.operationalUtilization.requestedRatio-1)<1e-12);assert.equal(r.geometricVolume.requestedCBM,62.6);assert.equal(r.placements.length,0);assert.ok(r.unplaced.every(p=>p.reason==='OVERSIZED'));assert.equal(r.operationalUtilization.placedRatio,0)
})
test('malformed inputs return structured errors; unknown capacities stay unconfigured',()=>{
  for(const [c,items] of [[null,[]],[container(),null],[container(),[null]],[container(),[{...cargo(),quantity:-1}]],[container(),[cargo(),cargo()]],[container(),[{...cargo(),quantity:501}]]]){const r=calculateLoading(c,items);assert.equal(r.status,'invalid-input');assert.ok(r.errors.length);assert.equal(r.placements.length,0)}
  const p=cargo('p','PALLET');delete p.packaging.pallet;assert.equal(run([p]).status,'invalid-input')
  const c=cargo();c.packaging.pallet={};assert.equal(run([c]).status,'invalid-input')
  assert.equal(run([cargo()],container()).operationalUtilization.requestedRatio,null)
})
