import React,{useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BaseFormGridBoundary} from '../src/components/base-form/BaseFormGridBoundary'
import {useFieldValidation} from '../src/components/base-form/useFieldValidation'
import '../src/styles.css'
const rows=[{id:'1',name:'Alpha',kind:'A'},{id:'2',name:'Beta',kind:'B'},{id:'3',name:'Gamma',kind:'A'}]
const columns=['name','kind'].map(id=>({id,label:id,width:180,type:'text' as const,value:(r:typeof rows[number])=>r[id as 'name'|'kind']}))
function Grid({remote=false}){return <BaseFormGridBoundary rows={remote?[]:rows} columns={columns} language="en" remoteQuery={remote?async q=>{(window as any).lastQuery=q;return {items:rows,total:rows.length,page:1,pageSize:100}}:undefined}/>}
function App(){const root=useRef<HTMLDivElement>(null);const [modal,setModal]=useState(false);useFieldValidation(root,{enabled:true,demo:true,rules:{name:{required:true}}});return <main data-form-scope="test"><div ref={root}><label>Name<input data-field="name"/></label><label>Other<input data-field="other"/></label></div><section id="local"><Grid/></section><button id="open-modal" onClick={()=>setModal(true)}>Modal</button>{modal&&<div role="dialog" aria-modal="true" id="modal" style={{position:'fixed',inset:50,zIndex:1000,background:'white'}}><Grid remote/><button onClick={()=>setModal(false)}>Close</button></div>}</main>}
createRoot(document.getElementById('root')!).render(<App/>);
