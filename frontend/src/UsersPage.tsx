import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiRequest, currentUserKey } from './api'
import type { Language } from './i18n'

type UserRow = { id: string, personId?: string, email: string, displayName: string, preferredLanguage: string, isActive: boolean, pendingInvitation: boolean, roles: string[] }
type Person = { id: string, personCode: string, displayName: string }
type Permission = { key: string, menu: string, action: string, nameFa: string, nameEn: string }
type Catalog = { roles: string[], persons: Person[], permissions: Permission[], roleDefaults: Record<string, string[]> }
type UserDetail = UserRow & { permissions: string[] }
type Form = { id?: string, personId: string, email: string, preferredLanguage: string, isActive: boolean, roles: string[], permissions: string[] }
type Mode = 'view' | 'new' | 'edit'

const blank: Form = { personId: '', email: '', preferredLanguage: 'fa', isActive: true, roles: [], permissions: [] }
const roleFa: Record<string, string> = {
  Administrator: 'مدیر سیستم', Customer: 'مشتری', Seller: 'فروشنده', Supplier: 'تأمین‌کننده',
  Partner: 'شریک', Manager: 'مدیریت', Orders: 'سفارشات', Commerce: 'بازرگانی',
  WarehouseOperator: 'انباردار', FinanceOperator: 'مالی', SalesOperator: 'فروش',
  PurchaseOperator: 'خرید', ReportViewer: 'گزارش‌گیر', Other: 'سایر'
}
const menuFa: Record<string, string> = {
  dashboard: 'داشبورد', persons: 'تعریف اشخاص', yarns: 'تعریف نخ', purchaseOrders: 'سفارش خرید',
  commerce: 'بازرگانی', purchases: 'خرید و واردات', inventory: 'انبار', sales: 'فروش',
  finance: 'دریافت و پرداخت', checks: 'چک‌ها', partners: 'شرکا', reports: 'گزارش‌ها',
  settings: 'تنظیمات', users: 'تعریف کاربران'
}

export default function UsersPage({ language, administrator }: { language: Language, administrator: boolean }) {
  const fa = language === 'fa'
  const [catalog, setCatalog] = useState<Catalog>({ roles: [], persons: [], permissions: [], roleDefaults: {} })
  const [users, setUsers] = useState<UserRow[]>([])
  const [form, setForm] = useState<Form>(blank)
  const [mode, setMode] = useState<Mode>('view')
  const [selectedId, setSelectedId] = useState('')
  const splitKey = `users-form-split:${currentUserKey()}`
  const [topPercent, setTopPercent] = useState(() => Number(localStorage.getItem(splitKey)) || 68)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true)
  const firstInput = useRef<HTMLSelectElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, values] = await Promise.all([api<UserRow[]>('/api/users'), api<Catalog>('/api/users/catalog')])
      setUsers(rows); setCatalog(values)
      const target = rows.find(x => x.id === selectedId) ?? rows[0]
      if (target) { setSelectedId(target.id); await selectUser(target.id) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  // selectUser intentionally reads only the requested id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selectUser = useCallback(async (id: string) => {
    try {
      const value = await api<UserDetail>(`/api/users/${id}`)
      setForm({ id: value.id, personId: value.personId ?? '', email: value.email, preferredLanguage: value.preferredLanguage, isActive: value.isActive, roles: value.roles, permissions: value.permissions }); setSelectedId(id); setMode('view')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode !== 'view') queueMicrotask(() => firstInput.current?.focus()) }, [mode])

  const permissionsByMenu = useMemo(() => {
    const groups = new Map<string, Permission[]>()
    catalog.permissions.forEach(permission => groups.set(permission.menu, [...(groups.get(permission.menu) ?? []), permission]))
    return [...groups.entries()]
  }, [catalog.permissions])
  const usedPersons = useMemo(() => new Set(users.filter(x => x.id !== form.id).map(x => x.personId).filter(Boolean)), [users, form.id])

  function startNew() { if (!administrator) return; setForm(blank); setMode('new'); setError(''); setMessage('') }
  function startEdit() { if (form.id) { setMode('edit'); setError(''); setMessage('') } }
  function cancel() {
    if (mode === 'view') { window.dispatchEvent(new Event('close-active-form')); return }
    if (confirm(fa ? 'تغییرات ثبت‌نشده لغو شود؟' : 'Discard unsaved changes?')) {
      if (selectedId) void selectUser(selectedId); else { setForm(blank); setMode('view') }
    }
  }
  function toggleRole(role: string) {
    setForm(current => {
      const adding = !current.roles.includes(role)
      const roles = adding ? [...current.roles, role] : current.roles.filter(x => x !== role)
      const defaults = new Set(roles.flatMap(x => catalog.roleDefaults[x] ?? []))
      return { ...current, roles, permissions: [...defaults] }
    })
  }
  function togglePermission(permission: Permission) {
    setForm(current => {
      const set = new Set(current.permissions)
      if (set.has(permission.key)) {
        set.delete(permission.key)
        if (permission.action === 'view') catalog.permissions.filter(x => x.menu === permission.menu).forEach(x => set.delete(x.key))
      } else {
        set.add(permission.key)
        const view = catalog.permissions.find(x => x.menu === permission.menu && x.action === 'view')
        if (view) set.add(view.key)
      }
      return { ...current, permissions: [...set] }
    })
  }
  async function save() {
    if (!form.personId || !form.email.trim() || form.roles.length === 0) {
      setError(fa ? 'شخص، ایمیل و حداقل یک نقش الزامی است.' : 'Person, email and a role are required.'); return
    }
    try {
      const body = JSON.stringify(form)
      if (mode === 'new') await apiRequest('/api/users', { method: 'POST', body })
      else await apiRequest(`/api/users/${form.id}`, { method: 'PUT', body })
      setMessage(mode === 'new' ? (fa ? 'کاربر ثبت و دعوت ایمیلی ارسال شد.' : 'User created and invitation emailed.') : (fa ? 'اطلاعات کاربر ثبت شد.' : 'User access saved.'))
      setMode('view'); await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  async function securityAction(action: 'invitation' | 'security-reset') {
    if (!administrator || !form.id) return
    if (action === 'security-reset' && !confirm(fa ? 'همه نشست‌ها و اعتبار مرورگرهای این کاربر لغو شود؟' : 'Revoke all sessions and browser trust for this user?')) return
    try { await apiRequest(`/api/users/${form.id}/${action}`, { method: 'POST' }); setError(''); setMessage(fa ? 'عملیات امنیتی انجام شد.' : 'Security action completed.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  function startResize(event: ReactPointerEvent) {
    event.preventDefault()
    const move = (pointer: PointerEvent) => {
      const rect = pageRef.current?.getBoundingClientRect()
      if (!rect) return
      setTopPercent(Math.max(48, Math.min(78, ((pointer.clientY - rect.top) / rect.height) * 100)))
    }
    const stop = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', stop)
      setTopPercent(value => { localStorage.setItem(splitKey, value.toFixed(1)); return value })
    }
    addEventListener('pointermove', move); addEventListener('pointerup', stop)
  }
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancel() }
      else if (event.key === 'F3' && mode !== 'view') { event.preventDefault(); void save() }
      else if (event.code === 'Space' && mode === 'view' && event.target === document.body) { event.preventDefault(); startNew() }
      else if (event.key === 'Insert' && mode === 'view') { event.preventDefault(); startEdit() }
    }
    addEventListener('keydown', handler); return () => removeEventListener('keydown', handler)
  })

  const editing = mode !== 'view'
  return <div ref={pageRef} className="users-page" style={{ gridTemplateRows: `minmax(360px,${topPercent}fr) 7px minmax(170px,${100 - topPercent}fr)` }}>
    <section className="panel user-editor">
      <div className="person-section-head"><div><h2>{fa ? 'تعریف کاربر و اختیارات' : 'Users & permissions'}</h2><p>{mode === 'new' ? (fa ? 'کاربر جدید' : 'New user') : mode === 'edit' ? (fa ? 'اصلاح کاربر' : 'Edit user') : (fa ? 'اطلاعات کاربر' : 'User details')}</p></div><span className={`mode-badge ${mode}`}>{mode === 'new' ? (fa ? 'جدید' : 'New') : mode === 'edit' ? (fa ? 'ویرایش' : 'Edit') : (fa ? 'مرور' : 'Browse')}</span></div>
      {error && <div className="form-message error-message">{error}</div>}{message && <div className="form-message success-message">{message}</div>}
      {administrator && form.id && mode === 'view' && <div className="shortcut-bar">{users.find(x => x.id === form.id)?.pendingInvitation && <button type="button" onClick={() => void securityAction('invitation')}>{fa ? 'ارسال مجدد دعوت' : 'Reissue invitation'}</button>}<button type="button" onClick={() => void securityAction('security-reset')}>{fa ? 'لغو همه نشست‌ها و اعتماد مرورگر' : 'Revoke sessions & browser trust'}</button></div>}
      <form>
        <div className={`person-form-grid user-form-grid ${editing ? 'editing' : ''}`}>
          <label><span>{fa ? 'شخص مرتبط *' : 'Person *'}</span><select ref={firstInput} disabled={!editing} value={form.personId} onChange={e => { const person = catalog.persons.find(x => x.id === e.target.value); setForm(x => ({ ...x, personId: e.target.value, email: x.email, displayName: person?.displayName ?? '' })) }}><option value="">—</option>{catalog.persons.map(x => <option disabled={usedPersons.has(x.id)} key={x.id} value={x.id}>{x.personCode} — {x.displayName}</option>)}</select></label>
          <label><span>{fa ? 'ایمیل / نام کاربری *' : 'Email / username *'}</span><input dir="ltr" disabled={!editing || !administrator} type="email" value={form.email} onChange={e => setForm(x => ({ ...x, email: e.target.value }))} /></label>
          <label><span>{fa ? 'زبان' : 'Language'}</span><select disabled={!editing} value={form.preferredLanguage} onChange={e => setForm(x => ({ ...x, preferredLanguage: e.target.value }))}><option value="fa">فارسی</option><option value="en">English</option></select></label>
          <label className="active-check"><input disabled={!editing} type="checkbox" checked={form.isActive} onChange={e => setForm(x => ({ ...x, isActive: e.target.checked }))} />{fa ? 'کاربر فعال است' : 'User is active'}</label>
        </div>
        <div className="access-layout">
          <section className="role-box"><h3>{fa ? 'نقش‌های کاربر' : 'User roles'}</h3><div>{catalog.roles.map(role => <label key={role}><input disabled={!editing} type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} /><span>{fa ? roleFa[role] ?? role : role}</span><small>{role}</small></label>)}</div></section>
          <section className="permission-box"><div className="permission-head"><h3>{fa ? 'اختیارات منوها و عملیات' : 'Menu & action permissions'}</h3><span>{form.permissions.length} {fa ? 'مجوز' : 'permissions'}</span></div><div className="permission-grid">{permissionsByMenu.map(([menu, permissions]) => <article key={menu}><strong>{fa ? menuFa[menu] ?? menu : menu}</strong>{permissions.map(permission => <label key={permission.key}><input disabled={!editing} type="checkbox" checked={form.permissions.includes(permission.key)} onChange={() => togglePermission(permission)} /><span>{fa ? permission.nameFa : permission.nameEn}</span></label>)}</article>)}</div></section>
        </div>
        <div className="shortcut-bar">{editing ? <><button type="button" className="primary permission-save" onClick={() => void save()}><kbd>F3</kbd><span>{fa ? 'ثبت اطلاعات' : 'Save'}</span></button><button type="button" onClick={cancel}><kbd>Esc</kbd><span>{fa ? 'انصراف' : 'Cancel'}</span></button></> : <><button type="button" disabled={!administrator} onClick={startNew}><kbd>Space</kbd><span>{fa ? 'کاربر جدید' : 'New'}</span></button><button type="button" disabled={!form.id} onClick={startEdit}><kbd>Insert</kbd><span>{fa ? 'ویرایش' : 'Edit'}</span></button><button type="button" onClick={cancel}><kbd>Esc</kbd><span>{fa ? 'خروج' : 'Exit'}</span></button></>}</div>
      </form>
    </section>
    <div className="split-handle user-splitter" onPointerDown={startResize}><span /></div>
    <section className="panel user-list"><div className="grid-toolbar"><div><h2>{fa ? 'فهرست کاربران' : 'Users'}</h2><span>{users.length} {fa ? 'کاربر' : 'users'}</span></div></div><div className="person-table-wrap"><table className="person-table excel-grid"><thead><tr><th>{fa ? 'شخص' : 'Person'}</th><th>{fa ? 'ایمیل' : 'Email'}</th><th>{fa ? 'نقش‌ها' : 'Roles'}</th><th>{fa ? 'زبان' : 'Language'}</th><th>{fa ? 'وضعیت' : 'Status'}</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>{fa ? 'در حال دریافت…' : 'Loading…'}</td></tr> : users.map(x => <tr key={x.id} className={x.id === selectedId ? 'selected' : ''} onClick={() => mode === 'view' && void selectUser(x.id)}><td>{x.displayName}</td><td dir="ltr">{x.email}</td><td>{x.roles.map(role => fa ? roleFa[role] ?? role : role).join('، ')}</td><td>{x.preferredLanguage === 'fa' ? 'فارسی' : 'English'}</td><td><span className={x.isActive ? 'active-pill' : 'inactive-pill'}>{x.pendingInvitation ? (fa ? 'در انتظار فعال‌سازی' : 'Pending activation') : x.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')}</span></td></tr>)}</tbody></table></div></section>
  </div>
}
