import type { FormSchemaDraft } from './formSchema'
import { addFormSection, formSectionChildren } from './formDocumentStructure'

export type RelativePosition = 'above' | 'below' | 'left' | 'right'
export type QuickLayoutRow = { kind: 'editor' | 'grid'; count: number; direction: 'horizontal' | 'vertical'; position: RelativePosition }

function appendEmptySection(schema: FormSchemaDraft, kind: 'editor' | 'grid' | 'footer', id: string): FormSchemaDraft {
  const next = addFormSection(schema, kind, id)
  // A new table has its own columns and bindings; never inherit another table's relation.
  return kind === 'grid' ? { ...next, tables: next.tables?.map(table => table.sectionId === id ? { id: table.id, sectionId: id, title: table.title, dataSourceId: 'local.synthetic', columns: [] } : table) } : next
}

/** Wrap only the two affected sections; preserve all other sections and their contents. */
export function placeSectionBeside(schema: FormSchemaDraft, sourceId: string, targetId: string, position: RelativePosition, rtl: boolean): FormSchemaDraft {
  if (sourceId === targetId) return schema
  const source = schema.sections.find(item => item.id === sourceId), target = schema.sections.find(item => item.id === targetId)
  if (!source || !target) return schema
  let parent = target.parentId
  while (parent) { if (parent === sourceId) return schema; parent = schema.sections.find(item => item.id === parent)?.parentId }
  const horizontal = position === 'left' || position === 'right'
  const before = horizontal ? (rtl ? position === 'right' : position === 'left') : position === 'above'
  const groupId = 'layout.' + crypto.randomUUID()
  const group = { id: groupId, kind: 'group' as const, parentId: target.parentId, order: target.order ?? schema.sections.indexOf(target), layout: { direction: horizontal ? 'horizontal' as const : 'vertical' as const, gap: 12 }, settings: { quickLayoutGroup: true } }
  return pruneEmptyGroups({ ...schema, sections: [...schema.sections.map(item => item.id === sourceId || item.id === targetId ? { ...item, parentId: groupId, order: item.id === sourceId ? (before ? 0 : 1) : (before ? 1 : 0) } : item), group] })
}

function pruneEmptyGroups(schema: FormSchemaDraft): FormSchemaDraft {
  let sections = schema.sections
  for (let i = 0; i < schema.sections.length; i++) {
    const empty = new Map(sections.filter(section => section.kind === 'group' && section.settings?.quickLayoutGroup && !sections.some(item => item.parentId === section.id && item.enabled !== false)).map(section => [section.id, section.parentId]))
    const next = sections.filter(section => !empty.has(section.id)).map(section => section.parentId && empty.has(section.parentId) ? { ...section, parentId: empty.get(section.parentId) } : section)
    if (next.length === sections.length) break
    sections = next
  }
  return { ...schema, sections }
}

export function addRelativeSection(schema: FormSchemaDraft, kind: 'editor' | 'grid' | 'footer', targetId: string, position: RelativePosition, rtl: boolean): FormSchemaDraft {
  const id = 'section.' + crypto.randomUUID()
  if (!schema.sections.some(section => section.id === targetId)) return schema
  return placeSectionBeside(appendEmptySection(schema, kind, id), id, targetId, position, rtl)
}

/** Reuse stable pane IDs; reducing a managed row hides surplus panes without deleting contents. */
export function applyQuickLayout(schema: FormSchemaDraft, rows: readonly QuickLayoutRow[], rtl = false): FormSchemaDraft {
  if (!rows.length || rows.some(row => !Number.isInteger(row.count) || row.count < 1 || row.count > 20)) return schema
  let next = schema
  const used = new Set<string>(), groups: string[] = []
  for (const row of rows) {
    const ids: string[] = []
    for (let i = 0; i < row.count; i++) {
      const eligible = next.sections.filter(item => item.kind === row.kind && (item.enabled !== false || item.settings?.quickLayoutManaged) && !item.tableHeaderFor && !used.has(item.id))
      let section = eligible.find(item => item.enabled !== false) ?? eligible[0]
      if (!section) { const id = 'section.' + crypto.randomUUID(); next = appendEmptySection(next, row.kind, id); section = next.sections.find(item => item.id === id)! }
      used.add(section.id); ids.push(section.id)
    }
    const groupId = 'layout.' + crypto.randomUUID(); groups.push(groupId)
    next = { ...next, sections: [...next.sections.map(item => ids.includes(item.id) ? { ...item, enabled: true, parentId: groupId, order: ids.indexOf(item.id), settings: { ...item.settings, quickLayoutManaged: true } } : item), { id: groupId, kind: 'group', order: groups.length - 1, layout: { direction: row.direction, gap: 12 }, settings: { quickLayoutGroup: true } }] }
  }
  next = { ...next, sections: next.sections.map(item => item.settings?.quickLayoutManaged && !used.has(item.id) ? { ...item, enabled: false } : item) }
  next = pruneEmptyGroups(next)
  let block = groups[0]
  for (let index = 1; index < groups.length; index++) {
    next = placeSectionBeside(next, groups[index], block, rows[index].position, rtl)
    block = next.sections.find(item => item.id === groups[index])!.parentId!
  }
  const rest = formSectionChildren(next).filter(item => item.id !== block)
  const order = new Map([block, ...rest.filter(item => item.kind !== 'footer').map(item => item.id), ...rest.filter(item => item.kind === 'footer').map(item => item.id)].map((id, index) => [id, index]))
  return { ...next, layout: { ...next.layout, direction: 'vertical' }, settings: { ...next.settings, specific: { ...next.settings?.specific, values: { ...next.settings?.specific?.values, quickLayoutRows: structuredClone(rows) } } }, sections: next.sections.map(item => order.has(item.id) ? { ...item, order: order.get(item.id) } : item) }
}
