import {useState,useCallback,useEffect,type CSSProperties} from 'react'
import {FormValueList} from './FormValueList'
import {normalizeChoiceSearch} from './componentListSettings'
import {addPackagingType,readPackagingTypes,packagingTypesKey,packagingVolumeError,packagingVolumeLabel,packagingVolumeSettings,type PackagingVolumeItem} from './packagingVolume'
import './packagingVolume.css'

export type PackagingCatalogAdapter={read:()=>Promise<{id:string;name:string}[]>;create:(name:string)=>Promise<{id:string;name:string}>}
type Props={catalogAdapter?:PackagingCatalogAdapter;componentDefinitionId?:string;field:string;label:string;items:PackagingVolumeItem[];selectedId:string;language:'fa'|'en'|'zh';disabled?:boolean;readOnly?:boolean;settings?:unknown;style?:CSSProperties;onSelect:(id:string)=>void;onCommit:(items:PackagingVolumeItem[],selectedId:string)=>void|boolean|Promise<void|boolean>}
const encode=(name:string,cbm:number)=>JSON.stringify([name,cbm])
const decode=(value:string):{text:string;code:string}=>{try{const [text,code]=JSON.parse(value);return {text:String(text),code:String(code)}}catch{return {text:value,code:''}}}
/** Same title/list engine, with a two-input entry adapter; no separate modal or action engine. */
export function PackagingVolumeControl({catalogAdapter,componentDefinitionId='base-form.packaging-volume',field,label,items,selectedId,language,disabled=false,readOnly=false,settings,style,onSelect,onCommit}:Props){
 const config=packagingVolumeSettings(settings),selected=items.find(item=>item.id===selectedId)??items.find(item=>item.isDefault),valueOf=(item:PackagingVolumeItem)=>encode(item.packagingName,item.cbmPerTon)
 const [catalog,setCatalog]=useState<{id:string;name:string}[]>(()=>{if(catalogAdapter)return [];try{return readPackagingTypes(localStorage)}catch{return []}})
 const [catalogError,setCatalogError]=useState('')
 const [catalogReady,setCatalogReady]=useState(!catalogAdapter)
 useEffect(()=>{if(!catalogAdapter)return;let active=true;void catalogAdapter.read().then(types=>{if(active){setCatalog(types);setCatalogReady(true)}}).catch(e=>{if(active)setCatalogError(String(e.message??e))});return()=>{active=false}},[catalogAdapter])
 const refreshCatalog=useCallback((open:boolean)=>{if(open){if(catalogAdapter){setCatalogError('');void catalogAdapter.read().then(types=>{setCatalog(types);setCatalogReady(true)}).catch(e=>setCatalogError(String(e.message??e)));return}try{setCatalog(readPackagingTypes(localStorage))}catch{/* Preserve corrupt reference for explicit repair. */}}},[catalogAdapter])
 const format=(value:string)=>{if(!value)return '';const row=decode(value);return packagingVolumeLabel({packagingName:row.text,cbmPerTon:Number(row.code)})}
 const serialize=(text:string,code:string)=>{const name=text.trim(),cbm=Number(code.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.'));const error=packagingVolumeError([{id:'entry',packagingId:'type',packagingName:name,cbmPerTon:cbm,isDefault:true,value:''}],config.decimalPlaces);if(error)throw Error(error);return encode(name,cbm)}
 return <div className="person-title-wrap packaging-volume-control" data-packaging-volume={field} style={style}><FormValueList field={field} label={label} componentDefinitionId={componentDefinitionId} primary={selected?valueOf(selected):''} listPrimary={items.find(item=>item.isDefault)?valueOf(items.find(item=>item.isDefault)!):''} numbers={items.map(valueOf)} disabled={disabled||!catalogReady} fa={language==='fa'} multiline browseOnly={readOnly} canAdd={!readOnly} canEdit={()=>!readOnly} canRemove={()=>false} formatValue={format} formatSelectedValue={format} normalizeEntry={value=>normalizeChoiceSearch(decode(value).text)} getItemKey={value=>items.find(item=>valueOf(item)===value)?.id??value} pairEntry={{firstLabel:language==='fa'?'نوع بسته‌بندی':'Packaging',secondLabel:language==='fa'?'CBM هر تن':'CBM per ton',firstSuggestions:catalog.map(type=>type.name),initialEntries:()=>{
 const types=catalogAdapter?catalog:readPackagingTypes(localStorage),names=[...types.map(type=>type.name),...items.filter(item=>!types.some(type=>normalizeChoiceSearch(type.name)===normalizeChoiceSearch(item.packagingName))).map(item=>item.packagingName)]
 return names.map(text=>({text,code:String(items.find(item=>normalizeChoiceSearch(item.packagingName)===normalizeChoiceSearch(text))?.cbmPerTon??''),fixedName:true}))
 },parse:decode,serialize}} onPopupChange={refreshCatalog} onSelectValue={value=>onSelect(items.find(item=>valueOf(item)===value)?.id??'')} listSettings={readOnly?{permissions:{add:'none',edit:'none',remove:'none',setDefault:'none'}}:undefined} onChange={async(primary,values,origins)=>{
  if(catalogAdapter){
   const types=await catalogAdapter.read(),next:PackagingVolumeItem[]=[]
   for(const value of values){const row=decode(value);let type=types.find(item=>normalizeChoiceSearch(item.name)===normalizeChoiceSearch(row.text));if(!type){if(!config.allowNewTypes)throw Error('این بسته‌بندی در مرجع تعریف نشده است.');type=await catalogAdapter.create(row.text);types.push(type)}const original=items.find(item=>valueOf(item)===(origins.get(value)??value));const item={id:original?.id??crypto.randomUUID(),value:'',packagingId:type.id,packagingName:type.name,cbmPerTon:Number(row.code),isDefault:value===primary};item.value=packagingVolumeLabel(item);next.push(item)}
   const error=packagingVolumeError(next,config.decimalPlaces);if(error)throw Error(error);setCatalog(types);return onCommit(next,next.find(item=>item.isDefault)?.id??'')
  }
  let types=readPackagingTypes(localStorage)
  const next=values.map(value=>{const row=decode(value);let type=types.find(item=>normalizeChoiceSearch(item.name)===normalizeChoiceSearch(row.text));if(!type){if(!config.allowNewTypes)throw Error('این بسته‌بندی در مرجع تعریف نشده است.');types=addPackagingType(types,row.text,crypto.randomUUID());type=types.at(-1)!}const original=items.find(item=>valueOf(item)===(origins.get(value)??value));const item:PackagingVolumeItem={id:original?.id??crypto.randomUUID(),value:'',packagingId:type.id,packagingName:type.name,cbmPerTon:Number(row.code),isDefault:value===primary};item.value=packagingVolumeLabel(item);return item})
  const error=packagingVolumeError(next,config.decimalPlaces);if(error)throw Error(error)
  // Only the shared type reference is stored here. Product details use the caller's persistence gate.
  if(JSON.stringify(types)!==JSON.stringify(readPackagingTypes(localStorage)))localStorage.setItem(packagingTypesKey,JSON.stringify(types));setCatalog(types)
  return onCommit(next,next.find(item=>item.isDefault)?.id??'')
 }}/>{catalogError&&<span role="alert">{catalogError}<button type="button" onClick={()=>refreshCatalog(true)}>{language==='fa'?'تلاش دوباره':'Retry'}</button></span>}</div>
}
