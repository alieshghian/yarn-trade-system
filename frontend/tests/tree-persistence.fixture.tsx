import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CascadingTreePanels, type CascadingTreeCreateAdapter } from '../src/components/base-form/CascadingTreePanels'
import type { CascadingTreeNode } from '../src/components/base-form/cascadingTree'

const root = createRoot(document.getElementById('root')!)
type Deferred = { request: Parameters<CascadingTreeCreateAdapter>[0]; resolve: (node: CascadingTreeNode & {code: string}) => void; reject: (error: Error) => void }
const state = { nodes: [] as readonly CascadingTreeNode[], created: [] as CascadingTreeNode[], requests: [] as Deferred[] }
let select: (nodeId: string) => void
let limit: (depth: number) => void
function Fixture({async, nodes, maxSubgroups}: {async: boolean; nodes: CascadingTreeNode[]; maxSubgroups: number}) {
  const [selection, setSelection] = useState<{nodeId: string; sequence: number}>()
  const [maximum, setMaximum] = useState(maxSubgroups)
  select = nodeId => setSelection(current => ({nodeId, sequence: (current?.sequence ?? 0) + 1}))
  limit = setMaximum
  const [adapter] = useState<CascadingTreeCreateAdapter>(() => request => new Promise((resolve, reject) => state.requests.push({request, resolve, reject})))
  return <CascadingTreePanels initialNodes={nodes} initialPath={[]} maxSubgroups={maximum}
    persistCreate={async ? adapter : undefined} selectionRequest={selection}
    onNodesChange={nodes => { state.nodes = nodes }} onNodeCreated={node => state.created.push(node)} />
}
let revision = 0
Object.assign(window, { treeTest: {
  state,
  setup(async = true, nodes: CascadingTreeNode[] = [], maxSubgroups = 4) {
    state.nodes = []; state.created = []; state.requests = []
    flushSync(() => root.render(<Fixture key={++revision} async={async} nodes={nodes} maxSubgroups={maxSubgroups} />))
  },
  select: (id: string) => select(id), limit: (depth: number) => limit(depth),
  resolve: (index: number, node: CascadingTreeNode & {code: string}) => state.requests[index].resolve(node),
  reject: (index: number, message: string) => state.requests[index].reject(new Error(message)),
  unmount: () => flushSync(() => root.render(null))
} })
