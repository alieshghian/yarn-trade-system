import definition from './yarn-approved-design.json'
import type {FormSchemaDraft} from '../components/base-form/formSchema'
import type {DesignerDraft} from '../components/base-form/designer'
export const approvedYarnSchema=definition.form.schema as unknown as FormSchemaDraft
export const approvedYarnDesigner=definition.designerDraft as unknown as DesignerDraft
export const approvedYarnDefinition=definition
export const yarnColorField='field.74b142df-2a91-4036-afa8-8a52a8a6e4f4'
export const yarnVolumeField='field.4d30f7f6-d535-4a4b-b799-70178626c641'
