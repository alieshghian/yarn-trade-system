import type { GridToolbarPart, GridToolbarSettings } from './gridToolbarLayout.ts'

/** Shared renderer contract, inherited by every Laboratory document without copying an engine. */
export const laboratoryToolbarContract = {
  version: 2, containContents: true, preserveTypographyOnResize: true,
  liveResize: true, searchOptionsBelowInput: true, documentLocalGeometry: true,
  defaultControls: 'left', defaultTitleAndCounter: 'center', defaultSearch: 'right',
  flexibleSpace: 'center', searchPartsSelectableIndependently: true,
  multiSelectModifier: 'ctrl-or-command', multiSelectionFrame: 'selected-parts-union',
  minimumContentHeight: true, preserveTableFlow: true
} as const

type Box = { left: number; top: number; width: number; height: number }
export function toolbarContainmentDelta(child: Box, parent: Box) {
  const left = Math.max(parent.left, Math.min(child.left, parent.left + Math.max(0, parent.width - child.width)))
  const top = Math.max(parent.top, Math.min(child.top, parent.top + Math.max(0, parent.height - child.height)))
  return { x: left - child.left, y: top - child.top }
}

const transform = (x = 0, y = 0) => x || y ? `translate(${x}px, ${y}px)` : ''
const toolbarContainmentParent=(node:HTMLElement,panel:HTMLElement)=>{
  const part=node.dataset.toolbarPart??''
  return ['searchInput','searchReverse','searchOptions'].includes(part)||part.startsWith('searchOption:')?panel:node.parentElement?.closest<HTMLElement>('[data-toolbar-part]')??panel
}
const contentBox = (node: HTMLElement): Box => {
  const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
  const left = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)
  const right = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth)
  const top = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth)
  const bottom = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
  return { left: rect.left + left, top: rect.top + top, width: Math.max(0, rect.width - left - right), height: Math.max(0, rect.height - top - bottom) }
}

/** Height is bounded by real content, never by the previous saved min-height.
 * Recover old offsets in the view only; opening a form never rewrites its document. */
export function fitToolbarPanel(panel: HTMLElement, settings: GridToolbarSettings, restoreOffsets = true) {
  const nodes = Array.from(panel.querySelectorAll<HTMLElement>('[data-toolbar-part]'))
    .filter(node => node.closest('.grid-toolbar') === panel)
  const panelHeight = panel.style.height
  panel.style.height = 'auto'
  panel.style.minHeight = '0px'
  for (const node of nodes) {
    node.style.minHeight = '0px'
    const parent = toolbarContainmentParent(node,panel)
    node.style.maxWidth = `${contentBox(parent).width}px`
  }
  if (restoreOffsets) for (const node of nodes) {
    const style = settings[node.dataset.toolbarPart as GridToolbarPart]
    node.style.transform = transform(style?.x, style?.y)
  }
  // Work inside out, so a smaller header cannot hide a wrapped search option or title.
  for (const node of [...nodes].reverse().concat(panel)) {
    const height = node.style.height
    node.style.height = 'auto'
    node.style.minHeight = '0px'
    const minimum = Math.ceil(node.getBoundingClientRect().height)
    node.style.height = height
    node.style.minHeight = `${minimum}px`
  }
  panel.style.height = panelHeight
  for (const node of nodes) {
    const parent = toolbarContainmentParent(node,panel)
    const bounds = contentBox(parent)
    node.style.maxWidth = `${bounds.width}px`
    const rect = node.getBoundingClientRect(), delta = toolbarContainmentDelta(rect, bounds)
    if (Math.abs(delta.x) < .01 && Math.abs(delta.y) < .01) continue
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform)
    node.style.transform = transform(matrix.m41 + delta.x, matrix.m42 + delta.y)
  }
  panel.dataset.toolbarContract = String(laboratoryToolbarContract.version)
  reserveToolbarSpace(panel)
}

/** Transforms are visual coordinates; reserve their real extent before the table.
 * Grid rows must align at the start so this floor cannot stretch neighbouring panels. */
export function reserveToolbarSpace(panel: HTMLElement) {
  const host = panel.parentElement
  if (!host?.classList.contains('grid-toolbar-panels')) return
  host.style.minHeight = '0px'
  const top = host.getBoundingClientRect().top
  const bottom = Math.max(top, ...Array.from(host.children)
    .filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('grid-toolbar'))
    .map(node => node.getBoundingClientRect().bottom))
  host.style.minHeight = `${Math.ceil(bottom - top)}px`
}

/** Store the rendered, constrained offset after a child gesture, preventing release-time jumps. */
export function renderedToolbarOffset(node: HTMLElement) {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform)
  return { x: matrix.m41, y: matrix.m42 }
}
