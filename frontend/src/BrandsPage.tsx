import { useCallback, useEffect, useRef, useState } from 'react'
import { api, apiRequest, currentUserKey, hasPermission, isConcurrencyConflict, withRowVersion } from './api'
import { Field, Shortcut } from './DefinitionControls'
import type { Language } from './i18n'

export type Brand = { id: string, brandCode: string, brandName: string, address?: string, rowVersion?: string }
export type BrandPage = { items: Brand[], total: number }
type Draft = { brandCode: string, brandName: string, address: string }
const empty = (): Draft => ({ brandCode: '', brandName: '', address: '' })
const copy = (brand: Brand): Draft => ({ brandCode: brand.brandCode, brandName: brand.brandName, address: brand.address ?? '' })
type Creation = { onSaved: (brand: Brand) => void, onCancel: () => void }

export default function BrandsPage({ language, demoMode = false, creation }: { language: Language, demoMode?: boolean, creation?: Creation }) {
  const fa = language === 'fa'
  const [items, setItems] = useState<Brand[]>([]), [total, setTotal] = useState(0)
  const [selectedId, setSelectedId] = useState(''), [draft, setDraft] = useState<Draft>(empty)
  const [mode, setMode] = useState<'view' | 'new' | 'edit'>(creation ? 'new' : 'view')
  const [query, setQuery] = useState(''), [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const original = useRef(JSON.stringify(empty())), frame = useRef<HTMLDivElement>(null), request = useRef(0)
  const codeInput = useRef<HTMLInputElement>(null)
  const splitKey = `brands-split:${currentUserKey()}`
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || 220)
  const selected = items.find(x => x.id === selectedId), editing = mode !== 'view'
  const dirty = editing && original.current !== JSON.stringify(draft)
  const load = useCallback(async (preferId?: string) => {
    if (creation) return
    const ticket = ++request.current
    setLoading(true)
    try {
      const result = demoMode ? { items: [], total: 0 } : await api<BrandPage>(`/api/master-data/brands?page=${page}&pageSize=50&q=${encodeURIComponent(query)}`)
      if (ticket !== request.current) return
      setItems(result.items); setTotal(result.total)
      const next = result.items.find(x => x.id === preferId) ?? result.items[0]
      setSelectedId(next?.id ?? ''); const value = next ? copy(next) : empty(); setDraft(value); original.current = JSON.stringify(value)
    } catch (e) { if (ticket === request.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (ticket === request.current) setLoading(false) }
  }, [page, query, demoMode, creation])
  useEffect(() => { const timer = window.setTimeout(() => void load(), query ? 200 : 0); return () => { clearTimeout(timer); request.current++ } }, [load, query])
  useEffect(() => { if (mode === 'new') codeInput.current?.focus() }, [mode])
  const select = (brand: Brand) => { if (editing) return; setSelectedId(brand.id); const value = copy(brand); setDraft(value); original.current = JSON.stringify(value) }
  const beginNew = useCallback(() => {
    if (saving || !hasPermission('brands.create')) return
    request.current++; setLoading(false); const value = empty(); setDraft(value); original.current = JSON.stringify(value); setMode('new'); setError(''); setMessage(''); setFieldErrors({})
  }, [saving])
  const beginEdit = useCallback(() => {
    if (!selected || saving || !hasPermission('brands.edit')) return
    setDraft(copy(selected)); original.current = JSON.stringify(copy(selected)); setMode('edit'); setError(''); setFieldErrors({})
  }, [selected, saving])
  const cancel = useCallback(() => {
    if (saving || dirty && !window.confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information has changed. Exit the current mode?')) return
    if (creation) { creation.onCancel(); return }
    setMode('view'); setError(''); setFieldErrors({}); void load(selectedId)
  }, [saving, dirty, fa, creation, load, selectedId])
  const save = useCallback(async () => {
    if (!editing || saving || !hasPermission(mode === 'new' ? 'brands.create' : 'brands.edit')) return
    const errors: Partial<Record<keyof Draft, string>> = {}
    if (!draft.brandCode.trim()) errors.brandCode = fa ? 'کد برند الزامی است.' : 'Brand code is required.'
    if (!draft.brandName.trim()) errors.brandName = fa ? 'نام برند الزامی است.' : 'Brand name is required.'
    setFieldErrors(errors); if (Object.keys(errors).length) return
    setSaving(true); setError(''); setMessage('')
    try {
      const brand = await apiRequest<Brand>(mode === 'new' ? '/api/master-data/brands' : withRowVersion(`/api/master-data/brands/${selectedId}`, selected?.rowVersion), { method: mode === 'new' ? 'POST' : 'PUT', body: JSON.stringify(draft) })
      window.dispatchEvent(new Event('brands-changed'))
      if (creation) { creation.onSaved(brand); return }
      setMode('view'); setMessage(fa ? 'اطلاعات با موفقیت ثبت شد.' : 'Saved successfully.'); await load(brand.id)
    } catch (e) {
      if (isConcurrencyConflict(e)) { setMode('view'); await load(selectedId) }
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }, [editing, saving, mode, draft, fa, selectedId, selected, creation, load])
  const remove = useCallback(async () => {
    if (!selected || editing || saving || !hasPermission('brands.delete') || !window.confirm(fa ? `برند «${selected.brandName}» حذف شود؟` : `Delete “${selected.brandName}”?`)) return
    setSaving(true); setError('')
    try { await apiRequest<void>(withRowVersion(`/api/master-data/brands/${selected.id}`, selected.rowVersion), { method: 'DELETE' }); window.dispatchEvent(new Event('brands-changed')); await load() }
    catch (e) { if (isConcurrencyConflict(e)) await load(selected.id); setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }, [selected, editing, saving, fa, load])
  const move = useCallback((delta: number, edge?: 'first' | 'last') => {
    const index = items.findIndex(x => x.id === selectedId)
    const brand = items[edge === 'first' ? 0 : edge === 'last' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + delta))]
    if (brand) select(brand)
  }, [items, selectedId, editing])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!frame.current || frame.current.closest('[aria-hidden="true"]') || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') { event.preventDefault(); if (editing || creation) cancel(); else window.dispatchEvent(new Event('close-active-form')); return }
      if (editing) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.code === 'Space') { event.preventDefault(); beginNew() }
      else if (event.key === 'Insert') { event.preventDefault(); beginEdit() }
      else if (event.key === 'Delete') { event.preventDefault(); void remove() }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
    }
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler)
  }, [editing, creation, cancel, beginNew, beginEdit, remove, move])
  const set = (key: keyof Draft, value: string) => { setDraft(current => ({ ...current, [key]: value })); setFieldErrors(current => ({ ...current, [key]: undefined })) }
  function resizeStart(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const y = event.clientY, height = topHeight, frameHeight = frame.current?.clientHeight ?? 720
    const resize = (e: PointerEvent) => setTopHeight(Math.max(180, Math.min(frameHeight - 260, height + e.clientY - y)))
    const stop = () => { window.removeEventListener('pointermove', resize); window.removeEventListener('pointerup', stop); setTopHeight(value => { localStorage.setItem(splitKey, String(Math.round(value))); return value }) }
    window.addEventListener('pointermove', resize); window.addEventListener('pointerup', stop)
  }
  return <div ref={frame} dir={fa ? 'rtl' : 'ltr'} className="persons-page brands-page" data-form-scope style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px, 1fr)` }}>
    <section className="person-editor panel">
      <div className="person-section-head"><div><h2>{fa ? 'اطلاعات برند' : 'Brand details'}</h2><p>{mode === 'new' ? (fa ? 'تعریف برند جدید' : 'New brand') : editing ? (fa ? 'اصلاح اطلاعات' : 'Edit brand') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div><span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span></div>
      {error && <div className="form-message error-message" role="alert">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid brand-form-grid ${editing ? 'editing' : ''}`}>
        <Field label={fa ? 'کد برند *' : 'Brand code *'} error={fieldErrors.brandCode}><input ref={codeInput} data-field="brandCode" disabled={!editing || saving} required maxLength={30} aria-invalid={Boolean(fieldErrors.brandCode)} value={draft.brandCode} onChange={e => set('brandCode', e.target.value)} /></Field>
        <Field label={fa ? 'نام برند *' : 'Brand name *'} error={fieldErrors.brandName}><input data-field="brandName" disabled={!editing || saving} required maxLength={200} aria-invalid={Boolean(fieldErrors.brandName)} value={draft.brandName} onChange={e => set('brandName', e.target.value)} /></Field>
        <Field label={fa ? 'آدرس' : 'Address'} wide><input data-field="brandAddress" disabled={!editing || saving} maxLength={2000} value={draft.address} onChange={e => set('address', e.target.value)} /></Field>
      </div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      <div className="grid-toolbar"><div><h2>{fa ? 'فهرست برندها' : 'Brands'}</h2><span>{fa ? `${items.length} از ${total} رکورد` : `${items.length} of ${total} records`}</span></div><input type="search" aria-label={fa ? 'جست‌وجوی برند' : 'Search brands'} placeholder={fa ? 'جست‌وجو…' : 'Search…'} disabled={editing} value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} /><button type="button" disabled={editing || loading} onClick={() => void load(selectedId)} aria-label={fa ? 'تازه‌سازی' : 'Refresh'}>⟳</button></div>
      <div className="person-table-wrap"><table className="person-table excel-grid"><colgroup><col style={{ width: 130 }} /><col style={{ width: 280 }} /><col /></colgroup><thead><tr><th>{fa ? 'کد برند' : 'Brand code'}</th><th>{fa ? 'نام برند' : 'Brand name'}</th><th>{fa ? 'آدرس' : 'Address'}</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={3}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : items.length ? items.map(brand => <tr key={brand.id} className={brand.id === selectedId ? 'selected' : ''} onClick={() => select(brand)} onDoubleClick={() => { if (!editing && hasPermission('brands.edit')) { select(brand); setMode('edit') } }}><td className="mono">{brand.brandCode}</td><td>{brand.brandName}</td><td>{brand.address || '—'}</td></tr>) : <tr><td colSpan={3}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
      </tbody></table></div>
      <div className="shortcut-bar">{editing ? <><Shortcut code="F3" label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary disabled={saving} /><Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} disabled={saving} /></> : <>
        <Shortcut code="Space" label={fa ? 'برند جدید' : 'New'} onClick={beginNew} primary disabled={loading || saving || !hasPermission('brands.create')} /><Shortcut code="Insert" label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!selected || saving || !hasPermission('brands.edit')} /><Shortcut code="Delete" label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!selected || saving || !hasPermission('brands.delete')} />
        <Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move(0, 'first')} /><Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Previous page'} onClick={() => setPage(p => p - 1)} disabled={page === 1 || loading} /><Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move(1)} /><Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Next page'} onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total || loading} /><Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move(0, 'last')} />
      </>}</div>
    </section>
  </div>
}
