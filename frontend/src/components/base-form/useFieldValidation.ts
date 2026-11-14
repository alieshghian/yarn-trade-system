import { useEffect, useRef, type RefObject } from 'react'
import {allowsFieldArrow} from './fieldArrowNavigation'

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
export type FieldRule = { required?: boolean; maxLength?: number; min?: number; max?: number; integer?: boolean; validate?: (value: string) => string; remote?: boolean; remoteContext?: () => Record<string,unknown>; remoteValue?: (value: string) => string; selector?: string }
type Options = { enabled: boolean; entity?: string; context?: Record<string, unknown>; rules: Record<string, FieldRule>; demo?: boolean; fallback?: boolean }
const numberText = (value: number) => new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(value)
const controlSelector = 'input:not([type=hidden]),select,textarea'
const message = (rule: FieldRule, value: string) => rule.required && !value.trim() ? 'تکمیل این فیلد الزامی است.'
  : rule.validate?.(value) ? rule.validate(value)
  : rule.maxLength && value.length > rule.maxLength ? `حداکثر ${numberText(rule.maxLength)} نویسه مجاز است.`
  : value && (rule.min !== undefined || rule.max !== undefined || rule.integer) && (!Number.isFinite(Number(value)) || rule.integer && !Number.isInteger(Number(value)) || rule.min !== undefined && Number(value) < rule.min || rule.max !== undefined && Number(value) > rule.max) ? `مقدار معتبر${rule.min !== undefined ? ' از '+numberText(rule.min) : ''}${rule.max !== undefined ? ' تا '+numberText(rule.max) : ''} وارد کنید.`
  : ''
export { message as fieldRuleError }

/** All entry routes (keyboard, pointer and Save) use this same field-level gate. */
export function useFieldValidation(root: RefObject<HTMLElement | null>, options: Options) {
  const current = useRef(options); current.current = options
  const run = useRef<(all?: boolean) => Promise<boolean>>(async () => true)
  const validating = useRef(false)
  useEffect(() => {
    const host = root.current
    if (!host) return
    if(options.enabled&&!options.fallback)host.setAttribute('data-field-validation-owner','true')
    let revision = 0, disposed = false, replay = false, blockedClick: HTMLElement | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const errors = new Map<Control, { text: string; node: HTMLElement }>()
    const cache = new Map<string, Promise<string>>()
    const requests = new Set<AbortController>()
    const placeErrors = () => {
      for (const [input, {node}] of errors) {
        const rect = input.getBoundingClientRect()
        node.hidden = !input.isConnected || !input.getClientRects().length || rect.bottom < 0 || rect.top > window.innerHeight
        node.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - Math.min(360, rect.width) - 4))}px`
        node.style.top = `${rect.bottom + 3}px`
        node.style.maxWidth = `${Math.max(80, Math.min(360, rect.width))}px`
      }
    }
    const find = (key: string, rule: FieldRule) => [...host.querySelectorAll<Control>(rule.selector ?? `[data-field="${key}"]`)].find(element=>element.matches(controlSelector))
    const entry = (element: EventTarget | null) => {
      if (!(element instanceof HTMLElement) || !element.matches(controlSelector)) return undefined
      if(current.current.fallback&&element.closest('[data-field-validation-owner]'))return undefined
      for (const [key, rule] of Object.entries(current.current.rules)) if (find(key, rule) === element) return { key, rule, input: element as Control }
    }
    const clear = (input: Control) => {
      const old = errors.get(input)
      if (old) { old.node.remove(); errors.delete(input); input.setCustomValidity(''); input.removeAttribute('data-field-validation-error'); if (input.getAttribute('aria-errormessage') === old.node.id) { input.removeAttribute('aria-errormessage'); input.removeAttribute('aria-invalid') } }
    }
    const show = (input: Control, text: string) => {
      clear(input)
      if (!text) return
      input.setCustomValidity(text); input.setAttribute('aria-invalid', 'true'); input.dataset.fieldValidationError = text
      const node = document.createElement('small'); node.id = 'field-error-'+crypto.randomUUID(); node.className = 'shared-field-error'; node.setAttribute('role','alert'); node.dir = 'rtl'; node.textContent = text
      node.style.cssText = 'position:fixed;z-index:2147483645;margin:0;padding:3px 7px;border:1px solid #efc4c9;border-radius:5px;background:#fffafa;color:#b42332;font:12px Tahoma,sans-serif;line-height:1.5;white-space:normal;pointer-events:none;box-sizing:border-box;box-shadow:0 2px 5px #0001'
      input.setAttribute('aria-errormessage', node.id)
      ;(input.closest('[role="dialog"]') ?? document.body).append(node)
      errors.set(input, { text, node })
      placeErrors()
    }
    const check = async (item: NonNullable<ReturnType<typeof entry>>, display = true) => {
      const opts = current.current, value = item.input.value, extra=item.rule.remoteContext?.()??{}, context = JSON.stringify({...opts.context,...extra}), token = revision
      if(opts.fallback&&item.input.closest('[data-field-validation-owner]'))return true
      if (!opts.enabled || item.input.disabled || 'readOnly' in item.input && item.input.readOnly) return true
      let error = message(item.rule, value)
      if (!error && item.rule.remote && opts.entity && !opts.demo && value.trim()) {
        const key = JSON.stringify([opts.entity,item.key,value,context])
        let pending = cache.get(key)
        if (!pending) {
          const controller=new AbortController();requests.add(controller)
          const timeout=setTimeout(()=>controller.abort(),8000)
          pending = import('../../api').then(({apiRequest})=>apiRequest<{error?: string}>(`/api/field-validation/${opts.entity}`, {method:'POST',signal:controller.signal,body:JSON.stringify({...opts.context,...extra,field:item.key,value:item.rule.remoteValue?.(value)??value})})).then(r=>r.error ?? '').finally(()=>{clearTimeout(timeout);requests.delete(controller)})
          cache.set(key,pending)
        }
        try { error = await pending } catch { cache.delete(key); error = 'بررسی این فیلد انجام نشد؛ اتصال را بررسی و دوباره تلاش کنید.' }
      }
      const latest=current.current.rules[item.key]
      if (disposed || token !== revision || value !== item.input.value || context !== JSON.stringify({...current.current.context,...latest?.remoteContext?.()}) || !current.current.enabled) return false
      if (display) show(item.input,error)
      return !error
    }
    const validateAll = async () => {
      for (const [key,rule] of Object.entries(current.current.rules)) {
        const input=find(key,rule)
        if (input && !await check({key,rule,input})) { input.focus({preventScroll:true}); return false }
      }
      return true
    }
    run.current = validateAll
    const changed = (event: Event) => {
      revision++; for(const request of requests)request.abort();cache.clear(); clearTimeout(timer)
      const item = entry(event.target); if (!item || !current.current.enabled) return
      clear(item.input)
      timer=setTimeout(()=>void check(item,false),300)
    }
    const cancelled = (target: HTMLElement) => Boolean(target.closest('.field-typing-language,[data-field-validation-bypass]')) || Boolean(target.closest('button')?.textContent?.match(/Esc|انصراف|خروج|لغو|Cancel|Close/i))
    const gate = (event: Event) => {
      if (replay || event.defaultPrevented || !current.current.enabled) return
      const item = entry(document.activeElement); if (!item) return
      if (event instanceof KeyboardEvent) {
        if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !['Enter','Tab','ArrowLeft','ArrowRight'].includes(event.key)) return
        if(['ArrowLeft','ArrowRight'].includes(event.key)&&!allowsFieldArrow(item.input,event.key))return
        if(event.key==='Enter'&&item.input instanceof HTMLSelectElement&&[...item.input.options].filter(option=>!option.disabled&&option.value!=='').length>1)return
      } else {
        const target=event.target as HTMLElement
        if (!(target instanceof HTMLElement) || target === item.input || cancelled(target) || target.closest('label') === item.input.closest('label') && target.closest('label')) return
      }
      const local=message(item.rule,item.input.value)
      if(!local&&!item.rule.remote) return
      event.preventDefault(); event.stopImmediatePropagation()
      const target=event.target as HTMLElement, token=revision
      if (!(event instanceof KeyboardEvent)) blockedClick=target
      void check(item).then(valid=>{
        if(!valid){if(current.current.enabled&&token===revision)item.input.focus({preventScroll:true});return}
        if(disposed||token!==revision||document.activeElement!==item.input)return
        replay=true
        try {
          if(event instanceof KeyboardEvent) {
            // Replay to the existing Enter/arrow engine after authoritative validation.
            item.input.dispatchEvent(new KeyboardEvent('keydown',{key:event.key,code:event.code,bubbles:true,cancelable:true,shiftKey:event.shiftKey}))
            if(event.key==='Tab') {
              const controls=[...host.querySelectorAll<Control>(controlSelector)].filter(x=>!x.disabled&&x.getClientRects().length)
              controls[controls.indexOf(item.input)+(event.shiftKey?-1:1)]?.focus()
            }
          } else { target.closest<HTMLElement>('input,select,textarea,button,[tabindex]')?.focus({preventScroll:true}); target.closest<HTMLButtonElement>('button')?.click() }
        } finally {replay=false}
      })
    }
    const click = (event: MouseEvent) => { if(!replay&&blockedClick&&(event.target===blockedClick||blockedClick.contains(event.target as Node))){event.preventDefault();event.stopImmediatePropagation();blockedClick=undefined} }
    const blur = (event: FocusEvent) => { const item=entry(event.target); if(item&&current.current.enabled)void check(item) }
    host.addEventListener('keydown',gate,true); host.addEventListener('pointerdown',gate,true)
    host.addEventListener('click',click,true)
    host.addEventListener('input',changed); host.addEventListener('change',changed); host.addEventListener('focusout',blur)
    window.addEventListener('scroll',placeErrors,true); window.addEventListener('resize',placeErrors)
    return()=>{disposed=true;revision++;for(const request of requests)request.abort();clearTimeout(timer);if(!options.fallback)host.removeAttribute('data-field-validation-owner');for(const input of errors.keys())clear(input);window.removeEventListener('scroll',placeErrors,true);window.removeEventListener('resize',placeErrors);host.removeEventListener('keydown',gate,true);host.removeEventListener('pointerdown',gate,true);host.removeEventListener('click',click,true);host.removeEventListener('input',changed);host.removeEventListener('change',changed);host.removeEventListener('focusout',blur)}
  },[root,options.enabled])
  useEffect(()=>{if(!options.enabled){for(const input of root.current?.querySelectorAll<Control>('[data-field-validation-error]')??[]){input.setCustomValidity('');input.removeAttribute('data-field-validation-error');input.removeAttribute('aria-invalid');input.removeAttribute('aria-errormessage')}root.current?.querySelectorAll('.shared-field-error').forEach(x=>x.remove())}},[options.enabled,root])
  return {validateFields:async()=>{if(validating.current)return false;validating.current=true;try{return await run.current(true)}finally{validating.current=false}}}
}
