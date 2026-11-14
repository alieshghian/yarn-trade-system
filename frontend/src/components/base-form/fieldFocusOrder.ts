import type { FormSchemaField } from './formSchema'

const canReceiveFocus = (field: FormSchemaField) => !field.readOnly && field.kind !== 'hidden' && field.componentId !== 'base-form.derived-display'

export type FocusRect = { left: number; right: number; top: number; bottom: number }
export type FocusItem<T> = { value: T; rect: FocusRect; order?: number }

/** Group controls by their actual input row, then follow the reading direction. */
export function visualFocusOrder<T>(items: readonly FocusItem<T>[], rtl: boolean): FocusItem<T>[] {
  const rows: FocusItem<T>[][] = []
  for (const item of [...items].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)) {
    const height = item.rect.bottom - item.rect.top
    const row = rows.find(group => {
      const first = group[0].rect, firstHeight = first.bottom - first.top
      return Math.abs(item.rect.top - first.top) <= Math.max(4, Math.min(height, firstHeight) / 2) + 1
    })
    if (row) row.push(item); else rows.push([item])
  }
  return rows.flatMap(row => row.sort((a, b) => rtl ? b.rect.right - a.rect.right : a.rect.left - b.rect.left))
}

/** Valid, unique explicit positions come first; remaining fields retain visual order. */
export function orderedFocusItems<T>(items: readonly FocusItem<T>[], rtl: boolean): FocusItem<T>[] {
  const visual = visualFocusOrder(items, rtl)
  const ranks = visual.map(item => item.order).filter((order): order is number => order !== undefined)
  if (ranks.some(order => !Number.isSafeInteger(order) || order < 1) || new Set(ranks).size !== ranks.length) return visual
  return visual.map((item, index) => ({ item, index })).sort((a, b) => (a.item.order ?? Infinity) - (b.item.order ?? Infinity) || a.index - b.index).map(entry => entry.item)
}

export function fieldFocusSequence(fields: readonly FormSchemaField[], visualIds: readonly string[], includeSkipped = false): string[] {
  const focusable = fields.filter(field=>canReceiveFocus(field)&&(includeSkipped||field.enterEnabled!==false))
  const ids = [...new Set([...visualIds.filter(id => focusable.some(field => field.id === id)), ...focusable.map(field => field.id)])]
  const items = ids.map((id, index) => ({ id, index, order: fields.find(field => field.id === id)?.focusOrder }))
  const orders = items.map(item => item.order).filter((order): order is number => order !== undefined)
  const valid = orders.every(order => Number.isSafeInteger(order) && order > 0) && new Set(orders).size === orders.length
  return (valid ? items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.index - b.index) : items).map(item => item.id)
}

/** Moving a numbered field shifts the others, so two fields never share a position. */
export function moveFieldFocusOrder(fields: readonly FormSchemaField[], visualIds: readonly string[], fieldId: string, position: number): FormSchemaField[] {
  const sorted = fieldFocusSequence(fields, visualIds, true), current = sorted.indexOf(fieldId)
  if (current < 0 || !Number.isSafeInteger(position) || position < 1 || position > sorted.length) return [...fields]
  const [moved] = sorted.splice(current, 1)
  sorted.splice(position - 1, 0, moved)
  const positions = new Map(sorted.map((id, index) => [id, index + 1]))
  return fields.map(field => {
    if (!canReceiveFocus(field)) {
      const { focusOrder: _focusOrder, ...rest } = field
      return rest
    }
    return { ...field, focusOrder: positions.get(field.id) }
  })
}

export function hasInvalidFieldFocusOrders(fields: readonly FormSchemaField[]): boolean {
  const values = fields.filter(canReceiveFocus).map(field => field.focusOrder).filter((order): order is number => order !== undefined)
  return values.some(order => !Number.isSafeInteger(order) || order < 1) || new Set(values).size !== values.length
}

/** Find the closest physical neighbor without altering the other fields. */
export function spatialFocusNeighbor<T>(items: readonly FocusItem<T>[], current: FocusItem<T>, key: string): FocusItem<T> | undefined {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
  const center = (rect: FocusRect, axis: 'x' | 'y') => axis === 'x' ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2
  const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x'
  const from = center(current.rect, axis), fromCross = center(current.rect, cross)
  return items.filter(item => item !== current && (center(item.rect, axis) - from) * sign > 0.5)
    .map(item => {
      const primary = Math.abs(center(item.rect, axis) - from), secondary = Math.abs(center(item.rect, cross) - fromCross)
      const aStart = horizontal ? current.rect.top : current.rect.left, aEnd = horizontal ? current.rect.bottom : current.rect.right
      const bStart = horizontal ? item.rect.top : item.rect.left, bEnd = horizontal ? item.rect.bottom : item.rect.right
      const overlaps = Math.min(aEnd, bEnd) > Math.max(aStart, bStart)
      return { item, score: primary + secondary * (overlaps ? 0.15 : 2) }
    }).sort((a, b) => a.score - b.score)[0]?.item
}
