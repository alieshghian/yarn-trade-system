import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const presentation = read('frontend/src/components/base-form/FormSchemaPresentation.tsx')
const laboratory = read('frontend/src/FormLaboratoryPage.tsx')
const styles = read('frontend/src/styles.css')
const contract = read('frontend/src/components/base-form/formLayoutContract.ts')
const contains = (source, text) => assert.ok(source.includes(text), text)

test('shared presentation uses one existing shell and one grid component implementation for all tables', () => {
  contains(presentation, '<BaseFormShell')
  assert.equal((presentation.match(/<BaseFormGridBoundary\s/g) ?? []).length, 1)
  contains(presentation, 'designerAppearanceStyle(designerDraft)')
  contains(presentation, 'formSectionChildren(schema)')
  contains(presentation, 'designerDraftForTable(designerDraft, tableId)')
})

test('design read-only presentation excludes operational adapters and contains no API implementation', () => {
  contains(presentation, 'remoteQuery={gridReadOnly ? undefined : remoteQuery}')
  contains(presentation, 'onRowSelectionChange={gridReadOnly ? undefined : onRowSelectionChange}')
  contains(presentation, 'onTotalChange={gridReadOnly ? undefined : onTotalChange}')
  contains(presentation, "const gridReadOnly = readOnly && presentationMode === 'design'")
  assert.ok(!/apiRequest|fetch\(|axios/.test(presentation))
})

test('Laboratory and independent forms share the current document, renderer and real controller', () => {
  contains(laboratory, 'const documentSchema = history.document?.present ?? activeManagedForm?.schema ?? motherSchema ?? createLaboratorySchemaTemplate(visibleDraft)')
  contains(laboratory, '<FormSchemaPresentation schema={activePresentationSchema} designerDraft={visibleDraft}')
  contains(laboratory, 'renderEditor={renderDocumentEditor} renderFooter={renderDocumentFooter} grids={presentationGrids}')
  contains(laboratory, 'readOnly={Boolean(activeManagedForm)&&!formRuntimeTesting}')
  contains(laboratory, '...(!formRuntimeTesting&&!activeManagedForm')
  contains(laboratory, 'remoteQuery: activeManagedForm ? undefined : remoteGridQuery')
  assert.ok(!laboratory.includes('managedFormVisualDraft'))
})

test('independent identity, inheritance differences and persistence use the existing storage path', () => {
  contains(laboratory, 'formId: activeManagedForm?.id ?? laboratoryDefinition.id, fieldIds: activeFieldIds')
  contains(laboratory, 'initialDraftLoader: identity => activeManagedForm ? resolveManagedLaboratoryDesigner(activeManagedForm)')
  contains(laboratory, 'managedFormWithDesigner(snapshotToSave.form, historyRef.current.present)')
  contains(laboratory, 'saveManagedLaboratoryForm(browserFormStorage(), authenticatedUserId, formToSave)')
  contains(laboratory, 'saveSessionDraft()')
})

test('structural edits reuse the existing history and Designer panel without a second form editor', () => {
  assert.equal((laboratory.match(/const sharedDesignerPanel = designerOpen && <FormLaboratoryDesignerPanel/g) ?? []).length, 1)
  contains(laboratory, 'onSchemaChange={commitManagedStructure}')
  contains(laboratory, 'commitManagedFormStructure(oldHistory, schema)')
  contains(laboratory, 'undoManagedFormStructure(oldHistory)')
  contains(laboratory, 'redoManagedFormStructure(oldHistory)')
  contains(laboratory, 'renameManagedFormField(managedFormDraft.schema')
  contains(laboratory, 'removeManagedFormFields(documentSchema, removableIds)')
})

test('one collapsible sidebar preserves both tabs and the toolbar confines flexible controls', () => {
  contains(laboratory, 'id="managed-designer-panel"')
  contains(laboratory, "hidden={managedSettingsTab !== 'design'}")
  contains(laboratory, 'id="managed-settings-panel"')
  contains(laboratory, 'aria-expanded={!managedSidebarCollapsed}')
  contains(laboratory, 'className="laboratory-banner-variable-controls"')
  contains(styles, '.laboratory-banner-variable-controls{display:flex;align-items:center;gap:6px;min-width:0;overflow-x:auto;')
  contains(styles, 'grid-template-columns:minmax(0,1fr) repeat(2,auto)')
  contains(styles, '.managed-form-sidebar-collapsed .managed-form-sidebar-content{display:none}')
  const genericGridRules = [...styles.matchAll(/([^{}]*\.person-form-grid[^{}]*)\{[^{}]*grid-template-columns/g)]
  assert.ok(genericGridRules.length > 0)
  assert.ok(genericGridRules.every(rule => rule[1].includes(':not(.laboratory-form-grid)')), 'generic Persons layout must exclude Laboratory grids at every responsive width')
})

test('Canvas rendering positions the real label and input from validated geometry', () => {
  contains(laboratory, 'canvas: displayCanvas, gridStyle: layout.fieldStyles[id]')
  contains(laboratory, 'fitDesignerCanvasToViewportWithHysteresis(editorCanvas, editorViewportWidth, layoutSchema.fields.map(field => field.id), previousProjection?.overflowing)')
  contains(laboratory, 'data-canvas-view-shift={canvasViewport?.shift}')
  contains(laboratory, "scrollbarGutter: 'stable'")
  contains(laboratory, 'const renderCanvas = options.canvas')
  contains(laboratory, '...positionedRect(renderCanvas?.fields[id]?.label)')
  contains(laboratory, '...positionedRect(renderCanvas?.fields[id]?.input)')
  contains(laboratory, '...rectStyle(rect)')
  contains(laboratory, 'var(--lab-center-shift, 0px)')
  contains(contract, 'Canvas geometry differs from saved layout')
})

test('development guard inspects each visible editor and reports without writing saved documents', () => {
  contains(laboratory, 'if (!import.meta.env.DEV) return')
  contains(contract, 'window.getComputedStyle')
  contains(contract, 'field.getBoundingClientRect()')
  contains(contract, 'Fields overlap')
  contains(laboratory, 'inspectRegisteredFormLayouts(frameElement, renderedLayoutRoots.current)')
  contains(laboratory, 'setLayoutWarningMessages')
  contains(laboratory, 'new ResizeObserver(check)')
  const guard = laboratory.slice(laboratory.indexOf('const check = () => {'), laboratory.indexOf('const currentStructureHistory'))
  assert.ok(!/localStorage|saveManagedLaboratoryForm|setItem\(/.test(guard))
})


test('independent structure controls share the panel and context callbacks, while sidebar gestures cannot resize the canvas', () => {
  contains(laboratory, 'createPortal(sharedSidebar, externalSidebarHost)')
  contains(laboratory, 'ref={setExternalSidebarHost} className="laboratory-external-sidebar"')
  contains(laboratory, "event.target.closest('.managed-form-workspace-sidebar,button,input,select,textarea,a,[role=\"tab\"]')")
  contains(laboratory, 'initialSourceId={structureDialog.sourceId}')
  contains(laboratory, 'blueprints={fieldBlueprints} onSaveBlueprint={saveBlueprint}')
  contains(laboratory, 'onActionVisibilityChange={changeActionVisibility}')
  contains(laboratory, 'addTableHeaderRow(documentSchema, table.id, destination)')
})


test('recovery is separate from explicit saves, restores native history and flushes before reload or hot replacement', () => {
  contains(laboratory, 'recoverySnapshotRef.current')
  contains(laboratory, "window.addEventListener('pagehide', flush)")
  contains(laboratory, 'import.meta.hot?.dispose(flush)')
  contains(laboratory, 'initialHistoryLoader: identity => readFormRecovery')
  contains(laboratory, "dispatchHistory({ type: 'change', draft: snapshot.designerHistory.present, schema: snapshot.form.schema })")
  contains(laboratory, ' has-external-sidebar')
  contains(laboratory, 'designerOpen ? " has-designer" : ""')
  contains(laboratory, 'captureCurrentEditorCanvas()')
})


test('document mode stays explicit while every form exposes the shared settings entry', () => {
  contains(laboratory, 'data-form-design-mode={activeManagedForm ?')
  contains(laboratory, 'ویرایش قالب اصلی آزمایشگاه')
  contains(laboratory, 'ساخت/ویرایش فرم مستقل')
  contains(laboratory, '<FormSettingsButton language={language}')
  contains(laboratory, 'onClick={openFormSettings}')
  contains(styles, '[data-form-design-mode=independent]')
  contains(styles, '[data-form-design-mode=laboratory]')
})

test('menu destinations reveal their existing sidebar tab and hovering other items clears the flyout', () => {
  contains(laboratory, "setManagedSidebarCollapsed(false); setManagedSettingsTab('design'); setDesignerOpen(true)")
  contains(laboratory, "setManagedSettingsTab('settings'); setDesignerOpen(true)")
  contains(laboratory, 'onPointerOverCapture=')
  contains(laboratory, "!item.hasAttribute('data-grid-submenu')")
  contains(laboratory, 'data-grid-submenu="header"')
  contains(laboratory, 'data-grid-submenu="column"')
})

test('save and close capture the latest document and expose recovery failures outside hidden tabs', () => {
  contains(laboratory, 'const latest = latestRecoverySnapshot()')
  contains(laboratory, 'const snapshotToSave = latestRecoverySnapshot()')
  contains(laboratory, 'className="laboratory-document-notice">{recoveryStatus}</p>')
  contains(styles, '.laboratory-device-label{display:none}')
})


test('only explicit table-header sections render report rows, never ordinary sections with an undefined table ID', () => {
  contains(presentation, 'Boolean(tableId) && section.tableHeaderFor === tableId')
})
