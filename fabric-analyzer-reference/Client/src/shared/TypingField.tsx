import { useRef, useState, type ComponentPropsWithRef, type KeyboardEvent } from 'react'
import { typingCharacter, type TypingLanguage } from './gridTypingLanguage'
import { latinDigits } from './numericEntry'

export function useTypingLanguage(initial:TypingLanguage='fa',digits=false) {
  const [language,setLanguage]=useState(initial)
  const altOnly=useRef(false)
  const toggle=()=>setLanguage(current=>current==='fa'?'en':'fa')
  return {
    language,toggle,
    onBlur:()=>{altOnly.current=false},
    onKeyDown:(event:KeyboardEvent)=>{
      const target=event.target
      if(!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement)||target.readOnly||target.matches(':disabled'))return
      altOnly.current=event.key==='Alt'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey
      if(event.defaultPrevented||event.nativeEvent.isComposing)return
      if(altOnly.current){event.preventDefault();return}
      if(event.altKey||event.ctrlKey||event.metaKey||event.key.length!==1||['number','date'].includes(target.type))return
      const character=typingCharacter(event.code,language,event.shiftKey,event.getModifierState('CapsLock'))
      const text=digits&&language==='fa'&&character&&/^\d$/.test(character)?'۰۱۲۳۴۵۶۷۸۹'[Number(character)]:character
      if(text&&text!==event.key&&document.execCommand('insertText',false,text))event.preventDefault()
    },
    onKeyUp:(event:KeyboardEvent)=>{
      if(event.key==='Alt'&&altOnly.current){event.preventDefault();altOnly.current=false;toggle()}
    }
  }
}

export function TypingLanguageButton({language,toggle,focus,disabled}:{
  language:TypingLanguage;toggle:()=>void;focus:()=>void;disabled?:boolean
}) {
  const next=language==='fa'?'EN':'فا'
  return <button type="button" className="typing-language" disabled={disabled} aria-label={`تغییر زبان تایپ به ${next}`}
    title={`تغییر زبان تایپ به ${next} (Alt)`} onPointerDown={event=>{if(event.button===0)event.preventDefault()}}
    onClick={()=>{toggle();focus()}}>{next}</button>
}

type Options={typingDefault?:TypingLanguage;typingDigits?:boolean}
type InputProps=ComponentPropsWithRef<'input'>&Options&{numericGrouping?:boolean}
type TextareaProps=ComponentPropsWithRef<'textarea'>&Options

export function TypingInput({typingDefault,typingDigits,numericGrouping,readOnly,disabled,type,inputMode,...props}:InputProps) {
  const {language,toggle,...keys}=useTypingLanguage(typingDefault,typingDigits)
  const host=useRef<HTMLSpanElement>(null)
  const numeric=type==='number'||type==='tel'||inputMode==='numeric'||inputMode==='decimal'||inputMode==='tel'||typingDigits
  const lastValue=useRef(props.defaultValue)
  if(readOnly)return <input {...props} readOnly disabled={disabled} type={type} inputMode={inputMode}/>
  if(numeric){
    const telephone=type==='tel'||inputMode==='tel'
    const international=telephone&&!typingDigits
    const decimal=inputMode==='decimal'
    const digits=decimal?/^\d*(?:\.\d*)?$/:/^\d*$/
    const accepted=(value:string)=>digits.test(latinDigits(value))||(international&&/^\+\d*$/.test(latinDigits(value)))
    return <input {...props} disabled={disabled} type={type} inputMode={inputMode??(telephone?'tel':'numeric')}
      onKeyDown={event=>{
        props.onKeyDown?.(event)
        if(event.defaultPrevented||event.nativeEvent.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.key.length!==1)return
        if(!accepted(event.key))event.preventDefault()
      }}
      onBeforeInput={event=>{
        props.onBeforeInput?.(event)
        const data=(event.nativeEvent as InputEvent).data
        if(data&&!accepted(data))event.preventDefault()
      }}
      onPaste={event=>{
        props.onPaste?.(event)
        if(!accepted(event.clipboardData.getData('text')))event.preventDefault()
      }}
      onChange={event=>{
        const input=event.currentTarget
        const inserted=(event.nativeEvent as InputEvent).data
        const raw=telephone?input.value.replace(/[ ()-]/g,''):numericGrouping?input.value.replaceAll(',',''):input.value
        if(input.validity.badInput||(inserted&&!accepted(inserted))||!accepted(raw)){
          input.value=String(props.value??lastValue.current??'')
          return
        }
        if(!telephone&&!numericGrouping){
          const normal=latinDigits(input.value)
          if(normal!==input.value){
            const caret=input.selectionStart
            input.value=normal
            if(caret!==null)input.setSelectionRange(caret,caret)
          }
        }
        lastValue.current=input.value
        props.onChange?.(event)
      }}/>
  }
  return <span ref={host} className="typing-field" {...keys}>
    <input {...props} disabled={disabled} type={type} inputMode={inputMode}/>
    <TypingLanguageButton language={language} toggle={toggle} disabled={disabled}
      focus={()=>host.current?.querySelector('input')?.focus({preventScroll:true})}/>
  </span>
}

export function TypingTextarea({typingDefault,typingDigits,readOnly,disabled,...props}:TextareaProps) {
  const {language,toggle,...keys}=useTypingLanguage(typingDefault,typingDigits)
  const host=useRef<HTMLSpanElement>(null)
  if(readOnly)return <textarea {...props} readOnly disabled={disabled}/>
  return <span ref={host} className="typing-field" {...keys}>
    <textarea {...props} disabled={disabled}/>
    <TypingLanguageButton language={language} toggle={toggle} disabled={disabled}
      focus={()=>host.current?.querySelector('textarea')?.focus({preventScroll:true})}/>
  </span>
}
