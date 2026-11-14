import {useDefinitionRowSelection} from './useDefinitionRowSelection'
import {designerResizeHandles} from './designer'
import { fitToolbarPanel } from './toolbarLayoutContract'
import { toolbarPartStyle, toolbarPanels, toolbarPartLabel, beginToolbarMove, toolbarMoveKey, toolbarPartLabels, updateToolbarSelectionFrames, type GridToolbarSettings, type GridToolbarPart, type GridToolbarPartStyle } from './gridToolbarLayout'
import { Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ExcelGridColumnHeader, ExcelGridFilterScope } from './ExcelGridColumnHeader'
import { gridDisplayValue, reconcileGridColumns, resizedGridColumnWidth, applyGridFiltersAndSort, gridRowMatchesSearch, gridValueKey, gridValueLabel, type ExcelGridColumn, type GridFilterState, type GridPage, type GridQuery, type GridSearchMode, type GridSortState, type GridValue } from './excelGrid'
import type { GridSearchPosition } from './designer'
import { VirtualPageCache, virtualQueryKey, virtualRange, VIRTUAL_PAGE_SIZE } from './virtualGrid'
import { defaultFormTheme } from './formTheme'
import { functionKeyFromEvent } from './functionKeys'
import operationalBehavior from './laboratoryOperationalBehavior.json'
import { OperationalGridCustomizationContext } from './operationalGridCustomization'
import { downloadGridWorkbook } from './exportGridWorkbook'
import './baseFormGridActions.css'

export type GridColumn<Row> = ExcelGridColumn<Row>
type GridNavigationRequest = { sequence: number, command: 'first' | 'last' | 'previous' | 'next' | 'up' | 'down' }
type GridTypography = { textAlign?:'start'|'center'|'end'|'left'|'right'; verticalTextAlign?:'top'|'center'|'bottom'; bold?: boolean; italic?: boolean; underline?: 'single' | 'double'; strikeThrough?: boolean; script?: 'superscript' | 'subscript'; textColor?: string; backgroundColor?: string; borderColor?: string; fontFamily?: string; fontSize?: number }
export type BaseFormGridBoundaryProps<Row> = { autoSelectFirstRow?:boolean, fillViewport?: boolean, rows: Row[], columns: GridColumn<Row>[], language: 'fa' | 'en' | 'zh', title?: string, gridId?: string, columnPreferencesStorageKey?: string, headerContent?:Partial<Record<GridToolbarPart,React.ReactNode>>, toolbarSettings?: GridToolbarSettings, designerToolbarSelection?: readonly GridToolbarPart[], onDesignerToolbarSelect?: (part:GridToolbarPart,toggle:boolean)=>void, onDesignerToolbarContextMenu?: (part:GridToolbarPart,x:number,y:number)=>void, onDesignerToolbarChange?: (part: GridToolbarPart, patch: GridToolbarPartStyle, related?:GridToolbarSettings) => void, appearanceStyle?: CSSProperties, filterPopupFontSize?: number, remoteQuery?: (query: GridQuery, signal?: AbortSignal) => Promise<GridPage<Row>>, remoteQueryScope?: number | string, resetRequest?: number, selectedRowId?: string | null, navigationRequest?: GridNavigationRequest, gridSearchPosition?: GridSearchPosition, designerMode?: boolean, readOnly?: boolean, designerHeaderHeight?: number, onDesignerHeaderHeightChange?: (height: number, phase: 'start' | 'change' | 'end') => void, onDesignerColumnWidthChange?: (columnId: string, width: number) => void, onDesignerColumnOrderChange?: (sourceColumnId: string, targetColumnId: string, position: 'before' | 'after') => void, designerColumnStyles?: Record<string, GridTypography>, designerHeaderStyles?: Record<string, GridTypography>, designerSelectedColumnIds?: string[], onDesignerColumnSelect?: (columnId: string, toggle: boolean) => void, onDesignerContextMenu?: (target: 'header' | 'row' | 'search', columnId: string | undefined, left: number, top: number, additive?: boolean) => void, onRowSelectionChange?: (row: Row | null) => void, onRowDoubleClick?: (row: Row) => void, onTotalChange?: (total: number) => void, onBulkDelete?:(rows:Row[])=>Promise<void>, bulkDeleteConfirm?:(count:number)=>string }
type SelectedCell = { key: string, rowKey: string, rowIndex: number, columnId: string, columnLabel: string, value: GridValue }
type CellContextMenu = { activeCell: SelectedCell, selectedCells: SelectedCell[], left: number, top: number }

const cellSelectionKey = (rowKey: string, columnId: string) => JSON.stringify([rowKey, columnId])
const gridFontFamily = (font: string) => ({ inherit: 'inherit', vazirmatn: "'Vazirmatn',Tahoma,Arial,sans-serif", tahoma: 'Tahoma,Arial,sans-serif', segoe: "'Segoe UI',Tahoma,sans-serif", arial: 'Arial,sans-serif', naskh: "'Noto Naskh Arabic','B Nazanin',serif", aptos: 'Aptos,Arial,sans-serif', calibri: 'Calibri,Arial,sans-serif', cambria: 'Cambria,serif', consolas: 'Consolas,monospace', courier: "'Courier New',monospace", georgia: 'Georgia,serif', times: "'Times New Roman',serif", verdana: 'Verdana,sans-serif' }[font] ?? 'inherit')

// Adapter boundary: shares the same typed Excel filtering and sorting used by the Persons grid.
export function BaseFormGridBoundary<Row>({ autoSelectFirstRow=false, fillViewport = false, rows, columns: initialColumns, language, title, gridId, columnPreferencesStorageKey, headerContent, toolbarSettings = {}, onDesignerToolbarChange, designerToolbarSelection=[], onDesignerToolbarSelect, onDesignerToolbarContextMenu, appearanceStyle, filterPopupFontSize = 16, remoteQuery, remoteQueryScope, resetRequest = 0, selectedRowId, navigationRequest, gridSearchPosition = 'right', designerMode = false, readOnly = false, designerHeaderHeight = 42, onDesignerHeaderHeightChange, onDesignerColumnWidthChange, onDesignerColumnOrderChange, designerColumnStyles, designerHeaderStyles, designerSelectedColumnIds = [], onDesignerColumnSelect, onDesignerContextMenu, onRowSelectionChange, onRowDoubleClick, onTotalChange, onBulkDelete, bulkDeleteConfirm }: BaseFormGridBoundaryProps<Row>) {
  const personalGrid = useContext(OperationalGridCustomizationContext)
  const personalGridId = gridId ?? title ?? 'main'
  const personalLayout = personalGrid?.layouts[personalGridId]
  const personalLayoutKey = JSON.stringify(personalLayout ?? {})
  const operationalResizeAllowed = Boolean(personalGrid?.canResize && (!readOnly || personalGrid.settingsOpen))
  const resizeHeader = designerMode || operationalResizeAllowed
  const radioGroupId = useId().replaceAll(':', '')
  const [columnState, setColumns] = useState(() => {
    let saved: { id?: string; key?: string; width?: number; visible?: boolean }[] = []
    try { const value = JSON.parse(columnPreferencesStorageKey ? localStorage.getItem(columnPreferencesStorageKey) ?? '[]' : '[]'); if (Array.isArray(value)) saved = value } catch { /* Use the schema's initial grid columns. */ }
    return initialColumns.map(column => {
      const preference = saved.find(item => (item.id ?? item.key) === column.id)
      return { ...column, width: personalLayout?.columnWidths?.[column.id] ?? preference?.width ?? column.width, visible: preference?.visible ?? true }
    })
  })
  const initialColumnWidths = useRef(Object.fromEntries(initialColumns.flatMap(column => column.width === undefined ? [] : [[column.id, column.width]])) as Record<string, number>)
  useEffect(() => {
    if (!columnPreferencesStorageKey) return
    try { localStorage.setItem(columnPreferencesStorageKey, JSON.stringify(columnState.map(({ id, width, visible }) => ({ id, width, visible })))) } catch { /* Keep the in-memory grid usable when storage is unavailable. */ }
  }, [columnPreferencesStorageKey, columnState])
  const previousColumnSchema = useRef(initialColumns)
  // Value adapters must match the current rows in the very first render when
  // switching datasets. Keep user widths/visibility without remounting the grid.
  const columns=useMemo(()=>designerMode||readOnly?reconcileGridColumns(initialColumns,columnState,previousColumnSchema.current):columnState.map(column=>({...column,value:initialColumns.find(item=>item.id===column.id)?.value??column.value})),[initialColumns,columnState,designerMode,readOnly])
  useLayoutEffect(() => {
    if (!designerMode && !readOnly) return
    const previous = previousColumnSchema.current
    previousColumnSchema.current = initialColumns
    setColumns(current => reconcileGridColumns(initialColumns, current, previous))
  }, [initialColumns, designerMode, readOnly])
  useLayoutEffect(() => {
    if (!personalGrid) return
    const widths = personalGrid.layouts[personalGridId]?.columnWidths ?? {}
    setColumns(current => current.map(column => {
      const width = widths[column.id] ?? initialColumnWidths.current[column.id]
      return width === undefined || width === column.width ? column : { ...column, width }
    }))
  }, [personalLayoutKey, personalGridId])
  const [sort, setSort] = useState<GridSortState>()
  const [filters, setFilters] = useState<GridFilterState>({})
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  useLayoutEffect(() => { if (selectedRowId !== undefined) setSelectedRow(selectedRowId) }, [selectedRowId])
  const selectedIndex = useRef<number | null>(null)
  const pendingNavigation = useRef<{ index: number, queryKey: string } | null>(null)
  const lastNavigationSequence = useRef<number | undefined>(undefined)
  const columnDetails=useRef<HTMLDetailsElement>(null)
  const [columnPopup,setColumnPopup]=useState<{left:number;top:number;maxHeight:number}|null>(null)
  const columnPopupRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(!columnPopup)return;const close=()=>{if(columnDetails.current)columnDetails.current.open=false;setColumnPopup(null)};const outside=(event:PointerEvent)=>{if(!columnDetails.current?.contains(event.target as Node)&&!columnPopupRef.current?.contains(event.target as Node))close()};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();close()}};window.addEventListener('pointerdown',outside);window.addEventListener('keydown',key,true);window.addEventListener('resize',close);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',close)}},[columnPopup])
  const [expanded, setExpanded] = useState(false)
  const [expandedBounds, setExpandedBounds] = useState<{ left: number, width: number } | null>(null)
  const [localNavigation, setLocalNavigation] = useState(0)
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
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
  const headerHeightDrag = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  const columnOrderDrag = useRef<{ pointerId: number; sourceId: string; startX: number; startY: number; active: boolean; target?: { id: string; position: 'before' | 'after' } } | null>(null)
  const columnOrderCleanup = useRef<(() => void) | null>(null)
  const [cellMenu, setCellMenu] = useState<CellContextMenu | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const cellMenuRef = useRef<HTMLDivElement>(null)
  const fa = language === 'fa'
  const tableRtl = operationalBehavior.table.rtlLanguages.includes(language)
  const presentationStyles = designerMode || readOnly
  const columnResizeScroll=useRef<{offset:number;negative:boolean}|null>(null)
  useLayoutEffect(() => { const wrap=tableWrap.current;if(wrap&&operationalBehavior.table.initialScroll==='logical-start'){const negative=getComputedStyle(wrap).direction==='rtl';wrap.scrollLeft=tableRtl&&!negative?Math.max(0,wrap.scrollWidth-wrap.clientWidth):0} }, [tableRtl,Boolean(remoteQuery)])
  useEffect(() => { if (designerMode || readOnly) setCellMenu(null) }, [designerMode, readOnly])
  useEffect(() => {
    const focusGridSearch = (event: KeyboardEvent) => {
      if (readOnly || functionKeyFromEvent(event) !== 'F1' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return
      // A focused hierarchy column owns F1; the grid must not steal its search.
      if (event.target instanceof Element && event.target.closest('.cascading-tree-panels [data-tree-depth]')) return
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
  }, [readOnly])
  const visible = columns.filter(column => column.visible)
  const visibleWidths=visible.map(column=>column.id+':'+column.width).join('|')
  useLayoutEffect(()=>{
    const wrap=tableWrap.current,anchor=columnResizeScroll.current
    if(!wrap||!anchor)return
    const max=Math.max(0,wrap.scrollWidth-wrap.clientWidth),offset=Math.min(max,anchor.offset)
    wrap.scrollLeft=tableRtl?(anchor.negative?-offset:max-offset):(anchor.negative?offset-max:offset)
  },[visibleWidths,tableRtl])
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
    setRemoteCache(cache); setSelectedRow(selectedRowId??null); setSelectedCells([]); setSelectionAnchor(null); setCellMenu(null); onRowSelectionChange?.(null)
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
  const bulk=useDefinitionRowSelection<{id:string;record:Row}>({
    enabled:Boolean(onBulkDelete)&&!readOnly&&!designerMode,scope:queryKey,confirmText:bulkDeleteConfirm,
    onDelete:async selected=>{await onBulkDelete?.(selected.map(item=>item.record))},
    range:async(start,end,signal)=>{
      const result:{id:string;record:Row}[]=[]
      for(let index=start;index<=end;){
        if(signal.aborted)throw Error('انتخاب لغو شد.')
        const page=Math.floor(index/VIRTUAL_PAGE_SIZE)+1
        const items=remoteQuery?(await remoteQuery({page,pageSize:VIRTUAL_PAGE_SIZE,search:searchQuery.text,searchMode:searchQuery.mode,reverseSearch:searchQuery.reverse,filters,sort:sort??[],language},signal)).items:filtered
        const offset=remoteQuery?(page-1)*VIRTUAL_PAGE_SIZE:0,limit=remoteQuery?Math.min(end,page*VIRTUAL_PAGE_SIZE-1):end
        for(;index<=limit;index++){const row=items[index-offset],id=(row as {id?:string}|undefined)?.id;if(!row||!id)throw Error('شناسهٔ ردیف دریافت نشد؛ دوباره انتخاب کنید.');result.push({id,record:row})}
      }
      return result
    }
  })
  async function deleteGridSelection(){
    if(!onBulkDelete||readOnly||designerMode||bulk.busy||pendingNavigation.current)return
    if(!bulk.selection.size){
      const candidates=remoteQuery?activeCache?.loadedRows()??[]:filtered
      const row=candidates.find((item,index)=>String((item as {id?:unknown}).id??index)===selectedRow)
      if(!row)return
      await bulk.select({id:String((row as {id:unknown}).id),record:row},selectedIndex.current??0,{ctrlKey:false,metaKey:false,shiftKey:false})
    }
    await bulk.remove()
  }
  const total = remoteQuery ? activeCache?.total ?? 0 : filtered.length
  useEffect(() => { onTotalChange?.(total) }, [onTotalChange, total])
  const range = virtualRange(remoteQuery ? activeCache?.total ?? VIRTUAL_PAGE_SIZE : total, viewport.top, viewport.height, rowHeight)
  useEffect(()=>{
    if(!autoSelectFirstRow||readOnly||designerMode||selectedRow||selectedRowId||pendingNavigation.current||!onRowSelectionChange)return
    const row=remoteQuery?activeCache?.row(0):filtered[0]
    if(!row)return
    const id=String((row as {id?:unknown}).id??0);setSelectedRow(id);selectedIndex.current=0;onRowSelectionChange(row)
  },[autoSelectFirstRow,readOnly,designerMode,selectedRow,selectedRowId,remoteQuery,activeCache,cacheRevision,filtered,onRowSelectionChange])
  const page = Math.floor(range.first / VIRTUAL_PAGE_SIZE) + 1
  const revealNavigationRow = useCallback((index: number) => {
    const wrap = tableWrap.current
    if (!wrap) return
    const viewportRect = wrap.getBoundingClientRect()
    const viewportTop = viewportRect.top + wrap.clientTop
    const headerBottom = tableHeader.current?.getBoundingClientRect().bottom ?? viewportTop
    const top = Math.max(viewportTop, Math.min(headerBottom, viewportTop + wrap.clientHeight))
    const bottom = viewportTop + wrap.clientHeight
    const row = wrap.querySelector<HTMLElement>(`tbody tr[data-row-index="${index}"]`)
    const rect = row?.getBoundingClientRect()
    const bodyTop = wrap.querySelector('tbody')?.getBoundingClientRect().top ?? viewportTop
    const rowTop = rect?.top ?? bodyTop + index * rowHeight
    const rowBottom = rect?.bottom ?? rowTop + rowHeight
    const delta = rowTop < top ? rowTop - top : rowBottom > bottom ? rowBottom - bottom : 0
    if (delta) wrap.scrollTop += delta
    if (remoteQuery) setViewport(current => current.top === wrap.scrollTop ? current : { ...current, top: wrap.scrollTop })
  }, [remoteQuery, rowHeight])
  useEffect(() => { activeCache?.setViewport(range.first, range.start, range.end) }, [activeCache, range.first, range.start, range.end, cacheRevision])
  useEffect(()=>{
    if(!selectedRowId||pendingNavigation.current)return
    const index=remoteQuery?Array.from({length:range.end-range.start},(_,offset)=>range.start+offset).find(index=>String((activeCache?.row(index) as {id?:unknown}|undefined)?.id??'')===selectedRowId):filtered.findIndex(row=>String((row as {id?:unknown}).id??'')===selectedRowId)
    if(index===undefined||index<0)return
    selectedIndex.current=index;revealNavigationRow(index)
  },[selectedRowId,activeCache,cacheRevision,remoteQuery,filtered,revealNavigationRow])
  useEffect(() => {
    if (!navigationRequest || navigationRequest.sequence === lastNavigationSequence.current || !total) return
    lastNavigationSequence.current = navigationRequest.sequence
    const anchor = pendingNavigation.current?.index ?? selectedIndex.current ?? range.first
    const step = Math.max(1, Math.floor(viewport.height / rowHeight))
    const target = { first: 0, last: total - 1, previous: anchor - step, next: anchor + step, up: anchor - 1, down: anchor + 1 }[navigationRequest.command]
    const index = Math.max(0, Math.min(total - 1, target))
    pendingNavigation.current = { index, queryKey }
    revealNavigationRow(index)
    setLocalNavigation(current => current + 1)
  }, [navigationRequest, total, queryKey, range.first, viewport.height, rowHeight, revealNavigationRow])
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
    revealNavigationRow(pending.index)
  }, [navigationRequest, localNavigation, viewport.top, activeCache, cacheRevision, queryKey, remoteQuery, filtered, onRowSelectionChange, revealNavigationRow])
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
  const selectAllVisibleGridCells = () => {
    const first = range.start, last = Math.min(range.end, remoteQuery ? activeCache?.total ?? 0 : filtered.length)
    const next: SelectedCell[] = []
    for (let index = first; index < last; index++) {
      const row = remoteQuery ? activeCache?.row(index) : filtered[index]
      if (!row) continue
      const rowKey = String((row as { id?: unknown }).id ?? index)
      for (const column of visible) next.push(makeSelectedCell(row, rowKey, index, column))
    }
    setSelectedCells(next); setSelectionAnchor(next[0] ?? null)
    if (next[0]) setSelectedRow(next[0].rowKey)
  }
  const exportGrid = async () => {
    if (exporting) return
    setExporting(true); setExportStatus('')
    try {
      let exportRows = filtered
      if (remoteQuery) {
        exportRows = []
        let expected = activeCache?.total ?? 0
        for (let currentPage = 1, guard = 0; guard < 100000; currentPage++, guard++) {
          const result = await remoteQuery({ page: currentPage, pageSize: VIRTUAL_PAGE_SIZE, search: searchQuery.text, searchMode: searchQuery.mode, reverseSearch: searchQuery.reverse, filters, sort: sort ?? [], language })
          exportRows.push(...result.items)
          expected = result.total
          if (!result.items.length || exportRows.length >= expected) break
        }
      }
      downloadGridWorkbook({ title: title ?? (fa ? 'جدول داده' : 'Table data'), language, columns: visible, rows: exportRows })
      setExportStatus(fa ? 'فایل اکسل آماده شد.' : language === 'zh' ? 'Excel 文件已生成。' : 'Excel file created.')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : (fa ? 'خروجی اکسل انجام نشد.' : 'Excel export failed.'))
    } finally { setExporting(false) }
  }
  const resize = (id: string, event: ReactPointerEvent<HTMLSpanElement>) => {
    const start = event.clientX, width = columns.find(column => column.id === id)?.width
    if (width === undefined || event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    const wrap=tableWrap.current
    if(wrap){const max=Math.max(0,wrap.scrollWidth-wrap.clientWidth),negative=getComputedStyle(wrap).direction==='rtl';columnResizeScroll.current={negative,offset:Math.max(0,tableRtl?(negative?-wrap.scrollLeft:max-wrap.scrollLeft):(negative?max+wrap.scrollLeft:wrap.scrollLeft))}}
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some embedded browsers. */ }
    let nextWidth = width
    const move = (next: PointerEvent) => {
      nextWidth = resizedGridColumnWidth(width, start, next.clientX, tableRtl ? 'rtl' : 'ltr')
      setColumns(current => current.map(column => column.id === id ? { ...column, width: nextWidth } : column))
    }
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end)
      if (designerMode && nextWidth !== width) onDesignerColumnWidthChange?.(id, nextWidth)
      else if (operationalResizeAllowed && nextWidth !== width) personalGrid?.updateLayout(personalGridId, { columnWidths: { [id]: nextWidth } })
      requestAnimationFrame(()=>{columnResizeScroll.current=null})
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
  }
  const startColumnOrderDrag = useCallback((sourceId: string, event: PointerEvent) => {
    if (!designerMode || !onDesignerColumnOrderChange || event.button !== 0) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('.base-grid-resizer,.header-height-handle,.excel-filter-trigger')) return
    const sourceHeader = target?.closest<HTMLTableCellElement>('th[data-column]')
    if (!sourceHeader || sourceHeader.dataset.column !== sourceId || event.clientY >= sourceHeader.getBoundingClientRect().bottom - 7) return
    columnOrderCleanup.current?.()
    const drag = { pointerId: event.pointerId, sourceId, startX: event.clientX, startY: event.clientY, active: false as boolean, target: undefined as { id: string; position: 'before' | 'after' } | undefined }
    columnOrderDrag.current = drag
    const header = tableHeader.current
    const table = header?.closest('table')
    let dragGhost: HTMLDivElement | undefined
    document.body.classList.add('is-designer-column-grab-pressed')
    const clearDropIndicator = () => header?.querySelectorAll('.is-designer-column-drop-before,.is-designer-column-drop-after').forEach(element => element.classList.remove('is-designer-column-drop-before', 'is-designer-column-drop-after'))
    const move = (next: PointerEvent) => {
      if (next.pointerId !== drag.pointerId) return
      if (!drag.active) {
        if (Math.hypot(next.clientX - drag.startX, next.clientY - drag.startY) < 6) return
        drag.active = true
        table?.classList.add('is-column-reordering')
        sourceHeader.classList.add('is-designer-column-dragging')
        dragGhost = document.createElement('div')
        dragGhost.className = 'designer-column-drag-ghost'
        dragGhost.dir = fa ? 'rtl' : 'ltr'
        dragGhost.setAttribute('aria-hidden', 'true')
        const title = document.createElement('span')
        title.className = 'designer-column-drag-ghost-title'
        title.textContent = sourceHeader.querySelector('.column-title')?.textContent?.trim() || sourceId
        const hint = document.createElement('small')
        hint.className = 'designer-column-drag-ghost-hint'
        hint.textContent = fa ? 'برای جابه‌جایی رها کنید' : language === 'zh' ? '松开以移动列' : 'Release to move column'
        dragGhost.append(title, hint)
        document.body.append(dragGhost)
      }
      next.preventDefault()
      if (dragGhost) {
        dragGhost.style.left = `${Math.max(8, Math.min(next.clientX + 16, window.innerWidth - dragGhost.offsetWidth - 8))}px`
        dragGhost.style.top = `${Math.max(8, Math.min(next.clientY + 16, window.innerHeight - dragGhost.offsetHeight - 8))}px`
      }
      clearDropIndicator()
      const dropHeader = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLTableCellElement>('th[data-column]')
      const targetId = dropHeader?.dataset.column
      if (!dropHeader || !targetId || targetId === sourceId || !header?.contains(dropHeader)) { drag.target = undefined; return }
      const rect = dropHeader.getBoundingClientRect()
      const before = fa ? next.clientX > rect.left + rect.width / 2 : next.clientX < rect.left + rect.width / 2
      const position = before ? 'before' : 'after'
      drag.target = { id: targetId, position }
      dropHeader.classList.add(position === 'before' ? 'is-designer-column-drop-before' : 'is-designer-column-drop-after')
    }
    const clear = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      table?.classList.remove('is-column-reordering')
      document.body.classList.remove('is-designer-column-grab-pressed')
      dragGhost?.remove()
      dragGhost = undefined
      header?.querySelectorAll('.is-designer-column-dragging,.is-designer-column-drop-before,.is-designer-column-drop-after').forEach(element => element.classList.remove('is-designer-column-dragging', 'is-designer-column-drop-before', 'is-designer-column-drop-after'))
      columnOrderCleanup.current = null
    }
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== drag.pointerId) return
      move(next)
      const result = drag.target
      clear()
      columnOrderDrag.current = null
      if (drag.active && result) onDesignerColumnOrderChange(sourceId, result.id, result.position)
    }
    const cancel = (next: PointerEvent) => {
      if (next.pointerId !== drag.pointerId) return
      clear()
      columnOrderDrag.current = null
    }
    columnOrderCleanup.current = () => { clear(); columnOrderDrag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }, [designerMode, fa, language, onDesignerColumnOrderChange])
  useEffect(() => {
    if (!designerMode || !onDesignerColumnOrderChange || !tableHeader.current) return
    const header = tableHeader.current
    const begin = (event: PointerEvent) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLTableCellElement>('th[data-column]') : null
      const id = target?.dataset.column
      if (id) startColumnOrderDrag(id, event)
    }
    header.addEventListener('pointerdown', begin, true)
    return () => header.removeEventListener('pointerdown', begin, true)
  }, [designerMode, onDesignerColumnOrderChange, startColumnOrderDrag])
  useEffect(() => () => { columnOrderCleanup.current?.() }, [])
  const startHeaderHeightResize = (event: ReactPointerEvent<HTMLElement>) => {
    // Cells are sticky, but their thead scrolls out of view. Measure the
    // visible cell or a filter/sort click is mistaken for an edge resize.
    const target = event.target instanceof Element ? event.target : null
    const rect = (target?.closest('th') ?? event.currentTarget).getBoundingClientRect()
    if (!resizeHeader || event.button !== 0 || (!target?.closest('.header-height-handle') && (event.clientY < rect.bottom - 7 || event.clientY > rect.bottom + 3))) return
    event.preventDefault(); event.stopPropagation()
    headerHeightDrag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: operationalResizeAllowed && !designerMode ? personalLayout?.headerHeight ?? designerHeaderHeight : designerHeaderHeight }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in embedded browsers. */ }
    if (designerMode) onDesignerHeaderHeightChange?.(designerHeaderHeight, 'start')
  }
  const moveHeaderHeightResize = (event: ReactPointerEvent<HTMLTableSectionElement>) => {
    const drag = headerHeightDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const height = Math.max(28, Math.min(120, drag.startHeight + event.clientY - drag.startY))
    if (designerMode) onDesignerHeaderHeightChange?.(height, 'change')
    else if (operationalResizeAllowed) personalGrid?.updateLayout(personalGridId, { headerHeight: height })
  }
  const endHeaderHeightResize = (event: ReactPointerEvent<HTMLTableSectionElement>) => {
    const drag = headerHeightDrag.current
    if (drag?.pointerId !== event.pointerId) return
    headerHeightDrag.current = null
    if (designerMode) onDesignerHeaderHeightChange?.(designerHeaderHeight, 'end')
  }
  const handleDesignerHeaderKeys = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (!resizeHeader) return
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation()
      const height = Math.max(28, Math.min(120, (personalLayout?.headerHeight ?? designerHeaderHeight) + (event.key === 'ArrowUp' ? -2 : 2)))
      if (designerMode) onDesignerHeaderHeightChange?.(height, 'change')
      else if (operationalResizeAllowed) personalGrid?.updateLayout(personalGridId, { headerHeight: height })
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const columnId = (event.target as HTMLElement).closest<HTMLElement>('[data-column]')?.dataset.column ?? designerSelectedColumnIds.at(-1)
      if (!columnId) return
      event.preventDefault(); event.stopPropagation()
      const width = Math.max(80, Math.min(1200, (columns.find(column => column.id === columnId)?.width ?? 80) + (event.key === 'ArrowRight' ? 8 : -8)))
      setColumns(current => current.map(column => column.id === columnId ? { ...column, width } : column))
      if (!designerMode && operationalResizeAllowed) personalGrid?.updateLayout(personalGridId, { columnWidths: { [columnId]: width } })
    }
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
    const current = selectedCells
    const selection = (() => {
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
    })()
    setSelectedCells(selection)
    setSelectionAnchor(cell)
    return selection
  }
  const openCellMenu = (cell: SelectedCell, event: ReactMouseEvent<HTMLTableCellElement>) => {
    event.preventDefault(); event.stopPropagation()
    if (designerMode) { setCellMenu(null); onDesignerContextMenu?.('row', cell.columnId, event.clientX, event.clientY); return }
    setSelectedRow(cell.rowKey)
    selectedIndex.current = cell.rowIndex; pendingNavigation.current = null
    const selection = event.ctrlKey || event.metaKey || event.shiftKey ? selectCell(cell, event) : selectedCells.some(item => item.key === cell.key) ? selectedCells : [cell]
    if (selection !== selectedCells) { setSelectedCells(selection); setSelectionAnchor(cell) }
    setCellMenu({ activeCell: cell, selectedCells: selection, left: event.clientX, top: event.clientY })
  }
  const copyCellsToClipboard = async (cells: SelectedCell[]) => {
    if (!cells.length) return false
    const visibleColumns = columns.filter(column => designerMode && readOnly || column.visible)
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
    ? expanded ? 'کوچک کردن فرم' : 'بزرگ کردن فرم'
    : language === 'zh'
      ? expanded ? '缩小表单' : '放大表单'
      : expanded ? 'Shrink form' : 'Expand form'
  const exportLabel = fa ? 'خروجی اکسل' : language === 'zh' ? '导出 Excel' : 'Excel export'
  const columnsLabel = fa ? 'ستون‌ها' : language === 'zh' ? '列' : 'Columns'
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
  const boundaryStyle: CSSProperties = { ...appearanceStyle, ...({'--grid-header-height':(operationalResizeAllowed&&!designerMode?personalLayout?.headerHeight??designerHeaderHeight:designerHeaderHeight)+'px'} as CSSProperties), ...(expandedBounds ? { left: expandedBounds.left, right: 'auto', width: expandedBounds.width } : {}) }
  const toolbarLayoutKey=JSON.stringify(toolbarSettings)
  useLayoutEffect(()=>{
    const panels=boundary.current?.querySelectorAll<HTMLElement>('.grid-toolbar');if(!panels)return
    const update=(node:HTMLElement)=>{if(!node.isConnected||!node.getClientRects().length||node.dataset.toolbarGesture)return;const compact=String(node.clientWidth<720);if(node.dataset.toolbarCompact!==compact)node.dataset.toolbarCompact=compact;fitToolbarPanel(node,toolbarSettings);if(boundary.current)updateToolbarSelectionFrames(boundary.current)}
    let frame=0
    const pending=new Set<HTMLElement>()
    const observer=new ResizeObserver(entries=>{for(const entry of entries){const panel=(entry.target as HTMLElement).closest<HTMLElement>('.grid-toolbar');if(panel)pending.add(panel)}if(!frame)frame=requestAnimationFrame(()=>{frame=0;for(const panel of pending)update(panel);pending.clear()})})
    for(const node of panels){update(node);observer.observe(node);for(const content of node.querySelectorAll('[data-toolbar-part],.grid-toolbar-field-content'))observer.observe(content)}
    return ()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame)}
  },[toolbarLayoutKey,title,total,language,headerContent])
  const selected = (part:GridToolbarPart) => designerMode && designerToolbarSelection.includes(part)
  useLayoutEffect(()=>{if(boundary.current)updateToolbarSelectionFrames(boundary.current)},[designerMode,designerToolbarSelection.join('|'),toolbarLayoutKey,title,total,language,headerContent])
  const toolProps = (part:GridToolbarPart, selectable=true) => {
    return {
    'data-designer-tool-selected':selected(part)||undefined,
    tabIndex:designerMode&&selectable?0:undefined,
    onClickCapture:designerMode&&selectable?(event:ReactMouseEvent<HTMLElement>)=>{const target=event.target as Element,root=event.currentTarget.closest<HTMLElement>('.base-grid-boundary');if(target.closest('.grid-toolbar-fixed-control')||target.closest('.laboratory-form-grid')||target.closest('.designer-edge-handle,.grid-tool-move-handle')||target.closest('[data-toolbar-part]')!==event.currentTarget)return;if(root?.dataset.toolbarDragClickPart===part){delete root.dataset.toolbarDragClickPart;return}const pointerModifier=event.currentTarget.dataset.toolbarPointerModifier;delete event.currentTarget.dataset.toolbarPointerModifier;const modified=event.ctrlKey||event.metaKey||pointerModifier==='multi';if(modified){if(event.detail===0&&pointerModifier!=='multi')onDesignerToolbarSelect?.(part,true);return}if(!selected(part)||designerToolbarSelection.length!==1||designerToolbarSelection[0]!==part)onDesignerToolbarSelect?.(part,false)}:undefined,
    onPointerDown:designerMode&&selectable?(event:React.PointerEvent<HTMLElement>)=>{if(event.button!==0)return;if((event.target as Element).closest('.grid-toolbar-fixed-control')||(event.target as Element).closest('.laboratory-form-grid')||(event.target as Element).closest('[data-toolbar-part]')!==event.currentTarget)return;if((event.target as Element).closest('.designer-edge-handle,.grid-tool-move-handle'))return;const current=event.currentTarget,modified=event.ctrlKey||event.metaKey;current.dataset.toolbarPointerModifier=modified?'multi':'single';const marker=current.dataset.toolbarPointerModifier;window.setTimeout(()=>{if(current.dataset.toolbarPointerModifier===marker)delete current.dataset.toolbarPointerModifier},750);const isSelected=selected(part);if(modified&&isSelected){event.preventDefault();event.stopPropagation();onDesignerToolbarSelect?.(part,true);return}const moveSelection=modified?[...designerToolbarSelection,part]:isSelected?designerToolbarSelection:[part];if(modified||!isSelected)onDesignerToolbarSelect?.(part,modified);beginToolbarMove(event,part,toolbarSettings[part],onDesignerToolbarChange,moveSelection,toolbarSettings)}:undefined,
    onKeyDown:designerMode&&selectable?(event:React.KeyboardEvent<HTMLElement>)=>{if(event.target!==event.currentTarget)return;toolbarMoveKey(event,part,toolbarSettings[part],onDesignerToolbarChange,designerToolbarSelection,toolbarSettings)}:undefined,
    onContextMenu:designerMode&&selectable?(event:ReactMouseEvent<HTMLElement>)=>{if((event.target as Element).closest('.grid-toolbar-fixed-control')||(event.target as Element).closest('.laboratory-form-grid')||(event.target as Element).closest('[data-toolbar-part]')!==event.currentTarget)return;event.preventDefault();event.stopPropagation();onDesignerToolbarContextMenu?.(part,event.clientX,event.clientY)}:undefined
    }
  }
  const toolHandle = (part:GridToolbarPart) => selected(part) && onDesignerToolbarChange ? <>
    <button type="button" className="grid-tool-move-handle" aria-label={'جابجایی '+toolbarPartLabel(part)} title="جابجایی با موس یا کلید جهت" onClick={event=>{event.preventDefault();event.stopPropagation()}} onPointerDown={event=>beginToolbarMove(event,part,toolbarSettings[part],onDesignerToolbarChange,designerToolbarSelection,toolbarSettings)} onKeyDown={event=>toolbarMoveKey(event,part,toolbarSettings[part],onDesignerToolbarChange,designerToolbarSelection,toolbarSettings)}>↕</button>
    {designerResizeHandles.map(edge=><button key={edge} type="button" className={'designer-edge-handle designer-edge-'+edge} aria-label={'تغییر اندازه '+toolbarPartLabel(part)+' '+edge} onClick={event=>{event.preventDefault();event.stopPropagation()}} onPointerDown={event=>beginToolbarMove(event,part,toolbarSettings[part],onDesignerToolbarChange,designerToolbarSelection,toolbarSettings,edge)} onKeyDown={event=>toolbarMoveKey(event,part,toolbarSettings[part],onDesignerToolbarChange,designerToolbarSelection,toolbarSettings,edge)}/>)}
  </> : null
  const showBulkStatus=Boolean(onBulkDelete)&&!designerMode&&!readOnly&&bulk.multiSelection&&(bulk.selection.size>0||bulk.busy||Boolean(bulk.error))
  const inPanel=(part:GridToolbarPart,panel:GridToolbarPart)=>(toolbarSettings[part]?.panelId??'header')===panel
  const panels=toolbarPanels(toolbarSettings).filter(panel => designerMode || panel === 'header' || Boolean(headerContent?.[panel]) || ['expand','title','counter','search','columns'].some(part => (toolbarSettings[part as GridToolbarPart]?.panelId ?? 'header') === panel))
  return <div ref={boundary} data-grid-id={personalGridId} data-toolbar-layout="laboratory" className={`base-grid-boundary${expanded ? ' is-expanded' : ''}${readOnly ? ' is-read-only' : ''}`} style={boundaryStyle} onKeyDownCapture={event=>{if(!(event.ctrlKey||event.metaKey)||event.altKey||(event.code!=='KeyA'&&event.key.toLowerCase()!=='a'))return;const target=event.target instanceof Element?event.target:null;if(target?.closest('input,textarea,select,[contenteditable="true"]'))return;if(target?.closest('.base-grid-table td[data-column]')){event.preventDefault();event.stopPropagation();selectAllVisibleGridCells();return}event.preventDefault()}}>
    <div className="grid-toolbar-panels">{panels.map((panel,index)=><Fragment key={panel}>{toolbarSettings[panel]?.placement==='below'&&<span className="grid-toolbar-row-break" aria-hidden="true"/>}<div className={'grid-toolbar'+(panel==='header'&&showBulkStatus?' has-definition-selection':'')} data-toolbar-part={panel} data-toolbar-direction={fa?'rtl':'ltr'} data-panel-placement={toolbarSettings[panel]?.placement} {...toolProps(panel)} style={{...toolbarPartStyle(toolbarSettings[panel]),...(panel==='header'&&!designerMode?{width:'100%',minWidth:0,maxWidth:'100%',minHeight:personalLayout?.toolbarHeight??toolbarSettings[panel]?.height??120,transform:undefined}:{}),height:panel==='header'?(personalLayout?.toolbarHeight??toolbarSettings[panel]?.height??120):toolbarSettings[panel]?.height??120,direction:'ltr',gridRow:toolbarSettings[panel]?.placement==='below'?index+1:1,flex:panel==='header'&&!designerMode?'1 1 auto':toolbarSettings[panel]?.width?'0 0 auto':'1 1 420px'}}>
      {panel==='header'&&(showBulkStatus&&<div className="definition-bulk-status" role="status" aria-live="polite">{bulk.selection.size>0&&<span>{bulk.selection.size} {fa?'ردیف انتخاب‌شده':'rows selected'}</span>}{bulk.selection.size>0&&<button type="button" data-definition-bulk-delete disabled={bulk.busy} onClick={()=>void bulk.remove()}>{fa?'حذف انتخاب‌ها':'Delete selected'}</button>}{bulk.busy&&<span>{fa?'در حال بررسی…':'Checking…'}</span>}{bulk.error&&<span role="alert">{bulk.error}</span>}</div>)}
      {toolHandle(panel)}{designerMode&&panel!=='header'&&!['expand','title','counter','search','columns'].some(part=>inPanel(part as GridToolbarPart,panel))&&<span className="grid-toolbar-empty">هدر افزوده — اجزا را از «پنل میزبان» به این هدر منتقل کنید.</span>}
      {headerContent?.[panel]&&<div className="grid-toolbar-field-content" data-toolbar-content-for={panel}>{headerContent[panel]}</div>}
      {inPanel('expand',panel)&&<div className="grid-expand-slot" data-toolbar-part="expand" {...toolProps('expand')} style={{...toolbarPartStyle(toolbarSettings.expand),border:0,padding:0,background:undefined}}><button type="button" className="grid-expand-toggle" style={{...toolbarPartStyle(toolbarSettings.expand),position:undefined,transform:undefined,width:toolbarSettings.expand?.width,height:toolbarSettings.expand?.height,minHeight:toolbarSettings.expand?.height}} aria-label={expandLabel} title={expandLabel} aria-pressed={expanded} onClick={toggleExpanded}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {expanded
            ? <path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5" />
            : <path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5" />}
        </svg>
      </button>{toolHandle('expand')}</div>}
      {(inPanel('title',panel)||inPanel('counter',panel))&&<div className="grid-title-row">
        <div className="grid-title-area">{inPanel('title',panel)&&<h2 data-toolbar-part="title" {...toolProps('title')} style={toolbarPartStyle(toolbarSettings.title)}>{toolHandle('title')}{title ?? (fa ? 'جدول دادهٔ مصنوعی' : 'Synthetic data table')}</h2>}{inPanel('counter',panel)&&<span data-toolbar-part="counter" {...toolProps('counter')} style={toolbarPartStyle(toolbarSettings.counter)}>{toolHandle('counter')}{fa ? `${total ? range.first + 1 : 0} تا ${Math.min(total, remoteQuery ? range.last : total)} از ${total} رکورد` : `${total ? range.first + 1 : 0}–${Math.min(total, remoteQuery ? range.last : total)} of ${total} records`}</span>}</div>
      </div>}
      {inPanel('search',panel)&&<div className="grid-search-panel" data-toolbar-part="search" {...toolProps('search',false)} style={{ order: searchOrder, ...toolbarPartStyle(toolbarSettings.search), borderWidth:0, borderStyle:'none' }} >
        {toolHandle('search')}<label className="grid-search-control" data-toolbar-part="searchInput" {...toolProps('searchInput')} style={{...toolbarPartStyle(toolbarSettings.searchInput),border:0,padding:0,background:undefined}}>{toolHandle('searchInput')}<input style={{...toolbarPartStyle({...toolbarSettings.search,...toolbarSettings.searchInput}),position:undefined,transform:undefined,width:'100%',height:toolbarSettings.searchInput?.height,borderRadius:toolbarSettings.searchInput?.borderRadius??toolbarSettings.search?.borderRadius}} ref={searchInput} type="search" aria-label={fa ? 'جست‌وجو در دادهٔ مصنوعی' : 'Search synthetic data'} value={searchDraft} readOnly={readOnly} onChange={event => setSearchDraft(event.target.value)} placeholder={fa ? 'جست‌وجو… (F1)' : language === 'zh' ? '搜索… (F1)' : 'Search… (F1)'} /></label>
        <span className="grid-search-reverse-slot" data-toolbar-part="searchReverse" {...toolProps('searchReverse')} style={{...toolbarPartStyle(toolbarSettings.searchReverse),border:0,padding:0,background:undefined}}>{toolHandle('searchReverse')}<button type="button" style={{...toolbarPartStyle(toolbarSettings.searchReverse),transform:undefined}} className="grid-search-reverse" aria-label={fa ? `وارونه‌سازی نتیجهٔ جست‌وجو: ${reverseSearch ? 'فعال' : 'غیرفعال'}` : `Reverse search results: ${reverseSearch ? 'on' : 'off'}`} title={fa ? `وارونه‌سازی نتیجهٔ جست‌وجو: ${reverseSearch ? 'فعال' : 'غیرفعال'}` : `Reverse search results: ${reverseSearch ? 'on' : 'off'}`} aria-pressed={reverseSearch} disabled={readOnly || !searchDraft.trim()} onClick={() => setReverseSearch(value => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 8.5A8.5 8.5 0 0 0 5 5.1L3 7.2M3 3.5v3.8h3.8M3.5 15.5A8.5 8.5 0 0 0 19 18.9l2-2.1m0 3.7v-3.8h-3.8"/><path d="M8 9.2h8M8 12h8M8 14.8h5"/></svg>
          <span className="grid-search-reverse-state" aria-hidden="true">{reverseSearch ? '✓' : ''}</span>
        </button></span>
        <div className="grid-search-options" data-toolbar-part="searchOptions" {...toolProps('searchOptions',false)} style={toolbarPartStyle(toolbarSettings.searchOptions)} role="group" aria-label={fa ? 'روش جست‌وجو' : 'Search mode'}>
          {toolHandle('searchOptions')}{(['startsWith', 'contains', 'exact'] as const).map(mode => { const active = searchMode === mode; return <label key={mode} className={active?'is-active-search-mode':undefined} data-search-active={active} data-toolbar-part={'searchOption:'+mode} {...toolProps(('searchOption:'+mode) as GridToolbarPart)} style={{...toolbarPartStyle(toolbarSettings[('searchOption:'+mode) as GridToolbarPart]),fontWeight:active?700:400}}>{toolHandle(('searchOption:'+mode) as GridToolbarPart)}<input type="radio" name={`laboratory-grid-search-mode-${radioGroupId}`} checked={active} aria-checked={active} disabled={readOnly} onChange={event => { if (event.currentTarget.checked) setSearchMode(mode) }} />{fa ? mode === 'startsWith' ? 'از ابتدای واژه یا عدد' : mode === 'contains' ? 'هر جای مقدار' : 'تطبیق کامل' : mode === 'startsWith' ? 'From word start' : mode === 'contains' ? 'Anywhere' : 'Exact match'}</label> })}
        </div>
      </div>}
      {panel==='header'&&operationalBehavior.gridExport.enabled&&<div className="grid-export-slot grid-toolbar-fixed-control"><button type="button" className="grid-export-toggle" aria-label={exportLabel} title={exportLabel} disabled={exporting} aria-busy={exporting} onClick={()=>void exportGrid()}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5M8 12l4 6m0-6-4 6m7-6h1m-1 3h1"/></svg></button><span className="grid-export-status" role="status" aria-live="polite">{exportStatus}</span></div>}
      {inPanel('columns',panel)&&<div className="grid-columns-slot" data-toolbar-part="columns" {...toolProps('columns')} style={{...toolbarPartStyle(toolbarSettings.columns),border:0,padding:0,background:undefined}}>{toolHandle('columns')}<details ref={columnDetails} style={expandedColumnsStyle} onToggle={event=>{if(event.currentTarget.open){const r=event.currentTarget.getBoundingClientRect();const desired=Math.min(window.innerHeight*.55,columns.length*34+16),below=window.innerHeight-r.bottom-8,above=r.top-8,useBelow=below>=desired||below>=above,maxHeight=Math.max(40,Math.min(desired,useBelow?below:above));setColumnPopup({left:Math.max(8,Math.min(window.innerWidth-260,r.right-250)),top:useBelow?r.bottom+4:Math.max(8,r.top-maxHeight-4),maxHeight})}else setColumnPopup(null)}}><summary aria-label={columnsLabel} title={columnsLabel} style={{...toolbarPartStyle(toolbarSettings.columns),transform:undefined,width:toolbarSettings.columns?.width?'100%':undefined}}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16m6-16v16"/></svg></summary>{columnPopup&&createPortal(<div ref={columnPopupRef} style={{left:columnPopup.left,top:columnPopup.top,maxHeight:columnPopup.maxHeight}} className="grid-column-visibility-list" role="group" aria-label={fa?'نمایش ستون‌ها':'Column visibility'}>{columns.map(column => <label key={column.id}><input type="checkbox" checked={column.visible} onChange={() => setColumns(current => current.map(item => item.id === column.id ? { ...item, visible: !item.visible } : item))} /><span>{column.label}</span></label>)}</div>,document.body)}</details></div>}
      {designerMode&&designerToolbarSelection.length>1&&<div className="grid-toolbar-multiselection-frame" data-toolbar-selection-parts={JSON.stringify(designerToolbarSelection)} aria-hidden="true" hidden/>}
    </div></Fragment>)}</div>
    {onBulkDelete&&!designerMode&&!readOnly&&!showBulkStatus&&(bulk.selection.size>0||Boolean(selectedRow))&&<button hidden type="button" data-definition-bulk-delete disabled={bulk.busy} onClick={()=>void deleteGridSelection()}/>}
    <div ref={tableWrap} dir="rtl" className={`base-grid-table-wrap${remoteQuery ? ' base-grid-virtual-wrap' : ''}`} onKeyDownCapture={event=>{if(event.key==='Delete'&&onBulkDelete&&!readOnly&&!designerMode&&!bulk.selection.size&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!(event.target as Element).closest('input,textarea,select,button,[contenteditable="true"]')){event.preventDefault();event.stopPropagation();void deleteGridSelection();return}bulk.keyDown(event)}} data-definition-bulk-active={onBulkDelete&&(bulk.selection.size>0||Boolean(selectedRow))||undefined} data-virtual-metrics={activeCache ? JSON.stringify({ requests: activeCache.metrics.requests, peakConcurrent: activeCache.metrics.peakConcurrent, cachedPages: activeCache.cacheSize, loads: activeCache.metrics.completed }) : undefined} tabIndex={readOnly ? undefined : 0} onKeyDown={event => {
      if (readOnly || designerMode || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !['ArrowUp','ArrowDown'].includes(event.key)) return
      if ((event.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable="true"],thead')) return
      event.preventDefault(); event.stopPropagation()
      if (!total) return
      const currentIndex = remoteQuery ? selectedIndex.current : filtered.findIndex((row, index) => String((row as { id?: unknown }).id ?? index) === selectedRow)
      const anchor = pendingNavigation.current?.index ?? (currentIndex === null || currentIndex < 0 ? null : currentIndex)
      const index = anchor === null ? (event.key === 'ArrowDown' ? 0 : total - 1) : Math.max(0, Math.min(total - 1, anchor + (event.key === 'ArrowDown' ? 1 : -1)))
      pendingNavigation.current = { index, queryKey }
      revealNavigationRow(index)
      setLocalNavigation(current => current + 1)
    }} aria-label={fa ? 'ردیف‌های جدول' : 'Table rows'} onScroll={remoteQuery ? event => { const top = event.currentTarget.scrollTop; setViewport(current => current.top === top ? current : { ...current, top }) } : undefined}>
      <ExcelGridFilterScope key={resetRequest} onReset={designerMode || readOnly ? undefined : () => {
        setFilters({}); setSearchDraft(''); setReverseSearch(false)
        setSearchQuery({text:'', mode:searchMode, reverse:false}); setCellMenu(null)
      }}>
        <table className={`person-table excel-grid base-grid-table${designerMode ? ' is-designer-mode' : ''}`} dir={fa ? 'rtl' : 'ltr'} aria-rowcount={remoteQuery ? activeCache?.total === undefined ? -1 : total + 1 : undefined} style={{ width: fillViewport ? '100%' : visible.reduce((sum, column) => sum + column.width, 0), minWidth: visible.reduce((sum, column) => sum + column.width, 0), tableLayout: 'fixed', marginLeft: tableRtl?'auto':0, marginRight: tableRtl?0:'auto', ...(remoteQuery ? { '--virtual-row-height': `${rowHeight}px` } as CSSProperties : {}) }}>
          <colgroup>{visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
          <thead ref={tableHeader} tabIndex={resizeHeader ? 0 : undefined} aria-label={resizeHeader ? (fa ? 'تغییر ارتفاع سرستون: با موس لبهٔ پایین را بکشید؛ بالا و پایین ارتفاع و چپ و راست عرض ستون را تغییر می‌دهند.' : 'Resize the header: drag its bottom edge; arrows change height or column width.') : undefined} style={resizeHeader ? { height: operationalResizeAllowed && !designerMode ? personalLayout?.headerHeight ?? designerHeaderHeight : designerHeaderHeight } : undefined} onPointerDown={startHeaderHeightResize} onPointerMove={moveHeaderHeightResize} onPointerUp={endHeaderHeightResize} onPointerCancel={endHeaderHeightResize} onKeyDown={handleDesignerHeaderKeys}><tr style={resizeHeader ? { height: operationalResizeAllowed && !designerMode ? personalLayout?.headerHeight ?? designerHeaderHeight : designerHeaderHeight } : undefined}>{visible.map(column => {
            const style = designerHeaderStyles?.[column.id]
            const decoration = [style?.underline ? 'underline' : '', style?.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ')
            return <ExcelGridColumnHeader key={column.id} column={column} rows={filtered} locale={language} language={language} direction={fa ? 'rtl' : 'ltr'} filter={filters[column.id]} sort={sort} filterPopupFontSize={filterPopupFontSize} onSort={readOnly ? () => undefined : setSort} loadFilterValues={remoteQuery ? query => loadFilterValues(column.id, query) : undefined} onApplyFilter={readOnly ? () => undefined : filter => applyFilter(column.id, filter)} titleProps={{ style: { textAlign:style?.textAlign, width:'100%', fontWeight: style?.bold === undefined ? undefined : style.bold ? 700 : 400, fontStyle: style?.italic === undefined ? undefined : style.italic ? 'italic' : 'normal', textDecorationLine: decoration || undefined, textDecorationStyle: style?.underline === 'double' ? 'double' : undefined, verticalAlign: style?.script === 'superscript' ? 'super' : style?.script === 'subscript' ? 'sub' : undefined, color: style?.textColor, fontFamily: style?.fontFamily ? gridFontFamily(style.fontFamily) : undefined, fontSize: style?.fontSize ? `${style.script ? style.fontSize * 0.75 : style.fontSize}px` : undefined } }} thProps={{ 'data-column': column.id, className: [sort?.some(item => item.id === column.id) ? 'is-sorted' : '', designerMode && designerSelectedColumnIds.includes(column.id) ? 'is-designer-column-selected' : ''].filter(Boolean).join(' ') || undefined, title: designerMode ? (fa ? 'برای انتخاب چند ستون Ctrl یا Command را نگه دارید و سرستون را کلیک کنید.' : 'Ctrl/Command-click headers to select multiple columns.') : undefined, style: { '--lab-header-bg': style?.backgroundColor, '--lab-header-text': style?.textColor, borderColor: style?.borderColor, verticalAlign: style?.verticalTextAlign === 'center' ? 'middle' : style?.verticalTextAlign } as CSSProperties, onClickCapture: designerMode ? event => { const target=event.target as HTMLElement;if(target.closest('.header-height-handle'))return; event.preventDefault(); event.stopPropagation(); onDesignerColumnSelect?.(column.id, event.ctrlKey || event.metaKey) } : undefined, onContextMenu: designerMode ? event => { event.preventDefault(); event.stopPropagation(); onDesignerContextMenu?.('header', column.id, event.clientX, event.clientY, event.ctrlKey || event.metaKey) } : undefined }} resizer={readOnly && !designerMode && !operationalResizeAllowed ? undefined : <><span className="base-grid-resizer" onPointerDown={event => resize(column.id, event)} />{resizeHeader&&<span className="header-height-handle" role="separator" aria-label={fa ? 'تغییر ارتفاع سرستون با موس' : 'Resize table header'} onPointerDown={startHeaderHeightResize}/>}</>} />
          })}</tr></thead>
          <tbody>
            {remoteQuery && range.start > 0 && <tr className="base-grid-virtual-spacer" aria-hidden="true"><td colSpan={visible.length} style={{ height: range.start * rowHeight }} /></tr>}
            {(remoteQuery ? Array.from({ length: range.end - range.start }, (_, offset) => ({ row: activeCache?.row(range.start + offset), index: range.start + offset })) : filtered.map((row, index) => ({ row, index }))).map(({ row, index }, offset) => {
              const rowPage = Math.floor(index / VIRTUAL_PAGE_SIZE) + 1
              const error = activeCache?.error(rowPage)
              const key = String((row as { id?: unknown } | undefined)?.id ?? index)
              return <tr ref={remoteQuery && offset === 0 ? firstRow : undefined} key={remoteQuery ? index : key} data-row-index={index} data-grid-index={remoteQuery ? index : undefined} aria-rowindex={remoteQuery ? index + 2 : undefined} aria-busy={!row || undefined} aria-selected={onBulkDelete&&bulk.selection.size?bulk.selection.has(key):selectedRow===key} className={`${remoteQuery ? 'base-grid-virtual-row ' : ''}${index % 2 ? 'is-alternate' : ''}${(onBulkDelete&&bulk.selection.size?bulk.selection.has(key):selectedRow===key) ? ' is-selected' : ''}${bulk.blocked.has(key)?' bulk-delete-blocked':' '}`} onClick={row && !readOnly ? event => { if(bulk.busy)return; tableWrap.current?.focus({ preventScroll: true }); if(onBulkDelete&&!designerMode){void bulk.select({id:key,record:row},index,event);if(event.ctrlKey||event.metaKey||event.shiftKey){event.preventDefault();return;}} setSelectedCells([]); setSelectionAnchor(null); setCellMenu(null); selectedIndex.current = index; pendingNavigation.current = null; setSelectedRow(key); onRowSelectionChange?.(row) } : undefined} onDoubleClick={row && !readOnly ? () => onRowDoubleClick?.(row) : undefined}>
                {!row && error ? <td colSpan={visible.length} title={error}>{index === Math.max(range.start, (rowPage - 1) * VIRTUAL_PAGE_SIZE) && <button className="base-grid-page-retry" type="button" onClick={() => activeCache?.retry(rowPage)}>{fa ? 'دریافت نشد؛ تلاش مجدد' : 'Unable to load; retry'}</button>}</td> : visible.map(column => {
                  if (!row) return <td key={column.id}><span className="base-grid-row-placeholder" aria-hidden="true">…</span></td>
                  const cell = makeSelectedCell(row, key, index, column)
                  const isSelected = selectedCells.some(item => item.key === cell.key)
                  const style = designerColumnStyles?.[column.id]
                  const decoration = [style?.underline ? 'underline' : '', style?.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ')
                  return <td key={column.id} data-column={column.id} style={presentationStyles ? { textAlign: style?.textAlign, verticalAlign: style?.verticalTextAlign === 'center' ? 'middle' : style?.verticalTextAlign, color: style?.textColor, backgroundColor: style?.backgroundColor, fontFamily: style?.fontFamily ? gridFontFamily(style.fontFamily) : undefined, fontSize: style?.fontSize ? `${style.fontSize}px` : undefined, fontWeight: style?.bold === undefined ? undefined : style.bold ? 700 : 400, fontStyle: style?.italic === undefined ? undefined : style.italic ? 'italic' : 'normal', textDecorationLine: decoration || undefined, textDecorationStyle: style?.underline === 'double' ? 'double' : undefined } : undefined} className={[column.multiline ? 'is-multiline' : '', isSelected ? 'is-cell-selected' : '', presentationStyles && style?.bold ? 'is-designer-bold' : ''].filter(Boolean).join(' ') || undefined} aria-selected={isSelected || undefined} title={readOnly ? undefined : fa ? 'کلیک برای انتخاب ردیف؛ راست‌کلیک برای انتخاب سلول و عملیات آن. Ctrl یا Shift همراه راست‌کلیک برای انتخاب چند سلول.' : 'Click to select a row; right-click for cell actions. Ctrl/Shift-right-click selects multiple cells.'} onClick={undefined} onContextMenu={readOnly && !designerMode ? undefined : event => openCellMenu(cell, event)}><span style={presentationStyles && style?.script ? { verticalAlign: style.script === 'superscript' ? 'super' : 'sub', fontSize: '0.75em' } : undefined}>{gridDisplayValue(cell.value)}</span></td>
                })}
              </tr>
            })}
            {remoteQuery && range.end < (activeCache?.total ?? VIRTUAL_PAGE_SIZE) && <tr className="base-grid-virtual-spacer" aria-hidden="true"><td colSpan={visible.length} style={{ height: ((activeCache?.total ?? VIRTUAL_PAGE_SIZE) - range.end) * rowHeight }} /></tr>}
            {(remoteQuery ? activeCache?.total === 0 : filtered.length === 0) && <tr><td colSpan={visible.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
          </tbody>
        </table>
      </ExcelGridFilterScope>
    </div>
    {!readOnly && cellMenu && createPortal(<div ref={cellMenuRef} className="base-grid-cell-context-menu" role="menu" dir={fa ? 'rtl' : 'ltr'} style={{ ...appearanceStyle, left: cellMenu.left, top: cellMenu.top }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
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
