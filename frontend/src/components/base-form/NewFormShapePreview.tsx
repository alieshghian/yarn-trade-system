import { useState, type ReactNode } from 'react'
import type { FormSchemaDraft } from './formSchema'
import { formSectionChildren } from './formDocumentStructure'
import { formSchemaFieldGridStyle, formSchemaGridColumnCount } from './laboratoryFormDraftState'
import { addRelativeSection, applyQuickLayout, placeSectionBeside, type RelativePosition, type QuickLayoutRow } from './formQuickLayout'
import { CascadingTreePanels } from './CascadingTreePanels'
import { laboratoryContentTitle } from './formDocumentControls'
import { cascadingTreeSettingsFromField } from './productGroupLaboratoryForm'

/** Schema composition editor; its Product Group tree preview is local-only and never runs operations. */
export function NewFormShapePreview({ schema, language, onChange, layoutSettingsOpen = true, onLayoutSettingsToggle }: { schema: FormSchemaDraft; language: 'fa' | 'en' | 'zh'; onChange?: (schema: FormSchemaDraft) => void; layoutSettingsOpen?: boolean; onLayoutSettingsToggle?: () => void }) {
  const fa = language === 'fa'
  const [rows, setRows] = useState<QuickLayoutRow[]>(() => {
    const saved = schema.settings?.specific?.values?.quickLayoutRows
    return Array.isArray(saved) && saved.length > 0 && saved.every(row => row && ['editor', 'grid'].includes(row.kind) && Number.isInteger(row.count) && row.count >= 1 && row.count <= 20 && ['horizontal', 'vertical'].includes(row.direction) && ['above', 'below', 'left', 'right'].includes(row.position)) ? saved as QuickLayoutRow[] : [{ kind: 'editor', count: 1, direction: 'horizontal', position: 'below' }, { kind: 'grid', count: 1, direction: 'horizontal', position: 'below' }]
  })
  const changeRow = (index: number, patch: Partial<QuickLayoutRow>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...patch } : row))
  const [kind, setKind] = useState<'editor' | 'grid' | 'footer'>('editor')
  const [position, setPosition] = useState<RelativePosition>('below')
  const [drop, setDrop] = useState<{ id: string; position: RelativePosition } | null>(null)
  const positions: { id: RelativePosition; fa: string; en: string }[] = [{ id: 'above', fa: 'بالای این بخش', en: 'Above' }, { id: 'below', fa: 'زیر این بخش', en: 'Below' }, { id: 'right', fa: 'سمت راست این بخش', en: 'Right' }, { id: 'left', fa: 'سمت چپ این بخش', en: 'Left' }]
  const dropPosition = (element: HTMLElement, x: number, y: number): RelativePosition => {
    const rect = element.getBoundingClientRect(), dx = (x - rect.left) / rect.width, dy = (y - rect.top) / rect.height
    return Math.min(dx, 1 - dx) < Math.min(dy, 1 - dy) ? (dx < .5 ? 'left' : 'right') : (dy < .5 ? 'above' : 'below')
  }
  const text = (faText: string, en: string, zh: string) => fa ? faText : language === 'zh' ? zh : en
  const names = { editor: text('پنل ورودی', 'Input panel', '输入面板'), grid: text('جدول', 'Table', '表格'), footer: text('کلیدها', 'Actions', '操作'), group: text('گروه', 'Group', '分组') }
  const layout = (parentId?: string) => parentId ? schema.sections.find(item => item.id === parentId)?.layout : schema.layout
  const render = (parentId?: string, ancestors: string[] = []): ReactNode => <div className="new-form-shape-sections" style={{ gridTemplateColumns: layout(parentId)?.direction === 'horizontal' ? `repeat(${Math.max(1, formSectionChildren(schema, parentId).filter(section => !ancestors.includes(section.id)).length)},minmax(0,1fr))` : 'minmax(0,1fr)', gap: layout(parentId)?.gap ?? 12 }}>
    {formSectionChildren(schema, parentId).filter(section => !ancestors.includes(section.id)).map(section => {
      const fields = schema.fields.filter(field => field.sectionId === section.id && field.kind !== 'hidden').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const columns = section.layout?.columns ?? formSchemaGridColumnCount(schema) ?? 20
      const tables = schema.tables?.filter(table => table.sectionId === section.id) ?? []
      const firstFooter = schema.sections.find(item => item.kind === 'footer')?.id
      const actions = schema.actions?.filter(action => !action.hidden && (action.sectionId ?? firstFooter) === section.id) ?? []
      return <section key={section.id} className="new-form-shape-section" data-drop-position={drop?.id === section.id ? drop.position : undefined}
        onDragOver={event => { if (!onChange || !event.dataTransfer.types.includes('application/x-new-form-section')) return; event.preventDefault(); event.stopPropagation(); setDrop({ id: section.id, position: dropPosition(event.currentTarget, event.clientX, event.clientY) }) }}
        onDrop={event => { const source = event.dataTransfer.getData('application/x-new-form-section'); if (!onChange || !source) return; event.preventDefault(); event.stopPropagation(); onChange(placeSectionBeside(schema, source, section.id, dropPosition(event.currentTarget, event.clientX, event.clientY), fa)); setDrop(null) }}
        >
        <h4 draggable={!!onChange} onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-new-form-section', section.id) }} onDragEnd={() => setDrop(null)}>{section.title?.[language] || names[section.kind]}</h4>
        {onChange && section.kind !== 'group' && <details className="new-form-relative-add"><summary>{fa ? '＋ افزودن بخش کنار این بخش' : '＋ Add section here'}</summary><div>
          <select aria-label={fa ? 'نوع بخش جدید' : 'New section type'} value={kind} onChange={event => setKind(event.target.value as 'editor' | 'grid' | 'footer')}><option value="editor">{fa ? 'پنل فیلدها' : 'Input panel'}</option><option value="grid">{fa ? 'جدول' : 'Table'}</option><option value="footer">{fa ? 'نوار کلیدها' : 'Action bar'}</option></select>
          <select aria-label={fa ? 'محل افزودن' : 'Insert position'} value={position} onChange={event => setPosition(event.target.value as RelativePosition)}>{positions.map(item => <option key={item.id} value={item.id}>{fa ? item.fa : item.en}</option>)}</select>
          <button type="button" onClick={() => onChange(addRelativeSection(schema, kind, section.id, position, fa))}>{fa ? 'افزودن' : 'Add'}</button>
        </div></details>}
        {section.kind === 'group' && render(section.id, [...ancestors, section.id])}
        {section.kind === 'editor' && <div className="new-form-shape-fields" style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}>
          {fields.map(field => {
            const tree = field.componentId === 'base-form.cascading-tree-panels' ? cascadingTreeSettingsFromField(field.settings) : null
            return <div key={field.id} className={'new-form-shape-field' + (tree ? ' has-cascading-tree-preview' : '')} style={formSchemaFieldGridStyle(schema, field.id) ?? { gridColumn: `span ${Math.max(1, Math.min(columns, field.span))}` }}>
              {tree ? <><span>{field.label[language]}</span><CascadingTreePanels title={laboratoryContentTitle(schema.title[language])} maxSubgroups={tree.maxSubgroups} initialNodes={tree.nodes} initialPath={tree.initialPath} columnTitles={tree.columnTitles} /></> : field.kind === 'checkbox' ? <div className="new-form-shape-checkbox"><span aria-hidden="true">□</span>{field.label[language]}</div> : <><span>{field.label[language]}</span><div className="new-form-shape-control" data-tall={field.kind === 'textarea' || undefined}>{['select', 'multiSelect', 'lookup', 'valueList'].includes(field.kind) ? '▾' : '\u00a0'}</div></>}
            </div>
          })}
          {!fields.length && <p className="new-form-shape-empty">{text('هنوز فیلدی اضافه نشده', 'No fields added yet', '尚未添加字段')}</p>}
        </div>}
        {section.kind === 'grid' && (tables.length ? tables.map(table => <div className="new-form-shape-table" key={table.id}><strong>{table.title?.[language] || names.grid}</strong><table><thead><tr>{table.columns.filter(column => column.visible !== false).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(column => <th key={column.id}>{column.label[language]}</th>)}</tr></thead><tbody>{[0, 1].map(row => <tr key={row}>{table.columns.filter(column => column.visible !== false).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(column => <td key={column.id}>—</td>)}</tr>)}</tbody></table>{!table.columns.length && <p className="new-form-shape-empty">{text('هنوز ستونی اضافه نشده', 'No columns added yet', '尚未添加列')}</p>}</div>) : <p className="new-form-shape-empty">{text('جدول خالی', 'Empty table', '空表格')}</p>)}
        {section.kind === 'footer' && <div className="new-form-shape-actions">{actions.map(action => <span key={action.id} data-primary={action.primary || undefined}>{action.keys?.join(' / ')}<b>{action.label[language]}</b></span>)}{!actions.length && <p className="new-form-shape-empty">{text('هنوز کلیدی اضافه نشده', 'No actions added yet', '尚未添加操作')}</p>}</div>}
      </section>
    })}
  </div>
  return <aside className="new-form-shape-preview" dir={fa ? 'rtl' : 'ltr'} aria-label={text('پیش‌نمایش زندهٔ شکل فرم', 'Live form shape preview', '实时表单预览')}>
    <header><span>{text('پیش‌نمایش زندهٔ شکل فرم', 'Live form shape preview', '实时表单预览')}</span>{onChange && onLayoutSettingsToggle && <button type="button" aria-expanded={layoutSettingsOpen} aria-controls="new-form-layout-settings" onClick={onLayoutSettingsToggle}>{layoutSettingsOpen ? text('بستن تنظیم چیدمان', 'Hide layout settings', '隐藏布局设置') : text('تنظیم چیدمان', 'Layout settings', '布局设置')}</button>}</header>
    {onChange && layoutSettingsOpen && <div id="new-form-layout-settings" className="new-form-quick-layout new-form-numeric-layout">
      <strong>{fa ? 'چیدمان با تعداد دلخواه' : 'Arrange by count'}</strong>
      {rows.map((row, index) => <div className="new-form-layout-row" key={index}>
        <b>{fa ? 'بخش ' : 'Block '}{index + 1}</b>
        <label>{fa ? 'نوع' : 'Type'}<select value={row.kind} onChange={event => changeRow(index, { kind: event.target.value as 'editor' | 'grid' })}><option value="editor">{fa ? 'پنل فیلدها' : 'Input panels'}</option><option value="grid">{fa ? 'جدول' : 'Tables'}</option></select></label>
        <label className="new-form-layout-count">{fa ? 'تعداد' : 'Count'}<input type="number" min={1} max={20} step={1} value={row.count || ''} onChange={event => changeRow(index, { count: event.target.value === '' ? 0 : Number(event.target.value) })} /></label>
        <label>{fa ? 'چینش داخل این بخش' : 'Within this block'}<select value={row.direction} onChange={event => changeRow(index, { direction: event.target.value as 'horizontal' | 'vertical' })}><option value="horizontal">{fa ? 'کنار هم' : 'Side by side'}</option><option value="vertical">{fa ? 'زیر هم' : 'Stacked'}</option></select></label>
        {index > 0 && <label>{fa ? 'نسبت به چیدمان قبلی' : 'Relative to preceding layout'}<select value={row.position} onChange={event => changeRow(index, { position: event.target.value as RelativePosition })}>{positions.map(item => <option value={item.id} key={item.id}>{fa ? ({ above: 'بالا', below: 'پایین', right: 'سمت راست', left: 'سمت چپ' })[item.id] : item.en}</option>)}</select></label>}
        <button type="button" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>{fa ? 'حذف از چیدمان' : 'Remove block'}</button>
      </div>)}
      <button type="button" onClick={() => setRows(current => [...current, { kind: 'grid', count: 1, direction: 'horizontal', position: 'below' }])}>{fa ? '＋ بخش بعدی' : '＋ Next block'}</button>
      <button type="button" disabled={rows.some(row => !Number.isInteger(row.count) || row.count < 1 || row.count > 20)} onClick={() => onChange(applyQuickLayout(schema, rows, fa))}>{fa ? 'اعمال / اصلاح چیدمان' : 'Apply / update layout'}</button>
      <small>{fa ? 'تعداد و محل را تغییر دهید و اعمال را بزنید. با کاهش تعداد، بخش‌های اضافهٔ همین چیدمان غیرفعال می‌شوند؛ محتوا حفظ می‌شود و با افزایش تعداد برمی‌گردند. هر پنل محل قرارگیری فیلدهاست.' : 'Change counts and positions, then apply. Surplus managed panes are disabled without deleting contents and reused when the count increases. Panels contain fields.'}</small>
    </div>}
    <div className="new-form-shape-canvas"><h3>{schema.title[language] || text('فرم جدید', 'New form', '新表单')}</h3>{render()}</div>
  </aside>
}
