import {useEffect,useRef,useState,type InputHTMLAttributes} from 'react'

/** One numeric editor for every Designer target. Preserve incomplete typing,
 * apply valid numbers live, and finish through the same blur/Enter path. */
export function AppearanceNumberInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:number|string|undefined;onValueChange:(value:number|undefined)=>void}){
 const [text,setText]=useState(value===undefined?'':String(value)),editing=useRef(false)
 useEffect(()=>{if(!editing.current)setText(value===undefined?'':String(value))},[value])
 const finish=()=>{editing.current=false;const next=text.trim()===''?undefined:Number(text),current=value===undefined||value===''?undefined:Number(value);if((next===undefined||Number.isFinite(next))&&next!==current)onValueChange(next);setText(value===undefined?'':String(value))}
 return <input {...props} type="number" value={text} onFocus={event=>{editing.current=true;props.onFocus?.(event)}} onChange={event=>{setText(event.target.value);const next=event.target.valueAsNumber;if(Number.isFinite(next))onValueChange(next)}} onBlur={event=>{finish();props.onBlur?.(event)}} onKeyDown={event=>{event.stopPropagation();props.onKeyDown?.(event);if(!event.defaultPrevented&&event.key==='Enter'){event.preventDefault();event.currentTarget.blur()}}}/>
}
