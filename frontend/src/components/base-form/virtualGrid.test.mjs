import assert from 'node:assert/strict'
import test from 'node:test'
import { VirtualPageCache, virtualRange, virtualQueryKey } from './virtualGrid.ts'

const result = (page, total = 100000) => ({ items: Array.from({ length: 100 }, (_, i) => (page - 1) * 100 + i), total, page, pageSize: 100 })
const settle = () => new Promise(resolve => setImmediate(resolve))

test('viewport bounds stay small at first, middle and last rows', () => {
  for (const top of [0, 150 * 43, 90000 * 43, 100000 * 43]) {
    const range = virtualRange(100000, top, 300, 43)
    assert.ok(range.end - range.start <= 23)
    assert.ok(range.start >= 0 && range.end <= 100000)
  }
  assert.equal(virtualRange(0, 0, 300, 43).end, 0)
})

test('query key includes every parameter and ignores object property insertion order', () => {
  const a = { scope: 100000, search: '21', mode: 'startsWith', reverse: false, filters: { name: { selectedValues: ['a'] } }, sort: [{ id: 'name', direction: 'asc' }] }
  assert.equal(virtualQueryKey(a), virtualQueryKey({ ...a, filters: { name: { selectedValues: ['a'] } } }))
  for (const field of ['scope', 'search', 'mode', 'reverse', 'filters', 'sort']) assert.notEqual(virtualQueryKey(a), virtualQueryKey({ ...a, [field]: null }))
})

test('initial fetch is deduplicated and prefetch starts at row 35 then 135', async () => {
  const calls = []
  let complete
  const cache = new VirtualPageCache('a', page => { calls.push(page); return new Promise(resolve => { complete = () => resolve(result(page)) }) })
  cache.setViewport(0, 0, 20); cache.setViewport(0, 0, 20)
  await settle(); assert.deepEqual(calls, [1]); complete(); await settle()
  cache.setViewport(33, 25, 50); await settle(); assert.deepEqual(calls, [1])
  cache.setViewport(34, 26, 51); cache.setViewport(34, 26, 51); await settle(); assert.deepEqual(calls, [1, 2])
  complete(); await settle(); assert.equal(cache.row(150), 150)
  cache.setViewport(134, 126, 151); await settle(); assert.deepEqual(calls, [1, 2, 3]); complete(); await settle()
  assert.equal(cache.metrics.peakConcurrent, 1); cache.dispose()
})

test('rapid jump fetches target pages, bounds cache and reuses upward cached rows', async () => {
  const calls = []
  const cache = new VirtualPageCache('a', async page => { calls.push(page); return result(page) })
  cache.setViewport(0, 0, 20); await settle()
  cache.setViewport(90010, 90002, 90030); await settle()
  assert.deepEqual(calls, [1, 901]); assert.equal(cache.row(90010), 90010)
  for (let page = 902; page <= 915; page++) { cache.setViewport((page - 1) * 100 + 10, (page - 1) * 100 + 2, (page - 1) * 100 + 30); await settle(); assert.ok(cache.cacheSize <= 8) }
  const before = calls.length
  cache.setViewport(91310, 91302, 91330); await settle(); assert.equal(calls.length, before)
  cache.dispose()
})

test('obsolete responses cannot overwrite a new query generation', async () => {
  let finish
  const old = new VirtualPageCache('old', () => new Promise(resolve => { finish = resolve }))
  old.setViewport(0, 0, 20); await settle(); old.dispose()
  const next = new VirtualPageCache('new', async page => ({ ...result(page), items: ['new'] }))
  next.setViewport(0, 0, 20); await settle(); finish(result(1)); await settle()
  assert.equal(old.total, undefined); assert.equal(next.row(0), 'new'); next.dispose()
})

test('concurrency is capped and failures require a localized explicit retry', async () => {
  let failures = true
  const calls = []
  const cache = new VirtualPageCache('a', async page => { calls.push(page); if (failures) throw Error('offline'); return result(page) })
  cache.setViewport(95, 87, 112); await settle()
  cache.setViewport(95, 87, 112); await settle(); assert.equal(calls.length, 1)
  assert.equal(cache.error(1), 'offline'); failures = false; cache.retry(1); await settle()
  cache.setViewport(95, 87, 112); await settle(); assert.equal(cache.row(110), 110)
  assert.ok(cache.metrics.peakConcurrent <= 2); cache.dispose()
})

test('a fast jump removes skipped queued pages and aborts distant in-flight work', async () => {
  const calls = [], pending = new Map(), signals = new Map()
  const cache = new VirtualPageCache('a', (page, signal) => { calls.push(page); signals.set(page, signal); return new Promise(resolve => pending.set(page, resolve)) })
  cache.setViewport(0, 0, 20); await settle(); pending.get(1)(result(1)); await settle()
  cache.setViewport(150, 140, 500); await settle()
  assert.equal(cache.inFlight, 2); assert.deepEqual(calls, [1, 2, 3])
  cache.setViewport(90010, 90002, 90030)
  assert.equal(signals.get(2).aborted, true); assert.equal(signals.get(3).aborted, true)
  pending.get(2)(result(2)); pending.get(3)(result(3)); await settle()
  assert.deepEqual(calls, [1, 2, 3, 901]); assert.equal(cache.row(200), undefined)
  pending.get(901)(result(901)); await settle(); assert.equal(cache.row(90010), 90010)
  assert.equal(cache.metrics.peakConcurrent, 2); cache.dispose()
})
