import test from 'node:test'
import assert from 'node:assert/strict'
import {nextIncrementalCode,validateComponentCode,defaultCodeComponentSettings} from './serialCode.ts'

test('incremental codes preserve digit width and carry into the alphabetic prefix',()=>{
 const settings={...defaultCodeComponentSettings,mode:'alphanumeric',suffixWidth:1}
 assert.equal(nextIncrementalCode(['AB8'],settings),'AB9')
 assert.equal(nextIncrementalCode(['AB9'],settings),'AC1')
 assert.equal(nextIncrementalCode(['AB998'],{...settings,suffixWidth:3}),'AB999')
 assert.equal(nextIncrementalCode(['AB999'],{...settings,suffixWidth:3}),'AC001')
 assert.equal(nextIncrementalCode(['1001'],{...settings,mode:'number',suffixWidth:4}),'1002')
 assert.equal(nextIncrementalCode(['AB۹'],{...settings,suffixWidth:1}),'AC1')
 assert.equal(nextIncrementalCode([],{...settings,mode:'number',suffixWidth:4}),'0001')
})

test('code rules enforce required, format and uniqueness against sample values',()=>{
 const settings={...defaultCodeComponentSettings,mode:'alphanumeric'}
 assert.match(validateComponentCode('',settings)??'',/الزامی/)
 assert.match(validateComponentCode('AB-1',{...settings,format:'segments',segments:[{kind:'letters',length:2},{kind:'number',length:1}]})??'',/قالب|حروف/)
 assert.match(validateComponentCode('ab1',settings,['AB1'])??'',/استفاده/)
 assert.equal(validateComponentCode('AB1',settings,['AB2']),undefined)
 assert.equal(validateComponentCode('۱۲۳',{...settings,mode:'number'},[]),undefined)
 assert.equal(validateComponentCode('123',{...settings,mode:'letters'},[]),'فقط حروف انگلیسی A-Z مجاز است.')
})

import {readFileSync} from 'node:fs'
import {normalizeCodeComponentSettings,normalizeComponentCode,formatComponentCode,suggestComponentCode,codeInputProps} from './serialCode.ts'
import {validateRecordRules} from './fieldRules.ts'
const cases=JSON.parse(readFileSync(new URL('../../../../tests/fixtures/serial-code-cases.json',import.meta.url),'utf8'))
for(const item of cases.suggestions)test('shared suggestion: '+item.name,()=>{const result=suggestComponentCode(item.values,item.settings);assert.equal(result.value,item.expected);assert.equal(Boolean(result.error),item.error)})
for(const item of cases.validation)test('shared validation: '+item.name,()=>assert.equal(validateComponentCode(item.value,normalizeCodeComponentSettings(item.settings),item.existing)===undefined,item.valid))
test('canonical storage and fieldRules uniqueness share code comparison, including composite scopes',()=>{
 assert.equal(normalizeComponentCode(' ab۱۲٠ '),'AB120')
 assert.equal(formatComponentCode(' ab۱۲٠ '),'ab120')
 const fields=['code','scope'].map(id=>({id,componentId:id==='code'?'base-form.code-input':'definition.field',kind:'text',label:{fa:id,en:id,zh:id},ruleSettings:id==='code'?{scopeFieldIds:['scope']}:undefined}))
 const schema={fields,uniqueConstraints:[]},rows=[{id:'a',values:{code:'AB۱۲',scope:'x'}}]
 assert.ok(validateRecordRules(schema,{code:'ab12',scope:'x'},rows).code)
 assert.equal(validateRecordRules(schema,{code:'ab12',scope:'y'},rows).code,undefined)
 assert.equal(validateRecordRules(schema,{code:'ab12',scope:'x'},rows,'a').code,undefined)
 schema.uniqueConstraints=[{id:'combo',fieldIds:['code','scope']}]
 assert.ok(validateRecordRules(schema,{code:'ab12',scope:'x'},rows).scope)
})
test('input rejects invalid paste/composition and maps only a focused physical Latin letter',()=>{
 let value='AB12';const input={value,selectionStart:4,selectionEnd:4};let props=codeInputProps(value,defaultCodeComponentSettings,next=>{value=next})
 props.onChange({currentTarget:{...input,value:'ab۱۲'},nativeEvent:{isComposing:false}});assert.equal(value,'ab12')
 input.value=value;props=codeInputProps(value,defaultCodeComponentSettings,next=>{value=next})
 const composing={...input,value:'ABبرند'};props.onChange({currentTarget:composing,nativeEvent:{isComposing:true}});assert.equal(value,'ab12');props.onCompositionEnd({currentTarget:composing});assert.equal(composing.value,'ab12')
 props.onPaste({preventDefault(){},currentTarget:input,clipboardData:{getData:()=> 'فارسی'}});assert.equal(value,'ab12')
 let prevented=false;globalThis.requestAnimationFrame=()=>0
 props.onKeyDown({key:'ش',code:'KeyA',nativeEvent:{isComposing:false},currentTarget:input,preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(value,'ab12a')
 delete globalThis.requestAnimationFrame
})


test('case is preserved for new codes, comparisons ignore case and digits are normalized',()=>{
 const settings={...defaultCodeComponentSettings,mode:'alphanumeric',suffixWidth:1}
 assert.equal(formatComponentCode(' ab۱۲ '),'ab12')
 assert.equal(validateComponentCode('ab۱۲',settings,['AB12']),'این کد قبلاً استفاده شده است.')
 assert.equal(suggestComponentCode(['ab9'],settings).value,'ac1')
 assert.equal(suggestComponentCode(['11z'],{...settings,format:'segments',segments:[{kind:'number',length:2},{kind:'letters',length:1}],incrementOrder:[1,0]}).value,'12a')
 assert.equal(suggestComponentCode(['11a'],{...settings,format:'segments',segments:[{kind:'number',length:2},{kind:'letters',length:1}],incrementOrder:[1,0]}).value,'11b')
 assert.equal(suggestComponentCode(['ab8','AB9'],settings).value,'AC1')
 let value='';const props=codeInputProps(value,settings,next=>{value=next})
 assert.equal(props.autoCapitalize,'none')
 props.onChange({currentTarget:{value:'mIx۴',selectionStart:4},nativeEvent:{isComposing:false}})
 assert.equal(value,'mIx4')
 const codeInput={value:'',selectionStart:0,selectionEnd:0}
 props.onKeyDown({key:'ش',code:'KeyA',shiftKey:false,nativeEvent:{isComposing:false},currentTarget:codeInput,preventDefault(){}})
 assert.equal(value,'a')
 codeInput.value='';codeInput.selectionStart=0;codeInput.selectionEnd=0
 props.onKeyDown({key:'ش',code:'KeyA',shiftKey:true,nativeEvent:{isComposing:false},currentTarget:codeInput,preventDefault(){}})
 assert.equal(value,'A')
})
