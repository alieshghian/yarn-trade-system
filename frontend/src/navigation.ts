export const icons = { dashboard: '▦', persons: '♧', brands: '♧', yarns: '≋', purchaseOrders: '☷', commerce: '⚑', purchases: '⇩', inventory: '◫', sales: '↗', finance: '◈', checks: '▤', partners: '♙', reports: '▥', users: '♟', dataBackup: '⟳', businessContract: '§', settings: '⚙' }
export type MenuKey = keyof typeof icons
export type NavigationNode = { id: string, parentId: string | null, routeId: MenuKey | null, label: string, icon: MenuKey, enabled: boolean }
export type NavigationPreferences = { order: string[], hidden: string[], collapsed: string[], pinned: MenuKey[] }
export const defaultPreferences = (): NavigationPreferences => ({ order: [], hidden: [], collapsed: [], pinned: [] })
export const defaultNavigation = (): NavigationNode[] => [
  ...Object.keys(icons).map(id => ({ id, parentId: ['businessContract', 'settings', 'brands'].includes(id) ? 'definitions' : null, routeId: id as MenuKey, label: '', icon: id as MenuKey, enabled: true })),
  { id: 'definitions', parentId: null, routeId: null, label: 'تعاریف و تنظیمات', icon: 'settings', enabled: true }
]
export type DropPlacement = 'before' | 'after' | 'inside'

export function moveNavigation(nodes: NavigationNode[], sourceId: string, targetId: string | null, placement: DropPlacement): NavigationNode[] {
  const source = nodes.find(x => x.id === sourceId), target = nodes.find(x => x.id === targetId)
  if (!source || sourceId === targetId || targetId !== null && !target) throw Error('مقصد جابه‌جایی معتبر نیست.')
  const parentId = placement === 'inside' ? targetId : target?.parentId ?? null
  if (parentId && nodes.find(x => x.id === parentId)?.routeId) throw Error('والد باید یک گروه باشد.')
  let parent = parentId
  while (parent) { if (parent === sourceId) throw Error('رابطهٔ دوری در منو مجاز نیست.'); parent = nodes.find(x => x.id === parent)?.parentId ?? null }
  const next = nodes.filter(x => x.id !== sourceId)
  const index = target ? next.findIndex(x => x.id === target.id) + (placement === 'before' ? 0 : 1) : next.length
  next.splice(index, 0, { ...source, parentId })
  return next
}

export function orderedChildren(nodes: NavigationNode[], parentId: string | null, order: string[]) {
  const siblings = nodes.filter(x => x.parentId === parentId)
  const rank = new Map(order.map((id, i) => [id, i]))
  return siblings.sort((a, b) => (rank.get(a.id) ?? order.length + nodes.indexOf(a)) - (rank.get(b.id) ?? order.length + nodes.indexOf(b)))
}
