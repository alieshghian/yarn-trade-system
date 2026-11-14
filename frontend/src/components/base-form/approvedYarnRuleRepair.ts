import type { FormSchemaDraft } from './formSchema.ts'

// Owner approved on 2026-11-13. This is a document correction, not a global
// exception to validation. A subsequent explicit rule edit remains authoritative.
export const approvedYarnDesignId = 'form.redesign.f743b7d0-d9f9-49e0-a7a8-bb05a00ddde1'
const repairKey = 'sharedAttributeUniquenessRepair20261113'
const sharedFields = new Set(['yarnGroup', 'luster', 'material', 'continuityType', 'twistType', 'field.74b142df-2a91-4036-afa8-8a52a8a6e4f4'])
export function repairApprovedYarnRules(schema: FormSchemaDraft): FormSchemaDraft {
  if (schema.id !== approvedYarnDesignId || schema.settings?.specific?.values?.[repairKey]) return schema
  return {
    ...schema,
    fields: schema.fields.map(field => sharedFields.has(field.id)
      ? { ...field, validation: field.validation?.filter(rule => rule.type !== 'unique') }
      : field),
    settings: { ...schema.settings, specific: { ...schema.settings?.specific, values: { ...schema.settings?.specific?.values, [repairKey]: true } } }
  }
}
