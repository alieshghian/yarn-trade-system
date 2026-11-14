/** A chrome-only view of the mounted form. Never substitute its data or grid. */
export const laboratoryLayoutPreviewContract = {
  version: 3,
  renderer: 'standard',
  data: 'preserve',
  remoteRequests: 'existing-virtual-source',
  preserveFrame: true,
  preserveGridSettings: true,
  preserveSplit: true,
  historyChanges: false,
  emptyRowGuides: false,
  preserveScroll: true,
  preserveMountedGrid: true,
  preserveDocumentHeader: true,
  preserveCompleteFooter: true,
  previewToggle: 'floating-glass-upper-right-both-modes',
  designCommands: false
} as const

/** Measure the real form surface, excluding its authoring sidebar and banners.
 * Temporary inline sizes prevent hiding chrome from stretching the report.
 * No schema, history, preferences, data source or grid engine is changed. */
export function captureLaboratoryPreview(frame: HTMLElement | null) {
  const shell = frame?.querySelector<HTMLElement>('.base-form-shell')
  const workspace = shell?.closest<HTMLElement>('.laboratory-workspace')
  if (!frame || !shell || !workspace) return
  const box = shell.getBoundingClientRect(), border = getComputedStyle(frame)
  // Document headers remain visible when authoring chrome is hidden. Include
  // them in the surface height, otherwise the unchanged shell clips its footer.
  const headers = [...frame.querySelectorAll<HTMLElement>(':scope > .form-document-header')]
    .filter(node => node.getClientRects().length > 0).map(node => node.getBoundingClientRect())
  const surfaceHeight = Math.max(box.bottom, ...headers.map(rect => rect.bottom)) - Math.min(box.top, ...headers.map(rect => rect.top))
  const outerX = ['borderLeftWidth','borderRightWidth','paddingLeft','paddingRight'].reduce((n,k)=>n+(parseFloat(border[k as keyof CSSStyleDeclaration] as string)||0),0)
  const outerY = ['borderTopWidth','borderBottomWidth','paddingTop','paddingBottom'].reduce((n,k)=>n+(parseFloat(border[k as keyof CSSStyleDeclaration] as string)||0),0)
  const originals = [frame,workspace,shell].map(node=>[node,node.getAttribute('style')] as const)
  const grids=[...frame.querySelectorAll<HTMLElement>('.laboratory-grid')]
  // Measure scroll hosts only, never every cell in a populated virtual grid.
  const scrollers = [frame.parentElement!,...frame.querySelectorAll<HTMLElement>('.base-grid-table-wrap,.base-form-editor,.laboratory-editor,.cascading-tree-scroll,.form-document-composition')].map(node=>({node,top:node.scrollTop,left:node.scrollLeft}))
  const restoreScroll=()=>{for(const {node,top,left} of scrollers){node.scrollTop=top;node.scrollLeft=left}}
  // Inert also disables native wheel/scrollbar hit testing. Block editing events
  // instead, leaving native scrolling on the very same virtual table available.
  const blockedEvents=['pointerdown','click','dblclick','contextmenu','keydown'] as const
  const blockEditing=(event:Event)=>{
    event.stopImmediatePropagation()
    if(event.type!=='pointerdown'||(event.target as Element).closest('button,input,select,textarea,a,[contenteditable="true"]'))event.preventDefault()
  }
  return {
    apply(){
      for(const type of blockedEvents)frame.addEventListener(type,blockEditing,true)
      Object.assign(frame.style,{width:`${box.width+outerX}px`,minWidth:`${box.width+outerX}px`,height:`${surfaceHeight+outerY}px`,minHeight:`${surfaceHeight+outerY}px`,left:'0px',top:'0px'})
      for(const node of [workspace,shell])Object.assign(node.style,{width:`${box.width}px`,height:`${box.height}px`,minHeight:`${box.height}px`,flex:'0 0 auto'})
      for(const grid of grids)grid.dataset.layoutPreview='true'
      restoreScroll()
    },
    restore(){for(const type of blockedEvents)frame.removeEventListener(type,blockEditing,true);for(const [node,style] of originals){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style)}for(const grid of grids)delete grid.dataset.layoutPreview;restoreScroll()}
  }
}
