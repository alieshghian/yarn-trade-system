import { useEffect, useMemo, useRef, useState } from 'react'
import { numericDatePart } from './persianDate'
import {
  calendarPartsToIso, calendarWeekday, calendarYearRange, daysInCalendarMonth, fullDateLabel,
  isoToCalendarParts, localTodayIso, monthName, resolvedEntryYear, decisiveDateSegment, type CalendarKind, type DateParts
} from './dateCalendar'

type Props = {
  value: string
  onChange: (isoDate: string) => void
  onError?: (message: string) => void
  calendar?: CalendarKind // Retained for existing callers; UI language owns the editable calendar.
  disabled?: boolean
  required?: boolean
  language?: 'fa' | 'en' | 'zh'
  ariaLabel?: string
  suggestToday?: boolean
}

const emptyParts: DateParts = { year: 0, month: 0, day: 0 }

export default function SystemDateInput({
  value, onChange, onError, disabled, required, language = 'fa',
  ariaLabel, suggestToday = false
}: Props) {
  const fa = language === 'fa'
  const calendar: CalendarKind = fa ? 'persian' : 'gregorian'
  const initial = isoToCalendarParts(value, calendar)
  const [parts, setParts] = useState<DateParts>(initial ?? emptyParts)
  const [rawParts, setRawParts] = useState(() => displayParts(initial ?? emptyParts))
  const lastEmitted = useRef<string | undefined>(undefined)
  const displayedCalendar = useRef(calendar)
  const [view, setView] = useState<DateParts>(initial ?? isoToCalendarParts(localTodayIso(), calendar) ?? emptyParts)
  const [open, setOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  const editedRef = useRef(false)
  const initializedToday = useRef(Boolean(value))

  useEffect(() => {
    if (value === lastEmitted.current && displayedCalendar.current === calendar) return
    displayedCalendar.current = calendar
    const next = isoToCalendarParts(value, calendar)
    setParts(next ?? emptyParts)
    setRawParts(displayParts(next ?? emptyParts))
    if (next) setView(next)
    setLocalError('')
  }, [value, calendar])

  useEffect(() => {
    if (value) { initializedToday.current = true; return }
    if (initializedToday.current || value || disabled || !(suggestToday || required)) return
    initializedToday.current = true
    const today = localTodayIso()
    const next = isoToCalendarParts(today, calendar)!
    lastEmitted.current = today
    setParts(next); setRawParts(displayParts(next)); setView(next)
    onChange(today)
  }, [value, disabled, suggestToday, required, calendar, onChange])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => {
    const valid = resolvedEntryYear(rawParts.year, calendar) !== null && calendarPartsToIso(parts, calendar) !== null
    for (const field of [dayRef.current, monthRef.current, yearRef.current])
      field?.setCustomValidity(!disabled && (!valid && (required || parts.day || parts.month || parts.year)) ? text.invalid : '')
  })

  const text = language === 'fa' ? {
    required: 'تاریخ الزامی است.', incomplete: 'روز، ماه و سال را کامل وارد کنید.', invalid: `تاریخ ${calendar === 'persian' ? 'شمسی' : 'میلادی'} واردشده معتبر نیست.`, day: 'روز باید بین ۱ تا ۳۱ باشد.', month: 'ماه باید بین ۱ تا ۱۲ باشد.', year: `سال ${calendar === 'persian' ? 'شمسی' : 'میلادی'} معتبر وارد کنید.`, today: 'امروز', previousYear: 'سال قبل', nextYear: 'سال بعد', previousMonth: 'ماه قبل', nextMonth: 'ماه بعد', openCalendar: 'بازکردن تقویم', dayLabel: 'روز', monthLabel: 'ماه', yearLabel: 'سال'
  } : language === 'zh' ? {
    required: '日期为必填项。', incomplete: '请完整输入日、月和年。', invalid: '日期无效。', day: '日期必须在 1 到 31 之间。', month: '月份必须在 1 到 12 之间。', year: '请输入有效年份。', today: '今天', previousYear: '上一年', nextYear: '下一年', previousMonth: '上个月', nextMonth: '下个月', openCalendar: '打开日历', dayLabel: '日', monthLabel: '月', yearLabel: '年'
  } : {
    required: 'Date is required.', incomplete: 'Enter day, month and year.', invalid: `Invalid ${calendar} date.`, day: 'Day must be 1-31.', month: 'Month must be 1-12.', year: `Enter a valid ${calendar} year.`, today: 'Today', previousYear: 'Previous year', nextYear: 'Next year', previousMonth: 'Previous month', nextMonth: 'Next month', openCalendar: 'Open calendar', dayLabel: 'Day', monthLabel: 'Month', yearLabel: 'Year'
  }

  function reportError(message: string) {
    setLocalError(message)
    onError?.(message)
  }

  function evaluate(next: DateParts, showIncomplete = false, rawYear = rawParts.year) {
    if (!next.day && !next.month && !next.year) {
      lastEmitted.current = ''
      onChange('')
      reportError(required ? text.required : '')
      return !required
    }
    if (!next.day || !next.month || resolvedEntryYear(rawYear, calendar) === null) {
      lastEmitted.current = ''
      onChange('')
      setLocalError(showIncomplete ? text.incomplete : '')
      onError?.(text.incomplete)
      return false
    }
    const iso = calendarPartsToIso(next, calendar)
    if (!iso) {
      lastEmitted.current = ''
      onChange('')
      reportError(text.invalid)
      return false
    }
    lastEmitted.current = iso
    onChange(iso)
    reportError('')
    return true
  }

  function focusNextField() {
    const root = rootRef.current
    if (!root) return
    const scope = root.closest('.form-tab-pane.active') ?? document
    const controls = Array.from(scope.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'
    )).filter(item => item.getClientRects().length > 0 && !('readOnly' in item && item.readOnly) && item.type !== 'hidden' && !item.closest('.system-calendar,details:not([open])'))
    const lastIndex = Math.max(...controls.map((item, index) => root.contains(item) ? index : -1))
    controls.slice(lastIndex + 1).find(item => !root.contains(item))?.focus()
  }

  function validatePart(part: keyof DateParts) {
    const value = parts[part]
    const range = calendarYearRange(calendar)
    const valid = part === 'day' ? value >= 1 && value <= dayMaximum()
      : part === 'month' ? value >= 1 && value <= 12
        : resolvedEntryYear(rawParts.year, calendar) !== null && value >= range.min && value <= range.max
    if (!valid) reportError(part === 'day' ? text.day : part === 'month' ? text.month : text.year)
    return valid
  }

  function dayMaximum() {
    return parts.month >= 1 && parts.month <= 12
      ? daysInCalendarMonth(parts.year || (fa ? 1399 : 2000), parts.month, calendar) : 31
  }

  function focusInvalid() {
    const field = !parts.month || parts.month > 12 ? monthRef.current
      : resolvedEntryYear(rawParts.year, calendar) === null ? yearRef.current : dayRef.current
    field?.focus(); field?.select()
  }

  function resolveDisplayYear() {
    const year = resolvedEntryYear(rawParts.year, calendar)
    if (year !== null) setRawParts(current => ({ ...current, year: String(year).padStart(4, '0') }))
  }

  function normalizeDateSegments() {
    setRawParts(current => ({
      ...current,
      day: normalizeSingleDigit(current.day, 31),
      month: normalizeSingleDigit(current.month, 12)
    }))
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
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const field = event.currentTarget
      const fullySelected = field.selectionStart === 0 && field.selectionEnd === field.value.length
      const atEdge = event.key === 'ArrowLeft' ? field.selectionStart === 0 && field.selectionEnd === 0
        : field.selectionStart === field.value.length && field.selectionEnd === field.value.length
      if (!fullySelected && !atEdge) return
      const forward = event.key === (fa ? 'ArrowLeft' : 'ArrowRight')
      const refs = [dayRef, monthRef, yearRef]
      const index = part === 'day' ? 0 : part === 'month' ? 1 : 2
      const target = refs[index + (forward ? 1 : -1)]?.current
      event.preventDefault(); event.stopPropagation()
      target?.focus(); target?.select()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()

    if (!editedRef.current) {
      normalizeDateSegments()
      if (evaluate(parts, true)) { resolveDisplayYear(); focusNextField() }
      else focusInvalid()
      return
    }
    if (!validatePart(part)) { event.currentTarget.select(); return }
    if (part === 'day') { normalizePart('day'); monthRef.current?.focus() }
    else if (part === 'month') { normalizePart('month'); yearRef.current?.focus() }
    else if (evaluate(parts, true)) {
      normalizeDateSegments()
      resolveDisplayYear()
      editedRef.current = false
      focusNextField()
    } else focusInvalid()
  }

  function update(part: keyof DateParts, raw: string) {
    editedRef.current = true
    const numeric = numericDatePart(raw, part === 'year' ? 4 : 2)
    const next = { ...parts, [part]: numeric ? part === 'year' ? resolvedEntryYear(numeric, calendar) ?? 0 : Number(numeric) : 0 }
    setParts(next)
    evaluate(next, false, part === 'year' ? numeric : rawParts.year)
    const advanceDay = part === 'day' && decisiveDateSegment(numeric, part, dayMaximum())
    const advanceMonth = part === 'month' && decisiveDateSegment(numeric, part, 12)
    setRawParts(current => ({ ...current, [part]: (advanceDay || advanceMonth) ? normalizeSingleDigit(numeric, part === 'day' ? 31 : 12) : numeric }))
    if (advanceDay) monthRef.current?.focus()
    if (advanceMonth) {
      if (next.day && next.year && next.day > daysInCalendarMonth(next.year, next.month, calendar)) {
        reportError(text.invalid); dayRef.current?.focus(); dayRef.current?.select()
      } else yearRef.current?.focus()
    }
    if (numeric.length === 2 && (part === 'day' && (next.day < 1 || next.day > dayMaximum()) || part === 'month' && (next.month < 1 || next.month > 12))) {
      reportError(part === 'day' ? text.invalid : text.month)
      ;(part === 'day' ? dayRef.current : monthRef.current)?.select()
    }
  }

  function enterField(event: React.FocusEvent) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      if (!editedRef.current && !value && suggestToday && !disabled && !initializedToday.current) {
        const today = localTodayIso()
        const todayParts = isoToCalendarParts(today, calendar)
        if (todayParts) {
          setParts(todayParts)
          setRawParts(displayParts(todayParts))
          setView(todayParts)
          onChange(today)
          reportError('')
        }
      }
    }
  }

  function normalizePart(part: 'day' | 'month') {
    setRawParts(current => ({ ...current, [part]: normalizeSingleDigit(current[part], part === 'day' ? 31 : 12) }))
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
    setRawParts(displayParts(next))
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
    setRawParts(displayParts(next))
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
      : language === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    return { count, offset, weekdays }
  }, [calendar, fa, language, view.month, view.year])

  const todayParts = isoToCalendarParts(localTodayIso(), calendar)
  const selected = isoToCalendarParts(value, calendar)
  const title = fullDateLabel(value, calendar, language)
  const equivalentCalendar: CalendarKind = calendar === 'persian' ? 'gregorian' : 'persian'
  const equivalent = isoToCalendarParts(value, equivalentCalendar)

  return <div ref={rootRef} dir={calendar === 'persian' ? 'rtl' : 'ltr'} className={`system-date-input calendar-${calendar} ${localError ? 'invalid' : ''} ${open ? 'open' : ''}`}
    aria-label={ariaLabel} title={title} onFocusCapture={enterField}
    onBlur={event => {
      if (rootRef.current?.contains(event.relatedTarget as Node | null) || disabled) return
      normalizeDateSegments()
      if (editedRef.current && (required || rawParts.day || rawParts.month || rawParts.year) && !evaluate(parts, true)) focusInvalid()
      else { resolveDisplayYear(); editedRef.current = false }
    }}>
    <div className="system-date-field" style={{
      direction: 'ltr',
      gridTemplateAreas: calendar === 'persian' ? '"picker year yearSeparator month daySeparator day"' : '"day daySeparator month yearSeparator year picker"',
      gridTemplateColumns: calendar === 'persian' ? '30.24px 66.96px 6.48px 36.72px 6.48px 36.72px' : '36.72px 6.48px 36.72px 6.48px 66.96px 30.24px'
    }}>
      <input ref={dayRef} className="system-date-segment day" disabled={disabled} inputMode="numeric"
        style={{ gridArea: 'day' }}
        placeholder={fa ? 'روز' : language === 'zh' ? '日' : 'DD'} aria-label={text.dayLabel} value={rawParts.day}
        onFocus={e => e.currentTarget.select()} onBlur={() => normalizePart('day')} onChange={e => update('day', e.target.value)} onKeyDown={e => keyDown(e, 'day')} />
      <span style={{ gridArea: 'daySeparator' }}>/</span>
      <input ref={monthRef} className="system-date-segment month" disabled={disabled} inputMode="numeric"
        style={{ gridArea: 'month' }}
        placeholder={fa ? 'ماه' : language === 'zh' ? '月' : 'MM'} aria-label={text.monthLabel} value={rawParts.month}
        onFocus={e => e.currentTarget.select()} onBlur={() => normalizePart('month')} onChange={e => update('month', e.target.value)} onKeyDown={e => keyDown(e, 'month')} />
      <span style={{ gridArea: 'yearSeparator' }}>/</span>
      <input ref={yearRef} className="system-date-segment year" disabled={disabled} inputMode="numeric"
        style={{ gridArea: 'year' }}
        placeholder={fa ? 'سال' : language === 'zh' ? '年' : 'YYYY'} aria-label={text.yearLabel} value={rawParts.year}
        onFocus={e => e.currentTarget.select()} onBlur={resolveDisplayYear} onChange={e => update('year', e.target.value)} onKeyDown={e => keyDown(e, 'year')} />
      <button type="button" className="system-date-toggle" disabled={disabled} aria-label={text.openCalendar}
        style={{ gridArea: 'picker' }}
        aria-expanded={open} onClick={() => open ? setOpen(false) : openCalendar()}>▦</button>
    </div>
    {equivalent && <output className={`system-date-equivalent ${equivalentCalendar === 'persian' ? 'jalali' : 'gregorian'}`} dir={equivalentCalendar === 'persian' ? 'rtl' : 'ltr'} aria-label={fa ? 'معادل میلادی' : language === 'zh' ? '波斯历日期' : 'Jalali equivalent'}>
      <span className="system-date-equivalent-label">{fa ? 'میلادی' : language === 'zh' ? '波斯历' : 'Jalali'}:</span>
      <span className={`system-date-equivalent-value ${equivalentCalendar === 'persian' ? 'jalali' : 'gregorian'}`}>
        <span className="year">{equivalent.year}</span><span className="year-separator">/</span>
        <span className="month">{String(equivalent.month).padStart(2, '0')}</span><span className="day-separator">/</span>
        <span className="day">{String(equivalent.day).padStart(2, '0')}</span>
      </span>
    </output>}
    {localError && !onError && <small>{localError}</small>}
    {open && <div className="system-calendar" role="dialog" aria-label={text.openCalendar}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); dayRef.current?.focus() } }}>
      <div className="calendar-step">
        <button type="button" aria-label={text.previousYear} onClick={() => shiftYear(-1)}>−</button>
        <strong>{fa ? 'سال ' : ''}{view.year}{language === 'zh' ? '年' : ''}</strong>
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

function displayParts(parts: DateParts) {
  return { day: parts.day ? String(parts.day).padStart(2, '0') : '', month: parts.month ? String(parts.month).padStart(2, '0') : '', year: parts.year ? String(parts.year) : '' }
}

function normalizeSingleDigit(raw: string, maximum: number) {
  const value = Number(raw)
  return raw.length === 1 && value >= 1 && value <= maximum ? raw.padStart(2, '0') : raw
}
