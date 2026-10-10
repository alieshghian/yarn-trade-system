import { useMemo, useState } from 'react'
import { Field, Shortcut } from './DefinitionControls'
import { BaseFormGridBoundary, type GridColumn } from './components/base-form/BaseFormGridBoundary'
import { BaseFormShell } from './components/base-form/BaseFormShell'
import { createSyntheticPersons, laboratoryDatasetSizes, type SyntheticPerson } from './components/base-form/syntheticPersons'
import type { BaseFormDefinition, DesignerExtensionPoints } from './components/base-form/types'
import type { Language } from './i18n'

const laboratoryDefinition: BaseFormDefinition = {
  id: 'form-laboratory.persons-synthetic',
  sections: [{ id: 'laboratory.editor', kind: 'editor' }, { id: 'laboratory.grid', kind: 'grid' }, { id: 'laboratory.footer', kind: 'footer' }],
  fields: [
    { id: 'personCode', sectionId: 'laboratory.editor', minTracks: 2, span: 2 }, { id: 'titleId', sectionId: 'laboratory.editor', minTracks: 3, span: 3 },
    { id: 'firstName', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'lastName', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'jobId', sectionId: 'laboratory.editor', minTracks: 5, span: 5 },
    { id: 'nationalityId', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'phone', sectionId: 'laboratory.editor', minTracks: 5, span: 5 }, { id: 'mobile', sectionId: 'laboratory.editor', minTracks: 5, span: 5 },
    { id: 'address', sectionId: 'laboratory.editor', minTracks: 10, span: 10 }, { id: 'notes', sectionId: 'laboratory.editor', minTracks: 10, span: 10 }
  ]
}
export const formLaboratoryDesignerExtensions: DesignerExtensionPoints = {
  selection: 'all-fields-and-multi-field', propertyOverrides: 'per-property', typography: 'family-size-weight-italic', colors: 'background-foreground-border-and-states', interaction: 'live-preview-resize-drag-drop', history: 'undo-redo-save-cancel-reset', persistence: 'administrator-defaults-and-personal-settings'
}

const columns: GridColumn<SyntheticPerson>[] = [
  { id: 'personCode', label: 'کد', width: 120, value: row => row.personCode }, { id: 'displayName', label: 'نام', width: 210, value: row => row.displayName },
  { id: 'job', label: 'نقش', width: 130, value: row => row.job }, { id: 'nationality', label: 'ملیت', width: 110, value: row => row.nationality },
  { id: 'mobile', label: 'موبایل', width: 145, value: row => row.mobile }, { id: 'address', label: 'نشانی', width: 240, value: row => row.address }
]

export default function FormLaboratoryPage({ language }: { language: Language }) {
  const fa = language === 'fa'
  const [datasetSize, setDatasetSize] = useState<(typeof laboratoryDatasetSizes)[number]>(100)
  const rows = useMemo(() => createSyntheticPersons(datasetSize), [datasetSize])
  const [draft, setDraft] = useState({ personCode: 'LAB-000001', firstName: 'آرمان', lastName: 'رضایی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' })
  const update = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }))
  return <div className="form-laboratory-page" dir={fa ? 'rtl' : 'ltr'} data-form-laboratory data-synthetic-only="true">
    <header className="form-laboratory-banner"><div><strong>{fa ? 'آزمایشگاه فرم‌ها' : 'Form Laboratory'}</strong><span>{fa ? 'محیط مستقل با دادهٔ قطعی و مصنوعی؛ هیچ API اشخاصی فراخوانی نمی‌شود.' : 'Independent deterministic synthetic data; no Persons API is called.'}</span></div><label>{fa ? 'اندازهٔ داده' : 'Dataset size'}<select value={datasetSize} onChange={event => setDatasetSize(Number(event.target.value) as typeof datasetSize)}>{laboratoryDatasetSizes.map(size => <option key={size} value={size}>{size.toLocaleString()}</option>)}</select></label></header>
    <BaseFormShell formId={laboratoryDefinition.id}
      editor={<div className="person-editor panel laboratory-editor"><div className="person-form-grid laboratory-form-grid" data-section-id="laboratory.editor">
        <Field label={fa ? 'کد شخص' : 'Person code'} className="lab-person-code"><input aria-label={fa ? 'کد شخص' : 'Person code'} value={draft.personCode} onChange={event => update('personCode', event.target.value)} /></Field>
        <Field label={fa ? 'عنوان' : 'Title'} className="lab-title"><select aria-label={fa ? 'عنوان' : 'Title'}><option>{fa ? 'آقای' : 'Mr.'}</option><option>{fa ? 'شرکت' : 'Company'}</option></select></Field>
        <Field label={fa ? 'نام' : 'First name'} className="lab-first"><input aria-label={fa ? 'نام' : 'First name'} value={draft.firstName} onChange={event => update('firstName', event.target.value)} /></Field>
        <Field label={fa ? 'نام خانوادگی' : 'Last name'} className="lab-last"><input aria-label={fa ? 'نام خانوادگی' : 'Last name'} value={draft.lastName} onChange={event => update('lastName', event.target.value)} /></Field>
        <Field label={fa ? 'نقش' : 'Job'} className="lab-job"><select aria-label={fa ? 'نقش' : 'Job'}><option>{fa ? 'مشتری' : 'Customer'}</option><option>{fa ? 'تأمین‌کننده' : 'Supplier'}</option></select></Field>
        <Field label={fa ? 'ملیت' : 'Nationality'} className="lab-nationality"><select aria-label={fa ? 'ملیت' : 'Nationality'}><option>{fa ? 'ایرانی' : 'Iranian'}</option><option>{fa ? 'چینی' : 'Chinese'}</option></select></Field>
        <Field label={fa ? 'تلفن' : 'Phone'} className="lab-phone"><input dir="ltr" aria-label={fa ? 'تلفن' : 'Phone'} value={draft.phone} onChange={event => update('phone', event.target.value)} /></Field>
        <Field label={fa ? 'موبایل' : 'Mobile'} className="lab-mobile"><input dir="ltr" aria-label={fa ? 'موبایل' : 'Mobile'} value={draft.mobile} onChange={event => update('mobile', event.target.value)} /></Field>
        <Field label={fa ? 'نشانی' : 'Address'} className="lab-address"><textarea aria-label={fa ? 'نشانی' : 'Address'} value={draft.address} onChange={event => update('address', event.target.value)} /></Field>
        <Field label={fa ? 'توضیحات' : 'Notes'} className="lab-notes"><textarea aria-label={fa ? 'توضیحات' : 'Notes'} placeholder={fa ? 'نمونهٔ حالت عادی' : 'Normal state example'} value={draft.notes} onChange={event => update('notes', event.target.value)} /></Field>
        <Field label={fa ? 'نمونهٔ خطا' : 'Error example'} error={fa ? 'دادهٔ آزمایشی نامعتبر است.' : 'Synthetic validation example.'} className="lab-error"><input aria-invalid="true" defaultValue="نمونه" /></Field>
        <Field label={fa ? 'نمونهٔ غیرفعال' : 'Disabled example'} className="lab-disabled"><input disabled value={fa ? 'فقط نمایشی' : 'Display only'} readOnly /></Field>
      </div></div>}
      grid={<div className="person-grid-panel panel laboratory-grid"><BaseFormGridBoundary rows={rows} columns={columns} language={language} /></div>}
      footer={<div className="shortcut-bar laboratory-footer"><Shortcut code="F3" label={fa ? 'ذخیرهٔ نمایشی' : 'Demo save'} onClick={() => window.alert(fa ? 'در آزمایشگاه هیچ داده‌ای ذخیره نمی‌شود.' : 'Laboratory data is never persisted.')} primary /><Shortcut code="Esc" label={fa ? 'بازنشانی نمونه' : 'Reset sample'} onClick={() => setDraft({ personCode: 'LAB-000001', firstName: 'آرمان', lastName: 'رضایی', phone: '0211000001', mobile: '09121000001', address: 'نشانی مصنوعی آزمایشگاه', notes: '' })} /><span>{fa ? 'فقط دادهٔ مصنوعی' : 'Synthetic data only'}</span></div>}
    />
  </div>
}
