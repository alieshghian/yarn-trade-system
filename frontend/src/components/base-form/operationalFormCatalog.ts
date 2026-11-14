import type { MenuKey } from '../../navigation'
import { icons } from '../../navigation.ts'
import type { FormSchemaDraft, FormSchemaFieldKind, FormSchemaTable, FormSchemaAction } from './formSchema'
import { designerActionCode, validateDesignerCanvas, type DesignerDraft, type DesignerTableSettings } from './designer.ts'
import { createManagedLaboratoryForm, type ManagedLaboratoryForm, type ManagedFormFrame } from './laboratoryFormDraftState.ts'
import { gridToolbarParts, normalizeToolbarStyle, type GridToolbarPartStyle } from './gridToolbarLayout.ts'

type FieldContract = { id: string; label: string; kind: FormSchemaFieldKind; binding: string; required?: boolean }
type TableContract = { id: string; title: string; columns: string[]; masterId?: string; detailKey?: string }
export type OperationalFormContract = { route: MenuKey; title: string; sourceFiles: string[]; api: string[]; availability: 'operational' | 'partial' | 'placeholder' | 'laboratory'; fields: FieldContract[]; tables: TableContract[]; risks: string[] }
const fields = (spec: string): FieldContract[] => spec.split('|').filter(Boolean).map(item => {
  const [id, label = id, kind = 'text', binding = id, required] = item.split(':')
  return { id, label, kind: kind as FormSchemaFieldKind, binding, ...(required === 'required' ? { required: true } : {}) }
})
const definitions: Partial<Record<MenuKey, Partial<OperationalFormContract>>> = {
  persons: { title: 'تعریف اشخاص', availability: 'operational', sourceFiles: ['frontend/src/PersonsPage.tsx'], api: ['/api/master-data/persons', '/api/master-data/parameters', '/api/master-data/brands'], fields: fields('personCode:کد شخص:text:personCode:required|titleId:عنوان:lookup|firstName:نام|lastName:نام خانوادگی|directorName:نام مدیر|jobId:نقش:lookup|nationalityId:ملیت:lookup|phone:تلفن:valueList|mobile:موبایل:valueList|address:آدرس:valueList|notes:توضیحات:textarea|isActive:فعال:checkbox|brandIds:برندها:multiSelect|defaultBrandId:برند پیش‌فرض:lookup'), tables: [{ id:'persons',title:'اشخاص',columns:['personCode','displayName','job','nationality','mobile','phone','isActive'] }], risks:['عنوان و نوع شخص، فهرست شماره‌ها و برند پیش‌فرض، اعتبارسنجی و مجوزهای اشخاص'] },
  productGroups: { title:'تعریف گروه کالاها',availability:'operational',sourceFiles:['frontend/src/forms/ProductGroupOperationalPage.tsx'],api:['/api/master-data/product-groups'],fields:[],tables:[{id:'form.new.8e77aae6-9477-41f9-b473-9d52511535a1.report',title:'گزارش گروه کالا',columns:['code','level0','level1','level2','level3','level4']}],risks:['گروه مرتبط با گردش انبار و اجداد آن قابل ویرایش یا حذف نیستند.'] },
  brands: { title:'تعریف برند',availability:'operational',sourceFiles:['frontend/src/BrandsPage.tsx'],api:['/api/master-data/brands'], fields:fields('brandCode:کد برند:text:brandCode:required|brandName:نام برند:text:brandName:required|brandAddress:آدرس:text:address|brandDescription:توضیحات:textarea:description'),tables:[{id:'brands',title:'برندها',columns:['brandCode','brandName','address','description']}],risks:['کد یکتا، ارتباط برند با اشخاص و اسناد خرید'] },
  yarns: {title:'تعریف نخ',availability:'operational',sourceFiles:['frontend/src/YarnsPage.tsx'],api:['/api/yarns'],fields:fields('code:کد نخ|name:نام نخ|yarnGroup:گروه کالا:lookup:productGroupId|luster:درخشندگی:select|unitOfMeasure:واحد:select|fixStatus:وضعیت تثبیت:select|material:جنس:select|spinType:نوع ریسندگی:select|filamentNumber:تعداد فیلامنت:number|spinningMethod:روش ریسندگی:select|continuityType:پیوستگی:select|countValue:نمره نخ:number|countType:نوع نمره:select|twistAmount:مقدار تاب:number|twistType:نوع تاب:select|plyCount:تعداد لا:number|notes:توضیحات:textarea|isActive:فعال:checkbox'),tables:[{id:'yarns',title:'نخ‌ها',columns:['code','comprehensiveName','yarnGroup','material','countValue','countType','unitOfMeasure','isActive']}],risks:['نام فراگیر محاسباتی، واحد و ارجاع از اقلام سفارش']},
  purchaseOrders: {title:'سفارش خرید',availability:'operational',sourceFiles:['frontend/src/PurchaseOrdersPage.tsx','src/YarnTrade.Api/Controllers/PurchaseOrdersController.cs'],api:['/api/purchase-orders','/api/yarns','/api/master-data/persons'],fields:fields('orderNumber:شماره سفارش:text:orderNumber:required|orderDate:تاریخ سفارش:date:orderDate:required|requiredByDate:تاریخ مورد نیاز:date|priority:اولویت:select|currency:ارز:select|preferredSupplierId:تأمین‌کننده:lookup|notes:توضیحات:textarea'),tables:[{id:'orders',title:'فهرست سفارش‌های خرید',columns:['id','orderNumber','orderDate','requiredByDate','status','priority','itemCount','totalQuantity','estimatedTotal','currency']},{id:'items',title:'اقلام سفارش',columns:['id','purchaseOrderId','yarnItemId','descriptionSnapshot','quantity','unit','estimatedUnitPrice','estimatedAmount','requiredSpecifications','notes'],masterId:'orders',detailKey:'purchaseOrderId'}],risks:['Master–Detail اقلام، جمع مقدار و مبلغ، RowVersion، ارسال و پذیرش سفارش، مجوز و محدودیت وضعیت سند']},
  commerce: {title:'بازرگانی و خرید',availability:'operational',sourceFiles:['frontend/src/CommercePage.tsx','src/YarnTrade.Api/Controllers/PurchasesController.cs'],api:['/api/commerce/workbench','/api/commerce/orders/{id}/workbench','/api/purchases','/api/attachments'],fields:fields('internalNumber:شماره داخلی|externalInvoiceNumber:شماره فاکتور|invoiceDate:تاریخ فاکتور:date|supplierId:تأمین‌کننده:lookup|brandId:برند:lookup|notes:توضیحات:textarea'),tables:[{id:'orders',title:'سفارش‌ها',columns:['id','orderNumber','status']},{id:'invoices',title:'فاکتورها',columns:['id','purchaseOrderId','internalNumber','externalInvoiceNumber','invoiceDate','supplierId','grandTotal','status'],masterId:'orders',detailKey:'purchaseOrderId'},{id:'items',title:'اقلام فاکتور',columns:['id','purchaseInvoiceId','yarnItemId','originalDescription','unit','netWeight','grossWeight','packageCount','unitPriceUSD','goodsAmountUSD','notes'],masterId:'invoices',detailKey:'purchaseInvoiceId'},{id:'containers',title:'کانتینرها',columns:['id','purchaseInvoiceId','containerNumber','sealNumber','containerType','billOfLadingNumber','netWeight','grossWeight','packageCount','notes'],masterId:'invoices',detailKey:'purchaseInvoiceId'}],risks:['تطبیق سفارش و فاکتور، ورود فایل، پیوست‌ها، کانتینرها، هزینه‌ها، ارسال انبار و سند قطعی']},  users: {title:'تعریف کاربران',availability:'operational',sourceFiles:['frontend/src/UsersPage.tsx'],api:['/api/users','/api/users/catalog'],fields:fields('personId:شخص:lookup|email:ایمیل|preferredLanguage:زبان:select|isActive:فعال:checkbox|roles:نقش‌ها:multiSelect|permissions:مجوزها:multiSelect'),tables:[{id:'users',title:'کاربران',columns:['id','email','displayName','preferredLanguage','isActive','pendingInvitation']}],risks:['مجوز و نقش، دعوت ایمیلی، جلوگیری از افزایش دسترسی و غیرفعال‌کردن حساب خود']},
  businessContract: {title:'قرارداد و قواعد کسب‌وکار',availability:'operational',sourceFiles:['frontend/src/BusinessContractPage.tsx'],api:['/api/business-contracts'],fields:fields('effectiveFrom:تاریخ اجرا:date|businessStructure:ساختار کسب‌وکار:select|contractName:نام قرارداد|baseCurrency:ارز پایه:select|partnerPersonId:شریک:lookup|creditCalculationMethod:روش محاسبه اعتبار:select|defaultCreditRatePercent:نرخ اعتبار:number|checkCollectionGracePeriodDays:مهلت وصول:number|responsiblePartyAfterGracePeriod:مسئول پس از مهلت:select|financingCostResponsibleParty:مسئول هزینه تأمین:select|financedCheckPrincipalRiskParty:ریسک اصل چک:select|creditSaleClaimPayableWhen:زمان مطالبه اعتباری:select|partnerEntitlementCreatedWhen:زمان استحقاق شریک:select|cashSaleClaimPayableWhen:زمان مطالبه نقدی:select'),tables:[{id:'contracts',title:'قراردادها',columns:['id','contractName','effectiveFrom','businessStructure','baseCurrency']}],risks:['تاریخ اعتبار، محاسبات مالی، شرکا و آثار اسناد قبلی']},
  settings: {title:'تنظیمات کاربر و تم',availability:'operational',sourceFiles:['frontend/src/UserSettingsPage.tsx','src/YarnTrade.Api/Controllers/UserSettingsController.cs'],api:['/api/user-settings'],fields:fields('preferredLanguage:زبان:select|sessionTimeoutMinutes:مهلت نشست:number|theme:تم برنامه:select|compactMode:نمای فشرده:checkbox|fontFamily:قلم:select|fontSize:اندازه قلم:select'),tables:[],risks:['تنظیمات فقط برای کاربر جاری، تغییر رمز مسیر مستقل و حساس دارد']},
  dataBackup: {title:'تهیه و بازخوانی اطلاعات',availability:'operational',sourceFiles:['frontend/src/DataBackupPage.tsx'],api:['/api/data-backup'],fields:fields('backupFile:فایل پشتیبان:file|confirmation:تأیید بازخوانی'),tables:[],risks:['بازخوانی عملیاتی و خروج نشست؛ در Designer هرگز اجرا نشود']},
  dashboard:{title:'داشبورد',availability:'operational',sourceFiles:['frontend/src/App.tsx'],fields:[],tables:[{id:'recentPurchases',title:'خریدهای اخیر',columns:['internalNumber','externalInvoiceNumber','invoiceDate','totalNetWeight','grandTotal','status']}],risks:['شاخص‌ها و جمع‌های محاسباتی']},
  purchases:{title:'خرید کالا',availability:'partial',sourceFiles:['frontend/src/CommercePage.tsx','src/YarnTrade.Api/Controllers/PurchasesController.cs'],api:['/api/purchases'],risks:['API موجود است؛ مسیر مستقل فعلی صفحه کامل ندارد. نسخه سالم خرید در بازرگانی حفظ شود.']},
  formLaboratory:{title:'قالب اصلی آزمایشگاه',availability:'laboratory',sourceFiles:['frontend/src/FormLaboratoryPage.tsx']},
  warehouses:{title:'تعریف انبار',availability:'operational',sourceFiles:['frontend/src/WarehousesPage.tsx','frontend/src/forms/warehouse-design.json','frontend/src/WarehouseZones.tsx','frontend/src/forms/warehouse-zone-design.json'],api:['/api/warehouses','/api/warehouses/grid'],fields:fields('code:کد انبار|name:نام انبار|floorCount:تعداد طبقات|location:موقعیت انبار|custodianPersonId:انباردار:lookup|address:آدرس انبار:textarea|description:توضیحات:textarea'),tables:[{id:'warehouses',title:'انبارها',columns:['code','name','custodian','address','description']}],risks:['SQL و API انبار با پایگاه موقت و صد هزار رکورد آزموده شده؛ انتقال موجودی مرحله مستقل است.']},
  inventory:{title:'انبار'},sales:{title:'فروش'},finance:{title:'عملیات مالی'},checks:{title:'مدیریت چک'},partners:{title:'شرکا'},reports:{title:'گزارش‌ها'}
}
export const operationalFormCatalog: readonly OperationalFormContract[] = (Object.keys(icons) as MenuKey[]).map(route => ({ route,title:route,sourceFiles:[],api:[],availability:'placeholder',fields:[],tables:[],risks:['این مسیر هنوز فرم عملیاتی مستقل ندارد.'],...definitions[route] }))
const text = (value: string) => ({fa:value,en:value,zh:value})
type CatalogAction = NonNullable<FormSchemaDraft['actions']>[number]
const actionShortcuts = (action: Pick<CatalogAction, 'code' | 'keys'>) => new Set([action.code, ...(action.keys ?? [])].filter(Boolean))
function sameActionShortcut(left: Pick<CatalogAction, 'id' | 'code' | 'keys'>, right: Pick<CatalogAction, 'id' | 'code' | 'keys'>): boolean {
  if (left.id === right.id) return true
  const leftKeys = actionShortcuts(left), rightKeys = actionShortcuts(right)
  return [...leftKeys].some(key => rightKeys.has(key))
}
function catalogActions(contract: OperationalFormContract, sharedActions?: readonly CatalogAction[]): CatalogAction[] {
  const defaults: CatalogAction[] = [
    { id: 'operational.new', code: 'Space', keys: [' '], label: text('جدید'), primary: true, required: true, sectionId: 'catalog.footer', operationId: contract.route + '.new' },
    { id: 'operational.edit', code: 'Insert', keys: ['Insert'], label: text('ویرایش'), required: true, sectionId: 'catalog.footer', operationId: contract.route + '.edit' },
    { id: 'operational.copyLast', code: 'F2', keys: ['F2'], label: {fa:'کپی آخرین',en:'Copy last',zh:'复制上一条'}, required: true, sectionId: 'catalog.footer', operationId: contract.route + '.copyLast' },
    { id: 'operational.copySelected', code: 'F4', keys: ['F4'], label: {fa:'کپی انتخابی',en:'Copy selected',zh:'复制所选'}, required: true, sectionId: 'catalog.footer', operationId: contract.route + '.copySelected' },
    { id: 'operational.save', code: 'F3', keys: ['F3'], label: text('ذخیره'), primary: true, required: true, sectionId: 'catalog.footer', operationId: contract.route + '.save' },
    { id: 'operational.delete', code: 'Delete', keys: ['Delete'], label: text('حذف'), required: true, sectionId: 'catalog.footer', operationId: contract.route + '.delete' },
    { id: 'operational.close', code: 'Esc', keys: ['Escape'], label: text('بستن'), required: true, sectionId: 'catalog.footer', operationId: contract.route + '.close' }
  ]
  if (!sharedActions?.length) return defaults
  const usedDefaults = new Set<string>()
  const actions = sharedActions.map(source => {
    const match = defaults.find(candidate => !usedDefaults.has(candidate.id) && sameActionShortcut(source, candidate))
    if (!match) return { ...structuredClone(source), sectionId: 'catalog.footer' }
    usedDefaults.add(match.id)
    return { ...match, ...structuredClone(source), id: match.id, sectionId: 'catalog.footer', operationId: match.operationId }
  })
  for (const action of defaults) if (!usedDefaults.has(action.id)) actions.push({ ...action, sectionId: 'catalog.footer' })
  return actions
}

function inheritedSectionDefaults(schema: FormSchemaDraft, sharedSchema?: FormSchemaDraft): FormSchemaDraft['sections'] {
  if (!sharedSchema) return schema.sections
  return schema.sections.map(section => {
    const source = sharedSchema.sections.find(item => item.kind === section.kind && !item.tableHeaderFor)
    if (!source) return section
    const sourceViewport = source.settings?.viewport
    return {
      ...section,
      ...(source.layout ? { layout: structuredClone(source.layout) } : {}),
      ...(source.initialSize ? { initialSize: structuredClone(source.initialSize) } : {}),
      ...(sourceViewport
        ? { settings: { ...section.settings, viewport: structuredClone(sourceViewport) } }
        : {})
    }
  })
}

function inheritedToolbarSettings(settings: unknown, preserveFormColors: boolean): Record<string, unknown> | undefined {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return undefined
  const source = (settings as Record<string, unknown>).toolbar
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined
  const toolbar = Object.fromEntries(Object.entries(source as Record<string, unknown>)
    .filter(([part, value]) => gridToolbarParts.includes(part as typeof gridToolbarParts[number]) && value && typeof value === 'object' && !Array.isArray(value))
    .map(([part, value]) => {
      const style = normalizeToolbarStyle(value as GridToolbarPartStyle)
      // A custom panel is form structure and may contain fields that do not exist in this catalog form.
      if (style.panelId && style.panelId !== 'header') delete style.panelId
      // Runtime toolbars always span their table; viewport geometry belongs to the Designer canvas.
      if (part === 'header') { delete style.width; delete style.x; delete style.y }
      // Form-specific colors are user preferences, not shared behavior defaults.
      if (!preserveFormColors) {
        delete style.backgroundColor
        delete style.textColor
        delete style.borderColor
      }
      return [part, style]
    }))
  return Object.keys(toolbar).length ? toolbar : undefined
}

function inheritSharedTablePresentation(schema: FormSchemaDraft, sharedSchema?: FormSchemaDraft): FormSchemaDraft['tables'] {
  if (!sharedSchema?.tables?.length || !schema.tables?.length) return schema.tables
  const source = sharedSchema.tables[0]
  const sameRouteSource = Boolean(operationalSource(sharedSchema)?.route === schema.id.slice('operational.'.length) || sharedSchema.id === schema.id)
  const tableBehaviorKeys = ['searchable', 'columnSelection', 'rowSelection', 'contextMenu', 'lazyLoading', 'virtualScrolling'] as const
  return schema.tables.map(table => {
    const behavior = Object.fromEntries(tableBehaviorKeys.flatMap(key => source[key] === undefined ? [] : [[key, source[key]]]))
    const toolbar = inheritedToolbarSettings(source.settings, sameRouteSource)
    return {
      ...table,
      ...behavior,
      ...(toolbar ? { settings: { ...table.settings, toolbar } } : {})
    }
  })
}

/** Keep the catalog's data bindings, while inheriting the current shared Laboratory frame and controls. */
export function catalogSchema(contract: OperationalFormContract, sharedSchema?: FormSchemaDraft): FormSchemaDraft {
  // Reuse the purchase contract for the planned standalone purchase page, retaining its actual API origin.
  const source = contract.route === 'purchases' ? operationalFormCatalog.find(item=>item.route==='commerce')! : contract
  const tableIds = source.tables.map(table=>table.id)
  const sameRouteSource = Boolean(sharedSchema && (operationalSource(sharedSchema)?.route === contract.route || sharedSchema.id === 'operational.'+contract.route))
  const generatedSections: FormSchemaDraft['sections'] = [{id:'catalog.editor',kind:'editor'},...source.tables.map(table=>({id:'catalog.grid.'+table.id,kind:'grid' as const})),{id:'catalog.footer',kind:'footer'}]
  const sections = sameRouteSource && sharedSchema
    ? [...structuredClone(sharedSchema.sections), ...generatedSections.filter(section=>!sharedSchema.sections.some(existing=>existing.id===section.id))]
    : generatedSections
  const inheritedSettings=sharedSchema?.settings?{
    shared:sharedSchema.settings.shared?((value)=>{const {designer:_designer,...settings}=value;return settings})(structuredClone(sharedSchema.settings.shared)):undefined,
    ...(sameRouteSource&&sharedSchema.settings.specific?{specific:structuredClone(sharedSchema.settings.specific)}:{})
  }:undefined
  if(!sameRouteSource&&inheritedSettings?.shared){
    delete inheritedSettings.shared.appearance
    const defaults=inheritedSettings.shared.designerDefaults
    if(defaults){
      delete defaults.appearance
      if(defaults.input)defaults.input=withoutCustomColors(defaults.input)
      if(defaults.label)defaults.label=withoutCustomColors(defaults.label)
    }
  }
  const schema: FormSchemaDraft = {id:'operational.'+contract.route,schemaVersion:1,version:1,status:'draft',mode:'operational',title:text(contract.title),layout:sharedSchema?.layout?structuredClone(sharedSchema.layout):{direction:'vertical',gap:12},
    sections,
    fields:source.fields.map((field,index)=>{
      const composite=field.kind==='custom'
      const generated: FormSchemaDraft['fields'][number] = {id:field.id,sectionId:'catalog.editor',minTracks:composite?20:5,span:composite?20:5,componentId:composite?'base-form.custom-field':'definition.field',label:text(field.label),kind:field.kind,required:field.required,dataBinding:{kind:'dataField',dataFieldId:field.binding},settings:{layout:{grid:{columns:20,columnStart:composite?1:(index%4)*5+1,columnSpan:composite?20:5,rowStart:composite?Math.floor(index/4)+1:index<16?Math.floor(index/4)+1:5}}}}
      const inherited=sameRouteSource?sharedSchema?.fields.find(candidate=>candidate.id===field.id):undefined
      return inherited?{...generated,...structuredClone(inherited),id:generated.id,dataBinding:generated.dataBinding,sectionId:sections.some(section=>section.id===inherited.sectionId)?inherited.sectionId:generated.sectionId}:generated
    }),
    tables:source.tables.map(table=>{
      const generated:FormSchemaTable={id:table.id,sectionId:'catalog.grid.'+table.id,title:text(table.title),dataSourceId:'operational.'+contract.route+'.'+table.id,
        columns:table.columns.map(id=>({id,label:text(source.fields.find(field=>field.binding===id)?.label??id),binding:{kind:'dataField' as const,dataFieldId:id},sourceFieldIds:source.fields.filter(field=>field.binding===id || source.route==='persons' && ((id==='displayName'&&['firstName','lastName'].includes(field.id))||(id==='job'&&field.id==='jobId')||(id==='nationality'&&field.id==='nationalityId'))).map(field=>field.id)})),
        ...(table.masterId&&tableIds.includes(table.masterId)?{masterDetail:{masterTableId:table.masterId,masterField:'id',detailField:table.detailKey??'parentId'}}:{})} satisfies FormSchemaTable
      const inherited=sameRouteSource?sharedSchema?.tables?.find(candidate=>candidate.id===table.id):undefined
      if(!inherited)return generated
      const generatedColumns=new Map(generated.columns.map(column=>[column.id,column]))
      const inheritedIds=new Set(inherited.columns.map(column=>column.id))
      const columns=[...inherited.columns.map(column=>({...generatedColumns.get(column.id),...structuredClone(column),id:column.id})),...generated.columns.filter(column=>!inheritedIds.has(column.id))]
      return {...generated,...structuredClone(inherited),id:generated.id,sectionId:sections.some(section=>section.id===inherited.sectionId)?inherited.sectionId:generated.sectionId,dataSourceId:generated.dataSourceId,columns}
    }),
    actions:catalogActions(contract, sharedSchema?.actions),
    behaviorInstruction:'بازطراحی '+contract.title+'؛ اتصال‌های موجود و اعتبارسنجی‌ها حفظ شوند. موارد نیازمند بررسی: '+contract.risks.join('؛ '),resources:{dataSourceIds:contract.api,operationIds:[contract.route+'.read',contract.route+'.save']},templateFormId:sharedSchema?.id??'form-laboratory.persons-synthetic',
    ...(sameRouteSource&&sharedSchema?.uniqueConstraints?{uniqueConstraints:structuredClone(sharedSchema.uniqueConstraints)}:{}),
    ...(sameRouteSource&&sharedSchema?.permissions?{permissions:structuredClone(sharedSchema.permissions)}:{}),
    settings: inheritedSettings}
  if(!sameRouteSource){schema.sections=inheritedSectionDefaults(schema, sharedSchema);schema.tables=inheritSharedTablePresentation(schema, sharedSchema)}
  return schema
}

/** Inherit shared Laboratory presentation; map scoped actions/tables by stable IDs and shortcuts. */
export function designSystemDefaults(template: DesignerDraft, sharedSchema?: FormSchemaDraft, targetSchema?: FormSchemaDraft): DesignerDraft {
  const {canvas:sourceCanvas,sectionCanvases:sourceSections,tables:sourceTables,overrides:sourceOverrides,actions:sourceActions,tableColumns:sourceColumnStyles,tableHeaders:sourceHeaderStyles,appearance:sourceAppearance,...defaults}=structuredClone(template)
  const sourceRoute=sharedSchema?operationalSource(sharedSchema)?.route??(sharedSchema.id.startsWith('operational.')?sharedSchema.id.slice('operational.'.length) as MenuKey:undefined):undefined
  const sameRouteSource=Boolean(sourceRoute&&targetSchema?.id==='operational.'+sourceRoute)
  const actions: NonNullable<DesignerDraft['actions']> = {}
  if (sharedSchema && targetSchema) for (const target of targetSchema.actions ?? []) {
    const source = (sharedSchema.actions ?? []).find(item => item.id === target.id || sameActionShortcut(item, target))
    const override = source && sourceActions?.[source.id]
    if (override) actions[target.id] = structuredClone(override)
  }
  const tables: NonNullable<DesignerDraft['tables']> = {}
  const mapColumnStyles = <T extends Record<string, unknown> | undefined>(styles:T, ids:ReadonlySet<string>):T => {
    if(!styles)return undefined as T
    const matching=Object.fromEntries(Object.entries(styles).filter(([id])=>ids.has(id)))
    if(!sameRouteSource)for(const style of Object.values(matching))if(style&&typeof style==='object'){
      const record=style as Record<string,unknown>
      delete record.textColor;delete record.backgroundColor;delete record.borderColor
    }
    return (Object.keys(matching).length?matching:undefined) as T
  }
  const targetFieldIds=new Set((targetSchema?.fields??[]).map(field=>field.id))
  const overrides=sameRouteSource?Object.fromEntries(Object.entries(sourceOverrides).filter(([id])=>targetFieldIds.has(id.split('::')[0]))):{}
  for(const target of targetSchema?.tables??[]){
    const sourceTable=sameRouteSource?sharedSchema?.tables?.find(table=>table.id===target.id):sharedSchema?.tables?.[0]
    const scoped=sourceTable?sourceTables?.[sourceTable.id]:undefined
    if(!scoped)continue
    const ids=new Set(target.columns.map(column=>column.id))
    const settings:DesignerTableSettings=structuredClone(scoped)
    if(!sameRouteSource){
      for(const style of Object.values(settings.tableColumns??{})){
        delete style.textColor;delete style.backgroundColor
      }
      for(const style of Object.values(settings.tableHeaders??{})){
        delete style.textColor;delete style.backgroundColor;delete style.borderColor
      }
    }
    const columnStyles=mapColumnStyles(settings.tableColumns,ids),headerStyles=mapColumnStyles(settings.tableHeaders,ids)
    if(columnStyles)settings.tableColumns=columnStyles;else delete settings.tableColumns
    if(headerStyles)settings.tableHeaders=headerStyles;else delete settings.tableHeaders
    tables[target.id]=settings
  }
  const allTargetColumnIds=new Set((targetSchema?.tables??[]).flatMap(table=>table.columns.map(column=>column.id)))
  const tableColumns=mapColumnStyles(sourceColumnStyles,allTargetColumnIds),tableHeaders=mapColumnStyles(sourceHeaderStyles,allTargetColumnIds)
  const canvas= sameRouteSource&&targetSchema ? validateDesignerCanvas(sourceCanvas,targetSchema.fields.map(field=>field.id)) : undefined
  const sectionCanvases:NonNullable<DesignerDraft['sectionCanvases']>={}
  if(sameRouteSource&&sharedSchema&&targetSchema)for(const targetSection of targetSchema.sections.filter(section=>section.kind==='editor')){
    const sourceSection=sharedSchema.sections.find(section=>section.id===targetSection.id)??sharedSchema.sections.find(section=>section.kind==='editor'&&!section.tableHeaderFor)
    const source=sourceSection&&(sourceSections?.[sourceSection.id]??(sourceSection.id===sharedSchema.sections.find(section=>section.kind==='editor')?.id?sourceCanvas:undefined))
    const ids=targetSchema.fields.filter(field=>field.sectionId===targetSection.id).map(field=>field.id)
    const valid=source&&ids.length?validateDesignerCanvas(source,ids):undefined
    if(valid)sectionCanvases[targetSection.id]=valid
  }
  const hasCanvas=Boolean(canvas||Object.keys(sectionCanvases).length)
  const inheritedDefaults=defaults.defaults?(sameRouteSource?structuredClone(defaults.defaults):{...defaults.defaults,
    ...(defaults.defaults.input?{input:withoutCustomColors(defaults.defaults.input)}:{}),
    ...(defaults.defaults.label?{label:withoutCustomColors(defaults.defaults.label)}:{})}):undefined
  const presentationDefaults: NonNullable<DesignerDraft['defaults']> = structuredClone(inheritedDefaults ?? {})
  presentationDefaults.input = { ...presentationDefaults.input, ...(presentationDefaults.input?.bold === undefined && presentationDefaults.input?.fontWeight === undefined ? { bold: false } : {}) }
  presentationDefaults.label = { ...presentationDefaults.label, ...(presentationDefaults.label?.bold === undefined && presentationDefaults.label?.fontWeight === undefined ? { bold: false } : {}) }
  // Laboratory appearance is the shared form default. Route-specific field
  // geometry and business overrides stay isolated above, but controls such as
  // shared action colors must carry over to newly created operational forms.
  const inheritedAppearance=sourceAppearance
  return {...defaults,defaults:presentationDefaults,...(inheritedAppearance?{appearance:inheritedAppearance}:{}),overrides,...(Object.keys(actions).length?{actions}:{}),...(Object.keys(tables).length?{tables}:{}),...(tableColumns?{tableColumns}:{}),...(tableHeaders?{tableHeaders}:{}),...(canvas?{canvas}:{}),...(Object.keys(sectionCanvases).length?{sectionCanvases}:{}),layoutMode:hasCanvas?(template.layoutMode??'canvas'):'schema'}
}

function withoutCustomColors<T extends object>(style:T):T {
  const clean={...style} as T & Record<string,unknown>
  for(const property of ['backgroundColor','textColor','labelColor','borderColor','focusColor','focusBackgroundColor','focusTextColor','focusBorderColor','focusLabelColor','hoverColor','hoverTextColor','hoverBorderColor','selectedColor','disabledColor','disabledTextColor','disabledBorderColor','errorColor'])delete clean[property]
  return clean
}

export function createOperationalRedesign(contract: OperationalFormContract, id: string, template: DesignerDraft, frame: ManagedFormFrame, version=1, sharedSchema?: FormSchemaDraft): ManagedLaboratoryForm {
  const baseline=catalogSchema(contract, sharedSchema)
  const form=createManagedLaboratoryForm({id,name:contract.title+' — بازطراحی',mode:'operational',templateSchema:baseline,templateDesigner:designSystemDefaults(template, sharedSchema, baseline),frame,templateVersion:version})
  if(sharedSchema?.settings?.specific&&operationalSource(sharedSchema)?.route===contract.route)form.schema.settings={...form.schema.settings,specific:{...form.schema.settings?.specific,...structuredClone(sharedSchema.settings.specific)}}
  const values={...form.schema.settings?.specific?.values,integrationOrigin:{kind:'replacement',route:contract.route,sourceSchemaId:baseline.id,navigationAddress:'navigation.route:'+contract.route,sourceFiles:[...contract.sourceFiles],api:[...contract.api],capturedAt:new Date().toISOString()},operationalSource:{route:contract.route,sourceFiles:contract.sourceFiles,api:contract.api,availability:contract.availability,baseline:structuredClone(baseline)},redesignIntent:'appearance'}
  form.schema.settings={...form.schema.settings,specific:{...form.schema.settings?.specific,values}}
  return form
}
export function operationalSource(schema: FormSchemaDraft) { return schema.settings?.specific?.values?.operationalSource as {route:MenuKey;sourceFiles:string[];api:string[];availability:OperationalFormContract['availability'];baseline:FormSchemaDraft}|undefined }
