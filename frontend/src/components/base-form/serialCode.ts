export type CodeCharacterMode='number'|'letters'|'alphanumeric'
export type CodeComponentSettings={mode:CodeCharacterMode;required:boolean;unique:boolean;incremental:boolean;suffixWidth:number}
export const defaultCodeComponentSettings:CodeComponentSettings={mode:'alphanumeric',required:true,unique:true,incremental:false,suffixWidth:3}
export function normalizeCodeComponentSettings(value:Partial<CodeComponentSettings>|undefined):CodeComponentSettings{
 const mode=value?.mode==='number'||value?.mode==='letters'||value?.mode==='alphanumeric'?value.mode:defaultCodeComponentSettings.mode
 return {mode,required:typeof value?.required==='boolean'?value.required:defaultCodeComponentSettings.required,unique:typeof value?.unique==='boolean'?value.unique:defaultCodeComponentSettings.unique,incremental:typeof value?.incremental==='boolean'?value.incremental:defaultCodeComponentSettings.incremental,suffixWidth:typeof value?.suffixWidth==='number'&&Number.isFinite(value.suffixWidth)?Math.max(1,Math.min(12,Math.trunc(value.suffixWidth))):defaultCodeComponentSettings.suffixWidth}
}
const westernDigits=(value:string)=>value.replace(/[۰-۹٠-٩]/g,character=>String((character.charCodeAt(0)>=0x06f0?character.charCodeAt(0)-0x06f0:character.charCodeAt(0)-0x0660)))
export function validateComponentCode(value:string,settings:CodeComponentSettings,existing:readonly string[]=[]):string|undefined{
 const code=value.trim()
 if(!code)return settings.required?'این کد الزامی است.':undefined
 const pattern=settings.mode==='number'?/^[0-9۰-۹٠-٩]+$/:settings.mode==='letters'?/^\p{L}+$/u:/^[\p{L}0-9۰-۹٠-٩]+$/u
 if(!pattern.test(code))return settings.mode==='number'?'فقط عدد مجاز است.':settings.mode==='letters'?'فقط حروف مجاز است.':'فقط حروف و عدد مجاز است.'
 if(settings.unique&&existing.some(item=>westernDigits(item.trim().toLocaleLowerCase())===westernDigits(code.toLocaleLowerCase())))return 'این کد قبلاً استفاده شده است.'
 return undefined
}
function incrementLetters(value:string):string{
 const letters=value.toUpperCase().split('')
 for(let index=letters.length-1;index>=0;index--){const code=letters[index].charCodeAt(0);if(code<90){letters[index]=String.fromCharCode(code+1);return letters.join('')}letters[index]='A'}
 return 'A'+letters.join('')
}
export function nextIncrementalCode(values:readonly string[],settings:Pick<CodeComponentSettings,'mode'|'suffixWidth'>=defaultCodeComponentSettings):string{
 const width=Math.max(1,Math.min(12,Math.trunc(settings.suffixWidth)||1))
 const candidates=values.map(value=>westernDigits(value.trim())).filter(value=>value&&/^\p{L}*\d+$/u.test(value))
 if(!candidates.length)return settings.mode==='number'?'1'.padStart(width,'0'):'1'.padStart(width,'0')
 const last=candidates.at(-1)!,match=last.match(/^(\p{L}*)(\d+)$/u)!
 const prefix=match[1],digits=match[2],next=BigInt(digits)+1n,limit=10n**BigInt(digits.length)
 if(settings.mode==='number'||next<limit)return prefix+next.toString().padStart(Math.max(width,digits.length),'0')
 return incrementLetters(prefix||'A')+'1'.padStart(width,'0')
}
