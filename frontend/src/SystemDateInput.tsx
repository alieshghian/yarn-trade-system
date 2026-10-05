import { useEffect, useMemo, useRef, useState } from 'react'
import { numericDatePart } from './persianDate'
import {
  calendarPartsToIso, calendarWeekday, calendarYearRange, daysInCalendarMonth, fullDateLabel,
  isoToCalendarParts, localTodayIso, monthName, type CalendarKind, type DateParts
} from './dateCalendar'

type Props = {
  value: string
  onChange: (isoDate: string) => void
  onError?: (message: string) => void
  calendar?: CalendarKind
  disabled?: boolean
  required?: boolean
  language?: 'fa' | 'en'
  ariaLabel?: string
  suggestToday?: boolean
}

const emptyParts: DateParts = { year: 0, month: 0, day: 0 }

export default function SystemDateInput({
  value, onChange, onError, calendar = 'persian', disabled, required, language = 'fa',
  ariaLabel, suggestToday = false
}: Props) {
  const fa = language === 'fa'
  const initial = isoToCalendarParts(value, calendar)
  const [parts, setParts] = useState<DateParts>(initial ?? emptyParts)
  const [view, setView] = useState<DateParts>(initial ?? isoToCalendarParts(localTodayIso(), calendar) ?? emptyParts)
  const [open, setOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  const editedRef = useRef(false)

  useEffect(() => {
    const next = isoToCalendarParts(value, calendar)
    setParts(next ?? emptyParts)
    if (next) setView(next)
    setLocalError('')
  }, [value, calendar])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open])

  const text = {
    required: fa ? 'تاریخ الزامی است.' : 'Date is required.',
    incomplete: fa ? 'روز، ماه و سال را کامل وارد کنید.' : 'Enter day, month and year.',
    invalid: fa ? `تاریخ ${calendar === 'persian' ? 'شمسی' : 'میلادی'} واردشده معتبر نیست.` : `Invalid ${calendar} date.`,
    day: fa ? 'روز باید بین ۱ تا ۳۱ باشد.' : 'Day must be 1-31.',
    month: fa ? 'ماه باید بین ۱ تا ۱۲ باشد.' : 'Month must be 1-12.',
    year: fa ? `سال ${calendar === 'persian' ? 'شمسی' : 'میلادی'} معتبر وارد کنید.` : `Enter a valid ${calendar} year.`,
    today: fa ? 'امروز' : 'Today',
    previousYear: fa ? 'سال قبل' : 'Previous year',
    nextYear: fa ? 'سال بعد' : 'Next year',
    previousMonth: fa ? 'ماه قبل' : 'Previous month',
    nextMonth: fa ? 'ماه بعد' : 'Next month',
    openCalendar: fa ? 'بازکردن تقویم' : 'Open calendar'
  }

  function reportError(message: string) {
    setLocalError(message)
    onError?.(message)
  }

  function evaluate(next: DateParts, showIncomplete = false) {
    if (!next.day && !next.month && !next.year) {
      onChange('')
      reportError(required ? text.required : '')
      return !required
    }
    if (!next.day || !next.month || !next.year) {
      setLocalError(showIncomplete ? text.incomplete : '')
      onError?.(text.incomplete)
      return false
    }
    const iso = calendarPartsToIso(next, calendar)
    if (!iso) {
      reportError(text.invalid)
      return false
    }
    onChange(iso)
    reportError('')
    return true
  }

  function focusNextField() {
    const root = rootRef.current
    if (!root) return
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      'input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)'
    )).filter(item => item.offsetParent !== null)
    const lastIndex = Math.max(...controls.map((item, index) => root.contains(item) ? index : -1))
    controls.slice(lastIndex + 1).find(item => !root.contains(item))?.focus()
  }

  function validatePart(part: keyof DateParts) {
    const value = parts[part]
    const range = calendarYearRange(calendar)
    const valid = part === 'day' ? value >= 1 && value <= 31
      : part === 'month' ? value >= 1 && value <= 12
        : value >= range.min && value <= range.max
    if (!valid) reportError(part === 'day' ? text.day : part === 'month' ? text.month : text.year)
    return valid
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>, part: keyof DateParts) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      openCalendar()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()

    if (!editedRef.current) {
      if (evaluate(parts, true)) focusNextField()
      return
    }
    if (!validatePart(part)) return
    if (part === 'day') monthRef.current?.focus()
    else if (part === 'month') yearRef.current?.focus()
    else if (evaluate(parts, true)) {
      editedRef.current = false
      focusNextField()
    }
  }

  function update(part: keyof DateParts, raw: string) {
    editedRef.current = true
    const numeric = numericDatePart(raw, part === 'year' ? 4 : 2)
    const next = { ...parts, [part]: numeric ? Number(numeric) : 0 }
    setParts(next)
    evaluate(next)
  }

  function enterField(event: React.FocusEvent) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      editedRef.current = false
      if (!value && suggestToday && !disabled) {
        const today = localTodayIso()
        const todayParts = isoToCalendarParts(today, calendar)
        if (todayParts) {
          setParts(todayParts)
          setView(todayParts)
          onChange(today)
          reportError('')
        }
      }
    }
  }

  function openCalendar() {
    if (disabled) return
    setView(isoToCalendarParts(value, calendar) ?? isoToCalendarParts(localTodayIso(), calendar) ?? emptyParts)
    setOpen(true)
  }

  function shiftMonth(delta: number) {
    setView(current => {
      let year = current.year, month = current.month + delta
      if (month < 1) { month = 12; year-- }
      if (month > 12) { month = 1; year++ }
      const range = calendarYearRange(calendar)
      return year < range.min || year > range.max ? current : { year, month, day: 1 }
    })
  }

  function shiftYear(delta: number) {
    const range = calendarYearRange(calendar)
    setView(current => ({ ...current, year: Math.max(range.min, Math.min(range.max, current.year + delta)), day: 1 }))
  }

  function choose(day: number) {
    const next = { ...view, day }
    const iso = calendarPartsToIso(next, calendar)
    if (!iso) return
    setParts(next)
    onChange(iso)
    reportError('')
    editedRef.current = false
    setOpen(false)
    dayRef.current?.focus()
  }

  function chooseToday() {
    const iso = localTodayIso()
    const next = isoToCalendarParts(iso, calendar)
    if (!next) return
    setParts(next)
    setView(next)
    onChange(iso)
    reportError('')
    editedRef.current = false
    setOpen(false)
    dayRef.current?.focus()
  }

  const calendarData = useMemo(() => {
    const count = daysInCalendarMonth(view.year, view.month, calendar)
    const firstJsDay = calendarWeekday(view.year, view.month, calendar)
    const saturdayFirst = calendar === 'persian' || language === 'fa'
    const offset = (firstJsDay - (saturdayFirst ? 6 : 0) + 7) % 7
    const weekdays = saturdayFirst
      ? (fa ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] : ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'])
      : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    return { count, offset, weekdays }
  }, [calendar, fa, language, view.month, view.year])

  const todayParts = isoToCalendarParts(localTodayIso(), calendar)
  const selected = isoToCalendarParts(value, calendar)
  const title = fullDateLabel(value, calendar, language)

  return <div ref={rootRef} dir={fa ? 'rtl' : 'ltr'} className={`system-date-input ${localError ? 'invalid' : ''} ${open ? 'open' : ''}`}
    aria-label={ariaLabel} title={title} onFocusCapture={enterField}>
    <div className="system-date-field">
      <input ref={dayRef} className="system-date-segment day" disabled={disabled} inputMode="numeric"
        placeholder={fa ? 'روز' : 'DD'} aria-label={fa ? 'روز' : 'Day'} value={parts.day || ''}
        onFocus={e => e.currentTarget.select()} onChange={e => update('day', e.target.value)} onKeyDown={e => keyDown(e, 'day')} />
      <span>/</span>
      <input ref={monthRef} className="system-date-segment month" disabled={disabled} inputMode="numeric"
        placeholder={fa ? 'ماه' : 'MM'} aria-label={fa ? 'ماه' : 'Month'} value={parts.month || ''}
        onFocus={e => e.currentTarget.select()} onChange={e => update('month', e.target.value)} onKeyDown={e => keyDown(e, 'month')} />
      <span>/</span>
      <input ref={yearRef} className="system-date-segment year" disabled={disabled} inputMode="numeric"
        placeholder={fa ? 'سال' : 'YYYY'} aria-label={fa ? 'سال' : 'Year'} value={parts.year || ''}
        onFocus={e => e.currentTarget.select()} onChange={e => update('year', e.target.value)} onKeyDown={e => keyDown(e, 'year')} />
      <button type="button" className="system-date-toggle" disabled={disabled} aria-label={text.openCalendar}
        aria-expanded={open} onClick={() => open ? setOpen(false) : openCalendar()}>▼</button>
    </div>
    {localError && !onError && <small>{localError}</small>}
    {open && <div className="system-calendar" role="dialog" aria-label={text.openCalendar}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); dayRef.current?.focus() } }}>
      <div className="calendar-step">
        <button type="button" aria-label={text.previousYear} onClick={() => shiftYear(-1)}>−</button>
        <strong>{fa ? 'سال ' : ''}{view.year}</strong>
        <button type="button" aria-label={text.nextYear} onClick={() => shiftYear(1)}>＋</button>
      </div>
      <div className="calendar-step month">
        <button type="button" aria-label={text.previousMonth} onClick={() => shiftMonth(-1)}>−</button>
        <strong>{monthName(view.month, calendar, language)}</strong>
        <button type="button" aria-label={text.nextMonth} onClick={() => shiftMonth(1)}>＋</button>
      </div>
      <div className="calendar-grid weekdays">{calendarData.weekdays.map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid days">
        {Array.from({ length: calendarData.offset }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: calendarData.count }, (_, index) => {
          const day = index + 1
          const isSelected = selected?.year === view.year && selected.month === view.month && selected.day === day
          const isToday = todayParts?.year === view.year && todayParts.month === view.month && todayParts.day === day
          return <button type="button" key={day} className={`${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
            onClick={() => choose(day)}>{day}</button>
        })}
      </div>
      <button type="button" className="calendar-today" onClick={chooseToday}>{text.today}: {todayParts ? `${todayParts.year}/${String(todayParts.month).padStart(2, '0')}/${String(todayParts.day).padStart(2, '0')}` : ''}</button>
    </div>}
  </div>
}
