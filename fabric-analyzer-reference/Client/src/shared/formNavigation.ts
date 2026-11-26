export const entryControls = 'input:not(:disabled):not([readonly]):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),button[type=submit]:not(:disabled)'

export function focusAdjacentField(current: HTMLElement, offset = 1) {
  const scope = current.closest('form')
  if (!scope) return false
  const fields = Array.from(scope.querySelectorAll<HTMLElement>(entryControls)).filter(field => field.getClientRects().length > 0)
  const date = current.closest('.system-date-input')
  const i = date ? (offset > 0 ? fields.map(field => date.contains(field)).lastIndexOf(true) :
    fields.findIndex(field => date.contains(field))) : fields.indexOf(current)
  const next = fields[i + offset]
  next?.focus()
  return Boolean(next)
}
