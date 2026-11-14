/** Comparison only: preserve the owner's spelling in the displayed value. */
export function batchValueKey(value:string):string{return value.normalize('NFKC').replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)-(c>='۰'?'۰':'٠').charCodeAt(0))).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]+/g,'').toLocaleLowerCase()}
/** Require three compatible samples; never invent a numeric pattern from a name. */
export function suggestBatchValue(values:readonly string[]):string{
 const recent=values.filter(v=>v.trim()).slice(-3);if(recent.length<3)return '';
 const parsed=recent.map(v=>v.trim().replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)-(c>='۰'?'۰':'٠').charCodeAt(0))).match(/^(.*?)(\d+)([^\d]*)$/));
 if(parsed.some(v=>!v))return '';const [a,b,c]=parsed as RegExpMatchArray[];
 if(a[1]!==b[1]||b[1]!==c[1]||a[3]!==b[3]||b[3]!==c[3])return '';
 const step=Number(b[2])-Number(a[2]),next=Number(c[2])+step;
 if(!step||Number(c[2])-Number(b[2])!==step||!Number.isSafeInteger(next)||next<0)return '';
 const width=c[2].startsWith('0')?c[2].length:0;
 // Numeric entry and suggestions always use English digits, independently of UI/keyboard language.
 const original=recent[2].trim().match(/^(.*?)([0-9۰-۹٠-٩]+)([^0-9۰-۹٠-٩]*)$/)!;
 const digits=String(next).padStart(width,'0');
 const suggestion=original[1]+digits+original[3];
 return values.some(v=>batchValueKey(v)===batchValueKey(suggestion))?'':suggestion;
}
export const batchValuePatternContract={version:2,digitScript:'English-always-independent-of-keyboard-and-application-language',comparison:'normalized-digits; unchanged-duplicate-protection',suggestion:'preserve-prefix-suffix-leading-zero-width-and-selected-editability'} as const
export type BatchValueItem={id:string;value:string}
export function reconcileBatchValues(items:readonly BatchValueItem[],values:readonly string[],origins:ReadonlyMap<string,string>,createId:()=>string):BatchValueItem[]{
 const keys=new Set<string>();return values.map(value=>{const key=batchValueKey(value);if(!key||keys.has(key))throw Error('این مورد خالی یا تکراری است.');keys.add(key);const original=origins.get(value)??value;return {id:items.find(item=>item.value===original)?.id??createId(),value};});
}
