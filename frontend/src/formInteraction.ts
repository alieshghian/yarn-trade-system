// The visible save button owns validity/permissions; the keyboard invokes the same action.
export function installFormInteraction(root: Document = document) {
  let pointerFocus: HTMLInputElement | HTMLTextAreaElement | undefined
  let selectedField: HTMLInputElement | HTMLTextAreaElement | undefined
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
    if (event.defaultPrevented || event.key === 'F3') return
    const target = event.target
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      const pane = target.closest('.form-tab-pane.active')
      // Segmented dates and calendar popovers own their internal keyboard behaviour.
      if (pane && !target.closest('.system-date-input,.system-calendar') &&
        (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) &&
        !target.disabled && !('readOnly' in target && target.readOnly)) {
        const rtl = getComputedStyle(pane).direction === 'rtl'
        const backward = event.key === 'ArrowRight' || !rtl && event.key === 'ArrowLeft'
        const forward = rtl && event.key === 'ArrowLeft'
        const atEdge = textField(target) && (target === selectedField || (event.key === 'ArrowLeft' ? target.selectionStart === 0 && target.selectionEnd === 0 : target.selectionStart === target.value.length && target.selectionEnd === target.value.length))
        const enter = event.key === 'Enter' && !(target instanceof HTMLTextAreaElement) && !['checkbox','radio','button','submit'].includes((target as HTMLInputElement).type)
        const arrowNavigation = !event.shiftKey && (atEdge || target instanceof HTMLSelectElement) && (backward || forward)
        if (enter || arrowNavigation) {
          event.preventDefault(); event.stopImmediatePropagation()
          if ((enter || !backward) && !target.checkValidity()) { target.reportValidity(); return }
          const controls = Array.from(pane.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).filter(control =>
            !control.disabled && !('readOnly' in control && control.readOnly) && control.type !== 'hidden' && control.getClientRects().length > 0 && !control.closest('.system-calendar,details:not([open])'))
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
  const saveKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'F3' || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    const pane = root.querySelector('.form-tab-pane.active')
    const scope = typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement ? event.target.closest('[data-form-scope]') : null
    const saveRoot = scope && pane?.contains(scope) ? scope : pane
    const save = Array.from(saveRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(button =>
      !button.disabled && button.getClientRects().length > 0 &&
      !button.closest?.('details:not([open])') && (!button.closest?.('[data-form-scope]') || button.closest('[data-form-scope]') === saveRoot) &&
      (button.dataset.saveAction === 'true' || /\bF3\b/.test(button.textContent ?? '')))
    save?.click()
  }
  root.addEventListener('keydown', saveKeydown, true)
  // Run navigation after existing React field validation; rejected edits keep focus.
  root.addEventListener('keydown', keydown)
  root.addEventListener('focusin', focus)
  root.addEventListener('pointerdown', pointerdown, true)
  root.addEventListener('pointerup', pointerup, true)
  return () => {
    root.removeEventListener('keydown', saveKeydown, true)
    root.removeEventListener('keydown', keydown)
    root.removeEventListener('focusin', focus)
    root.removeEventListener('pointerdown', pointerdown, true)
    root.removeEventListener('pointerup', pointerup, true)
  }
}
