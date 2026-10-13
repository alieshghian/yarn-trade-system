import { createContext, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type ThHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { NO_FILL, gridAvailableColors, gridDistinctValues, gridValueKey, gridValueLabel, type ExcelGridColumn, type GridColumnFilter, type GridCondition, type GridCustomFilter, type GridFilterOperator, type GridSortState, type GridValue, type GridValueRule } from './excelGrid'

type Props<Row> = {
  column: ExcelGridColumn<Row>
  rows: readonly Row[]
  locale: string
  language?: 'fa' | 'en' | 'zh'
  direction?: 'rtl' | 'ltr'
  filter?: GridColumnFilter
  sort?: GridSortState
  filterPopupFontSize?: number
  onSort: (sort: GridSortState) => void
  onApplyFilter: (filter?: GridColumnFilter) => void
  loadFilterValues?: (search: string) => Promise<{ values: GridValue[], colors?: (string | null)[] }>
  thProps?: ThHTMLAttributes<HTMLTableCellElement> & { 'data-column'?: string }
  titleProps?: ButtonHTMLAttributes<HTMLButtonElement>
  resizer?: ReactNode
}

const ExcelGridFilterContext = createContext<{ activeId: string | null, setActiveId: (id: string | null) => void } | null>(null)
export function ExcelGridFilterScope({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  return <ExcelGridFilterContext.Provider value={{ activeId, setActiveId }}>{children}</ExcelGridFilterContext.Provider>
}

const labels: Record<GridFilterOperator, string> = {
  equals: 'Equals', notEquals: 'Does Not Equal', contains: 'Contains', notContains: 'Does Not Contain', beginsWith: 'Begins With', endsWith: 'Ends With',
  greaterThan: 'Greater Than', greaterOrEqual: 'Greater Than or Equal', lessThan: 'Less Than', lessOrEqual: 'Less Than or Equal', between: 'Between',
  on: 'On', before: 'Before', after: 'After'
}
const persianLabels: Record<GridFilterOperator, string> = {
  equals: 'برابر است با', notEquals: 'برابر نیست با', contains: 'شامل', notContains: 'شامل نیست', beginsWith: 'شروع می‌شود با', endsWith: 'پایان می‌یابد با',
  greaterThan: 'بزرگ‌تر از', greaterOrEqual: 'بزرگ‌تر یا برابر', lessThan: 'کوچک‌تر از', lessOrEqual: 'کوچک‌تر یا برابر', between: 'بین', on: 'در تاریخ', before: 'قبل از', after: 'بعد از'
}

function operators(type: ExcelGridColumn<unknown>['type']): GridFilterOperator[] {
  if (type === 'text') return ['equals', 'notEquals', 'contains', 'notContains', 'beginsWith', 'endsWith']
  if (type === 'number') return ['equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between']
  return type === 'date' ? ['on', 'before', 'after', 'between'] : ['equals', 'notEquals']
}

function emptyCondition(type: ExcelGridColumn<unknown>['type']): GridCondition {
  return { operator: operators(type)[0], value: '', secondValue: '' }
}

export function ExcelGridColumnHeader<Row>({ column, rows, locale, language = 'en', direction = 'ltr', filter, sort, filterPopupFontSize = 16, onSort, onApplyFilter, loadFilterValues, thProps, titleProps, resizer }: Props<Row>) {
  const filterContext = useContext(ExcelGridFilterContext)
  if (!filterContext) throw new Error('ExcelGridColumnHeader must be inside ExcelGridFilterScope')
  const setActiveId = filterContext.setActiveId
  const id = useId()
  const open = filterContext.activeId === id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const conditionRef = useRef<HTMLDivElement>(null)
  const topTenRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 8, left: 8 })
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState<'include' | 'exclude'>('exclude')
  const [remoteValues, setRemoteValues] = useState<GridValue[]>()
  const [remoteColors, setRemoteColors] = useState<(string | null)[]>()
  const [custom, setCustom] = useState<GridCustomFilter | undefined>()
  const [editingCustom, setEditingCustom] = useState<GridCustomFilter | undefined>()
  const [conditionDialog, setConditionDialog] = useState(false)
  const [editorPosition, setEditorPosition] = useState({ top: 8, left: 8 })
  const [colors, setColors] = useState<string[] | undefined>()
  const [valueRule, setValueRule] = useState<GridValueRule | undefined>()
  const [topTenDialog, setTopTenDialog] = useState(false)
  const [topTenKind, setTopTenKind] = useState<'top' | 'bottom'>('top')
  const [topTenCount, setTopTenCount] = useState(10)
  const values = remoteValues ?? gridDistinctValues(rows, column)
  const colorValues = remoteColors ?? gridAvailableColors(rows, column)
  const filteredValues = loadFilterValues ? values : values.filter(value => gridValueLabel(value).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
  const isSelected = (key: string) => selectionMode === 'exclude' ? !selected.includes(key) : selected.includes(key)
  const selectedAll = filteredValues.length > 0 && filteredValues.every(value => isSelected(gridValueKey(value)))
  const active = Boolean(filter && (filter.selectedValues || filter.custom || filter.colors !== undefined || filter.valueRule))
  const sortIndex = sort?.findIndex(item => item.id === column.id) ?? -1
  const columnSort = sortIndex >= 0 ? sort?.[sortIndex] : undefined
  const submenuOpensLeft = direction === 'rtl' ? position.left >= 280 : position.left + 320 + 270 > window.innerWidth
  const tr = (en: string, fa: string, zh?: string) => language === 'fa' ? fa : language === 'zh' ? zh ?? en : en

  useEffect(() => {
    if (!open || !loadFilterValues) return
    let current = true
    const timer = window.setTimeout(() => {
      void loadFilterValues(search).then(result => { if (current) { setRemoteValues(result.values); if (result.colors) setRemoteColors(result.colors) } }).catch(() => { if (current) { setRemoteValues([]); setRemoteColors([]) } })
    }, 140)
    return () => { current = false; window.clearTimeout(timer) }
  }, [open, search, loadFilterValues])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !conditionRef.current?.contains(target) && !topTenRef.current?.contains(target) && !triggerRef.current?.contains(target)) setActiveId(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation()
      setActiveId(null)
      triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true) }
  }, [open, setActiveId])

  function openMenu(anchor: HTMLButtonElement) {
    const rect = anchor.getBoundingClientRect(), width = Math.min(340, window.innerWidth - 16), height = Math.min(570, window.innerHeight - 16)
    const rtl = direction === 'rtl'
    setPosition({ top: Math.max(8, Math.min(rect.bottom + 2, window.innerHeight - height - 8)), left: Math.max(8, Math.min(rtl ? rect.left : rect.right - width, window.innerWidth - width - 8)) })
    setSelected(filter?.selectedValues ? [...filter.selectedValues] : [])
    setSelectionMode(filter?.selectionMode ?? (filter?.selectedValues ? 'include' : 'exclude'))
    setRemoteValues(undefined)
    setRemoteColors(undefined)
    setCustom(filter?.custom ? structuredClone(filter.custom) : undefined)
    setColors(filter?.colors ? [...filter.colors] : filter?.colors)
    setValueRule(filter?.valueRule ? { ...filter.valueRule } : undefined)
    setConditionDialog(false); setTopTenDialog(false); setEditingCustom(undefined)
    setSearch('')
    setActiveId(id)
  }

  function apply() {
    const next: GridColumnFilter = {}
    if (selectionMode === 'include' || selected.length) { next.selectedValues = [...selected]; next.selectionMode = selectionMode }
    if (custom?.first.value.trim()) next.custom = custom
    if (colors !== undefined && colors.length < colorValues.length) next.colors = [...colors]
    if (valueRule) next.valueRule = valueRule
    onApplyFilter(Object.keys(next).length ? next : undefined)
    setActiveId(null)
  }

  function toggleValue(key: string, checked: boolean) {
    setSelected(current => {
      const has = current.includes(key)
      if (selectionMode === 'exclude') return checked ? current.filter(item => item !== key) : has ? current : [...current, key]
      return checked ? has ? current : [...current, key] : current.filter(item => item !== key)
    })
  }

  function toggleAllVisible(checked: boolean) {
    const visibleKeys = filteredValues.map(gridValueKey)
    if (checked && !search.trim()) { setSelectionMode('exclude'); setSelected([]); return }
    if (!checked && !search.trim()) { setSelectionMode('include'); setSelected([]); return }
    setSelected(current => {
      const next = new Set(current)
      for (const key of visibleKeys) {
        if (selectionMode === 'exclude' ? checked : !checked) next.delete(key)
        else next.add(key)
      }
      return [...next]
    })
  }

  function requestSort(next: GridSortState[number]) {
    const current = sort ?? []
    const index = current.findIndex(item => item.id === next.id)
    onSort(index < 0 ? [...current, next] : current.map((item, itemIndex) => itemIndex === index ? next : item))
  }

  function placeEditor() {
    const width = Math.min(320, window.innerWidth - 16)
    const side = submenuOpensLeft ? position.left - width - 6 : position.left + 326
    setEditorPosition({ top: position.top, left: Math.max(8, Math.min(side, window.innerWidth - width - 8)) })
  }

  function beginCondition(operator?: GridFilterOperator) {
    const base = custom ?? { logic: 'and' as const, first: emptyCondition(column.type) }
    setEditingCustom({ ...structuredClone(base), first: { ...base.first, ...(operator ? { operator } : {}) } })
    placeEditor()
    setConditionDialog(true)
  }

  const updateCondition = (which: 'first' | 'second', update: Partial<GridCondition>) => setEditingCustom(current => {
    const base = current ?? { logic: 'and' as const, first: emptyCondition(column.type) }
    const condition = { ...(which === 'first' ? base.first : base.second ?? emptyCondition(column.type)), ...update }
    return which === 'first' ? { ...base, first: condition } : { ...base, second: condition }
  })
  const renderCondition = (which: 'first' | 'second', condition: GridCondition) => <div className="excel-custom-condition" key={which}>
    <select aria-label={`${column.label} ${which} operator`} value={condition.operator} onChange={event => updateCondition(which, { operator: event.target.value as GridFilterOperator })}>{operators(column.type).map(operator => <option key={operator} value={operator}>{language === 'fa' ? persianLabels[operator] : labels[operator]}</option>)}</select>
    <input aria-label={`${column.label} ${which} value`} type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} value={condition.value} onChange={event => updateCondition(which, { value: event.target.value })} />
    {condition.operator === 'between' && <input aria-label={`${column.label} ${which} end value`} type={column.type === 'date' ? 'date' : 'number'} value={condition.secondValue ?? ''} onChange={event => updateCondition(which, { secondValue: event.target.value })} />}
  </div>

  return <th {...thProps} style={{ ...thProps?.style, width: column.width }}>
    <div className="column-heading">
      <button {...titleProps} type="button" className={`column-title ${columnSort ? 'is-sorted' : ''} ${titleProps?.className ?? ''}`} onClick={event => { titleProps?.onClick?.(event); if (!event.defaultPrevented) requestSort({ id: column.id, direction: columnSort && !columnSort.byColor ? columnSort.direction === 'asc' ? 'desc' : 'asc' : 'asc' }) }}>
        {column.label}{columnSort && <span className={`column-sort-indicator ${columnSort.byColor ? 'by-color' : columnSort.direction}`} aria-label={columnSort.byColor ? tr('Sorted by color', 'مرتب‌شده بر اساس رنگ', '按颜色排序') : columnSort.direction === 'asc' ? tr('Sorted ascending', 'مرتب‌شده صعودی', '升序') : tr('Sorted descending', 'مرتب‌شده نزولی', '降序')} title={`${sortIndex + 1}. ${columnSort.byColor ? tr('Sorted by color', 'مرتب‌شده بر اساس رنگ', '按颜色排序') : columnSort.direction === 'asc' ? tr('Sorted ascending', 'مرتب‌شده صعودی', '升序') : tr('Sorted descending', 'مرتب‌شده نزولی', '降序')}`}><svg viewBox="0 0 16 10" aria-hidden="true"><path d={columnSort.byColor ? 'M3 5h10' : columnSort.direction === 'asc' ? 'M3 7 8 2l5 5M8 2v7' : 'M3 3l5 5 5-5M8 8V1'} /></svg>{(sort?.length ?? 0) > 1 && <small>{sortIndex + 1}</small>}</span>}
      </button>
      <button ref={triggerRef} type="button" className={`excel-filter-trigger${active ? ' active' : ''}`} aria-label={active ? tr(`Filtered column ${column.label}`, `ستون ${column.label} فیلتر شده`, `已筛选列 ${column.label}`) : tr(`Filter column ${column.label}`, `فیلتر ستون ${column.label}`, `筛选列 ${column.label}`)} aria-pressed={active} aria-expanded={open} onClick={event => open ? setActiveId(null) : openMenu(event.currentTarget)}>{active ? <svg className="excel-filter-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 3.5h15L11.5 9v6l-3 2V9L2.5 3.5z" /></svg> : <svg className="excel-filter-triangle" viewBox="0 0 14 10" aria-hidden="true"><path d="M1.5 1.5h11L7 8.5z" /></svg>}</button>
    </div>
    {resizer}
    {open && createPortal(<>
      <div ref={menuRef} className={`excel-filter-menu shared-excel-filter-menu ${submenuOpensLeft ? 'submenu-opens-left' : 'submenu-opens-right'}`} dir={direction} style={{ top: position.top, left: position.left, fontSize: filterPopupFontSize } as CSSProperties} role="dialog" aria-label={`${column.label} filter`}>
        <button type="button" className="filter-command" onClick={() => { requestSort({ id: column.id, direction: 'asc' }); setActiveId(null) }}><b>A→Z</b><span>{tr('Sort Ascending', 'مرتب‌سازی صعودی', '升序排序')}</span></button>
        <button type="button" className="filter-command" onClick={() => { requestSort({ id: column.id, direction: 'desc' }); setActiveId(null) }}><b>Z→A</b><span>{tr('Sort Descending', 'مرتب‌سازی نزولی', '降序排序')}</span></button>
        {column.effectiveCellColor && column.colorAwareSort && <details className="excel-submenu"><summary>{tr('Sort by Color', 'مرتب‌سازی بر اساس رنگ', '按颜色排序')}</summary><div className="excel-submenu-flyout"><button type="button" onClick={() => { requestSort({ id: column.id, direction: 'asc', byColor: true }); setActiveId(null) }}>{tr('Sort by cell color', 'مرتب‌سازی رنگ سلول', '按单元格颜色排序')}</button></div></details>}
        <button type="button" className="filter-command clear" disabled={!active} onClick={() => { onApplyFilter(undefined); setActiveId(null) }}>⊘ <span>{tr('Clear Filter for This Column', 'پاک کردن فیلتر این ستون', '清除此列筛选')}</span></button>
        {column.effectiveCellColor && <details className="excel-submenu"><summary>{tr('Filter by Color', 'فیلتر بر اساس رنگ', '按颜色筛选')}</summary><div className="excel-submenu-flyout">{colorValues.map(value => { const key = value ?? NO_FILL, checked = colors?.includes(key) ?? false; return <button key={key} type="button" aria-pressed={checked} onClick={() => setColors(current => { const next = current ? [...current] : []; return next.includes(key) ? next.filter(colorKey => colorKey !== key) : [...next, key] })}><span className="excel-color-check" aria-hidden="true">{checked ? '✓' : ''}</span><i style={value ? { backgroundColor: value } : undefined} />{value ?? tr('No Fill', 'بدون رنگ', '无填充')}</button> })}</div></details>}
        <details className="excel-submenu"><summary>{column.type === 'text' ? tr('Text Filters', 'فیلترهای متنی', '文本筛选') : column.type === 'number' ? tr('Number Filters', 'فیلترهای عددی', '数字筛选') : column.type === 'date' ? tr('Date Filters', 'فیلترهای تاریخی', '日期筛选') : tr('Value Filters', 'فیلترهای مقداری', '值筛选')}</summary>
          <div className="excel-submenu-flyout excel-operator-flyout">{operators(column.type).map(operator => <button type="button" key={operator} onClick={() => beginCondition(operator)}>{language === 'fa' ? persianLabels[operator] : labels[operator]}…</button>)}
            {column.type === 'number' && <><hr /><button type="button" onClick={() => { setTopTenKind('top'); setTopTenCount(valueRule?.count ?? 10); placeEditor(); setTopTenDialog(true) }}>{tr('Top 10…', '۱۰ مقدار برتر…', '前 10 项…')}</button><button type="button" onClick={() => setValueRule({ kind: 'aboveAverage' })}>{tr('Above Average', 'بالاتر از میانگین', '高于平均值')}</button><button type="button" onClick={() => setValueRule({ kind: 'belowAverage' })}>{tr('Below Average', 'پایین‌تر از میانگین', '低于平均值')}</button></>}
            <hr /><button type="button" onClick={() => beginCondition()}>{tr('Custom Filter…', 'فیلتر سفارشی…', '自定义筛选…')}</button>
          </div>
        </details>
        <input className="filter-value-search" value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('Search…', 'جستجو…', '搜索…')} />
        <div className="filter-values"><label><input type="checkbox" checked={selectedAll} onChange={event => toggleAllVisible(event.target.checked)} />{tr('Select All', '(انتخاب همه)', '全选')}</label>{filteredValues.map(value => <label key={gridValueKey(value)}><input type="checkbox" checked={isSelected(gridValueKey(value))} onChange={event => toggleValue(gridValueKey(value), event.target.checked)} />{gridValueLabel(value) === '(Blanks)' ? tr('(Blanks)', '(خالی)', '(空白)') : gridValueLabel(value)}</label>)}</div>
        <div className="filter-actions"><button type="button" className="primary" onClick={apply}>{tr('OK', 'تأیید', '确定')}</button><button type="button" onClick={() => setActiveId(null)}>{tr('Cancel', 'انصراف', '取消')}</button></div>
      </div>
      {conditionDialog && <div ref={conditionRef} className="excel-condition-editor" dir={direction} style={{ top: editorPosition.top, left: editorPosition.left, fontSize: filterPopupFontSize }} role="dialog" aria-label={tr('Custom Filter', 'فیلتر سفارشی', '自定义筛选')}>
        <strong>{tr('Custom Filter', 'فیلتر سفارشی', '自定义筛选')}</strong>{renderCondition('first', editingCustom?.first ?? emptyCondition(column.type))}
        <label className="excel-second-condition"><input type="checkbox" checked={Boolean(editingCustom?.second)} onChange={event => setEditingCustom(current => event.target.checked ? { logic: current?.logic ?? 'and', first: current?.first ?? emptyCondition(column.type), second: current?.second ?? emptyCondition(column.type) } : current ? { logic: current.logic, first: current.first } : undefined)} />{tr('Use second condition', 'شرط دوم', '使用第二个条件')}</label>
        {editingCustom?.second && <><select aria-label={tr('Combine conditions', 'ترکیب شرط‌ها', '组合条件')} value={editingCustom.logic} onChange={event => setEditingCustom(current => current && ({ ...current, logic: event.target.value as 'and' | 'or' }))}><option value="and">{tr('And', 'و', '并且')}</option><option value="or">{tr('Or', 'یا', '或者')}</option></select>{renderCondition('second', editingCustom.second)}</>}
        <div className="filter-actions"><button type="button" className="primary" onClick={() => { setCustom(editingCustom); setConditionDialog(false) }}>{tr('OK', 'تأیید', '确定')}</button><button type="button" onClick={() => setConditionDialog(false)}>{tr('Cancel', 'انصراف', '取消')}</button></div>
      </div>}
      {topTenDialog && <div ref={topTenRef} className="excel-condition-editor" dir={direction} style={{ top: editorPosition.top, left: editorPosition.left, fontSize: filterPopupFontSize }} role="dialog" aria-label={tr('Top 10 Filter', 'فیلتر ۱۰ مقدار برتر', '前 10 项筛选')}>
        <strong>{tr('Top 10 AutoFilter', 'فیلتر خودکار ۱۰ مقدار برتر', '前 10 项自动筛选')}</strong><div className="excel-top-ten-controls"><select value={topTenKind} onChange={event => setTopTenKind(event.target.value as 'top' | 'bottom')}><option value="top">{tr('Top', 'بالاترین', '前')}</option><option value="bottom">{tr('Bottom', 'پایین‌ترین', '后')}</option></select><input type="number" min={1} max={500} value={topTenCount} onChange={event => setTopTenCount(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /><span>{tr('Items', 'مقدار', '项')}</span></div>
        <div className="filter-actions"><button type="button" className="primary" onClick={() => { setValueRule({ kind: topTenKind, count: topTenCount }); setTopTenDialog(false) }}>{tr('OK', 'تأیید', '确定')}</button><button type="button" onClick={() => setTopTenDialog(false)}>{tr('Cancel', 'انصراف', '取消')}</button></div>
      </div>}
    </>, document.body)}
  </th>
}
