import {useRef} from 'react'
import type {Language} from '../../i18n'
import {FormValueList} from './FormValueList'

export type PersonTitleOption={id:string;nameFa:string;nameEn:string;nameZh?:string;code?:string;personType:'Individual'|'Company'}
export type TitleListCommit=(primary:string,names:string[],origins:ReadonlyMap<string,string>)=>Promise<{options:PersonTitleOption[];defaultId:string}>
type Props={value:string;options:PersonTitleOption[];disabled:boolean;required?:boolean;invalid?:boolean;canCreate:boolean;manageOptions?:boolean;defaultValue?:string;fa:boolean;language:Language;label?:string;field?:string;componentDefinitionId?:string;designerMode?:boolean;
 onChange:(value:string,personType?:PersonTitleOption['personType'])=>void;onSetDefault?:(value:string)=>void;onCreate:(name:string)=>Promise<PersonTitleOption>;onUpdate?:(option:PersonTitleOption,name:string)=>Promise<PersonTitleOption>;onRemove?:(option:PersonTitleOption)=>Promise<void>;canEdit?:(option:PersonTitleOption)=>boolean;canRemove?:(option:PersonTitleOption)=>boolean;onCommit?:TitleListCommit;onValidateRequired?:(control:HTMLSelectElement)=>boolean}

/** Title is a data adapter, not a second interaction engine. All gestures,
 * entry rows, editing, defaults, shortcuts and popup rendering live in FormValueList. */
export function PersonTitleControl({value,options,disabled,required=false,invalid=false,canCreate,defaultValue,fa,language,label=fa?'عنوان':'Title',field='titleId',componentDefinitionId='persons.title-control',designerMode,onChange,onSetDefault,onCreate,onUpdate,onRemove,canEdit,canRemove,onCommit,onValidateRequired}:Props){
 const validation=useRef<HTMLSelectElement>(null)
 const display=(option:PersonTitleOption)=>option.code==='MR'?(fa?'آقای':language==='zh'?'先生':option.nameEn):language==='fa'?option.nameFa:language==='zh'?option.nameZh??option.nameEn:option.nameEn
 const byName=(name:string)=>options.find(option=>display(option)===name)
 const nameOf=(id:string|undefined)=>{const option=options.find(item=>item.id===id);return option?display(option):''}
 const commit:TitleListCommit=onCommit??(async(primary,names,origins)=>{
   const next:PersonTitleOption[]=[]
   for(const name of names){const old=byName(origins.get(name)??name);next.push(old?(display(old)===name?old:onUpdate?await onUpdate(old,name):await Promise.reject(Error('ویرایش مجاز نیست.'))):await onCreate(name))}
   for(const old of options)if(!next.some(item=>item.id===old.id)){if(!onRemove)throw Error('حذف مجاز نیست.');await onRemove(old)}
   return {options:next,defaultId:next.find(item=>display(item)===primary)?.id??''}
 })
 return <div className="person-title-wrap" data-title-adapter data-component-reference={componentDefinitionId}>
  <FormValueList field={field} label={label} primary={nameOf(value)} numbers={options.map(display)} listPrimary={nameOf(defaultValue??value)} disabled={disabled} fa={fa} multiline required={required} designerMode={designerMode} canAdd={canCreate} componentDefinitionId={componentDefinitionId}
   addLabel={(fa?'افزودن ':'Add ')+label} listLabel={(fa?'نمایش ':'Show ')+label} getItemKey={name=>byName(name)?.id??name}
   canEdit={name=>{const option=byName(name);return Boolean(option&&(onCommit||onUpdate)&&canEdit?.(option)!==false)}}
   canRemove={name=>{const option=byName(name);return Boolean(option&&(onCommit||onRemove)&&canRemove?.(option)!==false)}}
   onSelectValue={name=>{const option=byName(name);if(option)onChange(option.id,option.personType)}}
   onChange={async(primary,names,origins)=>{const saved=await commit(primary,names,origins);const option=saved.options.find(item=>item.id===saved.defaultId);onSetDefault?.(saved.defaultId);if(option)onChange(option.id,option.personType);return true}}/>
  <select ref={validation} className="title-validation-select" tabIndex={-1} aria-hidden="true" aria-invalid={invalid||undefined} disabled={disabled} value={value} onChange={()=>{}} onBlur={()=>validation.current&&onValidateRequired?.(validation.current)} style={{display:'none'}}><option value=""/>{options.map(option=><option key={option.id} value={option.id}>{display(option)}</option>)}</select>
 </div>
}
