import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, apiRequest, isConcurrencyConflict, withRowVersion, authenticationRequest, type EmailChallenge, isAuthenticated, login, logout, setAccessPermissions, tryDevelopmentSession, verifyEmail } from './api'
import { Language, languageNames, loginText, text } from './i18n'
import PersonsPage from './PersonsPage'
import BrandsPage from './BrandsPage'
import FormLaboratoryPage from './FormLaboratoryPage'
import YarnsPage from './YarnsPage'
import PurchaseOrdersPage from './PurchaseOrdersPage'
import CommercePage from './CommercePage'
import UsersPage from './UsersPage'
import UserSettingsPage, { type UserPreferences } from './UserSettingsPage'
import DataBackupPage from './DataBackupPage'
import BusinessContractPage from './BusinessContractPage'
import { formatPersianDate } from './persianDate'
import NavigationSidebar from './NavigationSidebar'
import { icons, type MenuKey } from './navigation'

type Purchase = { id: string, internalNumber: string, externalInvoiceNumber?: string, invoiceDate: string, supplierId: string, totalNetWeight: number, grandTotal: number, status: string }
type PurchasePage = { items: Purchase[], total: number }
type WorkItem = { rowVersion?: string, id: string, category: string, summary: string, title: string, description: string, severity: 'Urgent' | 'Warning' | 'Info', target: string, entityId: string, assignedAtUtc: string, viewedAtUtc?: string, actionStartedAtUtc?: string, slaHours: number }
type MaintenanceNotice = { id: string, requesterName: string, requesterRoles: string, operation: 'Backup' | 'Restore', reason: string, estimatedMinutes: number, createdAtUtc: string, expiresAtUtc: string }
type Access = { id: string, email: string, displayName: string, preferredLanguage: string, sessionTimeoutMinutes: number, theme: UserPreferences['theme'], compactMode: boolean, fontFamily: UserPreferences['fontFamily'], fontSize: UserPreferences['fontSize'], roles: string[], permissions: string[] }

const workspaceStateKey = 'global-trade-workspace-v1'
const workspaceMenuKeys: MenuKey[] = ['dashboard', 'persons', 'brands', 'formLaboratory', 'yarns', 'purchaseOrders', 'commerce', 'purchases', 'inventory', 'sales', 'finance', 'checks', 'partners', 'reports', 'users', 'dataBackup', 'businessContract', 'settings']

function readWorkspaceState(): { active: MenuKey, openTabs: MenuKey[] } {
  try {
    const stored = JSON.parse(sessionStorage.getItem(workspaceStateKey) ?? 'null') as { active?: unknown, openTabs?: unknown } | null
    const openTabs = Array.isArray(stored?.openTabs) ? stored.openTabs.filter((key): key is MenuKey => workspaceMenuKeys.includes(key as MenuKey)) : []
    const tabs = openTabs.length ? openTabs : ['dashboard' as MenuKey]
    const active = typeof stored?.active === 'string' && tabs.includes(stored.active as MenuKey) ? stored.active as MenuKey : tabs[tabs.length - 1]
    return { active, openTabs: tabs }
  } catch { return { active: 'dashboard', openTabs: ['dashboard'] } }
}

const authenticationLink = new URLSearchParams(location.hash.slice(1))
const activationToken = authenticationLink.get('activate')
const recoveryToken = authenticationLink.get('reset')
if (activationToken || recoveryToken) history.replaceState(null, '', location.pathname + location.search)
const isLanguage = (value: string): value is Language => value === 'fa' || value === 'en' || value === 'zh'

export default function App() {
  const demoMode = new URLSearchParams(location.search).get('demo') === '1'
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('language') as Language) || 'fa')
  const [theme, setTheme] = useState<UserPreferences['theme']>(() => (localStorage.getItem('theme') as UserPreferences['theme']) || 'system')
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('compact-mode') === '1')
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(() => Number(localStorage.getItem('session-timeout')) || 30)
  const [fontFamily, setFontFamily] = useState<UserPreferences['fontFamily']>(() => (localStorage.getItem('font-family') as UserPreferences['fontFamily']) || 'vazirmatn')
  const [fontSize, setFontSize] = useState<UserPreferences['fontSize']>(() => (localStorage.getItem('font-size') as UserPreferences['fontSize']) || 'normal')
  const [savedWorkspace] = useState(readWorkspaceState)
  const [active, setActive] = useState<MenuKey>(savedWorkspace.active)
  const [openTabs, setOpenTabs] = useState<MenuKey[]>(savedWorkspace.openTabs)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const [authenticated, setAuthenticated] = useState(!activationToken && !recoveryToken && (isAuthenticated() || demoMode))
  const [authNotice, setAuthNotice] = useState('')
  const [languageNotice, setLanguageNotice] = useState('')
  const [explicitLoginLanguage, setExplicitLoginLanguage] = useState<Language>()
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
  const languageSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const languageChangeSequence = useRef(0)
  const t = text[language]
  const dir = language === 'fa' ? 'rtl' : 'ltr'
  const allMenus = useMemo(() => ['dashboard', 'persons', 'brands', 'formLaboratory', 'yarns', 'purchaseOrders', 'commerce', 'purchases', 'inventory', 'sales', 'finance', 'checks', 'partners', 'reports', 'users', 'dataBackup', 'businessContract', 'settings'] as const, [])
  const menu = useMemo(() => allMenus.filter(key => demoMode || key === 'settings' || (!access ? key === 'dashboard' : access.permissions.includes(key === 'businessContract' ? 'settings.view' : `${key}.view`))), [allMenus, access, demoMode])
  // هر فرم فقط کارتابل فعالیت مرتبط با خودش را نمایش می‌دهد؛ نقش مقصد در API کنترل می‌شود.
  const currentWorkItems = useMemo(() => workItems.filter(item => item.target === active), [workItems, active])
  const pendingWorkItems = currentWorkItems.filter(item => !item.actionStartedAtUtc)
  const pendingWorkItemCount = pendingWorkItems.length
  const commerceOrderCount = workItems.filter(item => item.category === 'CommerceOrder' && !item.actionStartedAtUtc).length

  function openForm(key: MenuKey) {
    if (!menu.includes(key)) return
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
      const finalTabs: MenuKey[] = next.length ? next : [menu[0] ?? 'settings']
      setActive(finalTabs[finalTabs.length - 1])
      return finalTabs
    })
  }, [active, language, menu])

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

  const currentPreferences = useCallback((preferredLanguage: Language): UserPreferences => ({
    preferredLanguage, sessionTimeoutMinutes, theme, compactMode, fontFamily, fontSize
  }), [sessionTimeoutMinutes, theme, compactMode, fontFamily, fontSize])

  const savePreferences = useCallback(async (value: UserPreferences) => {
    const saved = await apiRequest<UserPreferences>('/api/user-settings', { method: 'PUT', body: JSON.stringify(value) })
    applyPreferences(saved)
    return saved
  }, [applyPreferences])

  const changeLanguage = useCallback(async (next: Language) => {
    const sequence = ++languageChangeSequence.current
    const preferences = currentPreferences(next)
    setLanguageNotice('')
    applyPreferences(preferences)
    const request = languageSaveQueue.current.then(() => apiRequest<UserPreferences>('/api/user-settings', { method: 'PUT', body: JSON.stringify(preferences) }))
    languageSaveQueue.current = request.then(() => undefined, () => undefined)
    try {
      const saved = await request
      if (sequence === languageChangeSequence.current) applyPreferences(saved)
    }
    catch {
      if (sequence === languageChangeSequence.current) setLanguageNotice(next === 'fa' ? 'زبان تغییر کرد، اما ذخیرهٔ آن برای ورود بعدی ناموفق بود.' : next === 'zh' ? '语言已更改，但无法保存供下次登录使用。' : 'Language changed, but it could not be saved for your next sign-in.')
    }
  }, [applyPreferences, currentPreferences])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = dir
    localStorage.setItem('language', language)
  }, [language, dir])

  useEffect(() => {
    try { sessionStorage.setItem(workspaceStateKey, JSON.stringify({ active, openTabs })) }
    catch { /* Keep the current workspace usable when browser storage is unavailable. */ }
  }, [active, openTabs])

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
      setAuthNotice(loginText[language].sessionExpired)
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
    if (!authenticated || demoMode || access) return
    let cancelled = false
    void api<Access>('/api/user-access').then(async value => {
      const savedLanguage = isLanguage(value.preferredLanguage) ? value.preferredLanguage : undefined
      const effectiveLanguage = explicitLoginLanguage ?? savedLanguage ?? (isLanguage(language) ? language : 'fa')
      const preferences: UserPreferences = { preferredLanguage: effectiveLanguage, sessionTimeoutMinutes: value.sessionTimeoutMinutes || 30, theme: value.theme || 'system', compactMode: value.compactMode, fontFamily: value.fontFamily || 'vazirmatn', fontSize: value.fontSize || 'normal' }
      applyPreferences(preferences)
      if (explicitLoginLanguage && explicitLoginLanguage !== savedLanguage) {
        try { await apiRequest<UserPreferences>('/api/user-settings', { method: 'PUT', body: JSON.stringify(preferences) }) }
        catch { if (!cancelled) setLanguageNotice(effectiveLanguage === 'fa' ? 'زبان انتخابی اعمال شد، اما ذخیرهٔ آن برای ورود بعدی ناموفق بود.' : effectiveLanguage === 'zh' ? '所选语言已应用，但无法保存供下次登录使用。' : 'Your selected language is active, but it could not be saved for your next sign-in.') }
      }
      if (cancelled) return
      setAccess({ ...value, ...preferences })
      setAccessPermissions(value.permissions)
      setExplicitLoginLanguage(undefined)
    }).catch(() => {
      if (cancelled) return
      logout(); setAuthenticated(false); setAccess(undefined)
    })
    return () => { cancelled = true }
  // Authentication starts one deterministic bootstrap. Language changes after bootstrap use changeLanguage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, demoMode, access, applyPreferences])

  useEffect(() => {
    if (!authenticated || demoMode) return
    let timer = 0
    const expire = () => {
      logout(); setAccess(undefined); setAuthenticated(false)
      setAuthNotice(loginText[language].inactivityExpired)
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
      if (!next.length) next.push(menu[0] ?? 'settings')
      if (!next.includes(active)) setActive(next[0])
      return next
    })
  }, [access, menu, active, demoMode])

  useEffect(() => {
    window.addEventListener('close-active-form', closeActiveByEscape)
    return () => window.removeEventListener('close-active-form', closeActiveByEscape)
  }, [closeActiveByEscape])

  useEffect(() => {
    const implemented = ['persons', 'brands', 'yarns', 'purchaseOrders', 'commerce', 'dataBackup', 'businessContract', 'settings'] as MenuKey[]
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

  if (!authenticated) return <Login language={language} setLanguage={value => { setLanguage(value); setExplicitLoginLanguage(value) }} notice={authNotice} onSuccess={() => { setAuthNotice(''); setAccess(undefined); setAuthenticated(true) }} />
  if (!demoMode && !access) return <main className="app-language-loading" dir={dir}><div className="brand-mark large">G</div><strong>Global Trade</strong><span>{language === 'fa' ? 'در حال آماده‌سازی محیط کار…' : language === 'zh' ? '正在准备工作区…' : 'Preparing your workspace…'}</span></main>

  return <div className={`app-shell theme-${theme} ${compactMode ? 'compact-ui' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} dir={dir}>
    {languageNotice && <div className="language-notice" role="status"><span>{languageNotice}</span><button aria-label={language === 'fa' ? 'بستن' : language === 'zh' ? '关闭' : 'Close'} onClick={() => setLanguageNotice('')}>×</button></div>}
    {maintenanceNotice && <div className="maintenance-overlay" role="alertdialog" aria-modal="true"><section><div className="maintenance-icon">!</div><h2>{language === 'fa' ? 'درخواست خروج از سیستم' : 'Sign-out requested'}</h2><p>{language === 'fa' ? `برای انجام ${maintenanceNotice.operation === 'Backup' ? 'تهیه نسخه پشتیبان' : 'بازخوانی اطلاعات'} از شما خواسته شده از سیستم خارج شوید.` : `Please sign out so ${maintenanceNotice.operation.toLowerCase()} can begin.`}</p><dl><div><dt>{language === 'fa' ? 'درخواست‌کننده' : 'Requested by'}</dt><dd>{maintenanceNotice.requesterName}</dd></div><div><dt>{language === 'fa' ? 'نقش' : 'Role'}</dt><dd>{formatMaintenanceRoles(maintenanceNotice.requesterRoles, language)}</dd></div><div><dt>{language === 'fa' ? 'دلیل' : 'Reason'}</dt><dd>{maintenanceNotice.reason}</dd></div><div><dt>{language === 'fa' ? 'مدت تقریبی' : 'Estimated duration'}</dt><dd>{maintenanceNotice.estimatedMinutes} {language === 'fa' ? 'دقیقه' : 'minutes'}</dd></div></dl><button className="primary" onClick={() => { logout(); setAccess(undefined); setAuthenticated(false); setMaintenanceNotice(null); setAuthNotice(language === 'fa' ? `به درخواست ${maintenanceNotice.requesterName} برای عملیات نگهداری خارج شدید. پس از حدود ${maintenanceNotice.estimatedMinutes} دقیقه دوباره وارد شوید.` : `Signed out for maintenance requested by ${maintenanceNotice.requesterName}. Try again in about ${maintenanceNotice.estimatedMinutes} minutes.`) }}>{language === 'fa' ? 'خروج از سیستم' : 'Sign out now'}</button></section></div>}
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">G</div><div className="brand-copy"><strong>Global Trade</strong><small>YARN PARTNERSHIP</small></div><button className="collapse-sidebar" title={t.collapseMenu} onClick={toggleSidebar}>{sidebarCollapsed ? '»' : '«'}</button></div>
      <NavigationSidebar key={access?.id ?? 'demo'} language={language} userId={access?.id} administrator={Boolean(access?.roles.includes('Administrator') && access.permissions.includes('settings.edit'))} demoMode={demoMode} allowedRoutes={menu} active={active} onOpen={openForm} commerceCount={commerceOrderCount} />
      <div className="user"><div className="avatar">{access?.displayName?.[0] ?? 'A'}</div><div><b>{access?.displayName ?? 'Administrator'}</b><small>{access?.roles?.join('، ') || `${t.systemStatus}: ${t.healthy}`}</small></div><button title={t.signOut} onClick={() => { logout(); setAccess(undefined); setAuthenticated(false) }}>↪</button></div>
    </aside>
    <main>
      <header className="workspace-header">
        <div className="workspace-topbar"><button className="mobile-menu" onClick={toggleSidebar}>☰</button><div className="workspace-title"><strong>Global Trade</strong><span>/</span><b>{t[active]}</b></div><div className="header-actions"><button className="app-refresh" type="button" aria-label={language === 'fa' ? 'تازه‌سازی کل برنامه' : language === 'zh' ? '刷新整个应用' : 'Refresh application'} title={language === 'fa' ? 'تازه‌سازی کل برنامه' : language === 'zh' ? '刷新整个应用' : 'Refresh application'} onClick={() => window.location.reload()}><span aria-hidden="true">⟳</span></button><label className="app-language-selector"><span className="sr-only">{loginText[language].language}</span><select dir="ltr" aria-label={loginText[language].language} value={language} onChange={event => void changeLanguage(event.target.value as Language)}>{(Object.keys(languageNames) as Language[]).map(key => <option key={key} value={key}>{languageNames[key]}</option>)}</select></label><button className={`notification ${workDrawerOpen ? 'active' : ''} ${pendingWorkItemCount ? 'unseen' : ''}`} aria-expanded={workDrawerOpen} title={language === 'fa' ? `کارتابل ${t[active]}` : language === 'zh' ? `${t[active]}工作台` : `${t[active]} inbox`} onClick={() => setWorkDrawerOpen(x => !x)}>♢{currentWorkItems.length > 0 && <i>{currentWorkItems.length}</i>}</button></div></div>
        <div className="form-tabs">{openTabs.filter(key => menu.includes(key)).map(key => <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}><span>{icons[key]}</span>{t[key]}{openTabs.length > 1 && <i role="button" aria-label="close" onClick={event => { event.stopPropagation(); closeForm(key) }}>×</i>}</button>)}</div>
      </header>
      <button className={`work-drawer-rail ${workDrawerOpen ? 'open' : ''} ${pendingWorkItemCount ? 'unseen' : ''}`} onClick={() => setWorkDrawerOpen(x => !x)}><span>☷</span><b>{t.inbox}</b>{currentWorkItems.length > 0 && <i>{currentWorkItems.length}</i>}</button>
      <button aria-label={t.closeInbox} className={`work-drawer-backdrop ${workDrawerOpen ? 'open' : ''}`} onClick={() => setWorkDrawerOpen(false)} />
      <aside aria-hidden={!workDrawerOpen} className={`work-drawer ${workDrawerOpen ? 'open' : ''} ${pendingWorkItemCount ? 'unseen' : ''}`}><div className="work-drawer-head"><div><h2>{language === 'fa' ? `${t.inbox} ${t[active]}` : `${t[active]} ${t.inbox}`}</h2><span>{currentWorkItems.length} {t.activeTasks} — {pendingWorkItemCount} {t.awaitingAction}</span></div><button onClick={() => setWorkDrawerOpen(false)}>×</button></div>
        <div className="work-items">{currentWorkItems.length ? currentWorkItems.map(item => <WorkItemRow key={item.id} item={item} language={language} now={clockNow} expanded={expandedWorkItem === item.id} actioning={actioningWorkItem === item.id} onView={() => void viewWorkItem(item)} onAction={() => void actionWorkItem(item)} />) : <p>{t.noActiveTask}</p>}</div>
        <button className="work-refresh" onClick={refreshWorkItems}>{t.refreshInbox}</button>
      </aside>
      <section className={`content tabbed-content ${active === 'persons' || active === 'brands' || active === 'formLaboratory' || active === 'yarns' || active === 'purchaseOrders' || active === 'commerce' || active === 'users' || active === 'dataBackup' || active === 'businessContract' || active === 'settings' ? 'persons-content' : ''}`}>
        {openTabs.filter(key => menu.includes(key)).map(tab => <div key={tab} className={`form-tab-pane ${active === tab ? 'active' : ''}`} aria-hidden={active !== tab}>
          {tab === 'persons' ? <PersonsPage language={language} demoMode={demoMode} authenticatedUserId={access?.id} /> : tab === 'brands' ? <BrandsPage language={language} demoMode={demoMode} /> : tab === 'formLaboratory' ? <FormLaboratoryPage language={language} authenticatedUserId={access?.id} /> : tab === 'yarns' ? <YarnsPage language={language} demoMode={demoMode} /> : tab === 'purchaseOrders' ? <PurchaseOrdersPage language={language} demoMode={demoMode} /> : tab === 'commerce' ? <CommercePage language={language} initialOrderId={commerceTarget?.id} actionRequest={commerceTarget?.request} onChanged={refreshWorkItems} /> : tab === 'users' ? <UsersPage language={language} administrator={access?.roles.includes('Administrator') ?? false} /> : tab === 'dataBackup' ? <DataBackupPage language={language} onRestored={notice => { logout(); setAccess(undefined); setAuthenticated(false); setAuthNotice(notice) }} /> : tab === 'businessContract' ? <BusinessContractPage language={language} canEdit={demoMode || (access?.permissions.includes('settings.edit') ?? false)} /> : tab === 'settings' ? <UserSettingsPage language={language} onLanguageChanged={changeLanguage} onPreferencesChanged={savePreferences} onPasswordChanged={() => { logout(); setAccess(undefined); setAuthenticated(false); setAuthNotice(language === 'fa' ? 'رمز عبور تغییر کرد. لطفاً با رمز جدید وارد شوید.' : language === 'zh' ? '密码已更改，请使用新密码登录。' : 'Password changed. Please sign in with your new password.') }} /> : tab === 'dashboard' ? <>
          <div className="metrics">
          <Metric label={t.openReceivables} value={language === 'fa' ? '۲٬۱۸۰٬۰۰۰٬۰۰۰' : '2,180,000,000'} unit={t.irr} trend={language === 'fa' ? '+۸٫۲٪' : '+8.2%'} tone="gold" />
          <Metric label={t.inventoryValue} value={language === 'fa' ? '۴۳٬۶۴۳٫۷' : '43,643.7'} unit={t.kg} trend={t.twoWarehouses} tone="teal" />
          <Metric label={t.checksDue} value={language === 'fa' ? '۱۲' : '12'} unit={t.checkItems} trend={t.dueToday} tone="coral" />
          <Metric label={t.partnerBalance} value={language === 'fa' ? '۴۶۷٬۲۲۹' : '467,229'} unit={t.usd} trend={t.updated} tone="navy" />
        </div>
        <div className="layout-grid">
          <section className="panel purchase-panel"><div className="panel-head"><div><h2>{t.recentPurchases}</h2><p>{t.recentPurchasesHint}</p></div><button>{t.allItems} ←</button></div>
            <div className="table-wrap"><table><thead><tr><th>{t.internalNo}</th><th>{t.invoiceNo}</th><th>{t.date}</th><th>{t.netWeight}</th><th>{t.total}</th><th>{t.status}</th></tr></thead><tbody>
              {loading ? <tr><td colSpan={6}>{t.loading}</td></tr> : purchases.length ? purchases.map(row => <tr key={row.id}><td className="mono">{row.internalNumber}</td><td className="mono">{row.externalInvoiceNumber ?? '—'}</td><td className="mono">{formatPersianDate(row.invoiceDate)}</td><td>{fmt(row.totalNetWeight)} kg</td><td>${fmt(row.grandTotal)}</td><td><span className={`status ${row.status.toLowerCase()}`}>{row.status === 'Draft' ? t.draft : t.posted}</span></td></tr>) : <DemoRows t={t} />}
            </tbody></table></div>
          </section>
          <aside className="panel actions"><div className="panel-head"><div><h2>{t.quickActions}</h2><p>{t.quickActionsHint}</p></div></div>
            <button><span className="action-icon purchase">⇩</span><b>{t.newPurchase}</b><small>Ctrl + P</small></button>
            <button><span className="action-icon sale">↗</span><b>{t.newSale}</b><small>Ctrl + S</small></button>
            <button><span className="action-icon receipt">＋</span><b>{t.receipt}</b><small>F6</small></button>
            <button><span className="action-icon payment">−</span><b>{t.payment}</b><small>F7</small></button>
            <div className="due-card"><div className="ring"><b>{language === 'fa' ? '۷۵٪' : '75%'}</b></div><div><strong>{t.scheduledCollection}</strong><small>{t.thisMonth}</small></div></div>
          </aside>
          </div>
          </> : <section className="panel coming-soon"><span>{icons[tab]}</span><h2>{t[tab]}</h2><p>{t.comingSoon}</p></section>}
        </div>)}
      </section>
    </main>
  </div>
}

function WorkItemRow({ item, language, now, expanded, actioning, onView, onAction }: { item: WorkItem, language: Language, now: number, expanded: boolean, actioning: boolean, onView: () => void, onAction: () => void }) {
  const fa = language === 'fa'
  const t = text[language]
  const assigned = new Date(item.assignedAtUtc).getTime()
  const stopped = item.actionStartedAtUtc ? new Date(item.actionStartedAtUtc).getTime() : now
  const elapsed = Math.max(0, stopped - assigned)
  const overdue = elapsed > item.slaHours * 3_600_000
  const time = new Date(item.assignedAtUtc).toLocaleTimeString(fa ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return <article className={`work-item-row ${!item.actionStartedAtUtc ? 'new' : ''} ${item.actionStartedAtUtc ? 'started' : ''} ${item.severity.toLowerCase()}`}>
    <div className="work-item-main">
      <time><b>{formatPersianDate(item.assignedAtUtc)}</b><small>{time}</small></time>
      <strong>{item.summary}</strong>
      <span className={`task-timer ${overdue ? 'overdue' : ''} ${item.actionStartedAtUtc ? 'stopped' : ''}`} title={`${t.roleSla}: ${item.slaHours}h`}><b>{formatElapsed(elapsed, fa)}</b><small>{item.actionStartedAtUtc ? t.stopped : (fa ? `مهلت ${item.slaHours} ساعت` : `${item.slaHours}h SLA`)}</small></span>
      <button className="task-view" onClick={onView}>{t.view}</button>
      <button className="task-action" disabled={actioning} onClick={onAction}>{actioning ? t.opening : item.actionStartedAtUtc ? t.continueAction : t.act}</button>
    </div>
    {expanded && <div className="work-item-details"><b>{item.title}</b><p>{item.description}</p><small>{t.taskType}: {item.category}</small></div>}
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

function DemoRows({ t }: { t: (typeof text)[Language] }) {
  const rows = [['PUR-2024-003', '2024LCS031', '2024-11-18', '43,643.7', '76,848.54', 'Posted'], ['PUR-2024-002', '2024LCS030', '2024-11-09', '49,746.7', '126,914.77', 'Posted'], ['PUR-2024-001', '2024LCS022', '2024-09-29', '52,035.9', '127,931.03', 'Draft']]
  return <>{rows.map(row => <tr key={row[0]}><td className="mono">{row[0]}</td><td className="mono">{row[1]}</td><td className="mono">{formatPersianDate(row[2])}</td><td>{row[3]} kg</td><td>${row[4]}</td><td><span className={`status ${row[5].toLowerCase()}`}>{row[5] === 'Draft' ? t.draft : t.posted}</span></td></tr>)}</>
}

function Login({ language, setLanguage, notice, onSuccess }: { language: Language, setLanguage: (x: Language) => void, notice?: string, onSuccess: () => void }) {
  const t = text[language], authText = loginText[language], fa = language === 'fa'
  const [mode, setMode] = useState<'login' | 'otp' | 'activate' | 'reset' | 'forgot'>(activationToken ? 'activate' : recoveryToken ? 'reset' : 'login')
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@yarntrade.local' : '')
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [code, setCode] = useState(''), [challenge, setChallenge] = useState<EmailChallenge>()
  const [showPassword, setShowPassword] = useState(false), [busy, setBusy] = useState(false), [developmentBusy, setDevelopmentBusy] = useState(false)
  const [error, setError] = useState(notice ?? ''), [message, setMessage] = useState(''), [wait, setWait] = useState(0)
  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(timer) }, [wait])
  function authError(e: unknown) {
    const status = e && typeof e === 'object' && 'status' in e ? e.status : 0
    setError(status === 429 ? authText.rateLimited : status === 503 ? authText.emailUnavailable : status === 401 ? authText.incorrectCredentials : (mode === 'activate' || mode === 'reset') && status === 400 ? authText.passwordPolicyFailed : authText.operationFailed)
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
        setMessage(authText.forgotSent)
      } else {
        if (password !== confirmation) { setError(authText.passwordMismatch); return }
        await authenticationRequest(mode === 'activate' ? 'activate' : 'resetPassword', { token: mode === 'activate' ? activationToken : recoveryToken, newPassword: password })
        setPassword(''); setConfirmation(''); setMode('login'); setMessage(authText.passwordSaved)
      }
    } catch (e) { authError(e) } finally { setBusy(false) }
  }
  async function resend() {
    if (!challenge) return
    setBusy(true); setError('')
    try { const result = await authenticationRequest<EmailChallenge>('resend-code', { challenge: challenge.challenge }); setChallenge(result); setCode(''); setWait(result.resendAfterSeconds) }
    catch (e) { authError(e) } finally { setBusy(false) }
  }
  async function developmentLogin() {
    setDevelopmentBusy(true); setError(''); setMessage('')
    try { if (await tryDevelopmentSession()) onSuccess(); else setError(authText.developmentUnavailable) }
    catch { setError(authText.developmentUnavailable) }
    finally { setDevelopmentBusy(false) }
  }
  const choosingPassword = mode === 'activate' || mode === 'reset'
  return <main className="login-page" dir={fa ? 'rtl' : 'ltr'}>
    <form className="login-card" onSubmit={submit}>
      <div className="login-language" role="group" aria-label={authText.language} dir="ltr">{(['fa', 'en', 'zh'] as Language[]).map(option => <button type="button" key={option} className={language === option ? 'active' : ''} aria-pressed={language === option} onClick={() => setLanguage(option)}>{languageNames[option]}</button>)}</div>
      <header className="login-brand"><div className="brand-mark large">G</div><h1>Global Trade</h1><p>{mode === 'otp' ? authText.otpSent : choosingPassword ? authText.choosePassword : authText.subtitle}</p></header>
      {import.meta.env.DEV && mode === 'login' && <aside className="development-login"><span>{authText.developmentHint}</span><button type="button" disabled={developmentBusy} onClick={() => void developmentLogin()}>{developmentBusy ? authText.working : authText.developmentAccess}</button></aside>}
      <div className="login-fields">
        {(mode === 'login' || mode === 'forgot') && <input dir={fa ? 'rtl' : 'ltr'} aria-label={t.email} autoComplete="username" placeholder={authText.emailPlaceholder} value={email} onChange={e => setEmail(e.target.value)} type="email" required />}
        {(mode === 'login' || choosingPassword) && <div className="login-password"><input dir={fa ? 'rtl' : 'ltr'} aria-label={t.password} autoComplete={choosingPassword ? 'new-password' : 'current-password'} placeholder={authText.passwordPlaceholder} minLength={choosingPassword ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} required /><button className={showPassword ? 'password-visible' : ''} type="button" aria-label={showPassword ? authText.hidePassword : authText.showPassword} onClick={() => setShowPassword(x => !x)}>👁</button></div>}
        {choosingPassword && <input dir={fa ? 'rtl' : 'ltr'} aria-label={authText.confirmPassword} autoComplete="new-password" placeholder={authText.confirmPassword} type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required minLength={12} />}
        {mode === 'otp' && <input className="login-code" dir="ltr" aria-label={authText.verificationCode} autoComplete="one-time-code" placeholder={authText.codePlaceholder} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required />}
      </div>
      {error && <div className="error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? authText.working : mode === 'otp' ? authText.verifySignIn : choosingPassword ? authText.savePassword : mode === 'forgot' ? authText.sendInstructions : t.login}</button>
      {mode === 'otp' && <button type="button" disabled={busy || wait > 0} onClick={() => void resend()}>{authText.resendCode}{wait > 0 ? ` (${wait})` : ''}</button>}
      {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>{authText.forgotPassword}</button>}
      {mode !== 'login' && <button type="button" disabled={busy} onClick={() => { setMode('login'); setError(''); setMessage(''); setPassword(''); setCode('') }}>{authText.backToSignIn}</button>}
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
