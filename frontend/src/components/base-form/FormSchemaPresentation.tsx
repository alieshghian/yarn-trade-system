import {toolbarPanels} from './gridToolbarLayout'
import type { GridToolbarSettings, GridToolbarPart, GridToolbarPartStyle } from './gridToolbarLayout'
import { editorViewport } from './formEditorViewport'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { BaseFormGridBoundary, type BaseFormGridBoundaryProps, type GridColumn } from './BaseFormGridBoundary'
import { BaseFormShell } from './BaseFormShell'
import { designerAppearanceStyle, type DesignerDraft } from './designer'
import type { FormSchemaDraft, FormSchemaSection } from './formSchema'
import { formSectionChildren, usesFormComposition } from './formDocumentStructure'
import { designerDraftForTable } from './formDocumentDesigner'
import { columnLabelMismatch } from './formTableStructure'

type PresentationSchema = Pick<FormSchemaDraft, 'id' | 'sections' | 'layout'> & Partial<Pick<FormSchemaDraft, 'tables' | 'fields' | 'templateFormId'>>
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
  grids?: Record<string, PresentationGrid<Row>>
  renderEditor?: (section: FormSchemaSection) => ReactNode
  renderFooter?: (section: FormSchemaSection) => ReactNode
  columnReview?: Record<string, string[]>
  toolbarSelection?: {tableId:string;parts:GridToolbarPart[]}
  onToolbarSelect?: (tableId:string,part:GridToolbarPart,toggle:boolean)=>void
  onToolbarContextMenu?: (tableId:string,part:GridToolbarPart,x:number,y:number)=>void
  onToolbarChange?: (tableId: string, part: GridToolbarPart, patch: GridToolbarPartStyle, related?:GridToolbarSettings) => void
  onTableStructure?: (tableId: string) => void
  onGridActivate?: (tableId: string) => void
  initialHeaderRef?: RefObject<HTMLElement | null>
  initialEditorHeight?: number
  readOnly?: boolean
}

/**
 * Shared frame only: schema owns structure, DesignerDraft owns visuals, and
 * callers supply behavior adapters for editor fields and footer actions.
 */
export function FormSchemaPresentation<Row>({ schema, designerDraft, language, editor, footer, grid, grids, renderEditor, renderFooter, onGridActivate, columnReview, onTableStructure, onToolbarChange, toolbarSelection, onToolbarSelect, onToolbarContextMenu, initialHeaderRef, initialEditorHeight, readOnly = false }: FormSchemaPresentationProps<Row>) {
  const appearanceStyle = designerAppearanceStyle(designerDraft) as CSSProperties
  const gridSectionId = schema.sections.find(section => section.kind === 'grid')?.id
  const tableGrid = (tableId?: string, sectionId = gridSectionId) => {
    const tableDraft = designerDraftForTable(designerDraft, tableId)
    const tableAppearanceStyle = designerAppearanceStyle(tableDraft) as CSSProperties
    const table = schema.tables?.find(item => item.id === tableId)
    const panelIds=toolbarPanels((table?.settings?.toolbar??{}) as GridToolbarSettings)
    const headerRows=schema.sections.filter(section=>Boolean(tableId) && section.tableHeaderFor === tableId&&section.enabled!==false)
    const renderHeaderRow=(section:FormSchemaSection)=><div key={section.id} className="form-table-report-row" data-report-row-id={section.id}>{renderEditor?.(section)}</div>
    // Old rows and unknown hosts stay visible; resetting a toolbar never loses fields.
    const standaloneHeaderRows=headerRows.filter(section=>!panelIds.includes(section.settings?.toolbarPanelId as GridToolbarPart))
    const headerContent=Object.fromEntries(panelIds.map(id=>[id,headerRows.filter(section=>section.settings?.toolbarPanelId===id).map(renderHeaderRow)]).filter(([,rows])=>(rows as ReactNode[]).length))
    const review = tableId ? columnReview?.[tableId] ?? [] : []
    const labelMismatches=schema.fields?table?.columns.filter(column=>columnLabelMismatch(schema as FormSchemaDraft,column,language).length>0).map(column=>column.id)??[]:[]
    const { rows, columns, remoteQuery, onRowSelectionChange, onTotalChange, ...gridProps } = (tableId && grids?.[tableId]) || grid
    return <div key={tableId ?? sectionId} className="person-grid-panel panel laboratory-grid" data-section-id={sectionId} data-table-id={tableId} data-table-review={review.length || undefined} onFocusCapture={() => tableId && onGridActivate?.(tableId)} onClickCapture={() => tableId && onGridActivate?.(tableId)} onPointerDownCapture={() => tableId && onGridActivate?.(tableId)} onContextMenuCapture={() => tableId && onGridActivate?.(tableId)} onContextMenu={gridProps.designerMode ? event => { if((event.target as Element).closest('.laboratory-form-grid'))return; event.preventDefault(); event.stopPropagation(); gridProps.onDesignerContextMenu?.('header', undefined, event.clientX, event.clientY) } : undefined}>{readOnly && gridProps.designerMode && tableId && <button type="button" className="form-table-structure-trigger" onClick={() => onTableStructure?.(tableId)}>{language === 'fa' ? 'افزودن ستون و مدیریت ارتباط‌ها…' : 'Add columns and manage links…'}</button>}{review.length > 0 && <div className="form-table-review-warning" role="status">{language === 'fa' ? 'ارتباط فیلدهای حذف‌شده با این ستون‌ها نیازمند تصمیم است: ' : 'Removed source fields need review for: '}{review.map(id => table?.columns.find(column => column.id === id)?.label[language] ?? id).join('، ')}<button type="button" onClick={() => tableId && onTableStructure?.(tableId)}>{language === 'fa' ? 'بررسی ساختار جدول' : 'Review table structure'}</button></div>}{standaloneHeaderRows.map(renderHeaderRow)}<BaseFormGridBoundary {...gridProps} headerContent={headerContent} toolbarSettings={table?.settings?.toolbar as GridToolbarSettings | undefined} designerToolbarSelection={toolbarSelection&&toolbarSelection.tableId===tableId?toolbarSelection.parts:[]} onDesignerToolbarSelect={tableId?(part,toggle)=>onToolbarSelect?.(tableId,part,toggle):undefined} onDesignerToolbarContextMenu={tableId?(part,x,y)=>onToolbarContextMenu?.(tableId,part,x,y):undefined} onDesignerToolbarChange={tableId && onToolbarChange ? (part,patch,related)=>onToolbarChange(tableId,part,patch,related) : undefined} title={table?.title?.[language]} rows={rows} columns={columns} language={language} appearanceStyle={tableAppearanceStyle} filterPopupFontSize={tableDraft.filterPopupFontSize ?? 16} gridSearchPosition={tableDraft.gridSearchPosition ?? 'right'} designerHeaderHeight={tableDraft.tableHeaderHeight ?? 42} designerColumnStyles={{ ...tableDraft.tableColumns, ...Object.fromEntries(review.map(id => [id, { ...tableDraft.tableColumns?.[id], backgroundColor: '#fff0ed' }])) }} designerHeaderStyles={{ ...tableDraft.tableHeaders, ...Object.fromEntries([...review,...labelMismatches].map(id => [id, { ...tableDraft.tableHeaders?.[id], backgroundColor: '#ffdcd6', textColor: '#8f211c' }])) }} readOnly={readOnly} remoteQuery={readOnly ? undefined : remoteQuery} onRowSelectionChange={readOnly ? undefined : onRowSelectionChange} onTotalChange={readOnly ? undefined : onTotalChange} /></div>
  }
  const renderSection = (section: FormSchemaSection, ancestors: string[] = []): ReactNode => {
    if (ancestors.includes(section.id)) return null
    const children = formSectionChildren(schema, section.id)
    const parentDirection = schema.sections.find(item => item.id === section.parentId)?.layout?.direction ?? schema.layout?.direction
    const content = section.kind === 'group'
      ? children.map(child => renderSection(child, [...ancestors, section.id]))
      : section.kind === 'editor' ? renderEditor?.(section) ?? editor
      : section.kind === 'footer' ? renderFooter?.(section) ?? footer
      : (schema.tables?.filter(table => table.sectionId === section.id || section.tableIds?.includes(table.id)) ?? []).map(table => tableGrid(table.id, section.id))
    return <section key={section.id} className={`form-document-section form-document-${section.kind}`} data-document-section-id={section.id} aria-label={section.title?.[language] ?? section.id} style={{ flex: parentDirection === 'horizontal' ? section.initialSize?.width ? `0 0 ${section.initialSize.width}px` : '1 1 0' : '0 0 auto', width: section.initialSize?.width ?? (parentDirection === 'horizontal' ? undefined : '100%'), minHeight: section.initialSize?.height ?? undefined, height: section.initialSize?.height ?? undefined, gap: section.layout?.gap ?? 12 } as CSSProperties}>
      {section.title && section.kind !== 'grid' && <h3>{section.title[language]}</h3>}
      {section.kind === 'group' ? <div className="form-document-section-children" style={{ flexDirection: section.layout?.direction === 'horizontal' ? 'row' : 'column', gap: section.layout?.gap ?? 12 }}>{content}</div> : content}
    </section>
  }
  const composition = usesFormComposition(schema)
  return <BaseFormShell stableEditorHeight={readOnly} autoEditorHeight={editorViewport(schema.sections.find(section=>section.kind==='editor')).heightMode==='content'} formId={schema.id} initialHeaderRef={initialHeaderRef} initialEditorHeight={initialEditorHeight} style={appearanceStyle}
    editor={editor}
    grid={tableGrid(schema.tables?.[0]?.id)}
    footer={footer}
    sections={composition ? <div className="form-document-composition" style={{ flexDirection: schema.layout?.direction === 'horizontal' ? 'row' : 'column', gap: schema.layout?.gap ?? 12 }}>{formSectionChildren(schema).map(section => renderSection(section))}</div> : undefined}
  />
}
