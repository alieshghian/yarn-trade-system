import {readPackagingTypes,packagingVolumeContract,packagingVolumeError,packagingVolumeSettings,type PackagingVolumeItem} from './packagingVolume.ts'
import {batchValuePatternContract} from './batchValuePattern.ts'
import {numericFieldError,numericSuggestionContract} from './numericField.ts'
import type {BatchValueDetails} from './batchValueRecords'
import {laboratoryDesignLifecycleContract} from './formDesignLifecycle.ts'
import {laboratoryColorPickerContract} from './colorPickerContract.ts'
import {contactListContract} from './componentListSettings.ts'
import type {FormStorage} from './laboratoryFormDraftState.ts'
import type {FormSchemaDraft} from './formSchema.ts'
import { effectiveFieldRules, laboratoryFieldRuleContract, validateRecordRules } from './fieldRules.ts'
import { laboratoryResizeContract } from './designer.ts'
import { laboratoryLabelChangeContract } from './labelChanges.ts'
import { laboratoryToolbarContract } from './toolbarLayoutContract.ts'
import { laboratoryGeometryContract } from './designerGeometry.ts'
import { laboratoryLayoutPreviewContract } from './laboratoryLayoutPreview.ts'
import { cascadingTreeContract } from './cascadingTreeContract.ts'
import { labelTranslationContract } from './labelTranslationQueue.ts'
import { laboratoryIntegrationContract } from './laboratoryIntegrationContract.ts'
import {systemLookupContract} from './systemLookupContract.ts'

/** The Laboratory owns the policy. Forms store references and explicit differences only. */
export const laboratoryBehaviorId='laboratory.form-behavior'
export const formBehaviorKey='yarn-trade:laboratory-behaviors:v1'
export const formBehaviorEvent='laboratory-behavior-changed'
export type FormBehaviorPolicy={enterNavigation:boolean;trapTab:boolean;confirmCancel:boolean;preserveHorizontalSpacing?:boolean;preserveVerticalSpacing?:boolean}
export type ColumnLinkBehavior={allowMultipleSources:boolean;defaultComposition:'direct'|'space'|'comma'|'newline'|'custom';requireMismatchResolution:boolean}
export type BehaviorInstructions={sourceForm:string;sourceField:string;operation:string;instruction:string}
export type BehaviorRevision={version:number;at:string;policy:Partial<FormBehaviorPolicy>;columnLinks?:Partial<ColumnLinkBehavior>;instructions:BehaviorInstructions;note:string}
export type FormBehaviorDefinition={id:string;name:string;parentId?:string;revisions:BehaviorRevision[]}
export type FormBehaviorLibrary={version:1;definitions:FormBehaviorDefinition[]}
export const defaultFormBehavior:FormBehaviorPolicy={enterNavigation:true,trapTab:true,confirmCancel:false}
export const defaultColumnLinkBehavior:ColumnLinkBehavior={allowMultipleSources:true,defaultComposition:'space',requireMismatchResolution:true}
export const emptyBehaviorInstructions=():BehaviorInstructions=>({sourceForm:'',sourceField:'',operation:'',instruction:''})
export function initialFormBehaviors():FormBehaviorLibrary{return {version:1,definitions:[{id:laboratoryBehaviorId,name:'رفتار مشترک فرم آزمایشگاه',revisions:[{version:1,at:'',policy:{...defaultFormBehavior},columnLinks:{...defaultColumnLinkBehavior},instructions:emptyBehaviorInstructions(),note:'قرارداد مشترک فرم، اتصال عنوان‌ها و ترکیب مقدار ستون‌ها'}]}]}}
export function resolveColumnLinkBehavior(library:FormBehaviorLibrary,id=laboratoryBehaviorId,seen=new Set<string>()):ColumnLinkBehavior{if(seen.has(id))throw Error('ارث‌بری حلقه‌ای رفتار مجاز نیست.');const item=library.definitions.find(item=>item.id===id);if(!item)throw Error('مرجع رفتار پیدا نشد: '+id);seen.add(id);return {...(item.parentId?resolveColumnLinkBehavior(library,item.parentId,seen):defaultColumnLinkBehavior),...item.revisions.at(-1)!.columnLinks}}
export function resolveFormBehavior(library:FormBehaviorLibrary,id=laboratoryBehaviorId,seen=new Set<string>()):FormBehaviorPolicy{
 if(seen.has(id))throw Error('ارث‌بری حلقه‌ای رفتار مجاز نیست.')
 const item=library.definitions.find(item=>item.id===id);if(!item)throw Error('مرجع رفتار پیدا نشد: '+id)
 seen.add(id)
 return {...(item.parentId?resolveFormBehavior(library,item.parentId,seen):defaultFormBehavior),...item.revisions.at(-1)!.policy}
}
export function readFormBehaviors(storage?:Pick<FormStorage,'getItem'>|null):FormBehaviorLibrary{
 const raw=storage?.getItem(formBehaviorKey);if(!raw)return initialFormBehaviors()
 const value=JSON.parse(raw) as FormBehaviorLibrary
 if(value.version!==1||!Array.isArray(value.definitions)||!value.definitions.some(item=>item.id===laboratoryBehaviorId))throw Error('کتابخانهٔ رفتار نامعتبر است؛ دادهٔ قبلی حفظ شد.')
 const ids=new Set<string>()
 for(const item of value.definitions){if(!item.id||ids.has(item.id)||!item.revisions?.length)throw Error('تعریف رفتار نامعتبر است.');ids.add(item.id)
  for(const [i,r] of item.revisions.entries())if(r.version!==i+1||!r.policy||!r.instructions||Object.entries(r.policy).some(([key,v])=>!['enterNavigation','trapTab','confirmCancel','preserveHorizontalSpacing','preserveVerticalSpacing'].includes(key)||typeof v!=='boolean')||Object.entries(r.columnLinks??{}).some(([key,v])=>!['allowMultipleSources','requireMismatchResolution','defaultComposition'].includes(key)||(key==='defaultComposition'?!['direct','space','comma','newline','custom'].includes(String(v)):typeof v!=='boolean')))throw Error('نسخهٔ رفتار نامعتبر است.')}
 for(const item of value.definitions){resolveFormBehavior(value,item.id);resolveColumnLinkBehavior(value,item.id)}
 return value
}
export function writeFormBehaviors(storage:FormStorage,library:FormBehaviorLibrary){
 readFormBehaviors(storage);const raw=JSON.stringify(library);readFormBehaviors({getItem:()=>raw});storage.setItem(formBehaviorKey,raw)
 if(typeof window!=='undefined')window.dispatchEvent(new Event(formBehaviorEvent))
}
export function addFormBehavior(library:FormBehaviorLibrary,id:string,name:string,parentId=laboratoryBehaviorId):FormBehaviorLibrary{
 if(!name.trim()||library.definitions.some(item=>item.id===id))throw Error('نام یا شناسهٔ رفتار نامعتبر است.')
 resolveFormBehavior(library,parentId)
 return {...library,definitions:[...library.definitions,{id,name:name.trim(),parentId,revisions:[{version:1,at:new Date().toISOString(),policy:{},instructions:emptyBehaviorInstructions(),note:'قابلیت اختصاصی با ارث‌بری از آزمایشگاه'}]}]}
}
export function publishFormBehavior(library:FormBehaviorLibrary,id:string,policy:Partial<FormBehaviorPolicy>,instructions:BehaviorInstructions,note:string,columnLinks?:Partial<ColumnLinkBehavior>):FormBehaviorLibrary{
 if(!library.definitions.some(item=>item.id===id))throw Error('مرجع رفتار پیدا نشد.')
 return {...library,definitions:library.definitions.map(item=>item.id!==id?item:{...item,revisions:[...item.revisions,{version:item.revisions.length+1,at:new Date().toISOString(),policy:{...policy},columnLinks:{...(columnLinks??item.revisions.at(-1)?.columnLinks)},instructions:{...instructions},note}]})}
}
export function behaviorIdFor(schema:FormSchemaDraft):string{return schema.settings?.shared?.behaviorId??laboratoryBehaviorId}
export function currentFormPolicy(id=laboratoryBehaviorId):FormBehaviorPolicy{
 try{return resolveFormBehavior(readFormBehaviors(typeof localStorage==='undefined'?undefined:localStorage),id)}catch{return defaultFormBehavior}
}
export function behaviorManifest(schema:FormSchemaDraft,library:FormBehaviorLibrary){
 const ids=new Set([behaviorIdFor(schema),...schema.fields.map(field=>String(field.settings?.behaviorId??behaviorIdFor(schema)))])
 for(const id of ids){let definition=library.definitions.find(item=>item.id===id);while(definition?.parentId){ids.add(definition.parentId);definition=library.definitions.find(item=>item.id===definition!.parentId)}}
 return {...(schema.fields.some(field=>field.componentId===packagingVolumeContract.componentId)?{packagingVolumeContract:structuredClone(packagingVolumeContract),packagingTypes:readPackagingTypes(typeof localStorage==='undefined'?undefined:localStorage)}:{}),batchValuePatternContract:structuredClone(batchValuePatternContract),numericSuggestionContract:structuredClone(numericSuggestionContract),colorPickerContract:structuredClone(laboratoryColorPickerContract),designLifecycleContract:structuredClone(laboratoryDesignLifecycleContract),contactListContract:structuredClone(contactListContract),systemLookupContract:structuredClone(systemLookupContract),referenceLookups:schema.fields.filter(field=>field.componentId===systemLookupContract.componentId).map(field=>({fieldId:field.id,sourceId:String((field.settings?.lookupSettings as {sourceId?:string}|undefined)?.sourceId??'')})),integrationContract:structuredClone(laboratoryIntegrationContract),labelTranslationContract:structuredClone(labelTranslationContract),root:laboratoryBehaviorId,componentContracts:schema.fields.some(field=>field.componentId===cascadingTreeContract.componentId)?[structuredClone(cascadingTreeContract)]:[],settingsContract:structuredClone(laboratorySettingsContract),layoutPreviewContract:structuredClone(laboratoryLayoutPreviewContract),geometryContract:structuredClone(laboratoryGeometryContract),toolbarContract:structuredClone(laboratoryToolbarContract),fieldRuleContract:structuredClone(laboratoryFieldRuleContract),resizeContract:structuredClone(laboratoryResizeContract),labelChangeContract:structuredClone(laboratoryLabelChangeContract),definitions:library.definitions.filter(item=>ids.has(item.id)).map(item=>structuredClone(item)),policies:Object.fromEntries([...ids].map(id=>[id,resolveFormBehavior(library,id)])),columnLinkPolicies:Object.fromEntries([...ids].map(id=>[id,resolveColumnLinkBehavior(library,id)]))}
}

export type FormTestRecord={id:string;values:Record<string,string>;details?:BatchValueDetails}
export type FormTestState={mode:'view'|'create'|'edit';records:FormTestRecord[];selectedId:string|null;draft:Record<string,string>;log:string[]}
export const initialFormTest=():FormTestState=>({mode:'view',records:[],selectedId:null,draft:{},log:[]})
export type FormTestEvent={type:'reset'}|{type:'create';defaults:Record<string,string>}|{type:'copy';source:'last'|'selected';defaults:Record<string,string>}|{type:'change';field:string;value:string}|{type:'save';id:string;values?:Record<string,string>;details?:BatchValueDetails}|{type:'close'}|{type:'select';id:string;values?:Record<string,string>}|{type:'edit'}|{type:'delete'}
export function formTestReducer(state:FormTestState,event:FormTestEvent):FormTestState{
 switch(event.type){
  case 'reset':return initialFormTest()
  case 'create':return {...state,mode:'create',selectedId:null,draft:{...event.defaults},log:[...state.log,'ایجاد رکورد آزمایشی']}
  case 'copy':return state.mode!=='view'?state:{...state,mode:'create',selectedId:null,draft:{...event.defaults},log:[...state.log,event.source==='last'?'کپی آخرین رکورد به ورود جدید آزمایشی':'کپی رکورد انتخاب‌شده به ورود جدید آزمایشی']}
  case 'change':return state.mode==='view'?state:{...state,draft:{...state.draft,[event.field]:event.value}}
  case 'save':{if(state.mode==='view')return state;const id=state.mode==='edit'?state.selectedId!:event.id;const details=event.details??state.records.find(row=>row.id===id)?.details;const row={id,values:{...(event.values??state.draft)},...(details&&Object.keys(details).length?{details:structuredClone(details)}:{})};return {...state,mode:'view',records:state.mode==='edit'?state.records.map(existing=>existing.id===id?row:existing):[...state.records,row],selectedId:id,log:[...state.log,'ثبت رکورد آزمایشی']}}
  case 'close':return {...state,mode:'view',draft:state.records.find(row=>row.id===state.selectedId)?.values??{},log:[...state.log,'بستن ورود آزمایشی']}
  case 'select':return state.mode!=='view'?state:{...state,selectedId:event.id,draft:{...(event.values??state.records.find(row=>row.id===event.id)?.values??{})}}
  case 'edit':return !state.selectedId||state.mode!=='view'?state:{...state,mode:'edit',log:[...state.log,'ویرایش رکورد آزمایشی']}
  case 'delete':return state.mode!=='view'?state:{...state,records:state.records.filter(row=>row.id!==state.selectedId),selectedId:null,draft:{},log:[...state.log,'حذف رکورد آزمایشی']}
 }
}
export type FormTestAction='create'|'copyLast'|'copySelected'|'save'|'close'|'edit'|'delete'|'first'|'last'|'previous'|'next'
/** Bind runtime behavior to stable operation/shortcut IDs, never translated labels. */
export function formTestActionFor(action:{id:string;operationId?:string;code:string;keys?:readonly string[]}):FormTestAction|undefined{
 const operations:Record<string,FormTestAction>={'new-person':'create','copy-last':'copyLast','copy-selected':'copySelected','operational.copyLast':'copyLast','operational.copySelected':'copySelected','edit-person':'edit','delete-person':'delete','first-record':'first','last-record':'last','previous-page':'previous','next-page':'next','browse-records':'next','demo-save':'save','reset-sample':'close'}
 const explicit=action.operationId
 const explicitAction=explicit?.split('.').at(-1)
 if(explicitAction&&['create','copyLast','copySelected','save','close','edit','delete','first','last','previous','next'].includes(explicitAction))return explicitAction as FormTestAction
 if(operations[action.id])return operations[action.id]
 const shortcuts=action.keys?.length?action.keys:[action.code]
 const actionsByShortcut:Record<string,FormTestAction>={' ':'create',Space:'create',F2:'copyLast',F3:'save',F4:'copySelected',Escape:'close',Esc:'close',Insert:'edit',Delete:'delete',Home:'first',End:'last',PageUp:'previous',PgUp:'previous',PageDown:'next',PgDn:'next'}
 return shortcuts.map(shortcut=>actionsByShortcut[shortcut]).find((candidate):candidate is FormTestAction=>Boolean(candidate))
}
export function testActionVisible(mode:FormTestState['mode'],action:FormTestAction|'browse'){return mode==='view'?action!=='save':action==='save'||action==='close'}
/** Shared visibility gate for designer preview, test entry and operational actions. */
export function formActionVisible(mode:FormTestState['mode']|'design',action:Parameters<typeof formTestActionFor>[0]):boolean {
 if(mode==='design')return true
 const operation=formTestActionFor(action)
 return operation?testActionVisible(mode,operation):mode==='view'
}
export function validateTestRecord(schema:FormSchemaDraft,values:Record<string,string>,records:readonly FormTestRecord[]=[],currentId?:string|null,details:BatchValueDetails={}):Record<string,string>{
 const errors:Record<string,string>={}
 for(const field of schema.fields){if(field.readOnly||field.kind==='hidden')continue;const value=values[field.id]??''
  if(effectiveFieldRules(field).required&&!value.trim())errors[field.id]='این فیلد الزامی است.'
  const packaging=field.componentId==='base-form.packaging-volume'?(details[field.id]??[]) as PackagingVolumeItem[]:undefined
  if(packaging){
   const error=packagingVolumeError(packaging,packagingVolumeSettings(field.settings?.packagingVolumeSettings).decimalPlaces)
   if(error)errors[field.id]=error
   if(value&&!packaging.length)errors[field.id]='اطلاعات بسته‌بندی را تکمیل و ثبت کنید.'
   for(const item of packaging){const message=numericFieldError({...field,componentId:'definition.field',kind:'number',valueType:'number'},String(item.cbmPerTon));if(message)errors[field.id]=message}
  }
  for(const rule of field.validation??[]){let valid=true
   if(!value)continue
   const ruleValues=packaging&&['minimum','maximum','integer','positive'].includes(rule.type)?packaging.map(item=>String(item.cbmPerTon)):[value]
   for(const value of ruleValues){
   switch(rule.type){case 'minLength':valid=value.length>=rule.value;break;case 'maxLength':valid=value.length<=rule.value;break;case 'minimum':valid=Number(value)>=rule.value;break;case 'maximum':valid=Number(value)<=rule.value;break;case 'integer':valid=Number.isInteger(Number(value));break;case 'positive':valid=Number(value)>0;break;case 'email':valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);break;case 'url':try{new URL(value)}catch{valid=false}break;case 'pattern':try{valid=new RegExp(rule.value).test(value)}catch{valid=false}break;case 'unique':break;case 'custom':errors[field.id]='اعتبارسنجی اختصاصی '+rule.validatorId+' به اتصال و تست عملیاتی نیاز دارد.';break}
   if(!valid)errors[field.id]=rule.message?.fa??'مقدار با قواعد فیلد سازگار نیست.'
   }
  }
 }
 return {...errors,...validateRecordRules(schema,values,records,currentId)}
}
import {laboratorySettingsContract} from './formSettingsContract.ts'
