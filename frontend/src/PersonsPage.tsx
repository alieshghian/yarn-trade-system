import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, api, apiRequest, currentUserKey, hasPermission, isConcurrencyConflict, withRowVersion } from './api'
import type { Language } from './i18n'
import { suggestSerial } from './sequences'

type ParameterType = 'Job' | 'Title' | 'Nationality'
type Parameter = { id: string, parameterType: ParameterType, code: string, nameFa: string, nameEn: string, personType?: 'Individual' | 'Company' }
const titleOrder = ['MR', 'MRS', 'COMPANY', 'INSTITUTE', 'OFFICE', 'ORGANIZATION']
const titlePersonType = (title?: Parameter) => title?.personType ?? (title?.code === 'MR' || title?.code === 'MRS' ? 'Individual' : title && titleOrder.includes(title.code) ? 'Company' : undefined)
export type Person = {
  rowVersion?: string,
  id: string, personCode: string, accountingCode?: string, personType: 'Individual' | 'Company', firstName?: string,
  lastName?: string, companyName?: string, directorName?: string, displayName: string, jobId?: string, job?: Parameter, titleId?: string,
  title?: Parameter, nationalityId?: string, nationality?: Parameter, preferredLanguage: 'fa' | 'en' | 'zh', creditLimitIRR: number,
  phone?: string, phoneNumbers?: string[], mobile?: string, mobileNumbers?: string[], address?: string, addresses?: string[], notes?: string, isActive: boolean, isContractPartner?: boolean
}
type PersonPage = { items: Person[], total: number }
type Mode = 'view' | 'new' | 'edit'
type PersonDraft = Omit<Person, 'rowVersion' | 'id' | 'displayName' | 'job' | 'title' | 'nationality'>
type ColumnKey = 'personCode' | 'displayName' | 'job' | 'nationality' | 'mobile' | 'phone' | 'isActive'
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
  { key: 'phone', width: 160, visible: true },
  { key: 'isActive', width: 100, visible: true }
]
const emptyColumnFilters = (): ColumnFilters => ({ personCode: null, displayName: null, job: null, nationality: null, mobile: null, phone: null, isActive: null })

function loadColumns(key: string, legacyKey = key): ColumnState[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? localStorage.getItem(legacyKey) ?? 'null') as { key: ColumnKey | 'creditLimitIRR', width: number, visible: boolean }[] | null
    const current = saved?.map<ColumnState>(column => ({ ...column, key: column.key === 'creditLimitIRR' ? 'phone' : column.key, visible: column.key === 'creditLimitIRR' ? true : column.visible }))
    if (current?.length && defaultColumns.every(column => current.some(x => x.key === column.key))) return current
  } catch { /* تنظیمات معیوب با پیش‌فرض جایگزین می‌شود. */ }
  return defaultColumns
}

const emptyDraft = (): PersonDraft => ({
  personCode: '', accountingCode: '', personType: 'Individual', firstName: '', lastName: '', companyName: '', directorName: '', jobId: '',
  titleId: '', nationalityId: '', preferredLanguage: 'fa', creditLimitIRR: 0, phone: '', phoneNumbers: [], mobile: '', mobileNumbers: [], address: '', addresses: [], notes: '', isActive: true
})

const copyDraft = (person: Person): PersonDraft => ({
  personCode: person.personCode, accountingCode: person.accountingCode ?? '', personType: person.personType,
  firstName: person.firstName ?? '', lastName: person.lastName ?? person.companyName ?? '', companyName: '',
  directorName: person.directorName ?? '',
  jobId: person.jobId ?? '', titleId: person.titleId ?? '', nationalityId: person.nationalityId ?? '',
  preferredLanguage: person.preferredLanguage, creditLimitIRR: person.creditLimitIRR, phone: person.phone ?? '',
  phoneNumbers: person.phoneNumbers ?? (person.phone ? [person.phone] : []),
  mobile: person.mobile ?? '', mobileNumbers: person.mobileNumbers ?? (person.mobile ? [person.mobile] : []),
  address: person.address ?? '', addresses: person.addresses ?? (person.address ? [person.address] : []), notes: person.notes ?? '', isActive: person.isActive
})

const personPayload = (draft: PersonDraft) => ({
  ...draft,
  companyName: null,
  jobId: draft.jobId || null,
  titleId: draft.titleId || null,
  nationalityId: draft.nationalityId || null
})

const normalizeName = (value = '') => value.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase()

function formatInternationalNumber(value: string) {
  const match = value.match(/^\+(98|86)(\d+)$/)
  if (!match) return value
  const [, code, rest] = match
  const groups = code === '98' ? [3, 3, 4] : code === '86' ? [3, 4, 4] : []
  if (!groups.length) return `+${code} ${rest.replace(/(.{4})(?=.)/g, '$1 ')}`
  const chunks: string[] = []
  let offset = 0
  for (const size of groups) { if (offset >= rest.length) break; chunks.push(rest.slice(offset, offset + size)); offset += size }
  if (offset < rest.length) chunks.push(rest.slice(offset))
  return `+${code} ${chunks.join(' ')}`
}

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
  { id: 't1', parameterType: 'Title', code: 'MR', nameFa: 'آقای', nameEn: 'Mr.' },
  { id: 't2', parameterType: 'Title', code: 'COMPANY', nameFa: 'شرکت', nameEn: 'Company' },
  { id: 'n1', parameterType: 'Nationality', code: 'IR', nameFa: 'ایرانی', nameEn: 'Iranian' },
  { id: 'n2', parameterType: 'Nationality', code: 'CN', nameFa: 'چینی', nameEn: 'Chinese' },
  { id: 't3', parameterType: 'Title', code: 'MRS', nameFa: 'خانم', nameEn: 'Ms.' },
  { id: 't4', parameterType: 'Title', code: 'INSTITUTE', nameFa: 'مؤسسه', nameEn: 'Institute' },
  { id: 't5', parameterType: 'Title', code: 'OFFICE', nameFa: 'اداره', nameEn: 'Office' },
  { id: 't6', parameterType: 'Title', code: 'ORGANIZATION', nameFa: 'سازمان', nameEn: 'Organization' }
]
const demoPersons: Person[] = [
  { id: 'p1', personCode: 'CUS-001', personType: 'Individual', firstName: 'علی', lastName: 'حسینی', displayName: 'علی حسینی', jobId: 'j1', job: demoParameters[0], titleId: 't1', title: demoParameters[2], nationalityId: 'n1', nationality: demoParameters[4], preferredLanguage: 'fa', creditLimitIRR: 2_500_000_000, mobile: '09121234567', isActive: true },
  { id: 'p2', personCode: 'CUS-002', personType: 'Company', lastName: 'شرکت بافندگی پارس', displayName: 'شرکت بافندگی پارس', jobId: 'j2', job: demoParameters[1], titleId: 't2', title: demoParameters[11], nationalityId: 'n1', nationality: demoParameters[12], preferredLanguage: 'fa', creditLimitIRR: 5_000_000_000, phone: '02188776655', isActive: true },
  { id: 'p3', personCode: 'SUP-CN-01', personType: 'Company', lastName: 'Xinsili Textile', displayName: 'Xinsili Textile', jobId: 'j3', job: demoParameters[2], titleId: 't2', title: demoParameters[11], nationalityId: 'n2', nationality: demoParameters[13], preferredLanguage: 'en', creditLimitIRR: 0, isActive: true }
]

type ContractCreation = { personId?: string, onSaved: (person: Person) => void, onCancel: () => void }
export default function PersonsPage({ language, demoMode = false, contractCreation, authenticatedUserId }: { language: Language, demoMode?: boolean, contractCreation?: ContractCreation, authenticatedUserId?: string }) {
  const fa = language === 'fa'
  const [persons, setPersons] = useState<Person[]>([])
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [titleEntry, setTitleEntry] = useState(false)
  const [titleName, setTitleName] = useState('')
  const [titleKind, setTitleKind] = useState<'' | 'Individual' | 'Company'>('')
  const [titleError, setTitleError] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const [titlePosition, setTitlePosition] = useState<React.CSSProperties>({})
  const titleInput = useRef<HTMLInputElement>(null)
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
  const columnKey = `persons-columns:${authenticatedUserId ?? userKey}`
  const legacyColumnKey = `persons-columns:${userKey}`
  const shortcutKey = `persons-shortcuts:${userKey}`
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || 330)
  const [columns, setColumns] = useState<ColumnState[]>(() => loadColumns(columnKey, legacyColumnKey))
  const columnOwner = useRef(columnKey)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [columnMenuPosition, setColumnMenuPosition] = useState<React.CSSProperties>({})
  const columnPicker = useRef<HTMLDetailsElement>(null)
  const columnMenu = useRef<HTMLDivElement>(null)
  const draggedColumn = useRef<ColumnKey | null>(null)
  const [columnDrop, setColumnDrop] = useState<{ key: ColumnKey, before: boolean } | null>(null)
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
  const contractStarted = useRef(false)

  const selected = persons.find(x => x.id === selectedId)
  const dirty = mode !== 'view' && JSON.stringify(draft) !== original.current
  const jobs = parameters.filter(x => x.parameterType === 'Job' && x.code !== 'PARTNER')
  const titles = parameters.filter(x => x.parameterType === 'Title').sort((a, b) => (titleOrder.includes(a.code) ? titleOrder.indexOf(a.code) : 99) - (titleOrder.includes(b.code) ? titleOrder.indexOf(b.code) : 99))
  const nationalities = parameters.filter(x => x.parameterType === 'Nationality')
  const dialingCode = nationalities.find(x => x.id === draft.nationalityId)?.code === 'CN' ? '+86' : nationalities.find(x => x.id === draft.nationalityId)?.code === 'IR' ? '+98' : ''
  const visibleColumns = columns.filter(x => x.visible)
  const columnValue = useCallback((person: Person, key: ColumnKey): string => {
    if (key === 'job') return fa ? person.job?.nameFa ?? '' : person.job?.nameEn ?? ''
    if (key === 'nationality') return fa ? person.nationality?.nameFa ?? '' : person.nationality?.nameEn ?? ''
    if (key === 'isActive') return person.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')
    return String(person[key] ?? '')
  }, [fa])
  const filtered = useMemo(() => {
    const locale = language === 'fa' ? 'fa' : 'en'
    const result = persons.filter(person => columns.every(column => filters[column.key] === null || filters[column.key]!.includes(columnValue(person, column.key))))
    return [...result].sort((a, b) => {
      const left = columnValue(a, sort.key)
      const right = columnValue(b, sort.key)
      const comparison = left.localeCompare(right, locale, { numeric: true })
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
  useEffect(() => { if (titleEntry) titleInput.current?.focus() }, [titleEntry])
  useEffect(() => { setTitleEntry(false) }, [mode])
  useEffect(() => {
    if (mode !== 'view' || !selected) return
    const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value)
  }, [selectedId, selected, mode])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  useEffect(() => {
    if (columnOwner.current !== columnKey) {
      columnOwner.current = columnKey
      setColumns(loadColumns(columnKey, legacyColumnKey)); setColumnMenuOpen(false)
      return
    }
    localStorage.setItem(columnKey, JSON.stringify(columns))
  }, [columnKey, legacyColumnKey, columns])
  useEffect(() => {
    if (!columnMenuOpen) return
    const position = () => {
      const anchor = columnPicker.current?.querySelector('summary')?.getBoundingClientRect()
      if (!anchor) return
      const width = Math.min(210, window.innerWidth - 16)
      const height = Math.min(columnMenu.current?.scrollHeight ?? 260, window.innerHeight - 16)
      const below = Math.max(0, window.innerHeight - anchor.bottom - 12)
      const above = Math.max(0, anchor.top - 12)
      const opensBelow = below >= height || below >= above
      const maxHeight = opensBelow ? below : above
      const top = opensBelow ? anchor.bottom + 4 : anchor.top - Math.min(height, maxHeight) - 4
      setColumnMenuPosition({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)), top: Math.max(8, top), width, maxHeight })
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !columnPicker.current?.contains(event.target) && !columnMenu.current?.contains(event.target)) setColumnMenuOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || frameRef.current?.closest('[aria-hidden="true"]')) return
      event.preventDefault(); event.stopImmediatePropagation(); setColumnMenuOpen(false)
      columnPicker.current?.querySelector<HTMLElement>('summary')?.focus()
    }
    position()
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape, true)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [columnMenuOpen])
  useEffect(() => { localStorage.setItem(shortcutKey, JSON.stringify(shortcuts)) }, [shortcutKey, shortcuts])
  useEffect(() => {
    if (mode === 'view') return
    const frame = requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [mode])
  const validateField = useCallback((key: keyof PersonDraft, value = draft[key]): string => {
    if (key === 'titleId' && !value) return fa ? 'عنوان الزامی است.' : 'Title is required.'
    if (key === 'personCode') {
      const code = String(value ?? '').trim()
      if (!code) return fa ? 'کد شخص الزامی است.' : 'Person code is required.'
      if (code.length > 30) return fa ? 'کد شخص حداکثر ۳۰ کاراکتر است.' : 'Person code must not exceed 30 characters.'
    }
    if (key === 'lastName' && !String(value ?? '').trim()) return fa ? 'نام خانوادگی، نام شرکت یا نام اداره الزامی است.' : 'Family, company or department name is required.'
    if (key === 'firstName' || key === 'lastName') {
      const department = titles.find(x => x.id === draft.titleId)?.code === 'OFFICE'
      const duplicate = persons.some(person => (mode !== 'edit' || person.id !== selectedId)
        && person.personType === draft.personType
        && normalizeName(person.lastName ?? person.companyName) === normalizeName(draft.lastName)
        && (draft.personType === 'Individual'
          ? normalizeName(person.firstName) === normalizeName(draft.firstName)
          : (person.title?.code === 'OFFICE') === department))
      if (duplicate) return fa ? 'این نام قبلاً ثبت شده است.' : 'This name is already registered.'
    }
    if (key === 'creditLimitIRR' && Number(value) < 0) return fa ? 'مبلغ اعتبار نمی‌تواند منفی باشد.' : 'Credit limit cannot be negative.'
    return ''
  }, [draft, fa, titles, persons, mode, selectedId])

  const validateAndShow = useCallback((key: keyof PersonDraft) => {
    const validationError = validateField(key)
    setFieldErrors(current => ({ ...current, [key]: validationError }))
    return !validationError
  }, [validateField])

  const validateAll = useCallback(() => {
    const keys: (keyof PersonDraft)[] = ['personCode', 'titleId', 'lastName', 'creditLimitIRR']
    const nextErrors: Partial<Record<keyof PersonDraft, string>> = {}
    keys.forEach(key => { const validationError = validateField(key); if (validationError) nextErrors[key] = validationError })
    setFieldErrors(nextErrors)
    const firstInvalid = keys.find(key => nextErrors[key])
    if (firstInvalid) formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`)?.focus()
    return !firstInvalid
  }, [validateField])

  const beginNew = useCallback(async () => {
    const value = emptyDraft()
    value.titleId = parameters.find(x => x.parameterType === 'Title' && x.code === 'MR')?.id ?? ''
    value.nationalityId = parameters.find(x => x.parameterType === 'Nationality' && x.code === 'IR')?.id ?? ''
    if (contractCreation) value.jobId = parameters.find(x => x.parameterType === 'Job' && x.code === 'PARTNER')?.id ?? ''
    try { value.personCode = await suggestSerial('person', demoMode, persons.at(-1)?.personCode, 'PER-0001') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setDraft(value); original.current = JSON.stringify(value); setMode('new'); setMessage(''); setFieldErrors({})
  }, [demoMode, persons, parameters, contractCreation])
  useEffect(() => {
    if (contractCreation && !loading && !contractStarted.current && parameters.length) {
      contractStarted.current = true
      const person = persons.find(x => x.id === contractCreation.personId)
      if (contractCreation.personId && person) {
        const value = copyDraft(person)
        if (!value.titleId) value.titleId = parameters.find(x => x.parameterType === 'Title' && x.code === (value.personType === 'Company' ? 'COMPANY' : 'MR'))?.id ?? ''
        setSelectedId(person.id); setDraft(value); original.current = JSON.stringify(value); setMode('edit')
      } else if (contractCreation.personId) setError(fa ? 'شخص موردنظر در فهرست موجود نیست.' : 'The person is unavailable.')
      else void beginNew()
    }
  }, [contractCreation, loading, parameters, beginNew, persons, fa])
  const beginEdit = useCallback(() => {
    if (!selected || selected.isContractPartner && !contractCreation) return
    const value = copyDraft(selected)
    if (!value.titleId) value.titleId = parameters.find(x => x.parameterType === 'Title' && x.code === (value.personType === 'Company' ? 'COMPANY' : 'MR'))?.id ?? ''
    setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({})
  }, [selected, contractCreation, parameters])
  const cancel = useCallback(() => {
    if (dirty && !window.confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information has changed. Exit the current mode?')) return
    if (contractCreation) { contractCreation.onCancel(); return }
    setMode('view'); setError(''); setFieldErrors({}); if (selected) { const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value) }
  }, [dirty, fa, selected, contractCreation])
  const save = useCallback(async () => {
    if (mode === 'view') return
    setError(''); setMessage('')
    if (!validateAll()) return
    try {
      const saved = mode === 'new'
        ? await apiRequest<Person>(contractCreation ? '/api/master-data/contract-persons' : '/api/master-data/persons', { method: 'POST', body: JSON.stringify(personPayload(draft)) })
        : await apiRequest<Person>(withRowVersion(`/api/master-data/${contractCreation ? 'contract-persons' : 'persons'}/${selectedId}`, selected?.rowVersion), { method: 'PUT', body: JSON.stringify(personPayload(draft)) })
      if (contractCreation) { contractCreation.onSaved(saved); return }
      setMode('view'); setMessage(fa ? 'اطلاعات با موفقیت ثبت شد.' : 'Saved successfully.'); await load(saved.id)
    } catch (e) { if (isConcurrencyConflict(e)) { setMode('view'); setFieldErrors({}); await load(selectedId) }; setError(e instanceof Error ? e.message : String(e)) }
  }, [selected?.rowVersion, mode, draft, fa, selectedId, load, validateAll, contractCreation])
  const remove = useCallback(async () => {
    if (!selected || mode !== 'view' || selected.isContractPartner && !contractCreation) return
    if (!window.confirm(fa ? `شخص «${selected.displayName}» حذف شود؟` : `Delete “${selected.displayName}”?`)) return
    try {
      await apiRequest<void>(withRowVersion(`/api/master-data/persons/${selected.id}`, selected.rowVersion), { method: 'DELETE' })
      setMessage(fa ? 'شخص حذف شد.' : 'Person deleted.'); await load()
    } catch (e) {
      if (isConcurrencyConflict(e)) { await load(selected.id); setError(e.message) }
      else if (e instanceof ApiError && e.status === 409) setError(fa ? 'این شخص سابقه عملیاتی دارد یا مانده حساب او صفر نیست و قابل حذف نیست.' : e.message)
      else setError(e instanceof Error ? e.message : String(e))
    }
  }, [selected, mode, fa, load, contractCreation])

  const move = useCallback((where: 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end') => {
    if (!filtered.length) return
    const delta = where === 'up' ? -1 : where === 'down' ? 1 : where === 'pageUp' ? -10 : where === 'pageDown' ? 10 : 0
    const index = where === 'home' ? 0 : where === 'end' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, selectedIndex + delta))
    setSelectedId(filtered[index].id)
    document.querySelector(`[data-person-id="${filtered[index].id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [filtered, selectedIndex])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (frameRef.current?.closest('[aria-hidden="true"]')) return
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (mode !== 'view') {
        if (titleEntry) return
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
  }, [mode, save, cancel, beginNew, beginEdit, remove, move, shortcuts, filterMenu, titleEntry])

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
    if (event.key !== 'Enter') return
    if (target.dataset.field === 'nationalityId') {
      event.preventDefault(); event.stopPropagation()
      if (validateAndShow('nationalityId')) formRef.current?.querySelector<HTMLElement>('[data-field="phone"]')?.focus()
      return
    }
    if (target.dataset.field === 'phone' || target.dataset.field === 'mobile' || target.dataset.field === 'address') {
      const value = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value.trim() : ''
      if (!value) {
        event.preventDefault(); event.stopPropagation()
        const wrapper = target.closest('.person-number-wrap')
        wrapper?.querySelector<HTMLButtonElement>('.number-add-button')?.click()
        return
      }
      // Number controls are read-only displays, so include them in this sequence
      // even though the shared form navigator skips read-only fields.
      event.preventDefault(); event.stopPropagation()
      const order = ['phone', 'mobile', 'address', 'notes']
      const nextField = order[order.indexOf(target.dataset.field) + 1]
      if (nextField) formRef.current?.querySelector<HTMLElement>(`[data-field="${nextField}"]`)?.focus()
      return
    }
    const field = target.dataset.field as keyof PersonDraft | undefined
    if (field && !validateAndShow(field)) event.preventDefault()
  }

  function formBlur(event: React.FocusEvent) {
    const field = (event.target as HTMLElement).dataset.field as keyof PersonDraft | undefined
    if (mode !== 'view' && field) validateAndShow(field)
  }

  function sortBy(key: ColumnKey) {
    setSort(current => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }

  function columnDragOver(event: React.DragEvent<HTMLTableCellElement>, key: ColumnKey) {
    if (!draggedColumn.current) return
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const before = getComputedStyle(event.currentTarget).direction === 'rtl' ? event.clientX > rect.left + rect.width / 2 : event.clientX < rect.left + rect.width / 2
    setColumnDrop(current => current?.key === key && current.before === before ? current : { key, before })
  }

  function dropColumn(event: React.DragEvent<HTMLTableCellElement>, key: ColumnKey) {
    const source = draggedColumn.current
    if (!source) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const before = getComputedStyle(event.currentTarget).direction === 'rtl' ? event.clientX > rect.left + rect.width / 2 : event.clientX < rect.left + rect.width / 2
    if (source !== key) setColumns(current => {
      const moving = current.find(column => column.key === source)!
      const next = current.filter(column => column.key !== source)
      const index = next.findIndex(column => column.key === key)
      next.splice(index + (before ? 0 : 1), 0, moving)
      return next
    })
    draggedColumn.current = null; setColumnDrop(null)
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
  const organization = draft.personType === 'Company'
  const selectedTitle = titles.find(x => x.id === draft.titleId)
  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: '' }))
  }
  const parameterLabel = (x?: Parameter) => x ? (fa ? x.nameFa : x.nameEn) : '—'
  const columnLabel = (key: ColumnKey) => ({
    personCode: fa ? 'کد' : 'Code', displayName: fa ? 'نام / عنوان' : 'Name', job: fa ? 'شغل' : 'Job',
    nationality: fa ? 'ملیت' : 'Nationality', mobile: fa ? 'موبایل' : 'Mobile',
    phone: fa ? 'تلفن' : 'Phone', isActive: fa ? 'وضعیت' : 'Status'
  })[key]
  const cell = (person: Person, key: ColumnKey) => {
    if (key === 'personCode') return <span className="mono">{person.personCode}</span>
    if (key === 'displayName') return person.displayName
    if (key === 'job') return parameterLabel(person.job)
    if (key === 'nationality') return parameterLabel(person.nationality)
    if (key === 'mobile') return <span className="mono">{person.mobile || '—'}</span>
    if (key === 'phone') return <span className="mono person-grid-phone" dir="ltr">{person.phone ? formatInternationalNumber(person.phone) : '—'}</span>
    return <span className={`person-status ${person.isActive ? 'active' : 'inactive'}`}>{person.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')}</span>
  }
  const changeTitle = (titleId: string) => setDraft(current => {
    const personType = titlePersonType(titles.find(x => x.id === titleId)) ?? current.personType
    return { ...current, titleId, personType }
  })
  async function addTitle() {
    if (titleSaving) return
    const name = titleName.trim()
    if (!name || !titleKind) { setTitleError(fa ? 'عنوان و نوع حقیقی یا حقوقی را وارد کنید.' : 'Enter a title and select its kind.'); (!name ? titleInput.current : formRef.current?.querySelector<HTMLElement>('[data-title-kind]'))?.focus(); return }
    const normalized = normalizeName(name === 'آقا' ? 'آقای' : name)
    if (titles.some(x => normalizeName(x.code === 'MR' ? 'آقای' : x.nameFa) === normalized)) { setTitleError(fa ? 'این عنوان قبلاً ثبت شده است.' : 'This title already exists.'); titleInput.current?.focus(); return }
    setTitleSaving(true); setTitleError('')
    try {
      const title = demoMode
        ? { id: crypto.randomUUID(), parameterType: 'Title' as const, code: `CUSTOM_${titleKind}`, nameFa: name, nameEn: name, personType: titleKind }
        : await apiRequest<Parameter>('/api/master-data/parameters/titles', { method: 'POST', body: JSON.stringify({ name, personType: titleKind }) })
      setParameters(current => [...current, title]); setDraft(current => ({ ...current, titleId: title.id, personType: titleKind })); setTitleEntry(false)
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[data-field="titleId"]')?.focus())
    } catch (e) { setTitleError(e instanceof Error ? e.message : String(e)) }
    finally { setTitleSaving(false) }
  }

  return <div className={`persons-page${!contractCreation ? ' person-layout-five' : ''}`} ref={frameRef} style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px, 1fr)` }}>
    <section className="person-editor panel">
      <div className="person-section-head"><div><h2>{fa ? 'اطلاعات کامل شخص' : 'Person details'}</h2><p>{mode === 'new' ? (fa ? 'تعریف شخص جدید' : 'New person') : mode === 'edit' ? (fa ? 'اصلاح اطلاعات' : 'Edit person') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div><span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span></div>
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid ${mode !== 'view' ? 'editing' : ''}`} ref={formRef} onKeyDown={formKeyDown} onBlur={formBlur}>
        <Field className="person-code-field" label={fa ? 'کد شخص *' : 'Person code *'} error={fieldErrors.personCode}><input data-field="personCode" aria-invalid={Boolean(fieldErrors.personCode)} autoFocus={mode === 'new'} disabled={disabled || selected?.isContractPartner} maxLength={30} value={draft.personCode} onChange={e => set('personCode', e.target.value)} /></Field>
        <Field className="person-title-field" label={fa ? 'عنوان *' : 'Title *'} error={fieldErrors.titleId}><div className="person-title-wrap"><button type="button" className="title-add-button" disabled={disabled || !hasPermission('persons.create')} aria-label={fa ? 'افزودن عنوان' : 'Add title'} aria-expanded={titleEntry} onClick={event => { const rect = event.currentTarget.parentElement!.getBoundingClientRect(); const width = Math.min(280, window.innerWidth - 24); setTitlePosition({ top: rect.bottom + 4, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width }); setTitleName(''); setTitleKind(''); setTitleError(''); setTitleEntry(current => !current) }}>+</button><select data-field="titleId" required aria-invalid={Boolean(fieldErrors.titleId)} disabled={disabled} value={draft.titleId} onChange={e => changeTitle(e.target.value)}>{titles.map(x => <option key={x.id} value={x.id}>{x.code === 'MR' && fa ? 'آقای' : parameterLabel(x)}</option>)}</select>
          {titleEntry && <div className="person-title-entry" data-form-scope style={titlePosition} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); setTitleEntry(false); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[data-field="titleId"]')?.focus()) } }}><input ref={titleInput} data-title-name aria-label={fa ? 'عنوان جدید' : 'New title'} maxLength={100} disabled={titleSaving} value={titleName} onChange={e => setTitleName(e.target.value)} placeholder={fa ? 'عنوان جدید' : 'New title'} /><select data-title-kind required aria-label={fa ? 'نوع عنوان' : 'Title kind'} disabled={titleSaving} value={titleKind} onChange={e => setTitleKind(e.target.value as typeof titleKind)}><option value="" disabled>{fa ? 'انتخاب نوع عنوان' : 'Select title kind'}</option><option value="Individual">{fa ? 'حقیقی' : 'Individual'}</option><option value="Company">{fa ? 'حقوقی' : 'Organization'}</option></select>{titleError && <small role="alert">{titleError}</small>}<div><button type="button" data-save-action disabled={titleSaving} onClick={() => void addTitle()}>{fa ? 'افزودن عنوان' : 'Add title'}</button><button type="button" disabled={titleSaving} onClick={() => setTitleEntry(false)}>{fa ? 'انصراف' : 'Cancel'}</button></div></div>}
        </div></Field>
        {!organization && <Field className="person-first-name-field" compact label={fa ? 'نام' : 'First name'}><input data-field="firstName" disabled={disabled} value={draft.firstName} onChange={e => set('firstName', e.target.value)} /></Field>}
        <Field className={organization ? 'person-organization-field' : 'person-family-name-field'} label={organization ? (fa ? `نام ${selectedTitle?.nameFa ?? 'شرکت'} *` : `${selectedTitle?.nameEn ?? 'Organization'} name *`) : (fa ? 'نام خانوادگی *' : 'Family name *')} wide={organization} compact={!organization} error={fieldErrors.lastName}><input data-field="lastName" required aria-invalid={Boolean(fieldErrors.lastName)} disabled={disabled} value={draft.lastName} onChange={e => set('lastName', e.target.value)} /></Field>
        {organization && <Field className="person-director-field" label={fa ? `نام مدیر ${selectedTitle?.nameFa ?? 'شرکت'}` : `${selectedTitle?.nameEn ?? 'Organization'} director`}><input data-field="directorName" disabled={disabled} maxLength={200} value={draft.directorName} onChange={e => set('directorName', e.target.value)} /></Field>}
        {!contractCreation && <Field className="person-job-field" compact label={fa ? 'نقش یا شغل' : 'Job'}><select data-field="jobId" disabled={disabled} value={draft.jobId} onChange={e => set('jobId', e.target.value)}><option value="">—</option>{parameters.find(x => x.id === draft.jobId)?.code === 'PARTNER' && <option value={draft.jobId} disabled>{parameterLabel(parameters.find(x => x.id === draft.jobId))}</option>}{jobs.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>}
        <Field className="person-nationality-field" compact label={fa ? 'ملیت' : 'Nationality'}><select data-field="nationalityId" disabled={disabled} value={draft.nationalityId} onChange={e => set('nationalityId', e.target.value)}><option value="">—</option>{nationalities.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>
        <Field className="person-phone-field" label={fa ? 'تلفن' : 'Phone'}><NumberControl field="phone" label={fa ? 'تلفن' : 'Phone'} primary={draft.phone ?? ''} numbers={draft.phoneNumbers ?? []} disabled={disabled} fa={fa} suggestedCode={dialingCode} onChange={(phone, phoneNumbers) => setDraft(current => ({ ...current, phone, phoneNumbers }))} /></Field>
        <Field className="person-mobile-field" label={fa ? 'موبایل' : 'Mobile'}><NumberControl field="mobile" label={fa ? 'موبایل' : 'Mobile'} primary={draft.mobile ?? ''} numbers={draft.mobileNumbers ?? []} disabled={disabled} fa={fa} suggestedCode={dialingCode} onChange={(mobile, mobileNumbers) => setDraft(current => ({ ...current, mobile, mobileNumbers }))} /></Field>
        <Field label={fa ? 'آدرس' : 'Address'} wide className="person-address-field"><NumberControl field="address" label={fa ? 'آدرس' : 'Address'} primary={draft.address ?? ''} numbers={draft.addresses ?? []} disabled={disabled} fa={fa} onChange={(address, addresses) => setDraft(current => ({ ...current, address, addresses }))} multiline /></Field>
        <div className="person-notes-active"><Field label={fa ? 'توضیحات' : 'Notes'} className="person-notes-field"><input data-field="notes" disabled={disabled} value={draft.notes} onChange={e => set('notes', e.target.value)} /></Field><label className="active-check"><input data-field="isActive" type="checkbox" disabled={disabled} checked={draft.isActive} onChange={e => set('isActive', e.target.checked)} />{fa ? 'فعال' : 'Active'}</label></div>
      </div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      <div className="grid-toolbar"><div><h2>{fa ? 'فهرست اشخاص' : 'People'}</h2><span>{fa ? `${filtered.length} از ${persons.length} رکورد` : `${filtered.length} of ${persons.length} records`}</span></div><details className="column-picker" ref={columnPicker} open={columnMenuOpen}><summary aria-expanded={columnMenuOpen} onClick={event => { event.preventDefault(); setColumnMenuOpen(current => !current) }}>☷ {fa ? 'ستون‌ها' : 'Columns'}</summary></details></div>
      {columnMenuOpen && createPortal(<div ref={columnMenu} className="person-column-menu" dir={fa ? 'rtl' : 'ltr'} style={columnMenuPosition}>{columns.map(column => <label key={column.key}><input type="checkbox" checked={column.visible} disabled={column.visible && visibleColumns.length === 1} onChange={() => toggleColumn(column.key)} />{columnLabel(column.key)}</label>)}<button type="button" onClick={() => setColumns(defaultColumns)}>↺ {fa ? 'حالت پیش‌فرض' : 'Reset'}</button></div>, document.body)}
      <div className="person-table-wrap"><table className="person-table excel-grid" style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{visibleColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead>
        <tr>{visibleColumns.map(column => <th key={column.key} data-column={column.key} className={columnDrop?.key === column.key ? `column-drop-${columnDrop.before ? 'before' : 'after'}` : undefined} onDragOver={event => columnDragOver(event, column.key)} onDrop={event => dropColumn(event, column.key)}><div className="column-heading"><button type="button" className="column-title" draggable onDragStart={event => { draggedColumn.current = column.key; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.key); setFilterMenu(null); setColumnMenuOpen(false) }} onDragEnd={() => { draggedColumn.current = null; setColumnDrop(null) }} onClick={() => sortBy(column.key)}>{columnLabel(column.key)}<span>{sort.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}</span></button><button type="button" className={`excel-filter-trigger ${filters[column.key] !== null ? 'active' : ''}`} aria-label={`${fa ? 'فیلتر ستون' : 'Filter column'} ${columnLabel(column.key)}`} onClick={event => filterMenu === column.key ? setFilterMenu(null) : openFilterMenu(column.key, event.currentTarget)}>▼</button></div>{filterMenu === column.key && <div className="excel-filter-menu" style={filterPosition}>
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
          <Shortcut code={shortcuts.edit} label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!hasPermission('persons.edit') || selected?.isContractPartner && !contractCreation} />
          <Shortcut code={shortcuts.delete} label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!hasPermission('persons.delete') || selected?.isContractPartner && !contractCreation} />
          <Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move('home')} />
          <Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Page up'} onClick={() => move('pageUp')} />
          <Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move('down')} />
          <Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Page down'} onClick={() => move('pageDown')} />
          <Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move('end')} />
        </> : <>
          <Shortcut code="F3" label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary />
          <Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} />
        </>}
        <details className="shortcut-settings"><summary title={fa ? 'شخصی‌سازی کلیدها' : 'Customize shortcuts'}>⚙</summary><div>{(Object.keys(shortcuts) as ShortcutAction[]).map(action => <label key={action}><span>{({ new: fa ? 'جدید' : 'New', edit: fa ? 'ویرایش' : 'Edit', delete: fa ? 'حذف' : 'Delete', save: fa ? 'ثبت' : 'Save' })[action]}</span><select value={shortcuts[action]} onChange={e => setShortcuts(current => ({ ...current, [action]: e.target.value }))}>{shortcutOptions.map(option => <option key={option}>{option}</option>)}</select></label>)}</div></details>
      </div>
    </section>
  </div>
}

function Field({ label, wide, compact, error, className = '', children }: { label: string, wide?: boolean, compact?: boolean, error?: string, className?: string, children: React.ReactNode }) {
  return <label className={`${wide ? 'wide-field' : ''} ${compact ? 'person-compact-field' : ''} ${error ? 'invalid-field' : ''} ${className}`}><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}
function NumberControl({ field, label, primary, numbers, disabled, fa, onChange, suggestedCode = '', multiline = false }: { field: 'phone' | 'mobile' | 'address', label: string, primary: string, numbers: string[], disabled: boolean, fa: boolean, suggestedCode?: string, multiline?: boolean, onChange: (primary: string, numbers: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [entryRows, setEntryRows] = useState<{ id: number, code: string, text: string }[]>([])
  const nextEntryId = useRef(0)
  const entryInputs = useRef(new Map<number, HTMLInputElement | HTMLTextAreaElement>())
  const entryCodes = useRef(new Map<number, HTMLInputElement>())
  const [editingNumber, setEditingNumber] = useState<string | null>(null)
  const [listPosition, setListPosition] = useState<React.CSSProperties>({})
  const [pendingNumbers, setPendingNumbers] = useState(numbers)
  const [pendingPrimary, setPendingPrimary] = useState(primary)
  const input = useRef<HTMLInputElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  function openEmptyControl() {
    if (!disabled && !primary.trim() && !open) addButton.current?.click()
  }
  function focusNextControl() {
    requestAnimationFrame(() => {
      const order = ['phone', 'mobile', 'address', 'notes']
      const next = order[order.indexOf(field) + 1]
      wrapper.current?.closest('.person-form-grid')?.querySelector<HTMLElement>(`[data-field="${next}"]`)?.focus()
    })
  }
  function showList(event: React.MouseEvent<HTMLButtonElement>, startAdding = false) {
    const wrapper = event.currentTarget.closest('.person-number-wrap')
    const field = wrapper?.querySelector('.person-number-control') ?? event.currentTarget.closest('.person-number-control')
    const rect = (field ?? event.currentTarget).getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const width = multiline ? rect.width : Math.min(360, viewportWidth - 24)
    const left = Math.max(12, Math.min(multiline ? rect.right - width : rect.left, viewportWidth - width - 12))
    setListPosition({ top: rect.bottom + 4, left, right: 'auto', width, maxHeight: Math.max(40, Math.min(180, window.innerHeight - rect.bottom - 20)) })
    if (!open) { setPendingNumbers(numbers); setPendingPrimary(primary) }
    if (!open) setEntryRows([])
    if (startAdding && (!open || !entryRows.length)) setEntryRows([{ id: ++nextEntryId.current, code: suggestedCode, text: '' }])
    setAdding(startAdding); setEditingNumber(null); setText(''); setOpen(true)
  }
  useEffect(() => { if (open && adding && !disabled) entryInputs.current.get(entryRows.at(-1)?.id ?? -1)?.focus() }, [open, adding, disabled, entryRows.length])
  function add(code: string) {
    if (disabled) return
    setEntryRows(current => [...current, { id: ++nextEntryId.current, code, text: '' }])
    setAdding(true)
  }
  function changeEntry(id: number, key: 'code' | 'text', value: string) { setEntryRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row)) }
  function remove(value: string) { const next = pendingNumbers.filter(item => item !== value); setPendingNumbers(next); if (value === pendingPrimary) setPendingPrimary(next[0] ?? '') }
  function edit(value: string, edited: string) {
    if (!edited.trim() || pendingNumbers.some(item => item !== value && item === edited)) return
    setPendingNumbers(current => current.map(item => item === value ? edited : item))
    if (pendingPrimary === value) setPendingPrimary(edited)
  }
  function applyEdit() {
    if (editingNumber === null || !text.trim()) return
    const edited = text.trim()
    if (pendingNumbers.some(item => item !== editingNumber && item === edited)) return
    setPendingNumbers(current => current.map(item => item === editingNumber ? edited : item))
    if (pendingPrimary === editingNumber) setPendingPrimary(edited)
    setEditingNumber(null); setText('')
  }
  function confirm() {
    if (disabled) return
    let finalNumbers = pendingNumbers
    let finalPrimary = pendingPrimary
    const reject = (control: HTMLInputElement | HTMLTextAreaElement | null) => {
      control?.setCustomValidity(fa ? 'این مورد نامعتبر یا تکراری است.' : 'This entry is invalid or duplicated.')
      control?.reportValidity(); control?.focus()
    }
    if (editingNumber !== null) {
      const edited = text.trim()
      if (!edited || !/^\+?\d[\d\s-]*$/.test(edited) || finalNumbers.some(item => item !== editingNumber && item === edited)) { reject(input.current); return }
      finalNumbers = finalNumbers.map(item => item === editingNumber ? edited : item)
      if (finalPrimary === editingNumber) finalPrimary = edited
    }
    for (const row of entryRows) {
      if (!row.text.trim()) continue
      const prefix = row.code.trim().replace(/\s/g, '')
      const digits = row.text.replace(/\D/g, '').replace(/^0+/, '')
      if (!multiline && !/^\+\d{1,3}$/.test(prefix)) { reject(entryCodes.current.get(row.id) ?? null); return }
      if (!multiline && !digits) { reject(entryInputs.current.get(row.id) ?? null); return }
      const value = multiline ? row.text.trim() : `${prefix}${digits}`
      if (finalNumbers.includes(value)) { reject(entryInputs.current.get(row.id) ?? null); return }
      finalNumbers = [...finalNumbers, value]
      finalPrimary = finalPrimary || value
    }
    onChange(finalPrimary, finalNumbers)
    setEditingNumber(null); setOpen(false); setAdding(false); setText(''); setEntryRows([])
    focusNextControl()
  }
  useEffect(() => {
    if (!open || disabled) return
    const confirmKey = (event: KeyboardEvent) => {
      if (event.key !== 'F3' || event.altKey || event.ctrlKey || event.metaKey || wrapper.current?.closest('[aria-hidden="true"]')) return
      const owner = event.target instanceof Element ? event.target.closest('.person-number-wrap') : null
      if (owner && owner !== wrapper.current && owner.querySelector('.person-number-list')) return
      // Run before the shared document capture handler that owns the main F3 save.
      event.preventDefault(); event.stopImmediatePropagation()
      if (!event.repeat) confirm()
    }
    window.addEventListener('keydown', confirmKey, true)
    return () => window.removeEventListener('keydown', confirmKey, true)
  })
  return <div className="person-number-wrap" ref={wrapper} onInput={event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity('') }}>
    <button ref={addButton} type="button" className="number-add-button" disabled={disabled} aria-label={`${fa ? 'افزودن شماره' : 'Add number'} ${label}`} aria-expanded={open && adding} onClick={event => disabled ? undefined : showList(event, true)}>+</button>
    <div className={`person-number-control ${multiline ? 'address-control' : ''}`}>
      {multiline ? <textarea data-field={field} aria-label={label} disabled={disabled} value={primary} readOnly rows={1} onFocus={openEmptyControl} /> : <input data-field={field} className="ltr-input number-display" aria-label={label} disabled={disabled} value={formatInternationalNumber(primary)} readOnly dir="ltr" onFocus={openEmptyControl} />}
      <button type="button" className="number-chevron" aria-label={fa ? (multiline ? 'نمایش نشانی‌ها' : 'نمایش شماره‌ها') : 'Show list'} aria-expanded={open} onClick={event => open ? setOpen(false) : showList(event)} />
    </div>
    {open && <div className={`person-number-list ${multiline ? 'address-list' : 'phone-list'} ${adding ? 'adding' : ''}`} style={listPosition} dir={multiline ? 'rtl' : 'ltr'}>
      {pendingNumbers.map(number => <div className="person-number-row" key={number}><button type="button" className={`person-primary ${pendingPrimary === number ? 'selected' : ''}`} onClick={() => setPendingPrimary(number)} aria-label={fa ? 'انتخاب مورد اصلی' : 'Set primary'}>{pendingPrimary === number ? '✓' : ''}</button>{multiline ? <textarea disabled={disabled} rows={2} value={number} onChange={e => edit(number, e.target.value)} /> : editingNumber === number ? <input ref={input} className="number-edit-input" dir="ltr" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyEdit() } }} /> : <span className="number-row-value" dir="ltr">{formatInternationalNumber(number)}</span>}{!disabled && <>{!multiline && <button type="button" className="number-row-edit" onClick={() => { setEditingNumber(number); setAdding(false); setText(number) }} aria-label={fa ? 'ویرایش' : 'Edit'}>✎</button>}<button type="button" onClick={() => remove(number)} aria-label={fa ? 'حذف' : 'Remove'}>×</button></>}</div>)}
      {!disabled && entryRows.map(row => <div key={row.id} className="person-number-row new-number-row" dir={multiline ? 'rtl' : 'ltr'}>{!multiline && <input ref={el => { if (el) entryCodes.current.set(row.id, el); else entryCodes.current.delete(row.id) }} className="dial-code-input" dir="ltr" aria-label={fa ? 'کد کشور' : 'Country code'} value={row.code} onChange={e => changeEntry(row.id, 'code', e.target.value)} placeholder={suggestedCode || '+98'} />}{multiline ? <textarea ref={el => { if (el) entryInputs.current.set(row.id, el); else entryInputs.current.delete(row.id) }} value={row.text} onChange={e => changeEntry(row.id, 'text', e.target.value)} aria-label={label} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(row.code) } }} /> : <input ref={el => { if (el) entryInputs.current.set(row.id, el); else entryInputs.current.delete(row.id) }} className="number-edit-input" dir="ltr" type="tel" value={row.text} onChange={e => changeEntry(row.id, 'text', e.target.value.replace(/\D/g, ''))} aria-label={label} placeholder={fa ? 'شماره جدید' : 'New number'} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(row.code) } }} />}<button type="button" className="number-row-add" aria-label={fa ? 'افزودن مورد' : 'Add entry'} onClick={() => add(row.code)}>+</button></div>)}
      {!disabled && <button type="button" className="number-confirm" onClick={confirm}>{fa ? 'تأیید (F3)' : 'Apply (F3)'}</button>}
    </div>}
  </div>
}
function Shortcut({ code, label, onClick, primary, danger, disabled }: { code: string, label: string, onClick: () => void, primary?: boolean, danger?: boolean, disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`${primary ? 'primary' : ''} ${danger ? 'danger-shortcut' : ''}`} onClick={onClick}><kbd>{code}</kbd><span>{label}</span></button>
}
