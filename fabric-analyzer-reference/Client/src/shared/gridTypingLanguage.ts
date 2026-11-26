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
