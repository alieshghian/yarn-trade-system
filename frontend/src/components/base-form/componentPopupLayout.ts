export type ComponentPopupLanguage = 'fa' | 'en' | 'zh'

export function estimateComponentPopupWidth(options: {
  fieldWidth: number
  minListWidth?: number
  configuredWidth?: number
  viewportWidth: number
  measureText: (text: string) => number
  content: readonly string[]
  horizontalPadding?: number
  viewportGutter?: number
  minimumActionWidth?: number
}): number {
  const gutter = options.viewportGutter ?? 12
  const padding = options.horizontalPadding ?? 40
  const sixCharacterWidth = Math.max(options.measureText('MMMMMM'), options.measureText('مممممم')) + padding
  const contentWidth = options.content.reduce((width, text) => Math.max(width, options.measureText(text) + padding), 0)
  // Explicit Designer width wins; automatic sizing alone follows field/content.
  const preferred = options.configuredWidth && Number.isFinite(options.configuredWidth)
    ? Math.max(80, options.configuredWidth)
    : Math.max(options.fieldWidth, options.minListWidth ?? 0, options.minimumActionWidth ?? 0, sixCharacterWidth, contentWidth)
  return Math.max(0, Math.min(preferred, options.viewportWidth - gutter * 2))
}

export function componentPopupLeft(options: {
  language: ComponentPopupLanguage
  fieldLeft: number
  fieldRight: number
  width: number
  viewportWidth: number
  viewportGutter?: number
}): number {
  const gutter = options.viewportGutter ?? 12
  const preferredLeft = options.language === 'fa' ? options.fieldRight - options.width : options.fieldLeft
  return Math.max(gutter, Math.min(preferredLeft, options.viewportWidth - options.width - gutter))
}
