import type { FormSchemaDraft } from '../components/base-form/formSchema'
import type { DesignerDraft } from '../components/base-form/designer'
import { catalogSchema, designSystemDefaults, operationalFormCatalog } from '../components/base-form/operationalFormCatalog'
import { brandSchema, brandDesigner, brandFrame, brandCustomization, brandOperationalBehavior } from './brandDesign'

const yarnContract = operationalFormCatalog.find(item => item.route === 'yarns')
if (!yarnContract || yarnContract.api.join('|') !== '/api/yarns') throw new Error('Missing yarn operational form contract')

/** Yarn keeps its catalog data bindings while sharing the finalized brand form presentation. */
export const yarnSchema = catalogSchema(yarnContract, brandSchema)
yarnSchema.title = { fa: 'تعریف نخ', en: 'Yarn definition', zh: '纱线定义' }
if (yarnSchema.tables?.[0]) yarnSchema.tables[0].title = { fa: 'نخ‌ها', en: 'Yarns', zh: '纱线' }

const labels: Record<string, { fa: string; en: string; zh: string }> = {
  code: { fa: 'کد نخ', en: 'Yarn code', zh: '纱线代码' },
  name: { fa: 'نام نخ', en: 'Yarn name', zh: '纱线名称' },
  yarnGroup: { fa: 'گروه کالا', en: 'Product group', zh: '商品组' },
  luster: { fa: 'براقیت نخ', en: 'Yarn luster', zh: '纱线光泽' },
  unitOfMeasure: { fa: 'واحد شمارش', en: 'Unit of measure', zh: '计量单位' },
  fixStatus: { fa: 'وضعیت فیکسه', en: 'Fix status', zh: '定型状态' },
  material: { fa: 'جنس نخ', en: 'Material', zh: '材质' },
  spinType: { fa: 'نوع ریس', en: 'Spin type', zh: '纺纱类型' },
  filamentNumber: { fa: 'فیلامنت (نمره)', en: 'Filament number', zh: '长丝支数' },
  spinningMethod: { fa: 'روش ریس', en: 'Spinning method', zh: '纺纱方法' },
  continuityType: { fa: 'نوع پیوستگی', en: 'Continuity type', zh: '连续类型' },
  countValue: { fa: 'نمره', en: 'Count', zh: '纱支' },
  countType: { fa: 'نوع نمره', en: 'Count type', zh: '支数类型' },
  twistAmount: { fa: 'مقدار تاب', en: 'Twist amount', zh: '捻度' },
  twistType: { fa: 'نوع تاب', en: 'Twist type', zh: '捻向' },
  plyCount: { fa: 'تعداد لا (۰ تا ۹)', en: 'Ply count (0-9)', zh: '股数 (0-9)' },
  notes: { fa: 'توضیحات', en: 'Notes', zh: '备注' },
  isActive: { fa: 'فعال', en: 'Active', zh: '启用' }
}
for (const field of yarnSchema.fields) {
  const fieldLabels = labels[field.id]
  if (fieldLabels) field.label = fieldLabels
  if (field.id === 'code' || field.id === 'name' || field.id === 'unitOfMeasure') field.required = true
}

// These compact table headings intentionally differ from their longer editor labels.
for (const column of yarnSchema.tables?.[0]?.columns ?? []) {
  if (!['material', 'countValue', 'unitOfMeasure'].includes(column.id)) continue
  column.labelSyncDecision = 'independent'
  column.independentPurpose = 'عنوان کوتاه‌تر برای خوانایی فهرست؛ پیوند داده و برچسب فیلد فرم مستقل می‌ماند.'
}

/** A read-only computed display field; it is not part of the Yarn API payload. */
export const yarnComputedNameField: FormSchemaDraft['fields'][number] = {
  id: 'comprehensiveName', sectionId: 'catalog.editor', minTracks: 5, span: 5,
  componentId: 'definition.field', label: { fa: 'نام فراگیر (خودکار)', en: 'Comprehensive name (automatic)', zh: '综合名称（自动）' },
  kind: 'text', dataBinding: { kind: 'dataField', dataFieldId: 'comprehensiveName' },
  settings: { layout: { grid: { columns: 20, columnStart: 11, columnSpan: 5, rowStart: 1 } } }
}

export const yarnDesigner: DesignerDraft = {
  ...designSystemDefaults(brandDesigner, brandSchema, yarnSchema),
  formId: yarnSchema.id
}
export const yarnFrame = { ...brandFrame, width: Math.max(1040, brandFrame.width), height: 760 }
export const yarnCustomization = structuredClone(brandCustomization)
export const yarnOperationalBehavior = brandOperationalBehavior
