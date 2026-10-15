import { functionKeyFromEvent } from './components/base-form/functionKeys'

// The visible save button owns validity/permissions; the keyboard invokes the same action.
export function installFormInteraction(root: Document = document) {
  let pointerFocus: HTMLInputElement | HTMLTextAreaElement | undefined
  let selectedField: HTMLInputElement | HTMLTextAreaElement | undefined
  let f3KeydownSeen = false
  const textField = (value: EventTarget | null): value is HTMLInputElement | HTMLTextAreaElement =>
    value instanceof HTMLTextAreaElement || value instanceof HTMLInputElement && ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(value.type)
  const selectValue = (value: EventTarget | null) => {
    if (textField(value) && !value.disabled && !value.readOnly && value.value) { value.select(); selectedField = value }
  }
  const focus = (event: FocusEvent) => selectValue(event.target)
  const pointerdown = (event: PointerEvent) => {
    // A second click within the focused field expresses caret intent.
    if (root.activeElement === event.target) selectedField = undefined
    pointerFocus = textField(event.target) && root.activeElement !== event.target ? event.target : undefined
  }
  const pointerup = () => { if (pointerFocus && root.activeElement === pointerFocus) selectValue(pointerFocus); pointerFocus = undefined }
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || functionKeyFromEvent(event) === 'F3') return
    const target = event.target
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      const formGrid = target.closest<HTMLElement>('.person-form-grid')
      const entryActive = Boolean(formGrid && (formGrid.classList.contains('editing') || formGrid.closest('[data-entry-active="true"]')))
      if (event.key === 'Tab' && entryActive && formGrid) {
        const tabbable = Array.from(formGrid.querySelectorAll<HTMLElement>('input,select,textarea,button,[tabindex]:not([tabindex="-1"])')).filter(control =>
          !control.matches(':disabled') && control.tabIndex >= 0 && control.getClientRects().length > 0 && !control.closest('[aria-hidden="true"],details:not([open])'))
        const index = tabbable.indexOf(target)
        if (index >= 0 && (event.shiftKey ? index === 0 : index === tabbable.length - 1)) {
          // Keep keyboard focus in the active form until its Save action runs.
          event.preventDefault(); event.stopImmediatePropagation(); return
        }
      }
      const numberWrap = target.closest('.person-number-wrap')
      const titleWrap = target.closest('.person-title-wrap')
      const plusShortcut = event.key === '+' || event.key === 'Add' || event.code === 'NumpadAdd' || event.keyCode === 107 || event.which === 107
      if (numberWrap && !target.closest('.person-number-list') && plusShortcut) {
        const addButton = numberWrap.querySelector<HTMLButtonElement>(':scope > .number-add-button')
        if (addButton && !addButton.disabled) {
          event.preventDefault(); event.stopImmediatePropagation(); addButton.click(); return
        }
      }
      if (titleWrap && !target.closest('.person-title-entry') && plusShortcut) {
        const addButton = titleWrap.querySelector<HTMLButtonElement>(':scope > .title-add-button')
        if (addButton && !addButton.disabled) {
          event.preventDefault(); event.stopImmediatePropagation(); addButton.click(); return
        }
      }
      const pane = target.closest('.form-tab-pane.active')
      const numberDisplay = Boolean(target.closest('.person-number-control')) && 'readOnly' in target && target.readOnly
      // Segmented dates and calendar popovers own their internal keyboard behaviour.
      if (pane && !target.closest('.system-date-input,.system-calendar') &&
        (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) &&
        !target.disabled && (!('readOnly' in target && target.readOnly) || numberDisplay)) {
        const rtl = getComputedStyle(formGrid ?? pane).direction === 'rtl'
        // In RTL forms, Left follows DOM order and Right goes back; in LTR
        // forms the direction is reversed. Keep both directions available.
        const backward = rtl ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'
        const forward = rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
        const atEdge = textField(target) && (target === selectedField || (event.key === 'ArrowLeft' ? target.selectionStart === 0 && target.selectionEnd === 0 : target.selectionStart === target.value.length && target.selectionEnd === target.value.length))
        const enter = event.key === 'Enter' && (!(target instanceof HTMLTextAreaElement) || numberDisplay) && !['checkbox','radio','button','submit'].includes((target as HTMLInputElement).type)
        const arrowNavigation = !event.shiftKey && (atEdge || target instanceof HTMLSelectElement || numberDisplay) && (backward || forward)
        if (enter || arrowNavigation) {
          event.preventDefault(); event.stopImmediatePropagation()
          if ((enter || !backward) && !target.checkValidity()) { target.reportValidity(); return }
          const controls = Array.from((formGrid ?? pane).querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).filter(control =>
            !control.disabled && (!('readOnly' in control && control.readOnly) || Boolean(control.closest('.person-number-control'))) && control.type !== 'hidden' && control.getClientRects().length > 0 && !control.closest('.system-calendar,details:not([open])'))
          // Existing CSS grids follow DOM order from inline-start (RTL or LTR).
          // Label wrapping must not reorder controls within the same visual row.
          const index = controls.indexOf(target)
          controls[index + (!enter && backward ? -1 : 1)]?.focus()
          return
        }
      }
      if (event.key.length === 1 || ['Backspace','Delete','Home','End','ArrowLeft','ArrowRight'].includes(event.key)) selectedField = undefined
    }
  }
  const invokeSave = (event: KeyboardEvent) => {
    if (functionKeyFromEvent(event) !== 'F3' || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    const activeNumberControl = typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement
      ? event.target.closest('.person-number-wrap') : null
    const numberSave = activeNumberControl?.querySelector<HTMLButtonElement>('.person-number-list .number-confirm')
    if (numberSave && !numberSave.disabled) { numberSave.click(); return }
    const pane = root.querySelector('.form-tab-pane.active')
    const scope = typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement ? event.target.closest('[data-form-scope]') : null
    const saveRoot = scope && pane?.contains(scope) ? scope : pane
    const save = Array.from(saveRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(button =>
      !button.disabled && button.getClientRects().length > 0 &&
      !button.closest?.('details:not([open])') && (!button.closest?.('[data-form-scope]') || button.closest('[data-form-scope]') === saveRoot) &&
      (button.dataset.saveAction === 'true' || /\bF3\b/.test(button.textContent ?? '')))
    save?.click()
  }
  const saveKeydown = (event: KeyboardEvent) => {
    if (functionKeyFromEvent(event) !== 'F3') return
    f3KeydownSeen = true
    invokeSave(event)
  }
  const saveKeyup = (event: KeyboardEvent) => {
    if (functionKeyFromEvent(event) !== 'F3') return
    if (f3KeydownSeen) { f3KeydownSeen = false; return }
    // Some keyboard drivers expose only the release event for function keys.
    invokeSave(event)
  }
  root.addEventListener('keydown', saveKeydown, true)
  root.addEventListener('keyup', saveKeyup, true)
  // Run navigation after existing React field validation; rejected edits keep focus.
  root.addEventListener('keydown', keydown)
  root.addEventListener('focusin', focus)
  root.addEventListener('pointerdown', pointerdown, true)
  root.addEventListener('pointerup', pointerup, true)
  return () => {
    root.removeEventListener('keydown', saveKeydown, true)
    root.removeEventListener('keyup', saveKeyup, true)
    root.removeEventListener('keydown', keydown)
    root.removeEventListener('focusin', focus)
    root.removeEventListener('pointerdown', pointerdown, true)
    root.removeEventListener('pointerup', pointerup, true)
  }
}
