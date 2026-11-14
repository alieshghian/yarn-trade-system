import {formActionVisible} from '../components/base-form/formBehavior'
import {useEffect,useMemo,useState,type CSSProperties,type RefObject} from 'react'
import {Field,Shortcut} from '../DefinitionControls'
import type {Language} from '../i18n'
import type {Brand} from '../BrandsPage'
import {FormSchemaPresentation} from '../components/base-form/FormSchemaPresentation'
import {designerActionCode,designerActionLabel,designerActionStyle,designerActionTextStyle,designerActionVisible,designerAppearanceStyle,designerStyleForPart} from '../components/base-form/designer'
import {designerRectStyle} from '../components/base-form/formDocumentDesigner'
import {resolveFormLayout} from '../components/base-form/formLayoutContract'
import {codeInputProps} from '../components/base-form/serialCode'
import type {DesignerDraft} from '../components/base-form/designer'
import {OperationalFormFrame} from '../components/base-form/OperationalFormFrame'
import {brandSchema,brandDesigner,brandFrame,brandCustomization,brandOperationalBehavior,brandCodeSettings,type BrandValues} from './brandDesign'

type Props={onBulkDelete?:(rows:Brand[])=>Promise<void>;onLookupSelect?:()=>void;language:Language;rows:Brand[];draft:BrandValues;editing:boolean;saving:boolean;loading:boolean;selectedId:string;error:string;message:string;fieldErrors:Partial<Record<keyof BrandValues,string>>;codeInput:RefObject<HTMLInputElement|null>;functionShortcuts:{f2CopyLast:boolean;f4CopySelected:boolean};onFunctionShortcutsChange:(value:{f2CopyLast:boolean;f4CopySelected:boolean})=>void;onChange:(key:keyof BrandValues,value:string)=>void;onSelect:(row:Brand)=>void;onValidateCode:(value:string)=>void;onAction:(id:string)=>void;can:(operation:string)=>boolean}
function DesignedBrandsContent(p:Props&{designer:DesignerDraft}){
 const fa=p.language==='fa',schema=brandSchema,designer=p.designer
 const [entryFocusField,setEntryFocusField]=useState<string|null>(null)
 useEffect(()=>{if(!p.editing)setEntryFocusField(null)},[p.editing])
 const layout=resolveFormLayout(schema,designer,'desktop',brandFrame.width,{cropEmptyCanvas:true})
 const canvas=layout.canvas
 const columns=useMemo(()=>schema.tables![0].columns.map(column=>({id:column.id,label:column.label[p.language],width:column.width??180,type:'text' as const,value:(row:Brand)=>String(row[(column.binding?.kind==='dataField'?column.binding.dataFieldId:column.id) as keyof Brand]??'')})),[p.language])
 const editor=<div className="person-editor panel laboratory-editor" style={designerAppearanceStyle(designer) as CSSProperties}>
  <div className={'person-form-grid laboratory-form-grid'+(canvas?' has-fixed-geometry':'')} data-layout-kind={layout.kind} style={{...(canvas?{width:canvas.centeredFieldIds?.length?'100%':canvas.width,height:canvas.height,minWidth:canvas.centeredFieldIds?.length?0:canvas.width,'--lab-center-shift':`calc(50% - ${canvas.width/2}px)`}:{}),...(layout.columns?{'--form-schema-grid-columns':layout.columns}:{})} as CSSProperties}>
   {schema.fields.map(field=>{
    const key=field.dataBinding?.kind==='dataField'?field.dataBinding.dataFieldId as keyof BrandValues:field.id as keyof BrandValues
    const positioned=(part:'input'|'label')=>({...designerStyleForPart(designer,field.id,part),...designerRectStyle(canvas?.fields[field.id]?.[part]),...(canvas?.centeredFieldIds?.includes(field.id)?{left:`calc(${canvas.fields[field.id][part].left}px + var(--lab-center-shift,0px))`}:{})}) as CSSProperties
    const common={value:p.draft[key]??'',disabled:!p.editing||p.saving,required:field.required===true,'aria-label':field.label[p.language],'aria-invalid':Boolean(p.fieldErrors[key]),'data-field':key,'data-focus-order':field.focusOrder,onFocus:()=>{if(p.editing&&brandOperationalBehavior.entryFocus.retainVisualIndicatorOnBlur)setEntryFocusField(field.id)},style:designerStyleForPart(designer,field.id,'input') as CSSProperties}
    const control=key==='description'?<textarea {...common} rows={1} style={{...common.style,overflowY:p.draft[key]?'auto':'hidden'}} maxLength={4000} onChange={e=>p.onChange(key,e.target.value)}/>:key==='brandCode'?<input {...codeInputProps(p.draft.brandCode,brandCodeSettings,value=>p.onChange(key,value))} {...common} ref={p.codeInput} maxLength={30} onBlur={e=>p.onValidateCode(e.target.value)}/>:<input {...common} maxLength={200} onChange={e=>p.onChange(key,e.target.value)}/>
    return <Field key={field.id} className="laboratory-designer-field lab-custom-field" style={{...designerStyleForPart(designer,field.id,'field'),...layout.fieldStyles[field.id]}} label={field.label[p.language]} error={p.fieldErrors[key]} labelContent={<span className="designer-label-part" style={positioned('label')}>{field.label[p.language]}{field.required?' *':''}</span>} controlContent={<span className="designer-input-part" data-entry-focus-indicator={brandOperationalBehavior.entryFocus.retainVisualIndicatorOnBlur&&p.editing&&entryFocusField===field.id||undefined} style={positioned('input')}>{control}</span>}><span/></Field>
   })}
  </div>
 </div>
 const footer=<div className="shortcut-bar laboratory-footer" dir={fa?'rtl':'ltr'} style={designerAppearanceStyle(designer) as CSSProperties}>
  {schema.actions?.filter(action=>designerActionVisible(designer,action)).filter(action=>action.id!=='operational.copyLast'||p.functionShortcuts.f2CopyLast).filter(action=>action.id!=='operational.copySelected'||p.functionShortcuts.f4CopySelected).filter(action=>formActionVisible(p.editing?'edit':'view',action)).map(action=>{
   const operation=action.id.split('.').at(-1)!,permission=['new','copyLast','copySelected'].includes(operation)?'create':operation
   const disabled=p.saving||p.loading||(['new','copyLast','copySelected','edit','delete','save'].includes(operation)&&!p.can(operation==='save'?'save':permission))||(['edit','delete','copySelected'].includes(operation)&&!p.selectedId)||(operation==='copyLast'&&!p.rows.length)
   return <span key={action.id} className="laboratory-action-button" data-action-id={action.id} style={designerActionStyle(designer,action.id) as CSSProperties}><Shortcut code={designerActionCode(designer,action)} label={designerActionLabel(designer,action,p.language)} codeStyle={designerActionTextStyle(designer,action.id,'code')} labelStyle={designerActionTextStyle(designer,action.id,p.language)} primary={action.primary} danger={operation==='delete'} disabled={disabled} runtimeAction={operation==='save'?'save':undefined} onClick={()=>p.onAction(action.id)}/></span>
  })}
  {p.onLookupSelect && !p.editing && <Shortcut code="Enter" label={fa?'انتخاب':'Select'} primary disabled={!p.selectedId||p.loading||p.saving} onClick={p.onLookupSelect}/> }
  <details className="shortcut-settings"><summary title={fa?'تنظیم کلیدهای F2 و F4':'Configure F2 and F4'}>⚙</summary><div>
   <label><input type="checkbox" checked={p.functionShortcuts.f2CopyLast} onChange={event=>p.onFunctionShortcutsChange({...p.functionShortcuts,f2CopyLast:event.target.checked})}/>F2 — {fa?'کپی آخرین':'Copy last'}</label>
   <label><input type="checkbox" checked={p.functionShortcuts.f4CopySelected} onChange={event=>p.onFunctionShortcutsChange({...p.functionShortcuts,f4CopySelected:event.target.checked})}/>F4 — {fa?'کپی انتخابی':'Copy selected'}</label>
  </div></details>
 </div>
 return <FormSchemaPresentation schema={schema} designerDraft={designer} language={p.language} readOnly={p.editing} editor={editor} footer={footer} grid={{rows:p.rows,columns,onBulkDelete:!p.editing&&p.can('delete')?p.onBulkDelete:undefined,selectedRowId:p.selectedId,title:schema.tables![0].title?.[p.language],onRowSelectionChange:row=>{if(row&&!p.editing)p.onSelect(row)}}}/>
}
export function DesignedBrandsView(p:Props){
 return <div className="form-laboratory-page" dir={p.language==='fa'?'rtl':'ltr'} data-operational-brand-design={brandSchema.id} data-form-scope data-entry-active={p.editing||undefined} data-button-press-effect={brandDesigner.buttonPressEffect!==false?'true':'false'}>
  <OperationalFormFrame formId={brandSchema.id} title={brandSchema.title[p.language]} language={p.language} designerDraft={brandDesigner} permissions={brandCustomization} behaviorContract={brandOperationalBehavior} fieldIds={Object.fromEntries(brandSchema.fields.map(field=>[field.dataBinding?.kind==='dataField'?field.dataBinding.dataFieldId:field.id,field.id]))} width={brandFrame.width} height={brandFrame.height} notice={<>{p.error&&<div className="form-message error-message" role="alert">{p.error}</div>}{p.message&&<div className="form-message success-message" role="status">{p.message}</div>}</>}>
   {designer=><DesignedBrandsContent {...p} designer={designer}/>}
  </OperationalFormFrame>
 </div>
}
