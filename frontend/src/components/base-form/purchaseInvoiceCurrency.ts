/** Design-time invoice preview; rates are CNY per USD. */
export function purchaseInvoiceCurrency(referenceRate: number, totalCny: number, vatPercent = 13) {
  if (![referenceRate, totalCny, vatPercent].every(Number.isFinite) || referenceRate <= 0 || totalCny < 0 || vatPercent < 0) return null
  const agreedPercent = Math.round((vatPercent / (100 + vatPercent) * 100 - 0.10442477876106) * 10) / 10
  const effectiveRate = Math.round((referenceRate * (1 + agreedPercent / 100) + Number.EPSILON) * 100) / 100
  if (effectiveRate <= 0) return null
  const totalUsd = Math.round((totalCny / effectiveRate + Number.EPSILON) * 100) / 100
  return { agreedPercent, effectiveRate, totalUsd }
}
