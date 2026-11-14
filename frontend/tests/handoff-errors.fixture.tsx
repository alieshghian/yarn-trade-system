import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {FormRelationshipControls} from '../src/components/base-form/FormRelationshipControls'
import {FormDocumentDialog} from '../src/components/base-form/FormDocumentDialog'
import type {FormSchemaDraft} from '../src/components/base-form/formSchema'
import '../src/styles.css'
function Test(){const [schema,setSchema]=useState<FormSchemaDraft>({schemaVersion:1,version:1,id:'test',title:{fa:'test',en:'test',zh:'test'},mode:'operational',sections:[{id:'editor',kind:'editor'}],fields:['a','b'].map(id=>({id,kind:'text',componentId:'text',label:{fa:id,en:id,zh:id},sectionId:'editor'})),uniqueConstraints:[{id:'broken',fieldIds:['a']}]});return <FormDocumentDialog language="fa" title="اصلاح خطای طراحی" onClose={()=>{}}><FormRelationshipControls schema={schema} language="fa" onChange={setSchema} focusIssue={{groupId:'broken'}}/></FormDocumentDialog>}
createRoot(document.getElementById('root')!).render(<Test/>);
