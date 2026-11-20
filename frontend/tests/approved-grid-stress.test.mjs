import assert from 'node:assert/strict'
import test from 'node:test'
import { applyGridFiltersAndSort, gridRowMatchesSearch } from '../src/components/base-form/excelGrid.ts'

const columns = [
  {id: 'name', type: 'text', value: row => row.name},
  {id: 'group', type: 'number', value: row => row.group},
]
for (const size of [100, 1000, 10000, 50000]) {
  test(`approved grid filters and stable Persian ordering across ${size} synthetic records`, () => {
    const rows = Array.from({length: size}, (_, id) => ({
      id, group: id % 3, name: ['نخ', 'نخ ۲', 'نخ 2', 'YARN', 'yarn', null, 'نخ ' + 'بلند'.repeat(60)][(id * 31) % 7],
    }))
    const start = performance.now()
    const result = applyGridFiltersAndSort(rows, columns, {group: {selectedValues: ['number:1']}}, [{id:'name',direction:'asc'}], 'fa')
    const filterSortMs = performance.now() - start
    const collator = new Intl.Collator('fa', {sensitivity:'base', numeric:false})
    const expected = rows.filter(row => row.group === 1).sort((a,b) => collator.compare(a.name ?? '', b.name ?? ''))
    assert.deepEqual(result.map(row => row.id), expected.map(row => row.id))
    const searchStart = performance.now()
    const matches = rows.filter(row => gridRowMatchesSearch(row, columns, 'نخ ۲', 'exact'))
    const searchMs = performance.now() - searchStart
    assert.deepEqual(matches.map(row => row.id), rows.filter(row => ['نخ ۲','نخ 2'].includes(row.name)).map(row => row.id))
    console.log(JSON.stringify({size, filterSortMs, searchMs, heapUsed:process.memoryUsage().heapUsed}))
  })
}
