import type {CSSProperties,PointerEvent,KeyboardEvent} from 'react'
import {resizeCanvasHandle,type DesignerResizeHandle} from './designer.ts'
import {fitToolbarPanel,renderedToolbarOffset,reserveToolbarSpace} from './toolbarLayoutContract.ts'
export const gridToolbarParts=['expand','title','counter','search','searchInput','searchReverse','searchOptions','searchOption:startsWith','searchOption:contains','searchOption:exact','columns','header'] as const
export type GridToolbarPart=typeof gridToolbarParts[number] | `header:${string}`
export type GridToolbarPartStyle={x?:number;y?:number;width?:number;height?:number;fontSize?:number;fontFamily?:string;bold?:boolean;italic?:boolean;underline?:'single'|'double';strikeThrough?:boolean;script?:'superscript'|'subscript';textAlign?:'start'|'center'|'end';textColor?:string;backgroundColor?:string;borderColor?:string;borderWidth?:number;borderRadius?:number;padding?:number;panelId?:string;placement?:'below'|'beside'}
export type GridToolbarSettings=Partial<Record<GridToolbarPart,GridToolbarPartStyle>>
export const toolbarPartLabels:Record<GridToolbarPart,string>={expand:'بزرگنمایی جدول',title:'عنوان جدول',counter:'شمارنده رکوردها',search:'جست‌وجو',searchInput:'کادر جست‌وجو',searchReverse:'وارونه‌سازی جست‌وجو',searchOptions:'گزینه‌های جست‌وجو','searchOption:startsWith':'گزینه از ابتدای واژه','searchOption:contains':'گزینه هر جای مقدار','searchOption:exact':'گزینه تطبیق کامل',columns:'انتخاب ستون‌ها',header:'کل پنل هدر'}
export const toolbarPartLabel=(part:GridToolbarPart)=>toolbarPartLabels[part]??'پنل هدر افزوده'
export const toolbarPanels=(settings:GridToolbarSettings):GridToolbarPart[]=>['header',...Object.keys(settings).filter((id):id is `header:${string}`=>/^header:[\w-]+$/.test(id))]
export function normalizeToolbarStyle(value:GridToolbarPartStyle={}):GridToolbarPartStyle{
 const result:GridToolbarPartStyle={}
 for(const key of ['x','y','width','height','fontSize','borderWidth','borderRadius','padding'] as const){const n=value[key];if(typeof n!=='number'||!Number.isFinite(n))continue;const min=key==='fontSize'?8:key==='width'?32:key==='height'?24:['padding','borderWidth','borderRadius'].includes(key)?0:-2400;const max=key==='fontSize'?48:key==='borderWidth'?12:key==='borderRadius'?200:key==='padding'?40:4000;result[key]=Math.max(min,Math.min(max,n))}
 for(const key of ['bold','italic','strikeThrough'] as const)if(typeof value[key]==='boolean')result[key]=value[key]
 for(const key of ['textColor','backgroundColor','borderColor'] as const)if(/^#[0-9a-f]{6}$/i.test(value[key]??''))result[key]=value[key]
 if(value.fontFamily&&/^[a-zA-Z][a-zA-Z -]{0,40}$/.test(value.fontFamily))result.fontFamily=value.fontFamily
 if(['start','center','end'].includes(value.textAlign??''))result.textAlign=value.textAlign
 if(['single','double'].includes(value.underline??''))result.underline=value.underline
 if(['superscript','subscript'].includes(value.script??''))result.script=value.script
 if(value.panelId==='header'||/^header:[\w-]+$/.test(value.panelId??''))result.panelId=value.panelId
 if(value.placement==='below'||value.placement==='beside')result.placement=value.placement
 return result
}
export function toolbarPartStyle(value?:GridToolbarPartStyle):CSSProperties{const s=normalizeToolbarStyle(value);return {position:'relative',boxSizing:'border-box',height:s.height,borderRadius:s.borderRadius,transform:s.x||s.y?`translate(${s.x??0}px, ${s.y??0}px)`:undefined,width:s.width,minHeight:s.height,fontSize:s.fontSize,fontFamily:s.fontFamily==='inherit'?undefined:({segoe:'Segoe UI',tahoma:'Tahoma',arial:'Arial',times:'Times New Roman',verdana:'Verdana'} as Record<string,string>)[s.fontFamily??'']??s.fontFamily,fontWeight:s.bold===undefined?undefined:s.bold?700:400,fontStyle:s.italic?'italic':undefined,textDecorationLine:[s.underline?'underline':'',s.strikeThrough?'line-through':''].filter(Boolean).join(' ')||undefined,textDecorationStyle:s.underline==='double'?'double':undefined,textAlign:s.textAlign,color:s.textColor,backgroundColor:s.backgroundColor,borderColor:s.borderColor,borderWidth:s.borderWidth,borderStyle:s.borderWidth===undefined?undefined:'solid',padding:s.padding, ...(s.fontSize?{'--grid-tool-font':s.fontSize+'px'}:{}),...(s.borderWidth!==undefined?{'--grid-tool-border-width':s.borderWidth+'px'}:{}),...(s.borderColor?{'--grid-tool-border-color':s.borderColor}:{}),...(s.textColor?{'--grid-tool-color':s.textColor,'--grid-tool-placeholder-opacity':1}:{}),...(s.fontFamily?{'--grid-tool-family':s.fontFamily}:{})} as CSSProperties}
export function moveToolbarPart(settings:GridToolbarSettings,part:GridToolbarPart,patch:GridToolbarPartStyle):GridToolbarSettings{return {...settings,[part]:normalizeToolbarStyle({...settings[part],...patch})}}

export function patchToolbarParts(settings:GridToolbarSettings,part:GridToolbarPart,patch:GridToolbarPartStyle,related?:GridToolbarSettings):GridToolbarSettings {
 let next=moveToolbarPart(settings,part,patch)
 for(const [id,value] of Object.entries(related??{}))next=moveToolbarPart(next,id as GridToolbarPart,value!)
 return next
}
export type ToolbarCommit=(part:GridToolbarPart,patch:GridToolbarPartStyle,related?:GridToolbarSettings)=>void
export function toolbarParent(part:GridToolbarPart,settings:GridToolbarSettings):GridToolbarPart|undefined {
 if(part.startsWith('header'))return undefined
 if(part.startsWith('searchOption:'))return 'searchOptions'
 if(['searchInput','searchOptions','searchReverse'].includes(part))return 'search'
 return (settings[part]?.panelId??'header') as GridToolbarPart
}
export function toolbarHeaderFor(part:GridToolbarPart,settings:GridToolbarSettings):GridToolbarPart {
 let current=part,parent=toolbarParent(current,settings)
 while(parent){current=parent;parent=toolbarParent(current,settings)}
 return current
}
/** Shared field Canvas resize constraints; parent/child selections move only once. */
export function toolbarGesturePatches(settings:GridToolbarSettings,parts:readonly GridToolbarPart[],boxes:Record<string,{width:number;height:number}>,dx:number,dy:number,handle?:DesignerResizeHandle):GridToolbarSettings {
 const selected=parts.filter(part=>{let parent=toolbarParent(part,settings);while(parent){if(parts.includes(parent))return false;parent=toolbarParent(parent,settings)}return true})
 const next:GridToolbarSettings={}
 for(const part of selected){const s=settings[part]??{},box=boxes[part];if(!box)continue
  if(!handle)next[part]={x:(s.x??0)+dx,y:(s.y??0)+dy}
  else {const rect={left:2400,top:2400,width:box.width,height:box.height}
   const resized=resizeCanvasHandle({width:12000,height:12000,fields:{part:{input:rect,label:{...rect,top:0,height:1}}}},['part'],handle,dx,dy).fields.part.input
   next[part]={x:(s.x??0)+resized.left-rect.left,y:(s.y??0)+resized.top-rect.top,width:resized.width,height:resized.height}
  }
 }
 return next
}
/** Correct for the physical anchor of CSS grid/flex items in either direction.
 * Canvas resize math owns the target rectangle; CSS must not move its other edge. */
function anchorToolbarResize(node:HTMLElement,patch:GridToolbarPartStyle,initial:GridToolbarPartStyle,box:{left:number;top:number;width:number;height:number},handle?:DesignerResizeHandle) {
 const desiredLeft=box.left+(patch.x??initial.x??0)-(initial.x??0),desiredTop=box.top+(patch.y??initial.y??0)-(initial.y??0)
 node.style.transform='translate('+(patch.x??initial.x??0)+'px, '+(patch.y??initial.y??0)+'px)'
 node.style.width=patch.width+'px';node.style.height=patch.height+'px';node.style.minHeight=patch.height+'px'
 if(node.classList.contains('grid-toolbar'))fitToolbarPanel(node,{},false)
 const actual=node.getBoundingClientRect()
 const left=desiredLeft+(handle?.includes('left')?(patch.width??actual.width)-actual.width:0)
 const top=desiredTop+(handle?.includes('top')?(patch.height??actual.height)-actual.height:0)
 patch.width=actual.width;patch.height=actual.height
 patch.x=(patch.x??initial.x??0)+left-actual.left
 patch.y=(patch.y??initial.y??0)+top-actual.top
 node.style.transform='translate('+patch.x+'px, '+patch.y+'px)'
}
/** Keep a visible outline around the actual union of independently selected parts. */
export function updateToolbarSelectionFrames(root:HTMLElement) {
 const nodes=Array.from(root.querySelectorAll<HTMLElement>('[data-toolbar-part]'))
 for(const frame of root.querySelectorAll<HTMLElement>('[data-toolbar-selection-parts]')){
  const panel=frame.parentElement
  if(!panel?.classList.contains('grid-toolbar'))continue
  let ids:string[]=[]
  try{const parsed=JSON.parse(frame.dataset.toolbarSelectionParts??'[]');if(Array.isArray(parsed))ids=parsed.filter((id):id is string=>typeof id==='string')}catch{}
  const selected=ids.map(id=>nodes.find(node=>node.dataset.toolbarPart===id)).filter((node):node is HTMLElement=>Boolean(node&&node.closest('.grid-toolbar')===panel))
  if(selected.length<2){frame.hidden=true;continue}
  const bounds=selected.map(node=>node.getBoundingClientRect()),host=panel.getBoundingClientRect()
  const left=Math.min(...bounds.map(rect=>rect.left)),top=Math.min(...bounds.map(rect=>rect.top)),right=Math.max(...bounds.map(rect=>rect.right)),bottom=Math.max(...bounds.map(rect=>rect.bottom))
  frame.hidden=false
  frame.style.left=(left-host.left)+'px';frame.style.top=(top-host.top)+'px';frame.style.width=(right-left)+'px';frame.style.height=(bottom-top)+'px'
 }
}
function clampToolbarSelectionDelta(parts:readonly GridToolbarPart[],nodes:ReadonlyMap<GridToolbarPart,HTMLElement>,boxes:Record<string,{left:number;top:number;width:number;height:number}>,dx:number,dy:number) {
 let minX=-Infinity,maxX=Infinity,minY=-Infinity,maxY=Infinity
 for(const id of parts){const node=nodes.get(id),box=boxes[id],panel=node?.closest<HTMLElement>('.grid-toolbar');if(!node||!box||!panel)continue;const rect=panel.getBoundingClientRect(),style=getComputedStyle(panel),left=rect.left+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth),right=rect.right-parseFloat(style.paddingRight)-parseFloat(style.borderRightWidth),top=rect.top+parseFloat(style.paddingTop)+parseFloat(style.borderTopWidth),bottom=rect.bottom-parseFloat(style.paddingBottom)-parseFloat(style.borderBottomWidth);minX=Math.max(minX,left-box.left);maxX=Math.min(maxX,right-box.left-box.width);minY=Math.max(minY,top-box.top);maxY=Math.min(maxY,bottom-box.top-box.height)}
 return {x:minX<=maxX?Math.max(minX,Math.min(maxX,dx)):0,y:minY<=maxY?Math.max(minY,Math.min(maxY,dy)):0}
}
export function beginToolbarMove(event:PointerEvent<HTMLElement>,part:GridToolbarPart,value:GridToolbarPartStyle|undefined,onCommit:ToolbarCommit|undefined,selection:readonly GridToolbarPart[]=[part],settings:GridToolbarSettings={},handle?:DesignerResizeHandle){
 if(!onCommit||event.button!==0)return
 event.preventDefault();event.stopPropagation()
 const root=event.currentTarget.closest<HTMLElement>('.base-grid-boundary'),element=Array.from(root?.querySelectorAll<HTMLElement>('[data-toolbar-part]')??[]).find(node=>node.dataset.toolbarPart===part);if(!element||!root)return
 event.currentTarget.focus({preventScroll:true})
 const parts=selection.includes(part)?selection:[part],originals=new Map<HTMLElement,string>(),boxes:Record<string,{left:number;top:number;width:number;height:number}>={},elements=new Map<GridToolbarPart,HTMLElement>()
 for(const id of parts){const node=Array.from(root.querySelectorAll<HTMLElement>('[data-toolbar-part]')).find(e=>e.dataset.toolbarPart===id);if(node){elements.set(id,node);originals.set(node,node.getAttribute('style')??'');const r=node.getBoundingClientRect();boxes[id]={left:r.left,top:r.top,width:r.width,height:r.height}}}
 const panels=new Set(Array.from(elements.values()).map(node=>node.closest<HTMLElement>('.grid-toolbar')!))
 for(const panel of panels){panel.dataset.toolbarGesture='true';for(const node of [panel.parentElement!,panel,...panel.querySelectorAll<HTMLElement>('[data-toolbar-part]')])if(!originals.has(node))originals.set(node,node.getAttribute('style')??'')}
 const offsets=new Map(Array.from(originals.keys()).filter(node=>node.dataset.toolbarPart).map(node=>[node,renderedToolbarOffset(node)]))
 const startX=event.clientX,startY=event.clientY,initial:GridToolbarSettings={...settings,[part]:value};let patches:GridToolbarSettings={},moved=false
 for(const [id,node]of elements)initial[id]={...initial[id],...renderedToolbarOffset(node)}
 // Capture on the actual hit target. Capturing on its wrapper would retarget
 // a short click away from nested buttons (fullscreen, columns, search).
 ;(event.target as Element).setPointerCapture(event.pointerId)
 const move=(e:globalThis.PointerEvent)=>{if(e.pointerId!==event.pointerId)return;const dx=e.clientX-startX,dy=e.clientY-startY;if(!moved&&Math.hypot(dx,dy)<4)return;moved=true;const delta=handle?{x:dx,y:dy}:clampToolbarSelectionDelta(parts,elements,boxes,dx,dy);patches=toolbarGesturePatches(initial,parts,boxes,delta.x,delta.y,handle)
  for(const [node,offset]of offsets)node.style.transform=offset.x||offset.y?'translate('+offset.x+'px, '+offset.y+'px)':''
  for(const [id,patch]of Object.entries(patches)){const node=elements.get(id as GridToolbarPart);if(!node)continue;const s={...initial[id as GridToolbarPart],...patch};node.style.transform='translate('+(s.x??0)+'px, '+(s.y??0)+'px)';if(handle)anchorToolbarResize(node,patch!,initial[id as GridToolbarPart]??{},boxes[id],handle);node.dataset.liveSize=Math.round(node.getBoundingClientRect().width)+' × '+Math.round(node.getBoundingClientRect().height)}
  for(const panel of panels)if(!parts.includes(panel.dataset.toolbarPart as GridToolbarPart))fitToolbarPanel(panel,initial,false)
  for(const [id,patch]of Object.entries(patches)){const node=elements.get(id as GridToolbarPart);if(node&&!node.classList.contains('grid-toolbar')){Object.assign(patch!,renderedToolbarOffset(node));if(handle){const box=node.getBoundingClientRect();patch!.width=box.width;patch!.height=box.height}}}
  for(const panel of panels)reserveToolbarSpace(panel)
  updateToolbarSelectionFrames(root)
 }
 const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);for(const [node,style]of originals){node.setAttribute('style',style);delete node.dataset.liveSize}for(const panel of panels)delete panel.dataset.toolbarGesture;updateToolbarSelectionFrames(root)}
 const finish=(e:globalThis.PointerEvent)=>{if(e.pointerId!==event.pointerId)return;move(e);if(moved){root.dataset.toolbarDragClickPart=part;window.setTimeout(()=>{if(root.dataset.toolbarDragClickPart===part)delete root.dataset.toolbarDragClickPart},750)}cleanup();const entries=Object.entries(patches);if(moved&&entries.length){root.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()}, {capture:true,once:true});onCommit(entries[0][0] as GridToolbarPart,entries[0][1]!,patches)}}
 const cancel=()=>cleanup()
 window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel)
}
export function toolbarMoveKey(event:KeyboardEvent<HTMLElement>,part:GridToolbarPart,value:GridToolbarPartStyle|undefined,onCommit:ToolbarCommit|undefined,selection:readonly GridToolbarPart[]=[part],settings:GridToolbarSettings={},handle?:DesignerResizeHandle){
 const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key]
 if(!direction||!onCommit)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1,parts=selection.includes(part)?selection:[part]
 const root=event.currentTarget.closest('.base-grid-boundary'),nodes=new Map<GridToolbarPart,HTMLElement>(),boxes:Record<string,{left:number;top:number;width:number;height:number}>={}
 for(const id of parts){const node=Array.from(root?.querySelectorAll<HTMLElement>('[data-toolbar-part]')??[]).find(node=>node.dataset.toolbarPart===id);if(node){nodes.set(id,node);const box=node.getBoundingClientRect();boxes[id]={left:box.left,top:box.top,width:box.width,height:box.height}}}
 const initial:GridToolbarSettings={...settings,[part]:value},originals=new Map<HTMLElement,string>(),panels=new Set(Array.from(nodes.values()).map(node=>node.closest<HTMLElement>('.grid-toolbar')!))
 for(const panel of panels)for(const node of [panel.parentElement!,panel,...panel.querySelectorAll<HTMLElement>('[data-toolbar-part]')])originals.set(node,node.getAttribute('style')??'')
 for(const [id,node]of nodes)initial[id]={...initial[id],...renderedToolbarOffset(node)}
 const delta=handle?{x:direction[0]*step,y:direction[1]*step}:clampToolbarSelectionDelta(parts,nodes,boxes,direction[0]*step,direction[1]*step),related=toolbarGesturePatches(initial,parts,boxes,delta.x,delta.y,handle)
 for(const [id,patch]of Object.entries(related)){const node=nodes.get(id as GridToolbarPart);if(!node)continue;node.style.transform='translate('+(patch!.x??0)+'px, '+(patch!.y??0)+'px)';if(handle)anchorToolbarResize(node,patch!,initial[id as GridToolbarPart]??{},boxes[id],handle)}
 for(const panel of panels)if(!parts.includes(panel.dataset.toolbarPart as GridToolbarPart))fitToolbarPanel(panel,initial,false)
 for(const [id,patch]of Object.entries(related)){const node=nodes.get(id as GridToolbarPart);if(node&&!node.classList.contains('grid-toolbar')){Object.assign(patch!,renderedToolbarOffset(node));if(handle){const box=node.getBoundingClientRect();patch!.width=box.width;patch!.height=box.height}}}
 for(const panel of panels)reserveToolbarSpace(panel)
 for(const [node,style]of originals)node.setAttribute('style',style)
 if(root instanceof HTMLElement)updateToolbarSelectionFrames(root)
 const first=Object.entries(related)[0];if(first)onCommit(first[0] as GridToolbarPart,first[1]!,related)
}
