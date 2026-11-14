/** A text caret owns arrows until its logical edge; whole selected values may be traversed. */
export function arrowLeavesText(key:string,start:number|null,end:number|null,length:number,rtl:boolean):boolean {
  if(key!=='ArrowLeft'&&key!=='ArrowRight')return false
  if(start===null||end===null)return true
  if(start===0&&end===length)return true
  if(start!==end)return false
  const forward=rtl?key==='ArrowLeft':key==='ArrowRight'
  return start===(forward?length:0)
}
export function allowsFieldArrow(control:HTMLElement,key:string):boolean {
  if(!(control instanceof HTMLInputElement||control instanceof HTMLTextAreaElement)||control.readOnly)return true
  return arrowLeavesText(key,control.selectionStart,control.selectionEnd,control.value.length,getComputedStyle(control).direction==='rtl')
}
