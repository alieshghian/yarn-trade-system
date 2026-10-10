import type { CSSProperties } from 'react'
import type { Language } from '../../i18n'
import { designerProperties, type DesignerDraft, type DesignerProperty, type DesignerValue } from './designer'

type Props = {
  language: Language
  draft: DesignerDraft
  selectedFieldIds: string[]
  fieldIds: readonly string[]
  fieldLabels: Record<string, string>
  applyToAll: boolean
  canSave: boolean
  saveStatus: string
  onApplyToAllChange: (value: boolean) => void
  onChange: (property: DesignerProperty, value: DesignerValue | undefined) => void
  onBeginColorChange: () => void
  onCommitColorChange: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onResetSelected: () => void
  onResetAll: () => void
  onSave: () => void
  onCancel: () => void
  onSelectAll: () => void
}

const colors = ['#ffffff', '#202a31', '#69747b', '#0e7490', '#14b8a6', '#d99a30', '#e9f4f5', '#f2caca', '#7a2630', '#2d3941']
const propertyLabels: Record<DesignerProperty, [string, string, string]> = {
  fontFamily: ['قلم', 'Font family', '字体'], fontSize: ['اندازهٔ قلم', 'Font size', '字号'], fontWeight: ['ضخامت قلم', 'Font weight', '字重'], bold: ['درشت', 'Bold', '粗体'], italic: ['ایتالیک', 'Italic', '斜体'], textAlign: ['تراز متن', 'Text alignment', '文本对齐'], lineHeight: ['فاصلهٔ سطر', 'Line height', '行高'],
  backgroundColor: ['پس‌زمینه', 'Background', '背景色'], textColor: ['متن', 'Text', '文字颜色'], labelColor: ['برچسب', 'Label', '标签颜色'], borderColor: ['حاشیه', 'Border', '边框颜色'], focusColor: ['تمرکز', 'Focus', '焦点颜色'], hoverColor: ['شناوری', 'Hover', '悬停颜色'], selectedColor: ['انتخاب', 'Selected', '选中颜色'], disabledColor: ['غیرفعال', 'Disabled', '禁用颜色'], errorColor: ['خطا', 'Error', '错误颜色']
}
const colorKeys: DesignerProperty[] = ['backgroundColor', 'textColor', 'labelColor', 'borderColor', 'focusColor', 'hoverColor', 'selectedColor', 'disabledColor', 'errorColor']
const defaultColors: Record<string, string> = { backgroundColor: '#ffffff', textColor: '#202a31', labelColor: '#69747b', borderColor: '#d7dee2', focusColor: '#0e7490', hoverColor: '#e9f4f5', selectedColor: '#d99a30', disabledColor: '#eef1f3', errorColor: '#c24141' }

export function FormLaboratoryDesignerPanel(props: Props) {
  const fa = props.language === 'fa'
  const zh = props.language === 'zh'
  const word = (faText: string, enText: string, zhText: string) => fa ? faText : zh ? zhText : enText
  const fieldIds = props.applyToAll ? props.fieldIds : props.selectedFieldIds
  const editingEnabled = fieldIds.length > 0
  const firstField = props.selectedFieldIds[0] ?? props.fieldIds[0]
  const overrides = props.draft.overrides[firstField] ?? {}
  const selectedNames = props.selectedFieldIds.map(id => props.fieldLabels[id] ?? id)
  const value = (key: DesignerProperty, fallback: DesignerValue): DesignerValue => overrides[key] ?? fallback
  const edit = (key: DesignerProperty, next: DesignerValue | undefined) => props.onChange(key, next)
  const clear = (key: DesignerProperty) => <button type="button" className="designer-inherit-button" disabled={!editingEnabled || overrides[key] === undefined} onClick={() => edit(key, undefined)}>{word('وراثت', 'Inherit', '继承')}</button>
  const colorControl = (key: DesignerProperty) => {
    const current = value(key, defaultColors[key]) as string
    return <div className="designer-color-control" key={key}>
      <label className="designer-color-label"><span>{propertyLabels[key][props.language === 'fa' ? 0 : props.language === 'zh' ? 2 : 1]}</span><input aria-label={propertyLabels[key][props.language === 'fa' ? 0 : props.language === 'zh' ? 2 : 1]} type="color" value={current} disabled={!editingEnabled} onFocus={props.onBeginColorChange} onPointerDown={props.onBeginColorChange} onChange={event => edit(key, event.target.value)} onBlur={props.onCommitColorChange} /></label>{clear(key)}
      <div className="designer-color-palette" aria-label={word('رنگ‌های آماده', 'Color palette', '颜色调色板')}>
        {colors.map(color => <button key={color} type="button" aria-label={color} title={color} disabled={!editingEnabled} style={{ '--designer-swatch': color } as CSSProperties} onClick={() => edit(key, color)} />)}
      </div>
    </div>
  }
  const label = (key: DesignerProperty) => propertyLabels[key][props.language === 'fa' ? 0 : props.language === 'zh' ? 2 : 1]
  const fieldNames = props.applyToAll ? word('همهٔ فیلدها', 'All fields', '全部字段') : selectedNames.length ? selectedNames.join('، ') : word('هیچ فیلدی انتخاب نشده', 'No field selected', '未选择字段')
  return <aside id="form-laboratory-designer" className="laboratory-designer-panel" aria-label={word('طراحی ظاهری فرم', 'Visual form designer', '表单外观设计器')} dir={fa ? 'rtl' : 'ltr'}>
    <div className="designer-panel-heading"><div><strong>{word('طراحی ظاهری', 'Visual design', '外观设计')}</strong><small aria-live="polite">{fieldNames}</small></div><button type="button" className="designer-close" aria-label={word('بستن پنل', 'Close panel', '关闭面板')} onClick={props.onCancel}>×</button></div>
    <div className="designer-selection-actions"><button type="button" aria-pressed={!props.applyToAll} onClick={() => props.onApplyToAllChange(false)}>{word('فیلدهای انتخابی', 'Selected fields', '所选字段')}</button><button type="button" aria-pressed={props.applyToAll} onClick={() => props.onApplyToAllChange(true)}>{word('همهٔ فیلدها', 'All fields', '全部字段')}</button><button type="button" onClick={props.onSelectAll}>{word('انتخاب همه', 'Select all', '全选')}</button></div>
    <small className="designer-selection-help">{props.applyToAll ? word('هر ویژگی روی تمام فیلدهای نمونه اعمال می‌شود.', 'Each property applies to every sample field.', '每个属性都应用于所有示例字段。') : word('با Ctrl/Meta+کلیک چند فیلد را انتخاب کنید؛ ویژگی‌ها روی همهٔ انتخاب‌ها اعمال می‌شوند.', 'Ctrl/Meta-click to select multiple fields; changes apply to every selected field.', '按 Ctrl/Meta 并单击可多选；更改将应用于所有选中字段。')}</small>
    <fieldset className="designer-properties" disabled={!editingEnabled}>
      <legend>{word('ویژگی‌های فیلد', 'Field properties', '字段属性')}</legend>
      <div className="designer-typography-grid">
        <div className="designer-control-row"><label htmlFor="designer-font-family">{label('fontFamily')}</label><select id="designer-font-family" value={String(value('fontFamily', 'inherit'))} onChange={event => edit('fontFamily', event.target.value === 'inherit' ? undefined : event.target.value)}><option value="inherit">{word('ارث‌بری از فرم', 'Inherit', '继承')}</option><option value="vazirmatn">Vazirmatn</option><option value="tahoma">Tahoma</option><option value="segoe">Segoe UI</option><option value="arial">Arial</option><option value="naskh">Noto Naskh</option></select>{clear('fontFamily')}</div>
        <div className="designer-control-row"><label htmlFor="designer-font-size">{label('fontSize')}</label><input id="designer-font-size" type="number" min="8" max="40" step="1" value={Number(value('fontSize', 14))} onChange={event => edit('fontSize', Number(event.target.value))} />{clear('fontSize')}</div>
        <div className="designer-control-row"><label htmlFor="designer-font-weight">{label('fontWeight')}</label><select id="designer-font-weight" value={String(value('fontWeight', 400))} onChange={event => edit('fontWeight', Number(event.target.value))}><option value="300">300</option><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option></select>{clear('fontWeight')}</div>
        <div className="designer-control-row"><label htmlFor="designer-text-align">{label('textAlign')}</label><select id="designer-text-align" value={String(value('textAlign', 'start'))} onChange={event => edit('textAlign', event.target.value)}><option value="start">{word('ابتدا', 'Start', '起始')}</option><option value="center">{word('وسط', 'Center', '居中')}</option><option value="end">{word('انتها', 'End', '末尾')}</option><option value="left">{word('چپ', 'Left', '左')}</option><option value="right">{word('راست', 'Right', '右')}</option></select>{clear('textAlign')}</div>
        <div className="designer-control-row"><label htmlFor="designer-line-height">{label('lineHeight')}</label><input id="designer-line-height" type="number" min="0.8" max="3" step="0.1" value={Number(value('lineHeight', 1.4))} onChange={event => edit('lineHeight', Number(event.target.value))} />{clear('lineHeight')}</div>
        <div className="designer-control-row designer-check"><input id="designer-bold" type="checkbox" checked={Boolean(value('bold', Number(value('fontWeight', 400)) >= 600))} onChange={event => edit('bold', event.target.checked)} /><label htmlFor="designer-bold">{label('bold')}</label>{clear('bold')}</div>
        <div className="designer-control-row designer-check"><input id="designer-italic" type="checkbox" checked={Boolean(value('italic', false))} onChange={event => edit('italic', event.target.checked)} /><label htmlFor="designer-italic">{label('italic')}</label>{clear('italic')}</div>
      </div>
      <details className="designer-color-section" open><summary>{word('رنگ‌ها و حالت‌ها', 'Colors and states', '颜色与状态')}</summary>{colorKeys.map(colorControl)}</details>
    </fieldset>
    <div className="designer-history-actions"><button type="button" disabled={!props.canUndo} onClick={props.onUndo}>{word('واگرد', 'Undo', '撤销')}</button><button type="button" disabled={!props.canRedo} onClick={props.onRedo}>{word('ازنو', 'Redo', '重做')}</button><button type="button" disabled={!props.selectedFieldIds.length} onClick={props.onResetSelected}>{word('بازنشانی انتخابی', 'Reset selected', '重置所选')}</button><button type="button" onClick={props.onResetAll}>{word('بازنشانی همه', 'Reset all', '全部重置')}</button></div>
    <div className="designer-save-actions"><button type="button" disabled={!props.canSave} onClick={props.onSave}>{word('ذخیرهٔ پیش‌نویس', 'Save draft', '保存草稿')}</button><button type="button" onClick={props.onCancel}>{word('لغو تغییرات', 'Cancel', '取消')}</button></div>
    <div className="designer-save-status" role="status">{props.saveStatus || (props.canSave ? word('پیش‌نویس فقط برای کاربر جاری ذخیره می‌شود.', 'Draft is saved for the current user only.', '草稿仅保存给当前用户。') : word('ذخیرهٔ محلی به نشست کاربر نیاز دارد.', 'Sign in to save a local draft.', '登录后才能保存本地草稿。'))}</div>
    <span className="designer-screen-reader" aria-live="polite">{word('فیلدهای انتخاب‌شده:', 'Selected fields:', '所选字段：')} {fieldNames}</span>
    <span className="designer-screen-reader">{designerProperties.length} {word('ویژگی قابل تنظیم', 'editable properties', '项可编辑属性')}</span>
  </aside>
}
