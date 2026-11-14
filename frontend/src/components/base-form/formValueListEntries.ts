export type PairEntryAdapter={firstLabel:string;secondLabel:string;firstSuggestions?:readonly string[];initialEntries?:()=>{text:string;code:string;fixedName?:boolean}[];parse:(value:string)=>{text:string;code:string};serialize:(text:string,code:string)=>string}

export type FormValueEntry = { id: number, code: string, text: string, fixedName?:boolean }

type EntryResolution =
  | { items: string[], defaultValue: string, error?: never }
  | { error: { entryId: number, field: 'code' | 'text'; message?:string; reason?:'duplicate' }, items?: never, defaultValue?: never }

/** Resolve the entire pending batch before the caller saves any list/default changes. */
export function resolveFormValueEntries(items: string[], defaultValue: string, entries: FormValueEntry[], defaultEntryId: number | null, multiline: boolean, normalize: (value:string)=>string = value=>value, pairEntry?:PairEntryAdapter): EntryResolution {
  const values = [...items]
  let selected = defaultValue
  if (defaultEntryId !== null && !entries.some(row => row.id === defaultEntryId)) {
    return { error: { entryId: defaultEntryId, field: 'text' } }
  }
  for (const row of entries) {
    if (pairEntry && row.fixedName && !row.code.trim() && row.id!==defaultEntryId) continue
    if (!row.text.trim() && (!pairEntry || !row.code.trim())) {
      if (row.id === defaultEntryId) return { error: { entryId: row.id, field: 'text' } }
      continue
    }
    const prefix = row.code.trim().replace(/\s/g, '')
    const digits = row.text.replace(/\D/g, '').replace(/^0+/, '')
    if (!multiline && !/^\+\d{1,3}$/.test(prefix)) return { error: { entryId: row.id, field: 'code' } }
    if (!multiline && !digits) return { error: { entryId: row.id, field: 'text' } }
    let value:string
    if(pairEntry){try{value=pairEntry.serialize(row.text,row.code)}catch(error){return {error:{entryId:row.id,field:!row.text.trim()?'text':'code',message:(error as Error).message}}}}else value = multiline ? row.text.trim() : `${prefix}${digits}`
    if (values.some(existing=>normalize(existing)===normalize(value))) return { error: { entryId: row.id, field: 'text', reason:'duplicate' } }
    values.push(value)
    selected = row.id === defaultEntryId ? value : selected || value
  }
  return { items: values, defaultValue: selected }
}
