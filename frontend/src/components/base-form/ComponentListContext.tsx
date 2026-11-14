import {createContext,useContext,type ReactNode} from 'react'
import type {ListSettingsPatch} from './componentListSettings'
import type {ListCapabilities} from './componentBehavior'
type ContextValue={settings?:ListSettingsPatch;behaviorOverrides?:Partial<ListCapabilities>;role?:'admin'|'user'}
const Context=createContext<ContextValue>({})
export const useComponentListContext=()=>useContext(Context)
export function ComponentListProvider({children,...value}:ContextValue&{children:ReactNode}){const parent=useContext(Context);return <Context.Provider value={{...value,role:value.role??parent.role}}>{children}</Context.Provider>}
