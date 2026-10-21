import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {appearanceColors,appearanceBoxCommands} from './appearanceCommands.ts'
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8')
test('appearance commands are shared across native fields and toolbar targets',()=>{
 assert.deepEqual(appearanceColors.map(item=>item.property),['backgroundColor','textColor','borderColor'])
 assert.ok(appearanceBoxCommands.some(item=>item.property==='borderRadius'))
 const page=read('../../FormLaboratoryPage.tsx')
 assert.equal((page.match(/appearanceColors(?:\.filter\([^\n]+?\))?\.map/g)??[]).length,4)
 assert.ok(page.includes("contextGroup('appearance'"))
 assert.ok(page.includes('appearanceBoxCommands.filter'))
 assert.ok(!page.includes('toolbarAppearance'))
 assert.ok(!page.includes('بستن تنظیمات جزء'))
 assert.ok(page.includes('requestToolbarProperty(activeTableId,contextMenu.toolbarPart!,command.property)'))
})
test('field and toolbar numeric appearance editors use the same component and color/font tools',()=>{
 const panel=read('FormLaboratoryDesignerPanel.tsx'),toolbar=read('GridToolbarControls.tsx'),page=read('../../FormLaboratoryPage.tsx')
 for(const source of [panel,toolbar]){assert.ok(source.includes("from './AppearanceNumberInput'"));assert.ok(source.includes('<AppearanceNumberInput'));assert.ok(source.includes('<ExcelColorPicker'))}
 assert.ok(!toolbar.includes('function BoxNumber'))
 assert.ok(page.includes("scope:'toolbar'"));assert.ok(page.includes("mode:'font'"))
 assert.ok(page.includes('gridFormatDialog?.mode === \'font\''))
 assert.ok(toolbar.includes('control?.click()'))
 assert.ok(toolbar.includes("[propertyRequest?.sequence]"))
})
