import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, apiRequest, currentUserKey, hasPermission, isConcurrencyConflict, withRowVersion } from './api'
import { Field, Shortcut } from './DefinitionControls'
import { suggestSerial } from './sequences'
import type { Language } from './i18n'
import { ExcelGridColumnHeader, ExcelGridFilterScope } from './components/base-form/ExcelGridColumnHeader'
import { applyGridFiltersAndSort, type ExcelGridColumn, type GridFilterState, type GridSortState } from './components/base-form/excelGrid'

export type Brand = { id: string, brandCode: string, brandName: string, address?: string, description?: string, rowVersion?: string }
export type BrandPage = { items: Brand[], total: number }
type Draft = { brandCode: string, brandName: string, address: string, description: string }
type ColumnKey = keyof BrandPick
type BrandPick = Pick<Brand, 'brandCode' | 'brandName' | 'address' | 'description'>
type Column = { key: ColumnKey, width: number, visible: boolean }
const empty = (): Draft => ({ brandCode: '', brandName: '', address: '', description: '' })
const copy = (brand: Brand): Draft => ({ brandCode: brand.brandCode, brandName: brand.brandName, address: brand.address ?? '', description: brand.description ?? '' })
const defaultColumns: Column[] = [
  { key: 'brandCode', width: 130, visible: true }, { key: 'brandName', width: 210, visible: true },
  { key: 'address', width: 220, visible: true }, { key: 'description', width: 240, visible: true }
]
type Creation = { onSaved: (brand: Brand) => void, onCancel: () => void }

export default function BrandsPage({ language, demoMode = false, creation }: { language: Language, demoMode?: boolean, creation?: Creation }) {
  const fa = language === 'fa', locale = fa ? 'fa' : 'en'
  const [items, setItems] = useState<Brand[]>([]), [total, setTotal] = useState(0)
  const [selectedId, setSelectedId] = useState(''), [draft, setDraft] = useState<Draft>(empty)
  const [mode, setMode] = useState<'view' | 'new' | 'edit'>(creation ? 'new' : 'view')
  const [query, setQuery] = useState(''), [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [columns, setColumns] = useState<Column[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(`brands-columns:${currentUserKey()}`) ?? 'null') as Column[] | null; if (saved?.length === 4 && defaultColumns.every(x => saved.some(y => y.key === x.key))) return saved }
    catch { /* تنظیمات معیوب با پیش‌فرض جایگزین می‌شود. */ }
    return defaultColumns
  })
  const [filters, setFilters] = useState<GridFilterState>({}), [sort, setSort] = useState<GridSortState>([{ id: 'brandCode', direction: 'asc' }])
  const [columnMenu, setColumnMenu] = useState(false), [columnMenuPosition, setColumnMenuPosition] = useState<React.CSSProperties>({})
  const original = useRef(JSON.stringify(empty())), frame = useRef<HTMLDivElement>(null), request = useRef(0), codeEdit = useRef(0)
  const codeInput = useRef<HTMLInputElement>(null), columnMenuRef = useRef<HTMLDivElement>(null)
  const splitKey = `brands-split:${currentUserKey()}`
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || 220)
  const selected = items.find(x => x.id === selectedId), editing = mode !== 'view', dirty = editing && original.current !== JSON.stringify(draft)
  const visibleColumns = columns.filter(x => x.visible)

  const load = useCallback(async (preferId?: string) => {
    const ticket = ++request.current
    if (demoMode) { setItems([]); setTotal(0); return }
    setLoading(true); setError('')
    try {
      const all: Brand[] = []; let expected = 0, pageNumber = 1
      do {
        const result = await api<BrandPage>(`/api/master-data/brands?page=${pageNumber}&pageSize=500`)
        all.push(...result.items); expected = result.total; pageNumber++
        if (!result.items.length) break
      } while (all.length < expected)
      if (ticket !== request.current) return
      setItems(all); setTotal(expected)
      if (creation) return
      const next = all.find(x => x.id === preferId) ?? all[0]
      setSelectedId(next?.id ?? ''); const value = next ? copy(next) : empty(); setDraft(value); original.current = JSON.stringify(value)
    } catch (e) { if (ticket === request.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (ticket === request.current) setLoading(false) }
  }, [demoMode, creation])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (mode === 'new') codeInput.current?.focus() }, [mode])
  useEffect(() => { localStorage.setItem(`brands-columns:${currentUserKey()}`, JSON.stringify(columns)) }, [columns])

  function columnLabel(key: ColumnKey) { return ({ brandCode: fa ? 'کد برند' : 'Brand code', brandName: fa ? 'نام برند' : 'Brand name', address: fa ? 'آدرس' : 'Address', description: fa ? 'توضیحات' : 'Description' })[key] }
  const columnValue = useCallback((brand: Brand, key: ColumnKey) => String(brand[key] ?? ''), [])
  const gridColumns = useMemo<ExcelGridColumn<Brand>[]>(() => columns.map(column => ({
    id: column.key, label: columnLabel(column.key), width: column.width, type: 'text', value: brand => columnValue(brand, column.key)
  })), [columns, fa, columnValue])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale)
    const matched = applyGridFiltersAndSort(items, gridColumns, filters, sort, locale)
    return term ? matched.filter(brand => visibleColumns.some(column => columnValue(brand, column.key).toLocaleLowerCase(locale).includes(term))) : matched
  }, [items, gridColumns, filters, query, locale, sort, columnValue, visibleColumns])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50)), pageItems = filtered.slice((page - 1) * 50, page * 50)
  useEffect(() => { setPage(1) }, [query, filters, sort])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  useEffect(() => {
    if (mode !== 'new' || draft.brandCode.trim()) return
    let active = true; const revision = codeEdit.current
    const next = async () => {
      const trailingCodes = items.filter(x => /\d+$/.test(x.brandCode)).map(x => x.brandCode)
      trailingCodes.sort((a, b) => {
        const an = BigInt(a.match(/\d+$/)![0]), bn = BigInt(b.match(/\d+$/)![0]); return an < bn ? -1 : an > bn ? 1 : a.localeCompare(b)
      })
      let code = await suggestSerial('brand', true, trailingCodes.at(-1), 'BRD-0001')
      const known = new Set(items.map(x => x.brandCode.trim().toLocaleUpperCase()))
      while (known.has(code.toLocaleUpperCase())) code = await suggestSerial('brand', true, code, 'BRD-0001')
      if (active && revision === codeEdit.current) setDraft(current => current.brandCode.trim() ? current : { ...current, brandCode: code })
    }
    void next()
    return () => { active = false }
  }, [mode, draft.brandCode, items])

  const duplicateCode = (value: string) => items.some(x => x.brandCode.trim().toLocaleUpperCase() === value.trim().toLocaleUpperCase() && x.id !== selectedId)
  const validateCode = useCallback((value: string) => {
    const duplicate = Boolean(value.trim()) && duplicateCode(value)
    setFieldErrors(current => ({ ...current, brandCode: !value.trim() ? (fa ? 'کد برند الزامی است.' : 'Brand code is required.') : duplicate ? (fa ? 'این کد برند قبلاً ثبت شده است.' : 'This brand code is already in use.') : undefined }))
    return !duplicate && Boolean(value.trim())
  }, [items, selectedId, fa])
  const select = (brand: Brand) => { if (editing) return; setSelectedId(brand.id); const value = copy(brand); setDraft(value); original.current = JSON.stringify(value) }
  const beginNew = useCallback(() => {
    if (saving || !hasPermission('brands.create')) return
    request.current++; setLoading(false); const value = empty(); setDraft(value); original.current = JSON.stringify(value); setMode('new'); setError(''); setMessage(''); setFieldErrors({}); setPage(1)
  }, [saving])
  const beginEdit = useCallback(() => {
    if (!selected || saving || !hasPermission('brands.edit')) return
    const value = copy(selected); setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setFieldErrors({})
  }, [selected, saving])
  const cancel = useCallback(() => {
    if (saving || dirty && !window.confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information has changed. Exit the current mode?')) return
    if (creation) { creation.onCancel(); return }
    setMode('view'); setError(''); setFieldErrors({}); const value = selected ? copy(selected) : empty(); setDraft(value); original.current = JSON.stringify(value)
  }, [saving, dirty, fa, creation, selected])
  const save = useCallback(async () => {
    if (!editing || saving || !hasPermission(mode === 'new' ? 'brands.create' : 'brands.edit')) return
    const errors: Partial<Record<keyof Draft, string>> = {}
    if (!draft.brandCode.trim()) errors.brandCode = fa ? 'کد برند الزامی است.' : 'Brand code is required.'
    else if (duplicateCode(draft.brandCode)) errors.brandCode = fa ? 'این کد برند قبلاً ثبت شده است.' : 'This brand code is already in use.'
    if (!draft.brandName.trim()) errors.brandName = fa ? 'نام برند الزامی است.' : 'Brand name is required.'
    setFieldErrors(errors); if (Object.keys(errors).length) return
    setSaving(true); setError(''); setMessage('')
    try {
      const brand = await apiRequest<Brand>(mode === 'new' ? '/api/master-data/brands' : withRowVersion(`/api/master-data/brands/${selectedId}`, selected?.rowVersion), { method: mode === 'new' ? 'POST' : 'PUT', body: JSON.stringify(draft) })
      window.dispatchEvent(new Event('brands-changed'))
      if (creation) { creation.onSaved(brand); return }
      setMode('view'); setMessage(fa ? 'اطلاعات با موفقیت ثبت شد.' : 'Saved successfully.'); await load(brand.id)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details?.code === 'DUPLICATE_BRAND_CODE') setFieldErrors(current => ({ ...current, brandCode: fa ? 'این کد برند قبلاً ثبت شده است.' : 'This brand code is already in use.' }))
      if (isConcurrencyConflict(e)) { setMode('view'); await load(selectedId) }
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }, [editing, saving, mode, draft, fa, selectedId, selected, creation, load, items])
  const remove = useCallback(async () => {
    if (!selected || editing || saving || !hasPermission('brands.delete') || !window.confirm(fa ? `برند «${selected.brandName}» حذف شود؟` : `Delete “${selected.brandName}”?`)) return
    setSaving(true); setError('')
    try { await apiRequest<void>(withRowVersion(`/api/master-data/brands/${selected.id}`, selected.rowVersion), { method: 'DELETE' }); window.dispatchEvent(new Event('brands-changed')); await load() }
    catch (e) { if (isConcurrencyConflict(e)) await load(selected.id); setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }, [selected, editing, saving, fa, load])
  const move = useCallback((delta: number, edge?: 'first' | 'last') => {
    if (edge === 'first') setPage(1)
    else if (edge === 'last') setPage(pageCount)
    else if (delta < 0 && (page - 1) * 50 === Math.max(0, filtered.findIndex(x => x.id === selectedId))) setPage(Math.max(1, page - 1))
    else if (delta > 0 && page * 50 - 1 === filtered.findIndex(x => x.id === selectedId)) setPage(Math.min(pageCount, page + 1))
    else { const index = filtered.findIndex(x => x.id === selectedId); const brand = filtered[Math.max(0, Math.min(filtered.length - 1, index + delta))]; if (brand) select(brand) }
  }, [filtered, selectedId, page, pageCount, editing])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!frame.current || frame.current.closest('[aria-hidden="true"]') || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') { event.preventDefault(); if (editing || creation) cancel(); else window.dispatchEvent(new Event('close-active-form')); return }
      if (editing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.code === 'Space') { event.preventDefault(); beginNew() }
      else if (event.key === 'Insert') { event.preventDefault(); beginEdit() }
      else if (event.key === 'Delete') { event.preventDefault(); void remove() }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
    }
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler)
  }, [editing, creation, cancel, beginNew, beginEdit, remove, move])
  const set = (key: keyof Draft, value: string) => { if (key === 'brandCode') codeEdit.current++; setDraft(current => ({ ...current, [key]: value })); setFieldErrors(current => ({ ...current, [key]: undefined })) }
  function resizeColumn(event: React.PointerEvent, key: ColumnKey) {
    event.stopPropagation(); const startX = event.clientX, startWidth = columns.find(x => x.key === key)?.width ?? 120, direction = document.documentElement.dir === 'rtl' ? -1 : 1
    const resize = (e: PointerEvent) => setColumns(current => current.map(column => column.key === key ? { ...column, width: Math.max(80, startWidth + (e.clientX - startX) * direction) } : column))
    const stop = () => { window.removeEventListener('pointermove', resize); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', resize); window.addEventListener('pointerup', stop)
  }
  function resizeStart(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId); const y = event.clientY, height = topHeight, frameHeight = frame.current?.clientHeight ?? 720
    const resize = (e: PointerEvent) => setTopHeight(Math.max(180, Math.min(frameHeight - 260, height + e.clientY - y)))
    const stop = () => { window.removeEventListener('pointermove', resize); window.removeEventListener('pointerup', stop); setTopHeight(value => { localStorage.setItem(splitKey, String(Math.round(value))); return value }) }
    window.addEventListener('pointermove', resize); window.addEventListener('pointerup', stop)
  }
  return <div ref={frame} dir={fa ? 'rtl' : 'ltr'} className="persons-page brands-page" data-form-scope style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px, 1fr)` }}>
    <section className="person-editor panel">
      <div className="person-section-head"><div><h2>{fa ? 'اطلاعات برند' : 'Brand details'}</h2><p>{mode === 'new' ? (fa ? 'تعریف برند جدید' : 'New brand') : editing ? (fa ? 'اصلاح اطلاعات' : 'Edit brand') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div><span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span></div>
      {error && <div className="form-message error-message" role="alert">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid brand-form-grid ${editing ? 'editing' : ''}`}>
        <Field label={fa ? 'کد برند *' : 'Brand code *'} error={fieldErrors.brandCode}><input ref={codeInput} data-field="brandCode" onBlur={event => { if (event.target.value.trim()) validateCode(event.target.value) }} disabled={!editing || saving} required maxLength={30} aria-invalid={Boolean(fieldErrors.brandCode)} value={draft.brandCode} onChange={e => set('brandCode', e.target.value)} /></Field>
        <Field label={fa ? 'نام برند *' : 'Brand name *'} error={fieldErrors.brandName}><input data-field="brandName" disabled={!editing || saving} required maxLength={200} aria-invalid={Boolean(fieldErrors.brandName)} value={draft.brandName} onChange={e => set('brandName', e.target.value)} /></Field>
        <Field label={fa ? 'آدرس' : 'Address'}><input data-field="brandAddress" disabled={!editing || saving} maxLength={2000} value={draft.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label={fa ? 'توضیحات' : 'Description'} wide><textarea data-field="brandDescription" disabled={!editing || saving} maxLength={4000} value={draft.description} onChange={e => set('description', e.target.value)} /></Field>
      </div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      <div className="grid-toolbar"><div><h2>{fa ? 'فهرست برندها' : 'Brands'}</h2><span>{fa ? `${filtered.length} از ${total} رکورد` : `${filtered.length} of ${total} records`}</span></div><input type="search" aria-label={fa ? 'جست‌وجوی برند' : 'Search brands'} placeholder={fa ? 'جست‌وجو…' : 'Search…'} disabled={editing} value={query} onChange={e => setQuery(e.target.value)} /><button type="button" className="brand-column-picker" disabled={editing} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setColumnMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 230) }); setColumnMenu(x => !x) }}>{fa ? 'ستون‌ها' : 'Columns'}</button><button type="button" disabled={editing || loading} onClick={() => void load(selectedId)} aria-label={fa ? 'تازه‌سازی' : 'Refresh'}>⟳</button></div>
      {columnMenu && createPortal(<div ref={columnMenuRef} className="person-column-menu" dir={fa ? 'rtl' : 'ltr'} style={columnMenuPosition}>{columns.map(column => <label key={column.key}><input type="checkbox" checked={column.visible} disabled={column.visible && visibleColumns.length === 1} onChange={() => { setColumns(current => current.map(x => x.key === column.key ? { ...x, visible: !x.visible } : x)); setFilters(current => { const next = { ...current }; delete next[column.key]; return next }) }} />{columnLabel(column.key)}</label>)}<button type="button" onClick={() => { setColumns(defaultColumns); setFilters({}); setColumnMenu(false) }}>↺ {fa ? 'حالت پیش‌فرض' : 'Reset'}</button></div>, document.body)}
      <div className="person-table-wrap"><ExcelGridFilterScope><table className="person-table excel-grid brand-grid" style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{visibleColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead><tr>{visibleColumns.map(column => <ExcelGridColumnHeader key={column.key} column={gridColumns.find(item => item.id === column.key)!} rows={items} locale={locale} language={language} direction={fa ? 'rtl' : 'ltr'} filter={filters[column.key]} sort={sort} onSort={setSort} onApplyFilter={filter => setFilters(current => ({ ...current, [column.key]: filter }))} thProps={{ 'data-column': column.key }} resizer={<i className="column-resizer" onPointerDown={event => resizeColumn(event, column.key)} />} />)}</tr></thead><tbody>
        {loading ? <tr><td colSpan={visibleColumns.length}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : pageItems.length ? pageItems.map(brand => <tr key={brand.id} className={brand.id === selectedId ? 'selected' : ''} onClick={() => select(brand)} onDoubleClick={() => { if (!editing && hasPermission('brands.edit')) { select(brand); setMode('edit') } }}>{visibleColumns.map(column => <td key={column.key} className={column.key === 'brandCode' ? 'mono' : ''}>{columnValue(brand, column.key) || '—'}</td>)}</tr>) : <tr><td colSpan={visibleColumns.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
      </tbody></table></ExcelGridFilterScope></div>
      <div className="shortcut-bar">{editing ? <><Shortcut code="F3" label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary disabled={saving} /><Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} disabled={saving} /></> : <>
        <Shortcut code="Space" label={fa ? 'برند جدید' : 'New'} onClick={beginNew} primary disabled={loading || saving || !hasPermission('brands.create')} /><Shortcut code="Insert" label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!selected || saving || !hasPermission('brands.edit')} /><Shortcut code="Delete" label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!selected || saving || !hasPermission('brands.delete')} />
        <Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move(0, 'first')} /><Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Previous page'} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} /><Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move(1)} /><Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Next page'} onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount || loading} /><Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move(0, 'last')} />
      </>}</div>
    </section>
  </div>
}
