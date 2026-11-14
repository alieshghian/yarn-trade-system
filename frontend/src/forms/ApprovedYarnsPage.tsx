import {deleteSelectedDefinitionRows} from '../components/base-form/useDefinitionRowSelection'
import {Fragment,useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {apiRequest,hasPermission,withRowVersion,currentUserKey,ApiError} from '../api'
import type {Language} from '../i18n'
import {Field,Shortcut} from '../DefinitionControls'
import {ownsFormShortcut,orderedEntryControls} from '../formInteraction'
import {FormSchemaPresentation} from '../components/base-form/FormSchemaPresentation'
import {OperationalFormFrame} from '../components/base-form/OperationalFormFrame'
import {FormValueList} from '../components/base-form/FormValueList'
import {SystemLookup} from '../components/base-form/SystemLookup'
import {BatchValueList,type BatchValueItem} from '../components/base-form/BatchValueList'
import {PackagingVolumeControl,type PackagingCatalogAdapter} from '../components/base-form/PackagingVolumeControl'
import type {PackagingVolumeItem} from '../components/base-form/packagingVolume'
import {ComponentListProvider} from '../components/base-form/ComponentListContext'
import {normalizeListSettings} from '../components/base-form/componentListSettings'
import {formActionVisible,validateTestRecord} from '../components/base-form/formBehavior'
import {designerActionStyle,designerActionCode,designerActionLabel,designerActionTextStyle,designerAppearanceStyle,designerStyleForPart,type DesignerDraft} from '../components/base-form/designer'
import {designerDraftForEditor,designerRectStyle} from '../components/base-form/formDocumentDesigner'
import {resolveFormLayout} from '../components/base-form/formLayoutContract'
import {evaluateDerivedFields,evaluateDerivedFieldParts} from '../components/base-form/derivedField'
import {fieldCodeSettings} from '../components/base-form/componentBehavior'
import {codeInputProps} from '../components/base-form/serialCode'
import {NumericFieldInput} from '../components/base-form/NumericFieldInput'
import {numericFieldInputProps} from '../components/base-form/numericField'
import {useFieldValidation} from '../components/base-form/useFieldValidation'
import {gridDisplayValue,type GridPage,type GridQuery} from '../components/base-form/excelGrid'
import type {Yarn} from '../YarnsPage'
import {approvedYarnSchema as schema,approvedYarnDesigner,approvedYarnDefinition as approved,yarnColorField,yarnVolumeField} from './approvedYarnDesign'

type Reference={id:string;fieldId:string;name:string;isDefault:boolean;rowVersion:string}
type Definition={releaseId:string;values:Record<string,string>;colors:{id:string;value:string;isDefault:boolean}[];packaging:{id:string;packagingId:string;packagingName:string;cbmPerTon:number;isDefault:boolean}[]}
type RecordValue=Yarn&{definition?:Definition}
type Report={id:string;yarnId:string;colorId?:string;[key:string]:string|number|undefined}
const endpoint='/api/yarns'
const blank=()=>Object.fromEntries(schema.fields.map(f=>[f.id,f.kind==='checkbox'?'true':'']))
const scalar=(row:RecordValue)=>Object.fromEntries(schema.fields.map(f=>[f.id,String((row as unknown as Record<string,unknown>)[f.id==='yarnGroup'?'productGroupId':f.id]??row.definition?.values[f.id]??'')]))

/** Thin persistence bindings; geometry, fields, list editors, grid and actions remain shared. */
export default function ApprovedYarnsPage({language,onClose=()=>{}}:{language:Language;onClose?:()=>void}){
 const root=useRef<HTMLDivElement>(null),busy=useRef(false),generation=useRef(0)
 const [restoreReady,setRestoreReady]=useState(false)
 const previousSelection=useRef<RecordValue|null>(null)
 const [selected,setSelected]=useState<RecordValue|null>(null),[mode,setMode]=useState<'new'|'edit'|null>(null),[values,setValues]=useState<Record<string,string>>(blank)
 const [colors,setColors]=useState<BatchValueItem[]>([]),[colorId,setColorId]=useState(''),[packaging,setPackaging]=useState<PackagingVolumeItem[]>([]),[packagingId,setPackagingId]=useState('')
 const [references,setReferences]=useState<Reference[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(false),[revision,setRevision]=useState(0),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({})
 const can=(op:string)=>hasPermission('yarns.'+op)
 const readReferences=useCallback(()=>apiRequest<Reference[]>(endpoint+'/definition-references'),[])
 useEffect(()=>{let active=true;void readReferences().then(r=>{if(active)setReferences(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[readReferences])
 const catalog=useMemo<PackagingCatalogAdapter>(()=>({read:async()=>(await readReferences()).filter(r=>r.fieldId==='packaging'),create:async name=>apiRequest<Reference>(endpoint+'/definition-references/packaging',{method:'POST',body:JSON.stringify({name})})}),[readReferences])
 const query=useCallback((q:GridQuery,signal?:AbortSignal)=>apiRequest<GridPage<Report>>(endpoint+'/definition-grid',{method:'POST',body:JSON.stringify(q),signal}),[])
 const loadRecord=(row:RecordValue,focusColor?:string)=>{
  const cs=row.definition?.colors??[],ps=row.definition?.packaging??[],cid=focusColor??cs.find(c=>c.isDefault)?.id??cs[0]?.id??'',pid=ps.find(p=>p.isDefault)?.id??''
  setSelected(row);setColors(cs.map(c=>({id:c.id,value:c.value})));setColorId(cid);setPackaging(ps.map(p=>({...p,value:p.packagingName+' — '+p.cbmPerTon})));setPackagingId(pid)
  setValues({...scalar(row),[yarnColorField]:cs.find(c=>c.id===cid)?.value??'',[yarnVolumeField]:ps.find(p=>p.id===pid)?.packagingName??''})
 }
 useEffect(()=>{const controller=new AbortController(),ticket=generation.current;void apiRequest<RecordValue>(endpoint+'/definition-latest',{signal:controller.signal}).then(record=>{if(!controller.signal.aborted&&ticket===generation.current)loadRecord(record)}).catch(e=>{if(!controller.signal.aborted&&ticket===generation.current&&!(e instanceof ApiError&&e.status===404))setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setRestoreReady(true)});return()=>controller.abort()},[])
 const select=useCallback(async(row:Report)=>{if(mode||busy.current)return;const ticket=++generation.current;try{const record=await apiRequest<RecordValue>(endpoint+'/'+row.yarnId);if(ticket===generation.current){loadRecord(record,row.colorId);setError('')}}catch(e){if(ticket===generation.current)setError((e as Error).message)}},[mode])
 const {validateFields}=useFieldValidation(root,{enabled:Boolean(mode),entity:'yarns',context:{currentId:mode==='edit'?selected?.id:null},rules:{code:{required:true,maxLength:50,remote:true},name:{required:true,maxLength:200,remote:true}}})
 const change=(id:string,value:string)=>{setValues(v=>({...v,[id]:value}));setFieldErrors(e=>{const next={...e};delete next[id];return next})}
 async function begin(source?:RecordValue){
  if(busy.current||!can('create'))return;previousSelection.current=selected;const ticket=++generation.current;setMode('new');setError('');setFieldErrors({})
  if(source){loadRecord(source);const originals=source.definition?.colors??[],cloned=originals.map(c=>({id:crypto.randomUUID(),value:c.value}));setColors(cloned);setColorId(cloned[originals.findIndex(c=>c.isDefault)]?.id??cloned[0]?.id??'');change('code','')}
  else {setSelected(null);setValues(blank());setColors([]);setColorId('');setPackaging([]);setPackagingId('')}
  try{const result=await apiRequest<{suggestion:string;error?:string}>(endpoint+'/definition-suggest-code');if(result.error)throw Error(result.error);if(ticket===generation.current)setValues(v=>v.code?v:{...v,code:result.suggestion})}catch(e){if(ticket===generation.current)setError((e as Error).message)}
  requestAnimationFrame(()=>orderedEntryControls(root.current!)[0]?.value.focus())
 }
 async function save(){
  if(!mode||busy.current||!can(mode==='new'?'create':'edit'))return
  const draft:Record<string,string>={...values,[yarnColorField]:colors.find(c=>c.id===colorId)?.value??colors[0]?.value??'',[yarnVolumeField]:packaging.length?'saved':''}
  const errors=validateTestRecord(schema,draft,[],selected?.id,{[yarnColorField]:colors,[yarnVolumeField]:packaging});setFieldErrors(errors)
  if(Object.keys(errors).length){const id=Object.keys(errors)[0];root.current?.querySelector<HTMLElement>(`[data-field-id="${id}"] input,[data-field-id="${id}"] textarea`)?.focus();return}
  // Own the submission before asynchronous field checks, not just before POST.
  busy.current=true
  let rejectedField=''
  try{
   if(!await validateFields())return
   setSaving(true);setError('')
   const group=await apiRequest<{selectable:boolean;terminalDepth:number;requiresConfirmation:boolean;message:string}>(`/api/master-data/product-groups/${draft.yarnGroup}/assignment`)
   if(!group.selectable){rejectedField='yarnGroup';throw Error(group.message)}
   if(group.requiresConfirmation&&!window.confirm(group.message))return
   const payload:Record<string,unknown>={};for(const f of schema.fields){if(f.readOnly||[yarnColorField,yarnVolumeField].includes(f.id))continue;payload[f.id==='yarnGroup'?'productGroupId':f.id]=f.kind==='checkbox'?draft[f.id]==='true':f.kind==='number'?(draft[f.id]?Number(draft[f.id]):f.id==='plyCount'?0:null):draft[f.id]||null}
   payload.confirmedProductGroupDepth=group.terminalDepth
   payload.definition={releaseId:approved.integrationHandoff.releaseId,values:draft,colors:colors.map((c,i)=>({id:mode==='edit'&&selected?.definition?.colors.some(old=>old.id===c.id)?c.id:null,value:c.value,isDefault:c.id===(colorId||colors[0]?.id)})),packaging:packaging.map(p=>({...p,id:mode==='edit'?p.id:null}))}
   const saved=await apiRequest<RecordValue>(mode==='edit'&&selected?withRowVersion(endpoint+'/'+selected.id,selected.rowVersion):endpoint,{method:mode==='edit'?'PUT':'POST',body:JSON.stringify(payload)})
   loadRecord(saved);setMode(null);setRevision(v=>v+1)
  }catch(e){
   setError((e as Error).message)
   if(e instanceof ApiError&&e.details?.errors&&typeof e.details.errors==='object'){
    const errors=e.details.errors as Record<string,unknown>
    for(const [key,messages] of Object.entries(errors)){
     const id=key.replace(/^\$\./,'').split('.').at(-1)?.toLowerCase()
     const field=schema.fields.find(f=>f.id.toLowerCase()===(id==='productgroupid'?'yarngroup':id))
     if(field){rejectedField||=field.id;setFieldErrors(current=>({...current,[field.id]:Array.isArray(messages)?messages.join(' '):String(messages)}))}
    }
   }
  }finally{busy.current=false;setSaving(false);if(rejectedField)requestAnimationFrame(()=>{const field=root.current?.querySelector<HTMLElement>(`[data-field-id="${rejectedField}"] input,[data-field-id="${rejectedField}"] textarea,[data-field-id="${rejectedField}"] button`);field?.focus({preventScroll:true});field?.scrollIntoView({block:'nearest',inline:'nearest'})})}
 }
 async function bulkDeleteRows(rows:Report[]){
  if(mode||busy.current||!can('delete'))throw Error('حذف در این حالت مجاز نیست.')
  busy.current=true;setSaving(true)
  try{await apiRequest(endpoint+'/bulk-delete',{method:'POST',body:JSON.stringify({rows:rows.map(row=>({id:row.id,rowVersion:row.rowVersion}))})});setSelected(null);setValues(blank());setColors([]);setPackaging([]);setColorId('');setPackagingId('');setRevision(v=>v+1)}
  finally{busy.current=false;setSaving(false)}
 }
 async function commitReferences(field:string,primary:string,names:string[],origins:ReadonlyMap<string,string>){
  const old=references.filter(r=>r.fieldId===field),kept=new Set<string>()
  const changes=names.map(name=>{const previous=old.find(r=>r.name===(origins.get(name)??name));if(previous)kept.add(previous.id);return {id:previous?.id??null,name,isDefault:name===primary,rowVersion:previous?.rowVersion}})
  const removed=old.filter(r=>!kept.has(r.id)).map(r=>({...r,remove:true}))
  const result=await apiRequest<Reference[]>(endpoint+'/definition-references/'+field,{method:'PUT',body:JSON.stringify([...changes,...removed])})
  setReferences(r=>[...r.filter(x=>x.fieldId!==field),...result]);change(field,primary)
 }
 async function action(id:string){if(id==='operational.delete'&&deleteSelectedDefinitionRows(root.current))return;
  if(busy.current)return;const op=id.split('.').at(-1)
  if(op==='new')await begin()
  else if(op==='copySelected'&&selected)await begin(selected)
  else if(op==='copyLast'&&can('create')){try{const last=await apiRequest<RecordValue>(endpoint+'/definition-latest');await begin(last)}catch(e){setError((e as Error).message)}}
  else if(op==='edit'&&selected&&can('edit')){generation.current++;loadRecord(selected);setMode('edit');requestAnimationFrame(()=>orderedEntryControls(root.current!)[0]?.value.focus())}
  else if(op==='save')await save()
  else if(op==='delete'&&selected&&can('delete')&&window.confirm('این نخ حذف شود؟')){try{await apiRequest(withRowVersion(endpoint+'/'+selected.id,selected.rowVersion),{method:'DELETE'});setSelected(null);setValues(blank());setColors([]);setPackaging([]);setRevision(v=>v+1)}catch(e){setError((e as Error).message)}}
  else if(op==='close'){generation.current++;if(mode){const original=mode==='new'?previousSelection.current:selected;if(original)loadRecord(original);else {setSelected(null);setValues(blank());setColors([]);setColorId('');setPackaging([]);setPackagingId('')}setMode(null);setFieldErrors({});setError('')}else onClose()}
 }
 const callbacks=useRef({action,mode});callbacks.current={action,mode}
 useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Delete'&&(e.target as Element).closest('[data-definition-bulk-active=true]'))return;if(!ownsFormShortcut(root.current,e)||e.isComposing||e.altKey||e.ctrlKey||e.metaKey||(e.target as Element).closest('[data-component-popup],.person-number-list'))return;const code=e.key===' '?'Space':e.key==='Escape'?'Esc':e.key;const a=schema.actions?.find(a=>a.code===code&&formActionVisible(callbacks.current.mode?'edit':'view',a));if(!a||code==='Space'&&(e.target as Element).closest('input,textarea,select'))return;e.preventDefault();e.stopImmediatePropagation();void callbacks.current.action(a.id)};window.addEventListener('keydown',fn,true);return()=>window.removeEventListener('keydown',fn,true)},[])
 useEffect(()=>{const fn=(e:BeforeUnloadEvent)=>{if(mode)e.preventDefault()};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn)},[mode])
 return <div ref={root} className="form-laboratory-page yarns-page" dir={language==='fa'?'rtl':'ltr'} data-form-scope data-form-behavior-id={approved.behaviorManifest.root} data-form-policy={JSON.stringify(approved.behaviorManifest.policies[approved.behaviorManifest.root as keyof typeof approved.behaviorManifest.policies])} data-entry-active={Boolean(mode)||undefined} data-approved-yarn-release={approved.integrationHandoff.releaseId}>
  <OperationalFormFrame formId={schema.id} title={approved.integrationHandoff.operationalTitle[language].replace(/\s+—\s+بازطراحی$/u,'')} language={language} designerDraft={approvedYarnDesigner} permissions={approved.form.customization} behaviorContract={approved.operationalBehaviorContract} width={approved.form.frame.width} height={approved.form.frame.height} fieldIds={Object.fromEntries(schema.fields.map(f=>[f.id,f.id]))} notice={error?<div role="alert" className="form-message error-message" style={{fontSize:16,lineHeight:1.7,padding:'10px 14px'}}>{error}</div>:undefined}>
   {designer=><ApprovedYarnContent {...{language,designer,values,colors,colorId,packaging,packagingId,catalog,references,mode,saving,fieldErrors,query,revision,action,can,change,commitReferences,bulkDeleteRows,restoreReady}} selected={selected} onSelect={select} onColors={(cs,id)=>{setColors(cs);setColorId(id);change(yarnColorField,cs.find(c=>c.id===id)?.value??'')}} onPackaging={(ps,id)=>{setPackaging(ps);setPackagingId(id);change(yarnVolumeField,ps.length?'saved':'')}}/>}
  </OperationalFormFrame>
 </div>
}

type ContentProps={restoreReady:boolean;bulkDeleteRows:(rows:Report[])=>Promise<void>;language:Language;designer:DesignerDraft;values:Record<string,string>;colors:BatchValueItem[];colorId:string;packaging:PackagingVolumeItem[];packagingId:string;catalog:PackagingCatalogAdapter;references:Reference[];mode:'new'|'edit'|null;saving:boolean;fieldErrors:Record<string,string>;query:(q:GridQuery,s?:AbortSignal)=>Promise<GridPage<Report>>;revision:number;selected:RecordValue|null;onSelect:(r:Report)=>void;action:(id:string)=>void;can:(op:string)=>boolean;change:(id:string,v:string)=>void;commitReferences:(f:string,p:string,v:string[],o:ReadonlyMap<string,string>)=>Promise<void>;onColors:(c:BatchValueItem[],id:string)=>void;onPackaging:(p:PackagingVolumeItem[],id:string)=>void}
function ApprovedYarnContent(p:ContentProps){
 const [focusField,setFocusField]=useState('')
 const values=evaluateDerivedFields(schema.fields,p.values,p.language),fa=p.language==='fa'
 const selectedColor=p.colors.find(color=>color.id===p.colorId)?.value??p.colors[0]?.value??'',colorLabel=schema.fields.find(field=>field.id===yarnColorField)?.label[p.language]??'رنگ'
 const names:Record<string,string>={[yarnColorField]:'color',[yarnVolumeField]:'packaging',isActive:'status',yarnGroup:'yarnGroup','field.ad0617df-aa97-41b8-b54b-0d8dac8e92e4':'comprehensiveName'}
 const columns=useMemo(()=>schema.tables![0].columns.map(c=>({id:c.id,label:c.label[p.language],width:c.width??160,type:(['countValue','filamentNumber'].includes(c.sourceFieldIds?.[0]??c.id)?'number':'text') as 'number'|'text',value:(r:Report)=>r[names[c.sourceFieldIds?.[0]??c.id]??c.sourceFieldIds?.[0]??c.id]??''})),[p.language])
 const selectRef=useRef(p);selectRef.current=p
 const onRowSelectionChange=useCallback((r:Report|null)=>{if(r&&!selectRef.current.mode)selectRef.current.onSelect(r)},[])
 const editor=(sectionId=schema.sections.find(section=>section.kind==='editor')?.id)=>{
  const d=designerDraftForEditor(p.designer,schema,sectionId),layout=resolveFormLayout(schema,d,'desktop',approved.form.frame.width,{cropEmptyCanvas:true}),canvas=layout.canvas
  return <div className="person-editor panel laboratory-editor" data-field-presentation={p.mode?'entry':p.selected?'view':'empty'} onFocusCapture={e=>{const id=(e.target as Element).closest<HTMLElement>('[data-field-id]')?.dataset.fieldId;if(id&&p.mode)setFocusField(id)}} style={designerAppearanceStyle(d) as CSSProperties}><div className={'person-form-grid laboratory-form-grid'+(canvas?' has-fixed-geometry':'')} style={{...(canvas?{width:canvas.centeredFieldIds?.length?'100%':canvas.width,minWidth:canvas.centeredFieldIds?.length?0:canvas.width,height:canvas.height,'--lab-center-shift':`calc(50% - ${canvas.width/2}px)`}:{}),...(layout.columns?{'--form-schema-grid-columns':layout.columns}:{})} as CSSProperties}>
   {schema.fields.filter(f=>!sectionId||f.sectionId===sectionId).map(f=>{
    const label=f.label[p.language],disabled=Boolean(!p.mode||p.saving||f.readOnly),common={'data-field':f.id,'aria-label':label,disabled,style:designerStyleForPart(d,f.id,'input') as CSSProperties};let control
    if(f.componentId==='persons.title-control'){const refs=p.references.filter(r=>r.fieldId===f.id);control=<FormValueList {...common} multiline field={f.id} label={label} primary={values[f.id]??''} listPrimary={refs.find(r=>r.isDefault)?.name??''} numbers={refs.map(r=>r.name)} fa={fa} componentDefinitionId={f.componentId} onSelectValue={v=>p.change(f.id,v)} onChange={(primary,rows,origins)=>p.commitReferences(f.id,primary,rows,origins)}/>}
    else if(f.componentId==='base-form.system-lookup')control=<SystemLookup field={f.id} label={label} value={values[f.id]??''} language={p.language} disabled={disabled} settings={f.settings?.lookupSettings} listSettings={normalizeListSettings(f.settings?.listSettings)} onChange={id=>p.change(f.id,id)}/>
    else if(f.id===yarnColorField)control=<BatchValueList field={f.id} label={label} items={p.colors} selectedId={p.colorId} disabled={p.saving} readOnly={!p.mode} fa={fa} onSelect={id=>p.onColors(p.colors,id)} onCommit={p.onColors}/>
    else if(f.id===yarnVolumeField)control=<PackagingVolumeControl catalogAdapter={p.catalog} field={f.id} label={label} language={p.language} items={p.packaging} selectedId={p.packagingId} readOnly={!p.mode} disabled={p.saving} settings={f.settings?.packagingVolumeSettings} onSelect={id=>p.onPackaging(p.packaging,id)} onCommit={p.onPackaging}/>
    else if(f.kind==='textarea')control=<textarea {...common} value={values[f.id]??''} onChange={e=>p.change(f.id,e.target.value)}/>
    else if(f.componentId==='base-form.derived-display'){const derived=evaluateDerivedFieldParts(schema.fields,p.values,f.id,p.language);control=<output aria-label={label} aria-readonly="true" data-derived-field="true" dir={fa?'rtl':'ltr'} style={{userSelect:'none',WebkitUserSelect:'none'}}><span data-derived-text style={{display:'block',width:'100%',minWidth:0,whiteSpace:'pre-wrap',textAlign:'inherit'}}>{derived.parts.map((part,index)=><Fragment key={index}>{index>0&&<bdi dir="auto">{derived.separator}</bdi>}<bdi dir="auto">{part}</bdi></Fragment>)}{selectedColor&&<><span>{'  '}</span><bdi dir="auto">{colorLabel} {gridDisplayValue(selectedColor)}</bdi></>}</span></output>}
    else if(f.kind==='checkbox')control=<input {...common} type="checkbox" checked={values[f.id]==='true'} onChange={e=>p.change(f.id,String(e.target.checked))}/>
    else if(f.id==='code')control=<input {...common} {...codeInputProps(values[f.id]??'',fieldCodeSettings(f),v=>p.change(f.id,v))} value={values[f.id]??''}/>
    else if(f.kind==='number'||f.valueType==='number')control=<NumericFieldInput {...common} {...numericFieldInputProps(f)} value={values[f.id]??''} onChange={e=>p.change(f.id,e.target.value)} loadOptions={(prefix,signal)=>apiRequest<string[]>(endpoint+'/definition-number-options?field='+encodeURIComponent(f.id)+'&q='+encodeURIComponent(prefix),{signal})}/>
    else control=<input {...common} {...numericFieldInputProps(f)} type="text" value={values[f.id]??''} onChange={e=>p.change(f.id,e.target.value)}/>
    const rect=(part:'input'|'label')=>({...designerStyleForPart(d,f.id,part),...designerRectStyle(canvas?.fields[f.id]?.[part]),...(canvas?.centeredFieldIds?.includes(f.id)?{left:`calc(${canvas.fields[f.id][part].left}px + var(--lab-center-shift,0px))`}:{})}) as CSSProperties
    return <ComponentListProvider key={f.id} settings={normalizeListSettings(f.settings?.listSettings)}><div className="laboratory-designer-field lab-custom-field" data-field-id={f.id} data-focus-order={f.focusOrder} data-enter-enabled={f.enterEnabled===false||f.readOnly?'false':undefined} style={layout.fieldStyles[f.id]}><Field container="div" label={label} className={f.kind==='checkbox'?'active-check':undefined} error={p.fieldErrors[f.id]} labelContent={<span className="designer-label-part" style={rect('label')}>{label}{f.required?' *':''}</span>} controlContent={<span className="designer-input-part" data-entry-focus-indicator={Boolean(p.mode&&focusField===f.id&&approved.operationalBehaviorContract.entryFocus.retainVisualIndicatorOnBlur)||undefined} style={rect('input')}>{control}</span>}><span/></Field></div></ComponentListProvider>
   })}</div></div>
 }
 const footer=<div className="laboratory-footer-stack" style={{'--lab-action-bar-offset-y':`${p.designer.actionBarOffsetY??0}px`} as CSSProperties}><div className="shortcut-bar laboratory-footer" style={{...designerAppearanceStyle(p.designer),'--lab-action-bar-height':p.designer.actionBarHeight===undefined?undefined:p.designer.actionBarHeight+'px'} as CSSProperties}>{schema.actions?.filter(a=>formActionVisible(p.mode?'edit':'view',a)).map(a=>{const op=a.id.split('.').at(-1)!,permission=op==='new'||op.startsWith('copy')?'create':op==='save'?p.mode==='new'?'create':'edit':op;return <span key={a.id} data-action-id={a.id} className="laboratory-action-button" style={designerActionStyle(p.designer,a.id) as CSSProperties}><Shortcut code={designerActionCode(p.designer,a)} label={designerActionLabel(p.designer,a,p.language)} codeStyle={designerActionTextStyle(p.designer,a.id,'code')} labelStyle={designerActionTextStyle(p.designer,a.id,p.language)} runtimeAction={op==='save'?'save':undefined} primary={a.primary} danger={op==='delete'} disabled={p.saving||op!=='close'&&!p.can(permission)||['edit','delete','copySelected'].includes(op)&&!p.selected} onClick={()=>p.action(a.id)}/></span>})}</div></div>
 return <FormSchemaPresentation schema={schema} designerDraft={p.designer} language={p.language} readOnly={Boolean(p.mode)} validationMode="off" editor={editor()} renderEditor={section=>editor(section.id)} footer={footer} grid={{rows:[],columns,autoSelectFirstRow:p.restoreReady,onBulkDelete:!p.mode&&p.can('delete')?p.bulkDeleteRows:undefined,bulkDeleteConfirm:count=>count+' ردیف رنگ/کالا حذف شود؟ فقط رنگ‌های انتخاب‌شده حذف می‌شوند؛ انتخاب تمام رنگ‌های یک کالا باعث حذف همان کالا می‌شود. موارد دارای سابقه قابل حذف نیستند.',remoteQuery:p.query,remoteQueryScope:'approved-yarns:'+p.revision,columnPreferencesStorageKey:'approved-yarns:'+schema.id+':'+currentUserKey(),selectedRowId:p.colorId||p.selected?.id,onRowSelectionChange}}/>
}
