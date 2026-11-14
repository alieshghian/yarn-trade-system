import {normalizeChoiceSearch} from './componentListSettings.ts'
import type {FormStorage} from './laboratoryFormDraftState'

export type PackagingType={id:string;name:string}
export type PackagingVolumeItem={id:string;value:string;packagingId:string;packagingName:string;cbmPerTon:number;isDefault:boolean}
export type PackagingVolumeSettings={decimalPlaces:number;allowNewTypes:boolean}
export const packagingTypesKey='yarn-trade:laboratory:packaging-types:v1'
export const packagingVolumeContract={componentId:'base-form.packaging-volume',version:2,interactionEngine:'FormValueList/NumberControl',entryAdapter:'two-fields-packaging-and-cbm-per-ton',defaultAppearance:'inherit-title-control-theme-no-independent-background',missingCoefficientCompletion:'loading-form-upserts-shared-type-and-product-coefficient-through-authorized-persistence-adapter',orderRequirement:false,unit:'m3-per-metric-ton-net',reference:'shared-packaging-types',identity:'stable-hidden-id',uniqueScope:'product-and-packaging-id',default:'one-per-product',missingCoefficient:'block-loading-confirmation-never-assume-zero',operationalIntegration:'server-reference-and-per-product-details-required; laboratory-storage-is-not-operational'} as const
export function packagingVolumeSettings(raw:unknown):PackagingVolumeSettings{
 const value=raw as Partial<PackagingVolumeSettings>|undefined
 return {decimalPlaces:Number.isInteger(value?.decimalPlaces)?Math.max(2,Math.min(6,value!.decimalPlaces!)):2,allowNewTypes:value?.allowNewTypes!==false}
}
export function readPackagingTypes(storage?:Pick<FormStorage,'getItem'>|null):PackagingType[]{
 const raw=storage?.getItem(packagingTypesKey);if(!raw)return []
 const values:unknown=JSON.parse(raw)
 if(!Array.isArray(values))throw Error('مرجع بسته‌بندی معتبر نیست؛ دادهٔ قبلی حفظ شده است.')
 const ids=new Set<string>(),names=new Set<string>()
 for(const item of values){if(!item||typeof item.id!=='string'||!item.id||typeof item.name!=='string'||!item.name.trim()||ids.has(item.id)||names.has(normalizeChoiceSearch(item.name)))throw Error('مرجع بسته‌بندی معتبر نیست؛ دادهٔ قبلی حفظ شده است.');ids.add(item.id);names.add(normalizeChoiceSearch(item.name))}
 return values
}
export function addPackagingType(types:readonly PackagingType[],name:string,id:string):PackagingType[]{
 const trimmed=name.trim();if(!trimmed)throw Error('نام بسته‌بندی را وارد کنید.')
 if(types.some(item=>normalizeChoiceSearch(item.name)===normalizeChoiceSearch(trimmed)))throw Error('این نوع بسته‌بندی قبلاً تعریف شده است؛ همان را انتخاب کنید.')
 if(!id||types.some(item=>item.id===id))throw Error('شناسهٔ بسته‌بندی تکراری است.')
 return [...types,{id,name:trimmed}]
}
export function packagingVolumeError(items:readonly PackagingVolumeItem[],precision=2):string{
 const ids=new Set<string>(),types=new Set<string>();let defaults=0
 for(const item of items){if(!item.id||ids.has(item.id)||!item.packagingId||types.has(item.packagingId))return 'هر نوع بسته‌بندی فقط یک بار برای این کالا مجاز است.';ids.add(item.id);types.add(item.packagingId)
 if(!Number.isFinite(item.cbmPerTon)||item.cbmPerTon<=0)return 'CBM هر تن باید عددی بزرگ‌تر از صفر باشد.'
 if(Math.abs(item.cbmPerTon*10**precision-Math.round(item.cbmPerTon*10**precision))>1e-7)return `حداکثر ${precision} رقم اعشار مجاز است.`
 if(!item.packagingName.trim())return 'نوع بسته‌بندی را مشخص کنید.';if(item.isDefault)defaults++}
 return items.length&&defaults!==1?'یک بسته‌بندی پیش‌فرض انتخاب کنید.':''
}
export function packagingVolumeLabel(item:Pick<PackagingVolumeItem,'packagingName'|'cbmPerTon'>){return `${item.packagingName} — ${item.cbmPerTon}`}
