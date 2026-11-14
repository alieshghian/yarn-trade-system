import exported from './brand-design.json'
import type {FormSchemaDraft} from '../components/base-form/formSchema'
import type {DesignerDraft} from '../components/base-form/designer'
import type defaultOperationalBehavior from '../components/base-form/laboratoryOperationalBehavior.json'
import {normalizeCodeComponentSettings} from '../components/base-form/serialCode'

// Pinned owner export. Never load another user's mutable Laboratory draft at runtime.
export const brandDesignId='form.redesign.805deb77-bec5-41fa-af97-77b7007ca3a4'
// An approved snapshot keeps its own behavior revision. Updating the Laboratory
// must not invalidate existing operational forms or their lookup consumers.
if(exported.form.id!==brandDesignId || exported.form.schema.fields.length!==3 || exported.form.schema.tables[0]?.columns.length!==3 || exported.designerDraft.formId!==brandDesignId || exported.operationalBehaviorContract.contractId!=='yarn-trade.form-laboratory.operational-behavior' || !Number.isInteger(exported.operationalBehaviorContract.version) || exported.operationalBehaviorContract.version<1)throw Error('Invalid pinned brand design or operational behavior contract')
export const brandSchema=structuredClone(exported.form.schema) as unknown as FormSchemaDraft
brandSchema.title={fa:'تعریف برند',en:'Brand definition',zh:'品牌定义'}
const create=brandSchema.actions?.find(action=>action.id==='operational.new')
if(create)create.label={fa:'برند جدید',en:'New brand',zh:'新建品牌'}
export const brandDesigner=exported.designerDraft as unknown as DesignerDraft
export const brandFrame=exported.form.frame
export const brandCustomization=exported.form.customization
export const brandOperationalBehavior=exported.operationalBehaviorContract as typeof defaultOperationalBehavior
export const brandCodeSettings=normalizeCodeComponentSettings({mode:'alphanumeric',required:true,unique:true,incremental:true,suffixWidth:1,maxLength:30,format:'legacy'})
export type BrandValues={brandCode:string;brandName:string;address:string;description:string}
export function brandPayload(values:BrandValues):BrandValues {return {...values}}
