import type { BaseFormAction, BaseFormDefinition, BaseFormField, BaseFormSectionDefinition } from './types'
import type { DesignerAppearance, DesignerAppearanceProperty, DesignerDraft, DesignerFieldOverride, DesignerProperty, DesignerValue } from './designer'

export type FormSchemaLocale = keyof BaseFormAction['label']
export type FormLocalizedText = Record<FormSchemaLocale, string>
export type FormSchemaMode = 'operational' | 'reporting' | 'hybrid' | 'combined'
export type FormSchemaStatus = 'draft' | 'approved' | 'published' | 'archived'

export type FormSchemaConditionOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'isEmpty' | 'isNotEmpty' | 'in' | 'notIn'
export type FormSchemaCondition =
  | { fieldId: string; operator: FormSchemaConditionOperator; value?: string | number | boolean | readonly (string | number | boolean)[] }
  | { all: readonly FormSchemaCondition[] }
  | { any: readonly FormSchemaCondition[] }
  | { not: FormSchemaCondition }

export type FormSchemaValidationRule =
  | { type: 'minLength' | 'maxLength'; value: number; message?: FormLocalizedText }
  | { type: 'minimum' | 'maximum'; value: number; message?: FormLocalizedText }
  | { type: 'pattern'; value: string; message?: FormLocalizedText }
  | { type: 'email' | 'url' | 'integer' | 'positive' | 'unique'; message?: FormLocalizedText }
  | { type: 'custom'; validatorId: string; parameters?: Readonly<Record<string, string | number | boolean>>; message?: FormLocalizedText }

export type FormSchemaDataBinding =
  | { kind: 'formField'; fieldId: string }
  | { kind: 'dataField'; dataFieldId: string }
  | { kind: 'expression'; expressionId: string }

export type FormSchemaFieldKind = 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'time' | 'select' | 'multiSelect' | 'radio' | 'checkbox' | 'valueList' | 'lookup' | 'file' | 'button' | 'hidden' | 'custom'
export type FormSchemaField = BaseFormField & {
  kind: FormSchemaFieldKind
  componentId: string
  label: FormLocalizedText
  placeholder?: FormLocalizedText
  helpText?: FormLocalizedText
  labelPolicy?: 'editable' | 'fixed'
  validation?: readonly FormSchemaValidationRule[]
  visibleWhen?: FormSchemaCondition
  enabledWhen?: FormSchemaCondition
  readOnly?: boolean
  dataBinding?: FormSchemaDataBinding
  dataSourceId?: string
  format?: string
  order?: number
  focusOrder?: number
  settings?: Readonly<Record<string, unknown>>
}

export type FormSchemaSectionPurpose = 'operational' | 'reporting' | 'calculations' | 'details' | 'custom'
export type FormSchemaSection = BaseFormSectionDefinition & {
  parentId?: string | null
  initialSize?: { width: number; height: number }
  purpose?: FormSchemaSectionPurpose
  title?: FormLocalizedText
  description?: FormLocalizedText
  order?: number
  layout?: { columns?: number; rows?: number; direction?: 'horizontal' | 'vertical'; gap?: number }
  tableIds?: readonly string[]
  visibleWhen?: FormSchemaCondition
  settings?: Readonly<Record<string, unknown>>
}

export type FormSchemaFilter = {
  id: string
  label: FormLocalizedText
  binding: FormSchemaDataBinding
  operator?: FormSchemaConditionOperator
  control?: 'text' | 'number' | 'date' | 'select' | 'valueList' | 'lookup'
  dataSourceId?: string
  defaultValue?: string | number | boolean
  required?: boolean
  order?: number
}
export type FormSchemaSortRule = { binding: FormSchemaDataBinding; direction: 'asc' | 'desc'; order?: number }
export type FormSchemaTableColumn = {
  id: string
  binding: FormSchemaDataBinding
  label: FormLocalizedText
  visible?: boolean
  sortable?: boolean
  filterable?: boolean
  width?: number
  minWidth?: number
  align?: 'start' | 'center' | 'end'
  format?: string
  order?: number
}
export type FormSchemaTable = {
  id: string
  sectionId?: string
  title?: FormLocalizedText
  dataSourceId: string
  columns: readonly FormSchemaTableColumn[]
  filters?: readonly FormSchemaFilter[]
  defaultSort?: readonly FormSchemaSortRule[]
  groupBy?: readonly FormSchemaDataBinding[]
  pageSize?: number
  pageSizeOptions?: readonly number[]
  lazyLoading?: boolean
  virtualScrolling?: boolean
  searchable?: boolean
  columnSelection?: boolean
  rowSelection?: 'none' | 'single' | 'multiple'
  contextMenu?: boolean
  exportable?: boolean
  summary?: readonly { id: string; binding: FormSchemaDataBinding; operation: 'count' | 'sum' | 'average' | 'minimum' | 'maximum'; label?: FormLocalizedText }[]
  settings?: Readonly<Record<string, unknown>>
}

export type FormSchemaOperationIds = { create?: string; read?: string; update?: string; delete?: string; list?: string; export?: string; publish?: string }
export type FormSchemaResources = {
  dataSourceIds?: readonly string[]
  operationIds?: readonly string[]
  tables?: Readonly<Record<string, FormSchemaOperationIds>>
}
export type FormSchemaAction = BaseFormAction & { operationId?: string; permissionId?: string; visibleWhen?: FormSchemaCondition }
export type FormSchemaPermissions = {
  view?: string
  create?: string
  update?: string
  delete?: string
  export?: string
  design?: string
  publish?: string
  actions?: Readonly<Record<string, string>>
}

export type FormSchemaPropertySetting = { inherited: boolean; value?: DesignerValue }
export type FormSchemaSettings = {
  shared?: {
    standardId?: string
    version?: number
    designer?: DesignerDraft
    designerDefaults?: {
      input?: DesignerFieldOverride
      label?: DesignerFieldOverride
      appearance?: DesignerAppearance
    }
    appearance?: Partial<Record<DesignerAppearanceProperty, string>>
  }
  specific?: {
    designer?: {
      properties?: Partial<Record<DesignerProperty, FormSchemaPropertySetting>>
      appearance?: Partial<Record<DesignerAppearanceProperty, FormSchemaPropertySetting>>
      components?: Readonly<Record<string, DesignerFieldOverride>>
    }
    values?: Readonly<Record<string, unknown>>
  }
  userPreferences?: { allowed: readonly ('appearance' | 'columnVisibility' | 'columnOrder' | 'pageSize' | 'filters')[] }
}

export type FormSchemaBase = Omit<BaseFormDefinition, 'sections' | 'fields' | 'actions'> & {
  schemaVersion: number
  version: number
  title: FormLocalizedText
  status?: FormSchemaStatus
  sections: FormSchemaSection[]
  fields: FormSchemaField[]
  actions?: FormSchemaAction[]
  tables?: FormSchemaTable[]
  resources?: FormSchemaResources
  permissions?: FormSchemaPermissions
  settings?: FormSchemaSettings
  templateFormId?: string
  layout?: { direction: 'horizontal' | 'vertical'; gap?: number }
  menuPlacement?: { menuId?: string; order?: number }
}

export type OperationalFormSchema = FormSchemaBase & { mode: 'operational'; tables?: FormSchemaTable[] }
export type ReportingFormSchema = FormSchemaBase & { mode: 'reporting'; tables: [FormSchemaTable, ...FormSchemaTable[]] }
export type HybridFormSchema = FormSchemaBase & { mode: 'hybrid'; tables: [FormSchemaTable, ...FormSchemaTable[]] }
/** Legacy name retained for schemas created before the mode was named hybrid. */
export type CombinedFormSchema = FormSchemaBase & { mode: 'combined'; tables: [FormSchemaTable, ...FormSchemaTable[]] }
/** An unfinished form can be empty, including reporting and hybrid drafts. */
export type FormSchemaDraft = FormSchemaBase & { status: 'draft'; mode: FormSchemaMode }
export type FormSchema = OperationalFormSchema | ReportingFormSchema | HybridFormSchema | CombinedFormSchema | FormSchemaDraft
