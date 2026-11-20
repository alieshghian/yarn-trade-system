import { useEffect, useState } from 'react'
import { apiRequest } from './api'

export type LookupPage<T> = { items: T[], total: number }
export const lookupPageSize = 50

type Props<T> = {
  first: LookupPage<T>, endpoint: string, value: string, label: (record: T) => string,
  onChange: (record?: T) => void, selectedLabel?: string, detailUrl?: string,
  disabled: boolean, fa: boolean, field?: string
}

// Keep the native order-form control. Page commands never write to the draft.
export function PurchaseOrderLookup<T extends { id: string }>(props: Props<T>) {
  const { first, endpoint, value, label, selectedLabel, detailUrl, disabled, fa, field, onChange } = props
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState<{ first: LookupPage<T>, page: number, result: LookupPage<T> }>()
  const [chosen, setChosen] = useState<T>()
  const [resolved, setResolved] = useState<T>()
  const [pageError, setPageError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [retry, setRetry] = useState(0)
  const data = page === 1 ? first : loaded?.page === page && loaded.first === first ? loaded.result : undefined
  const inPage = data?.items.find(item => item.id === value)
  const known = inPage ?? (chosen?.id === value ? chosen : first.items.find(item => item.id === value))

  useEffect(() => {
    setPageError('')
    if (page === 1) return
    const controller = new AbortController()
    apiRequest<LookupPage<T>>(endpoint + '&page=' + page + '&pageSize=' + lookupPageSize, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setLoaded({ first, page, result }) })
      .catch(error => { if (!controller.signal.aborted) setPageError(String(error.message ?? error)) })
    return () => controller.abort()
  }, [first, endpoint, page, retry])

  useEffect(() => {
    setDetailError('')
    if (!detailUrl || known || !value) return
    const controller = new AbortController()
    apiRequest<T>(detailUrl, { signal: controller.signal })
      .then(item => { if (!controller.signal.aborted) setResolved(item) })
      .catch(error => { if (!controller.signal.aborted) setDetailError(String(error.message ?? error)) })
    return () => controller.abort()
  }, [value, detailUrl, known, retry])

  const selected = known ?? (resolved?.id === value ? resolved : undefined)
  return <>
    <select data-field={field} disabled={disabled} value={value} onChange={event => {
      const id = event.target.value
      if (id === ':next') setPage(page + 1)
      else if (id === ':previous') setPage(page - 1)
      else if (id === ':retry') setRetry(n => n + 1)
      else {
        const record = data?.items.find(item => item.id === id)
        if (id && !record) return
        setChosen(record)
        onChange(record)
      }
    }}>
      <option value="">—</option>
      {value && !inPage && <option value={value}>{selected ? label(selected) : selectedLabel || value}</option>}
      {page > 1 && <option value=":previous">{fa ? 'صفحهٔ قبل' : 'Previous page'}</option>}
      {data?.items.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}
      {data && page * lookupPageSize < data.total && <option value=":next">{fa ? 'صفحهٔ بعد' : 'Next page'}</option>}
      {!data && !pageError && <option disabled>{fa ? 'در حال بارگذاری…' : 'Loading…'}</option>}
      {(pageError || detailError) && <option value=":retry">{fa ? 'تلاش دوباره' : 'Retry'}</option>}
    </select>
    {(pageError || detailError) && <small role="alert">{pageError || detailError}</small>}
  </>
}
