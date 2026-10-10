import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type GridColumn<Row> = { id: string, label: string, width: number, value: (row: Row) => string }
type Props<Row> = { rows: Row[], columns: GridColumn<Row>[], language: 'fa' | 'en' | 'zh' }

// Adapter boundary: it offers the current grid interaction vocabulary without owning an ERP grid framework.
export function BaseFormGridBoundary<Row>({ rows, columns: initialColumns, language }: Props<Row>) {
  const [columns, setColumns] = useState(() => initialColumns.map(column => ({ ...column, visible: true })))
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ id: string, desc: boolean }>()
  const [filter, setFilter] = useState<Record<string, string>>({})
  const fa = language === 'fa'
  const visible = columns.filter(column => column.visible)
  const filtered = useMemo(() => rows.filter(row => columns.every(column => {
    const value = column.value(row)
    return (!search || value.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && (!filter[column.id] || value === filter[column.id])
  })).sort((a, b) => !sort ? 0 : (sort.desc ? -1 : 1) * columns.find(column => column.id === sort.id)!.value(a).localeCompare(columns.find(column => column.id === sort.id)!.value(b), language === 'fa' ? 'fa' : 'en')), [rows, columns, search, filter, sort, language])
  const resize = (id: string, event: ReactPointerEvent<HTMLSpanElement>) => {
    const start = event.clientX, width = columns.find(column => column.id === id)!.width
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => setColumns(current => current.map(column => column.id === id ? { ...column, width: Math.max(80, width + next.clientX - start) } : column))
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  return <div className="base-grid-boundary">
    <div className="grid-toolbar"><div><h2>{fa ? 'جدول دادهٔ مصنوعی' : 'Synthetic data table'}</h2><span>{fa ? `${filtered.length} از ${rows.length} رکورد` : `${filtered.length} of ${rows.length} records`}</span></div><input type="search" aria-label={fa ? 'جست‌وجو در دادهٔ مصنوعی' : 'Search synthetic data'} value={search} onChange={event => setSearch(event.target.value)} placeholder={fa ? 'جست‌وجو…' : 'Search…'} /><details><summary>{fa ? 'ستون‌ها' : 'Columns'}</summary>{columns.map(column => <label key={column.id}><input type="checkbox" checked={column.visible} onChange={() => setColumns(current => current.map(item => item.id === column.id ? { ...item, visible: !item.visible } : item))} />{column.label}</label>)}</details></div>
    <div className="base-grid-table-wrap"><table className="person-table excel-grid base-grid-table" style={{ minWidth: visible.reduce((sum, column) => sum + column.width, 0) }}><thead><tr>{visible.map(column => <th key={column.id} style={{ width: column.width }}><button type="button" onClick={() => setSort(current => ({ id: column.id, desc: current?.id === column.id ? !current.desc : false }))}>{column.label}{sort?.id === column.id && (sort.desc ? ' ↓' : ' ↑')}</button><select aria-label={`${column.label} filter`} value={filter[column.id] ?? ''} onChange={event => setFilter(current => ({ ...current, [column.id]: event.target.value }))}><option value="">{fa ? 'همه' : 'All'}</option>{[...new Set(rows.map(column.value))].slice(0, 40).map(value => <option key={value} value={value}>{value}</option>)}</select><span className="base-grid-resizer" onPointerDown={event => resize(column.id, event)} /></th>)}</tr></thead><tbody>{filtered.slice(0, 100).map((row, index) => <tr key={index}>{visible.map(column => <td key={column.id}>{column.value(row)}</td>)}</tr>)}</tbody></table></div><small className="base-grid-limit">{fa ? 'حداکثر ۱۰۰ ردیف در DOM نمایش داده می‌شود؛ فیلتر و مرتب‌سازی روی مجموعهٔ انتخاب‌شده انجام می‌گیرد.' : 'At most 100 DOM rows are rendered; filtering and sorting cover the selected dataset.'}</small>
  </div>
}
