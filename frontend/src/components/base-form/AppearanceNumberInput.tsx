import {useEffect,useRef,useState,type InputHTMLAttributes} from 'react'

/** One numeric editor for every Designer target. Preserve incomplete typing,
 * apply valid numbers live, and finish through the same blur/Enter path. */
export function AppearanceNumberInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:number|string|undefined;onValueChange:(value:number|undefined)=>void}){
 const [text,setText]=useState(value===undefined?'':String(value)),editing=useRef(false),dirty=useRef(false)
 useEffect(()=>{if(!editing.current||!dirty.current||Number(text)!==Number(value)){setText(value===undefined?'':String(value));dirty.current=false}},[value])
 const finish=()=>{editing.current=false;const next=text.trim()===''?undefined:Number(text),current=value===undefined||value===''?undefined:Number(value);if(dirty.current&&(next===undefined||Number.isFinite(next))&&next!==current)onValueChange(next);dirty.current=false;setText(value===undefined?'':String(value))}
 return <input {...props} type="number" value={text} onFocus={event=>{editing.current=true;dirty.current=false;props.onFocus?.(event)}} onChange={event=>{dirty.current=true;setText(event.target.value);const next=event.target.valueAsNumber;if(Number.isFinite(next))onValueChange(next)}} onBlur={event=>{finish();props.onBlur?.(event)}} onKeyDown={event=>{event.stopPropagation();props.onKeyDown?.(event);if(!event.defaultPrevented&&event.key==='Enter'){event.preventDefault();event.currentTarget.blur()}}}/>
}
