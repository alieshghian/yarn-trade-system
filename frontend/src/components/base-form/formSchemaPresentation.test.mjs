import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const presentation = readFileSync(resolve(root, 'frontend/src/components/base-form/FormSchemaPresentation.tsx'), 'utf8')
const laboratory = readFileSync(resolve(root, 'frontend/src/FormLaboratoryPage.tsx'), 'utf8')

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
