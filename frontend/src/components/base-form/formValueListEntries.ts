export type FormValueEntry = { id: number, code: string, text: string }

type EntryResolution =
  | { items: string[], defaultValue: string, error?: never }
  | { error: { entryId: number, field: 'code' | 'text' }, items?: never, defaultValue?: never }

/** Resolve the entire pending batch before the caller saves any list/default changes. */
export function resolveFormValueEntries(items: string[], defaultValue: string, entries: FormValueEntry[], defaultEntryId: number | null, multiline: boolean): EntryResolution {
  const values = [...items]
  let selected = defaultValue
  if (defaultEntryId !== null && !entries.some(row => row.id === defaultEntryId)) {
    return { error: { entryId: defaultEntryId, field: 'text' } }
  }
  for (const row of entries) {
    if (!row.text.trim()) {
      if (row.id === defaultEntryId) return { error: { entryId: row.id, field: 'text' } }
      continue
    }
    const prefix = row.code.trim().replace(/\s/g, '')
    const digits = row.text.replace(/\D/g, '').replace(/^0+/, '')
    if (!multiline && !/^\+\d{1,3}$/.test(prefix)) return { error: { entryId: row.id, field: 'code' } }
    if (!multiline && !digits) return { error: { entryId: row.id, field: 'text' } }
    const value = multiline ? row.text.trim() : `${prefix}${digits}`
    if (values.includes(value)) return { error: { entryId: row.id, field: 'text' } }
    values.push(value)
    selected = row.id === defaultEntryId ? value : selected || value
  }
  return { items: values, defaultValue: selected }
}
