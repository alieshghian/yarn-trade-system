import { gregorianIsoToPersian, persianToGregorianIso, type PersianDateParts } from './persianDate'

export type CalendarKind = 'persian' | 'gregorian'
export type DateParts = PersianDateParts

const persianMonthsFa = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const persianMonthsEn = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand']
const gregorianMonthsFa = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
const gregorianMonthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const gregorianMonthsZh = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

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

export function monthName(month: number, calendar: CalendarKind, language: 'fa' | 'en' | 'zh') {
  const names = calendar === 'persian'
    ? language === 'fa' ? persianMonthsFa : persianMonthsEn
    : language === 'fa' ? gregorianMonthsFa : language === 'zh' ? gregorianMonthsZh : gregorianMonthsEn
  return names[month - 1] ?? ''
}

export function fullDateLabel(value: string, calendar: CalendarKind, language: 'fa' | 'en' | 'zh') {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'fa' ? 'fa-IR' : language === 'zh' ? 'zh-CN' : 'en-US', {
    calendar: calendar === 'gregorian' ? 'gregory' : 'persian', timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(date)
}

export function calendarYearRange(calendar: CalendarKind) {
  return calendar === 'persian' ? { min: 1200, max: 1700 } : { min: 1000, max: 9999 }
}

export function expandShortYear(value: string, calendar: CalendarKind) {
  const year = Number(value)
  if (value.length !== 2) return year
  // Fixed pivot: 00–49 belong to the current century, 50–99 to the previous one.
  return (calendar === 'persian' ? year >= 50 ? 1300 : 1400 : year >= 50 ? 1900 : 2000) + year
}

export function resolvedEntryYear(raw: string, calendar: CalendarKind): number | null {
  if (!/^\d{2}$|^\d{4}$/.test(raw)) return null
  const year = expandShortYear(raw, calendar)
  const range = calendarYearRange(calendar)
  return year >= range.min && year <= range.max ? year : null
}

export function decisiveDateSegment(raw: string, part: 'day' | 'month', maximum: number) {
  const value = Number(raw)
  if (!raw || value < 1 || value > maximum) return false
  // A single digit is decisive only if none of its two-digit completions is valid.
  return raw.length === 2 || value * 10 > maximum
}
