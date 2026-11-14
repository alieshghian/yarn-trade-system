import type {FormSchemaField} from './formSchema'
export function numericFieldPlaces(field:FormSchemaField):number|null{
 if(field.validation?.some(rule=>rule.type==='integer'))return 0;
 const value=(field.settings?.numericSettings as {decimalPlaces?:unknown}|undefined)?.decimalPlaces;
 return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=12?value:null;
}
export function numericFieldInputProps(field:FormSchemaField){
 // Generic renderers also call this for text inputs. Never mark those as decimal:
 // language switching and the virtual keyboard use inputMode to detect numeric fields.
 if(field.kind!=='number'&&field.valueType!=='number')return {step:'any',inputMode:'text' as const};
 const places=numericFieldPlaces(field);return {step:places===null?'any':places===0?'1':'0.'+'0'.repeat(places-1)+'1',inputMode:places===0?'numeric' as const:'decimal' as const};
}
export function numericFieldError(field:FormSchemaField,value:string):string{
 if(!value.trim()||!(field.kind==='number'||field.valueType==='number')||['base-form.code-input','base-form.incremental-code','base-form.packaging-volume'].includes(field.componentId))return '';
 if(!Number.isFinite(Number(value)))return 'عدد معتبر وارد کنید.';
 const places=numericFieldPlaces(field);if(places===null)return '';
 const [mantissa,exponent='0']=value.toLowerCase().split('e'),fraction=(mantissa.split('.')[1]??''),trailing=mantissa.replace('.','').match(/0+$/)?.[0].length??0;
 const digits=Math.max(0,fraction.length-Number(exponent)-trailing);
 return digits>places?(places===0?'فقط عدد صحیح مجاز است.':'حداکثر '+places+' رقم اعشار مجاز است.') : '';
}

export const numericSuggestionContract={version:2,inputDigits:"Persian-Arabic-English-normalized-before-native-number-editing",pasteDigits:"same-normalization-preserving-caret-and-selection",source:"same-field-saved-values",trigger:"nonempty-numeric-prefix",limit:20,selection:"explicit-Enter-or-pointer; never-automatic",staleResponse:"abort-and-ignore",geometry:"overlay-without-reflow",codes:"excluded",laboratory:"temporary-records-only",operational:"permission-checked-bounded-server-query",focusFill:"whole-composite-including-buttons"} as const
