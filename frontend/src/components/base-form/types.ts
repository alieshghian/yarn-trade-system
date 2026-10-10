import type { ReactNode } from 'react'

export type BaseFormField = { id: string, sectionId: string, minTracks: number, span: number }
export type BaseFormSectionDefinition = { id: string, kind: 'editor' | 'grid' | 'footer' }
export type BaseFormDefinition = { id: string, sections: BaseFormSectionDefinition[], fields: BaseFormField[] }

// These extension points describe the next designer phase. They intentionally have no runtime UI yet.
export type DesignerExtensionPoints = {
  selection: 'all-fields-and-multi-field', propertyOverrides: 'per-property', typography: 'family-size-weight-italic',
  colors: 'background-foreground-border-and-states', interaction: 'live-preview-resize-drag-drop',
  history: 'undo-redo-save-cancel-reset', persistence: 'administrator-defaults-and-personal-settings'
}

export type FormSectionProps = { id: string, children: ReactNode, className?: string }
