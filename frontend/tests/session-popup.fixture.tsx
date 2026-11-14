import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {FormValueList} from '../src/components/base-form/FormValueList'
export function mountPendingComponent(){const host=document.createElement('div');host.className='person-editor';host.dataset.formScope='session-regression';host.style.cssText='position:fixed;top:100px;left:100px;width:300px;z-index:2';document.body.append(host);const root=createRoot(host);function Pending(){const [items,setItems]=useState<string[]>([]);return <FormValueList field="pending-session-title" label="نوع ریس آزمایشی" primary="" listPrimary="" numbers={items} multiline fa disabled={false} onSelectValue={()=>{}} onChange={(_,next)=>setItems(next)}/>};root.render(<Pending/>);return ()=>{root.unmount();host.remove()}}
