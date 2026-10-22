import type { InputHTMLAttributes } from 'react'

export type CodeCharacterMode = 'number' | 'letters' | 'alphanumeric'
export type CodeSegment = { kind: 'number' | 'letters'; length: number; minimum?: 0 | 1 }
export type CodeComponentSettings = {
  mode: CodeCharacterMode; required: boolean; unique: boolean; incremental: boolean; suffixWidth: number
  /** Missing format in saved documents means legacy, never an implicit migration. */
  format?: 'legacy' | 'segments'; fixedLength?: number; maxLength?: number; segments?: CodeSegment[]
  /** Segment indexes, fastest first; default is rightmost first. */
  incrementOrder?: number[]
}
export const defaultCodeComponentSettings: CodeComponentSettings = { mode: 'alphanumeric', required: true, unique: true, incremental: false, suffixWidth: 3, format: 'legacy' }
export function normalizeCodeComponentSettings(value: Partial<CodeComponentSettings> | undefined): CodeComponentSettings {
  const mode = value?.mode === 'number' || value?.mode === 'letters' || value?.mode === 'alphanumeric' ? value.mode : defaultCodeComponentSettings.mode
  return { ...structuredClone(value ?? {}), mode, required: typeof value?.required === 'boolean' ? value.required : true, unique: typeof value?.unique === 'boolean' ? value.unique : true, incremental: typeof value?.incremental === 'boolean' ? value.incremental : false,
    suffixWidth: typeof value?.suffixWidth === 'number' && Number.isFinite(value.suffixWidth) ? Math.max(1, Math.min(12, Math.trunc(value.suffixWidth))) : 3, format: value?.format ?? 'legacy' }
}
/** Form/storage value: preserve user-entered Latin letter case, standardize digits only. */
export const formatComponentCode = (value: string): string => value.trim().replace(/[۰-۹٠-٩]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 0x06f0 : 0x0660)))
/** Comparison/search key only; never use this to replace a user's displayed or saved code. */
export const normalizeComponentCode = (value: string): string => formatComponentCode(value).replace(/[a-z]/g, c => c.toUpperCase())
export function codeSettingsError(settings: CodeComponentSettings): string | undefined {
  if(!['number','letters','alphanumeric'].includes(settings.mode)||!Number.isInteger(settings.suffixWidth)||settings.suffixWidth<1||settings.suffixWidth>12)return 'نوع کد یا طول پسوند نامعتبر است.'
  const length = (n: number | undefined) => n === undefined || Number.isInteger(n) && n >= 1 && n <= 128
  if (!length(settings.fixedLength) || !length(settings.maxLength) || (settings.fixedLength ?? 0) > (settings.maxLength ?? 128)) return 'طول قالب کد نامعتبر است.'
  if (settings.format && !['legacy', 'segments'].includes(settings.format)) return 'قالب کد ناشناخته است.'
  if (settings.format !== 'segments') return
  const parts = settings.segments
  if (!Array.isArray(parts) || !parts.length || parts.length > 16 || parts.some(p => !p || !['number', 'letters'].includes(p.kind) || !Number.isInteger(p.length) || p.length < 1 || p.length > (p.kind === 'number' ? 12 : 64) || p.minimum !== undefined && p.minimum !== 0 && p.minimum !== 1)) return 'بخش‌های قالب کد نامعتبر است.'
  if (parts.some(p => settings.mode === 'number' && p.kind !== 'number' || settings.mode === 'letters' && p.kind !== 'letters')) return 'بخش‌های قالب با نوع کد سازگار نیستند.'
  const total = parts.reduce((n, p) => n + p.length, 0)
  if (total > (settings.maxLength ?? 128) || settings.fixedLength !== undefined && settings.fixedLength !== total) return 'طول بخش‌ها با طول کد سازگار نیست.'
  const order = settings.incrementOrder
  if (order !== undefined && (!Array.isArray(order) || order.length !== parts.length || new Set(order).size !== parts.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= parts.length))) return 'ترتیب افزایش باید هر بخش را دقیقاً یک بار داشته باشد.'
}
export function codeCharactersAllowed(value: string, settings: CodeComponentSettings): boolean {
  const code = normalizeComponentCode(value)
  return (settings.mode === 'number' ? /^[0-9]*$/ : settings.mode === 'letters' ? /^[A-Z]*$/ : settings.format === 'segments' ? /^[A-Z0-9]*$/ : /^[A-Z0-9/_\-.]*$/).test(code)
}
export function validateComponentCode(value: string, settings: CodeComponentSettings, existing: readonly string[] = []): string | undefined {
  const configError = codeSettingsError(settings)
  if (configError) return configError
  const code = normalizeComponentCode(value)
  if (!code) return settings.required ? 'این کد الزامی است.' : undefined
  if (!codeCharactersAllowed(code, settings) || !/[A-Z0-9]/.test(code)) return settings.mode === 'number' ? 'فقط عدد مجاز است.' : settings.mode === 'letters' ? 'فقط حروف انگلیسی A-Z مجاز است.' : 'فقط حروف انگلیسی و عدد و جداکننده‌های قالب قدیمی مجاز است.'
  if (code.length > (settings.maxLength ?? 128)) return 'کد از حداکثر طول مجاز بیشتر است.'
  if (settings.fixedLength !== undefined && code.length !== settings.fixedLength) return 'کد باید دقیقاً ' + settings.fixedLength + ' نویسه باشد.'
  if (settings.format === 'segments') {
    let offset = 0
    for (const part of settings.segments!) {
      const text = code.slice(offset, offset + part.length); offset += part.length
      if (text.length !== part.length || !(part.kind === 'letters' ? /^[A-Z]+$/ : /^[0-9]+$/).test(text) || part.kind === 'number' && BigInt(text) < BigInt(part.minimum ?? 1)) return 'کد با بخش‌های قالب تعیین‌شده سازگار نیست.'
    }
    if (offset !== code.length) return 'کد با طول قالب تعیین‌شده سازگار نیست.'
  }
  if (settings.unique && existing.some(item => normalizeComponentCode(item) === code)) return 'این کد قبلاً استفاده شده است.'
}
function incrementLetters(value: string): string {
  const letters = value.split('')
  for (let i = letters.length - 1; i >= 0; i--) {
    const lower = letters[i] >= 'a' && letters[i] <= 'z'
    const upper = letters[i].toUpperCase()
    if (upper !== 'Z') { const next = String.fromCharCode(upper.charCodeAt(0) + 1); letters[i] = lower ? next.toLowerCase() : next; return letters.join('') }
    letters[i] = lower ? 'a' : 'A'
  }
  return (value[0] >= 'a' && value[0] <= 'z' ? 'a' : 'A') + letters.join('')
}
export type CodeSuggestion = { value: string; error?: string }
/** Values are in successful registration order, never the rendered/sorted order. No code is reserved here. */
export function suggestComponentCode(values: readonly string[], input: Partial<CodeComponentSettings> = defaultCodeComponentSettings): CodeSuggestion {
  const settings = normalizeCodeComponentSettings(input), configError = codeSettingsError(settings)
  if (configError) return { value: '', error: configError }
  const valid = values.map(formatComponentCode).filter(value => value && !validateComponentCode(value, { ...settings, unique: false }, [])), last = valid.at(-1)
  let next: string
  if (settings.format === 'segments') {
    const parts = settings.segments!, chunks: string[] = []; let offset = 0
    for (const part of parts) { chunks.push(last ? last.slice(offset, offset + part.length) : part.kind === 'letters' ? 'A'.repeat(part.length) : String(part.minimum ?? 1).padStart(part.length, '0')); offset += part.length }
    if (last) {
      let carry = true
      for (const index of settings.incrementOrder ?? parts.map((_, i) => parts.length - 1 - i)) {
        const part = parts[index]
        if (part.kind === 'letters') { const value = incrementLetters(chunks[index]); if (value.length <= part.length) { chunks[index] = value; carry = false; break } chunks[index] = chunks[index].replace(/[A-Za-z]/g, char => char >= 'a' && char <= 'z' ? 'a' : 'A') }
        else { const value = BigInt(chunks[index]) + 1n; if (value < 10n ** BigInt(part.length)) { chunks[index] = value.toString().padStart(part.length, '0'); carry = false; break } chunks[index] = String(part.minimum ?? 1).padStart(part.length, '0') }
      }
      if (carry) return { value: '', error: 'ظرفیت قالب کد تکمیل شده است.' }
    }
    next = chunks.join('')
  } else if (settings.mode === 'letters') next = last ? incrementLetters(last) : 'A'.repeat(settings.fixedLength ?? 1)
  else {
    const match = last?.match(/^(.*?)([0-9]+)$/), width = settings.fixedLength ?? settings.suffixWidth
    if (!last) next = '1'.padStart(width, '0')
    else if (!match) next = last + '1'.padStart(settings.suffixWidth, '0')
    else { const prefix = match[1], digits = match[2], number = BigInt(digits) + 1n
      next = settings.mode === 'alphanumeric' && /^[A-Za-z]+$/.test(prefix) && number >= 10n ** BigInt(digits.length) ? incrementLetters(prefix) + '1'.padStart((settings.fixedLength!==undefined?digits.length:Math.max(settings.suffixWidth,digits.length)), '0') : prefix + number.toString().padStart((settings.fixedLength!==undefined&&prefix?digits.length:Math.max(prefix?settings.suffixWidth:width,digits.length)), '0') }
  }
  if (validateComponentCode(next, { ...settings, unique: false })) return { value: '', error: 'ظرفیت یا محدودیت قالب اجازهٔ پیشنهاد کد بعدی را نمی‌دهد.' }
  if (settings.unique && values.some(value => normalizeComponentCode(value) === normalizeComponentCode(next))) return { value: '', error: 'کد بعدی قبلاً ثبت شده است؛ کد موردنظر را دستی وارد کنید.' }
  return { value: next }
}
/** Compatibility entry point retained. Failure is empty, never an out-of-format code. */
export function nextIncrementalCode(values: readonly string[], settings: Partial<CodeComponentSettings> = defaultCodeComponentSettings): string { return suggestComponentCode(values, settings).value }

/** Local input policy only; does not change Windows or other fields. Invalid paste/composition is rejected atomically. */
export function codeInputProps(value: string, settings: CodeComponentSettings, commit: (value: string) => void): InputHTMLAttributes<HTMLInputElement> {
  const accept = (input: HTMLInputElement, text: string, caret?: number) => {
    const next = formatComponentCode(text)
    if (!codeCharactersAllowed(next, settings) || next.length > (settings.maxLength ?? 128)) { input.value = value; return }
    const position=caret??input.selectionStart??next.length
    input.value = next; commit(next)
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(position,position) })
  }
  const insert = (input: HTMLInputElement, text: string) => { const start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start; accept(input, input.value.slice(0, start) + text + input.value.slice(end), start + text.length) }
  return { type: 'text', dir: 'ltr', inputMode: settings.mode === 'number' ? 'numeric' : 'text', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
    onChange: event => { if (!(event.nativeEvent as InputEvent).isComposing) accept(event.currentTarget, event.currentTarget.value) },
    onCompositionEnd: event => accept(event.currentTarget, event.currentTarget.value),
    onPaste: event => { event.preventDefault(); insert(event.currentTarget, event.clipboardData.getData('text')) },
    onKeyDown: event => { if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing && /[^\x00-\x7f]/.test(event.key) && /^Key[A-Z]$/.test(event.code)) { event.preventDefault(); if (settings.mode !== 'number') { const uppercase = Boolean(event.shiftKey) !== Boolean(event.getModifierState?.('CapsLock')); insert(event.currentTarget, uppercase ? event.code.slice(3) : event.code.slice(3).toLowerCase()) } } }
  }
}
