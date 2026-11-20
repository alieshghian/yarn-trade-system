import { useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { BaseFormSection } from './BaseFormSection'
import { defaultFormTheme } from './formTheme'
import { OperationalGridCustomizationContext } from './operationalGridCustomization'

type Props = { layoutPreview?: boolean, formId: string, editor: ReactNode, grid: ReactNode, footer: ReactNode, sections?: ReactNode, initialEditorHeight?: number, autoEditorHeight?: boolean, stableEditorHeight?:boolean, initialHeaderRef?: RefObject<HTMLElement | null>, style?: CSSProperties }

function editorContentFloor(editor: HTMLElement | null): number {
  if (!editor) return 220
  const origin = editor.getBoundingClientRect()
  // Layout hosts stretch to fill the pane; only their actual fields establish
  // the minimum. Counting a stretching host would grow the pane on every resize.
  const parts = [...editor.querySelectorAll<HTMLElement>('.laboratory-form-grid .designer-input-part')].filter(part => part.getClientRects().length > 0 && !part.querySelector(':scope > .cascading-tree-panels, :scope > .cascading-tree-body'))
  const style = getComputedStyle(editor)
  const padding = parseFloat(style.paddingBottom) || 0
  // A horizontal scrollbar consumes vertical space inside the pane. Include it
  // in the floor so real horizontal overflow cannot hide the bottom of fields.
  const scrollbar = Math.max(0, editor.offsetHeight - editor.clientHeight - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0))
  return Math.ceil(Math.max(220, ...parts.map(part => part.getBoundingClientRect().bottom - origin.top + editor.scrollTop + padding + scrollbar + 8)))
}

export function BaseFormShell({ formId, editor, grid, footer, sections, layoutPreview = false, initialEditorHeight = defaultFormTheme.editorHeight, initialHeaderRef, style, autoEditorHeight = false,stableEditorHeight=false }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const layoutPreviewRef = useRef(layoutPreview)
  layoutPreviewRef.current = layoutPreview
  const operationalLayout = useContext(OperationalGridCustomizationContext)
  const defaultRatio = useRef(initialEditorHeight / Math.max(1, 561 - initialEditorHeight))
  const [contentHeight, setContentHeight] = useState(160)
  const [editorRatio, setEditorRatio] = useState(operationalLayout?.editorRatio ?? defaultRatio.current)
  const [editorPixels,setEditorPixels]=useState<number|null>(null)
  const [editorMinimum, setEditorMinimum] = useState(220)
  const [splitAdjusted, setSplitAdjusted] = useState(false)
  useLayoutEffect(() => { setSplitAdjusted(false) }, [formId])
  useLayoutEffect(() => {
    if (sections || layoutPreview) return
    const pane = frame.current?.querySelector<HTMLElement>('.base-form-editor')
    if (!pane) return
    let pending = 0
    const measure = () => {
      if (frame.current?.closest<HTMLElement>('.laboratory-form-frame')?.dataset.designerGesture === 'true' || frame.current?.closest('[data-operational-preview]')) return
      const minimum = editorContentFloor(pane)
      setEditorMinimum(current => current === minimum ? current : minimum)
      setEditorPixels(current => Math.max(minimum, current ?? pane.getBoundingClientRect().height))
    }
    const observer = new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(measure) })
    observer.observe(pane)
    for (const part of pane.querySelectorAll<HTMLElement>('.laboratory-form-grid, .designer-input-part')) observer.observe(part)
    measure()
    return () => { observer.disconnect(); cancelAnimationFrame(pending) }
  }, [editor, sections, formId, layoutPreview])
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    let initialized = false
    const initialize = () => {
      if (initialized || layoutPreviewRef.current || element.closest<HTMLElement>('.laboratory-form-frame')?.dataset.designerGesture === 'true' || frame.current?.closest('[data-operational-preview]')) return
      const editorHeight = element.querySelector<HTMLElement>('.base-form-editor')?.getBoundingClientRect().height ?? 0
      const gridHeight = element.querySelector<HTMLElement>('.base-form-grid')?.getBoundingClientRect().height ?? 0
      const available = editorHeight + gridHeight
      if (available <= 320) return
      const headerHeight = initialHeaderRef?.current?.getBoundingClientRect().height ?? 0
      const fallbackTarget = Math.max(160, Math.min(available - 160, initialEditorHeight - headerHeight))
      const target = Math.max(editorContentFloor(element.querySelector<HTMLElement>('.base-form-editor')), operationalLayout?.editorRatio === undefined ? fallbackTarget : Math.max(220, Math.min(available - 220, available * operationalLayout.editorRatio / (1 + operationalLayout.editorRatio))))
      const nextRatio = target / Math.max(1, available - target)
      initialized = true
      defaultRatio.current = fallbackTarget / (available - fallbackTarget)
      setEditorRatio(operationalLayout?.editorRatio ?? nextRatio)
      setEditorPixels(target)
      observer.disconnect()
    }
    const observer = new ResizeObserver(initialize)
    observer.observe(element)
    initialize()
    return () => observer.disconnect()
  // Preview must not restart initialization and reset a manually adjusted split.
  }, [initialEditorHeight, initialHeaderRef, operationalLayout?.editorRatio])
  const previousSettingsOpen = useRef(operationalLayout?.settingsOpen ?? false)
  useLayoutEffect(() => {
    const wasOpen = previousSettingsOpen.current
    previousSettingsOpen.current = operationalLayout?.settingsOpen ?? false
    if (operationalLayout?.editorRatio !== undefined) {
      setEditorRatio(operationalLayout.editorRatio)
      setEditorPixels(null)
    } else if (operationalLayout && wasOpen && !operationalLayout.settingsOpen) {
      setEditorRatio(defaultRatio.current)
      setEditorPixels(null)
    }
  }, [operationalLayout?.editorRatio, operationalLayout?.settingsOpen])
  useLayoutEffect(() => {
    if (!autoEditorHeight || !frame.current || layoutPreview) return
    const shell = frame.current
    const grid = shell.querySelector<HTMLElement>('.base-form-editor .laboratory-form-grid')
    if (!grid) return
    const measure = () => {
      if (shell.closest<HTMLElement>('.laboratory-form-frame')?.dataset.designerGesture === 'true' || frame.current?.closest('[data-operational-preview]')) return
      setContentHeight(Math.min(Math.max(120, grid.scrollHeight + 24), Math.max(160, shell.clientHeight - 220)))
    }
    const observer = new ResizeObserver(measure); observer.observe(grid); observer.observe(shell); measure()
    return () => observer.disconnect()
  }, [autoEditorHeight, editor, layoutPreview])
  function resizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    if (operationalLayout && !operationalLayout.canResizeSplit) return
    event.preventDefault()
    event.stopPropagation()
    setSplitAdjusted(true)
    const editorHeight = frame.current?.querySelector<HTMLElement>('.base-form-editor')?.getBoundingClientRect().height ?? initialEditorHeight
    const gridHeight = frame.current?.querySelector<HTMLElement>('.base-form-grid')?.getBoundingClientRect().height ?? 231
    const splitHeight = editorHeight + gridHeight
    const minimumEditorHeight = editorContentFloor(frame.current?.querySelector<HTMLElement>('.base-form-editor') ?? null)
    const startY = event.clientY
    const pointerId = event.pointerId
    let nextRatio = editorHeight / Math.max(1, gridHeight)
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const nextEditorHeight = Math.max(minimumEditorHeight, Math.min(Math.max(minimumEditorHeight, splitHeight - 220), editorHeight + next.clientY - startY))
      nextRatio = nextEditorHeight / Math.max(1, splitHeight - nextEditorHeight)
      setEditorRatio(nextRatio)
      setEditorPixels(nextEditorHeight)
    }
    const end = (next?: PointerEvent) => {
      if (next && next.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end)
      if (operationalLayout?.canResizeSplit) operationalLayout.updateEditorRatio(nextRatio)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  // Entry reuses the existing grid toggle: restore its view without remounting
  // the grid or resetting filters, selection, scroll state or saved geometry.
  const restoreGridForEntry = () => {
    for (const toggle of frame.current?.querySelectorAll<HTMLButtonElement>('.base-grid-boundary.is-expanded .grid-expand-toggle[aria-pressed="true"]') ?? []) toggle.click()
  }
  return <div onClickCapture={event => {
    const target=event.target instanceof Element ? event.target : null
    const action=target?.closest<HTMLElement>('[data-action-id]')?.dataset.actionId
    if (action && ['new-person','copy-last','copy-selected'].includes(action) && !target?.closest('button:disabled,[aria-disabled="true"]')) restoreGridForEntry()
  }} onFocusCapture={event => {
    // Keyboard entry commands can be handled by a parent's capture handler.
    // Their normal editor-focus transition must restore the grid as well.
    if ((event.target as Element).closest('.base-form-editor,.form-document-editor')) restoreGridForEntry()
  }} ref={frame} className={'base-form-shell' + (sections ? ' has-form-composition' : '')} data-form-id={formId} data-stable-editor={stableEditorHeight || undefined} style={{ '--base-form-editor-track': autoEditorHeight && !splitAdjusted ? `${Math.max(contentHeight, editorMinimum)}px` : editorPixels!==null?`min(${Math.max(editorPixels, editorMinimum)}px, var(--editor-track-limit, ${Math.max(editorPixels, editorMinimum)}px))`:`${editorRatio}fr`, ...style } as CSSProperties}>
    {sections ?? <>
    <BaseFormSection id={`${formId}.editor`} className="base-form-editor">{editor}</BaseFormSection>
    <button type="button" className="base-form-splitter" aria-label="Resize laboratory editor and table" onPointerDown={resizeStart}><span /></button>
    <BaseFormSection id={`${formId}.grid`} className="base-form-grid">{grid}</BaseFormSection>
    <BaseFormSection id={`${formId}.footer`} className="base-form-footer">{footer}</BaseFormSection>
    </>}
  </div>
}
