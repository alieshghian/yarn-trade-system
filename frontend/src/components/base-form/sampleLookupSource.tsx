import {useState} from 'react'
import {choiceMatches} from './componentListSettings'
import type {LookupItem,LookupCreationProps,SystemLookupSource} from './systemLookupSources'

/** One disposable catalog per laboratory document; never calls operational APIs or writes design history. */
export function createSampleLookupSource(id:string):SystemLookupSource {
 const records:LookupItem[]=[{id:id+':sample-1',code:'001',name:'نمونه یک — Sample one'},{id:id+':sample-2',code:'002',name:'نمونه دو — Sample two'}]
 function Create({language,onSaved,onCancel}:LookupCreationProps){
  const [code,setCode]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),fa=language==='fa'
  return <form className="lookup-sample-create" onSubmit={e=>{e.preventDefault();if(!code.trim()||!name.trim()||records.some(item=>item.code===code.trim())){setError(fa?'کد و نام را وارد کنید؛ کد باید یکتا باشد.':'Enter code and name; code must be unique.');return}const item={id:crypto.randomUUID(),code:code.trim(),name:name.trim()};records.push(item);onSaved(item)}}><p>{fa?'اطلاعات موقت آزمایشگاه؛ در تعاریف عملیاتی ثبت نمی‌شود.':'Temporary laboratory data; not saved to operational definitions.'}</p><label>{fa?'کد':'Code'}<input aria-label={fa?'کد آزمایشی تعریف':'Sample definition code'} value={code} onChange={e=>setCode(e.target.value)}/></label><label>{fa?'نام':'Name'}<input aria-label={fa?'نام آزمایشی تعریف':'Sample definition name'} value={name} onChange={e=>setName(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button type="submit">{fa?'ثبت':'Save'}</button><button type="button" onClick={onCancel}>{fa?'انصراف':'Cancel'}</button></form>
 }
 return {id,title:{fa:'تعریف آزمایشی',en:'Sample definition',zh:'示例定义'},viewPermission:'',createPermission:'',Create,search:async(query,page,fields)=>{const matches=records.filter(item=>choiceMatches(query,fields.map(key=>item[key as 'code'|'name']??'')));return {items:matches.slice((page-1)*40,page*40),total:matches.length}},byId:async key=>{const item=records.find(item=>item.id===key);if(!item)throw Error('رکورد آزمایشی موجود نیست.');return item}}
}
