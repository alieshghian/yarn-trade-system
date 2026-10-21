/** Traverse the real categorized menu by hovering its submenu triggers. */
export async function revealMenuExpression(expression,{evaluate,send,pause}) {
 if(await evaluate(`!!(${expression})`))return
 const groups=await evaluate(`Array.from(document.querySelectorAll('.designer-context-menu:not(.designer-context-submenu)>[data-grid-submenu]')).map(e=>e.dataset.gridSubmenu)`)
 for(const group of groups){
  const point=await evaluate(`(()=>{const e=document.querySelector('.designer-context-menu:not(.designer-context-submenu)>[data-grid-submenu="'+${JSON.stringify(group)}+'"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
  await pause(80)
  if(await evaluate(`!!(${expression})`))return
 }
}
