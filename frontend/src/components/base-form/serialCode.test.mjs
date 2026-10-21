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
 assert.match(validateComponentCode('AB-1',settings)??'',/حروف و عدد/)
 assert.match(validateComponentCode('ab1',settings,['AB1'])??'',/استفاده/)
 assert.equal(validateComponentCode('AB1',settings,['AB2']),undefined)
 assert.equal(validateComponentCode('۱۲۳',{...settings,mode:'number'},[]),undefined)
 assert.equal(validateComponentCode('123',{...settings,mode:'letters'},[]),'فقط حروف مجاز است.')
})
