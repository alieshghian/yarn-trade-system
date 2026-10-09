import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const persian = moduleUrl(readFileSync(new URL('./persianDate.ts', import.meta.url), 'utf8'))
const date = await import(moduleUrl(readFileSync(new URL('./dateCalendar.ts', import.meta.url), 'utf8').replace("'./persianDate'", JSON.stringify(persian))))

test('smart day waits only when a valid next digit can follow', () => {
  for (const raw of ['0','1','2','3','00','32','99']) assert.equal(date.decisiveDateSegment(raw, 'day', 31), false, raw)
  for (const raw of ['4','9','01','11','30','31']) assert.equal(date.decisiveDateSegment(raw, 'day', 31), true, raw)
  assert.equal(date.decisiveDateSegment('31','day',30),false)
})
test('smart month distinguishes ambiguous and decisive input', () => {
  for (const raw of ['0','1','00','13','99']) assert.equal(date.decisiveDateSegment(raw,'month',12),false,raw)
  for (const raw of ['2','7','9','01','07','10','11','12']) assert.equal(date.decisiveDateSegment(raw,'month',12),true,raw)
})
test('short years resolve deterministically; one and three digits remain incomplete', () => {
  for (const [raw, year] of [['00',1400],['01',1401],['05',1405],['95',1395],['99',1399],['1405',1405]]) assert.equal(date.resolvedEntryYear(raw,'persian'),year)
  for (const raw of ['0','5','140','999','0000','1800']) assert.equal(date.resolvedEntryYear(raw,'persian'),null)
  for (const [raw,year] of [['00',2000],['26',2026],['95',1995],['2026',2026]]) assert.equal(date.resolvedEntryYear(raw,'gregorian'),year)
})
test('Jalali month lengths and real leap Esfand validate without correction', () => {
  assert.ok(date.calendarPartsToIso({year:1405,month:6,day:31},'persian'))
  for (const month of [7,11]) assert.equal(date.calendarPartsToIso({year:1405,month,day:31},'persian'),null)
  assert.ok(date.calendarPartsToIso({year:1399,month:12,day:30},'persian'))
  assert.equal(date.calendarPartsToIso({year:1400,month:12,day:30},'persian'),null)
})
test('Gregorian month lengths, leap years and equivalents share one date without drift', () => {
  assert.equal(date.calendarPartsToIso({year:2026,month:4,day:31},'gregorian'),null)
  assert.equal(date.calendarPartsToIso({year:2026,month:2,day:29},'gregorian'),null)
  assert.equal(date.calendarPartsToIso({year:2024,month:2,day:29},'gregorian'),'2024-02-29')
  for (const iso of ['2024-02-29','2026-09-23','2026-10-07']) {
    assert.equal(date.calendarPartsToIso(date.isoToCalendarParts(iso,'persian'),'persian'),iso)
    for (const lang of ['en','zh']) assert.ok(date.fullDateLabel(iso,'gregorian',lang))
  }
})
