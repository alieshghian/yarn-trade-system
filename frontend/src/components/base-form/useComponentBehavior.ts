import {useEffect,useState} from 'react'
import {componentLibraryEvent,readComponentLibrary,resolveComponentCapabilities,defaultListCapabilities,type ListCapabilities} from './componentBehavior'

export function useComponentBehavior(id:string,preview?:ListCapabilities,overrides?:Partial<ListCapabilities>):ListCapabilities{
 const [,refresh]=useState(0)
 useEffect(()=>{const change=()=>refresh(value=>value+1);window.addEventListener(componentLibraryEvent,change);window.addEventListener('storage',change);return()=>{window.removeEventListener(componentLibraryEvent,change);window.removeEventListener('storage',change)}},[])
 const inherited=(()=>{if(preview)return preview;try{return resolveComponentCapabilities(readComponentLibrary(window.localStorage),id)}catch{return defaultListCapabilities}})()
 return {...inherited,...overrides,listSettings:{...inherited.listSettings,...overrides?.listSettings,permissions:{...inherited.listSettings?.permissions,...overrides?.listSettings?.permissions}}}
}
