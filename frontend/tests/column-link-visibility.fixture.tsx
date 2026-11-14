import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {FieldEditingControls} from '../src/components/base-form/FormFieldStructureControls'
import type {FormSchemaDraft} from '../src/components/base-form/formSchema'
import '../src/styles.css'
function Test(){const [schema,setSchema]=useState<FormSchemaDraft>({schemaVersion:1,version:1,id:'test',title:{fa:'test',en:'test',zh:'test'},mode:'operational',sections:[{id:'editor',kind:'editor'},{id:'report',kind:'grid',tableIds:['report']}],fields:[{id:'name',kind:'text',componentId:'definition.field',label:{fa:'نام نخ',en:'Name',zh:'Name'},sectionId:'editor'}],tables:[{id:'report',title:{fa:'نخ‌ها',en:'Yarns',zh:'Yarns'},columns:[{id:'name-column',label:{fa:'نام نخ',en:'Name',zh:'Name'},binding:{kind:'formField',fieldId:'name'}}]}]});return <FieldEditingControls schema={schema} field={schema.fields[0]} language="fa" onChange={setSchema} allowRemove={false} focusColumnLinks/>}
createRoot(document.getElementById('root')!).render(<Test/>);
