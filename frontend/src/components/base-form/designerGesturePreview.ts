import { captureDesignerPointer, type DesignerCanvas, type DesignerRect } from './designer'

/** Presentation only: no React state, document history, storage or requests. */
export function createDesignerGeometryPreview(root: HTMLElement, initial: DesignerCanvas, slots: Record<string, {width:number;height:number}> = {}) {
  const originals = new Map<HTMLElement, string | null>()
  const remember = (node: HTMLElement) => { if (!originals.has(node)) originals.set(node, node.getAttribute('style')) }
  const fields = new Map([...root.querySelectorAll<HTMLElement>('[data-field-id]')].map(node => [node.dataset.fieldId!, node]))
  // Capture every content box before any ancestor or flex-slot mutation.
  const contentBoxes = new Map<HTMLElement, { width: string; height: string }>()
  for (const id of Object.keys(initial.fields)) {
    const field = fields.get(id)
    if (field?.dataset.designerStorage !== 'flow') continue
    const content = field.querySelector<HTMLElement>(':scope > div > .designer-input-part')?.firstElementChild
    if (content instanceof HTMLElement) {
      const css = getComputedStyle(content)
      contentBoxes.set(content, { width: css.width, height: css.height })
    }
  }
  // A visual preview must not grow an auto-sized form and create a scrollbar
  // which changes the width of every unselected flex slot mid-gesture.
  const viewport = getComputedStyle(root)
  const rootWidth = viewport.width, rootHeight = viewport.height
  remember(root)
  root.style.width = rootWidth
  root.style.height = rootHeight
  for (const [content, box] of contentBoxes) {
    remember(content)
    content.style.width = box.width
    content.style.height = box.height
    content.style.flex = 'none'
  }
  for (const node of root.querySelectorAll<HTMLElement>('.base-form-editor, .laboratory-editor, .cascading-tree-scroll')) {
    const style = getComputedStyle(node)
    if (style.overflowX === 'auto' || style.overflowY === 'auto') {
      remember(node)
      if (style.overflowX === 'auto') node.style.overflowX = node.scrollWidth > node.clientWidth ? 'scroll' : 'hidden'
      if (style.overflowY === 'auto') node.style.overflowY = node.scrollHeight > node.clientHeight ? 'scroll' : 'hidden'
    }
  }
  const parts = new Map<string, Partial<Record<'input'|'label'|'select',HTMLElement>>>()
  for (const id of Object.keys(initial.fields)) {
    const field = fields.get(id)
    if (!field) continue
    const input=field.querySelector<HTMLElement>(':scope > div > .designer-input-part, :scope > label > .designer-input-part')
      ?? [...field.querySelectorAll<HTMLElement>('.designer-input-part')].find(node=>node.closest('[data-field-id]')===field)
    const label=[...field.querySelectorAll<HTMLElement>('.designer-label-part')].find(node=>node.closest('[data-field-id]')===field)
    const select=field.querySelector<HTMLElement>(':scope > .laboratory-field-select')
    parts.set(id,{input,label,select:select??undefined})
    for(const node of [input,label,select])if(node)remember(node)
    // Hold the measured input box before fixing its flex slot. A slot can be
    // narrower than an explicitly resized input; refitting that input's content
    // on pointer-down wraps unselected button text even on a simple click.
    if(input && field.dataset.designerStorage==='flow') {
      input.style.boxSizing='border-box'
      input.style.width=initial.fields[id].input.width+'px'
      input.style.height=initial.fields[id].input.height+'px'
    }
    if(slots[id]){remember(field);field.style.width=slots[id].width+'px';field.style.height=slots[id].height+'px';field.style.flex='0 0 auto'}
  }
  root.dataset.designerGesture='true'
  const paintPart=(node:HTMLElement|undefined,before:DesignerRect,after:DesignerRect)=>{
    if(!node)return
    node.style.translate=`${after.left-before.left}px ${after.top-before.top}px`
    if(after.width!==before.width)node.style.width=after.width+'px'
    if(after.height!==before.height)node.style.height=after.height+'px'
  }
  return {
    paint(next:DesignerCanvas){
      for(const [id,part] of parts){const before=initial.fields[id],after=next.fields[id];if(!after)continue
        if(part.input && fields.get(id)?.dataset.designerStorage==='flow' && (after.input.width!==before.input.width || after.input.height!==before.input.height)) {
          const content=part.input.firstElementChild as HTMLElement|null
          if(content){remember(content);content.style.width='100%';content.style.height='100%';content.style.minWidth='0';content.style.minHeight='0'}
        }
        paintPart(part.input,before.input,after.input);paintPart(part.label,before.label,after.label)
        if(part.select){const dx=Math.min(after.input.left,after.label.left)-Math.min(before.input.left,before.label.left),dy=Math.min(after.input.top,after.label.top)-Math.min(before.input.top,before.label.top);part.select.style.translate=`${dx}px ${dy}px`}
      }
    },
    restore(){for(const [node,style] of originals){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style)}delete root.dataset.designerGesture}
  }
}

/** Coalesce visual work to one animation frame, flush the release coordinate,
 * restore temporary styles, then commit the final geometry exactly once. */
export function captureDesignerVisualPointer(event: Parameters<typeof captureDesignerPointer>[0], paint:(dx:number,dy:number)=>void, restore:()=>void, commit:()=>void, finish:(event?:PointerEvent)=>void) {
  let pending=0, latest:[number,number]=[0,0]
  const flush=()=>{pending=0;paint(...latest)}
  let cleanup:()=>void=()=>{}
  const escape=(key:KeyboardEvent)=>{if(key.key==='Escape'){key.preventDefault();key.stopPropagation();cleanup()}}
  cleanup=captureDesignerPointer(event,(dx,dy)=>{latest=[dx,dy];if(!pending)pending=requestAnimationFrame(flush)},ended=>{
    window.removeEventListener('keydown',escape,true)
    cancelAnimationFrame(pending)
    if(ended?.type==='pointerup'){latest=[ended.clientX-event.clientX,ended.clientY-event.clientY];flush()}
    restore()
    if(ended?.type==='pointerup')commit()
    finish(ended)
  })
  window.addEventListener('keydown',escape,true)
  return cleanup
}

export function createDesignerStylePreview(root:HTMLElement,nodes:readonly HTMLElement[]){
  const originals=new Map(nodes.map(node=>[node,node.getAttribute('style')]))
  root.dataset.designerGesture='true'
  return {restore(){for(const [node,style] of originals){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style)}delete root.dataset.designerGesture}}
}

/** Keep background persistence out of an active visual gesture. Cleanup cancels
 * every retry, so a newer document revision replaces the pending snapshot. */
export function scheduleAfterDesignerGesture(root:()=>HTMLElement|null, callback:()=>void, delay:number){
  let cancelled=false
  const run=()=>{if(cancelled)return;if(root()?.dataset.designerGesture==='true'){timer=window.setTimeout(run,50);return}callback()}
  let timer=window.setTimeout(run,delay)
  return ()=>{cancelled=true;window.clearTimeout(timer)}
}
