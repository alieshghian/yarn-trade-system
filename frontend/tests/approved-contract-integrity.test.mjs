import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAppendOnly, browserEvidence, readRegistry, requireEvidence, tapEvidence, trxEvidence, validateRegistry,
} from '../tools/approved-contract-integrity.mjs'

test('immutable records permit append and reject deletion or rewrites', async () => {
  const baseline = await readRegistry()
  const current = structuredClone(baseline)
  current.forms.push({ id: 'example.successor', revision: 1 })
  assert.doesNotThrow(() => assertAppendOnly(baseline, current))
  current.forms[0].assets = []
  assert.throws(() => assertAppendOnly(baseline, current), /protected contracts are immutable/)
  const removed = structuredClone(baseline)
  removed.suites.pop()
  assert.throws(() => assertAppendOnly(baseline, removed), /registered checks are immutable/)
})

test('required evidence cannot be replaced with a skip or an empty run', () => {
  const suite = { id: 'gate.example', required: ['wanted'] }
  const summary = '# tests 1\n# skipped 0\n# todo 0\n'
  assert.doesNotThrow(() => requireEvidence(suite, tapEvidence('ok 1 - wanted\n' + summary)))
  assert.throws(() => requireEvidence(suite, tapEvidence('ok 1 - other\n' + summary)), /Missing PASS/)
  assert.throws(() => tapEvidence('ok 1 - wanted # SKIP\n# tests 1\n# skipped 1\n# todo 0'), /skipped/)
  assert.throws(() => tapEvidence('# tests 0\n# skipped 0\n# todo 0'), /zero tests/)
  assert.throws(() => requireEvidence(suite, browserEvidence('SKIP wanted')), /Missing PASS/)
  assert.throws(() => trxEvidence('<Results></Results>'), /No .NET test results/)
  assert.throws(() => trxEvidence('<UnitTestResult testName="wanted" outcome="NotExecuted"/>'), /Non-passing/)
  assert.doesNotThrow(() => requireEvidence(suite, trxEvidence('<UnitTestResult testName="Example.wanted(arg: True)" outcome="Passed"/>')))
})

test('registered contracts reject a missing required test', async () => {
  const registry = await readRegistry()
  assert.ok((await validateRegistry(registry)).covered)
  registry.forms[0].capabilities[0].checks = ['nonexistent.check']
  await assert.rejects(validateRegistry(registry), /Undiscovered test/)
})
