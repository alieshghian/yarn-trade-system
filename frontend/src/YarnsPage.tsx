import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, apiRequest, currentUserKey, hasPermission } from './api'
import type { Language } from './i18n'
import { suggestSerial } from './sequences'

type Mode = 'view' | 'new' | 'edit'
type Yarn = {
  id: string, code: string, name: string, comprehensiveName: string, yarnGroup?: string, luster?: string,
  unitOfMeasure: string, fixStatus?: string, material?: string, spinType?: string, filamentNumber?: number,
  spinningMethod?: string, continuityType?: string, countValue?: number, countType?: string,
  twistAmount?: number, twistType?: string, plyCount: number, notes?: string, isActive: boolean
}
type YarnDraft = Omit<Yarn, 'id' | 'comprehensiveName'>
type YarnPageResult = { items: Yarn[], total: number }
type ColumnKey = 'code' | 'comprehensiveName' | 'yarnGroup' | 'material' | 'countValue' | 'countType' | 'unitOfMeasure' | 'isActive'
type ColumnState = { key: ColumnKey, width: number, visible: boolean }
type Filters = Record<ColumnKey, string[] | null>
type ShortcutAction = 'new' | 'edit' | 'delete' | 'save'
type ShortcutMap = Record<ShortcutAction, string>

const labels: Record<string, { fa: string, en: string }> = {
  CN: { fa: 'چینی', en: 'Chinese' }, IR: { fa: 'ایرانی', en: 'Iranian' }, SOHAIL: { fa: 'سهیل', en: 'Sohail' },
  BRIGHT: { fa: 'براق', en: 'Bright' }, SEMI_DULL: { fa: 'نیمه مات', en: 'Semi-dull' }, DULL: { fa: 'مات', en: 'Dull' },
  KG: { fa: 'کیلوگرم', en: 'kg' }, COUNT: { fa: 'عدد', en: 'Count' }, CONE: { fa: 'دوک', en: 'Cone' }, HANK: { fa: 'کلاف', en: 'Hank' },
  SHRINK: { fa: 'جمع شو', en: 'Shrinkable' }, FIXED: { fa: 'فیکسه شده', en: 'Fixed' },
  ACRYLIC: { fa: 'اکرولیک', en: 'Acrylic' }, POLYESTER: { fa: 'پلی استر', en: 'Polyester' }, COTTON: { fa: 'پنبه', en: 'Cotton' },
  WIRE: { fa: 'سیم', en: 'Wire' }, LUREX: { fa: 'لمه', en: 'Lurex' }, VISCOSE: { fa: 'ویسکوز', en: 'Viscose' },
  SPUN: { fa: 'اسپان', en: 'Spun' }, FILAMENT: { fa: 'فیلامنت', en: 'Filament' }, OPEN_END: { fa: 'اوپن', en: 'Open-end' }, RING: { fa: 'رینگ', en: 'Ring' },
  ZERO: { fa: '0', en: '0' }, INTERMINGLE: { fa: 'اینترمینگل', en: 'Intermingle' }, TWISTED: { fa: 'تابیده', en: 'Twisted' },
  SIMPLE: { fa: 'ساده', en: 'Simple' }, COMMINGLE: { fa: 'کومینگل', en: 'Commingle' },
  NM: { fa: 'N.M.', en: 'N.M.' }, DENIER: { fa: 'دنیر', en: 'Denier' }, DTEX: { fa: 'دیتکس', en: 'Dtex' },
  MICRON: { fa: 'میکرون', en: 'Micron' }, NE: { fa: 'N.E.', en: 'N.E.' }, S: { fa: 'S', en: 'S' }, Z: { fa: 'Z', en: 'Z' }
}
const options = {
  yarnGroup: ['CN', 'IR', 'SOHAIL'], luster: ['BRIGHT', 'SEMI_DULL', 'DULL'], unitOfMeasure: ['KG', 'COUNT', 'CONE', 'HANK'],
  fixStatus: ['SHRINK', 'FIXED'], material: ['ACRYLIC', 'POLYESTER', 'COTTON', 'WIRE', 'LUREX', 'VISCOSE'],
  spinType: ['SPUN', 'FILAMENT'], spinningMethod: ['OPEN_END', 'RING'],
  continuityType: ['ZERO', 'INTERMINGLE', 'TWISTED', 'SIMPLE', 'COMMINGLE'], countType: ['NM', 'DENIER', 'DTEX', 'MICRON', 'NE'], twistType: ['S', 'Z']
} as const
const defaultColumns: ColumnState[] = [
  { key: 'code', width: 125, visible: true }, { key: 'comprehensiveName', width: 340, visible: true },
  { key: 'yarnGroup', width: 120, visible: true }, { key: 'material', width: 130, visible: true },
  { key: 'countValue', width: 100, visible: true }, { key: 'countType', width: 105, visible: true },
  { key: 'unitOfMeasure', width: 110, visible: true }, { key: 'isActive', width: 95, visible: true }
]
const defaultShortcuts: ShortcutMap = { new: 'Space', edit: 'Insert', delete: 'Delete', save: 'F3' }
const shortcutOptions = ['Space', 'Insert', 'Delete', 'F2', 'F3', 'F4', 'F6', 'F7', 'Ctrl+N', 'Ctrl+E']
const emptyFilters = (): Filters => ({ code: null, comprehensiveName: null, yarnGroup: null, material: null, countValue: null, countType: null, unitOfMeasure: null, isActive: null })
const emptyDraft = (): YarnDraft => ({ code: '', name: '', yarnGroup: '', luster: '', unitOfMeasure: 'KG', fixStatus: '', material: '', spinType: '', filamentNumber: undefined, spinningMethod: '', continuityType: '', countValue: undefined, countType: '', twistAmount: undefined, twistType: '', plyCount: 0, notes: '', isActive: true })
const copyDraft = (x: Yarn): YarnDraft => ({ code: x.code, name: x.name, yarnGroup: x.yarnGroup ?? '', luster: x.luster ?? '', unitOfMeasure: x.unitOfMeasure, fixStatus: x.fixStatus ?? '', material: x.material ?? '', spinType: x.spinType ?? '', filamentNumber: x.filamentNumber, spinningMethod: x.spinningMethod ?? '', continuityType: x.continuityType ?? '', countValue: x.countValue, countType: x.countType ?? '', twistAmount: x.twistAmount, twistType: x.twistType ?? '', plyCount: x.plyCount, notes: x.notes ?? '', isActive: x.isActive })
const payload = (x: YarnDraft) => Object.fromEntries(Object.entries(x).map(([key, value]) => [key, value === '' ? null : value]))
const demoYarns: Yarn[] = [
  { id: 'y1', code: 'CHN-3NM-01', name: 'DUBE DYED CHENILLE', comprehensiveName: 'DUBE DYED CHENILLE براق پلی استر فیلامنت 3 N.M. 1 لا', yarnGroup: 'CN', luster: 'BRIGHT', unitOfMeasure: 'KG', fixStatus: 'FIXED', material: 'POLYESTER', spinType: 'FILAMENT', countValue: 3, countType: 'NM', plyCount: 1, isActive: true },
  { id: 'y2', code: 'ELVA-5NM', name: 'ELVA YARN', comprehensiveName: 'ELVA YARN نیمه مات ویسکوز اسپان 5 N.M. 2 لا', yarnGroup: 'CN', luster: 'SEMI_DULL', unitOfMeasure: 'KG', material: 'VISCOSE', spinType: 'SPUN', countValue: 5, countType: 'NM', plyCount: 2, isActive: true }
]

function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  if (shortcut.startsWith('Ctrl+')) return event.ctrlKey && event.key.toUpperCase() === shortcut.slice(5).toUpperCase()
  return shortcut === 'Space' ? event.code === 'Space' : event.key === shortcut
}
function loadColumns(key: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as ColumnState[] | null
    if (saved?.length && defaultColumns.every(column => saved.some(x => x.key === column.key))) return saved
  } catch { /* use defaults */ }
  return defaultColumns
}

export default function YarnsPage({ language, demoMode = false }: { language: Language, demoMode?: boolean }) {
  const fa = language === 'fa', userKey = currentUserKey()
  const splitKey = `yarns-split:${userKey}`, columnKey = `yarns-columns:${userKey}`, shortcutKey = `yarns-shortcuts:${userKey}`
  const [yarns, setYarns] = useState<Yarn[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<YarnDraft>(emptyDraft)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof YarnDraft, string>>>({})
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || 390)
  const [columns, setColumns] = useState<ColumnState[]>(() => loadColumns(columnKey))
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<{ key: ColumnKey, direction: 'asc' | 'desc' }>({ key: 'code', direction: 'asc' })
  const [filterMenu, setFilterMenu] = useState<ColumnKey | null>(null)
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 })
  const [filterSearch, setFilterSearch] = useState(''), [pendingFilter, setPendingFilter] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => { try { return { ...defaultShortcuts, ...JSON.parse(localStorage.getItem(shortcutKey) ?? '{}') } } catch { return defaultShortcuts } })
  const original = useRef(JSON.stringify(emptyDraft())), frameRef = useRef<HTMLDivElement>(null), formRef = useRef<HTMLDivElement>(null)
  const selected = yarns.find(x => x.id === selectedId), dirty = mode !== 'view' && JSON.stringify(draft) !== original.current
  const visibleColumns = columns.filter(x => x.visible)
  const label = useCallback((code?: string) => code ? labels[code]?.[language] ?? code : '', [language])
  const comprehensiveName = useMemo(() => [
    draft.name.trim(), label(draft.luster), label(draft.material), draft.filamentNumber, label(draft.spinType),
    draft.countValue, label(draft.countType), draft.plyCount > 0 ? `${draft.plyCount} ${fa ? 'لا' : 'ply'}` : ''
  ].filter(x => x !== '' && x !== undefined && x !== null).join(' '), [draft, label, fa])
  const columnValue = useCallback((x: Yarn, key: ColumnKey) => {
    if (key === 'isActive') return x.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')
    if (['yarnGroup', 'material', 'countType', 'unitOfMeasure'].includes(key)) return label(String(x[key] ?? ''))
    return String(x[key] ?? '')
  }, [fa, label])
  const filtered = useMemo(() => {
    const result = yarns.filter(x => columns.every(c => filters[c.key] === null || filters[c.key]!.includes(columnValue(x, c.key))))
    return [...result].sort((a, b) => {
      const av = sort.key === 'countValue' ? a.countValue ?? -Infinity : columnValue(a, sort.key)
      const bv = sort.key === 'countValue' ? b.countValue ?? -Infinity : columnValue(b, sort.key)
      const n = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), fa ? 'fa' : 'en', { numeric: true })
      return sort.direction === 'asc' ? n : -n
    })
  }, [yarns, columns, filters, sort, columnValue, fa])
  const filterValues = useMemo(() => filterMenu === null ? [] : [...new Set(yarns.map(x => columnValue(x, filterMenu)))].sort((a, b) => a.localeCompare(b, fa ? 'fa' : 'en', { numeric: true })), [filterMenu, yarns, columnValue, fa])
  const shownFilterValues = filterValues.filter(x => x.toLocaleLowerCase().includes(filterSearch.trim().toLocaleLowerCase()))
  const selectedIndex = Math.max(0, filtered.findIndex(x => x.id === selectedId))

  const selectYarn = useCallback((x?: Yarn) => {
    setSelectedId(x?.id ?? '')
    if (x) { const value = copyDraft(x); setDraft(value); original.current = JSON.stringify(value) }
  }, [])
  const load = useCallback(async (preferId?: string) => {
    setLoading(true); setError('')
    try {
      const items = demoMode ? demoYarns : (await api<YarnPageResult>('/api/yarns?page=1&pageSize=500&includeInactive=true')).items
      setYarns(items); selectYarn(items.find(x => x.id === preferId) ?? items[0])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [demoMode, selectYarn])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (mode === 'view' && selected) selectYarn(selected) }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem(columnKey, JSON.stringify(columns)) }, [columnKey, columns])
  useEffect(() => { localStorage.setItem(shortcutKey, JSON.stringify(shortcuts)) }, [shortcutKey, shortcuts])
  useEffect(() => { const fn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }; window.addEventListener('beforeunload', fn); return () => window.removeEventListener('beforeunload', fn) }, [dirty])
  useEffect(() => { if (mode !== 'view') requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus()) }, [mode])

  const set = <K extends keyof YarnDraft>(key: K, value: YarnDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: '' }))
  }
  const validateField = useCallback((key: keyof YarnDraft, value = draft[key]) => {
    if (key === 'code' && !String(value ?? '').trim()) return fa ? 'کد نخ الزامی است.' : 'Yarn code is required.'
    if (key === 'code' && String(value).trim().length > 50) return fa ? 'کد نخ حداکثر ۵۰ کاراکتر است.' : 'Maximum length is 50.'
    if (key === 'name' && !String(value ?? '').trim()) return fa ? 'نام نخ الزامی است.' : 'Yarn name is required.'
    if (key === 'name' && String(value).trim().length > 200) return fa ? 'نام نخ حداکثر ۲۰۰ کاراکتر است.' : 'Maximum length is 200.'
    if (['filamentNumber', 'countValue', 'twistAmount'].includes(key) && value !== undefined && Number(value) < 0) return fa ? 'مقدار نمی‌تواند منفی باشد.' : 'Value cannot be negative.'
    if (key === 'plyCount' && (Number(value) < 0 || Number(value) > 9 || !Number.isInteger(Number(value)))) return fa ? 'تعداد لا باید عددی بین صفر تا ۹ باشد.' : 'Ply count must be 0 to 9.'
    return ''
  }, [draft, fa])
  const validateAndShow = useCallback((key: keyof YarnDraft) => { const msg = validateField(key); setFieldErrors(current => ({ ...current, [key]: msg })); return !msg }, [validateField])
  const validateAll = useCallback(() => {
    const keys: (keyof YarnDraft)[] = ['code', 'name', 'filamentNumber', 'countValue', 'twistAmount', 'plyCount'], errors: Partial<Record<keyof YarnDraft, string>> = {}
    keys.forEach(k => { const msg = validateField(k); if (msg) errors[k] = msg }); setFieldErrors(errors)
    const first = keys.find(k => errors[k]); if (first) formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus()
    return !first
  }, [validateField])
  const beginNew = useCallback(async () => {
    const value = emptyDraft()
    try { value.code = await suggestSerial('yarn', demoMode, yarns.at(-1)?.code, 'YRN-0001') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setDraft(value); original.current = JSON.stringify(value); setMode('new'); setMessage(''); setFieldErrors({})
  }, [demoMode, yarns])
  const beginEdit = useCallback(() => { if (!selected) return; const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({}) }, [selected])
  const cancel = useCallback(() => {
    if (dirty && !confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information changed. Exit?')) return
    setMode('view'); setError(''); setFieldErrors({}); if (selected) selectYarn(selected)
  }, [dirty, fa, selected, selectYarn])
  const save = useCallback(async () => {
    if (mode === 'view' || !validateAll()) return
    try {
      if (demoMode) {
        const value: Yarn = { id: mode === 'new' ? crypto.randomUUID() : selectedId, comprehensiveName, ...draft }
        setYarns(current => mode === 'new' ? [...current, value] : current.map(x => x.id === selectedId ? value : x))
        setMode('view'); selectYarn(value)
      } else {
        const saved = mode === 'new'
          ? await apiRequest<Yarn>('/api/yarns', { method: 'POST', body: JSON.stringify(payload(draft)) })
          : await apiRequest<Yarn>(`/api/yarns/${selectedId}`, { method: 'PUT', body: JSON.stringify(payload(draft)) })
        setMode('view'); await load(saved.id)
      }
      setMessage(fa ? 'اطلاعات نخ با موفقیت ثبت شد.' : 'Yarn saved successfully.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [mode, validateAll, demoMode, selectedId, comprehensiveName, draft, selectYarn, load, fa])
  const remove = useCallback(async () => {
    if (!selected || mode !== 'view' || !confirm(fa ? `نخ «${selected.comprehensiveName}» حذف شود؟` : `Delete “${selected.comprehensiveName}”?`)) return
    try {
      if (demoMode) { const next = yarns.filter(x => x.id !== selected.id); setYarns(next); selectYarn(next[0]) }
      else { await apiRequest<void>(`/api/yarns/${selected.id}`, { method: 'DELETE' }); await load() }
      setMessage(fa ? 'نخ حذف شد.' : 'Yarn deleted.')
    } catch (e) { setError(e instanceof ApiError && e.status === 409 ? (fa ? 'این نخ در تراکنش‌های سیستم استفاده شده و قابل حذف نیست.' : e.message) : e instanceof Error ? e.message : String(e)) }
  }, [selected, mode, fa, demoMode, yarns, selectYarn, load])
  const move = useCallback((where: 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end') => {
    if (!filtered.length) return
    const delta = where === 'up' ? -1 : where === 'down' ? 1 : where === 'pageUp' ? -10 : where === 'pageDown' ? 10 : 0
    const index = where === 'home' ? 0 : where === 'end' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, selectedIndex + delta))
    selectYarn(filtered[index]); document.querySelector(`[data-yarn-id="${filtered[index].id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [filtered, selectedIndex, selectYarn])
  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (mode !== 'view') { if (shortcutMatches(event, shortcuts.save)) { event.preventDefault(); void save() } else if (event.key === 'Escape') { event.preventDefault(); cancel() }; return }
      if (event.key === 'Escape') { event.preventDefault(); if (filterMenu !== null) setFilterMenu(null); else window.dispatchEvent(new Event('close-active-form')); return }
      if (typing) return
      if (shortcutMatches(event, shortcuts.new)) { event.preventDefault(); void beginNew() }
      else if (shortcutMatches(event, shortcuts.edit)) { event.preventDefault(); beginEdit() }
      else if (shortcutMatches(event, shortcuts.delete)) { event.preventDefault(); void remove() }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move('up') } else if (event.key === 'ArrowDown') { event.preventDefault(); move('down') }
      else if (event.key === 'PageUp') { event.preventDefault(); move('pageUp') } else if (event.key === 'PageDown') { event.preventDefault(); move('pageDown') }
      else if (event.key === 'Home') { event.preventDefault(); move('home') } else if (event.key === 'End') { event.preventDefault(); move('end') }
    }; document.addEventListener('keydown', fn); return () => document.removeEventListener('keydown', fn)
  }, [mode, shortcuts, save, cancel, beginNew, beginEdit, remove, move, filterMenu])

  function formKeyDown(event: React.KeyboardEvent) {
    if (mode === 'view' || event.altKey || event.ctrlKey || event.metaKey || !['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
    const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') ?? []).filter(x => x.tabIndex !== -1)
    const target = event.target as HTMLElement, index = controls.indexOf(target); if (index < 0) return
    if (target instanceof HTMLSelectElement && event.key !== 'Enter') return
    event.preventDefault(); const field = target.dataset.field as keyof YarnDraft | undefined
    if (event.key === 'Enter' && field && !validateAndShow(field)) return
    const next = event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(controls.length - 1, index + 1); controls[next]?.focus()
    if (controls[next] instanceof HTMLInputElement && controls[next].type === 'text') controls[next].select()
  }
  function resizeStart(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId); const startY = event.clientY, start = topHeight, height = frameRef.current?.clientHeight ?? 720
    const moveResize = (e: PointerEvent) => setTopHeight(Math.max(320, Math.min(height - 250, start + e.clientY - startY)))
    const stop = () => { window.removeEventListener('pointermove', moveResize); window.removeEventListener('pointerup', stop); setTopHeight(x => { localStorage.setItem(splitKey, String(Math.round(x))); return x }) }
    window.addEventListener('pointermove', moveResize); window.addEventListener('pointerup', stop)
  }
  function resizeColumn(event: React.PointerEvent, key: ColumnKey) {
    event.stopPropagation(); const startX = event.clientX, width = columns.find(x => x.key === key)?.width ?? 120, direction = document.documentElement.dir === 'rtl' ? -1 : 1
    const moveResize = (e: PointerEvent) => setColumns(current => current.map(x => x.key === key ? { ...x, width: Math.max(80, width + (e.clientX - startX) * direction) } : x))
    const stop = () => { window.removeEventListener('pointermove', moveResize); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', moveResize); window.addEventListener('pointerup', stop)
  }
  function openFilter(key: ColumnKey, anchor: HTMLElement) {
    const values = [...new Set(yarns.map(x => columnValue(x, key)))], rect = anchor.getBoundingClientRect(), width = 320, height = 400
    setFilterPosition({ top: Math.max(8, Math.min(rect.bottom + 2, innerHeight - height - 8)), left: Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)) })
    setFilterMenu(key); setFilterSearch(''); setPendingFilter(filters[key] ?? values)
  }
  function applyFilter(key: ColumnKey) {
    const all = [...new Set(yarns.map(x => columnValue(x, key)))]; setFilters(current => ({ ...current, [key]: pendingFilter.length === all.length ? null : [...pendingFilter] })); setFilterMenu(null)
  }
  const fieldLabel: Record<ColumnKey, string> = { code: fa ? 'کد نخ' : 'Code', comprehensiveName: fa ? 'نام فراگیر' : 'Comprehensive name', yarnGroup: fa ? 'گروه نخ' : 'Group', material: fa ? 'جنس نخ' : 'Material', countValue: fa ? 'نمره' : 'Count', countType: fa ? 'نوع نمره' : 'Count type', unitOfMeasure: fa ? 'واحد' : 'Unit', isActive: fa ? 'وضعیت' : 'Status' }
  const disabled = mode === 'view'
  const select = (key: keyof typeof options, title: string, required = false) => <Field label={title}><select data-field={key} disabled={disabled} value={String(draft[key] ?? '')} onChange={e => set(key, e.target.value as never)}>{!required && <option value="">—</option>}{options[key].map(x => <option key={x} value={x}>{label(x)}</option>)}</select></Field>

  return <div className="persons-page yarns-page" ref={frameRef} style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px,1fr)` }}>
    <section className="person-editor panel">
      <div className="person-section-head"><div><h2>{fa ? 'اطلاعات کامل نخ' : 'Yarn details'}</h2><p>{mode === 'new' ? (fa ? 'تعریف نخ جدید' : 'New yarn') : mode === 'edit' ? (fa ? 'اصلاح اطلاعات' : 'Edit yarn') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div><span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span></div>
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid yarn-form-grid ${mode !== 'view' ? 'editing' : ''}`} ref={formRef} onKeyDown={formKeyDown} onBlur={e => { const key = (e.target as HTMLElement).dataset.field as keyof YarnDraft | undefined; if (mode !== 'view' && key) validateAndShow(key) }}>
        <Field label={fa ? 'کد نخ *' : 'Yarn code *'} error={fieldErrors.code}><input data-field="code" aria-invalid={Boolean(fieldErrors.code)} disabled={disabled} maxLength={50} value={draft.code} onChange={e => set('code', e.target.value)} /></Field>
        <Field label={fa ? 'نام نخ *' : 'Yarn name *'} error={fieldErrors.name}><input data-field="name" aria-invalid={Boolean(fieldErrors.name)} disabled={disabled} maxLength={200} value={draft.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label={fa ? 'نام فراگیر (خودکار)' : 'Comprehensive name (automatic)'} wide><input className="comprehensive-preview" disabled value={comprehensiveName} /></Field>
        {select('yarnGroup', fa ? 'گروه نخ' : 'Yarn group')}{select('luster', fa ? 'براقیت نخ' : 'Luster')}{select('unitOfMeasure', fa ? 'واحد شمارش' : 'Unit', true)}{select('fixStatus', fa ? 'وضعیت فیکسه' : 'Fix status')}
        {select('material', fa ? 'جنس نخ' : 'Material')}{select('spinType', fa ? 'نوع ریس' : 'Spin type')}
        <Field label={fa ? 'فیلامنت (نمره)' : 'Filament number'} error={fieldErrors.filamentNumber}><input data-field="filamentNumber" aria-invalid={Boolean(fieldErrors.filamentNumber)} className="ltr-input" disabled={disabled} type="number" min={0} step="any" value={draft.filamentNumber ?? ''} onChange={e => set('filamentNumber', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
        {select('spinningMethod', fa ? 'روش ریس' : 'Spinning method')}{select('continuityType', fa ? 'نوع پیوستگی' : 'Continuity type')}
        <Field label={fa ? 'نمره' : 'Count'} error={fieldErrors.countValue}><input data-field="countValue" aria-invalid={Boolean(fieldErrors.countValue)} className="ltr-input" disabled={disabled} type="number" min={0} step="any" value={draft.countValue ?? ''} onChange={e => set('countValue', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
        {select('countType', fa ? 'نوع نمره' : 'Count type')}
        <Field label={fa ? 'مقدار تاب' : 'Twist amount'} error={fieldErrors.twistAmount}><input data-field="twistAmount" aria-invalid={Boolean(fieldErrors.twistAmount)} className="ltr-input" disabled={disabled} type="number" min={0} step="any" value={draft.twistAmount ?? ''} onChange={e => set('twistAmount', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
        {select('twistType', fa ? 'نوع تاب' : 'Twist type')}
        <Field label={fa ? 'تعداد لا (۰ تا ۹)' : 'Ply count (0-9)'} error={fieldErrors.plyCount}><input data-field="plyCount" aria-invalid={Boolean(fieldErrors.plyCount)} className="ltr-input" disabled={disabled} type="number" min={0} max={9} step={1} value={draft.plyCount} onChange={e => set('plyCount', Number(e.target.value))} /></Field>
        <Field label={fa ? 'توضیحات' : 'Notes'} wide><input data-field="notes" disabled={disabled} value={draft.notes} onChange={e => set('notes', e.target.value)} /></Field>
        <label className="active-check"><input data-field="isActive" type="checkbox" disabled={disabled} checked={draft.isActive} onChange={e => set('isActive', e.target.checked)} />{fa ? 'فعال' : 'Active'}</label>
      </div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      <div className="grid-toolbar"><div><h2>{fa ? 'فهرست نخ‌ها' : 'Yarns'}</h2><span>{fa ? `${filtered.length} از ${yarns.length} رکورد` : `${filtered.length} of ${yarns.length} records`}</span></div><details className="column-picker"><summary>☷ {fa ? 'ستون‌ها' : 'Columns'}</summary><div>{columns.map(c => <label key={c.key}><input type="checkbox" checked={c.visible} disabled={c.visible && visibleColumns.length === 1} onChange={() => { setColumns(current => current.map(x => x.key === c.key ? { ...x, visible: !x.visible } : x)); setFilters(current => ({ ...current, [c.key]: null })) }} />{fieldLabel[c.key]}</label>)}<button type="button" onClick={() => setColumns(defaultColumns)}>↺ {fa ? 'حالت پیش‌فرض' : 'Reset'}</button></div></details></div>
      <div className="person-table-wrap"><table className="person-table excel-grid" style={{ minWidth: visibleColumns.reduce((sum, x) => sum + x.width, 0) }}><colgroup>{visibleColumns.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup><thead><tr>{visibleColumns.map(c => <th key={c.key}><div className="column-heading"><button type="button" className="column-title" onClick={() => setSort(s => s.key === c.key ? { key: c.key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key: c.key, direction: 'asc' })}>{fieldLabel[c.key]}<span>{sort.key === c.key ? sort.direction === 'asc' ? '▲' : '▼' : ''}</span></button><button type="button" className={`excel-filter-trigger ${filters[c.key] !== null ? 'active' : ''}`} onClick={e => filterMenu === c.key ? setFilterMenu(null) : openFilter(c.key, e.currentTarget)}>▼</button></div>
        {filterMenu === c.key && <div className="excel-filter-menu" style={filterPosition}>
          <button type="button" className="filter-command" onClick={() => { setSort({ key: c.key, direction: 'asc' }); setFilterMenu(null) }}><b>AZ↓</b><span>{fa ? 'مرتب‌سازی از کوچک به بزرگ' : 'Sort A to Z'}</span></button>
          <button type="button" className="filter-command" onClick={() => { setSort({ key: c.key, direction: 'desc' }); setFilterMenu(null) }}><b>ZA↓</b><span>{fa ? 'مرتب‌سازی از بزرگ به کوچک' : 'Sort Z to A'}</span></button>
          <button type="button" className="filter-command clear" disabled={filters[c.key] === null} onClick={() => { setFilters(x => ({ ...x, [c.key]: null })); setFilterMenu(null) }}>⊘ <span>{fa ? `پاک کردن فیلتر «${fieldLabel[c.key]}»` : 'Clear filter'}</span></button>
          <input className="filter-value-search" autoFocus value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder={fa ? 'جستجو…' : 'Search…'} />
          <div className="filter-values"><label><input type="checkbox" checked={pendingFilter.length === filterValues.length} onChange={e => setPendingFilter(e.target.checked ? filterValues : [])} />{fa ? '(انتخاب همه)' : '(Select All)'}</label>{shownFilterValues.map(v => <label key={v}><input type="checkbox" checked={pendingFilter.includes(v)} onChange={e => setPendingFilter(x => e.target.checked ? [...x, v] : x.filter(y => y !== v))} />{v || (fa ? '(خالی)' : '(Blanks)')}</label>)}</div>
          <div className="filter-actions"><button type="button" className="primary" onClick={() => applyFilter(c.key)}>{fa ? 'تأیید' : 'OK'}</button><button type="button" onClick={() => setFilterMenu(null)}>{fa ? 'انصراف' : 'Cancel'}</button></div>
        </div>}<i className="column-resizer" onPointerDown={e => resizeColumn(e, c.key)} /></th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan={visibleColumns.length}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : filtered.length ? filtered.map(x => <tr key={x.id} data-yarn-id={x.id} className={x.id === selectedId ? 'selected' : ''} onClick={() => mode === 'view' && selectYarn(x)} onDoubleClick={beginEdit}>{visibleColumns.map(c => <td key={c.key}>{c.key === 'code' ? <span className="mono">{x.code}</span> : c.key === 'isActive' ? <span className={`person-status ${x.isActive ? 'active' : 'inactive'}`}>{columnValue(x, c.key)}</span> : columnValue(x, c.key) || '—'}</td>)}</tr>) : <tr><td colSpan={visibleColumns.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
      </tbody></table></div>
      <div className="shortcut-bar">{mode === 'view' ? <>
        <Shortcut code={shortcuts.new} label={fa ? 'نخ جدید' : 'New'} onClick={beginNew} primary disabled={!hasPermission('yarns.create')} /><Shortcut code={shortcuts.edit} label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!hasPermission('yarns.edit')} /><Shortcut code={shortcuts.delete} label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!hasPermission('yarns.delete')} />
        <Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move('home')} /><Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Page up'} onClick={() => move('pageUp')} /><Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move('down')} /><Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Page down'} onClick={() => move('pageDown')} /><Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move('end')} />
      </> : <><Shortcut code={shortcuts.save} label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary /><Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} /></>}
        <details className="shortcut-settings"><summary title={fa ? 'شخصی‌سازی کلیدها' : 'Customize shortcuts'}>⚙</summary><div>{(Object.keys(shortcuts) as ShortcutAction[]).map(action => <label key={action}><span>{({ new: fa ? 'جدید' : 'New', edit: fa ? 'ویرایش' : 'Edit', delete: fa ? 'حذف' : 'Delete', save: fa ? 'ثبت' : 'Save' })[action]}</span><select value={shortcuts[action]} onChange={e => setShortcuts(x => ({ ...x, [action]: e.target.value }))}>{shortcutOptions.map(o => <option key={o}>{o}</option>)}</select></label>)}</div></details>
      </div>
    </section>
  </div>
}

function Field({ label, wide, error, children }: { label: string, wide?: boolean, error?: string, children: React.ReactNode }) {
  return <label className={`${wide ? 'wide-field' : ''} ${error ? 'invalid-field' : ''}`}><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}
function Shortcut({ code, label, onClick, primary, danger, disabled }: { code: string, label: string, onClick: () => void, primary?: boolean, danger?: boolean, disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`${primary ? 'primary' : ''} ${danger ? 'danger-shortcut' : ''}`} onClick={onClick}><kbd>{code}</kbd><span>{label}</span></button>
}
