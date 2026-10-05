import { gregorianIsoToPersian, persianToGregorianIso, type PersianDateParts } from './persianDate'

export type CalendarKind = 'persian' | 'gregorian'
export type DateParts = PersianDateParts

const persianMonthsFa = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const persianMonthsEn = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand']
const gregorianMonthsFa = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
const gregorianMonthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function localTodayIso() {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function isoToCalendarParts(value: string | undefined, calendar: CalendarKind): DateParts | null {
  if (!value) return null
  if (calendar === 'persian') return gregorianIsoToPersian(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  return calendarPartsToIso(parts, calendar) ? parts : null
}

export function calendarPartsToIso(parts: DateParts, calendar: CalendarKind): string | null {
  if (calendar === 'persian') return persianToGregorianIso(parts.year, parts.month, parts.day)
  const { year, month, day } = parts
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysInCalendarMonth(year: number, month: number, calendar: CalendarKind) {
  if (calendar === 'gregorian') return new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month <= 6) return 31
  if (month <= 11) return 30
  return persianToGregorianIso(year, 12, 30) ? 30 : 29
}

export function calendarWeekday(year: number, month: number, calendar: CalendarKind) {
  const iso = calendarPartsToIso({ year, month, day: 1 }, calendar)
  return iso ? new Date(`${iso}T00:00:00Z`).getUTCDay() : 0
}

export function monthName(month: number, calendar: CalendarKind, language: 'fa' | 'en') {
  const names = calendar === 'persian'
    ? language === 'fa' ? persianMonthsFa : persianMonthsEn
    : language === 'fa' ? gregorianMonthsFa : gregorianMonthsEn
  return names[month - 1] ?? ''
}

export function fullDateLabel(value: string, calendar: CalendarKind, language: 'fa' | 'en') {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'fa' ? 'fa-IR' : 'en-US', {
    calendar, timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(date)
}

export function calendarYearRange(calendar: CalendarKind) {
  return calendar === 'persian' ? { min: 1200, max: 1700 } : { min: 1000, max: 9999 }
}
