import test from 'node:test'
import assert from 'node:assert/strict'
import { purchaseInvoiceCurrency } from './purchaseInvoiceCurrency.ts'

test('uses the rounded invoice rate for the approved example', () => {
  assert.deepEqual(purchaseInvoiceCurrency(6.67, 110000), { agreedPercent: 11.4, effectiveRate: 7.43, totalUsd: 14804.85 })
  assert.equal(purchaseInvoiceCurrency(0, 100), null)
  assert.equal(purchaseInvoiceCurrency(6.67, -1), null)
})
