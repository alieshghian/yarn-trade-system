import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, apiRequest, currentUserKey, hasPermission, isConcurrencyConflict, withRowVersion } from './api'
import type { Language } from './i18n'
import { incrementSerial, suggestSerial } from './sequences'
import SystemDateInput from './SystemDateInput'
import { formatPersianDate } from './persianDate'

type Mode = 'view' | 'new' | 'edit'
type Status = 'Draft' | 'SubmittedToCommerce' | 'InCommerce' | 'Completed' | 'Cancelled'
type Priority = 'Normal' | 'Urgent'
type Currency = 'IRR' | 'USD' | 'CNY' | 'EUR'
type Yarn = { id: string, code: string, comprehensiveName: string, unitOfMeasure: string, isActive: boolean }
type Person = { id: string, displayName: string, isActive: boolean, job?: { code: string } }
type OrderItem = { id?: string, lineNumber?: number, yarnItemId: string, yarnCode?: string, descriptionSnapshot: string, quantity: number, unit: string, estimatedUnitPrice?: number, estimatedAmount?: number, requiredSpecifications?: string, notes?: string }
type Order = {
  rowVersion?: string,
  id: string, orderNumber: string, orderDate: string, requiredByDate?: string, priority: Priority, currency: Currency,
  preferredSupplierId?: string, requestedByUserId?: string, status: Status, notes?: string, itemCount?: number,
  totalQuantity?: number, estimatedTotal?: number, items?: OrderItem[], createdAtUtc: string
}
type Draft = { orderNumber: string, orderDate: string, requiredByDate: string, priority: Priority, currency: Currency, preferredSupplierId: string, notes: string, items: OrderItem[] }
type PageResult<T> = { items: T[], total: number }
type ColumnKey = 'orderNumber' | 'orderDate' | 'requiredByDate' | 'status' | 'priority' | 'itemCount' | 'totalQuantity' | 'estimatedTotal' | 'currency'
type Column = { key: ColumnKey, width: number, visible: boolean }
type Filters = Record<ColumnKey, string[] | null>

const today = () => {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
const newItem = (): OrderItem => ({ yarnItemId: '', descriptionSnapshot: '', quantity: 0, unit: 'KG', estimatedUnitPrice: undefined, requiredSpecifications: '', notes: '' })
const emptyDraft = (): Draft => ({ orderNumber: '', orderDate: today(), requiredByDate: '', priority: 'Normal', currency: 'USD', preferredSupplierId: '', notes: '', items: [newItem()] })
const defaultColumns: Column[] = [
  { key: 'orderNumber', width: 140, visible: true }, { key: 'orderDate', width: 115, visible: true },
  { key: 'requiredByDate', width: 120, visible: true }, { key: 'status', width: 150, visible: true },
  { key: 'priority', width: 100, visible: true }, { key: 'itemCount', width: 90, visible: true },
  { key: 'totalQuantity', width: 130, visible: true }, { key: 'estimatedTotal', width: 155, visible: true },
  { key: 'currency', width: 90, visible: true }
]
const emptyFilters = (): Filters => ({ orderNumber: null, orderDate: null, requiredByDate: null, status: null, priority: null, itemCount: null, totalQuantity: null, estimatedTotal: null, currency: null })
const demoYarns: Yarn[] = [
  { id: 'y1', code: 'CHN-3NM-01', comprehensiveName: 'DUBE DYED CHENILLE براق پلی استر فیلامنت 3 N.M. 1 لا', unitOfMeasure: 'KG', isActive: true },
  { id: 'y2', code: 'ELVA-5NM', comprehensiveName: 'ELVA YARN نیمه مات ویسکوز اسپان 5 N.M. 2 لا', unitOfMeasure: 'KG', isActive: true }
]
const demoPeople: Person[] = [{ id: 's1', displayName: 'Xinsili Textile', isActive: true, job: { code: 'SUPPLIER' } }]
const demoOrders: Order[] = [{
  id: 'o1', orderNumber: 'POR-2026-0001', orderDate: today(), requiredByDate: '', priority: 'Normal', currency: 'USD',
  preferredSupplierId: 's1', status: 'Draft', itemCount: 1, totalQuantity: 5000, estimatedTotal: 12500,
  items: [{ id: 'i1', yarnItemId: 'y1', yarnCode: 'CHN-3NM-01', descriptionSnapshot: demoYarns[0].comprehensiveName, quantity: 5000, unit: 'KG', estimatedUnitPrice: 2.5, estimatedAmount: 12500, requiredSpecifications: 'مطابق نمونه تأییدشده' }],
  createdAtUtc: new Date().toISOString()
}]

function copyDraft(order: Order): Draft {
  return { orderNumber: order.orderNumber, orderDate: order.orderDate, requiredByDate: order.requiredByDate ?? '', priority: order.priority, currency: order.currency, preferredSupplierId: order.preferredSupplierId ?? '', notes: order.notes ?? '', items: (order.items ?? []).map(x => ({ ...x })) }
}
function loadColumns(key: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Column[] | null
    if (saved?.length && defaultColumns.every(c => saved.some(x => x.key === c.key))) return saved
  } catch { /* defaults */ }
  return defaultColumns
}

export default function PurchaseOrdersPage({ language, demoMode = false }: { language: Language, demoMode?: boolean }) {
  const fa = language === 'fa', user = currentUserKey(), splitKey = `purchase-orders-split:${user}`, columnKey = `purchase-orders-columns:${user}`
  const [orders, setOrders] = useState<Order[]>([]), [yarns, setYarns] = useState<Yarn[]>([]), [people, setPeople] = useState<Person[]>([])
  const [selectedId, setSelectedId] = useState(''), [selected, setSelected] = useState<Order | undefined>()
  const [mode, setMode] = useState<Mode>('view'), [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || 430)
  const [columns, setColumns] = useState<Column[]>(() => loadColumns(columnKey)), [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<{ key: ColumnKey, direction: 'asc' | 'desc' }>({ key: 'orderDate', direction: 'desc' })
  const [filterMenu, setFilterMenu] = useState<ColumnKey | null>(null), [filterSearch, setFilterSearch] = useState(''), [pendingFilter, setPendingFilter] = useState<string[]>([])
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 })
  const original = useRef(JSON.stringify(emptyDraft())), frameRef = useRef<HTMLDivElement>(null), formRef = useRef<HTMLDivElement>(null)
  const dirty = mode !== 'view' && JSON.stringify(draft) !== original.current, visibleColumns = columns.filter(x => x.visible)
  const statusLabel = useCallback((x: Status) => ({ Draft: fa ? 'پیش‌نویس' : 'Draft', SubmittedToCommerce: fa ? 'ارسال‌شده به بازرگانی' : 'Sent to commerce', InCommerce: fa ? 'در حال پیگیری بازرگانی' : 'In commerce', Completed: fa ? 'تکمیل‌شده' : 'Completed', Cancelled: fa ? 'لغوشده' : 'Cancelled' })[x], [fa])
  const priorityLabel = useCallback((x: Priority) => x === 'Urgent' ? (fa ? 'فوری' : 'Urgent') : (fa ? 'عادی' : 'Normal'), [fa])
  const fmt = useCallback((x?: number) => x === undefined ? '' : new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US', { maximumFractionDigits: 6 }).format(x), [fa])
  const columnValue = useCallback((x: Order, key: ColumnKey) => {
    if (key === 'status') return statusLabel(x.status)
    if (key === 'priority') return priorityLabel(x.priority)
    if (key === 'orderDate' || key === 'requiredByDate') return formatPersianDate(String(x[key] ?? ''), '')
    if (['itemCount', 'totalQuantity', 'estimatedTotal'].includes(key)) return fmt(Number(x[key] ?? 0))
    return String(x[key] ?? '')
  }, [fmt, priorityLabel, statusLabel])
  const filtered = useMemo(() => {
    const result = orders.filter(x => columns.every(c => filters[c.key] === null || filters[c.key]!.includes(columnValue(x, c.key))))
    return [...result].sort((a, b) => {
      const av = columnValue(a, sort.key), bv = columnValue(b, sort.key), n = av.localeCompare(bv, fa ? 'fa' : 'en', { numeric: true })
      return sort.direction === 'asc' ? n : -n
    })
  }, [orders, columns, filters, columnValue, sort, fa])
  const filterValues = useMemo(() => filterMenu === null ? [] : [...new Set(orders.map(x => columnValue(x, filterMenu)))].sort((a, b) => a.localeCompare(b, fa ? 'fa' : 'en', { numeric: true })), [filterMenu, orders, columnValue, fa])
  const shownFilterValues = filterValues.filter(x => x.toLocaleLowerCase().includes(filterSearch.trim().toLocaleLowerCase()))
  const selectedIndex = Math.max(0, filtered.findIndex(x => x.id === selectedId))

  const applySelection = useCallback((order?: Order) => {
    setSelectedId(order?.id ?? ''); setSelected(order)
    if (order) { const value = copyDraft(order); setDraft(value); original.current = JSON.stringify(value) }
  }, [])
  const loadDetail = useCallback(async (id: string) => {
    const order = demoMode ? demoOrders.find(x => x.id === id) : await api<Order>(`/api/purchase-orders/${id}`)
    applySelection(order)
  }, [demoMode, applySelection])
  const load = useCallback(async (preferId?: string) => {
    setLoading(true); setError('')
    try {
      const [orderRows, yarnRows, personRows] = demoMode
        ? [{ items: demoOrders, total: demoOrders.length }, { items: demoYarns, total: demoYarns.length }, { items: demoPeople, total: demoPeople.length }]
        : await Promise.all([
          api<PageResult<Order>>('/api/purchase-orders?page=1&pageSize=500'),
          api<PageResult<Yarn>>('/api/yarns?page=1&pageSize=500&includeInactive=false'),
          api<PageResult<Person>>('/api/master-data/persons?page=1&pageSize=500&includeInactive=false')
        ])
      setOrders(orderRows.items); setYarns(yarnRows.items); setPeople(personRows.items)
      const next = orderRows.items.find(x => x.id === preferId) ?? orderRows.items[0]
      if (next) await loadDetail(next.id); else applySelection()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [demoMode, loadDetail, applySelection])
  useEffect(() => { void load() }, [load])
  useEffect(() => { localStorage.setItem(columnKey, JSON.stringify(columns)) }, [columnKey, columns])
  useEffect(() => { const fn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }; addEventListener('beforeunload', fn); return () => removeEventListener('beforeunload', fn) }, [dirty])
  useEffect(() => { if (mode !== 'view') requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus()) }, [mode])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(x => ({ ...x, [key]: value })); setFieldErrors(x => ({ ...x, [key]: '' })) }
  const setItem = (index: number, patch: Partial<OrderItem>) => { setDraft(x => ({ ...x, items: x.items.map((item, i) => i === index ? { ...item, ...patch } : item) })); setFieldErrors(x => ({ ...x, [`item-${index}`]: '' })) }
  function changeYarn(index: number, yarnItemId: string) {
    const yarn = yarns.find(x => x.id === yarnItemId)
    setItem(index, { yarnItemId, descriptionSnapshot: yarn?.comprehensiveName ?? '', unit: yarn?.unitOfMeasure ?? 'KG' })
  }
  const validate = useCallback(() => {
    const errors: Record<string, string> = {}
    if (fieldErrors.orderDate) errors.orderDate = fieldErrors.orderDate
    if (fieldErrors.requiredByDate) errors.requiredByDate = fieldErrors.requiredByDate
    if (!draft.orderNumber.trim()) errors.orderNumber = fa ? 'شماره سفارش الزامی است.' : 'Order number is required.'
    if (!draft.orderDate) errors.orderDate = fa ? 'تاریخ سفارش الزامی است.' : 'Order date is required.'
    if (draft.requiredByDate && draft.requiredByDate < draft.orderDate) errors.requiredByDate = fa ? 'تاریخ نیاز نمی‌تواند قبل از سفارش باشد.' : 'Required date cannot be earlier.'
    if (!draft.items.length) errors.items = fa ? 'حداقل یک ردیف نخ لازم است.' : 'At least one item is required.'
    draft.items.forEach((x, i) => {
      if (!x.yarnItemId) errors[`item-${i}`] = fa ? 'نخ را انتخاب کنید.' : 'Select yarn.'
      else if (!(x.quantity > 0)) errors[`item-${i}`] = fa ? 'مقدار باید بیشتر از صفر باشد.' : 'Quantity must be positive.'
      else if (x.estimatedUnitPrice !== undefined && x.estimatedUnitPrice < 0) errors[`item-${i}`] = fa ? 'قیمت نمی‌تواند منفی باشد.' : 'Price cannot be negative.'
    })
    setFieldErrors(errors); return Object.keys(errors).length === 0
  }, [draft, fa, fieldErrors.orderDate, fieldErrors.requiredByDate])
  const beginNew = useCallback(async () => {
    const value = emptyDraft()
    const fallback = `POR-${new Date().getFullYear()}-0001`
    const latest = [...orders].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))[0]?.orderNumber
    value.orderNumber = incrementSerial(latest, fallback)
    try { value.orderNumber = await suggestSerial('purchase-order', demoMode, latest, fallback) }
    catch { /* شماره محلی بالا همچنان پیشنهاد می‌شود؛ ذخیره نهایی تکراری‌بودن را کنترل می‌کند. */ }
    setDraft(value); original.current = JSON.stringify(value); setMode('new'); setError(''); setMessage(''); setFieldErrors({})
  }, [demoMode, orders])
  const beginEdit = useCallback(() => { if (!selected || selected.status !== 'Draft') return; const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({}) }, [selected])
  const cancel = useCallback(() => {
    if (dirty && !confirm(fa ? 'اطلاعات تغییر کرده است. از خروج اطمینان دارید؟' : 'Information changed. Exit?')) return
    setMode('view'); setFieldErrors({}); setError(''); if (selected) { const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value) }
  }, [dirty, fa, selected])
  const save = useCallback(async () => {
    if (mode === 'view' || !validate()) return
    setError(''); setMessage('')
    try {
      const body = { ...draft, requiredByDate: draft.requiredByDate || null, preferredSupplierId: draft.preferredSupplierId || null, items: draft.items.map(x => ({ ...x, estimatedUnitPrice: x.estimatedUnitPrice ?? null })) }
      if (demoMode) {
        const id = mode === 'new' ? crypto.randomUUID() : selectedId
        const order: Order = { id, status: 'Draft', itemCount: draft.items.length, totalQuantity: draft.items.reduce((s, x) => s + x.quantity, 0), estimatedTotal: draft.items.reduce((s, x) => s + x.quantity * (x.estimatedUnitPrice ?? 0), 0), createdAtUtc: mode === 'new' ? new Date().toISOString() : selected?.createdAtUtc ?? new Date().toISOString(), ...draft, requiredByDate: draft.requiredByDate || undefined, preferredSupplierId: draft.preferredSupplierId || undefined }
        setOrders(x => mode === 'new' ? [order, ...x] : x.map(y => y.id === id ? order : y)); setMode('view'); applySelection(order)
      } else {
        const saved = mode === 'new'
          ? await apiRequest<Order>('/api/purchase-orders', { method: 'POST', body: JSON.stringify(body) })
          : await apiRequest<Order>(withRowVersion(`/api/purchase-orders/${selectedId}`, selected?.rowVersion), { method: 'PUT', body: JSON.stringify(body) })
        setMode('view'); await load(saved.id)
      }
      setMessage(fa ? 'سفارش خرید با موفقیت ثبت شد.' : 'Purchase order saved.')
    } catch (e) { if (isConcurrencyConflict(e)) { setMode('view'); setFieldErrors({}); await load(selectedId) }; setError(e instanceof Error ? e.message : String(e)) }
  }, [selected?.rowVersion, mode, validate, draft, demoMode, selectedId, orders.length, selected, applySelection, load, fa])
  const remove = useCallback(async () => {
    if (!selected || selected.status !== 'Draft' || !confirm(fa ? `سفارش «${selected.orderNumber}» حذف شود؟` : `Delete ${selected.orderNumber}?`)) return
    try {
      if (demoMode) { const next = orders.filter(x => x.id !== selected.id); setOrders(next); applySelection(next[0]) }
      else { await apiRequest<void>(withRowVersion(`/api/purchase-orders/${selected.id}`, selected.rowVersion), { method: 'DELETE' }); await load() }
      setMessage(fa ? 'سفارش حذف شد.' : 'Order deleted.')
    } catch (e) { if (isConcurrencyConflict(e)) { await load(selected.id); setError(e.message); return }; setError(e instanceof ApiError && e.status === 409 ? (fa ? 'این سفارش دیگر قابل حذف نیست.' : e.message) : e instanceof Error ? e.message : String(e)) }
  }, [selected, fa, demoMode, orders, applySelection, load])
  const transition = useCallback(async (action: 'submit' | 'accept') => {
    if (!selected) return
    const text = action === 'submit' ? (fa ? 'سفارش برای پیگیری به کارتابل بازرگانی ارسال شود؟' : 'Send to commerce?') : (fa ? 'پیگیری این سفارش توسط بازرگانی آغاز شود؟' : 'Accept in commerce?')
    if (!confirm(text)) return
    try {
      if (demoMode) {
        const value = { ...selected, status: action === 'submit' ? 'SubmittedToCommerce' as Status : 'InCommerce' as Status }
        setOrders(x => x.map(y => y.id === value.id ? value : y)); applySelection(value)
      } else { await apiRequest<Order>(withRowVersion(`/api/purchase-orders/${selected.id}/${action}`, selected.rowVersion), { method: 'POST' }); await load(selected.id) }
      window.dispatchEvent(new Event('purchase-orders-changed'))
      setMessage(action === 'submit' ? (fa ? 'سفارش به کارتابل بازرگانی ارسال شد.' : 'Sent to commerce.') : (fa ? 'پیگیری بازرگانی آغاز شد.' : 'Commerce follow-up started.'))
    } catch (e) { if (isConcurrencyConflict(e)) await load(selected.id); setError(e instanceof Error ? e.message : String(e)) }
  }, [selected, fa, demoMode, applySelection, load])
  const move = useCallback((where: 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end') => {
    if (!filtered.length) return
    const delta = where === 'up' ? -1 : where === 'down' ? 1 : where === 'pageUp' ? -10 : where === 'pageDown' ? 10 : 0
    const index = where === 'home' ? 0 : where === 'end' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, selectedIndex + delta))
    void loadDetail(filtered[index].id)
  }, [filtered, selectedIndex, loadDetail])
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (mode !== 'view') { if (e.key === 'F3') { e.preventDefault(); void save() } else if (e.key === 'Escape') { e.preventDefault(); cancel() }; return }
      if (e.key === 'Escape') { e.preventDefault(); if (filterMenu !== null) setFilterMenu(null); else window.dispatchEvent(new Event('close-active-form')); return }
      if (typing) return
      if (e.code === 'Space') { e.preventDefault(); void beginNew() } else if (e.key === 'Insert') { e.preventDefault(); beginEdit() } else if (e.key === 'Delete') { e.preventDefault(); void remove() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move('up') } else if (e.key === 'ArrowDown') { e.preventDefault(); move('down') }
      else if (e.key === 'PageUp') { e.preventDefault(); move('pageUp') } else if (e.key === 'PageDown') { e.preventDefault(); move('pageDown') } else if (e.key === 'Home') { e.preventDefault(); move('home') } else if (e.key === 'End') { e.preventDefault(); move('end') }
    }; addEventListener('keydown', fn); return () => removeEventListener('keydown', fn)
  }, [mode, save, cancel, beginNew, beginEdit, remove, move, filterMenu])

  function formKeyDown(e: React.KeyboardEvent) {
    if (mode === 'view' || e.altKey || e.ctrlKey || e.metaKey || e.key !== 'Enter') return
    if (!validateCurrentControl(e.target as HTMLElement)) e.preventDefault()
  }
  function validateCurrentControl(target: HTMLElement) {
    const field = target.dataset.field
    let validationError = ''
    if (field === 'orderNumber' && !draft.orderNumber.trim()) validationError = fa ? 'شماره سفارش الزامی است.' : 'Order number is required.'
    if (field === 'orderDate' && !draft.orderDate) validationError = fa ? 'تاریخ سفارش الزامی است.' : 'Order date is required.'
    if (field === 'requiredByDate' && draft.requiredByDate && draft.requiredByDate < draft.orderDate) validationError = fa ? 'تاریخ نیاز نمی‌تواند قبل از سفارش باشد.' : 'Required date cannot be earlier.'
    const line = target.closest<HTMLTableRowElement>('tr[data-line-index]')
    if (line) {
      const index = Number(line.dataset.lineIndex), item = draft.items[index]
      if (!item.yarnItemId) validationError = fa ? 'نخ را انتخاب کنید.' : 'Select yarn.'
      else if (!(item.quantity > 0)) validationError = fa ? 'مقدار باید بیشتر از صفر باشد.' : 'Quantity must be positive.'
      setFieldErrors(x => ({ ...x, [`item-${index}`]: validationError }))
    } else if (field) setFieldErrors(x => ({ ...x, [field]: validationError }))
    return !validationError
  }
  function resizeStart(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId); const startY = e.clientY, start = topHeight, height = frameRef.current?.clientHeight ?? 720
    const moveResize = (x: PointerEvent) => setTopHeight(Math.max(330, Math.min(height - 250, start + x.clientY - startY)))
    const stop = () => { removeEventListener('pointermove', moveResize); removeEventListener('pointerup', stop); setTopHeight(x => { localStorage.setItem(splitKey, String(Math.round(x))); return x }) }
    addEventListener('pointermove', moveResize); addEventListener('pointerup', stop)
  }
  function resizeColumn(e: React.PointerEvent, key: ColumnKey) {
    e.stopPropagation(); const startX = e.clientX, width = columns.find(x => x.key === key)?.width ?? 120, direction = document.documentElement.dir === 'rtl' ? -1 : 1
    const moveResize = (x: PointerEvent) => setColumns(all => all.map(c => c.key === key ? { ...c, width: Math.max(75, width + (x.clientX - startX) * direction) } : c))
    const stop = () => { removeEventListener('pointermove', moveResize); removeEventListener('pointerup', stop) }; addEventListener('pointermove', moveResize); addEventListener('pointerup', stop)
  }
  function openFilter(key: ColumnKey, anchor: HTMLElement) {
    const values = [...new Set(orders.map(x => columnValue(x, key)))], rect = anchor.getBoundingClientRect(), width = 320, height = 400
    setFilterPosition({ top: Math.max(8, Math.min(rect.bottom + 2, innerHeight - height - 8)), left: Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)) })
    setFilterMenu(key); setFilterSearch(''); setPendingFilter(filters[key] ?? values)
  }
  function applyFilter(key: ColumnKey) {
    const all = [...new Set(orders.map(x => columnValue(x, key)))]; setFilters(x => ({ ...x, [key]: pendingFilter.length === all.length ? null : pendingFilter })); setFilterMenu(null)
  }
  const labels: Record<ColumnKey, string> = { orderNumber: fa ? 'شماره سفارش' : 'Order no.', orderDate: fa ? 'تاریخ سفارش' : 'Order date', requiredByDate: fa ? 'تاریخ نیاز' : 'Required by', status: fa ? 'وضعیت' : 'Status', priority: fa ? 'اولویت' : 'Priority', itemCount: fa ? 'ردیف' : 'Items', totalQuantity: fa ? 'جمع مقدار' : 'Quantity', estimatedTotal: fa ? 'جمع احتمالی' : 'Estimate', currency: fa ? 'ارز' : 'Currency' }
  const disabled = mode === 'view', suppliers = people.filter(x => x.isActive && (!x.job || ['SUPPLIER', 'PARTNER'].includes(x.job.code)))
  const estimate = draft.items.reduce((sum, x) => sum + x.quantity * (x.estimatedUnitPrice ?? 0), 0)

  return <div className="persons-page purchase-orders-page" ref={frameRef} style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px,1fr)` }}>
    <section className="person-editor panel purchase-order-editor" ref={formRef} onKeyDown={formKeyDown}>
      <div className="person-section-head"><div><h2>{fa ? 'اطلاعات سفارش خرید نخ' : 'Yarn purchase order'}</h2><p>{mode === 'new' ? (fa ? 'سفارش جدید' : 'New order') : mode === 'edit' ? (fa ? 'اصلاح پیش‌نویس' : 'Edit draft') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div><div className="order-head-badges">{selected && <span className={`order-status ${selected.status}`}>{statusLabel(selected.status)}</span>}<span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span></div></div>
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid order-header-grid ${mode !== 'view' ? 'editing' : ''}`}>
        <Field label={fa ? 'شماره سفارش *' : 'Order number *'} error={fieldErrors.orderNumber}><input data-field="orderNumber" disabled={disabled} maxLength={30} value={draft.orderNumber} onChange={e => set('orderNumber', e.target.value)} /></Field>
        <Field label={fa ? 'تاریخ سفارش (شمسی) *' : 'Order date (Persian) *'} error={fieldErrors.orderDate}><SystemDateInput calendar="persian" required suggestToday language={language} disabled={disabled} value={draft.orderDate} onChange={value => set('orderDate', value)} onError={value => setFieldErrors(current => ({ ...current, orderDate: value }))} /></Field>
        <Field label={fa ? 'تاریخ مورد نیاز (شمسی)' : 'Required by (Persian)'} error={fieldErrors.requiredByDate}><SystemDateInput calendar="persian" language={language} disabled={disabled} value={draft.requiredByDate} onChange={value => set('requiredByDate', value)} onError={value => setFieldErrors(current => ({ ...current, requiredByDate: value }))} /></Field>
        <Field label={fa ? 'اولویت' : 'Priority'}><select data-field="priority" disabled={disabled} value={draft.priority} onChange={e => set('priority', e.target.value as Priority)}><option value="Normal">{priorityLabel('Normal')}</option><option value="Urgent">{priorityLabel('Urgent')}</option></select></Field>
        <Field label={fa ? 'ارز قیمت احتمالی' : 'Estimate currency'}><select data-field="currency" disabled={disabled} value={draft.currency} onChange={e => set('currency', e.target.value as Currency)}>{(['USD', 'CNY', 'EUR', 'IRR'] as Currency[]).map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label={fa ? 'تأمین‌کننده پیشنهادی' : 'Preferred supplier'}><select data-field="preferredSupplierId" disabled={disabled} value={draft.preferredSupplierId} onChange={e => set('preferredSupplierId', e.target.value)}><option value="">—</option>{suppliers.map(x => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select></Field>
        <Field label={fa ? 'توضیحات سفارش' : 'Order notes'} wide><input data-field="notes" disabled={disabled} maxLength={1000} value={draft.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
      <div className="order-lines-head"><div><b>{fa ? 'اقلام درخواستی' : 'Requested yarns'}</b><span>{fa ? `${draft.items.length} ردیف — جمع احتمالی: ${fmt(estimate)} ${draft.currency}` : `${draft.items.length} items — Estimate: ${fmt(estimate)} ${draft.currency}`}</span></div>{!disabled && <button type="button" className="line-control primary" onClick={() => set('items', [...draft.items, newItem()])}>＋ {fa ? 'ردیف جدید' : 'Add item'}</button>}</div>
      {fieldErrors.items && <div className="line-error">{fieldErrors.items}</div>}
      <div className="order-lines-wrap"><table className="order-lines-table"><thead><tr><th>#</th><th>{fa ? 'نخ *' : 'Yarn *'}</th><th>{fa ? 'نام فراگیر/شرح' : 'Description'}</th><th>{fa ? 'مقدار *' : 'Quantity *'}</th><th>{fa ? 'واحد' : 'Unit'}</th><th>{fa ? 'قیمت احتمالی' : 'Est. price'}</th><th>{fa ? 'جمع' : 'Amount'}</th><th>{fa ? 'مشخصات مورد نیاز' : 'Specifications'}</th>{!disabled && <th />}</tr></thead><tbody>{draft.items.map((item, index) => <tr key={item.id ?? index} data-line-index={index} className={fieldErrors[`item-${index}`] ? 'invalid-line' : ''}><td>{index + 1}</td><td><select disabled={disabled} value={item.yarnItemId} onChange={e => changeYarn(index, e.target.value)}><option value="">—</option>{yarns.filter(x => x.isActive).map(x => <option key={x.id} value={x.id}>{x.code} — {x.comprehensiveName}</option>)}</select></td><td title={item.descriptionSnapshot}>{item.descriptionSnapshot || '—'}</td><td><input className="ltr-input" disabled={disabled} type="number" min={0} step="any" value={item.quantity || ''} onChange={e => setItem(index, { quantity: Number(e.target.value) })} /></td><td><select disabled={disabled} value={item.unit} onChange={e => setItem(index, { unit: e.target.value })}>{['KG', 'COUNT', 'CONE', 'HANK'].map(x => <option key={x}>{x}</option>)}</select></td><td><input className="ltr-input" disabled={disabled} type="number" min={0} step="any" value={item.estimatedUnitPrice ?? ''} onChange={e => setItem(index, { estimatedUnitPrice: e.target.value === '' ? undefined : Number(e.target.value) })} /></td><td className="mono">{fmt(item.quantity * (item.estimatedUnitPrice ?? 0))}</td><td><input disabled={disabled} maxLength={1000} value={item.requiredSpecifications ?? ''} onChange={e => setItem(index, { requiredSpecifications: e.target.value })} /></td>{!disabled && <td><button type="button" className="line-control remove-line" disabled={draft.items.length === 1} onClick={() => set('items', draft.items.filter((_, i) => i !== index))}>×</button></td>}</tr>)}</tbody></table></div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      <div className="grid-toolbar"><div><h2>{fa ? 'فهرست سفارش‌های خرید' : 'Purchase orders'}</h2><span>{fa ? `${filtered.length} از ${orders.length} رکورد` : `${filtered.length} of ${orders.length}`}</span></div><details className="column-picker"><summary>☷ {fa ? 'ستون‌ها' : 'Columns'}</summary><div>{columns.map(c => <label key={c.key}><input type="checkbox" checked={c.visible} disabled={c.visible && visibleColumns.length === 1} onChange={() => setColumns(all => all.map(x => x.key === c.key ? { ...x, visible: !x.visible } : x))} />{labels[c.key]}</label>)}<button type="button" onClick={() => setColumns(defaultColumns)}>↺ {fa ? 'پیش‌فرض' : 'Reset'}</button></div></details></div>
      <div className="person-table-wrap"><table className="person-table excel-grid" style={{ minWidth: visibleColumns.reduce((s, x) => s + x.width, 0) }}><colgroup>{visibleColumns.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup><thead><tr>{visibleColumns.map(c => <th key={c.key}><div className="column-heading"><button type="button" className="column-title" onClick={() => setSort(x => x.key === c.key ? { key: c.key, direction: x.direction === 'asc' ? 'desc' : 'asc' } : { key: c.key, direction: 'asc' })}>{labels[c.key]}<span>{sort.key === c.key ? sort.direction === 'asc' ? '▲' : '▼' : ''}</span></button><button type="button" className={`excel-filter-trigger ${filters[c.key] !== null ? 'active' : ''}`} onClick={e => filterMenu === c.key ? setFilterMenu(null) : openFilter(c.key, e.currentTarget)}>▼</button></div>
        {filterMenu === c.key && <div className="excel-filter-menu" style={filterPosition}><button type="button" className="filter-command" onClick={() => { setSort({ key: c.key, direction: 'asc' }); setFilterMenu(null) }}><b>AZ↓</b><span>{fa ? 'مرتب‌سازی صعودی' : 'Sort ascending'}</span></button><button type="button" className="filter-command" onClick={() => { setSort({ key: c.key, direction: 'desc' }); setFilterMenu(null) }}><b>ZA↓</b><span>{fa ? 'مرتب‌سازی نزولی' : 'Sort descending'}</span></button><button type="button" className="filter-command clear" disabled={filters[c.key] === null} onClick={() => { setFilters(x => ({ ...x, [c.key]: null })); setFilterMenu(null) }}>⊘ <span>{fa ? 'پاک کردن فیلتر' : 'Clear filter'}</span></button><input className="filter-value-search" autoFocus value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder={fa ? 'جستجو…' : 'Search…'} /><div className="filter-values"><label><input type="checkbox" checked={pendingFilter.length === filterValues.length} onChange={e => setPendingFilter(e.target.checked ? filterValues : [])} />{fa ? '(انتخاب همه)' : '(Select All)'}</label>{shownFilterValues.map(v => <label key={v}><input type="checkbox" checked={pendingFilter.includes(v)} onChange={e => setPendingFilter(x => e.target.checked ? [...x, v] : x.filter(y => y !== v))} />{v || (fa ? '(خالی)' : '(Blanks)')}</label>)}</div><div className="filter-actions"><button type="button" className="primary" onClick={() => applyFilter(c.key)}>{fa ? 'تأیید' : 'OK'}</button><button type="button" onClick={() => setFilterMenu(null)}>{fa ? 'انصراف' : 'Cancel'}</button></div></div>}<i className="column-resizer" onPointerDown={e => resizeColumn(e, c.key)} /></th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan={visibleColumns.length}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : filtered.length ? filtered.map(x => <tr key={x.id} className={x.id === selectedId ? 'selected' : ''} onClick={() => mode === 'view' && void loadDetail(x.id)} onDoubleClick={beginEdit}>{visibleColumns.map(c => <td key={c.key}>{c.key === 'status' ? <span className={`order-status ${x.status}`}>{columnValue(x, c.key)}</span> : c.key === 'orderNumber' ? <span className="mono">{x.orderNumber}</span> : columnValue(x, c.key) || '—'}</td>)}</tr>) : <tr><td colSpan={visibleColumns.length}>{fa ? 'سفارشی ثبت نشده است.' : 'No orders.'}</td></tr>}
      </tbody></table></div>
      <div className="shortcut-bar">{mode === 'view' ? <><Shortcut code="Space" label={fa ? 'سفارش جدید' : 'New'} onClick={beginNew} primary disabled={!hasPermission('purchaseOrders.create')} /><Shortcut code="Insert" label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!hasPermission('purchaseOrders.edit') || !selected || selected.status !== 'Draft'} /><Shortcut code="Delete" label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!hasPermission('purchaseOrders.delete') || !selected || selected.status !== 'Draft'} />{selected?.status === 'Draft' && <Shortcut code="ارسال" label={fa ? 'به بازرگانی' : 'To commerce'} onClick={() => void transition('submit')} primary disabled={!hasPermission('purchaseOrders.submit')} />}{selected?.status === 'SubmittedToCommerce' && <Shortcut code="قبول" label={fa ? 'شروع پیگیری' : 'Accept'} onClick={() => void transition('accept')} primary disabled={!hasPermission('commerce.accept')} />}<Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move('home')} /><Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Page up'} onClick={() => move('pageUp')} /><Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move('down')} /><Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Page down'} onClick={() => move('pageDown')} /><Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move('end')} /></> : <><Shortcut code="F3" label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary /><Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} /></>}</div>
    </section>
  </div>
}

function Field({ label, wide, error, children }: { label: string, wide?: boolean, error?: string, children: React.ReactNode }) {
  return <label className={`${wide ? 'wide-field' : ''} ${error ? 'invalid-field' : ''}`}><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}
function Shortcut({ code, label, onClick, primary, danger, disabled }: { code: string, label: string, onClick: () => void, primary?: boolean, danger?: boolean, disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`${primary ? 'primary' : ''} ${danger ? 'danger-shortcut' : ''}`} onClick={onClick}><kbd>{code}</kbd><span>{label}</span></button>
}
