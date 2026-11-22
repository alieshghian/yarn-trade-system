import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const frontend = new URL('../', import.meta.url)
export const root = new URL('../../', import.meta.url)
export const registryFile = 'frontend/tests/approved-form-contracts.json'
export const lanes = ['unit', 'production', 'integration', 'theme-security', 'brands-operational', 'approved-yarns', 'product-group-operational', 'person-brand-lookup', 'warehouses']
export const readRegistry = async () => JSON.parse(await readFile(new URL(registryFile, root)))

export function assertAppendOnly(base, current) {
  assert.equal(current.version, base.version, 'Registry format changed without a compatibility migration')
  assert.deepEqual(current.suites.slice(0, base.suites.length), base.suites, 'Previously registered checks are immutable')
  assert.deepEqual(current.forms.slice(0, base.forms.length), base.forms, 'Previously protected contracts are immutable')
}

export function assertGitBase(registry, ref) {
  if (!ref) return
  assert.match(ref, /^[a-f0-9]{40}$/i, 'Approval comparison requires a commit ID')
  if (/^0+$/.test(ref)) return
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  if (!git(['ls-tree', ref, '--', registryFile])) return // First introduction to this branch.
  assertAppendOnly(JSON.parse(git(['show', `${ref}:${registryFile}`])), registry)
}

export function digest(bytes, format) {
  return createHash('sha256').update(format === 'json' ? JSON.stringify(JSON.parse(bytes)) : bytes).digest('hex')
}

function checkedPath(file, pattern) {
  assert.match(file, pattern)
  assert.ok(!file.split('/').some(segment => segment === '..' || segment === '.'), `Invalid registered path: ${file}`)
  return new URL(file, frontend)
}

export async function validateRegistry(registry) {
  assert.equal(registry.version, 1)
  assert.ok(registry.forms.length)
  assert.ok(registry.suites.length)
  const suites = new Set()
  const used = new Set()
  const assets = new Map()
  const revisions = new Map()
  const latest = new Map()
  for (const suite of registry.suites) {
    assert.match(suite.id, /^[a-z0-9][a-z0-9.-]+$/)
    assert.ok(!suites.has(suite.id), `Duplicate suite ${suite.id}`)
    suites.add(suite.id)
    assert.ok(lanes.includes(suite.lane), `Unscheduled lane ${suite.lane}`)
    assert.ok(suite.required.length, `No required evidence for ${suite.id}`)
    assert.equal(new Set(suite.required).size, suite.required.length, `Duplicate evidence for ${suite.id}`)
    assert.ok(suite.required.every(name => typeof name === 'string' && name.trim() === name && name.length))
    if (suite.lane === 'integration' || suite.lane === 'theme-security') {
      assert.ok(!suite.file, `Unexpected script for .NET suite ${suite.id}`)
      assert.ok(suite.required.every(name => /^\w+$/.test(name)), `Expected .NET method names for ${suite.id}`)
    } else {
      const extension = suite.lane === 'unit' ? 'test' : 'browser'
      await readFile(checkedPath(suite.file, new RegExp(`^(src|tests)/[\\w./-]+\\.${extension}\\.mjs$`)))
    }
  }
  for (const form of registry.forms) {
    assert.match(form.id, /^[a-z][a-z0-9.-]+$/)
    assert.equal(form.revision, (revisions.get(form.id) ?? 0) + 1, `${form.id} needs the next revision`)
    revisions.set(form.id, form.revision)
    assert.ok(['approved', 'protected-reference', 'operational-evidence'].includes(form.status))
    assert.ok(form.provenance.trim())
    assert.ok(form.dependencies.length && form.dependencies.every(value => typeof value === 'string' && value.trim()))
    assert.ok(form.capabilities.length)
    if (form.status === 'approved') assert.ok(form.assets.length, `${form.id} lacks authenticated reference assets`)
    const ids = new Set()
    for (const capability of form.capabilities) {
      assert.match(capability.id, /^[a-z][a-z0-9.-]+$/)
      assert.ok(!ids.has(capability.id), `Duplicate capability: ${form.id}/${capability.id}`)
      ids.add(capability.id)
      assert.ok(capability.contract.trim(), `Missing contract for ${form.id}/${capability.id}`)
      if (capability.status === 'unverified') {
        assert.equal(capability.checks.length, 0)
        continue
      }
      assert.ok(['covered', 'partial'].includes(capability.status), 'Invalid evidence status for ' + capability.id)
      if (capability.status === 'partial') assert.ok(capability.gap?.trim(), 'Missing evidence gap for ' + capability.id)
      assert.ok(capability.checks.length, `Required test missing for ${form.id}/${capability.id}`)
      for (const id of capability.checks) {
        assert.ok(suites.has(id), `Undiscovered test ${id} for ${form.id}/${capability.id}`)
        used.add(id)
      }
    }
    const previous = latest.get(form.id)
    if (previous) {
      for (const required of previous.capabilities) {
        const successor = form.capabilities.find(capability => capability.id === required.id)
        assert.ok(successor, 'Successor dropped capability ' + form.id + '/' + required.id)
        assert.ok(required.checks.every(check => successor.checks.includes(check)), 'Successor dropped required evidence for ' + form.id + '/' + required.id)
        assert.ok(required.status !== 'covered' || successor.status === 'covered', 'Successor demoted verified capability ' + form.id + '/' + required.id)
      }
    }
    latest.set(form.id, form)
    for (const asset of form.assets) {
      assert.ok(['json', 'bytes'].includes(asset.format))
      assert.match(asset.sha256, /^[a-f0-9]{64}$/)
      if (!assets.has(asset.file)) {
        const bytes = await readFile(checkedPath(asset.file, /^(tests|src)\/[\w./-]+$/))
        assets.set(asset.file, digest(bytes, asset.format))
      }
      assert.equal(assets.get(asset.file), asset.sha256, `Protected artifact drift: ${asset.file}`)
    }
  }
  assert.deepEqual([...used].sort(), [...suites].sort(), 'An unreferenced check cannot satisfy the approved gate')
  const capabilities = [...latest.values()].flatMap(form => form.capabilities)
  const counts = Object.fromEntries(['covered', 'partial', 'unverified'].map(status =>
    [status, capabilities.filter(capability => capability.status === status).length]))
  return { forms: latest.size, assets: assets.size, suites: suites.size, capabilities: capabilities.length, ...counts }
}

export function requireEvidence(suite, output) {
  for (const expected of suite.required) {
    assert.ok(output.has(expected), `Missing PASS evidence for ${suite.id}: ${expected}`)
  }
}

export function browserEvidence(output) {
  return new Set(output.split(/\r?\n/).filter(line => line.startsWith('PASS ')).map(line => line.slice(5)))
}

export function tapEvidence(output) {
  assert.ok(/^# tests [1-9]\d*$/m.test(output), 'Node discovered zero tests')
  assert.ok(/^# skipped 0$/m.test(output), 'Required Node test was skipped or omitted')
  assert.ok(/^# todo 0$/m.test(output), 'Required Node test was marked todo')
  return new Set([...output.matchAll(/^ok \d+ - (.*)$/gm)].map(match => match[1].trim()))
}

export function trxEvidence(xml) {
  const results = [...xml.matchAll(/<UnitTestResult\s[^>]+>/g)].map(match => match[0])
  assert.ok(results.length, 'No .NET test results were discovered')
  const evidence = new Set()
  for (const result of results) {
    assert.equal(/\boutcome="([^"]+)"/.exec(result)?.[1], 'Passed', `Non-passing .NET result: ${result.slice(0, 200)}`)
    const name = /\btestName="([^"]+)"/.exec(result)?.[1]
    assert.ok(name)
    evidence.add(name.split('(')[0].trim().split('.').at(-1))
  }
  return evidence
}
