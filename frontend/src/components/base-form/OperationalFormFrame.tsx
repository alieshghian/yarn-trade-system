import {FormDocumentDialog} from './FormDocumentDialog'
import {FormDocumentHeader} from './FormDocumentHeader'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { currentUserKey } from '../../api'
import { FormSettingsButton } from './FormSettingsButton'
import { captureDesignerPointer, designerResizeHandles as resizeHandles, designerEffectiveValues, resizeDesignerEdge, type DesignerDraft } from './designer'
import type { ManagedFormCustomization } from './laboratoryFormDraftState'
import { DesignerFontPanel, type DesignerFontValue } from './DesignerFontPanel'
import { ExcelColorPicker } from './ExcelColorPicker'
import behaviorDefaults from './laboratoryOperationalBehavior.json'
import './operationalFormFrame.css'
import { OperationalGridCustomizationContext, type OperationalGridCustomization, type OperationalGridLayout } from './operationalGridCustomization'

type PersonalStyle = Partial<Pick<DesignerFontValue, 'fontFamily' | 'fontSize' | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'script'>> & Partial<Record<'textColor' | 'backgroundColor' | 'borderColor', string>>
type Preferences = { width?: number; height?: number; offsetX?: number; offsetY?: number; formHeaderHeight?: number; editorRatio?: number; fontSize?: number; fontFamily?: string; backgroundColor?: string; overrides?: DesignerDraft['overrides']; regions?: Record<string, PersonalStyle>; gridLayouts?: Record<string, OperationalGridLayout> }
type BehaviorContract = typeof behaviorDefaults
type TargetRule = { id: string; selector: string; backgroundSelector?: string; borderSelector?: string; label: { fa: string; en: string }; positionEditable: boolean; resize?: 'headerHeight' | 'toolbarHeight' | 'editorRatio' | 'formHeaderHeight' }
type TargetMatch = { key: string; node: HTMLElement; label: string; gridId?: string }
type Props = { formId: string; title: string; language: 'fa' | 'en' | 'zh'; designerDraft: DesignerDraft; permissions: ManagedFormCustomization; width: number; height?: number | null; notice?: ReactNode; fieldIds?: Record<string, string>; behaviorContract?: BehaviorContract; children: (draft: DesignerDraft) => ReactNode }

const fontKeys = ['fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'strikeThrough', 'script']
const colorKeys = ['backgroundColor', 'textColor', 'borderColor']
const fontValues = new Set(['inherit', 'vazirmatn', 'tahoma', 'segoe', 'arial', 'naskh', 'aptos', 'calibri', 'cambria', 'consolas', 'courier', 'georgia', 'times', 'verdana'])
const fontFamilies: Record<string, string> = { inherit: 'inherit', vazirmatn: "'Vazirmatn',Tahoma,Arial,sans-serif", tahoma: 'Tahoma,Arial,sans-serif', segoe: "'Segoe UI',Tahoma,sans-serif", arial: 'Arial,sans-serif', naskh: "'Noto Naskh Arabic','B Nazanin',serif", aptos: 'Aptos,Arial,sans-serif', calibri: 'Calibri,Arial,sans-serif', cambria: 'Cambria,serif', consolas: 'Consolas,monospace', courier: "'Courier New',monospace", georgia: 'Georgia,serif', times: "'Times New Roman',serif", verdana: 'Verdana,sans-serif' }
const hexColor = /^#[0-9a-f]{6}$/i
const personalContract = (contract: BehaviorContract) => contract.personalCustomization

function targetRule(targetId: string, contract: BehaviorContract): TargetRule | undefined {
  const customization = personalContract(contract)
  const rules = customization.targets as readonly TargetRule[]
  const materialize=(rule:TargetRule,token:string,value:string):TargetRule=>({...rule,selector:rule.selector.replaceAll(token,value),...(rule.backgroundSelector?{backgroundSelector:rule.backgroundSelector.replaceAll(token,value)}:{}),...(rule.borderSelector?{borderSelector:rule.borderSelector.replaceAll(token,value)}:{})})
  const exact = rules.find(rule => rule.id === targetId)
  if (exact) return exact
  const toolbar = targetId.startsWith('toolbar:') ? targetId.slice('toolbar:'.length) : ''
  if (toolbar && (customization.toolbarParts as readonly string[]).includes(toolbar)) {
    const rule = rules.find(item => item.id === 'toolbar:{part}')
    return rule ? { ...materialize(rule,'{part}',toolbar), label: { fa: `${rule.label.fa} — ${toolbar}`, en: `${rule.label.en} — ${toolbar}` } } : undefined
  }
  const column = /^(table-header|table-column):([a-zA-Z0-9_.-]{1,80})$/.exec(targetId)
  if (column) {
    const rule = rules.find(item => item.id === `${column[1]}:{columnId}`)
    return rule ? { ...materialize(rule,'{columnId}',column[2]), label: { fa: `${rule.label.fa} — ${column[2]}`, en: `${rule.label.en} — ${column[2]}` } } : undefined
  }
  return undefined
}

function permitted(value: Preferences, permissions: ManagedFormCustomization, contract: BehaviorContract): Preferences {
  const n = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined
  const overrides = Object.fromEntries(Object.entries(value.overrides ?? {}).map(([id, values]) => [id, Object.fromEntries(Object.entries(values).filter(([key, item]) => permissions.typography && fontKeys.includes(key) && (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') || permissions.colors && colorKeys.includes(key) && typeof item === 'string' && hexColor.test(item)))])) as DesignerDraft['overrides']
  const allowed = new Set(personalContract(contract).styleProperties as readonly string[])
  const regions = Object.fromEntries(Object.entries(value.regions ?? {}).flatMap(([id, candidate]) => {
    if (!targetRule(id, contract) || !candidate || typeof candidate !== 'object') return []
    const safe: Record<string, string | number | boolean> = {}
    for (const [key, item] of Object.entries(candidate)) {
      if (!allowed.has(key)) continue
      if (fontKeys.includes(key) && !permissions.typography) continue
      if (colorKeys.includes(key) && !permissions.colors) continue
      if (key === 'fontFamily' && typeof item === 'string' && fontValues.has(item)) safe[key] = item
      else if (key === 'fontSize' && typeof item === 'number' && Number.isFinite(item)) safe[key] = Math.max(8, Math.min(72, item))
      else if (['bold', 'italic', 'strikeThrough'].includes(key) && typeof item === 'boolean') safe[key] = item
      else if (key === 'underline' && (item === 'none' || item === 'single' || item === 'double')) safe[key] = item
      else if (key === 'script' && (item === 'none' || item === 'superscript' || item === 'subscript')) safe[key] = item
      else if (colorKeys.includes(key) && typeof item === 'string' && hexColor.test(item)) safe[key] = item
    }
    return Object.keys(safe).length ? [[id, safe as PersonalStyle]] : []
  }))
  const gridLayouts = permissions.tablePresentation ? Object.fromEntries(Object.entries(value.gridLayouts ?? {}).flatMap(([id, candidate]) => {
    if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(id) || !candidate || typeof candidate !== 'object') return []
    const columnWidths = Object.fromEntries(Object.entries(candidate.columnWidths ?? {}).flatMap(([columnId, width]) => {
      const safeWidth = n(width, 80, 1200)
      return /^[a-zA-Z0-9_.:-]{1,100}$/.test(columnId) && safeWidth !== undefined ? [[columnId, safeWidth]] : []
    }))
    const headerHeight = n(candidate.headerHeight, 28, 120)
    const toolbarHeight = n(candidate.toolbarHeight, 56, 260)
    return [[id, { ...(Object.keys(columnWidths).length ? { columnWidths } : {}), ...(headerHeight !== undefined ? { headerHeight } : {}), ...(toolbarHeight !== undefined ? { toolbarHeight } : {}) }]]
  })) : undefined
  return { ...(permissions.formSize ? { width: n(value.width, 320, 1920), height: n(value.height, 600, 1200), offsetX: n(value.offsetX, -1920, 1920), offsetY: n(value.offsetY, -1200, 1200), formHeaderHeight: n(value.formHeaderHeight, 48, 180) } : {}), ...(permissions.tablePresentation || permissions.formSize ? { editorRatio: n(value.editorRatio, 0.08, 12) } : {}), ...(permissions.typography ? { fontSize: n(value.fontSize, 8, 72), fontFamily: typeof value.fontFamily === 'string' && fontValues.has(value.fontFamily) ? value.fontFamily : undefined } : {}), ...(permissions.colors && hexColor.test(value.backgroundColor ?? '') ? { backgroundColor: value.backgroundColor } : {}), overrides, regions, ...(gridLayouts ? { gridLayouts } : {}) }
}

function computedColor(value: string): string | undefined {
  if (hexColor.test(value)) return value.toLowerCase()
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i.exec(value)
  if (!rgb) return undefined
  if (rgb[4] !== undefined && Number(rgb[4]) === 0) return undefined
  return '#' + rgb.slice(1, 4).map(part => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0')).join('')
}

function computedFontFamily(value: string): string {
  const normalized = value.toLowerCase()
  return Object.entries(fontFamilies).find(([key, family]) => key !== 'inherit' && normalized.includes(family.split(',')[0].replaceAll("'", '').toLowerCase()))?.[0] ?? 'inherit'
}

function regionStyleFromElement(node: HTMLElement): PersonalStyle {
  const style = getComputedStyle(node)
  const decorations = style.textDecorationLine
  return {
    fontFamily: computedFontFamily(style.fontFamily), fontSize: Number.parseFloat(style.fontSize) || 16,
    bold: Number.parseInt(style.fontWeight, 10) >= 600, italic: style.fontStyle === 'italic',
    underline: decorations.includes('underline') ? 'single' : 'none', strikeThrough: decorations.includes('line-through'),
    script: style.verticalAlign === 'super' ? 'superscript' : style.verticalAlign === 'sub' ? 'subscript' : 'none',
    textColor: computedColor(style.color), backgroundColor: computedColor(style.backgroundColor), borderColor: computedColor(style.borderColor)
  }
}

function cssDeclarations(style: PersonalStyle): string {
  const declarations: string[] = []
  if (style.fontFamily && fontFamilies[style.fontFamily]) declarations.push(`font-family:${fontFamilies[style.fontFamily]} !important`)
  if (typeof style.fontSize === 'number') declarations.push(`font-size:${style.fontSize}px !important`)
  if (typeof style.bold === 'boolean') declarations.push(`font-weight:${style.bold ? 700 : 400} !important`)
  if (typeof style.italic === 'boolean') declarations.push(`font-style:${style.italic ? 'italic' : 'normal'} !important`)
  if (typeof style.underline === 'string' || typeof style.strikeThrough === 'boolean') {
    const decoration = [style.underline && style.underline !== 'none' ? 'underline' : '', style.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ')
    declarations.push(`text-decoration-line:${decoration || 'none'} !important`)
    if (style.underline === 'double') declarations.push('text-decoration-style:double !important')
  }
  if (style.script) declarations.push(`vertical-align:${style.script === 'none' ? 'baseline' : style.script === 'superscript' ? 'super' : 'sub'} !important`)
  if (style.textColor && hexColor.test(style.textColor)) declarations.push(`color:${style.textColor} !important`)
  if (style.backgroundColor && hexColor.test(style.backgroundColor)) declarations.push(`background:${style.backgroundColor} !important`)
  if (style.borderColor && hexColor.test(style.borderColor)) declarations.push(`border-color:${style.borderColor} !important`)
  return declarations.join(';')
}

function personalStylesheet(regions: Record<string, PersonalStyle>, contract: BehaviorContract): string {
  const priority = (id: string) => id === 'form-title' || ['table-headers', 'table-rows', 'table-cells'].includes(id) ? 1 : id === 'toolbar:search' ? 1 : id.startsWith('toolbar:searchOption:') ? 4 : ['toolbar:searchInput', 'toolbar:searchInput:focus'].includes(id) ? 5 : id.startsWith('toolbar:') || id.startsWith('table-header:') || id.startsWith('table-column:') ? 3 : 0
  const scoped = (selector: string) => selector.split(',').map(part => `.operational-form-frame ${part.trim()}`).join(',')
  return Object.entries(regions).sort(([left], [right]) => priority(left) - priority(right)).flatMap(([id, style]) => {
    const rule = targetRule(id, contract)
    if (!rule) return []
    const text = { ...style, backgroundColor: undefined, borderColor: undefined }
    const output: string[] = []
    const textDeclarations = cssDeclarations(text)
    if (textDeclarations) output.push(`${scoped(rule.selector)}{${textDeclarations}}`)
    if (style.backgroundColor && hexColor.test(style.backgroundColor)) output.push(`${scoped(rule.backgroundSelector ?? rule.selector)}{background:${style.backgroundColor} !important}`)
    if (style.borderColor && hexColor.test(style.borderColor)) output.push(`${scoped(rule.borderSelector ?? rule.selector)}{border-color:${style.borderColor} !important}`)
    return output
  }).join('\n')
}

/** Personal appearance follows the form's embedded Laboratory contract and shared formatting controls. */
export function OperationalFormFrame(p: Props) {
  const fa = p.language === 'fa', contract = p.behaviorContract ?? behaviorDefaults
  const key = 'yarn-trade:operational-form-preferences:v1:' + encodeURIComponent(currentUserKey()) + ':' + p.formId
  const [saved, setSaved] = useState<Preferences>(() => { try { return permitted(JSON.parse(localStorage.getItem(key) ?? '{}'), p.permissions, contract) } catch { return {} } })
  const [editing, setEditing] = useState<Preferences | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [targetBaseStyle, setTargetBaseStyle] = useState<PersonalStyle>({})
  const [selectedNode, setSelectedNode] = useState<HTMLElement | null>(null)
  const [targetGridId, setTargetGridId] = useState<string | null>(null)
  const [font, setFont] = useState<DesignerFontValue | null>(null)
  const [fontPreviewColor,setFontPreviewColor]=useState<string|null>(null)
  const [color, setColor] = useState<'textColor' | 'backgroundColor' | 'borderColor' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number } | null>(null)
  const [contextGroup, setContextGroup] = useState<'text' | 'appearance' | null>(null)
  const [error, setError] = useState('')
  const colorPreviewBase = useRef<{ target: string; property: 'textColor' | 'backgroundColor' | 'borderColor'; value: string | undefined } | null>(null)
  const resizeHandleRef = useRef<HTMLButtonElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null), contextSubmenuRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null)
  const fontPatch=font?{fontFamily:font.fontFamily,fontSize:font.fontSize,bold:font.bold,italic:font.italic,underline:font.underline,strikeThrough:font.strikeThrough,script:font.script,...(p.permissions.colors?{textColor:fontPreviewColor??font.color}:{})}:null
  const livePreferences=fontPatch&&editing&&target ? target.startsWith('region:') ? {...editing,regions:{...editing.regions,[target.slice(7)]:{...editing.regions?.[target.slice(7)],...fontPatch}}} : {...editing,overrides:{...editing.overrides,[target]:{...editing.overrides?.[target],...fontPatch}}} : editing??saved
  const preferences = permitted(livePreferences, p.permissions, contract)
  const input = { ...p.designerDraft.defaults?.input, ...(preferences.fontSize ? { fontSize: preferences.fontSize } : {}), ...(preferences.fontFamily ? { fontFamily: preferences.fontFamily } : {}), ...(preferences.backgroundColor ? { backgroundColor: preferences.backgroundColor } : {}) }
  const overrides = Object.fromEntries([...new Set([...Object.keys(p.designerDraft.overrides), ...Object.keys(preferences.overrides ?? {})])].map(id => [id, { ...p.designerDraft.overrides[id], ...preferences.overrides?.[id] }]))
  const draft: DesignerDraft = { ...p.designerDraft, overrides, defaults: { ...p.designerDraft.defaults, input, label: { ...p.designerDraft.defaults?.label, ...(preferences.fontSize ? { fontSize: preferences.fontSize } : {}) } } }
  const regionId = target?.startsWith('region:') ? target.slice('region:'.length) : null
  const selectedRule = regionId ? targetRule(regionId, contract) : undefined
  const values = regionId ? { ...targetBaseStyle, ...preferences.regions?.[regionId] } : target ? designerEffectiveValues(draft, target.split('::')[0], target.endsWith('::label') ? 'label' : 'input') : input
  useEffect(() => {
    if (!editing || !['toolbarHeight', 'headerHeight', 'formHeaderHeight'].includes(selectedRule?.resize ?? '')) return
    resizeHandleRef.current?.focus({ preventScroll: true })
  }, [editing, selectedNode, selectedRule?.resize, target])
  const changeStyle = (style: Record<string, unknown>) => setEditing(current => {
    if (!current || !target) return current
    const apply = (previous: Record<string, unknown> = {}) => {
      const next = { ...previous }
      for (const [key, value] of Object.entries(style)) { if (value === undefined) delete next[key]; else next[key] = value }
      return next
    }
    if (target.startsWith('region:')) {
      const id = target.slice('region:'.length)
      return { ...current, regions: { ...current.regions, [id]: apply(current.regions?.[id]) as PersonalStyle } }
    }
    return { ...current, overrides: { ...current.overrides, [target]: apply(current.overrides?.[target]) as DesignerDraft['overrides'][string] } }
  })
  const updateGridLayout = (gridId: string, patch: OperationalGridLayout) => {
    const merge = (current: Preferences): Preferences => {
      const previous = current.gridLayouts?.[gridId] ?? {}
      const { columnWidths, ...dimensions } = patch
      return { ...current, gridLayouts: { ...current.gridLayouts, [gridId]: { ...previous, ...dimensions, ...(columnWidths ? { columnWidths: { ...previous.columnWidths, ...columnWidths } } : {}) } } }
    }
    if (editing) { setEditing(current => current ? merge(current) : current); return }
    setSaved(current => {
      const next = permitted(merge(current), p.permissions, contract)
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep the live layout if storage is unavailable. */ }
      return next
    })
  }
  const updateEditorRatio = (ratio: number) => {
    if (!(p.permissions.tablePresentation || p.permissions.formSize)) return
    const nextRatio = Math.max(0.08, Math.min(12, ratio))
    if (editing) { setEditing(current => current ? { ...current, editorRatio: nextRatio } : current); return }
    setSaved(current => {
      const next = permitted({ ...current, editorRatio: nextRatio }, p.permissions, contract)
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep the current split if storage is unavailable. */ }
      return next
    })
  }
  const openFont = () => {setFontPreviewColor(null);const sample=selectedNode?.querySelector<HTMLElement>('.cascading-tree-node[style*="font-weight"]')??selectedNode?.querySelector<HTMLElement>('input,textarea,select')??selectedNode;const effective={...values,...(sample?regionStyleFromElement(sample):targetBaseStyle)};setFont({ fontFamily: String(effective.fontFamily ?? 'inherit'), fontSize: Number(effective.fontSize ?? 16), bold: typeof effective.bold === 'boolean' ? effective.bold : Number((values as {fontWeight?:number}).fontWeight ?? 400)>=600, italic: effective.italic === true, underline: (effective.underline ?? 'none') as DesignerFontValue['underline'], strikeThrough: effective.strikeThrough === true, script: (effective.script ?? 'none') as DesignerFontValue['script'], normalFont: false, color: String(effective.textColor ?? '#263a38'), base: p.designerDraft })}
  const openColor = (property: 'textColor' | 'backgroundColor' | 'borderColor') => {
    const stored = target?.startsWith('region:') ? preferences.regions?.[target.slice('region:'.length)]?.[property] : target ? preferences.overrides?.[target]?.[property] : undefined
    colorPreviewBase.current = target ? { target, property, value: typeof stored === 'string' ? stored : undefined } : null
    setColor(property)
  }
  const resolveTarget = (element: Element): TargetMatch | null => {
    if (element.closest('.operational-settings-tools, .operational-settings-header-actions')) return null
    const fieldPart = element.closest<HTMLElement>('.designer-input-part,.designer-label-part')
    if (fieldPart) {
      const field = fieldPart.closest('.laboratory-designer-field')?.querySelector<HTMLElement>('[data-field]')?.dataset.field
      if (field) return { key: (p.fieldIds?.[field] ?? field) + (fieldPart.classList.contains('designer-label-part') ? '::label' : '::input'), node: fieldPart, label: fieldPart.classList.contains('designer-label-part') ? (fa ? 'برچسب فیلد' : 'Field label') : (fa ? 'فیلد فرم' : 'Form field') }
    }
    const target = (key: string, node: Element | null): TargetMatch | null => {
      if (!node || !frameRef.current?.contains(node)) return null
      const rule = targetRule(key, contract)
      const canResize = rule?.resize === 'formHeaderHeight' ? p.permissions.formSize
        : rule?.resize === 'editorRatio' ? p.permissions.tablePresentation || p.permissions.formSize
          : rule?.resize === 'toolbarHeight' || rule?.resize === 'headerHeight' ? p.permissions.tablePresentation : false
      if (!(p.permissions.colors || p.permissions.typography || canResize)) return null
      const gridId = node.closest<HTMLElement>('.base-grid-boundary[data-grid-id]')?.dataset.gridId
        ?? node.closest<HTMLElement>('.person-grid-panel[data-table-id]')?.dataset.tableId
      return rule ? { key: 'region:' + key, node: node as HTMLElement, label: rule.label[fa ? 'fa' : 'en'], gridId } : null
    }
    const title = element.closest('.form-laboratory-banner .laboratory-banner-title')
    if (title) return target('form-title', title)
    const header = element.closest('.form-laboratory-banner')
    if (header) return target('form-header', header)
    const searchInput = element.closest<HTMLElement>('.grid-toolbar-panels [data-toolbar-part="searchInput"] input')
    if (searchInput) return target(searchInput.matches(':focus') ? 'toolbar:searchInput:focus' : 'toolbar:searchInput', searchInput)
    const toolbar = element.closest<HTMLElement>('[data-toolbar-part]')
    if (toolbar?.dataset.toolbarPart) {
      if (toolbar.dataset.toolbarPart === 'header') return target('grid-toolbar', toolbar)
      const match = target('toolbar:' + toolbar.dataset.toolbarPart, toolbar)
      if (match) return match
    }
    const headerCell = element.closest<HTMLElement>('.base-grid-table thead th[data-column]')
    if (headerCell?.dataset.column) return target('table-header:' + headerCell.dataset.column, headerCell)
    const dataCell = element.closest<HTMLElement>('.base-grid-table tbody td[data-column]')
    if (dataCell?.dataset.column) return target('table-column:' + dataCell.dataset.column, dataCell)
    const headerRow = element.closest('.base-grid-table thead')
    if (headerRow) return target('table-headers', headerRow)
    const dataRows = element.closest('.base-grid-table tbody tr')
    if (dataRows) return target('table-rows', dataRows.closest('tbody'))
    const table = element.closest('.base-grid-table-wrap, .base-grid-table')
    if (table) return target('grid-table', table.closest('.base-grid-table-wrap') ?? table)
    const gridToolbar = element.closest('.grid-toolbar-panels')
    if (gridToolbar) return target('grid-toolbar', gridToolbar.querySelector<HTMLElement>(':scope > .grid-toolbar[data-toolbar-part="header"]') ?? gridToolbar)
    const gridPanel = element.closest('.person-grid-panel')
    if (gridPanel) return target('grid-panel', gridPanel)
    const editor = element.closest<HTMLElement>('.person-editor')
    if (editor) return target('form-editor', editor)
    const notice = element.closest('.operational-form-notice')
    if (notice) return target('form-notice', notice)
    return null
  }
  const markTarget = (match: TargetMatch) => {
    frameRef.current?.querySelectorAll('.personal-selected').forEach(node => node.classList.remove('personal-selected'))
    match.node.classList.add('personal-selected')
    setTarget(match.key)
    setSelectedNode(match.node)
    setTargetGridId(match.gridId ?? null)
    setTargetBaseStyle(regionStyleFromElement(match.node.querySelector<HTMLElement>('.cascading-tree-node[style*="font-weight"]') ?? match.node))
  }
  const clearSelection = () => {
    frameRef.current?.querySelectorAll('.personal-selected').forEach(node => node.classList.remove('personal-selected'))
    setTarget(null)
    setSelectedNode(null)
    setTargetGridId(null)
    setTargetBaseStyle({})
  }
  const select = (event: PointerEvent<HTMLDivElement>) => {
    if (!editing || event.button !== 0 || !event.target || !(event.target instanceof Element)) return
    if ((event.target as Element).closest('button, a, select, option, .base-grid-resizer, .header-height-handle, .designer-edge-handle, .grid-tool-move-handle, .operational-region-resize-handle, .operational-settings-tools, .operational-settings-header-actions')) return
    const match = resolveTarget(event.target)
    if (!match) return
    event.preventDefault(); event.stopPropagation(); markTarget(match)
  }
  const openElementMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!editing || !(p.permissions.colors || p.permissions.typography || p.permissions.tablePresentation || p.permissions.formSize) || !(event.target instanceof Element)) return
    if (event.target.closest('.operational-settings-tools, .operational-settings-header-actions')) return
    const match = resolveTarget(event.target)
    if (!match) return
    const canStyle = p.permissions.colors || p.permissions.typography
    const canResize = match.key.startsWith('region:') && Boolean(targetRule(match.key.slice('region:'.length), contract)?.resize)
    if (!canStyle && !canResize) return
    event.preventDefault(); event.stopPropagation(); markTarget(match); setContextGroup(null)
    if (!canStyle) { setContextMenu(null); return }
    setContextMenu({ left: Math.max(8, Math.min(event.clientX, window.innerWidth - 228)), top: Math.max(8, Math.min(event.clientY, window.innerHeight - 190)) })
  }
  useEffect(() => {
    if (!contextMenu) return
    const outside = (event: globalThis.PointerEvent) => { if (!contextMenuRef.current?.contains(event.target as Node) && !contextSubmenuRef.current?.contains(event.target as Node)) { setContextMenu(null); setContextGroup(null) } }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); if (contextGroup) setContextGroup(null); else setContextMenu(null) } }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true) }
  }, [contextMenu, contextGroup])
  useEffect(() => {
    if (!editing || contextMenu || color || font || (selectedRule?.resize !== 'toolbarHeight' && selectedRule?.resize !== 'headerHeight')) return
    frameRef.current?.querySelector<HTMLButtonElement>(`.operational-region-resize-handle.is-bottom[data-resize-kind="${selectedRule.resize}"]`)?.focus({ preventScroll: true })
  }, [editing, target, targetGridId, contextMenu, color, font, selectedRule?.resize])
  const saveSettings = () => {
    if (!editing) return
    try { const next = permitted(editing, p.permissions, contract); localStorage.setItem(key, JSON.stringify(next)); setSaved(next); setEditing(null); setContextMenu(null); setContextGroup(null); setFont(null); setColor(null); clearSelection(); setError('') }
    catch { setError(fa ? 'ذخیره تنظیمات ممکن نشد.' : 'Unable to save settings.') }
  }
  const exitWithoutSaving = () => { setEditing(null); setContextMenu(null); setContextGroup(null); setFont(null); setColor(null); colorPreviewBase.current = null; clearSelection(); setError('') }
  const resize = (event: PointerEvent<HTMLButtonElement>, edge: typeof resizeHandles[number]) => {
    const width = preferences.width ?? p.width, height = preferences.height ?? p.height ?? 760
    captureDesignerPointer(event, (dx, dy) => {
      const x = edge.includes('left') ? resizeDesignerEdge(width, dx, 'left', 320, 1920) : edge.includes('right') ? resizeDesignerEdge(width, dx, 'right', 320, 1920) : { size: width, positionDelta: 0 }
      const y = edge.includes('top') ? resizeDesignerEdge(height, dy, 'top', 600, 1200) : edge.includes('bottom') ? resizeDesignerEdge(height, dy, 'bottom', 600, 1200) : { size: height, positionDelta: 0 }
      setEditing(current => current ? { ...current, width: x.size, height: y.size, offsetX: (preferences.offsetX ?? 0) + x.positionDelta + (x.size - width) / 2, offsetY: (preferences.offsetY ?? 0) + y.positionDelta } : current)
    }, () => {})
  }
  const resizeSelectedRegion = (event: PointerEvent<HTMLButtonElement>) => {
    const metric = selectedRule?.resize
    if (!editing || !metric || !selectedNode) return
    event.preventDefault(); event.stopPropagation()
    if (metric === 'editorRatio') {
      if (!(p.permissions.tablePresentation || p.permissions.formSize)) return
      const shell = selectedNode.closest<HTMLElement>('.base-form-shell')
      const editor = shell?.querySelector<HTMLElement>('.base-form-editor')
      const grid = shell?.querySelector<HTMLElement>('.base-form-grid')
      if (!editor || !grid) return
      const splitHeight = editor.getBoundingClientRect().height + grid.getBoundingClientRect().height
      const start = editor.getBoundingClientRect().height
      captureDesignerPointer(event, (_dx, dy) => {
        const height = Math.max(220, Math.min(splitHeight - 220, start + dy))
        updateEditorRatio(height / Math.max(1, splitHeight - height))
      }, () => {})
      return
    }
    if (metric === 'formHeaderHeight') {
      if (!p.permissions.formSize) return
      const header = selectedNode.closest<HTMLElement>('.form-laboratory-banner') ?? selectedNode
      const start = preferences.formHeaderHeight ?? header.getBoundingClientRect().height
      captureDesignerPointer(event, (_dx, dy) => setEditing(current => current ? { ...current, formHeaderHeight: Math.max(48, Math.min(180, start + dy)) } : current), () => {})
      return
    }
    if (!p.permissions.tablePresentation || !targetGridId) return
    const observed = metric === 'headerHeight' ? selectedNode.closest('thead') : selectedNode
    const start = preferences.gridLayouts?.[targetGridId]?.[metric] ?? observed?.getBoundingClientRect().height ?? (metric === 'headerHeight' ? 42 : 120)
    const minimum = metric === 'headerHeight' ? 28 : 56
    const maximum = metric === 'headerHeight' ? 120 : 260
    captureDesignerPointer(event, (_dx, dy) => updateGridLayout(targetGridId, { [metric]: Math.max(minimum, Math.min(maximum, start + dy)) }), () => {})
  }
  const nudgeSelectedRegion = (direction: -1 | 1) => {
    const metric = selectedRule?.resize
    if (!editing || !selectedNode) return false
    if (metric === 'formHeaderHeight') {
      if (!p.permissions.formSize) return false
      const header = selectedNode.closest<HTMLElement>('.form-laboratory-banner') ?? selectedNode
      const current = preferences.formHeaderHeight ?? header.getBoundingClientRect().height
      const height = Math.max(48, Math.min(180, current + direction * 2))
      setEditing(value => value ? { ...value, formHeaderHeight: height } : value)
      return true
    }
    if (!targetGridId || !p.permissions.tablePresentation || (metric !== 'toolbarHeight' && metric !== 'headerHeight')) return false
    const observed = metric === 'headerHeight' ? selectedNode.closest<HTMLElement>('thead') ?? selectedNode : selectedNode
    const current = preferences.gridLayouts?.[targetGridId]?.[metric] ?? observed.getBoundingClientRect().height
    const minimum = metric === 'headerHeight' ? 28 : 56
    const maximum = metric === 'headerHeight' ? 120 : 260
    const height = Math.max(minimum, Math.min(maximum, current + direction * 2))
    if (metric === 'headerHeight') updateGridLayout(targetGridId, { headerHeight: height })
    else updateGridLayout(targetGridId, { toolbarHeight: height })
    return true
  }
  const handleFrameKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const activeElement = event.target instanceof Element ? event.target : null
    if (editing && activeElement?.closest('.operational-region-resize-handle') && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (nudgeSelectedRegion(event.key === 'ArrowUp' ? -1 : 1)) { event.preventDefault(); event.stopPropagation(); return }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !activeElement?.closest('input,textarea,select,[contenteditable="true"],.base-grid-table td[data-column]')) event.preventDefault()
    if (editing) {
      if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); if (font) setFont(null); else if (color) { const previous = colorPreviewBase.current; if (previous) changeStyle({ [previous.property]: previous.value }); colorPreviewBase.current = null; setColor(null) } else if (contextMenu) setContextMenu(null); else exitWithoutSaving() }
    }
  }
  const treeWeights=Object.entries(preferences.overrides??{}).flatMap(([id,style])=>{if(id.endsWith('::label'))return [];const fieldId=id.split('::')[0],field=Object.entries(p.fieldIds??{}).find(([,value])=>value===fieldId)?.[0]??fieldId;if(!/^[a-zA-Z0-9_.-]+$/.test(field))return [];return [` .operational-form-frame .laboratory-designer-field:has([data-field="${field}"]) .cascading-tree-node{${cssDeclarations({...style,backgroundColor:undefined,borderColor:undefined} as PersonalStyle)};${typeof style.bold==='boolean'?'--lab-tree-selected-weight:'+(style.bold?700:400):''}}`] }).join('\n')
  const styleSheet = personalStylesheet(preferences.regions ?? {}, contract)+'\n'+treeWeights
  const menuLabel = selectedRule?.label[fa ? 'fa' : 'en'] ?? (fa ? target?.endsWith('::label') ? 'برچسب فیلد' : 'فیلد فرم' : target?.endsWith('::label') ? 'Field label' : 'Form field')
  const menuTop = contextMenu ? Math.max(8, Math.min(contextMenu.top, window.innerHeight - 300)) : 8
  const menuLeft = contextMenu ? Math.max(8, Math.min(window.innerWidth - 228, contextMenu.left > 236 ? contextMenu.left - 228 : contextMenu.left + 220)) : 8
  const gridCustomization: OperationalGridCustomization = { settingsOpen: Boolean(editing), canResize: p.permissions.tablePresentation, canResizeSplit: p.permissions.tablePresentation || p.permissions.formSize, editorRatio: preferences.editorRatio, layouts: preferences.gridLayouts ?? {}, updateLayout: updateGridLayout, updateEditorRatio }

  return <div ref={frameRef} className="laboratory-form-frame operational-form-frame" data-preview-device="desktop" data-personal-edit={Boolean(editing)} onPointerDownCapture={select} onContextMenuCapture={openElementMenu} onKeyDownCapture={handleFrameKeyDown} style={{ width: preferences.width ?? p.width, height: preferences.height ?? p.height ?? 760, maxWidth: '100%', marginInline: 'auto', left: preferences.offsetX ?? 0, top: preferences.offsetY ?? 0 }}>
    {styleSheet && <style data-operational-personal-styles>{styleSheet}</style>}
    <FormDocumentHeader title={p.title} style={preferences.formHeaderHeight ? { height: preferences.formHeaderHeight, minHeight: preferences.formHeaderHeight } : undefined} actions={editing ? <div className="operational-settings-header-actions"><button type="button" onClick={saveSettings}>{fa ? 'ذخیره تنظیمات' : 'Save settings'}</button><button type="button" onClick={exitWithoutSaving}>{fa ? 'خروج بدون ذخیره' : 'Exit without saving'}</button></div> : <FormSettingsButton language={p.language} onClick={() => { setError(''); clearSelection(); setEditing({ ...saved }) }} />} />
    {editing && <div className="operational-settings-tools" role="toolbar" aria-label={fa ? 'تنظیمات مجاز فرم' : 'Available form settings'}><span>{fa ? 'بخش یا فیلد موردنظر را با موس انتخاب کنید.' : 'Select a section or field with the mouse.'}</span><button type="button" onClick={() => setEditing({})}>{fa ? 'بازنشانی به طرح اصلی' : 'Reset to designed settings'}</button>{error && <span role="alert">{error}</span>}</div>}
    <div className="operational-form-notice">{p.notice}</div><OperationalGridCustomizationContext.Provider value={gridCustomization}>{p.children(draft)}</OperationalGridCustomizationContext.Provider>
    {editing && p.permissions.formSize && resizeHandles.map(edge => <button key={edge} type="button" className={'designer-edge-handle designer-edge-' + edge} aria-label={'Resize form ' + edge} onPointerDown={event => resize(event, edge)} />)}
    {editing && selectedRule?.resize && selectedNode && ((['toolbarHeight','headerHeight'].includes(selectedRule.resize) && p.permissions.tablePresentation && targetGridId) || (selectedRule.resize === 'editorRatio' && (p.permissions.tablePresentation || p.permissions.formSize)) || (selectedRule.resize === 'formHeaderHeight' && p.permissions.formSize)) && (['editorRatio','formHeaderHeight'].includes(selectedRule.resize) ? (['left','right','bottom'] as const).map(edge => createPortal(<button key={edge} ref={edge === 'bottom' ? resizeHandleRef : undefined} type="button" className={'operational-region-resize-handle is-' + edge} data-resize-kind={selectedRule.resize} aria-label={fa ? 'تغییر اندازه ' + selectedRule.label.fa : 'Resize ' + selectedRule.label.en} aria-keyshortcuts={edge === 'bottom' ? 'ArrowUp ArrowDown' : undefined} title={fa ? 'برای کوچک یا بزرگ کردن بکشید' : 'Drag to resize'} onPointerDown={edge === 'bottom' ? resizeSelectedRegion : event => resize(event, edge)} />, selectedRule.resize === 'formHeaderHeight' ? selectedNode.closest('.form-laboratory-banner') ?? selectedNode : selectedRule.resize === 'editorRatio' ? selectedNode.closest('.base-form-editor') ?? selectedNode : selectedNode, edge)) : createPortal(<button ref={resizeHandleRef} type="button" className="operational-region-resize-handle is-bottom" data-resize-kind={selectedRule.resize} aria-keyshortcuts="ArrowUp ArrowDown" aria-label={fa ? 'تغییر ارتفاع ' + selectedRule.label.fa : 'Resize height of ' + selectedRule.label.en} title={fa ? 'برای تغییر ارتفاع بکشید؛ با کلیدهای بالا و پایین هم تنظیم می‌شود' : 'Drag to resize; Arrow Up and Down also adjust height'} onPointerDown={resizeSelectedRegion} />, selectedNode))}
    {contextMenu && createPortal(<div ref={contextMenuRef} className="designer-context-menu" role="menu" aria-label={fa ? 'ویژگی‌های بخش انتخاب‌شده' : 'Selected section properties'} dir={fa ? 'rtl' : 'ltr'} style={{ left: contextMenu.left, top: contextMenu.top }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      <strong>{menuLabel}</strong>
      {p.permissions.typography && regionId !== 'form-editor' && <button type="button" role="menuitem" aria-haspopup="menu" data-grid-submenu="text" aria-expanded={contextGroup === 'text'} onMouseEnter={() => setContextGroup('text')} onClick={() => setContextGroup('text')} onKeyDown={event => { if (event.key === (fa ? 'ArrowLeft' : 'ArrowRight')) { event.preventDefault(); setContextGroup('text') } }}>{fa ? 'متن و قلم' : 'Text and font'} <span className="designer-submenu-arrow" aria-hidden="true" /></button>}
      {p.permissions.colors && <button type="button" role="menuitem" aria-haspopup="menu" data-grid-submenu="appearance" aria-expanded={contextGroup === 'appearance'} onMouseEnter={() => setContextGroup('appearance')} onClick={() => setContextGroup('appearance')} onKeyDown={event => { if (event.key === (fa ? 'ArrowLeft' : 'ArrowRight')) { event.preventDefault(); setContextGroup('appearance') } }}>{fa ? 'ظاهر و حاشیه' : 'Appearance and border'} <span className="designer-submenu-arrow" aria-hidden="true" /></button>}
    </div>, document.body)}
    {contextMenu && contextGroup && createPortal(<div ref={contextSubmenuRef} className="designer-context-menu designer-context-submenu" data-context-group={contextGroup} role="menu" aria-label={contextGroup === 'text' ? fa ? 'متن و قلم' : 'Text and font' : fa ? 'ظاهر و حاشیه' : 'Appearance and border'} dir={fa ? 'rtl' : 'ltr'} style={{ left: menuLeft, top: menuTop }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
      {contextGroup === 'text' && <>{p.permissions.typography && <button type="button" role="menuitem" onClick={() => { setContextMenu(null); setContextGroup(null); openFont() }}>{fa ? 'تنظیم قلم…' : 'Font…'}</button>}{p.permissions.colors && <button type="button" role="menuitem" onClick={() => { setContextMenu(null); setContextGroup(null); openColor('textColor') }}>{fa ? 'رنگ متن…' : 'Text color…'}</button>}</>}
      {contextGroup === 'appearance' && <>{p.permissions.colors && <><button type="button" role="menuitem" onClick={() => { setContextMenu(null); setContextGroup(null); openColor('backgroundColor') }}>{fa ? 'رنگ پس‌زمینه…' : 'Background color…'}</button><button type="button" role="menuitem" onClick={() => { setContextMenu(null); setContextGroup(null); openColor('borderColor') }}>{fa ? 'رنگ کادر…' : 'Border color…'}</button></>}</>}
    </div>, document.body)}
    {font && <FormDocumentDialog language={p.language} title={(fa ? 'قلم' : 'Font')+' — '+menuLabel} panelClassName="designer-grid-format-dialog operational-font-dialog" onClose={()=>setFont(null)}><DesignerFontPanel allowColor={p.permissions.colors} value={font} language={p.language} onChange={patch => setFont({ ...font, ...patch })} onPreviewColor={setFontPreviewColor} onCommitColor={value => {setFontPreviewColor(null); if (value) setFont({ ...font, color: value }) }} /><footer><button type="button" onClick={() => setFont(null)}>{fa ? 'لغو' : 'Cancel'}</button><button type="button" className="primary designer-font-apply" onClick={() => { const { base, normalFont: _normalFont, color: fontColor, ...style } = font; changeStyle({ ...style, ...(p.permissions.colors ? { textColor: fontColor } : {}) }); setFont(null) }}>{fa ? 'تأیید' : 'Apply'}</button></footer></FormDocumentDialog>}
    {color && p.permissions.colors && <ExcelColorPicker language={p.language} label={fa ? color === 'textColor' ? 'رنگ متن' : color === 'borderColor' ? 'رنگ کادر' : 'رنگ زمینه' : color} value={String(values[color] ?? (color === 'backgroundColor' ? '#f4f6f5' : color === 'borderColor' ? '#dfe7e3' : '#263a38'))} autoOpen onPreview={value => { const original = colorPreviewBase.current; if (!original || original.target !== target || original.property !== color) return; if (value === null) changeStyle({ [color]: original.value }); else changeStyle({ [color]: value }) }} onCommit={value => { colorPreviewBase.current = null; changeStyle({ [color]: value }); setColor(null) }} onCancel={() => { colorPreviewBase.current = null; setColor(null) }} />}
  </div>
}
