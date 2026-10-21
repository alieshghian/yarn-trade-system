import { operationalSource, designSystemDefaults, operationalFormCatalog } from './operationalFormCatalog.ts'
import type { FormSchemaDraft } from './formSchema.ts'
import { managedFormWithDesigner, resolveManagedLaboratoryDesigner, type ManagedLaboratoryForm, type ManagedLaboratoryForms, type ManagedTemplateRevision } from './laboratoryFormDraftState.ts'

const clone = <T,>(value: T): T => value === undefined ? value : structuredClone(value)
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Three-way inheritance: update only values that the developer has not customized. */
export function inheritUnchangedSettings(base: unknown, current: unknown, next: unknown): unknown {
  if (same(base, current)) return clone(next)
  if (current === undefined) return undefined
  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(next) && [...base, ...current, ...next].every(item => object(item) && typeof item.id === 'string')) {
    const oldById = new Map(base.map(item => [item.id, item]))
    const nextById = new Map(next.map(item => [item.id, item]))
    const result = current.flatMap(item => {
      if (!oldById.has(item.id)) return [clone(item)]
      const merged = inheritUnchangedSettings(oldById.get(item.id), item, nextById.get(item.id))
      return merged === undefined ? [] : [merged]
    })
    const currentIds = new Set(current.map(item => item.id))
    return [...result, ...next.filter(item => !oldById.has(item.id) && !currentIds.has(item.id)).map(clone)]
  }
  if (object(base) && object(current) && object(next)) {
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(current), ...Object.keys(next)])) {
      const value = inheritUnchangedSettings(base[key], current[key], next[key])
      if (value !== undefined) result[key] = value
    }
    return result
  }
  return clone(current)
}

/** Report decisions retained by the three-way merge before the owner applies a revision. */
export function templateRevisionConflicts(form:ManagedLaboratoryForm, revision:Omit<ManagedTemplateRevision,'version'>):string[] {
  const conflicts:string[]=[]
  const inspect=(base:unknown,current:unknown,next:unknown,path:string)=>{
    if(same(base,current)||same(base,next)||same(current,next))return
    if(object(base)&&object(current)&&object(next)){
      for(const key of new Set([...Object.keys(base),...Object.keys(current),...Object.keys(next)]))inspect(base[key],current[key],next[key],path+'.'+key)
    }else if(Array.isArray(base)&&Array.isArray(current)&&Array.isArray(next)&&[...base,...current,...next].every(item=>object(item)&&typeof item.id==='string')){
      for(const item of base)inspect(item,current.find(value=>value.id===item.id),next.find(value=>value.id===item.id),path+'['+item.id+']')
    }else conflicts.push(path)
  }
  if(form.template.schema&&!operationalSource(form.schema))for(const key of ['fields','sections','tables','actions','layout'] as const)inspect(form.template.schema[key],form.schema[key],revision.schema[key],key)
  inspect(form.template.frame,form.frame,revision.frame,'frame')
  inspect(form.template.schema?.settings?.shared?.behaviorId,form.schema.settings?.shared?.behaviorId,revision.schema.settings?.shared?.behaviorId,'behaviorId')
  inspect(form.schema.settings?.shared?.designer,resolveManagedLaboratoryDesigner(form),operationalSource(form.schema)?designSystemDefaults(revision.designer,revision.schema,form.schema):revision.designer,'designer')
  return conflicts
}

export function applyTemplateRevision(form: ManagedLaboratoryForm, revision: ManagedTemplateRevision): ManagedLaboratoryForm {
  const normalized = managedFormWithDesigner(form, resolveManagedLaboratoryDesigner(form))
  const oldSchema = form.template.schema
  const schema: FormSchemaDraft = { ...form.schema }
  if (oldSchema && !operationalSource(form.schema)) for (const key of ['fields', 'sections', 'actions', 'tables', 'layout'] as const) {
    Object.assign(schema, { [key]: inheritUnchangedSettings(oldSchema[key], schema[key], revision.schema[key]) })
  }
  schema.settings = { ...schema.settings, shared: { ...schema.settings?.shared, version: revision.version, designer: operationalSource(form.schema) ? designSystemDefaults(revision.designer,revision.schema,form.schema) : clone(revision.designer) } }
  schema.settings.shared!.behaviorId=inheritUnchangedSettings(oldSchema?.settings?.shared?.behaviorId,form.schema.settings?.shared?.behaviorId,revision.schema.settings?.shared?.behaviorId) as string|undefined
  return { ...normalized, schema, frame: form.template.frame ? inheritUnchangedSettings(form.template.frame, form.frame, revision.frame) as ManagedLaboratoryForm['frame'] : form.frame,
    template: { formId: form.template.formId, version: revision.version, schema: clone(revision.schema), frame: clone(revision.frame) } }
}

export function registerTemplateRevision(current: ManagedLaboratoryForms, source: Omit<ManagedTemplateRevision, 'version'>, selectedFormIds: readonly string[]): ManagedLaboratoryForms {
  const selected = new Set(selectedFormIds)
  if (selectedFormIds.some(id => !current.forms.some(form => form.id === id) && !operationalFormCatalog.some(contract => 'catalog:' + contract.route === id && contract.availability !== 'laboratory'))) throw new Error('A selected form no longer exists.')
  const revision: ManagedTemplateRevision = { ...clone(source), version: (current.templateRevision?.version ?? 1) + 1 }
  const catalogTemplates = { ...current.catalogTemplates }
  for (const contract of operationalFormCatalog) if (selected.has('catalog:' + contract.route)) catalogTemplates[contract.route] = clone(revision)
  return { ...current, catalogTemplates, templateRevision: revision, templateRevisions: [...current.templateRevisions ?? [], revision], forms: current.forms.map(form => selected.has(form.id) ? applyTemplateRevision(form, revision) : form) }
}
