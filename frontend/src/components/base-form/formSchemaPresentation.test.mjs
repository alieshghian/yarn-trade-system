import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const presentation = readFileSync(resolve(root, 'frontend/src/components/base-form/FormSchemaPresentation.tsx'), 'utf8')
const laboratory = readFileSync(resolve(root, 'frontend/src/FormLaboratoryPage.tsx'), 'utf8')
const laboratoryStyles = readFileSync(resolve(root, 'frontend/src/styles.css'), 'utf8')

test('shared presentation renders the schema frame and inherits DesignerDraft visuals', () => {
  assert.match(presentation, /<BaseFormShell formId=\{schema\.id\}/)
  assert.match(presentation, /designerAppearanceStyle\(designerDraft\)/)
  assert.match(presentation, /designerColumnStyles=\{designerDraft\.tableColumns\}/)
  assert.match(presentation, /designerHeaderStyles=\{designerDraft\.tableHeaders\}/)
})

test('read-only presentation removes operational grid adapters', () => {
  assert.match(presentation, /readOnly=\{readOnly\}/)
  assert.match(presentation, /remoteQuery=\{readOnly \? undefined : remoteQuery\}/)
  assert.match(presentation, /onRowSelectionChange=\{readOnly \? undefined : onRowSelectionChange\}/)
  assert.match(presentation, /onTotalChange=\{readOnly \? undefined : onTotalChange\}/)
})

test('Laboratory keeps its original shell through the shared presentation and offers a read-only comparison', () => {
  assert.match(laboratory, /schema=\{laboratoryPresentationSchema\}/)
  assert.match(laboratory, /remoteQuery: remoteGridQuery/)
  assert.match(laboratory, /پیش‌نمایش قالب مشترک/)
  assert.match(laboratory, /schema=\{laboratoryTemplatePreviewSchema\}[\s\S]*readOnly/)
  assert.match(laboratory, /rows: sharedPresentationRows, columns/)
})

test('independent form applies schema field positions without fixed-canvas flow and keeps responsive columns', () => {
  assert.match(laboratory, /className="laboratory-form-frame" data-preview-device=\{managedFormDraft\.frame\.device\}/)
  assert.match(laboratory, /className="laboratory-workspace">\s*<FormSchemaPresentation schema=\{managedFormDraft\.schema\}/)
  assert.match(laboratory, /renderLaboratoryEditor\(true, managedFormVisualDraft, managedFormDraft\.schema\)/)
  assert.match(laboratory, /formSchemaFieldGridStyle\(schema, id\)/)
  assert.match(laboratory, /const editorCanvas = schema \? undefined : designerDraft\.canvas/)
  assert.match(laboratoryStyles, /\.laboratory-form-grid\[data-schema-columns\]\{grid-template-columns:repeat\(var\(--form-schema-grid-columns,20\),minmax\(0,1fr\)\)\}/)
  assert.match(laboratoryStyles, /@container laboratory-preview \(max-width:900px\)\{\.laboratory-form-frame \.laboratory-editor \.laboratory-form-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/)
  assert.match(laboratoryStyles, /@container laboratory-preview \(max-width:420px\)\{\.laboratory-form-frame \.laboratory-editor \.laboratory-form-grid\{grid-template-columns:minmax\(0,1fr\)\}/)
})
