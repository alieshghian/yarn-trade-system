import { useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  addCascadingTreeNode, backCascadingTreeOneLevel, cascadingTreeColumn, cascadingTreeDemoNodes,
  cascadingTreeBrowsePath, selectCascadingTreeNode, matchingCascadingSiblings,
  cascadingBranchCopyPreview, selectCascadingBranchItems, planCascadingBranchCopy, suggestCascadingTreeCode, cascadingNameKey, missingCascadingLevelNames, type CascadingTreeNode
} from './cascadingTree'
import './CascadingTreePanels.css'

const levelNames = ['گروه اصلی', 'زیرگروه ۱', 'زیرگروه ۲', 'زیرگروه ۳', 'زیرگروه ۴']
export const cascadingTreeDesignParts = [
  ...levelNames.flatMap((title, depth) => ['column', 'title', 'search', 'items', 'add', 'selected', 'change'].map(part => ({ id: `${depth}.${part}`, label: `${title} — ${({ column: 'پنل', title: 'عنوان', search: 'جست‌وجو', items: 'گزینه‌ها', add: 'افزودن', selected: 'گزینهٔ انتخاب‌شده', change: 'تغییر' } as Record<string, string>)[part]}` }))),
  { id: 'header', label: 'عنوان تعریف گروه‌های کالا' }, { id: 'body', label: 'پنل گروه‌ها' }, { id: 'back', label: 'یک سطح عقب' }, { id: 'all', label: 'نمایش همه' }, { id: 'path', label: 'مسیر انتخاب‌شده' }, { id: 'status', label: 'سطح انتخاب‌شده' }, { id: 'limit', label: 'حداکثر زیرگروه‌ها' }
]

/** Reject on failure; resolve only with the committed server identity and assigned code.
 * Aborting cancels this editor's interest, not necessarily the server transaction.
 */
export type CascadingTreeCreateAdapter = (request: {
  name: string; parentId: string | null; signal: AbortSignal
}) => Promise<CascadingTreeNode & { code: string }>

export type CascadingTreePanelsProps = {
  title?: string
  settingsAction?: ReactNode
  maxSubgroups?: number
  style?: CSSProperties
  initialNodes?: readonly CascadingTreeNode[]
  initialPath?: readonly string[]
  columnTitles?: readonly string[]
  createRequest?: number
  persistCreateBatch?: (request: {names: string[]; parentId: string | null; signal: AbortSignal}) => Promise<readonly (CascadingTreeNode & {code: string})[]>
  persistCreate?: CascadingTreeCreateAdapter
  persistCopyBranch?: (request: {sourceParentId: string; targetParentId: string; selectedIds: string[]; versions: Record<string,string>; signal: AbortSignal}) => Promise<readonly CascadingTreeNode[]>
  persistCopyChildren?: (request: {sourceParentId: string; poolSiblingSources?: boolean; poolLevelSources?: boolean; targets: {targetParentId: string; sourceChildIds: string[]}[]; signal: AbortSignal}) => Promise<readonly CascadingTreeNode[]>
  /** Optional operational commands; the default Laboratory path is unchanged. */
  entryRequest?: { nodeId: string; kind: 'edit' | 'copy'; sequence: number }
  persistRename?: (request: { node: CascadingTreeNode; name: string; signal: AbortSignal }) => Promise<CascadingTreeNode & { code: string }>
  onNodesChange?: (nodes: readonly CascadingTreeNode[]) => void
  onEntryChange?: (active: boolean) => void
  selectionRequest?: { nodeId: string; sequence: number; markerColor?: string }
  onNodeCreated?: (node: CascadingTreeNode, path: readonly CascadingTreeNode[]) => void
  onSelectionChange?: (path: readonly string[]) => void
  renderColumnSelector?: (depth: number, title: string) => ReactNode
  renderPart?: (id: string, label: string, content: ReactNode) => ReactNode
}

function validInitialPath(nodes: readonly CascadingTreeNode[], initialPath: readonly string[] = []): string[] {
  const path: string[] = []
  let parentId: string | null = null
  for (const id of initialPath.slice(0, levelNames.length)) {
    const node = nodes.find(item => item.id === id && item.parentId === parentId)
    if (!node) break
    path.push(node.id)
    parentId = node.id
  }
  return path
}

const demoInitialPath = ['demo-yarn', 'demo-yarn-chenille', 'demo-yarn-polyester', 'demo-yarn-grade-8']

/** Scroll only this list; keep the selection central and two real neighbours visible when they fit. */
function revealTreeSelection(list: HTMLElement, item: HTMLElement, rows: HTMLElement[], anchorY?: number) {
  if (!list.clientHeight) return
  let visualAnchor=anchorY, needsContextOverflow=false
  // A shared feasible anchor keeps fitting lists fully visible without turning
  // centering spacers into scrollable content. Only real rows set fit limits.
  if(item.closest('[data-tree-path-current="true"]')) {
    let low=-Infinity,high=Infinity
    for(const peer of list.closest('.cascading-tree-columns')?.querySelectorAll<HTMLElement>('.cascading-tree-items') ?? []) {
      const selected=peer.querySelector<HTMLElement>('[data-tree-path-current="true"]')
      const peers=Array.from(peer.querySelectorAll<HTMLElement>('.cascading-tree-node-row'))
      if(!selected || !peers.length || !peer.clientHeight) continue
      const css=getComputedStyle(peer),pt=parseFloat(css.paddingTop)||0,pb=parseFloat(css.paddingBottom)||0
      const first=peers[0].getBoundingClientRect(),last=peers.at(-1)!.getBoundingClientRect(),r=selected.getBoundingClientRect()
      const available=peer.clientHeight-pt-pb,content=last.bottom-first.top,center=r.top-first.top+r.height/2
      if(content<=available) {
        const top=peer.getBoundingClientRect().top+peer.clientTop+pt
        low=Math.max(low,top+center);high=Math.min(high,top+available-(content-center))
      }
    }
    needsContextOverflow=low>high
    if(low<=high)visualAnchor=Math.max(low,Math.min(high,visualAnchor ?? list.getBoundingClientRect().top+list.clientTop+list.clientHeight/2))
  }
  const head=list.querySelector<HTMLElement>('[data-context-head],[data-report-head]')
  const tail=list.querySelector<HTMLElement>('[data-context-tail],[data-report-tail]')
  if(head && tail && rows.length) {
    const actual=rows.map(row=>row.closest<HTMLElement>('.cascading-tree-node-row') ?? row)
    const selected=item.closest<HTMLElement>('.cascading-tree-node-row') ?? item
    head.style.height='0px';tail.style.height='0px'
    const first=actual[0].getBoundingClientRect(),last=actual.at(-1)!.getBoundingClientRect(),rect=selected.getBoundingClientRect()
    const css=getComputedStyle(list),padding=(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)
    const available=Math.max(0,list.clientHeight-padding),content=last.bottom-first.top,center=rect.top-first.top+rect.height/2
    const targetCenter=visualAnchor===undefined ? available/2 : visualAnchor-list.getBoundingClientRect().top-list.clientTop-(parseFloat(css.paddingTop)||0)
    // Fit real rows without scrollable filler; overflow lists retain enough
    // context space to reveal the first/last row at the shared path anchor.
    const before=Math.max(0,content<=available && !needsContextOverflow ? Math.min(available-content,targetCenter-center) : targetCenter-center)
    head.style.height=before+'px'
    tail.style.height=Math.max(0,content<=available && !needsContextOverflow ? available-content-before-1 : available-targetCenter-(content-center))+'px'
  }
  const viewport=list.getBoundingClientRect(),rect=item.getBoundingClientRect()
  const desired=rect.top-viewport.top-list.clientTop+list.scrollTop+rect.height/2-(visualAnchor===undefined?list.clientHeight/2:visualAnchor-viewport.top-list.clientTop)
  list.scrollTop=Math.max(0,Math.min(list.scrollHeight-list.clientHeight,desired))
}

export function CascadingTreePanels({ title = 'تعریف گروه‌های کالا', initialNodes, initialPath, columnTitles = levelNames, createRequest = 0, persistCreate, persistCreateBatch, persistCopyChildren, persistCopyBranch, entryRequest, persistRename, onNodesChange, onEntryChange, selectionRequest, onSelectionChange, onNodeCreated, renderPart, renderColumnSelector, style, maxSubgroups = 4, settingsAction }: CascadingTreePanelsProps = {}) {
  const levelCount = 1 + Math.max(0, Math.min(4, Math.trunc(Number.isFinite(maxSubgroups) ? maxSubgroups : 4)))
  const [nodes, setNodes] = useState<CascadingTreeNode[]>(() => (initialNodes ?? cascadingTreeDemoNodes).map(node => ({ ...node })))
  const nodesRef = useRef(nodes)
  const nodesChangeRef = useRef(onNodesChange)
  nodesChangeRef.current = onNodesChange
  useEffect(() => { nodesChangeRef.current?.(nodes) }, [nodes])
  const [path, setPath] = useState<string[]>(() => validInitialPath(initialNodes ?? cascadingTreeDemoNodes, initialPath ?? demoInitialPath))
  const [addingLevel, setAddingLevel] = useState<number | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copyLevel, setCopyLevel] = useState<number | null>(null)
  const [copySource, setCopySource] = useState('')
  const [branchExpanded, setBranchExpanded] = useState(false)
  const copyDialogRef = useRef<HTMLDialogElement | null>(null)
  useLayoutEffect(() => {
    const dialog = copyDialogRef.current
    if (!branchExpanded || !dialog) return
    const form = dialog.querySelector<HTMLElement>('.cascading-tree-copy')
    const footer = dialog.querySelector<HTMLElement>('.cascading-tree-column-foot')
    if (!form || !footer) return
    const resize = () => {
      const height = Math.ceil(form.getBoundingClientRect().height + footer.getBoundingClientRect().height + 22)
      dialog.style.setProperty('--tree-copy-content-height', `${height}px`)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(form); observer.observe(footer)
    return () => observer.disconnect()
  }, [branchExpanded])
  const [branchTarget, setBranchTarget] = useState('')
  const [branchSource, setBranchSource] = useState('')
  const [branchSelected, setBranchSelected] = useState<string[]>([])
  const [copySelections, setCopySelections] = useState<Record<string, string[]>>({})
  const copyTrigger = useRef<HTMLButtonElement | null>(null)
  const copyPending = useRef<AbortController | null>(null)
  useEffect(() => () => {copyPending.current?.abort();copyPending.current=null}, [])
  useLayoutEffect(() => {
    if (copyPending.current) {
      copyPending.current.abort();copyPending.current=null;setSaving(false);setCopyLevel(null);setBranchTarget('');setBranchSource('');setBranchSelected([])
    }
  }, [path, levelCount, persistCopyBranch, persistCopyChildren])
  const entryDrafts = useRef(new Map<string, string>())
  const pendingCreate = useRef<{ controller: AbortController; depth: number; path: string[]; adapter: unknown; kind?: 'edit' } | null>(null)
  const cancelPendingCreate = () => {
    const pending = pendingCreate.current
    if (!pending) return
    pendingCreate.current = null
    pending.controller.abort()
    setSaving(false)
  }
  // A response belongs to one editor session and parent path, never a later one.
  useLayoutEffect(() => {
    const pending = pendingCreate.current
    if (pending && (pending.adapter !== (pending.kind === 'edit' ? persistRename : persistCreate) || pending.depth !== addingLevel || pending.depth >= levelCount || pending.path.length !== path.length || pending.path.some((id, index) => id !== path[index]))) cancelPendingCreate()
  }, [path, addingLevel, levelCount, persistCreate, persistRename])
  useEffect(() => () => {
    const pending = pendingCreate.current
    pendingCreate.current = null
    pending?.controller.abort()
  }, [])
  const entryChangeRef = useRef(onEntryChange)
  entryChangeRef.current = onEntryChange
  const entryActive = addingLevel !== null || copyLevel !== null
  useEffect(() => { entryChangeRef.current?.(entryActive) }, [entryActive])
  const [queuedNames, setQueuedNames] = useState<string[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const inputId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const activeGroup = useRef<{ depth: number; nodeId: string; path: string[] } | null>(null)
  // Create follows the current focus context, not a historical selection/report marker.
  const createContext = useRef<{level: number; path: string[]} | null>(null)
  const [matchIndex, setMatchIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const pathRef = useRef(path); pathRef.current = path
  useEffect(() => () => { copyPending.current?.abort(); copyPending.current = null }, [])
  const [queries, setQueries] = useState<string[]>([])
  const [searchSelection, setSearchSelection] = useState<{depth: number; nodeId: string} | null>(null)
  const searchCandidate = (depth: number, query: string) => {
    const options = matchingCascadingSiblings(nodesRef.current, depth === 0 ? null : path[depth - 1] ?? null, query)
    return options.find(node => cascadingNameKey(node.name) === cascadingNameKey(query)) ?? options.find(node => cascadingNameKey(node.name).startsWith(cascadingNameKey(query))) ?? options[0]
  }
  const [reportPath, setReportPath] = useState<string[]>([])
  const [reportMarkerColor, setReportMarkerColor] = useState<string>()
  const [browseDepth, setBrowseDepth] = useState<number | null>(null)
  const persistedFocus = useRef<{depth: number; nodeId?: string} | null>(null)
  const focusColumn = (depth: number, nodeId?: string) => {
    requestAnimationFrame(() => {
      const column = rootRef.current?.querySelector<HTMLElement>(`[data-tree-depth="${depth}"]`)
      const buttons = Array.from(column?.querySelectorAll<HTMLButtonElement>('[data-tree-node]') ?? [])
      const target = buttons.find(button => button.dataset.treeNode === nodeId) ?? buttons[0] ?? column
      target?.focus({preventScroll:true})
      const list = target?.closest<HTMLElement>('.cascading-tree-items')
      if (list && target) revealTreeSelection(list, target, Array.from(list.querySelectorAll<HTMLElement>('[data-tree-node]')))
    })
  }
  useLayoutEffect(() => {
    const target = persistedFocus.current
    if (!target) return
    persistedFocus.current = null
    if (target.nodeId) focusColumn(target.depth, target.nodeId)
    else inputRef.current?.focus()
  }, [nodes])
  // Each group column is one editable field. Its internal controls and nodes are
  // component content, so they must not create nested designer selections.
  const part = (id: string, content: ReactNode, label?: string) => {
    if (/^\d+\.(?!column$)/.test(id) || id.startsWith('node.')) return content
    return renderPart?.(id, label ?? cascadingTreeDesignParts.find(item => item.id === id)?.label ?? id, content) ?? content
  }
  const normalize = cascadingNameKey
  useEffect(() => { if (addingLevel !== null) inputRef.current?.focus() }, [addingLevel])
  useEffect(() => { onSelectionChange?.(path) }, [path, onSelectionChange])
  useEffect(() => {
    const list = rootRef.current?.querySelector<HTMLElement>('.cascading-tree-inline-matches')
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !active) return
    revealTreeSelection(list, active, Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')))
  }, [matchIndex, name, addingLevel])
  const alignBrowseSelection = () => {
    if (renderColumnSelector || copyLevel !== null || reportPath.length || (addingLevel === null && browseDepth === null)) return
    const activeDepth=searchSelection?.depth ?? browseDepth ?? Math.max(0,path.length-1)
    const activeList=rootRef.current?.querySelector<HTMLElement>(`[data-tree-depth="${activeDepth}"] .cascading-tree-items`)
    const activeRows=Array.from(activeList?.querySelectorAll<HTMLElement>('.cascading-tree-node-row') ?? [])
    const activeId=searchSelection?.nodeId ?? path[activeDepth]
    const anchorRow=activeRows.find(row=>row.dataset.treePathCurrent==='true' && !searchSelection || row.querySelector<HTMLElement>('[data-tree-node]')?.dataset.treeNode===activeId)
    if(activeList && anchorRow)revealTreeSelection(activeList,anchorRow,activeRows)
    const anchorY=anchorRow ? (anchorRow.getBoundingClientRect().top+anchorRow.getBoundingClientRect().bottom)/2 : undefined
    for(const list of rootRef.current?.querySelectorAll<HTMLElement>('.cascading-tree-items') ?? []) {
      const depth=Number(list.closest<HTMLElement>('[data-tree-depth]')?.dataset.treeDepth)
      if(depth===addingLevel) continue
      const rows=Array.from(list.querySelectorAll<HTMLElement>('.cascading-tree-node-row'))
      const id=searchSelection?.depth===depth ? searchSelection.nodeId : path[depth]
      const active=rows.find(row=>row.querySelector<HTMLElement>('[data-tree-node]')?.dataset.treeNode===id || row.querySelector('[data-tree-selected-ancestor]'))
      if(active && list!==activeList)revealTreeSelection(list,active,rows,anchorY)
      else if(!active)for(const spacer of list.querySelectorAll<HTMLElement>('[data-context-head],[data-context-tail]'))spacer.style.height='0px'
    }
  }
  useLayoutEffect(alignBrowseSelection, [path, queries, browseDepth, addingLevel, reportPath, renderColumnSelector, searchSelection, copyLevel, branchExpanded])
  useEffect(() => {
    if (!selectionRequest) { setReportPath([]); return }
    setSearchSelection(null)
    const next: string[] = [], seen = new Set<string>()
    let node = nodesRef.current.find(node => node.id === selectionRequest.nodeId)
    while (node && !seen.has(node.id)) {
      seen.add(node.id); next.unshift(node.id)
      node = node.parentId === null ? undefined : nodesRef.current.find(item => item.id === node!.parentId)
    }
    const valid = validInitialPath(nodesRef.current, next).slice(0, levelCount)
    if (valid.length === next.length) { cancelPendingCreate(); setPath(valid); setReportPath(valid); setReportMarkerColor(selectionRequest.markerColor); setBrowseDepth(Math.max(0, valid.length - 1)); setQueries([]); setAddingLevel(null); setMessage('') }
  }, [selectionRequest?.sequence])

  useLayoutEffect(() => {
    if (!reportPath.length || !rootRef.current) return
    const root = rootRef.current
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.cascading-tree-node-row'))
    const rowHeight = Math.max(38, ...rows.map(row => Math.max(...Array.from(row.children, child => child.getBoundingClientRect().height))))
    root.style.setProperty('--tree-report-row-height', `${rowHeight}px`)
    for (const list of root.querySelectorAll<HTMLElement>('[data-report-list]')) {
      const current=list.querySelector<HTMLElement>('.cascading-tree-node-row:has([data-report-current="true"])')
      if(current)revealTreeSelection(list,current,Array.from(list.querySelectorAll<HTMLElement>('.cascading-tree-node-row')))
      else list.scrollTop=0
    }
  }, [reportPath, selectionRequest?.sequence])

  useLayoutEffect(() => {
    if(renderColumnSelector || !rootRef.current) return
    let frame=0
    const lists=Array.from(rootRef.current.querySelectorAll<HTMLElement>('.cascading-tree-items'))
    const observer=new ResizeObserver(()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if (!reportPath.length) { alignBrowseSelection(); return }
        if (copyLevel !== null) return
        for(const list of lists) {
          const rows=Array.from(list.querySelectorAll<HTMLElement>('.cascading-tree-node-row'))
          const selected=rows.find(row=>row.dataset.treePathCurrent==='true')
          if(selected)revealTreeSelection(list,selected,rows)
        }
      })
    })
    for(const list of lists) {
      observer.observe(list)
      const rows=list.querySelectorAll('.cascading-tree-node-row')
      for(const row of new Set([rows[0],rows[rows.length-1],list.querySelector('[data-tree-path-current="true"]')]))if(row)observer.observe(row)
    }
    return()=>{cancelAnimationFrame(frame);observer.disconnect()}
  },[nodes,path,reportPath,levelCount,renderColumnSelector,copyLevel,branchExpanded,queries,browseDepth,addingLevel,searchSelection])

  useEffect(() => { setPath(current => current.length > levelCount ? current.slice(0, levelCount) : current); setAddingLevel(current => current !== null && current >= levelCount ? null : current) }, [levelCount])

  const startAdd = (level: number, parentPath = path, restoreDraft = false) => {
    if (copyPending.current) return
    if (queuedNames.length) { setMessage('ابتدا فهرست ثبت گروهی را ثبت یا لغو کنید.'); return }
    setEditingNodeId(null)
    if (level < 0 || level >= levelCount) return
    if (level > 0 && validInitialPath(nodesRef.current, parentPath).length < level) {
      setMessage('ابتدا گروه بالادستی را انتخاب کنید.'); return
    }
    cancelPendingCreate()
    setReportPath([])
    setPath(parentPath.slice(0, level))
    setBrowseDepth(null)
    setAddingLevel(level)
    setMatchIndex(-1)
    setName(restoreDraft ? entryDrafts.current.get(`${level}|${parentPath[level - 1] ?? ''}`) ?? '' : '')
    setMessage('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  useEffect(() => {
    if (createRequest <= 0) return
    const context = createContext.current
    if (context) startAdd(context.level, context.path)
    else startAdd(0)
  }, [createRequest])
  useEffect(() => {
    if (!entryRequest || pendingCreate.current || (entryRequest.kind === 'edit' && !persistRename)) return
    const node = nodesRef.current.find(item => item.id === entryRequest.nodeId)
    if (!node || (entryRequest.kind === 'edit' && node.isProtected)) return
    const ancestors: string[] = [], seen = new Set<string>()
    let current: CascadingTreeNode | undefined = node
    while (current && !seen.has(current.id)) {
      seen.add(current.id); ancestors.unshift(current.id)
      current = nodesRef.current.find(item => item.id === current!.parentId)
    }
    if (ancestors.length > levelCount) return
    activeGroup.current = {depth: ancestors.length - 1, nodeId: node.id, path: ancestors}
    const terminalLimit = Math.min(levelCount - 1,byId.get(ancestors[0])?.lockedDepth ?? levelCount - 1)
    const targetDepth = entryRequest.kind === 'copy' ? Math.min(ancestors.length,terminalLimit) : ancestors.length - 1
    startAdd(targetDepth, ancestors)
    setEditingNodeId(entryRequest.kind === 'edit' ? node.id : null)
    setName(entryRequest.kind === 'edit' ? node.name : '')
    if(entryRequest.kind === 'copy' && ancestors.length > terminalLimit) setMessage('آخرین سطح مجاز است؛ والد موردنظر را دستی انتخاب کنید. چیزی خودکار ثبت نشده است.')
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
  }, [entryRequest])
  const cancelEntry = () => {
    copyPending.current?.abort(); copyPending.current = null; setSaving(false); setCopyLevel(null)
    cancelPendingCreate()
    setEditingNodeId(null)
    setQueuedNames([])
    entryDrafts.current.clear()
    setAddingLevel(null); setName(''); setMessage(''); setMatchIndex(-1)
    const active = activeGroup.current
    if (active) {
      setPath(active.path); setBrowseDepth(active.depth)
      setQueries(current => current.map((query, depth) => depth === active.depth ? '' : query))
      focusColumn(active.depth, active.nodeId)
    } else { setBrowseDepth(0); focusColumn(0) }
  }
  const chooseExisting = (depth: number, node: CascadingTreeNode) => {
    if (pendingCreate.current) return
    if (queuedNames.length) {setMessage('ابتدا فهرست ثبت گروهی را ثبت یا لغو کنید.');return}
    setEditingNodeId(null)
    const nextPath = selectCascadingTreeNode(nodesRef.current, path, depth, node.id)
    activeGroup.current = { depth, nodeId: node.id, path: nextPath }
    entryDrafts.current.set(`${depth}|${node.parentId ?? ''}`, node.name)
    setPath(nextPath)
    setName(depth < levelCount - 1 ? entryDrafts.current.get(`${depth + 1}|${node.id}`) ?? '' : ''); setMessage(''); setMatchIndex(-1)
    setAddingLevel(depth < levelCount - 1 ? depth + 1 : null)
    setBrowseDepth(depth < levelCount - 1 ? null : depth)
    if (depth === levelCount - 1) focusColumn(depth, node.id)
  }
  const commitCreatedNode = (node: CascadingTreeNode, nextNodes: CascadingTreeNode[], depth: number, parentPath: readonly string[], persisted = false) => {
    entryDrafts.current.set(`${depth}|${node.parentId ?? ''}`, node.name)
    if (persisted) persistedFocus.current = depth < levelCount - 1 ? {depth: depth + 1} : {depth, nodeId: node.id}
    const createdPath = [...parentPath.slice(0, depth), node.id].map(id => nextNodes.find(item => item.id === id)).filter((item): item is CascadingTreeNode => Boolean(item))
    nodesRef.current = nextNodes
    setNodes(nextNodes)
    onNodeCreated?.(node, createdPath)
    const nextPath = [...parentPath.slice(0, depth), node.id]
    activeGroup.current = { depth, nodeId: node.id, path: nextPath }
    setPath(nextPath)
    setName('')
    setMatchIndex(-1)
    setQueries(current => current.map((query, index) => index >= depth ? '' : query))
    setAddingLevel(depth < levelCount - 1 ? depth + 1 : null)
    setBrowseDepth(depth < levelCount - 1 ? null : depth)
    setMessage(depth < levelCount - 1 ? '' : 'گروه اضافه شد؛ آخرین سطح تکمیل شد.')
    if (!persisted) {
      if (depth === levelCount - 1) focusColumn(depth, node.id)
      else requestAnimationFrame(() => inputRef.current?.focus())
    }
  }
  const addNode = async () => {
    if (pendingCreate.current) return
    if (addingLevel === null || addingLevel >= levelCount) return
    const parentId = addingLevel === 0 ? null : path[addingLevel - 1]
    if (addingLevel > 0 && (!parentId || validInitialPath(nodesRef.current, path).length < addingLevel)) {
      setMessage('ابتدا گروه بالادستی را انتخاب کنید.')
      return
    }
    if (persistCreate) {
      const pending = { controller: new AbortController(), depth: addingLevel, path: [...path], adapter: persistCreate }
      pendingCreate.current = pending
      setSaving(true)
      setMessage('')
      let node: CascadingTreeNode & { code: string }
      try {
        node = await persistCreate({ name: name.trim().replace(/\s+/g, ' '), parentId: parentId ?? null, signal: pending.controller.signal })
        if (pendingCreate.current !== pending || pending.controller.signal.aborted) return
        if (!node || typeof node.id !== 'string' || !node.id.trim() || node.parentId !== (parentId ?? null) || typeof node.name !== 'string' || !normalize(node.name) || typeof node.code !== 'string' || !node.code.trim() || nodesRef.current.some(item => item.id === node.id || item.parentId === node.parentId && normalize(item.name) === normalize(node.name))) throw new Error('پاسخ ثبت گروه معتبر نیست؛ اطلاعات سرور را بررسی کنید.')
      } catch (error) {
        if (pendingCreate.current !== pending || pending.controller.signal.aborted) return
        pendingCreate.current = null
        setSaving(false)
        setMessage(error instanceof Error ? error.message.slice(0, 160) || 'ثبت گروه انجام نشد؛ دوباره تلاش کنید.' : 'ثبت گروه انجام نشد؛ دوباره تلاش کنید.')
        inputRef.current?.focus()
        return
      }
      pendingCreate.current = null
      setSaving(false)
      commitCreatedNode({ ...node }, [...nodesRef.current, { ...node }], pending.depth, pending.path, true)
      return
    }
    const result = addCascadingTreeNode(nodesRef.current, parentId ?? null, name, globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random()}`)
    if (!result.ok) {
      setMessage(result.reason === 'duplicate' ? 'این نام از قبل زیر همین گروه وجود دارد.' : result.reason === 'depth' ? 'حداکثر پنج سطح مجاز است.' : result.reason === 'empty' ? 'نام گروه الزامی است.' : result.reason === 'code' ? 'تخصیص کد یکتا ممکن نشد.' : 'افزودن گروه انجام نشد.')
      return
    }
    commitCreatedNode(result.node, result.nodes, addingLevel, path)
  }

  const byId = new Map(nodes.map(node => [node.id, node]))
  const nodePath = (node: CascadingTreeNode) => {
    const result: CascadingTreeNode[] = [], seen = new Set<string>()
    let current: CascadingTreeNode | undefined = node
    while (current && !seen.has(current.id)) { seen.add(current.id); result.unshift(current); current = current.parentId ? byId.get(current.parentId) : undefined }
    return result
  }
  const chooseSuggestion = (depth: number, node: CascadingTreeNode) => {
    if (saving) return
    if (node.parentId === (depth === 0 ? null : path[depth - 1])) {
      // Picking an existing sibling finishes entry; it is never a create operation.
      if(pendingCreate.current||queuedNames.length){chooseExisting(depth,node);return}
      chooseExisting(depth,node)
      entryDrafts.current.clear();setAddingLevel(null);setName('');setBrowseDepth(depth)
      focusColumn(depth,node.id)
    }
    else { setName(node.name); setMatchIndex(-1); setMessage('نام از شاخهٔ دیگر انتخاب شد؛ برای ثبت زیر والد فعلی F3 را بزنید.'); inputRef.current?.focus() }
  }
  const missingCopyItems = (depth: number, targetId: string) => {
    const target = byId.get(targetId)
    if (!target || nodePath(target).length !== depth) return []
    return missingCascadingLevelNames(nodes, targetId, depth, queuedNames)
  }
  const closeCopy = (restoreFocus = true) => {
    copyPending.current?.abort(); copyPending.current = null; setSaving(false)
    setBranchExpanded(false); setCopyLevel(null); setBranchTarget(''); setBranchSource(''); setBranchSelected([]); setCopySource(''); setCopySelections({}); setMessage('')
    const depth = copyLevel
    if (!restoreFocus) return
    requestAnimationFrame(() => {
      if (addingLevel !== null) inputRef.current?.focus()
      else if (copyTrigger.current?.isConnected) copyTrigger.current.focus({preventScroll:true})
      else if (depth !== null) rootRef.current?.querySelector<HTMLElement>(`[data-tree-depth="${depth}"] [data-tree-copy-children]`)?.focus({preventScroll:true})
    })
  }
  useEffect(() => {
    if (copyLevel !== null) rootRef.current?.querySelector<HTMLElement>('.cascading-tree-copy')?.focus({preventScroll:true})
  }, [copyLevel])
  const openCopy = (depth: number, trigger: HTMLButtonElement) => {
    if (saving) return
    if (queuedNames.length) {setMessage('ابتدا فهرست ثبت گروهی را ثبت یا لغو کنید.');return}
    if (copyLevel === depth) { closeCopy(); return }
    if (!missingCopyItems(depth, path[depth - 1] ?? '').length) return
    copyTrigger.current = trigger; setCopyLevel(depth)
    const targetId = path[depth - 1] ?? ''
    setCopySource(targetId); setCopySelections({[targetId]:missingCopyItems(depth,targetId).map(node=>node.id)}); setMessage('')
  }
  const branchRows = branchSource && branchTarget ? cascadingBranchCopyPreview(nodes, branchSource, branchTarget) : []
  const branchSources = branchTarget ? nodes.filter(node => node.id !== branchTarget && nodePath(node).length === nodePath(byId.get(branchTarget)!).length && nodes.some(child => child.parentId === node.id)) : []
  let branchPlan: ReturnType<typeof planCascadingBranchCopy> | undefined, branchError = ''
  if (branchSource && branchSelected.length) {
    try { let serial=0; branchPlan=planCascadingBranchCopy(nodes,branchSource,branchTarget,branchSelected,levelCount-1,()=> 'preview-branch-'+(++serial)) }
    catch(error) { branchError=error instanceof Error ? error.message : 'انتخاب معتبر نیست.' }
  }
  const openBranch = (depth: number, trigger: HTMLButtonElement) => {
    if (entryActive || saving || !path[depth] || depth >= levelCount-1) return
    copyTrigger.current=trigger;setBranchTarget(path[depth]);setBranchSource('');setBranchSelected([]);setCopyLevel(depth+1);setMessage('')
  }
  const copyBranch = async () => {
    if (!branchPlan || !branchPlan.created || saving || copyPending.current) return
    const controller=new AbortController();copyPending.current=controller;setSaving(true);setMessage('')
    try {
      const versions: Record<string,string>={}
      for(const id of [branchSource,branchTarget,...branchSelected]) { const node=byId.get(id); if(node && 'rowVersion' in node && typeof node.rowVersion==='string') versions[id]=node.rowVersion }
      const copied=persistCopyBranch ? await persistCopyBranch({sourceParentId:branchSource,targetParentId:branchTarget,selectedIds:branchSelected,versions,signal:controller.signal}) : !persistCreate ? planCascadingBranchCopy(nodesRef.current,branchSource,branchTarget,branchSelected,levelCount-1,()=>crypto.randomUUID()).items : (()=>{throw Error('اتصال کپی شاخه تنظیم نشده است.')})()
      if(controller.signal.aborted || copyPending.current!==controller) return
      const merged=new Map(nodesRef.current.map(node=>[node.id,node]));copied.forEach(node=>merged.set(node.id,node))
      const target=byId.get(branchTarget)!, targetPath=nodePath(target).map(node=>node.id)
      const first=copied.find(node=>node.parentId===target.id)
      if(!first || copied.some(node=>!node.id || !normalize(node.name) || !node.parentId || !merged.has(node.parentId))) throw Error('پاسخ کپی شاخه معتبر نیست.')
      const nextPath=cascadingTreeBrowsePath([...merged.values()],targetPath,targetPath.length,first.id,levelCount)
      nodesRef.current=[...merged.values()];setNodes(nodesRef.current);closeCopy(false);setAddingLevel(null);setReportPath([]);setSearchSelection(null);setQueries([]);setPath(nextPath);setBrowseDepth(targetPath.length)
      activeGroup.current={depth:targetPath.length,nodeId:first.id,path:nextPath};persistedFocus.current={depth:targetPath.length,nodeId:first.id};focusColumn(targetPath.length,first.id);setMessage(`کپی شاخه تکمیل شد: هر ${branchSelected.length} مورد انتخاب‌شده بررسی و تأیید شد.`)
    } catch(error) {if(!controller.signal.aborted)setMessage(error instanceof Error ? error.message : 'کپی شاخه انجام نشد.')}
    finally {if(copyPending.current===controller){copyPending.current=null;setSaving(false)}}
  }
  const copyChildren = async (depth: number) => {
    if (branchTarget) { await copyBranch(); return }
    const source = byId.get(copySource)
    const selected = missingCopyItems(depth, copySource).filter(node => copySelections[copySource]?.includes(node.id))
    const targets = selected.length ? [{targetParentId: copySource, sourceChildIds: selected.map(node => node.id)}] : []
    if (!source || !targets.length || saving || pendingCreate.current || copyPending.current) return
    const controller = new AbortController(); copyPending.current = controller; setSaving(true); setMessage('')
    try {
      let copied: readonly CascadingTreeNode[]
      if (persistCopyChildren) copied = await persistCopyChildren({sourceParentId: source.id, poolLevelSources: true, targets, signal: controller.signal})
      else {
        let next = [...nodesRef.current]; const added: CascadingTreeNode[] = []
        for (const target of targets) for (const id of target.sourceChildIds) {
          const child = nodesRef.current.find(node => node.id === id && node.parentId !== source.id && nodePath(node).length === depth + 1)
          if (!child) throw Error('مبدأ تغییر کرده است؛ دوباره انتخاب کنید.')
          if (next.some(node => node.parentId === target.targetParentId && normalize(node.name) === normalize(child.name))) continue
          const result = addCascadingTreeNode(next, target.targetParentId, child.name, crypto.randomUUID())
          if (!result.ok) throw Error('کپی زیرگروه‌ها انجام نشد.')
          next = result.nodes; added.push(result.node)
        }
        copied = added
      }
      if (controller.signal.aborted || copyPending.current !== controller) return
      if (copied.some(node => !node.id || !targets.some(target => target.targetParentId === node.parentId) || !normalize(node.name))) throw Error('پاسخ کپی معتبر نیست.')
      const merged = new Map(nodesRef.current.map(node => [node.id, node])); copied.forEach(node => merged.set(node.id, node))
      nodesRef.current = [...merged.values()]; setNodes(nodesRef.current)
      const selectedCopy=selected.map(item=>nodesRef.current.find(node=>node.parentId===source.id && normalize(node.name)===normalize(item.name))).find((node): node is CascadingTreeNode=>Boolean(node))
      closeCopy(false); setAddingLevel(null); setName(''); setSearchSelection(null); setReportPath([])
      if(selectedCopy) {
        const copiedPath=[...nodePath(source).map(node=>node.id),selectedCopy.id]
        activeGroup.current={depth,nodeId:selectedCopy.id,path:copiedPath}
        setPath(copiedPath);setBrowseDepth(depth)
        setQueries(current=>current.map((query,index)=>index>=depth?'':query))
        persistedFocus.current={depth,nodeId:selectedCopy.id}
        focusColumn(depth,selectedCopy.id)
      }
      setMessage('موارد انتخاب‌شده ثبت شدند.')
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'کپی انجام نشد.') }
    finally { if (copyPending.current === controller) { copyPending.current = null; setSaving(false); requestAnimationFrame(()=>rootRef.current?.querySelector<HTMLElement>('.cascading-tree-copy')?.focus({preventScroll:true})) } }
  }
  const selectedNodes = path.slice(0, levelCount).map(id => byId.get(id)).filter((node): node is CascadingTreeNode => Boolean(node))
  const renameNode = async () => {
    const original = nodesRef.current.find(node => node.id === editingNodeId)
    if (!original || !persistRename || addingLevel === null || pendingCreate.current) return
    if (matchingCascadingSiblings(nodesRef.current, original.parentId, name).some(node => node.id !== original.id && normalize(node.name) === normalize(name))) { setMessage('این نام از قبل زیر همین گروه وجود دارد.'); return }
    const pending = {controller: new AbortController(), depth: addingLevel, path: [...path], adapter: persistRename, kind: 'edit' as const}
    pendingCreate.current = pending; setSaving(true); setMessage('')
    try {
      const node = await persistRename({node: original, name: name.trim(), signal: pending.controller.signal})
      if (pendingCreate.current !== pending || pending.controller.signal.aborted) return
      if (node.id !== original.id || node.parentId !== original.parentId || node.code !== original.code || !normalize(node.name)) throw Error('پاسخ ویرایش گروه معتبر نیست.')
      const next = nodesRef.current.map(item => item.id === node.id ? {...node} : item)
      nodesRef.current = next; setNodes(next)
      pendingCreate.current = null; setSaving(false); setEditingNodeId(null); setAddingLevel(null); setName('')
      const nextPath = [...pending.path.slice(0, pending.depth), node.id]
      activeGroup.current = {depth: pending.depth, nodeId: node.id, path: nextPath}
      setPath(nextPath); setBrowseDepth(pending.depth)
      persistedFocus.current = {depth: pending.depth, nodeId: node.id}
    } catch (error) {
      if (pendingCreate.current !== pending || pending.controller.signal.aborted) return
      pendingCreate.current = null; setSaving(false)
      setMessage(error instanceof Error ? error.message.slice(0,160) : 'ویرایش انجام نشد.')
      inputRef.current?.focus()
    }
  }
  const queueName = () => {
    if (saving || editingNodeId) return
    const value=name.trim(),parentId=addingLevel===0?null:path[(addingLevel ?? 0)-1] ?? null
    if(!normalize(value)) {setMessage('نام گروه الزامی است.');return}
    if(queuedNames.length>=99) {setMessage('حداکثر صد مورد در هر ثبت گروهی مجاز است.');return}
    if(queuedNames.some(item=>normalize(item)===normalize(value)) || nodesRef.current.some(node=>node.parentId===parentId && normalize(node.name)===normalize(value))) {setMessage('این نام در این گروه یا فهرست ثبت وجود دارد.');return}
    setQueuedNames(current=>[...current,value]);setName('');setMessage('');setMatchIndex(-1)
    requestAnimationFrame(()=>inputRef.current?.focus())
  }
  const saveBatch = async () => {
    if(addingLevel===null || pendingCreate.current) return
    const names=[...queuedNames,...(normalize(name)?[name.trim()]:[])],parentId=addingLevel===0?null:path[addingLevel-1] ?? null
    if(new Set(names.map(normalize)).size!==names.length || names.some(value=>nodesRef.current.some(node=>node.parentId===parentId && normalize(node.name)===normalize(value)))) {setMessage('نام تکراری در فهرست یا زیر همین والد وجود دارد.');return}
    const pending={controller:new AbortController(),depth:addingLevel,path:[...path],adapter:persistCreate}
    pendingCreate.current=pending;setSaving(true);setMessage('')
    try {
      let created: readonly (CascadingTreeNode & {code:string})[]
      if(persistCreate) {
        if(!persistCreateBatch) throw Error('ثبت گروهی برای این اتصال آماده نیست.')
        created=await persistCreateBatch({names,parentId,signal:pending.controller.signal})
      } else {
        let next=[...nodesRef.current];const added:(CascadingTreeNode & {code:string})[]=[]
        for(const value of names) {const result=addCascadingTreeNode(next,parentId,value,crypto.randomUUID());if(!result.ok || !result.node.code)throw Error('ثبت گروهی انجام نشد.');next=result.nodes;added.push({...result.node,code:result.node.code})}
        created=added
      }
      if(pendingCreate.current!==pending || pending.controller.signal.aborted)return
      if(created.length!==names.length || new Set(created.map(node=>node.id)).size!==names.length || created.some((node,index)=>!node.id || !node.code || node.parentId!==parentId || normalize(node.name)!==normalize(names[index]) || nodesRef.current.some(old=>old.id===node.id))) throw Error('پاسخ ثبت گروهی معتبر نیست؛ اطلاعات سرور را بررسی کنید.')
      pendingCreate.current=null;setSaving(false);setQueuedNames([])
      const next=[...nodesRef.current,...created],last=created[created.length-1]
      for(const node of created.slice(0,-1))onNodeCreated?.(node,[...pending.path.slice(0,pending.depth).map(id=>next.find(item=>item.id===id)!),node])
      commitCreatedNode(last,next,pending.depth,pending.path,!!persistCreate)
    } catch(error) {
      if(pendingCreate.current!==pending || pending.controller.signal.aborted)return
      pendingCreate.current=null;setSaving(false);setMessage(error instanceof Error?error.message:'ثبت گروهی انجام نشد.');inputRef.current?.focus()
    }
  }
  const finishEntry = () => {
    if (addingLevel === null || pendingCreate.current || copyPending.current) return
    if (queuedNames.length) { void saveBatch(); return }
    if (!normalize(name)) { setMessage('نام گروه الزامی است.'); inputRef.current?.focus(); return }
    if (editingNodeId) { void renameNode(); return }
    const parentId = addingLevel === 0 ? null : path[addingLevel - 1] ?? null
    const existing = matchingCascadingSiblings(nodesRef.current, parentId, name).find(node => normalize(node.name) === normalize(name))
    if (existing) chooseExisting(addingLevel, existing)
    else void addNode()
  }

  return <section ref={rootRef} onPointerDownCapture={event => {
    if(renderColumnSelector || addingLevel === null || copyLevel !== null || saving) return
    const target=event.target as HTMLElement,column=target.closest<HTMLElement>('[data-tree-depth]')
    if(!column || target.closest('.cascading-tree-search')) return
    const depth=Number(column.dataset.treeDepth)
    if(depth===addingLevel) return
    event.preventDefault();event.stopPropagation()
    entryDrafts.current.set(`${addingLevel}|${path[addingLevel-1] ?? ''}`,name)
    startAdd(depth,path,true)
  }} onKeyDownCapture={event => {
    if(entryActive && event.key === 'F1') {event.preventDefault();event.stopPropagation();return}
    if (renderColumnSelector || event.key !== 'F2' || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || addingLevel === null || copyLevel !== null || saving) return
    const button = rootRef.current?.querySelector<HTMLButtonElement>(`[data-tree-depth="${addingLevel}"] [data-tree-copy-children]:not(:disabled)`)
    if (!button || !missingCopyItems(addingLevel, path[addingLevel - 1] ?? '').length) return
    event.preventDefault(); event.stopPropagation()
    if (!event.repeat) openCopy(addingLevel, button)
  }} onBlurCapture={event => {
    const next = event.relatedTarget as Element | null
    if (!next || (!rootRef.current?.contains(next) && !next.closest('[data-action-id="new-person"]'))) createContext.current = null
  }} onFocusCapture={event => {
    if (renderColumnSelector || addingLevel !== null) return
    const column = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-depth]')
    if (!column) createContext.current = null
    if (column) {
      const depth = Number(column.dataset.treeDepth)
      setBrowseDepth(depth)
      const nodeId = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-node]')?.dataset.treeNode
      createContext.current = {level: depth, path: [...path]}
      if (nodeId) {
        setSearchSelection(current => current?.nodeId === nodeId ? current : null)
        setReportPath([])
        const nextPath = cascadingTreeBrowsePath(nodesRef.current, path, depth, nodeId, levelCount)
        createContext.current = {level: Math.min(depth + 1, levelCount - 1), path: nextPath.slice(0, depth + 1)}
        activeGroup.current = { depth, nodeId, path: nextPath.slice(0, depth + 1) }
        setPath(current => current.length === nextPath.length && current.every((id, index) => id === nextPath[index]) ? current : nextPath)
        if (path[depth] !== nodeId) setQueries(current => current.map((query, level) => level > depth ? '' : query))
      }
    }
  }} onKeyDown={event => {
    if (renderColumnSelector || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape' && copyLevel !== null) { event.preventDefault(); event.stopPropagation(); closeCopy(); return }
    if (copyLevel !== null && event.key === 'F3') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) void copyChildren(copyLevel); return }
    if (copyLevel !== null) return
    if (event.key === 'Escape' && addingLevel !== null) { event.preventDefault(); event.stopPropagation(); cancelEntry(); return }
    if (event.key === 'F3') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) finishEntry(); return }
    const target = event.target as HTMLElement
    const browseColumn = target.closest<HTMLElement>('[data-tree-depth]')
    if (event.key === 'F1' && addingLevel === null && browseColumn) {
      event.preventDefault(); event.stopPropagation()
      const search = browseColumn.querySelector<HTMLInputElement>('.cascading-tree-search:not(:disabled)')
      search?.focus({ preventScroll: true }); search?.select(); return
    }
    if (addingLevel === null && browseColumn) {
      const depth = Number(browseColumn.dataset.treeDepth)
      const search = target.closest<HTMLInputElement>('.cascading-tree-search')
      const textControl = target.closest('input,textarea,select,[contenteditable="true"]')
      const options = matchingCascadingSiblings(nodesRef.current, depth === 0 ? null : path[depth - 1] ?? null, queries[depth] ?? '')
      const focusedId = target.closest<HTMLElement>('[data-tree-node]')?.dataset.treeNode
      const index = options.findIndex(node => node.id === focusedId)
      if ((!textControl || search) && ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation()
        if (depth > 0 && !path[depth - 1]) return
        if (search) {
          const candidate = searchSelection?.depth === depth ? options.findIndex(node => node.id === searchSelection.nodeId) : options.findIndex(node => node.id === searchCandidate(depth, queries[depth] ?? '')?.id)
          const next = event.key === 'Enter' ? Math.max(0, candidate) : Math.max(0, Math.min(options.length - 1, candidate < 0 ? 0 : candidate + (event.key === 'ArrowDown' ? 1 : -1)))
          const node = options[next]
          if (!node) return
          setSearchSelection({depth, nodeId:node.id}); setBrowseDepth(depth)
          if (event.key === 'Enter') {
            setPath(cascadingTreeBrowsePath(nodesRef.current,path,depth,node.id,levelCount))
            setQueries(current => current.map((query, level) => level >= depth ? '' : query))
            focusColumn(depth,node.id)
          }
          return
        }
        const nextIndex = event.key === 'Enter' ? Math.max(0, index) : index < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
        const node = options[nextIndex]
        if (!node) return
        const nextPath = cascadingTreeBrowsePath(nodesRef.current, path, depth, node.id, levelCount)
        setPath(nextPath); setMessage('')
        if (path[depth] !== node.id) setQueries(current => current.map((query, level) => level > depth ? '' : query))
        const nextDepth = event.key === 'Enter' ? Math.min(depth + 1, levelCount - 1) : depth
        setBrowseDepth(nextDepth); focusColumn(nextDepth, nextDepth === depth ? node.id : undefined)
        return
      }
      if (!textControl && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation()
        const nextDepth = depth + (event.key === 'ArrowLeft' ? 1 : -1)
        const nextPath = nextDepth > depth && focusedId ? cascadingTreeBrowsePath(nodesRef.current, path, depth, focusedId, levelCount) : path
        if (nextDepth < 0 || nextDepth >= levelCount || (nextDepth > 0 && !nextPath[nextDepth - 1])) return
        if (nextPath !== path) setPath(nextPath)
        setBrowseDepth(nextDepth); focusColumn(nextDepth, nextPath[nextDepth]); return
      }
      if (!textControl && event.key.length === 1 && event.key !== ' ') {
        event.preventDefault(); event.stopPropagation()
        if (depth > 0 && !path[depth - 1]) return
        setBrowseDepth(depth)
        const candidate = searchCandidate(depth, (queries[depth] ?? '') + event.key)
        setSearchSelection(candidate ? {depth,nodeId:candidate.id} : null)
        setQueries(current => { const next = [...current]; next[depth] = (next[depth] ?? '') + event.key; return next })
        browseColumn.querySelector<HTMLInputElement>('.cascading-tree-search')?.focus()
        return
      }
    }
    const emptySearch = target instanceof HTMLInputElement && target.classList.contains('cascading-tree-search') && !target.value
    if (event.key !== ' ' || addingLevel !== null || (!emptySearch && target.closest('input,textarea,select,[contenteditable="true"]'))) return
    const column = target.closest<HTMLElement>('[data-tree-depth]')
    if (!column) return
    event.preventDefault(); event.stopPropagation()
    if (!event.repeat) {
      const depth = Number(column.dataset.treeDepth)
      const nodeId = target.closest<HTMLElement>('[data-tree-node]')?.dataset.treeNode
      const parentPath = nodeId ? selectCascadingTreeNode(nodesRef.current, path, depth, nodeId) : path
      startAdd(Math.min(levelCount - 1, depth + (nodeId && !target.closest('[data-tree-add]') ? 1 : 0)), parentPath)
    }
  }} style={{ ...style, background: 'transparent', backgroundColor: 'transparent', backgroundImage: 'none', border: 0, borderWidth: 0, borderStyle: 'none', borderColor: 'transparent', boxShadow: 'none', padding: 0 }} className={'cascading-tree-panels' + (renderColumnSelector ? ' is-designing' : '')} dir="rtl" aria-label="درخت گروه‌های آبشاری">
    {part('header', <header className="cascading-tree-header">
      <h2>{title}</h2>
      {settingsAction}
    </header>)}
    {part('body', <div className="cascading-tree-body"><div className="cascading-tree-toolbar" data-designer-scope="controls">
      {part('back', <button type="button" onClick={() => { setPath(current => backCascadingTreeOneLevel(current)); setAddingLevel(null); setMessage('') }} disabled={!path.length || entryActive}>↶ یک سطح عقب</button>)}
      {part('all', <button type="button" disabled={entryActive} onClick={() => { activeGroup.current = null; setReportPath([]); setBrowseDepth(null); setPath([]); setQueries([]); setAddingLevel(null); setMessage('') }}>⟳ نمایش همه</button>)}
      {part('path', <div className="cascading-tree-path-text cascading-tree-inline-path"><nav aria-label="مسیر گروه">{selectedNodes.length ? selectedNodes.map((node, index) => <span className="cascading-tree-crumb" key={node.id}>{index > 0 && <span aria-hidden="true">‹</span>}<button type="button" onClick={() => { setPath(current => current.slice(0, index + 1)); setAddingLevel(null); setMessage('') }}>{node.name}</button></span>) : <span>نمایش تمام گروه‌های اصلی</span>}</nav></div>)}
      {part('status', <small className="cascading-tree-status-text">{selectedNodes.length ? `سطح ${selectedNodes.length} از ${levelCount}` : 'گروهی انتخاب نشده'}</small>)}
      {part('limit', <span className="cascading-tree-limit">حداکثر {levelCount - 1} زیرگروه</span>)}
    </div>
    <div className="cascading-tree-scroll">
      <div className="cascading-tree-columns" data-designer-scope="columns" style={{ gridTemplateColumns: `repeat(${levelCount}, minmax(165px, 1fr))`, minWidth: levelCount * 172 }}>
        {levelNames.slice(0, levelCount).map((defaultTitle, depth) => {
          const title = columnTitles[depth] ?? defaultTitle
          const parentId = depth === 0 ? null : path[depth - 1] ?? null
          const reporting = reportPath.length > 0
          const enabled = depth === 0 || parentId !== null
          const parentLocked = addingLevel !== null && depth < addingLevel
          const options = reporting ? (reportPath[depth] ? matchingCascadingSiblings(nodes, parentId, '') : []) : parentLocked ? nodes.filter(node => node.id === path[depth]) : enabled ? matchingCascadingSiblings(nodes, parentId, queries[depth] ?? '') : []
          const locked = parentLocked
          const reportIndex = options.findIndex(node => node.id === reportPath[depth])
          const marker = (nodeId: string) => searchSelection?.depth === depth && searchSelection.nodeId === nodeId ? {backgroundColor:'var(--lab-row-selected-bg,#d7ebe6)',borderRadius:'8px',fontWeight:'var(--lab-tree-selected-weight,400)'} : reportPath[depth] === nodeId ? { backgroundColor: reportMarkerColor ?? 'var(--lab-row-selected-bg,#d7ebe6)', borderRadius: '8px',fontWeight:'var(--lab-tree-selected-weight,400)' } : path[depth] === nodeId ? { backgroundColor: 'var(--lab-row-selected-bg,#d7ebe6)', borderRadius: '8px',fontWeight:'var(--lab-tree-selected-weight,400)' } : !renderColumnSelector && !entryActive && !!path[depth] ? { color: '#bcbec0', fontWeight: 400 } : undefined
          const editing = addingLevel === depth && copyLevel === null
          const matches = editing && !!normalize(name) ? [...nodes.filter(node=>node.parentId===parentId),...missingCascadingLevelNames(nodes, parentId, depth, queuedNames)].filter(node => node.id !== editingNodeId && normalize(node.name).includes(normalize(name))).sort((a,b) => Number(normalize(b.name)===normalize(name))-Number(normalize(a.name)===normalize(name))) : []
          const duplicate = editing && !!normalize(name) && (nodes.some(node=>node.id!==editingNodeId && node.parentId===parentId && normalize(node.name)===normalize(name)) || queuedNames.some(value=>normalize(value)===normalize(name)))
          const nextCode = editingNodeId ? byId.get(editingNodeId)?.code ?? '' : editing ? suggestCascadingTreeCode(nodes) : ''
          const visibleMatches = matches
          const exactIndex = visibleMatches.findIndex(node => normalize(node.name) === normalize(name))
          const selectedMatch = Math.min(matchIndex >= 0 ? matchIndex : Math.max(0, exactIndex), visibleMatches.length - 1)
          const column = <section className={"cascading-tree-column" + (branchTarget && copyLevel === depth && branchExpanded ? " is-branch-expanded" : "")} data-tree-depth={depth} tabIndex={0} aria-label={title}>
            {renderColumnSelector?.(depth, title)}
            {part(`${depth}.title`, <div className="cascading-tree-column-head">
              <strong>{title}</strong>
              <span>{depth === 0 ? 'ریشه' : byId.get(parentId ?? '')?.name ?? 'انتخاب نشده'}</span>
            </div>)}
            {part(`${depth}.search`, <input className="cascading-tree-search" aria-label={`جست‌وجو در ${title}`} placeholder="جست‌وجو…" disabled={!enabled || entryActive} value={queries[depth] ?? ''} onChange={event => { const query=event.target.value; const candidate=normalize(query)?searchCandidate(depth,query):undefined; setSearchSelection(candidate?{depth,nodeId:candidate.id}:null); setBrowseDepth(depth); setReportPath([]); setQueries(current => { const next = [...current]; next[depth] = query; return next }) }} />)}
            {part(`${depth}.items`, <div className="cascading-tree-items" data-report-list={reporting || undefined}>
              {!reporting && !editing && <div data-context-head aria-hidden="true" style={{height:0,flexShrink:0}}/>}
              {reporting && reportIndex >= 0 && <div data-report-head aria-hidden="true" style={{ height: `calc(var(--tree-report-row-height,38px) * ${Math.max(0, 2 - reportIndex)})`, flexShrink: 0 }} />}
              {copyLevel === depth && <form tabIndex={-1} id={inputId + '-copy-form'} className="cascading-tree-inline-add cascading-tree-copy" aria-label="کپی انتخابی زیرگروه‌ها" aria-busy={saving || undefined} onReset={event=>{event.preventDefault();closeCopy()}} onSubmit={event=>{event.preventDefault();void copyChildren(depth)}}>
                {branchTarget ? <>
                  <strong>کپی شاخه به {byId.get(branchTarget)?.name}</strong>
                  <button type="button" data-tree-copy-expand aria-pressed={branchExpanded} onClick={()=>setBranchExpanded(value=>!value)}>{branchExpanded ? "اندازهٔ عادی" : "بزرگ‌نمایی"}</button>
                  <select aria-label="گروه مبدأ کپی شاخه" disabled={saving} value={branchSource} onChange={event=>{const id=event.target.value;setBranchSource(id);setBranchSelected(cascadingBranchCopyPreview(nodes,id,branchTarget).map(row=>row.node.id))}}>
                    <option value="">انتخاب مبدأ…</option>{branchSources.map(node=><option key={node.id} value={node.id}>{nodePath(node).map(item=>item.name).join(' / ')}</option>)}
                  </select>
                  {branchPlan && <small>جدید: {branchPlan.created} — موجود: {branchPlan.existing}</small>}
                  {branchError && <small role="alert">{branchError}</small>}
                  {branchRows.map(({node:child,existing})=><label key={child.id} style={{paddingInlineStart:(nodePath(child).length-nodePath(byId.get(branchSource)!).length-1)*10}}>{!existing && <input type="checkbox" disabled={saving} checked={branchSelected.includes(child.id)} onChange={event=>{const checked=event.currentTarget.checked;setBranchSelected(current=>selectCascadingBranchItems(nodes,branchSource,current,child.id,checked))}}/>}<span>{child.name}{existing ? " (مسیر موجود)" : ""}</span></label>)}
                  {branchSource && !branchRows.length && <p>مورد جدیدی برای کپی وجود ندارد.</p>}
                </> : <><strong>موارد موجودنبودۀ این گروه</strong>
                <small>موارد دلخواه را انتخاب کنید؛ تا ثبت نهایی چیزی ذخیره نمی‌شود.</small>
                <button type="button" disabled={saving || !missingCopyItems(depth,copySource).length} onClick={()=>setCopySelections({[copySource]:missingCopyItems(depth,copySource).map(node=>node.id)})}>انتخاب همهٔ موارد</button>
                {missingCopyItems(depth,copySource).map(child=><label key={child.id}><input type="checkbox" disabled={saving} checked={copySelections[copySource]?.includes(child.id) ?? false} onChange={event=>setCopySelections(current=>({...current,[copySource]:event.target.checked?[...(current[copySource]??[]),child.id]:(current[copySource]??[]).filter(id=>id!==child.id)}))}/><span>{child.name}</span></label>)}
                {!missingCopyItems(depth,copySource).length && <p>مورد جدیدی برای کپی وجود ندارد.</p>}</> }
                {message && <p role="status">{message}</p>}
              </form>}
              {editing && <form onReset={event => { event.preventDefault(); cancelEntry() }} id={inputId + '-form'} aria-busy={saving || undefined} className="cascading-tree-add cascading-tree-inline-add" aria-label={`افزودن ${title}`} onSubmit={event => { event.preventDefault(); finishEntry() }} onKeyDown={event => {
                event.stopPropagation()
                if (event.nativeEvent.isComposing) return
                if (event.key === '+' && (!persistCreate || persistCreateBatch) && !event.ctrlKey && !event.altKey && !event.metaKey && !editingNodeId) { event.preventDefault(); queueName(); return }
                if (event.key === 'F3') { event.preventDefault(); if (!event.repeat) finishEntry(); return }
                if (event.key === 'Escape') { event.preventDefault(); cancelEntry(); return }
                if (['ArrowLeft','ArrowRight'].includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
                  event.preventDefault()
                  if (saving || editingNodeId) return
                  entryDrafts.current.set(`${depth}|${parentId ?? ''}`, name)
                  if (event.key === 'ArrowRight' && depth > 0) startAdd(depth - 1, path, true)
                  else if (event.key === 'ArrowLeft' && depth < levelCount - 1) {
                    const existing = visibleMatches[selectedMatch]
                    if (existing) chooseSuggestion(depth, existing)
                    else setMessage('ابتدا نام موجود را انتخاب کنید یا نام جدید را با F3 ثبت کنید؛ متن شما حفظ شده است.')
                  }
                  return
                }
                if (!(event.target instanceof HTMLInputElement) && !(event.target as HTMLElement).closest('[role="option"]')) return
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault(); setMatchIndex(Math.max(0, Math.min(visibleMatches.length - 1, selectedMatch < 0 ? (event.key === 'ArrowDown' ? 0 : visibleMatches.length - 1) : selectedMatch + (event.key === 'ArrowDown' ? 1 : -1)))); inputRef.current?.focus(); return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (visibleMatches[selectedMatch]) chooseSuggestion(depth, visibleMatches[selectedMatch])
                  else if (normalize(name)) setMessage('برای ثبت گروه جدید F3 را بزنید.')
                }
              }}>
                {depth === 0 && <output aria-label="کد گروه اصلی">کد: <bdi>{visibleMatches[selectedMatch]?.code || nextCode || 'ناموجود'}</bdi></output>}
                <label htmlFor={inputId}>نام {title}</label>
                <div className="cascading-tree-batch-input"><input ref={inputRef} id={inputId} role="combobox" aria-expanded={visibleMatches.length > 0} aria-controls={inputId + '-matches'} aria-activedescendant={selectedMatch >= 0 ? inputId + '-match-' + selectedMatch : undefined} autoFocus readOnly={saving} value={name} onChange={event => { setName(event.target.value); setMatchIndex(-1); setMessage('') }} aria-invalid={duplicate} maxLength={120} autoComplete="off" />{!editingNodeId && (!persistCreate || persistCreateBatch) && <button type="button" data-tree-queue-name aria-label="افزودن نام به فهرست ثبت گروهی" title="افزودن به فهرست (+)" disabled={saving} onClick={queueName}>+</button>}</div>
                {!!queuedNames.length && <ul className="cascading-tree-batch-names" aria-label="نام‌های آمادهٔ ثبت">{queuedNames.map((value,index)=><li key={index}><span>{value}</span><button type="button" disabled={saving} aria-label={`حذف از فهرست: ${value}`} onClick={()=>setQueuedNames(current=>current.filter((_,i)=>i!==index))}>×</button></li>)}</ul>}
                <div className="cascading-tree-inline-matches" id={inputId + '-matches'} role="listbox" aria-label="گروه‌های مشابه">
                  {visibleMatches.map((node, index) => <button key={node.id} id={inputId + '-match-' + index} role="option" aria-selected={index === selectedMatch} type="button" onClick={() => chooseSuggestion(depth, node)}>{node.name}{node.parentId !== parentId && <small> — {nodePath(node).slice(0,-1).map(item => item.name).join(' › ')}</small>}</button>)}
                  {!!normalize(name) && !matches.length && !duplicate && <small>گروه مشابهی پیدا نشد.</small>}
                </div>
                {(duplicate || message) && <p role="alert" className="cascading-tree-error">{duplicate ? nodes.some(node=>node.id!==editingNodeId&&node.parentId===parentId&&normalize(node.name)===normalize(name)) ? 'گروه موجود را از فهرست بالا انتخاب کنید.' : 'این نام در فهرست ثبت گروهی تکراری است.' : message}</p>}
                
              </form>}
              {!reporting && !enabled && <p className="cascading-tree-empty">ابتدا ستون قبل را انتخاب کنید</p>}
              {!reporting && enabled && options.length === 0 && <p className="cascading-tree-empty">زیرگروهی وجود ندارد</p>}
              {!editing && copyLevel !== depth && options.map(node => <div className="cascading-tree-node-row" key={node.id} data-tree-path-current={path[depth] === node.id || undefined} style={path[depth] === node.id ? marker(node.id) : undefined}>
                {locked
                  ? part(`node.${encodeURIComponent(node.id)}`, <span className="cascading-tree-ancestor" data-tree-selected-ancestor style={marker(node.id)}>{node.name}</span>, `گروه: ${node.name}`)
                  : part(`node.${encodeURIComponent(node.id)}`, <button type="button" data-tree-node={node.id} data-search-current={searchSelection?.depth === depth && searchSelection.nodeId === node.id || undefined} className="cascading-tree-node" data-report-current={reportPath[depth] === node.id || undefined} style={marker(node.id)} aria-pressed={path[depth] === node.id} onClick={event => { setReportPath([]); setSearchSelection(null); setBrowseDepth(depth); activeGroup.current = { depth, nodeId: node.id, path: selectCascadingTreeNode(nodesRef.current, path, depth, node.id) }; event.currentTarget.focus({preventScroll:true}); setPath(current => cascadingTreeBrowsePath(nodesRef.current, current, depth, node.id, levelCount)); setAddingLevel(null); setMessage('') }}><span>{node.name}</span>{nodes.some(item => item.parentId === node.id) && <span aria-hidden="true">‹</span>}</button>, `گروه: ${node.name}`)}
              </div>)}
              {!reporting && !editing && <div data-context-tail aria-hidden="true" style={{height:0,flexShrink:0}}/>}
              {reporting && reportIndex >= 0 && <div data-report-tail aria-hidden="true" style={{ height: 'calc(var(--tree-report-row-height,38px) * 2)', flexShrink: 0 }} />}
            </div>)}
            <div className="cascading-tree-column-foot">{copyLevel === depth && branchTarget && <small className="cascading-tree-copy-count" data-tree-copy-count aria-live="polite">انتخاب‌شده: {branchRows.filter(row=>!row.existing && branchSelected.includes(row.node.id)).length} از {branchRows.filter(row=>!row.existing).length}</small>}{copyLevel === depth ? <div className="cascading-tree-copy-actions"><button type="submit" form={inputId + '-copy-form'} disabled={saving || (branchTarget ? !branchPlan?.created || !!branchError : !Object.values(copySelections).some(ids=>ids.length))}>ثبت موارد انتخاب‌شده (F3)</button><button type="button" data-tree-cancel-copy onClick={()=>closeCopy()}>انصراف (Esc)</button></div> : depth > 0 && editing && !editingNodeId && enabled && missingCopyItems(depth,parentId ?? '').length > 0 && !renderColumnSelector && (!persistCreate || persistCopyChildren) && <button type="button" data-tree-copy-children aria-keyshortcuts="F2" title="کپی زیرگروه‌ها (F2)" disabled={saving || copyLevel !== null} onClick={event=>openCopy(depth,event.currentTarget)}>کپی زیرگروه‌ها (F2)</button>}{editing && <div className="cascading-tree-add-actions"><button type="submit" form={inputId + '-form'} disabled={!enabled || (!normalize(name) && !queuedNames.length) || duplicate || saving || (!persistCreate && !nextCode)} aria-keyshortcuts="F3">{queuedNames.length ? `ثبت گروهی (${queuedNames.length + (normalize(name) ? 1 : 0)}) (F3)` : 'ثبت گروه (F3)'}</button><button type="button" onClick={cancelEntry}>انصراف</button></div>}{!enabled && <small>ابتدا گروه بالادستی را انتخاب کنید.</small>}{!entryActive && <div className="cascading-tree-browse-actions">{part(`${depth}.add`, <button type="button" data-tree-add aria-keyshortcuts="Space" title="افزودن (Space)" onClick={() => startAdd(depth)} disabled={!enabled || copyLevel !== null}>ایجاد (Space)</button>)}{!renderColumnSelector && depth < levelCount-1 && path[depth] && (!persistCreate || persistCopyBranch) && nodes.some(node=>node.id!==path[depth] && nodePath(node).length===depth+1 && nodes.some(child=>child.parentId===node.id)) && <button type="button" data-tree-copy-branch onClick={event=>openBranch(depth,event.currentTarget)}>کپی شاخه</button>}</div>}</div>
          </section>
          return <div key={depth} className="cascading-tree-column-host">{branchTarget && copyLevel === depth && branchExpanded ? <dialog className="cascading-tree-copy-dialog" aria-label="کپی شاخه" aria-modal="true" ref={element=>{copyDialogRef.current=element;if(element && !element.open){element.showModal();element.querySelector<HTMLElement>(".cascading-tree-copy")?.focus({preventScroll:true})}}} onCancel={event=>{event.preventDefault();closeCopy()}}>{column}</dialog> : part(`${depth}.column`,column)}</div>
        })}
      </div>
    </div>
    <span role="status" aria-live="polite" className="cascading-tree-status">{addingLevel === null ? message : ''}</span></div>)}
  </section>
}

export default CascadingTreePanels
