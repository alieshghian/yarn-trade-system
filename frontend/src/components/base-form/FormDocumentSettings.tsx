import { GridToolbarControls } from './GridToolbarControls'
import type {GridToolbarPart,GridToolbarPartStyle} from './gridToolbarLayout'
import { editorViewport } from './formEditorViewport'
import type { FormSchemaDraft, FormSchemaSection } from './formSchema'
export { FormDocumentDialog } from './FormDocumentDialog'
import { FormTableStructureControls } from './FormTableStructureControls'
import { useEffect, useState } from 'react'
import { ActionCreationControls, FieldCreationControls, FieldEditingControls } from './FormFieldStructureControls'
import { addTableHeaderRow, copyFormDimensions, parseFrameDimension, setTableMaster, type FieldBlueprint } from './formDocumentControls'
import type { ManagedFormCustomization, ManagedFormFrame } from './laboratoryFormDraftState'
import { addFormSection, assignFormFieldSection, moveFormSection, updateFormSection } from './formDocumentStructure'

type Locale = 'fa' | 'en' | 'zh'
type Props = {
  language: Locale
  schema: FormSchemaDraft
  frame: ManagedFormFrame
  customization?: ManagedFormCustomization
  onSchemaChange: (schema: FormSchemaDraft) => void
  onFrameChange: (frame: ManagedFormFrame) => void
  onCustomizationChange?: (permissions: ManagedFormCustomization) => void
  onUndo: () => void
  onRedo: () => void
  onUseGridLayout: () => void
  canUndo: boolean
  canRedo: boolean
  actionVisible: (id: string) => boolean
  onActionVisibilityChange: (id: string, visible: boolean) => void
  onActionLabelChange: (id: string, label: string) => void
  independent?: boolean
  savedSizes?: { id: string; name: string; frame: ManagedFormFrame }[]
  blueprints: FieldBlueprint[]
  onSaveBlueprint: (blueprint: FieldBlueprint) => boolean
  onToolbarFont?: (tableId:string,part:GridToolbarPart)=>void
  onToolbarSelect?: (tableId:string,part:GridToolbarPart)=>void
  onToolbarPreview?: (tableId:string,part:GridToolbarPart,patch:GridToolbarPartStyle|null)=>void
  defaultColumnComposition?: 'direct'|'space'|'comma'|'newline'|'custom'
  allowMultipleColumnSources?: boolean
}

export function FrameDimensionInput({ value, nullable = false, onChange, label }: { value: number | null; nullable?: boolean; onChange: (value: number | null) => void; label: string }) {
  const [text, setText] = useState(value === null ? '' : String(Math.round(value)))
  useEffect(() => setText(value === null ? '' : String(Math.round(value))), [value])
  const valid = parseFrameDimension(text, nullable)
  return <label>{label}<input inputMode="numeric" value={text} aria-invalid={valid === undefined || undefined} onChange={event => { const next = event.target.value; setText(next); const parsed = parseFrameDimension(next, nullable); if (parsed !== undefined) onChange(parsed) }} onBlur={() => { if (parseFrameDimension(text, nullable) === undefined) setText(value === null ? '' : String(Math.round(value))) }} /></label>
}

export function FormCustomizationPermissions({ language, value, onChange }: { language: Locale; value: ManagedFormCustomization; onChange: (value: ManagedFormCustomization) => void }) {
  const labels = language === 'fa' ? { colors: 'رنگ‌ها', typography: 'قلم و اندازهٔ نوشته', formSize: 'اندازهٔ فرم', tablePresentation: 'ظاهر جدول' } : language === 'zh' ? { colors: '颜色', typography: '字体', formSize: '表单大小', tablePresentation: '表格外观' } : { colors: 'Colors', typography: 'Typography', formSize: 'Form size', tablePresentation: 'Table appearance' }
  return <fieldset><legend>{language === 'fa' ? 'اجازهٔ شخصی‌سازی کاربر آینده' : language === 'zh' ? '用户自定义权限' : 'Future user customization permissions'}</legend>{(Object.keys(labels) as (keyof ManagedFormCustomization)[]).map(key => <label key={key} className="form-document-check"><input type="checkbox" checked={value[key]} onChange={event => onChange({ ...value, [key]: event.target.checked })} />{labels[key]}</label>)}</fieldset>
}

/** Developer controls edit the same Schema consumed by the shared presentation. */
export function FormDocumentSettings({ language, schema, frame, customization, onSchemaChange, onFrameChange, onCustomizationChange, onUndo, onRedo, onUseGridLayout, canUndo, canRedo, actionVisible, onActionVisibilityChange, onActionLabelChange, independent, savedSizes = [], blueprints, onSaveBlueprint,onToolbarFont,onToolbarSelect,onToolbarPreview,defaultColumnComposition='space',allowMultipleColumnSources=true }: Props) {
  const fa = language === 'fa'
  const word = (persian: string, english: string) => fa ? persian : english
  const kinds = { editor: word('پنل ورودی', 'Input panel'), grid: word('جدول', 'Table'), footer: word('نوار کلیدها', 'Action bar'), group: word('گروه بخش‌ها', 'Section group') }
  const patch = (section: FormSchemaSection, values: Partial<FormSchemaSection>) => onSchemaChange(updateFormSection(schema, section.id, values))
  const groups = schema.sections.filter(section => section.kind === 'group')
  const editors = schema.sections.filter(section => section.kind === 'editor')
  return <div className="form-document-settings" dir={fa ? 'rtl' : 'ltr'}>
    <label>{word('نام فرم', 'Form name')}<input value={schema.title[language]} onChange={event => onSchemaChange({ ...schema, title: { ...schema.title, [language]: event.target.value } })} /></label>
    <label>{word('نوع فرم', 'Form type')}<select value={schema.mode} onChange={event => onSchemaChange({ ...schema, mode: event.target.value as FormSchemaDraft['mode'] })}><option value="operational">{word('عملیاتی', 'Operational')}</option><option value="reporting">{word('گزارشی', 'Reporting')}</option><option value="hybrid">{word('ترکیبی', 'Hybrid')}</option>{schema.mode === 'combined' && <option value="combined">{word('ترکیبی — نسخهٔ قدیمی', 'Combined — legacy')}</option>}</select></label>
    <fieldset><legend>{word('قاب فرم', 'Form frame')}</legend><div className="form-document-settings-pair">
      <FrameDimensionInput label={word('عرض', 'Width')} value={frame.width} onChange={width => { if (width !== null) onFrameChange({ ...frame, width, fitToPage: false }) }} />
      <FrameDimensionInput label={word('ارتفاع؛ خالی یعنی خودکار', 'Height; empty means automatic')} value={frame.height} nullable onChange={height => onFrameChange({ ...frame, height })} />
    </div><label className="form-document-check"><input type="checkbox" checked={frame.fitToPage} onChange={event => onFrameChange({ ...frame, fitToPage: event.target.checked })} />{word('تطبیق قاب با فضای موجود', 'Fit frame to available space')}</label><label>{word('دریافت ابعاد از فرم ذخیره‌شده', 'Use saved form dimensions')}<select value="" onChange={event => { const source = savedSizes.find(item => item.id === event.target.value); if (source) onFrameChange(copyFormDimensions(frame, source.frame)) }}><option value="">{word('انتخاب فرم…', 'Choose form…')}</option>{savedSizes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.frame.width} × {item.frame.height ?? word('خودکار', 'Auto')}</option>)}</select></label></fieldset>
    <label>{word('شرح عملکرد موردانتظار فرم', 'Expected form behavior')}<textarea value={schema.behaviorInstruction ?? ''} onChange={event => onSchemaChange({ ...schema, behaviorInstruction: event.target.value })} /></label>
    <fieldset><legend>{word('افزودن فیلد یا کامپوننت', 'Add field or component')}</legend><FieldCreationControls schema={schema} language={language} onChange={onSchemaChange} blueprints={blueprints} onSaveBlueprint={onSaveBlueprint} /></fieldset>
    {independent && schema.tables?.map(table => <FormTableStructureControls key={table.id} schema={schema} table={table} language={language} defaultComposition={defaultColumnComposition} allowMultipleSources={allowMultipleColumnSources} onChange={onSchemaChange} />)}
    <fieldset><legend>{word('افزودن کلید', 'Add action')}</legend><ActionCreationControls schema={schema} language={language} onChange={onSchemaChange} /></fieldset>
    <fieldset><legend>{word('چیدمان بخش‌ها', 'Section layout')}</legend><label>{word('جهت بخش‌های اصلی', 'Root section direction')}<select value={schema.layout?.direction ?? 'vertical'} onChange={event => onSchemaChange({ ...schema, layout: { ...schema.layout, direction: event.target.value as 'vertical' | 'horizontal' } })}><option value="vertical">{word('زیر هم', 'Vertical')}</option><option value="horizontal">{word('کنار هم', 'Horizontal')}</option></select></label>
      <button type="button" onClick={onUseGridLayout}>{word('استفاده از چیدمان شبکه‌ای فیلدها', 'Use the field grid layout')}</button><small>{word('جایگاه‌ها از تنظیمات فرم خوانده می‌شوند؛ طرح دستی حذف نمی‌شود و این تغییر واگرد دارد.', 'Uses the field grid positions without deleting saved manual geometry; Undo is available.')}</small>
      <div className="form-document-settings-buttons">{(Object.keys(kinds) as FormSchemaSection['kind'][]).map(kind => <button key={kind} type="button" onClick={() => onSchemaChange(addFormSection(schema, kind, `section.${crypto.randomUUID()}`))}>{word('افزودن ', 'Add ') + kinds[kind]}</button>)}</div>
      {schema.sections.map(section => <details key={section.id} className="form-document-section-setting" data-section-settings-id={section.id} data-section-kind={section.kind}><summary>{section.title?.[language] || kinds[section.kind]} · {kinds[section.kind]}</summary>
        <label>{word('عنوان بخش', 'Section title')}<input value={section.title?.[language] ?? ''} onChange={event => patch(section, { title: { fa: '', en: '', zh: '', ...section.title, [language]: event.target.value } })} /></label>
        <label className="form-document-check"><input type="checkbox" checked={section.enabled !== false} onChange={event => patch(section, { enabled: event.target.checked })} />{word('استفاده از این بخش', 'Show this section')}</label>
        <label>{word('محل بخش', 'Parent group')}<select value={section.parentId ?? ''} onChange={event => patch(section, { parentId: event.target.value || null })}><option value="">{word('سطح اصلی فرم', 'Form root')}</option>{groups.filter(group => group.id !== section.id).map(group => <option key={group.id} value={group.id}>{group.title?.[language] || group.id}</option>)}</select></label>
        {section.kind === 'group' && <label>{word('چیدمان داخل گروه', 'Group direction')}<select value={section.layout?.direction ?? 'vertical'} onChange={event => patch(section, { layout: { ...section.layout, direction: event.target.value as 'vertical' | 'horizontal' } })}><option value="vertical">{word('زیر هم', 'Vertical')}</option><option value="horizontal">{word('کنار هم', 'Horizontal')}</option></select></label>}
        <div className="form-document-settings-pair">{(['width', 'height'] as const).map(dimension => <label key={dimension}>{word(dimension === 'width' ? 'عرض اولیه؛ خالی یعنی انعطاف‌پذیر' : 'ارتفاع اولیه؛ خالی یعنی خودکار', dimension === 'width' ? 'Initial width' : 'Initial height')}<input type="number" min={80} max={4000} value={section.initialSize?.[dimension] ?? ''} onChange={event => { const value = event.target.value === '' ? undefined : Number(event.target.value); if (value !== undefined && (value < 80 || value > 4000)) return; const size = { ...section.initialSize, [dimension]: value }; patch(section, { initialSize: size.width || size.height ? size : undefined }) }} /></label>)}</div>
        <div className="form-document-settings-buttons"><button type="button" onClick={() => onSchemaChange(moveFormSection(schema, section.id, -1))}>{word('بالاتر / قبل', 'Move before')}</button><button type="button" onClick={() => onSchemaChange(moveFormSection(schema, section.id, 1))}>{word('پایین‌تر / بعد', 'Move after')}</button></div>
        {section.kind === 'editor' && <fieldset><legend>اندازه محتوا و اسکرول پنل ورودی</legend><label>ارتفاع پنل<select value={editorViewport(section).heightMode} onChange={event=>patch(section,{settings:{...section.settings,viewport:{...editorViewport(section),heightMode:event.target.value}}})}><option value="fixed">اندازه دستی / فعلی</option><option value="content">متناسب با محتوا؛ جمع‌کردن فضای خالی</option></select></label>{(['overflowX','overflowY'] as const).map(axis=><label key={axis}>{axis==='overflowX'?'اسکرول افقی':'اسکرول عمودی'}<select value={editorViewport(section)[axis]} onChange={event=>patch(section,{settings:{...section.settings,viewport:{...editorViewport(section),[axis]:event.target.value}}})}><option value="auto">خودکار، فقط هنگام نیاز</option><option value="scroll">همیشه</option><option value="hidden">غیرفعال</option></select></label>)}<small>در حالت خودکار، افزودن و حذف فیلد نیاز به اسکرول را تعیین می‌کند. غیرفعال‌کردن اسکرول ممکن است محتوای بیرون پنل را از دسترس خارج کند.</small></fieldset>}
        {section.kind === 'editor' && schema.fields.filter(field => field.sectionId === section.id).map(field => <details key={field.id}><summary>{field.label[language]}</summary><FieldEditingControls schema={schema} language={language} onChange={onSchemaChange} field={field} allowRemove={Boolean(independent)} /><label>{word('پنل فیلد', 'Field panel')}<select value={field.sectionId} onChange={event => onSchemaChange(assignFormFieldSection(schema, field.id, event.target.value))}>{editors.map(editor => <option key={editor.id} value={editor.id}>{editor.title?.[language] || kinds.editor}</option>)}</select></label></details>)}
        {section.kind === 'grid' && schema.tables?.filter(table => table.sectionId === section.id).map(table => <div key={table.id} className="form-structure-controls"><GridToolbarControls schema={schema} table={table} onChange={onSchemaChange} onFont={onToolbarFont?part=>onToolbarFont(table.id,part):undefined} onSelect={onToolbarSelect?part=>onToolbarSelect(table.id,part):undefined} onPreview={onToolbarPreview?(part,patch)=>onToolbarPreview(table.id,part,patch):undefined} /><label>{word('عنوان جدول', 'Table title')}<input value={table.title?.[language] ?? ''} onChange={event => onSchemaChange({ ...schema, tables: schema.tables?.map(item => item.id === table.id ? { ...item, title: { fa: '', en: '', zh: '', ...item.title, [language]: event.target.value } } : item) })} /></label><button type="button" onClick={() => onSchemaChange(addTableHeaderRow(schema, table.id, 'report-row.' + crypto.randomUUID()))}>{word('افزودن ردیف فیلد بالای جدول', 'Add report field row')}</button><label>{word('جدول مادر — فقط تعریف ارتباط', 'Master table — definition only')}<select value={table.masterDetail?.masterTableId ?? ''} onChange={event => onSchemaChange(setTableMaster(schema, table.id, event.target.value))}><option value="">{word('مستقل', 'Independent')}</option>{schema.tables?.filter(item => item.id !== table.id).map(item => <option key={item.id} value={item.id}>{item.title?.[language] || item.id}</option>)}</select></label>{table.masterDetail && <>{(['masterField', 'detailField', 'instruction'] as const).map(key => <label key={key}>{word(({ masterField: 'شناسهٔ فیلد مادر', detailField: 'شناسهٔ فیلد وابسته', instruction: 'شرح ارتباط' })[key], key)}<input value={table.masterDetail?.[key] ?? ''} onChange={event => { const relation = { ...table.masterDetail!, [key]: event.target.value }; onSchemaChange(setTableMaster(schema, table.id, relation.masterTableId, relation.masterField, relation.detailField, relation.instruction)) }} /></label>)}<small>{word('این ارتباط فعلاً داده یا API را متصل نمی‌کند.', 'This definition does not connect data or APIs.')}</small></>}</div>)}
        {section.kind === 'footer' && schema.actions?.map(action => <label key={action.id}>{action.label[language]}<select aria-label={word('نوار کلید ', 'Action bar for ') + action.label[language]} value={action.sectionId ?? schema.sections.find(item => item.kind === 'footer')?.id} onChange={event => onSchemaChange({ ...schema, actions: schema.actions?.map(item => item.id === action.id ? { ...item, sectionId: event.target.value } : item) })}>{schema.sections.filter(item => item.kind === 'footer').map(item => <option key={item.id} value={item.id}>{item.title?.[language] || kinds.footer}</option>)}</select></label>)}
        {section.kind === 'footer' && independent && schema.actions?.filter(action => action.sectionId === section.id || !action.sectionId && section.id === schema.sections.find(item => item.kind === 'footer')?.id).map(action => <details key={'edit-' + action.id}><summary>{action.label[language]}</summary><label>{word('عنوان کلید', 'Action title')}<input value={action.label[language]} onChange={event => { onSchemaChange({ ...schema, actions: schema.actions?.map(item => item.id === action.id ? { ...item, label: { ...item.label, [language]: event.target.value } } : item) }); onActionLabelChange(action.id, event.target.value) }} /></label><label>{word('نمایش کلید', 'Show action')}<input type="checkbox" checked={actionVisible(action.id)} onChange={event => onActionVisibilityChange(action.id, event.target.checked)} /></label><button type="button" onClick={() => onSchemaChange({ ...schema, actions: schema.actions?.filter(item => item.id !== action.id) })}>{word('حذف کلید از این فرم', 'Remove action from this form')}</button></details>)}

      </details>)}
    </fieldset>
    <div className="form-document-settings-buttons"><button type="button" disabled={!canUndo} onClick={onUndo}>{word('واگرد ساختار', 'Undo structure')}</button><button type="button" disabled={!canRedo} onClick={onRedo}>{word('ازنو ساختار', 'Redo structure')}</button></div>
    {customization && onCustomizationChange && <FormCustomizationPermissions language={language} value={customization} onChange={onCustomizationChange} />}
    <p>{word('ساختار، نوع فیلدها، جدول‌ها و رفتار عملیاتی فقط در اختیار توسعه‌دهنده است.', 'Structure, field types, table schema and business behavior remain developer-owned.')}</p>
  </div>
}
