import {numericFieldInputProps,numericFieldError} from './numericField'
import {toolbarPanels} from './gridToolbarLayout'
import type { GridToolbarSettings, GridToolbarPart, GridToolbarPartStyle } from './gridToolbarLayout'
import { editorViewport } from './formEditorViewport'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { gridValueKey, type GridValue } from './excelGrid'
import { BaseFormGridBoundary, type BaseFormGridBoundaryProps, type GridColumn } from './BaseFormGridBoundary'
import { BaseFormShell } from './BaseFormShell'
import { designerAppearanceStyle, type DesignerDraft } from './designer'
import type { FormSchemaDraft, FormSchemaSection } from './formSchema'
import { formSectionChildren, usesFormComposition } from './formDocumentStructure'
import { designerDraftForTable } from './formDocumentDesigner'
import { columnLabelMismatch } from './formTableStructure'
import { useFieldValidation, type FieldRule } from './useFieldValidation'


type PresentationSchema = Pick<FormSchemaDraft, 'id' | 'sections' | 'layout'> & Partial<Pick<FormSchemaDraft, 'tables' | 'fields' | 'templateFormId' | 'settings'>>
type PresentationGrid<Row> = Omit<BaseFormGridBoundaryProps<Row>, 'rows' | 'columns' | 'language' | 'appearanceStyle' | 'filterPopupFontSize' | 'gridSearchPosition' | 'designerHeaderHeight' | 'designerColumnStyles' | 'designerHeaderStyles' | 'readOnly'> & {
  rows: Row[]
  columns: GridColumn<Row>[]
}

function RelationGrid<Row>({ detailField, masterValue, onMasterSelection, ...props }: BaseFormGridBoundaryProps<Row> & {
  detailField?: string; masterValue?: GridValue; onMasterSelection?: (row: Row | null) => void
}) {
  const callbacks = useRef({ onMasterSelection, onRowSelectionChange: props.onRowSelectionChange })
  callbacks.current = { onMasterSelection, onRowSelectionChange: props.onRowSelectionChange }
  const select = useCallback((row: Row | null) => { callbacks.current.onMasterSelection?.(row); callbacks.current.onRowSelectionChange?.(row) }, [])
  const related = Boolean(detailField)
  const hasMaster = masterValue !== undefined && masterValue !== null && masterValue !== ''
  const column = props.columns.find(item => item.id === detailField)
  const value = (row: Row): GridValue => column ? column.value(row) : (row as Record<string, GridValue>)[detailField!]
  const rows = useMemo(() => related ? hasMaster ? props.rows.filter(row => gridValueKey(value(row)) === gridValueKey(masterValue)) : [] : props.rows, [props.rows, column, detailField, masterValue, related, hasMaster])
  const query = useMemo<typeof props.remoteQuery>(() => {
    const source = props.remoteQuery
    if (!source || !related) return source
    return (request, signal) => !hasMaster ? Promise.resolve({ items: [], total: 0, page: request.page, pageSize: request.pageSize }) : source({ ...request, filters: { ...request.filters, [detailField!]: { selectedValues: [gridValueKey(masterValue)], selectionMode: 'include' } } }, signal)
  }, [props.remoteQuery, related, hasMaster, masterValue, detailField])
  return <BaseFormGridBoundary {...props} rows={rows} remoteQuery={query} onRowSelectionChange={onMasterSelection ? select : props.onRowSelectionChange} />
}

export type FormSchemaPresentationProps<Row> = {
  layoutPreview?: boolean
  presentationMode?: 'design' | 'operational'
  validationMode?: 'off' | 'local' | 'database'
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
export function FormSchemaPresentation<Row>({ schema, designerDraft, language, editor, footer, grid, grids, layoutPreview = false, renderEditor, renderFooter, onGridActivate, columnReview, onTableStructure, onToolbarChange, toolbarSelection, onToolbarSelect, onToolbarContextMenu, initialHeaderRef, initialEditorHeight, readOnly = false, presentationMode = 'operational', validationMode }: FormSchemaPresentationProps<Row>) {
  const gridReadOnly = readOnly && presentationMode === 'design'
  const validationRoot = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const frames = document.querySelectorAll<HTMLElement>('[data-form-id]')
    for (const frame of frames) {
      if (frame.dataset.formId !== schema.id) continue
      validationRoot.current = frame
      frame.dataset.recordPresentation=readOnly?'entry':grid.selectedRowId?'view':'empty'
      const typingDesign = presentationMode === 'design' && validationMode !== 'local' ? 'true' : 'false'
      if (frame.dataset.typingDesign !== typingDesign) frame.dataset.typingDesign = typingDesign
      for (const input of frame.querySelectorAll<HTMLElement>('input,textarea')) {
        const id = input.dataset.field || input.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId
        const field = schema.fields?.find(item => item.id === id)
        if (!field) continue
        if(input instanceof HTMLInputElement&&input.type==='number'&&!['base-form.code-input','base-form.incremental-code'].includes(field.componentId)){const props=numericFieldInputProps(field);input.step=props.step;input.inputMode=props.inputMode}
        const mode = field.readOnly || field.typingLanguage?.enabled === false || ['number', 'date', 'datetime', 'time', 'checkbox', 'radio', 'button', 'hidden'].includes(field.kind) || /code|کد/i.test(field.id)
          ? 'off' : field.typingLanguage?.initial ?? 'auto'
        if (input.dataset.typingLanguage !== mode) input.dataset.typingLanguage = mode
      }
    }
  })
  useFieldValidation(validationRoot, {enabled:validationMode ? validationMode!=='off' : readOnly && presentationMode==='operational',demo:validationMode==='local',fallback:true,entity:schema.settings?.fieldValidation?.entity,context:schema.settings?.fieldValidation?.context??{},rules:Object.fromEntries((schema.fields??[]).filter(field=>!field.readOnly&&!['checkbox','button','hidden'].includes(field.kind)).map(field=>{
    const rule:FieldRule={required:field.required,validate:value=>numericFieldError(field,value),remote:schema.settings?.fieldValidation?.uniqueFields.includes(field.id),selector:`[data-field="${field.id}"], [data-field-id="${field.id}"] input, [data-field-id="${field.id}"] select, [data-field-id="${field.id}"] textarea`}
    for(const validation of field.validation??[]) {if(validation.type==='maxLength')rule.maxLength=validation.value;if(validation.type==='minimum')rule.min=validation.value;if(validation.type==='maximum')rule.max=validation.value;if(validation.type==='integer')rule.integer=true}
    return [field.id,rule]
  }))})
  const [masterRows, setMasterRows] = useState<Record<string, Row | null>>({})
  const relationSignature = JSON.stringify(schema.tables?.map(table => [table.id, table.masterDetail]))
  useEffect(() => { setMasterRows({}) }, [schema.id, relationSignature, gridReadOnly])
  const relatedValue = (tableId: string, fieldId: string, row: Row | null | undefined): GridValue => {
    if (!row) return undefined
    const table = schema.tables?.find(item => item.id === tableId)
    const column = table?.columns.find(item => item.id === fieldId || item.binding.kind === 'formField' && item.binding.fieldId === fieldId || item.binding.kind === 'dataField' && item.binding.dataFieldId === fieldId)
    const adapter = (grids?.[tableId] ?? grid).columns.find(item => item.id === (column?.id ?? fieldId))
    if (adapter) return adapter.value(row)
    const value = (row as Record<string, unknown>)[fieldId]
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date ? value : undefined
  }
  const selectMaster = (tableId: string, row: Row | null) => setMasterRows(current => {
    if (current[tableId] === row) return current
    const fields = schema.tables?.filter(table => table.masterDetail?.masterTableId === tableId).map(table => table.masterDetail!.masterField) ?? []
    if (fields.every(field => gridValueKey(relatedValue(tableId, field, current[tableId])) === gridValueKey(relatedValue(tableId, field, row)))) return current
    const next = { ...current, [tableId]: row }, invalid = new Set([tableId])
    for (let pass = 0; pass < (schema.tables?.length ?? 0); pass++) for (const table of schema.tables ?? []) if (table.masterDetail && invalid.has(table.masterDetail.masterTableId)) { invalid.add(table.id); delete next[table.id] }
    return next
  })
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
    const review = presentationMode === 'design' && tableId ? columnReview?.[tableId] ?? [] : []
    const labelMismatches=presentationMode === 'design' && schema.fields?table?.columns.filter(column=>columnLabelMismatch(schema as FormSchemaDraft,column,language).length>0).map(column=>column.id)??[]:[]
    const { rows, columns, remoteQuery, onRowSelectionChange, onTotalChange, ...gridProps } = (tableId && grids?.[tableId]) || grid
    const relation = !gridReadOnly ? table?.masterDetail : undefined
    const masterValue = relation ? relatedValue(relation.masterTableId, relation.masterField, masterRows[relation.masterTableId]) : undefined
    const detailColumn = relation && table?.columns.find(item => item.id === relation.detailField || item.binding.kind === 'dataField' && item.binding.dataFieldId === relation.detailField || item.binding.kind === 'formField' && item.binding.fieldId === relation.detailField)
    return <div key={tableId ?? sectionId} className="person-grid-panel panel laboratory-grid" data-section-id={sectionId} data-table-id={tableId} data-table-review={review.length || undefined} data-layout-preview={layoutPreview || undefined} style={layoutPreview ? {'--lab-layout-preview-header-height': `${tableDraft.tableHeaderHeight ?? 42}px`} as CSSProperties : undefined} onFocusCapture={() => tableId && onGridActivate?.(tableId)} onClickCapture={() => tableId && onGridActivate?.(tableId)} onPointerDownCapture={() => tableId && onGridActivate?.(tableId)} onContextMenuCapture={() => tableId && onGridActivate?.(tableId)} onContextMenu={presentationMode === 'design' && gridProps.designerMode ? event => { if((event.target as Element).closest('.laboratory-form-grid'))return; event.preventDefault(); event.stopPropagation(); gridProps.onDesignerContextMenu?.('header', undefined, event.clientX, event.clientY) } : undefined}>{presentationMode === 'design' && readOnly && gridProps.designerMode && tableId && <button type="button" className="form-table-structure-trigger" onClick={() => onTableStructure?.(tableId)}>{language === 'fa' ? 'افزودن ستون و مدیریت ارتباط‌ها…' : 'Add columns and manage links…'}</button>}{review.length > 0 && <div className="form-table-review-warning" role="status">{language === 'fa' ? 'ارتباط فیلدهای حذف‌شده با این ستون‌ها نیازمند تصمیم است: ' : 'Removed source fields need review for: '}{review.map(id => table?.columns.find(column => column.id === id)?.label[language] ?? id).join('، ')}<button type="button" onClick={() => tableId && onTableStructure?.(tableId)}>{language === 'fa' ? 'بررسی ساختار جدول' : 'Review table structure'}</button></div>}{standaloneHeaderRows.map(renderHeaderRow)}<RelationGrid detailField={relation ? detailColumn?.id ?? relation.detailField : undefined} masterValue={masterValue} onMasterSelection={!gridReadOnly && tableId && schema.tables?.some(item => item.masterDetail?.masterTableId === tableId) ? row => selectMaster(tableId, row) : undefined} key={relation ? tableId + ":" + gridValueKey(masterValue) : tableId} {...gridProps} fillViewport={table?.settings?.fillViewport === true} designerMode={presentationMode === 'design' && gridProps.designerMode} gridId={tableId ?? 'main'} headerContent={headerContent} toolbarSettings={table?.settings?.toolbar as GridToolbarSettings | undefined} designerToolbarSelection={toolbarSelection&&toolbarSelection.tableId===tableId?toolbarSelection.parts:[]} onDesignerToolbarSelect={presentationMode === 'design' && tableId?(part,toggle)=>onToolbarSelect?.(tableId,part,toggle):undefined} onDesignerToolbarContextMenu={presentationMode === 'design' && tableId?(part,x,y)=>onToolbarContextMenu?.(tableId,part,x,y):undefined} onDesignerToolbarChange={presentationMode === 'design' && tableId && onToolbarChange ? (part,patch,related)=>onToolbarChange(tableId,part,patch,related) : undefined} title={table?.title?.[language]} rows={rows} columns={columns} language={language} appearanceStyle={tableAppearanceStyle} filterPopupFontSize={tableDraft.filterPopupFontSize ?? 16} gridSearchPosition={tableDraft.gridSearchPosition ?? 'right'} designerHeaderHeight={tableDraft.tableHeaderHeight ?? 42} designerColumnStyles={{ ...tableDraft.tableColumns, ...Object.fromEntries(review.map(id => [id, { ...tableDraft.tableColumns?.[id], backgroundColor: '#fff0ed' }])) }} designerHeaderStyles={{ ...tableDraft.tableHeaders, ...Object.fromEntries([...review,...labelMismatches].map(id => [id, { ...tableDraft.tableHeaders?.[id], backgroundColor: '#ffdcd6', textColor: '#8f211c' }])) }} autoSelectFirstRow={gridProps.autoSelectFirstRow??(presentationMode==='operational'&&schema.mode!=='reporting'&&!readOnly)} readOnly={gridReadOnly} remoteQuery={gridReadOnly ? undefined : remoteQuery} navigationRequest={gridProps.navigationRequest} onRowSelectionChange={gridReadOnly ? undefined : onRowSelectionChange} onTotalChange={gridReadOnly ? undefined : onTotalChange} /></div>
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
  const roots = formSectionChildren(schema)
  const treeEditor = roots.find(section => section.kind === 'editor')
  const treeFooter = roots.find(section => section.kind === 'footer')
  const treeSplit = schema.fields?.some(field => field.componentId === 'base-form.cascading-tree-panels') && roots.length === 3 && Boolean(treeEditor && treeFooter && roots.some(section => section.kind === 'grid')) && schema.tables?.length === 1
  const composition = usesFormComposition(schema) && !treeSplit
  return <BaseFormShell layoutPreview={layoutPreview} stableEditorHeight={readOnly} autoEditorHeight={!treeSplit && editorViewport(schema.sections.find(section=>section.kind==='editor')).heightMode==='content'} formId={schema.id} initialHeaderRef={initialHeaderRef} initialEditorHeight={initialEditorHeight} style={{ ...appearanceStyle, '--lab-action-bar-offset-y': `${designerDraft.actionBarOffsetY ?? 0}px` } as CSSProperties}
    editor={treeSplit && treeEditor ? renderEditor?.(treeEditor) ?? editor : editor}
    grid={tableGrid(schema.tables?.[0]?.id)}
    footer={treeSplit && treeFooter ? renderFooter?.(treeFooter) ?? footer : footer}
    sections={composition ? <div className="form-document-composition" style={{ flexDirection: schema.layout?.direction === 'horizontal' ? 'row' : 'column', gap: schema.layout?.gap ?? 12 }}>{formSectionChildren(schema).map(section => renderSection(section))}</div> : undefined}
  />
}
