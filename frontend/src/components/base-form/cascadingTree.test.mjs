import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addCascadingTreeNode, backCascadingTreeOneLevel, cascadingTreeColumn,
  missingCascadingLevelNames, cascadingTreeBrowsePath, cascadingTreeDemoNodes, selectCascadingTreeNode, matchingCascadingSiblings, suggestCascadingTreeCode
} from './cascadingTree.ts'

test('sibling duplicate comparison ignores word spacing without changing display names', () => {
  const nodes = [{id:'root',parentId:null,name:'نخ'},{id:'grade',parentId:'root',name:'نمره ۱۲'}]
  assert.deepEqual(matchingCascadingSiblings(nodes,'root','نمره12').map(node=>node.id),['grade'])
  assert.equal(addCascadingTreeNode(nodes,'root','نمره١٢','duplicate').ok,false)
  assert.equal(nodes[1].name,'نمره ۱۲')
  assert.equal(addCascadingTreeNode([...nodes,{id:'other',parentId:null,name:'پارچه'}],'other','نمره12','allowed').ok,true)
})

test('selection shows ancestors and valid siblings only at the active level', () => {
  const path = ['demo-yarn', 'demo-yarn-chenille', 'demo-yarn-polyester', 'demo-yarn-grade-8']
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, path, 0).map(node => node.id), ['demo-yarn'])
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, path, 3).map(node => node.id), ['demo-yarn-grade-6', 'demo-yarn-grade-8', 'demo-yarn-grade-12'])
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, path, 4).map(node => node.id), ['demo-yarn-shiny', 'demo-yarn-matte'])
  assert.deepEqual(selectCascadingTreeNode(cascadingTreeDemoNodes, path, 1, 'demo-yarn-chenille'), ['demo-yarn', 'demo-yarn-chenille'])
  assert.deepEqual(selectCascadingTreeNode(cascadingTreeDemoNodes, path, 0, 'demo-fabric'), ['demo-fabric'])
})

test('active siblings remain visible while later columns show direct children only', () => {
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, ['demo-yarn'], 0).map(node => node.id), ['demo-yarn', 'demo-fabric'])
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, ['demo-yarn'], 1).map(node => node.id), ['demo-yarn-chenille', 'demo-yarn-root-polyester', 'demo-yarn-cotton'])
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, ['demo-yarn', 'demo-yarn-chenille'], 1).map(node => node.id), ['demo-yarn-chenille', 'demo-yarn-root-polyester', 'demo-yarn-cotton'])
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, ['demo-yarn', 'demo-yarn-chenille'], 2).map(node => node.id), ['demo-yarn-acrylic', 'demo-yarn-polyester', 'demo-yarn-mix'])
})

test('back removes one level and show-all resets to roots', () => {
  const path = ['demo-yarn', 'demo-yarn-chenille', 'demo-yarn-polyester']
  assert.deepEqual(backCascadingTreeOneLevel(path), ['demo-yarn', 'demo-yarn-chenille'])
  assert.deepEqual(cascadingTreeColumn(cascadingTreeDemoNodes, [], 0).map(node => node.name), ['نخ', 'پارچه'])
})

test('adding a subgroup uses stable parent IDs and rejects normalized sibling duplicates', () => {
  const added = addCascadingTreeNode(cascadingTreeDemoNodes, 'demo-yarn', 'پشم', 'wool')
  assert.equal(added.ok, true)
  if (added.ok) assert.deepEqual(added.node, { id: 'wool', parentId: 'demo-yarn', name: 'پشم', code: '001' })
  const duplicate = addCascadingTreeNode(cascadingTreeDemoNodes, null, '  نَخ  ', 'another-yarn')
  assert.equal(duplicate.ok, false)
  if (!duplicate.ok) assert.equal(duplicate.reason, 'duplicate')
  const digitDuplicate = addCascadingTreeNode(cascadingTreeDemoNodes, 'demo-yarn-polyester', 'نمره ٨', 'alternate-grade')
  assert.equal(digitDuplicate.ok, false)
  if (!digitDuplicate.ok) assert.equal(digitDuplicate.reason, 'duplicate')
  assert.equal(addCascadingTreeNode(cascadingTreeDemoNodes, 'demo-fabric', 'پلی‌استر', 'fabric-polyester').ok, true)
})

test('rejects children beyond five levels', () => {
  const tooDeep = addCascadingTreeNode(cascadingTreeDemoNodes, 'demo-yarn-shiny', 'رنگی', 'color')
  assert.equal(tooDeep.ok, false)
  if (!tooDeep.ok) assert.equal(tooDeep.reason, 'depth')
})

test('live sibling matches normalize Arabic letters, Persian/Arabic digits and spacing', () => {
  const nodes = [{ id: 'a', parentId: null, name: 'کبیر ۱۲' }, { id: 'b', parentId: 'a', name: 'کبیر ۱۲' }]
  assert.deepEqual(matchingCascadingSiblings(nodes, null, 'كبير ١٢').map(n => n.id), ['a'])
  assert.equal(addCascadingTreeNode(nodes, null, 'كبير ١٢', 'new').reason, 'duplicate')
  assert.equal(addCascadingTreeNode(nodes, 'missing', 'فرزند', 'new').reason, 'parent')
})

test('codes allocate across every parent, preserve legacy values and revalidate after suggestion', () => {
  const nodes = [...cascadingTreeDemoNodes, { id: 'legacy-code', parentId: null, name: 'نمونه', code: '۰۰۹' }]
  const before = structuredClone(nodes)
  assert.equal(suggestCascadingTreeCode(nodes), '010')
  const first = addCascadingTreeNode(nodes, null, 'جدید', 'first')
  assert.equal(first.ok, true)
  assert.equal(first.node.code, '010')
  const second = addCascadingTreeNode(first.nodes, 'demo-yarn', 'فرزند جدید', 'second')
  assert.equal(second.node.code, '011')
  assert.deepEqual(nodes, before)
  assert.equal(second.nodes.find(n => n.id === 'legacy-code').code, '۰۰۹')
  assert.equal(addCascadingTreeNode(second.nodes, null, 'دیگری', 'second').reason, 'id')
})

test('browse focus resolves valid descendants, preserves prior branch, and removes unrelated descendants', () => {
  const prefix = ['demo-yarn', 'demo-yarn-chenille']
  assert.deepEqual(cascadingTreeBrowsePath(cascadingTreeDemoNodes, prefix, 2, 'demo-yarn-polyester'), [...prefix, 'demo-yarn-polyester', 'demo-yarn-grade-6', 'demo-yarn-grade-6-shiny'])
  const selected = [...prefix, 'demo-yarn-polyester', 'demo-yarn-grade-8', 'demo-yarn-matte']
  assert.deepEqual(cascadingTreeBrowsePath(cascadingTreeDemoNodes, selected, 2, 'demo-yarn-polyester'), selected)
  assert.deepEqual(cascadingTreeBrowsePath(cascadingTreeDemoNodes, selected, 2, 'demo-yarn-mix'), [...prefix, 'demo-yarn-mix'])
  assert.deepEqual(cascadingTreeBrowsePath(cascadingTreeDemoNodes, prefix, 2, 'demo-yarn-polyester', 3), [...prefix, 'demo-yarn-polyester'])
})

test('branch switching rematches only same-name descendants and stops at the first missing level', () => {
 const nodes=[{id:'a',parentId:null,name:'A'},{id:'b',parentId:null,name:'B'},{id:'a1',parentId:'a',name:'پلی استر'},{id:'b1',parentId:'b',name:'پلی استر'},{id:'a2',parentId:'a1',name:'خام'},{id:'b2',parentId:'b1',name:'دیگر'}]
 assert.deepEqual(cascadingTreeBrowsePath(nodes,['a','a1','a2'],0,'b'),['b','b1','b2'])
 assert.deepEqual(cascadingTreeBrowsePath(nodes,['a','a1','a2'],0,'a'),['a','a1','a2'])
})

test('reuse names across remote branches at any subgroup level excludes current and staged duplicates',()=>{
 const nodes=[{id:'r',parentId:null,name:'DTY'},{id:'mat',parentId:'r',name:'مات'},{id:'bright',parentId:'r',name:'براق'},{id:'md',parentId:'mat',name:'دوب داید'},{id:'bd',parentId:'bright',name:'دوب داید'},{id:'m150',parentId:'md',name:'150D'},{id:'m300',parentId:'md',name:'300D'},{id:'b150',parentId:'bd',name:'150D'},{id:'leaf',parentId:'m300',name:'96F'}]
 assert.deepEqual(missingCascadingLevelNames(nodes,'bd',3).map(n=>n.id),['m300'])
 assert.deepEqual(missingCascadingLevelNames(nodes,'bd',3,['۳۰۰D']).map(n=>n.id),[])
 assert.deepEqual(missingCascadingLevelNames(nodes,'b150',4).map(n=>n.id),['leaf'])
 assert.deepEqual(missingCascadingLevelNames(nodes,'bright',2).map(n=>n.id),[])
 assert.deepEqual(nodes.find(n=>n.id==='m300').parentId,'md')
})

test('reuse never leaks names from a different root group',()=>{
 const nodes=[{id:'dty',parentId:null,name:'DTY'},{id:'dm',parentId:'dty',name:'مات'},{id:'db',parentId:'dty',name:'براق'},{id:'dd',parentId:'dm',name:'دوب داید'},{id:'bd',parentId:'db',name:'دوب داید'},{id:'grade',parentId:'dd',name:'300D'},{id:'chenille',parentId:null,name:'شنیل'},{id:'cp',parentId:'chenille',name:'پلی استر'},{id:'cr',parentId:'cp',name:'پرو'},{id:'wrong',parentId:'cr',name:'خام'}]
 assert.deepEqual(missingCascadingLevelNames(nodes,'bd',3).map(n=>n.id),['grade'])
})

test('branch switch selects an only child but never invents a choice among unmatched multiple children',()=>{
 const nodes=[{id:'r',parentId:null,name:'root'},{id:'a',parentId:'r',name:'300D'},{id:'b',parentId:'r',name:'150D'},{id:'x',parentId:'a',name:'576F'},{id:'y',parentId:'b',name:'144F'}]
 assert.deepEqual(cascadingTreeBrowsePath(nodes,['r','b','y'],1,'a'),['r','a','x'])
 assert.deepEqual(cascadingTreeBrowsePath(nodes,['r','a','x'],1,'b'),['r','b','y'])
 assert.deepEqual(cascadingTreeBrowsePath([...nodes,{id:'z',parentId:'b',name:'96F'}],['r','a','x'],1,'b'),['r','b'])
})
