import {useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SystemLookup} from '../src/components/base-form/SystemLookup'
import {FormValueList} from '../src/components/base-form/FormValueList'
import {createSampleLookupSource} from '../src/components/base-form/sampleLookupSource'
import {choiceMatches} from '../src/components/base-form/componentListSettings'
import type {SystemLookupSource} from '../src/components/base-form/systemLookupSources'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if(!import.meta.env.DEV)throw Error('Development fixture only')
window.fetch=async()=>{throw Error('Unexpected operational request in component fixture')}
function Fixture(){
 const [value,setValue]=useState(''),[role,setRole]=useState<'admin'|'user'>('user'),[returnMode,setReturnMode]=useState('saveAndSelect'),[addPlacement,setPlacement]=useState<'popup'|'inside'>('popup'),[local,setLocal]=useState('كيان ۱۲۳'),[options,setOptions]=useState(['كيان ۱۲۳','Beta'])
 const source=useMemo(()=>{const sample=createSampleLookupSource('fixture');const records=Array.from({length:85},(_,i)=>({id:'row'+i,code:'C'+String(i).padStart(3,'0'),name:i===1?'كيان ۱۲۳':'Item '+i}));const search=sample.search;return {...sample,search:async(query,page,fields,signal)=>{await new Promise(resolve=>setTimeout(resolve,query==='slow'?650:20));if(query==='fail')throw Error('Test search failed');const samplePage=await search(query,1,fields,signal),all=[...records,...samplePage.items].filter(item=>choiceMatches(query,fields.map(key=>item[key as 'code'|'name']??'')));return {items:all.slice((page-1)*40,page*40),total:all.length}},byId:async(id,signal)=>records.find(item=>item.id===id)??sample.byId(id,signal)} satisfies SystemLookupSource},[])
 return <main className="person-editor panel" style={{padding:24,maxWidth:700}}><div data-form-fields><label>Role<select aria-label="Role" value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="user">User</option><option value="admin">Admin</option></select></label><label>Return<select aria-label="Return" value={returnMode} onChange={e=>setReturnMode(e.target.value)}><option value="saveAndSelect">Auto</option><option value="selectAfterSave">Explicit</option></select></label><select aria-label="Placement" value={addPlacement} onChange={e=>setPlacement(e.target.value as typeof addPlacement)}><option value="popup">Popup</option><option value="inside">Inside</option></select><SystemLookup field="linked" label="برند" value={value} onChange={setValue} language="fa" sourceOverride={source} actorRole={role} settings={{sourceId:'brands',returnMode}} listSettings={{allowEmpty:true,addPlacement,permissions:{add:'admin'}}}/><output data-selected-id>{value}</output><FormValueList field="local" label="فهرست محلی" primary={local} numbers={options} listPrimary="Beta" fa disabled={false} multiline listSettings={{searchEnabled:true,allowEmpty:true,addPlacement:'popup',permissions:{add:'none',edit:'none',remove:'none',setDefault:'none'}}} onSelectValue={setLocal} onChange={(value,values)=>{setLocal(value);setOptions(values)}}/><output data-local-value>{local}</output><input aria-label="Next field"/></div></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
