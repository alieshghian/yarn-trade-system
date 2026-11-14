import test from 'node:test'
import assert from 'node:assert/strict'
import { createFormDesignExport } from './formDesignExport.ts'
import { initialFormBehaviors, addFormBehavior, publishFormBehavior, emptyBehaviorInstructions, laboratoryBehaviorId } from './formBehavior.ts'
import { createProductGroupLaboratorySchema } from './productGroupLaboratoryForm.ts'
import { createManagedLaboratoryForm, createManagedFormStructureHistory } from './laboratoryFormDraftState.ts'
import { emptyDesignerDraft } from './designer.ts'

test('handoff retains custom design and referenced inherited behavior without mutating the form', () => {
  const schema = createProductGroupLaboratorySchema({ id: 'form-laboratory.template', schemaVersion: 1, version: 1, status: 'draft', mode: 'operational', title: { fa: 'آزمایشگاه', en: 'Laboratory', zh: 'Laboratory' }, sections: [], fields: [], tables: [], actions: [], resources: {} }, 'handoff-test')
  let library = addFormBehavior(initialFormBehaviors(), 'test.child', 'Child')
  library = publishFormBehavior(library, 'test.child', { trapTab: false }, emptyBehaviorInstructions(), 'custom')
  schema.settings = { ...schema.settings, shared: { ...schema.settings?.shared, behaviorId: 'test.child' } }
  schema.tables[0].columns[0].width = 237
  const form = createManagedLaboratoryForm({ id: schema.id, name: schema.title.fa, mode: 'operational', templateSchema: schema, templateDesigner: emptyDesignerDraft('form-laboratory.template'), frame: { device: 'desktop', width: 1211, height: 820, fitToPage: false } })
  const draft = emptyDesignerDraft(form.id)
  const snapshot = { form, designerHistory: { present: draft, past: [], future: [] }, structureHistory: createManagedFormStructureHistory(form.schema) }
  const before = JSON.stringify(snapshot)
  const output = createFormDesignExport(snapshot, library, { version: 13 }, 'http://127.1.0.1:5173/', 'fixed')
  assert.equal(JSON.stringify(snapshot), before)
  assert.equal(output.form.schema.tables[0].columns[0].width, 237)
  assert.deepEqual(output.form.frame, form.frame)
  assert.equal(output.behaviorManifest.policies['test.child'].trapTab, false)
  assert.deepEqual(new Set(output.behaviorManifest.definitions.map(d => d.id)), new Set([laboratoryBehaviorId, 'test.child']))
  assert.equal(output.behaviorManifest.componentContracts[0].componentId, 'base-form.cascading-tree-panels')
  assert.equal(output.behaviorManifest.componentContracts[0].hierarchy.maxDepth, 5)
  assert.equal(output.scope.operationalActivation, false)
  assert.equal(output.behaviorManifest.systemLookupContract.create.shortcut,'Insert')
  assert.equal(output.behaviorManifest.systemLookupContract.create.trigger,'keydown-without-modifiers-no-repeat')
  assert.equal(output.behaviorManifest.systemLookupContract.search.visibleCreateAction,'Insert')
  assert.equal(output.behaviorManifest.systemLookupContract.create.selectShortcut,'Enter')
  assert.equal(output.behaviorManifest.contactListContract.singleDefault,true)
  assert.equal(output.behaviorManifest.contactListContract.removeUnsavedRows,true)
  assert.equal(output.behaviorManifest.systemLookupContract.create.mountDialogAfterSourceReady,true)
  assert.equal(output.behaviorManifest.systemLookupContract.blankSelection,'null-no-association')
  assert.equal(output.behaviorManifest.systemLookupContract.sources.brands.ownership,'one-person-per-brand')
  assert.deepEqual(output.diagnostics, [{ code: 'footer-actions-missing', id: form.id }])
  assert.equal(output.operationalAcceptance.status, 'requires-runtime-verification')
  assert.equal(output.operationalAcceptance.activationRequiresPassingEvidence, true)
  assert.ok(output.operationalAcceptance.requiredChecks.includes('F1-contextual-search'))
  assert.equal(output.behaviorManifest.integrationContract.scope,'all-laboratory-forms')
  assert.equal(output.behaviorManifest.integrationContract.integration.blockedWhileChanged,true)
  assert.equal(output.behaviorManifest.integrationContract.version,6)
  assert.equal(output.behaviorManifest.integrationContract.saveActions.menuRegistration,'hidden-until-successful-save-in-current-session; exact-prepared-json-required')
  assert.equal(output.behaviorManifest.integrationContract.saveActions.reopen,'hide-registration-until-explicit-save')
  assert.equal(output.behaviorManifest.integrationContract.saveActions.changed,'hide-registration-enable-save; pending-menu-red')
  assert.equal(output.operationalAcceptance.status,'requires-runtime-verification')
  assert.ok(output.operationalAcceptance.requirements.tables.every(table=>table.checks.includes('server-paging')&&table.checks.includes('server-search')))
  assert.ok(output.operationalAcceptance.requirements.hierarchy.includes('lazy-branches'))
  assert.equal(output.behaviorManifest.designLifecycleContract.removalIsRecoverable,true)
  assert.equal(output.behaviorManifest.colorPickerContract.moreColorsDimsPage,false)
  assert.equal(output.integrationTarget.kind,'new')
  assert.deepEqual(JSON.parse(JSON.stringify(output)).recoverySnapshot.structureHistory, snapshot.structureHistory)
  output.form.schema.tables[0].columns[0].width = 999
  assert.equal(snapshot.form.schema.tables[0].columns[0].width, 237)
  const incomplete = structuredClone(snapshot)
  incomplete.form.schema.tables = []
  const warning = createFormDesignExport(incomplete, library, {}, '', 'fixed')
  assert.deepEqual(warning.diagnostics, [{ code: 'tree-report-definition-missing', id: form.id }, { code: 'footer-actions-missing', id: form.id }])
  assert.deepEqual(warning.form.schema.tables, [])
})


test('save/export captures current unified schema, component identities and section geometry instead of a stale form copy', () => {
 const form=createManagedLaboratoryForm({id:'fresh-export',name:'Fresh',mode:'operational',templateSchema:{id:'fresh-export',schemaVersion:1,version:1,status:'draft',mode:'operational',title:{fa:'Fresh',en:'Fresh',zh:'Fresh'},sections:[{id:'editor',kind:'editor',title:{fa:'',en:'',zh:''}}],fields:[],tables:[],actions:[],resources:{}},templateDesigner:emptyDesignerDraft('fresh-export'),frame:{device:'desktop',width:1200,height:800,fitToPage:false}})
 const current=structuredClone(form.schema)
 current.fields=[{id:'material',sectionId:'editor',kind:'select',componentId:'persons.title-control',label:{fa:'جنس',en:'Material',zh:'Material'}}]
 const draft=emptyDesignerDraft(form.id);draft.sectionCanvases={editor:{width:1200,height:300,fields:{material:{input:{left:10,top:40,width:160,height:34},label:{left:10,top:10,width:160,height:24}}}}}
 const snapshot={form,designerHistory:{present:draft,past:[],future:[],document:{present:current,past:[],future:[]}},structureHistory:createManagedFormStructureHistory(form.schema)}
 const before=JSON.stringify(snapshot),output=createFormDesignExport(snapshot,initialFormBehaviors(),{},'local')
 assert.equal(output.form.schema.fields[0].componentId,'persons.title-control')
 assert.deepEqual(output.recoverySnapshot.structureHistory.present,current)
 assert.equal(output.snapshotIntegrity.schemaSource,'designer-history')
 assert.deepEqual(output.snapshotIntegrity.componentBindings,[{fieldId:'material',componentId:'persons.title-control',sectionId:'editor'}])
 assert.equal(output.snapshotIntegrity.editorGeometry[0].source,'section-canvas')
 assert.equal(JSON.stringify(snapshot),before)
 snapshot.designerHistory.present.formId='wrong-form'
 assert.throws(()=>createFormDesignExport(snapshot,initialFormBehaviors(),{},'local'),/identity mismatch/)
})
