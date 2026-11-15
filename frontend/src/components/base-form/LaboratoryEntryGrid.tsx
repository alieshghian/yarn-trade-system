import { BaseFormGridBoundary, type BaseFormGridBoundaryProps } from './BaseFormGridBoundary'
import type { FormSchemaTable } from './formSchema'
import { purchaseInvoiceCurrency } from './purchaseInvoiceCurrency'

type Row = Record<string, string | number>
export type DemoGridSettings = {
  rows: Row[]
  editors: Record<string, { type: 'text' | 'number' | 'select'; options?: string[]; readOnly?: boolean }>
  invoiceSummary?: boolean
  referenceRate?: number
  vat?: number
}

/** Opt-in, schema-owned sample data. Never invokes an operational adapter. */
export function LaboratoryEntryGrid({ table, demo, onChange, ...props }: BaseFormGridBoundaryProps<Row> & {
  table: FormSchemaTable; demo: DemoGridSettings; onChange: (value: DemoGridSettings) => void
}) {
  const rows = demo.rows.map((row, index) => ({ ...row, lineNumber: index + 1,
    lineAmount: Math.round(Number(row.netWeight || 0) * Number(row.unitPriceCNY || 0) * 100) / 100,
    cbm: Math.round(Number(row.packageCount || 0) * (row.packaging === 'کارتن' ? .12 : .10) * 100) / 100
  }))
  const total = rows.reduce((sum, row) => sum + row.lineAmount, 0)
  const currency = purchaseInvoiceCurrency(demo.referenceRate ?? 6.67, total, demo.vat ?? 13)
  const update = (id: string | number, column: string, value: string) => onChange({ ...demo, rows: demo.rows.map(row => row.id === id ? { ...row, [column]: value } : row) })
  const label = (id: string) => table.columns.find(column => column.id === id)?.label[props.language] ?? id
  return <div className="laboratory-entry-invoice">
    <div dir="rtl" style={{ display: 'flex', gap: 6 }}>
      <button type="button" title="افزودن ردیف آزمایشی" aria-label="افزودن ردیف آزمایشی" onClick={() => onChange({ ...demo, rows: [...demo.rows, { id: crypto.randomUUID(), yarn: '', packaging: 'کارتن', packageCount: 0, netWeight: 0, unitPriceCNY: 0, containerNumber: '' }] })}>＋</button>
    </div>
    <div className="laboratory-entry-rows" style={{ maxHeight: 340, overflow: 'auto' }}>
      <BaseFormGridBoundary {...props} title={table.title?.[props.language]} toolbarSettings={table.settings?.toolbar as BaseFormGridBoundaryProps<Row>["toolbarSettings"]} rows={rows} readOnly={false} remoteQuery={undefined} renderCell={(row, id) => {
        if (id === 'remove') return <button type="button" title="حذف ردیف آزمایشی" aria-label="حذف ردیف آزمایشی" onClick={event => { event.stopPropagation(); onChange({ ...demo, rows: demo.rows.filter(item => item.id !== row.id) }) }}>×</button>
        const editor = demo.editors[id]
        if (!editor || editor.readOnly) return String(row[id] ?? '')
        const common = { 'aria-label': `${label(id)} ${row.lineNumber}`, value: row[id] ?? '', style: { width: '100%', minWidth: 0 }, onClick: (event: React.MouseEvent) => event.stopPropagation(), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(row.id, id, event.target.value) }
        return editor.type === 'select' ? <select {...common}><option value=""/>{editor.options?.map(value => <option key={value}>{value}</option>)}</select> : <input {...common} type={editor.type} step="any" min={editor.type === 'number' ? 0 : undefined}/>
      }}/>
    </div>
    {demo.invoiceSummary && <div className="laboratory-invoice-summary" dir="rtl" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: 12, background: '#eaf6ef', borderRadius: 8 }}>
      <label>نرخ مرجع CNY/USD <input aria-label="نرخ مرجع CNY/USD" type="number" min="0.01" step="0.01" value={demo.referenceRate ?? 6.67} onChange={event => onChange({ ...demo, referenceRate: Number(event.target.value) })} style={{ width: 85 }}/></label>
      <output>نرخ مؤثر: {currency?.effectiveRate.toFixed(2) ?? '—'}</output>
      <output>جمع کالا: {total.toLocaleString('en')} CNY</output>
      <output>جمع فاکتور: {currency?.totalUsd.toLocaleString('en', { minimumFractionDigits: 2 }) ?? '—'} USD</output>
      <output>جمع حجم: {rows.reduce((sum, row) => sum + row.cbm, 0).toFixed(2)} CBM</output>
      {[...new Set(rows.map(row => row.containerNumber).filter(Boolean))].map(number => {
        const loaded = rows.filter(row => row.containerNumber === number).reduce((sum, row) => sum + row.cbm, 0)
        return <label key={number}>{number} — 40HC: {loaded.toFixed(2)} / 68 CBM؛ باقی‌مانده {(68 - loaded).toFixed(2)}<meter min={0} max={68} value={loaded}/></label>
      })}
    </div>}
  </div>
}
