import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, apiRequest, currentUserKey, hasPermission } from './api'
import type { Language } from './i18n'
import { suggestSerial } from './sequences'

type ParameterType = 'Job' | 'Title' | 'Nationality'
type Parameter = { id: string, parameterType: ParameterType, code: string, nameFa: string, nameEn: string }
export type Person = {
  id: string, personCode: string, accountingCode?: string, personType: 'Individual' | 'Company', firstName?: string,
  lastName?: string, companyName?: string, displayName: string, jobId?: string, job?: Parameter, titleId?: string,
  title?: Parameter, nationalityId?: string, nationality?: Parameter, preferredLanguage: 'fa' | 'en', creditLimitIRR: number,
  phone?: string, mobile?: string, address?: string, notes?: string, isActive: boolean
}
type PersonPage = { items: Person[], total: number }
type Mode = 'view' | 'new' | 'edit'
type PersonDraft = Omit<Person, 'id' | 'displayName' | 'job' | 'title' | 'nationality'>
type ColumnKey = 'personCode' | 'displayName' | 'job' | 'nationality' | 'mobile' | 'creditLimitIRR' | 'isActive'
type ColumnState = { key: ColumnKey, width: number, visible: boolean }
type SortState = { key: ColumnKey, direction: 'asc' | 'desc' }
type ColumnFilters = Record<ColumnKey, string[] | null>
type ShortcutAction = 'new' | 'edit' | 'delete' | 'save'
type ShortcutMap = Record<ShortcutAction, string>
const defaultShortcuts: ShortcutMap = { new: 'Space', edit: 'Insert', delete: 'Delete', save: 'F3' }
const shortcutOptions = ['Space', 'Insert', 'Delete', 'F2', 'F3', 'F4', 'F6', 'F7', 'Ctrl+N', 'Ctrl+E']

function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  if (shortcut.startsWith('Ctrl+')) return event.ctrlKey && event.key.toUpperCase() === shortcut.slice(5).toUpperCase()
  return shortcut === 'Space' ? event.code === 'Space' : event.key === shortcut
}

const defaultColumns: ColumnState[] = [
  { key: 'personCode', width: 130, visible: true },
  { key: 'displayName', width: 280, visible: true },
  { key: 'job', width: 150, visible: true },
  { key: 'nationality', width: 130, visible: true },
  { key: 'mobile', width: 145, visible: true },
  { key: 'creditLimitIRR', width: 160, visible: true },
  { key: 'isActive', width: 100, visible: true }
]
const emptyColumnFilters = (): ColumnFilters => ({ personCode: null, displayName: null, job: null, nationality: null, mobile: null, creditLimitIRR: null, isActive: null })

function loadColumns(key: string): ColumnState[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as ColumnState[] | null
    if (saved?.length && defaultColumns.every(column => saved.some(x => x.key === column.key))) return saved
  } catch { /* تنظیمات معیوب با پیش‌فرض جایگزین می‌شود. */ }
  return defaultColumns
}

const emptyDraft = (): PersonDraft => ({
  personCode: '', accountingCode: '', personType: 'Individual', firstName: '', lastName: '', companyName: '', jobId: '',
  titleId: '', nationalityId: '', preferredLanguage: 'fa', creditLimitIRR: 0, phone: '', mobile: '', address: '', notes: '', isActive: true
})

const copyDraft = (person: Person): PersonDraft => ({
  personCode: person.personCode, accountingCode: person.accountingCode ?? '', personType: person.personType,
  firstName: person.firstName ?? '', lastName: person.lastName ?? person.companyName ?? '', companyName: '',
  jobId: person.jobId ?? '', titleId: person.titleId ?? '', nationalityId: person.nationalityId ?? '',
  preferredLanguage: person.preferredLanguage, creditLimitIRR: person.creditLimitIRR, phone: person.phone ?? '',
  mobile: person.mobile ?? '', address: person.address ?? '', notes: person.notes ?? '', isActive: person.isActive
})

const personPayload = (draft: PersonDraft) => ({
  ...draft,
  companyName: null,
  jobId: draft.jobId || null,
  titleId: draft.titleId || null,
  nationalityId: draft.nationalityId || null
})

const demoParameters: Parameter[] = [
  { id: 'j1', parameterType: 'Job', code: 'CUSTOMER', nameFa: 'مشتری', nameEn: 'Customer' },
  { id: 'j2', parameterType: 'Job', code: 'SELLER', nameFa: 'فروشنده', nameEn: 'Seller' },
  { id: 'j3', parameterType: 'Job', code: 'SUPPLIER', nameFa: 'تأمین‌کننده', nameEn: 'Supplier' },
  { id: 'j4', parameterType: 'Job', code: 'PARTNER', nameFa: 'شریک', nameEn: 'Partner' },
  { id: 'j5', parameterType: 'Job', code: 'MANAGEMENT', nameFa: 'مدیریت', nameEn: 'Management' },
  { id: 'j6', parameterType: 'Job', code: 'ORDERS', nameFa: 'سفارشات', nameEn: 'Orders' },
  { id: 'j7', parameterType: 'Job', code: 'COMMERCE', nameFa: 'بازرگانی', nameEn: 'Commerce' },
  { id: 'j8', parameterType: 'Job', code: 'WAREHOUSE', nameFa: 'انباردار', nameEn: 'Warehouse keeper' },
  { id: 'j9', parameterType: 'Job', code: 'FINANCE', nameFa: 'مالی', nameEn: 'Finance' },
  { id: 'j10', parameterType: 'Job', code: 'OTHER', nameFa: 'سایر', nameEn: 'Other' },
  { id: 't1', parameterType: 'Title', code: 'MR', nameFa: 'آقا', nameEn: 'Mr.' },
  { id: 't2', parameterType: 'Title', code: 'COMPANY', nameFa: 'شرکت', nameEn: 'Company' },
  { id: 'n1', parameterType: 'Nationality', code: 'IR', nameFa: 'ایرانی', nameEn: 'Iranian' },
  { id: 'n2', parameterType: 'Nationality', code: 'CN', nameFa: 'چینی', nameEn: 'Chinese' }
]
const demoPersons: Person[] = [
  { id: 'p1', personCode: 'CUS-001', personType: 'Individual', firstName: 'علی', lastName: 'حسینی', displayName: 'علی حسینی', jobId: 'j1', job: demoParameters[0], titleId: 't1', title: demoParameters[2], nationalityId: 'n1', nationality: demoParameters[4], preferredLanguage: 'fa', creditLimitIRR: 2_500_000_000, mobile: '09121234567', isActive: true },
  { id: 'p2', personCode: 'CUS-002', personType: 'Company', lastName: 'شرکت بافندگی پارس', displayName: 'شرکت بافندگی پارس', jobId: 'j2', job: demoParameters[1], titleId: 't2', title: demoParameters[11], nationalityId: 'n1', nationality: demoParameters[12], preferredLanguage: 'fa', creditLimitIRR: 5_000_000_000, phone: '02188776655', isActive: true },
  { id: 'p3', personCode: 'SUP-CN-01', personType: 'Company', lastName: 'Xinsili Textile', displayName: 'Xinsili Textile', jobId: 'j3', job: demoParameters[2], titleId: 't2', title: demoParameters[11], nationalityId: 'n2', nationality: demoParameters[13], preferredLanguage: 'en', creditLimitIRR: 0, isActive: true }
]

export default function PersonsPage({ language, demoMode = false }: { language: Language, demoMode?: boolean }) {
  const fa = language === 'fa'
  const [persons, setPersons] = useState<Person[]>([])
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<PersonDraft>(emptyDraft)
  const original = useRef(JSON.stringify(emptyDraft()))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PersonDraft, string>>>({})
  const [loading, setLoading] = useState(true)
  const userKey = currentUserKey()
  const splitKey = `persons-split:${userKey}`
  const columnKey = `persons-columns:${userKey}`
  const shortcutKey = `persons-shortcuts:${userKey}`
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || 330)
  const [columns, setColumns] = useState<ColumnState[]>(() => loadColumns(columnKey))
  const [filters, setFilters] = useState<ColumnFilters>(emptyColumnFilters)
  const [sort, setSort] = useState<SortState>({ key: 'personCode', direction: 'asc' })
  const [filterMenu, setFilterMenu] = useState<ColumnKey | null>(null)
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 })
  const [filterSearch, setFilterSearch] = useState('')
  const [pendingFilter, setPendingFilter] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => {
    try { return { ...defaultShortcuts, ...JSON.parse(localStorage.getItem(shortcutKey) ?? '{}') } }
    catch { return defaultShortcuts }
  })
  const frameRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const selected = persons.find(x => x.id === selectedId)
  const dirty = mode !== 'view' && JSON.stringify(draft) !== original.current
  const jobs = parameters.filter(x => x.parameterType === 'Job')
  const titles = parameters.filter(x => x.parameterType === 'Title')
  const nationalities = parameters.filter(x => x.parameterType === 'Nationality')
  const visibleColumns = columns.filter(x => x.visible)
  const columnValue = useCallback((person: Person, key: ColumnKey): string => {
    if (key === 'job') return fa ? person.job?.nameFa ?? '' : person.job?.nameEn ?? ''
    if (key === 'nationality') return fa ? person.nationality?.nameFa ?? '' : person.nationality?.nameEn ?? ''
    if (key === 'isActive') return person.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')
    if (key === 'creditLimitIRR') return new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(person.creditLimitIRR)
    return String(person[key] ?? '')
  }, [fa])
  const filtered = useMemo(() => {
    const locale = language === 'fa' ? 'fa' : 'en'
    const result = persons.filter(person => columns.every(column => filters[column.key] === null || filters[column.key]!.includes(columnValue(person, column.key))))
    return [...result].sort((a, b) => {
      const left = sort.key === 'creditLimitIRR' ? a.creditLimitIRR : columnValue(a, sort.key)
      const right = sort.key === 'creditLimitIRR' ? b.creditLimitIRR : columnValue(b, sort.key)
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), locale, { numeric: true })
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [persons, columns, filters, sort, language, columnValue])
  const filterValues = useMemo(() => filterMenu === null ? [] : [...new Set(persons.map(person => columnValue(person, filterMenu)))].sort((a, b) => a.localeCompare(b, language === 'fa' ? 'fa' : 'en', { numeric: true })), [filterMenu, persons, columnValue, language])
  const visibleFilterValues = filterValues.filter(value => value.toLocaleLowerCase(language === 'fa' ? 'fa' : 'en').includes(filterSearch.trim().toLocaleLowerCase(language === 'fa' ? 'fa' : 'en')))
  const selectedIndex = Math.max(0, filtered.findIndex(x => x.id === selectedId))

  const load = useCallback(async (preferId?: string) => {
    setLoading(true); setError('')
    try {
      if (demoMode) {
        setPersons(demoPersons); setParameters(demoParameters)
        const next = demoPersons.find(x => x.id === preferId) ?? demoPersons[0]
        setSelectedId(next.id); const value = copyDraft(next); setDraft(value); original.current = JSON.stringify(value)
        return
      }
      const [people, refs] = await Promise.all([
        api<PersonPage>('/api/master-data/persons?page=1&pageSize=500&includeInactive=true'),
        api<Parameter[]>('/api/master-data/parameters')
      ])
      setPersons(people.items); setParameters(refs)
      const next = people.items.find(x => x.id === preferId) ?? people.items[0]
      setSelectedId(next?.id ?? '')
      if (next) { const value = copyDraft(next); setDraft(value); original.current = JSON.stringify(value) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [demoMode])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (mode !== 'view' || !selected) return
    const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value)
  }, [selectedId, selected, mode])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  useEffect(() => { localStorage.setItem(columnKey, JSON.stringify(columns)) }, [columnKey, columns])
  useEffect(() => { localStorage.setItem(shortcutKey, JSON.stringify(shortcuts)) }, [shortcutKey, shortcuts])
  useEffect(() => {
    if (mode === 'view') return
    const frame = requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [mode])
  const validateField = useCallback((key: keyof PersonDraft, value = draft[key]): string => {
    if (key === 'personCode') {
      const code = String(value ?? '').trim()
      if (!code) return fa ? 'کد شخص الزامی است.' : 'Person code is required.'
      if (code.length > 30) return fa ? 'کد شخص حداکثر ۳۰ کاراکتر است.' : 'Person code must not exceed 30 characters.'
    }
    if (key === 'lastName' && !String(value ?? '').trim()) return fa ? 'نام خانوادگی یا نام شرکت/اداره الزامی است.' : 'Last name or company name is required.'
    if (key === 'creditLimitIRR' && Number(value) < 0) return fa ? 'مبلغ اعتبار نمی‌تواند منفی باشد.' : 'Credit limit cannot be negative.'
    return ''
  }, [draft, fa])

  const validateAndShow = useCallback((key: keyof PersonDraft) => {
    const validationError = validateField(key)
    setFieldErrors(current => ({ ...current, [key]: validationError }))
    return !validationError
  }, [validateField])

  const validateAll = useCallback(() => {
    const keys: (keyof PersonDraft)[] = ['personCode', 'lastName', 'creditLimitIRR']
    const nextErrors: Partial<Record<keyof PersonDraft, string>> = {}
    keys.forEach(key => { const validationError = validateField(key); if (validationError) nextErrors[key] = validationError })
    setFieldErrors(nextErrors)
    const firstInvalid = keys.find(key => nextErrors[key])
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus()
    return !firstInvalid
  }, [validateField])

  const beginNew = useCallback(async () => {
    const value = emptyDraft()
    try { value.personCode = await suggestSerial('person', demoMode, persons.at(-1)?.personCode, 'PER-0001') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setDraft(value); original.current = JSON.stringify(value); setMode('new'); setMessage(''); setFieldErrors({})
  }, [demoMode, persons])
  const beginEdit = useCallback(() => {
    if (!selected) return
    const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({})
  }, [selected])
  const cancel = useCallback(() => {
    if (dirty && !window.confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information has changed. Exit the current mode?')) return
    setMode('view'); setError(''); setFieldErrors({}); if (selected) { const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value) }
  }, [dirty, fa, selected])
  const save = useCallback(async () => {
    if (mode === 'view') return
    setError(''); setMessage('')
    if (!validateAll()) return
    try {
      const saved = mode === 'new'
        ? await apiRequest<Person>('/api/master-data/persons', { method: 'POST', body: JSON.stringify(personPayload(draft)) })
        : await apiRequest<Person>(`/api/master-data/persons/${selectedId}`, { method: 'PUT', body: JSON.stringify(personPayload(draft)) })
      setMode('view'); setMessage(fa ? 'اطلاعات با موفقیت ثبت شد.' : 'Saved successfully.'); await load(saved.id)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [mode, draft, fa, selectedId, load, validateAll])
  const remove = useCallback(async () => {
    if (!selected || mode !== 'view') return
    if (!window.confirm(fa ? `شخص «${selected.displayName}» حذف شود؟` : `Delete “${selected.displayName}”?`)) return
    try {
      await apiRequest<void>(`/api/master-data/persons/${selected.id}`, { method: 'DELETE' })
      setMessage(fa ? 'شخص حذف شد.' : 'Person deleted.'); await load()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(fa ? 'این شخص سابقه عملیاتی دارد یا مانده حساب او صفر نیست و قابل حذف نیست.' : e.message)
      else setError(e instanceof Error ? e.message : String(e))
    }
  }, [selected, mode, fa, load])

  const move = useCallback((where: 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end') => {
    if (!filtered.length) return
    const delta = where === 'up' ? -1 : where === 'down' ? 1 : where === 'pageUp' ? -10 : where === 'pageDown' ? 10 : 0
    const index = where === 'home' ? 0 : where === 'end' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, selectedIndex + delta))
    setSelectedId(filtered[index].id)
    document.querySelector(`[data-person-id="${filtered[index].id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [filtered, selectedIndex])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (mode !== 'view') {
        if (shortcutMatches(event, shortcuts.save)) { event.preventDefault(); void save() }
        if (event.key === 'Escape') { event.preventDefault(); cancel() }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (filterMenu !== null) setFilterMenu(null)
        else window.dispatchEvent(new Event('close-active-form'))
        return
      }
      if (typing) return
      if (shortcutMatches(event, shortcuts.new)) { event.preventDefault(); void beginNew() }
      else if (shortcutMatches(event, shortcuts.edit)) { event.preventDefault(); beginEdit() }
      else if (shortcutMatches(event, shortcuts.delete)) { event.preventDefault(); void remove() }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move('up') }
      else if (event.key === 'ArrowDown') { event.preventDefault(); move('down') }
      else if (event.key === 'PageUp') { event.preventDefault(); move('pageUp') }
      else if (event.key === 'PageDown') { event.preventDefault(); move('pageDown') }
      else if (event.key === 'Home') { event.preventDefault(); move('home') }
      else if (event.key === 'End') { event.preventDefault(); move('end') }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [mode, save, cancel, beginNew, beginEdit, remove, move, shortcuts, filterMenu])

  function resizeStart(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startY = event.clientY, startHeight = topHeight
    const frameHeight = frameRef.current?.clientHeight ?? 720
    const moveResize = (e: PointerEvent) => setTopHeight(Math.max(260, Math.min(frameHeight - 260, startHeight + e.clientY - startY)))
    const stopResize = () => {
      window.removeEventListener('pointermove', moveResize); window.removeEventListener('pointerup', stopResize)
      setTopHeight(value => { localStorage.setItem(splitKey, String(Math.round(value))); return value })
    }
    window.addEventListener('pointermove', moveResize); window.addEventListener('pointerup', stopResize)
  }

  function formKeyDown(event: React.KeyboardEvent) {
    if (mode === 'view' || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
    const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') ?? [])
      .filter(control => control.tabIndex !== -1)
    const index = controls.indexOf(target)
    if (index < 0) return
    if (target instanceof HTMLSelectElement && event.key !== 'Enter') return
    event.preventDefault()
    const field = target.dataset.field as keyof PersonDraft | undefined
    if (event.key === 'Enter' && field && !validateAndShow(field)) return
    const nextIndex = event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(controls.length - 1, index + 1)
    controls[nextIndex]?.focus()
    if (controls[nextIndex] instanceof HTMLInputElement && controls[nextIndex].type === 'text') controls[nextIndex].select()
  }

  function formBlur(event: React.FocusEvent) {
    const field = (event.target as HTMLElement).dataset.field as keyof PersonDraft | undefined
    if (mode !== 'view' && field) validateAndShow(field)
  }

  function sortBy(key: ColumnKey) {
    setSort(current => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }

  function resizeColumn(event: React.PointerEvent, key: ColumnKey) {
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = columns.find(x => x.key === key)?.width ?? 120
    const direction = document.documentElement.dir === 'rtl' ? -1 : 1
    const moveResize = (e: PointerEvent) => setColumns(current => current.map(column => column.key === key ? { ...column, width: Math.max(80, startWidth + (e.clientX - startX) * direction) } : column))
    const stopResize = () => { window.removeEventListener('pointermove', moveResize); window.removeEventListener('pointerup', stopResize) }
    window.addEventListener('pointermove', moveResize); window.addEventListener('pointerup', stopResize)
  }

  function toggleColumn(key: ColumnKey) {
    setColumns(current => current.map(column => column.key === key ? { ...column, visible: !column.visible } : column))
    setFilters(current => ({ ...current, [key]: null }))
  }

  function openFilterMenu(key: ColumnKey, anchor: HTMLElement) {
    const values = [...new Set(persons.map(person => columnValue(person, key)))]
    const rect = anchor.getBoundingClientRect(), width = 320, height = 400
    setFilterPosition({ top: Math.max(8, Math.min(rect.bottom + 2, window.innerHeight - height - 8)), left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) })
    setFilterMenu(key); setFilterSearch(''); setPendingFilter(filters[key] ?? values)
  }

  function applyFilter(key: ColumnKey) {
    const allValues = [...new Set(persons.map(person => columnValue(person, key)))]
    setFilters({ ...filters, [key]: pendingFilter.length === allValues.length ? null : [...pendingFilter] })
    setFilterMenu(null)
  }

  const disabled = mode === 'view'
  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: '' }))
  }
  const parameterLabel = (x?: Parameter) => x ? (fa ? x.nameFa : x.nameEn) : '—'
  const columnLabel = (key: ColumnKey) => ({
    personCode: fa ? 'کد' : 'Code', displayName: fa ? 'نام / عنوان' : 'Name', job: fa ? 'شغل' : 'Job',
    nationality: fa ? 'ملیت' : 'Nationality', mobile: fa ? 'موبایل' : 'Mobile',
    creditLimitIRR: fa ? 'اعتبار (ریال)' : 'Credit limit', isActive: fa ? 'وضعیت' : 'Status'
  })[key]
  const cell = (person: Person, key: ColumnKey) => {
    if (key === 'personCode') return <span className="mono">{person.personCode}</span>
    if (key === 'displayName') return person.displayName
    if (key === 'job') return parameterLabel(person.job)
    if (key === 'nationality') return parameterLabel(person.nationality)
    if (key === 'mobile') return <span className="mono">{person.mobile || '—'}</span>
    if (key === 'creditLimitIRR') return <span className="mono amount-cell">{new Intl.NumberFormat('fa-IR').format(person.creditLimitIRR)}</span>
    return <span className={`person-status ${person.isActive ? 'active' : 'inactive'}`}>{person.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')}</span>
  }
  const changePersonType = (personType: PersonDraft['personType']) => setDraft(current => {
    const titleCode = titles.find(x => x.id === current.titleId)?.code
    const incompatibleTitle = personType === 'Individual'
      ? titleCode === 'OFFICE' || titleCode === 'COMPANY'
      : titleCode === 'MR' || titleCode === 'MRS'
    return { ...current, personType, titleId: incompatibleTitle ? '' : current.titleId }
  })
  const changeTitle = (titleId: string) => setDraft(current => {
    const titleCode = titles.find(x => x.id === titleId)?.code
    const personType = titleCode === 'MR' || titleCode === 'MRS'
      ? 'Individual'
      : titleCode === 'OFFICE' || titleCode === 'COMPANY' ? 'Company' : current.personType
    return { ...current, titleId, personType }
  })

  return <div className="persons-page" ref={frameRef} style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px, 1fr)` }}>
    <section className="person-editor panel">
      <div className="person-section-head"><div><h2>{fa ? 'اطلاعات کامل شخص' : 'Person details'}</h2><p>{mode === 'new' ? (fa ? 'تعریف شخص جدید' : 'New person') : mode === 'edit' ? (fa ? 'اصلاح اطلاعات' : 'Edit person') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div><span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span></div>
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid ${mode !== 'view' ? 'editing' : ''}`} ref={formRef} onKeyDown={formKeyDown} onBlur={formBlur}>
        <Field label={fa ? 'کد شخص *' : 'Person code *'} error={fieldErrors.personCode}><input data-field="personCode" aria-invalid={Boolean(fieldErrors.personCode)} autoFocus={mode === 'new'} disabled={disabled} maxLength={30} value={draft.personCode} onChange={e => set('personCode', e.target.value)} /></Field>
        <Field label={fa ? 'نوع شخص' : 'Person type'}><select data-field="personType" disabled={disabled} value={draft.personType} onChange={e => changePersonType(e.target.value as PersonDraft['personType'])}><option value="Individual">{fa ? 'حقیقی' : 'Individual'}</option><option value="Company">{fa ? 'حقوقی' : 'Company'}</option></select></Field>
        <Field label={fa ? 'عنوان' : 'Title'}><select data-field="titleId" disabled={disabled} value={draft.titleId} onChange={e => changeTitle(e.target.value)}><option value="">—</option>{titles.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>
        <Field label={fa ? 'نام' : 'First name'}><input data-field="firstName" disabled={disabled || draft.personType === 'Company'} value={draft.firstName} onChange={e => set('firstName', e.target.value)} /></Field>
        <Field label={fa ? 'نام خانوادگی / نام شرکت یا اداره *' : 'Last name / company or office name *'} wide error={fieldErrors.lastName}><input data-field="lastName" aria-invalid={Boolean(fieldErrors.lastName)} disabled={disabled} value={draft.lastName} onChange={e => set('lastName', e.target.value)} /></Field>
        <Field label={fa ? 'نقش یا شغل' : 'Job'}><select data-field="jobId" disabled={disabled} value={draft.jobId} onChange={e => set('jobId', e.target.value)}><option value="">—</option>{jobs.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>
        <Field label={fa ? 'ملیت' : 'Nationality'}><select data-field="nationalityId" disabled={disabled} value={draft.nationalityId} onChange={e => set('nationalityId', e.target.value)}><option value="">—</option>{nationalities.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>
        <Field label={fa ? 'زبان' : 'Language'}><select data-field="preferredLanguage" disabled={disabled} value={draft.preferredLanguage} onChange={e => set('preferredLanguage', e.target.value as 'fa' | 'en')}><option value="fa">فارسی</option><option value="en">English</option></select></Field>
        <Field label={fa ? 'مبلغ اعتبار (ریال)' : 'Credit limit (IRR)'} error={fieldErrors.creditLimitIRR}><input data-field="creditLimitIRR" aria-invalid={Boolean(fieldErrors.creditLimitIRR)} className="ltr-input" disabled={disabled} min={0} type="number" value={draft.creditLimitIRR} onChange={e => set('creditLimitIRR', Number(e.target.value))} /></Field>
        <Field label={fa ? 'تلفن' : 'Phone'}><input data-field="phone" className="ltr-input" disabled={disabled} value={draft.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label={fa ? 'موبایل' : 'Mobile'}><input data-field="mobile" className="ltr-input" disabled={disabled} value={draft.mobile} onChange={e => set('mobile', e.target.value)} /></Field>
        <Field label={fa ? 'آدرس' : 'Address'} wide><input data-field="address" disabled={disabled} value={draft.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label={fa ? 'توضیحات' : 'Notes'} wide><input data-field="notes" disabled={disabled} value={draft.notes} onChange={e => set('notes', e.target.value)} /></Field>
        <label className="active-check"><input data-field="isActive" type="checkbox" disabled={disabled} checked={draft.isActive} onChange={e => set('isActive', e.target.checked)} />{fa ? 'فعال' : 'Active'}</label>
      </div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      <div className="grid-toolbar"><div><h2>{fa ? 'فهرست اشخاص' : 'People'}</h2><span>{fa ? `${filtered.length} از ${persons.length} رکورد` : `${filtered.length} of ${persons.length} records`}</span></div><details className="column-picker"><summary>☷ {fa ? 'ستون‌ها' : 'Columns'}</summary><div>{columns.map(column => <label key={column.key}><input type="checkbox" checked={column.visible} disabled={column.visible && visibleColumns.length === 1} onChange={() => toggleColumn(column.key)} />{columnLabel(column.key)}</label>)}<button type="button" onClick={() => setColumns(defaultColumns)}>↺ {fa ? 'حالت پیش‌فرض' : 'Reset'}</button></div></details></div>
      <div className="person-table-wrap"><table className="person-table excel-grid" style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{visibleColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead>
        <tr>{visibleColumns.map(column => <th key={column.key}><div className="column-heading"><button type="button" className="column-title" onClick={() => sortBy(column.key)}>{columnLabel(column.key)}<span>{sort.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}</span></button><button type="button" className={`excel-filter-trigger ${filters[column.key] !== null ? 'active' : ''}`} aria-label={`${fa ? 'فیلتر ستون' : 'Filter column'} ${columnLabel(column.key)}`} onClick={event => filterMenu === column.key ? setFilterMenu(null) : openFilterMenu(column.key, event.currentTarget)}>▼</button></div>{filterMenu === column.key && <div className="excel-filter-menu" style={filterPosition}>
          <button type="button" className="filter-command" onClick={() => { setSort({ key: column.key, direction: 'asc' }); setFilterMenu(null) }}><b>AZ↓</b><span>{fa ? 'مرتب‌سازی از کوچک به بزرگ' : 'Sort A to Z'}</span></button>
          <button type="button" className="filter-command" onClick={() => { setSort({ key: column.key, direction: 'desc' }); setFilterMenu(null) }}><b>ZA↓</b><span>{fa ? 'مرتب‌سازی از بزرگ به کوچک' : 'Sort Z to A'}</span></button>
          <button type="button" className="filter-command clear" disabled={filters[column.key] === null} onClick={() => { setFilters(current => ({ ...current, [column.key]: null })); setFilterMenu(null) }}>⊘ <span>{fa ? `پاک کردن فیلتر «${columnLabel(column.key)}»` : `Clear filter from “${columnLabel(column.key)}”`}</span></button>
          <input className="filter-value-search" autoFocus value={filterSearch} onChange={event => setFilterSearch(event.target.value)} placeholder={fa ? 'جستجو…' : 'Search…'} />
          <div className="filter-values"><label><input type="checkbox" checked={pendingFilter.length === filterValues.length} onChange={event => setPendingFilter(event.target.checked ? filterValues : [])} />{fa ? '(انتخاب همه)' : '(Select All)'}</label>{visibleFilterValues.map(value => <label key={value}><input type="checkbox" checked={pendingFilter.includes(value)} onChange={event => setPendingFilter(current => event.target.checked ? [...current, value] : current.filter(x => x !== value))} />{value || (fa ? '(خالی)' : '(Blanks)')}</label>)}</div>
          <div className="filter-actions"><button type="button" className="primary" onClick={() => applyFilter(column.key)}>{fa ? 'تأیید' : 'OK'}</button><button type="button" onClick={() => setFilterMenu(null)}>{fa ? 'انصراف' : 'Cancel'}</button></div>
        </div>}<i className="column-resizer" onPointerDown={event => resizeColumn(event, column.key)} /></th>)}</tr>
      </thead><tbody>
        {loading ? <tr><td colSpan={visibleColumns.length}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : filtered.length ? filtered.map(person => <tr key={person.id} data-person-id={person.id} className={person.id === selectedId ? 'selected' : ''} onClick={() => mode === 'view' && setSelectedId(person.id)} onDoubleClick={beginEdit}>{visibleColumns.map(column => <td key={column.key}>{cell(person, column.key)}</td>)}</tr>) : <tr><td colSpan={visibleColumns.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
      </tbody></table></div>
      <div className="shortcut-bar">
        {mode === 'view' ? <>
          <Shortcut code={shortcuts.new} label={fa ? 'شخص جدید' : 'New'} onClick={beginNew} primary disabled={!hasPermission('persons.create')} />
          <Shortcut code={shortcuts.edit} label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!hasPermission('persons.edit')} />
          <Shortcut code={shortcuts.delete} label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!hasPermission('persons.delete')} />
          <Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move('home')} />
          <Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Page up'} onClick={() => move('pageUp')} />
          <Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move('down')} />
          <Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Page down'} onClick={() => move('pageDown')} />
          <Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move('end')} />
        </> : <>
          <Shortcut code={shortcuts.save} label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary />
          <Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} />
        </>}
        <details className="shortcut-settings"><summary title={fa ? 'شخصی‌سازی کلیدها' : 'Customize shortcuts'}>⚙</summary><div>{(Object.keys(shortcuts) as ShortcutAction[]).map(action => <label key={action}><span>{({ new: fa ? 'جدید' : 'New', edit: fa ? 'ویرایش' : 'Edit', delete: fa ? 'حذف' : 'Delete', save: fa ? 'ثبت' : 'Save' })[action]}</span><select value={shortcuts[action]} onChange={e => setShortcuts(current => ({ ...current, [action]: e.target.value }))}>{shortcutOptions.map(option => <option key={option}>{option}</option>)}</select></label>)}</div></details>
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
