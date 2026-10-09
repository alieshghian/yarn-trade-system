import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, apiRequest, isConcurrencyConflict, withRowVersion } from './api'
import { text, type Language } from './i18n'
import { defaultNavigation, defaultPreferences, icons, moveNavigation, orderedChildren, type DropPlacement, type MenuKey, type NavigationNode, type NavigationPreferences } from './navigation'

type Layout = { nodes: NavigationNode[], preferences: NavigationPreferences, rowVersion: string }
type GlobalLayout = { nodes: NavigationNode[], defaults: NavigationNode[], routes: { id: MenuKey, icon: MenuKey }[], rowVersion: string, recoveryRequired?: boolean }
type Props = { language: Language, userId?: string, administrator: boolean, demoMode: boolean, allowedRoutes: readonly MenuKey[], active: MenuKey, onOpen: (route: MenuKey) => void, commerceCount: number }

export default function NavigationSidebar({ language, administrator, demoMode, allowedRoutes, active, onOpen, commerceCount }: Props) {
  const fa = language === 'fa', t = text[language]
  const [nodes, setNodes] = useState<NavigationNode[]>([])
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [editor, setEditor] = useState<'personal' | 'global' | null>(null)
  const [global, setGlobal] = useState<GlobalLayout>()
  const [selectedId, setSelectedId] = useState('')
  const [dropTarget, setDropTarget] = useState<{ id: string, placement: DropPlacement } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const version = useRef(''), alive = useRef(true), queue = useRef(Promise.resolve())
  const drag = useRef<{ kind: 'node' | 'pin', id: string } | null>(null)
  const title = (node: NavigationNode) => node.label || (node.routeId ? String(t[node.routeId]) : '')

  async function load() {
    try {
      const value = demoMode ? { nodes: defaultNavigation(), preferences: defaultPreferences(), rowVersion: '' } : await api<Layout>('/api/navigation')
      if (!alive.current) return
      setNodes(value.nodes); setPreferences(value.preferences); version.current = value.rowVersion; setReady(true)
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!editor) return
    const previous = document.activeElement as HTMLElement | null
    document.querySelector<HTMLElement>('.navigation-editor header button')?.focus()
    const close = (e: KeyboardEvent) => {
      // The modal owns keyboard input; background forms keep their shortcuts when it is closed.
      e.stopImmediatePropagation()
      if (e.key === 'Escape') { e.preventDefault(); setEditor(null); return }
      if (e.key === 'F3') { e.preventDefault(); return }
      if (e.key === 'Tab') {
        const controls = [...document.querySelectorAll<HTMLElement>('.navigation-editor button:not(:disabled),.navigation-editor input:not(:disabled),.navigation-editor select:not(:disabled)')].filter(x => x.getClientRects().length)
        const first = controls[0], last = controls.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', close, true)
    return () => { window.removeEventListener('keydown', close, true); if (previous?.isConnected) previous.focus() }
  }, [editor])

  function persist(next: NavigationPreferences) {
    setPreferences(next); setError('')
    if (demoMode) return
    queue.current = queue.current.then(async () => {
      if (!alive.current) return
      setSaving(true)
      try {
        const result = await apiRequest<{ rowVersion: string }>(withRowVersion('/api/navigation/preferences', version.current), { method: 'PUT', body: JSON.stringify(next) })
        if (alive.current) version.current = result.rowVersion
      } catch (e) {
        if (!alive.current) return
        if (isConcurrencyConflict(e)) await load()
        setError(e instanceof Error ? e.message : String(e))
      } finally { if (alive.current) setSaving(false) }
    })
  }
  function toggle(key: 'hidden' | 'collapsed', id: string) {
    persist({ ...preferences, [key]: preferences[key].includes(id) ? preferences[key].filter(x => x !== id) : [...preferences[key], id] })
  }
  function pin(route: MenuKey) { persist({ ...preferences, pinned: preferences.pinned.includes(route) ? preferences.pinned.filter(x => x !== route) : [...preferences.pinned, route] }) }
  const permitted = nodes.filter(x => !x.routeId || allowedRoutes.includes(x.routeId))
  const pinned = preferences.pinned.filter(route => allowedRoutes.includes(route) && permitted.some(n => n.routeId === route))

  function start(e: React.DragEvent, kind: 'node' | 'pin', id: string) { drag.current = { kind, id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }
  function drop(e: React.DragEvent, targetId: string, admin = false, explicitPlacement?: DropPlacement) {
    e.preventDefault(); e.stopPropagation()
    const source = drag.current; drag.current = null
    if (!source || source.id === targetId) return
    try {
      if (source.kind === 'pin') {
        const next = pinned.filter(x => x !== source.id); next.splice(next.indexOf(targetId as MenuKey), 0, source.id as MenuKey)
        persist({ ...preferences, pinned: next }); return
      }
      if (admin && global) {
        const target = global.nodes.find(x => x.id === targetId)
        const placement = explicitPlacement ?? 'inside'
        setGlobal({ ...global, nodes: moveNavigation(global.nodes, source.id, targetId, placement) }); setDropTarget(null); return
      }
      const from = permitted.find(x => x.id === source.id), to = permitted.find(x => x.id === targetId)
      if (!from || !to || from.parentId !== to.parentId) throw Error(fa ? 'فقط هم‌سطح‌ها در چیدمان شخصی جابه‌جا می‌شوند.' : 'Personal reordering is limited to siblings.')
      const order = [...preferences.order, ...permitted.map(x => x.id)].filter((x, i, all) => all.indexOf(x) === i && x !== source.id)
      order.splice(order.indexOf(targetId), 0, source.id); persist({ ...preferences, order })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  function tree(parentId: string | null, depth = 0): React.ReactNode {
    return orderedChildren(permitted, parentId, preferences.order).filter(n => !preferences.hidden.includes(n.id)).map(node => <div className="navigation-node" key={node.id} data-nav-id={node.id}>
      <button type="button" draggable onDragStart={e => start(e, 'node', node.id)} onDragEnd={() => { drag.current = null }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, node.id)}
        title={title(node)} className={node.routeId === active ? 'active' : ''} aria-expanded={node.routeId ? undefined : !preferences.collapsed.includes(node.id)}
        style={{ paddingInlineStart: `${13 + depth * 12}px` }} onClick={() => node.routeId ? onOpen(node.routeId) : toggle('collapsed', node.id)}>
        <span>{icons[node.icon]}</span><b>{title(node)}</b>{!node.routeId && <i className="navigation-chevron">{preferences.collapsed.includes(node.id) ? '‹' : '⌄'}</i>}
        {node.routeId === 'commerce' && commerceCount > 0 && <i className="menu-badge">{commerceCount}</i>}
      </button>{!node.routeId && !preferences.collapsed.includes(node.id) && tree(node.id, depth + 1)}
    </div>)
  }
  async function openGlobal() {
    setError('')
    try { const value = await api<GlobalLayout>('/api/navigation/admin'); if (alive.current) { setGlobal(value); setSelectedId(''); setEditor('global'); if (value.recoveryRequired) setError(fa ? 'ساختار ذخیره‌شده نامعتبر است؛ پیش‌فرض برای بررسی و ذخیرهٔ مجدد نمایش داده شده است.' : 'Stored navigation is invalid; review and save the displayed defaults to recover.') } }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  async function saveGlobal() {
    if (!global || saving) return
    setSaving(true); setError('')
    try {
      const result = await apiRequest<{ rowVersion: string }>(withRowVersion('/api/navigation/admin', global.rowVersion), { method: 'PUT', body: JSON.stringify({ nodes: global.nodes }) })
      setGlobal({ ...global, rowVersion: result.rowVersion }); await queue.current; await load(); setEditor(null)
    } catch (e) { if (isConcurrencyConflict(e)) await openGlobal(); setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }
  const selected = global?.nodes.find(x => x.id === selectedId)
  function changeSelected(changes: Partial<NavigationNode>) {
    if (!global || !selected) return
    setGlobal({ ...global, nodes: global.nodes.map(x => x.id === selected.id ? { ...x, ...changes } : x) })
  }
  function moveParent(parentId: string | null) {
    if (!global || !selected) return
    try { setGlobal({ ...global, nodes: moveNavigation(global.nodes, selected.id, parentId, 'inside') }); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  function editorTree(list: NavigationNode[], parent: string | null, depth = 0): React.ReactNode {
    return orderedChildren(list, parent, editor === 'personal' ? preferences.order : []).map(n => <div key={n.id}>
      <div className={`navigation-editor-row ${selectedId === n.id ? 'selected' : ''} ${dropTarget?.id === n.id && dropTarget.placement === 'inside' ? 'drop-inside' : ''}`} style={{ marginInlineStart: depth * 16 }} data-editor-nav-id={n.id}
        onDragOver={e => { if (editor !== 'global' || !drag.current || drag.current.id === n.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const rect = e.currentTarget.getBoundingClientRect(), y = e.clientY - rect.top, edge = Math.min(9, rect.height * .22); const next: DropPlacement = y < edge ? 'before' : y > rect.height - edge ? 'after' : global?.nodes.find(x => x.id === n.id)?.routeId ? 'after' : 'inside'; setDropTarget({ id: n.id, placement: next }) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(current => current?.id === n.id ? null : current) }}
        onDrop={e => drop(e, n.id, editor === 'global', dropTarget?.id === n.id ? dropTarget.placement : undefined)}>
        <span className="navigation-drag" draggable onDragStart={e => start(e, 'node', n.id)} onDragEnd={() => { drag.current = null }} title={fa ? 'کشیدن برای جابه‌جایی' : 'Drag to reorder'}>☷</span>
        {editor === 'global' ? <button onClick={() => setSelectedId(n.id)}>{icons[n.icon]} {title(n)}{!n.enabled && (fa ? ' (غیرفعال)' : ' (disabled)')}</button> : <>
          <label><input type="checkbox" checked={!preferences.hidden.includes(n.id)} onChange={() => toggle('hidden', n.id)} />{icons[n.icon]} {title(n)}</label>
          {n.routeId && <button aria-label={fa ? 'سنجاق دسترسی سریع' : 'Pin quick access'} aria-pressed={pinned.includes(n.routeId)} onClick={() => pin(n.routeId!)}>{pinned.includes(n.routeId) ? '✓' : '+'}</button>}
        </>}
      </div>{editorTree(list, n.id, depth + 1)}
    </div>)
  }
  return <>
    <div className="navigation-quick" aria-label={fa ? 'دسترسی سریع' : 'Quick Access'}>{pinned.map(route => <button key={route} draggable data-quick-route={route} title={String(t[route])} onClick={() => onOpen(route)} onDragStart={e => start(e, 'pin', route)} onDragEnd={() => { drag.current = null }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, route)}>{icons[permitted.find(n => n.routeId === route)?.icon ?? route]}</button>)}<button aria-label={fa ? 'چیدمان شخصی و دسترسی سریع' : 'Personal layout and Quick Access'} title={fa ? 'چیدمان شخصی و دسترسی سریع' : 'Personal layout and Quick Access'} disabled={!ready} onClick={() => { setError(''); setEditor('personal') }}>+</button></div>
    <nav aria-label={fa ? 'منوی اصلی' : 'Main navigation'}>{ready && tree(null)}</nav>
    <div className="navigation-tools">{administrator && !demoMode && <button aria-label={fa ? 'مدیریت منو' : 'Manage menus'} title={fa ? 'مدیریت منو' : 'Manage menus'} onClick={() => void openGlobal()}>☷</button>}{saving && <small>{fa ? 'در حال ذخیره…' : 'Saving…'}</small>}</div>
    {error && !editor && <div className="navigation-error" role="alert">{error}<button onClick={() => void load()}>{fa ? 'تلاش مجدد' : 'Retry'}</button></div>}
    {editor && createPortal(<div className="navigation-backdrop" onClick={() => setEditor(null)}><section role="dialog" aria-modal="true" aria-label={editor === 'global' ? (fa ? 'مدیریت منو' : 'Manage menus') : (fa ? 'چیدمان شخصی' : 'Personal layout')} className="navigation-editor panel" dir={fa ? 'rtl' : 'ltr'} data-form-scope onClick={e => e.stopPropagation()}>
      <header><h2>{editor === 'global' ? (fa ? 'مدیریت منو' : 'Manage menus') : (fa ? 'چیدمان شخصی و دسترسی سریع' : 'Personal layout and Quick Access')}</h2><button aria-label={fa ? 'بستن' : 'Close'} onClick={() => setEditor(null)}>×</button></header>
      {error && <p role="alert" className="error-message">{error}</p>}
      {editor === 'global' && global && <div className="navigation-admin-actions"><button onClick={() => { const node: NavigationNode = { id: crypto.randomUUID(), parentId: selected && !selected.routeId ? selected.id : null, routeId: null, label: fa ? 'گروه جدید' : 'New group', icon: 'settings', enabled: true }; setGlobal({ ...global, nodes: [...global.nodes, node] }); setSelectedId(node.id) }}>{fa ? '+ منو / زیرمنو' : '+ Menu / submenu'}</button><small>{fa ? 'برای گروه‌بندی، مورد را روی مرکز گروه رها کنید؛ برای مرتب‌سازی، نزدیک لبهٔ بالا یا پایین رها کنید.' : 'To group, drop on a group center; to reorder, drop near a row’s top or bottom edge.'}</small></div>}
      <div className={`navigation-editor-body ${editor === 'global' ? 'admin' : ''}`}><div className="navigation-editor-tree">{editorTree(editor === 'global' ? global?.nodes ?? [] : permitted, null)}</div>
        {editor === 'global' && selected && global && <div className="navigation-node-fields"><label>{fa ? 'عنوان' : 'Label'}<input maxLength={100} value={selected.label} placeholder={selected.routeId ? String(t[selected.routeId]) : ''} onChange={e => changeSelected({ label: e.target.value })} /></label>
          <label>{fa ? 'مسیر موجود' : 'Existing route'}<select value={selected.routeId ?? ''} onChange={e => changeSelected({ routeId: e.target.value as MenuKey || null })}><option value="">{fa ? 'گروه' : 'Group'}</option>{global.routes.map(r => <option key={r.id} value={r.id}>{t[r.id]}</option>)}</select></label>
          <label>{fa ? 'والد' : 'Parent'}<select value={selected.parentId ?? ''} onChange={e => moveParent(e.target.value || null)}><option value="">{fa ? 'ریشه' : 'Root'}</option>{global.nodes.filter(n => !n.routeId && n.id !== selected.id).map(n => <option value={n.id} key={n.id}>{title(n)}</option>)}</select></label>
          <label>{fa ? 'آیکون موجود' : 'Existing icon'}<select value={selected.icon} onChange={e => changeSelected({ icon: e.target.value as MenuKey })}>{Object.entries(icons).map(([id, icon]) => <option value={id} key={id}>{icon} {t[id as MenuKey]}</option>)}</select></label>
          <label><input type="checkbox" checked={selected.enabled} onChange={e => changeSelected({ enabled: e.target.checked })} />{fa ? 'فعال' : 'Enabled'}</label>
        </div>}
      </div>
      <footer>{editor === 'global' ? <><button disabled={saving} onClick={() => void saveGlobal()}>{fa ? 'ذخیرهٔ ساختار سراسری' : 'Save global structure'}</button><button disabled={saving} onClick={() => { if (global) { setGlobal({ ...global, nodes: global.defaults }); setSelectedId(''); setError('') } }}>{fa ? 'ساختار پیش‌فرض' : 'Default structure'}</button></> : <><small>{saving ? (fa ? 'در حال ذخیره…' : 'Saving…') : (fa ? 'تغییرات شخصی خودکار ذخیره می‌شوند.' : 'Personal changes save automatically.')}</small><button disabled={saving} onClick={() => persist(defaultPreferences())}>{fa ? 'چیدمان پیش‌فرض من' : 'My default layout'}</button></>}
        <button onClick={() => setEditor(null)}>{fa ? 'بستن' : 'Close'}</button>
      </footer>
    </section></div>, document.body)}
  </>
}
