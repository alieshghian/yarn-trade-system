import test from 'node:test';import assert from 'node:assert/strict';import {addPackagingType,readPackagingTypes,packagingVolumeError,packagingVolumeLabel,packagingTypesKey} from './packagingVolume.ts';import {formTestReducer,initialFormTest} from './formBehavior.ts';
const item=(id,type,name,volume,primary=false)=>({id,packagingId:type,packagingName:name,cbmPerTon:volume,isDefault:primary,value:packagingVolumeLabel({packagingName:name,cbmPerTon:volume})});
test('shared packaging reference rejects normalized duplicate names and corrupt data',()=>{const types=addPackagingType([],'پالت','p');assert.throws(()=>addPackagingType(types,' پالت ','q'));assert.deepEqual(readPackagingTypes({getItem:()=>JSON.stringify(types)}),types);assert.throws(()=>readPackagingTypes({getItem:()=>'{broken'}));assert.ok(packagingTypesKey.includes('packaging'));});
test('one coefficient per packaging per product; positive decimals and one default',()=>{const items=[item('a','p','پالت',1.5,true),item('b','c','کارتن',2)];assert.equal(packagingVolumeError(items),'');assert.ok(packagingVolumeError([...items,item('c','p','پالت',3)]));for(const value of [0,-1,NaN,Infinity,1.234])assert.ok(packagingVolumeError([item('a','p','پالت',value,true)]));assert.equal(packagingVolumeError([item('a','p','پالت',1.234,true)],3),'');assert.ok(packagingVolumeError(items.map(i=>({...i,isDefault:false}))));});
test('product detail JSON retains packaging ids, coefficients and default independently of color variants',()=>{const items=[item('a','p','پالت',1.5,true),item('b','c','کارتن',2)];let state=formTestReducer(initialFormTest(),{type:'create',defaults:{code:'001'}});state=formTestReducer(state,{type:'save',id:'product',details:{packaging:items}});const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(saved.records[0].details.packaging,items);state=formTestReducer(saved,{type:'create',defaults:{code:'002'}});state=formTestReducer(state,{type:'save',id:'second',details:{packaging:[]}});assert.equal(state.records[0].details.packaging.length,2);assert.equal(state.records[1].details.packaging.length,0);});

import {resolveFormValueEntries} from './formValueListEntries.ts';
test('optional paired entry validates the entire batch without changing ordinary text and phone resolution',()=>{
 const adapter={firstLabel:'نوع بسته‌بندی',secondLabel:'CBM هر تن',parse:value=>{const [text,code]=JSON.parse(value);return {text,code:String(code)}},serialize:(name,cbm)=>{if(!name.trim()||!Number(cbm)||Number(cbm)<=0)throw Error('CBM نامعتبر');return JSON.stringify([name.trim(),Number(cbm)])}};
 const normalize=value=>JSON.parse(value)[0].trim();const rows=[{id:1,text:'پالت',code:'1.5'},{id:2,text:'کارتن',code:'2'}];const result=resolveFormValueEntries([],'',rows,2,true,normalize,adapter);assert.deepEqual(result.items,['["پالت",1.5]','["کارتن",2]']);assert.equal(result.defaultValue,'["کارتن",2]');assert.ok(resolveFormValueEntries(result.items,result.defaultValue,[{id:3,text:' پالت ',code:'4'}],null,true,normalize,adapter).error);assert.ok(resolveFormValueEntries([],'',[{id:1,text:'پالت',code:'0'}],null,true,normalize,adapter).error);assert.deepEqual(resolveFormValueEntries([],'',[{id:1,text:'نام',code:''}],null,true).items,['نام']);assert.deepEqual(resolveFormValueEntries([],'',[{id:1,text:'09120000000',code:'+98'}],null,false).items,['+989120000000']);
});

import {validateTestRecord} from './formBehavior.ts';
test('whole-form save validates structured CBM coefficients, never the formatted display as a number',()=>{
 const schema={fields:[{id:'cbm',componentId:'base-form.packaging-volume',kind:'valueList',valueType:'number',required:true,sectionId:'editor',label:{fa:'CBM'},validation:[{type:'positive'},{type:'minimum',value:0.01},{type:'maximum',value:10}],settings:{numericSettings:{decimalPlaces:2}}}]};
 const rows=[item('c','carton','کارتن',2.74,true)],values={cbm:rows[0].value};
 assert.deepEqual(validateTestRecord(schema,values,[],null,{cbm:rows}),{});
 assert.ok(validateTestRecord(schema,values).cbm,'formatted caption alone is not persisted detail data');
 for(const volume of [0,-1,11,1.234])assert.ok(validateTestRecord(schema,values,[],null,{cbm:[item('c','carton','کارتن',volume,true)]}).cbm);
 assert.ok(validateTestRecord(schema,{cbm:''}).cbm);
});

test('fixed shared packaging rows may omit unused coefficients without deleting reference types',()=>{
 const adapter={firstLabel:'نوع',secondLabel:'CBM',parse:JSON.parse,serialize:(name,cbm)=>JSON.stringify([name,Number(cbm)])};
 const result=resolveFormValueEntries([],'',[{id:1,text:'کارتن',code:'2.74',fixedName:true},{id:2,text:'پالت',code:'',fixedName:true}],null,true,undefined,adapter);
 assert.deepEqual(result.items,['["کارتن",2.74]']);assert.equal(result.defaultValue,'["کارتن",2.74]');
});
