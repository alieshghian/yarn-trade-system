import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { api, apiRequest, downloadAttachment, hasPermission } from './api'
import type { Language } from './i18n'
import SystemDateInput from './SystemDateInput'
import { formatPersianDate } from './persianDate'

type Status = 'SubmittedToCommerce' | 'InCommerce' | 'Completed'
type OrderRow = { id: string, orderNumber: string, orderDate: string, requiredByDate?: string, priority: string, currency: string, preferredSupplierId?: string, status: Status, itemCount: number, totalQuantity: number, estimatedTotal: number, createdAtUtc: string }
type OrderItem = { id: string, lineNumber: number, yarnItemId: string, yarnCode: string, descriptionSnapshot: string, quantity: number, unit: string, estimatedUnitPrice?: number, requiredSpecifications?: string, notes?: string }
type OrderDetail = OrderRow & { notes?: string, items: OrderItem[] }
type InvoiceItem = { id?: string, yarnItemId?: string, originalDescription: string, originalSpecification?: string, unit: string, netWeight: number, grossWeight: number, packageCount: number, unitPriceUSD: number, goodsAmountUSD: number, notes?: string }
type Container = { id?: string, containerNumber: string, sealNumber?: string, containerType?: string, billOfLadingNumber?: string, netWeight: number, grossWeight: number, packageCount: number, notes?: string }
type Invoice = {
  id: string, purchaseOrderId?: string, internalNumber: string, externalInvoiceNumber?: string, invoiceDate: string, supplierId: string,
  buyerName?: string, orderNumber?: string, billOfLadingNumber?: string, originPort?: string, destinationPort?: string,
  deliveryTerms?: string, paymentTerms?: string, shipmentMethod?: string, currency: string, goodsTotal: number,
  internationalFreight: number, otherForeignCosts: number, grandTotal: number, totalNetWeight: number,
  totalGrossWeight: number, totalPackages: number, status: 'Draft' | 'Posted', notes?: string, items: InvoiceItem[], containers: Container[]
}
type Person = { id: string, displayName: string }
type Warehouse = { id: string, code: string, nameFa: string, nameEn: string }
type Attachment = { id: string, documentType: string, originalFileName: string, fileSize: number, uploadedAtUtc: string }
type Yarn = { id: string, code: string, nameFa: string, comprehensiveName: string }
type ComparisonLine = { yarnItemId?: string, yarnCode: string, yarnName: string, orderedQuantity: number, invoicedQuantity: number, orderedUnitPrice?: number, invoicedUnitPrice?: number, issues: string[] }
type Comparison = { hasDiscrepancy: boolean, headerIssues: string[], lines: ComparisonLine[] }
type Page<T> = { items: T[], total: number }
type Workbench = { orders: Page<OrderRow>, people: Page<Person>, warehouses: Warehouse[], yarns: Page<Yarn> }
type OrderWorkbench = { order: OrderDetail, invoice?: Invoice, attachments: Attachment[], comparison?: Comparison }

export default function CommercePage({ language, initialOrderId, actionRequest, onChanged }: { language: Language, initialOrderId?: string, actionRequest?: number, onChanged?: () => void }) {
  const fa = language === 'fa'
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [order, setOrder] = useState<OrderDetail>()
  const [invoice, setInvoice] = useState<Invoice>()
  const [people, setPeople] = useState<Person[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [yarns, setYarns] = useState<Yarn[]>([])
  const [comparison, setComparison] = useState<Comparison>()
  const [dirty, setDirty] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [documentType, setDocumentType] = useState('PurchaseInvoice')
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const documentInput = useRef<HTMLInputElement>(null), importInput = useRef<HTMLInputElement>(null)

  const statusLabel = (value: Status) => value === 'SubmittedToCommerce' ? (fa ? 'جدید در کارتابل' : 'New')
    : value === 'InCommerce' ? (fa ? 'در حال پیگیری' : 'In progress') : (fa ? 'ارسال‌شده به انبار' : 'Sent to warehouse')

  const loadOrders = useCallback(async (preferId?: string) => {
    setLoading(true)
    try {
      const data = await api<Workbench>('/api/commerce/workbench')
      setOrders(data.orders.items); setPeople(data.people.items); setWarehouses(data.warehouses); setYarns(data.yarns.items)
      setWarehouseId(current => current || data.warehouses[0]?.id || '')
      const nextId = preferId && data.orders.items.some(x => x.id === preferId) ? preferId : data.orders.items[0]?.id
      if (nextId) setSelectedId(nextId)
      else { setSelectedId(''); setOrder(undefined); setInvoice(undefined); setAttachments([]) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  const loadDetail = useCallback(async (id: string): Promise<boolean> => {
    setError(''); setMessage('')
    try {
      const data = await api<OrderWorkbench>(`/api/commerce/orders/${id}/workbench`)
      setOrder(data.order); setInvoice(data.invoice); setDirty(false); setAttachments(data.attachments); setComparison(data.comparison)
      return true
    } catch (e) { setOrder(undefined); setInvoice(undefined); setAttachments([]); setComparison(undefined); setError(e instanceof Error ? e.message : String(e)); return false }
  }, [])

  useEffect(() => { void loadOrders(initialOrderId) }, [loadOrders, initialOrderId])
  useEffect(() => {
    if (!initialOrderId || !actionRequest) return
    setSelectedId(initialOrderId)
    void loadDetail(initialOrderId).then(ok => { if (ok) setMessage(fa ? 'سفارش برای اقدام بازرگانی باز شد و زمان‌سنج آن متوقف گردید.' : 'The order was opened for action and its timer stopped.') })
  }, [initialOrderId, actionRequest, loadDetail, fa])
  useEffect(() => { if (selectedId) void loadDetail(selectedId) }, [selectedId, loadDetail])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!dirty || confirm(fa ? 'تغییرات ذخیره نشده است. از فرم خارج می‌شوید؟' : 'Discard unsaved changes?')) window.dispatchEvent(new Event('close-active-form'))
      }
      if (event.key === 'F3' && editable) { event.preventDefault(); void save() }
    }
    addEventListener('keydown', escape); return () => removeEventListener('keydown', escape)
  }, [dirty, fa, invoice])

  const setInvoiceField = <K extends keyof Invoice>(key: K, value: Invoice[K]) => { setDirty(true); setInvoice(current => current ? { ...current, [key]: value } : current) }
  const setItem = (index: number, patch: Partial<InvoiceItem>) => { setDirty(true); setInvoice(current => current ? ({ ...current, items: current.items.map((x, i) => i === index ? { ...x, ...patch } : x) }) : current) }
  const setContainer = (index: number, patch: Partial<Container>) => { setDirty(true); setInvoice(current => current ? ({ ...current, containers: current.containers.map((x, i) => i === index ? { ...x, ...patch } : x) }) : current) }

  async function accept() {
    if (!order) return
    try { await apiRequest(`/api/purchase-orders/${order.id}/accept`, { method: 'POST' }); await loadOrders(order.id); await loadDetail(order.id); onChanged?.(); setMessage(fa ? 'پیگیری سفارش آغاز شد.' : 'Order accepted.') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function createInvoice() {
    if (!order) return
    try {
      const value = await apiRequest<Invoice>(`/api/commerce/orders/${order.id}/invoice`, { method: 'POST' })
      setInvoice(value); await loadOrders(order.id); await loadDetail(order.id); onChanged?.()
      setMessage(fa ? 'پیش‌نویس فاکتور خرید از روی سفارش ایجاد شد.' : 'Purchase draft created.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function save() {
    if (!invoice || invoice.status !== 'Draft') return
    if (!invoice.supplierId || invoice.items.length === 0 || invoice.items.some(x => !x.yarnItemId || !x.originalDescription.trim() || x.netWeight <= 0)) {
      setError(fa ? 'نخ سیستم، شرح و وزن خالص مثبت برای تمام ردیف‌های فاکتور الزامی است.' : 'System yarn, description and positive net weight are required.'); return
    }
    if (invoice.containers.some(x => !x.containerNumber.trim())) { setError(fa ? 'شماره کانتینر در تمام ردیف‌های بسته‌بندی الزامی است.' : 'Container number is required.'); return }
    try {
      await apiRequest(`/api/purchases/${invoice.id}`, { method: 'PUT', body: JSON.stringify(invoice) })
      await loadDetail(selectedId); setDirty(false); setMessage(fa ? 'اطلاعات فاکتور و نتیجه تطبیق ثبت شد.' : 'Purchase and comparison saved.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function importExcel(file?: File) {
    if (!file || !order) return
    const data = new FormData(); data.append('file', file)
    try {
      await apiRequest(`/api/commerce/orders/${order.id}/import`, { method: 'POST', body: data })
      await loadOrders(order.id); await loadDetail(order.id); onChanged?.()
      setMessage(fa ? 'فاکتور و پکینگ‌لیست Excel استخراج و برای اصلاح نمایش داده شد.' : 'Excel invoice imported.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { if (importInput.current) importInput.current.value = '' }
  }

  async function uploadDocument(file?: File) {
    if (!file || !order) return
    const entityType = invoice ? 'PurchaseInvoice' : 'PurchaseOrder'
    const entityId = invoice?.id ?? order.id
    const data = new FormData()
    data.append('file', file); data.append('entityType', entityType); data.append('entityId', entityId); data.append('documentType', documentType)
    try {
      await apiRequest('/api/attachments', { method: 'POST', body: data })
      await loadDetail(order.id)
      setMessage(fa ? 'مدرک خرید ذخیره شد.' : 'Document uploaded.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { if (documentInput.current) documentInput.current.value = '' }
  }

  async function deleteDocument(item: Attachment) {
    if (!confirm(fa ? `مدرک «${item.originalFileName}» حذف شود؟` : `Delete ${item.originalFileName}?`)) return
    try {
      await apiRequest(`/api/attachments/${item.id}`, { method: 'DELETE' })
      setAttachments(current => current.filter(x => x.id !== item.id))
      setMessage(fa ? 'مدرک حذف شد؛ در صورت نیاز فایل صحیح را بارگذاری کنید.' : 'Document deleted.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function sendToWarehouse() {
    if (!invoice || !warehouseId) return
    if (dirty) { setError(fa ? 'ابتدا تغییرات را با F3 ثبت کنید و سپس نتیجه تطبیق را تأیید نمایید.' : 'Save changes with F3 before confirmation.'); return }
    const discrepancyText = comparison?.hasDiscrepancy
      ? (fa ? `مغایرت با سفارش خرید وجود دارد:\n${[...comparison.headerIssues, ...comparison.lines.flatMap(x => x.issues)].join('\n')}\n\nآیا اطلاعات فاکتور را صحیح می‌دانید و ثبت قطعی شود؟` : 'Differences exist. Confirm invoice data and post?')
      : (fa ? 'صحت اطلاعات فاکتور و دریافت اقلام را تأیید می‌کنید؟ پس از ثبت قطعی سند قابل ویرایش نیست.' : 'Confirm invoice data, receipt and posting?')
    if (!confirm(discrepancyText)) return
    try {
      await apiRequest(`/api/commerce/invoices/${invoice.id}/send-to-warehouse?warehouseId=${warehouseId}&confirmInvoiceData=true&confirmDiscrepancy=${comparison?.hasDiscrepancy === true}`, { method: 'POST' })
      await loadOrders(order?.id); if (order) await loadDetail(order.id); onChanged?.(); setMessage(fa ? 'گردش هر نخ ثبت و خرید به کارتابل انبار ارسال شد.' : 'Yarn movements posted and sent to warehouse.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const editable = invoice?.status === 'Draft' && hasPermission('commerce.edit')
  const displayedInvoice = useMemo<Invoice | undefined>(() => invoice ?? (order ? {
    id: '', purchaseOrderId: order.id, internalNumber: fa ? 'پس از ایجاد فاکتور' : 'After invoice creation',
    invoiceDate: order.orderDate, supplierId: order.preferredSupplierId ?? '', orderNumber: order.orderNumber,
    currency: order.currency, goodsTotal: order.estimatedTotal, internationalFreight: 0, otherForeignCosts: 0,
    grandTotal: order.estimatedTotal, totalNetWeight: order.totalQuantity, totalGrossWeight: 0,
    totalPackages: 0, status: 'Draft', notes: order.notes,
    items: order.items.map(item => ({
      id: item.id, yarnItemId: item.yarnItemId, originalDescription: item.descriptionSnapshot,
      originalSpecification: item.requiredSpecifications, unit: item.unit, netWeight: item.quantity,
      grossWeight: 0, packageCount: 0, unitPriceUSD: item.estimatedUnitPrice ?? 0,
      goodsAmountUSD: item.quantity * (item.estimatedUnitPrice ?? 0), notes: item.notes
    })), containers: []
  } : undefined), [invoice, order, fa])
  const orderPreview = Boolean(order && !invoice)
  const canUploadDocument = Boolean(order) && hasPermission('commerce.upload') && invoice?.status !== 'Posted' && order?.status !== 'Completed'
  const addItem = () => invoice && setInvoiceField('items', [...invoice.items, { originalDescription: '', unit: 'KG', netWeight: 0, grossWeight: 0, packageCount: 0, unitPriceUSD: 0, goodsAmountUSD: 0 }])
  const removeItem = (index: number) => invoice && setInvoiceField('items', invoice.items.filter((_, i) => i !== index))
  const moveOnEnter = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)')]
    fields[fields.indexOf(event.target as HTMLElement) + 1]?.focus()
  }
  return <div className="commerce-page">
    <section className="panel commerce-detail">
      <div className="person-section-head"><div><h2>{fa ? 'خرید نخ' : 'Yarn purchase'}</h2><p>{order ? `${order.orderNumber} — ${statusLabel(order.status)}` : (fa ? 'سفارشی انتخاب نشده است' : 'No order selected')}</p></div><div className="commerce-actions">
        {order?.status === 'SubmittedToCommerce' && hasPermission('commerce.accept') && <button className="primary" onClick={accept}>{fa ? 'پذیرش و شروع پیگیری' : 'Accept'}</button>}
        {order && !invoice && hasPermission('commerce.edit') && <button className="primary" onClick={createInvoice}>{fa ? 'ایجاد فاکتور خرید' : 'Create invoice'}</button>}
        {order && !invoice && hasPermission('commerce.upload') && <><input ref={importInput} hidden type="file" accept=".xlsx" onChange={e => void importExcel(e.target.files?.[0])} /><button onClick={() => importInput.current?.click()}>{fa ? 'استخراج Excel' : 'Import Excel'}</button></>}
        {editable && hasPermission('commerce.edit') && <button className="primary" onClick={save}>F3&nbsp; {fa ? 'ثبت اطلاعات' : 'Save'}</button>}
      </div></div>
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      {displayedInvoice ? <div className="commerce-scroll" onKeyDown={moveOnEnter}>
        {orderPreview && <div className="form-message success-message">{fa ? 'اطلاعات زیر، سربرگ و اقلام سفارش خرید است. پس از ایجاد یا استخراج فاکتور، همین بخش برای تطبیق و اصلاح فعال می‌شود.' : 'This preview shows the purchase-order header and lines. Create or import the invoice to reconcile and edit it.'}</div>}
        <div className="person-form-grid commerce-header-grid">
          <label><span>{fa ? 'شماره داخلی' : 'Internal no.'}</span><input disabled value={displayedInvoice.internalNumber} /></label>
          <label><span>{fa ? 'شماره فاکتور خارجی' : 'Invoice no.'}</span><input disabled={!editable} value={displayedInvoice.externalInvoiceNumber ?? ''} onChange={e => setInvoiceField('externalInvoiceNumber', e.target.value)} /></label>
          <label><span>{orderPreview ? (fa ? 'تاریخ سفارش' : 'Order date') : (fa ? 'تاریخ فاکتور' : 'Invoice date')}</span><SystemDateInput calendar="persian" disabled={!editable} value={displayedInvoice.invoiceDate} onChange={value => setInvoiceField('invoiceDate', value)} language={language} /></label>
          <label><span>{fa ? 'تأمین‌کننده' : 'Supplier'}</span><select disabled={!editable} value={displayedInvoice.supplierId} onChange={e => setInvoiceField('supplierId', e.target.value)}><option value="">{fa ? 'تعیین نشده' : 'Not specified'}</option>{people.map(x => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select></label>
          <label><span>{fa ? 'بارنامه' : 'B/L number'}</span><input disabled={!editable} value={displayedInvoice.billOfLadingNumber ?? ''} onChange={e => setInvoiceField('billOfLadingNumber', e.target.value)} /></label>
          <label><span>{fa ? 'خریدار' : 'Buyer'}</span><input disabled={!editable} value={displayedInvoice.buyerName ?? ''} onChange={e => setInvoiceField('buyerName', e.target.value)} /></label>
          <label><span>{fa ? 'شماره سفارش مرجع' : 'Order reference'}</span><input disabled={!editable} value={displayedInvoice.orderNumber ?? ''} onChange={e => setInvoiceField('orderNumber', e.target.value)} /></label>
          <label><span>{fa ? 'مبدأ' : 'Origin'}</span><input disabled={!editable} value={displayedInvoice.originPort ?? ''} onChange={e => setInvoiceField('originPort', e.target.value)} /></label>
          <label><span>{fa ? 'مقصد' : 'Destination'}</span><input disabled={!editable} value={displayedInvoice.destinationPort ?? ''} onChange={e => setInvoiceField('destinationPort', e.target.value)} /></label>
          <label><span>{fa ? 'شرایط تحویل' : 'Delivery terms'}</span><input disabled={!editable} value={displayedInvoice.deliveryTerms ?? ''} onChange={e => setInvoiceField('deliveryTerms', e.target.value)} /></label>
          <label><span>{fa ? 'شرایط پرداخت' : 'Payment terms'}</span><input disabled={!editable} value={displayedInvoice.paymentTerms ?? ''} onChange={e => setInvoiceField('paymentTerms', e.target.value)} /></label>
          <label><span>{fa ? 'روش حمل' : 'Shipment method'}</span><input disabled={!editable} value={displayedInvoice.shipmentMethod ?? ''} onChange={e => setInvoiceField('shipmentMethod', e.target.value)} /></label>
          <label><span>{fa ? 'حمل خارجی' : 'Freight'}</span><input className="ltr-input" type="number" disabled={!editable} value={displayedInvoice.internationalFreight || ''} onChange={e => setInvoiceField('internationalFreight', Number(e.target.value))} /></label>
          <label><span>{fa ? 'سایر هزینه خارجی' : 'Other costs'}</span><input className="ltr-input" type="number" disabled={!editable} value={displayedInvoice.otherForeignCosts || ''} onChange={e => setInvoiceField('otherForeignCosts', Number(e.target.value))} /></label>
        </div>
        <div className="commerce-section-title"><h3>{fa ? 'جزئیات فاکتور و گردش نخ' : 'Invoice lines and yarn movements'}</h3>{editable && <button type="button" onClick={addItem}>＋ {fa ? 'ردیف' : 'Line'}</button>}</div>
        <div className="commerce-table-wrap"><table className="commerce-edit-table purchase-detail-grid"><thead><tr><th>#</th><th>{fa ? 'نخ سیستم' : 'System yarn'}</th><th>{fa ? 'شرح مدرک' : 'Document description'}</th><th>{fa ? 'مقدار سفارش' : 'Ordered'}</th><th>{fa ? 'وزن خالص فاکتور' : 'Invoice net'}</th><th>{fa ? 'وزن ناخالص' : 'Gross'}</th><th>{fa ? 'بسته' : 'Packages'}</th><th>{fa ? 'قیمت واحد' : 'Unit price'}</th><th>{fa ? 'مبلغ' : 'Amount'}</th><th>{fa ? 'وضعیت تطبیق' : 'Comparison'}</th><th></th></tr></thead><tbody>
          {displayedInvoice.items.map((item, index) => { const compare = comparison?.lines.find(x => x.yarnItemId && x.yarnItemId === item.yarnItemId); const ordered = order?.items.find(x => x.yarnItemId === item.yarnItemId)?.quantity; return <tr key={item.id ?? index} className={compare?.issues.length ? 'difference-row' : ''}><td>{index + 1}</td><td><select disabled={!editable} value={item.yarnItemId ?? ''} onChange={e => { const yarn = yarns.find(x => x.id === e.target.value); setItem(index, { yarnItemId: e.target.value || undefined, originalDescription: item.originalDescription || yarn?.comprehensiveName || yarn?.nameFa || '' }) }}><option value="">{fa ? 'انتخاب نخ…' : 'Select yarn…'}</option>{yarns.map(x => <option key={x.id} value={x.id}>{x.code} — {x.comprehensiveName || x.nameFa}</option>)}</select></td><td><input disabled={!editable} value={item.originalDescription} onChange={e => setItem(index, { originalDescription: e.target.value })} /></td><td className="readonly-number">{(compare?.orderedQuantity ?? ordered)?.toLocaleString('en-US') ?? '—'}</td><td><input type="number" min="0" disabled={!editable} value={item.netWeight || ''} onChange={e => setItem(index, { netWeight: Number(e.target.value) })} /></td><td><input type="number" min="0" disabled={!editable} value={item.grossWeight || ''} onChange={e => setItem(index, { grossWeight: Number(e.target.value) })} /></td><td><input type="number" min="0" disabled={!editable} value={item.packageCount || ''} onChange={e => setItem(index, { packageCount: Number(e.target.value) })} /></td><td><input type="number" min="0" disabled={!editable} value={item.unitPriceUSD || ''} onChange={e => setItem(index, { unitPriceUSD: Number(e.target.value) })} /></td><td>{(item.netWeight * item.unitPriceUSD).toLocaleString('en-US')}</td><td>{orderPreview ? <span className="order-status InCommerce">{fa ? 'مقدار سفارش' : 'Order value'}</span> : <span className={compare?.issues.length ? 'difference-badge' : 'match-badge'} title={compare?.issues.join('\n')}>{compare?.issues.length ? (fa ? 'مغایرت' : 'Difference') : (fa ? 'تطبیق' : 'Matched')}</span>}</td><td>{editable && <button className="remove-line" type="button" onClick={() => removeItem(index)}>×</button>}</td></tr> })}
        </tbody></table></div>
        {comparison && <section className={`comparison-panel ${comparison.hasDiscrepancy ? 'has-difference' : 'matched'}`}><div><strong>{comparison.hasDiscrepancy ? (fa ? 'مغایرت سفارش و فاکتور' : 'Order/invoice differences') : (fa ? 'فاکتور با سفارش تطبیق دارد' : 'Invoice matches the order')}</strong><small>{fa ? 'سفارش اولیه بدون تغییر نگهداری می‌شود و مقادیر فاکتور پس از تأیید مبنای موجودی است.' : 'The original order remains unchanged; confirmed invoice values drive stock.'}</small></div>{comparison.hasDiscrepancy && <ul>{[...comparison.headerIssues, ...comparison.lines.flatMap(x => x.issues.map(issue => `${x.yarnCode} — ${issue}`))].map((issue, i) => <li key={i}>{issue}</li>)}</ul>}</section>}
        <div className="commerce-lower">
          <section><div className="commerce-section-head"><h3>{fa ? 'جزئیات بسته‌بندی و کانتینر' : 'Packing & containers'}</h3>{editable && <button onClick={() => setInvoiceField('containers', [...displayedInvoice.containers, { containerNumber: '', netWeight: 0, grossWeight: 0, packageCount: 0 }])}>＋</button>}</div>
            {displayedInvoice.containers.map((container, index) => <div className="container-row" key={container.id ?? index}><input placeholder={fa ? 'شماره کانتینر' : 'Container'} disabled={!editable} value={container.containerNumber} onChange={e => setContainer(index, { containerNumber: e.target.value })} /><input placeholder={fa ? 'پلمب' : 'Seal'} disabled={!editable} value={container.sealNumber ?? ''} onChange={e => setContainer(index, { sealNumber: e.target.value })} /><input type="number" placeholder={fa ? 'وزن خالص' : 'Net'} disabled={!editable} value={container.netWeight || ''} onChange={e => setContainer(index, { netWeight: Number(e.target.value) })} /></div>)}
          </section>
          <section><div className="commerce-section-head"><h3>{fa ? 'مدارک خرید' : 'Documents'}</h3></div>
            {canUploadDocument && <div className="document-upload"><select value={documentType} onChange={e => setDocumentType(e.target.value)}><option value="PurchaseInvoice">{fa ? 'فاکتور خرید' : 'Invoice'}</option><option value="PackingList">{fa ? 'پکینگ لیست' : 'Packing list'}</option><option value="BillOfLading">{fa ? 'بارنامه' : 'Bill of lading'}</option><option value="Other">{fa ? 'سایر' : 'Other'}</option></select><input ref={documentInput} hidden type="file" accept=".xlsx,.pdf,image/*" onChange={e => void uploadDocument(e.target.files?.[0])} /><button onClick={() => documentInput.current?.click()}>{fa ? 'آپلود مدرک' : 'Upload'}</button></div>}
            <ul className="attachment-list">{attachments.map(x => <li key={x.id}><button type="button" onClick={() => void downloadAttachment(x.id, x.originalFileName).catch(e => setError(e instanceof Error ? e.message : String(e)))}>{x.originalFileName}</button><span>{x.documentType} — {(x.fileSize / 1024).toFixed(1)} KB</span>{canUploadDocument && <button className="attachment-delete" type="button" onClick={() => void deleteDocument(x)}>×</button>}</li>)}</ul>
          </section>
        </div>
        {editable && hasPermission('commerce.sendToWarehouse') && <div className="warehouse-send"><select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>{warehouses.map(x => <option key={x.id} value={x.id}>{fa ? x.nameFa : x.nameEn} — {x.code}</option>)}</select><button className="primary" onClick={sendToWarehouse}>{fa ? 'تأیید دریافت و ارسال به انبار' : 'Confirm & send to warehouse'}</button></div>}
      </div> : <div className="commerce-empty">{order ? (fa ? 'برای تکمیل خرید، فاکتور را ایجاد یا فایل Excel را استخراج کنید.' : 'Create or import the purchase invoice.') : (fa ? 'کارتابل بازرگانی خالی است.' : 'Commerce inbox is empty.')}</div>}
    </section>
    <section className="panel commerce-orders">
      <div className="grid-toolbar"><div><h2>{fa ? 'سفارش‌های ارجاع‌شده برای خرید نخ' : 'Orders assigned for yarn purchase'}</h2><span>{orders.length} {fa ? 'مورد' : 'items'}</span></div></div>
      <div className="person-table-wrap"><table className="person-table excel-grid"><thead><tr><th>{fa ? 'شماره سفارش' : 'Order'}</th><th>{fa ? 'تاریخ' : 'Date'}</th><th>{fa ? 'وضعیت' : 'Status'}</th><th>{fa ? 'اولویت' : 'Priority'}</th><th>{fa ? 'ردیف' : 'Items'}</th><th>{fa ? 'مقدار' : 'Quantity'}</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : orders.map(x => <tr key={x.id} className={x.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(x.id)}><td className="mono">{x.orderNumber}</td><td>{formatPersianDate(x.orderDate)}</td><td><span className={`order-status ${x.status}`}>{statusLabel(x.status)}</span></td><td>{x.priority === 'Urgent' ? (fa ? 'فوری' : 'Urgent') : (fa ? 'عادی' : 'Normal')}</td><td>{x.itemCount}</td><td>{x.totalQuantity?.toLocaleString()}</td></tr>)}
      </tbody></table></div>
    </section>
  </div>
}
