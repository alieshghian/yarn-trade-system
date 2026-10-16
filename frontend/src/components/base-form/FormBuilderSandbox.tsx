import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Language } from '../../i18n'
import { getFormComponentPresets, getFormComponents, type FormComponentPreset } from './componentRegistry'
import { FormValueList } from './FormValueList'
import {
  addSandboxPhone, addSandboxPanel, canParentSandboxPanel, createManagedForm, loadManagedForms,
  moveSandboxPhone, moveSandboxPanel, removeSandboxPhone, removeSandboxPanel, sandboxBounds,
  sandboxPanelBounds, sandboxPanelChildren, saveManagedForm, supportsSandboxPreset,
  updateSandboxPhone, updateSandboxPanel, type NewSandboxMode, type SandboxPanel, type SandboxPhoneField
} from './formBuilderSandboxState'

export function FormBuilderSandbox({ language, initialPresetId, onClose }: { language: Language; initialPresetId?: string; onClose: () => void }) {
  const word = (fa: string, en: string, zh: string) => language === 'fa' ? fa : language === 'zh' ? zh : en
  const presets = getFormComponentPresets()
  const [loaded] = useState(() => {
    let restored: ReturnType<typeof loadManagedForms> = null
    try { restored = loadManagedForms(window.localStorage) } catch { /* Report unavailable storage. */ }
    let form = restored?.forms.find(item => item.id === restored.activeFormId) ?? createManagedForm(crypto.randomUUID(), word('فرم جدید', 'New form', '新表单'), 'operational')
    const preset = presets.find(item => item.id === initialPresetId)
    const adding = Boolean(preset && supportsSandboxPreset(preset) && form.mode !== 'reporting')
    if (preset && adding) {
      if (!form.sections.length) form = addSandboxPanel(form, crypto.randomUUID(), { fa: 'پنل تلفن', en: 'Phone panel', zh: '电话面板' })
      form = addSandboxPhone(form, preset, crypto.randomUUID())
    }
    return { form, failed: !restored, saved: restored?.forms ?? [], adding }
  })
  const [form, setForm] = useState(loaded.form)
  const [savedForms, setSavedForms] = useState(loaded.saved)
  const [newName, setNewName] = useState('')
  const [newMode, setNewMode] = useState<NewSandboxMode>('operational')
  const [openFormId, setOpenFormId] = useState(loaded.form.id)
  const [selectedId, setSelectedId] = useState<string | null>(loaded.adding ? loaded.form.fields.at(-1)?.id ?? null : null)
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(loaded.form.sections[0]?.id ?? null)
  const [status, setStatus] = useState(loaded.failed ? word('بازیابی محلی ممکن نشد؛ داده قبلی بازنویسی نشده است.', 'Local restore failed; previous data has not been overwritten.', '无法恢复本地数据；原有数据未覆盖。') : '')
  const [dirty, setDirty] = useState(loaded.adding)
  const dialog = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
  const selected = form.fields.find(field => field.id === selectedId)
  const selectedPanel = form.sections.find(panel => panel.id === selectedPanelId)
  const components = getFormComponents().filter(component => component.designerSelectable)
  const modeTitle = (mode: string) => mode === 'operational' ? word('عملیاتی', 'Operational', '操作型') : mode === 'reporting' ? word('گزارشی', 'Reporting', '报表型') : word('ترکیبی', 'Hybrid', '混合型')
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  const changed = () => { setDirty(true); setStatus('') }
  const mayDiscard = () => !dirty || window.confirm(word('تغییرات ذخیره نشده‌اند. بدون ذخیره ادامه می‌دهید؟', 'Discard unsaved changes and continue?', '是否放弃未保存的更改并继续？'))
  const selectPanel = (id: string) => { setSelectedPanelId(id); setSelectedId(null) }
  const add = (preset: FormComponentPreset) => {
    if (!supportsSandboxPreset(preset) || form.mode === 'reporting' || !selectedPanel) return
    const id = crypto.randomUUID()
    setForm(current => addSandboxPhone(current, preset, id, selectedPanel.id)); setSelectedId(id); changed()
  }
  const addPanel = (parentId: string | null) => {
    const id = crypto.randomUUID(), n = form.sections.length + 1
    setForm(current => addSandboxPanel(current, id, { fa: 'پنل ' + n, en: 'Panel ' + n, zh: '面板 ' + n }, parentId))
    selectPanel(id); changed()
  }
  const beginMove = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return
    const field = form.fields.find(item => item.id === id)
    if (!field) return
    event.preventDefault(); setSelectedId(id); setSelectedPanelId(field.sectionId)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...field.settings.position }
  }
  const finishMove = () => { drag.current = null }
  const renderPhone = (field: SandboxPhoneField) => <div key={field.id} data-sandbox-instance={field.id} dir={language === 'fa' ? 'rtl' : 'ltr'} onPointerDownCapture={() => { setSelectedId(field.id); setSelectedPanelId(field.sectionId) }}
    style={{ position: 'absolute', left: field.settings.position.x, top: field.settings.position.y, width: sandboxBounds.fieldWidth, minHeight: sandboxBounds.fieldHeight, boxSizing: 'border-box', padding: 10, border: '2px solid ' + (selectedId === field.id ? 'var(--teal,#168579)' : 'var(--line,#ddd)'), borderRadius: 6, background: 'var(--paper,#fff)' }}>
    <button type="button" aria-label={word('جابه‌جایی نمونه تلفن', 'Move phone instance', '移动电话实例')} style={{ cursor: 'move', touchAction: 'none' }} onPointerDown={event => beginMove(event, field.id)}
      onPointerMove={event => {
        const start = drag.current
        if (!start || start.id !== field.id || start.pointerId !== event.pointerId) return
        setForm(current => moveSandboxPhone(current, field.id, start.x + event.clientX - start.clientX, start.y + event.clientY - start.clientY)); changed()
      }} onPointerUp={finishMove} onPointerCancel={finishMove} onLostPointerCapture={finishMove}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault(); const step = event.shiftKey ? 10 : 1, { x, y } = field.settings.position
        setForm(current => moveSandboxPhone(current, field.id, x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))); changed()
      }}>↔ {field.label[language]}</button>
    <FormValueList field={field.id} label={field.label[language]} fa={language === 'fa'} disabled={false}
      primary={field.settings.demo.primary} numbers={field.settings.demo.numbers} listPrimary={field.settings.demo.listPrimary}
      onSelectValue={value => { setForm(current => updateSandboxPhone(current, field.id, item => ({ ...item, settings: { ...item.settings, demo: { ...item.settings.demo, primary: value } } }))); changed() }}
      onChange={(primary, numbers) => {
        setForm(current => updateSandboxPhone(current, field.id, item => ({ ...item, settings: { ...item.settings, demo: { primary, numbers: [...numbers], listPrimary: primary } } }))); changed(); return true
      }} />
  </div>
  const renderPanel = (panel: SandboxPanel): ReactNode => {
    const fields = form.fields.filter(field => field.sectionId === panel.id)
    const children = sandboxPanelChildren(form, panel.id), bounds = sandboxPanelBounds(form, panel.id)
    return <section className="builder-panel" data-builder-panel={panel.id} key={panel.id} aria-label={panel.title[language]}
      style={{ width: panel.initialSize.width, minHeight: panel.initialSize.height, borderColor: selectedPanelId === panel.id ? 'var(--teal,#168579)' : undefined }}>
      <header><button type="button" aria-pressed={selectedPanelId === panel.id} onClick={() => selectPanel(panel.id)}>{panel.title[language]}</button><small>{panel.kind} · {panel.order + 1}</small></header>
      {fields.length > 0 && <div className="builder-panel-fields" data-form-fields dir="ltr" style={{ width: bounds.width, height: bounds.height }}>{fields.map(renderPhone)}</div>}
      {children.length > 0 && <div className="builder-panel-children" style={{ flexDirection: panel.layout.direction === 'horizontal' ? 'row' : 'column', gap: panel.layout.gap }}>{children.map(renderPanel)}</div>}
      {!fields.length && !children.length && <small>{word('پنل خالی', 'Empty panel', '空面板')}</small>}
    </section>
  }
  const siblings = selectedPanel ? sandboxPanelChildren(form, selectedPanel.parentId) : []
  const selectedPanelIndex = siblings.findIndex(panel => panel.id === selectedPanelId)
  return createPortal(<div data-form-builder-sandbox className="form-builder-manager" dir={language === 'fa' ? 'rtl' : 'ltr'}
    onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key !== 'Tab' || !dialog.current) return
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus() }
    }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={word('مدیریت فرم‌ها', 'Form management', '表单管理')} tabIndex={-1} className="builder-dialog">
      <header className="builder-toolbar">
        <strong>{word('مدیریت فرم‌ها', 'Form management', '表单管理')}</strong>
        <button type="button" onClick={() => {
          let saved = false
          try {
            if (form.title[language].trim()) saved = saveManagedForm(window.localStorage, form)
            if (saved) { setSavedForms(loadManagedForms(window.localStorage)?.forms ?? []); setOpenFormId(form.id); setDirty(false) }
          } catch { /* Display storage failure. */ }
          setStatus(saved ? word('فرم ذخیره شد.', 'Form saved.', '表单已保存。') : word('ذخیره ممکن نشد؛ نام فرم و دسترسی به ذخیره‌سازی را بررسی کنید.', 'Save failed; check the form name and local storage.', '保存失败；请检查表单名称及本地存储。'))
        }}>{word('ذخیره فرم', 'Save form', '保存表单')}</button>
        <button type="button" onClick={() => { if (mayDiscard()) onClose() }}>{word('بستن مدیریت فرم‌ها', 'Close form management', '关闭表单管理')}</button>
        <span role="status">{status || (dirty ? word('تغییرات ذخیره نشده‌اند.', 'Unsaved changes.', '有未保存的更改。') : '')}</span>
      </header>
      <small>{word('فقط ذخیره‌سازی آزمایشی مرورگر؛ مستقل از تنظیمات و داده‌های آزمایشگاه.', 'Experimental browser storage only; independent of laboratory settings and data.', '仅使用浏览器试验存储，与实验室设置及数据独立。')}</small>
      <fieldset className="builder-toolbar"><legend>{word('ساخت و بازکردن فرم', 'Create and open forms', '创建及打开表单')}</legend>
        <label>{word('نام فرم جدید', 'New form name', '新表单名称')}<input aria-label={word('نام فرم جدید', 'New form name', '新表单名称')} maxLength={160} value={newName} onChange={event => setNewName(event.target.value)} /></label>
        <label>{word('نوع فرم جدید', 'New form type', '新表单类型')}<select aria-label={word('نوع فرم جدید', 'New form type', '新表单类型')} value={newMode} onChange={event => setNewMode(event.target.value as NewSandboxMode)}>{(['operational', 'reporting', 'hybrid'] as const).map(mode => <option key={mode} value={mode}>{modeTitle(mode)}</option>)}</select></label>
        <button type="button" disabled={!newName.trim()} onClick={() => {
          if (!mayDiscard()) return
          const next = createManagedForm(crypto.randomUUID(), newName, newMode)
          setForm(next); setSelectedId(null); setSelectedPanelId(null); setNewName(''); changed()
        }}>{word('ایجاد فرم خالی', 'Create empty form', '创建空白表单')}</button>
        <label>{word('فرم‌های ذخیره‌شده', 'Saved forms', '已保存表单')}<select aria-label={word('فرم‌های ذخیره‌شده', 'Saved forms', '已保存表单')} value={savedForms.some(item => item.id === openFormId) ? openFormId : ''} onChange={event => setOpenFormId(event.target.value)}><option value="">{word('انتخاب فرم', 'Select form', '选择表单')}</option>{savedForms.map(item => <option key={item.id} value={item.id}>{item.title[language]} · {modeTitle(item.mode)}</option>)}</select></label>
        <button type="button" disabled={!savedForms.some(item => item.id === openFormId)} onClick={() => {
          if (!mayDiscard()) return
          try {
            const collection = loadManagedForms(window.localStorage), target = collection?.forms.find(item => item.id === openFormId)
            if (!target) { setStatus(word('فرم بازیابی نشد.', 'Could not restore the form.', '无法恢复表单。')); return }
            setSavedForms(collection!.forms); setForm(target); setSelectedId(null); setSelectedPanelId(target.sections[0]?.id ?? null); setDirty(false); setStatus('')
          } catch { setStatus(word('بازیابی ممکن نشد.', 'Restore failed.', '恢复失败。')) }
        }}>{word('بازکردن فرم', 'Open form', '打开表单')}</button>
      </fieldset>
      <section className="builder-toolbar" aria-label={word('مشخصات فرم', 'Form properties', '表单属性')}>
        <label>{word('نام فرم', 'Form name', '表单名称')}<input aria-label={word('نام فرم', 'Form name', '表单名称')} maxLength={160} value={form.title[language]} onChange={event => { const name = event.target.value; setForm(current => ({ ...current, title: { ...current.title, [language]: name } })); changed() }} /></label>
        <span>{modeTitle(form.mode)}</span><code dir="ltr">{form.id}</code>
        <label>{word('چیدمان پنل‌های اصلی', 'Root panel layout', '根面板布局')}<select aria-label={word('چیدمان پنل‌های اصلی', 'Root panel layout', '根面板布局')} value={form.layout?.direction ?? 'vertical'} onChange={event => { const direction = event.target.value as 'horizontal' | 'vertical'; setForm(current => ({ ...current, layout: { direction, gap: 12 } })); changed() }}><option value="vertical">{word('عمودی', 'Vertical', '垂直')}</option><option value="horizontal">{word('افقی ـ کنار هم', 'Horizontal / side by side', '水平并排')}</option></select></label>
        <button type="button" onClick={() => addPanel(null)}>{word('افزودن پنل اصلی', 'Add root panel', '添加根面板')}</button>
        <button type="button" disabled={!selectedPanel} onClick={() => { if (selectedPanel) addPanel(selectedPanel.id) }}>{word('افزودن پنل تو در تو', 'Add nested panel', '添加嵌套面板')}</button>
      </section>
      {selectedPanel && <fieldset className="builder-toolbar"><legend>{word('مشخصات پنل انتخابی', 'Selected panel properties', '所选面板属性')}</legend>
        <label>{word('عنوان پنل', 'Panel title', '面板标题')}<input aria-label={word('عنوان پنل', 'Panel title', '面板标题')} maxLength={160} value={selectedPanel.title[language]} onChange={event => { const title = event.target.value; setForm(current => updateSandboxPanel(current, selectedPanel.id, { title: { ...selectedPanel.title, [language]: title } })); changed() }} /></label>
        <label>{word('نوع بخش', 'Section type', '分区类型')}<select aria-label={word('نوع بخش', 'Section type', '分区类型')} value={selectedPanel.kind} onChange={event => { const kind = event.target.value as SandboxPanel['kind']; setForm(current => updateSandboxPanel(current, selectedPanel.id, { kind })); changed() }}><option value="editor">{word('ورودی', 'Editor', '编辑区')}</option><option value="grid">{word('جدول', 'Grid', '表格区')}</option><option value="footer">{word('پایین فرم', 'Footer', '页脚区')}</option></select></label>
        <label>{word('چیدمان داخل پنل', 'Panel child layout', '子面板布局')}<select aria-label={word('چیدمان داخل پنل', 'Panel child layout', '子面板布局')} value={selectedPanel.layout.direction} onChange={event => { const direction = event.target.value as 'horizontal' | 'vertical'; setForm(current => updateSandboxPanel(current, selectedPanel.id, { layout: { direction, gap: 12 } })); changed() }}><option value="vertical">{word('عمودی', 'Vertical', '垂直')}</option><option value="horizontal">{word('افقی ـ کنار هم', 'Horizontal / side by side', '水平并排')}</option></select></label>
        <label>{word('والد پنل', 'Panel parent', '父面板')}<select aria-label={word('والد پنل', 'Panel parent', '父面板')} value={selectedPanel.parentId ?? ''} onChange={event => {
          const parent = event.target.value || null
          setForm(current => moveSandboxPanel(current, selectedPanel.id, parent)); changed()
        }}><option value="">{word('بوم اصلی', 'Root canvas', '根画布')}</option>{form.sections.filter(panel => canParentSandboxPanel(form, selectedPanel.id, panel.id)).map(panel => <option key={panel.id} value={panel.id}>{panel.title[language]}</option>)}</select></label>
        {(['width', 'height'] as const).map(dimension => <label key={dimension}>{dimension === 'width' ? word('عرض اولیه', 'Initial width', '初始宽度') : word('ارتفاع اولیه', 'Initial height', '初始高度')}<input type="number" aria-label={dimension === 'width' ? word('عرض اولیه', 'Initial width', '初始宽度') : word('ارتفاع اولیه', 'Initial height', '初始高度')} min={dimension === 'width' ? 360 : 200} max={dimension === 'width' ? 2400 : 1800} value={selectedPanel.initialSize[dimension]} onChange={event => {
          const size = Math.max(dimension === 'width' ? 360 : 200, Math.min(dimension === 'width' ? 2400 : 1800, Number(event.target.value) || 0))
          setForm(current => updateSandboxPanel(current, selectedPanel.id, { initialSize: { ...selectedPanel.initialSize, [dimension]: size } })); changed()
        }} /></label>)}
        <button type="button" disabled={selectedPanelIndex <= 0} onClick={() => { setForm(current => moveSandboxPanel(current, selectedPanel.id, selectedPanel.parentId, selectedPanelIndex - 1)); changed() }}>{word('انتقال به قبل', 'Move earlier', '前移')}</button>
        <button type="button" disabled={selectedPanelIndex === siblings.length - 1} onClick={() => { setForm(current => moveSandboxPanel(current, selectedPanel.id, selectedPanel.parentId, selectedPanelIndex + 1)); changed() }}>{word('انتقال به بعد', 'Move later', '后移')}</button>
        <button type="button" onClick={() => { setForm(current => removeSandboxPanel(current, selectedPanel.id)); setSelectedPanelId(null); setSelectedId(null); changed() }}>{word('حذف پنل و محتویات', 'Delete panel and contents', '删除面板及内容')}</button>
        <code dir="ltr">{selectedPanel.id}</code>
      </fieldset>}
      <details open className="builder-library"><summary>{word('کتابخانه کامپوننت‌ها', 'Component library', '组件库')}</summary>
        <small>{selectedPanel ? word('تلفن به پنل انتخابی افزوده می‌شود.', 'Phone is added to the selected panel.', '电话将添加到所选面板。') : word('برای افزودن تلفن، یک پنل را انتخاب کنید.', 'Select a panel to add Phone.', '请选择一个面板以添加电话。')}</small>
        <section className="builder-toolbar" aria-label={word('کتابخانه فرم آزمایشی', 'Sandbox component library', '试验表单组件库')}>
          {components.map(component => <div key={component.id} className="builder-library-entry"><div>{component.title[language]}</div>
            {presets.filter(preset => preset.componentId === component.id).length
              ? presets.filter(preset => preset.componentId === component.id).map(preset => <button key={preset.id} type="button" disabled={!supportsSandboxPreset(preset) || !selectedPanel || form.mode === 'reporting'} onClick={() => add(preset)}>{word('افزودن', 'Add', '添加')} {preset.title[language]}</button>)
              : <button type="button" disabled>{word('Adapter آماده نیست', 'Adapter not ready', '适配器尚未就绪')}</button>}
          </div>)}
        </section>
      </details>
      {selected && <section aria-label={word('مشخصات نمونه انتخابی', 'Selected instance properties', '所选实例属性')} className="builder-toolbar">
        <label>{word('برچسب نمونه', 'Instance label', '实例标签')}<input aria-label={word('برچسب نمونه', 'Instance label', '实例标签')} value={selected.label[language]} maxLength={160} onChange={event => {
          const value = event.target.value
          setForm(current => updateSandboxPhone(current, selected.id, field => ({ ...field, label: { ...field.label, [language]: value } }))); changed()
        }} /></label>
        {(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" aria-label={word('موقعیت ' + axis.toUpperCase(), axis.toUpperCase() + ' position', axis.toUpperCase() + ' 位置')} min={0} max={sandboxPanelBounds(form, selected.sectionId)[axis === 'x' ? 'width' : 'height'] - (axis === 'x' ? 320 : 120)} value={selected.settings.position[axis]} onChange={event => {
          const next = Number(event.target.value), position = selected.settings.position
          setForm(current => moveSandboxPhone(current, selected.id, axis === 'x' ? next : position.x, axis === 'y' ? next : position.y)); changed()
        }} /></label>)}
        <button type="button" onClick={() => { setForm(current => removeSandboxPhone(current, selected.id)); setSelectedId(null); changed() }}>{word('حذف نمونه', 'Delete instance', '删除实例')}</button><code dir="ltr">{selected.id}</code>
      </section>}
      <div className="builder-canvas" aria-label={word('بوم فرم آزمایشی', 'Sandbox canvas', '试验画布')} style={{ flexDirection: form.layout?.direction === 'horizontal' ? 'row' : 'column' }}>
        {!form.sections.length && <p>{word('بوم خالی است؛ یک پنل اضافه کنید.', 'Empty canvas; add a panel.', '画布为空，请添加面板。')}</p>}
        {sandboxPanelChildren(form, null).map(renderPanel)}
      </div>
    </div>
  </div>, document.body)
}
