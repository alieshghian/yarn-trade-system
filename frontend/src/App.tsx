import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, apiRequest, isConcurrencyConflict, withRowVersion, authenticationRequest, type EmailChallenge, isAuthenticated, login, logout, setAccessPermissions, tryDevelopmentSession, verifyEmail } from './api'
import { Language, text } from './i18n'
import PersonsPage from './PersonsPage'
import YarnsPage from './YarnsPage'
import PurchaseOrdersPage from './PurchaseOrdersPage'
import CommercePage from './CommercePage'
import UsersPage from './UsersPage'
import UserSettingsPage, { type UserPreferences } from './UserSettingsPage'
import DataBackupPage from './DataBackupPage'
import { formatPersianDate } from './persianDate'

type Purchase = { id: string, internalNumber: string, externalInvoiceNumber?: string, invoiceDate: string, supplierId: string, totalNetWeight: number, grandTotal: number, status: string }
type PurchasePage = { items: Purchase[], total: number }
type WorkItem = { rowVersion?: string, id: string, category: string, summary: string, title: string, description: string, severity: 'Urgent' | 'Warning' | 'Info', target: string, entityId: string, assignedAtUtc: string, viewedAtUtc?: string, actionStartedAtUtc?: string, slaHours: number }
type MaintenanceNotice = { id: string, requesterName: string, requesterRoles: string, operation: 'Backup' | 'Restore', reason: string, estimatedMinutes: number, createdAtUtc: string, expiresAtUtc: string }
type Access = { id: string, email: string, displayName: string, preferredLanguage: string, sessionTimeoutMinutes: number, theme: UserPreferences['theme'], compactMode: boolean, fontFamily: UserPreferences['fontFamily'], fontSize: UserPreferences['fontSize'], roles: string[], permissions: string[] }

const icons: Record<string, string> = { dashboard: '▦', persons: '♧', yarns: '≋', purchaseOrders: '☷', commerce: '⚑', purchases: '⇩', inventory: '◫', sales: '↗', finance: '◈', checks: '▤', partners: '♙', reports: '▥', users: '♟', dataBackup: '⟳', settings: '⚙' }
type MenuKey = 'dashboard' | 'persons' | 'yarns' | 'purchaseOrders' | 'commerce' | 'purchases' | 'inventory' | 'sales' | 'finance' | 'checks' | 'partners' | 'reports' | 'users' | 'dataBackup' | 'settings'

const authenticationLink = new URLSearchParams(location.hash.slice(1))
const activationToken = authenticationLink.get('activate')
const recoveryToken = authenticationLink.get('reset')
if (activationToken || recoveryToken) history.replaceState(null, '', location.pathname + location.search)

export default function App() {
  const demoMode = new URLSearchParams(location.search).get('demo') === '1'
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('language') as Language) || 'fa')
  const [theme, setTheme] = useState<UserPreferences['theme']>(() => (localStorage.getItem('theme') as UserPreferences['theme']) || 'system')
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('compact-mode') === '1')
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(() => Number(localStorage.getItem('session-timeout')) || 30)
  const [fontFamily, setFontFamily] = useState<UserPreferences['fontFamily']>(() => (localStorage.getItem('font-family') as UserPreferences['fontFamily']) || 'vazirmatn')
  const [fontSize, setFontSize] = useState<UserPreferences['fontSize']>(() => (localStorage.getItem('font-size') as UserPreferences['fontSize']) || 'normal')
  const [active, setActive] = useState<MenuKey>('dashboard')
  const [openTabs, setOpenTabs] = useState<MenuKey[]>(['dashboard'])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const [authenticated, setAuthenticated] = useState(!activationToken && !recoveryToken && (isAuthenticated() || demoMode))
  const [checkingDevelopment, setCheckingDevelopment] = useState(import.meta.env.DEV && !isAuthenticated() && !demoMode && !activationToken && !recoveryToken)
  useEffect(() => {
    if (import.meta.env.DEV && !isAuthenticated() && !demoMode && !activationToken && !recoveryToken) {
      let cancelled = false
      void tryDevelopmentSession().then(success => { if (!cancelled) { setAuthenticated(success); setCheckingDevelopment(false) } })
      return () => { cancelled = true }
    }
  }, []) // Initial startup only; signing out does not trigger auto-login.
  const [authNotice, setAuthNotice] = useState('')
  const [access, setAccess] = useState<Access>()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [workDrawerOpen, setWorkDrawerOpen] = useState(false)
  const [expandedWorkItem, setExpandedWorkItem] = useState<string>()
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [commerceTarget, setCommerceTarget] = useState<{ id: string, request: number }>()
  const [actioningWorkItem, setActioningWorkItem] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [maintenanceNotice, setMaintenanceNotice] = useState<MaintenanceNotice | null>(null)
  const t = text[language]
  const dir = language === 'fa' ? 'rtl' : 'ltr'
  const allMenus = useMemo(() => ['dashboard', 'persons', 'yarns', 'purchaseOrders', 'commerce', 'purchases', 'inventory', 'sales', 'finance', 'checks', 'partners', 'reports', 'users', 'dataBackup', 'settings'] as const, [])
  const menu = useMemo(() => allMenus.filter(key => demoMode || key === 'settings' || (!access ? key === 'dashboard' : access.permissions.includes(`${key}.view`))), [allMenus, access, demoMode])
  // هر فرم فقط کارتابل فعالیت مرتبط با خودش را نمایش می‌دهد؛ نقش مقصد در API کنترل می‌شود.
  const currentWorkItems = useMemo(() => workItems.filter(item => item.target === active), [workItems, active])
  const pendingWorkItems = currentWorkItems.filter(item => !item.actionStartedAtUtc)
  const pendingWorkItemCount = pendingWorkItems.length
  const commerceOrderCount = workItems.filter(item => item.category === 'CommerceOrder' && !item.actionStartedAtUtc).length

  function openForm(key: MenuKey) {
    setOpenTabs(current => current.includes(key) ? current : [...current, key])
    setActive(key)
  }

  function closeForm(key: MenuKey) {
    setOpenTabs(current => {
      if (current.length === 1) return current
      const index = current.indexOf(key)
      const next = current.filter(x => x !== key)
      if (active === key) setActive(next[Math.max(0, index - 1)])
      return next
    })
  }

  const closeActiveByEscape = useCallback(() => {
    if (active === 'dashboard') {
      if (window.confirm(language === 'fa' ? 'از سیستم خارج می‌شوید؟' : 'Sign out of the system?')) { logout(); setAuthenticated(false) }
      return
    }
    setOpenTabs(current => {
      const next = current.filter(x => x !== active)
      const finalTabs: MenuKey[] = next.length ? next : ['dashboard']
      setActive(finalTabs[finalTabs.length - 1])
      return finalTabs
    })
  }, [active, language])

  function toggleSidebar() {
    setSidebarCollapsed(value => {
      localStorage.setItem('sidebar-collapsed', value ? '0' : '1')
      return !value
    })
  }

  const applyPreferences = useCallback((value: UserPreferences) => {
    setLanguage(value.preferredLanguage); setTheme(value.theme); setCompactMode(value.compactMode); setSessionTimeoutMinutes(value.sessionTimeoutMinutes); setFontFamily(value.fontFamily); setFontSize(value.fontSize)
    localStorage.setItem('theme', value.theme); localStorage.setItem('compact-mode', value.compactMode ? '1' : '0'); localStorage.setItem('session-timeout', String(value.sessionTimeoutMinutes))
    localStorage.setItem('font-family', value.fontFamily); localStorage.setItem('font-size', value.fontSize)
    setAccess(current => current ? { ...current, ...value } : current)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = dir
    localStorage.setItem('language', language)
  }, [language, dir])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme }
    apply(); media.addEventListener('change', apply)
    document.documentElement.classList.toggle('compact-mode', compactMode)
    return () => media.removeEventListener('change', apply)
  }, [theme, compactMode])

  useEffect(() => {
    document.documentElement.dataset.userFont = fontFamily
    document.documentElement.dataset.userFontSize = fontSize
  }, [fontFamily, fontSize])

  useEffect(() => {
    const expired = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      setAuthNotice(message || (language === 'fa' ? 'نشست ورود شما منقضی شده است. لطفاً دوباره وارد شوید.' : 'Your session has expired. Please sign in again.'))
      setAccess(undefined)
      setAuthenticated(false)
    }
    window.addEventListener('auth-expired', expired)
    return () => window.removeEventListener('auth-expired', expired)
  }, [language])

  useEffect(() => {
    if (!authenticated || demoMode) return
    setLoading(true)
    api<PurchasePage>('/api/purchases?page=1&pageSize=8').then(x => setPurchases(x.items)).catch(() => setPurchases([])).finally(() => setLoading(false))
  }, [authenticated, demoMode])

  useEffect(() => {
    if (!authenticated || demoMode) return
    api<Access>('/api/user-access').then(value => {
      setAccess(value)
      setAccessPermissions(value.permissions)
      if (value.preferredLanguage === 'fa' || value.preferredLanguage === 'en') applyPreferences({ preferredLanguage: value.preferredLanguage, sessionTimeoutMinutes: value.sessionTimeoutMinutes || 30, theme: value.theme || 'system', compactMode: value.compactMode, fontFamily: value.fontFamily || 'vazirmatn', fontSize: value.fontSize || 'normal' })
    }).catch(() => { logout(); setAuthenticated(false); setAccess(undefined) })
  }, [authenticated, demoMode, applyPreferences])

  useEffect(() => {
    if (!authenticated || demoMode) return
    let timer = 0
    const expire = () => {
      logout(); setAccess(undefined); setAuthenticated(false)
      setAuthNotice(language === 'fa' ? 'به علت پایان زمان نشست و توقف فعالیت، از سیستم خارج شدید.' : 'You were signed out because the inactivity timeout ended.')
    }
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(expire, Math.max(1, sessionTimeoutMinutes) * 60_000) }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    events.forEach(name => window.addEventListener(name, reset, { passive: true }))
    reset()
    return () => { window.clearTimeout(timer); events.forEach(name => window.removeEventListener(name, reset)) }
  }, [authenticated, demoMode, sessionTimeoutMinutes, language])

  useEffect(() => {
    if (!authenticated || demoMode) return
    const poll = () => {
      void apiRequest('/api/presence/heartbeat', { method: 'POST' }).catch(() => undefined)
      void api<MaintenanceNotice | null>('/api/presence/notice').then(setMaintenanceNotice).catch(() => undefined)
    }
    poll(); const timer = window.setInterval(poll, 30_000)
    return () => window.clearInterval(timer)
  }, [authenticated, demoMode])

  useEffect(() => {
    if (!access || demoMode) return
    const allowed = new Set(menu)
    setOpenTabs(current => {
      const next = current.filter(x => allowed.has(x))
      if (!next.length) next.push('dashboard')
      if (!next.includes(active)) setActive(next[0])
      return next
    })
  }, [access, menu, active, demoMode])

  useEffect(() => {
    window.addEventListener('close-active-form', closeActiveByEscape)
    return () => window.removeEventListener('close-active-form', closeActiveByEscape)
  }, [closeActiveByEscape])

  useEffect(() => {
    const implemented = ['persons', 'yarns', 'purchaseOrders', 'commerce', 'dataBackup', 'settings'] as MenuKey[]
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || implemented.includes(active)) return
      event.preventDefault()
      closeActiveByEscape()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [active, closeActiveByEscape])

  const refreshWorkItems = useCallback(() => {
    if (!authenticated) return
    if (demoMode) {
      const demo: WorkItem[] = [{ id: 'demo-commerce', category: 'CommerceOrder', summary: 'پیگیری خرید', title: 'سفارش خرید جدید', description: 'سفارش POR-2026-0001 برای بررسی واحد بازرگانی ارجاع شده است.', severity: 'Warning', target: 'commerce', entityId: 'o1', assignedAtUtc: new Date(Date.now() - 75 * 60_000).toISOString(), slaHours: 12 }]
      setWorkItems(demo); return
    }
    api<WorkItem[]>('/api/work-items').then(items => {
      setWorkItems(items)
    }).catch(() => setWorkItems([]))
  }, [authenticated, demoMode])

  useEffect(() => {
    refreshWorkItems()
    const timer = window.setInterval(refreshWorkItems, 60_000)
    window.addEventListener('purchase-orders-changed', refreshWorkItems)
    return () => { clearInterval(timer); window.removeEventListener('purchase-orders-changed', refreshWorkItems) }
  }, [refreshWorkItems])

  useEffect(() => {
    setWorkDrawerOpen(false)
    setExpandedWorkItem(undefined)
  }, [active])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  async function viewWorkItem(item: WorkItem) {
    setExpandedWorkItem(current => current === item.id ? undefined : item.id)
    if (item.viewedAtUtc || demoMode) {
      if (demoMode && !item.viewedAtUtc) setWorkItems(current => current.map(x => x.id === item.id ? { ...x, viewedAtUtc: new Date().toISOString() } : x))
      return
    }
    try {
      const state = await apiRequest<{ viewedAtUtc: string, actionStartedAtUtc?: string }>(`/api/work-items/${encodeURIComponent(item.id)}/view`, { method: 'POST' })
      setWorkItems(current => current.map(x => x.id === item.id ? { ...x, ...state } : x))
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)) }
  }

  async function actionWorkItem(item: WorkItem) {
    if (actioningWorkItem) return
    setActioningWorkItem(item.id)
    try {
      const state = demoMode ? { viewedAtUtc: new Date().toISOString(), actionStartedAtUtc: new Date().toISOString() }
        : await apiRequest<{ viewedAtUtc: string, actionStartedAtUtc: string, rowVersion?: string }>(item.category === 'CommerceOrder' ? withRowVersion(`/api/work-items/${encodeURIComponent(item.id)}/action`, item.rowVersion) : `/api/work-items/${encodeURIComponent(item.id)}/action`, { method: 'POST' })
      setWorkItems(current => current.map(x => x.id === item.id ? { ...x, ...state } : x))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      if (isConcurrencyConflict(error)) {
        try { setWorkItems(await api<WorkItem[]>('/api/work-items')) }
        catch (reloadError) { window.alert(reloadError instanceof Error ? reloadError.message : String(reloadError)) }
      }
      return
    }
    finally { setActioningWorkItem(undefined) }
    setWorkDrawerOpen(false)
    if (item.target === 'commerce') { setCommerceTarget({ id: item.entityId, request: Date.now() }); openForm('commerce') }
    else if (item.target === 'inventory') openForm('inventory')
  }

  if (checkingDevelopment) return <main className="login-page">{language === 'fa' ? 'در حال ورود…' : 'Signing in…'}</main>
  if (!authenticated) return <Login language={language} setLanguage={setLanguage} notice={authNotice} onSuccess={() => { setAuthNotice(''); setAuthenticated(true) }} />

  return <div className={`app-shell theme-${theme} ${compactMode ? 'compact-ui' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} dir={dir}>
    {maintenanceNotice && <div className="maintenance-overlay" role="alertdialog" aria-modal="true"><section><div className="maintenance-icon">!</div><h2>{language === 'fa' ? 'درخواست خروج از سیستم' : 'Sign-out requested'}</h2><p>{language === 'fa' ? `برای انجام ${maintenanceNotice.operation === 'Backup' ? 'تهیه نسخه پشتیبان' : 'بازخوانی اطلاعات'} از شما خواسته شده از سیستم خارج شوید.` : `Please sign out so ${maintenanceNotice.operation.toLowerCase()} can begin.`}</p><dl><div><dt>{language === 'fa' ? 'درخواست‌کننده' : 'Requested by'}</dt><dd>{maintenanceNotice.requesterName}</dd></div><div><dt>{language === 'fa' ? 'نقش' : 'Role'}</dt><dd>{formatMaintenanceRoles(maintenanceNotice.requesterRoles, language)}</dd></div><div><dt>{language === 'fa' ? 'دلیل' : 'Reason'}</dt><dd>{maintenanceNotice.reason}</dd></div><div><dt>{language === 'fa' ? 'مدت تقریبی' : 'Estimated duration'}</dt><dd>{maintenanceNotice.estimatedMinutes} {language === 'fa' ? 'دقیقه' : 'minutes'}</dd></div></dl><button className="primary" onClick={() => { logout(); setAccess(undefined); setAuthenticated(false); setMaintenanceNotice(null); setAuthNotice(language === 'fa' ? `به درخواست ${maintenanceNotice.requesterName} برای عملیات نگهداری خارج شدید. پس از حدود ${maintenanceNotice.estimatedMinutes} دقیقه دوباره وارد شوید.` : `Signed out for maintenance requested by ${maintenanceNotice.requesterName}. Try again in about ${maintenanceNotice.estimatedMinutes} minutes.`) }}>{language === 'fa' ? 'خروج از سیستم' : 'Sign out now'}</button></section></div>}
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">Y</div><div className="brand-copy"><strong>{t.title}</strong><small>YARN PARTNERSHIP</small></div><button className="collapse-sidebar" title={language === 'fa' ? 'جمع کردن منو' : 'Collapse menu'} onClick={toggleSidebar}>{sidebarCollapsed ? '»' : '«'}</button></div>
      <nav>{menu.map(key => <button key={key} title={String(t[key])} className={active === key ? 'active' : ''} onClick={() => openForm(key)}><span>{icons[key]}</span><b>{t[key]}</b>{key === 'commerce' && commerceOrderCount > 0 && <i className="menu-badge" title={language === 'fa' ? 'سفارش‌های در انتظار خرید نخ' : 'Pending yarn purchases'}>{commerceOrderCount}</i>}</button>)}</nav>
      <div className="user"><div className="avatar">{access?.displayName?.[0] ?? 'A'}</div><div><b>{access?.displayName ?? 'Administrator'}</b><small>{access?.roles?.join('، ') || `${t.systemStatus}: ${t.healthy}`}</small></div><button title="logout" onClick={() => { logout(); setAccess(undefined); setAuthenticated(false) }}>↪</button></div>
    </aside>
    <main>
      <header className="workspace-header">
        <div className="workspace-topbar"><button className="mobile-menu" onClick={toggleSidebar}>☰</button><div className="workspace-title"><strong>{t.title}</strong><span>/</span><b>{t[active]}</b></div><div className="header-actions"><button className="language" onClick={() => setLanguage(language === 'fa' ? 'en' : 'fa')}>{language === 'fa' ? 'EN' : 'فا'}</button><button className={`notification ${workDrawerOpen ? 'active' : ''} ${pendingWorkItemCount ? 'unseen' : ''}`} aria-expanded={workDrawerOpen} title={language === 'fa' ? `کارتابل ${t[active]}` : `${t[active]} inbox`} onClick={() => setWorkDrawerOpen(x => !x)}>♢{currentWorkItems.length > 0 && <i>{currentWorkItems.length}</i>}</button></div></div>
        <div className="form-tabs">{openTabs.map(key => <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}><span>{icons[key]}</span>{t[key]}{openTabs.length > 1 && <i role="button" aria-label="close" onClick={event => { event.stopPropagation(); closeForm(key) }}>×</i>}</button>)}</div>
      </header>
      <button className={`work-drawer-rail ${workDrawerOpen ? 'open' : ''} ${pendingWorkItemCount ? 'unseen' : ''}`} onClick={() => setWorkDrawerOpen(x => !x)}><span>☷</span><b>{language === 'fa' ? 'کارتابل' : 'INBOX'}</b>{currentWorkItems.length > 0 && <i>{currentWorkItems.length}</i>}</button>
      <button aria-label={language === 'fa' ? 'بستن کارتابل' : 'Close inbox'} className={`work-drawer-backdrop ${workDrawerOpen ? 'open' : ''}`} onClick={() => setWorkDrawerOpen(false)} />
      <aside aria-hidden={!workDrawerOpen} className={`work-drawer ${workDrawerOpen ? 'open' : ''} ${pendingWorkItemCount ? 'unseen' : ''}`}><div className="work-drawer-head"><div><h2>{language === 'fa' ? `کارتابل ${t[active]}` : `${t[active]} inbox`}</h2><span>{currentWorkItems.length} {language === 'fa' ? `تسک فعال — ${pendingWorkItemCount} در انتظار اقدام` : `active — ${pendingWorkItemCount} awaiting action`}</span></div><button onClick={() => setWorkDrawerOpen(false)}>×</button></div>
        <div className="work-items">{currentWorkItems.length ? currentWorkItems.map(item => <WorkItemRow key={item.id} item={item} language={language} now={clockNow} expanded={expandedWorkItem === item.id} actioning={actioningWorkItem === item.id} onView={() => void viewWorkItem(item)} onAction={() => void actionWorkItem(item)} />) : <p>{language === 'fa' ? 'برای این فرم تسک فعالی وجود ندارد.' : 'No active task for this form.'}</p>}</div>
        <button className="work-refresh" onClick={refreshWorkItems}>{language === 'fa' ? 'به‌روزرسانی کارتابل' : 'Refresh inbox'}</button>
      </aside>
      <section className={`content tabbed-content ${active === 'persons' || active === 'yarns' || active === 'purchaseOrders' || active === 'commerce' || active === 'users' || active === 'dataBackup' || active === 'settings' ? 'persons-content' : ''}`}>
        {openTabs.map(tab => <div key={tab} className={`form-tab-pane ${active === tab ? 'active' : ''}`} aria-hidden={active !== tab}>
          {tab === 'persons' ? <PersonsPage language={language} demoMode={demoMode} /> : tab === 'yarns' ? <YarnsPage language={language} demoMode={demoMode} /> : tab === 'purchaseOrders' ? <PurchaseOrdersPage language={language} demoMode={demoMode} /> : tab === 'commerce' ? <CommercePage language={language} initialOrderId={commerceTarget?.id} actionRequest={commerceTarget?.request} onChanged={refreshWorkItems} /> : tab === 'users' ? <UsersPage language={language} administrator={access?.roles.includes('Administrator') ?? false} /> : tab === 'dataBackup' ? <DataBackupPage language={language} onRestored={notice => { logout(); setAccess(undefined); setAuthenticated(false); setAuthNotice(notice) }} /> : tab === 'settings' ? <UserSettingsPage language={language} onPreferencesChanged={applyPreferences} onPasswordChanged={() => { logout(); setAccess(undefined); setAuthenticated(false); setAuthNotice(language === 'fa' ? 'رمز عبور تغییر کرد. لطفاً با رمز جدید وارد شوید.' : 'Password changed. Please sign in with your new password.') }} /> : tab === 'dashboard' ? <>
          <div className="metrics">
          <Metric label={t.openReceivables} value={language === 'fa' ? '۲٬۱۸۰٬۰۰۰٬۰۰۰' : '2,180,000,000'} unit={t.irr} trend={language === 'fa' ? '+۸٫۲٪' : '+8.2%'} tone="gold" />
          <Metric label={t.inventoryValue} value={language === 'fa' ? '۴۳٬۶۴۳٫۷' : '43,643.7'} unit={t.kg} trend={t.twoWarehouses} tone="teal" />
          <Metric label={t.checksDue} value={language === 'fa' ? '۱۲' : '12'} unit={t.checkItems} trend={t.dueToday} tone="coral" />
          <Metric label={t.partnerBalance} value={language === 'fa' ? '۴۶۷٬۲۲۹' : '467,229'} unit={t.usd} trend={t.updated} tone="navy" />
        </div>
        <div className="layout-grid">
          <section className="panel purchase-panel"><div className="panel-head"><div><h2>{t.recentPurchases}</h2><p>Commercial invoices & packing lists</p></div><button>{t.allItems} ←</button></div>
            <div className="table-wrap"><table><thead><tr><th>{t.internalNo}</th><th>{t.invoiceNo}</th><th>{t.date}</th><th>{t.netWeight}</th><th>{t.total}</th><th>{t.status}</th></tr></thead><tbody>
              {loading ? <tr><td colSpan={6}>{t.loading}</td></tr> : purchases.length ? purchases.map(row => <tr key={row.id}><td className="mono">{row.internalNumber}</td><td className="mono">{row.externalInvoiceNumber ?? '—'}</td><td className="mono">{formatPersianDate(row.invoiceDate)}</td><td>{fmt(row.totalNetWeight)} kg</td><td>${fmt(row.grandTotal)}</td><td><span className={`status ${row.status.toLowerCase()}`}>{row.status === 'Draft' ? t.draft : t.posted}</span></td></tr>) : <DemoRows t={t} />}
            </tbody></table></div>
          </section>
          <aside className="panel actions"><div className="panel-head"><div><h2>{t.quickActions}</h2><p>Fast keyboard-first workflow</p></div></div>
            <button><span className="action-icon purchase">⇩</span><b>{t.newPurchase}</b><small>Ctrl + P</small></button>
            <button><span className="action-icon sale">↗</span><b>{t.newSale}</b><small>Ctrl + S</small></button>
            <button><span className="action-icon receipt">＋</span><b>{t.receipt}</b><small>F6</small></button>
            <button><span className="action-icon payment">−</span><b>{t.payment}</b><small>F7</small></button>
            <div className="due-card"><div className="ring"><b>{language === 'fa' ? '۷۵٪' : '75%'}</b></div><div><strong>{t.scheduledCollection}</strong><small>{t.thisMonth}</small></div></div>
          </aside>
          </div>
          </> : <section className="panel coming-soon"><span>{icons[tab]}</span><h2>{t[tab]}</h2><p>{language === 'fa' ? 'این فرم در مرحله بعدی پیاده‌سازی می‌شود.' : 'This form will be implemented in the next stage.'}</p></section>}
        </div>)}
      </section>
    </main>
  </div>
}

function WorkItemRow({ item, language, now, expanded, actioning, onView, onAction }: { item: WorkItem, language: Language, now: number, expanded: boolean, actioning: boolean, onView: () => void, onAction: () => void }) {
  const fa = language === 'fa'
  const assigned = new Date(item.assignedAtUtc).getTime()
  const stopped = item.actionStartedAtUtc ? new Date(item.actionStartedAtUtc).getTime() : now
  const elapsed = Math.max(0, stopped - assigned)
  const overdue = elapsed > item.slaHours * 3_600_000
  const time = new Date(item.assignedAtUtc).toLocaleTimeString(fa ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return <article className={`work-item-row ${!item.actionStartedAtUtc ? 'new' : ''} ${item.actionStartedAtUtc ? 'started' : ''} ${item.severity.toLowerCase()}`}>
    <div className="work-item-main">
      <time><b>{formatPersianDate(item.assignedAtUtc)}</b><small>{time}</small></time>
      <strong>{item.summary}</strong>
      <span className={`task-timer ${overdue ? 'overdue' : ''} ${item.actionStartedAtUtc ? 'stopped' : ''}`} title={`${fa ? 'مهلت نقش' : 'Role SLA'}: ${item.slaHours}h`}><b>{formatElapsed(elapsed, fa)}</b><small>{item.actionStartedAtUtc ? (fa ? 'متوقف' : 'Stopped') : (fa ? `مهلت ${item.slaHours} ساعت` : `${item.slaHours}h SLA`)}</small></span>
      <button className="task-view" onClick={onView}>{fa ? 'مشاهده' : 'View'}</button>
      <button className="task-action" disabled={actioning} onClick={onAction}>{actioning ? (fa ? 'در حال انتقال…' : 'Opening…') : item.actionStartedAtUtc ? (fa ? 'ادامه اقدام' : 'Continue') : (fa ? 'اقدام' : 'Act')}</button>
    </div>
    {expanded && <div className="work-item-details"><b>{item.title}</b><p>{item.description}</p><small>{fa ? 'نوع تسک' : 'Task type'}: {item.category}</small></div>}
  </article>
}

function formatElapsed(milliseconds: number, persian: boolean) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return persian ? value.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) : value
}

function Metric({ label, value, unit, trend, tone }: { label: string, value: string, unit: string, trend: string, tone: string }) {
  return <article className={`metric ${tone}`}><div className="metric-icon">◇</div><p>{label}</p><strong>{value}</strong><div><span>{unit}</span><em>{trend}</em></div></article>
}

function DemoRows({ t }: { t: typeof text.fa | typeof text.en }) {
  const rows = [['PUR-2024-003', '2024LCS031', '2024-11-18', '43,643.7', '76,848.54', 'Posted'], ['PUR-2024-002', '2024LCS030', '2024-11-09', '49,746.7', '126,914.77', 'Posted'], ['PUR-2024-001', '2024LCS022', '2024-09-29', '52,035.9', '127,931.03', 'Draft']]
  return <>{rows.map(row => <tr key={row[0]}><td className="mono">{row[0]}</td><td className="mono">{row[1]}</td><td className="mono">{formatPersianDate(row[2])}</td><td>{row[3]} kg</td><td>${row[4]}</td><td><span className={`status ${row[5].toLowerCase()}`}>{row[5] === 'Draft' ? t.draft : t.posted}</span></td></tr>)}</>
}

function Login({ language, setLanguage, notice, onSuccess }: { language: Language, setLanguage: (x: Language) => void, notice?: string, onSuccess: () => void }) {
  const t = text[language], fa = language === 'fa'
  const [mode, setMode] = useState<'login' | 'otp' | 'activate' | 'reset' | 'forgot'>(activationToken ? 'activate' : recoveryToken ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [code, setCode] = useState(''), [challenge, setChallenge] = useState<EmailChallenge>()
  const [showPassword, setShowPassword] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(notice ?? ''), [message, setMessage] = useState(''), [wait, setWait] = useState(0)
  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(timer) }, [wait])
  function authError(e: unknown) {
    const status = e && typeof e === 'object' && 'status' in e ? e.status : 0
    setError(status === 429 ? (fa ? 'کمی صبر کنید و دوباره تلاش کنید.' : 'Please wait and try again.') : status === 503 ? (fa ? 'ارسال ایمیل ورود در دسترس نیست.' : 'Authentication email is unavailable.') : (fa ? 'عملیات ناموفق بود. اطلاعات، اعتبار لینک و سیاست رمز را بررسی کنید.' : 'Operation failed. Check your details, link expiry and password policy.'))
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'login') {
        const result = await login(email, password); setPassword('')
        if ('requiresVerification' in result) { setChallenge(result); setWait(result.resendAfterSeconds); setMode('otp') } else onSuccess()
      } else if (mode === 'otp' && challenge) { await verifyEmail(challenge.challenge, code, email); onSuccess() }
      else if (mode === 'forgot') {
        await authenticationRequest('forgotPassword', { email })
        setMessage(fa ? 'اگر حساب واجد شرایط باشد، راهنما به ایمیل ثبت‌شده ارسال می‌شود.' : 'If the account is eligible, instructions have been sent.')
      } else {
        if (password !== confirmation) { setError(fa ? 'تکرار رمز یکسان نیست.' : 'Passwords do not match.'); return }
        await authenticationRequest(mode === 'activate' ? 'activate' : 'resetPassword', { token: mode === 'activate' ? activationToken : recoveryToken, newPassword: password })
        setPassword(''); setConfirmation(''); setMode('login'); setMessage(fa ? 'رمز ثبت شد. اکنون وارد شوید.' : 'Password saved. Please sign in.')
      }
    } catch (e) { authError(e) } finally { setBusy(false) }
  }
  async function resend() {
    if (!challenge) return
    setBusy(true); setError('')
    try { const result = await authenticationRequest<EmailChallenge>('resend-code', { challenge: challenge.challenge }); setChallenge(result); setCode(''); setWait(result.resendAfterSeconds) }
    catch (e) { authError(e) } finally { setBusy(false) }
  }
  const choosingPassword = mode === 'activate' || mode === 'reset'
  return <main className="login-page" dir={fa ? 'rtl' : 'ltr'}>
    <button className="language login-lang" onClick={() => setLanguage(fa ? 'en' : 'fa')}>{fa ? 'EN' : 'فا'}</button>
    <form onSubmit={submit}>
      <div className="brand-mark large">Y</div><h1>{t.title}</h1>
      <p>{mode === 'otp' ? (fa ? 'کد تأیید به ایمیل ثبت‌شدهٔ شما ارسال شد.' : 'A verification code was sent to your registered email address.') : choosingPassword ? (fa ? 'رمز خود را انتخاب کنید: حداقل ۱۲ نویسه، حروف بزرگ و کوچک، عدد و نماد.' : 'Choose a password: at least 12 characters, upper/lowercase, number and symbol.') : t.loginHint}</p>
      {(mode === 'login' || mode === 'forgot') && <label>{t.email}<input dir="ltr" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label>}
      {(mode === 'login' || choosingPassword) && <label>{t.password}<div className="login-password"><input dir="ltr" autoComplete={choosingPassword ? 'new-password' : 'current-password'} minLength={choosingPassword ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} required /><button type="button" aria-label={fa ? 'نمایش رمز' : 'Show password'} onClick={() => setShowPassword(x => !x)}>👁</button></div></label>}
      {choosingPassword && <label>{fa ? 'تکرار رمز' : 'Confirm password'}<input dir="ltr" autoComplete="new-password" type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required minLength={12} /></label>}
      {mode === 'otp' && <label>{fa ? 'کد تأیید' : 'Verification code'}<input dir="ltr" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required /></label>}
      {error && <div className="error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? (fa ? 'در حال انجام…' : 'Please wait…') : mode === 'otp' ? (fa ? 'تأیید و ورود' : 'Verify & sign in') : choosingPassword ? (fa ? 'ثبت رمز' : 'Save password') : mode === 'forgot' ? (fa ? 'ارسال راهنما' : 'Send instructions') : t.login}</button>
      {mode === 'otp' && <button type="button" disabled={busy || wait > 0} onClick={() => void resend()}>{fa ? 'ارسال مجدد کد' : 'Resend code'}{wait > 0 ? ` (${wait})` : ''}</button>}
      {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>{fa ? 'فراموشی رمز' : 'Forgot password'}</button>}
      {mode !== 'login' && <button type="button" disabled={busy} onClick={() => { setMode('login'); setError(''); setMessage(''); setPassword(''); setCode('') }}>{fa ? 'بازگشت به ورود' : 'Back to sign in'}</button>}
    </form>
  </main>
}

function fmt(value: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) }

function formatMaintenanceRoles(value: string, language: Language) {
  if (!value) return '—'
  if (language === 'en') return value
  const names: Record<string, string> = { Administrator: 'مدیر سیستم', Manager: 'مدیریت', Orders: 'سفارشات', Commerce: 'بازرگانی', WarehouseOperator: 'انباردار', FinanceOperator: 'مالی', Seller: 'فروشنده', Supplier: 'تأمین‌کننده', Partner: 'شریک', Customer: 'مشتری', Other: 'سایر' }
  return value.split(',').map(x => names[x.trim()] ?? x.trim()).join('، ')
}
