import { createContext } from 'react'

export type OperationalGridLayout = { columnWidths?: Record<string, number>; headerHeight?: number; toolbarHeight?: number }

export type OperationalGridCustomization = {
  settingsOpen: boolean
  canResize: boolean
  canResizeSplit: boolean
  editorRatio?: number
  layouts: Record<string, OperationalGridLayout>
  updateLayout: (gridId: string, patch: OperationalGridLayout) => void
  updateEditorRatio: (ratio: number) => void
}

export const OperationalGridCustomizationContext = createContext<OperationalGridCustomization | null>(null)
