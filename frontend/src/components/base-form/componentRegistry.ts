import type { ComponentType } from 'react'
import { Field, Shortcut } from '../../DefinitionControls'
import { BaseFormGridBoundary } from './BaseFormGridBoundary'
import { BaseFormShell } from './BaseFormShell'
import { FormValueList } from './FormValueList'
import { NumberControl } from './NumberControl'
import { PersonTitleControl } from './PersonTitleControl'
import type { FormLocalizedText, FormSchemaFieldKind, FormSchemaMode } from './formSchema'

export type FormComponentCategory = 'input' | 'layout' | 'table' | 'action' | 'support'
export type FormComponentLabelPolicy = 'editable' | 'fixed' | 'none'

/** Component is an opaque reference; adapters must provide its concrete props before rendering. */
export type FormComponentDefinition = {
  id: string
  exportName: string
  component: ComponentType<never>
  title: FormLocalizedText
  category: FormComponentCategory
  allowedFormTypes: readonly FormSchemaMode[]
  labelPolicy: FormComponentLabelPolicy
  adapterRequired: boolean
  designerSelectable: boolean
  schemaKind?: FormSchemaFieldKind
  presetIds?: readonly string[]
}

export type FormComponentPreset = {
  id: string
  componentId: string
  title: FormLocalizedText
  schemaKind: FormSchemaFieldKind
  allowedFormTypes: readonly FormSchemaMode[]
  labelPolicy: Exclude<FormComponentLabelPolicy, 'none'>
  defaults?: { multiline?: boolean }
}

export type NewFormType = Exclude<FormSchemaMode, 'combined'>

const entryForms = ['operational', 'hybrid'] as const satisfies readonly NewFormType[]
const allFormTypes = ['operational', 'reporting', 'hybrid'] as const satisfies readonly NewFormType[]

const valueListPresets: readonly FormComponentPreset[] = [
  {
    id: 'contact.phone', componentId: 'base-form.value-list',
    title: { fa: 'تلفن', en: 'Phone', zh: '电话' }, schemaKind: 'valueList',
    allowedFormTypes: entryForms, labelPolicy: 'editable'
  },
  {
    id: 'contact.mobile', componentId: 'base-form.value-list',
    title: { fa: 'تلفن همراه', en: 'Mobile', zh: '手机' }, schemaKind: 'valueList',
    allowedFormTypes: entryForms, labelPolicy: 'editable'
  },
  {
    id: 'contact.address', componentId: 'base-form.value-list',
    title: { fa: 'نشانی', en: 'Address', zh: '地址' }, schemaKind: 'valueList',
    allowedFormTypes: entryForms, labelPolicy: 'editable', defaults: { multiline: true }
  }
]

const definitions: FormComponentDefinition[] = [
  {
    id: 'base-form.value-list', exportName: 'FormValueList', component: FormValueList,
    title: { fa: 'فهرست مقادیر', en: 'Value List', zh: '值列表' }, category: 'input',
    allowedFormTypes: entryForms, labelPolicy: 'editable', adapterRequired: true,
    designerSelectable: true,
    schemaKind: 'valueList', presetIds: valueListPresets.map(preset => preset.id)
  },
  {
    id: 'base-form.number-control', exportName: 'NumberControl', component: NumberControl,
    title: { fa: 'فهرست شماره‌ها', en: 'Number List', zh: '号码列表' }, category: 'input',
    allowedFormTypes: entryForms, labelPolicy: 'editable', adapterRequired: true, designerSelectable: true, schemaKind: 'valueList'
  },
  {
    id: 'persons.title-control', exportName: 'PersonTitleControl', component: PersonTitleControl,
    title: { fa: 'عنوان شخص', en: 'Person Title', zh: '人员称谓' }, category: 'input',
    allowedFormTypes: entryForms, labelPolicy: 'none', adapterRequired: true, designerSelectable: true, schemaKind: 'select'
  },
  {
    id: 'base-form.grid-boundary', exportName: 'BaseFormGridBoundary', component: BaseFormGridBoundary,
    title: { fa: 'مرز جدول پایه', en: 'Base Grid Boundary', zh: '基础表格边界' }, category: 'table',
    allowedFormTypes: allFormTypes, labelPolicy: 'none', adapterRequired: true, designerSelectable: true
  },
  {
    id: 'base-form.shell', exportName: 'BaseFormShell', component: BaseFormShell,
    title: { fa: 'پوسته فرم پایه', en: 'Base Form Shell', zh: '基础表单框架' }, category: 'layout',
    allowedFormTypes: allFormTypes, labelPolicy: 'none', adapterRequired: true, designerSelectable: false
  },
  {
    id: 'definition.field', exportName: 'Field', component: Field,
    title: { fa: 'قاب فیلد', en: 'Field Wrapper', zh: '字段容器' }, category: 'support',
    allowedFormTypes: allFormTypes, labelPolicy: 'editable', adapterRequired: true, designerSelectable: false
  },
  {
    id: 'definition.shortcut', exportName: 'Shortcut', component: Shortcut,
    title: { fa: 'دکمه میانبر', en: 'Shortcut Button', zh: '快捷按钮' }, category: 'action',
    allowedFormTypes: allFormTypes, labelPolicy: 'editable', adapterRequired: true, designerSelectable: true
  }
]

const registry = new Map(definitions.map(definition => [definition.id, definition]))
const presetRegistry = new Map(valueListPresets.map(preset => [preset.id, preset]))

export function getFormComponents(): readonly FormComponentDefinition[] {
  return [...registry.values()]
}

export function getFormComponentById(id: string): FormComponentDefinition | undefined {
  return registry.get(id)
}

/** Add future components explicitly; no source scanning or implicit discovery is used. */
export function registerFormComponent(definition: FormComponentDefinition): void {
  if (!definition.id.trim()) throw new Error('A form component must have a stable id.')
  if (registry.has(definition.id)) throw new Error(`Form component is already registered: ${definition.id}`)
  registry.set(definition.id, definition)
}

/** Register a preset explicitly against an existing input component. */
export function registerFormComponentPreset(preset: FormComponentPreset): void {
  if (!preset.id.trim()) throw new Error('A form component preset must have a stable id.')
  if (presetRegistry.has(preset.id)) throw new Error(`Form component preset is already registered: ${preset.id}`)
  const component = registry.get(preset.componentId)
  if (!component) throw new Error(`Form component is not registered: ${preset.componentId}`)
  if (component.category !== 'input' || !component.schemaKind) {
    throw new Error(`Form component cannot own field presets: ${preset.componentId}`)
  }
  presetRegistry.set(preset.id, preset)
  component.presetIds = [...(component.presetIds ?? []), preset.id]
}

export function getFormComponentPresets(): readonly FormComponentPreset[] {
  return [...presetRegistry.values()]
}
