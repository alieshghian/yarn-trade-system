import { useEffect, useRef, useState } from 'react'
import { functionKeyFromEvent } from './functionKeys'
import { resolveFormValueEntries } from './formValueListEntries'

export function formatInternationalNumber(value: string) {
  const match = value.match(/^\+(98|86)(\d+)$/)
  if (!match) return value
  const [, code, rest] = match
  const groups = code === '98' ? [3, 3, 4] : code === '86' ? [3, 4, 4] : []
  if (!groups.length) return `+${code} ${rest.replace(/(.{4})(?=.)/g, '$1 ')}`
  const chunks: string[] = []
  let offset = 0
  for (const size of groups) { if (offset >= rest.length) break; chunks.push(rest.slice(offset, offset + size)); offset += size }
  if (offset < rest.length) chunks.push(rest.slice(offset))
  return `+${code} ${chunks.join(' ')}`
}

function formatPhoneDigits(digits: string, countryCode = '') {
  const cleanDigits = digits.replace(/\D/g, '')
  const formatted = countryCode.trim() ? formatInternationalNumber(`${countryCode.trim()}${cleanDigits}`) : cleanDigits
  if (formatted !== `${countryCode.trim()}${cleanDigits}`) return formatted.slice(countryCode.trim().length).trimStart()
  return cleanDigits.replace(/(\d{3})(?=\d)/g, '$1 ')
}

function formatEditableNumber(value: string) {
  const compact = value.replace(/[^\d+]/g, '')
  const prefix = compact.match(/^\+(?:98|86)/)?.[0]
  if (prefix) {
    const rest = formatPhoneDigits(compact.slice(prefix.length))
    return rest ? `${prefix} ${rest}` : prefix
  }
  return `${compact.startsWith('+') ? '+' : ''}${formatPhoneDigits(compact)}`
}

function updateFormattedPhoneInput(
  event: React.ChangeEvent<HTMLInputElement>,
  format: (value: string) => string,
  normalize: (value: string) => string,
  onChange: (value: string) => void
) {
  const input = event.currentTarget
  const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length
  const value = normalize(input.value)
  onChange(value)
  requestAnimationFrame(() => {
    const formatted = format(value)
    let position = 0
    let digits = 0
    while (position < formatted.length && digits < digitsBeforeCaret) {
      if (/\d/.test(formatted[position])) digits++
      position++
    }
    while (formatted[position] === ' ') position++
    input.setSelectionRange(position, position)
  })
}

export function NumberControl({ field, label, primary, numbers, disabled, fa, onChange, suggestedCode = '', multiline = false, className = '', listPrimary, required = false, minListWidth = 0, getItemKey, addLabel, listLabel, protectedMode = false, designerMode = false, keyboardPrimarySelection = false, onSelectValue, canRemove, canEdit }: { field: string, label: string, primary: string, numbers: string[], disabled: boolean, fa: boolean, suggestedCode?: string, multiline?: boolean, className?: string, listPrimary?: string, required?: boolean, minListWidth?: number, addLabel?: string, listLabel?: string, getItemKey?: (original: string) => string, protectedMode?: boolean, designerMode?: boolean, keyboardPrimarySelection?: boolean, onSelectValue?: (value: string) => void, canRemove?: (original: string) => boolean, canEdit?: (original: string) => boolean, onChange: (primary: string, numbers: string[], origins: ReadonlyMap<string, string>) => boolean | void }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const [text, setText] = useState('')
  const [entryRows, setEntryRows] = useState<{ id: number, code: string, text: string }[]>([])
  const [defaultEntryId, setDefaultEntryId] = useState<number | null>(null)
  const nextEntryId = useRef(0)
  const entryInputs = useRef(new Map<number, HTMLInputElement | HTMLTextAreaElement>())
  const entryCodes = useRef(new Map<number, HTMLInputElement>())
  const [editingNumber, setEditingNumber] = useState<string | null>(null)
  const [listPosition, setListPosition] = useState<React.CSSProperties>({})
  const [pendingNumbers, setPendingNumbers] = useState(numbers)
  const [pendingPrimary, setPendingPrimary] = useState(primary)
  const [activeNumber, setActiveNumber] = useState(primary)
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const skipEmptyFocus = useRef(false)
  const handledF3Keydown = useRef(false)
  // Keep each text entry's original value so consumers can retain their IDs
  // when the shared address editor renames or removes an item.
  const valueOrigins = useRef(new Map(numbers.map(value => [value, value])))
  const editable = !disabled && (!protectedMode || managing)
  useEffect(() => { if (designerMode) cancel(false) }, [designerMode])
  function openEmptyControl() {
    if (designerMode) return
    if (skipEmptyFocus.current) { skipEmptyFocus.current = false; return }
    if ((!protectedMode || keyboardPrimarySelection) && !disabled && !primary.trim() && !open) addButton.current?.click()
  }
  function clickDisplay(event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // A focus-opened list must not be dismissed by the click that focused it.
    if (keyboardPrimarySelection) event.stopPropagation()
    if (protectedMode && !open) wrapper.current?.querySelector<HTMLButtonElement>('.number-chevron')?.click()
  }
  function focusNextControl() {
    requestAnimationFrame(() => {
      const form = wrapper.current?.closest('.person-form-grid,form,[data-form-fields]')
      const current = wrapper.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('.person-number-control [data-field]')
      if (!form || !current) return
      // Registration from a number popover must advance to the next contact
      // component. DOM-order navigation can include designer controls and skip
      // the mobile component in the laboratory layout.
      const contactOrder = ['phone', 'mobile', 'address', 'notes']
      const currentField = current.dataset.field
      const contactIndex = contactOrder.indexOf(currentField ?? '')
      const nextField = contactIndex >= 0 ? contactOrder[contactIndex + 1] : undefined
      const nextContact = nextField ? form.querySelector<HTMLElement>(`[data-field="${nextField}"]`) : null
      if (nextContact && !nextContact.matches(':disabled') && nextContact.getClientRects().length > 0) {
        nextContact.focus({ preventScroll: true })
        return
      }
      const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).filter(control =>
        !control.disabled && (!('readOnly' in control && control.readOnly) || Boolean(control.closest('.person-number-control'))) && control.type !== 'hidden' && control.getClientRects().length > 0 && !control.closest('.person-number-list,details:not([open])'))
      const index = controls.indexOf(current)
      const next = controls[index + 1] ?? (keyboardPrimarySelection ? current : undefined)
      if (next === current) skipEmptyFocus.current = true
      next?.focus({ preventScroll: true })
    })
  }
  function showList(event: React.MouseEvent<HTMLButtonElement>, startAdding = false) {
    if (designerMode) return
    if (protectedMode && !numbers.length && !disabled) startAdding = true
    const wrapper = event.currentTarget.closest('.person-number-wrap')
    const field = wrapper?.querySelector('.person-number-control') ?? event.currentTarget.closest('.person-number-control')
    const rect = (field ?? event.currentTarget).getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const width = multiline ? (minListWidth > 0 ? Math.min(Math.max(rect.width, minListWidth), viewportWidth - 24) : rect.width) : Math.min(360, viewportWidth - 24)
    const left = Math.max(12, Math.min(multiline ? rect.right - width : rect.left, viewportWidth - width - 12))
    const below = window.innerHeight - rect.bottom - 20
    const above = rect.top - 20
    const placeAbove = keyboardPrimarySelection && below < 100 && above > below
    setListPosition({ top: placeAbove ? 'auto' : rect.bottom + 4, bottom: placeAbove ? window.innerHeight - rect.top + 4 : 'auto', left, right: 'auto', width, maxHeight: Math.max(keyboardPrimarySelection ? 64 : 40, Math.min(180, placeAbove ? above : below)) })
    if (!open) {
      setDefaultEntryId(null)
      setPendingNumbers(numbers)
      setPendingPrimary(listPrimary ?? primary)
      setActiveNumber(numbers.includes(listPrimary ?? primary) ? listPrimary ?? primary : numbers[0] ?? '')
      valueOrigins.current = new Map(numbers.map(value => [value, value]))
    }
    if (!open) setEntryRows([])
    if (startAdding && (!open || !entryRows.length)) {
      const id = ++nextEntryId.current
      setEntryRows([{ id, code: suggestedCode, text: '' }])
      if (keyboardPrimarySelection && !numbers.length) setDefaultEntryId(id)
    }
    setManaging(startAdding && !disabled); setAdding(startAdding); setEditingNumber(null); setText(''); setOpen(true)
  }
  useEffect(() => {
    if (open && adding && !disabled) {
      const entry = entryInputs.current.get(entryRows.at(-1)?.id ?? -1)
      entry?.focus({ preventScroll: true })
      if (keyboardPrimarySelection) {
        const body = entry?.closest('.number-list-items')
        if (body instanceof HTMLElement) body.scrollTop = body.scrollHeight
      }
    }
  }, [open, adding, disabled, entryRows.length, keyboardPrimarySelection])
  useEffect(() => {
    if (open && protectedMode && !managing && !adding) {
      const rows = Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? [])
      const activeIndex = pendingNumbers.indexOf(activeNumber)
      ;(rows[activeIndex] ?? rows.find(row => row.classList.contains('selected')) ?? rows[0])?.focus()
    }
  }, [open, protectedMode, managing, adding, activeNumber, pendingNumbers])
  function add(code: string) {
    if (disabled) return
    setManaging(true)
    const id = ++nextEntryId.current
    setEntryRows(current => [...current, { id, code, text: '' }])
    if (keyboardPrimarySelection && !pendingNumbers.length && !entryRows.length) setDefaultEntryId(id)
    setAdding(true)
  }
  function changeEntry(id: number, key: 'code' | 'text', value: string) { setEntryRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row)) }
  const removalAllowed = (value: string) => canRemove?.(valueOrigins.current.get(value) ?? value) !== false
  const editingAllowed = (value: string) => canEdit?.(valueOrigins.current.get(value) ?? value) !== false
  function remove(value: string) { if (disabled || (protectedMode && !managing) || !removalAllowed(value)) return; const next = pendingNumbers.filter(item => item !== value); setPendingNumbers(next); if (value === pendingPrimary) setPendingPrimary(next[0] ?? '') }
  function edit(value: string, edited: string) {
    if (!edited.trim() || pendingNumbers.some(item => item !== value && item === edited)) return
    if (multiline) {
      const original = valueOrigins.current.get(value) ?? value
      valueOrigins.current.delete(value)
      valueOrigins.current.set(edited, original)
    }
    setPendingNumbers(current => current.map(item => item === value ? edited : item))
    if (pendingPrimary === value) setPendingPrimary(edited)
  }
  function applyEdit() {
    if (editingNumber === null || !text.trim() || !editingAllowed(editingNumber)) return
    const edited = text.trim()
    if (pendingNumbers.some(item => item !== editingNumber && item === edited)) return
    if (!multiline && !/^\+?\d[\d\s-]*$/.test(edited)) {
      input.current?.setCustomValidity(fa ? 'شماره معتبر وارد کنید.' : 'Enter a valid number.')
      input.current?.reportValidity()
      return
    }
    if (multiline) { edit(editingNumber, edited); setEditingNumber(null); setText(''); return }
    valueOrigins.current.set(edited, valueOrigins.current.get(editingNumber) ?? editingNumber)
    setPendingNumbers(current => current.map(item => item === editingNumber ? edited : item))
    if (pendingPrimary === editingNumber) setPendingPrimary(edited)
    if (activeNumber === editingNumber) setActiveNumber(edited)
    setEditingNumber(null); setText('')
  }
  function confirm() {
    if (disabled) return
    if (protectedMode && !managing) { cancel(); return }
    let finalNumbers = pendingNumbers
    let finalPrimary = pendingPrimary
    const reject = (control: HTMLInputElement | HTMLTextAreaElement | null) => {
      control?.setCustomValidity(fa ? 'این مورد نامعتبر یا تکراری است.' : 'This entry is invalid or duplicated.')
      control?.reportValidity(); control?.focus()
    }
    if (editingNumber !== null) {
      if (!editingAllowed(editingNumber)) return
      const edited = text.trim()
      if (!edited || (!multiline && !/^\+?\d[\d\s-]*$/.test(edited)) || finalNumbers.some(item => item !== editingNumber && item === edited)) { reject(input.current); return }
      valueOrigins.current.set(edited, valueOrigins.current.get(editingNumber) ?? editingNumber)
      finalNumbers = finalNumbers.map(item => item === editingNumber ? edited : item)
      if (finalPrimary === editingNumber) finalPrimary = edited
    }
    const resolved = resolveFormValueEntries(finalNumbers, finalPrimary, entryRows, defaultEntryId, multiline)
    if (resolved.error) {
      reject((resolved.error.field === 'code' ? entryCodes : entryInputs).current.get(resolved.error.entryId) ?? null)
      return
    }
    finalNumbers = resolved.items
    finalPrimary = resolved.defaultValue
    if (required && !finalPrimary.trim()) {
      if (!entryRows.length) add(suggestedCode)
      else reject(entryInputs.current.get(entryRows[0].id) ?? null)
      return
    }
    if (numbers.some(value => canRemove?.(value) === false && !finalNumbers.some(next => (valueOrigins.current.get(next) ?? next) === value))) return
    if (onChange(finalPrimary, finalNumbers, valueOrigins.current) === false) return
    setEditingNumber(null); setOpen(false); setAdding(false); setManaging(false); setText(''); setEntryRows([])
    focusNextControl()
  }
  function cancel(advanceFocus = true) {
    setPendingNumbers(numbers)
    setPendingPrimary(listPrimary ?? primary)
    setEditingNumber(null)
    setManaging(false)
    setDefaultEntryId(null)
    setOpen(false)
    setAdding(false)
    setText('')
    setEntryRows([])
    // The focused entry field is removed when the popover closes. Move focus
    // deliberately so Escape never leaves the user without a visible focus.
    if (advanceFocus) focusNextControl()
  }
  useEffect(() => {
    if (!open || !keyboardPrimarySelection) return
    const dismissOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return
      const popup = wrapper.current?.querySelector('.person-number-list')
      if (popup?.contains(event.target) || addButton.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.number-chevron')?.closest('.person-number-wrap') === wrapper.current) return
      cancel(false)
    }
    document.addEventListener('click', dismissOutside)
    return () => document.removeEventListener('click', dismissOutside)
  })
  useEffect(() => {
    if (!protectedMode || designerMode) return
    const browseKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('.person-number-wrap') !== wrapper.current || event.ctrlKey || event.altKey || event.metaKey) return
      const display = event.target.closest('.person-number-control')
      const rowButton = event.target.closest('.person-number-row:not(.new-number-row)')?.querySelector<HTMLButtonElement>('.person-primary')
      const rowNavigation = Boolean(rowButton) && event.target.matches('.person-primary,textarea[readonly],.number-row-value')
      const plus = event.key === '+' || event.key === 'Add' || event.code === 'NumpadAdd'
      if (plus && !disabled && (display || event.target.matches('button,textarea[readonly],.number-row-value'))) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (open) add(suggestedCode)
        else addButton.current?.click()
        return
      }
      if (event.target.closest('.new-number-row')) return
      if (display && !open && keyboardPrimarySelection && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (!disabled && numbers.length) {
          const index = numbers.indexOf(primary)
          const nextIndex = index < 0 ? (event.key === 'ArrowDown' ? 0 : numbers.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + numbers.length) % numbers.length
          onSelectValue?.(numbers[nextIndex])
        }
        return
      }
      if (display && event.key === 'Enter' && event.target.matches('[data-field]')) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (primary.trim()) {
          if (open) cancel()
          else focusNextControl()
        } else if (!disabled) addButton.current?.click()
        return
      }
      if (display && ['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (!open) wrapper.current?.querySelector<HTMLButtonElement>('.number-chevron')?.click()
        else {
          const rows = Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? [])
          const index = pendingNumbers.indexOf(activeNumber)
          ;(rows[index] ?? rows.find(row => row.classList.contains('selected')) ?? rows[0])?.focus()
        }
      } else if (open && ['ArrowUp', 'ArrowDown'].includes(event.key) && rowNavigation) {
        event.preventDefault(); event.stopImmediatePropagation()
        const rows = Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? [])
        const index = rows.indexOf(rowButton as HTMLButtonElement)
        if (rows.length) {
          const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
          setActiveNumber(pendingNumbers[nextIndex] ?? '')
          rows[nextIndex]?.focus()
        }
      } else if (open && event.key === 'Enter' && rowNavigation && keyboardPrimarySelection) {
        event.preventDefault(); event.stopImmediatePropagation()
        const index = Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? []).indexOf(rowButton as HTMLButtonElement)
        const selectedNumber = pendingNumbers[index]
        if (selectedNumber !== undefined) {
          setActiveNumber(selectedNumber)
          if (managing) { setPendingPrimary(selectedNumber); setDefaultEntryId(null) }
          else {
            onSelectValue?.(selectedNumber)
            cancel()
          }
        }
      }
    }
    window.addEventListener('keydown', browseKey, true)
    return () => window.removeEventListener('keydown', browseKey, true)
  })
  useEffect(() => {
    const consumeHandledF3Keyup = (event: KeyboardEvent) => {
      if (!handledF3Keydown.current || functionKeyFromEvent(event) !== 'F3') return
      handledF3Keydown.current = false
      event.preventDefault(); event.stopImmediatePropagation()
    }
    window.addEventListener('keyup', consumeHandledF3Keyup, true)
    return () => window.removeEventListener('keyup', consumeHandledF3Keyup, true)
  }, [])
  useEffect(() => {
    if (!open) return
    const cancelKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const owner = event.target instanceof Element ? event.target.closest('.person-number-wrap') : null
      if (owner !== wrapper.current) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!event.repeat) cancel()
    }
    const confirmKey = (event: KeyboardEvent) => {
      if (functionKeyFromEvent(event) !== 'F3' || event.altKey || event.ctrlKey || event.metaKey || wrapper.current?.closest('[aria-hidden="true"]')) return
      const owner = event.target instanceof Element ? event.target.closest('.person-number-wrap') : null
      if (owner !== wrapper.current) return
      // Run before the shared document capture handler that owns the main F3 save.
      event.preventDefault(); event.stopImmediatePropagation()
      handledF3Keydown.current = true
      if (!event.repeat) confirm()
    }
    window.addEventListener('keydown', cancelKey, true)
    window.addEventListener('keydown', confirmKey, true)
    return () => { window.removeEventListener('keydown', cancelKey, true); window.removeEventListener('keydown', confirmKey, true) }
  })
  return <div className={`person-number-wrap${className ? ` ${className}` : ''}`} data-protected-list={protectedMode || undefined} data-standard-list={keyboardPrimarySelection || undefined} data-designer-mode={designerMode || undefined} inert={designerMode || undefined} ref={wrapper} onInput={event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity('') }}>
    <button ref={addButton} type="button" className="number-add-button" disabled={disabled} aria-label={addLabel ?? `${fa ? 'افزودن شماره' : 'Add number'} ${label}`} aria-expanded={open && adding} onClick={event => disabled ? undefined : showList(event, true)}>+</button>
    <div className={`person-number-control ${multiline ? 'address-control' : ''}`}>
      {multiline ? <textarea data-field={field} aria-label={label} disabled={disabled} value={primary} readOnly rows={1} onFocus={openEmptyControl} onClick={clickDisplay} /> : <input data-field={field} className="ltr-input number-display" aria-label={label} disabled={disabled} value={formatInternationalNumber(primary)} readOnly dir="ltr" onFocus={openEmptyControl} onClick={clickDisplay} />}
      <button type="button" className="number-chevron" aria-label={listLabel ?? (fa ? (multiline ? 'نمایش نشانی‌ها' : 'نمایش شماره‌ها') : 'Show list')} aria-expanded={open} onClick={event => open ? setOpen(false) : showList(event)} />
    </div>
    {open && <div className={`person-number-list ${multiline ? 'address-list' : 'phone-list'} ${adding ? 'adding' : ''}`} style={listPosition} dir={multiline ? 'rtl' : 'ltr'}>
      <div className="number-list-items">
      {pendingNumbers.map(number => <div className={`person-number-row${keyboardPrimarySelection && activeNumber === number ? ' is-active-row' : ''}`} key={getItemKey?.(valueOrigins.current.get(number) ?? number) ?? number} onFocusCapture={() => { if (keyboardPrimarySelection) setActiveNumber(number) }} onClick={() => { if (keyboardPrimarySelection && !managing && !disabled) { onSelectValue?.(number); cancel() } }}><button type="button" className={`person-primary ${defaultEntryId === null && pendingPrimary === number ? 'selected' : ''}`} aria-disabled={protectedMode && !editable || undefined} onClick={() => { if (!protectedMode || editable) { setPendingPrimary(number); setDefaultEntryId(null); setActiveNumber(number) } }} aria-label={fa ? 'انتخاب مورد اصلی' : 'Set primary'}>{defaultEntryId === null && pendingPrimary === number ? '✓' : ''}</button>{multiline ? <textarea ref={el => { if (editingNumber === number) input.current = el }} disabled={disabled} readOnly={protectedMode && editingNumber !== number} rows={2} value={protectedMode && editingNumber === number ? text : number} onChange={e => protectedMode ? setText(e.target.value) : edit(number, e.target.value)} /> : editingNumber === number ? <input ref={el => { input.current = el }} className="number-edit-input" dir="ltr" value={formatEditableNumber(text)} onChange={event => updateFormattedPhoneInput(event, formatEditableNumber, value => { const compact = value.replace(/[^\d+]/g, ''); return compact.startsWith('+') ? `+${compact.slice(1).replace(/\+/g, '')}` : compact.replace(/\+/g, '') }, setText)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyEdit() } }} /> : <span className="number-row-value" dir="ltr">{formatInternationalNumber(number)}</span>}{editable && <>{(!multiline || protectedMode) && editingAllowed(number) && <button type="button" className="number-row-edit" onClick={() => { setEditingNumber(number); setAdding(false); setActiveNumber(number); setText(number); requestAnimationFrame(() => input.current?.focus()) }} aria-label={fa ? 'ویرایش' : 'Edit'}>✎</button>}{removalAllowed(number) && <button type="button" disabled={!removalAllowed(number)} title={!removalAllowed(number) ? (fa ? 'این عنوان استفاده شده و قابل حذف نیست.' : 'This title is in use and cannot be removed.') : undefined} onClick={() => remove(number)} aria-label={fa ? 'حذف' : 'Remove'}>×</button>}</>}</div>)}
      {editable && entryRows.map(row => <div key={row.id} className="person-number-row new-number-row" dir={multiline ? 'rtl' : 'ltr'}>{keyboardPrimarySelection && <button type="button" className={`person-primary ${defaultEntryId === row.id ? 'selected' : ''}`} aria-pressed={defaultEntryId === row.id} aria-label={fa ? 'انتخاب پیش‌فرض' : 'Set default'} onClick={() => setDefaultEntryId(row.id)}>{defaultEntryId === row.id ? '✓' : ''}</button>}{!multiline && <input ref={el => { if (el) entryCodes.current.set(row.id, el); else entryCodes.current.delete(row.id) }} className="dial-code-input" dir="ltr" aria-label={fa ? 'کد کشور' : 'Country code'} value={row.code} onChange={e => changeEntry(row.id, 'code', e.target.value)} placeholder={suggestedCode || '+98'} />}{multiline ? <textarea ref={el => { if (el) entryInputs.current.set(row.id, el); else entryInputs.current.delete(row.id) }} value={row.text} onChange={e => changeEntry(row.id, 'text', e.target.value)} aria-label={label} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(row.code) } }} /> : <input ref={el => { if (el) entryInputs.current.set(row.id, el); else entryInputs.current.delete(row.id) }} className="number-edit-input" dir="ltr" type="tel" value={formatPhoneDigits(row.text, row.code)} onChange={event => updateFormattedPhoneInput(event, value => formatPhoneDigits(value, row.code), value => value.replace(/\D/g, ''), value => changeEntry(row.id, 'text', value))} aria-label={label} placeholder={fa ? 'شماره جدید' : 'New number'} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(row.code) } }} />}<button type="button" className="number-row-add" aria-label={fa ? 'افزودن مورد' : 'Add entry'} onClick={() => add(row.code)}>+</button></div>)}
      </div>
      {!disabled && <div className="number-actions" dir={keyboardPrimarySelection ? (fa ? 'rtl' : 'ltr') : undefined}><button type="button" className="number-confirm" onClick={confirm}>{fa ? 'ثبت' : 'Save'} (F3)</button><button type="button" className="number-cancel" onClick={() => cancel()}>{fa ? 'انصراف' : 'Cancel'} (Esc)</button>{protectedMode && <button type="button" className="number-row-add" aria-label={fa ? 'افزودن مورد' : 'Add entry'} onClick={() => add(suggestedCode)}>+</button>}</div>}
    </div>}
  </div>
}
