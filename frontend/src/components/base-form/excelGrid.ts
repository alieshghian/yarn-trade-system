export type GridValue = string | number | boolean | Date | null | undefined
export type GridValueType = 'text' | 'number' | 'date' | 'boolean'
export type GridSearchMode = 'startsWith' | 'contains' | 'exact'
export type GridFilterOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'beginsWith' | 'endsWith' | 'greaterThan' | 'greaterOrEqual' | 'lessThan' | 'lessOrEqual' | 'between' | 'on' | 'before' | 'after'
export type GridCondition = { operator: GridFilterOperator, value: string, secondValue?: string }
export type GridCustomFilter = { logic: 'and' | 'or', first: GridCondition, second?: GridCondition }
export type GridValueRule = { kind: 'top' | 'bottom' | 'aboveAverage' | 'belowAverage', count?: number }
export type GridColumnFilter = { selectedValues?: string[], selectionMode?: 'include' | 'exclude', custom?: GridCustomFilter, colors?: string[], valueRule?: GridValueRule }
export type GridFilterState = Record<string, GridColumnFilter | undefined>
export type GridSortState = { id: string, direction: 'asc' | 'desc', byColor?: boolean }[]
export type GridQuery = { page: number, pageSize: number, search: string, searchMode?: GridSearchMode, reverseSearch?: boolean, filters: GridFilterState, sort: GridSortState, language?: 'fa' | 'en' | 'zh', optionsColumn?: string, optionsSearch?: string }
export type GridPage<Row> = { items: Row[], total: number, page: number, pageSize: number, filterValues?: GridValue[], colorValues?: (string | null)[] }
export type ExcelGridColumn<Row> = {
  id: string
  label: string
  width: number
  type: GridValueType
  value: (row: Row) => GridValue
  effectiveCellColor?: (row: Row) => string | null | undefined
  colorAwareSort?: boolean
}

export const BLANK_VALUE = '\u0000blank'
export const NO_FILL = '\u0000no-fill'

export function gridValueKey(value: GridValue): string {
  if (value === null || value === undefined || value === '') return BLANK_VALUE
  if (value instanceof Date) return `date:${value.toISOString()}`
  return `${typeof value}:${String(value)}`
}

export function gridValueLabel(value: GridValue): string {
  if (value === null || value === undefined || value === '') return '(Blanks)'
  return value instanceof Date ? value.toLocaleDateString() : String(value)
}

export function normalizeGridSearchText(value: string): string {
  return value.normalize('NFKC')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[آأإٱ]/g, 'ا')
    .replace(/[\u200c\u200d]/g, ' ').replace(/ـ/g, '').replace(/[\u200e\u200f\u061c]/g, '')
    .replace(/[\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .toLocaleUpperCase().trim().replace(/\s+/g, ' ')
}

export function gridRowMatchesSearch<Row>(row: Row, columns: readonly ExcelGridColumn<Row>[], query: string, mode: GridSearchMode = 'startsWith'): boolean {
  const normalizedQuery = normalizeGridSearchText(query)
  if (!normalizedQuery) return true
  const values = columns.map(column => normalizeGridSearchText(String(column.value(row) ?? '')))
  if (mode === 'exact') return values.some(value => value === normalizedQuery)
  const terms = normalizedQuery.split(' ')
  return terms.every(term => values.some(value => mode === 'contains'
    ? value.includes(term)
    : value.split(/[^\p{L}\p{N}]+/u).some(word => word.startsWith(term))))
}

export function gridDistinctValues<Row>(rows: readonly Row[], column: ExcelGridColumn<Row>): GridValue[] {
  const values = new Map<string, GridValue>()
  for (const row of rows) {
    const value = column.value(row)
    values.set(gridValueKey(value), value)
  }
  return [...values.values()].sort((a, b) => compareGridValues(a, b, column.type, 'en'))
}

function comparable(value: GridValue, type: GridValueType): string | number {
  if (value === null || value === undefined) return type === 'number' ? Number.NEGATIVE_INFINITY : ''
  if (type === 'number') return typeof value === 'number' ? value : Number(String(value).trim())
  if (type === 'date') return value instanceof Date ? Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) : Date.parse(String(value).slice(0, 10))
  return String(value).toLocaleLowerCase()
}

export function compareGridValues(a: GridValue, b: GridValue, type: GridValueType, locale: string): number {
  const left = comparable(a, type), right = comparable(b, type)
  if (typeof left === 'number' && typeof right === 'number') return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right)
  return String(left).localeCompare(String(right), locale, { numeric: false, sensitivity: 'base' })
}

function conditionMatches(value: GridValue, type: GridValueType, condition: GridCondition, locale: string): boolean {
  const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  const wanted = condition.value
  if (type === 'text') {
    const a = text.toLocaleLowerCase(locale), b = wanted.toLocaleLowerCase(locale)
    switch (condition.operator) {
      case 'equals': return a === b
      case 'notEquals': return a !== b
      case 'contains': return a.includes(b)
      case 'notContains': return !a.includes(b)
      case 'beginsWith': return a.startsWith(b)
      case 'endsWith': return a.endsWith(b)
      default: return false
    }
  }
  const actual = comparable(value, type)
  const target = type === 'number' ? Number(wanted) : Date.parse(wanted)
  if (typeof actual !== 'number' || !Number.isFinite(target) || !Number.isFinite(actual)) return false
  switch (condition.operator) {
    case 'equals': case 'on': return actual === target
    case 'notEquals': return actual !== target
    case 'greaterThan': case 'after': return actual > target
    case 'greaterOrEqual': return actual >= target
    case 'lessThan': case 'before': return actual < target
    case 'lessOrEqual': return actual <= target
    case 'between': { const end = type === 'number' ? Number(condition.secondValue) : Date.parse(condition.secondValue ?? ''); return Number.isFinite(end) && actual >= Math.min(target, end) && actual <= Math.max(target, end) }
    default: return false
  }
}

function customMatches(value: GridValue, type: GridValueType, custom: GridCustomFilter, locale: string): boolean {
  const first = conditionMatches(value, type, custom.first, locale)
  if (!custom.second) return first
  return custom.logic === 'and' ? first && conditionMatches(value, type, custom.second, locale) : first || conditionMatches(value, type, custom.second, locale)
}

export function applyGridFiltersAndSort<Row>(rows: readonly Row[], columns: readonly ExcelGridColumn<Row>[], filters: GridFilterState, sort: GridSortState | undefined, locale: string): Row[] {
  const rules = new Map<string, { kind: GridValueRule['kind'], threshold: number }>()
  for (const column of columns) {
    const rule = filters[column.id]?.valueRule
    if (!rule || column.type !== 'number') continue
    const values = rows.map(row => { const value = column.value(row); return value === null || value === undefined || value === '' ? Number.NaN : Number(value) }).filter(Number.isFinite)
    if (!values.length) continue
    const sorted = [...values].sort((a, b) => a - b)
    const count = Math.min(values.length, Math.max(1, Math.trunc(rule.count ?? 10)))
    const threshold = rule.kind === 'aboveAverage' || rule.kind === 'belowAverage'
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : rule.kind === 'top' ? sorted[Math.max(0, sorted.length - count)] : sorted[Math.min(sorted.length - 1, count - 1)]
    rules.set(column.id, { kind: rule.kind, threshold })
  }
  const filtered = rows.filter(row => columns.every(column => {
    const filter = filters[column.id]
    if (!filter) return true
    const value = column.value(row)
    if (filter.selectedValues) {
      const included = filter.selectedValues.includes(gridValueKey(value))
      if (filter.selectionMode === 'exclude' ? included : !included) return false
    }
    if (filter.custom && !customMatches(value, column.type, filter.custom, locale)) return false
    if (filter.colors !== undefined && !filter.colors.includes(column.effectiveCellColor?.(row) ?? NO_FILL)) return false
    const rule = rules.get(column.id)
    if (rule) {
      const number = Number(value)
      if (!Number.isFinite(number)) return false
      if (rule.kind === 'top' && number < rule.threshold || rule.kind === 'bottom' && number > rule.threshold || rule.kind === 'aboveAverage' && number <= rule.threshold || rule.kind === 'belowAverage' && number >= rule.threshold) return false
    }
    return true
  }))
  const sortColumns = (sort ?? []).map(criterion => ({ criterion, column: columns.find(item => item.id === criterion.id) })).filter((item): item is { criterion: GridSortState[number], column: ExcelGridColumn<Row> } => Boolean(item.column))
  if (!sortColumns.length) return filtered
  return filtered.map((row, index) => ({ row, index })).sort((a, b) => {
    for (const { criterion, column } of sortColumns) {
      const direction = criterion.direction === 'asc' ? 1 : -1
      if (criterion.byColor && column.colorAwareSort && column.effectiveCellColor) {
        const left = column.effectiveCellColor(a.row) ?? NO_FILL, right = column.effectiveCellColor(b.row) ?? NO_FILL
        const comparison = left === right ? 0 : left === NO_FILL ? 1 : right === NO_FILL ? -1 : left.localeCompare(right)
        if (comparison) return comparison * direction
        if (sortColumns.length > 1) continue
      }
      const comparison = compareGridValues(column.value(a.row), column.value(b.row), column.type, locale) * direction
      if (comparison) return comparison
    }
    return a.index - b.index
  }).map(item => item.row)
}

export function gridAvailableColors<Row>(rows: readonly Row[], column: ExcelGridColumn<Row>): (string | null)[] {
  if (!column.effectiveCellColor) return []
  const colors = new Set<string | null>()
  for (const row of rows) colors.add(column.effectiveCellColor(row) ?? null)
  return [...colors].sort((a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b))
}
