import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFormValueEntries } from './formValueListEntries.ts'

test('first text batch saves the chosen second row as default without changing item order', () => {
  const rows = [{ id: 1, code: '', text: ' آقا ' }, { id: 2, code: '', text: 'شرکت' }]
  assert.deepEqual(resolveFormValueEntries([], '', rows, 2, true), { items: ['آقا', 'شرکت'], defaultValue: 'شرکت' })
  assert.equal(rows[0].text, ' آقا ')
})

test('phone batch normalizes codes, grouped digits and local zero while selecting a fresh row', () => {
  const rows = [{ id: 1, code: '+98', text: '0912 345 6789' }, { id: 2, code: '+86', text: '138 1234 5678' }]
  assert.deepEqual(resolveFormValueEntries([], '', rows, 2, false), {
    items: ['+989123456789', '+8613812345678'], defaultValue: '+8613812345678'
  })
})

test('adding addresses preserves the existing saved default until another is explicitly chosen', () => {
  const saved = ['نشانی اول', 'نشانی دوم']
  const result = resolveFormValueEntries(saved, 'نشانی دوم', [{ id: 3, code: '', text: 'نشانی سوم' }], null, true)
  assert.deepEqual(result, { items: [...saved, 'نشانی سوم'], defaultValue: 'نشانی دوم' })
  assert.deepEqual(saved, ['نشانی اول', 'نشانی دوم'])
})

test('default selection follows the stable row ID when its contents are changed', () => {
  assert.equal(resolveFormValueEntries([], '', [{ id: 7, code: '', text: 'عنوان اصلاح‌شده' }], 7, true).defaultValue, 'عنوان اصلاح‌شده')
})

test('blank selected defaults and missing selected rows prevent the entire commit', () => {
  assert.deepEqual(resolveFormValueEntries([], '', [{ id: 1, code: '', text: '' }, { id: 2, code: '', text: 'شرکت' }], 1, true), { error: { entryId: 1, field: 'text' } })
  assert.deepEqual(resolveFormValueEntries([], '', [], 3, true), { error: { entryId: 3, field: 'text' } })
})

test('blank unselected rows are ignored and duplicate normalized phone entries are rejected', () => {
  assert.deepEqual(resolveFormValueEntries([], '', [{ id: 1, code: '', text: '' }, { id: 2, code: '', text: 'شرکت' }], 2, true), { items: ['شرکت'], defaultValue: 'شرکت' })
  assert.deepEqual(resolveFormValueEntries(['+989123456789'], '+989123456789', [{ id: 2, code: '+98', text: '0912 345 6789' }], 2, false), { error: { entryId: 2, field: 'text' } })
})

test('invalid country codes or empty numeric values identify the input requiring correction', () => {
  assert.deepEqual(resolveFormValueEntries([], '', [{ id: 1, code: '98', text: '9123456789' }], 1, false), { error: { entryId: 1, field: 'code' } })
  assert.deepEqual(resolveFormValueEntries([], '', [{ id: 1, code: '+98', text: '000' }], 1, false), { error: { entryId: 1, field: 'text' } })
})
