import { useState, type ReactNode } from 'react'
import type { FormSchemaDraft } from './formSchema'
import { formSectionChildren, moveFormSection, updateFormSection } from './formDocumentStructure'
import './laboratoryFormBuilder.css'

/** Edits the same section tree used by FormSchemaPresentation, never a second layout. */
export function FormCompositionPreview({ schema, language, onChange }: { schema: FormSchemaDraft; language: 'fa' | 'en' | 'zh'; onChange: (schema: FormSchemaDraft) => void }) {
  const [selected, setSelected] = useState('')
  const fa = language === 'fa'
  const active = schema.sections.find(section => section.id === selected)
  const names = { editor: fa ? 'پنل' : 'Panel', grid: fa ? 'جدول' : 'Table', group: fa ? 'گروه' : 'Group', footer: fa ? 'کلیدها' : 'Actions' }
  const render = (parentId?: string, ancestors: string[] = []): ReactNode => <div className="form-composition-preview-children" style={{ flexDirection: (parentId ? schema.sections.find(section => section.id === parentId)?.layout?.direction : schema.layout?.direction) === 'horizontal' ? 'row' : 'column' }}>
    {formSectionChildren(schema, parentId).filter(section => !ancestors.includes(section.id)).map(section => <div key={section.id} className="form-composition-preview-part" data-selected={section.id === selected || undefined} draggable
      onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-form-section', section.id); setSelected(section.id) }}
      onDragOver={event => { event.preventDefault(); event.stopPropagation() }}
      onDrop={event => {
        event.preventDefault(); event.stopPropagation()
        const source = event.dataTransfer.getData('application/x-form-section')
        if (!source || source === section.id || !schema.sections.some(item => item.id === source)) return
        const next = updateFormSection(schema, source, { parentId: section.kind === 'group' ? section.id : section.parentId ?? null })
        if (next === schema) return
        const siblings = formSectionChildren(next, section.parentId ?? undefined).filter(item => item.id !== source)
        const order = section.kind === 'group' ? undefined : siblings.findIndex(item => item.id === section.id)
        if (order === undefined) onChange(next)
        else { siblings.splice(order, 0, next.sections.find(item => item.id === source)!); const positions = new Map(siblings.map((item, index) => [item.id, index])); onChange({ ...next, sections: next.sections.map(item => positions.has(item.id) ? { ...item, order: positions.get(item.id) } : item) }) }
      }} onClick={event => { event.stopPropagation(); setSelected(section.id) }}>
      <strong>{section.title?.[language] || names[section.kind]}</strong><small>{names[section.kind]} · {schema.fields.filter(field => field.sectionId === section.id).length}</small>
      {section.kind === 'group' && render(section.id, [...ancestors, section.id])}
      {section.kind === 'grid' && <div className="form-composition-preview-grid">▤</div>}
    </div>)}
  </div>
  return <fieldset className="form-composition-preview"><legend>{fa ? 'چیدمان دیداری پنل‌ها و جدول‌ها' : 'Panel and table composition'}</legend>
    {render()}
    {active && <div className="form-document-settings-buttons">
      <span>{active.title?.[language] || names[active.kind]}</span>
      <button type="button" onClick={() => onChange(moveFormSection(schema, active.id, -1))}>{fa ? 'قبل' : 'Before'}</button>
      <button type="button" onClick={() => onChange(moveFormSection(schema, active.id, 1))}>{fa ? 'بعد' : 'After'}</button>
      <label>{fa ? 'گروه مقصد' : 'Parent group'}<select value={active.parentId ?? ''} onChange={event => onChange(updateFormSection(schema, active.id, { parentId: event.target.value || null }))}><option value="">{fa ? 'سطح اصلی' : 'Root'}</option>{schema.sections.filter(section => section.kind === 'group' && section.id !== active.id).map(section => <option key={section.id} value={section.id}>{section.title?.[language] || section.id}</option>)}</select></label>
      {active.kind === 'group' && <label>{fa ? 'چیدمان' : 'Direction'}<select value={active.layout?.direction ?? 'vertical'} onChange={event => onChange(updateFormSection(schema, active.id, { layout: { ...active.layout, direction: event.target.value as 'horizontal' | 'vertical' } }))}><option value="horizontal">{fa ? 'کنار هم' : 'Side by side'}</option><option value="vertical">{fa ? 'زیر هم' : 'Stacked'}</option></select></label>}
    </div>}
  </fieldset>
}
