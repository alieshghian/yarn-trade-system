import type {ListSettingsPatch} from './componentListSettings.ts'
import type {SystemLookupSettings} from './systemLookupSources'
import {addLibraryComponent,readComponentLibrary,writeComponentLibrary,componentLibraryKey,type ListCapabilities} from './componentBehavior.ts'
import {moveToolbarPart,type GridToolbarSettings,type GridToolbarPart} from './gridToolbarLayout.ts'
import type { FormSchemaDraft, FormSchemaField } from './formSchema.ts'
import {normalizeCodeComponentSettings,type CodeComponentSettings} from './serialCode.ts'
import type { ManagedFormFrame, FormStorage } from './laboratoryFormDraftState.ts'

/** Rename the form and its primary report together, retaining IDs, bindings and presentation. */
export function laboratoryContentTitle(name:string):string{return name.replace(/\s*[—–-]\s*آزمایشی\s*$/u,'').trim()}
export function renameLaboratoryForm(schema:FormSchemaDraft,language:'fa'|'en'|'zh',name:string):FormSchemaDraft{
 const contentName=laboratoryContentTitle(name)
 const reportTitle=language==='fa'?'گزارش '+contentName:language==='zh'?contentName+'报表':contentName+' report'
 const primary=schema.tables?.[0]
 if(schema.title[language]===name&&(!primary||primary.title?.[language]===reportTitle))return schema
 return {...schema,title:{...schema.title,[language]:name},tables:schema.tables?.map((table,index)=>index===0?{...table,title:{fa:'',en:'',zh:'',...table.title,[language]:reportTitle}}:table)}
}

export type FieldBlueprint = { id: string; name: string; kind: FormSchemaField['kind']; componentId: string; componentDefinitionId?:string; componentPresetId?:string; behaviorOverrides?:Partial<ListCapabilities>;valueType: NonNullable<FormSchemaField['valueType']>; multiline?: boolean; componentSettings?:Partial<CodeComponentSettings>; packagingVolumeSettings?:import('./packagingVolume').PackagingVolumeSettings; derivedSettings?:import('./derivedField').DerivedFieldSettings; suggestToday?:boolean;listSettings?:ListSettingsPatch;lookupSettings?:SystemLookupSettings }
export const localBlueprintsKey = (userId?: string) => `yarn-trade:developer-field-blueprints:v1:${encodeURIComponent(userId || 'local')}`
export function loadFieldBlueprints(storage: FormStorage | null | undefined, userId?: string): FieldBlueprint[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(localBlueprintsKey(userId)) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is FieldBlueprint => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.componentId === 'string' && ['text', 'number', 'date', 'textarea', 'valueList', 'select', 'lookup'].includes(item.kind) && ['text', 'number', 'alphanumeric'].includes(item.valueType))).map(item=>({...item,...(item.componentSettings?{componentSettings:normalizeCodeComponentSettings(item.componentSettings)}:{})})) : []
  } catch { return [] }
}
export function saveFieldBlueprint(storage: FormStorage | null | undefined, userId: string | undefined, blueprint: FieldBlueprint): FieldBlueprint[] | null {
  if (!storage) return null
  try {
    const current = loadFieldBlueprints(storage, userId)
    if (current.some(item => item.id === blueprint.id)) return null
    const library=readComponentLibrary(storage)
    const definition=library.components.find(item=>item.id===blueprint.id)
    const updated=definition?library:addLibraryComponent(library,blueprint.id,blueprint.name,blueprint.componentId,blueprint.componentDefinitionId??blueprint.componentId,blueprint.behaviorOverrides,blueprint.componentSettings)
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
  const fullWidth = blueprint.componentId === 'base-form.cascading-tree-panels'
  const field: FormSchemaField = { id, sectionId, minTracks: 1, span: fullWidth ? columns : Math.min(5, columns), label: { fa: label.trim(), en: label.trim(), zh: label.trim() }, kind: ['base-form.code-input','base-form.incremental-code','base-form.derived-display'].includes(blueprint.componentId)?'text':blueprint.kind, componentId: blueprint.componentId, valueType: ['base-form.code-input','base-form.incremental-code','base-form.derived-display'].includes(blueprint.componentId)?'text':blueprint.valueType, labelPolicy: 'editable', ...(blueprint.componentId==='base-form.derived-display'?{readOnly:true}:{}),...(blueprint.componentId==='base-form.code-input'||blueprint.componentId==='base-form.incremental-code'?{required:blueprint.componentSettings?.required??true,validation:blueprint.componentSettings?.unique===false?undefined:[{type:'unique' as const}]}:{}), settings: { ...(blueprint.componentDefinitionId?{componentDefinitionId:blueprint.componentDefinitionId}:{}), ...(blueprint.listSettings?{listSettings:structuredClone(blueprint.listSettings)}:{}),...(blueprint.lookupSettings?{lookupSettings:structuredClone(blueprint.lookupSettings)}:{}),...(blueprint.packagingVolumeSettings?{packagingVolumeSettings:structuredClone(blueprint.packagingVolumeSettings)}:{}),...(blueprint.multiline ? { multiline: true } : {}), ...(blueprint.componentSettings?{componentSettings:blueprint.componentSettings}:{}), ...(blueprint.derivedSettings?{derivedSettings:blueprint.derivedSettings}:{}), ...(blueprint.suggestToday?{suggestToday:true}:{}), layout: { grid: { columns, columnStart: 1, columnSpan: fullWidth ? columns : Math.min(5, columns), rowStart: Math.max(0, ...rows) + 1 } } } }
  return { ...schema, fields: [...schema.fields, field] }
}

/** Match the effective legacy list renderer without rewriting saved field metadata. */
export function effectiveFieldComponentId(field: FormSchemaField): string {
 if(field.componentId!=='definition.field')return field.componentId
 if(field.kind==='valueList'||['select','lookup'].includes(field.kind)&&Boolean(field.settings?.listSettings))return 'base-form.value-list'
 return field.componentId
}
/** Resolve identity from the saved draft and the same kind/settings used by its renderer. */
export function fieldComponentChoice(field: FormSchemaField, keys: readonly string[]): string {
 const componentId=effectiveFieldComponentId(field)
 const candidates=[
  'blueprint:'+field.settings?.componentDefinitionId,
  'preset:'+field.settings?.componentPresetId,
  ...(componentId==='definition.field'?(['text','number'].includes(field.kind)?['ordinary']:[]):['component:'+componentId])
 ]
 return candidates.find(key=>keys.includes(key))??'current'
}

/** Convert an existing field in place, keeping its identity, value binding, layout, rules and links. */
export function convertDocumentFieldToComponent(schema: FormSchemaDraft, fieldId: string, blueprint: Omit<FieldBlueprint, 'id' | 'name'>): FormSchemaDraft {
  const current = schema.fields.find(field => field.id === fieldId)
  if (!current || !blueprint.componentId || !blueprint.kind) return schema

  const isCode = ['base-form.code-input', 'base-form.incremental-code'].includes(blueprint.componentId)
  const isDerived = blueprint.componentId === 'base-form.derived-display'
  const currentSettings = { ...current.settings }
  const oldDerivedSettings = currentSettings.derivedSettings as import('./derivedField').DerivedFieldSettings | undefined
  const derivedOriginal = currentSettings.derivedEditorOriginal as { readOnly?: boolean } | undefined
  delete currentSettings.componentPresetId
  delete currentSettings.componentDefinitionId
  delete currentSettings.componentSettings
  delete currentSettings.derivedSettings
  delete currentSettings.derivedEditorOriginal
  delete currentSettings.multiline
  delete currentSettings.suggestToday

  if(blueprint.packagingVolumeSettings)currentSettings.packagingVolumeSettings=structuredClone(blueprint.packagingVolumeSettings)
  else if(blueprint.componentId!=='base-form.packaging-volume')delete currentSettings.packagingVolumeSettings
  if(blueprint.listSettings)currentSettings.listSettings=structuredClone(blueprint.listSettings)
  if(blueprint.lookupSettings)currentSettings.lookupSettings=structuredClone(blueprint.lookupSettings)
  else if(blueprint.componentId!=='base-form.system-lookup')delete currentSettings.lookupSettings
  if (blueprint.componentPresetId) currentSettings.componentPresetId = blueprint.componentPresetId
  if (blueprint.componentDefinitionId) currentSettings.componentDefinitionId = blueprint.componentDefinitionId
  if (blueprint.multiline) currentSettings.multiline = true
  if (blueprint.suggestToday) currentSettings.suggestToday = true
  if (isCode) {
    const supplied = blueprint.componentSettings ?? (current.componentId === blueprint.componentId
      ? current.settings?.componentSettings as Partial<CodeComponentSettings> | undefined
      : undefined)
    const settings = normalizeCodeComponentSettings(supplied)
    currentSettings.componentSettings = settings
  } else if (blueprint.componentSettings) {
    currentSettings.componentSettings = normalizeCodeComponentSettings(blueprint.componentSettings)
  }
  if (isDerived) {
    currentSettings.derivedSettings = blueprint.derivedSettings ?? (current.componentId === 'base-form.derived-display' && oldDerivedSettings
      ? { ...structuredClone(oldDerivedSettings),sourceFieldIds: [...(oldDerivedSettings.sourceFieldIds ?? [])], separator: oldDerivedSettings.separator ?? ' ' }
      : { sourceFieldIds: [], separator: ' ' })
  } else if (blueprint.derivedSettings) {
    currentSettings.derivedSettings = blueprint.derivedSettings
  }

  const kind: FormSchemaField['kind'] = isCode || isDerived ? 'text' : blueprint.kind
  const valueType: FormSchemaField['valueType'] = isCode || isDerived ? 'text' : blueprint.valueType
  const previousReadOnly = current.componentId === 'base-form.derived-display' ? derivedOriginal?.readOnly : current.readOnly
  const nextField: FormSchemaField = {
    ...current,
    componentId: blueprint.componentId,
    kind,
    valueType,
    readOnly: isDerived ? true : previousReadOnly,
    settings: currentSettings,
    ...(isCode ? {
      required: (currentSettings.componentSettings as CodeComponentSettings).required,
      validation: [
        ...(current.validation ?? []).filter(rule => rule.type !== 'unique'),
        ...((currentSettings.componentSettings as CodeComponentSettings).unique ? [{ type: 'unique' as const }] : [])
      ]
    } : {})
  }
  return { ...schema, fields: schema.fields.map(field => field.id === fieldId ? nextField : field) }
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

/** Remove only optional footer actions, atomically preserving required actions and schema identity on a no-op. */
export function removeOptionalDocumentActions(schema: FormSchemaDraft, actionIds: readonly string[]): FormSchemaDraft {
  const requested = new Set(actionIds)
  const removable = new Set((schema.actions ?? []).filter(action => requested.has(action.id) && !action.required).map(action => action.id))
  if (!removable.size) return schema
  return { ...schema, actions: schema.actions?.filter(action => !removable.has(action.id)) }
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
