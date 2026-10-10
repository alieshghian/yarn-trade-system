import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BaseFormSection } from './BaseFormSection'

type Props = { formId: string, editor: ReactNode, grid: ReactNode, footer: ReactNode, initialEditorHeight?: number }

export function BaseFormShell({ formId, editor, grid, footer, initialEditorHeight = 330 }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const [editorHeight, setEditorHeight] = useState(initialEditorHeight)
  function resizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    const startY = event.clientY, startHeight = editorHeight
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      const height = frame.current?.clientHeight ?? 620
      setEditorHeight(Math.max(220, Math.min(height - 220, startHeight + next.clientY - startY)))
    }
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  return <div ref={frame} className="base-form-shell" data-form-id={formId} style={{ '--base-form-editor-height': `${editorHeight}px` } as CSSProperties}>
    <BaseFormSection id={`${formId}.editor`} className="base-form-editor">{editor}</BaseFormSection>
    <button type="button" className="base-form-splitter" aria-label="Resize laboratory editor and table" onPointerDown={resizeStart}><span /></button>
    <BaseFormSection id={`${formId}.grid`} className="base-form-grid">{grid}</BaseFormSection>
    <BaseFormSection id={`${formId}.footer`} className="base-form-footer">{footer}</BaseFormSection>
  </div>
}
