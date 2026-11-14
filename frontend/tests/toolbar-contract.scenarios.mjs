import assert from 'node:assert/strict'

export async function runToolbarContractScenarios({base,navigatePage,evaluate,until,send,pause,check,clickExpression}) {
  for(const language of ['fa','en']) {
    await navigatePage({url:base+'/tests/form-designer.html?language='+language})
    await until(`!!document.querySelector('.grid-toolbar[data-toolbar-contract="2"]')`)
    if(await evaluate(`document.querySelector('.laboratory-designer-toggle')?.getAttribute('aria-expanded')!=='true'`))await clickExpression(`document.querySelector('.laboratory-designer-toggle')`)
    const panel=`document.querySelector('[data-toolbar-part="header"]')`
    const rect=expression=>evaluate(`(()=>{const r=(${expression}).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`)
    const press=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1})}
    const p=await rect(panel)
    await press({x:p.left+3,y:p.top+3});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.left+3,y:p.top+3,button:'left',clickCount:1});await pause(120)
    await until(`!!(${panel}).querySelector(':scope > .designer-edge-bottom')`)
    const fonts=await evaluate(`['title','counter','searchInput','searchOptions'].map(id=>getComputedStyle(document.querySelector('[data-toolbar-part="'+id+'"]').querySelector('input')??document.querySelector('[data-toolbar-part="'+id+'"]')).fontSize)`)
    const contained=`(()=>{const p=${panel},r=p.getBoundingClientRect();return ['title','counter','expand','columns','search'].every(id=>{const b=p.querySelector('[data-toolbar-part="'+id+'"]').getBoundingClientRect();return b.top>=r.top-1&&b.bottom<=r.bottom+1&&b.left>=r.left-1&&b.right<=r.right+1})})()`
    const resize=async delta=>{
      const before=await rect(panel),h=await rect(`(${panel}).querySelector(':scope > .designer-edge-bottom')`),start={x:h.left+h.width/2,y:h.top+h.height/2},end={x:start.x,y:start.y+delta}
      await press(start);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await pause(80)
      const live=await rect(panel)
      await check(language+' header content remains inside its border during live resizing',contained)
      assert.ok(Math.abs(live.top-before.top)<1,'opposite top edge remains fixed')
      if(delta>-100)assert.ok(Math.abs(live.height-before.height-delta)<2,'live edge follows the pointer before release')
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});await pause(120)
      const committed=await rect(panel)
      assert.ok(Math.abs(committed.height-live.height)<1&&Math.abs(committed.top-live.top)<1,'release must keep the live geometry '+JSON.stringify({language,delta,before,live,committed}))
      await check(language+' header content stays visible above the table after release',contained)
    }
    await resize(60)
    await resize(-20)
    await resize(-1000)
    await resize(40)
    const beforeTop=await rect(panel),topHandle=await rect(`(${panel}).querySelector(':scope > .designer-edge-top')`),topStart={x:topHandle.left+topHandle.width/2,y:topHandle.top+topHandle.height/2},topEnd={x:topStart.x,y:topStart.y+1000}
    await press(topStart);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...topEnd,button:'left',buttons:1});await pause(80)
    const liveTop=await rect(panel)
    assert.ok(Math.abs(liveTop.bottom-beforeTop.bottom)<1,'a top resize at the content floor keeps the opposite bottom edge fixed')
    await check(language+' top-edge resizing reserves space before the table and keeps content visible',`(${contained})&&document.querySelector('.base-grid-table-wrap').getBoundingClientRect().top>=(${panel}).getBoundingClientRect().bottom-1`)
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...topEnd,button:'left',clickCount:1});await pause(120)
    assert.ok(Math.abs((await rect(panel)).bottom-liveTop.bottom)<1,'a clamped top resize must not jump on release')
    await resize(60)
    assert.deepEqual(await evaluate(`['title','counter','searchInput','searchOptions'].map(id=>getComputedStyle(document.querySelector('[data-toolbar-part="'+id+'"]').querySelector('input')??document.querySelector('[data-toolbar-part="'+id+'"]')).fontSize)`),fonts,'geometry never changes typography')
    await check(language+' toolbar pins controls left and search right while options stay below the input',`(()=>{const root=${panel},p=root.getBoundingClientRect(),input=root.querySelector('.grid-search-control input').getBoundingClientRect(),options=root.querySelector('.grid-search-options').getBoundingClientRect(),columns=root.querySelector('.grid-columns-slot').getBoundingClientRect(),expand=root.querySelector('.grid-expand-toggle').getBoundingClientRect(),title=root.querySelector('[data-toolbar-part="title"]').getBoundingClientRect(),search=root.querySelector('[data-toolbar-part="search"]').getBoundingClientRect();return columns.left<p.left+100&&columns.right<=expand.left+1&&expand.right<=title.left+1&&title.right<=search.left+1&&Math.abs(search.right-p.right)<16&&options.top>=input.bottom-1})()`)
    const originalPanelWidth=await evaluate(`(${panel}).style.width`)
    await evaluate(`(${panel}).style.width='760px'`);await pause(160)
    const narrow=await evaluate(`(()=>{const p=${panel},r=p.getBoundingClientRect(),c=p.querySelector('.grid-columns-slot').getBoundingClientRect(),e=p.querySelector('.grid-expand-toggle').getBoundingClientRect(),t=p.querySelector('[data-toolbar-part="title"]').getBoundingClientRect(),s=p.querySelector('[data-toolbar-part="search"]').getBoundingClientRect();return {left:c.left-r.left,expand:e.left-r.left,searchRight:s.right-r.right,searchWidth:s.width,titleCenter:(t.left+t.right)/2}})()`)
    await evaluate(`(${panel}).style.width='1020px'`);await pause(160)
    const wide=await evaluate(`(()=>{const p=${panel},r=p.getBoundingClientRect(),c=p.querySelector('.grid-columns-slot').getBoundingClientRect(),e=p.querySelector('.grid-expand-toggle').getBoundingClientRect(),t=p.querySelector('[data-toolbar-part="title"]').getBoundingClientRect(),s=p.querySelector('[data-toolbar-part="search"]').getBoundingClientRect();return {left:c.left-r.left,expand:e.left-r.left,searchRight:s.right-r.right,searchWidth:s.width,titleCenter:(t.left+t.right)/2}})()`)
    assert.ok(Math.abs(narrow.left-wide.left)<1&&Math.abs(narrow.expand-wide.expand)<1,'left controls stay pinned as the toolbar grows')
    assert.ok(Math.abs(narrow.searchRight-wide.searchRight)<1&&Math.abs(narrow.searchWidth-wide.searchWidth)<2,'search stays pinned at the right without growing its track')
    assert.ok(wide.titleCenter-narrow.titleCenter>100,'the center spacer absorbs added width '+JSON.stringify({language,narrow,wide}))
    await evaluate(`(${panel}).style.width=${JSON.stringify(originalPanelWidth)}`);await pause(160)
    await clickExpression(`document.querySelector('.grid-search-control input')`)
    await check(language+' clicking search selects only the actual input',`(()=>{const selected=[...document.querySelectorAll('[data-toolbar-part][data-designer-tool-selected="true"]')].map(e=>e.dataset.toolbarPart);return selected.length===1&&selected[0]==='searchInput'&&!document.querySelector('[data-toolbar-part="search"]').dataset.designerToolSelected&&!document.querySelector('[data-toolbar-part="searchOptions"]').dataset.designerToolSelected})()`)
    for(const selector of ['[data-toolbar-part="searchReverse"]','[data-toolbar-part="searchOption:startsWith"]','[data-toolbar-part="searchOption:contains"]','[data-toolbar-part="searchOption:exact"]'])await clickExpression(`document.querySelector('${selector}')`,'left',2)
    const selectedBefore=await evaluate(`['searchInput','searchReverse','searchOption:startsWith','searchOption:contains','searchOption:exact'].map(id=>{const e=[...document.querySelectorAll('[data-toolbar-part]')].find(node=>node.dataset.toolbarPart===id),r=e.getBoundingClientRect();return {id,left:r.left,top:r.top,right:r.right,bottom:r.bottom}})`)
    await check(language+' Ctrl or Command adds each search part independently without selecting wrapper groups',`(()=>{const selected=[...document.querySelectorAll('[data-toolbar-part][data-designer-tool-selected="true"]')].map(e=>e.dataset.toolbarPart).sort();return JSON.stringify(selected)===JSON.stringify(['searchInput','searchReverse','searchOption:contains','searchOption:exact','searchOption:startsWith'].sort())&&!document.querySelector('[data-toolbar-part="search"]').dataset.designerToolSelected&&!document.querySelector('[data-toolbar-part="searchOptions"]').dataset.designerToolSelected})()`)
    await check(language+' multiselection frame matches the exact union of selected search parts',`(()=>{const frame=document.querySelector('.grid-toolbar-multiselection-frame:not([hidden])'),ids=${JSON.stringify(selectedBefore.map(item=>item.id))},nodes=ids.map(id=>[...document.querySelectorAll('[data-toolbar-part]')].find(e=>e.dataset.toolbarPart===id)),bounds=nodes.map(e=>e.getBoundingClientRect()),a=frame?.getBoundingClientRect();return !!a&&Math.abs(a.left-Math.min(...bounds.map(r=>r.left)))<1&&Math.abs(a.top-Math.min(...bounds.map(r=>r.top)))<1&&Math.abs(a.right-Math.max(...bounds.map(r=>r.right)))<1&&Math.abs(a.bottom-Math.max(...bounds.map(r=>r.bottom)))<1})()`)
    const moveHandle=await rect(`(${panel}).querySelector('[data-toolbar-part="searchInput"] > .grid-tool-move-handle')`),moveStart={x:moveHandle.left+moveHandle.width/2,y:moveHandle.top+moveHandle.height/2},moveEnd={x:moveStart.x-8,y:moveStart.y-4}
    await press(moveStart);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...moveEnd,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...moveEnd,button:'left',clickCount:1});await pause(140)
    await check(language+' dragging one selected search part moves every Ctrl-selected part by the same offset',`(()=>{const before=${JSON.stringify(selectedBefore)},after=before.map(item=>{const e=[...document.querySelectorAll('[data-toolbar-part]')].find(node=>node.dataset.toolbarPart===item.id),r=e.getBoundingClientRect();return {left:r.left,top:r.top}}),dx=after[0].left-before[0].left,dy=after[0].top-before[0].top,selected=[...document.querySelectorAll('[data-toolbar-part][data-designer-tool-selected="true"]')].map(e=>e.dataset.toolbarPart).sort();return Math.abs(dx+8)<1&&Math.abs(dy+4)<1&&after.every((r,i)=>Math.abs(r.left-before[i].left-dx)<1&&Math.abs(r.top-before[i].top-dy)<1)&&JSON.stringify(selected)===JSON.stringify(['searchInput','searchReverse','searchOption:contains','searchOption:exact','searchOption:startsWith'].sort())})()`)
    await clickExpression(`document.querySelector('[data-toolbar-part="searchOption:exact"]')`)
    await check(language+' a plain click narrows a multi-selection to the clicked search component',`(()=>{const selected=[...document.querySelectorAll('[data-toolbar-part][data-designer-tool-selected="true"]')].map(e=>e.dataset.toolbarPart);return selected.length===1&&selected[0]==='searchOption:exact'})()`)
    await evaluate(`document.querySelector('.form-laboratory-page').classList.remove('form-laboratory-page')`);await pause(150)
    await check(language+' the shared toolbar retains pinned zones outside the Laboratory page wrapper',`(${contained})&&(()=>{const root=${panel},p=root.getBoundingClientRect(),input=root.querySelector('.grid-search-control input').getBoundingClientRect(),options=root.querySelector('.grid-search-options').getBoundingClientRect(),columns=root.querySelector('.grid-columns-slot').getBoundingClientRect(),expand=root.querySelector('.grid-expand-toggle').getBoundingClientRect(),title=root.querySelector('[data-toolbar-part="title"]').getBoundingClientRect(),counter=root.querySelector('[data-toolbar-part="counter"]').getBoundingClientRect(),search=root.querySelector('[data-toolbar-part="search"]').getBoundingClientRect();return columns.right<=expand.left+1&&expand.right<=title.left+1&&title.right<=search.left+1&&Math.abs(search.right-p.right)<16&&options.top>=input.bottom-1&&Math.abs((title.left+title.right-counter.left-counter.right)/2)<1})()`)
    await evaluate('localStorage.clear();sessionStorage.clear()')
  }
}
