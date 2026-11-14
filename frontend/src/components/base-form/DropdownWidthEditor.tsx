import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import './laboratoryFormBuilder.css'

/** Design-only overlay: uses the list's measured anchor without editing its data. */
export function DropdownWidthEditor({ position, fa, label, items, onChange, onClose }: {
  position: CSSProperties; fa: boolean; label: string; items: string[];
  onChange: (width: number) => void; onClose: () => void
}) {
  const [width, setWidth] = useState(Number(position.width) || 240)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.focus({ preventScroll: true }) }, [])
  const startLeft = Number(position.left) || 12
  const right = startLeft + (Number(position.width) || 240)
  const left = fa ? right - width : startLeft
  const change = (value: number) => {
    const available = fa ? right - 12 : window.innerWidth - startLeft - 12
    const next = Math.max(80, Math.min(1200, available, value))
    setWidth(next)
    return next
  }
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation()
    const origin = event.clientX, initial = width, handle = event.currentTarget
    let next = width
    handle.setPointerCapture(event.pointerId)
    handle.onpointermove = move => { next = change(initial + (move.clientX - origin) * (fa ? -1 : 1)) }
    const finish = () => { handle.onpointermove = null; handle.onpointerup = null; handle.onpointercancel = null; onChange(next) }
    handle.onpointerup = finish; handle.onpointercancel = finish
  }
  return createPortal(<div role="dialog" aria-label={fa ? 'تنظیم عرض کشویی ' + label : 'Dropdown width: ' + label}
    dir={fa ? 'rtl' : 'ltr'} tabIndex={-1} ref={root}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }}
    className="component-dropdown-width-editor" style={{ ...position, position: 'fixed', left, width, right: 'auto', zIndex: 2147483001 }}>
    <header><strong>{label}</strong><button type="button" aria-label="بستن" onClick={onClose}>×</button></header>
    <label>{fa ? 'عرض کشویی (px)' : 'Dropdown width (px)'}<input type="number" min={80} max={1200} value={width} onChange={event => onChange(change(Number(event.target.value) || 80))} /></label>
    <div className="component-dropdown-width-samples">{(items.length ? items : [fa ? 'نمونه متن' : 'Sample text']).map((item, index) => <div key={index}>{item}</div>)}</div>
    <footer><button type="button" disabled>{fa ? 'افزودن +' : 'Add +'}</button><button type="button" disabled>{fa ? 'ثبت' : 'Save'}</button></footer>
    <div role="separator" aria-label={fa ? 'تغییر عرض کشویی' : 'Resize dropdown'} aria-orientation="vertical" onPointerDown={resize} style={{ position: 'absolute', top: 0, bottom: 0, width: 12, cursor: 'ew-resize', touchAction: 'none', [fa ? 'left' : 'right']: -6 }} />
  </div>, document.body)
}
