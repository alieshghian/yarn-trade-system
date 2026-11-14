import { orderedEntryControls } from '../../formInteraction'
import './componentSettings.css'
import {useComponentListContext} from './ComponentListContext'
import {resolveListSettings,componentAccessAllowed,choiceMatches,normalizeChoiceSearch,type ListSettingsPatch} from './componentListSettings'
import {createPortal} from 'react-dom'
import {useComponentBehavior} from './useComponentBehavior'
import type {ListCapabilities} from './componentBehavior'
import { useEffect, useRef, useState, useId } from 'react'
import { functionKeyFromEvent } from './functionKeys'
import { resolveFormValueEntries, type PairEntryAdapter, type FormValueEntry } from './formValueListEntries'
import { componentPopupLeft, estimateComponentPopupWidth } from './componentPopupLayout'
import { DropdownWidthEditor } from './DropdownWidthEditor'

export function formatInternationalNumber(value: string) {
  const match = value.match(/^\+(98|86)(\d+)$/)
  if (!match) return value
  const [, code, rest] = match
  const groups = code === '98' ? [3, 3, 4] : code === '86' ? [3, 4, 4] : []
  if (!groups.length) return `+${code} ${rest.replace(/(.{4})(?=.)/g, '$1 ')}`
  const chunks: string[] = []
  let offset = 0
  for (const size of groups) { if (offset >= rest.length) break; chunks.push(rest.slice(offset, offset + size)); offset += size }
  if (offset < rest.length) chunks.push(rest.slice(offset))
  return `+${code} ${chunks.join(' ')}`
}

function formatPhoneDigits(digits: string, countryCode = '') {
  const cleanDigits = digits.replace(/\D/g, '')
  const formatted = countryCode.trim() ? formatInternationalNumber(`${countryCode.trim()}${cleanDigits}`) : cleanDigits
  if (formatted !== `${countryCode.trim()}${cleanDigits}`) return formatted.slice(countryCode.trim().length).trimStart()
  return cleanDigits.replace(/(\d{3})(?=\d)/g, '$1 ')
}

function formatEditableNumber(value: string) {
  const compact = value.replace(/[^\d+]/g, '')
  const prefix = compact.match(/^\+(?:98|86)/)?.[0]
  if (prefix) {
    const rest = formatPhoneDigits(compact.slice(prefix.length))
    return rest ? `${prefix} ${rest}` : prefix
  }
  return `${compact.startsWith('+') ? '+' : ''}${formatPhoneDigits(compact)}`
}

function updateFormattedPhoneInput(
  event: React.ChangeEvent<HTMLInputElement>,
  format: (value: string) => string,
  normalize: (value: string) => string,
  onChange: (value: string) => void
) {
  const input = event.currentTarget
  const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length
  const value = normalize(input.value)
  onChange(value)
  requestAnimationFrame(() => {
    const formatted = format(value)
    let position = 0
    let digits = 0
    while (position < formatted.length && digits < digitsBeforeCaret) {
      if (/\d/.test(formatted[position])) digits++
      position++
    }
    while (formatted[position] === ' ') position++
    input.setSelectionRange(position, position)
  })
}

export function NumberControl({ field, label, primary, numbers, disabled, fa, onChange, suggestedCode = '', multiline = false, className = '', listPrimary, required = false, minListWidth = 0, getItemKey, addLabel, listLabel, protectedMode = false, designerMode = false, keyboardPrimarySelection = false, onSelectValue, canRemove, canEdit, canAdd: suppliedCanAdd=true,componentDefinitionId,behaviorPreview,listSettings,actorRole,formatValue,formatSelectedValue,getSearchValues,onSearchChange,onPopupChange,onCreateRequested,searchFooter,searchPending=false,emptyChoiceLabel,suggestNextEntry,normalizeEntry,browseOnly=false,pairEntry }: {pairEntry?:PairEntryAdapter;browseOnly?:boolean; suggestNextEntry?:(values:readonly string[])=>string;normalizeEntry?:(value:string)=>string; emptyChoiceLabel?:string;listSettings?:ListSettingsPatch;actorRole?:'admin'|'user';formatValue?:(value:string)=>string;formatSelectedValue?:(value:string)=>string;getSearchValues?:(value:string,fields:readonly string[])=>string[];onSearchChange?:(query:string)=>void;onPopupChange?:(open:boolean)=>void;onCreateRequested?:()=>void;searchFooter?:React.ReactNode;searchPending?:boolean;componentDefinitionId?:string;behaviorPreview?:ListCapabilities;canAdd?:boolean;field: string, label: string, primary: string, numbers: string[], disabled: boolean, fa: boolean, suggestedCode?: string, multiline?: boolean, className?: string, listPrimary?: string, required?: boolean, minListWidth?: number, addLabel?: string, listLabel?: string, getItemKey?: (original: string) => string, protectedMode?: boolean, designerMode?: boolean, keyboardPrimarySelection?: boolean, onSelectValue?: (value: string) => void, canRemove?: (original: string) => boolean, canEdit?: (original: string) => boolean, onChange: (primary: string, numbers: string[], origins: ReadonlyMap<string, string>) => boolean | void | Promise<boolean|void> }) {
  const context=useComponentListContext()
  const behavior=useComponentBehavior(componentDefinitionId??'base-form.value-list',behaviorPreview,context.behaviorOverrides)
  const settings=resolveListSettings({searchEnabled:behavior.searchChoices},behavior.listSettings,context.settings,listSettings)
  const role=actorRole??context.role??'user',allowed=(action:keyof typeof settings.permissions)=>componentAccessAllowed(settings.permissions[action],role)
  const canAdd=suppliedCanAdd&&allowed('add'),canSetDefault=allowed('setDefault'),displayValue=(value:string)=>value?(formatValue?.(value)??value):''
  const popupRef=useRef<HTMLDivElement>(null),savingRef=useRef(false)
  const popupSize=useRef<{width:number;height:number;fieldWidth?:number}|null>(null)
  const popupSizeKey=()=>{const host=wrapper.current?.closest<HTMLElement>('[data-managed-form-id],[data-form-id]');return 'yarn-trade:component-popup-size:v1:'+JSON.stringify([host?.dataset.managedFormId??host?.dataset.formId??location.pathname,field,componentDefinitionId??'base-form.value-list'])}
  const [saving,setSaving]=useState(false),[popupError,setPopupError]=useState(''),[choiceSearch,setChoiceSearch]=useState(''),[removeCandidate,setRemoveCandidate]=useState<string|null>(null)
  const recoveryActive=()=>Boolean(document.querySelector('[data-session-recovery]'))
  const handledInsertKeydown=useRef(false)
  const ownsTarget=(target:Element)=>!recoveryActive()&&Boolean(wrapper.current?.contains(target)||popupRef.current?.contains(target))
  const [open, setOpen] = useState(false)
  useEffect(()=>{onPopupChange?.(open)},[open,onPopupChange])
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const [text, setText] = useState('')
  const [pairEditCode,setPairEditCode]=useState('')
  const [entryRows, setEntryRows] = useState<FormValueEntry[]>([])
  const [defaultEntryId, setDefaultEntryId] = useState<number | null>(null)
  const nextEntryId = useRef(0)
  const entryInputs = useRef(new Map<number, HTMLInputElement | HTMLTextAreaElement>())
  const entryCodes = useRef(new Map<number, HTMLInputElement>())
  const [editingNumber, setEditingNumber] = useState<string | null>(null)
  const [listPosition, setListPosition] = useState<React.CSSProperties>({})
  const [designPopupPosition, setDesignPopupPosition] = useState<React.CSSProperties | null>(null)
  useEffect(() => {
    if (!designerMode && !disabled) { setDesignPopupPosition(null); return }
    const openDesignPopup = (event: Event) => {
      const detail = (event as CustomEvent<{ fieldId: string; anchor: Element }>).detail
      if (detail?.fieldId === field && wrapper.current && detail.anchor.contains(wrapper.current)) setDesignPopupPosition(calculateListPosition())
    }
    window.addEventListener('component-popup-design', openDesignPopup)
    return () => window.removeEventListener('component-popup-design', openDesignPopup)
  })
  const [pendingNumbers, setPendingNumbers] = useState(numbers)
  const managementAllowed=!onCreateRequested&&(Boolean(pairEntry&&!browseOnly)||canAdd||canSetDefault||numbers.some(value=>allowed('edit')&&canEdit?.(value)!==false||allowed('remove')&&canRemove?.(value)!==false))
  const visibleNumbers=(onSearchChange&&!managing?numbers:pendingNumbers).filter(value=>onSearchChange||!settings.searchEnabled||choiceMatches(choiceSearch,getSearchValues?.(value,settings.searchFields)??[displayValue(value)]))
  const [pendingPrimary, setPendingPrimary] = useState(primary)
  const [activeNumber, setActiveNumber] = useState(primary)
  const lookupListId = useId()
  const searchResultKey = visibleNumbers.join('\u0000')
  useEffect(() => {
    if (open && onSearchChange && !managing) setActiveNumber(current => !choiceSearch.trim() && settings.allowEmpty ? '' : visibleNumbers.includes(current) ? current : visibleNumbers[0] ?? '')
  }, [open, onSearchChange, managing, searchResultKey])
  useEffect(() => {
    if (open && onSearchChange && !managing) setActiveNumber(!choiceSearch.trim() && settings.allowEmpty ? '' : visibleNumbers[0] ?? '')
  }, [choiceSearch])
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const skipEmptyFocus = useRef(false)
  const handledF3Keydown = useRef(false)
  // Keep each text entry's original value so consumers can retain their IDs
  // when the shared address editor renames or removes an item.
  const valueOrigins = useRef(new Map(numbers.map(value => [value, value])))
  const editable = !disabled && (!protectedMode || managing)
  useEffect(() => { if (designerMode) cancel(false) }, [designerMode])
  function openEmptyControl() {
    if (designerMode) return
    if (skipEmptyFocus.current) { skipEmptyFocus.current = false; return }
    if(numbers.length)return // Existing choices are confirmed with Enter, not replaced by a new-entry editor.
    if (!onCreateRequested && (canAdd||Boolean(pairEntry&&!browseOnly)) && (!protectedMode || keyboardPrimarySelection) && !disabled && settings.addPlacement!=='hidden' && !primary.trim() && !open) showList(undefined, true)
  }
  function clickDisplay(event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // A focus-opened list must not be dismissed by the click that focused it.
    if (keyboardPrimarySelection) event.stopPropagation()
    if (protectedMode && !open) wrapper.current?.querySelector<HTMLButtonElement>('.number-chevron')?.click()
  }
  function focusNextControl() {
    requestAnimationFrame(() => {
      const form = wrapper.current?.closest('.person-form-grid,form,[data-form-fields]')
      const current = wrapper.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('.person-number-control [data-field]')
      if (!form || !current) return
      // All value lists follow the same saved Enter sequence as ordinary inputs.
      const controls = orderedEntryControls(form as HTMLElement, true).map(item=>item.value)
      const index = controls.indexOf(current)
      const next = controls.slice(index + 1).find(control=>!control.closest('[data-enter-enabled="false"]')) ?? (keyboardPrimarySelection ? current : undefined)
      if (next === current) skipEmptyFocus.current = true
      next?.focus({ preventScroll: true })
    })
  }
  function calculateListPosition() {
    const host = wrapper.current
    const field = host?.querySelector('.person-number-control')
    if (!field) return {}
    const rect = field.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const computed = getComputedStyle(host!)
    const fontSize = Number.parseFloat(computed.getPropertyValue('--component-popup-font-size')) || 15
    const fontFamily = computed.fontFamily || 'Tahoma'
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
    if (context) context.font = `${fontSize}px ${fontFamily}`
    const measureText = (value: string) => context?.measureText(value).width ?? value.length * fontSize * 0.62
    const configuredWidth = Number.parseFloat(computed.getPropertyValue('--component-popup-width')) || 0
    const buttonWidth = Number.parseFloat(computed.getPropertyValue('--component-popup-button-width')) || 96
    const buttonGap = 6
    const horizontalPadding = 40
    const actionLabels = [fa ? 'ثبت (F3)' : 'Save (F3)', fa ? 'انصراف (Esc)' : 'Cancel (Esc)', fa ? 'افزودن (Insert)' : 'Add (Insert)']
    const width = estimateComponentPopupWidth({
      fieldWidth: rect.width,
      minListWidth,
      configuredWidth:pairEntry?Math.max(240,popupSize.current?.fieldWidth?popupSize.current.width*rect.width/popupSize.current.fieldWidth:rect.width*1.2):(popupSize.current?.width??configuredWidth),
      viewportWidth,
      measureText,
      content: onSearchChange ? actionLabels : [...visibleNumbers.map(displayValue), ...entryRows.flatMap(row => [row.code, row.text]), text, choiceSearch, ...actionLabels],
      minimumActionWidth: buttonWidth * 2 + buttonGap + 14,
      horizontalPadding
    })
    const left = componentPopupLeft({ language: fa ? 'fa' : 'en', fieldLeft: rect.left, fieldRight: rect.right, width, viewportWidth })
    const below = Math.max(0, viewportHeight - rect.bottom - 12)
    const above = Math.max(0, rect.top - 12)
    const placeAbove = below < 112 && above > below
    const available = placeAbove ? above : below
    const cap = popupSize.current?.height??(onCreateRequested ? 360 : 180)
    const constrainedToViewportEdge = available < 64
    const maxHeight = constrainedToViewportEdge ? Math.max(64, viewportHeight - 16) : Math.max(64, Math.min(cap, available))
    return {
      top: constrainedToViewportEdge ? 8 : placeAbove ? 'auto' : rect.bottom + 4,
      bottom: constrainedToViewportEdge ? 'auto' : placeAbove ? viewportHeight - rect.top + 4 : 'auto',
      left,
      right: 'auto',
      width,
      ...(popupSize.current||onSearchChange?{height:Math.min(popupSize.current?.height??360,maxHeight)}:{}),
      maxHeight
    } as React.CSSProperties
  }
  function showList(_event?: React.MouseEvent<HTMLButtonElement>, startAdding = false) {
    if(startAdding&&!canAdd)startAdding=false
    if (designerMode) return
    if(startAdding&&onCreateRequested){if(canAdd&&!disabled){setOpen(false);onCreateRequested()}return}
    if (canAdd && !onCreateRequested && protectedMode && !numbers.length && !disabled) startAdding = true
    if(!open){try{const size=JSON.parse(localStorage.getItem(popupSizeKey())??'null');popupSize.current=size&&Number.isFinite(size.width)&&Number.isFinite(size.height)&&size.width>=160&&size.height>=100?size:null}catch{popupSize.current=null}}
    setListPosition(calculateListPosition())
    if (!open) {
      setPopupError('');setChoiceSearch('');onSearchChange?.('');setRemoveCandidate(null)
      setDefaultEntryId(null)
      setPendingNumbers(numbers)
      setPendingPrimary(listPrimary ?? primary)
      setActiveNumber(settings.allowEmpty ? '' : numbers.includes(listPrimary ?? primary) ? listPrimary ?? primary : numbers[0] ?? '')
      valueOrigins.current = new Map(numbers.map(value => [value, value]))
    }
    if (!open) setEntryRows([])
    const referenceEntries=!browseOnly&&!disabled?pairEntry?.initialEntries?.():undefined
    if(!open&&referenceEntries?.length){
      const rows=referenceEntries.map(row=>({...row,id:++nextEntryId.current}))
      setPendingNumbers([]);setEntryRows(rows)
      const chosen=rows.find(row=>row.code.trim()&&pairEntry!.serialize(row.text,row.code)===(listPrimary??primary))
      setDefaultEntryId(chosen?.id??null)
      startAdding=true
    }
    if (!referenceEntries?.length && canAdd && startAdding && (!open || !entryRows.length)) {
      const id = ++nextEntryId.current
      setEntryRows([{ id, code: suggestedCode, text: suggestNextEntry?.(numbers)??'' }])
      if (canSetDefault && !numbers.length) setDefaultEntryId(id)
    }
    setManaging(startAdding && !disabled); setAdding(startAdding); setEditingNumber(null); setText(''); setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const next = calculateListPosition()
    setListPosition(current => Object.keys(next).every(key => current[key as keyof React.CSSProperties] === next[key as keyof React.CSSProperties]) ? current : { ...current, ...next })
    const reposition = () => setListPosition(current => {
      const position = calculateListPosition()
      return Object.keys(position).every(key => current[key as keyof React.CSSProperties] === position[key as keyof React.CSSProperties]) ? current : { ...current, ...position }
    })
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    const observer=new ResizeObserver(reposition),display=wrapper.current?.querySelector('.person-number-control')
    if(display)observer.observe(display)
    return () => {observer.disconnect(); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true) }
  }, [open, entryRows, text, choiceSearch, pendingNumbers, numbers, fa, minListWidth, onCreateRequested, visibleNumbers.map(displayValue).join('\u0000')])
  useEffect(() => {
    if (open && adding && !disabled) {
      const first=pairEntry?entryRows.find(row=>!row.code.trim())??entryRows[0]:entryRows.at(-1)
      const entry = (first?.fixedName?entryCodes:entryInputs).current.get(first?.id ?? -1)
      entry?.focus({ preventScroll: true }); if(suggestNextEntry&&entry?.value)entry.select()
      if (keyboardPrimarySelection) {
        const body = entry?.closest('.number-list-items')
        if (body instanceof HTMLElement) {if(pairEntry)entry?.scrollIntoView({block:'nearest'});else body.scrollTop = body.scrollHeight}
      }
    }
  }, [open, adding, disabled, entryRows.length, keyboardPrimarySelection])
  useEffect(() => {
    if (open && protectedMode && !managing && !adding && !onSearchChange) {
      const rows = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? [])
      const activeIndex = visibleNumbers.indexOf(activeNumber)
      ;(rows[activeIndex] ?? rows.find(row => row.classList.contains('selected')) ?? rows[0])?.focus()
    }
  }, [open, protectedMode, managing, adding, activeNumber, pendingNumbers])
  useEffect(()=>{if(open&&onSearchChange)requestAnimationFrame(()=>popupRef.current?.querySelector<HTMLInputElement>('.component-choice-search')?.focus({preventScroll:true}))},[open,onSearchChange])
  function add(code: string) {
    if (disabled||!canAdd||savingRef.current) return
    if(onCreateRequested){setOpen(false);onCreateRequested();return}
    setManaging(true)
    const id = ++nextEntryId.current
    if(suggestNextEntry){const last=entryRows.at(-1);const values=[...pendingNumbers,...entryRows.map(row=>row.text).filter(value=>value.trim())];if(last&&(!last.text.trim()||values.filter(value=>(normalizeEntry??(v=>v))(value)===(normalizeEntry??(v=>v))(last.text)).length>1)){const control=entryInputs.current.get(last.id);control?.setCustomValidity(fa?'این مورد خالی یا تکراری است.':'This entry is empty or duplicated.');control?.reportValidity();control?.focus();return}}
    setEntryRows(current => [...current, { id, code:pairEntry?'':code, text: suggestNextEntry?.([...pendingNumbers,...current.map(row=>row.text)])??'' }])
    if (canSetDefault && !pendingNumbers.length && !entryRows.length) setDefaultEntryId(id)
    setAdding(true)
  }
  useEffect(()=>{if(open)cancel(false)},[role])
  function changeEntry(id: number, key: 'code' | 'text', value: string) {
    entryInputs.current.get(id)?.setCustomValidity('')
    entryCodes.current.get(id)?.setCustomValidity('')
    setPopupError('')
    setEntryRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row))
  }
  const removalAllowed = (value: string) => allowed('remove') && canRemove?.(valueOrigins.current.get(value) ?? value) !== false
  const editingAllowed = (value: string) => allowed('edit') && canEdit?.(valueOrigins.current.get(value) ?? value) !== false
  function remove(value: string) { if(savingRef.current||disabled||browseOnly||onCreateRequested||!removalAllowed(value))return;setManaging(true);if(behavior.confirmRemoval&&removeCandidate!==value){setRemoveCandidate(value);return}setRemoveCandidate(null);const next = pendingNumbers.filter(item => item !== value); setPendingNumbers(next); if (value === pendingPrimary) setPendingPrimary(next[0] ?? '') }
  function edit(value: string, edited: string) {
    if (!edited.trim() || pendingNumbers.some(item => item !== value && item === edited)) return
    if (multiline) {
      const original = valueOrigins.current.get(value) ?? value
      valueOrigins.current.delete(value)
      valueOrigins.current.set(edited, original)
    }
    setPendingNumbers(current => current.map(item => item === value ? edited : item))
    if (pendingPrimary === value) setPendingPrimary(edited)
  }
  const editedValue=()=>pairEntry?pairEntry.serialize(text,pairEditCode):text.trim()
  function applyEdit() {
    if (editingNumber === null || !text.trim() || !editingAllowed(editingNumber)) return
    let edited:string;try{edited=editedValue()}catch(error){setPopupError((error as Error).message);return}
    if (pendingNumbers.some(item => item !== editingNumber && item === edited)) return
    if (!pairEntry && !multiline && !/^\+?\d[\d\s-]*$/.test(edited)) {
      input.current?.setCustomValidity(fa ? 'شماره معتبر وارد کنید.' : 'Enter a valid number.')
      input.current?.reportValidity()
      return
    }
    if (multiline) { edit(editingNumber, edited); setEditingNumber(null); setText(''); return }
    valueOrigins.current.set(edited, valueOrigins.current.get(editingNumber) ?? editingNumber)
    setPendingNumbers(current => current.map(item => item === editingNumber ? edited : item))
    if (pendingPrimary === editingNumber) setPendingPrimary(edited)
    if (activeNumber === editingNumber) setActiveNumber(edited)
    setEditingNumber(null); setText('')
  }
  async function confirm() {
    if (disabled||savingRef.current) return
    if(entryRows.some(row=>row.text.trim()&&!row.fixedName)&&!canAdd){setPopupError(fa?'اجازهٔ افزودن مورد جدید ندارید.':'Adding new items is not permitted.');return}
    setPopupError('')
    if (protectedMode && !managing) { cancel(); return }
    let finalNumbers = pendingNumbers
    let finalPrimary = pendingPrimary
    const reject = (control: HTMLInputElement | HTMLTextAreaElement | null, message=fa?'مقدار معتبر وارد کنید.':'Enter a valid value.') => {
      setPopupError(message)
      control?.setCustomValidity(message)
      control?.reportValidity(); control?.focus()
    }
    if (editingNumber !== null) {
      if (!editingAllowed(editingNumber)) return
      let edited:string;try{edited=editedValue()}catch(error){setPopupError((error as Error).message);return}
      if (!edited || (!pairEntry && !multiline && !/^\+?\d[\d\s-]*$/.test(edited)) || finalNumbers.some(item => item !== editingNumber && item === edited)) { reject(input.current); return }
      valueOrigins.current.set(edited, valueOrigins.current.get(editingNumber) ?? editingNumber)
      finalNumbers = finalNumbers.map(item => item === editingNumber ? edited : item)
      if (finalPrimary === editingNumber) finalPrimary = edited
    }
    const tooLong=entryRows.find(row=>row.text.length>behavior.maxEntryLength)
    if(tooLong||editingNumber!==null&&text.length>behavior.maxEntryLength){setPopupError((fa?'حداکثر طول مجاز: ':'Maximum length: ')+behavior.maxEntryLength);return}
    const resolved = resolveFormValueEntries(finalNumbers, finalPrimary, entryRows, defaultEntryId, multiline, normalizeEntry??(multiline?normalizeChoiceSearch:undefined),pairEntry)
    if (resolved.error) {
      const message=resolved.error.message??(resolved.error.reason==='duplicate'?(fa?'این مورد قبلاً در همین فهرست وجود دارد؛ مورد موجود را انتخاب کنید یا نام جدیدی وارد کنید.':'This item already exists in this list. Select the existing item or enter a new name.'):(fa?'مقدار این ردیف را تکمیل کنید.':'Complete this entry.'))
      reject((resolved.error.field === 'code' ? entryCodes : entryInputs).current.get(resolved.error.entryId) ?? null,message)
      return
    }
    finalNumbers = resolved.items
    finalPrimary = canSetDefault||pairEntry?resolved.defaultValue:((listPrimary??primary)||resolved.defaultValue)
    if(pairEntry)for(const row of entryRows.filter(row=>row.fixedName&&row.code.trim())){const original=numbers.find(value=>pairEntry.parse(value).text===row.text);if(original)valueOrigins.current.set(pairEntry.serialize(row.text,row.code),original)}
    if (required && !finalPrimary.trim()) {
      if (!entryRows.length) add(suggestedCode)
      else reject(entryInputs.current.get(entryRows[0].id) ?? null)
      return
    }
    if (numbers.some(value => canRemove?.(value) === false && !finalNumbers.some(next => (valueOrigins.current.get(next) ?? next) === value))) {setPopupError(fa?'مقدار ثبت‌شده را نمی‌توان حذف کرد؛ مقدار معتبر وارد کنید.':'A saved item cannot be removed. Enter a valid value.');return}
    savingRef.current=true;setSaving(true)
    try{if(await onChange(finalPrimary,finalNumbers,new Map(valueOrigins.current))===false)return}
    catch(error){setPopupError(error instanceof Error?error.message:String(error));return}
    finally{savingRef.current=false;setSaving(false)}
    setEditingNumber(null); setOpen(false); setAdding(false); setManaging(false); setText(''); setEntryRows([])
    focusNextControl()
  }
  function cancel(advanceFocus = true) {
    if(savingRef.current)return
    setPendingNumbers(numbers)
    setPendingPrimary(listPrimary ?? primary)
    setEditingNumber(null)
    setManaging(false)
    setDefaultEntryId(null)
    setOpen(false)
    setAdding(false)
    setText('')
    setEntryRows([])
    // The focused entry field is removed when the popover closes. Move focus
    // deliberately so Escape never leaves the user without a visible focus.
    if (advanceFocus) focusNextControl()
  }
  useEffect(() => {
    if (!open || !keyboardPrimarySelection) return
    const dismissOutside = (event: MouseEvent) => {
      if (recoveryActive()||!(event.target instanceof Node)) return
      const popup = popupRef.current
      if (event.composedPath().includes(popup as EventTarget) || popup?.contains(event.target) || addButton.current?.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('.number-chevron')?.closest('.person-number-wrap') === wrapper.current) return
      cancel(false)
    }
    document.addEventListener('click', dismissOutside)
    return () => document.removeEventListener('click', dismissOutside)
  })
  useEffect(() => {
    if (!protectedMode || designerMode) return
    const browseKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || !ownsTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return
      if ((event.key === 'Insert' || event.key === 'Ins' || event.code === 'Insert' || event.keyCode === 45) && !event.shiftKey && onCreateRequested && !disabled) {
        event.preventDefault(); event.stopImmediatePropagation()
        handledInsertKeydown.current=true
        if(canAdd && !event.repeat)add(suggestedCode)
        return
      }
      const display = event.target.closest('.person-number-control')
      const rowButton = event.target.closest('.person-number-row:not(.new-number-row)')?.querySelector<HTMLButtonElement>('.person-primary')
      const rowNavigation = Boolean(rowButton) && event.target.matches('.person-primary,textarea[readonly],.number-row-value')
      const plus = event.key === '+' || event.key === 'Add' || event.code === 'NumpadAdd'
      if (plus && canAdd && !disabled && (display || event.target.matches('button,textarea[readonly],.number-row-value') || Boolean(onCreateRequested&&event.target.closest('.component-choice-search')))) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (open) add(suggestedCode)
        else if(onCreateRequested){setOpen(false);onCreateRequested()}
        else addButton.current?.click()
        return
      }
      if (event.target.closest('.new-number-row')) return
      if (open && onSearchChange && !managing && keyboardPrimarySelection && event.target.matches('.component-choice-search') && ['ArrowUp','ArrowDown','Enter'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (event.isComposing || disabled) return
        const choices = settings.allowEmpty ? ['', ...visibleNumbers] : visibleNumbers
        if (!choices.length) return
        const index = choices.indexOf(activeNumber)
        if (event.key === 'Enter') {
          if(searchPending)return
          onSelectValue?.(choices[index < 0 ? 0 : index]); cancel()
        } else {
          const nextIndex = index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
          const next = choices[nextIndex]
          setActiveNumber(next)
          if (next) popupRef.current?.querySelectorAll('.person-number-row:not(.new-number-row)')[visibleNumbers.indexOf(next)]?.scrollIntoView({block:'nearest'})
        }
        return
      }
      if (display && !open && keyboardPrimarySelection && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (!disabled && numbers.length) {
          const index = numbers.indexOf(primary)
          const nextIndex = index < 0 ? (event.key === 'ArrowDown' ? 0 : numbers.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + numbers.length) % numbers.length
          onSelectValue?.(numbers[nextIndex])
        }
        return
      }
      if (display && event.key === 'Enter' && event.target.matches('[data-field]')) {
        event.preventDefault(); event.stopImmediatePropagation()
        if(!open&&!disabled&&(numbers.length>1||onSearchChange)){showList(undefined,false);return}
        if(!open&&!disabled&&numbers.length===1&&!primary.trim()){onSelectValue?.(numbers[0]);focusNextControl();return}
        if (primary.trim()) {
          if (open) cancel()
          else focusNextControl()
        } else if (!disabled) { if(!canAdd||onCreateRequested)wrapper.current?.querySelector<HTMLButtonElement>('.number-chevron')?.click();else addButton.current?.click() }
        return
      }
      if (display && ['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation()
        if (!open) wrapper.current?.querySelector<HTMLButtonElement>('.number-chevron')?.click()
        else {
          const rows = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? [])
          const index = visibleNumbers.indexOf(activeNumber)
          ;(rows[index] ?? rows.find(row => row.classList.contains('selected')) ?? rows[0])?.focus()
        }
      } else if (open && ['ArrowUp', 'ArrowDown'].includes(event.key) && rowNavigation) {
        event.preventDefault(); event.stopImmediatePropagation()
        const rows = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? [])
        const index = rows.indexOf(rowButton as HTMLButtonElement)
        if (rows.length) {
          const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
          setActiveNumber(visibleNumbers[nextIndex] ?? '')
          rows[nextIndex]?.focus()
        }
      } else if (open && event.key === 'Enter' && rowNavigation && keyboardPrimarySelection) {
        event.preventDefault(); event.stopImmediatePropagation()
        const index = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('.person-number-row:not(.new-number-row)>.person-primary') ?? []).indexOf(rowButton as HTMLButtonElement)
        const selectedNumber = visibleNumbers[index]
        if (selectedNumber !== undefined) {
          setActiveNumber(selectedNumber)
          if (managing && canSetDefault) { setPendingPrimary(selectedNumber); setDefaultEntryId(null) }
          else {
            onSelectValue?.(selectedNumber)
            cancel()
          }
        }
      }
    }
    const insertRelease=(event:KeyboardEvent)=>{
      if(!['Insert','Ins'].includes(event.key)&&event.code!=='Insert'&&event.keyCode!==45)return
      if(handledInsertKeydown.current){handledInsertKeydown.current=false;return}
      // Some desktop keyboard drivers deliver Insert only on release, like F3.
      if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.repeat||event.isComposing||disabled||!canAdd||!onCreateRequested||!(event.target instanceof Element)||!ownsTarget(event.target))return
      event.preventDefault();event.stopImmediatePropagation();add(suggestedCode)
    }
    window.addEventListener('keydown', browseKey, true)
    window.addEventListener('keyup', insertRelease, true)
    return () => {
      window.removeEventListener('keyup', insertRelease, true)
      window.removeEventListener('keydown', browseKey, true)
    }
  })
  useEffect(() => {
    const consumeHandledF3Keyup = (event: KeyboardEvent) => {
      if (!handledF3Keydown.current || functionKeyFromEvent(event) !== 'F3') return
      handledF3Keydown.current = false
      event.preventDefault(); event.stopImmediatePropagation()
    }
    window.addEventListener('keyup', consumeHandledF3Keyup, true)
    return () => window.removeEventListener('keyup', consumeHandledF3Keyup, true)
  }, [])
  useEffect(() => {
    if (!open) return
    const cancelKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (!(event.target instanceof Element)||!ownsTarget(event.target)) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!event.repeat) cancel()
    }
    const confirmKey = (event: KeyboardEvent) => {
      if (functionKeyFromEvent(event) !== 'F3' || event.altKey || event.ctrlKey || event.metaKey || wrapper.current?.closest('[aria-hidden="true"]')) return
      if (!(event.target instanceof Element)||!ownsTarget(event.target)) return
      // Run before the shared document capture handler that owns the main F3 save.
      event.preventDefault(); event.stopImmediatePropagation()
      handledF3Keydown.current = true
      if (!event.repeat) confirm()
    }
    window.addEventListener('keydown', cancelKey, true)
    window.addEventListener('keydown', confirmKey, true)
    return () => { window.removeEventListener('keydown', cancelKey, true); window.removeEventListener('keydown', confirmKey, true) }
  })
  const popupTokens=Object.fromEntries(['--component-popup-width','--component-popup-font-size','--component-popup-bg','--component-popup-button-width','--component-popup-button-height'].map(key=>[key,wrapper.current?getComputedStyle(wrapper.current).getPropertyValue(key).trim():'']).filter(([,value])=>value))
  useEffect(() => {
    if (!open) return
    const controls = () => [...(popupRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled),select:not(:disabled)') ?? [])].filter(el=>el.tabIndex>=0&&el.getClientRects().length)
    const refocus = () => {
      const target=controls().find(el=>el.matches('input,textarea,select'))??controls()[0]
      target?.focus({preventScroll:true})
    }
    const pointer = (event: Event) => {
      if (!recoveryActive()&&event.target instanceof Node && !popupRef.current?.contains(event.target)) {event.preventDefault();event.stopImmediatePropagation()}
    }
    const focus = (event: FocusEvent) => {if(!recoveryActive()&&event.target instanceof Node&&!popupRef.current?.contains(event.target))queueMicrotask(()=>{if(!recoveryActive()&&popupRef.current&&!popupRef.current.contains(document.activeElement))refocus()})}
    const key = (event: KeyboardEvent) => {
      if(recoveryActive())return
      if (!(event.target instanceof Node) || !popupRef.current?.contains(event.target)) {
        event.preventDefault();event.stopImmediatePropagation()
        if(event.key==='Escape'&&!event.repeat)cancel();else refocus()
      } else if(event.key==='Tab') {
        const items=controls(),index=items.indexOf(document.activeElement as HTMLElement)
        if(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===items.length-1){event.preventDefault();event.stopImmediatePropagation();items[event.shiftKey?items.length-1:0]?.focus()}
      }
    }
    window.addEventListener('pointerdown',pointer,true);window.addEventListener('click',pointer,true)
    window.addEventListener('focusin',focus,true);window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('click',pointer,true);window.removeEventListener('focusin',focus,true);window.removeEventListener('keydown',key,true)}
  })
  const resizePopup=(event:React.PointerEvent<HTMLButtonElement>,edge:'left'|'right')=>{
    if(event.button!==0||!popupRef.current)return
    event.preventDefault();event.stopPropagation()
    const handle=event.currentTarget,rect=popupRef.current.getBoundingClientRect(),x=event.clientX,y=event.clientY
    const previous=popupSize.current
    handle.setPointerCapture(event.pointerId)
    handle.onpointermove=move=>{
      const availableWidth=edge==='right'?window.innerWidth-rect.left-12:rect.right-12
      const width=Math.max(Math.min(240,availableWidth),Math.min(availableWidth,rect.width+(edge==='right'?move.clientX-x:x-move.clientX)))
      const height=Math.max(Math.min(100,window.innerHeight-rect.top-12),Math.min(window.innerHeight-rect.top-12,rect.height+move.clientY-y))
      popupSize.current={width,height,fieldWidth:wrapper.current?.querySelector('.person-number-control')?.getBoundingClientRect().width}
      setListPosition({position:'fixed',left:edge==='right'?rect.left:rect.right-width,top:rect.top,right:'auto',bottom:'auto',width,height,maxHeight:height})
    }
    const finish=(cancelled:boolean)=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);if(cancelled){popupSize.current=previous;setListPosition(calculateListPosition())}else if(popupSize.current){try{localStorage.setItem(popupSizeKey(),JSON.stringify(popupSize.current))}catch{setPopupError(fa?'اندازهٔ پنجره ذخیره نشد؛ حافظهٔ مرورگر را بررسی کنید.':'Popup size could not be saved.')}}}
    handle.onpointerup=()=>finish(false);handle.onpointercancel=()=>finish(true)
  }
  const popupBackground=/^#[0-9a-f]{6}$/i.test(popupTokens['--component-popup-bg']??'')?popupTokens['--component-popup-bg']:'#ffffff'
  const popup=open ? <div ref={popupRef} data-component-popup aria-busy={searchPending||undefined} data-component-role={role} data-typing-owner={lookupListId} data-manual-width={Number.parseFloat(popupTokens['--component-popup-width']) > 0 || undefined} data-component-definition={componentDefinitionId??'base-form.value-list'} role="dialog" aria-modal="true" aria-label={label} className={`person-number-list ${pairEntry?'paired-entry-list':''} ${multiline ? 'address-list' : 'phone-list'} ${adding ? 'adding' : ''}`} style={{...listPosition,paddingBottom:14,position:'fixed',zIndex:2147483000,backgroundColor:popupBackground,backgroundImage:'none',opacity:1,backdropFilter:'none',isolation:'isolate',...popupTokens} as React.CSSProperties} dir={multiline ? 'rtl' : 'ltr'}>
      {settings.searchEnabled&&<input role={onSearchChange?"combobox":undefined} aria-expanded={onSearchChange?open:undefined} aria-controls={onSearchChange?lookupListId:undefined} aria-activedescendant={onSearchChange&&visibleNumbers.includes(activeNumber)?`${lookupListId}-${visibleNumbers.indexOf(activeNumber)}`:undefined} className="component-choice-search" aria-label={fa?'جست‌وجو در '+label:'Search '+label} value={choiceSearch} onChange={event=>{setChoiceSearch(event.target.value);onSearchChange?.(event.target.value)}}/>}
      {pairEntry?.firstSuggestions&&<datalist id={lookupListId+'-pair-types'}>{pairEntry.firstSuggestions.map(name=><option key={name} value={name}/>)}</datalist>}
      {settings.allowEmpty&&!managing&&<button type="button" className={`component-clear-choice${activeNumber===''?' is-active-row':''}`} aria-pressed={activeNumber===''} style={{display:'block',flex:'0 0 32px',width:'100%',minHeight:32,margin:'4px 0',background:activeNumber===''?'#edf4f2':'#fff',border:'1px solid #d7e3e1',borderRadius:4}} aria-label={fa?'بدون انتخاب':'No selection'} disabled={disabled} onClick={()=>{onSelectValue?.('');cancel()}}>{emptyChoiceLabel??(fa?'بدون انتخاب':'No selection')}</button>}
      <div className="number-list-items" id={onSearchChange?lookupListId:undefined} role={onSearchChange?"listbox":undefined}>
      {visibleNumbers.map((number,index) => <div id={onSearchChange?`${lookupListId}-${index}`:undefined} role={onSearchChange?"option":undefined} aria-selected={onSearchChange?activeNumber===number:undefined} className={`person-number-row${keyboardPrimarySelection && activeNumber === number ? ' is-active-row' : ''}`} key={getItemKey?.(valueOrigins.current.get(number) ?? number) ?? number} onFocusCapture={() => { if (keyboardPrimarySelection) setActiveNumber(number) }} onClick={() => { if (keyboardPrimarySelection && !managing && !disabled && !searchPending) { onSelectValue?.(number); cancel() } }}><button type="button" className={`person-primary ${defaultEntryId === null && pendingPrimary === number ? 'selected' : ''}`} aria-disabled={protectedMode && !editable || undefined} onClick={event => {event.stopPropagation(); if (!browseOnly&&canSetDefault&&!disabled) { setManaging(true);setPendingPrimary(number); setDefaultEntryId(null); setActiveNumber(number) } }} aria-label={fa ? 'انتخاب مورد اصلی' : 'Set primary'}>{defaultEntryId === null && pendingPrimary === number ? '✓' : '○'}</button>{pairEntry&&editingNumber===number?<span className="number-pair-inputs"><input ref={el=>{input.current=el}} aria-label={pairEntry.firstLabel} value={text} list={lookupListId+'-pair-types'} onChange={e=>{setText(e.target.value);setPopupError('')}}/><input aria-label={pairEntry.secondLabel} inputMode="decimal" value={pairEditCode} onChange={e=>{setPairEditCode(e.target.value);setPopupError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();applyEdit()}}}/></span>:multiline ? <textarea ref={el => { if (editingNumber === number) input.current = el }} disabled={disabled} readOnly={!editingAllowed(number)||protectedMode && editingNumber !== number} rows={2} value={editingNumber === number ? text : displayValue(number)} onChange={e => editingNumber === number ? setText(e.target.value) : edit(number, e.target.value)} /> : editingNumber === number ? <input ref={el => { input.current = el }} className="number-edit-input" dir="ltr" value={formatEditableNumber(text)} onChange={event => updateFormattedPhoneInput(event, formatEditableNumber, value => { const compact = value.replace(/[^\d+]/g, ''); return compact.startsWith('+') ? `+${compact.slice(1).replace(/\+/g, '')}` : compact.replace(/\+/g, '') }, setText)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyEdit() } }} /> : <span className="number-row-value" dir="ltr">{formatValue?displayValue(number):formatInternationalNumber(number)}</span>}{!disabled&&!browseOnly&&!onCreateRequested && <>{editingAllowed(number) && <button type="button" className="number-row-edit" onClick={event => { event.stopPropagation(); setManaging(true); setEditingNumber(number); setAdding(false); setActiveNumber(number); setText(pairEntry?pairEntry.parse(number).text:formatValue?displayValue(number):number);setPairEditCode(pairEntry?.parse(number).code??''); requestAnimationFrame(() => input.current?.focus()) }} aria-label={fa ? 'ویرایش' : 'Edit'}>✎</button>}{removalAllowed(number) && <button type="button" disabled={!removalAllowed(number)} title={!removalAllowed(number) ? (fa ? 'این عنوان استفاده شده و قابل حذف نیست.' : 'This title is in use and cannot be removed.') : undefined} data-remove-candidate={removeCandidate===number||undefined} onClick={event => { event.stopPropagation(); remove(number) }} aria-label={fa ? 'حذف' : 'Remove'}>{removeCandidate===number?(fa?'تأیید حذف':'Confirm'):'×'}</button>}</>}</div>)}
      {editable && (canAdd||pairEntry) && entryRows.map(row => <div key={row.id} className="person-number-row new-number-row" dir={multiline ? 'rtl' : 'ltr'}>{canSetDefault && <button type="button" className={`person-primary ${defaultEntryId === row.id ? 'selected' : ''}`} disabled={!canSetDefault} aria-pressed={defaultEntryId === row.id} aria-label={fa ? 'انتخاب پیش‌فرض' : 'Set default'} onClick={() => setDefaultEntryId(row.id)}>{defaultEntryId === row.id ? '✓' : '○'}</button>}{!multiline && !pairEntry && <input ref={el => { if (el) entryCodes.current.set(row.id, el); else entryCodes.current.delete(row.id) }} className="dial-code-input" dir="ltr" aria-label={fa ? 'کد کشور' : 'Country code'} value={row.code} onChange={e => changeEntry(row.id, 'code', e.target.value)} placeholder={suggestedCode || '+98'} />}{pairEntry?<span className="number-pair-inputs"><input ref={el=>{if(el)entryInputs.current.set(row.id,el);else entryInputs.current.delete(row.id)}} readOnly={row.fixedName} aria-label={pairEntry.firstLabel} placeholder={pairEntry.firstLabel} list={lookupListId+'-pair-types'} value={row.text} onChange={e=>{changeEntry(row.id,'text',e.target.value);setPopupError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();entryCodes.current.get(row.id)?.focus()}}}/><input ref={el=>{if(el)entryCodes.current.set(row.id,el);else entryCodes.current.delete(row.id)}} aria-label={pairEntry.secondLabel} placeholder={pairEntry.secondLabel} inputMode="decimal" value={row.code} onChange={e=>{changeEntry(row.id,'code',e.target.value);setPopupError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();const next=entryRows[entryRows.findIndex(item=>item.id===row.id)+1];if(row.fixedName&&next)entryCodes.current.get(next.id)?.focus();else if(!row.fixedName)add('')}}}/></span>:multiline ? <textarea ref={el => { if (el) entryInputs.current.set(row.id, el); else entryInputs.current.delete(row.id) }} value={row.text} maxLength={behavior.maxEntryLength} placeholder={fa?label+' جدید':'New '+label} onChange={e => changeEntry(row.id, 'text', e.target.value)} aria-label={label} onKeyDown={e => { if (e.key === 'Enter'||Boolean(suggestNextEntry&&(e.key==='+'||e.code==='NumpadAdd'))) { e.preventDefault(); e.stopPropagation(); add(row.code) } }} /> : <input ref={el => { if (el) entryInputs.current.set(row.id, el); else entryInputs.current.delete(row.id) }} className="number-edit-input" dir="ltr" type="tel" value={formatPhoneDigits(row.text, row.code)} onChange={event => updateFormattedPhoneInput(event, value => formatPhoneDigits(value, row.code), value => value.replace(/\D/g, ''), value => changeEntry(row.id, 'text', value))} aria-label={label} placeholder={fa ? 'شماره جدید' : 'New number'} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(row.code) } }} />}{canAdd&&!row.fixedName&&<button type="button" className="number-row-add" aria-label={fa ? 'افزودن مورد' : 'Add entry'} onClick={() => add(row.code)}>+</button>}{!row.fixedName&&allowed('remove') && <button type="button" className="number-row-remove" aria-label={fa?'حذف شماره جدید':'Remove new number'} onClick={()=>{setEntryRows(current=>current.filter(item=>item.id!==row.id));if(defaultEntryId===row.id)setDefaultEntryId(null)}}>×</button>}</div>)}
      </div>
      {suggestNextEntry&&<small role="status" data-batch-count>{fa?'تعداد موارد: ':'Items: '}{pendingNumbers.length+entryRows.filter(row=>row.text.trim()).length}</small>}
      {searchFooter}
      {!disabled && onCreateRequested && <div className="number-actions lookup-create-actions">{canAdd && settings.addPlacement!=='hidden' && <button type="button" className="number-row-add lookup-add-action" aria-label={fa?'افزودن مورد':'Add entry'} onClick={()=>add(suggestedCode)}>{addLabel??(fa?'ایجاد (Insert)':'Create (Insert)')}</button>}<button type="button" className="number-cancel" onClick={()=>cancel()}>{fa?'انصراف':'Cancel'} (Esc)</button></div>}
      {!disabled && !onCreateRequested && !browseOnly && <div className="number-actions" dir={keyboardPrimarySelection ? (fa ? 'rtl' : 'ltr') : undefined}><button type="button" className="number-confirm" disabled={saving} onClick={confirm}>{suggestNextEntry?(fa?'ثبت گروهی':'Save batch'):(fa ? 'ثبت' : 'Save')} (F3)</button><button type="button" className="number-cancel" disabled={saving} onClick={() => cancel()}>{fa ? 'انصراف' : 'Cancel'} (Esc)</button>{protectedMode && canAdd && settings.addPlacement!=='hidden' && <button type="button" className={onCreateRequested?"number-row-add lookup-add-action":"number-row-add"} aria-label={fa ? 'افزودن مورد' : 'Add entry'} onClick={() => add(suggestedCode)}>{onCreateRequested?(fa?'＋ افزودن (Insert)':'＋ Add (Insert)'):'+'}</button>}</div>}
    {popupError&&<p role="alert">{popupError}</p>}
    {(['left','right'] as const).map(edge=><button key={edge} type="button" tabIndex={-1} data-popup-resize={edge} aria-label={fa?'تغییر اندازه پنجره از '+(edge==='left'?'چپ':'راست'):'Resize popup '+edge} onPointerDown={event=>resizePopup(event,edge)} style={{position:'absolute',bottom:0,[edge]:0,width:14,height:14,minWidth:14,padding:0,border:0,background:'transparent',color:'#78908b',lineHeight:1,cursor:edge==='right'?'nwse-resize':'nesw-resize',touchAction:'none',zIndex:3}}>⌟</button>)}
    </div>:null
  return <div className={`person-number-wrap${className ? ` ${className}` : ''}`} data-component-definition={componentDefinitionId??'base-form.value-list'} data-typing-owner-id={lookupListId} data-protected-list={protectedMode || undefined} data-standard-list={keyboardPrimarySelection || undefined} data-designer-mode={designerMode || undefined} inert={designerMode || undefined} ref={wrapper} onInput={event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity('') }}>
    <div className={`person-number-control ${multiline ? 'address-control' : ''}`}>
      {canAdd&&(!onCreateRequested&&settings.addPlacement==='beside'||settings.addPlacement==='inside')&&<button ref={addButton} type="button" className={onCreateRequested?"component-inline-add lookup-inline-add":"number-add-button component-inline-add"} disabled={disabled||(onCreateRequested?!canAdd:!managementAllowed)} aria-label={addLabel ?? `${fa ? 'افزودن شماره' : 'Add number'} ${label}`} aria-expanded={open && adding} onClick={event => disabled ? undefined : showList(event, true)}>+</button>}
      {multiline ? <textarea data-field={field} aria-label={label} disabled={disabled} value={formatSelectedValue?.(primary)??displayValue(primary)} readOnly rows={1} onFocus={openEmptyControl} onClick={clickDisplay} /> : <input data-field={field} className="ltr-input number-display" aria-label={label} disabled={disabled} value={formatSelectedValue?.(primary)??(formatValue?displayValue(primary):formatInternationalNumber(primary))} readOnly dir="ltr" onFocus={openEmptyControl} onClick={clickDisplay} />}
      <button type="button" className="number-chevron" aria-label={listLabel ?? (fa ? (multiline ? 'نمایش نشانی‌ها' : 'نمایش شماره‌ها') : 'Show list')} aria-expanded={open} onClick={event => open ? setOpen(false) : showList(event)} />
    </div>
    {popup&&createPortal(<><div data-component-backdrop style={{position:'fixed',inset:0,zIndex:2147482999,background:'transparent'}}/><div className="person-number-wrap component-popup-host" data-standard-list={keyboardPrimarySelection||undefined}>{popup}</div></>,document.getElementById('root')??document.body)}
    {designPopupPosition && <DropdownWidthEditor position={designPopupPosition} fa={fa} label={label} items={visibleNumbers.map(displayValue)} onClose={() => setDesignPopupPosition(null)} onChange={width => window.dispatchEvent(new CustomEvent('component-popup-width-change', { detail: { fieldId: field, anchor: wrapper.current, width } }))} />}
  </div>
}
