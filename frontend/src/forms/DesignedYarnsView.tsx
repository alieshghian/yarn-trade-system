import { useEffect, useMemo, useState, type CSSProperties, type RefObject, type ReactNode } from 'react'
import { Field } from '../DefinitionControls'
import type { Language } from '../i18n'
import { FormSchemaPresentation } from '../components/base-form/FormSchemaPresentation'
import { OperationalFormFrame } from '../components/base-form/OperationalFormFrame'
import { designerAppearanceStyle, designerStyleForPart } from '../components/base-form/designer'
import { designerRectStyle } from '../components/base-form/formDocumentDesigner'
import { resolveFormLayout } from '../components/base-form/formLayoutContract'
import type { Yarn, YarnDraft, YarnOptions } from '../YarnsPage'
import { yarnComputedNameField, yarnCustomization, yarnDesigner, yarnFrame, yarnOperationalBehavior, yarnSchema } from './yarnDesign'
import { readProductGroups, type ProductGroupRecord } from './productGroupApi'
import { productGroupTerminalNodes } from '../components/base-form/productGroupLaboratoryForm'

type Props = {
  groups?: ProductGroupRecord[]
  language: Language
  rows: Yarn[]
  draft: YarnDraft
  comprehensiveName: string
  editing: boolean
  saving: boolean
  loading: boolean
  selectedId: string
  error: string
  message: string
  fieldErrors: Partial<Record<keyof YarnDraft, string>>
  formRef: RefObject<HTMLDivElement | null>
  columnPreferencesStorageKey: string
  label: (code?: string) => string
  options: YarnOptions
  onChange: (key: keyof YarnDraft, value: YarnDraft[keyof YarnDraft]) => void
  onBlur: (key: keyof YarnDraft) => void
  onValidate: (key: keyof YarnDraft) => boolean
  onSelect: (row: Yarn) => void
  onEditRow: (row: Yarn) => void
  footer: ReactNode
}

const numericFields = new Set<keyof YarnDraft>(['filamentNumber', 'countValue', 'twistAmount', 'plyCount'])
const columnWidths: Record<string, number> = { code: 125, comprehensiveName: 340, yarnGroup: 120, material: 130, countValue: 100, countType: 105, unitOfMeasure: 110, isActive: 95 }
const columnLabels: Record<string, Record<Language, string>> = {
  code: { fa: 'کد نخ', en: 'Code', zh: '代码' }, comprehensiveName: { fa: 'نام فراگیر', en: 'Comprehensive name', zh: '综合名称' },
  yarnGroup: { fa: 'گروه کالا', en: 'Product group', zh: '商品组' }, material: { fa: 'جنس نخ', en: 'Material', zh: '材质' },
  countValue: { fa: 'نمره', en: 'Count', zh: '纱支' }, countType: { fa: 'نوع نمره', en: 'Count type', zh: '支数类型' },
  unitOfMeasure: { fa: 'واحد', en: 'Unit', zh: '单位' }, isActive: { fa: 'وضعیت', en: 'Status', zh: '状态' }
}

function YarnEditor(p: Props & { designer: typeof yarnDesigner }) {
  const fa = p.language === 'fa', designer = p.designer
  const [entryFocusField, setEntryFocusField] = useState<string | null>(null)
  useEffect(() => { if (!p.editing) setEntryFocusField(null) }, [p.editing])
  const layout = resolveFormLayout(yarnSchema, designer, 'desktop', yarnFrame.width, { cropEmptyCanvas: true })
  const canvas = layout.canvas
  const fields = useMemo(() => [...yarnSchema.fields.slice(0, 2), yarnComputedNameField, ...yarnSchema.fields.slice(2)], [])
  const editor = <div className="person-editor panel laboratory-editor" style={designerAppearanceStyle(designer) as CSSProperties}>
    <div className={'person-form-grid laboratory-form-grid' + (canvas ? ' has-fixed-geometry' : '')} ref={p.formRef}
      onKeyDown={event => {
        if (!p.editing || event.altKey || event.ctrlKey || event.metaKey || event.key !== 'Enter') return
        const key = (event.target as HTMLElement).dataset.field as keyof YarnDraft | 'comprehensiveName' | undefined
        if (key && key !== 'comprehensiveName' && !p.onValidate(key)) event.preventDefault()
      }}
      onBlur={event => { const key = (event.target as HTMLElement).dataset.field as keyof YarnDraft | 'comprehensiveName' | undefined; if (p.editing && key && key !== 'comprehensiveName') p.onBlur(key) }}
      style={{ maxHeight: '100%', overflowY: 'auto', alignContent: 'start', ...(canvas ? { width: '100%', height: canvas.height, minWidth: 0 } : { gridTemplateRows: 'none', rowGap: 6 }), ...(layout.columns ? { '--form-schema-grid-columns': layout.columns } : {}) } as CSSProperties}>
      {fields.map((field, index) => {
        const id = field.id
        const computed = id === 'comprehensiveName'
        const key = computed ? 'comprehensiveName' : (field.dataBinding?.kind === 'dataField' ? field.dataBinding.dataFieldId : field.id) as keyof YarnDraft
        const draftKey = key as keyof YarnDraft
        const fieldLabel = field.label[p.language] ?? field.label.en
        const value = computed ? p.comprehensiveName : p.draft[draftKey]
        const fieldOptions = p.options[id as keyof YarnOptions]
        const positioned = (part: 'input' | 'label') => ({
          ...designerStyleForPart(designer, id, part),
          ...designerRectStyle(canvas?.fields[id]?.[part]),
          ...(canvas?.centeredFieldIds?.includes(id) ? { left: `calc(${canvas.fields[id][part].left}px + var(--lab-center-shift,0px))` } : {})
        }) as CSSProperties
        const placement = { gridColumn: `${(index % 4) * 5 + 1} / span 5`, gridRow: `${Math.floor(index / 4) + 1} / span 1` }
        const common = { 'data-field': id, 'data-focus-order': field.focusOrder, 'aria-label': fieldLabel, 'aria-invalid': !computed && Boolean(p.fieldErrors[draftKey]), disabled: !p.editing || p.saving || computed, required: field.required === true, style: designerStyleForPart(designer, id, 'input') as CSSProperties, onFocus: () => { if (p.editing && !computed && yarnOperationalBehavior.entryFocus.retainVisualIndicatorOnBlur) setEntryFocusField(id) } }
        let control: ReactNode
        if (computed) {
          control = <input {...common} value={String(value ?? '')} readOnly />
        } else if (id === 'isActive') {
          control = <input {...common} type="checkbox" checked={Boolean(value)} onChange={event => p.onChange(draftKey, event.currentTarget.checked)} />
        } else if (id === 'yarnGroup') {
          const eligibleGroupIds = new Set(productGroupTerminalNodes(p.groups ?? []).map(node=>node.id))
          control = <select {...common} value={String(value ?? '')} onChange={event => p.onChange('productGroupId',event.currentTarget.value || undefined)}>
            <option value="">—</option>{p.groups?.filter(group => group.id===value || eligibleGroupIds.has(group.id)).map(group => <option key={group.id} value={group.id} disabled={!eligibleGroupIds.has(group.id)}>{groupPath(p.groups ?? [],group.id)}</option>)}
          </select>
        } else if (fieldOptions) {
          control = <select {...common} value={String(value ?? '')} onChange={event => p.onChange(draftKey, event.currentTarget.value)}>
            {!field.required && <option value="">—</option>}{fieldOptions.map(option => <option key={option} value={option}>{p.label(option)}</option>)}
          </select>
        } else if (numericFields.has(draftKey)) {
          control = <input {...common} className="ltr-input" type="number" min={0} max={draftKey === 'plyCount' ? 9 : undefined} step={draftKey === 'plyCount' ? 1 : 'any'} value={String(value ?? '')} onChange={event => p.onChange(draftKey, (event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value)) as YarnDraft[keyof YarnDraft])} />
        } else {
          control = <input {...common} maxLength={id === 'code' ? 50 : id === 'name' ? 200 : undefined} value={String(value ?? '')} onChange={event => p.onChange(draftKey, event.currentTarget.value)} />
        }
        const fieldClass = 'laboratory-designer-field lab-custom-field' + (id === 'isActive' ? ' active-check yarn-active-field' : '')
        const labelContent = <span className="designer-label-part" style={{ ...positioned('label'), userSelect: 'none' }}>{fieldLabel}{field.required ? ' *' : ''}</span>
        const controlContent = <span className="designer-input-part" data-entry-focus-indicator={yarnOperationalBehavior.entryFocus.retainVisualIndicatorOnBlur && p.editing && entryFocusField === id || undefined} style={{ ...positioned('input'), userSelect: 'text' }}>{control}</span>
        return <Field key={id} className={fieldClass} style={{ ...designerStyleForPart(designer, id, 'field'), ...layout.fieldStyles[id], ...placement }} label={fieldLabel} error={computed ? undefined : p.fieldErrors[draftKey]} labelContent={labelContent} controlContent={controlContent}><span /></Field>
      })}
    </div>
  </div>
  return editor
}

export function DesignedYarnsView(p: Props) {
  const fa = p.language === 'fa'
  const [groups,setGroups] = useState<ProductGroupRecord[]>([])
  const [groupError,setGroupError] = useState('')
  useEffect(() => {const c=new AbortController();readProductGroups(c.signal).then(setGroups).catch(e=>{if(!c.signal.aborted)setGroupError(String(e.message ?? e))});return ()=>c.abort()},[])
  const columns = useMemo(() => yarnSchema.tables![0].columns.map(column => ({
    id: column.id,
    label: columnLabels[column.id]?.[p.language] ?? column.label[p.language] ?? column.id,
    width: columnWidths[column.id] ?? column.width ?? 160,
    type: column.id === 'countValue' ? 'number' as const : 'text' as const,
    value: (row: Yarn) => {
      if(column.id === 'yarnGroup') return groupPath(groups,row.productGroupId)
      const raw = (row as unknown as Record<string, unknown>)[column.id]
      if (column.id === 'isActive') return row.isActive ? (fa ? 'فعال' : 'Active') : (fa ? 'غیرفعال' : 'Inactive')
      if (['yarnGroup', 'material', 'countType', 'unitOfMeasure'].includes(column.id)) return raw ? p.label(String(raw)) : ''
      if (column.id === 'countValue') return typeof raw === 'number' ? raw : ''
      return raw === null || raw === undefined ? '' : String(raw)
    }
  })), [p.language, p.label,groups])
  const fieldIds = useMemo<Record<string, string>>(() => Object.fromEntries([
    ...yarnSchema.fields.map(field => [field.dataBinding?.kind === 'dataField' ? field.dataBinding.dataFieldId : field.id, field.id] as const),
    ['comprehensiveName', 'comprehensiveName'] as const
  ]), [])
  const notice = <>{p.loading && <div className="form-message">{fa ? 'در حال دریافت فهرست نخ‌ها…' : 'Loading yarns…'}</div>}{p.error && <div className="form-message error-message" role="alert">{p.error}</div>}{p.message && <div className="form-message success-message" role="status">{p.message}</div>}</>
  return <div className="form-laboratory-page yarns-page" dir={fa ? 'rtl' : 'ltr'} data-operational-yarn-design={yarnSchema.id} data-form-scope data-entry-active={p.editing || undefined} data-button-press-effect={yarnDesigner.buttonPressEffect !== false ? 'true' : 'false'}>
    <OperationalFormFrame formId={yarnSchema.id} title={yarnSchema.title[p.language]} language={p.language} designerDraft={yarnDesigner} permissions={yarnCustomization} behaviorContract={yarnOperationalBehavior} fieldIds={fieldIds} width={yarnFrame.width} height={yarnFrame.height} notice={notice}>
      {designer => <FormSchemaPresentation schema={yarnSchema} designerDraft={designer} language={p.language} readOnly={p.editing} editor={<>{groupError && <div role="alert">{groupError}</div>}<YarnEditor {...p} groups={groups} designer={designer} /></>} footer={p.footer}
        initialEditorHeight={480}
        grid={{ rows: p.rows, columns, gridId: 'yarns', title: yarnSchema.tables![0].title?.[p.language] ?? (fa ? 'نخ‌ها' : 'Yarns'), selectedRowId: p.selectedId, onRowSelectionChange: row => { if (row && !p.editing) p.onSelect(row) }, onRowDoubleClick: row => { if (!p.editing) p.onEditRow(row) }, columnPreferencesStorageKey: p.columnPreferencesStorageKey }} />}
    </OperationalFormFrame>
  </div>
}

function groupPath(groups: ProductGroupRecord[], id?: string): string {
  const path:string[]=[];const seen=new Set<string>();let node=groups.find(g=>g.id===id)
  while(node && !seen.has(node.id)){seen.add(node.id);path.unshift(node.name);node=groups.find(g=>g.id===node!.parentId)}
  return path.join(' ‹ ')
}
