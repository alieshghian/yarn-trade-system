import { functionKeyFromEvent } from './components/base-form/functionKeys'
import {currentFormPolicy} from './components/base-form/formBehavior'
import { orderedFocusItems, type FocusItem } from './components/base-form/fieldFocusOrder'
import { installFieldTypingLanguage } from './components/base-form/fieldTypingLanguage'
import {allowsFieldArrow} from './components/base-form/fieldArrowNavigation'

type EntryControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/** Only the visible active form, or the form in the top modal, owns shortcuts. */
export function ownsFormShortcut(frame: HTMLElement | null, event: KeyboardEvent) {
  if (!frame || event.defaultPrevented || frame.closest('[aria-hidden="true"],.form-tab-pane:not(.active)')) return false
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter(dialog => dialog.getClientRects().length)
  const modal = dialogs.at(-1)
  return modal ? modal.contains(frame) : !frame.closest('[role="dialog"][aria-modal="true"]')
}

/** Resolve focus from rendered input rectangles; never move or rewrite the layout. */
export function orderedEntryControls(root: HTMLElement, includeSkipped = false): FocusItem<EntryControl>[] {
  const controls = Array.from(root.querySelectorAll<EntryControl>('input,select,textarea')).filter(control =>
    !control.disabled && (includeSkipped || !control.closest('[data-enter-enabled="false"]')) && (!('readOnly' in control && control.readOnly) || Boolean(control.closest('.person-number-control'))) && control.type !== 'hidden' &&
    control.getClientRects().length > 0 && !control.closest('.system-calendar,.person-number-list,details:not([open]),[aria-hidden="true"]'))
  const seen = new Set<string>()
  const items = controls.flatMap(control => {
    const field = control.closest<HTMLElement>('[data-field-id]')
    const id = field?.dataset.fieldId || control.dataset.field
    if (id && seen.has(id)) return []
    if (id) seen.add(id)
    const bounds = control.getBoundingClientRect(), rawOrder = control.closest<HTMLElement>('[data-focus-order]')?.dataset.focusOrder
    return [{ value: control, rect: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }, order: rawOrder === undefined ? undefined : Number(rawOrder) }]
  })
  return orderedFocusItems(items, getComputedStyle(root).direction === 'rtl')
}

// The visible save button owns validity/permissions; the keyboard invokes the same action.
export function installFormInteraction(root: Document = document) {
  const removeTypingLanguage = installFieldTypingLanguage(root)
  let pointerFocus: HTMLInputElement | HTMLTextAreaElement | undefined
  let f3KeydownSeen = false
  const textField = (value: EventTarget | null): value is HTMLInputElement | HTMLTextAreaElement =>
    value instanceof HTMLTextAreaElement || value instanceof HTMLInputElement && ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(value.type)
  const selectValue = (value: EventTarget | null) => {
    if (textField(value) && !value.disabled && !value.readOnly && value.value) { value.select() }
  }
  // Suggestions can arrive after an empty code input already received focus.
  // Observe only that untouched input, never reselect text the user has edited.
  const suggestionObserver = new MutationObserver(() => {
    const input = root.activeElement
    if (textField(input) && input.value) { selectValue(input); suggestionObserver.disconnect() }
  })
  const stopSuggestionSelection = () => suggestionObserver.disconnect()
  const focus = (event: FocusEvent) => {
    suggestionObserver.disconnect()
    selectValue(event.target)
    const input = event.target
    if (textField(input) && !input.value && !input.disabled && !input.readOnly && /code/i.test(input.dataset.field ?? input.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId ?? '')) {
      suggestionObserver.observe(input, {attributes:true,attributeFilter:['value']})
    }
  }
  // Native Shift-click selection happens on mousedown, before the row click handler.
  // Cancel only that browser default; keep custom row/field selection and editable text intact.
  const preventNativeRangeSelection = (event: MouseEvent) => {
    if(event.button!==0||!(event.ctrlKey||event.metaKey||event.shiftKey))return
    const target=event.target instanceof Element?event.target:null
    if(!target||target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return
    if(!target.closest('.base-grid-boundary,.persons-page,.form-laboratory-page,[data-form-scope],.laboratory-form-grid'))return
    event.preventDefault()
    root.getSelection()?.removeAllRanges()
  }
  const pointerdown = (event: PointerEvent) => {
    // A second click within the focused field expresses caret intent.
    pointerFocus = textField(event.target) && root.activeElement !== event.target ? event.target : undefined
  }
  const pointerup = () => { if (pointerFocus && root.activeElement === pointerFocus) selectValue(pointerFocus); pointerFocus = undefined }
  const keydown = (event: KeyboardEvent) => {
    // Runs after React's permitted designer/grid selection handlers, but before
    // the browser default. Physical KeyA also works with a Persian keyboard.
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&(event.code==='KeyA'||event.key.toLowerCase()==='a')){
      const target=event.target instanceof Element?event.target:null
      const editor=target?.closest<HTMLInputElement|HTMLTextAreaElement>('input,textarea')
      const typing=editor&&textField(editor)&&!editor.disabled&&!editor.readOnly
      const richEditor=target instanceof HTMLElement&&target.isContentEditable
      if(!typing&&!richEditor){event.preventDefault();root.getSelection()?.removeAllRanges()}
      return
    }
    if (event.defaultPrevented || functionKeyFromEvent(event) === 'F3') return
    const target = event.target
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      const formGrid = target.closest<HTMLElement>('.person-form-grid,[data-entry-grid]')
      const behaviorOwner=target.closest<HTMLElement>('[data-form-behavior-id]')
      let behavior=currentFormPolicy(behaviorOwner?.dataset.formBehaviorId)
      if(behaviorOwner?.dataset.formPolicy){try{const preview=JSON.parse(behaviorOwner.dataset.formPolicy);behavior={...behavior,...Object.fromEntries(Object.entries(preview).filter(([key,value])=>key in behavior&&typeof value==='boolean'))}}catch{/* Invalid preview cannot replace the shared policy. */}}
      const entryActive = Boolean(formGrid && (formGrid.classList.contains('editing') || formGrid.closest('[data-entry-active="true"]')))
      if (event.key === 'Tab' && entryActive && formGrid && behavior.trapTab) {
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
      const navigationRoot=formGrid??pane
      const numberDisplay = Boolean(target.closest('.person-number-control')) && 'readOnly' in target && target.readOnly
      if(event.key==='Enter'&&target instanceof HTMLSelectElement&&!target.disabled){
        const choices=[...target.options].filter(option=>!option.disabled&&option.value!=='')
        if(choices.length>1){
          if(typeof target.showPicker==='function'){try{target.showPicker();event.preventDefault();event.stopImmediatePropagation()}catch{/* Native Enter remains available when the picker cannot be opened programmatically. */}}
          return
        }
        if(choices.length===1&&!target.value){target.value=choices[0].value;target.dispatchEvent(new Event('change',{bubbles:true}))}
      }
      if (entryActive && formGrid && !target.closest('.system-date-input,.system-calendar') &&
        (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) &&
        !target.disabled && (!('readOnly' in target && target.readOnly) || numberDisplay)) {
        const enterTarget = target.closest<HTMLElement>('[data-enter-target]')?.dataset.enterTarget
        const enter = behavior.enterNavigation && enterTarget !== 'native' && event.key === 'Enter' &&
          (!(target instanceof HTMLTextAreaElement) || numberDisplay) && !['radio', 'button', 'submit', 'file'].includes((target as HTMLInputElement).type)
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        const arrow = horizontal && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey &&
          !(target instanceof HTMLInputElement && ['radio', 'file'].includes(target.type)) && allowsFieldArrow(target,event.key)
        if (enter || arrow) {
          const items = orderedEntryControls(formGrid, true)
          const fieldId = target.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId || target.dataset.field
          const index = items.findIndex(item => item.value === target || Boolean(fieldId && (item.value.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId || item.value.dataset.field) === fieldId))
          const nextEnter = items.slice(index+1).find(item=>!item.value.closest('[data-enter-enabled="false"]'))
          const backward = getComputedStyle(formGrid).direction==='rtl' ? event.key==='ArrowRight' : event.key==='ArrowLeft'
          const nextArrow = backward ? items.slice(0,index).reverse().find(item=>!item.value.closest('[data-enter-enabled="false"]')) : nextEnter
          const next = enter && enterTarget ? items.find(item => !item.value.closest('[data-enter-enabled="false"]') && (item.value.dataset.field === enterTarget || item.value.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId === enterTarget)) ?? nextEnter
            : enter ? nextEnter : nextArrow
          if (enter || arrow) {
            event.preventDefault(); event.stopImmediatePropagation()
            if ((enter || Boolean(next && items.indexOf(next) > index)) && !target.checkValidity()) { target.reportValidity(); return }
            next?.value.focus()
            return
          }
        }
        return
      }
      // Segmented dates and calendar popovers own their internal keyboard behaviour.
      if (navigationRoot && !target.closest('.system-date-input,.system-calendar') &&
        (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) &&
        !target.disabled && (!('readOnly' in target && target.readOnly) || numberDisplay)) {
        const rtl = getComputedStyle(navigationRoot).direction === 'rtl'
        // In RTL forms, Left follows DOM order and Right goes back; in LTR
        // forms the direction is reversed. Keep both directions available.
        const backward = rtl ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'
        const forward = rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
        const enterTarget=target.closest<HTMLElement>('[data-enter-target]')?.dataset.enterTarget
        const enter = behavior.enterNavigation && enterTarget!=='native' && event.key === 'Enter' && (!(target instanceof HTMLTextAreaElement) || numberDisplay) && !['checkbox','radio','button','submit'].includes((target as HTMLInputElement).type)
        const arrowNavigation = !event.shiftKey && (backward || forward) && allowsFieldArrow(target,event.key)
        if (enter || arrowNavigation) {
          event.preventDefault(); event.stopImmediatePropagation()
          if ((enter || !backward) && !target.checkValidity()) { target.reportValidity(); return }
          const controls = Array.from(navigationRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).filter(control =>
            !control.disabled && (!('readOnly' in control && control.readOnly) || Boolean(control.closest('.person-number-control'))) && control.type !== 'hidden' && control.getClientRects().length > 0 && !control.closest('.system-calendar,details:not([open])'))
          // Existing CSS grids follow DOM order from inline-start (RTL or LTR).
          // Label wrapping must not reorder controls within the same visual row.
          const index = controls.indexOf(target)
          const next=enter&&enterTarget?controls.find(control=>control.dataset.field===enterTarget||control.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId===enterTarget):controls[index + (!enter && backward ? -1 : 1)]
          next?.focus()
          return
        }
      }
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
    const scope = typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement ? event.target.closest('[data-form-scope],[data-form-laboratory]') : null
    const modal = event.target instanceof Element ? event.target.closest('[role="dialog"][aria-modal="true"]') : null
    const saveRoot = modal ? scope && modal.contains(scope) ? scope : modal : scope && (!pane || pane.contains(scope)) ? scope : pane
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
  root.addEventListener('beforeinput', stopSuggestionSelection, true)
  root.addEventListener('input', stopSuggestionSelection, true)
  root.addEventListener('focusout', stopSuggestionSelection)
  root.addEventListener('mousedown', preventNativeRangeSelection, true)
  root.addEventListener('pointerdown', pointerdown, true)
  root.addEventListener('pointerup', pointerup, true)
  return () => {
    removeTypingLanguage()
    suggestionObserver.disconnect()
    root.removeEventListener('keydown', saveKeydown, true)
    root.removeEventListener('keyup', saveKeyup, true)
    root.removeEventListener('keydown', keydown)
    root.removeEventListener('focusin', focus)
    root.removeEventListener('beforeinput', stopSuggestionSelection, true)
    root.removeEventListener('input', stopSuggestionSelection, true)
    root.removeEventListener('focusout', stopSuggestionSelection)
    root.removeEventListener('mousedown', preventNativeRangeSelection, true)
    root.removeEventListener('pointerdown', pointerdown, true)
    root.removeEventListener('pointerup', pointerup, true)
  }
}
