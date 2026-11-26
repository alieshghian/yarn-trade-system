type FunctionKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'which'>

/** Normalize function-key events across browser, keyboard-layout, and legacy event fields. */
export function functionKeyFromEvent(event: FunctionKeyEvent): string | undefined {
  const direct = [event.key, event.code].find(value => /^F(?:[1-9]|1[0-2])$/.test(value))
  if (direct) return direct
  const legacyCode = event.keyCode || event.which
  if (legacyCode >= 112 && legacyCode <= 123) return `F${legacyCode - 111}`
  if (event.key === 'Help' || event.key === 'BrowserHelp' || event.code === 'Help') return 'F1'
  return undefined
}
