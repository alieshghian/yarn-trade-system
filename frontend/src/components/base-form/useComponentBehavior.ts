import {useEffect,useState} from 'react'
import {componentLibraryEvent,readComponentLibrary,resolveComponentCapabilities,defaultListCapabilities,type ListCapabilities} from './componentBehavior'

export function useComponentBehavior(id:string,preview?:ListCapabilities):ListCapabilities{
 const [,refresh]=useState(0)
 useEffect(()=>{const change=()=>refresh(value=>value+1);window.addEventListener(componentLibraryEvent,change);window.addEventListener('storage',change);return()=>{window.removeEventListener(componentLibraryEvent,change);window.removeEventListener('storage',change)}},[])
 if(preview)return preview
 try{return resolveComponentCapabilities(readComponentLibrary(window.localStorage),id)}catch{return defaultListCapabilities}
}
