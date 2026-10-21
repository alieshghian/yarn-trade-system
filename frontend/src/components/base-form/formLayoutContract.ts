import { validateDesignerCanvas, type DesignerCanvas, type DesignerDraft } from './designer.ts'
import { ensureLaboratoryTemplateFieldLayout, formSchemaFieldGridStyle, formSchemaGridColumnCount, laboratoryTemplateFormId } from './laboratoryFormDraftState.ts'
import type { FormSchemaDraft } from './formSchema.ts'

export type FormLayoutDevice = 'desktop' | 'tablet' | 'mobile'
export type FormLayoutKind = 'designer-canvas' | 'schema-grid'

export type FormLayoutContract = {
  formId: string
  device: FormLayoutDevice
  kind: FormLayoutKind
  fieldIds: string[]
  columns?: number
  schemaColumns?: number
  minimumWidth?: number
  canvas?: DesignerCanvas
  invalidCanvas: boolean
  firstRowFieldIds?: string[]
  fieldStyles: Record<string, { gridColumn: string } | undefined>
}

const laboratoryFirstRow = [
  ['personCode', '1 / span 2'],
  ['titleId', '3 / span 3'],
  ['firstName', '6 / span 5'],
  ['lastName', '11 / span 5'],
  ['jobId', '16 / span 5']
] as const

/** Keep ordinary control padding; trim only genuinely empty leading Canvas space. */
export function designerCanvasViewOrigin(canvas:DesignerCanvas):number {
  const left=Math.max(0,Math.min(...Object.values(canvas.fields).flatMap(field=>Object.values(field).map(rect=>rect.left)),2400))
  return left>32?left-12:0
}

function hasLaboratoryDefaultFirstRow(schema: FormSchemaDraft): boolean {
  return schema.templateFormId === laboratoryTemplateFormId && laboratoryFirstRow.every(([id, gridColumn]) =>
    formSchemaFieldGridStyle(schema, id)?.gridColumn === gridColumn && formSchemaFieldGridStyle(schema, id)?.gridRow === '1 / span 1')
}

/**
 * One layout precedence for the Laboratory and its independent drafts:
 * valid Designer Canvas geometry wins; otherwise Schema grid positions win.
 * Device layout is a view-only projection and never mutates either source.
 */
export function resolveFormLayout(schema: FormSchemaDraft, designerDraft: DesignerDraft, device: FormLayoutDevice, frameWidth = 1440, options:{cropEmptyCanvas?:boolean;originX?:number;minimumCanvasWidth?:number}={}): FormLayoutContract {
  const normalizedSchema = ensureLaboratoryTemplateFieldLayout(schema)
  const fieldIds = normalizedSchema.fields.map(field => field.id)
  const canvas = designerDraft.layoutMode !== 'schema' && designerDraft.canvas ? validateDesignerCanvas(designerDraft.canvas, fieldIds) : undefined
  const fieldStyles = Object.fromEntries(fieldIds.map(id => [id, formSchemaFieldGridStyle(normalizedSchema, id)]))
  const firstRowFieldIds = hasLaboratoryDefaultFirstRow(normalizedSchema) ? laboratoryFirstRow.map(([id]) => id) : undefined
  // Scroll extents are a view concern. Keep the original editable Canvas bounds in
  // designerDraftForEditor so resizing/moving can still use all available space.
  const viewport=normalizedSchema.sections.find(section=>section.kind==='editor')?.settings?.viewport as {heightMode?:string;overflowX?:string;overflowY?:string}|undefined
  if(canvas&&options.cropEmptyCanvas){
    const rectangles=Object.values(canvas.fields).flatMap(field=>Object.values(field))
    // Automatic overflow is independent on each axis. A fixed height must not
    // preserve unused horizontal space left behind by removed fields.
    if(viewport?.overflowX!=='scroll'&&!canvas.centeredFieldIds?.length){
      const left=options.originX??designerCanvasViewOrigin(canvas)
      canvas.fields=Object.fromEntries(Object.entries(canvas.fields).map(([id,field])=>[id,Object.fromEntries(Object.entries(field).map(([part,rect])=>[part,{...rect,left:rect.left-left}])) as typeof field]))
      canvas.width=Math.max(320,options.minimumCanvasWidth??0,...rectangles.map(rect=>rect.left-left+rect.width))
    }
    if(viewport?.heightMode!=='fixed'&&viewport?.overflowY!=='scroll')canvas.height=Math.max(80,...rectangles.map(rect=>rect.top+rect.height))
  }
  if (canvas && device === 'desktop') return { formId: schema.id, device, kind: 'designer-canvas', fieldIds, canvas, invalidCanvas: false, fieldStyles }

  const schemaColumns = formSchemaGridColumnCount(normalizedSchema) ?? 20
  const columns = device === 'mobile' ? 1 : device === 'tablet' ? 2 : schemaColumns
  return {
    formId: schema.id, device, kind: 'schema-grid', fieldIds, columns, schemaColumns,
    ...(device === 'desktop' ? {
      minimumWidth: Math.max(
        // The frame's nominal width is not a minimum editor width when the sidebar is open.
        options.cropEmptyCanvas?320:Math.max(320,Math.min(2400,frameWidth)),
        normalizedSchema.sections.find(section => section.kind === 'editor')?.layout?.minimumWidth ?? 0
      )
    } : {}),
    invalidCanvas: designerDraft.layoutMode !== 'schema' && Boolean(designerDraft.canvas) && !canvas, firstRowFieldIds: device === 'desktop' ? firstRowFieldIds : undefined, fieldStyles
  }
}

type LayoutComputedStyle = Pick<CSSStyleDeclaration, 'display' | 'gridTemplateColumns' | 'position'>
type LayoutStyleReader = (element: HTMLElement) => LayoutComputedStyle
type LayoutBox = { left: number; top: number; right: number; bottom: number }

/** Check only mounted renderer-owned roots with the contract committed alongside them.
 * ResizeObserver may run between a DOM commit and passive-effect cleanup; rebuilding
 * contracts from an older page closure can otherwise assign all fields to empty panels.
 */
export function inspectRegisteredFormLayouts(
  frame: Pick<HTMLElement, 'contains'>,
  roots: ReadonlyMap<HTMLElement, FormLayoutContract>,
  readStyle: LayoutStyleReader = element => window.getComputedStyle(element)
): { formId: string; sectionId?: string; issues: string[] }[] {
  const results: { formId: string; sectionId?: string; issues: string[] }[] = []
  for (const [grid, contract] of roots) {
    if (!grid.isConnected || !frame.contains(grid) || grid.getClientRects().length === 0) continue
    const issues = inspectRenderedFormLayout(grid, contract, readStyle)
    grid.dataset.layoutValidation = issues.length ? 'warning' : 'passed'
    if (issues.length) grid.dataset.layoutWarning = issues.join(' | ')
    else delete grid.dataset.layoutWarning
    results.push({ formId: contract.formId, sectionId: grid.dataset.sectionId, issues })
  }
  return results
}

function fieldBox(field: HTMLElement): LayoutBox {
  const own = field.getBoundingClientRect()
  if (own.width > 0 && own.height > 0) return { left: own.left, top: own.top, right: own.right, bottom: own.bottom }
  const parts = [field.querySelector<HTMLElement>('.designer-label-part'), field.querySelector<HTMLElement>('.designer-input-part')]
    .filter((part): part is HTMLElement => Boolean(part))
    .map(part => part.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
  if (!parts.length) return { left: own.left, top: own.top, right: own.right, bottom: own.bottom }
  return {
    left: Math.min(...parts.map(rect => rect.left)), top: Math.min(...parts.map(rect => rect.top)),
    right: Math.max(...parts.map(rect => rect.right)), bottom: Math.max(...parts.map(rect => rect.bottom))
  }
}

function boxesOverlap(a: LayoutBox, b: LayoutBox): boolean {
  return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
}

/** Reads real computed styles and browser geometry; it never changes form data. */
export function inspectRenderedFormLayout(
  grid: HTMLElement,
  contract: FormLayoutContract,
  readStyle: LayoutStyleReader = element => window.getComputedStyle(element)
): string[] {
  const issues: string[] = []
  const fields = Array.from(grid.children).filter((child): child is HTMLElement => Boolean((child as HTMLElement).dataset?.fieldId))
  const byId = new Map(fields.map(field => [field.dataset.fieldId!, field]))
  const missing = contract.fieldIds.filter(id => !byId.has(id))
  const unexpected = fields.map(field => field.dataset.fieldId!).filter(id => !contract.fieldIds.includes(id))
  if (missing.length) issues.push(`Schema fields missing from DOM: ${missing.join(', ')}`)
  if (unexpected.length) issues.push(`DOM fields absent from Schema: ${unexpected.join(', ')}`)
  if (fields.length !== contract.fieldIds.length) issues.push(`Expected ${contract.fieldIds.length} field nodes, found ${fields.length}`)
  if (contract.invalidCanvas) issues.push('Stored Designer Canvas is invalid; Schema grid fallback is active (saved data was not changed).')

  const gridStyle = readStyle(grid)
  if (contract.kind === 'schema-grid') {
    if (gridStyle.display !== 'grid') issues.push(`Schema layout must use display:grid; computed display is ${gridStyle.display}`)
    const columnCount = gridStyle.gridTemplateColumns === 'none' ? 0 : gridStyle.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
    if (columnCount !== contract.columns) issues.push(`Expected ${contract.columns} grid columns for ${contract.device}; computed ${columnCount}`)
    const trackWidths = gridStyle.gridTemplateColumns.trim().split(/\s+/).map(value => Number.parseFloat(value)).filter(Number.isFinite)
    if (trackWidths.length > 1 && Math.max(...trackWidths) - Math.min(...trackWidths) > 2) issues.push('Schema grid tracks are unequal; an inherited grid rule or implicit columns may have replaced the layout contract.')
  } else {
    if (gridStyle.display === 'grid') issues.push('Designer Canvas layout unexpectedly fell back to CSS Grid.')
    const origin = grid.getBoundingClientRect()
    for (const fieldId of contract.fieldIds) {
      const field = byId.get(fieldId)
      if (!field) continue
      for (const partSelector of ['.designer-label-part', '.designer-input-part']) {
        const part = field.querySelector<HTMLElement>(partSelector)
        if (part && readStyle(part).position !== 'absolute') issues.push(`Canvas ${partSelector} for ${fieldId} is not positioned by the saved Canvas.`)
        const expected = contract.canvas?.fields[fieldId]?.[partSelector === '.designer-label-part' ? 'label' : 'input']
        if (part && expected) {
          const actual = part.getBoundingClientRect()
          const centerShift=contract.canvas?.centeredFieldIds?.includes(fieldId)?(origin.width-contract.canvas.width)/2:0
          if (Math.abs(actual.left - origin.left - expected.left-centerShift) > 2 || Math.abs(actual.top - origin.top - expected.top) > 2 || Math.abs(actual.width - expected.width) > 2 || Math.abs(actual.height - expected.height) > 2) issues.push(`Canvas geometry differs from saved layout: ${fieldId}${partSelector}`)
        }
      }
    }
  }

  const measured = fields.map(field => ({ id: field.dataset.fieldId!, box: fieldBox(field) }))
  for (let index = 0; index < measured.length; index++) {
    for (const other of measured.slice(index + 1)) {
      if (boxesOverlap(measured[index].box, other.box)) issues.push(`Fields overlap: ${measured[index].id} and ${other.id}`)
    }
  }
  if (contract.firstRowFieldIds?.length) {
    const firstRow = contract.firstRowFieldIds.map(id => byId.get(id)).filter((field): field is HTMLElement => Boolean(field))
    if (firstRow.length === contract.firstRowFieldIds.length) {
      const tops = firstRow.map(field => fieldBox(field).top)
      if (Math.max(...tops) - Math.min(...tops) > 2) issues.push(`Default desktop first row is split across rows: ${contract.firstRowFieldIds.join(', ')}`)
    }
  }
  return [...new Set(issues)]
}
