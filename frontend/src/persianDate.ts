export type PersianDateParts = { year: number, month: number, day: number }

const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric'
})

function normalizeDigits(value: string) {
  const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩'
  return value.replace(/[۰-۹٠-٩]/g, digit => String(fa.indexOf(digit) >= 0 ? fa.indexOf(digit) : ar.indexOf(digit)))
}

export function numericDatePart(value: string, maxLength: number) {
  return normalizeDigits(value).replace(/\D/g, '').slice(0, maxLength)
}

export function gregorianIsoToPersian(value?: string): PersianDateParts | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return null
  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(x => x.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

function samePersianDate(date: Date, year: number, month: number, day: number) {
  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(x => x.type === type)?.value)
  return read('year') === year && read('month') === month && read('day') === day
}

export function persianToGregorianIso(year: number, month: number, day: number): string | null {
  if (year < 1200 || year > 1700 || month < 1 || month > 12 || day < 1 || day > 31) return null
  if (month > 6 && day > 30) return null
  const approximateGregorianYear = year + 621
  const start = Date.UTC(approximateGregorianYear, 1, 15)
  for (let offset = 0; offset < 410; offset++) {
    const date = new Date(start + offset * 86_400_000)
    if (samePersianDate(date, year, month, day)) return date.toISOString().slice(0, 10)
  }
  return null
}

export function formatPersianDate(value?: string, empty = '—') {
  const date = gregorianIsoToPersian(value)
  return date ? `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}` : empty
}
