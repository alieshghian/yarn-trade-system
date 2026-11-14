import test from 'node:test'
import assert from 'node:assert/strict'
import {planCascadingBranchCopy, cascadingBranchCopyPreview, cascadingBranchDescendants, selectCascadingBranchItems} from './cascadingTree.ts'
const nodes=[{id:'s',parentId:null,name:'DTY',code:'004'},{id:'a',parentId:'s',name:'مات',isProtected:true},{id:'b',parentId:'a',name:'خام'},{id:'c',parentId:'b',name:'150D'},{id:'t',parentId:null,name:'FDY',code:'005'},{id:'x',parentId:'t',name:'مات'}]
test('recursive plan merges existing parents, preserves source, codes and IDs',()=>{
 const before=JSON.stringify(nodes);let id=0
 const p=planCascadingBranchCopy(nodes,'s','t',['a','b','c'],4,()=>`new-${++id}`)
 assert.equal(p.created,2);assert.equal(p.existing,1);assert.equal(p.items[0].id,'x')
 assert.equal(p.items[1].parentId,'x');assert.equal(p.items[2].parentId,p.items[1].id)
 assert.ok(p.items.slice(1).every(n=>n.code==='005' && !n.isProtected));assert.equal(JSON.stringify(nodes),before)
 const retry=planCascadingBranchCopy(p.nodes,'s','t',['a','b','c'],4,()=>assert.fail('retry must not allocate'))
 assert.equal(retry.created,0)
})
test('selection closure and depth limits reject before publishing; partial branch is supported',()=>{
 assert.throws(()=>planCascadingBranchCopy(nodes,'s','t',['c'],4,()=> 'id'))
 assert.throws(()=>planCascadingBranchCopy(nodes,'s','t',['a','b','c'],2,()=> 'id'))
 assert.equal(planCascadingBranchCopy(nodes,'s','t',['a'],1,()=> 'id').items.length,1)
})
test('four selected leaves under two parents retain separate identities and parent context',()=>{
 const tree=[{id:'s',parentId:null,name:'source',code:'1'},{id:'t',parentId:null,name:'target',code:'2'},...['300','150'].flatMap(id=>[{id,parentId:'s',name:id+'D'},...['96','288'].map(n=>({id:id+n,parentId:id,name:n+'F'}))])]
 let selected=[]
 for(const id of ['30096','300288','15096','150288'])selected=selectCascadingBranchItems(tree,'s',selected,id,true)
 assert.equal(selected.length,6)
 assert.deepEqual(cascadingBranchDescendants(tree,'s').map(n=>n.id),['300','30096','300288','150','15096','150288'])
 let i=0;const result=planCascadingBranchCopy(tree,'s','t',selected,4,()=>`new-${++i}`)
 const parents=result.items.filter(n=>n.parentId==='t');assert.equal(parents.length,2)
 for(const parent of parents)assert.deepEqual(result.items.filter(n=>n.parentId===parent.id).map(n=>n.name),['96F','288F'])
})

 test('copy preview excludes normalized existing leaves under the exact destination path',()=>{
 const tree=[...nodes,{id:'xb',parentId:'x',name:'خام'},{id:'xc',parentId:'xb',name:'۱۵۰D'},{id:'leaf',parentId:'c',name:'144 F'},{id:'existingLeaf',parentId:'xc',name:'144 F'},{id:'missingLeaf',parentId:'c',name:'288F'}];
 const rows=cascadingBranchCopyPreview(tree,'s','t');
 assert.deepEqual(rows.map(r=>[r.node.id,r.existing]),[['a',true],['b',true],['c',true],['missingLeaf',false]]);
 const all=planCascadingBranchCopy(tree,'s','t',rows.map(r=>r.node.id),4,()=> 'new-leaf');assert.equal(all.created,1);assert.equal(all.items.at(-1).parentId,'xc');
 assert.deepEqual(cascadingBranchCopyPreview(all.nodes,'s','t'),[]);
 });
