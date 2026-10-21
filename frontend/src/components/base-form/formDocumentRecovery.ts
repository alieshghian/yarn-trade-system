import { designerHistoryReducer, type DesignerHistory } from './designer.ts'
import type { FormSchemaDraft } from './formSchema'
import type { FormStorage, ManagedLaboratoryForm, ManagedFormStructureHistory } from './laboratoryFormDraftState'
import { commitManagedFormStructure } from './laboratoryFormDraftState.ts'
import { fieldColumnLinks } from './formTableStructure.ts'

export type RecoverableForm = { form: ManagedLaboratoryForm; designerHistory: DesignerHistory; structureHistory: ManagedFormStructureHistory<FormSchemaDraft> }
export type FormRecoveryVersion = { id: string; at: string; reason: string; snapshot: RecoverableForm }
export type FormRecoveryDocument = { current: RecoverableForm; updatedAt: string; versions: FormRecoveryVersion[] }
type RecoveryCollection = { version: 1; activeFormId: string | null; documents: Record<string, FormRecoveryDocument> }
export const formRecoveryKey = (userId?: string) => `yarn-trade:form-document-recovery:v1:${encodeURIComponent(userId || 'developer-local')}`
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function validSnapshot(value: unknown, id: string): value is RecoverableForm {
  if (!object(value) || !object(value.form) || value.form.id !== id || !object(value.form.schema) || value.form.schema.id !== id || !Array.isArray(value.form.schema.fields) || !Array.isArray(value.form.schema.sections) || !object(value.form.frame)) return false
  const history = value.designerHistory, structure = value.structureHistory
  if (!object(history) || !object(history.present) || !Array.isArray(history.past) || !Array.isArray(history.future) || !object(structure) || !Array.isArray(structure.past) || !Array.isArray(structure.future) || !object(structure.present)) return false
  return [history.present, ...history.past, ...history.future].every(draft => object(draft) && draft.formId === id && draft.format === 'yarn-trade.form-designer-draft' && object(draft.overrides))
    && [structure.present, ...structure.past, ...structure.future].every(schema => object(schema) && schema.id === id && Array.isArray(schema.fields) && Array.isArray(schema.sections))
    && JSON.stringify(structure.present) === JSON.stringify(value.form.schema)
}

/** Intern identical JSON subtrees: versions keep every byte of data without repeating full histories.
 * References only point backwards, so malformed/cyclic envelopes cannot be decoded. */
type PackedValue = string | number | boolean | null | [number]
type PackedNode = { a: PackedValue[] } | { o: [string, PackedValue][] }
export function encodeRecoveryJournal(value: unknown): string {
  const nodes: PackedNode[] = [], indices = new Map<string, number>(), seen = new WeakMap<object, number>()
  const encode = (item: unknown): PackedValue => {
    if (item === null || typeof item !== 'object') return (item === undefined ? null : item) as Exclude<PackedValue, [number]>
    const known = seen.get(item)
    if (known !== undefined) return [known]
    const node: PackedNode = Array.isArray(item) ? { a: item.map(encode) } : { o: Object.entries(item).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)]) }
    const key = JSON.stringify(node), existing = indices.get(key)
    if (existing !== undefined) { seen.set(item, existing); return [existing] }
    const index = nodes.length; nodes.push(node); indices.set(key, index); seen.set(item, index); return [index]
  }
  // Match JSON's existing persistence semantics; exploit already-shared immutable history.
  const root = encode(value)
  return JSON.stringify({ format: 'yarn-trade.recovery-interned', version: 1, root, nodes })
}
export function decodeRecoveryJournal(raw: string): unknown {
  const data: unknown = JSON.parse(raw)
  if (!object(data) || data.format !== 'yarn-trade.recovery-interned') return data // Existing v1 journals.
  if (data.version !== 1 || !Array.isArray(data.nodes)) throw new Error('Invalid recovery envelope')
  const nodes = data.nodes, decoded: unknown[] = []
  const decode = (value: unknown, limit: number): unknown => {
    if (!Array.isArray(value)) { if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value; throw new Error('Invalid recovery value') }
    const index = value[0]
    if (value.length !== 1 || !Number.isInteger(index) || index < 0 || index >= limit) throw new Error('Invalid recovery reference')
    return decoded[index]
  }
  for (const [index, node] of nodes.entries()) {
    if (!object(node)) throw new Error('Invalid recovery node')
    if (Array.isArray(node.a)) decoded.push(node.a.map(value => decode(value, index)))
    else if (Array.isArray(node.o)) decoded.push(Object.fromEntries(node.o.map(entry => {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') throw new Error('Invalid recovery property')
      return [entry[0], decode(entry[1], index)]
    })))
    else throw new Error('Invalid recovery node')
  }
  return decode(data.root, nodes.length)
}

/** A separate atomic journal never replaces the user's explicitly saved form. */
export function readFormRecovery(storage: FormStorage | undefined, userId?: string): RecoveryCollection | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(formRecoveryKey(userId))
    if (!raw) return { version: 1, activeFormId: null, documents: {} }
    const data: unknown = decodeRecoveryJournal(raw)
    if (!object(data) || data.version !== 1 || !object(data.documents) || !(data.activeFormId === null || typeof data.activeFormId === 'string')) return null
    for (const [id, value] of Object.entries(data.documents)) {
      if (!object(value) || !validSnapshot(value.current, id) || typeof value.updatedAt !== 'string' || !Array.isArray(value.versions) || !value.versions.every(version => object(version) && typeof version.id === 'string' && typeof version.at === 'string' && typeof version.reason === 'string' && validSnapshot(version.snapshot, id))) return null
    }
    return data as RecoveryCollection
  } catch { return null }
}

export type RecoveryWriteResult = 'saved' | 'unavailable' | 'invalid-snapshot' | 'invalid-journal' | 'quota' | 'storage-error'
export function writeFormRecovery(storage: FormStorage | undefined, userId: string | undefined, snapshot: RecoverableForm, reason?: string, now?: string): boolean {
  return writeFormRecoveryResult(storage, userId, snapshot, reason, now) === 'saved'
}
export function writeFormRecoveryResult(storage: FormStorage | undefined, userId: string | undefined, snapshot: RecoverableForm, reason?: string, now = new Date().toISOString()): RecoveryWriteResult {
  if (!storage) return 'unavailable'
  if (!validSnapshot(snapshot, snapshot.form.id)) return 'invalid-snapshot'
  const collection = readFormRecovery(storage, userId)
  if (!collection) return 'invalid-journal' // Keep a malformed or newer journal untouched.
  const id = snapshot.form.id, previous = collection.documents[id]
  const committed = { ...snapshot, designerHistory: designerHistoryReducer(snapshot.designerHistory, { type: 'commitTransaction' }) }
  const version: FormRecoveryVersion = { id: `${now}.${previous?.versions.length ?? 0}`, at: now, reason: reason ?? '', snapshot: committed }
  const versions = reason ? [...previous?.versions ?? [], version] : previous?.versions ?? []
  const documents = { ...collection.documents, [id]: { current: committed, updatedAt: now, versions } }
  try { storage.setItem(formRecoveryKey(userId), encodeRecoveryJournal({ ...collection, activeFormId: id, documents })); return 'saved' } catch (error) { return error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('QuotaExceeded')) ? 'quota' : 'storage-error' }
}

export function closeFormRecovery(storage: FormStorage | undefined, userId?: string): boolean {
  const collection = readFormRecovery(storage, userId)
  if (!storage || !collection) return false
  try { storage.setItem(formRecoveryKey(userId), encodeRecoveryJournal({ ...collection, activeFormId: null })); return true } catch { return false }
}

/** Recover a removed field from the most recent available full snapshot, preserving its ID. */
export function recoverableDeletedFields(current: FormSchemaDraft, candidates: readonly FormSchemaDraft[]) {
  const existing = new Set(current.fields.map(field => field.id))
  const found = new Map<string, FormSchemaDraft['fields'][number]>()
  for (const schema of candidates) for (const field of schema.fields) if (!existing.has(field.id) && !found.has(field.id)) found.set(field.id, field)
  return [...found.values()]
}

export function restoreRecoverableField(current: RecoverableForm, id: string, sources: readonly RecoverableForm[]): RecoverableForm | undefined {
  if (current.form.schema.fields.some(field => field.id === id)) return undefined
  const source = sources.find(snapshot => snapshot.form.schema.fields.some(field => field.id === id))
  const field = source?.form.schema.fields.find(field => field.id === id)
  if (!source || !field) return undefined
  const sections = [...current.form.schema.sections]
  let section = source.form.schema.sections.find(item => item.id === field.sectionId)
  while (section && !sections.some(item => item.id === section!.id)) { sections.push(section); section = source.form.schema.sections.find(item => item.id === section!.parentId) }
  const fields = [...current.form.schema.fields]
  fields.splice(Math.min(source.form.schema.fields.findIndex(field => field.id === id), fields.length), 0, structuredClone(field))
  let schema = { ...current.form.schema, fields, sections }
  let relatedDraft = current.designerHistory.present
  // Restoring a field also restores its removed related table/column, never unrelated schema edits.
  if (!field.independentPurpose) {
    const links = field.columnLinks ?? sources.flatMap(item => fieldColumnLinks(item.form.schema, id))
    for (const link of links) {
      const related = restoreRecoverableTable({ ...current, form: { ...current.form, schema }, designerHistory: { ...current.designerHistory, present: relatedDraft } }, link.tableId, sources, link.columnId)
      if (related) { schema = related.form.schema; relatedDraft = related.designerHistory.present }
    }
  }
  const original = source.designerHistory.present, draft = relatedDraft
  const overrides = { ...draft.overrides }
  for (const key of [id, `${id}::input`, `${id}::label`]) if (original.overrides[key]) overrides[key] = structuredClone(original.overrides[key])
  const sectionCanvases = { ...draft.sectionCanvases }
  if (sectionCanvases[field.sectionId] && original.sectionCanvases?.[field.sectionId]?.fields[id]) sectionCanvases[field.sectionId] = { ...sectionCanvases[field.sectionId], fields: { ...sectionCanvases[field.sectionId].fields, [id]: original.sectionCanvases[field.sectionId].fields[id] } }
  const canvas = draft.canvas && original.canvas?.fields[id] ? { ...draft.canvas, fields: { ...draft.canvas.fields, [id]: original.canvas.fields[id] } } : draft.canvas
  const designerHistory = designerHistoryReducer(current.designerHistory, { type: 'change', draft: { ...draft, overrides, canvas, sectionCanvases }, schema: current.designerHistory.document ? schema : undefined })
  return { form: { ...current.form, schema }, structureHistory: commitManagedFormStructure(current.structureHistory, schema), designerHistory }
}

export function restoreRecoverableTable(current: RecoverableForm, tableId: string, sources: readonly RecoverableForm[], columnId?: string): RecoverableForm | undefined {
  const existing = current.form.schema.tables?.find(table => table.id === tableId)
  if (existing && (!columnId || existing.columns.some(column => column.id === columnId))) return undefined
  const source = sources.find(item => item.form.schema.tables?.some(table => table.id === tableId && (!columnId || table.columns.some(column => column.id === columnId))))
  const table = source?.form.schema.tables?.find(table => table.id === tableId)
  if (!source || !table) return undefined
  const schema = structuredClone(current.form.schema)
  const restoreSection = (id: string | undefined) => {
    const section = source.form.schema.sections.find(section => section.id === id)
    if (!section || schema.sections.some(item => item.id === id)) return
    restoreSection(section.parentId ?? undefined)
    schema.sections.splice(Math.min(source.form.schema.sections.findIndex(item => item.id === id), schema.sections.length), 0, structuredClone(section))
  }
  restoreSection(table.sectionId)
  if (existing && columnId) {
    schema.tables = schema.tables?.map(item => {
      if (item.id !== tableId) return item
      const columns = [...item.columns], column = table.columns.find(item => item.id === columnId)!
      columns.splice(Math.min(table.columns.indexOf(column), columns.length), 0, structuredClone(column))
      return { ...item, columns }
    })
  } else {
    const tables = [...schema.tables ?? []]
    tables.splice(Math.min(source.form.schema.tables!.findIndex(item => item.id === tableId), tables.length), 0, structuredClone(table))
    schema.tables = tables
    for (const row of source.form.schema.sections.filter(item => item.tableHeaderFor === tableId)) {
      restoreSection(row.id)
      for (const field of source.form.schema.fields.filter(field => field.sectionId === row.id)) if (!schema.fields.some(item => item.id === field.id)) schema.fields.push(structuredClone(field))
    }
  }
  const draft = current.designerHistory.present, oldDraft = source.designerHistory.present
  const tables = { ...draft.tables }
  if (!existing && oldDraft.tables?.[tableId]) tables[tableId] = structuredClone(oldDraft.tables[tableId])
  const designerHistory = designerHistoryReducer(current.designerHistory, { type: 'change', draft: { ...draft, tables }, schema: current.designerHistory.document ? schema : undefined })
  return { ...current, form: { ...current.form, schema }, designerHistory, structureHistory: commitManagedFormStructure(current.structureHistory, schema) }
}

export function recoverableDeletedTables(current: FormSchemaDraft, candidates: readonly FormSchemaDraft[]) {
  const found = new Map<string, { table: NonNullable<FormSchemaDraft['tables']>[number]; columnId?: string }>()
  for (const schema of candidates) for (const table of schema.tables ?? []) {
    const existing = current.tables?.find(item => item.id === table.id)
    if (!existing) { if (!found.has(table.id)) found.set(table.id, { table }); continue }
    for (const column of table.columns) if (!existing.columns.some(item => item.id === column.id)) {
      const key = JSON.stringify([table.id, column.id])
      if (!found.has(key)) found.set(key, { table, columnId: column.id })
    }
  }
  return [...found.values()]
}
