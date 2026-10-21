import type { FormSchemaDraft, FormSchemaSection } from './formSchema.ts'

export type FormSectionKind = FormSchemaSection['kind']

export function formSectionChildren(schema: Pick<FormSchemaDraft, 'sections'>, parentId?: string): FormSchemaSection[] {
  return schema.sections.filter(section => section.enabled !== false && !section.tableHeaderFor && (section.parentId || undefined) === parentId)
    .map((section, index) => ({ section, index }))
    .sort((a, b) => (a.section.order ?? a.index) - (b.section.order ?? b.index))
    .map(item => item.section)
}

export function usesFormComposition(schema: Pick<FormSchemaDraft, 'sections' | 'layout'>): boolean {
  // A table's report rows belong to its header, not to the form's outer panes.
  // Counting them as input panels discarded the editor/grid splitter and expanded
  // the main saved Canvas to its full height whenever a header row was added.
  const sections=schema.sections.filter(section=>!section.tableHeaderFor)
  return schema.layout?.direction === 'horizontal' || formSectionChildren(schema).map(section => section.kind).join(',') !== 'editor,grid,footer' || sections.length !== 3 || sections.some(section => section.kind === 'group' || section.parentId || section.enabled === false || section.initialSize)
    || ['editor', 'grid', 'footer'].some(kind => sections.filter(section => section.kind === kind).length !== 1)
}

export function updateFormSection(schema: FormSchemaDraft, id: string, patch: Partial<FormSchemaSection>): FormSchemaDraft {
  const current = schema.sections.find(section => section.id === id)
  if (!current) return schema
  if (patch.parentId) {
    let parent = schema.sections.find(section => section.id === patch.parentId)
    const visited = new Set([id])
    while (parent) {
      if (visited.has(parent.id) || parent.kind !== 'group') return schema
      visited.add(parent.id)
      parent = schema.sections.find(section => section.id === parent!.parentId)
    }
  }
  return { ...schema, sections: schema.sections.map(section => section.id === id ? { ...section, ...patch, id: section.id } : section) }
}

export function addFormSection(schema: FormSchemaDraft, kind: FormSectionKind, id: string): FormSchemaDraft {
  if (schema.sections.some(section => section.id === id)) return schema
  const labels = { editor: { fa: 'پنل ورودی', en: 'Input panel', zh: '输入面板' }, grid: { fa: 'جدول', en: 'Table', zh: '表格' }, footer: { fa: 'نوار کلیدها', en: 'Action bar', zh: '操作栏' }, group: { fa: 'گروه بخش‌ها', en: 'Section group', zh: '区块组' } }
  const number = schema.sections.filter(item => item.kind === kind).length + 1
  const title = { fa: `${labels[kind].fa} ${number}`, en: `${labels[kind].en} ${number}`, zh: `${labels[kind].zh} ${number}` }
  const section: FormSchemaSection = { id, kind, title, order: schema.sections.length, layout: { direction: 'vertical', gap: 12, ...(kind === 'editor' ? { columns: 20 } : {}) } }
  const sourceTable = schema.tables?.[0]
  const tableId = `${id}.table`
  const tables = kind === 'grid' ? [...schema.tables ?? [], { ...(sourceTable ? structuredClone(sourceTable) : { dataSourceId: 'local.synthetic', columns: [] }), id: tableId, sectionId: id, title }] : schema.tables
  const roots = schema.sections.filter(item => !item.parentId).sort((a, b) => (a.order ?? schema.sections.indexOf(a)) - (b.order ?? schema.sections.indexOf(b)))
  const before = roots.findIndex(item => kind === 'editor' ? item.kind !== 'editor' : item.kind === 'footer')
  roots.splice(before < 0 ? roots.length : before, 0, section)
  const positions = new Map(roots.map((item, order) => [item.id, order]))
  return { ...schema, sections: [...schema.sections, { ...section, ...(kind === 'grid' ? { tableIds: [tableId] } : {}) }].map(item => positions.has(item.id) ? { ...item, order: positions.get(item.id) } : item), tables }
}

export function moveFormSection(schema: FormSchemaDraft, id: string, delta: -1 | 1): FormSchemaDraft {
  const section = schema.sections.find(item => item.id === id)
  if (!section) return schema
  const siblings = schema.sections.filter(item => item.parentId === section.parentId).sort((a, b) => (a.order ?? schema.sections.indexOf(a)) - (b.order ?? schema.sections.indexOf(b)))
  const index = siblings.findIndex(item => item.id === id)
  if (index + delta < 0 || index + delta >= siblings.length) return schema
  ;[siblings[index], siblings[index + delta]] = [siblings[index + delta], siblings[index]]
  const order = new Map(siblings.map((item, position) => [item.id, position]))
  return { ...schema, sections: schema.sections.map(item => order.has(item.id) ? { ...item, order: order.get(item.id) } : item) }
}

export function assignFormFieldSection(schema: FormSchemaDraft, fieldId: string, sectionId: string): FormSchemaDraft {
  if (!schema.sections.some(section => section.id === sectionId && section.kind === 'editor')) return schema
  return { ...schema, fields: schema.fields.map(field => field.id === fieldId ? { ...field, sectionId } : field) }
}

export function sectionFormSchema(schema: FormSchemaDraft, section: FormSchemaSection): FormSchemaDraft {
  return { ...schema, fields: schema.fields.filter(field => field.sectionId === section.id), sections: [section] }
}
