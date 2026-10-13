import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ExcelGridColumnHeader, ExcelGridFilterScope } from './ExcelGridColumnHeader'
import { applyGridFiltersAndSort, gridRowMatchesSearch, gridValueKey, gridValueLabel, type ExcelGridColumn, type GridFilterState, type GridPage, type GridQuery, type GridSearchMode, type GridSortState, type GridValue } from './excelGrid'
import type { GridSearchPosition } from './designer'

export type GridColumn<Row> = ExcelGridColumn<Row>
type Props<Row> = { rows: Row[], columns: GridColumn<Row>[], language: 'fa' | 'en' | 'zh', appearanceStyle?: CSSProperties, filterPopupFontSize?: number, remoteQuery?: (query: GridQuery, signal?: AbortSignal) => Promise<GridPage<Row>>, resetRequest?: number, gridSearchPosition?: GridSearchPosition }
type CellContextMenu = { columnId: string, columnLabel: string, value: GridValue, left: number, top: number }

// Adapter boundary: shares the same typed Excel filtering and sorting used by the Persons grid.
export function BaseFormGridBoundary<Row>({ rows, columns: initialColumns, language, appearanceStyle, filterPopupFontSize = 16, remoteQuery, resetRequest = 0, gridSearchPosition = 'right' }: Props<Row>) {
  const [columns, setColumns] = useState(() => initialColumns.map(column => ({ ...column, visible: true })))
  const [sort, setSort] = useState<GridSortState>()
  const [filters, setFilters] = useState<GridFilterState>({})
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchMode, setSearchMode] = useState<GridSearchMode>('startsWith')
  const [reverseSearch, setReverseSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState<{ text: string, mode: GridSearchMode, reverse: boolean }>({ text: '', mode: 'startsWith', reverse: false })
  const [remotePage, setRemotePage] = useState<GridPage<Row>>()
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  const [cellMenu, setCellMenu] = useState<CellContextMenu | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const cellMenuRef = useRef<HTMLDivElement>(null)
  const fa = language === 'fa'
  const visible = columns.filter(column => column.visible)
  const searchOrder = fa ? ({ right: 0, center: 1, left: 2 } as const)[gridSearchPosition] : ({ left: 0, center: 1, right: 2 } as const)[gridSearchPosition]
  const columnsOrder = searchOrder === 2 ? 1 : 2
  useEffect(() => {
    if (!resetRequest) return
    setFilters({}); setSort([]); setSearchDraft(''); setSearchMode('startsWith'); setReverseSearch(false); setSearchQuery({ text: '', mode: 'startsWith', reverse: false }); setPage(1)
  }, [resetRequest])
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearchQuery({ text: searchDraft.trim(), mode: searchMode, reverse: reverseSearch }) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchDraft, searchMode, reverseSearch])
  useEffect(() => {
    if (!remoteQuery) return
    let current = true
    const controller = new AbortController()
    setRemoteLoading(true); setRemoteError('')
    void remoteQuery({ page, pageSize: 100, search: searchQuery.text, searchMode: searchQuery.mode, reverseSearch: searchQuery.reverse, filters, sort: sort ?? [] }, controller.signal)
      .then(result => { if (current) setRemotePage(result) })
      .catch(error => { if (current && !controller.signal.aborted) setRemoteError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (current) setRemoteLoading(false) })
    return () => { current = false; controller.abort() }
  }, [remoteQuery, page, searchQuery, filters, sort])
  const searchableRows = useMemo(() => {
    if (!searchQuery.text) return rows
    return rows.filter(row => gridRowMatchesSearch(row, columns, searchQuery.text, searchQuery.mode) !== searchQuery.reverse)
  }, [rows, columns, searchQuery])
  const filtered = useMemo(() => remoteQuery ? remotePage?.items ?? [] : applyGridFiltersAndSort(searchableRows, columns, filters, sort, language), [remoteQuery, remotePage, searchableRows, columns, filters, sort, language])
  const total = remoteQuery ? remotePage?.total ?? 0 : filtered.length
  const pageCount = remoteQuery ? Math.max(1, Math.ceil(total / (remotePage?.pageSize ?? 100))) : 1
  const loadFilterValues = useCallback(async (columnId: string, query: string): Promise<{ values: GridValue[], colors?: (string | null)[] }> => {
    if (!remoteQuery) return { values: [] }
    const result = await remoteQuery({ page, pageSize: 100, search: searchQuery.text, searchMode: searchQuery.mode, reverseSearch: searchQuery.reverse, filters, sort: sort ?? [], optionsColumn: columnId, optionsSearch: query })
    return { values: result.filterValues ?? [], colors: result.colorValues }
  }, [remoteQuery, page, searchQuery, filters, sort])
  const resize = (id: string, event: ReactPointerEvent<HTMLSpanElement>) => {
    const start = event.clientX, width = columns.find(column => column.id === id)!.width
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => setColumns(current => current.map(column => column.id === id ? { ...column, width: Math.max(80, width + next.clientX - start) } : column))
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  const applyFilter = (id: string, filter: GridFilterState[string]) => setFilters(current => { const next = { ...current }; if (filter) next[id] = filter; else delete next[id]; return next })
  const filterCell = (menu: CellContextMenu, mode: 'only' | 'exclude' | 'contains') => {
    if (mode === 'contains') {
      applyFilter(menu.columnId, { custom: { logic: 'and', first: { operator: 'contains', value: String(menu.value ?? '') } } })
    } else {
      applyFilter(menu.columnId, { selectedValues: [gridValueKey(menu.value)], selectionMode: mode === 'exclude' ? 'exclude' : 'include' })
    }
    setPage(1); setCellMenu(null)
  }
  const sortByCell = (menu: CellContextMenu, direction: 'asc' | 'desc') => {
    setSort(current => [...(current ?? []).filter(item => item.id !== menu.columnId), { id: menu.columnId, direction }])
    setPage(1); setCellMenu(null)
  }
  useEffect(() => {
    if (!cellMenu) return
    const outside = (event: PointerEvent) => { if (!cellMenuRef.current?.contains(event.target as Node)) setCellMenu(null) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setCellMenu(null) } }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true) }
  }, [cellMenu])
  useLayoutEffect(() => {
    if (!cellMenu || !cellMenuRef.current) return
    const rect = cellMenuRef.current.getBoundingClientRect()
    cellMenuRef.current.style.left = `${Math.max(8, Math.min(cellMenu.left, window.innerWidth - rect.width - 8))}px`
    cellMenuRef.current.style.top = `${Math.max(8, Math.min(cellMenu.top, window.innerHeight - rect.height - 8))}px`
  }, [cellMenu])
  return <div className="base-grid-boundary" style={appearanceStyle}>
    <div className="grid-toolbar">
      <div className="grid-title-row"><div className="grid-title-area"><h2>{fa ? 'جدول دادهٔ مصنوعی' : 'Synthetic data table'}</h2><span>{fa ? `${Math.min(total, (page - 1) * 100 + 1)} تا ${Math.min(total, page * 100)} از ${total} رکورد` : `${total ? (page - 1) * 100 + 1 : 0}–${Math.min(total, page * 100)} of ${total} records`}</span></div></div>
      <div className="grid-search-panel" style={{ order: searchOrder }}>
        <label className="grid-search-control"><input ref={searchInput} type="search" aria-label={fa ? 'جست‌وجو در دادهٔ مصنوعی' : 'Search synthetic data'} value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder={fa ? 'جست‌وجو… (F1)' : language === 'zh' ? '搜索… (F1)' : 'Search… (F1)'} /></label>
        <button type="button" className="grid-search-reverse" aria-label={fa ? `وارونه‌سازی نتیجهٔ جست‌وجو: ${reverseSearch ? 'فعال' : 'غیرفعال'}` : `Reverse search results: ${reverseSearch ? 'on' : 'off'}`} title={fa ? `وارونه‌سازی نتیجهٔ جست‌وجو: ${reverseSearch ? 'فعال' : 'غیرفعال'}` : `Reverse search results: ${reverseSearch ? 'on' : 'off'}`} aria-pressed={reverseSearch} disabled={!searchDraft.trim()} onClick={() => setReverseSearch(value => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 8.5A8.5 8.5 0 0 0 5 5.1L3 7.2M3 3.5v3.8h3.8M3.5 15.5A8.5 8.5 0 0 0 19 18.9l2-2.1m0 3.7v-3.8h-3.8"/><path d="M8 9.2h8M8 12h8M8 14.8h5"/></svg>
          <span className="grid-search-reverse-state" aria-hidden="true">{reverseSearch ? '✓' : ''}</span>
        </button>
        <div className="grid-search-options" role="group" aria-label={fa ? 'روش جست‌وجو' : 'Search mode'}>
          {(['startsWith', 'contains', 'exact'] as const).map(mode => <label key={mode}><input type="radio" name="laboratory-grid-search-mode" checked={searchMode === mode} onChange={() => setSearchMode(mode)} />{fa ? mode === 'startsWith' ? 'از ابتدای واژه یا عدد' : mode === 'contains' ? 'هر جای مقدار' : 'تطبیق کامل' : mode === 'startsWith' ? 'From word start' : mode === 'contains' ? 'Anywhere' : 'Exact match'}</label>)}
        </div>
      </div>
      <details style={{ order: columnsOrder }}><summary>{fa ? 'ستون‌ها' : 'Columns'}</summary>{columns.map(column => <label key={column.id}><input type="checkbox" checked={column.visible} onChange={() => setColumns(current => current.map(item => item.id === column.id ? { ...item, visible: !item.visible } : item))} />{column.label}</label>)}</details>
    </div>
    <div className="base-grid-table-wrap">
      <ExcelGridFilterScope key={resetRequest}>
        <table className="person-table excel-grid base-grid-table" style={{ minWidth: visible.reduce((sum, column) => sum + column.width, 0) }}>
          <thead><tr>{visible.map(column => <ExcelGridColumnHeader key={column.id} column={column} rows={filtered} locale={language} language={language} direction={fa ? 'rtl' : 'ltr'} filter={filters[column.id]} sort={sort} filterPopupFontSize={filterPopupFontSize} onSort={next => { setSort(next); setPage(1) }} loadFilterValues={remoteQuery ? query => loadFilterValues(column.id, query) : undefined} onApplyFilter={filter => { applyFilter(column.id, filter); setPage(1) }} thProps={{ className: sort?.some(item => item.id === column.id) ? 'is-sorted' : undefined }} resizer={<span className="base-grid-resizer" onPointerDown={event => resize(column.id, event)} />} />)}</tr></thead>
          <tbody>
            {remoteLoading ? <tr><td colSpan={visible.length}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : remoteError ? <tr><td colSpan={visible.length}>{remoteError}</td></tr> : filtered.length ? filtered.map((row, index) => <tr key={String((row as { id?: unknown }).id ?? index)} aria-selected={selectedRow === index} className={`${index % 2 ? 'is-alternate' : ''}${selectedRow === index ? ' is-selected' : ''}`} onClick={() => setSelectedRow(index)}>{visible.map(column => <td key={column.id} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setCellMenu({ columnId: column.id, columnLabel: column.label, value: column.value(row), left: event.clientX, top: event.clientY }) }}>{String(column.value(row) ?? '—')}</td>)}</tr>) : <tr><td colSpan={visible.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
          </tbody>
        </table>
      </ExcelGridFilterScope>
    </div>
    <div className="base-grid-pagination">
      <small className="base-grid-limit">{remoteQuery ? (fa ? 'فیلتر و مرتب‌سازی در سرور انجام می‌شود.' : 'Filtering and sorting run on the server.') : (fa ? 'فیلتر و مرتب‌سازی روی مجموعهٔ محلی انجام می‌شود.' : 'Filtering and sorting use the local dataset.')}</small>
      {remoteQuery && <div><button type="button" disabled={page <= 1 || remoteLoading} onClick={() => setPage(value => value - 1)}>{fa ? 'قبلی' : 'Previous'}</button><span>{page} / {pageCount}</span><button type="button" disabled={page >= pageCount || remoteLoading} onClick={() => setPage(value => value + 1)}>{fa ? 'بعدی' : 'Next'}</button></div>}
    </div>
    {cellMenu && createPortal(<div ref={cellMenuRef} className="base-grid-cell-context-menu" role="menu" dir={fa ? 'rtl' : 'ltr'} style={{ ...appearanceStyle, left: cellMenu.left, top: cellMenu.top }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      <strong>{cellMenu.columnLabel}: {gridValueLabel(cellMenu.value)}</strong>
      <button type="button" role="menuitem" onClick={() => filterCell(cellMenu, 'only')}>{fa ? 'فقط همین مقدار' : 'Filter to this value'}</button>
      <button type="button" role="menuitem" onClick={() => filterCell(cellMenu, 'exclude')}>{fa ? 'به‌جز همین مقدار' : 'Exclude this value'}</button>
      {cellMenu.value !== null && cellMenu.value !== undefined && String(cellMenu.value).length > 0 && <button type="button" role="menuitem" onClick={() => filterCell(cellMenu, 'contains')}>{fa ? 'شامل این متن' : 'Contains this text'}</button>}
      <button type="button" role="menuitem" onClick={() => sortByCell(cellMenu, 'asc')}>{fa ? 'مرتب‌سازی صعودی' : 'Sort ascending'}</button>
      <button type="button" role="menuitem" onClick={() => sortByCell(cellMenu, 'desc')}>{fa ? 'مرتب‌سازی نزولی' : 'Sort descending'}</button>
    </div>, document.body)}
  </div>
}
