import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Language } from '../../i18n'
import { finishWindowsColorSampler, openWindowsColorSampler, stopWindowsColorSampler, type WindowsSamplerMessage } from './WindowsColorSamplerClient'

type ColorValue = string | undefined
type Hsv = [number, number, number]
type Hsl = [number, number, number]
type ColorProposal = { color: ColorValue; hsv: Hsv; hsl: Hsl; hexInput: string; shadeBase: string; shadeBaseHsl: Hsl; ryb: [number, number, number] }
type Props = {
  language: Language
  label: string
  value: string
  disabled?: boolean
  mixed?: boolean
  onCommit: (value: ColorValue) => void
  onPreview?: (value: ColorValue | null) => void
}

// Colors sampled from the user's Excel reference; each column contains its base and five shades.
const themeColorColumns = [
  ['#ffffff', '#f2f2f2', '#d8d8d8', '#bfbfbf', '#a5a5a5', '#7f7f7f'],
  ['#000000', '#7f7f7f', '#595959', '#3f3f3f', '#262626', '#0c0c0c'],
  ['#e8e8e8', '#d0d0d0', '#aeaeae', '#747474', '#3a3a3a', '#171717'],
  ['#0e2841', '#dbe9f7', '#a6c9eb', '#4d94d8', '#215e99', '#153d64'],
  ['#156082', '#c1e4f5', '#83caeb', '#45b0e1', '#0f4861', '#0a3041'],
  ['#e97132', '#fae2d6', '#f6c6ac', '#f1a984', '#bf4f14', '#7f340d'],
  ['#196b24', '#c1f0c8', '#84e291', '#47d45a', '#12501b', '#0c3512'],
  ['#0f9ed5', '#caedfb', '#95dcf7', '#60cbf3', '#0b769f', '#074f6a'],
  ['#a02b93', '#f1ceee', '#e49edd', '#d76dcc', '#78206e', '#501549'],
  ['#4ea72e', '#d9f2d0', '#b3e5a1', '#8ed873', '#3a7d22', '#265316'],
]
const standardColors = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0']
const recentColorsKey = 'yarn-trade-recent-colors-v1'
let activePickerToken: object | null = null

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function mergeRecentColors(colors: unknown, selected?: ColorValue): string[] {
  const candidates = [selected, ...(Array.isArray(colors) ? colors : [])]
  return [...new Set(candidates.filter((color): color is string => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)).map(color => color.toLowerCase()))].slice(0, 12)
}

function readRecentColors(): string[] {
  try { return mergeRecentColors(JSON.parse(localStorage.getItem(recentColorsKey) ?? '[]')) }
  catch { return [] }
}

function hexToRgb(value: string): [number, number, number] {
  const match = value.match(/^#([\da-f]{6})$/i)
  if (!match) return [0, 0, 0]
  return [Number.parseInt(match[1].slice(0, 2), 16), Number.parseInt(match[1].slice(2, 4), 16), Number.parseInt(match[1].slice(4, 6), 16)]
}

function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')
}

// RYB controls are converted to display RGB, rather than relabeling the green channel.
// Reference: https://gist.github.com/SEVEZ/3dfa1f7807dab5379fe3
function convertChannels(channels: [number, number, number], toRyb: boolean): [number, number, number] {
  const white = Math.min(...channels)
  const [first, middle, last] = channels.map(channel => channel - white)
  let components: [number, number, number]
  if (toRyb) {
    const yellow = Math.min(first, middle)
    const green = middle - yellow
    const factor = green > 0 && last > 0 ? 0.5 : 1
    components = [first - yellow, yellow + green * factor, (last + green) * factor]
  } else {
    const green = Math.min(middle, last)
    const yellow = middle - green
    const factor = last > green && green > 0 ? 2 : 1
    components = [first + yellow, green * factor + yellow, (last - green) * factor]
  }
  const peak = Math.max(...components)
  const scale = peak > 0 ? Math.max(first, middle, last) / peak : 0
  return components.map(channel => clamp(Math.round(white + channel * scale), 0, 255)) as [number, number, number]
}

export function hexToRyb(color: string): [number, number, number] {
  return convertChannels(hexToRgb(color), true)
}

export function rybToHex(channels: [number, number, number]): string {
  return rgbToHex(convertChannels(channels, false))
}

const grayscaleColors = Array.from({ length: 33 }, (_, index) => {
  const gray = Math.round(255 * (1 - index / 32))
  return rgbToHex([gray, gray, gray])
})

function hexToHsv(value: string): Hsv {
  const [r0, g0, b0] = hexToRgb(value).map(channel => channel / 255)
  const max = Math.max(r0, g0, b0), min = Math.min(r0, g0, b0), delta = max - min
  let hue = 0
  if (delta) {
    if (max === r0) hue = ((g0 - b0) / delta) % 6
    else if (max === g0) hue = (b0 - r0) / delta + 2
    else hue = (r0 - g0) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return [hue, max === 0 ? 0 : delta / max, max]
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  hue = ((hue % 360) + 360) % 360
  const s = clamp(saturation, 0, 1), v = clamp(value, 0, 1)
  const chroma = v * s
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const match = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  const m = v - chroma
  return rgbToHex([255 * (match[0] + m), 255 * (match[1] + m), 255 * (match[2] + m)])
}

function hexToHsl(value: string): Hsl {
  const [r, g, b] = hexToRgb(value).map(channel => channel / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const lightness = (max + min) / 2
  if (!delta) return [0, 0, lightness]
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  hue = (hue * 60 + 360) % 360
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  return [hue, saturation, lightness]
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  hue = ((hue % 360) + 360) % 360
  const s = clamp(saturation, 0, 1), l = clamp(lightness, 0, 1)
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const match = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  const m = l - chroma / 2
  return rgbToHex([255 * (match[0] + m), 255 * (match[1] + m), 255 * (match[2] + m)])
}

function colorProposal(color: ColorValue, previous?: Hsv, shadeBase = color ?? '#808080', hsl = hexToHsl(color ?? '#ff0000'), shadeBaseHsl = hexToHsl(shadeBase)): ColorProposal {
  const hsv = hexToHsv(color ?? '#ff0000')
  // Achromatic colors have no unique hue; retain the user's pointer position.
  if (previous && hsv[2] === 0) { hsv[0] = previous[0]; hsv[1] = previous[1] }
  else if (previous && hsv[1] === 0) hsv[0] = previous[0]
  return { color, hsv, hsl, hexInput: color?.toUpperCase() ?? '', shadeBase, shadeBaseHsl, ryb: hexToRyb(color ?? '#000000') }
}

export function selectColorProposal(previous: ColorProposal, color: ColorValue, fromShade = false): ColorProposal {
  return colorProposal(color, previous.hsv, fromShade ? previous.shadeBase : color ?? '#808080', undefined, fromShade ? previous.shadeBaseHsl : undefined)
}

function hsvProposal(hsv: Hsv): ColorProposal {
  const color = hsvToHex(...hsv)
  return { ...colorProposal(color), hsv }
}

function createHoneycombColors(radius = 8) {
  const tiles: { q: number; r: number; x: number; y: number; color: string }[] = []
  for (let r = -radius; r <= radius; r++) for (let q = Math.max(-radius, -r - radius); q <= Math.min(radius, -r + radius); q++) {
    const x = Math.sqrt(3) * (q + r / 2), y = 1.5 * r
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
    const hue = ((Math.atan2(y, x) * 180 / Math.PI) + 660) % 360
    // Excel places greens on the left, blues above and reds below, with a dark outer ring.
    const saturation = ring / radius, value = 1 - 0.45 * clamp((saturation - 0.625) / 0.375, 0, 1)
    tiles.push({ q, r, x: 150 + x * 10, y: 132 + y * 10, color: hsvToHex(hue, saturation, value) })
  }
  return tiles
}
const honeycombColors = createHoneycombColors()
const hexagonPoints = Array.from({ length: 6 }, (_, index) => {
  const angle = (-90 + index * 60) * Math.PI / 180
  return `${Math.cos(angle) * 9.9},${Math.sin(angle) * 9.9}`
}).join(' ')

const grayscaleTiles = grayscaleColors.map((color, index) => {
  if (index === 0 || index === grayscaleColors.length - 1) {
    return { color, x: index === 0 ? 13 : 215, y: 18, scale: 1.25 }
  }
  const slot = index - 1, row = slot % 2, column = Math.floor(slot / 2)
  return { color, x: 35 + (column + row / 2) * Math.sqrt(3) * 6, y: 13.5 + row * 9, scale: 6 / 9.9 }
})

export function colorShadeRamp(base: string | Hsl): string[] {
  const [hue, saturation, lightness] = typeof base === 'string' ? hexToHsl(base) : base
  const levels = [lightness + (1 - lightness) * 0.75, lightness + (1 - lightness) * 0.5, lightness + (1 - lightness) * 0.25, lightness, lightness * 0.75, lightness * 0.5, lightness * 0.25]
  return levels.map(level => hslToHex(hue, saturation, level))
}

function displayColor(value: ColorValue): string {
  return value ?? 'transparent'
}

type PickerStage = 'closed' | 'quick' | 'standard' | 'custom'
export function colorPickerNavigation(stage: PickerStage, action: 'open' | 'more' | 'standard' | 'custom' | 'back' | 'close'): PickerStage {
  if (action === 'open') return 'quick'
  if (action === 'more' || action === 'standard') return 'standard'
  if (action === 'custom') return 'custom'
  if (action === 'back') return stage === 'custom' ? 'standard' : stage === 'standard' ? 'quick' : stage
  return 'closed'
}

export function ExcelColorPicker({ language, label, value, disabled = false, mixed = false, onCommit, onPreview }: Props) {
  const fa = language === 'fa'
  const zh = language === 'zh'
  const word = (faText: string, enText: string, zhText: string) => fa ? faText : zh ? zhText : enText
  const [hoveredColor, setHoveredColor] = useState<ColorValue | null>(null)
  const [stage, setStage] = useState<PickerStage>('closed')
  const open = stage !== 'closed'
  const dialogOpen = stage === 'standard' || stage === 'custom'
  const navigate = (action: Parameters<typeof colorPickerNavigation>[1]) => { setHoveredColor(null); setStage(current => colorPickerNavigation(current, action)) }
  const [original, setOriginal] = useState<ColorValue>(value)
  const [proposed, setProposed] = useState<ColorProposal>(() => colorProposal(value))
  const draft = proposed.color
  const previewActive = useRef(false)
  const updateHoverPreview = (color: ColorValue | null) => { setHoveredColor(color); if (previewActive.current) onPreview?.(color === null ? draft : color) }
  const [spectrumHue, spectrumSaturation, spectrumValue] = proposed.hsv
  const [lightnessHue, lightnessSaturation, lightness] = proposed.hsl
  const pickerToken = useRef<object>({})
  const pointerAction = useRef(false)
  const windowsSamplerActive = useRef(false)
  const samplerCustomEditing = useRef(false)
  const windowsSamplerBaseColor = useRef<ColorValue>(value)
  const samplerReturnStage = useRef<PickerStage>('quick')
  const commitTarget = useRef(onCommit)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
  const popupPositionInitialized = useRef(false)
  const popupDrag = useRef<{ pointerId: number; startX: number; startY: number; top: number; left: number } | null>(null)
  const [eyeDropperMessage, setEyeDropperMessage] = useState('')
  const [samplerInstallPrompt, setSamplerInstallPrompt] = useState(false)
  const [recentColors, setRecentColors] = useState(readRecentColors)

  const constrainPopupPosition = (top: number, left: number) => {
    const width = Math.min(430, Math.max(0, window.innerWidth - 16))
    const height = Math.min(700, Math.max(0, window.innerHeight - 16))
    return { top: Math.max(8, Math.min(window.innerHeight - height - 8, top)), left: Math.max(8, Math.min(window.innerWidth - width - 8, left)) }
  }
  const startPopupDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button,input,select,textarea,a'))) return
    event.preventDefault(); event.stopPropagation()
    popupDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...popoverPosition }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some embedded browsers. */ }
  }
  const movePopupDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = popupDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPopoverPosition(constrainPopupPosition(drag.top + event.clientY - drag.startY, drag.left + event.clientX - drag.startX))
  }
  const endPopupDrag = (event: ReactPointerEvent<HTMLDivElement>) => { if (popupDrag.current?.pointerId === event.pointerId) popupDrag.current = null }

  const rgb = useMemo(() => hexToRgb(draft ?? '#000000'), [draft])
  const setDraftColor = (next: ColorValue, fromShade = false) => {
    setHoveredColor(null)
    setProposed(previous => selectColorProposal(previous, next, fromShade))
    if (previewActive.current) onPreview?.(next)
  }
  const openPicker = () => {
    if (activePickerToken && activePickerToken !== pickerToken.current) return
    activePickerToken = pickerToken.current
    previewActive.current = true
    samplerCustomEditing.current = false
    pointerAction.current = false
    commitTarget.current = onCommit
    setOriginal(value)
    setProposed(colorProposal(value))
    onPreview?.(null)
    setRecentColors(mergeRecentColors(readRecentColors(), value))
    navigate('open')
  }
  const closePicker = () => {
    windowsSamplerActive.current = false
    if (samplerCustomEditing.current) { samplerCustomEditing.current = false; finishWindowsColorSampler() }
    else stopWindowsColorSampler()
    previewActive.current = false
    setProposed(colorProposal(original))
    onPreview?.(null)
    navigate('close')
    if (activePickerToken === pickerToken.current) activePickerToken = null
  }
  const commitColor = (next: ColorValue) => {
    windowsSamplerActive.current = false
    if (samplerCustomEditing.current) { samplerCustomEditing.current = false; finishWindowsColorSampler() }
    else stopWindowsColorSampler()
    previewActive.current = false
    if ((next ?? '').toLowerCase() !== (original ?? '').toLowerCase()) commitTarget.current(next)
    if (next) {
      const nextRecentColors = mergeRecentColors(mergeRecentColors(readRecentColors(), original), next)
      setRecentColors(nextRecentColors)
      try { localStorage.setItem(recentColorsKey, JSON.stringify(nextRecentColors)) } catch { /* Keep this picker usable when storage is unavailable. */ }
    }
    onPreview?.(null)
    navigate('close')
    if (activePickerToken === pickerToken.current) activePickerToken = null
  }
  const confirm = () => commitColor(draft)
  const handleWindowsSamplerMessage = (message: WindowsSamplerMessage) => {
    if (message.type === 'error') { windowsSamplerActive.current = false; setStage(samplerReturnStage.current); setEyeDropperMessage(word('همراه ویندوزی قطره‌چکان در دسترس نیست.', 'The Windows eyedropper companion is unavailable.', 'Windows 屏幕取色组件不可用。')); setSamplerInstallPrompt(true); return }
    if (message.type === 'ready') { setEyeDropperMessage(''); setSamplerInstallPrompt(false); return }
    if (message.type === 'edit-custom') {
      const colors = (message.colors ?? []).filter(color => /^#[\da-f]{6}$/i.test(color)).map(color => color.toLowerCase())
      const selected = message.color && /^#[\da-f]{6}$/i.test(message.color) ? message.color.toLowerCase() : colors.at(-1)
      if (!selected) return
      const nextRecentColors = mergeRecentColors([...colors].reverse(), selected)
      setRecentColors(nextRecentColors)
      try { localStorage.setItem(recentColorsKey, JSON.stringify(nextRecentColors)) } catch { /* Keep the picker usable when storage is unavailable. */ }
      windowsSamplerActive.current = false
      samplerCustomEditing.current = true
      setEyeDropperMessage('')
      setSamplerInstallPrompt(false)
      setHoveredColor(null)
      setProposed(colorProposal(selected))
      if (previewActive.current) onPreview?.(selected)
      setStage('custom')
      window.focus()
      return
    }
    if (message.type === 'back' || message.type === 'cancel') {
      windowsSamplerActive.current = false
      setEyeDropperMessage('')
      if (message.type === 'cancel') setDraftColor(windowsSamplerBaseColor.current)
      else if (message.color && /^#[\da-f]{6}$/i.test(message.color)) setDraftColor(message.color.toLowerCase())
      if (message.type === 'back') setStage(samplerReturnStage.current)
      window.focus()
      return
    }
    if (!message.color || !/^#[\da-f]{6}$/i.test(message.color)) return
    const color = message.color.toLowerCase()
    if (message.type === 'confirm') {
      windowsSamplerActive.current = false
      samplerCustomEditing.current = false
      setEyeDropperMessage('')
      commitColor(color)
      window.focus()
      return
    }
    if (message.type === 'hover' || message.type === 'sample') setDraftColor(color)
  }
  const spectrumAtPointer = (event: ReactPointerEvent<HTMLDivElement>): Hsv => {
    const rect = event.currentTarget.getBoundingClientRect()
    const hue = Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360)
    const saturation = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1)
    return [hue, saturation, spectrumValue]
  }
  const chooseSpectrum = (event: ReactPointerEvent<HTMLDivElement>) => {
    const [hue, saturation] = spectrumAtPointer(event)
    setHoveredColor(null)
    const next = hsvProposal([hue, saturation, proposed.hsv[2]])
    setProposed(next)
    onPreview?.(next.color)
  }
  const valueAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1)
  }
  const chooseValue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextLightness = valueAtPointer(event)
    setHoveredColor(null)
    const nextHsl: Hsl = [lightnessHue, lightnessSaturation, nextLightness]
    const nextColor = hslToHex(...nextHsl)
    const next = colorProposal(nextColor, proposed.hsv, nextColor, nextHsl, nextHsl)
    setProposed(next)
    onPreview?.(next.color)
  }
  const beginColorPointer = (event: ReactPointerEvent<HTMLDivElement>, choose: typeof chooseSpectrum) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    choose(event)
  }
  const moveColorPointer = (event: ReactPointerEvent<HTMLDivElement>, choose: typeof chooseSpectrum, previewColor: (event: ReactPointerEvent<HTMLDivElement>) => string) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) choose(event)
    else updateHoverPreview(previewColor(event))
  }
  const updateRyb = (index: number, next: number) => {
    const channels: [number, number, number] = [...proposed.ryb]
    channels[index] = clamp(Number.isFinite(next) ? next : 0, 0, 255)
    const nextProposal = { ...selectColorProposal(proposed, rybToHex(channels)), ryb: channels }
    setProposed(nextProposal)
    onPreview?.(nextProposal.color)
  }
  const updateHex = (next: string) => {
    const normalized = next.startsWith('#') ? next : `#${next}`
    if (/^#[\da-f]{6}$/i.test(normalized)) setDraftColor(normalized.toLowerCase())
    else setProposed(previous => ({ ...previous, hexInput: next }))
  }
  const captureActionPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some test DOMs. */ }
  }
  const confirmFromPointer = (event: ReactPointerEvent<HTMLButtonElement>) => { event.stopPropagation(); if (pointerAction.current) return; pointerAction.current = true; confirm() }
  const cancelFromPointer = (event: ReactPointerEvent<HTMLButtonElement>) => { event.stopPropagation(); if (pointerAction.current) return; pointerAction.current = true; closePicker() }
  const confirmFromMouse = (event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); if (pointerAction.current) return; pointerAction.current = true; confirm() }
  const cancelFromMouse = (event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); if (pointerAction.current) return; pointerAction.current = true; closePicker() }
  const confirmFromClick = (event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); if (pointerAction.current) { pointerAction.current = false; return } confirm() }
  const cancelFromClick = (event: ReactMouseEvent<HTMLButtonElement>) => { event.stopPropagation(); if (pointerAction.current) { pointerAction.current = false; return } closePicker() }
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker() } }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, original])
  useEffect(() => {
    if (!open || dialogOpen) return
    const onOutsidePointer = (event: PointerEvent) => {
      if (windowsSamplerActive.current) return
      if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) closePicker()
    }
    document.addEventListener('pointerdown', onOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', onOutsidePointer, true)
  }, [open, dialogOpen, original])
  useEffect(() => {
    if (!open) { popupPositionInitialized.current = false; return }
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      if (popupPositionInitialized.current) { setPopoverPosition(position => constrainPopupPosition(position.top, position.left)); return }
      const rect = trigger.getBoundingClientRect(), width = Math.min(430, window.innerWidth - 16), quickWidth = Math.min(378, window.innerWidth - 32), estimatedHeight = Math.min(700, window.innerHeight - 16)
      const left = fa ? rect.right - quickWidth : rect.left
      const top = rect.bottom + 6 + estimatedHeight > window.innerHeight ? rect.top - estimatedHeight - 6 : rect.bottom + 6
      setPopoverPosition(constrainPopupPosition(top, left))
      popupPositionInitialized.current = true
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [open, fa])
  useEffect(() => () => { if (activePickerToken === pickerToken.current) activePickerToken = null }, [])

  const selectedColorShades = colorShadeRamp(proposed.shadeBaseHsl)
  const grayLevel = Math.round((rgb[0] + rgb[1] + rgb[2]) / 3)
  const grayHex = rgbToHex([grayLevel, grayLevel, grayLevel])
  const hoverEvents = (color: ColorValue) => ({ onMouseEnter: () => updateHoverPreview(color), onMouseLeave: () => updateHoverPreview(null), onFocus: () => updateHoverPreview(color), onBlur: () => updateHoverPreview(null) })
  const swatch = (color: string, index: number) => <button key={`${color}-${index}`} type="button" className="excel-color-swatch" aria-label={color} aria-pressed={draft?.toLowerCase() === color.toLowerCase()} title={color} style={{ '--excel-swatch': color } as CSSProperties} {...hoverEvents(color)} onClick={event => { event.stopPropagation(); if (stage === 'quick') commitColor(color); else setDraftColor(color) }} />
  const shadeSwatch = (color: string, index: number) => <button key={`shade-${index}`} type="button" className="excel-color-swatch" aria-label={color} aria-pressed={draft === color} title={color} style={{ '--excel-swatch': color } as CSSProperties} {...hoverEvents(color)} onClick={event => { event.stopPropagation(); setDraftColor(color, true) }} />
  const screenPicker = <button type="button" className="excel-screen-picker" aria-label={word('قطره‌چکان ویندوز', 'Windows eyedropper', 'Windows 屏幕取色')} title={word('باز کردن ذره‌بین مستقل ویندوز', 'Open standalone Windows loupe', '打开独立 Windows 放大镜')} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); windowsSamplerBaseColor.current = original; samplerReturnStage.current = stage === 'closed' ? 'quick' : stage; windowsSamplerActive.current = true; setEyeDropperMessage(word('در حال اتصال به ذره‌بین ویندوز…', 'Connecting to the Windows loupe…', '正在连接 Windows 放大镜…')); setHoveredColor(null); setStage('closed'); void openWindowsColorSampler(original ?? null, handleWindowsSamplerMessage).then(active => { windowsSamplerActive.current = active }) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6.5 3.5-3.5a2.1 2.1 0 0 1 3 3l-3.5 3.5M13 5l6 6M14 6l-9 9-1 5 5-1 9-9M6 16l2 2" /></svg></button>
  const isWindowsBrowser = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
  const isLoopbackApp = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(window.location.hostname))
  const samplerMessage = eyeDropperMessage && <div className="excel-screen-picker-message" role="status">
    <span>{eyeDropperMessage}</span>
    {samplerInstallPrompt && (!isWindowsBrowser ? <small>{word('این قطره‌چکان فقط برای ویندوز ارائه شده است.', 'The native sampler is available for Windows only.', '此原生取色器仅支持 Windows。')}</small> : <>
      {!isLoopbackApp && <small>{word('این نسخهٔ وبِ راه دور برای اتصال به همراه ویندوزی به تنظیم امن دامنه نیاز دارد؛ نصب به‌تنهایی کافی نیست.', 'This remotely hosted app needs a trusted local companion connection configured for its domain; installing the file alone is not sufficient.', '远程托管版本需要为其域名配置可信的本地组件连接；仅安装文件还不够。')}</small>}
      <strong>{word('نسخهٔ متناسب ویندوز را انتخاب کنید:', 'Choose the matching Windows version:', '请选择适用于 Windows 的版本：')}</strong>
      <div className="excel-sampler-downloads"><a href={`${import.meta.env.BASE_URL}downloads/win-x64/YarnTrade.ColorSampler.exe`} download>{word('دانلود ۶۴ بیتی (x64)', 'Download 64-bit (x64)', '下载 64 位 (x64)')}</a><a href={`${import.meta.env.BASE_URL}downloads/win-x86/YarnTrade.ColorSampler.exe`} download>{word('دانلود ۳۲ بیتی (x86)', 'Download 32-bit (x86)', '下载 32 位 (x86)')}</a></div>
      <small>{word('فایل را اجرا کنید تا برای همین کاربر نصب شود؛ .NET جداگانه یا دسترسی مدیر لازم نیست. سپس دوباره قطره‌چکان را بزنید.', 'Run the file to install it for this user; no separate .NET setup or administrator access is needed. Then click the eyedropper again.', '运行文件即可为当前用户安装；无需单独安装 .NET 或管理员权限。之后再次点击屏幕取色器。')}</small>
    </>)}
  </div>
  const preview = (caption: string, color: ColorValue) => <div className="excel-color-preview"><span>{caption}</span><i className={color ? undefined : 'is-transparent'} style={{ backgroundColor: color ?? undefined }} aria-label={color ?? word('بدون رنگ', 'No color', '无颜色')} /></div>
  const comparisonPreviews = <>{preview(word('رنگ فعلی', 'Current Color', '当前颜色'), original)}{preview(word('رنگ جدید', 'New Color', '新颜色'), hoveredColor === null ? draft : hoveredColor)}</>
  const recentPalette = <div className="excel-recent-colors"><strong>{word('رنگ‌های اخیر (Recent)', 'Recent Colors', '最近使用的颜色')}</strong>{recentColors.length ? <div className="excel-recent-palette" dir="ltr">{recentColors.map(swatch)}</div> : <span>{word('هنوز رنگی تأیید نشده است', 'No colors confirmed yet', '尚未确认颜色')}</span>}</div>
  const dialog = dialogOpen && <div className={'excel-color-dialog-backdrop' + (stage === 'custom' ? ' is-custom' : '')} role="presentation" onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) closePicker() }}><section className={'excel-color-dialog' + (stage === 'custom' ? ' is-custom' : '')} style={{ top: popoverPosition.top, left: popoverPosition.left }} role="dialog" aria-modal="true" aria-label={word('رنگ‌های بیشتر', 'More Colors', '更多颜色')} dir={fa ? 'rtl' : 'ltr'} onPointerDown={event => event.stopPropagation()}>
    <div className="excel-color-dialog-heading" onPointerDown={startPopupDrag} onPointerMove={movePopupDrag} onPointerUp={endPopupDrag} onPointerCancel={endPopupDrag}><strong>{word('رنگ‌های بیشتر', 'More Colors', '更多颜色')}</strong><div className="excel-color-dialog-tools">{screenPicker}<button type="button" aria-label={word('بستن', 'Close', '关闭')} onClick={event => { event.stopPropagation(); closePicker() }}>×</button></div></div>
    {samplerMessage}
    <div className="excel-color-dialog-previews">{comparisonPreviews}</div>
    <div className="excel-color-tabs"><button type="button" aria-selected={stage === 'standard'} onClick={() => navigate('standard')}>{word('استاندارد', 'Standard', '标准')}</button><button type="button" aria-selected={stage === 'custom'} onClick={() => navigate('custom')}>{word('سفارشی', 'Custom', '自定义')}</button></div>
    {stage === 'standard' ? <div className="excel-standard-palette"><svg className="excel-honeycomb" viewBox="0 0 300 264" aria-label={word('کندوی رنگ‌ها', 'Color honeycomb', '蜂窝颜色')}>
      {honeycombColors.map(tile => <polygon key={`${tile.q},${tile.r}`} className="excel-honeycomb-tile" points={hexagonPoints} transform={`translate(${tile.x},${tile.y})`} fill={tile.color} role="button" tabIndex={0} aria-label={tile.color} aria-pressed={draft?.toLowerCase() === tile.color} {...hoverEvents(tile.color)} onClick={event => { event.stopPropagation(); setDraftColor(tile.color) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setDraftColor(tile.color) } }}><title>{tile.color.toUpperCase()}</title></polygon>)}
    </svg><svg className="excel-grayscale" viewBox="0 0 230 36" aria-label={word('طیف خاکستری از روشن تا مشکی', 'Grayscale from light to black', '从浅灰到黑色的灰度')}>{grayscaleTiles.map(tile => <polygon key={tile.color} className="excel-honeycomb-tile" points={hexagonPoints} transform={`translate(${tile.x},${tile.y}) scale(${tile.scale})`} fill={tile.color} role="button" tabIndex={0} aria-label={tile.color} aria-pressed={draft?.toLowerCase() === tile.color} {...hoverEvents(tile.color)} onClick={event => { event.stopPropagation(); setDraftColor(tile.color) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setDraftColor(tile.color) } }}><title>{tile.color.toUpperCase()}</title></polygon>)}</svg></div> : <div className="excel-custom-editor">
      <div className="excel-custom-spectrum-row" dir="ltr"><div className="excel-spectrum" role="slider" aria-label={word('طیف رنگ', 'Color spectrum', '颜色光谱')} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(spectrumHue)} aria-valuetext={draft?.toUpperCase()} tabIndex={0} style={{ '--excel-spectrum-hue': spectrumHue / 360 * 100, '--excel-spectrum-saturation': spectrumSaturation * 100, '--excel-spectrum-value': spectrumValue } as CSSProperties} onPointerDown={event => beginColorPointer(event, chooseSpectrum)} onPointerMove={event => moveColorPointer(event, chooseSpectrum, pointer => hsvToHex(...spectrumAtPointer(pointer)))} onPointerLeave={() => updateHoverPreview(null)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const next = hsvProposal([clamp(proposed.hsv[0] + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), 0, 360), clamp(proposed.hsv[1] + (event.key === 'ArrowUp' ? 0.01 : event.key === 'ArrowDown' ? -0.01 : 0), 0, 1), proposed.hsv[2]])
        setHoveredColor(null); setProposed(next); onPreview?.(next.color)
      }} /><div className="excel-value-slider" role="slider" aria-label={word('تنظیم روشنایی', 'Color adjustment', '颜色调整')} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lightness * 100)} tabIndex={0} style={{ '--excel-value-color': hslToHex(lightnessHue, lightnessSaturation, 0.5), '--excel-value-position': (1 - lightness) * 100 } as CSSProperties} onPointerDown={event => beginColorPointer(event, chooseValue)} onPointerMove={event => moveColorPointer(event, chooseValue, pointer => hslToHex(lightnessHue, lightnessSaturation, valueAtPointer(pointer)))} onPointerLeave={() => updateHoverPreview(null)} onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const nextLightness = event.key === 'Home' ? 1 : event.key === 'End' ? 0 : clamp(lightness + (event.key === 'ArrowUp' ? 0.01 : -0.01), 0, 1)
        const nextHsl: Hsl = [lightnessHue, lightnessSaturation, nextLightness]
        const nextColor = hslToHex(...nextHsl)
        const next = colorProposal(nextColor, proposed.hsv, nextColor, nextHsl, nextHsl)
        setHoveredColor(null); setProposed(next); onPreview?.(next.color)
      }} /></div>
      <div className="excel-selected-shades" aria-label={word('روشنایی و تیرگی رنگ انتخابی', 'Lighter and darker shades of selected color', '所选颜色的明暗')}><span>{word('روشن‌تر / تیره‌تر', 'Lighter / darker', '更浅 / 更深')}</span><div dir="ltr">{selectedColorShades.map(shadeSwatch)}</div></div>
      <label className="excel-gray-slider">{word('خاکستری خنثی', 'Neutral gray', '中性灰')}<input type="range" min="0" max="255" value={grayLevel} onChange={event => { const gray = Number(event.target.value); setDraftColor(rgbToHex([gray, gray, gray])) }} /><output>{grayHex}</output></label>
      <div className="excel-color-values"><label>HEX<input aria-label={`${label} HEX`} value={proposed.hexInput} placeholder="#RRGGBB" onChange={event => updateHex(event.target.value)} onBlur={() => setProposed(previous => ({ ...previous, hexInput: previous.color?.toUpperCase() ?? '' }))} /></label><div className="excel-rgb-values" aria-label={`${label} RYB`}>{proposed.ryb.map((channel, index) => <label key={['R', 'Y', 'B'][index]}>{[word('قرمز (R)', 'Red (R)', '红色 (R)'), word('زرد (Y)', 'Yellow (Y)', '黄色 (Y)'), word('آبی (B)', 'Blue (B)', '蓝色 (B)')][index]}<input aria-label={`${label} RYB ${['R', 'Y', 'B'][index]}`} type="number" min="0" max="255" value={channel} onChange={event => updateRyb(index, Number(event.target.value))} /></label>)}</div></div>
    </div>}
    {recentPalette}
    <div className="excel-color-dialog-actions"><button type="button" onClick={event => { event.stopPropagation(); navigate('back') }}>{word('بازگشت', 'Back', '返回')}</button><button type="button" onMouseDown={cancelFromMouse} onPointerDown={event => { captureActionPointer(event); cancelFromPointer(event) }} onClick={cancelFromClick}>{word('لغو', 'Cancel', '取消')}</button><button type="button" className="primary" onMouseDown={confirmFromMouse} onPointerDown={event => { captureActionPointer(event); confirmFromPointer(event) }} onClick={confirmFromClick}>{word('تأیید', 'OK', '确定')}</button></div>
  </section></div>

  const popover = open && !dialogOpen && <div ref={popoverRef} className="excel-color-popover" role="dialog" aria-label={`${label} ${word('رنگ', 'color', '颜色')}`} dir={fa ? 'rtl' : 'ltr'} style={{ top: popoverPosition.top, left: popoverPosition.left }} onPointerDown={event => event.stopPropagation()}>
      <div className="excel-color-popover-heading" onPointerDown={startPopupDrag} onPointerMove={movePopupDrag} onPointerUp={endPopupDrag} onPointerCancel={endPopupDrag}><strong>{label}</strong><div className="excel-color-dialog-tools">{screenPicker}<button type="button" aria-label={word('بستن', 'Close', '关闭')} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); closePicker() }}>×</button></div></div>
      {samplerMessage}
      <section className="excel-quick-section" aria-label={word('رنگ‌های تم', 'Theme Colors', '主题颜色')}><strong className="excel-quick-title">{word('رنگ‌های تم', 'Theme Colors', '主题颜色')}</strong><div className="excel-quick-theme-grid" dir="ltr">{themeColorColumns.map((column, index) => <div className="excel-theme-color-column" key={index}>{swatch(column[0], index)}<div className="excel-theme-shade-column">{column.slice(1).map(swatch)}</div></div>)}</div></section>
      <section className="excel-quick-section" aria-label={word('رنگ‌های اصلی', 'Standard Colors', '标准颜色')}><strong className="excel-quick-title">{word('رنگ‌های اصلی', 'Standard Colors', '标准颜色')}</strong><div className="excel-primary-palette" dir="ltr">{standardColors.map(swatch)}</div></section>
      {recentPalette}
      <button type="button" className="excel-no-color excel-quick-command" aria-pressed={!draft} {...hoverEvents(undefined)} onClick={event => { event.stopPropagation(); commitColor(undefined) }}><i className="excel-no-fill-icon" aria-hidden="true" /><span>{word('بدون رنگ', 'No Fill', '无填充')}</span></button>
      <button type="button" className="excel-more-colors excel-quick-command" onClick={event => { event.stopPropagation(); navigate('more') }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.6 1.6 0 0 1 1.2-2.7H18a3 3 0 0 0 3-3c0-5-4-9-9-9Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="1.3" fill="#e97132" /><circle cx="13" cy="6.5" r="1.3" fill="#196b24" /><circle cx="17" cy="10" r="1.3" fill="#0f9ed5" /><circle cx="7" cy="13" r="1.3" fill="#a02b93" /></svg><span>{word('رنگ‌های بیشتر...', 'More Colors...', '更多颜色...')}</span></button>
      <div className="excel-color-popover-previews">{comparisonPreviews}</div>
    </div>
  return <div className={'excel-color-picker' + (open ? ' is-open' : '')}>
    <button ref={triggerRef} type="button" className="excel-color-trigger" aria-label={`${label} ${word('انتخاب رنگ', 'color', '颜色')}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={event => { event.stopPropagation(); if (open) closePicker(); else openPicker() }}><i className={value ? undefined : 'is-transparent'} style={{ backgroundColor: value || undefined }} />{mixed && <small>{word('متفاوت', 'Mixed', '不同')}</small>}<span>{value.toUpperCase()}</span></button>
    {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    {typeof document !== 'undefined' && dialog ? createPortal(dialog, document.body) : null}
    <input type="color" hidden tabIndex={-1} aria-hidden="true" value={draft ?? '#000000'} readOnly />
  </div>
}
