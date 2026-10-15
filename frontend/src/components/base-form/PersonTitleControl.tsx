import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Language } from '../../i18n'
import { functionKeyFromEvent } from './functionKeys'

export type PersonTitleOption = {
  id: string
  nameFa: string
  nameEn: string
  nameZh?: string
  code?: string
  // The person editor still uses this domain value internally to choose its
  // field layout. It is inferred by the owning form and is never asked here.
  personType: 'Individual' | 'Company'
}

type Props = {
  value: string
  options: PersonTitleOption[]
  disabled: boolean
  required?: boolean
  invalid?: boolean
  canCreate: boolean
  manageOptions?: boolean
  defaultValue?: string
  fa: boolean
  language: Language
  onChange: (value: string, personType?: PersonTitleOption['personType']) => void
  onSetDefault?: (value: string) => void
  onCreate: (name: string) => Promise<PersonTitleOption>
  onUpdate?: (option: PersonTitleOption, name: string) => Promise<PersonTitleOption>
  onValidateRequired?: (control: HTMLSelectElement) => boolean
}

const normalizeTitle = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()

export function PersonTitleControl({ value, options, disabled, required = false, invalid = false, canCreate, manageOptions = false, defaultValue, fa, language, onChange, onSetDefault, onCreate, onUpdate, onValidateRequired }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [position, setPosition] = useState<React.CSSProperties>({})
  const wrapper = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const select = useRef<HTMLSelectElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const handledF3Keydown = useRef(false)
  const focusNameOnOpen = useRef(false)
  useEffect(() => { if (open && focusNameOnOpen.current) nameInput.current?.focus() }, [open])

  function toggleEntry(focusInput = true) {
    if (open) { setOpen(false); return }
    if ((!manageOptions && (!canCreate || disabled)) || (focusInput && (!canCreate || disabled))) return
    const rect = wrapper.current?.getBoundingClientRect()
    if (rect) {
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 24)
      setPosition({ top: rect.bottom + 4, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width })
    }
    setName('')
    setEditingId(null)
    setError('')
    focusNameOnOpen.current = focusInput
    setOpen(true)
  }

  async function saveTitle() {
    if (saving || disabled || (!canCreate && !editingId)) return
    const title = name.trim()
    if (!title) {
      setError(fa ? 'عنوان را وارد کنید.' : 'Enter a title.')
      nameInput.current?.focus()
      return
    }
    const normalized = normalizeTitle(title === 'آقا' ? 'آقای' : title)
    if (options.some(option => option.id !== editingId && normalizeTitle(option.code === 'MR' ? 'آقای' : option.nameFa) === normalized)) {
      setError(fa ? 'این عنوان قبلاً ثبت شده است.' : 'This title already exists.')
      nameInput.current?.focus()
      return
    }
    setSaving(true)
    setError('')
    try {
      const oldOption = editingId ? options.find(option => option.id === editingId) : undefined
      if (editingId && (!oldOption || !onUpdate)) throw new Error(fa ? 'ویرایش این عنوان ممکن نیست.' : 'This title cannot be edited.')
      const option = editingId ? await onUpdate!(oldOption!, title) : await onCreate(title)
      onChange(option.id, option.personType)
      setName('')
      if (editingId) setEditingId(null)
      else { setOpen(false); requestAnimationFrame(() => (manageOptions ? trigger.current : select.current)?.focus()) }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      nameInput.current?.focus()
    } finally {
      setSaving(false)
    }
  }

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
    if (!open || disabled) return
    const createWithF3 = (event: KeyboardEvent) => {
      if (functionKeyFromEvent(event) !== 'F3' || event.altKey || event.ctrlKey || event.metaKey) return
      const popup = popupRef.current
      if (!(event.target instanceof Element) || !popup?.contains(event.target)) return
      handledF3Keydown.current = true
      event.preventDefault(); event.stopImmediatePropagation()
      if (!event.repeat) void saveTitle()
    }
    window.addEventListener('keydown', createWithF3, true)
    return () => window.removeEventListener('keydown', createWithF3, true)
  }, [open, disabled, name, editingId, options, saving, onUpdate])

  function editOption(option: PersonTitleOption) {
    if (disabled || saving || !onUpdate) return
    setEditingId(option.id)
    setName(option.nameFa)
    setError('')
    requestAnimationFrame(() => nameInput.current?.focus())
  }

  function cancel() {
    setOpen(false)
    setName('')
    setEditingId(null)
    setError('')
    requestAnimationFrame(() => (manageOptions ? trigger.current : select.current)?.focus())
  }

  const displayTitle = (option: PersonTitleOption) => option.code === 'MR' ? fa ? 'آقای' : language === 'zh' ? '先生' : option.nameEn : language === 'fa' ? option.nameFa : language === 'zh' ? option.nameZh ?? option.nameEn : option.nameEn

  const popup = open ? <div ref={popupRef} className={`person-number-list person-title-entry${manageOptions ? ' laboratory-title-manager' : ''}`} data-form-scope style={position} dir="rtl" onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); cancel() }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && manageOptions) {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.laboratory-title-select:not(:disabled)'))
      if (items.length) {
        event.preventDefault()
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = current < 0 ? items.findIndex(item => item.closest('[role="option"]')?.getAttribute('aria-selected') === 'true') : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next < 0 ? 0 : next]?.focus()
      }
    }
    if (event.key === 'Enter' && event.target === nameInput.current) { event.preventDefault(); void saveTitle() }
  }}>
    {manageOptions && <div className="laboratory-title-options" role="listbox" aria-label={fa ? 'عنوان‌های تعریف‌شده' : 'Defined titles'}>
      {options.map(option => <div className="laboratory-title-option" key={option.id} role="option" aria-selected={value === option.id}>
        <button type="button" className="laboratory-title-default" aria-label={fa ? `تنظیم ${displayTitle(option)} به‌عنوان پیش‌فرض` : `Set ${displayTitle(option)} as default`} aria-pressed={defaultValue === option.id} title={fa ? (defaultValue === option.id ? 'عنوان پیش‌فرض فعلی' : 'تنظیم به‌عنوان پیش‌فرض همیشگی') : (defaultValue === option.id ? 'Current default title' : 'Set as persistent default')} onClick={() => onSetDefault?.(option.id)}>{defaultValue === option.id ? '✓' : ''}</button>
        <button type="button" className="laboratory-title-select" disabled={disabled} onClick={() => { onChange(option.id, option.personType); setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }}>{displayTitle(option)}</button>
        {defaultValue === option.id && <small>{fa ? 'پیش‌فرض' : 'Default'}</small>}
        {onUpdate && <button type="button" className="laboratory-title-edit" disabled={saving || disabled} aria-label={fa ? `ویرایش عنوان ${option.nameFa}` : `Edit title ${option.nameEn}`} title={fa ? 'ویرایش' : 'Edit'} onClick={() => editOption(option)}>✎</button>}
      </div>)}
    </div>}
    {(canCreate || editingId) && <div className="person-number-row new-number-row title-new-row">
      <input ref={nameInput} className="number-edit-input" data-title-name dir={language === 'fa' ? 'rtl' : 'ltr'} aria-label={fa ? (editingId ? 'اصلاح عنوان' : 'عنوان جدید') : (editingId ? 'Edit title' : 'New title')} maxLength={100} disabled={saving} value={name} onChange={event => { setName(event.target.value); setError('') }} placeholder={fa ? (editingId ? 'اصلاح عنوان' : 'عنوان جدید') : (editingId ? 'Edit title' : 'New title')} />
      <button type="button" className="number-row-add" aria-label={fa ? (editingId ? 'ثبت اصلاح عنوان' : 'افزودن عنوان') : (editingId ? 'Save title edit' : 'Add title')} disabled={saving} onClick={() => void saveTitle()}>{editingId ? '✓' : '+'}</button>
    </div>}
    {error && <small role="alert">{error}</small>}
    <div className="number-actions"><button type="button" className="number-confirm" data-save-action disabled={saving} onClick={() => void saveTitle()}>{fa ? (editingId ? 'ثبت اصلاح' : 'ثبت') : (editingId ? 'Save edit' : 'Save')} (F3)</button><button type="button" className="number-cancel" disabled={saving} onClick={cancel}>{fa ? 'انصراف' : 'Cancel'} (Esc)</button></div>
  </div> : null

  return <div className="person-title-wrap" ref={wrapper}>
    <button type="button" className="title-add-button" disabled={disabled || !canCreate} aria-label={fa ? 'افزودن عنوان' : 'Add title'} aria-expanded={open} onClick={() => toggleEntry()}>+</button>
    {manageOptions ? <>
      <button ref={trigger} type="button" className="title-value-button" aria-haspopup="listbox" aria-expanded={open} aria-label={fa ? 'انتخاب عنوان' : 'Choose title'} onClick={() => toggleEntry(false)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (!open) toggleEntry(false)
          requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.laboratory-title-manager [role="option"][aria-selected="true"] .laboratory-title-select')?.focus())
        } else if (event.key === 'Escape' && open) { event.preventDefault(); cancel() }
      }} onBlur={() => { if (select.current) onValidateRequired?.(select.current) }}>
        <span>{displayTitle(options.find(option => option.id === value) ?? options[0] ?? { id: '', nameFa: '', nameEn: '', personType: 'Individual' })}</span><span className="title-value-arrow" aria-hidden="true">⌄</span>
      </button>
      <select ref={select} className="title-validation-select" data-field="titleId" tabIndex={-1} aria-hidden="true" required={required} aria-required={required || undefined} aria-invalid={invalid || undefined} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.id} value={option.id}>{displayTitle(option)}</option>)}
      </select>
    </> : <select ref={select} data-field="titleId" dir={language === 'fa' ? 'rtl' : 'ltr'} required={required} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-label={fa ? 'عنوان' : 'Title'} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} onBlur={event => onValidateRequired?.(event.currentTarget)}>
      {options.map(option => <option key={option.id} value={option.id}>{displayTitle(option)}</option>)}
    </select>}
    {popup && (manageOptions ? createPortal(popup, document.body) : popup)}
  </div>
}
