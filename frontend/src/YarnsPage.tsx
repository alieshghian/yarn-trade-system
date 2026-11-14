import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, apiRequest, currentUserKey, hasPermission, isConcurrencyConflict, withRowVersion } from './api'
import type { Language } from './i18n'
import { suggestSerial } from './sequences'
import { DesignedYarnsView } from './forms/DesignedYarnsView'
import {useFieldValidation} from './components/base-form/useFieldValidation'
import { orderedEntryControls } from './formInteraction'

type Mode = 'view' | 'new' | 'edit'
export type Yarn = {
  rowVersion?: string,
  id: string, code: string, name: string, comprehensiveName: string, productGroupId?: string, luster?: string,
  unitOfMeasure: string, fixStatus?: string, material?: string, spinType?: string, filamentNumber?: number,
  spinningMethod?: string, continuityType?: string, countValue?: number, countType?: string,
  twistAmount?: number, twistType?: string, plyCount: number, notes?: string, isActive: boolean
}
export type YarnDraft = Omit<Yarn, 'rowVersion' | 'id' | 'comprehensiveName'>
type YarnPageResult = { items: Yarn[], total: number }
type ShortcutAction = 'new' | 'edit' | 'delete' | 'save'
type ShortcutMap = Record<ShortcutAction, string>
type FunctionShortcutPreferences = { f2CopyLast: boolean, f4CopySelected: boolean }
type YarnSequenceSuggestion = { suggestion: string, previous?: string | null, error?: string }

export const yarnLabels: Record<string, { fa: string, en: string, zh?: string }> = {
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
export const yarnOptions = {
  luster: ['BRIGHT', 'SEMI_DULL', 'DULL'], unitOfMeasure: ['KG', 'COUNT', 'CONE', 'HANK'],
  fixStatus: ['SHRINK', 'FIXED'], material: ['ACRYLIC', 'POLYESTER', 'COTTON', 'WIRE', 'LUREX', 'VISCOSE'],
  spinType: ['SPUN', 'FILAMENT'], spinningMethod: ['OPEN_END', 'RING'],
  continuityType: ['ZERO', 'INTERMINGLE', 'TWISTED', 'SIMPLE', 'COMMINGLE'], countType: ['NM', 'DENIER', 'DTEX', 'MICRON', 'NE'], twistType: ['S', 'Z']
} as const
export type YarnOptions = typeof yarnOptions
const defaultShortcuts: ShortcutMap = { new: 'Space', edit: 'Insert', delete: 'Delete', save: 'F3' }
const shortcutOptions = ['Space', 'Insert', 'Delete', 'F3', 'F6', 'F7', 'Ctrl+N', 'Ctrl+E']
const emptyDraft = (): YarnDraft => ({ code: '', name: '', productGroupId: undefined, luster: '', unitOfMeasure: 'KG', fixStatus: '', material: '', spinType: '', filamentNumber: undefined, spinningMethod: '', continuityType: '', countValue: undefined, countType: '', twistAmount: undefined, twistType: '', plyCount: 0, notes: '', isActive: true })
const copyDraft = (x: Yarn): YarnDraft => ({ code: x.code, name: x.name, productGroupId: x.productGroupId, luster: x.luster ?? '', unitOfMeasure: x.unitOfMeasure, fixStatus: x.fixStatus ?? '', material: x.material ?? '', spinType: x.spinType ?? '', filamentNumber: x.filamentNumber, spinningMethod: x.spinningMethod ?? '', continuityType: x.continuityType ?? '', countValue: x.countValue, countType: x.countType ?? '', twistAmount: x.twistAmount, twistType: x.twistType ?? '', plyCount: x.plyCount, notes: x.notes ?? '', isActive: x.isActive })
const payload = (x: YarnDraft) => Object.fromEntries(Object.entries(x).map(([key, value]) => [key, value === '' ? null : value]))
const demoYarns: Yarn[] = [
  { id: 'y1', code: 'CHN-3NM-01', name: 'DUBE DYED CHENILLE', comprehensiveName: 'DUBE DYED CHENILLE براق پلی استر فیلامنت 3 N.M. 1 لا', luster: 'BRIGHT', unitOfMeasure: 'KG', fixStatus: 'FIXED', material: 'POLYESTER', spinType: 'FILAMENT', countValue: 3, countType: 'NM', plyCount: 1, isActive: true },
  { id: 'y2', code: 'ELVA-5NM', name: 'ELVA YARN', comprehensiveName: 'ELVA YARN نیمه مات ویسکوز اسپان 5 N.M. 2 لا', luster: 'SEMI_DULL', unitOfMeasure: 'KG', material: 'VISCOSE', spinType: 'SPUN', countValue: 5, countType: 'NM', plyCount: 2, isActive: true }
]

function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  if (shortcut.startsWith('Ctrl+')) return event.ctrlKey && event.key.toUpperCase() === shortcut.slice(5).toUpperCase()
  return shortcut === 'Space' ? event.code === 'Space' : event.key === shortcut
}
export default function YarnsPage({ language, demoMode = false }: { language: Language, demoMode?: boolean }) {
  const fa = language === 'fa', userKey = currentUserKey()
  const columnKey = `yarns-columns:${userKey}`, shortcutKey = `yarns-shortcuts:${userKey}`, functionShortcutKey = `yarns-function-shortcuts:${userKey}`
  const [yarns, setYarns] = useState<Yarn[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<YarnDraft>(emptyDraft)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof YarnDraft, string>>>({})
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => { try { const saved={...defaultShortcuts,...JSON.parse(localStorage.getItem(shortcutKey) ?? '{}')} as ShortcutMap; for(const action of Object.keys(defaultShortcuts) as ShortcutAction[])if(saved[action]==='F2'||saved[action]==='F4')saved[action]=defaultShortcuts[action]; return saved } catch { return defaultShortcuts } })
  const [functionShortcuts, setFunctionShortcuts] = useState<FunctionShortcutPreferences>(() => { try { const saved=JSON.parse(localStorage.getItem(functionShortcutKey) ?? '{}'); return { f2CopyLast: saved.f2CopyLast ?? saved.f2New ?? true, f4CopySelected: saved.f4CopySelected ?? saved.f4Edit ?? true } } catch { return { f2CopyLast: true, f4CopySelected: true } } })
  const original = useRef(JSON.stringify(emptyDraft())), formRef = useRef<HTMLDivElement>(null)
  const selected = yarns.find(x => x.id === selectedId), dirty = mode !== 'view' && JSON.stringify(draft) !== original.current
  const {validateFields}=useFieldValidation(formRef,{enabled:mode!=='view',entity:'yarns',demo:demoMode,context:{currentId:mode==='edit'?selectedId:null},rules:{code:{required:true,maxLength:50,remote:true},name:{required:true,maxLength:200},filamentNumber:{min:0},countValue:{min:0},twistAmount:{min:0},plyCount:{min:0,max:9,integer:true}}})
  const label = useCallback((code?: string) => code ? yarnLabels[code]?.[language] ?? yarnLabels[code]?.en ?? code : '', [language])
  const comprehensiveName = useMemo(() => [
    draft.name.trim(), label(draft.luster), label(draft.material), draft.filamentNumber, label(draft.spinType),
    draft.countValue, label(draft.countType), draft.plyCount > 0 ? `${draft.plyCount} ${fa ? 'لا' : 'ply'}` : ''
  ].filter(x => x !== '' && x !== undefined && x !== null).join(' '), [draft, label, fa])
  const gridRows = useMemo(() => [...yarns].sort((a, b) => a.code.localeCompare(b.code, fa ? 'fa' : 'en', { numeric: true })), [yarns, fa])
  const selectedIndex = Math.max(0, gridRows.findIndex(x => x.id === selectedId))

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
  useEffect(() => { localStorage.setItem(shortcutKey, JSON.stringify(shortcuts)) }, [shortcutKey, shortcuts])
  useEffect(() => { localStorage.setItem(functionShortcutKey, JSON.stringify(functionShortcuts)) }, [functionShortcutKey, functionShortcuts])
  useEffect(() => { const fn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }; window.addEventListener('beforeunload', fn); return () => window.removeEventListener('beforeunload', fn) }, [dirty])
  useEffect(() => { if (mode !== 'view') requestAnimationFrame(() => { if (formRef.current) orderedEntryControls(formRef.current)[0]?.value.focus() }) }, [mode])

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
  const beginCreate = useCallback(async (source?:Yarn,suggestedCode?:string) => {
    if (!hasPermission('yarns.create')) return
    const value = source ? copyDraft(source) : emptyDraft()
    value.code=''; setError('')
    try { value.code = suggestedCode ?? await suggestSerial('yarn', demoMode, yarns.at(-1)?.code, 'YRN-0001') }
    catch (e) { value.code=''; setError(e instanceof Error ? e.message : String(e)) }
    setDraft(value); original.current = JSON.stringify(value); setMode('new'); setMessage(''); setFieldErrors({})
  }, [demoMode, yarns])
  const beginNew = useCallback(() => { void beginCreate() }, [beginCreate])
  const beginCopyLast = useCallback(async () => {
    if (mode!=='view'||loading||!hasPermission('yarns.create')) return
    try {
      if (demoMode) { const source=yarns.at(-1); if(source) await beginCreate(source); return }
      const sequence=await api<YarnSequenceSuggestion>('/api/sequence-suggestions/yarn')
      if(sequence.error){setError(sequence.error);return}
      const source=sequence.previous?yarns.find(item=>item.code===sequence.previous):undefined
      if(!source){setError(fa?'رکورد قبلی برای کپی پیدا نشد.':'The latest record to copy could not be found.');return}
      await beginCreate(source,sequence.suggestion)
    } catch(e) { setError(e instanceof Error?e.message:String(e)) }
  }, [mode,loading,demoMode,yarns,beginCreate,fa])
  const beginCopySelected = useCallback(() => { if(mode==='view'&&selected&&hasPermission('yarns.create'))void beginCreate(selected) }, [mode,selected,beginCreate])
  const beginEdit = useCallback(() => { if (!selected) return; const value = copyDraft(selected); setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({}) }, [selected])
  const beginEditRow = useCallback((row: Yarn) => {
    if (!hasPermission('yarns.edit')) return
    const value = copyDraft(row); setSelectedId(row.id); setDraft(value); original.current = JSON.stringify(value); setMode('edit'); setError(''); setMessage(''); setFieldErrors({})
  }, [])
  const cancel = useCallback(() => {
    if (dirty && !confirm(fa ? 'اطلاعات تغییر کرده است. از خروج از حالت فعلی اطمینان دارید؟' : 'Information changed. Exit?')) return
    setMode('view'); setError(''); setFieldErrors({}); if (selected) selectYarn(selected)
  }, [dirty, fa, selected, selectYarn])
  const save = useCallback(async () => {
    if (!await validateFields()) return
    if (mode === 'view' || !validateAll()) return
    try {
      if (demoMode) {
        const value: Yarn = { id: mode === 'new' ? crypto.randomUUID() : selectedId, comprehensiveName, ...draft }
        setYarns(current => mode === 'new' ? [...current, value] : current.map(x => x.id === selectedId ? value : x))
        setMode('view'); selectYarn(value)
      } else {
        let confirmedProductGroupDepth: number | undefined
        if (draft.productGroupId) {
          const assignment = await apiRequest<{selectable:boolean;terminalDepth:number;requiresConfirmation:boolean;message:string}>(`/api/master-data/product-groups/${encodeURIComponent(draft.productGroupId)}/assignment`)
          if (!assignment.selectable) throw Error(assignment.message)
          if (assignment.requiresConfirmation && !window.confirm(assignment.message)) return
          confirmedProductGroupDepth = assignment.terminalDepth
        }
        const saved = mode === 'new'
          ? await apiRequest<Yarn>('/api/yarns', { method: 'POST', body: JSON.stringify({...payload(draft),confirmedProductGroupDepth}) })
          : await apiRequest<Yarn>(withRowVersion(`/api/yarns/${selectedId}`, selected?.rowVersion), { method: 'PUT', body: JSON.stringify({...payload(draft),confirmedProductGroupDepth}) })
        setMode('view'); await load(saved.id)
      }
      setMessage(fa ? 'اطلاعات نخ با موفقیت ثبت شد.' : 'Yarn saved successfully.')
    } catch (e) { if (isConcurrencyConflict(e)) { setMode('view'); setFieldErrors({}); await load(selectedId) }; setError(e instanceof Error ? e.message : String(e)) }
  }, [selected?.rowVersion, mode, validateAll, demoMode, selectedId, comprehensiveName, draft, selectYarn, load, fa])
  const remove = useCallback(async () => {
    if (!selected || mode !== 'view' || !confirm(fa ? `نخ «${selected.comprehensiveName}» حذف شود؟` : `Delete “${selected.comprehensiveName}”?`)) return
    try {
      if (demoMode) { const next = yarns.filter(x => x.id !== selected.id); setYarns(next); selectYarn(next[0]) }
      else { await apiRequest<void>(withRowVersion(`/api/yarns/${selected.id}`, selected.rowVersion), { method: 'DELETE' }); await load() }
      setMessage(fa ? 'نخ حذف شد.' : 'Yarn deleted.')
    } catch (e) { if (isConcurrencyConflict(e)) { await load(selected.id); setError(e.message); return }; setError(e instanceof ApiError && e.status === 409 ? (fa ? 'این نخ در تراکنش‌های سیستم استفاده شده و قابل حذف نیست.' : e.message) : e instanceof Error ? e.message : String(e)) }
  }, [selected, mode, fa, demoMode, yarns, selectYarn, load])
  const move = useCallback((where: 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end') => {
    if (!gridRows.length) return
    const delta = where === 'up' ? -1 : where === 'down' ? 1 : where === 'pageUp' ? -10 : where === 'pageDown' ? 10 : 0
    const index = where === 'home' ? 0 : where === 'end' ? gridRows.length - 1 : Math.max(0, Math.min(gridRows.length - 1, selectedIndex + delta))
    selectYarn(gridRows[index])
  }, [gridRows, selectedIndex, selectYarn])
  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (mode !== 'view') { if (shortcutMatches(event, shortcuts.save)) { event.preventDefault(); void save() } else if (event.key === 'Escape') { event.preventDefault(); cancel() }; return }
      if (event.key === 'Escape') { event.preventDefault(); window.dispatchEvent(new Event('close-active-form')); return }
      if (functionShortcuts.f2CopyLast && event.key === 'F2') { event.preventDefault(); void beginCopyLast() }
      else if (functionShortcuts.f4CopySelected && event.key === 'F4') { event.preventDefault(); beginCopySelected() }
      else if (event.target instanceof Element && event.target.closest('.base-grid-table')) return
      else if (typing) return
      else if (shortcutMatches(event, shortcuts.new)) { event.preventDefault(); void beginNew() }
      else if (shortcutMatches(event, shortcuts.edit)) { event.preventDefault(); beginEdit() }
      else if (shortcutMatches(event, shortcuts.delete)) { event.preventDefault(); void remove() }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move('up') } else if (event.key === 'ArrowDown') { event.preventDefault(); move('down') }
      else if (event.key === 'PageUp') { event.preventDefault(); move('pageUp') } else if (event.key === 'PageDown') { event.preventDefault(); move('pageDown') }
      else if (event.key === 'Home') { event.preventDefault(); move('home') } else if (event.key === 'End') { event.preventDefault(); move('end') }
    }; document.addEventListener('keydown', fn); return () => document.removeEventListener('keydown', fn)
  }, [mode, shortcuts, functionShortcuts, save, cancel, beginNew, beginCopyLast, beginCopySelected, beginEdit, remove, move])

  const footer = <div className="shortcut-bar laboratory-footer" dir={fa ? 'rtl' : 'ltr'}>
    {mode === 'view' ? <>
      <Shortcut code={shortcuts.new} label={fa ? 'نخ جدید' : 'New'} onClick={beginNew} primary disabled={!hasPermission('yarns.create')} />{functionShortcuts.f2CopyLast&&<Shortcut code="F2" label={fa ? 'کپی آخرین' : 'Copy last'} onClick={() => void beginCopyLast()} disabled={loading || !yarns.length || !hasPermission('yarns.create')} />}{functionShortcuts.f4CopySelected&&<Shortcut code="F4" label={fa ? 'کپی انتخابی' : 'Copy selected'} onClick={beginCopySelected} disabled={loading || !selected || !hasPermission('yarns.create')} />}<Shortcut code={shortcuts.edit} label={fa ? 'ویرایش' : 'Edit'} onClick={beginEdit} disabled={!hasPermission('yarns.edit')} /><Shortcut code={shortcuts.delete} label={fa ? 'حذف' : 'Delete'} onClick={() => void remove()} danger disabled={!hasPermission('yarns.delete')} />
      <Shortcut code="Home" label={fa ? 'اول' : 'First'} onClick={() => move('home')} /><Shortcut code="PgUp" label={fa ? 'صفحه قبل' : 'Page up'} onClick={() => move('pageUp')} /><Shortcut code="↑ ↓" label={fa ? 'مرور' : 'Browse'} onClick={() => move('down')} /><Shortcut code="PgDn" label={fa ? 'صفحه بعد' : 'Page down'} onClick={() => move('pageDown')} /><Shortcut code="End" label={fa ? 'آخر' : 'Last'} onClick={() => move('end')} />
    </> : <><Shortcut code={shortcuts.save} label={fa ? 'ثبت اطلاعات' : 'Save'} onClick={() => void save()} primary /><Shortcut code="Esc" label={fa ? 'انصراف' : 'Cancel'} onClick={cancel} /></>}
    <details className="shortcut-settings"><summary title={fa ? 'شخصی‌سازی کلیدها' : 'Customize shortcuts'}>⚙</summary><div>{(Object.keys(shortcuts) as ShortcutAction[]).map(action => <label key={action}><span>{({ new: fa ? 'جدید' : 'New', edit: fa ? 'ویرایش' : 'Edit', delete: fa ? 'حذف' : 'Delete', save: fa ? 'ثبت' : 'Save' })[action]}</span><select value={shortcuts[action]} onChange={e => setShortcuts(x => ({ ...x, [action]: e.target.value }))}>{shortcutOptions.map(o => <option key={o}>{o}</option>)}</select></label>)}
      <label><input type="checkbox" checked={functionShortcuts.f2CopyLast} onChange={event => setFunctionShortcuts(value => ({ ...value, f2CopyLast: event.target.checked }))} />F2 — {fa ? 'کپی آخرین' : 'Copy last'}</label>
      <label><input type="checkbox" checked={functionShortcuts.f4CopySelected} onChange={event => setFunctionShortcuts(value => ({ ...value, f4CopySelected: event.target.checked }))} />F4 — {fa ? 'کپی انتخابی' : 'Copy selected'}</label>
    </div></details>
  </div>

  return <DesignedYarnsView language={language} rows={gridRows} draft={draft} comprehensiveName={comprehensiveName} editing={mode !== 'view'} saving={false} loading={loading} selectedId={selectedId} error={error} message={message} fieldErrors={fieldErrors} formRef={formRef} columnPreferencesStorageKey={columnKey} label={label} options={yarnOptions} onChange={(key, value) => set(key, value as never)} onBlur={key => { void validateAndShow(key) }} onValidate={key => validateAndShow(key)} onSelect={selectYarn} onEditRow={beginEditRow} footer={footer} />
}

function Shortcut({ code, label, onClick, primary, danger, disabled }: { code: string, label: string, onClick: () => void, primary?: boolean, danger?: boolean, disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`${primary ? 'primary' : ''} ${danger ? 'danger-shortcut' : ''}`} onClick={onClick}><kbd>{code}</kbd><span>{label}</span></button>
}
