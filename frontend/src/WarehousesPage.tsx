import {deleteSelectedDefinitionRows} from './components/base-form/useDefinitionRowSelection'
import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {apiRequest,hasPermission,withRowVersion} from './api'
import type {Language} from './i18n'
import {Field,Shortcut} from './DefinitionControls'
import {ownsFormShortcut} from './formInteraction'
import {FormSchemaPresentation} from './components/base-form/FormSchemaPresentation'
import {OperationalFormFrame} from './components/base-form/OperationalFormFrame'
import {FormDocumentDialog} from './components/base-form/FormDocumentDialog'
import {FormValueList} from './components/base-form/FormValueList'
import {SystemLookup} from './components/base-form/SystemLookup'
import {formActionVisible} from './components/base-form/formBehavior'
import {designerAppearanceStyle,designerStyleForPart,type DesignerDraft} from './components/base-form/designer'
import {codeInputProps} from './components/base-form/serialCode'
import {brandCodeSettings} from './forms/brandDesign'
import {warehouseSchema as schema,warehouseDesigner,warehouseFrame,warehouseCustomization,warehouseBehavior} from './forms/warehouseDesign'
import type {GridPage,GridQuery} from './components/base-form/excelGrid'
import './warehouses.css'
import {WarehouseZones} from './WarehouseZones'
import {useFieldValidation} from './components/base-form/useFieldValidation'

export type WarehouseRecord={id:string;code:string;nameFa:string;floorCount:number;location:string|null;address:string|null;addressesJson:string|null;description:string|null;custodianPersonId:string|null;rowVersion:string;isActive:boolean}
type Report={id:string;rowVersion:string;code:string;name:string;custodian:string;address:string;description:string}
type Draft={code:string;name:string;floorCount:number;location:string|null;address:string;addresses:string[];description:string;custodianPersonId:string;custodianChangeReason:string}
type Period={id:string;displayName:string;startedAtUtc:string;endedAtUtc:string|null;reason:string|null}
const empty=():Draft=>({code:'',name:'',floorCount:1,location:null,address:'',addresses:[],description:'',custodianPersonId:'',custodianChangeReason:''})
const fromRecord=(row:WarehouseRecord):Draft=>{let addresses:string[]=[];try{addresses=JSON.parse(row.addressesJson??'[]')}catch{/* Legacy warehouses have one address. */}return {code:row.code,name:row.nameFa,floorCount:row.floorCount??1,location:row.location??null,address:row.address??'',addresses:addresses.length?addresses:row.address?[row.address]:[],description:row.description??'',custodianPersonId:row.custodianPersonId??'',custodianChangeReason:''}}
const endpoint='/api/warehouses'

export default function WarehousesPage({language,onClose}:{language:Language;onClose:()=>void}){
 const fa=language==='fa',root=useRef<HTMLDivElement>(null),codeInput=useRef<HTMLInputElement>(null),busy=useRef(false),selectionGeneration=useRef(0)
 const [selected,setSelected]=useState<WarehouseRecord|null>(null),[draft,setDraft]=useState<Draft>(empty),[editing,setEditing]=useState<'new'|'edit'|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[dialog,setDialog]=useState<'zones'|'history'|null>(null),[componentOpen,setComponentOpen]=useState(false)
 const [restoreReady,setRestoreReady]=useState(false)
 const can=(op:string)=>hasPermission('warehouses.'+op)
 const {validateFields}=useFieldValidation(root,{enabled:Boolean(editing),entity:'warehouses',context:{currentId:editing==='edit'?selected?.id:null},rules:{code:{required:true,maxLength:30,remote:true},name:{required:true,maxLength:200},floorCount:{required:true,min:1,max:5,integer:true,validate:value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5?'':'تعداد طبقات باید بین ۱ تا ۵ باشد.'},location:{required:true},description:{maxLength:4000},custodianChangeReason:{maxLength:2000}}})
 const query=useCallback((q:GridQuery,signal?:AbortSignal)=>apiRequest<GridPage<Report>>(endpoint+'/grid',{method:'POST',body:JSON.stringify(q),signal}),[])
 const refresh=()=>setRevision(x=>x+1)
 async function select(row:Report){if(editing)return;const generation=++selectionGeneration.current;try{const value=await apiRequest<WarehouseRecord>(endpoint+'/'+row.id);if(generation!==selectionGeneration.current)return;setSelected(value);setDraft(fromRecord(value));setError('')}catch(e){if(generation===selectionGeneration.current)setError(String((e as Error).message))}}
 useEffect(()=>{const controller=new AbortController(),ticket=selectionGeneration.current;void apiRequest<WarehouseRecord>(endpoint+'/latest',{signal:controller.signal}).then(record=>{if(!controller.signal.aborted&&ticket===selectionGeneration.current){setSelected(record);setDraft(fromRecord(record))}}).catch(e=>{if(!controller.signal.aborted&&ticket===selectionGeneration.current&&e.status!==404)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setRestoreReady(true)});return()=>controller.abort()},[])
 async function begin(copy=false, source?:WarehouseRecord){if(busy.current||!can('create'))return;const generation=++selectionGeneration.current;setEditing('new');setError('');setDraft(copy?{...(source?fromRecord(source):draft),code:'',custodianPersonId:'',custodianChangeReason:''}:empty());requestAnimationFrame(()=>codeInput.current?.focus());try{const result=await apiRequest<{suggestion:string}>(endpoint+'/suggest-code');if(generation===selectionGeneration.current)setDraft(d=>d.code?d:{...d,code:result.suggestion})}catch(e){setError((e as Error).message)}}
 async function copyLatest(){if(busy.current||editing||!can('create'))return;const generation=++selectionGeneration.current;busy.current=true;setSaving(true);try{const latest=await apiRequest<WarehouseRecord>(endpoint+'/latest');if(generation===selectionGeneration.current){busy.current=false;await begin(true,latest)}}catch(e){setError((e as Error).message)}finally{busy.current=false;setSaving(false)}}
 async function save(){
  if(!editing||busy.current||!can(editing==='new'?'create':'edit'))return
  if(!await validateFields())return
  if(!draft.code.trim()||!draft.name.trim()){setError(fa?'کد و نام انبار الزامی است.':'Code and name are required.');return}
  if(!Number.isInteger(draft.floorCount)||draft.floorCount<1||draft.floorCount>5){setError('تعداد طبقات باید بین ۱ تا ۵ باشد.');return}
  if(!['inside','outside'].includes(draft.location??'')){setError('موقعیت انبار را مشخص کنید.');return}
  busy.current=true;setSaving(true);setError('')
  try{const value=await apiRequest<WarehouseRecord>(editing==='edit'&&selected?withRowVersion(endpoint+'/'+selected.id,selected.rowVersion):endpoint,{method:editing==='edit'?'PUT':'POST',body:JSON.stringify({...draft,custodianPersonId:draft.custodianPersonId||null})});setSelected(value);setDraft(fromRecord(value));setEditing(null);refresh()}catch(e){setError((e as Error).message)}finally{busy.current=false;setSaving(false)}
 }
 async function deactivate(){if(deleteSelectedDefinitionRows(root.current))return;if(!selected||!can('delete')||!confirm(fa?'این انبار غیرفعال شود؟ سوابق آن حفظ می‌شوند.':'Deactivate this warehouse? History will be retained.'))return;busy.current=true;setSaving(true);try{await apiRequest(withRowVersion(endpoint+'/'+selected.id,selected.rowVersion),{method:'DELETE'});setSelected(null);setDraft(empty());refresh()}catch(e){setError((e as Error).message)}finally{busy.current=false;setSaving(false)}}
 async function bulkDeleteRows(rows:Report[]){
  if(editing||busy.current||!can('delete'))throw Error('حذف در وضعیت فعلی مجاز نیست.')
  busy.current=true;setSaving(true);selectionGeneration.current++
  try{await apiRequest(endpoint+'/bulk-delete',{method:'POST',body:JSON.stringify({rows:rows.map(row=>({id:row.id,rowVersion:row.rowVersion}))})});setSelected(null);setDraft(empty());refresh()}
  finally{busy.current=false;setSaving(false)}
 }
 function action(id:string){if(saving||componentOpen)return;switch(id){case 'operational.new':void begin();break;case 'operational.copyLast':void copyLatest();break;case 'operational.copySelected':if(selected)void begin(true);break;case 'operational.edit':if(selected&&can('edit')){setEditing('edit');setError('');requestAnimationFrame(()=>codeInput.current?.focus())}break;case 'operational.save':void save();break;case 'operational.delete':void deactivate();break;case 'operational.close':if(editing){selectionGeneration.current++;setEditing(null);setDraft(selected?fromRecord(selected):empty());setError('')}else onClose();break}}
 const callbacks=useRef({action,editing,dialog,componentOpen});callbacks.current={action,editing,dialog,componentOpen}
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{const state=callbacks.current;if(e.key==='Delete'&&(e.target as Element).closest('[data-definition-bulk-active=true]'))return;if(state.dialog||state.componentOpen||(e.target as Element).closest('.person-number-list')||!ownsFormShortcut(root.current,e)||e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;const input=(e.target as Element).closest('input,textarea,select');const id=e.key==='F3'?'operational.save':e.key==='Escape'?'operational.close':!state.editing&&!input?({' ':'operational.new',Insert:'operational.edit',Delete:'operational.delete',F2:'operational.copyLast',F4:'operational.copySelected'} as Record<string,string>)[e.key]:undefined;if(id){e.preventDefault();e.stopImmediatePropagation();state.action(id)}};window.addEventListener('keydown',handler,true);return()=>window.removeEventListener('keydown',handler,true)},[])
 return <div ref={root} className="form-laboratory-page warehouse-page" dir={fa?'rtl':'ltr'} data-form-scope data-entry-active={Boolean(editing)||undefined}>
  <OperationalFormFrame formId={schema.id} title={schema.title[language]} language={language} width={warehouseFrame.width} height={warehouseFrame.height} designerDraft={warehouseDesigner} permissions={warehouseCustomization} behaviorContract={warehouseBehavior} fieldIds={Object.fromEntries(schema.fields.map(f=>[f.id,f.id]))} notice={error?<div className="form-message error-message" role="alert">{error}</div>:undefined}>
   {designer=><WarehouseContent {...{language,designer,draft,editing,saving,selected,query,revision,codeInput,action,can,bulkDeleteRows,restoreReady}} onChange={(key,value)=>setDraft(d=>({...d,[key]:key==='floorCount'?Number(value):value}))} onSelect={row=>void select(row)} onAddresses={(address,addresses)=>setDraft(d=>({...d,address,addresses}))} onDialog={setDialog} onComponentOpen={setComponentOpen}/>}
  </OperationalFormFrame>
  {dialog&&selected&&<WarehouseDetails language={language} warehouse={selected} kind={dialog} canEdit={can('zones')} onClose={()=>setDialog(null)}/>}
 </div>
}

function WarehouseContent(p:{restoreReady:boolean;bulkDeleteRows:(rows:Report[])=>Promise<void>;language:Language;designer:DesignerDraft;draft:Draft;editing:'new'|'edit'|null;saving:boolean;selected:WarehouseRecord|null;query:(q:GridQuery,s?:AbortSignal)=>Promise<GridPage<Report>>;revision:number;codeInput:React.RefObject<HTMLInputElement|null>;action:(id:string)=>void;can:(op:string)=>boolean;onChange:(key:keyof Draft,value:string)=>void;onSelect:(r:Report)=>void;onAddresses:(a:string,values:string[])=>void;onDialog:(v:'zones'|'history')=>void;onComponentOpen:(v:boolean)=>void}){
 const fa=p.language==='fa',d=p.designer,[focus,setFocus]=useState('')
 const selection=useRef(p);selection.current=p
 const onRowSelectionChange=useCallback((row:Report|null)=>{if(row&&!selection.current.editing)selection.current.onSelect(row)},[])
 const columns=useMemo(()=>schema.tables![0].columns.map(c=>({id:c.id,label:c.label[p.language],width:c.width??160,type:'text' as const,value:(r:Report)=>r[c.id as keyof Report]})),[p.language])
 const editorHeight=Math.max(238,...Object.values(d.canvas?.fields??{}).map(box=>box.input.top+box.input.height+16))
 const editor=<div className="person-editor panel laboratory-editor" style={designerAppearanceStyle(d) as CSSProperties}>
  <div className="person-form-grid laboratory-form-grid warehouse-fields" style={{height:editorHeight}}>
   {schema.fields.map(f=>{const key=f.id as keyof Draft,box=d.canvas?.fields[f.id];const common={disabled:!p.editing||p.saving,'data-field':f.id,'data-focus-order':f.focusOrder,'aria-label':f.label[p.language],required:f.required,onFocus:()=>setFocus(f.id),style:designerStyleForPart(d,f.id,'input') as CSSProperties};let control
    if(key==='address')control=<FormValueList field="address" label={f.label[p.language]} primary={p.draft.address} listPrimary={p.draft.address} numbers={p.draft.addresses} disabled={common.disabled} fa={fa} multiline onSelectValue={v=>p.onChange('address',v)} onChange={(v,values)=>p.onAddresses(v,values)} onPopupChange={p.onComponentOpen}/>
    else if(key==='custodianPersonId')control=<SystemLookup field={key} label={f.label[p.language]} language={p.language} value={p.draft.custodianPersonId} disabled={common.disabled} settings={{sourceId:'persons',returnMode:'saveAndSelect',selectedDisplay:'name'}} listSettings={{allowEmpty:!f.required}} onChange={id=>p.onChange(key,id)} onCreationChange={p.onComponentOpen}/>
    else if(key==='floorCount')control=<input {...common} type="number" min={1} max={5} onInvalid={e=>e.currentTarget.setCustomValidity('تعداد طبقات باید بین ۱ تا ۵ باشد.')} onInput={e=>e.currentTarget.setCustomValidity('')} value={p.draft.floorCount} onChange={e=>p.onChange(key,e.target.value)}/>
    else if(key==='location')control=<select {...common} value={p.draft.location??''} onChange={e=>p.onChange(key,e.target.value)} onInvalid={e=>e.currentTarget.setCustomValidity('موقعیت انبار را مشخص کنید.')} onInput={e=>e.currentTarget.setCustomValidity('')}><option value="">انتخاب کنید…</option><option value="inside">داخل محوطه شرکت</option><option value="outside">خارج از محوطه شرکت</option></select>
    else if(key==='code')control=<input {...codeInputProps(p.draft.code,brandCodeSettings,v=>p.onChange(key,v))} {...common} value={p.draft.code} ref={p.codeInput} maxLength={30}/>
    else control=<input {...common} value={String(p.draft[key]??'')} maxLength={key==='name'?200:4000} onChange={e=>p.onChange(key,e.target.value)}/>
    const rect=(part:'input'|'label'):CSSProperties=>box?{position:'absolute',left:`calc(50% - 372px + ${box[part].left}px)`,top:box[part].top,width:box[part].width,height:box[part].height}:{}
    return <div key={f.id} data-field-id={f.id} data-focus-order={f.focusOrder} style={{display:'contents'}}><Field container="div" label={f.label[p.language]} className="laboratory-designer-field lab-custom-field" labelContent={<span className="designer-label-part" style={{...rect('label'),...designerStyleForPart(d,f.id,'label')}}>{f.label[p.language]}{f.required?' *':''}</span>} controlContent={<span className="designer-input-part" data-entry-focus-indicator={p.editing&&focus===f.id||undefined} style={rect('input')}>{control}</span>}><span/></Field></div>
   })}
  </div>
 </div>
 const footer=<div className="shortcut-bar laboratory-footer">
  {schema.actions?.filter(a=>formActionVisible(p.editing?'edit':'view',a)).map(a=>{const op=a.id.split('.').at(-1)!;const permission=op==='new'||op.startsWith('copy')?'create':op==='save'?p.editing==='new'?'create':'edit':op;return <Shortcut key={a.id} code={a.code??''} label={a.label[p.language]} primary={a.primary} runtimeAction={op==='save'?'save':undefined} danger={op==='delete'} disabled={p.saving||op!=='close'&&!p.can(permission)||['edit','delete','copyLast','copySelected'].includes(op)&&!p.selected} onClick={()=>p.action(a.id)}/>})}
  {!p.editing&&<><button type="button" disabled={!p.selected} onClick={()=>p.onDialog('zones')}>{fa?'زون‌ها':'Zones'}</button><button type="button" disabled={!p.selected} onClick={()=>p.onDialog('history')}>{fa?'سوابق انباردار':'Custodian history'}</button></>}
 </div>
 return <FormSchemaPresentation schema={schema} designerDraft={d} language={p.language} readOnly={Boolean(p.editing)} editor={editor} footer={footer} initialEditorHeight={editorHeight} grid={{rows:[],columns,autoSelectFirstRow:p.restoreReady,onBulkDelete:!p.editing&&p.can('delete')?p.bulkDeleteRows:undefined,remoteQuery:p.query,remoteQueryScope:'warehouses:'+p.revision,selectedRowId:p.selected?.id,onRowSelectionChange}}/>
}

function WarehouseDetails({language,warehouse,kind,canEdit,onClose}:{language:Language;warehouse:WarehouseRecord;kind:'zones'|'history';canEdit:boolean;onClose:()=>void}){
 const [periods,setPeriods]=useState<Period[]>([]),[error,setError]=useState('');const fa=language==='fa'
 useEffect(()=>{if(kind==='history')void apiRequest<Period[]>(endpoint+'/'+warehouse.id+'/custodians').then(setPeriods).catch(e=>setError(e.message))},[kind,warehouse.id])
 if(kind==='zones')return <WarehouseZones language={language} warehouse={warehouse} canEdit={canEdit} onClose={onClose}/>
 return <FormDocumentDialog language={language} title={(fa?'سوابق انباردار':'Custodian history')+' — '+warehouse.nameFa} onClose={onClose} panelClassName="warehouse-details">
 {error&&<p role="alert">{error}</p>}<table><thead><tr><th>انباردار</th><th>شروع</th><th>پایان</th><th>توضیح</th></tr></thead><tbody>{periods.map(p=><tr key={p.id}><td>{p.displayName}</td><td>{new Date(p.startedAtUtc).toLocaleString(fa?'fa-IR':'en')}</td><td>{p.endedAtUtc?new Date(p.endedAtUtc).toLocaleString(fa?'fa-IR':'en'):'جاری'}</td><td>{p.reason??'—'}</td></tr>)}</tbody></table></FormDocumentDialog>
}
