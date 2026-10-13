import assert from 'node:assert/strict'
import test from 'node:test'
import { applyGridFiltersAndSort, gridDistinctValues, gridRowMatchesSearch, gridValueKey, NO_FILL } from './excelGrid.ts'

const rows = [
  { code: '010', qty: 10, date: '2025-03-10', name: 'Alpha', kind: 'A', fill: '#ff0000' },
  { code: '002', qty: 2, date: '2025-03-01', name: 'Beta', kind: 'A', fill: '#0000ff' },
  { code: '100', qty: 3, date: '2025-03-20', name: 'Gamma', kind: 'B', fill: null },
  { code: '2', qty: 4, date: '2025-03-20', name: 'Epsilon', kind: 'B', fill: null },
  { code: '', qty: 20, date: '2025-03-20', name: 'Delta', kind: 'B', fill: '#ff0000' }
]
const columns = [
  { id: 'code', label: 'Code', width: 100, type: 'text', value: row => row.code },
  { id: 'qty', label: 'Quantity', width: 100, type: 'number', value: row => row.qty },
  { id: 'date', label: 'Date', width: 100, type: 'date', value: row => row.date },
  { id: 'name', label: 'Name', width: 100, type: 'text', value: row => row.name, effectiveCellColor: row => row.fill, colorAwareSort: true },
  { id: 'kind', label: 'Kind', width: 100, type: 'text', value: row => row.kind }
]

test('declared text keeps digit codes textual and preserves blanks distinctly', () => {
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, {}, [{ id: 'code', direction: 'asc' }], 'en').map(row => row.code), ['', '002', '010', '100', '2'])
  assert.equal(gridValueKey(null), gridValueKey(''))
  assert.equal(gridDistinctValues(rows, columns[0]).length, 5)
})

test('smart search defaults to word starts, with optional contains and exact modes', () => {
  const searchColumns = [
    { id: 'name', label: 'Name', width: 100, type: 'text', value: row => row.name },
    { id: 'mobile', label: 'Mobile', width: 100, type: 'text', value: row => row.mobile },
    { id: 'address', label: 'Address', width: 100, type: 'text', value: row => row.address }
  ]
  const row = { name: 'شرکت نخ آریا', mobile: '09121000000', address: 'نشانی مصنوعی شماره 21' }
  assert.equal(gridRowMatchesSearch(row, searchColumns, 'نخ'), true)
  assert.equal(gridRowMatchesSearch({ ...row, name: 'چینی' }, searchColumns, 'ینی'), false)
  assert.equal(gridRowMatchesSearch(row, searchColumns, '21'), true)
  assert.equal(gridRowMatchesSearch({ ...row, address: 'نشانی مصنوعی شماره 61' }, searchColumns, '21'), false)
  assert.equal(gridRowMatchesSearch({ ...row, address: 'نشانی مصنوعی شماره 61', mobile: '09121000060' }, searchColumns, '21'), false)
  assert.equal(gridRowMatchesSearch({ ...row, address: 'نشانی مصنوعی شماره 210' }, searchColumns, '21'), true)
  assert.equal(gridRowMatchesSearch({ ...row, address: 'نشانی مصنوعی شماره 61', mobile: '09121000060' }, searchColumns, '21', 'contains'), true)
  assert.equal(gridRowMatchesSearch({ ...row, address: 'نشانی مصنوعی شماره 12' }, searchColumns, '21'), false)
  assert.equal(gridRowMatchesSearch({ ...row, address: 'نشانی مصنوعی شماره 12' }, searchColumns, '21', 'contains'), true)
  assert.equal(gridRowMatchesSearch({ ...row, name: 'چینی' }, searchColumns, 'چینی', 'exact'), true)
  assert.equal(gridRowMatchesSearch({ ...row, name: 'چینی بلند' }, searchColumns, 'چینی', 'exact'), false)
})

test('number comparisons and inclusive Between use numeric values', () => {
  const filtered = applyGridFiltersAndSort(rows, columns, { qty: { custom: { logic: 'and', first: { operator: 'between', value: '3', secondValue: '10' } } } }, [{ id: 'qty', direction: 'asc' }], 'en')
  assert.deepEqual(filtered.map(row => row.qty), [3, 4, 10])
})

test('date filters compare dates and support inclusive Between', () => {
  const filtered = applyGridFiltersAndSort(rows, columns, { date: { custom: { logic: 'and', first: { operator: 'between', value: '2025-03-10', secondValue: '2025-03-20' } } } }, undefined, 'en')
  assert.deepEqual(filtered.map(row => row.date), ['2025-03-10', '2025-03-20', '2025-03-20', '2025-03-20'])
})

test('two conditions combine with AND or OR and separate columns combine with AND', () => {
  const and = { logic: 'and', first: { operator: 'greaterThan', value: '2' }, second: { operator: 'lessThan', value: '10' } }
  const or = { ...and, logic: 'or' }
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, { qty: { custom: and } }, undefined, 'en').map(row => row.qty), [3, 4])
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, { qty: { custom: or }, kind: { selectedValues: ['string:A'] } }, undefined, 'en').map(row => row.qty), [10, 2])
})

test('cell color filtering and sorting group real fills before no-fill without changing data', () => {
  const before = JSON.stringify(rows)
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, { name: { colors: ['#ff0000'] } }, undefined, 'en').map(row => row.name), ['Alpha', 'Delta'])
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, { name: { selectedValues: ['string:Alpha', 'string:Delta'], colors: ['#ff0000', '#0000ff'], custom: { logic: 'and', first: { operator: 'contains', value: 'a' } } } }, undefined, 'en').map(row => row.name), ['Alpha', 'Delta'])
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, { name: { colors: ['#ff0000', '#0000ff'] } }, undefined, 'en').map(row => row.name), ['Alpha', 'Beta', 'Delta'])
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, {}, [{ id: 'name', direction: 'asc', byColor: true }], 'en').map(row => row.name), ['Beta', 'Alpha', 'Delta', 'Epsilon', 'Gamma'])
  assert.deepEqual(applyGridFiltersAndSort(rows, columns, { name: { colors: [NO_FILL] } }, undefined, 'en').map(row => row.name), ['Gamma', 'Epsilon'])
  assert.equal(JSON.stringify(rows), before)
})

test('multi-column sorting keeps the first sort as primary and applies later sorts within ties', () => {
  const sorted = applyGridFiltersAndSort(rows, columns, {}, [{ id: 'kind', direction: 'asc' }, { id: 'qty', direction: 'desc' }], 'en')
  assert.deepEqual(sorted.map(row => `${row.kind}:${row.qty}`), ['A:10', 'A:2', 'B:20', 'B:4', 'B:3'])
})

test('Excel number rules support Top 10 counts and averages', () => {
  const top = applyGridFiltersAndSort(rows, columns, { qty: { valueRule: { kind: 'top', count: 2 } } }, undefined, 'en')
  const bottom = applyGridFiltersAndSort(rows, columns, { qty: { valueRule: { kind: 'bottom', count: 2 } } }, undefined, 'en')
  const above = applyGridFiltersAndSort(rows, columns, { qty: { valueRule: { kind: 'aboveAverage' } } }, undefined, 'en')
  const below = applyGridFiltersAndSort(rows, columns, { qty: { valueRule: { kind: 'belowAverage' } } }, undefined, 'en')
  assert.deepEqual(top.map(row => row.qty), [10, 20])
  assert.deepEqual(bottom.map(row => row.qty), [2, 3])
  assert.deepEqual(above.map(row => row.qty), [10, 20])
  assert.deepEqual(below.map(row => row.qty), [2, 3, 4])
})
