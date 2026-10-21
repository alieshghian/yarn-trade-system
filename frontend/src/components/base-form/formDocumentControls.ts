import {addLibraryComponent,readComponentLibrary,writeComponentLibrary,componentLibraryKey,type ListCapabilities} from './componentBehavior.ts'
import {moveToolbarPart,type GridToolbarSettings,type GridToolbarPart} from './gridToolbarLayout.ts'
import type { FormSchemaDraft, FormSchemaField } from './formSchema.ts'
import {normalizeCodeComponentSettings,type CodeComponentSettings} from './serialCode.ts'
import type { ManagedFormFrame, FormStorage } from './laboratoryFormDraftState.ts'

export type FieldBlueprint = { id: string; name: string; kind: FormSchemaField['kind']; componentId: string; componentDefinitionId?:string; behaviorOverrides?:Partial<ListCapabilities>;valueType: NonNullable<FormSchemaField['valueType']>; multiline?: boolean; componentSettings?:Partial<CodeComponentSettings>; suggestToday?:boolean }
export const localBlueprintsKey = (userId?: string) => `yarn-trade:developer-field-blueprints:v1:${encodeURIComponent(userId || 'local')}`
export function loadFieldBlueprints(storage: FormStorage | null | undefined, userId?: string): FieldBlueprint[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(localBlueprintsKey(userId)) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is FieldBlueprint => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.componentId === 'string' && ['text', 'number', 'date', 'textarea', 'valueList', 'select'].includes(item.kind) && ['text', 'number', 'alphanumeric'].includes(item.valueType))).map(item=>({...item,...(item.componentSettings?{componentSettings:normalizeCodeComponentSettings(item.componentSettings)}:{})})) : []
  } catch { return [] }
}
export function saveFieldBlueprint(storage: FormStorage | null | undefined, userId: string | undefined, blueprint: FieldBlueprint): FieldBlueprint[] | null {
  if (!storage) return null
  try {
    const current = loadFieldBlueprints(storage, userId)
    if (current.some(item => item.id === blueprint.id)) return null
    const library=readComponentLibrary(storage)
    const definition=library.components.find(item=>item.id===blueprint.id)
    const updated=definition?library:addLibraryComponent(library,blueprint.id,blueprint.name,blueprint.componentId,blueprint.componentDefinitionId??blueprint.componentId,blueprint.behaviorOverrides)
    const next = [...current, {...blueprint,componentDefinitionId:blueprint.id}]
    const previousLibrary=storage.getItem(componentLibraryKey)
    try{writeComponentLibrary(storage,updated);storage.setItem(localBlueprintsKey(userId), JSON.stringify(next))}
    catch(error){if(previousLibrary!==null)storage.setItem(componentLibraryKey,previousLibrary);throw error}
    return next
  } catch { return null }
}

/** New instances have unique IDs and no business binding or handler. */
export function addDocumentField(schema: FormSchemaDraft, sectionId: string, id: string, label: string, blueprint: Omit<FieldBlueprint, 'id' | 'name'>): FormSchemaDraft {
  if (!label.trim() || schema.fields.some(field => field.id === id) || !schema.sections.some(section => section.id === sectionId && section.kind === 'editor')) return schema
  const siblings = schema.fields.filter(field => field.sectionId === sectionId)
  const rows = siblings.map(field => Number((field.settings?.layout as { grid?: { rowStart?: number } } | undefined)?.grid?.rowStart) || 1)
  const columns = schema.sections.find(section => section.id === sectionId)?.layout?.columns ?? 20
  const field: FormSchemaField = { id, sectionId, minTracks: 1, span: Math.min(5, columns), label: { fa: label.trim(), en: label.trim(), zh: label.trim() }, kind: blueprint.kind, componentId: blueprint.componentId, valueType: blueprint.valueType, labelPolicy: 'editable',...(blueprint.componentId==='base-form.code-input'||blueprint.componentId==='base-form.incremental-code'?{required:blueprint.componentSettings?.required??true,validation:blueprint.componentSettings?.unique===false?undefined:[{type:'unique' as const}]}:{}), settings: { ...(blueprint.componentDefinitionId?{componentDefinitionId:blueprint.componentDefinitionId}:{}), ...(blueprint.multiline ? { multiline: true } : {}), ...(blueprint.componentSettings?{componentSettings:blueprint.componentSettings}:{}), ...(blueprint.suggestToday?{suggestToday:true}:{}), layout: { grid: { columns, columnStart: 1, columnSpan: Math.min(5, columns), rowStart: Math.max(0, ...rows) + 1 } } } }
  return { ...schema, fields: [...schema.fields, field] }
}

export function addTableHeaderRow(schema: FormSchemaDraft, tableId: string, id: string, toolbarPanelId?:string): FormSchemaDraft {
  const table = schema.tables?.find(item => item.id === tableId)
  if (!table || schema.sections.some(section => section.id === id)) return schema
  const number = schema.sections.filter(section => section.tableHeaderFor === tableId).length + 1
  return { ...schema, sections: [...schema.sections, { id, kind: 'editor', tableHeaderFor: tableId, purpose: 'reporting', ...(toolbarPanelId?{settings:{toolbarPanelId}}:{}), title: { fa: `ردیف گزارش ${number}`, en: `Report row ${number}`, zh: `报表行 ${number}` }, layout: { columns: 20, direction: 'horizontal', gap: 12 } }] }
}

export function setTableMaster(schema: FormSchemaDraft, tableId: string, masterTableId: string, masterField = '', detailField = '', instruction = ''): FormSchemaDraft {
  if (masterTableId) {
    const visited = new Set([tableId])
    let parent: string | undefined = masterTableId
    while (parent) {
      if (visited.has(parent)) return schema
      visited.add(parent)
      const table = schema.tables?.find(item => item.id === parent)
      if (!table) return schema
      parent = table.masterDetail?.masterTableId
    }
  }
  return { ...schema, tables: schema.tables?.map(table => table.id === tableId ? { ...table, masterDetail: masterTableId ? { masterTableId, masterField, detailField, instruction } : undefined } : table) }
}

export function addDocumentAction(schema: FormSchemaDraft, sectionId: string, id: string, label: string): FormSchemaDraft {
  if (!label.trim() || schema.actions?.some(action => action.id === id) || !schema.sections.some(section => section.id === sectionId && section.kind === 'footer')) return schema
  return { ...schema, actions: [...schema.actions ?? [], { id, sectionId, code: '', label: { fa: label.trim(), en: label.trim(), zh: label.trim() }, required: false, keys: [] }] }
}

/** Editing text is allowed to be temporarily empty; only complete numbers update the document. */
export function parseFrameDimension(text: string, nullable = false): number | null | undefined {
  if (!text.trim()) return nullable ? null : undefined
  const normalized = text.replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
  if (!/^\d+$/.test(normalized)) return undefined
  const value = Number(normalized)
  return value >= 320 && value <= 2400 ? value : undefined
}
export function copyFormDimensions(target: ManagedFormFrame, source: ManagedFormFrame): ManagedFormFrame {
  return { ...target, width: source.width, height: source.height, fitToPage: false }
}

/** Sidebar and context menu share one atomic schema command. Existing panels stay untouched. */
export function addToolbarHeaderPanel(schema:FormSchemaDraft,tableId:string,panel:GridToolbarPart,rowId:string,placement:'below'|'beside'):FormSchemaDraft {
 const table=schema.tables?.find(table=>table.id===tableId);if(!table)return schema
 const toolbar=moveToolbarPart((table.settings?.toolbar??{}) as GridToolbarSettings,panel,{width:placement==='beside'?360:undefined,placement})
 const next=addTableHeaderRow(schema,tableId,rowId,panel)
 return {...next,tables:next.tables?.map(item=>item.id===tableId?{...item,settings:{...item.settings,toolbar}}:item)}
}
