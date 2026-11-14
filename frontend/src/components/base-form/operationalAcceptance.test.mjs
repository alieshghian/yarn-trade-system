import test from 'node:test'
import assert from 'node:assert/strict'
import {operationalAcceptanceRequirements,operationalAcceptanceBlockers} from './operationalAcceptance.ts'
const schema={id:'new-form',fields:[{componentId:'base-form.cascading-tree-panels'}],tables:[{id:'report'},{id:'detail'}]}
const requirements=operationalAcceptanceRequirements(schema)
const checks=keys=>Object.fromEntries(keys.map(key=>[key,{status:'passed',artifact:'isolated-tests/'+key+'.json'}]))
const evidence=()=>({version:requirements.version,formId:schema.id,releaseId:'release',digest:'digest',form:checks(requirements.form),tables:Object.fromEntries(requirements.tables.map(t=>[t.id,checks(t.checks)])),hierarchy:checks(requirements.hierarchy)})
test('every table and hierarchy must have exact release-bound passing evidence',()=>{
 assert.deepEqual(operationalAcceptanceBlockers(schema,'release','digest',evidence()),[])
 for(const patch of [{formId:'other'},{releaseId:'old'},{digest:'old'},{version:0}])assert.deepEqual(operationalAcceptanceBlockers(schema,'release','digest',{...evidence(),...patch}),['runtime-evidence-missing-or-stale'])
 assert.deepEqual(operationalAcceptanceBlockers(schema,'release','digest'),['runtime-evidence-missing-or-stale'])
})
test('one successful table cannot hide missing server querying or lazy tree integration',()=>{
 const value=evidence();delete value.tables.detail;value.tables.report['server-search'].status='blocked';value.hierarchy['lazy-branches'].status='failed'
 const blocked=operationalAcceptanceBlockers(schema,'release','digest',value)
 assert.ok(blocked.includes('report:server-search'));assert.ok(blocked.includes('detail:server-paging'));assert.ok(blocked.includes('hierarchy:lazy-branches'))
})
test('unreferenced pass claims and unrelated table evidence do not authorize activation',()=>{
 const value=evidence();value.form['permissions'].artifact=' ';value.tables.other=value.tables.detail;delete value.tables.detail
 assert.ok(operationalAcceptanceBlockers(schema,'release','digest',value).includes('form:permissions'))
 assert.ok(operationalAcceptanceBlockers(schema,'release','digest',value).includes('detail:large-dataset'))
})
