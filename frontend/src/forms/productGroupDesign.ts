import pinned from './product-group-design.json'
import type { FormSchemaDraft } from '../components/base-form/formSchema'
import type { DesignerDraft } from '../components/base-form/designer'
import type behavior from '../components/base-form/laboratoryOperationalBehavior.json'

export const productGroupFormId = 'form.new.8e77aae6-9477-41f9-b473-9d52511535a1'
if (pinned.form.id !== productGroupFormId || pinned.provenance.releaseId !== '71bde8e8-51d2-4d93-b73a-a8bab7f687cc') throw Error('Invalid approved Product Group handoff')
export const productGroupSchema = pinned.form.schema as unknown as FormSchemaDraft
export const productGroupDesigner = pinned.designerDraft as unknown as DesignerDraft
export const productGroupFrame = pinned.form.frame
export const productGroupCustomization = pinned.form.customization
export const productGroupBehavior = pinned.operationalBehaviorContract as typeof behavior
export const productGroupTitle = pinned.operationalTitle
