import type { CSSProperties, ReactNode, RefObject } from 'react'
import { BaseFormGridBoundary, type BaseFormGridBoundaryProps, type GridColumn } from './BaseFormGridBoundary'
import { BaseFormShell } from './BaseFormShell'
import { designerAppearanceStyle, type DesignerDraft } from './designer'
import type { FormSchemaDraft } from './formSchema'

type PresentationSchema = Pick<FormSchemaDraft, 'id' | 'sections' | 'layout'>
type PresentationGrid<Row> = Omit<BaseFormGridBoundaryProps<Row>, 'rows' | 'columns' | 'language' | 'appearanceStyle' | 'filterPopupFontSize' | 'gridSearchPosition' | 'designerHeaderHeight' | 'designerColumnStyles' | 'designerHeaderStyles' | 'readOnly'> & {
  rows: Row[]
  columns: GridColumn<Row>[]
}

export type FormSchemaPresentationProps<Row> = {
  schema: PresentationSchema
  designerDraft: DesignerDraft
  language: 'fa' | 'en' | 'zh'
  editor: ReactNode
  footer: ReactNode
  grid: PresentationGrid<Row>
  initialHeaderRef?: RefObject<HTMLElement | null>
  initialEditorHeight?: number
  readOnly?: boolean
}

/**
 * Shared frame only: schema owns structure, DesignerDraft owns visuals, and
 * callers supply behavior adapters for editor fields and footer actions.
 */
export function FormSchemaPresentation<Row>({ schema, designerDraft, language, editor, footer, grid, initialHeaderRef, initialEditorHeight, readOnly = false }: FormSchemaPresentationProps<Row>) {
  const appearanceStyle = designerAppearanceStyle(designerDraft) as CSSProperties
  const gridSectionId = schema.sections.find(section => section.kind === 'grid')?.id
  const { rows, columns, remoteQuery, onRowSelectionChange, onTotalChange, ...gridProps } = grid
  return <BaseFormShell formId={schema.id} initialHeaderRef={initialHeaderRef} initialEditorHeight={initialEditorHeight} style={appearanceStyle}
    editor={editor}
    grid={<div className="person-grid-panel panel laboratory-grid" data-section-id={gridSectionId}><BaseFormGridBoundary {...gridProps} rows={rows} columns={columns} language={language} appearanceStyle={appearanceStyle} filterPopupFontSize={designerDraft.filterPopupFontSize ?? 16} gridSearchPosition={designerDraft.gridSearchPosition ?? 'right'} designerHeaderHeight={designerDraft.tableHeaderHeight ?? 42} designerColumnStyles={designerDraft.tableColumns} designerHeaderStyles={designerDraft.tableHeaders} readOnly={readOnly} remoteQuery={readOnly ? undefined : remoteQuery} onRowSelectionChange={readOnly ? undefined : onRowSelectionChange} onTotalChange={readOnly ? undefined : onTotalChange} /></div>}
    footer={footer}
  />
}
