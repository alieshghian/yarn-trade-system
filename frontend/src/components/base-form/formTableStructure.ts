import type { FormSchemaDraft, FormSchemaTableColumn } from './formSchema'

export const laboratoryColumnFieldLinks: Record<string, readonly string[]> = { personCode: ['personCode'], displayName: ['firstName', 'lastName'], job: ['jobId'], nationality: ['nationalityId'], mobile: ['mobile'], address: ['address'] }
export function columnSourceFields(schema: FormSchemaDraft, column: FormSchemaTableColumn): readonly string[] {
  return column.sourceFieldIds ?? (column.binding.kind === 'formField' ? [column.binding.fieldId] : (schema.templateFormId === 'form-laboratory.persons-synthetic' || schema.id === 'form-laboratory.persons-synthetic') && column.binding.kind === 'dataField' && column.binding.dataFieldId === column.id ? laboratoryColumnFieldLinks[column.id] ?? [] : [])
}
export function composeColumnFieldValue(values: readonly unknown[], column: Pick<FormSchemaTableColumn, 'valueComposition' | 'valueSeparator'>): string {
  const separator = column.valueComposition === 'direct' ? '' : column.valueComposition === 'comma' ? '، ' : column.valueComposition === 'newline' ? '\n' : column.valueComposition === 'custom' ? (column.valueSeparator ?? '') : ' '
  return values.map(value => value == null ? '' : String(value)).filter(value => value !== '').join(separator)
}

export function columnLabelMismatch(schema: FormSchemaDraft, column: FormSchemaTableColumn, locale: 'fa' | 'en' | 'zh'): string[] {
  if (column.labelSyncDecision === 'independent') return []
  const sourceIds = columnSourceFields(schema, column)
  const renamedSources = sourceIds.filter(id => { const snapshot=column.sourceFieldLabelSnapshot?.[id];const field=schema.fields.find(item=>item.id===id);return Boolean(snapshot&&field&&snapshot[locale].trim()!==field.label[locale].trim()) })
  const headerChanged = Boolean(column.labelSnapshot && column.labelSnapshot[locale].trim() !== column.label[locale].trim())
  if (column.labelSyncDecision === 'primary-field') {
    const primary = schema.fields.find(field => field.id === (column.labelSyncFieldId ?? sourceIds[0]))
    return [...new Set([...renamedSources,...(headerChanged?sourceIds:[]),...(primary && primary.label[locale].trim() !== column.label[locale].trim() ? [primary.id] : [])])]
  }
  if (sourceIds.length === 1) {
    const source = schema.fields.find(field => field.id === sourceIds[0])
    return [...new Set([...renamedSources,...(headerChanged?sourceIds:[]),...(source && source.label[locale].trim() !== column.label[locale].trim() ? [source.id] : [])])]
  }
  if (sourceIds.length > 1 && (headerChanged || !sourceIds.some(id => schema.fields.find(field => field.id === id)?.label[locale].trim() === column.label[locale].trim()))) return [...new Set([...renamedSources,...sourceIds])]
  return renamedSources
}

export function syncColumnLabelToField(schema: FormSchemaDraft, tableId: string, columnId: string, locale: 'fa' | 'en' | 'zh', targetFieldId?:string): FormSchemaDraft {
  const column = schema.tables?.find(table => table.id === tableId)?.columns.find(item => item.id === columnId)
  const sourceIds = column ? columnSourceFields(schema, column) : []
  const sourceId = column && sourceIds.length ? targetFieldId&&sourceIds.includes(targetFieldId)?targetFieldId:sourceIds[0] : undefined
  if (!column || !sourceId) return schema
  const fields=schema.fields.map(field=>field.id===sourceId?{...field,label:{...field.label,[locale]:column.label[locale]}}:field)
  const snapshot=Object.fromEntries(fields.filter(field=>sourceIds.includes(field.id)).map(field=>[field.id,{...field.label}]))
  return { ...schema, tables: schema.tables?.map(table => table.id === tableId ? { ...table, columns: table.columns.map(item => item.id === columnId ? { ...item, labelSnapshot:{...item.label}, sourceFieldLabelSnapshot:snapshot, labelSyncDecision: sourceIds.length > 1 ? 'primary-field' : undefined, labelSyncFieldId: sourceIds.length > 1 ? sourceId : undefined } : item) } : table), fields }
}

export function syncColumnLabelFromField(schema: FormSchemaDraft, tableId: string, columnId: string, fieldId: string, locale: 'fa' | 'en' | 'zh'): FormSchemaDraft {
  const column = schema.tables?.find(table => table.id === tableId)?.columns.find(item => item.id === columnId)
  const field = schema.fields.find(item => item.id === fieldId)
  if (!column || !field || !columnSourceFields(schema, column).includes(fieldId)) return schema
  const sourceIds = columnSourceFields(schema, column)
  const snapshot=Object.fromEntries(schema.fields.filter(item=>sourceIds.includes(item.id)).map(item=>[item.id,{...item.label}]))
  return { ...schema, tables: schema.tables?.map(table => table.id === tableId ? { ...table, columns: table.columns.map(item => item.id === columnId ? { ...item, label: { ...item.label, [locale]: field.label[locale] }, labelSnapshot:{...item.label,[locale]:field.label[locale]}, sourceFieldLabelSnapshot:snapshot, labelSyncDecision: sourceIds.length > 1 ? 'primary-field' : undefined, labelSyncFieldId: sourceIds.length > 1 ? fieldId : undefined } : item) } : table) }
}

export function keepColumnLabelIndependent(schema: FormSchemaDraft, tableId: string, columnId: string): FormSchemaDraft {
  return { ...schema, tables: schema.tables?.map(table => table.id === tableId ? { ...table, columns: table.columns.map(column => column.id === columnId ? { ...column, labelSyncDecision: 'independent' } : column) } : table) }
}

export function syncLinkedColumnLabelsForField(schema: FormSchemaDraft, fieldId: string, label: FormSchemaDraft['fields'][number]['label']): FormSchemaDraft {
  return { ...schema, tables: schema.tables?.map(table => ({ ...table, columns: table.columns.map(column => { const sourceIds=columnSourceFields(schema,column);const followsField=column.labelSyncDecision==='primary-field'?(column.labelSyncFieldId??sourceIds[0])===fieldId:column.labelSyncDecision!=='independent'&&sourceIds.length===1&&sourceIds[0]===fieldId;return followsField?{...column,label}:column }) })) }
}

/** Explicit schema links first; legacy Laboratory links are installed at template creation. */
export function unresolvedTableColumns(schema: FormSchemaDraft, tableId: string): FormSchemaTableColumn[] {
  const ids = new Set(schema.fields.map(field => field.id))
  return (schema.tables?.find(table => table.id === tableId)?.columns ?? []).filter(column => {
    const source = columnSourceFields(schema, column)
    return (column.requiresSourceDecision || source.some(id => !ids.has(id))) && !(column.independentPurpose?.trim())
  })
}
/** One source field may feed only one column in the same report table. */
export function fieldColumnConflict(schema: FormSchemaDraft, fieldId: string, tableId: string, columnId?: string): boolean {
  return schema.tables?.find(table => table.id === tableId)?.columns.some(column => column.id !== columnId && columnSourceFields(schema, column).includes(fieldId)) ?? false
}
export function updateDocumentColumn(schema: FormSchemaDraft, tableId: string, columnId: string, patch: Partial<FormSchemaTableColumn>): FormSchemaDraft {
  const oldColumn=schema.tables?.find(table=>table.id===tableId)?.columns.find(column=>column.id===columnId)
  if (oldColumn && (patch.sourceFieldIds || patch.binding) && columnSourceFields(schema, {...oldColumn,...patch}).some(id => !columnSourceFields(schema,oldColumn).includes(id) && fieldColumnConflict(schema,id,tableId,columnId))) return schema
  if(patch.label&&oldColumn&&!patch.labelSnapshot)patch={...patch,labelSnapshot:oldColumn.labelSnapshot??{...oldColumn.label}}
  if ((patch.sourceFieldIds || patch.binding) && patch.labelSyncDecision === undefined) patch = { ...patch, labelSyncDecision: undefined, labelSyncFieldId: undefined }
  if (patch.sourceFieldIds) patch = { ...patch, requiresSourceDecision: patch.sourceFieldIds.length === 0 && !patch.independentPurpose?.trim() }
  const next = { ...schema, tables: schema.tables?.map(table => table.id === tableId ? { ...table, columns: table.columns.map(column => column.id === columnId ? { ...column, ...patch, id: column.id } : column) } : table) }
  if (!patch.sourceFieldIds) return next
  const previousSources = columnSourceFields(schema, schema.tables?.find(table => table.id === tableId)?.columns.find(column => column.id === columnId) ?? ({ id: columnId, binding: { kind: 'dataField', dataFieldId: columnId }, label: { fa: '', en: '', zh: '' } } as FormSchemaTableColumn))
  return { ...next, fields: schema.fields.map(field => { const links = fieldColumnLinks(schema, field.id).filter(link => !(link.tableId === tableId && link.columnId === columnId)); const included = patch.sourceFieldIds!.includes(field.id); return { ...field, ...(included ? { independentPurpose: undefined } : {}), columnLinks: included || previousSources.includes(field.id) ? [...links, ...(included ? [{ tableId, columnId }] : [])] : field.columnLinks } }) }
}
/** Explicitly edit a column's sources; choosing a live field also resolves stale source IDs. */
export function setColumnSourceSelection(schema: FormSchemaDraft, tableId: string, columnId: string, fieldId: string, selected: boolean, allowMultipleSources: boolean): FormSchemaDraft {
  const column = schema.tables?.find(table => table.id === tableId)?.columns.find(item => item.id === columnId)
  if (!column || !schema.fields.some(field => field.id === fieldId)) return schema
  const liveSources = columnSourceFields(schema, column).filter(id => schema.fields.some(field => field.id === id))
  const sourceFieldIds = selected
    ? allowMultipleSources ? [...new Set([...liveSources, fieldId])] : [fieldId]
    : liveSources.filter(id => id !== fieldId)
  return updateDocumentColumn(schema, tableId, columnId, {
    sourceFieldIds,
    sourceLinkIntent: sourceFieldIds.length > 1 ? 'composite' : 'single',
    binding: sourceFieldIds.length ? { kind: 'formField', fieldId: sourceFieldIds[0] } : { kind: 'dataField', dataFieldId: column.id },
    independentPurpose: sourceFieldIds.length ? undefined : column.independentPurpose
  })
}
export function moveDocumentColumn(schema: FormSchemaDraft, tableId: string, sourceColumnId: string, targetColumnId: string, position: 'before' | 'after'): FormSchemaDraft {
  const table = schema.tables?.find(item => item.id === tableId)
  if (!table || sourceColumnId === targetColumnId) return schema
  const columns = [...table.columns]
  const sourceIndex = columns.findIndex(column => column.id === sourceColumnId)
  if (sourceIndex < 0 || !columns.some(column => column.id === targetColumnId)) return schema
  const [source] = columns.splice(sourceIndex, 1)
  const targetIndex = columns.findIndex(column => column.id === targetColumnId)
  columns.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source)
  const orderedColumns = columns.map((column, order) => ({ ...column, order }))
  return { ...schema, tables: schema.tables?.map(item => item.id === tableId ? { ...item, columns: orderedColumns } : item) }
}
export function removeDocumentColumn(schema: FormSchemaDraft, tableId: string, columnId: string): FormSchemaDraft {
  return removeDocumentColumns(schema, tableId, [columnId])
}
export function removeDocumentColumns(schema: FormSchemaDraft, tableId: string, columnIds: readonly string[]): FormSchemaDraft {
  const table = schema.tables?.find(item => item.id === tableId)
  if (!table) return schema
  const selected = new Set(columnIds.filter(id => table.columns.some(column => column.id === id)))
  if (!selected.size) return schema
  const linked = normalizeFormLinks(schema)
  return normalizeFormLinks({ ...linked, tables: linked.tables?.map(item => item.id === tableId ? { ...item, columns: item.columns.filter(column => !selected.has(column.id)) } : item) })
}
export function addDocumentColumn(schema: FormSchemaDraft, tableId: string, id: string, label: string, valueType: 'text' | 'number' | 'alphanumeric', fieldId?: string, defaultComposition: NonNullable<FormSchemaTableColumn['valueComposition']> = 'space'): FormSchemaDraft {
  if (!label.trim() || schema.tables?.some(table => table.columns.some(column => column.id === id))) return schema
  const field = schema.fields.find(item => item.id === fieldId)
  if (field && fieldColumnConflict(schema,field.id,tableId)) return schema
  const next = { ...schema, tables: schema.tables?.map(table => table.id === tableId ? { ...table, columns: [...table.columns, { id, label: { fa: label, en: label, zh: label }, binding: field ? { kind: 'formField' as const, fieldId: field.id } : { kind: 'dataField' as const, dataFieldId: id }, ...(field ? { sourceFieldIds: [field.id] } : { sourceFieldIds: [], independentPurpose: 'Developer-defined column' }), valueComposition: defaultComposition, valueType, width: 160, visible: true }] } : table) }
  return field ? linkFieldToColumn(next, field.id, tableId, id) : next
}
export function removeDocumentTable(schema: FormSchemaDraft, tableId: string): FormSchemaDraft {
  schema = normalizeFormLinks(schema)
  const table = schema.tables?.find(item => item.id === tableId)
  if (!table) return schema
  const keepSection = schema.tables?.some(item => item.id !== tableId && item.sectionId === table.sectionId)
  const removedRows = schema.sections.filter(section => section.tableHeaderFor === tableId).map(section => section.id)
  return { ...schema, tables: schema.tables?.filter(item => item.id !== tableId), sections: schema.sections.filter(section => !removedRows.includes(section.id) && (keepSection || section.id !== table.sectionId)), fields: schema.fields.filter(field => !removedRows.includes(field.sectionId)) }
}


/** Keep links to removed objects as tombstones until the developer explicitly resolves them. */
export function fieldColumnLinks(schema: FormSchemaDraft, fieldId: string) {
  const live = (schema.tables ?? []).flatMap(table => table.columns.filter(column => columnSourceFields(schema,column).includes(fieldId)).map(column => ({tableId:table.id,columnId:column.id})))
  const recorded = schema.fields.find(field => field.id === fieldId)?.columnLinks ?? []
  // A surviving source in the same table supersedes a deleted duplicate column.
  // Retain tombstones when no replacement exists, so genuine lost bindings stay red.
  const retained = recorded.filter(link => !live.some(current => current.tableId===link.tableId) || schema.tables?.find(table=>table.id===link.tableId)?.columns.some(column=>column.id===link.columnId))
  return [...retained,...live.filter(link=>!retained.some(current=>current.tableId===link.tableId&&current.columnId===link.columnId))]
}
export function normalizeFormLinks(schema: FormSchemaDraft, baseline?: FormSchemaDraft): FormSchemaDraft {
  return { ...schema, fields: schema.fields.map(field => ({ ...field, columnLinks: fieldColumnLinks(schema, field.id).length ? fieldColumnLinks(schema, field.id) : field.columnLinks ?? fieldColumnLinks(baseline ?? schema, field.id) })) }
}
export function preserveFormLinks(previous: FormSchemaDraft, next: FormSchemaDraft): FormSchemaDraft {
  return { ...next, fields: next.fields.map(field => ({ ...field, columnLinks: field.columnLinks ?? fieldColumnLinks(previous, field.id) })), tables: next.tables?.map(table => ({ ...table, columns: table.columns.map(column => ({ ...column, sourceFieldIds: column.sourceFieldIds ?? columnSourceFields(previous, previous.tables?.find(item => item.id === table.id)?.columns.find(item => item.id === column.id) ?? column) })) })) }
}
export function unresolvedFormFields(schema: FormSchemaDraft) {
  return schema.fields.filter(field => !field.independentPurpose?.trim() && fieldColumnLinks(schema, field.id).some(link => {
    const column = schema.tables?.find(table => table.id === link.tableId)?.columns.find(column => column.id === link.columnId)
    return !column || !columnSourceFields(schema, column).includes(field.id)
  }))
}
export function linkFieldToColumn(schema: FormSchemaDraft, fieldId: string, tableId: string, columnId: string): FormSchemaDraft {
  const column = schema.tables?.find(table => table.id === tableId)?.columns.find(column => column.id === columnId)
  if (!column || !schema.fields.some(field => field.id === fieldId) || fieldColumnConflict(schema,fieldId,tableId,columnId)) return schema
  const sourceFieldIds = [...new Set([...columnSourceFields(schema, column).filter(id => schema.fields.some(field => field.id === id)), fieldId])]
  const next = updateDocumentColumn(schema, tableId, columnId, { sourceFieldIds, sourceLinkIntent: sourceFieldIds.length>1?'composite':'single', independentPurpose: undefined })
  return { ...next, fields: next.fields.map(field => field.id === fieldId ? { ...field, independentPurpose: undefined, columnLinks: [...fieldColumnLinks(schema, fieldId).filter(link => schema.tables?.find(table => table.id === link.tableId)?.columns.some(column => column.id === link.columnId) && !(link.tableId === tableId && link.columnId === columnId)), { tableId, columnId }] } : field) }
}
/** Remove only the selected relationship; preserve the other sources and columns. */
export function unlinkFieldFromColumn(schema: FormSchemaDraft, fieldId: string, tableId: string, columnId: string): FormSchemaDraft {
  const column = schema.tables?.find(table => table.id === tableId)?.columns.find(column => column.id === columnId)
  if (!column) return schema
  const sourceFieldIds = columnSourceFields(schema, column).filter(id => id !== fieldId)
  return updateDocumentColumn(schema, tableId, columnId, {
    sourceFieldIds,
    binding: sourceFieldIds.length ? { kind: 'formField', fieldId: sourceFieldIds[0] } : { kind: 'dataField', dataFieldId: column.id }
  })
}
export function keepIndependentField(schema: FormSchemaDraft, fieldId: string, purpose: string): FormSchemaDraft {
  if (!purpose.trim()) return schema
  return { ...schema, fields: schema.fields.map(field => field.id === fieldId ? { ...field, independentPurpose: purpose.trim(), columnLinks: [] } : field), tables: schema.tables?.map(table => ({ ...table, columns: table.columns.map(column => columnSourceFields(schema, column).includes(fieldId) ? { ...column, sourceFieldIds: columnSourceFields(schema, column).filter(id => id !== fieldId), requiresSourceDecision: columnSourceFields(schema, column).filter(id => id !== fieldId).length === 0 && !column.independentPurpose?.trim(), binding: column.binding.kind === 'formField' && column.binding.fieldId === fieldId ? { kind: 'dataField' as const, dataFieldId: column.id } : column.binding } : column) })) }
}
