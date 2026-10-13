import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { contextDesignerSelection, designerAppearancePresets, designerElementAppearanceValues } from './designer.ts'
import { alignCanvasFields, anchorDesignerInputs, captureDesignerPointer, createDesignerHistory, designerAppearanceStyle, designerHistoryReducer, designerStorageKey, designerStyleForField, designerStyleForPart, emptyDesignerDraft, existingCanvasCollisions, layoutDesignerFields, loadDesignerDraft, moveDesignerFieldGroup, resizeCanvasInputs, resizeDesignerEdge, resizeDesignerInputs, resizeDesignerWidth, resetDesignerFields, saveDesignerDraft, selectDesignerPart, selectedDesignerInputs, setDesignerAppearanceProperty, setDesignerProperty, stopDesignerHandleClick, validateDesignerDraft } from './designer.ts'

const formId = 'form-laboratory.persons-synthetic'
const ids = ['personCode', 'firstName', 'lastName', 'address']
const layoutFields = [
  { id: 'personCode', left: 300, top: 10, right: 400, bottom: 65, width: 100, height: 55, inputWidth: 100, inputHeight: 30, labelWidth: 75, labelHeight: 18 },
  { id: 'firstName', left: 170, top: 80, right: 310, bottom: 150, width: 140, height: 70, inputWidth: 140, inputHeight: 36, labelWidth: 90, labelHeight: 20 },
  { id: 'lastName', left: 20, top: 160, right: 160, bottom: 230, width: 140, height: 70, inputWidth: 140, inputHeight: 40, labelWidth: 95, labelHeight: 22 }
]
const page = readFileSync(new URL('../../FormLaboratoryPage.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./FormLaboratoryDesignerPanel.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
const picker = readFileSync(new URL('./ExcelColorPicker.tsx', import.meta.url), 'utf8')
// Exercise the actual pure functions in the TSX file without a React/DOM test harness.
const pickerMath = runInNewContext(stripTypeScriptTypes(picker.slice(picker.indexOf('const themeColors'), picker.indexOf('export function ExcelColorPicker'))).replace('export function colorPickerNavigation', 'function colorPickerNavigation') + '\n({ hexToHsv, hsvToHex, colorProposal, hsvProposal, honeycombColors, colorPickerNavigation })')
import { designerActionDimensionLimits, designerActionStyle, designerActionVisible, designerColorScope, designerEffectiveValues, designerShortcutAction, setDesignerActionProperty, setDesignerActionVisibility, setDesignerColorProperty } from './designer.ts'

const laboratoryActions = runInNewContext(stripTypeScriptTypes(page.slice(page.indexOf('const laboratoryDefinition'), page.indexOf('const columns'))) + '\nlaboratoryDefinition.actions')

test('picker has one navigation state: each Back moves one stage and More always starts Standard', () => {
  const navigate = pickerMath.colorPickerNavigation
  assert.equal(navigate('closed', 'open'), 'quick')
  assert.equal(navigate('quick', 'more'), 'standard')
  assert.equal(navigate('standard', 'custom'), 'custom')
  assert.equal(navigate('custom', 'back'), 'standard')
  assert.equal(navigate('standard', 'back'), 'quick')
  assert.equal(navigate('quick', 'more'), 'standard')
  assert.equal(navigate('custom', 'standard'), 'standard')
  for (const stage of ['quick', 'standard', 'custom']) assert.equal(navigate(stage, 'close'), 'closed')
  assert.doesNotMatch(picker, /setDialogOpen|setTab|setOpen/)
  assert.match(picker, /navigate\('back'\)/)
  assert.doesNotMatch(picker, /setProposed\(colorProposal\(original\)\);.*navigate\('back'\)/)
})

test('all appearance presets share rendering while preserving colors, typography, size and defaults', () => {
  let draft = { ...emptyDesignerDraft(formId), defaults: { input: { backgroundColor: '#d6e6f5' } } }
  draft = setDesignerActionProperty(draft, ['a'], 'backgroundColor', '#4472c4')
  draft = setDesignerActionProperty(draft, ['a'], 'fontSize', 20)
  draft = setDesignerActionProperty(draft, ['a'], 'width', 195)
  draft = setDesignerActionProperty(draft, ['a'], 'appearancePreset', 'raised')
  draft = setDesignerActionProperty(draft, ['b'], 'backgroundColor', '#ff0000')
  draft = setDesignerActionProperty(draft, ['b'], 'appearancePreset', 'flat')
  assert.match(designerActionStyle(draft, 'a')['--lab-shadow'], /inset.*rgb\(0 0 0 \/ 24%\)/)
  assert.equal(designerActionStyle(draft, 'b')['--lab-shadow'], 'none')
  draft = setDesignerProperty(draft, ['firstName::input'], 'appearancePreset', 'inset', ids)
  assert.match(designerStyleForPart(draft, 'firstName', 'input')['--lab-shadow'], /^inset /)
  assert.equal(designerStyleForPart(draft, 'firstName', 'label')['--lab-shadow'], undefined)
  for (const preset of Object.keys(designerAppearancePresets)) {
    const next = setDesignerProperty(draft, ['firstName::input'], 'appearancePreset', preset, ids)
    const style = designerStyleForPart(next, 'firstName', 'input')
    assert.equal(style['--lab-bg'], '#d6e6f5')
    assert.ok(style['--lab-shadow'])
    assert.deepEqual(next.actions, draft.actions)
    assert.deepEqual(next.defaults, draft.defaults)
  }
  draft = setDesignerActionProperty(draft, ['a'], 'shadowBlur', 20)
  draft = setDesignerActionProperty(draft, ['a'], 'appearancePreset', 'pill')
  assert.equal(draft.actions.a.shadowBlur, undefined)
  assert.equal(designerActionStyle(draft, 'a')['--lab-radius'], '100px')
  assert.equal(draft.actions.a.backgroundColor, '#4472c4')
  assert.equal(draft.actions.a.fontSize, 20)
  assert.equal(draft.actions.a.width, 195)
  assert.equal(designerElementAppearanceValues(draft.actions.a).borderRadius, 100)
  assert.deepEqual(designerStyleForPart(emptyDesignerDraft(formId), 'firstName', 'input'), {})
})

test('appearance batches undo atomically and persist all validated effect properties', () => {
  let history = createDesignerHistory(emptyDesignerDraft(formId))
  const targets = ['firstName::input', 'lastName::input']
  history = designerHistoryReducer(history, { type: 'beginTransaction' })
  history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, targets, 'appearancePreset', 'gradient', ids) })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  const batch = history.present
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, batch)
  let draft = history.present
  const settings = { gradientStartColor: '#123456', gradientEndColor: '#abcdef', gradientAngle: 270, gradientEnabled: true, borderWidth: 3, borderStyle: 'dashed', borderRadius: 12, shadowOpacity: 40, shadowOffsetX: -4, shadowOffsetY: 5, shadowBlur: 8, shadowSpread: -2, shadowInset: true, paddingX: 10, paddingY: 6 }
  for (const [key, value] of Object.entries(settings)) {
    draft = setDesignerProperty(draft, targets, key, value, ids)
    draft = setDesignerActionProperty(draft, ['a', 'b'], key, value)
  }
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveDesignerDraft(storage, 'effects-user', formId, draft, ids), true)
  const restored = loadDesignerDraft(storage, 'effects-user', formId, ids)
  assert.deepEqual(restored, draft)
  assert.match(designerStyleForPart(restored, 'firstName', 'input')['--lab-gradient'], /^linear-gradient\(270deg, #123456, #abcdef\)$/)
  assert.match(designerActionStyle(restored, 'a')['--lab-shadow'], /^inset -4px 5px 8px -2px/)
  assert.equal(restored.canvas, undefined)
})

test('appearance rejects unsafe values and context menu opens the same eligible panel controls', () => {
  const draft = emptyDesignerDraft(formId)
  for (const [key, value] of Object.entries({ appearancePreset: '__proto__', borderStyle: 'url(x)', borderWidth: 13, shadowOpacity: 101, shadowOffsetX: -41, shadowBlur: -1, shadowSpread: 41, gradientAngle: 361, gradientStartColor: 'url(x)', gradientEndColor: '#123', paddingX: 41, gradientEnabled: 'yes', shadowInset: 1 })) {
    assert.equal(setDesignerProperty(draft, ['firstName::input'], key, value, ids), draft)
    assert.equal(setDesignerActionProperty(draft, ['a'], key, value), draft)
  }
  assert.match(page, /onElementAppearanceCommit=\{commitElementAppearance\}/)
  assert.match(page, /requestProperty\('appearance'\)/)
  assert.match(page, /requestProperty\('shadow'\)/)
  assert.match(page, /requestProperty\('gradient'\)/)
  assert.match(panel, /supportsAppearance && <details/)
  assert.match(panel, /onBlur=\{props.onFinishPropertyChange\}/)
})

test('context targeting preserves included parts, groups and stable action IDs without mutating selection', () => {
  const fields = ['firstName::input', 'lastName::field']
  assert.deepEqual(contextDesignerSelection(fields, 'firstName::input'), fields)
  assert.deepEqual(contextDesignerSelection(fields, 'lastName::label'), fields)
  assert.deepEqual(contextDesignerSelection(fields, 'address::input'), ['address::input'])
  assert.deepEqual(contextDesignerSelection(['firstName::input'], 'firstName::label'), ['firstName::label'])
  const actions = ['new-person', 'edit-person']
  assert.deepEqual(contextDesignerSelection(actions, 'edit-person'), actions)
  assert.deepEqual(contextDesignerSelection(actions, 'delete-person'), ['delete-person'])
  assert.notEqual(contextDesignerSelection(actions, 'edit-person'), actions)
  assert.deepEqual(fields, ['firstName::input', 'lastName::field'])
})

test('context actions use existing panel controls and exclude incompatible color or sizing targets', () => {
  assert.match(page, /onContextMenu=\{openContextMenu\}/)
  assert.match(page, /createPortal\(<div ref=\{contextMenuRef\}/)
  assert.match(page, /if \(!action && !field\) \{ setContextMenu\(null\); return \}/)
  assert.match(page, /selection.every\(key => !key.endsWith\('::label'\)\)/)
  assert.match(page, /contextMenu.part !== 'label'/)
  assert.match(page, /contextMenu.part === 'label' \? 'labelColor' : 'textColor'/)
  assert.match(panel, /control.querySelector<HTMLButtonElement>\('\.excel-color-trigger'\)\?\.click\(\)/)
  assert.match(panel, /editingAction && id === 'actions' \? keys.filter\(key => key === 'actionBarBackground'\)/)
  assert.match(page, /document.addEventListener\('keydown', escape, true\)/)
})

test('bottom bar represents reference actions once and retains required save metadata', () => {
  assert.deepEqual(Array.from(laboratoryActions, action => action.code), ['Space', 'Insert', 'Delete', 'Home', 'PgUp', '↑ ↓', 'PgDn', 'End', '⚙', 'F3', 'Esc'])
  assert.equal(new Set(laboratoryActions.map(action => action.id)).size, laboratoryActions.length)
  assert.deepEqual(Array.from(laboratoryActions.filter(action => action.required), action => action.id), ['new-person', 'edit-person', 'demo-save'])
  assert.match(page, /if \(designerOpen \|\| !action \|\| action.disabled \|\| !designerActionVisible/)
  assert.match(panel, /disabled=\{action.required\}/)
})

test('optional action visibility preserves styles through undo, redo, restore and draft reload', () => {
  const optional = { id: 'optional-action' }, required = { id: 'arbitrary-required-action', required: true }
  let draft = setDesignerActionProperty(emptyDesignerDraft(formId), [optional.id], 'backgroundColor', '#112233')
  draft = setDesignerActionProperty(draft, [optional.id], 'width', 183)
  draft = setDesignerActionProperty(draft, [optional.id], 'fontWeight', 600)
  assert.equal(designerActionVisible(draft, optional), true)
  assert.equal(setDesignerActionVisibility(draft, required, false), draft)
  assert.equal(designerActionVisible({ ...draft, actions: { [required.id]: { visible: false } } }, required), true)
  const hidden = setDesignerActionVisibility(draft, optional, false)
  assert.equal(designerActionVisible(hidden, optional), false)
  assert.equal(hidden.actions[optional.id].backgroundColor, '#112233')
  let history = designerHistoryReducer(createDesignerHistory(draft), { type: 'change', draft: hidden })
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, draft)
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, hidden)
  const storageValues = new Map(), storage = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => storageValues.set(key, value) }
  saveDesignerDraft(storage, 'actions-user', formId, hidden, ids)
  const loaded = loadDesignerDraft(storage, 'actions-user', formId, ids)
  assert.deepEqual(loaded, hidden)
  const restored = setDesignerActionVisibility(loaded, optional, true)
  assert.equal(designerActionVisible(restored, optional), true)
  assert.equal(restored.actions[optional.id].width, 183)
  assert.equal(restored.actions[optional.id].fontWeight, 600)
  assert.equal(restored.actions[optional.id].backgroundColor, '#112233')
  assert.equal(setDesignerActionVisibility(draft, { id: '../invalid' }, false), draft)
  assert.equal(validateDesignerDraft({ ...draft, actions: { invalid: { visible: 'false' } } }, formId, ids).actions, undefined)
})

test('shortcuts resolve only visible enabled actions and leave unavailable business actions disabled', () => {
  const draft = emptyDesignerDraft(formId)
  assert.equal(designerShortcutAction(draft, laboratoryActions, 'F3').id, 'demo-save')
  assert.equal(designerShortcutAction(draft, laboratoryActions, 'Escape').id, 'reset-sample')
  assert.equal(designerShortcutAction(setDesignerActionVisibility(draft, { id: 'reset-sample' }, false), laboratoryActions, 'Escape'), undefined)
  for (const key of [' ', 'Insert', 'Delete', 'Home', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'End']) assert.equal(designerShortcutAction(draft, laboratoryActions, key), undefined)
  assert.match(page, /target.matches\('input, select, textarea, \[contenteditable="true"\]'\)/)
  assert.match(page, /const shortcutKey = laboratoryDefinition.actions\?\.some/)
  assert.match(page, /event.stopPropagation\(\)[\s\S]*target.matches\('input, select, textarea/)
  assert.match(page, /if \(action\) runAction\(action.id\)/)
  assert.match(page, /target.closest\('\[role="dialog"\], \.excel-color-picker.is-open'\)/)
  assert.doesNotMatch(page, /window.addEventListener\('keydown'/)
})

test('action numeric and pointer dimensions share limits without touching other action styles', () => {
  let draft = setDesignerActionProperty(emptyDesignerDraft(formId), ['a'], 'width', 150)
  draft = setDesignerActionProperty(draft, ['b'], 'width', 195)
  draft = setDesignerActionProperty(draft, ['b'], 'height', 60)
  draft = setDesignerActionProperty(draft, ['b'], 'backgroundColor', '#4472c4')
  const other = draft.actions.b
  for (const property of ['width', 'height']) {
    const { min, max } = designerActionDimensionLimits[property]
    assert.equal(setDesignerActionProperty(draft, ['a'], property, min - 1), draft)
    assert.equal(setDesignerActionProperty(draft, ['a'], property, max + 1), draft)
    draft = setDesignerActionProperty(draft, ['a'], property, min)
    assert.equal(draft.actions.a[property], min)
    draft = setDesignerActionProperty(draft, ['a'], property, max)
    assert.equal(draft.actions.a[property], max)
  }
  assert.deepEqual(draft.actions.b, other)
  assert.match(page, /designerActionDimensionLimits\[horizontal \? 'width' : 'height'\]/)
  assert.match(panel, /designerActionDimensionLimits\[key\]/)
})

test('color scopes resolve compatible selections independently for inputs and labels', () => {
  assert.deepEqual(designerColorScope([], 'backgroundColor', ids), { part: 'input', targets: [], global: true })
  assert.equal(designerColorScope(['firstName::label'], 'borderColor', ids).global, true)
  assert.equal(designerColorScope(['firstName::input'], 'labelColor', ids).global, true)
  assert.deepEqual(designerColorScope(['firstName::input', 'lastName::field', 'address::label'], 'textColor', ids).targets, ['firstName::input', 'lastName::input'])
})

test('shared picker resets repeated confirmations and removes the compact palette behind More Colors', () => {
  assert.match(picker, /activePickerToken = pickerToken.current\s+pointerAction.current = false/)
  assert.match(picker, /const popover = open && !dialogOpen/)
  assert.match(picker, /commitTarget.current = onCommit/)
  assert.match(picker, /if \(draft !== original\) commitTarget.current\(draft\)/)
  assert.match(picker, /event.key === 'Escape'/)
  assert.match(page, /const resized = resizeDesignerEdge\(/)
})

test('Standard honeycomb has 217 distinct hexagonal colors across all hue families', () => {
  const tiles = pickerMath.honeycombColors
  assert.equal(tiles.length, 217)
  assert.equal(new Set(tiles.map(tile => tile.color)).size, 217)
  assert.equal(new Set(tiles.filter(tile => pickerMath.hexToHsv(tile.color)[1] > 0.1).map(tile => Math.floor(pickerMath.hexToHsv(tile.color)[0] / 45))).size, 8)
  assert.ok(tiles.every(tile => tile.x > 0 && tile.x < 300 && tile.y > 0 && tile.y < 264))
  assert.ok(tiles.filter(tile => Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(tile.q + tile.r)) === 8).every(tile => pickerMath.hexToHsv(tile.color)[2] < 0.56))
  assert.match(picker, /role="button"[\s\S]*aria-pressed=\{draft\?\.toLowerCase\(\) === tile.color\}/)
  assert.match(picker, /<svg className="excel-grayscale"/)
})

test('HSV picker round-trips RGB, covers all primaries and retains achromatic pointer positions', () => {
  const primaries = [[0, 1, 1, '#ff0000'], [120, 1, 1, '#00ff00'], [240, 1, 1, '#0000ff'], [60, 1, 1, '#ffff00'], [180, 1, 1, '#00ffff'], [300, 1, 1, '#ff00ff'], [0, 0, 1, '#ffffff'], [0, 1, 0, '#000000']]
  for (const [h, s, v, hex] of primaries) assert.equal(pickerMath.hsvToHex(h, s, v), hex)
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')
    assert.equal(pickerMath.hsvToHex(...pickerMath.hexToHsv(hex)), hex)
  }
  assert.deepEqual([...pickerMath.colorProposal('#000000', [240, 0.75, 1]).hsv], [240, 0.75, 0])
  assert.deepEqual([...pickerMath.colorProposal('#ffffff', [240, 0.75, 1]).hsv], [240, 0, 1])
  assert.equal(pickerMath.hsvProposal([180, 1, 1]).hexInput, '#00FFFF')
  assert.match(picker, /setPointerCapture\(event.pointerId\)/)
  assert.match(picker, /hasPointerCapture\(event.pointerId\)/)
  assert.match(picker, /aria-orientation="vertical"/)
  assert.match(picker, /const hue = Math.round\(clamp\(\(event.clientX - rect.left\) \/ rect.width, 0, 1\) \* 360\)/)
  assert.doesNotMatch(picker, /spectrumLightness|hexToHsl|hslToHex/)
})

test('global color defaults stay sparse and preserve selected overrides and legacy drafts', () => {
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['firstName::input'], 'backgroundColor', '#112233', ids)
  draft = setDesignerColorProperty(draft, [], 'backgroundColor', '#aabbcc', ids)
  draft = setDesignerColorProperty(draft, [], 'labelColor', '#ccbbdd', ids)
  assert.deepEqual(draft.defaults, { input: { backgroundColor: '#aabbcc' }, label: { textColor: '#ccbbdd' } })
  assert.deepEqual(Object.keys(draft.overrides), ['firstName::input'])
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-bg'], '#112233')
  assert.equal(designerStyleForPart(draft, 'lastName', 'input')['--lab-bg'], '#aabbcc')
  assert.equal(designerStyleForPart(draft, 'lastName', 'label')['--lab-text'], '#ccbbdd')
  draft = setDesignerColorProperty(draft, ['firstName::input'], 'backgroundColor', undefined, ids)
  assert.equal(designerEffectiveValues(draft, 'firstName', 'input').backgroundColor, '#aabbcc')
  draft = setDesignerProperty(draft, ['address'], 'textColor', '#abcdef', ids)
  draft = setDesignerColorProperty(draft, ['address::input'], 'textColor', undefined, ids)
  assert.equal(designerEffectiveValues(draft, 'address', 'label').textColor, '#abcdef')
  assert.equal(designerEffectiveValues(draft, 'address', 'input').textColor, undefined)
  assert.deepEqual(validateDesignerDraft(draft, formId, ids), draft)
})

test('selected color batches are atomic and persist separately from global defaults', () => {
  let history = createDesignerHistory(setDesignerColorProperty(emptyDesignerDraft(formId), [], 'textColor', '#aabbcc', ids))
  history = designerHistoryReducer(history, { type: 'change', draft: setDesignerColorProperty(history.present, ['firstName::input', 'lastName::input'], 'textColor', '#112233', ids) })
  assert.equal(history.past.length, 1)
  assert.equal(designerEffectiveValues(history.present, 'address', 'input').textColor, '#aabbcc')
  const changed = history.present
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.equal(designerEffectiveValues(history.present, 'firstName', 'input').textColor, '#aabbcc')
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, changed)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveDesignerDraft(storage, 'scope-user', formId, changed, ids)
  assert.deepEqual(loadDesignerDraft(storage, 'scope-user', formId, ids), changed)
})

test('action identities keep color, dimensions and typography independent through history and reload', () => {
  let draft = setDesignerActionProperty(emptyDesignerDraft(formId), ['first-action'], 'backgroundColor', '#112233')
  draft = setDesignerActionProperty(draft, ['future-action'], 'backgroundColor', '#aabbcc')
  draft = setDesignerActionProperty(draft, ['first-action'], 'width', 180)
  draft = setDesignerActionProperty(draft, ['first-action'], 'height', 60)
  draft = setDesignerActionProperty(draft, ['first-action'], 'fontSize', 20)
  draft = setDesignerActionProperty(draft, ['first-action'], 'hoverTextColor', '#ffffff')
  assert.equal(designerActionStyle(draft, 'first-action')['--lab-width'], '180px')
  assert.equal(designerActionStyle(draft, 'first-action')['--lab-action-hover-text'], '#ffffff')
  assert.equal(designerActionStyle(draft, 'future-action')['--lab-width'], undefined)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveDesignerDraft(storage, 'actions-user', formId, draft, ids)
  assert.deepEqual(loadDesignerDraft(storage, 'actions-user', formId, ids), draft)
  let history = designerHistoryReducer(createDesignerHistory(emptyDesignerDraft(formId)), { type: 'change', draft })
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.equal(history.present.actions, undefined)
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present.actions, draft.actions)
  assert.equal(setDesignerActionProperty(draft, ['first-action'], 'width', -1), draft)
})

const canvas = {
  width: 800, height: 400,
  fields: {
    firstName: { input: { left: 100, top: 100, width: 120, height: 32 }, label: { left: 100, top: 74, width: 80, height: 18 } },
    lastName: { input: { left: 260, top: 100, width: 120, height: 32 }, label: { left: 260, top: 74, width: 90, height: 18 } },
    phone: { input: { left: 100, top: 190, width: 120, height: 32 }, label: { left: 100, top: 164, width: 60, height: 18 } }
  }
}

test('fixed-edge resize clamps to visible obstacles without moving unrelated fields', () => {
  const before = JSON.parse(JSON.stringify(canvas))
  const grown = resizeCanvasInputs(canvas, ['firstName'], 'right', 200)
  assert.equal(grown.fields.firstName.input.left, 100)
  assert.equal(grown.fields.firstName.input.right ?? grown.fields.firstName.input.left + grown.fields.firstName.input.width, 252)
  assert.deepEqual(grown.fields.lastName, before.fields.lastName)
  assert.deepEqual(grown.fields.phone, before.fields.phone)
  const top = resizeCanvasInputs(canvas, ['firstName'], 'bottom', 140)
  assert.equal(top.fields.firstName.input.top, 100)
  assert.equal(top.fields.firstName.input.height, 56)
  assert.deepEqual(top.fields.phone, before.fields.phone)
})

test('alignment uses a fixed reference and is atomic when an obstacle blocks it', () => {
  const aligned = alignCanvasFields(canvas, ['firstName', 'phone'], 'firstName', 'left')
  assert.equal(aligned.blockedBy, undefined)
  assert.equal(aligned.canvas.fields.firstName.input.left, 100)
  assert.equal(aligned.canvas.fields.phone.input.left, 100)
  const blocked = alignCanvasFields(canvas, ['firstName', 'lastName'], 'firstName', 'right')
  assert.ok(blocked.blockedBy)
  assert.deepEqual(blocked.canvas, canvas)
  assert.deepEqual(existingCanvasCollisions(canvas), [])
})

test('captured canvas geometry survives draft validation and reload', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const draft = { ...emptyDesignerDraft(formId), canvas }
  const canvasIds = ['firstName', 'lastName', 'phone']
  assert.equal(saveDesignerDraft(storage, 'geometry-user', formId, draft, canvasIds), true)
  assert.deepEqual(loadDesignerDraft(storage, 'geometry-user', formId, ids).canvas, undefined)
  assert.deepEqual(loadDesignerDraft(storage, 'geometry-user', formId, canvasIds).canvas, canvas)
})

test('individual, group and all-field changes stay sparse per-field and per-property', () => {
  const empty = emptyDesignerDraft(formId)
  const individual = setDesignerProperty(empty, ['personCode'], 'fontSize', 18, ids)
  const group = setDesignerProperty(individual, ['firstName', 'lastName'], 'italic', true, ids)
  const all = setDesignerProperty(group, ids, 'focusColor', '#123456', ids)
  assert.equal(all.overrides.personCode.fontSize, 18)
  assert.equal(all.overrides.firstName.italic, true)
  assert.equal(all.overrides.lastName.italic, true)
  assert.equal(all.overrides.address.focusColor, '#123456')
  assert.deepEqual(empty.overrides, {})
  assert.deepEqual(resetDesignerFields(all, ['firstName', 'lastName']).overrides.firstName, undefined)
})

test('label and input can be selected, styled, reset and persisted independently', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerProperty(draft, ['firstName::label'], 'textColor', '#123456', ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'backgroundColor', '#abcdef', ids)
  assert.equal(draft.overrides.firstName, undefined)
  assert.equal(designerStyleForPart(draft, 'firstName', 'label')['--lab-text'], '#123456')
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-bg'], '#abcdef')
  assert.equal(designerStyleForPart(draft, 'lastName', 'input')['--lab-bg'], undefined)
  const restored = validateDesignerDraft(draft, formId, ids)
  assert.deepEqual(restored.overrides, draft.overrides)
  assert.deepEqual(resetDesignerFields(restored, ['firstName::label']).overrides['firstName::label'], undefined)
})

test('element dimensions and grid-relative position are validated, styled and preserved', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerProperty(draft, ['firstName::input'], 'width', 240, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'height', 42, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetX', 12, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetY', -6, ids)
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-width'], '240px')
  assert.equal(designerStyleForPart(draft, 'firstName', 'input')['--lab-height'], '42px')
  assert.equal(designerStyleForPart(draft, 'firstName', 'label')['--lab-offset'], 'translate(12px, -6px)')
  assert.deepEqual(validateDesignerDraft(draft, formId, ids).overrides, draft.overrides)
})

test('moving an input group preserves label spacing and leaves both element sizes unchanged', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetX', 8, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'offsetY', 3, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'offsetX', 8, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'offsetY', 35, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'width', 220, ids)
  draft = setDesignerProperty(draft, ['firstName::label'], 'fontSize', 17, ids)
  const moved = moveDesignerFieldGroup(draft, 'firstName', 24, 12, ids)
  assert.equal(moved.overrides['firstName::label'].offsetX, 32)
  assert.equal(moved.overrides['firstName::input'].offsetX, 32)
  assert.equal(moved.overrides['firstName::label'].offsetY, 15)
  assert.equal(moved.overrides['firstName::input'].offsetY, 47)
  assert.equal(moved.overrides['firstName::input'].width, 220)
  assert.equal(moved.overrides['firstName::label'].fontSize, 17)
})

test('mouse width resizing follows the visual handle edge and clamps dimensions', () => {
  assert.equal(resizeDesignerWidth(200, 20, 'left'), 180)
  assert.equal(resizeDesignerWidth(200, -20, 'left'), 220)
  assert.equal(resizeDesignerWidth(200, -20, 'right'), 180)
  assert.equal(resizeDesignerWidth(200, 20, 'right'), 220)
  assert.equal(resizeDesignerWidth(55, 20, 'left'), 48)
  assert.equal(resizeDesignerWidth(990, -20, 'left'), 1000)
})

test('four-edge resizing follows physical pointer movement and keeps the opposite edge fixed', () => {
  assert.deepEqual(resizeDesignerEdge(200, 20, 'left', 48, 1000), { size: 180, positionDelta: 20 })
  assert.deepEqual(resizeDesignerEdge(200, -20, 'left', 48, 1000), { size: 220, positionDelta: -20 })
  assert.deepEqual(resizeDesignerEdge(200, 20, 'right', 48, 1000), { size: 220, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(200, -20, 'right', 48, 1000), { size: 180, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(40, 10, 'top', 24, 600), { size: 30, positionDelta: 10 })
  assert.deepEqual(resizeDesignerEdge(40, -10, 'top', 24, 600), { size: 50, positionDelta: -10 })
  assert.deepEqual(resizeDesignerEdge(40, 10, 'bottom', 24, 600), { size: 50, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(40, -10, 'bottom', 24, 600), { size: 30, positionDelta: 0 })
  assert.deepEqual(resizeDesignerEdge(50, 20, 'left', 48, 1000), { size: 48, positionDelta: 2 })
  assert.deepEqual(resizeDesignerEdge(590, 20, 'bottom', 24, 600), { size: 600, positionDelta: 0 })
  assert.match(page, /designer-edge-\$\{edge\}/)
  assert.match(page, /resizeCanvasInputs\(initialCanvas, targets/)
})

test('direct input selection replaces a parent selection, supports Ctrl selection and never selects a label', () => {
  const single = selectDesignerPart(['firstName::field'], 'firstName', 'input', false)
  assert.deepEqual(single, ['firstName::input'])
  const multiple = selectDesignerPart(single, 'lastName', 'input', true)
  assert.deepEqual(multiple, ['firstName::input', 'lastName::input'])
  assert.deepEqual(selectDesignerPart(multiple, 'lastName', 'input', true), single)
  assert.deepEqual(selectedDesignerInputs([...multiple, 'address::label', 'firstName::field'], ids), ['firstName', 'lastName'])
})

class PointerHandle extends EventTarget {
  captured = new Set()
  releases = 0
  setPointerCapture(id) { this.captured.add(id) }
  hasPointerCapture(id) { return this.captured.has(id) }
  releasePointerCapture(id) { this.captured.delete(id); this.releases++; this.send('lostpointercapture', id) }
  send(type, pointerId = 7, clientX = 100, clientY = 50) {
    this.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY }))
  }
}

function pointerStart(handle) {
  return { currentTarget: handle, button: 0, pointerId: 7, clientX: 100, clientY: 50, prevented: false, stopped: false,
    preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
}

test('resize handle owns capture, ignores other pointers, releases once and blocks parent click selection', () => {
  const handle = new PointerHandle(), start = pointerStart(handle), deltas = []
  let ended = 0
  const cleanup = captureDesignerPointer(start, (dx, dy) => deltas.push([dx, dy]), () => ended++)
  assert.equal(start.prevented, true)
  assert.equal(start.stopped, true)
  assert.equal(handle.hasPointerCapture(7), true)
  handle.send('pointermove', 8, 500, 500)
  handle.send('pointerup', 8)
  handle.send('pointermove', 7, 115, 42)
  assert.deepEqual(deltas, [[15, -8]])
  handle.send('pointerup')
  cleanup()
  handle.send('pointermove', 7, 130, 60)
  assert.equal(ended, 1)
  assert.equal(handle.releases, 1)
  assert.equal(handle.hasPointerCapture(7), false)
  assert.deepEqual(deltas, [[15, -8]])
  const click = pointerStart(handle)
  let selection = ['firstName::input', 'lastName::input']
  stopDesignerHandleClick(click)
  if (!click.stopped) selection = selectDesignerPart(selection, 'firstName', 'input', false)
  assert.equal(click.prevented, true)
  assert.deepEqual(selection, ['firstName::input', 'lastName::input'])
})

test('pointer cancellation, lost capture and component cleanup each finish a gesture once', () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'cleanup']) {
    const handle = new PointerHandle()
    let ended = 0
    const cleanup = captureDesignerPointer(pointerStart(handle), () => {}, () => ended++)
    if (reason === 'cleanup') cleanup()
    else handle.send(reason)
    cleanup()
    assert.equal(ended, 1)
    assert.equal(handle.hasPointerCapture(7), false)
  }
})

test('all four edges resize rendered inputs only, retain labels and anchor the opposite edge after RTL reflow', () => {
  let initial = emptyDesignerDraft(formId)
  initial = setDesignerProperty(initial, ['firstName::label'], 'width', 260, ids)
  initial = setDesignerProperty(initial, ['firstName::label'], 'fontSize', 17, ids)
  // A stale/inherited width must not replace the actual rendered input measurement.
  initial = setDesignerProperty(initial, ['firstName'], 'width', 400, ids)
  const input = { id: 'firstName', left: 100, top: 50, width: 200, height: 40, labelLeft: 100, labelTop: 20 }
  for (const [edge, inward, dimension, expected, anchoredLeft, anchoredTop] of [
    ['left', 20, 'width', 180, 120, 50], ['right', -20, 'width', 180, 100, 50],
    ['top', 10, 'height', 30, 100, 60], ['bottom', -10, 'height', 30, 100, 50]
  ]) {
    const result = resizeDesignerInputs(initial, [input], edge, inward, ids)
    assert.equal(result.draft.overrides['firstName::input'][dimension], expected)
    assert.deepEqual(result.draft.overrides['firstName::label'], initial.overrides['firstName::label'])
    assert.deepEqual(result.anchors[0], { id: 'firstName', left: anchoredLeft, top: anchoredTop, labelLeft: 100, labelTop: 20 })
    const corrected = anchorDesignerInputs(result.draft, result.anchors, [{ ...input, left: 120, top: 60, labelTop: 30 }], ids)
    assert.equal(120 + Number(corrected.overrides['firstName::input'].offsetX ?? 0), anchoredLeft)
    assert.equal(60 + Number(corrected.overrides['firstName::input'].offsetY ?? 0), anchoredTop)
    assert.equal(corrected.overrides['firstName::label'].width, 260)
    assert.equal(corrected.overrides['firstName::label'].fontSize, 17)
    assert.equal(30 + Number(corrected.overrides['firstName::label'].offsetY ?? 0), 20)
    const outward = resizeDesignerInputs(initial, [input], edge, -inward, ids)
    assert.equal(outward.draft.overrides['firstName::input'][dimension], dimension === 'width' ? 220 : 50)
  }
  const resizeHandler = page.slice(page.indexOf('const beginInputResize'), page.indexOf('const beginFieldMove'))
  assert.doesNotMatch(resizeHandler, /moveDesignerFieldGroup/)
  assert.match(page, /designer-input-part > :is\(input,select,textarea\)/)
  assert.doesNotMatch(page, /className=\{selected \? 'designer-part-selected'/)
})

test('multi-input pointer resize remains one undo/redo operation and never changes label dimensions', () => {
  const inputs = ['firstName', 'lastName'].map((id, index) => ({ id, left: index * 240, top: 50, width: 200 + index * 30, height: 40, labelLeft: index * 240, labelTop: 20 }))
  let initial = setDesignerProperty(emptyDesignerDraft(formId), ['firstName::label', 'lastName::label'], 'fontSize', 18, ids)
  initial = setDesignerProperty(initial, ['firstName::label', 'lastName::label'], 'height', 25, ids)
  let history = designerHistoryReducer(createDesignerHistory(initial), { type: 'beginTransaction' })
  const handle = new PointerHandle()
  captureDesignerPointer(pointerStart(handle), dx => {
    const result = resizeDesignerInputs(initial, inputs, 'right', dx, ids)
    history = designerHistoryReducer(history, { type: 'change', draft: result.draft })
  }, () => { history = designerHistoryReducer(history, { type: 'commitTransaction' }) })
  handle.send('pointermove', 7, 110, 50)
  handle.send('pointermove', 7, 125, 50)
  handle.send('pointerup')
  const resized = history.present
  assert.equal(resized.overrides['firstName::input'].width, 225)
  assert.equal(resized.overrides['lastName::input'].width, 255)
  assert.deepEqual(resized.overrides['firstName::label'], initial.overrides['firstName::label'])
  assert.deepEqual(resized.overrides['lastName::label'], initial.overrides['lastName::label'])
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, initial)
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, resized)
})

test('moving inputs retains inherited offsets and preserves both elements sizes', () => {
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['firstName'], 'offsetX', 30, ids)
  draft = setDesignerProperty(draft, ['firstName'], 'offsetY', 20, ids)
  draft = setDesignerProperty(draft, ['firstName::input'], 'width', 150, ids)
  const moved = moveDesignerFieldGroup(draft, 'firstName', 12, -5, ids)
  assert.equal(moved.overrides['firstName::input'].offsetX, 42)
  assert.equal(moved.overrides['firstName::label'].offsetX, 42)
  assert.equal(moved.overrides['firstName::input'].offsetY, 15)
  assert.equal(moved.overrides['firstName::label'].offsetY, 15)
  assert.equal(moved.overrides['firstName::input'].width, 150)
  assert.equal(moved.overrides['firstName::label'].width, undefined)
})

test('horizontal layout arranges RTL field groups with matched inputs, chosen gaps and independent labels', () => {
  const start = emptyDesignerDraft(formId)
  const arranged = layoutDesignerFields(start, layoutFields, { operation: 'arrange', orientation: 'horizontal', gap: 18, rtl: true }, ids)
  const groups = layoutFields.map(field => {
    const dx = Number(arranged.overrides[`${field.id}::input`]?.offsetX ?? 0)
    const width = Math.max(field.labelWidth, field.width + 100 - field.inputWidth)
    return { field, left: field.left + dx, right: field.left + dx + width }
  }).sort((a, b) => b.right - a.right)
  assert.equal(arranged.overrides['personCode::input'].width, 100)
  assert.equal(arranged.overrides['personCode::input'].height, 30)
  assert.equal(arranged.overrides['firstName::input'].width, 100)
  assert.equal(arranged.overrides['lastName::input'].height, 30)
  assert.equal(arranged.overrides['firstName::label'].width, undefined)
  assert.equal(arranged.overrides['firstName::label'].height, undefined)
  assert.equal(arranged.overrides['firstName::label'].offsetX, arranged.overrides['firstName::input'].offsetX)
  assert.equal(arranged.overrides['firstName::label'].offsetY, arranged.overrides['firstName::input'].offsetY)
  assert.ok(Math.abs((groups[0].left - groups[1].right) - 18) < 1)
  assert.ok(Math.abs((groups[1].left - groups[2].right) - 18) < 1)
  assert.ok(groups[0].field.labelWidth !== groups[1].field.labelWidth)
})

test('vertical layout aligns field groups and distributes exact non-overlapping gaps', () => {
  const start = emptyDesignerDraft(formId)
  const arranged = layoutDesignerFields(start, layoutFields, { operation: 'arrange', orientation: 'vertical', gap: 21, rtl: true }, ids)
  const groups = layoutFields.map(field => ({ field, top: field.top + Number(arranged.overrides[`${field.id}::input`]?.offsetY ?? 0), left: field.left + Number(arranged.overrides[`${field.id}::input`]?.offsetX ?? 0) })).sort((a, b) => a.top - b.top)
  assert.equal(arranged.overrides['personCode::input'].width, 100)
  assert.equal(arranged.overrides['lastName::input'].height, 30)
  assert.equal(arranged.overrides['lastName::label'].width, undefined)
  assert.equal(arranged.overrides['lastName::label'].height, undefined)
  assert.equal(arranged.overrides['lastName::label'].offsetX, arranged.overrides['lastName::input'].offsetX)
  assert.equal(arranged.overrides['lastName::label'].offsetY, arranged.overrides['lastName::input'].offsetY)
  assert.ok(groups.every(group => group.left === groups[0].left))
  const groupHeights = layoutFields.map(field => Math.max(field.labelHeight, field.height + 30 - field.inputHeight))
  assert.ok(Math.abs((groups[1].top - groups[0].top) - (groupHeights[0] + 21)) < 1)
  assert.ok(Math.abs((groups[2].top - groups[1].top) - (groupHeights[1] + 21)) < 1)
})

test('large RTL rows retain non-overlapping gaps beyond the normal drag offset range', () => {
  const manyIds = Array.from({ length: 12 }, (_, index) => `field${index}`)
  const manyFields = manyIds.map((id, index) => ({ id, left: 0, top: index * 64, right: 100, bottom: index * 64 + 50, width: 100, height: 50, inputWidth: 100, inputHeight: 30, labelWidth: 80, labelHeight: 18 }))
  const arranged = layoutDesignerFields(emptyDesignerDraft(formId), manyFields, { operation: 'arrange', orientation: 'horizontal', gap: 20, rtl: true }, manyIds)
  const groups = manyFields.map(field => {
    const dx = Number(arranged.overrides[`${field.id}::input`]?.offsetX ?? 0)
    return { left: field.left + dx, right: field.left + dx + 100 }
  }).sort((a, b) => b.right - a.right)
  assert.ok(Math.max(...manyIds.map(id => Math.abs(Number(arranged.overrides[`${id}::input`]?.offsetX ?? 0)))) > 500)
  assert.ok(groups.slice(1).every((group, index) => Math.abs((groups[index].left - group.right) - 20) < 1))
})

test('each batch layout is one undo and redo step and persists through draft save and load', () => {
  const start = emptyDesignerDraft(formId)
  const batch = layoutDesignerFields(start, layoutFields, { operation: 'arrange', orientation: 'horizontal', gap: 16, rtl: false }, ids)
  let history = designerHistoryReducer(createDesignerHistory(start), { type: 'change', draft: batch })
  assert.equal(history.past.length, 1)
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveDesignerDraft(storage, 'user-layout', formId, history.present, ids), true)
  assert.deepEqual(loadDesignerDraft(storage, 'user-layout', formId, ids).overrides, batch.overrides)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
  history = designerHistoryReducer(history, { type: 'redo' })
  assert.deepEqual(history.present.overrides, batch.overrides)
})

test('draft validation rejects arbitrary CSS and invalid values while retaining known overrides', () => {
  const clean = validateDesignerDraft({
    format: 'yarn-trade.form-designer-draft', schemaVersion: 1, formId,
    overrides: { personCode: { fontFamily: 'url(javascript:alert(1))', backgroundColor: 'red', textColor: '#AABBCC', customCss: 'body{}' }, unknownField: { fontSize: 20 } }
  }, formId, ids)
  assert.deepEqual(clean.overrides, { personCode: { textColor: '#aabbcc' } })
  assert.equal(validateDesignerDraft({ format: 'wrong', schemaVersion: 2 }, formId, ids).formId, formId)
})

test('all typography and visual-state overrides map to immediate safe field styles and inherit on reset', () => {
  let draft = emptyDesignerDraft(formId)
  const values = { fontFamily: 'tahoma', fontSize: 18, fontWeight: 600, bold: true, italic: true, textAlign: 'center', lineHeight: 1.7, backgroundColor: '#ffffff', textColor: '#202a31', labelColor: '#69747b', borderColor: '#d7dee2', focusColor: '#0e7490', focusBackgroundColor: '#fff4cc', focusTextColor: '#153e75', focusBorderColor: '#0b6e4f', focusLabelColor: '#8a4b08', hoverColor: '#e9f4f5', selectedColor: '#d99a30', disabledColor: '#eef1f3', errorColor: '#c24141' }
  for (const [property, setting] of Object.entries(values)) draft = setDesignerProperty(draft, ['personCode'], property, setting, ids)
  const style = designerStyleForField(draft, 'personCode')
  assert.equal(style['--lab-font-size'], '18px')
  assert.equal(style['--lab-text-align'], 'center')
  assert.equal(style['--lab-line-height'], '1.7')
  for (const property of ['--lab-bg', '--lab-text', '--lab-label', '--lab-border', '--lab-focus', '--lab-focus-bg', '--lab-focus-text', '--lab-focus-border', '--lab-focus-label', '--lab-hover', '--lab-selected', '--lab-disabled', '--lab-error']) assert.ok(property in style)
  draft = setDesignerProperty(draft, ['personCode'], 'fontFamily', undefined, ids)
  assert.equal(designerStyleForField(draft, 'personCode')['--lab-font'], undefined)
})

test('form-lab appearance colors are scoped, validated and persisted as one undoable draft', () => {
  let draft = emptyDesignerDraft(formId)
  draft = setDesignerAppearanceProperty(draft, 'headerBackground', '#123456')
  draft = setDesignerAppearanceProperty(draft, 'rowAlternateBackground', '#abcdef')
  draft = setDesignerAppearanceProperty(draft, 'cellBackground', '#f0f0f0')
  draft = setDesignerAppearanceProperty(draft, 'actionBorder', '#fedcba')
  draft = setDesignerAppearanceProperty(draft, 'tableBackground', 'red')
  assert.deepEqual(draft.appearance, { headerBackground: '#123456', rowAlternateBackground: '#abcdef', cellBackground: '#f0f0f0', actionBorder: '#fedcba' })
  const style = designerAppearanceStyle(draft)
  assert.equal(style['--lab-header-bg'], '#123456')
  assert.equal(style['--lab-row-alt-bg'], '#abcdef')
  assert.equal(style['--lab-cell-bg'], '#f0f0f0')
  assert.equal(style['--lab-action-border'], '#fedcba')
  let history = designerHistoryReducer(createDesignerHistory(emptyDesignerDraft(formId)), { type: 'beginTransaction' })
  history = designerHistoryReducer(history, { type: 'change', draft: setDesignerAppearanceProperty(history.present, 'tableBackground', '#101010') })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveDesignerDraft(storage, 'appearance-user', formId, draft, ids), true)
  assert.deepEqual(loadDesignerDraft(storage, 'appearance-user', formId, ids).appearance, draft.appearance)
})

test('undo and redo keep 30-plus steps; continuous color changes form one undo step', () => {
  let history = createDesignerHistory(emptyDesignerDraft(formId))
  for (let i = 1; i <= 40; i++) history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, ['personCode'], 'lineHeight', 0.8 + i / 100, ids) })
  assert.equal(history.past.length, 40)
  for (let i = 0; i < 30; i++) history = designerHistoryReducer(history, { type: 'undo' })
  assert.ok(Math.abs(history.present.overrides.personCode.lineHeight - 0.9) < 0.000001)
  for (let i = 0; i < 30; i++) history = designerHistoryReducer(history, { type: 'redo' })
  assert.ok(Math.abs(history.present.overrides.personCode.lineHeight - 1.2) < 0.000001)

  history = createDesignerHistory(emptyDesignerDraft(formId))
  history = designerHistoryReducer(history, { type: 'beginTransaction' })
  for (const color of ['#112233', '#223344', '#334455']) history = designerHistoryReducer(history, { type: 'change', draft: setDesignerProperty(history.present, ['personCode'], 'backgroundColor', color, ids) })
  history = designerHistoryReducer(history, { type: 'commitTransaction' })
  assert.equal(history.past.length, 1)
  history = designerHistoryReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.overrides, {})
})

test('local drafts reload only for their authenticated user and form ID', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  let draft = setDesignerProperty(emptyDesignerDraft(formId), ['address'], 'lineHeight', 1.8, ids)
  assert.equal(saveDesignerDraft(storage, 'user-1', formId, draft, ids), true)
  assert.equal(designerStorageKey('user-1', formId), [...values.keys()][0])
  assert.equal(loadDesignerDraft(storage, 'user-1', formId, ids).overrides.address.lineHeight, 1.8)
  assert.deepEqual(loadDesignerDraft(storage, 'user-2', formId, ids).overrides, {})
  assert.deepEqual(loadDesignerDraft(storage, 'user-1', 'another-form', ids).overrides, {})
  assert.equal(saveDesignerDraft(storage, undefined, formId, draft, ids), false)
})

test('laboratory UI protects editable keyboard behavior, RTL, cancellation and immutable Golden source', () => {
  assert.match(page, /dir=\{fa \? 'rtl' : 'ltr'\}/)
  assert.match(page, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(page, /target\.matches\('input, textarea, \[contenteditable="true"\]'\)/)
  assert.match(page, /editingBaseline\.current/)
  assert.match(app, /FormLaboratoryPage language=\{language\} authenticatedUserId=\{access\?\.id\}/)
  assert.match(page, /const targets = applyToAll \? fieldIds : selection/)
  assert.match(page, /setSelection\(fieldIds\.map/)
  assert.doesNotMatch(page, /document\.documentElement\.dataset\.theme|setTheme\(/)
  assert.match(page, /<Shortcut code=\{action.code\}/)
  assert.match(panel, /type="color"/)
  assert.match(panel, /onBeginColorChange/)
  assert.match(panel, /رنگ و ظاهر/)
  assert.match(panel, /رنگ‌های حالت فوکوس/)
  assert.match(page, /appearanceStyle/)
  assert.match(panel, /Select all|انتخاب همه/)
})

test('device previews use real viewport widths and keep desktop canvas editing isolated', () => {
  const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')
  assert.match(page, /const previewWidths = \{ desktop: 1440, tablet: 768, mobile: 390 \}/)
  assert.match(page, /previewDevice === 'mobile' \? mobileWidth : previewWidths\[previewDevice\]/)
  assert.match(page, /data-preview-width=\{previewWidth\} style=\{\{ width: previewWidth \}\}/)
  assert.match(page, /const canvas = geometryEditable \? history\.present\.canvas/)
  assert.match(page, /geometryEditable=\{geometryEditable\}/)
  assert.match(page, /if \(!designerOpen \|\| !geometryEditable \|\| history\.present\.canvas/)
  assert.match(styles, /\.laboratory-preview-viewport\{container-type:inline-size;container-name:laboratory-preview/)
  assert.match(styles, /@container laboratory-preview \(max-width:900px\)/)
  assert.match(styles, /@container laboratory-preview \(max-width:420px\)/)
  assert.match(styles, /\.laboratory-preview-scroll\{min-width:0;min-height:0;overflow:auto/)
})
