import { useEffect, useState } from 'react'
import type { FormSchemaDraft } from './formSchema'
import type { FieldBlueprint } from './formDocumentControls'
import { renameLaboratoryForm } from './formDocumentControls'
import type { ManagedFormFrame } from './laboratoryFormDraftState'
import { FormDocumentDialog, FormDocumentSettings } from './FormDocumentSettings'
import { addFormSection } from './formDocumentStructure'
import { NewFormShapePreview } from './NewFormShapePreview'
import { createProductGroupLaboratorySchema, productGroupLaboratoryFormTitle } from './productGroupLaboratoryForm'

export function NewLaboratoryFormDialog({ template, defaultActions = [], frame, language, blueprints, onSaveBlueprint, onCreate, onClose }: {
  template: FormSchemaDraft; frame: ManagedFormFrame; language: 'fa' | 'en' | 'zh'; blueprints: FieldBlueprint[];
  defaultActions?: FormSchemaDraft['actions'];
  onSaveBlueprint: (blueprint: FieldBlueprint) => boolean;
  onCreate: (schema: FormSchemaDraft, frame: ManagedFormFrame, copyTemplate: boolean, useSchemaLayout: boolean) => Promise<boolean>; onClose: () => void
}) {
  const fa = language === 'fa'
  const withDefaultActions = (draft: FormSchemaDraft): FormSchemaDraft => {
    if (!defaultActions.length) return draft
    let next = draft
    if (!next.sections.some(section => section.kind === 'footer')) next = addFormSection(next, 'footer', 'footer.' + crypto.randomUUID())
    const footer = next.sections.find(section => section.kind === 'footer')!
    const actions = [...next.actions ?? []]
    let changed = next !== draft
    for (const standard of defaultActions) {
      const index = actions.findIndex(action => action.id === standard.id)
      if (index < 0) {
        actions.push({ ...structuredClone(standard), sectionId: footer.id, hidden: false }); changed = true
      } else {
        const current = actions[index]
        const sectionId = next.sections.some(section => section.kind === 'footer' && section.id === current.sectionId) ? current.sectionId : footer.id
        if (current.hidden || current.sectionId !== sectionId || standard.required && !current.required) {
          actions[index] = { ...current, sectionId, hidden: false, required: standard.required || current.required }; changed = true
        }
      }
    }
    const sections = next.sections.map(section => section.kind === 'footer' && section.enabled === false && actions.some(action => action.sectionId === section.id && defaultActions.some(standard => standard.id === action.id)) ? (changed = true, { ...section, enabled: true }) : section)
    return changed ? { ...next, sections, actions } : next
  }
  const blank = (): FormSchemaDraft => {
    let next: FormSchemaDraft = { ...structuredClone(template), id: 'form.new.' + crypto.randomUUID(), title: { fa: '', en: '', zh: '' }, status: 'draft', version: 1, fields: [], sections: [], tables: [], actions: [], resources: {}, uniqueConstraints: [], layout: { direction: 'vertical', gap: 12 } }
    next = addFormSection(next, 'editor', 'editor.' + crypto.randomUUID())
    next = addFormSection(next, 'grid', 'grid.' + crypto.randomUUID())
    next = addFormSection(next, 'footer', 'footer.' + crypto.randomUUID())
    const footerId = next.sections.find(section => section.kind === 'footer')!.id
    next.actions = template.actions?.map(action => ({ ...structuredClone(action), sectionId: footerId })) ?? []
    return next
  }
  const [schema, setSchema] = useState(blank)
  // Also repairs an already-open creation draft after the defaults become available.
  useEffect(() => { setSchema(current => withDefaultActions(current)) }, [defaultActions])
  const [size, setSize] = useState(frame)
  const [starter, setStarter] = useState<'empty' | 'copy' | 'product-group'>('empty')
  const copyTemplate = starter === 'copy'
  const [useSchemaLayout, setUseSchemaLayout] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [layoutSettingsOpen, setLayoutSettingsOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [past, setPast] = useState<FormSchemaDraft[]>([]), [future, setFuture] = useState<FormSchemaDraft[]>([])
  const change = (next: FormSchemaDraft) => { if (next === schema) return; setPast(items => [...items, schema]); setFuture([]); setSchema(withDefaultActions(next)) }
  const create = async () => {
    if (!schema.title[language].trim() || busy) return
    setBusy(true); setError('')
    try { if (!await onCreate(renameLaboratoryForm(withDefaultActions(schema),language,schema.title[language]), size, copyTemplate, useSchemaLayout)) setError(fa ? 'ایجاد فرم کامل نشد؛ اطلاعات این پنجره حفظ شده است.' : 'Creation did not complete; this draft is preserved.') }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <FormDocumentDialog panelClassName={'new-form-builder-dialog' + (!settingsOpen && !layoutSettingsOpen ? ' is-full-preview' : '')} language={language} title={fa ? 'ایجاد فرم جدید از آزمایشگاه' : 'New Laboratory form'} onClose={() => { if (!busy) onClose() }} dirty={past.length > 0 || size !== frame || useSchemaLayout} onSave={() => { void create(); return false }}>
    <div className="new-form-builder-body" data-settings-open={settingsOpen}>
    <div className="new-form-builder-settings" data-open={settingsOpen}>
    {settingsOpen && <div className="new-form-builder-settings-content">
    <label>{fa ? 'شروع از' : 'Start from'}<select disabled={busy} value={starter} onChange={event => {
      const nextStarter = event.target.value as typeof starter
      setStarter(nextStarter)
      change(nextStarter === 'copy'
        ? { ...structuredClone(template), id: schema.id, title: schema.title, status: 'draft' }
        : nextStarter === 'product-group'
          ? createProductGroupLaboratorySchema(template, schema.id)
          : { ...blank(), id: schema.id, title: schema.title })
    }}><option value="empty">{fa ? 'فرم خالی با رفتارهای آزمایشگاه' : 'Empty form with Laboratory behavior'}</option><option value="copy">{fa ? 'کپی فیلدها و ساختار قالب آزمایشگاه' : 'Copy Laboratory structure and fields'}</option><option value="product-group">{productGroupLaboratoryFormTitle}</option></select></label>
    <fieldset disabled={busy} style={{ minWidth: 0, border: 0, padding: 0 }}>
      <FormDocumentSettings language={language} schema={schema} frame={size} onSchemaChange={change} onFrameChange={setSize} independent scaffoldOnly blueprints={blueprints} onSaveBlueprint={onSaveBlueprint}
        onUndo={() => { const previous = past.at(-1); if (previous) { setFuture(items => [schema, ...items]); setPast(items => items.slice(0, -1)); setSchema(previous) } }}
        onRedo={() => { if (future[0]) { setPast(items => [...items, schema]); setSchema(future[0]); setFuture(items => items.slice(1)) } }} canUndo={!!past.length} canRedo={!!future.length}
        onUseGridLayout={() => setUseSchemaLayout(true)} actionVisible={id => !schema.actions?.find(action => action.id === id)?.hidden}
        onActionVisibilityChange={(id, visible) => change({ ...schema, actions: schema.actions?.map(action => action.id === id ? { ...action, hidden: !visible } : action) })}
        onActionLabelChange={() => {}} />
    </fieldset>
    {useSchemaLayout && <p role="status">{fa ? 'چیدمان شبکه‌ای برای فرم جدید انتخاب شد.' : 'Schema grid layout selected for the new form.'}</p>}
    </div>}
    <button type="button" className="new-form-builder-settings-toggle" aria-label={settingsOpen ? (fa ? 'بستن پنل تنظیمات' : 'Hide form settings') : (fa ? 'بازکردن پنل تنظیمات' : 'Show form settings')} title={settingsOpen ? (fa ? 'بستن پنل تنظیمات' : 'Hide form settings') : (fa ? 'بازکردن پنل تنظیمات' : 'Show form settings')} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={settingsOpen ? (fa ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7') : (fa ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7')} /></svg></button>
    </div><NewFormShapePreview schema={schema} language={language} onChange={busy ? undefined : change} layoutSettingsOpen={layoutSettingsOpen} onLayoutSettingsToggle={() => setLayoutSettingsOpen(open => !open)} /></div>
    <footer className="new-form-builder-footer">
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy || !schema.title[language].trim()} onClick={() => void create()}>{busy ? (fa ? 'در حال ایجاد…' : 'Creating…') : (fa ? 'تأیید ساختار و ایجاد فرم' : 'Confirm structure and create form')}</button>
    </footer>
  </FormDocumentDialog>
}
