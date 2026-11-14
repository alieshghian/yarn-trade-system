import { designerEffectiveValues, setDesignerProperty, type DesignerCanvas, type DesignerDraft, type DesignerRect } from './designer.ts'

// A content component registers a surface; all geometry commands stay in the
// Laboratory engine. This adapter only measures flow layout and writes deltas
// back to the existing overrides. It never rewrites schemas or node data.
export type DesignerGeometryPolicy = { storage: 'flow'; move?: 'both' | 'vertical' | 'none'; resize?: 'both' | 'vertical'; preserveSlot?: boolean }
export const laboratoryGeometryContract = { version: 2, storage: ['canvas', 'flow'], commands: ['move', 'resize', 'align', 'arrange', 'equalSpacing', 'equalSize', 'center', 'smartLayout'], physicalCoordinates: true, selectedOnly: true, fullEdgeHitAreas: true, pointerPresentation:'animation-frame', pointerCommit:'release', pointerCancel:'restore' } as const
export type MeasuredDesignerGeometry = {
  canvas: DesignerCanvas
  scaleX: number
  scaleY: number
  policies: Record<string, { move: string; resize: string }>
  slots?: NonNullable<DesignerDraft['flowSlots']>
}

export function measureDesignerGeometry(root: HTMLElement | null, ids: readonly string[]): MeasuredDesignerGeometry | undefined {
  if (!root || !ids.length) return
  const selected = new Set(ids)
  const elements = [...root.querySelectorAll<HTMLElement>('[data-designer-storage="flow"]')]
  const targets = elements.filter(element => selected.has(element.dataset.fieldId!))
  if (targets.length !== selected.size) return
  const scopes = new Set(targets.map(element => element.closest('[data-designer-scope]') ?? root))
  const members = elements.filter(element => selected.has(element.dataset.fieldId!) || scopes.has(element.closest('[data-designer-scope]') ?? root))
    .filter(element => !targets.some(target => element !== target && (element.contains(target) || target.contains(element))))
  const origin = root.getBoundingClientRect()
  const scaleX = root.offsetWidth ? origin.width / root.offsetWidth || 1 : 1
  const scaleY = root.offsetHeight ? origin.height / root.offsetHeight || 1 : 1
  const fields: DesignerCanvas['fields'] = {}, policies: MeasuredDesignerGeometry['policies'] = {}, slots: NonNullable<DesignerDraft['flowSlots']> = {}
  for (const element of members) {
    const part = element.querySelector<HTMLElement>(':scope > div > .designer-input-part')
    if (!part || !part.getClientRects().length) continue
    const rect = part.getBoundingClientRect(), id = element.dataset.fieldId!
    const input: DesignerRect = { left: (rect.left - origin.left) / scaleX, top: (rect.top - origin.top) / scaleY, width: rect.width / scaleX, height: rect.height / scaleY }
    fields[id] = { input, label: { ...input, height: 0 } }
    policies[id] = { move: element.dataset.designerMove ?? 'both', resize: element.dataset.designerResize ?? 'both' }
    if (element.dataset.designerPreserveSlot === 'true') {
      const slot = element.getBoundingClientRect()
      slots[id] = { width: slot.width / scaleX, height: slot.height / scaleY }
    }
  }
  if (ids.some(id => !fields[id])) return
  return { canvas: { width: Math.max(root.clientWidth, ...Object.values(fields).map(field => field.input.left + field.input.width + 20)), height: Math.max(root.clientHeight, ...Object.values(fields).map(field => field.input.top + field.input.height + 20)), fields }, scaleX, scaleY, policies, slots }
}

export function commitMeasuredDesignerGeometry(draft: DesignerDraft, measured: MeasuredDesignerGeometry, proposed: DesignerCanvas, ids: readonly string[], validIds: readonly string[]): DesignerDraft {
  let next = draft
  for (const id of ids) {
    const before = measured.canvas.fields[id]?.input, after = proposed.fields[id]?.input
    if (!before || !after) continue
    const key = id + '::input', values = designerEffectiveValues(draft, id, 'input'), policy = measured.policies[id]
    if (policy?.move !== 'none') {
      if (policy?.move !== 'vertical' && after.left !== before.left) next = setDesignerProperty(next, [key], 'offsetX', Number(values.offsetX ?? 0) + after.left - before.left, validIds)
      if (after.top !== before.top) next = setDesignerProperty(next, [key], 'offsetY', Number(values.offsetY ?? 0) + after.top - before.top, validIds)
    }
    if (policy?.resize !== 'vertical' && after.width !== before.width) next = setDesignerProperty(next, [key], 'width', after.width, validIds)
    if (after.height !== before.height) next = setDesignerProperty(next, [key], 'height', after.height, validIds)
  }
  // Hold natural flex slots stable while their editable contents change size.
  // These are layout baselines, not overrides on unselected peers. Keeping them
  // in the draft makes Undo and save/reopen reproduce the same coordinates.
  return next !== draft && measured.slots && Object.keys(measured.slots).length
    ? { ...next, flowSlots: { ...measured.slots, ...draft.flowSlots } }
    : next
}
