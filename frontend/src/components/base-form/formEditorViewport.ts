import type {DesignerDraft,DesignerCanvas} from './designer'
import type {FormSchemaDraft,FormSchemaSection} from './formSchema'
import {designerDraftForEditor} from './formDocumentDesigner.ts'
export type EditorViewport={heightMode:'content'|'fixed';overflowX:'auto'|'scroll'|'hidden';overflowY:'auto'|'scroll'|'hidden'}
export const defaultEditorViewport:EditorViewport={heightMode:'fixed',overflowX:'auto',overflowY:'auto'}
export function editorViewport(section:FormSchemaSection|undefined):EditorViewport{
 const value=section?.settings?.viewport as Partial<EditorViewport>|undefined
 return {heightMode:value?.heightMode==='content'?'content':'fixed',overflowX:['auto','scroll','hidden'].includes(value?.overflowX??'')?value!.overflowX!: 'auto',overflowY:['auto','scroll','hidden'].includes(value?.overflowY??'')?value!.overflowY!:'auto'}
}
export function fitCanvasToFields(canvas:DesignerCanvas,ids:readonly string[]):DesignerCanvas{
 const wanted=new Set(ids),entries=Object.entries(canvas.fields).filter(([id])=>wanted.has(id))
 const rectangles=entries.flatMap(([,field])=>Object.values(field))
 if(!rectangles.length)return {...canvas,width:320,height:80}
 const left=Math.min(...rectangles.map(rect=>rect.left)),top=Math.min(...rectangles.map(rect=>rect.top))
 const width=canvas.centeredFieldIds?.length?canvas.width:Math.max(320,...rectangles.map(rect=>rect.left+rect.width-left+24)),height=Math.max(80,...rectangles.map(rect=>rect.top+rect.height-top+24))
 return {...canvas,width,height,fields:{...canvas.fields,...Object.fromEntries(entries.map(([id,field])=>[id,Object.fromEntries(Object.entries(field).map(([part,rect])=>[part,{...rect,left:canvas.centeredFieldIds?.length?rect.left:rect.left-left+12,top:rect.top-top+12}])) as typeof field]))}}
}
export function fitAutomaticEditors(draft:DesignerDraft,schema:FormSchemaDraft):DesignerDraft{
 let next=draft
 const first=schema.sections.find(section=>section.kind==='editor')
 for(const section of schema.sections.filter(section=>section.kind==='editor'&&editorViewport(section).heightMode==='content')){
 const ids=schema.fields.filter(field=>field.sectionId===section.id).map(field=>field.id)
 const existing=draft.sectionCanvases?.[section.id]??(section.id===first?.id?draft.canvas:undefined)
 if(!existing)continue
 const projected=designerDraftForEditor(draft,schema,section.id).canvas
 const fitted=fitCanvasToFields(projected?{...projected,fields:{...existing.fields,...projected.fields}}:existing,ids)
 if(draft.sectionCanvases?.[section.id])next={...next,sectionCanvases:{...next.sectionCanvases,[section.id]:fitted}}
 else next={...next,canvas:fitted}
 }
 return next
}
