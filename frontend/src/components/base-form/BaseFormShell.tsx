import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { BaseFormSection } from './BaseFormSection'
import { defaultFormTheme } from './formTheme'

type Props = { formId: string, editor: ReactNode, grid: ReactNode, footer: ReactNode, initialEditorHeight?: number, initialHeaderRef?: RefObject<HTMLElement | null>, style?: CSSProperties }

export function BaseFormShell({ formId, editor, grid, footer, initialEditorHeight = defaultFormTheme.editorHeight, initialHeaderRef, style }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const [editorRatio, setEditorRatio] = useState(initialEditorHeight / Math.max(1, 561 - initialEditorHeight))
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
      observer.disconnect()
    }
    const observer = new ResizeObserver(initialize)
    observer.observe(element)
    initialize()
    return () => observer.disconnect()
  }, [initialEditorHeight, initialHeaderRef])
  function resizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    const editorHeight = frame.current?.querySelector<HTMLElement>('.base-form-editor')?.getBoundingClientRect().height ?? initialEditorHeight
    const gridHeight = frame.current?.querySelector<HTMLElement>('.base-form-grid')?.getBoundingClientRect().height ?? 231
    const splitHeight = editorHeight + gridHeight
    const startY = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      const nextEditorHeight = Math.max(220, Math.min(splitHeight - 220, editorHeight + next.clientY - startY))
      setEditorRatio(nextEditorHeight / Math.max(1, splitHeight - nextEditorHeight))
    }
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  return <div ref={frame} className="base-form-shell" data-form-id={formId} style={{ '--base-form-editor-track': `${editorRatio}fr`, ...style } as CSSProperties}>
    <BaseFormSection id={`${formId}.editor`} className="base-form-editor">{editor}</BaseFormSection>
    <button type="button" className="base-form-splitter" aria-label="Resize laboratory editor and table" onPointerDown={resizeStart}><span /></button>
    <BaseFormSection id={`${formId}.grid`} className="base-form-grid">{grid}</BaseFormSection>
    <BaseFormSection id={`${formId}.footer`} className="base-form-footer">{footer}</BaseFormSection>
  </div>
}
