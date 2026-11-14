import {createRoot} from 'react-dom/client'
import {FormSchemaPresentation} from '../src/components/base-form/FormSchemaPresentation'
import {productGroupSchema as schema, productGroupDesigner as designer} from '../src/forms/productGroupDesign'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'
if (!import.meta.env.DEV) throw Error('Isolated tests only')
const table=schema.tables![0]
const rows=Array.from({length:213},(_,i)=>({id:String(i),name:i===0?'Zulu':i===212?'Alpha':'Group '+i}))
const columns=table.columns.map((c,i)=>({id:c.id,label:c.label.fa,type:'text' as const,width:c.width??180,value:(r:typeof rows[number])=>i===1?r.name:r.id}))
const explicitDesign=new URLSearchParams(location.search).has('design')
createRoot(document.getElementById('root')!).render(<div className="form-laboratory-page"><FormSchemaPresentation schema={schema} designerDraft={designer} language="fa" editor={<div/>} footer={<div/>}
  presentationMode={explicitDesign?'design':undefined} columnReview={{[table.id]:[]}}
  onTableStructure={()=>document.body.dataset.structureOpened='true'}
  grid={{rows,columns,designerMode:true,onDesignerContextMenu:()=>{document.body.dataset.designerMenu='true'}}}/></div>)
