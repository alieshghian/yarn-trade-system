import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ExcelGridColumnHeader, ExcelGridFilterScope } from './ExcelGridColumnHeader'
import { applyGridFiltersAndSort, gridRowMatchesSearch, gridValueKey, gridValueLabel, type ExcelGridColumn, type GridFilterState, type GridPage, type GridQuery, type GridSearchMode, type GridSortState, type GridValue } from './excelGrid'
import type { GridSearchPosition } from './designer'
import { VirtualPageCache, virtualQueryKey, virtualRange, VIRTUAL_PAGE_SIZE } from './virtualGrid'
import { defaultFormTheme } from './formTheme'
import { functionKeyFromEvent } from './functionKeys'

export type GridColumn<Row> = ExcelGridColumn<Row>
type GridNavigationRequest = { sequence: number, command: 'first' | 'last' | 'previous' | 'next' | 'up' | 'down' }
type Props<Row> = { rows: Row[], columns: GridColumn<Row>[], language: 'fa' | 'en' | 'zh', appearanceStyle?: CSSProperties, filterPopupFontSize?: number, remoteQuery?: (query: GridQuery, signal?: AbortSignal) => Promise<GridPage<Row>>, remoteQueryScope?: number | string, resetRequest?: number, navigationRequest?: GridNavigationRequest, gridSearchPosition?: GridSearchPosition, onRowSelectionChange?: (row: Row | null) => void, onTotalChange?: (total: number) => void }
type SelectedCell = { key: string, rowKey: string, rowIndex: number, columnId: string, columnLabel: string, value: GridValue }
type CellContextMenu = { activeCell: SelectedCell, selectedCells: SelectedCell[], left: number, top: number }

const cellSelectionKey = (rowKey: string, columnId: string) => JSON.stringify([rowKey, columnId])

// Adapter boundary: shares the same typed Excel filtering and sorting used by the Persons grid.
export function BaseFormGridBoundary<Row>({ rows, columns: initialColumns, language, appearanceStyle, filterPopupFontSize = 16, remoteQuery, remoteQueryScope, resetRequest = 0, navigationRequest, gridSearchPosition = 'right', onRowSelectionChange, onTotalChange }: Props<Row>) {
  const [columns, setColumns] = useState(() => initialColumns.map(column => ({ ...column, visible: true })))
  const [sort, setSort] = useState<GridSortState>()
  const [filters, setFilters] = useState<GridFilterState>({})
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const selectedIndex = useRef<number | null>(null)
  const pendingNavigation = useRef<{ index: number, queryKey: string } | null>(null)
  const lastNavigationSequence = useRef<number | undefined>(undefined)
  const [expanded, setExpanded] = useState(false)
  const [expandedBounds, setExpandedBounds] = useState<{ left: number, width: number } | null>(null)
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([])
  const [selectionAnchor, setSelectionAnchor] = useState<SelectedCell | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchMode, setSearchMode] = useState<GridSearchMode>('startsWith')
  const [reverseSearch, setReverseSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState<{ text: string, mode: GridSearchMode, reverse: boolean }>({ text: '', mode: 'startsWith', reverse: false })
  const [remoteCache, setRemoteCache] = useState<VirtualPageCache<Row>>()
  const [cacheRevision, setCacheRevision] = useState(0)
  const [viewport, setViewport] = useState({ top: 0, height: 200 })
  const [rowHeight, setRowHeight] = useState<number>(defaultFormTheme.rowHeight)
  const tableWrap = useRef<HTMLDivElement>(null)
  const boundary = useRef<HTMLDivElement>(null)
  const firstRow = useRef<HTMLTableRowElement>(null)
  const tableHeader = useRef<HTMLTableSectionElement>(null)
  const [cellMenu, setCellMenu] = useState<CellContextMenu | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const cellMenuRef = useRef<HTMLDivElement>(null)
  const fa = language === 'fa'
  useEffect(() => {
    const focusGridSearch = (event: KeyboardEvent) => {
      if (functionKeyFromEvent(event) !== 'F1' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return
      const visibleBoundaries = Array.from(document.querySelectorAll<HTMLElement>('.base-grid-boundary'))
        .filter(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden')
      const targetBoundary = event.target instanceof Element ? event.target.closest<HTMLElement>('.base-grid-boundary') : null
      const owner = targetBoundary && visibleBoundaries.includes(targetBoundary) ? targetBoundary : visibleBoundaries[0]
      const search = owner?.querySelector<HTMLInputElement>('.grid-search-control input[type="search"]:not(:disabled)')
      if (!search) return
      event.preventDefault()
      event.stopImmediatePropagation()
      search.focus({ preventScroll: true })
      search.setSelectionRange(0, search.value.length)
    }
    window.addEventListener('keydown', focusGridSearch, true)
    return () => window.removeEventListener('keydown', focusGridSearch, true)
  }, [])
  const visible = columns.filter(column => column.visible)
  const searchOrder = fa ? ({ right: 0, center: 1, left: 2 } as const)[gridSearchPosition] : ({ left: 0, center: 1, right: 2 } as const)[gridSearchPosition]
  const columnsOrder = fa ? 0 : 2
  useEffect(() => {
    if (!resetRequest) return
    setFilters({}); setSort([]); setSearchDraft(''); setSearchMode('startsWith'); setReverseSearch(false); setSearchQuery({ text: '', mode: 'startsWith', reverse: false })
  }, [resetRequest])
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearchQuery({ text: searchDraft.trim(), mode: searchMode, reverse: reverseSearch }) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchDraft, searchMode, reverseSearch])
  const queryKey = virtualQueryKey({ scope: remoteQueryScope, searchQuery, filters, sort: sort ?? [], language, resetRequest })
  useLayoutEffect(() => {
    if (!remoteQuery) { setRemoteCache(undefined); return }
    const cache = new VirtualPageCache<Row>(queryKey, (page, signal) => remoteQuery({ page, pageSize: VIRTUAL_PAGE_SIZE, search: searchQuery.text, searchMode: searchQuery.mode, reverseSearch: searchQuery.reverse, filters, sort: sort ?? [], language }, signal))
    const unsubscribe = cache.subscribe(() => setCacheRevision(value => value + 1))
    setRemoteCache(cache); setSelectedRow(null); setSelectedCells([]); setSelectionAnchor(null); setCellMenu(null); onRowSelectionChange?.(null)
    selectedIndex.current = null; pendingNavigation.current = null
    // A command awaiting results from the previous query must not replay here.
    lastNavigationSequence.current = navigationRequest?.sequence
    if (tableWrap.current) tableWrap.current.scrollTop = 0
    setViewport(current => ({ ...current, top: 0 }))
    return () => { unsubscribe(); cache.dispose() }
  }, [remoteQuery, queryKey, onRowSelectionChange])
  const activeCache = remoteCache?.queryKey === queryKey ? remoteCache : undefined
  const searchableRows = useMemo(() => {
    if (!searchQuery.text) return rows
    return rows.filter(row => gridRowMatchesSearch(row, columns, searchQuery.text, searchQuery.mode) !== searchQuery.reverse)
  }, [rows, columns, searchQuery])
  const filtered = useMemo(() => remoteQuery ? activeCache?.loadedRows() ?? [] : applyGridFiltersAndSort(searchableRows, columns, filters, sort, language), [remoteQuery, activeCache, cacheRevision, searchableRows, columns, filters, sort, language])
  const total = remoteQuery ? activeCache?.total ?? 0 : filtered.length
  useEffect(() => { onTotalChange?.(total) }, [onTotalChange, total])
  const range = virtualRange(remoteQuery ? activeCache?.total ?? VIRTUAL_PAGE_SIZE : total, viewport.top, viewport.height, rowHeight)
  const page = Math.floor(range.first / VIRTUAL_PAGE_SIZE) + 1
  useEffect(() => { activeCache?.setViewport(range.first, range.start, range.end) }, [activeCache, range.first, range.start, range.end, cacheRevision])
  useEffect(() => {
    if (!navigationRequest || navigationRequest.sequence === lastNavigationSequence.current || !total) return
    lastNavigationSequence.current = navigationRequest.sequence
    const anchor = pendingNavigation.current?.index ?? selectedIndex.current ?? range.first
    const step = Math.max(1, Math.floor(viewport.height / rowHeight))
    const target = { first: 0, last: total - 1, previous: anchor - step, next: anchor + step, up: anchor - 1, down: anchor + 1 }[navigationRequest.command]
    const index = Math.max(0, Math.min(total - 1, target))
    pendingNavigation.current = { index, queryKey }
    const top = index * rowHeight
    if (tableWrap.current) tableWrap.current.scrollTop = top
    setViewport(current => ({ ...current, top }))
  }, [navigationRequest, total, queryKey, range.first, viewport.height, rowHeight])
  useEffect(() => {
    const pending = pendingNavigation.current
    if (!pending || pending.queryKey !== queryKey) return
    const row = remoteQuery ? activeCache?.row(pending.index) : filtered[pending.index]
    if (!row) return
    setSelectedRow(String((row as { id?: unknown }).id ?? pending.index))
    selectedIndex.current = pending.index
    pendingNavigation.current = null
    setSelectedCells([]); setSelectionAnchor(null); setCellMenu(null)
    onRowSelectionChange?.(row)
  }, [navigationRequest, viewport.top, activeCache, cacheRevision, queryKey, remoteQuery, filtered, onRowSelectionChange])
  useLayoutEffect(() => {
    if (!remoteQuery || !tableWrap.current) return
    const wrap = tableWrap.current
    const measure = () => {
      const measured = firstRow.current?.getBoundingClientRect().height
      const nextHeight = measured && measured > 0 ? measured : rowHeight
      if (Math.abs(nextHeight - rowHeight) > .5) { wrap.scrollTop = wrap.scrollTop / rowHeight * nextHeight; setRowHeight(nextHeight) }
      const height = Math.max(1, wrap.clientHeight - (tableHeader.current?.getBoundingClientRect().height ?? 0))
      setViewport(current => current.top === wrap.scrollTop && current.height === height ? current : { top: wrap.scrollTop, height })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    if (firstRow.current) observer.observe(firstRow.current)
    if (tableHeader.current) observer.observe(tableHeader.current)
    measure()
    return () => observer.disconnect()
  }, [remoteQuery, activeCache, rowHeight, range.start, appearanceStyle])
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
  const filterSelection = (menu: CellContextMenu, mode: 'include' | 'exclude') => {
    const grouped = new Map<string, Set<string>>()
    for (const cell of menu.selectedCells) {
      const values = grouped.get(cell.columnId) ?? new Set<string>()
      values.add(gridValueKey(cell.value)); grouped.set(cell.columnId, values)
    }
    setFilters(current => {
      const next = { ...current }
      for (const [columnId, values] of grouped) next[columnId] = { selectedValues: [...values], selectionMode: mode }
      return next
    })
    setCellMenu(null)
  }
  const filterCellContains = (menu: CellContextMenu) => {
    const cell = menu.activeCell
    applyFilter(cell.columnId, { custom: { logic: 'and', first: { operator: 'contains', value: String(cell.value ?? '') } } })
    setCellMenu(null)
  }
  const sortByCell = (menu: CellContextMenu, direction: 'asc' | 'desc') => {
    setSort(current => [...(current ?? []).filter(item => item.id !== menu.activeCell.columnId), { id: menu.activeCell.columnId, direction }])
    setCellMenu(null)
  }
  const makeSelectedCell = (row: Row, rowKey: string, rowIndex: number, column: GridColumn<Row>): SelectedCell => ({ key: cellSelectionKey(rowKey, column.id), rowKey, rowIndex, columnId: column.id, columnLabel: column.label, value: column.value(row) })
  const selectCell = (cell: SelectedCell, event: ReactMouseEvent<HTMLTableCellElement>) => {
    setSelectedRow(cell.rowKey)
    setSelectedCells(current => {
      if (event.shiftKey && selectionAnchor?.columnId === cell.columnId) {
        const start = Math.min(selectionAnchor.rowIndex, cell.rowIndex), end = Math.max(selectionAnchor.rowIndex, cell.rowIndex)
        const column = visible.find(item => item.id === cell.columnId)
        if (end - start >= 500 || !column) return [cell]
        const next: SelectedCell[] = []
        for (let index = start; index <= end; index++) {
          const row = remoteQuery ? activeCache?.row(index) : filtered[index]
          if (row === undefined) return [cell]
          const rowKey = String((row as { id?: unknown }).id ?? index)
          next.push(makeSelectedCell(row, rowKey, index, column))
        }
        return next.length ? next : [cell]
      }
      if (event.ctrlKey || event.metaKey) return current.some(item => item.key === cell.key) ? current.filter(item => item.key !== cell.key) : [...current, cell]
      return [cell]
    })
    setSelectionAnchor(cell)
  }
  const openCellMenu = (cell: SelectedCell, event: ReactMouseEvent<HTMLTableCellElement>) => {
    event.preventDefault(); event.stopPropagation()
    setSelectedRow(cell.rowKey)
    const selection = selectedCells.some(item => item.key === cell.key) ? selectedCells : [cell]
    if (selection !== selectedCells) { setSelectedCells(selection); setSelectionAnchor(cell) }
    setCellMenu({ activeCell: cell, selectedCells: selection, left: event.clientX, top: event.clientY })
  }
  const copyCellsToClipboard = async (cells: SelectedCell[]) => {
    if (!cells.length) return false
    const visibleColumns = columns.filter(column => column.visible)
    const visibleColumnIds = new Set(visibleColumns.map(column => column.id))
    const visibleCells = cells.filter(cell => visibleColumnIds.has(cell.columnId))
    const cellsToCopy = visibleCells.length ? visibleCells : [cells[0]]
    const selectedColumnIds = new Set(cellsToCopy.map(cell => cell.columnId))
    const columnIndexes = visibleColumns.map((column, index) => selectedColumnIds.has(column.id) ? index : -1).filter(index => index >= 0)
    const firstColumn = Math.min(...columnIndexes), lastColumn = Math.max(...columnIndexes)
    const selectedRows = [...new Set(cellsToCopy.map(cell => cell.rowIndex))].sort((left, right) => left - right)
    const byCell = new Map(cellsToCopy.map(cell => [JSON.stringify([cell.rowIndex, cell.columnId]), cell]))
    const text = selectedRows.map(rowIndex => visibleColumns.slice(firstColumn, lastColumn + 1).map(column => {
      const cell = byCell.get(JSON.stringify([rowIndex, column.id]))
      const value = cell?.value
      return value instanceof Date ? value.toLocaleDateString() : String(value ?? '')
    }).join('\t')).join('\n')
    const fallbackText = cellsToCopy[0].value instanceof Date ? cellsToCopy[0].value.toLocaleDateString() : String(cellsToCopy[0].value ?? '')
    const clipboardText = columnIndexes.length ? text || fallbackText : fallbackText
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clipboardText)
        return true
      }
    } catch { /* Fall through to the document copy command for restricted clipboard contexts. */ }
    const activeElement = document.activeElement as HTMLElement | null
    const textarea = document.createElement('textarea')
    textarea.value = clipboardText
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.append(textarea)
    textarea.select()
    let copied = false
    try { copied = document.execCommand('copy') } catch { copied = false }
    textarea.remove()
    activeElement?.focus()
    return copied
  }
  useEffect(() => {
    const copySelectedCells = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c' || !selectedCells.length) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || !window.getSelection()?.isCollapsed) return
      event.preventDefault()
      void copyCellsToClipboard(selectedCells)
    }
    document.addEventListener('keydown', copySelectedCells, true)
    return () => document.removeEventListener('keydown', copySelectedCells, true)
  }, [selectedCells, columns])
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
  const expandLabel = fa
    ? expanded ? 'بازگشت به اندازهٔ قبلی جدول' : 'نمایش تمام‌صفحهٔ جدول'
    : language === 'zh'
      ? expanded ? '恢复表格大小' : '全屏显示表格'
      : expanded ? 'Restore table size' : 'Show table full screen'
  const toggleExpanded = () => {
    if (expanded) {
      setExpanded(false)
      setExpandedBounds(null)
      return
    }
    const formFrame = boundary.current?.closest('.laboratory-form-frame')
    const rect = formFrame?.getBoundingClientRect()
    if (rect) {
      const width = Math.min(rect.width, Math.max(320, window.innerWidth - 24))
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
      setExpandedBounds({ left, width })
    }
    setExpanded(true)
  }
  const expandedColumnsStyle: CSSProperties = { order: columnsOrder }
  const boundaryStyle: CSSProperties = { ...appearanceStyle, ...(expandedBounds ? { left: expandedBounds.left, right: 'auto', width: expandedBounds.width } : {}) }
  return <div ref={boundary} className={`base-grid-boundary${expanded ? ' is-expanded' : ''}`} style={boundaryStyle}>
    <div className="grid-toolbar">
      <button type="button" className="grid-expand-toggle" aria-label={expandLabel} aria-pressed={expanded} onClick={toggleExpanded}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {expanded
            ? <path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5" />
            : <path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5" />}
        </svg>
      </button>
      <div className="grid-title-row">
        <div className="grid-title-area"><h2>{fa ? 'جدول دادهٔ مصنوعی' : 'Synthetic data table'}</h2><span>{fa ? `${total ? range.first + 1 : 0} تا ${Math.min(total, remoteQuery ? range.last : total)} از ${total} رکورد` : `${total ? range.first + 1 : 0}–${Math.min(total, remoteQuery ? range.last : total)} of ${total} records`}</span></div>
      </div>
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
      <details style={expandedColumnsStyle}><summary>{fa ? 'ستون‌ها' : 'Columns'}</summary>{columns.map(column => <label key={column.id}><input type="checkbox" checked={column.visible} onChange={() => setColumns(current => current.map(item => item.id === column.id ? { ...item, visible: !item.visible } : item))} />{column.label}</label>)}</details>
    </div>
    <div ref={tableWrap} className={`base-grid-table-wrap${remoteQuery ? ' base-grid-virtual-wrap' : ''}`} data-virtual-metrics={activeCache ? JSON.stringify({ requests: activeCache.metrics.requests, peakConcurrent: activeCache.metrics.peakConcurrent, cachedPages: activeCache.cacheSize, loads: activeCache.metrics.completed }) : undefined} tabIndex={remoteQuery ? 0 : undefined} aria-label={fa ? 'ردیف‌های جدول' : 'Table rows'} onScroll={remoteQuery ? event => { const top = event.currentTarget.scrollTop; setViewport(current => current.top === top ? current : { ...current, top }) } : undefined}>
      <ExcelGridFilterScope key={resetRequest}>
        <table className="person-table excel-grid base-grid-table" dir={fa ? 'rtl' : 'ltr'} aria-rowcount={remoteQuery ? activeCache?.total === undefined ? -1 : total + 1 : undefined} style={{ minWidth: visible.reduce((sum, column) => sum + column.width, 0), ...(remoteQuery ? { width: '100%', tableLayout: 'fixed', '--virtual-row-height': `${rowHeight}px` } as CSSProperties : {}) }}>
          {remoteQuery && <colgroup>{visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>}
          <thead ref={tableHeader}><tr>{visible.map(column => <ExcelGridColumnHeader key={column.id} column={column} rows={filtered} locale={language} language={language} direction={fa ? 'rtl' : 'ltr'} filter={filters[column.id]} sort={sort} filterPopupFontSize={filterPopupFontSize} onSort={setSort} loadFilterValues={remoteQuery ? query => loadFilterValues(column.id, query) : undefined} onApplyFilter={filter => applyFilter(column.id, filter)} thProps={{ className: sort?.some(item => item.id === column.id) ? 'is-sorted' : undefined }} resizer={<span className="base-grid-resizer" onPointerDown={event => resize(column.id, event)} />} />)}</tr></thead>
          <tbody>
            {remoteQuery && range.start > 0 && <tr className="base-grid-virtual-spacer" aria-hidden="true"><td colSpan={visible.length} style={{ height: range.start * rowHeight }} /></tr>}
            {(remoteQuery ? Array.from({ length: range.end - range.start }, (_, offset) => ({ row: activeCache?.row(range.start + offset), index: range.start + offset })) : filtered.map((row, index) => ({ row, index }))).map(({ row, index }, offset) => {
              const rowPage = Math.floor(index / VIRTUAL_PAGE_SIZE) + 1
              const error = activeCache?.error(rowPage)
              const key = String((row as { id?: unknown } | undefined)?.id ?? index)
              return <tr ref={remoteQuery && offset === 0 ? firstRow : undefined} key={remoteQuery ? index : key} data-grid-index={remoteQuery ? index : undefined} aria-rowindex={remoteQuery ? index + 2 : undefined} aria-busy={!row || undefined} aria-selected={selectedRow === key} className={`${remoteQuery ? 'base-grid-virtual-row ' : ''}${index % 2 ? 'is-alternate' : ''}${selectedRow === key ? ' is-selected' : ''}`} onClick={row ? () => { selectedIndex.current = index; pendingNavigation.current = null; setSelectedRow(key); onRowSelectionChange?.(row) } : undefined}>
                {!row && error ? <td colSpan={visible.length} title={error}>{index === Math.max(range.start, (rowPage - 1) * VIRTUAL_PAGE_SIZE) && <button className="base-grid-page-retry" type="button" onClick={() => activeCache?.retry(rowPage)}>{fa ? 'دریافت نشد؛ تلاش مجدد' : 'Unable to load; retry'}</button>}</td> : visible.map(column => {
                  if (!row) return <td key={column.id}><span className="base-grid-row-placeholder" aria-hidden="true">…</span></td>
                  const cell = makeSelectedCell(row, key, index, column)
                  const isSelected = selectedCells.some(item => item.key === cell.key)
                  return <td key={column.id} className={isSelected ? 'is-cell-selected' : undefined} aria-selected={isSelected || undefined} title={fa ? 'برای انتخاب چند سلول Ctrl+کلیک کنید؛ با Shift+کلیک بازهٔ بارگذاری‌شدهٔ همان ستون انتخاب می‌شود.' : 'Ctrl-click to select multiple cells; Shift-click selects a loaded range in the same column.'} onClick={event => selectCell(cell, event)} onContextMenu={event => openCellMenu(cell, event)}>{String(cell.value ?? '—')}</td>
                })}
              </tr>
            })}
            {remoteQuery && range.end < (activeCache?.total ?? VIRTUAL_PAGE_SIZE) && <tr className="base-grid-virtual-spacer" aria-hidden="true"><td colSpan={visible.length} style={{ height: ((activeCache?.total ?? VIRTUAL_PAGE_SIZE) - range.end) * rowHeight }} /></tr>}
            {(remoteQuery ? activeCache?.total === 0 : filtered.length === 0) && <tr><td colSpan={visible.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
          </tbody>
        </table>
      </ExcelGridFilterScope>
    </div>
    {cellMenu && createPortal(<div ref={cellMenuRef} className="base-grid-cell-context-menu" role="menu" dir={fa ? 'rtl' : 'ltr'} style={{ ...appearanceStyle, left: cellMenu.left, top: cellMenu.top }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      <strong>{cellMenu.selectedCells.length > 1 ? (fa ? `${cellMenu.selectedCells.length} سلول انتخاب‌شده` : `${cellMenu.selectedCells.length} selected cells`) : `${cellMenu.activeCell.columnLabel}: ${gridValueLabel(cellMenu.activeCell.value)}`}</strong>
      <button type="button" role="menuitem" onClick={() => { void copyCellsToClipboard(cellMenu.selectedCells); setCellMenu(null) }}>{cellMenu.selectedCells.length > 1 ? (fa ? 'کپی سلول‌های انتخاب‌شده' : 'Copy selected cells') : (fa ? 'کپی سلول' : 'Copy cell')}</button>
      <button type="button" role="menuitem" onClick={() => filterSelection(cellMenu, 'include')}>{cellMenu.selectedCells.length > 1 ? (fa ? 'فقط مقادیر انتخاب‌شده' : 'Filter to selected values') : (fa ? 'فقط همین مقدار' : 'Filter to this value')}</button>
      <button type="button" role="menuitem" onClick={() => filterSelection(cellMenu, 'exclude')}>{cellMenu.selectedCells.length > 1 ? (fa ? 'به‌جز مقادیر انتخاب‌شده' : 'Exclude selected values') : (fa ? 'به‌جز همین مقدار' : 'Exclude this value')}</button>
      {cellMenu.selectedCells.length === 1 && cellMenu.activeCell.value !== null && cellMenu.activeCell.value !== undefined && String(cellMenu.activeCell.value).length > 0 && <button type="button" role="menuitem" onClick={() => filterCellContains(cellMenu)}>{fa ? 'شامل این متن' : 'Contains this text'}</button>}
      <button type="button" role="menuitem" onClick={() => sortByCell(cellMenu, 'asc')}>{fa ? 'مرتب‌سازی صعودی' : 'Sort ascending'}</button>
      <button type="button" role="menuitem" onClick={() => sortByCell(cellMenu, 'desc')}>{fa ? 'مرتب‌سازی نزولی' : 'Sort descending'}</button>
    </div>, document.body)}
  </div>
}
