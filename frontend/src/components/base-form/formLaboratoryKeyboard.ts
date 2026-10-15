import { functionKeyFromEvent } from './functionKeys'

type LaboratoryKeyboardEvent = Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'which' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'preventDefault' | 'stopImmediatePropagation'>

export function handleLaboratorySearchKey(
  event: LaboratoryKeyboardEvent,
  isEnteringInEditor: boolean,
  focusSearch: () => void
): boolean {
  // Browsers and keyboard layouts don't all populate the same legacy/modern fields.
  const isF1 = functionKeyFromEvent(event) === 'F1'
  if (!isF1) return false

  event.preventDefault()
  event.stopImmediatePropagation()
  if (!isEnteringInEditor) focusSearch()
  return true
}
