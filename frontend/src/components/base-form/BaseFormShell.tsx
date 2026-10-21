import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { BaseFormSection } from './BaseFormSection'
import { defaultFormTheme } from './formTheme'

type Props = { formId: string, editor: ReactNode, grid: ReactNode, footer: ReactNode, sections?: ReactNode, initialEditorHeight?: number, autoEditorHeight?: boolean, stableEditorHeight?:boolean, initialHeaderRef?: RefObject<HTMLElement | null>, style?: CSSProperties }

export function BaseFormShell({ formId, editor, grid, footer, sections, initialEditorHeight = defaultFormTheme.editorHeight, initialHeaderRef, style, autoEditorHeight = false,stableEditorHeight=false }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(160)
  const [editorRatio, setEditorRatio] = useState(initialEditorHeight / Math.max(1, 561 - initialEditorHeight))
  const [editorPixels,setEditorPixels]=useState<number|null>(null)
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    let initialized = false
    const initialize = () => {
      if (initialized) return
      const editorHeight = element.querySelector<HTMLElement>('.base-form-editor')?.getBoundingClientRect().height ?? 0
      const gridHeight = element.querySelector<HTMLElement>('.base-form-grid')?.getBoundingClientRect().height ?? 0
      const available = editorHeight + gridHeight
      if (available <= 320) return
      const headerHeight = initialHeaderRef?.current?.getBoundingClientRect().height ?? 0
      const target = Math.max(160, Math.min(available - 160, initialEditorHeight - headerHeight))
      initialized = true
      setEditorRatio(target / (available - target))
      setEditorPixels(target)
      observer.disconnect()
    }
    const observer = new ResizeObserver(initialize)
    observer.observe(element)
    initialize()
    return () => observer.disconnect()
  }, [initialEditorHeight, initialHeaderRef])
  useLayoutEffect(() => {
    if (!autoEditorHeight || !frame.current) return
    const shell = frame.current
    const grid = shell.querySelector<HTMLElement>('.base-form-editor .laboratory-form-grid')
    if (!grid) return
    const measure = () => setContentHeight(Math.min(Math.max(120, grid.scrollHeight + 24), Math.max(160, shell.clientHeight - 220)))
    const observer = new ResizeObserver(measure); observer.observe(grid); observer.observe(shell); measure()
    return () => observer.disconnect()
  }, [autoEditorHeight, editor])
  function resizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    const editorHeight = frame.current?.querySelector<HTMLElement>('.base-form-editor')?.getBoundingClientRect().height ?? initialEditorHeight
    const gridHeight = frame.current?.querySelector<HTMLElement>('.base-form-grid')?.getBoundingClientRect().height ?? 231
    const splitHeight = editorHeight + gridHeight
    const startY = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      const nextEditorHeight = Math.max(220, Math.min(splitHeight - 220, editorHeight + next.clientY - startY))
      setEditorRatio(nextEditorHeight / Math.max(1, splitHeight - nextEditorHeight))
      setEditorPixels(nextEditorHeight)
    }
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  return <div ref={frame} className={'base-form-shell' + (sections ? ' has-form-composition' : '')} data-form-id={formId} style={{ '--base-form-editor-track': autoEditorHeight ? `${contentHeight}px` : stableEditorHeight&&editorPixels!==null?`${editorPixels}px`:`${editorRatio}fr`, ...style } as CSSProperties}>
    {sections ?? <>
    <BaseFormSection id={`${formId}.editor`} className="base-form-editor">{editor}</BaseFormSection>
    <button type="button" className="base-form-splitter" aria-label="Resize laboratory editor and table" onPointerDown={resizeStart}><span /></button>
    <BaseFormSection id={`${formId}.grid`} className="base-form-grid">{grid}</BaseFormSection>
    <BaseFormSection id={`${formId}.footer`} className="base-form-footer">{footer}</BaseFormSection>
    </>}
  </div>
}
