import type { FormSchemaDraft } from './formSchema'
import { cascadingNameKey, cascadingTreeDemoNodes, type CascadingTreeNode } from './cascadingTree.ts'

export const productGroupLaboratoryFormTitle = 'تعریف گروه کالا — آزمایشی'

export const productGroupCascadingTreeTitles = ['گروه اصلی', 'زیرگروه ۱', 'زیرگروه ۲', 'زیرگروه ۳', 'زیرگروه ۴'] as const

export function productGroupReportColumns(fieldId: string): NonNullable<FormSchemaDraft['tables']>[number]['columns'] {
  return ['کد گروه', ...productGroupCascadingTreeTitles].map((label, index) => {
    const id = fieldId + (index === 0 ? '.code' : '.level.' + (index - 1))
    return { id, label: { fa: label, en: label, zh: label }, binding: { kind: 'dataField' as const, dataFieldId: id },
      width: index === 0 ? 100 : 160, visible: true, sortable: true, filterable: true,
      sourceFieldIds: [], independentPurpose: 'Hierarchy node code and ancestry', valueType: 'text' as const }
  })
}

/** Only complete terminal paths can be assigned to products. Incomplete siblings remain in the tree. */
export function productGroupTerminalNodes(nodes: readonly CascadingTreeNode[]) {
  const byId = new Map(nodes.map(node => [node.id,node]))
  const info = new Map<string,{root:CascadingTreeNode;depth:number}>(), maxima = new Map<string,number>()
  const parents = new Set(nodes.map(node => node.parentId))
  for (const node of nodes) {
    let root = node, depth = 0; const seen = new Set([node.id])
    while (root.parentId !== null) {
      const parent = byId.get(root.parentId)
      if (!parent || seen.has(parent.id)) break
      seen.add(parent.id); root = parent; depth++
    }
    if (root.parentId !== null) continue
    info.set(node.id,{root,depth}); maxima.set(root.id,Math.max(maxima.get(root.id) ?? 0,depth))
  }
  return nodes.filter(node => {const value=info.get(node.id);return value && !parents.has(node.id) && value.depth===(value.root.lockedDepth ?? maxima.get(value.root.id))})
}

/** Report every existing leaf path, regardless of product-assignment eligibility. */
export function productGroupReportRows(fieldId: string, nodes: readonly CascadingTreeNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const parents = new Set(nodes.map(node => node.parentId))
  const paths = new Set<string>()
  return nodes.filter(node => !parents.has(node.id)).flatMap(node => {
    const path: CascadingTreeNode[] = [], seen = new Set<string>()
    let current: CascadingTreeNode | undefined = node
    while (current && !seen.has(current.id)) {
      seen.add(current.id); path.unshift(current)
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }
    const root = path[0]?.parentId === null ? path[0] : undefined
    if (!root || path.length > 5) return []
    const key = JSON.stringify([root.id, ...path.map(item => cascadingNameKey(item.name))])
    if (paths.has(key)) return []
    paths.add(key)
    const values: Record<string, string> = { [fieldId + '.code']: root?.code ?? '', [fieldId]: path.map(item => item.name).join(' ‹ ') }
    for (let depth = 0; depth < 5; depth++) values[fieldId + '.level.' + depth] = path[depth]?.name ?? ''
    return [{ id: node.id, ...values, __treeFieldId: fieldId, __treeNodeId: node.id, __runtimeValues: values }]
  })
}

export type CascadingTreeLaboratorySettings = {
  maxSubgroups: number
  nodes: CascadingTreeNode[]
  columnTitles: string[]
  initialPath: string[]
}

function copyDemoNodes(): CascadingTreeNode[] {
  return cascadingTreeDemoNodes.map(node => ({ ...node }))
}

/** Repair the legacy tree starter once, retaining existing table configuration and identifiers. */
export function ensureProductGroupReportTable(schema: FormSchemaDraft, baseline?: FormSchemaDraft, initialize = false): FormSchemaDraft {
  if (!schema.fields.some(field => field.componentId === 'base-form.cascading-tree-panels')) return schema
  if (!initialize) {
    // Additive repair of the identified empty default only. Missing tables may
    // have been intentionally deleted; titles are not sufficient identity.
    const table = schema.tables?.find(table => table.id === schema.id + '.report')
    const tree = schema.fields.filter(field => field.componentId === 'base-form.cascading-tree-panels')
    if (schema.settings?.specific?.values?.productGroupReportInitialized !== true || !table || tree.length !== 1 || table.columns.length || table.dataSourceId !== 'local.synthetic' || table.sectionId !== schema.id + '.report-panel') return schema
    const section = schema.sections.find(section => section.id === table.sectionId && section.kind === 'grid')
    if (!section || section.enabled === false || section.parentId || section.tableIds?.some(id => id !== table.id)) return schema
    return { ...schema,
      sections: schema.sections.map(item => item === section && !item.initialSize ? { ...item, initialSize: { height: 300 } } : item),
      tables: schema.tables!.map(item => item === table ? { ...table, columns: productGroupReportColumns(tree[0].id) } : item) }
  }
  const sections = [...schema.sections]
  const tables: NonNullable<FormSchemaDraft['tables']> = structuredClone(schema.tables ?? [])
  const isReport = (table: NonNullable<FormSchemaDraft['tables']>[number]) => {
    const title = [table.title?.fa, table.title?.en, table.title?.zh].filter(Boolean).join(' ').toLocaleLowerCase()
    return table.id === schema.id + '.report' || title.includes('گزارش گروه کالا') || title.includes('product group report') || title.includes('商品组报表')
  }
  let report = tables.find(isReport)
  const baselineReport = baseline?.tables?.find(table => {
    const title = [table.title?.fa, table.title?.en, table.title?.zh].filter(Boolean).join(' ').toLocaleLowerCase()
    return title.includes('گزارش گروه کالا') || title.includes('product group report') || title.includes('商品组报表')
  })
  if (!report) {
    report = baselineReport ? { ...structuredClone(baselineReport), id: schema.id + '.report' } : {
      id: schema.id + '.report', sectionId: schema.id + '.report-panel',
      title: { fa: 'گزارش گروه کالا', en: 'Product group report', zh: '商品组报表' },
      dataSourceId: 'local.synthetic', columns: [], searchable: true, columnSelection: true,
      rowSelection: 'single' as const, contextMenu: true, exportable: true
    }
    tables.unshift(report)
  }
  const existingReportSection = sections.find(section => section.kind === 'grid' && (section.id === report!.sectionId || section.tableIds?.includes(report!.id)))
  const parentChainVisible = (sectionId?: string) => {
    let current = sections.find(section => section.id === sectionId)
    while (current) {
      if (current.enabled === false) return false
      current = current.parentId ? sections.find(section => section.id === current!.parentId) : undefined
    }
    return true
  }
  const fullyWired = Boolean(existingReportSection && report.sectionId === existingReportSection.id && existingReportSection.tableIds?.includes(report.id) && parentChainVisible(existingReportSection.id))
  if (schema.settings?.specific?.values?.productGroupReportInitialized === true && fullyWired) return schema

  const section = existingReportSection ?? sections.find(item => item.kind === 'grid' && !item.tableIds?.length)
  if (section) {
    const index = sections.findIndex(item => item.id === section.id)
    sections[index] = { ...section, enabled: true, tableIds: [...new Set([...(section.tableIds ?? []), report.id])] }
    report.sectionId = section.id
  } else {
    const saved = baseline?.sections.find(item => item.kind === 'grid' && item.id === report!.sectionId)
    const desiredId = report.sectionId ?? report.id + '.panel'
    const id = sections.some(item => item.id === desiredId) ? report.id + '.report-panel' : desiredId
    const created = { ...(saved ? structuredClone(saved) : {}), id, kind: 'grid' as const, parentId: undefined, enabled: true, order: Math.max(0, ...sections.filter(item => item.kind !== 'footer').map(item => item.order ?? 0)) + 1, tableIds: [report.id] }
    sections.push(created)
    report.sectionId = id
  }
  report.searchable ??= true
  report.columnSelection ??= true
  report.contextMenu ??= true
  report.exportable ??= true
  const visible = new Set<string>()
  for (const table of tables) {
    let id: string | undefined = table.sectionId
    while (id && !visible.has(id)) { visible.add(id); id = sections.find(section => section.id === id)?.parentId ?? undefined }
  }
  // Keep the report before the action bar in the root layout.
  const lastGridOrder = Math.max(0, ...sections.filter(section => section.kind === 'grid').map(section => section.order ?? 0))
  return { ...schema, tables, sections: sections.map(section => ({ ...section, ...(visible.has(section.id) ? { enabled: true } : {}), ...(section.kind === 'footer' && !section.parentId ? { order: Math.max(section.order ?? 0, lastGridOrder + 1) } : {}) })), settings: { ...schema.settings, specific: { ...schema.settings?.specific, values: { ...schema.settings?.specific?.values, productGroupReportInitialized: true } } } }
}

/** A standalone Laboratory draft with the shared editable report grid and demo hierarchy. */
export function createProductGroupLaboratorySchema(template: FormSchemaDraft, id = `form.product-group.experimental.${crypto.randomUUID()}`): FormSchemaDraft {
  const editorId = 'product-group.editor'
  const footerId = 'product-group.footer'
  const title = { fa: productGroupLaboratoryFormTitle, en: productGroupLaboratoryFormTitle, zh: productGroupLaboratoryFormTitle }
  const initialized = ensureProductGroupReportTable({
    ...structuredClone(template),
    id,
    title,
    status: 'draft',
    version: 1,
    mode: 'operational',
    sections: [
      { id: editorId, kind: 'editor', order: 0, settings: { viewport: { heightMode: 'content', overflowX: 'auto', overflowY: 'auto' } }, layout: { columns: 20, direction: 'vertical', gap: 12 } },
      { id: footerId, kind: 'footer', order: 1, layout: { columns: 20, direction: 'horizontal', gap: 8 } }
    ],
    fields: [{
      id: 'product-group.cascading-tree',
      sectionId: editorId,
      minTracks: 1,
      span: 20,
      kind: 'custom',
      componentId: 'base-form.cascading-tree-panels',
      label: { fa: 'ساختار گروه کالا', en: 'Product group hierarchy', zh: '商品组层级' },
      labelPolicy: 'fixed',
      settings: {
        cascadingTree: { nodes: copyDemoNodes(), columnTitles: [...productGroupCascadingTreeTitles], initialPath: ['demo-yarn', 'demo-yarn-chenille', 'demo-yarn-polyester', 'demo-yarn-grade-8'] },
        layout: { grid: { columns: 20, columnStart: 1, columnSpan: 20, rowStart: 1 } }
      }
    }],
    tables: [],
    actions: template.actions?.map(action => ({ ...structuredClone(action), sectionId: footerId })) ?? [],
    resources: {},
    uniqueConstraints: [],
    settings: { ...template.settings, specific: { ...template.settings?.specific, values: { ...template.settings?.specific?.values, productGroupReportInitialized: false } } },
    layout: { direction: 'vertical', gap: 12 }
  }, undefined, true)
  return ensureProductGroupReportTable(initialized)
}

function isNode(value: unknown): value is CascadingTreeNode {
  return !!value && typeof value === 'object'
    && typeof (value as CascadingTreeNode).id === 'string'
    && (value as CascadingTreeNode).parentId !== undefined
    && ((value as CascadingTreeNode).parentId === null || typeof (value as CascadingTreeNode).parentId === 'string')
    && typeof (value as CascadingTreeNode).name === 'string'
}

/** Reads only persisted settings belonging to the generic tree component. */
export function cascadingTreeSettingsFromField(settings: Readonly<Record<string, unknown>> | undefined): Partial<CascadingTreeLaboratorySettings> {
  const value = settings?.cascadingTree
  if (!value || typeof value !== 'object') return {}
  const config = value as { nodes?: unknown; columnTitles?: unknown; initialPath?: unknown; maxSubgroups?: unknown }
  return {
    maxSubgroups: typeof config.maxSubgroups === 'number' && Number.isFinite(config.maxSubgroups) ? Math.max(0, Math.min(4, Math.trunc(config.maxSubgroups))) : 4,
    ...(Array.isArray(config.nodes) && config.nodes.every(isNode) ? { nodes: config.nodes.map(node => ({ ...node })) } : {}),
    ...(Array.isArray(config.columnTitles) && config.columnTitles.every(title => typeof title === 'string') ? { columnTitles: [...config.columnTitles] } : {}),
    ...(Array.isArray(config.initialPath) && config.initialPath.every(id => typeof id === 'string') ? { initialPath: [...config.initialPath] } : {})
  }
}
