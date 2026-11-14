import type { FormSchemaDraft, FormSchemaField } from './formSchema.ts'

export const contactListContract = {
  id:'laboratory.contact-list', version:2, component:'NumberControl',
  defaultSelection:'existing-and-new-rows', singleDefault:true,
  authorizedRowActionsVisibleInBrowse:true, explicitRowActionStartsDraftManagement:true,
  editExisting:true, removeExisting:true, removeUnsavedRows:true,
  enforceConfiguredPermissions:true, saveShortcut:'F3', saveColor:'#347d70',
  compactActions:true, portalRetainsActionStyles:true,
  sharedBy:['phone','mobile','address','title'], readableTextSize:15,
  dialCodeOnlyForTelephone:true, enterNavigation:'shared-form-saved-focus-order',
} as const

export type ComponentAccess = 'everyone' | 'admin' | 'none'
export type ComponentListSettings = {
  searchEnabled: boolean
  searchFields: string[]
  allowEmpty: boolean
  addPlacement: 'beside' | 'inside' | 'popup' | 'hidden'
  permissions: { add: ComponentAccess; edit: ComponentAccess; remove: ComponentAccess; setDefault: ComponentAccess }
}
export type ListSettingsPatch = Partial<Omit<ComponentListSettings, 'permissions'>> & { permissions?: Partial<ComponentListSettings['permissions']> }
export const defaultComponentListSettings: ComponentListSettings = {
  searchEnabled: false, searchFields: ['value', 'code', 'name'], allowEmpty: false, addPlacement: 'beside',
  permissions: { add: 'everyone', edit: 'everyone', remove: 'everyone', setDefault: 'everyone' }
}
export function normalizeListSettings(value: unknown): ListSettingsPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw=value as Record<string,unknown>, next:ListSettingsPatch={}
  for(const key of ['searchEnabled','allowEmpty'] as const)if(typeof raw[key]==='boolean')next[key]=raw[key]
  if(['beside','inside','popup','hidden'].includes(String(raw.addPlacement)))next.addPlacement=raw.addPlacement as ComponentListSettings['addPlacement']
  if(Array.isArray(raw.searchFields))next.searchFields=[...new Set(raw.searchFields.filter((v):v is string=>typeof v==='string'&&/^[\w.-]{1,80}$/.test(v)))].slice(0,20)
  if(raw.permissions&&typeof raw.permissions==='object'){
    next.permissions={}
    for(const key of ['add','edit','remove','setDefault'] as const){const access=(raw.permissions as Record<string,unknown>)[key];if(['everyone','admin','none'].includes(String(access)))next.permissions[key]=access as ComponentAccess}
  }
  return next
}
export function resolveListSettings(...layers: unknown[]):ComponentListSettings {
  return layers.reduce<ComponentListSettings>((result,layer)=>{const patch=normalizeListSettings(layer);return {...result,...patch,permissions:{...result.permissions,...patch.permissions}}},structuredClone(defaultComponentListSettings))
}
export function componentAccessAllowed(access:ComponentAccess, role:'admin'|'user'='user'):boolean{return access==='everyone'||access==='admin'&&role==='admin'}
export function normalizeChoiceSearch(value:string):string{
  return value.normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[\u064B-\u065F\u0670\u200c]/g,'').toLocaleLowerCase().replace(/\s+/g,' ').trim()
}
export function choiceMatches(query:string,values:readonly string[]):boolean{
  const haystack=normalizeChoiceSearch(values.join(' '));return normalizeChoiceSearch(query).split(' ').every(term=>haystack.includes(term))
}
export function isListComponentField(field:Pick<FormSchemaField,'componentId'|'kind'>):boolean{return ['valueList','select','lookup'].includes(field.kind)||['persons.title-control','base-form.number-control','base-form.value-list','form-laboratory.titleId'].includes(field.componentId)}
export type ComponentSettingsCopyGroup='search'|'permissions'|'selection'|'presentation'
/** Copy a snapshot of capabilities, never identities, business bindings or field geometry. */
export function copyFieldComponentSettings(schema:FormSchemaDraft,targetId:string,sourceId:string,groups:readonly ComponentSettingsCopyGroup[],sourceSettings:ComponentListSettings):FormSchemaDraft{
  const source=schema.fields.find(f=>f.id===sourceId),target=schema.fields.find(f=>f.id===targetId)
  if(!source||!target||source===target||!isListComponentField(source)||!isListComponentField(target)||!groups.length)return schema
  const patch:ListSettingsPatch=normalizeListSettings(target.settings?.listSettings)
  if(groups.includes('search')){patch.searchEnabled=sourceSettings.searchEnabled;patch.searchFields=[...sourceSettings.searchFields]}
  if(groups.includes('permissions'))patch.permissions={...sourceSettings.permissions}
  if(groups.includes('selection'))patch.allowEmpty=sourceSettings.allowEmpty
  if(groups.includes('presentation'))patch.addPlacement=sourceSettings.addPlacement
  return {...schema,fields:schema.fields.map(field=>field.id===targetId?{...field,settings:{...field.settings,listSettings:structuredClone(patch)}}:field)}
}
