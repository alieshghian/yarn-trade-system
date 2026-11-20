import {deleteSelectedDefinitionRows} from '../components/base-form/useDefinitionRowSelection'
import { productGroupBatchCreateAdapter } from './productGroupApi'
import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { Shortcut } from '../DefinitionControls'
import type { Language } from '../i18n'
import { CascadingTreePanels } from '../components/base-form/CascadingTreePanels'
import { FormSchemaPresentation } from '../components/base-form/FormSchemaPresentation'
import { OperationalFormFrame } from '../components/base-form/OperationalFormFrame'
import { designerActionCode, designerActionLabel, designerActionStyle, designerActionTextStyle, designerActionVisible, designerAppearanceStyle, designerEffectiveValues, designerStyleForPart, type DesignerDraft } from '../components/base-form/designer'
import { productGroupSchema as schema, productGroupDesigner, productGroupFrame, productGroupCustomization, productGroupBehavior, productGroupTitle } from './productGroupDesign'
import { copyProductGroupBranch, copyProductGroupChildren, productGroupCreateAdapter, readProductGroups, readProductGroupPolicy, saveProductGroupPolicy, renameProductGroup, deleteProductGroup, type ProductGroupRecord } from './productGroupApi'
import './productGroupOperational.css'
import { queryProductGroupReport, type ProductGroupReportRow } from './productGroupApi'
import { apiRequest } from '../api'

const treeId = 'product-group.cascading-tree'
type Props = { language: Language; can: (operation: string) => boolean; isAdministrator?: boolean; onClose?: () => void; lookupCreation?: {onSelected:(id:string,signal:AbortSignal)=>Promise<void>} }

/** Approved operational adapter. Laboratory storage and seeds remain independent. */
export function ProductGroupOperationalPage(p: Props) {
  const [loaded, setLoaded] = useState<{nodes: ProductGroupRecord[]; maxSubgroups: number; rowVersion: string} | null>(null)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [depth, setDepth] = useState(4)
  const [policySaving, setPolicySaving] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const frame = root.current?.querySelector('.operational-form-frame')
    if (!frame) return
    const observer = new MutationObserver(() => setSettingsOpen(frame.getAttribute('data-personal-edit') === 'true'))
    observer.observe(frame,{attributes:true,attributeFilter:['data-personal-edit']})
    return () => observer.disconnect()
  }, [])
  const changeDepth = async () => {
    if (!loaded || !p.isAdministrator || !p.can('configure') || policySaving) return
    setPolicySaving(true); setError('')
    try { const policy = await saveProductGroupPolicy(depth,loaded.rowVersion); setLoaded(current => current ? {...current,...policy} : current) }
    catch(error) {setError(error instanceof Error ? error.message : 'تنظیم سطح انجام نشد.')}
    finally {setPolicySaving(false)}
  }
  useEffect(() => {if(loaded) setDepth(loaded.maxSubgroups)},[settingsOpen,loaded?.maxSubgroups])
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([readProductGroups(controller.signal), readProductGroupPolicy(controller.signal)])
      .then(([nodes, policy]) => { if (!controller.signal.aborted) setLoaded({nodes, ...policy}) })
      .catch(error => { if (!controller.signal.aborted) setError(String(error.message ?? error)) })
    return () => controller.abort()
  }, [])
  const persistCreate = useMemo(() => productGroupCreateAdapter(), [])
  return <div ref={root} className="form-laboratory-page product-group-operational" dir={p.language === 'fa' ? 'rtl' : 'ltr'} data-form-scope style={{'--product-group-title-height':Number(designerEffectiveValues(productGroupDesigner,treeId+'.tree.header','input').height ?? 53)+'px','--product-group-title-bg':designerEffectiveValues(productGroupDesigner,treeId+'.tree.header','input').backgroundColor,'--product-group-title-radius':Number(designerEffectiveValues(productGroupDesigner,treeId+'.tree.header','input').borderRadius ?? 6)+'px'} as CSSProperties}>
    <OperationalFormFrame formId={schema.id} title={productGroupTitle[p.language]} language={p.language} designerDraft={productGroupDesigner} permissions={productGroupCustomization} behaviorContract={productGroupBehavior} fieldIds={{[treeId]:treeId}} width={productGroupFrame.width} height={productGroupFrame.height} notice={<>{error && <div role="alert">{error}</div>}{!loaded && <div role="status">در حال دریافت گروه‌ها…</div>}{settingsOpen && loaded && p.isAdministrator && p.can('configure') && <fieldset className="product-group-depth-settings"><label>حداکثر زیرگروه‌ها <input aria-label="حداکثر زیرگروه‌ها" type="number" min={0} max={4} step={1} disabled={policySaving} value={depth} onChange={e=>setDepth(Number(e.target.value))}/></label><button type="button" disabled={policySaving || !Number.isInteger(depth) || depth<0 || depth>4 || depth===loaded.maxSubgroups} onClick={()=>void changeDepth()}>ثبت سطوح</button></fieldset>}</>}>
      {designer => loaded ? <Content {...p} onError={setError} initial={loaded} designer={designer} persistCreate={persistCreate}/> : null}
    </OperationalFormFrame>
  </div>
}

function Content(p: Props & {initial: {nodes: ProductGroupRecord[]; maxSubgroups: number}; onError: (error: string) => void; designer: DesignerDraft; persistCreate: ReturnType<typeof productGroupCreateAdapter>}) {
  const [nodes, setNodes] = useState(p.initial.nodes)
  const [entry, setEntry] = useState(false)
  const [rootId, setRootId] = useState('')
  const onSelectionChange = useCallback((path: readonly string[])=>{setRootId(path[0] ?? '');if(p.lookupCreation)setSelected(path.at(-1) ?? '')},[p.lookupCreation])
  const rootDepth = nodes.find(node=>node.id===rootId)?.lockedDepth
  const [createRequest, setCreateRequest] = useState(p.lookupCreation && p.can('create') ? 1 : 0)
  const [selected, setSelected] = useState('')
  const [entryRequest, setEntryRequest] = useState<{nodeId:string;kind:'edit'|'copy';sequence:number}>()
  const [treeInitial, setTreeInitial] = useState(p.initial.nodes)
  const [treeRevision, setTreeRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const lookupLifetime=useRef<AbortController|null>(null)
  useEffect(()=>{const controller=new AbortController();lookupLifetime.current=controller;return()=>controller.abort()},[])
  const chooseForLookup = async () => {
    if(!p.lookupCreation || !selected || entry || busyRef.current)return
    busyRef.current=true;setBusy(true);p.onError('')
    try {
      const signal=lookupLifetime.current?.signal
      if(!signal || signal.aborted)return
      const check=await apiRequest<{selectable:boolean;message:string}>(`/api/master-data/product-groups/${encodeURIComponent(selected)}/assignment`,{signal})
      if(!check.selectable)throw Error(check.message)
      if(!signal.aborted)await p.lookupCreation.onSelected(selected,signal)
    } catch(error) {p.onError(error instanceof Error ? error.message : 'انتخاب گروه انجام نشد.')}
    finally {busyRef.current=false;setBusy(false)}
  }
  const persistRename = useCallback(async ({node,name,signal}: {node: import('../components/base-form/cascadingTree').CascadingTreeNode;name:string;signal:AbortSignal}) => {
    if(node.isProtected) throw Error('این گروه در کالا استفاده شده و قابل ویرایش نیست.')
    if(!p.can('edit')) throw Error('اجازهٔ ویرایش گروه ندارید.')
    return renameProductGroup(node as ProductGroupRecord,name,signal)
  }, [p.can])
  const batchAdapter = useMemo(() => productGroupBatchCreateAdapter(), [])
  const persistCreateBatch = useCallback(async (request: Parameters<typeof batchAdapter>[0]) => {
    if(!p.can('create')) throw Error('اجازهٔ ثبت گروه ندارید.')
    return batchAdapter(request)
  }, [p.can,batchAdapter])
  const persistCreate = useCallback(async (request: Parameters<typeof p.persistCreate>[0]) => {
    if(!p.can('create')) throw Error('اجازهٔ ثبت گروه ندارید.')
    return p.persistCreate(request)
  }, [p.can,p.persistCreate])
  const [selectionRequest, setSelectionRequest] = useState<{nodeId:string;sequence:number}>()
  const scope = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const createWithoutFocus = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== ' ' || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return
      if (event.target !== document.body && event.target !== document.documentElement) return
      const frame = scope.current?.closest<HTMLElement>('.operational-form-frame')
      const button = scope.current?.querySelector<HTMLButtonElement>('[data-action-id="new-person"] button:not(:disabled)')
      if (!frame?.getClientRects().length || frame.dataset.personalEdit === 'true' || !button?.getClientRects().length) return
      event.preventDefault()
      if (!event.repeat) button.click()
    }
    window.addEventListener('keydown', createWithoutFocus)
    return () => window.removeEventListener('keydown', createWithoutFocus)
  }, [])
  const onNodesChange = useCallback((value: readonly import('../components/base-form/cascadingTree').CascadingTreeNode[]) => setNodes(value as ProductGroupRecord[]), [])
  const remove = async () => {
    const focusedTreeId = document.activeElement?.closest<HTMLElement>('[data-tree-node]')?.dataset.treeNode
    const node = nodes.find(n => n.id === (focusedTreeId ?? selected))
    // Parent nodes have no report row. A stale leaf selection must never replace the tree target.
    const selectedParent = node && nodes.some(child => child.parentId === node.id)
    if (!focusedTreeId && !selectedParent && deleteSelectedDefinitionRows(scope.current)) return
    if(!node || node.isProtected || busyRef.current || entry || !p.can('delete')) return
    if(!window.confirm(`گروه «${node.name}» حذف شود؟`)) return
    busyRef.current=true;setBusy(true);p.onError('')
    try {
      await deleteProductGroup(node)
      const fresh=await readProductGroups()
      setNodes(fresh);setTreeInitial(fresh);setCreateRequest(0);setEntryRequest(undefined);setTreeRevision(n=>n+1)
      const next=fresh.find(n=>n.id===node.parentId) ?? fresh[0]
      setSelected(next?.id ?? '');setSelectionRequest(old=>({nodeId:next?.id ?? '',sequence:(old?.sequence ?? 0)+1}))
      requestAnimationFrame(()=>scope.current?.querySelector<HTMLElement>('.base-grid-boundary')?.focus())
    } catch(error) {p.onError(error instanceof Error ? error.message : 'حذف انجام نشد.')}
    finally {busyRef.current=false;setBusy(false)}
  }
  async function bulkDeleteRows(rows:ProductGroupReportRow[]){
    if(entry||busyRef.current||!p.can('delete'))throw Error('حذف در وضعیت فعلی مجاز نیست.')
    busyRef.current=true;setBusy(true)
    try{
      const selected=rows.map(row=>{const node=nodes.find(n=>n.id===row.id);if(!node)throw Error('گروه تغییر کرده است؛ فرم را دوباره باز کنید.');return {id:node.id,rowVersion:node.rowVersion,depth:node.depth??0}}).sort((a,b)=>b.depth-a.depth)
      await apiRequest('/api/master-data/product-groups/bulk-delete',{method:'POST',body:JSON.stringify({rows:selected})})
      const fresh=await readProductGroups();setNodes(fresh);setTreeInitial(fresh);setSelected('');setTreeRevision(n=>n+1)
    }finally{busyRef.current=false;setBusy(false)}
  }
  const rows: ProductGroupReportRow[] = []
  const [reportRevision,setReportRevision]=useState(0)
  useEffect(()=>{setReportRevision(value=>value+1)},[nodes])
  const selectReportRow=useCallback((row:ProductGroupReportRow|null)=>{
    if(!entry && row) {setSelected(row.id);setSelectionRequest(old=>({nodeId:row.id,sequence:(old?.sequence ?? 0)+1}))}
  },[entry])
  const table = schema.tables![0]
  const columns = useMemo(() => table.columns.map(column => ({id:column.id,label:column.label[p.language],width:column.width ?? 180,type:'text' as const,value:(row: typeof rows[number]) => row.__runtimeValues[column.binding.kind === 'dataField' ? column.binding.dataFieldId : column.id] ?? ''})), [p.language, table])
  const action = (id: string) => {
    if(busyRef.current) return
    if (id === 'new-person' && p.can('create') && !entry) setCreateRequest(value => value + 1)
    if (!entry && ['edit-person','copy-selected','copy-last'].includes(id)) {
      const node=id==='copy-last' ? nodes.at(-1) : nodes.find(n=>n.id===selected)
      if(node && !(id==='edit-person' && node.isProtected) && p.can(id==='edit-person'?'edit':'create')) { p.onError('');setEntryRequest(old=>({nodeId:node.id,kind:id==='edit-person'?'edit':'copy',sequence:(old?.sequence ?? 0)+1})) }
    }
    if(id==='delete-person') {void remove();return}
    if (id === 'demo-save' && entry) scope.current?.querySelector<HTMLFormElement>('.cascading-tree-inline-add')?.requestSubmit()
    if (id === 'reset-sample') { if (entry) scope.current?.querySelector<HTMLFormElement>('.cascading-tree-inline-add')?.reset(); else p.onClose?.() }
  }
  const editor = <div className="person-editor panel laboratory-editor" data-tree-editor style={designerAppearanceStyle(p.designer) as CSSProperties}><div className="laboratory-form-grid"><div className="laboratory-designer-field lab-custom-field" style={{gridColumn:"1 / -1",width:"100%",minWidth:0}}><div><span hidden/><span className="designer-input-part" style={{width:"100%"}}>
    <CascadingTreePanels title={productGroupTitle[p.language]} key={treeRevision} initialNodes={treeInitial} initialPath={[]} maxSubgroups={rootDepth ?? p.initial.maxSubgroups} onSelectionChange={onSelectionChange} createRequest={createRequest} persistCreate={persistCreate} persistCreateBatch={persistCreateBatch} persistCopyChildren={p.can('create') ? copyProductGroupChildren : undefined} persistCopyBranch={p.can('create') ? copyProductGroupBranch : undefined} entryRequest={entryRequest} persistRename={persistRename} onNodesChange={onNodesChange} onEntryChange={setEntry} onNodeCreated={node=>setSelected(node.id)} selectionRequest={selectionRequest} renderPart={(part, _label, content) => {
      // OperationalFormFrame supplies the single standard title/settings header.
      if (part === 'header') return <></>
      if (!isValidElement(content)) return content
      const id = treeId + '.tree.' + part, values = designerEffectiveValues(p.designer,id,'input')
      const css = designerStyleForPart(p.designer,id,'input') as CSSProperties & Record<string, unknown>
      const map: Record<string,string> = {'--lab-bg':'backgroundColor','--lab-text':'color','--lab-border':'borderColor','--lab-font':'fontFamily','--lab-font-size':'fontSize','--lab-font-weight':'fontWeight','--lab-bold':'fontWeight','--lab-text-decoration':'textDecoration','--lab-text-decoration-style':'textDecorationStyle','--lab-padding-x':'paddingInline','--lab-padding-y':'paddingBlock','--lab-line-height':'lineHeight','--lab-font-style':'fontStyle','--lab-radius':'borderRadius','--lab-border-width':'borderWidth','--lab-border-style':'borderStyle','--lab-shadow':'boxShadow','--lab-gradient':'backgroundImage','--lab-text-align':'textAlign'}
      const native: Record<string,unknown> = {}; for (const [key,value] of Object.entries(css)) if (map[key]) native[map[key]] = value
      if (part.endsWith('.column')) { native['--tree-column-radius'] = css['--lab-radius']; native['--tree-column-fill'] = css['--lab-bg'] }
      if (part === 'body') { css['--lab-tree-body-fill'] = css['--lab-bg']; css['--lab-tree-body-radius'] = css['--lab-radius'] }
      const element = content as ReactElement<{style?: CSSProperties}>
      const slot = p.designer.flowSlots?.[id]
      const inline = ['back','all','path','status','limit'].includes(part)
      const align = values.verticalTextAlign === 'top' ? 'flex-start' : values.verticalTextAlign === 'bottom' ? 'flex-end' : 'center'
      const textSurface = typeof element.type === 'string' && (['button','small','span','output'].includes(element.type) || part==='path')
      if(textSurface && (values.textAlign!==undefined || values.verticalTextAlign!==undefined)) Object.assign(native,{display:'flex',flexDirection:'column',alignItems:'stretch',justifyContent:align,textAlign:values.textAlign ?? 'start','--lab-inline-content-align':values.textAlign==='center'?'center':values.textAlign==='left'?(p.language==='fa'?'flex-end':'flex-start'):values.textAlign==='right'?(p.language==='fa'?'flex-start':'flex-end'):values.textAlign==='end'?'flex-end':'flex-start'})
      const size: CSSProperties={...(part!=='body' && typeof values.width==='number'?{width:values.width}:{}),...(typeof values.height==='number'?{height:values.height}:{})}
      return <div className="laboratory-designer-field lab-tree-part" data-field-id={id} style={inline && slot ? {width:slot.width,height:slot.height,flex:'0 0 auto',alignSelf:'center'} : undefined}><div><span hidden/><span className="designer-input-part" data-field={id} style={{...css,...size} as CSSProperties}>{cloneElement(element,{style:{...element.props.style,...native,...(inline || part.endsWith('.column') ? {width:'100%',height:'100%'} : {})} as CSSProperties})}</span></div></div>
    }}/>
  </span></div></div></div></div>
  const footer = <div className="shortcut-bar laboratory-footer" style={designerAppearanceStyle(p.designer) as CSSProperties}>{p.lookupCreation && !entry && <Shortcut code="Enter" label={p.language==="fa"?"انتخاب":p.language==="zh"?"选择":"Select"} primary disabled={busy || !selected} onClick={()=>void chooseForLookup()}/>}{schema.actions?.filter(a => designerActionVisible(p.designer,a)).filter(a => entry ? ['demo-save','reset-sample'].includes(a.id) : a.id !== 'demo-save').filter(a=>!(['edit-person','delete-person'].includes(a.id) && nodes.find(n=>n.id===selected)?.isProtected)).map(a => <span key={a.id} className="laboratory-action-button" data-action-id={a.id} style={designerActionStyle(p.designer,a.id) as CSSProperties}><Shortcut code={designerActionCode(p.designer,a)} label={designerActionLabel(p.designer,a,p.language)} codeStyle={designerActionTextStyle(p.designer,a.id,'code')} labelStyle={designerActionTextStyle(p.designer,a.id,p.language)} primary={a.primary} disabled={busy || (['new-person','copy-last','copy-selected'].includes(a.id) && !p.can('create')) || (a.id==='edit-person' && !p.can('edit')) || (a.id==='delete-person' && !p.can('delete')) || (['edit-person','delete-person','copy-selected'].includes(a.id) && !nodes.some(n=>n.id===selected)) || (a.id==='copy-last' && !nodes.length)} runtimeAction={a.id === 'demo-save' ? 'save' : undefined} onClick={() => action(a.id)}/></span>)}</div>
  return <div ref={scope} style={{display:'contents'}} data-entry-active={entry || undefined} onFocusCapture={event=>{const id=(event.target as HTMLElement).closest<HTMLElement>('[data-tree-node]')?.dataset.treeNode;if(id) setSelected(id)}} onPointerDownCapture={event=>{if(entry && (event.target as Element).closest('.base-grid-boundary')) {event.preventDefault();event.stopPropagation();scope.current?.querySelector<HTMLInputElement>('.cascading-tree-inline-add input')?.focus({preventScroll:true})}}} onKeyDownCapture={event => {
    if(p.lookupCreation && !entry && event.key==='Enter' && !(event.target as Element).closest('input,textarea,select,button') && selected && !nodes.some(node=>node.parentId===selected)) {event.preventDefault();event.stopPropagation();void chooseForLookup();return}
    if(entry && event.key==='F1') {event.preventDefault();event.stopPropagation();return}
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
    if(!entry && !(event.target as Element).closest('input,textarea,select,[contenteditable="true"]')) {
      const id=({'Insert':'edit-person','Delete':'delete-person','F2':'copy-last','F4':'copy-selected'} as Record<string,string>)[event.key]
      if(id) {event.preventDefault();event.stopPropagation();if(!event.repeat) action(id);return}
    }
    if ((event.target as Element).closest('.cascading-tree-panels')) return
    if (event.key === 'F3' && entry) { event.preventDefault();event.stopPropagation(); action('demo-save'); return }
    if ((event.target as Element).closest('input,textarea,select,[contenteditable="true"]')) return
    if (event.key === ' ' && !entry) {event.preventDefault();event.stopPropagation();if(!event.repeat) action('new-person')}
    if (event.key === 'Escape') {event.preventDefault(); action('reset-sample')}
  }}><FormSchemaPresentation presentationMode="operational" schema={schema} designerDraft={p.designer} language={p.language} editor={editor} footer={footer} grid={{rows,columns,onBulkDelete:!entry&&p.can('delete')?bulkDeleteRows:undefined,remoteQuery:queryProductGroupReport,remoteQueryScope:reportRevision,selectedRowId:selected,title:table.title?.[p.language],onRowSelectionChange:selectReportRow}}/></div>
}
