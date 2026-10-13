type LaboratoryKeyboardEvent = Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'which' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'preventDefault' | 'stopImmediatePropagation'>

export function handleLaboratorySearchKey(
  event: LaboratoryKeyboardEvent,
  isEnteringInEditor: boolean,
  focusSearch: () => void
): boolean {
  // Browsers and keyboard layouts don't all populate the same legacy/modern fields.
  const isF1 = event.key === 'F1' || event.key === 'Help' || event.key === 'BrowserHelp'
    || event.code === 'F1' || event.code === 'Help' || event.keyCode === 112 || event.which === 112
  if (!isF1) return false

  event.preventDefault()
  event.stopImmediatePropagation()
  if (!isEnteringInEditor) focusSearch()
  return true
}
