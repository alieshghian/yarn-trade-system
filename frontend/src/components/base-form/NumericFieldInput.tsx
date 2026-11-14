import {useEffect,useId,useRef,useState,type InputHTMLAttributes} from 'react'
import {createPortal} from 'react-dom'

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'type'> & {options?:readonly string[];loadOptions?:(prefix:string,signal:AbortSignal)=>Promise<string[]>}
/** Saved numeric values are suggestions, never new records or automatic replacements. */
export function NumericFieldInput({options=[],loadOptions,onChange,onKeyDown,onFocus,onBlur,...props}:Props){
 const input=useRef<HTMLInputElement>(null),id=useId(),loader=useRef(loadOptions);loader.current=loadOptions
 const [focused,setFocused]=useState(false),[matches,setMatches]=useState<string[]>([]),[active,setActive]=useState(0),[dismissed,setDismissed]=useState(false),[position,setPosition]=useState({left:0,top:0,width:0})
 const value=String(props.value??''),optionsKey=options.join('\0')
 useEffect(()=>{
  const abort=new AbortController();setMatches([]);setActive(0);setDismissed(false)
  if(!focused||props.disabled||props.readOnly||!value.trim())return
  const publish=(values:readonly string[])=>{if(!abort.signal.aborted)setMatches([...new Set(values.map(String).filter(v=>v.trim()&&Number.isFinite(Number(v))).map(v=>String(Number(v))))].filter(v=>v.startsWith(value)&&v!==value).sort((a,b)=>Number(a)-Number(b)).slice(0,20))}
  const timer=setTimeout(()=>{if(loader.current)void loader.current(value,abort.signal).then(publish).catch(()=>{/* Optional suggestions must never block typing or saving. */});else publish(options)},loader.current?140:0)
  return()=>{clearTimeout(timer);abort.abort()}
 },[focused,value,props.disabled,props.readOnly,optionsKey])
 const opened=focused&&!dismissed&&matches.length>0
 useEffect(()=>{if(!opened)return;const update=()=>{const r=input.current?.getBoundingClientRect();if(r)setPosition({left:r.left,top:r.bottom+3,width:r.width})};update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)}},[opened])
 function choose(index:number){const el=input.current;if(!el||!matches[index])return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,matches[index]);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));setDismissed(true);el.focus({preventScroll:true});el.select()}
 return <><input {...props} ref={input} type="number" autoComplete="off" aria-autocomplete="list" aria-controls={opened?id:undefined} aria-expanded={opened} aria-activedescendant={opened?id+'-'+active:undefined} onChange={onChange} onFocus={e=>{setFocused(true);onFocus?.(e)}} onBlur={e=>{setFocused(false);onBlur?.(e)}} onKeyDown={e=>{if(opened&&!e.nativeEvent.isComposing&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Enter')choose(active);else if(e.key==='Escape')setDismissed(true);else setActive(v=>(v+(e.key==='ArrowDown'?1:matches.length-1))%matches.length);return}onKeyDown?.(e)}}/>{opened&&createPortal(<div id={id} role="listbox" className="numeric-field-suggestions" style={{position:'fixed',...position,zIndex:2147482000,maxHeight:160,overflowY:'auto',background:'var(--surface,#fff)',border:'1px solid #bdd0ca',borderRadius:6,boxShadow:'0 3px 12px #0002'}}>{matches.map((v,i)=><button id={id+'-'+i} key={v} type="button" role="option" aria-selected={active===i} tabIndex={-1} style={{display:'block',width:'100%',border:0,padding:'5px 10px',textAlign:'inherit',background:active===i?'#d5ebe5':'transparent',color:'inherit'}} onPointerDown={e=>{e.preventDefault();choose(i)}}>{v}</button>)}</div>,document.getElementById('root')??document.body)}</>
}
