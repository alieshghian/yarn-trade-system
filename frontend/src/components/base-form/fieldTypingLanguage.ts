export type TypingLanguage = 'fa' | 'en'

const rows = [
  ['KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight', 'ضصثقفغعهخحجچ', 'ًٌٍَُِّْ][}{'],
  ['KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote', 'شسیبلاتنمکگ', 'ؤئيإأآة«»:؛'],
  ['KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash', 'ظطزرذدپو./', 'كٓژٰ‌ٔء<>؟'],
] as const
const persian = new Map<string, [string, string]>()
for (const [codes, normal, shifted] of rows) codes.split(' ').forEach((code, index) => persian.set(code, [normal[index], shifted[index]]))
const englishPunctuation: Record<string, [string, string]> = {
  Backquote: ['`', '~'], Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
}

/** Physical keys make the app mode independent of the Windows keyboard layout. */
export function typingCharacter(code: string, language: TypingLanguage, shift = false, caps = false): string | undefined {
  if (/^Numpad[0-9]$/.test(code)) return code.slice(-1)
  if (code === 'Space') return language === 'fa' && shift ? '\u200c' : ' '
  if (/^Digit[0-9]$/.test(code)) {
    const digit = Number(code.slice(-1))
    return shift ? (language === 'fa' ? ')!٬٫﷼٪×،*('[digit] : ')!@#$%^&*('[digit]) : String(digit)
  }
  if (language === 'fa') {
    // Persian keyboard's پ key shares the physical Backslash key; English keeps its own mapping.
    if (code === 'Backslash') return shift ? '|' : 'پ'
    if (code === 'Backquote') return '\u200d'
    if (code === 'Minus') return shift ? 'ـ' : '-'
    if (code === 'Equal') return shift ? '+' : '='
    return persian.get(code)?.[shift ? 1 : 0]
  }
  if (/^Key[A-Z]$/.test(code)) return shift !== caps ? code.slice(3) : code.slice(3).toLowerCase()
  return englishPunctuation[code]?.[shift ? 1 : 0]
}

type TextControl = HTMLInputElement | HTMLTextAreaElement
type Adornment = { button: HTMLButtonElement; padding: string; priority: string }

/** One disposable installer for operational forms and Laboratory previews. Never reparents React inputs. */
export function installFieldTypingLanguage(root: Document) {
  const view = root.defaultView
  if (!view || typeof MutationObserver === 'undefined' || !root.body) return () => {}
  const modes = new WeakMap<TextControl, TypingLanguage>()
  let defaultOverride:TypingLanguage|undefined
  const appMode=():TypingLanguage=>defaultOverride??(root.documentElement.lang.startsWith('fa')?'fa':'en')
  const adornments = new Map<TextControl, Adornment>()
  let armed: TextControl | undefined, armedAt = 0, frame = 0, disposed = false
  const eligible = (element: Element): element is TextControl => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false
    if (element.disabled || element.readOnly || element instanceof HTMLInputElement && !['text', 'search'].includes(element.type)) return false
    if (!element.closest('[data-form-scope],.form-laboratory-page,.person-form-grid,[data-entry-grid],[data-component-popup],.base-grid-boundary,[role="dialog"]')) return false
    const id = element.dataset.field || element.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId || element.name
    return element.dataset.codeInput !== 'true' && !/code|کد/i.test(id) && !['numeric', 'decimal', 'tel'].includes(element.inputMode) && !element.closest('[data-typing-design="true"],[data-typing-language="off"],[aria-hidden="true"],.form-tab-pane:not(.active)')
  }
  const currentMode = (input: TextControl): TypingLanguage => modes.get(input) ?? appMode()
  const toggle = (input: TextControl) => {
    modes.set(input, currentMode(input) === 'fa' ? 'en' : 'fa')
    update()
  }
  const update = () => {
    frame = 0
    if (disposed) return
    const dialogs = [...root.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter(item => item.getClientRects().length)
    const modal = dialogs.at(-1)
    const activePopup = [...root.querySelectorAll<HTMLElement>('[data-component-popup],.shared-excel-filter-menu,.excel-condition-editor,[data-typing-layer]')].filter(item => item.getClientRects().length).at(-1)
    for (const [input, item] of adornments) {
      // Remove our overlays from hit testing before checking the actual UI layer.
      item.button.hidden = true
      if (!input.isConnected || !eligible(input)) {
        item.button.remove(); input.style.setProperty('padding-left', item.padding, item.priority); adornments.delete(input)
      }
    }
    for (const input of root.querySelectorAll('input,textarea')) {
      if (!eligible(input)) continue
      const bounds = input.getBoundingClientRect()
      const popupOwnerId = input.closest<HTMLElement>('[data-typing-owner]')?.dataset.typingOwner
      const popupOwner = popupOwnerId ? [...root.querySelectorAll<HTMLElement>('[data-typing-owner-id]')].find(owner => owner.dataset.typingOwnerId === popupOwnerId) : undefined
      const x = bounds.left + 17, y = bounds.top + bounds.height / 2
      let clipped = x < 0 || x > view.innerWidth || y < 0 || y > view.innerHeight
      for (let parent = input.parentElement; parent && !clipped; parent = parent.parentElement) {
        const style = view.getComputedStyle(parent), clip = parent.getBoundingClientRect()
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (y < clip.top || y > clip.bottom)) clipped = true
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (x < clip.left || x > clip.right)) clipped = true
      }
      const hit = clipped ? null : root.elementFromPoint(x, y)
      const covered = hit !== input && !(hit && input.contains(hit))
      if (clipped || covered || !input.getClientRects().length || bounds.width < 65 || bounds.height < 20 || activePopup && !activePopup.contains(input) || modal && !modal.contains(input) && !(popupOwner && modal.contains(popupOwner))) {
        const old = adornments.get(input); if (old) old.button.hidden = true
        continue
      }
      let item = adornments.get(input)
      if (!item) {
        const button = root.createElement('button')
        button.type = 'button'; button.tabIndex = -1; button.className = 'field-typing-language'
        button.style.cssText = 'position:fixed;z-index:2147483646;width:27px;height:24px;min-width:0;min-height:0;padding:0;border:1px solid #cbd8d7;border-radius:5px;background:#fff;color:#365754;font:12px Tahoma,sans-serif;line-height:22px;cursor:pointer;box-sizing:border-box'
        button.addEventListener('pointerdown', event => { event.preventDefault(); armed = undefined; if (root.activeElement !== input) input.focus({ preventScroll: true }) })
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggle(input) })
        item = { button, padding: input.style.getPropertyValue('padding-left'), priority: input.style.getPropertyPriority('padding-left') }
        adornments.set(input, item)
        input.style.setProperty('padding-left', `${Math.max(34, parseFloat(view.getComputedStyle(input).paddingLeft) || 0)}px`, 'important')
        // Keep pointer ownership inside popup menus so their outside-click logic
        // does not mistake the language button for a click outside the component.
        ;(input.closest('[data-component-popup],.shared-excel-filter-menu,.excel-condition-editor') ?? root.body).append(button)
      }
      const next = currentMode(input) === 'fa' ? 'EN' : 'فا'
      if (item.button.textContent !== next) item.button.textContent = next
      item.button.title = `زبان تایپ: ${next === 'EN' ? 'فارسی' : 'انگلیسی'}؛ تغییر به ${next} (Alt)`
      item.button.setAttribute('aria-label', `تغییر زبان تایپ به ${next}`)
      item.button.hidden = false
      item.button.style.left = `${bounds.left + 4}px`; item.button.style.top = `${bounds.top + (bounds.height - 24) / 2}px`
    }
  }
  const schedule = () => { if (!frame && !disposed) frame = view.requestAnimationFrame(update) }
  const inputChanged = () => schedule()
  const focused=(event:FocusEvent)=>{if(event.target instanceof Element&&eligible(event.target))modes.delete(event.target);schedule()}
  // Native number inputs reject Persian/Arabic digits before an input event exists.
  // Insert normalized text through the browser editor to retain caret, selection and React events.
  const numericText=(value:string)=>value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/٫/g,'.').replace(/−/g,'-')
  const numericTarget=(value:EventTarget|null):value is HTMLInputElement=>value instanceof HTMLInputElement&&value.type==='number'&&!value.disabled&&!value.readOnly
  const keydown = (event: KeyboardEvent) => {
    const input = event.target
    if(numericTarget(input)&&!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&event.key.length===1){
      const normalized=numericText(event.key)
      if(normalized!==event.key&&root.execCommand('insertText',false,normalized)){event.preventDefault();event.stopImmediatePropagation();return}
    }
    if (event.key === 'Alt') {
      if (!event.repeat && !event.ctrlKey && !event.shiftKey && !event.metaKey && input instanceof Element && eligible(input)) {
          armed = input; armedAt = event.timeStamp; event.preventDefault()
      }
        // Repeats while holding Alt do not turn a bare hold into a shortcut chord.
        return
    }
    armed = undefined
    if (!(input instanceof Element) || !eligible(input) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.getModifierState('AltGraph')) return
    const mode = currentMode(input)
    const character = typingCharacter(event.code, mode, event.shiftKey, event.getModifierState('CapsLock'))
    if (!character) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (!root.execCommand('insertText', false, character)) {
      const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start
      const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, input.value.slice(0, start) + character + input.value.slice(end))
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: character, inputType: 'insertText' }))
      input.setSelectionRange(start + character.length, start + character.length)
    }
  }
  const keyup = (event: KeyboardEvent) => {
    if (event.key !== 'Alt') return
    const input = armed; armed = undefined
    if(input && root.activeElement===input && eligible(input) && !event.ctrlKey && !event.metaKey && !event.shiftKey){
      const elapsed=event.timeStamp-armedAt
      if(elapsed>=1500){defaultOverride=currentMode(input)==='fa'?'en':'fa';modes.set(input,defaultOverride);event.preventDefault();update()}
      else if(elapsed>=0&&elapsed<=500){event.preventDefault();toggle(input)}
    }
  }
  const cancel = () => { armed = undefined }
  const numericPaste=(event:ClipboardEvent)=>{
    if(!(numericTarget(event.target)||event.target instanceof Element&&eligible(event.target))||event.defaultPrevented)return
    const text=event.clipboardData?.getData('text/plain')??'',normalized=numericText(text)
    if(text!==normalized&&root.execCommand('insertText',false,normalized)){event.preventDefault();event.stopImmediatePropagation()}
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element && record.target.closest('.field-typing-language')) &&
      !(record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && node.matches('.field-typing-language'))))) schedule()
  })
  observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'class', 'style', 'hidden', 'aria-hidden', 'data-typing-design', 'data-typing-language'] })
  root.addEventListener('keydown', keydown, true); root.addEventListener('keyup', keyup, true)
  root.addEventListener('paste',numericPaste,true)
  root.addEventListener('input', inputChanged); root.addEventListener('focusin', focused)
  root.addEventListener('pointerdown', cancel, true); root.addEventListener('scroll', schedule, true)
  view.addEventListener('resize', schedule); view.addEventListener('blur', cancel)
  schedule()
  return () => {
    disposed = true; observer.disconnect(); view.cancelAnimationFrame(frame)
    root.removeEventListener('keydown', keydown, true); root.removeEventListener('keyup', keyup, true)
    root.removeEventListener('paste',numericPaste,true)
    root.removeEventListener('input', inputChanged); root.removeEventListener('focusin', focused)
    root.removeEventListener('pointerdown', cancel, true); root.removeEventListener('scroll', schedule, true)
    view.removeEventListener('resize', schedule); view.removeEventListener('blur', cancel)
    for (const [input, item] of adornments) { item.button.remove(); input.style.setProperty('padding-left', item.padding, item.priority) }
    adornments.clear()
  }
}
