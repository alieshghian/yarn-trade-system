import definition from './warehouse-design.json'
import type {FormSchemaDraft} from '../components/base-form/formSchema'
import type {DesignerDraft} from '../components/base-form/designer'
export const warehouseSchema=definition.form.schema as unknown as FormSchemaDraft
export const warehouseDesigner=definition.designerDraft as unknown as DesignerDraft
export const warehouseFrame=definition.form.frame
export const warehouseCustomization=definition.form.customization
export const warehouseBehavior=definition.operationalBehaviorContract
