import assert from 'node:assert/strict'

// Reproduce hovering a full edge WITHOUT clicking or focusing its small handle.
export async function runTreeEdgeKeyboardScenarios({evaluate,send,pause,clickExpression,bounds,treeTarget}) {
  const results=[],parts=Array.from({length:5},(_,i)=>i+'.column')
  const key=async(key,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key,modifiers,windowsVirtualKeyCode:({ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,z:90})[key]})
    await pause(90)
  }
  const same=(a,b)=>['left','top','width','height'].every(k=>Math.abs(a[k]-b[k])<.4)
  const move=point=>send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
  for(const part of parts){
    const selector=`document.querySelectorAll('.cascading-tree-panel-selector')[${parseInt(part,10)}]`
    if(!await evaluate(`(${selector}).getAttribute('aria-pressed')==='true'`))await clickExpression(selector)
    assert.ok(await evaluate(`(${selector}).getAttribute('aria-pressed')==='true'`),'the panel is selected before keyboard resizing')
    const target=treeTarget(part)
    await evaluate(`(${target}).focus({preventScroll:true})`)
    for(const [edge,grow,shrink,axis,opposite] of [
      ['left','ArrowLeft','ArrowRight','width','right'],['right','ArrowRight','ArrowLeft','width','left'],
      ['top','ArrowUp','ArrowDown','height','bottom'],['bottom','ArrowDown','ArrowUp','height','top']
    ]){
      const before=await bounds(target),peers=await Promise.all(parts.filter(p=>p!==part).map(p=>bounds(treeTarget(p))))
      const point={x:edge==='left'?before.left:edge==='right'?before.right:before.left+before.width*.3,y:edge==='top'?before.top:edge==='bottom'?before.bottom:before.top+before.height*.3}
      await move(point)
      await evaluate(`if(document.activeElement!==${target})throw Error('Hover must not steal focus from the selected panel')`)
      // Shrink first so a panel already at the Canvas boundary can still
      // exercise both keys without bypassing the shared boundary constraints.
      await key(shrink)
      const after=await bounds(target)
      assert.ok(Math.abs(after[axis]-before[axis]+1)<.4&&Math.abs(after[opposite]-before[opposite])<.4,part+' '+edge+' shrinks by one pixel with the opposite edge fixed: '+JSON.stringify({before,after}))
      assert.ok(Math.abs(after[axis==='width'?'height':'width']-before[axis==='width'?'height':'width'])<.4,'the other size is unchanged')
      const afterPeers=await Promise.all(parts.filter(p=>p!==part).map(p=>bounds(treeTarget(p))))
      assert.ok(peers.every((p,i)=>same(p,afterPeers[i])),'unselected panels stay fixed')
      await key(grow);assert.ok(same(before,await bounds(target)),'reverse arrow restores the original rectangle')
      await key(shrink,8)
      assert.ok(Math.abs((await bounds(target))[axis]-before[axis]+10)<.4,'Shift uses the existing ten-pixel resize step')
      await key(grow,8);assert.ok(same(before,await bounds(target)),'Shift reverse restores the original rectangle')
      results.push(part+' hovered '+edge);console.log('PASS '+results.at(-1))
    }
    // Leave the edge: arrows must still perform the normal Move command.
    const before=await bounds(target)
    await move({x:before.left+before.width*.5,y:before.top+before.height*.5})
    await key('ArrowRight')
    const moved=await bounds(target)
    assert.ok(Math.abs(moved.left-before.left-1)<.4&&Math.abs(moved.width-before.width)<.4&&Math.abs(moved.height-before.height)<.4,'body hover keeps normal movement')
    await key('z',2);assert.ok(same(before,await bounds(target)),'Undo restores normal movement after leaving the resize edge')
    results.push(part+' normal movement after leaving edge')
  }
  return results
}
