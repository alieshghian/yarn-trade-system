import type {ManagedLaboratoryForm} from './laboratoryFormDraftState'
import {operationalSource} from './operationalFormCatalog.ts'

/** A family is established by saved identity, never by a display title. */
export function managedDesignFamily(form: ManagedLaboratoryForm): string {
  const route = operationalSource(form.schema)?.route ?? (form.schema.id.startsWith('operational.') ? form.schema.id.slice('operational.'.length) : undefined)
  return route ? `route:${route}` : form.designEdition?.familyId ?? form.id
}

export function managedDesignGroups(forms: ManagedLaboratoryForm[], updatedAt: Record<string,string>, activeId?: string): ManagedLaboratoryForm[][] {
  const groups = new Map<string, ManagedLaboratoryForm[]>()
  for (const form of forms) {
    const family = managedDesignFamily(form)
    groups.set(family, [...(groups.get(family) ?? []), form])
  }
  const time = (form: ManagedLaboratoryForm) => Date.parse(updatedAt[form.id] ?? form.designEdition?.createdAt ?? '') || 0
  return [...groups.values()].map(group => group.sort((a,b) =>
    Number(b.id === activeId)-Number(a.id === activeId) ||
    (b.designEdition?.number ?? 1)-(a.designEdition?.number ?? 1) || time(b)-time(a)))
}

/** Only an explicit user action calls this; editing and recovery retain the original ID. */
export function forkManagedDesign(source: ManagedLaboratoryForm, id: string, siblings: ManagedLaboratoryForm[], now = new Date().toISOString()): ManagedLaboratoryForm {
  const familyId = managedDesignFamily(source)
  const number = Math.max(1,...siblings.filter(form=>managedDesignFamily(form)===familyId).map(form=>form.designEdition?.number ?? 1)) + 1
  const form = structuredClone(source)
  form.id = id
  form.schema.id = id
  form.schema.status = 'draft'
  form.designEdition = {familyId, number, sourceFormId: source.id, createdAt: now}
  return form
}
