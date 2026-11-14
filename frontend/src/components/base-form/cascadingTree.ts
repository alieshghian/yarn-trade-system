import { normalizeComponentCode, normalizeCodeComponentSettings, suggestComponentCode, validateComponentCode } from './serialCode.ts'

export type CascadingTreeNode = {
  id: string
  parentId: string | null
  name: string
  /** Legacy nodes may have no code; never migrate or renumber them implicitly. */
  code?: string
  lockedDepth?: number | null
  isProtected?: boolean
}

export const CASCADING_TREE_MAX_DEPTH = 5

export const cascadingTreeDemoNodes: CascadingTreeNode[] = [
  { id: 'demo-yarn', parentId: null, name: 'نخ' },
  { id: 'demo-fabric', parentId: null, name: 'پارچه' },
  { id: 'demo-yarn-chenille', parentId: 'demo-yarn', name: 'شنیل' },
  { id: 'demo-yarn-root-polyester', parentId: 'demo-yarn', name: 'پلی‌استر' },
  { id: 'demo-yarn-cotton', parentId: 'demo-yarn', name: 'پنبه' },
  { id: 'demo-yarn-acrylic', parentId: 'demo-yarn-chenille', name: 'اکریلیک' },
  { id: 'demo-yarn-polyester', parentId: 'demo-yarn-chenille', name: 'پلی‌استر' },
  { id: 'demo-yarn-mix', parentId: 'demo-yarn-chenille', name: 'مخلوط' },
  { id: 'demo-yarn-grade-6', parentId: 'demo-yarn-polyester', name: 'نمره ۶' },
  { id: 'demo-yarn-grade-8', parentId: 'demo-yarn-polyester', name: 'نمره ۸' },
  { id: 'demo-yarn-grade-12', parentId: 'demo-yarn-polyester', name: 'نمره ۱۲' },
  { id: 'demo-yarn-shiny', parentId: 'demo-yarn-grade-8', name: 'براق' },
  { id: 'demo-yarn-matte', parentId: 'demo-yarn-grade-8', name: 'مات' },
  { id: 'demo-yarn-grade-6-shiny', parentId: 'demo-yarn-grade-6', name: 'براق' },
  { id: 'demo-fabric-velvet', parentId: 'demo-fabric', name: 'مخمل' },
  { id: 'demo-fabric-upholstery', parentId: 'demo-fabric', name: 'مبلی' },
  { id: 'demo-fabric-plain', parentId: 'demo-fabric-velvet', name: 'ساده' }
]

export function normalizeCascadingSiblingName(name: string): string {
  return name.normalize('NFKC')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F\u0670ـ]/g, '').replace(/\u200c/g, ' ')
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function cascadingTreeChildren(nodes: readonly CascadingTreeNode[], parentId: string | null): CascadingTreeNode[] {
  return nodes.filter(node => node.parentId === parentId)
}

/** Comparison only: display names and stable identities are never rewritten. */
export const cascadingNameKey = (name: string) => normalizeCascadingSiblingName(name).replace(/\s/g, '')

/** Keep each parent directly above its children in the copy preview. */
export function cascadingBranchDescendants(nodes: readonly CascadingTreeNode[], parentId: string): CascadingTreeNode[] {
  const result: CascadingTreeNode[] = [], seen = new Set([parentId])
  const visit = (id: string) => {
    for (const node of nodes.filter(item => item.parentId === id)) {
      if (seen.has(node.id)) throw Error('مسیر شاخه معتبر نیست.')
      seen.add(node.id); result.push(node); visit(node.id)
    }
  }
  visit(parentId)
  return result
}

export function selectCascadingBranchItems(nodes: readonly CascadingTreeNode[], sourceId: string, current: readonly string[], nodeId: string, checked: boolean): string[] {
  const descendants = cascadingBranchDescendants(nodes, sourceId)
  if (!descendants.some(node => node.id === nodeId)) return [...current]
  const next = new Set(current)
  if (checked) {
    let node = nodes.find(item => item.id === nodeId)
    while (node && node.id !== sourceId) {next.add(node.id); node = nodes.find(item => item.id === node!.parentId)}
  } else {
    next.delete(nodeId)
    for (const node of cascadingBranchDescendants(nodes, nodeId)) next.delete(node.id)
  }
  return descendants.filter(node => next.has(node.id)).map(node => node.id)
}

/** Existing destinations are context only; only missing paths are selectable. */
export function cascadingBranchCopyPreview(nodes: readonly CascadingTreeNode[], sourceId: string, targetId: string): {node: CascadingTreeNode; existing: boolean}[] {
  const walk = (from: string, to: string | undefined, seen: Set<string>): {node: CascadingTreeNode; existing: boolean}[] => {
    const rows: {node: CascadingTreeNode; existing: boolean}[] = []
    for (const node of nodes.filter(item => item.parentId === from)) {
      if (seen.has(node.id)) throw Error('مسیر شاخه معتبر نیست.')
      const matches = to ? nodes.filter(item => item.parentId === to && cascadingNameKey(item.name) === cascadingNameKey(node.name)) : []
      if (matches.length > 1) throw Error('نام تکراری در مقصد نیاز به بررسی دارد.')
      const children = walk(node.id, matches[0]?.id, new Set([...seen, node.id]))
      if (!matches.length || children.length) rows.push({node, existing: !!matches.length}, ...children)
    }
    return rows
  }
  return walk(sourceId, targetId, new Set([sourceId]))
}

/** A reusable, non-mutating Master Detail copy plan. Only selected descendants
 * are merged; source identities, codes and protection flags are never cloned. */
export function planCascadingBranchCopy(nodes: readonly CascadingTreeNode[], sourceId: string, targetId: string, selectedIds: readonly string[], maxSubgroups: number, allocateId: () => string) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const source = byId.get(sourceId), target = byId.get(targetId)
  if (!source || !target || sourceId === targetId || treeNodeDepth(nodes, sourceId) !== treeNodeDepth(nodes, targetId)) throw Error('مبدأ و مقصد باید متفاوت و هم‌سطح باشند.')
  const selected = new Set(selectedIds), result = [...nodes], items: CascadingTreeNode[] = []
  const visited = new Set<string>(); let created = 0, existing = 0
  const root = (() => { let node = target; while (node.parentId) { const parent = byId.get(node.parentId); if (!parent) throw Error('مسیر مقصد معتبر نیست.'); node = parent } return node })()
  const visit = (from: string, to: CascadingTreeNode, depth: number) => {
    for (const child of nodes.filter(node => node.parentId === from && selected.has(node.id))) {
      if (visited.has(child.id)) throw Error('شاخهٔ مبدأ معتبر نیست.')
      visited.add(child.id)
      if (depth > maxSubgroups || depth > (root.lockedDepth ?? 4) || to.isProtected) throw Error('محدودیت عمق یا حفاظت مقصد اجازهٔ کپی نمی‌دهد.')
      const matches = result.filter(node => node.parentId === to.id && cascadingNameKey(node.name) === cascadingNameKey(child.name))
      if (matches.length > 1) throw Error('نام تکراری در مقصد نیاز به بررسی دارد.')
      let node = matches[0]
      if (node) existing++
      else { node = {id: allocateId(), parentId: to.id, name: child.name, code: root.code}; if (result.some(item => item.id === node.id)) throw Error('شناسهٔ جدید معتبر نیست.'); result.push(node); created++ }
      items.push(node); visit(child.id, node, depth + 1)
    }
  }
  visit(sourceId, target, treeNodeDepth(nodes, targetId) + 1)
  if (visited.size !== selected.size) throw Error('هر زیرشاخه باید همراه والد انتخاب شود.')
  return {nodes: result, items, created, existing}
}

/** Lock only ancestors above the active level; the active level keeps valid siblings. */
export function cascadingTreeColumn(nodes: readonly CascadingTreeNode[], path: readonly string[], depth: number): CascadingTreeNode[] {
  if (depth < path.length - 1) {
    const ancestor = nodes.find(node => node.id === path[depth])
    return ancestor ? [ancestor] : []
  }
  if (depth > path.length || depth >= CASCADING_TREE_MAX_DEPTH) return []
  return cascadingTreeChildren(nodes, depth === 0 ? null : path[depth - 1] ?? null)
}

export function selectCascadingTreeNode(nodes: readonly CascadingTreeNode[], path: readonly string[], depth: number, nodeId: string): string[] {
  if (depth < 0 || depth >= CASCADING_TREE_MAX_DEPTH) return [...path]
  const parentId = depth === 0 ? null : path[depth - 1]
  const candidate = nodes.find(node => node.id === nodeId && node.parentId === parentId)
  if (!candidate) return [...path]
  return [...path.slice(0, depth), candidate.id]
}

/** Resolve downstream browsing without moving keyboard focus off the chosen node. */
export function cascadingTreeBrowsePath(nodes: readonly CascadingTreeNode[], path: readonly string[], depth: number, nodeId: string, levelCount = CASCADING_TREE_MAX_DEPTH): string[] {
  const next = selectCascadingTreeNode(nodes, path, depth, nodeId)
  if (next[depth] !== nodeId) return [...path]
  while (next.length < Math.min(levelCount, CASCADING_TREE_MAX_DEPTH)) {
    const children = cascadingTreeChildren(nodes, next[next.length - 1])
    const previous = nodes.find(node => node.id === path[next.length])
    const child = children.find(node => node.id === path[next.length])
      ?? (previous ? children.find(node => cascadingNameKey(node.name) === cascadingNameKey(previous.name)) ?? (children.length === 1 ? children[0] : undefined) : children[0])
    if (!child || next.includes(child.id)) break
    next.push(child.id)
  }
  return next
}

export type AddCascadingNodeResult =
  | { ok: true; nodes: CascadingTreeNode[]; node: CascadingTreeNode }
  | { ok: false; nodes: CascadingTreeNode[]; reason: 'empty' | 'duplicate' | 'depth' | 'parent' | 'id' | 'code' }

const groupCodeSettings = normalizeCodeComponentSettings({ mode: 'number', incremental: true, unique: true, suffixWidth: 3 })
/** One sequence across all parents in this hierarchy. Suggestion reserves nothing. */
export function suggestCascadingTreeCode(nodes: readonly CascadingTreeNode[]): string {
  const codes = nodes.flatMap(node => node.code ? [node.code] : [])
  const numeric = codes.map(normalizeComponentCode).filter(code => /^\d+$/.test(code))
    .sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)
  const suggestion = suggestComponentCode(numeric, groupCodeSettings)
  return suggestion.error || validateComponentCode(suggestion.value, groupCodeSettings, codes) ? '' : suggestion.value
}

export function matchingCascadingSiblings(nodes: readonly CascadingTreeNode[], parentId: string | null, query: string): CascadingTreeNode[] {
  const normalized = normalizeCascadingSiblingName(query)
  return cascadingTreeChildren(nodes, parentId).filter(node => cascadingNameKey(node.name).includes(cascadingNameKey(normalized)))
}

export function addCascadingTreeNode(
  nodes: readonly CascadingTreeNode[], parentId: string | null, name: string, id: string
): AddCascadingNodeResult {
  const normalized = normalizeCascadingSiblingName(name)
  if (!normalized) return { ok: false, nodes: [...nodes], reason: 'empty' }
  if (nodes.some(node => node.id === id)) return { ok: false, nodes: [...nodes], reason: 'id' }
  const parentDepth = parentId === null ? -1 : nodes.findIndex(node => node.id === parentId)
  if (parentId !== null && parentDepth < 0) return { ok: false, nodes: [...nodes], reason: 'parent' }
  const actualDepth = parentId === null ? 0 : treeNodeDepth(nodes, parentId) + 1
  if (actualDepth >= CASCADING_TREE_MAX_DEPTH) return { ok: false, nodes: [...nodes], reason: 'depth' }
  if (nodes.some(node => node.parentId === parentId && cascadingNameKey(node.name) === cascadingNameKey(normalized))) {
    return { ok: false, nodes: [...nodes], reason: 'duplicate' }
  }
  // Allocate again against the complete current hierarchy at the final commit.
  const code = suggestCascadingTreeCode(nodes)
  if (!code) return { ok: false, nodes: [...nodes], reason: 'code' }
  const node = { id, parentId, name: name.trim().replace(/\s+/g, ' '), code }
  return { ok: true, nodes: [...nodes, node], node }
}

function treeNodeDepth(nodes: readonly CascadingTreeNode[], nodeId: string): number {
  let depth = 0
  let current = nodes.find(node => node.id === nodeId)
  const visited = new Set<string>()
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (visited.has(current.id)) return CASCADING_TREE_MAX_DEPTH
    visited.add(current.id)
    depth += 1
    current = nodes.find(node => node.id === current?.parentId)
  }
  return current ? depth : CASCADING_TREE_MAX_DEPTH
}

export function backCascadingTreeOneLevel(path: readonly string[]): string[] {
  return path.slice(0, -1)
}

/** Reusable names from another parent at this exact depth, never destination duplicates. */
export function missingCascadingLevelNames(nodes: readonly CascadingTreeNode[], parentId: string | null, depth: number, excluded: readonly string[] = []): CascadingTreeNode[] {
  const byId=new Map(nodes.map(node=>[node.id,node]))
  let target=parentId ? byId.get(parentId) : undefined
  const visited=new Set<string>()
  while(target?.parentId && !visited.has(target.id)){visited.add(target.id);target=byId.get(target.parentId)}
  if(!target || target.parentId!==null)return []
  const rootId=target.id
  const existing=new Set([...nodes.filter(node=>node.parentId===parentId).map(node=>cascadingNameKey(node.name)),...excluded.map(cascadingNameKey)])
  const result:CascadingTreeNode[]=[]
  for(const node of nodes) {
    if(node.parentId===parentId || existing.has(cascadingNameKey(node.name)))continue
    let current:CascadingTreeNode|undefined=node,level=-1;const seen=new Set<string>()
    while(current && !seen.has(current.id)){seen.add(current.id);level++;if(current.parentId===null)break;current=byId.get(current.parentId)}
    if(!current || current.parentId!==null || current.id!==rootId || level!==depth)continue
    existing.add(cascadingNameKey(node.name));result.push(node)
  }
  return result
}
