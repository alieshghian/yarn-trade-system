import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Field, Shortcut } from './DefinitionControls'
import { BaseFormGridBoundary, type GridColumn } from './components/base-form/BaseFormGridBoundary'
import { BaseFormShell } from './components/base-form/BaseFormShell'
import { FormLaboratoryDesignerPanel } from './components/base-form/FormLaboratoryDesignerPanel'
import { createSyntheticPersons, laboratoryDatasetSizes, type SyntheticPerson } from './components/base-form/syntheticPersons'
import { createDesignerHistory, designerHistoryReducer, designerStyleForField, loadDesignerDraft, resetDesignerFields, saveDesignerDraft, setDesignerProperty, type DesignerDraft, type DesignerProperty, type DesignerValue } from './components/base-form/designer'
import type { BaseFormDefinition } from './components/base-form/types'
import type { Language } from './i18n'

const laboratoryDefinition: BaseFormDefinition = {
  id: 'form-laboratory.persons-synthetic',
  sections: [{ id: 'laboratory.editor', kind: 'editor' }, { id: 'laboratory.grid', kind: 'grid' }, { id: 'laboratory.footer', kind: 'footer' }],
  fields: [
    { id: 'personCode', sectionId: 'laboratory.editor', minTracks: 2, span: 2 }, { id: 'titleId', sectionId: 'laboratory.editor', minTracks: 3, span: 3 },
    { id: 'firstName', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'lastName', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'jobId', sectionId: 'laboratory.editor', minTracks: 5, span: 5 },
    { id: 'nationalityId', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'phone', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'mobile', sectionId: 'laboratory.editor', minTracks: 5, span: 5 },
    { id: 'address', sectionId: 'laboratory.editor', minTracks: 10, span: 10 }, { id: 'notes', sectionId: 'laboratory.editor', minTracks: 10, span: 10 },
    { id: 'errorExample', sectionId: 'laboratory.editor', minTracks: 10, span: 10 }, { id: 'disabledExample', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }
  ]
}

const columns: GridColumn<SyntheticPerson>[] = [
  { id: 'personCode', label: 'کد', width: 120, value: row => row.personCode }, { id: 'displayName', label: 'نام', width: 210, value: row => row.displayName },
  { id: 'job', label: 'نقش', width: 130, value: row => row.job }, { id: 'nationality', label: 'ملیت', width: 110, value: row => row.nationality },
  { id: 'mobile', label: 'موبایل', width: 145, value: row => row.mobile }, { id: 'address', label: 'نشانی', width: 240, value: row => row.address }
]

const labels: Record<string, Record<Language, string>> = {
  personCode: { fa: 'کد شخص', en: 'Person code', zh: '人员代码' }, titleId: { fa: 'عنوان', en: 'Title', zh: '称谓' }, firstName: { fa: 'نام', en: 'First name', zh: '名字' },
  lastName: { fa: 'نام خانوادگی', en: 'Last name', zh: '姓氏' }, jobId: { fa: 'نقش', en: 'Job', zh: '角色' }, nationalityId: { fa: 'ملیت', en: 'Nationality', zh: '国籍' },
  phone: { fa: 'تلفن', en: 'Phone', zh: '电话' }, mobile: { fa: 'موبایل', en: 'Mobile', zh: '手机' }, address: { fa: 'نشانی', en: 'Address', zh: '地址' },
  notes: { fa: 'توضیحات', en: 'Notes', zh: '说明' }, errorExample: { fa: 'نمونهٔ خطا', en: 'Error example', zh: '错误示例' }, disabledExample: { fa: 'نمونهٔ غیرفعال', en: 'Disabled example', zh: '禁用示例' }
}
const fieldIds = laboratoryDefinition.fields.map(field => field.id)

export default function FormLaboratoryPage({ language, authenticatedUserId }: { language: Language, authenticatedUserId?: string }) {
  const fa = language === 'fa'
  const [datasetSize, setDatasetSize] = useState<(typeof laboratoryDatasetSizes)[number]>(100)
  const rows = useMemo(() => createSyntheticPersons(datasetSize), [datasetSize])
  const [draft, updateDraft] = useState({ personCode: 'LAB-000001', firstName: 'آرمان', lastName: 'رضایی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' })
  const update = (key: keyof typeof draft, value: string) => updateDraft(current => ({ ...current, [key]: value }))
  const [history, dispatchHistory] = useReducer(designerHistoryReducer, undefined, () => createDesignerHistory(loadDesignerDraft(window.localStorage, authenticatedUserId, laboratoryDefinition.id, fieldIds)))
  const [designerOpen, setDesignerOpen] = useState(false)
  const [selection, setSelection] = useState<string[]>([])
  const [applyToAll, setApplyToAll] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const editingBaseline = useRef<DesignerDraft | null>(null)
  useEffect(() => {
    const restored = loadDesignerDraft(window.localStorage, authenticatedUserId, laboratoryDefinition.id, fieldIds)
    dispatchHistory({ type: 'replace', draft: restored })
    editingBaseline.current = null
    setSaveStatus('')
  }, [authenticatedUserId])

  const selectField = (id: string, event: { ctrlKey: boolean, metaKey: boolean }) => {
    setSelection(current => event.ctrlKey || event.metaKey ? current.includes(id) ? current.filter(item => item !== id) : [...current, id] : [id])
  }
  const updateProperty = (property: DesignerProperty, value: DesignerValue | undefined) => {
    const targets = applyToAll ? fieldIds : selection
    dispatchHistory({ type: 'change', draft: setDesignerProperty(history.present, targets, property, value, fieldIds) })
    setSaveStatus('')
  }
  const openDesigner = () => {
    if (!designerOpen && editingBaseline.current === null) editingBaseline.current = history.present
    setDesignerOpen(value => !value)
  }
  const cancelDesigner = () => {
    if (editingBaseline.current) dispatchHistory({ type: 'replace', draft: editingBaseline.current })
    else dispatchHistory({ type: 'replace', draft: history.present })
    editingBaseline.current = null
    setDesignerOpen(false)
    setSaveStatus('')
  }
  const saveDraft = () => {
    const saved = saveDesignerDraft(window.localStorage, authenticatedUserId, laboratoryDefinition.id, history.present, fieldIds)
    if (saved) {
      editingBaseline.current = history.present
      dispatchHistory({ type: 'replace', draft: history.present })
      setSaveStatus(fa ? 'پیش‌نویس این فرم برای کاربر جاری ذخیره شد.' : language === 'zh' ? '此表单草稿已为当前用户保存。' : 'Draft saved for this user and laboratory form.')
    } else setSaveStatus(fa ? 'ذخیرهٔ محلی انجام نشد.' : language === 'zh' ? '无法保存本地草稿。' : 'Local draft could not be saved.')
  }
  const resetSelected = () => updateDraftState(resetDesignerFields(history.present, selection))
  const resetAll = () => updateDraftState(resetDesignerFields(history.present, fieldIds))
  const updateDraftState = (next: DesignerDraft) => { dispatchHistory({ type: 'change', draft: next }); setSaveStatus('') }
  const undo = () => { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'undo' }) }
  const redo = () => { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'redo' }) }
  const handleDesignerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!designerOpen || !(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase())) return
    const target = event.target
    if (target instanceof HTMLElement && (target.matches('input, textarea, [contenteditable="true"]') || target.isContentEditable)) return
    event.preventDefault()
    if (event.key.toLowerCase() === 'z' && !event.shiftKey) undo()
    else redo()
  }
  const renderField = (id: string, layoutClass: string, control: React.ReactNode, error?: string) => {
    const selected = selection.includes(id)
    const fieldLabel = labels[id][language]
    return <div key={id} className={'laboratory-designer-field ' + layoutClass + (selected ? ' is-selected' : '')} data-field-id={id} style={designerStyleForField(history.present, id) as CSSProperties} role="group" aria-label={fieldLabel} onClick={event => selectField(id, event)}>
      <button type="button" className="laboratory-field-select" aria-label={(fa ? 'انتخاب فیلد ' : language === 'zh' ? '选择字段 ' : 'Select field ') + fieldLabel} aria-pressed={selected} onClick={event => { event.stopPropagation(); selectField(id, event) }}>{selected ? '✓' : '+'}</button>
      <Field label={fieldLabel} error={error}>{control}</Field>
    </div>
  }
  const title = fa ? 'آزمایشگاه فرم‌ها' : language === 'zh' ? '表单实验室' : 'Form Laboratory'
  const settingsLabel = fa ? 'طراحی ظاهری فرم' : language === 'zh' ? '表单外观设计' : 'Visual form designer'
  return <div className="form-laboratory-page" dir={fa ? 'rtl' : 'ltr'} data-form-laboratory data-synthetic-only="true" onKeyDown={handleDesignerKey}>
    <header className="form-laboratory-banner"><div className="laboratory-banner-title"><strong>{title}</strong><span>{fa ? 'محیط مستقل با دادهٔ قطعی و مصنوعی؛ هیچ API اشخاصی فراخوانی نمی‌شود.' : language === 'zh' ? '独立的确定性合成数据环境；不会调用人员 API。' : 'Independent deterministic synthetic data; no Persons API is called.'}</span></div><div className="laboratory-banner-actions"><label>{fa ? 'اندازهٔ داده' : language === 'zh' ? '数据量' : 'Dataset size'}<select value={datasetSize} onChange={event => setDatasetSize(Number(event.target.value) as typeof datasetSize)}>{laboratoryDatasetSizes.map(size => <option key={size} value={size}>{size.toLocaleString()}</option>)}</select></label><button type="button" className="laboratory-designer-toggle" aria-label={settingsLabel} title={settingsLabel} aria-expanded={designerOpen} aria-controls="form-laboratory-designer" onClick={openDesigner}>⚙</button></div></header>
    {designerOpen && <FormLaboratoryDesignerPanel language={language} draft={history.present} selectedFieldIds={selection} fieldIds={fieldIds} fieldLabels={Object.fromEntries(fieldIds.map(id => [id, labels[id][language]]))} applyToAll={applyToAll} canSave={Boolean(authenticatedUserId)} saveStatus={saveStatus} onApplyToAllChange={setApplyToAll} onChange={updateProperty} onBeginColorChange={() => dispatchHistory({ type: 'beginTransaction' })} onCommitColorChange={() => dispatchHistory({ type: 'commitTransaction' })} onUndo={undo} onRedo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onResetSelected={resetSelected} onResetAll={resetAll} onSave={saveDraft} onCancel={cancelDesigner} onSelectAll={() => setSelection(fieldIds)} />}
    <BaseFormShell formId={laboratoryDefinition.id}
      editor={<div className="person-editor panel laboratory-editor"><div className="person-form-grid laboratory-form-grid" data-section-id="laboratory.editor">
        {renderField('personCode', 'lab-person-code', <input aria-label={labels.personCode[language]} value={draft.personCode} onChange={event => update('personCode', event.target.value)} />)}
        {renderField('titleId', 'lab-title', <select aria-label={labels.titleId[language]}><option>{fa ? 'آقای' : 'Mr.'}</option><option>{fa ? 'شرکت' : 'Company'}</option></select>)}
        {renderField('firstName', 'lab-first', <input aria-label={labels.firstName[language]} value={draft.firstName} onChange={event => update('firstName', event.target.value)} />)}
        {renderField('lastName', 'lab-last', <input aria-label={labels.lastName[language]} value={draft.lastName} onChange={event => update('lastName', event.target.value)} />)}
        {renderField('jobId', 'lab-job', <select aria-label={labels.jobId[language]}><option>{fa ? 'مشتری' : 'Customer'}</option><option>{fa ? 'تأمین‌کننده' : 'Supplier'}</option></select>)}
        {renderField('nationalityId', 'lab-nationality', <select aria-label={labels.nationalityId[language]}><option>{fa ? 'ایرانی' : 'Iranian'}</option><option>{fa ? 'چینی' : 'Chinese'}</option></select>)}
        {renderField('phone', 'lab-phone', <input dir="ltr" aria-label={labels.phone[language]} value={draft.phone} onChange={event => update('phone', event.target.value)} />)}
        {renderField('mobile', 'lab-mobile', <input dir="ltr" aria-label={labels.mobile[language]} value={draft.mobile} onChange={event => update('mobile', event.target.value)} />)}
        {renderField('disabledExample', 'lab-disabled', <input disabled value={fa ? 'فقط نمایشی' : 'Display only'} readOnly />)}
        {renderField('address', 'lab-address', <textarea aria-label={labels.address[language]} value={draft.address} onChange={event => update('address', event.target.value)} />)}
        {renderField('notes', 'lab-notes', <textarea aria-label={labels.notes[language]} placeholder={fa ? 'نمونهٔ حالت عادی' : 'Normal state example'} value={draft.notes} onChange={event => update('notes', event.target.value)} />)}
        {renderField('errorExample', 'lab-error', <input aria-label={labels.errorExample[language]} aria-invalid="true" defaultValue="نمونه" />, fa ? 'دادهٔ آزمایشی نامعتبر است.' : 'Synthetic validation example.')}
      </div></div>}
      grid={<div className="person-grid-panel panel laboratory-grid"><BaseFormGridBoundary rows={rows} columns={columns} language={language} /></div>}
      footer={<div className="shortcut-bar laboratory-footer"><Shortcut code="F3" label={fa ? 'ذخیرهٔ نمایشی' : 'Demo save'} onClick={() => window.alert(fa ? 'در آزمایشگاه هیچ داده‌ای ذخیره نمی‌شود.' : 'Laboratory data is never persisted.')} primary /><Shortcut code="Esc" label={fa ? 'بازنشانی نمونه' : 'Reset sample'} onClick={() => updateDraft({ personCode: 'LAB-000001', firstName: 'آرمان', lastName: 'رضایی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' })} /><span>{fa ? 'فقط دادهٔ مصنوعی' : 'Synthetic data only'}</span></div>}
    />
  </div>
}
