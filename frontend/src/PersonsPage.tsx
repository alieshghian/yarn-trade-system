import {useDefinitionRowSelection,deleteSelectedDefinitionRows} from './components/base-form/useDefinitionRowSelection'
import {BaseFormGridBoundary, type GridNavigationRequest} from './components/base-form/BaseFormGridBoundary'
import type {GridToolbarSettings} from './components/base-form/gridToolbarLayout'
import {OperationalFormFrame, type OperationalSettingsControls} from './components/base-form/OperationalFormFrame'
import { personsDefaultGridColumns, personsEditorTrackSizing, personsFieldPlacement, personsOperationalLayout } from './personsOperationalLayout'
import {useFieldValidation} from './components/base-form/useFieldValidation'
import { NumberControl, formatInternationalNumber } from './components/base-form/NumberControl'
import { PersonTitleControl, type PersonTitleOption } from './components/base-form/PersonTitleControl'
import { functionKeyFromEvent } from './components/base-form/functionKeys'
import { Field, Shortcut } from './DefinitionControls'
import { defaultFormTheme } from './components/base-form/formTheme'
import { ExcelGridColumnHeader, ExcelGridFilterScope } from './components/base-form/ExcelGridColumnHeader'
import { applyGridFiltersAndSort, gridDistinctValues, type ExcelGridColumn, type GridFilterState, type GridPage, type GridQuery, type GridSortState, type GridValue } from './components/base-form/excelGrid'
import {SystemLookup} from './components/base-form/SystemLookup'
import {ownsFormShortcut} from './formInteraction'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, api, apiRequest, currentUserKey, hasPermission, isConcurrencyConflict, withRowVersion } from './api'
import type { Language } from './i18n'
import { suggestSerial } from './sequences'
import './personsToolbar.css'

const personsAppearance = { colors: true, typography: true, formSize: false, tablePresentation: false }
const personsGridOptions = { clearColumnFilters: true, preserveSelectionOnRefresh: true, protectExportSnapshot: true, bulkSelectionOnly: true, intrinsicToolbarHeight: true }
// Use the approved Yarn title/counter typography with the shared intrinsic layout.
const personsGridToolbar: GridToolbarSettings = {title: {fontSize: 11, bold: true}, counter: {fontSize: 12, bold: false}}


type ParameterType = 'Job' | 'Title' | 'Nationality'
type Parameter = { id: string, parameterType: ParameterType, code: string, nameFa: string, nameEn: string, personType?: 'Individual' | 'Company' }
const titleOrder = ['MR', 'MRS', 'COMPANY', 'INSTITUTE', 'OFFICE', 'ORGANIZATION']
const titlePersonType = (title?: Parameter) => title?.personType ?? (title?.code === 'MR' || title?.code === 'MRS' ? 'Individual' : title && titleOrder.includes(title.code) ? 'Company' : undefined)
export type Person = {
  brandIds?: string[], defaultBrandId?: string | null,
  rowVersion?: string,
  id: string, personCode: string, accountingCode?: string, personType: 'Individual' | 'Company', firstName?: string,
  lastName?: string, companyName?: string, directorName?: string, displayName: string, jobId?: string, job?: Parameter, titleId?: string,
  title?: Parameter, nationalityId?: string, nationality?: Parameter, preferredLanguage: 'fa' | 'en' | 'zh', creditLimitIRR: number,
  phone?: string, phoneNumbers?: string[], mobile?: string, mobileNumbers?: string[], address?: string, addresses?: string[], notes?: string, isActive: boolean, isContractPartner?: boolean
}
type Mode = 'view' | 'new' | 'edit'
type PersonDraft = Omit<Person, 'rowVersion' | 'id' | 'displayName' | 'job' | 'title' | 'nationality'>
type ColumnKey = 'personCode' | 'displayName' | 'job' | 'nationality' | 'mobile' | 'phone' | 'isActive'
type ColumnState = { key: ColumnKey, width: number, visible: boolean }
type ShortcutAction = 'new' | 'edit' | 'delete' | 'save'
type ShortcutMap = Record<ShortcutAction, string>
const defaultShortcuts: ShortcutMap = { new: 'Space', edit: 'Insert', delete: 'Delete', save: 'F3' }
const shortcutOptions = ['Space', 'Insert', 'Delete', 'F2', 'F3', 'F4', 'F6', 'F7', 'Ctrl+N', 'Ctrl+E']

function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  if (shortcut.startsWith('Ctrl+')) return event.ctrlKey && event.key.toUpperCase() === shortcut.slice(5).toUpperCase()
  return shortcut === 'Space' ? event.code === 'Space' : /^F(?:[1-9]|1[0-2])$/.test(shortcut) ? functionKeyFromEvent(event) === shortcut : event.key === shortcut
}

const defaultColumns: ColumnState[] = personsDefaultGridColumns.map(column => ({ key: column.id as ColumnKey, width: column.widthPx, visible: true }))

function loadColumns(key: string, legacyKey = key): ColumnState[] {
  try {
    type StoredColumn = Omit<ColumnState, 'key'> & { key?: ColumnKey | 'creditLimitIRR'; id?: ColumnKey }
    const saved = JSON.parse(localStorage.getItem(key) ?? localStorage.getItem(legacyKey) ?? 'null') as StoredColumn[] | null
    const current = saved?.flatMap<ColumnState>(column => {
      const id = column.id ?? column.key
      return id ? [{width: column.width, key: id === 'creditLimitIRR' ? 'phone' : id, visible: id === 'creditLimitIRR' || column.visible}] : []
    })
    if (current?.length && defaultColumns.every(column => current.some(x => x.key === column.key))) return current
  } catch { /* تنظیمات معیوب با پیش‌فرض جایگزین می‌شود. */ }
  return defaultColumns
}

const emptyDraft = (): PersonDraft => ({
  brandIds: [], defaultBrandId: null,
  personCode: '', accountingCode: '', personType: 'Individual', firstName: '', lastName: '', companyName: '', directorName: '', jobId: '',
  titleId: '', nationalityId: '', preferredLanguage: 'fa', creditLimitIRR: 0, phone: '', phoneNumbers: [], mobile: '', mobileNumbers: [], address: '', addresses: [], notes: '', isActive: true
})

const copyDraft = (person: Person): PersonDraft => ({
  brandIds: person.brandIds ?? [], defaultBrandId: person.defaultBrandId ?? null,
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
export default function PersonsPage({ language, demoMode = false, contractCreation, lookupCreation, authenticatedUserId, active = true }: { language: Language, demoMode?: boolean, contractCreation?: ContractCreation, lookupCreation?: Omit<ContractCreation, 'personId'>, authenticatedUserId?: string, active?: boolean }) {
  const fa = language === 'fa'
  const standalone = !contractCreation && !lookupCreation
  const [persons, setPersons] = useState<Person[]>([])
  const [brandCreation, setBrandCreation] = useState(false)
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [selectedGridPerson, setSelectedGridPerson] = useState<Person | null>(null)
  const [gridRevision, setGridRevision] = useState(0)
  const [navigationRequest, setNavigationRequest] = useState<GridNavigationRequest>()
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<PersonDraft>(emptyDraft)
  const original = useRef(JSON.stringify(emptyDraft()))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PersonDraft, string>>>({})
  const [loading, setLoading] = useState(true)
  const userKey = currentUserKey()
  const titleDefaultKey='yarn-trade:person-title-default:'+encodeURIComponent(authenticatedUserId??userKey)
  const [titleDefaultId,setTitleDefaultId]=useState(()=>localStorage.getItem(titleDefaultKey)??'')
  const splitKey = `persons-split:${userKey}`
  const columnKey = `persons-columns:${authenticatedUserId ?? userKey}`
  const legacyColumnKey = `persons-columns:${userKey}`
  const shortcutKey = `persons-shortcuts:${userKey}`
  const [topHeight, setTopHeight] = useState(() => Number(localStorage.getItem(splitKey)) || defaultFormTheme.editorHeight)
  const [columns, setColumns] = useState<ColumnState[]>(() => loadColumns(columnKey, legacyColumnKey))
  const columnOwner = useRef(columnKey)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [columnMenuPosition, setColumnMenuPosition] = useState<React.CSSProperties>({})
  const columnPicker = useRef<HTMLDetailsElement>(null)
  const columnMenu = useRef<HTMLDivElement>(null)
  const draggedColumn = useRef<ColumnKey | null>(null)
  const [columnDrop, setColumnDrop] = useState<{ key: ColumnKey, before: boolean } | null>(null)
  const [filters, setFilters] = useState<GridFilterState>({})
  const [sort, setSort] = useState<GridSortState>([])
  const [gridPage, setGridPage] = useState(1)
  const [personTotal, setPersonTotal] = useState(0)
  const [gridLoading, setGridLoading] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => {
    try { return { ...defaultShortcuts, ...JSON.parse(localStorage.getItem(shortcutKey) ?? '{}') } }
    catch { return defaultShortcuts }
  })
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const shortcutsId = useId()
  const shortcutsHost = useRef<HTMLDivElement>(null)
  const shortcutsTrigger = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const contractStarted = useRef(false)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const skipGridRefresh = useRef(true)
  const gridQueryRef = useRef<GridQuery>({ page: 1, pageSize: 100, search: '', filters: {}, sort: [], language: fa ? 'fa' : 'en' })
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  gridQueryRef.current = { page: gridPage, pageSize: 100, search: '', filters, sort, language: fa ? 'fa' : 'en' }

  const selected = selectedGridPerson?.id === selectedId ? selectedGridPerson : persons.find(x => x.id === selectedId)
  const {validateFields}=useFieldValidation(formRef,{enabled:mode!=='view',entity:'persons',demo:demoMode,context:{currentId:mode==='edit'?selectedId:null,personType:draft.personType,titleId:draft.titleId||null,firstName:draft.firstName,lastName:draft.lastName},rules:{personCode:{required:true,maxLength:30,remote:true},lastName:{required:true,maxLength:200,remote:true},firstName:{maxLength:200,remote:true},titleId:{required:true},directorName:{maxLength:200},creditLimitIRR:{min:0}}})
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
  const gridColumns = useMemo<ExcelGridColumn<Person>[]>(() => (standalone ? defaultColumns : columns).map(column => ({
    id: column.key, label: ({ personCode: fa ? 'کد' : 'Code', displayName: fa ? 'نام / عنوان' : 'Name', job: fa ? 'شغل' : 'Job', nationality: fa ? 'ملیت' : 'Nationality', mobile: fa ? 'موبایل' : 'Mobile', phone: fa ? 'تلفن' : 'Phone', isActive: fa ? 'وضعیت' : 'Status' })[column.key],
    width: column.width, type: column.key === 'isActive' ? 'boolean' : 'text',
    value: person => column.key === 'isActive' ? person.isActive : columnValue(person, column.key),
    effectiveCellColor: column.key === 'isActive' ? (person: Person) => person.isActive ? '#e4f2ec' : '#eeeeee' : undefined,
    colorAwareSort: column.key === 'isActive'
  })), [columns, fa, columnValue, standalone])
  const filtered = useMemo(() => demoMode ? applyGridFiltersAndSort(persons, gridColumns, filters, sort, language === 'fa' ? 'fa' : 'en') : persons, [demoMode, persons, gridColumns, filters, sort, language])
  const selectedIndex = Math.max(0, filtered.findIndex(x => x.id === selectedId))
  const gridTotal = demoMode ? filtered.length : personTotal
  const gridPageCount = Math.max(1, Math.ceil(gridTotal / 100))
  const gridStart = demoMode ? (filtered.length ? 1 : 0) : gridTotal ? (gridPage - 1) * 100 + 1 : 0
  const gridEnd = demoMode ? filtered.length : Math.min(gridTotal, gridPage * 100)

  const queryPersons = useCallback((query: GridQuery, signal?: AbortSignal) =>
    apiRequest<GridPage<Person>>('/api/master-data/persons/grid', { method: 'POST', body: JSON.stringify(query), signal }), [])
  const selectGridPerson = useCallback((person: Person | null) => {
    if (modeRef.current !== 'view') return
    setSelectedGridPerson(person)
    setSelectedId(person?.id ?? '')
    if (!person) {
      const empty = emptyDraft()
      setDraft(empty)
      original.current = JSON.stringify(empty)
    }
  }, [])
  const loadGrid = useCallback(async (query = gridQueryRef.current) => {
    if (demoMode) { setPersonTotal(demoPersons.length); return { items: demoPersons, total: demoPersons.length, page: 1, pageSize: 100 } }
    const result = await queryPersons(query)
    setPersons(result.items); setPersonTotal(result.total)
    if (!standalone && result.items.length && !result.items.some(person => person.id === selectedIdRef.current)) {
      const next = result.items[0]
      setSelectedId(next.id)
      if (modeRef.current === 'view') { const value = copyDraft(next); setDraft(value); original.current = JSON.stringify(value) }
    }
    return result
  }, [demoMode, queryPersons, standalone])
  const loadGridFilterValues = useCallback(async (column: string, search: string): Promise<{ values: GridValue[], colors?: (string | null)[] }> => {
    if (demoMode) {
      const definition = gridColumns.find(item => item.id === column)
      return { values: definition ? gridDistinctValues(persons, definition) : [] }
    }
    const result = await apiRequest<GridPage<Person>>('/api/master-data/persons/grid', { method: 'POST', body: JSON.stringify({ ...gridQueryRef.current, optionsColumn: column, optionsSearch: search }) })
    return { values: result.filterValues ?? [], colors: result.colorValues }
  }, [demoMode, gridColumns, persons])

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
        loadGrid({ ...gridQueryRef.current, page: 1 }),
        api<Parameter[]>('/api/master-data/parameters')
      ])
      setGridPage(1); setParameters(refs)
      const latest=preferId||!standalone?undefined:await api<Person>('/api/master-data/persons/latest').catch(()=>undefined)
      if(modeRef.current!=='view')return
      const next = people.items.find(x => x.id === preferId) ?? (preferId ? await api<Person>(`/api/master-data/persons/${preferId}`).catch(() => undefined) : undefined) ?? latest ?? people.items[0]
      setSelectedId(next?.id ?? '')
      if (standalone) {
        setSelectedGridPerson(next ?? null)
        if (preferId || selectedIdRef.current) setGridRevision(value => value + 1)
      }
      if (next) { const value = copyDraft(next); setDraft(value); original.current = JSON.stringify(value) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [demoMode, loadGrid, standalone])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (skipGridRefresh.current) { skipGridRefresh.current = false; return }
    if (demoMode || standalone) return
    const timer = window.setTimeout(() => {
      setGridLoading(true)
      void loadGrid().catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setGridLoading(false))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [filters, sort, gridPage, fa, demoMode, loadGrid, standalone])
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
    if (!standalone) localStorage.setItem(columnKey, JSON.stringify(columns))
  }, [columnKey, legacyColumnKey, columns, standalone])
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
    value.titleId = parameters.find(x=>x.parameterType==='Title'&&x.id===titleDefaultId)?.id??parameters.find(x => x.parameterType === 'Title' && x.code === 'MR')?.id ?? ''
    value.nationalityId = parameters.find(x => x.parameterType === 'Nationality' && x.code === 'IR')?.id ?? ''
    if (contractCreation) value.jobId = parameters.find(x => x.parameterType === 'Job' && x.code === 'PARTNER')?.id ?? ''
    try { value.personCode = await suggestSerial('person', demoMode, persons.at(-1)?.personCode, 'PER-0001') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setDraft(value); original.current = JSON.stringify(value); setMode('new'); setMessage(''); setFieldErrors({})
  }, [demoMode, persons, parameters, contractCreation,titleDefaultId])
  useEffect(() => {
    if ((contractCreation||lookupCreation) && !loading && !contractStarted.current && parameters.length) {
      contractStarted.current = true
      const person = persons.find(x => x.id === contractCreation?.personId)
      if (contractCreation?.personId && person) {
        const value = copyDraft(person)
        if (!value.titleId) value.titleId = parameters.find(x => x.parameterType === 'Title' && x.code === (value.personType === 'Company' ? 'COMPANY' : 'MR'))?.id ?? ''
        setSelectedId(person.id); setDraft(value); original.current = JSON.stringify(value); setMode('edit')
      } else if (contractCreation?.personId) setError(fa ? 'شخص موردنظر در فهرست موجود نیست.' : 'The person is unavailable.')
      else void beginNew()
    }
  }, [contractCreation, lookupCreation, loading, parameters, beginNew, persons, fa])
  const beginEdit = useCallback(() => {
    if (!selected || selected.isContractPartner && !contractCreation) return
    const value = copyDraft(selected)
    if (!value.titleId) value.titleId = parameters.find(x => x.parameterType === 'Title' && x.code === (value.personType === 'Company' ? 'COMPANY' : 'MR'))?.id ?? ''
    setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({})
  }, [selected, contractCreation, parameters])
  const cancel = useCallback(() => {
    if (dirty && !window.confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information has changed. Exit the current mode?')) return
    if (contractCreation||lookupCreation) { (contractCreation??lookupCreation)!.onCancel(); return }
    setMode('view'); setError(''); setFieldErrors({}); if (selected) { const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value) }
  }, [dirty, fa, selected, contractCreation,lookupCreation])
  const save = useCallback(async () => {
    if (mode === 'view') return
    if (!await validateFields()) return
    setError(''); setMessage('')
    if (!validateAll()) return
    try {
      const saved = mode === 'new'
        ? await apiRequest<Person>(contractCreation ? '/api/master-data/contract-persons' : '/api/master-data/persons', { method: 'POST', body: JSON.stringify(personPayload(draft)) })
        : await apiRequest<Person>(withRowVersion(`/api/master-data/${contractCreation ? 'contract-persons' : 'persons'}/${selectedId}`, selected?.rowVersion), { method: 'PUT', body: JSON.stringify(personPayload(draft)) })
      if (contractCreation||lookupCreation) { (contractCreation??lookupCreation)!.onSaved(saved); return }
      setMode('view'); setMessage(fa ? 'اطلاعات با موفقیت ثبت شد.' : 'Saved successfully.'); await load(saved.id)
    } catch (e) { if (isConcurrencyConflict(e)) { setMode('view'); setFieldErrors({}); await load(selectedId) }; setError(e instanceof Error ? e.message : String(e)) }
  }, [selected?.rowVersion, mode, draft, fa, selectedId, load, validateAll, contractCreation,lookupCreation])
  const remove = useCallback(async () => {
    if(deleteSelectedDefinitionRows(frameRef.current))return;
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

  const bulkDeletePending=useRef(false)
  const bulkDelete = useCallback(async (rows: Person[]) => {
    if (bulkDeletePending.current) throw Error('حذف در حال انجام است.')
    bulkDeletePending.current = true
    try {
      await apiRequest('/api/master-data/persons/bulk-delete',{method:'POST',body:JSON.stringify({rows:rows.map(row=>({id:row.id,rowVersion:row.rowVersion}))})})
      await load()
    } finally { bulkDeletePending.current = false }
  }, [load])
  const bulk=useDefinitionRowSelection<Person>({enabled:!standalone&&!demoMode&&!contractCreation&&mode==='view'&&hasPermission('persons.delete'),scope:JSON.stringify({filters,sort,language}),
    onDelete:bulkDelete,
    range:async(start,end,signal)=>{const result:Person[]=[];for(let index=start;index<=end;){const page=Math.floor(index/100)+1;const data=await apiRequest<GridPage<Person>>('/api/master-data/persons/grid',{method:'POST',body:JSON.stringify({...gridQueryRef.current,page}),signal});for(;index<=end&&Math.floor(index/100)+1===page;index++){const row=data.items[index%100];if(!row)throw Error('بازه انتخاب تغییر کرده است؛ دوباره انتخاب کنید.');result.push(row)}}return result}
  })
  const move = useCallback((where: 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end') => {
    if (standalone) {
      const command = {up:'up',down:'down',pageUp:'previous',pageDown:'next',home:'first',end:'last'} as const
      setNavigationRequest(current => ({sequence:(current?.sequence ?? 0)+1,command:command[where],pageStep:10}))
      return
    }
    if (!filtered.length) return
    const delta = where === 'up' ? -1 : where === 'down' ? 1 : where === 'pageUp' ? -10 : where === 'pageDown' ? 10 : 0
    const index = where === 'home' ? 0 : where === 'end' ? filtered.length - 1 : Math.max(0, Math.min(filtered.length - 1, selectedIndex + delta))
    setSelectedId(filtered[index].id)
    document.querySelector(`[data-person-id="${filtered[index].id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [filtered, selectedIndex, standalone])

  useEffect(() => {
    if (!active || brandCreation) setShortcutsOpen(false)
  }, [active, brandCreation])

  useEffect(() => {
    if (!active || !shortcutsOpen) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !shortcutsHost.current?.contains(event.target)) setShortcutsOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !shortcutsTrigger.current || !ownsFormShortcut(frameRef.current, event)) return
      event.preventDefault()
      event.stopPropagation()
      setShortcutsOpen(false)
      shortcutsTrigger.current.focus()
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [active, shortcutsOpen])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (brandCreation || !ownsFormShortcut(frameRef.current, event)) return
      if (event.target === shortcutsTrigger.current && (event.key === 'Enter' || event.code === 'Space')) return
      if (shortcutsOpen && event.target instanceof Node && shortcutsHost.current?.contains(event.target)) return
      if (frameRef.current?.closest('[aria-hidden="true"]')) return
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (mode !== 'view') {
        if (shortcutMatches(event, shortcuts.save)) { event.preventDefault(); void save() }
        if (event.key === 'Escape') { event.preventDefault(); cancel() }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        window.dispatchEvent(new Event('close-active-form'))
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
  }, [mode, save, cancel, beginNew, beginEdit, remove, move, shortcuts, shortcutsOpen, brandCreation])

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
    setFilters(current => { const next = { ...current }; delete next[key]; return next })
    setGridPage(1)
  }

  function applyFilter(key: ColumnKey, filter?: GridFilterState[string]) {
    setFilters(current => { const next = { ...current }; if (filter) next[key] = filter; else delete next[key]; return next })
    setGridPage(1)
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
  const changeTitle = (titleId: string, knownPersonType?: PersonTitleOption['personType']) => setDraft(current => {
    const personType = knownPersonType ?? titlePersonType(titles.find(x => x.id === titleId)) ?? current.personType
    return { ...current, titleId, personType }
  })
  const titleListName=(title:Parameter)=>title.code==='MR'?(fa?'آقای':title.nameEn):parameterLabel(title)
  const titleCanChange=(id:string)=>!persons.some(person=>person.titleId===id)&&titles.some(title=>title.id===id&&title.code.startsWith('TITLE_'))
  async function commitPersonTitleList(primary:string,names:string[],origins:ReadonlyMap<string,string>){
    const items=names.map(name=>{const old=titles.find(title=>titleListName(title)===(origins.get(name)??name));return {id:old?.id??null,name:old&&titleListName(old)===name?old.nameFa:name,expectedName:old?.nameFa??null}})
    const removed=titles.filter(title=>!items.some(item=>item.id===title.id)).map(title=>({id:title.id,name:title.nameFa,expectedName:title.nameFa}))
    const primaryItem=items[names.indexOf(primary)],defaultName=primaryItem?.name??primary
    let response:{options:Parameter[];defaultId:string}
    if(demoMode){
      if(removed.some(item=>!titleCanChange(item.id))||items.some(item=>item.id&&item.name!==item.expectedName&&!titleCanChange(item.id)))throw Error('عنوان استفاده‌شده یا سیستمی قابل تغییر نیست.')
      const options=items.map(item=>item.id?{...titles.find(title=>title.id===item.id)!,nameFa:item.name,nameEn:item.name}:{id:crypto.randomUUID(),parameterType:'Title' as const,code:'TITLE_'+crypto.randomUUID(),nameFa:item.name,nameEn:item.name,personType:draft.personType})
      response={options,defaultId:options.find(item=>item.nameFa===defaultName)?.id??''}
    }else response=await apiRequest('/api/master-data/parameters/titles/changes',{method:'POST',body:JSON.stringify({items,removed,defaultName,personType:draft.personType})})
    setParameters(current=>[...current.filter(item=>item.parameterType!=='Title'),...response.options])
    return {options:response.options.map(title=>({id:title.id,nameFa:title.nameFa,nameEn:title.nameEn,code:title.code,personType:titlePersonType(title)??draft.personType})),defaultId:response.defaultId}
  }
  async function createPersonTitle(name: string): Promise<PersonTitleOption> {
    // The title control only collects text; retain the current form's type internally.
    const personType = draft.personType
    const title: Parameter = demoMode
      ? { id: crypto.randomUUID(), parameterType: 'Title', code: `CUSTOM_${crypto.randomUUID()}`, nameFa: name, nameEn: name, personType }
      : await apiRequest<Parameter>('/api/master-data/parameters/titles', { method: 'POST', body: JSON.stringify({ name, personType }) })
    setParameters(current => [...current, title])
    return { id: title.id, nameFa: title.nameFa, nameEn: title.nameEn, code: title.code, personType: titlePersonType(title) ?? personType }
  }

  const gridTitle = fa ? 'فهرست اشخاص' : 'People'
  const columnsLabel = fa ? 'ستون‌ها' : 'Columns'
  const shortcutLabel = fa ? 'میان‌برهای صفحه‌کلید' : 'Keyboard shortcuts'
  const resetFilters = () => { setFilters({}); setGridPage(1) }
  const place = (id: string) => standalone ? personsFieldPlacement(id, organization) : undefined
  const renderPage = (settings?: OperationalSettingsControls) => <div className={`persons-page${!contractCreation ? ' person-layout-five' : ''}`} ref={frameRef} data-operational-design={standalone ? personsOperationalLayout.id : undefined} data-record-presentation={mode!=='view'?'entry':selectedId?'view':'empty'} style={{ gridTemplateRows: `${topHeight}px 9px minmax(230px, 1fr)` }}>
    <section className="person-editor panel">
      <div className="person-section-head">
        <div><h2>{fa ? 'اطلاعات کامل شخص' : 'Person details'}</h2><p>{mode === 'new' ? (fa ? 'تعریف شخص جدید' : 'New person') : mode === 'edit' ? (fa ? 'اصلاح اطلاعات' : 'Edit person') : (fa ? 'حالت مشاهده' : 'View mode')}</p></div>
        <div className="persons-settings-controls" onClickCapture={event => {
          if (event.target instanceof Node && !shortcutsHost.current?.contains(event.target)) setShortcutsOpen(false)
        }}>
          {settings?.actions}
          {!settings?.editing && <div ref={shortcutsHost} className="shortcut-settings person-header-settings"
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setShortcutsOpen(false) }}>
            <button type="button" ref={shortcutsTrigger} aria-label={shortcutLabel} title={shortcutLabel}
              aria-expanded={active && shortcutsOpen} aria-controls={shortcutsId} className="form-settings-button"
              onClick={() => setShortcutsOpen(open => !open)}>⌨</button>
            <div id={shortcutsId} role="group" aria-label={shortcutLabel} hidden={!active || !shortcutsOpen}>{(Object.keys(shortcuts) as ShortcutAction[]).map(action => <label key={action}><span>{({ new: fa ? 'جدید' : 'New', edit: fa ? 'ویرایش' : 'Edit', delete: fa ? 'حذف' : 'Delete', save: fa ? 'ثبت' : 'Save' })[action]}</span><select value={shortcuts[action]} onChange={e => setShortcuts(current => ({ ...current, [action]: e.target.value }))}>{shortcutOptions.map(option => <option key={option}>{option}</option>)}</select></label>)}</div>
          </div>}
          <span className={`mode-badge ${mode}`}>{mode === 'view' ? (fa ? 'مشاهده' : 'View') : mode === 'new' ? (fa ? 'جدید' : 'New') : (fa ? 'ویرایش' : 'Edit')}</span>
        </div>
      </div>
      {settings?.tools}
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      <div className={`person-form-grid ${mode !== 'view' ? 'editing' : ''}`} ref={formRef} style={standalone ? { '--persons-editor-tracks': personsEditorTrackSizing } as React.CSSProperties : undefined} onKeyDown={formKeyDown} onBlur={formBlur}>
        <Field className="person-code-field" style={place('personCode')} label={fa ? 'کد شخص *' : 'Person code *'} error={fieldErrors.personCode}><input data-field="personCode" aria-invalid={Boolean(fieldErrors.personCode)} autoFocus={mode === 'new'} disabled={disabled || selected?.isContractPartner} maxLength={30} value={draft.personCode} onChange={e => set('personCode', e.target.value)} /></Field>
        <Field className="person-title-field" style={place('titleId')} label={fa ? 'عنوان *' : 'Title *'} error={fieldErrors.titleId}><PersonTitleControl label={fa?'عنوان':'Title'} defaultValue={titleDefaultId||draft.titleId} onSetDefault={id=>{localStorage.setItem(titleDefaultKey,id);setTitleDefaultId(id)}} onCommit={commitPersonTitleList} canEdit={option=>hasPermission('persons.edit')&&titleCanChange(option.id)} canRemove={option=>hasPermission('persons.delete')&&titleCanChange(option.id)} value={draft.titleId ?? ''} options={titles.map(title => ({ id: title.id, nameFa: title.nameFa, nameEn: title.nameEn, code: title.code, personType: titlePersonType(title) ?? 'Company' }))} disabled={disabled} required invalid={Boolean(fieldErrors.titleId)} canCreate={hasPermission('persons.create')} fa={fa} language={language} onChange={changeTitle} onCreate={createPersonTitle} /></Field>
        {!organization && <Field className="person-first-name-field" style={place('firstName')} compact label={fa ? 'نام' : 'First name'}><input data-field="firstName" disabled={disabled} value={draft.firstName} onChange={e => set('firstName', e.target.value)} /></Field>}
        <Field style={place('lastName')} className={organization ? 'person-organization-field' : 'person-family-name-field'} label={organization ? (fa ? `نام ${selectedTitle?.nameFa ?? 'شرکت'} *` : `${selectedTitle?.nameEn ?? 'Organization'} name *`) : (fa ? 'نام خانوادگی *' : 'Family name *')} wide={organization} compact={!organization} error={fieldErrors.lastName}><input data-field="lastName" required aria-invalid={Boolean(fieldErrors.lastName)} disabled={disabled} value={draft.lastName} onChange={e => set('lastName', e.target.value)} /></Field>
        {organization && <Field className="person-director-field" style={place('directorName')} label={fa ? `نام مدیر ${selectedTitle?.nameFa ?? 'شرکت'}` : `${selectedTitle?.nameEn ?? 'Organization'} director`}><input data-field="directorName" disabled={disabled} maxLength={200} value={draft.directorName} onChange={e => set('directorName', e.target.value)} /></Field>}
        {!contractCreation && <Field className="person-job-field" style={place('jobId')} compact label={fa ? 'نقش یا شغل' : 'Job'}><select data-field="jobId" disabled={disabled} value={draft.jobId} onChange={e => set('jobId', e.target.value)}><option value="">—</option>{parameters.find(x => x.id === draft.jobId)?.code === 'PARTNER' && <option value={draft.jobId} disabled>{parameterLabel(parameters.find(x => x.id === draft.jobId))}</option>}{jobs.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>}
        <Field className="person-nationality-field" style={place('nationalityId')} compact label={fa ? 'ملیت' : 'Nationality'}><select data-field="nationalityId" disabled={disabled} value={draft.nationalityId} onChange={e => set('nationalityId', e.target.value)}><option value="">—</option>{nationalities.map(x => <option key={x.id} value={x.id}>{parameterLabel(x)}</option>)}</select></Field>
        <Field className="person-phone-field" style={place('phone')} label={fa ? 'تلفن' : 'Phone'}><NumberControl field="phone" label={fa ? 'تلفن' : 'Phone'} primary={draft.phone ?? ''} numbers={draft.phoneNumbers ?? []} disabled={disabled} fa={fa} suggestedCode={dialingCode} onChange={(phone, phoneNumbers) => setDraft(current => ({ ...current, phone, phoneNumbers }))} /></Field>
        <Field className="person-mobile-field" style={place('mobile')} label={fa ? 'موبایل' : 'Mobile'}><NumberControl field="mobile" label={fa ? 'موبایل' : 'Mobile'} primary={draft.mobile ?? ''} numbers={draft.mobileNumbers ?? []} disabled={disabled} fa={fa} suggestedCode={dialingCode} onChange={(mobile, mobileNumbers) => setDraft(current => ({ ...current, mobile, mobileNumbers }))} /></Field>
        <Field label={fa ? 'آدرس' : 'Address'} wide className="person-address-field" style={place('address')}><NumberControl field="address" label={fa ? 'آدرس' : 'Address'} primary={draft.address ?? ''} numbers={draft.addresses ?? []} disabled={disabled} fa={fa} onChange={(address, addresses) => setDraft(current => ({ ...current, address, addresses }))} multiline /></Field>
        <div className="person-notes-active" style={place('notes-active-group')}><Field label={fa ? 'توضیحات' : 'Notes'} className="person-notes-field"><input data-field="notes" disabled={disabled} value={draft.notes} onChange={e => set('notes', e.target.value)} /></Field><label className="active-check"><input data-field="isActive" type="checkbox" disabled={disabled} checked={draft.isActive} onChange={e => set('isActive', e.target.checked)} />{fa ? 'فعال' : 'Active'}</label></div>
        <Field label={fa ? 'کد و نام برند' : 'Brand code and name'} className="person-brands-field" style={place('brandIds')}><SystemLookup field="defaultBrandId" label={fa?'کد و نام برند':'Brand code and name'} value={draft.defaultBrandId??''} language={language} disabled={disabled} settings={{sourceId:'brands',returnMode:'saveAndSelect'}} ownerId={mode==='new'?'':selectedId} listSettings={{allowEmpty:true,searchEnabled:true,addPlacement:'popup'}} onCreationChange={setBrandCreation} onChange={id=>setDraft(current=>({...current,brandIds:id?[...new Set([...(current.brandIds??[]),id])]:[],defaultBrandId:id||null}))} onSelected={()=>formRef.current?.querySelector<HTMLElement>('[data-field="nationalityId"]')?.focus({preventScroll:true})}/></Field>
      </div>
    </section>
    <div className="split-handle" onPointerDown={resizeStart}><span /></div>
    <section className="person-grid-panel panel">
      {standalone ? <div className="form-laboratory-page persons-shared-grid"><div className="laboratory-grid">
        <BaseFormGridBoundary
          gridId="persons" title={gridTitle} language={language} rows={persons} columns={gridColumns}
          toolbarSettings={personsGridToolbar}
          columnPreferencesStorageKey={columnKey} remoteQuery={demoMode ? undefined : queryPersons}
          remoteQueryScope={gridRevision} autoSelectFirstRow readOnly={mode !== 'view'}
          selectedRowId={selectedId || null} navigationRequest={navigationRequest}
          onRowSelectionChange={selectGridPerson} onRowDoubleClick={beginEdit}
          onBulkDelete={!demoMode && hasPermission('persons.delete') ? bulkDelete : undefined}
          renderCell={(person, columnId) => cell(person, columnId as ColumnKey)}
          operational={{...personsGridOptions, initialColumnPreferences:columns.map(({key,width,visible})=>({id:key,width,visible}))}}
        />
      </div></div> : <>
      <div className="grid-toolbar">
        <div><h2>{gridTitle}</h2><span>{fa ? `${gridStart} تا ${gridEnd} از ${gridTotal} رکورد` : `${gridStart}–${gridEnd} of ${gridTotal} records`}</span></div>
        <div className="persons-grid-pager"><button type="button" disabled={gridPage <= 1 || gridLoading} onClick={() => setGridPage(page => page - 1)}>{fa ? 'قبلی' : 'Previous'}</button><span>{gridPage} / {gridPageCount}</span><button type="button" disabled={gridPage >= gridPageCount || gridLoading} onClick={() => setGridPage(page => page + 1)}>{fa ? 'بعدی' : 'Next'}</button></div>
        <div >
          <details className="column-picker" ref={columnPicker} open={columnMenuOpen} data-toolbar-part="columns">
            <summary role="button" aria-label={columnsLabel} title={columnsLabel} aria-expanded={columnMenuOpen} onClick={event => { event.preventDefault(); setColumnMenuOpen(current => !current) }}>{`☷ ${columnsLabel}`}</summary>
          </details>
        </div>
      </div>
      {columnMenuOpen && createPortal(<div ref={columnMenu} className="person-column-menu" dir={fa ? 'rtl' : 'ltr'} style={columnMenuPosition}>{columns.map(column => <label key={column.key}><input type="checkbox" checked={column.visible} disabled={column.visible && visibleColumns.length === 1} onChange={() => toggleColumn(column.key)} />{columnLabel(column.key)}</label>)}<button type="button" onClick={() => setColumns(defaultColumns)}>↺ {fa ? 'حالت پیش‌فرض' : 'Reset'}</button></div>, document.body)}
      {(bulk.multiSelection&&(bulk.selection.size>0||bulk.error))&&<div className="definition-bulk-status" role="status">{bulk.selection.size>1&&<span>{bulk.selection.size} ردیف انتخاب شده — Delete: حذف</span>}{bulk.selection.size>0&&<button type="button" data-definition-bulk-delete disabled={bulk.busy} onClick={()=>void bulk.remove()}>حذف انتخاب‌ها</button>}{bulk.error&&<span role="alert">{bulk.error}</span>}</div>}
      <div className="person-table-wrap" dir={fa ? 'rtl' : 'ltr'} tabIndex={0} onKeyDownCapture={bulk.keyDown}><ExcelGridFilterScope onReset={resetFilters}><table className="person-table excel-grid" style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{visibleColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup><thead>
        <tr>{visibleColumns.map(column => <ExcelGridColumnHeader key={column.key} column={gridColumns.find(item => item.id === column.key)!} rows={persons} locale={fa ? 'fa' : 'en'} language={language} direction={fa ? 'rtl' : 'ltr'} filter={filters[column.key]} sort={sort} onSort={next => { setSort(next); setGridPage(1) }} onApplyFilter={filter => applyFilter(column.key, filter)} loadFilterValues={search => loadGridFilterValues(column.key, search)} thProps={{ 'data-column': column.key, className: columnDrop?.key === column.key ? `column-drop-${columnDrop.before ? 'before' : 'after'}` : undefined, onDragOver: event => columnDragOver(event, column.key), onDrop: event => dropColumn(event, column.key) }} titleProps={{ draggable: true, onDragStart: event => { draggedColumn.current = column.key; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.key); setColumnMenuOpen(false) }, onDragEnd: () => { draggedColumn.current = null; setColumnDrop(null) } }} resizer={<i className="column-resizer" onPointerDown={event => resizeColumn(event, column.key)} />} />)}</tr>
      </thead><tbody>
        {loading || gridLoading ? <tr><td colSpan={visibleColumns.length}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : filtered.length ? filtered.map((person,index) => <tr key={person.id} data-person-id={person.id} className={(bulk.selection.size?bulk.selection.has(person.id):person.id===selectedId)?'selected'+(bulk.blocked.has(person.id)?' bulk-delete-blocked':''):bulk.blocked.has(person.id)?'bulk-delete-blocked':''} onClick={event=>{if(mode!=='view'||bulk.busy)return;(event.currentTarget.closest('.person-table-wrap') as HTMLElement)?.focus({preventScroll:true});void bulk.select(person,(gridPage-1)*100+index,event);if(event.ctrlKey||event.metaKey||event.shiftKey){event.preventDefault();return}setSelectedId(person.id)}} onDoubleClick={beginEdit}>{visibleColumns.map(column => <td key={column.key}>{cell(person, column.key)}</td>)}</tr>) : <tr><td colSpan={visibleColumns.length}>{fa ? 'رکوردی یافت نشد.' : 'No records found.'}</td></tr>}
      </tbody></table></ExcelGridFilterScope></div></>}
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
          <Shortcut code={shortcuts.save} label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary />
          <Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} />
        </>}

      </div>
    </section>
  </div>
  const owner = demoMode ? 'demo-persons' : authenticatedUserId ?? userKey
  if (!standalone || (!demoMode && !hasPermission('persons.view'))) return renderPage()
  return <OperationalFormFrame key={owner} formId="persons" title={gridTitle} language={language}
    permissions={personsAppearance} nativeLayout userId={owner} settingsDisabled={mode !== 'view'}>
    {renderPage}
  </OperationalFormFrame>
}
