import {managedDesignGroups} from './managedDesignVersions'
import {useState, type ReactNode} from 'react'
import type {ManagedLaboratoryForm} from './laboratoryFormDraftState'
import type {DesignLifecycle} from './formDesignLifecycle'

export function ManagedDesignList({forms, states, updatedAt, revisions, activeId, busy, onOpen, onClose, onStateChange, onNewVersion, children}: {
  forms: ManagedLaboratoryForm[]; states: Record<string, {state: DesignLifecycle}>;
  updatedAt: Record<string, string>; revisions: Record<string, number>;
  activeId?: string; busy: boolean;
  onOpen: (id: string) => void; onClose: () => void;
  onStateChange: (id: string, state: DesignLifecycle) => void
  onNewVersion?: (id: string) => void
  children?: ReactNode
}) {
  const [tab, setTab] = useState<DesignLifecycle>('active')
  const [query, setQuery] = useState('')
  const activeForm = forms.find(form => form.id === activeId && (states[form.id]?.state ?? 'active') === 'active')
  const visible = forms.filter(form => form.id !== activeForm?.id && (states[form.id]?.state ?? 'active') === tab && `${form.schema.title.fa} ${form.id}`.includes(query.trim()))
  const groups = managedDesignGroups(visible, updatedAt, activeId)
  const card = (form: ManagedLaboratoryForm) => <article key={form.id} data-design-id={form.id} aria-current={activeId === form.id ? 'true' : undefined} style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--border, #cbd6d3)', borderRadius: 8}}>
      <div><strong>{form.schema.title.fa}</strong>{activeId === form.id && <strong role="status" style={{display:'block',color:'var(--teal, #217c73)'}}>● فرم جاری — در حال کار</strong>}<div><small dir="ltr">{form.id}</small></div>
        <small>نسخهٔ طراحی: {form.designEdition?.number ?? 1} · نسخهٔ ساختار: {form.schema.version} · بازبینی: {revisions[form.id] ?? '—'} · آخرین ویرایش: {updatedAt[form.id] ? new Date(updatedAt[form.id]).toLocaleString('fa-IR') : 'ثبت نشده'}</small>
      </div>
      <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
        {(states[form.id]?.state ?? 'active') === 'active' ? <>
          <button type="button" disabled={busy} onClick={() => onOpen(form.id)}>{activeId === form.id ? 'ادامهٔ طراحی' : 'بازکردن'}</button>
          {activeId === form.id && <button type="button" disabled={busy} onClick={onClose}>بستن فرم</button>}
          {onNewVersion && <button type="button" disabled={busy} onClick={() => onNewVersion(form.id)}>ایجاد نسخهٔ جدید</button>}
          <button type="button" disabled={busy} onClick={() => onStateChange(form.id, 'archived')}>بایگانی</button>
          <button type="button" disabled={busy} onClick={() => onStateChange(form.id, 'removed')}>حذف از فهرست</button>
        </> : <button type="button" disabled={busy} onClick={() => onStateChange(form.id, 'active')}>بازگردانی به فهرست طراحی</button>}
      </div>
    </article>
  return <div dir="rtl">
    {activeForm && card(activeForm)}
    {children}
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
      {(['active', 'archived', 'removed'] as const).map(state => <button key={state} type="button" aria-pressed={tab === state} onClick={() => setTab(state)}>{state === 'active' ? 'فرم‌های طراحی' : state === 'archived' ? 'بایگانی‌شده‌ها' : 'حذف‌شده‌ها (قابل بازیابی)'}</button>)}
    </div>
    {tab!=='active'&&<button type="button" className="managed-design-list-return" onClick={()=>{setTab('active');setQuery('')}}>بستن این بخش و بازگشت به فرم‌های طراحی</button>}
    <label>جست‌وجوی نام یا شناسه<input value={query} onChange={event => setQuery(event.target.value)} /></label>
    {!visible.length && <p>فرمی در این بخش نیست.</p>}
    <div style={{display:'grid',gap:8,marginTop:12}}>{groups.map(group=><section key={group[0].id}>
      {card(group[0])}
      {group.length>1&&<details><summary>نسخه‌های قبلی موجود ({group.length-1}) — محفوظ</summary>{group.slice(1).map(card)}</details>}
    </section>)}</div>
  </div>
}
