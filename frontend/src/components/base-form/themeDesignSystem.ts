import type { FormStorage } from './laboratoryFormDraftState'
export const themeTokens=['background','surface','foreground','muted','border','accent','frame'] as const
export type ThemeToken=typeof themeTokens[number]
export type DesignTheme={id:string;name:string;colors:Record<ThemeToken,string>;userEditable:ThemeToken[]}
export type ThemePreferences={themeId:string;colors:Partial<Record<ThemeToken,string>>}
export type ThemeLibrary={version:number;themes:DesignTheme[];previous:{version:number;themes:DesignTheme[]}[]}
export type ThemeDocument={rowVersion:string;library:ThemeLibrary;preferences:ThemePreferences|null}
export const defaultDesignTheme:DesignTheme={id:'laboratory-light',name:'روشن آزمایشگاه',colors:{background:'#eef2ef',surface:'#ffffff',foreground:'#172727',muted:'#71817e',border:'#dfe7e3',accent:'#217c73',frame:'#e3efec'},userEditable:['background','surface','foreground','muted','border','accent','frame']}
export const themeTokenLabels:Record<ThemeToken,string>={background:'پس‌زمینه برنامه',surface:'سطح پنل‌ها',foreground:'رنگ متن',muted:'متن فرعی',border:'کادرها',accent:'رنگ اصلی',frame:'قاب فرم'}
const variables:Record<ThemeToken,string>={background:'--design-background',surface:'--design-surface',foreground:'--ink',muted:'--muted',border:'--line',accent:'--teal',frame:'--form-frame-fill'}
export function validDesignTheme(theme:DesignTheme):boolean{return /^[a-z][a-z0-9-]{0,47}$/.test(theme.id)&&Boolean(theme.name.trim())&&themeTokens.every(key=>/^#[0-9a-f]{6}$/i.test(theme.colors[key]))&&theme.userEditable.every(key=>themeTokens.includes(key))}
export function effectiveTheme(theme:DesignTheme,preferences:ThemePreferences|null){return {...theme.colors,...Object.fromEntries(Object.entries(preferences?.themeId===theme.id?preferences.colors:{}).filter(([key,value])=>theme.userEditable.includes(key as ThemeToken)&&/^#[0-9a-f]{6}$/i.test(value!)))}}
export function applyDesignTheme(root:HTMLElement,selection:string,document:ThemeDocument|null){
 for(const variable of Object.values(variables))root.style.removeProperty(variable)
 root.removeAttribute('data-design-theme')
 const theme=document?.library.themes.find(theme=>'design:'+theme.id===selection)
 if(!theme||!validDesignTheme(theme))return
 root.dataset.designTheme=theme.id
 const colors=effectiveTheme(theme,document!.preferences)
 for(const key of themeTokens)root.style.setProperty(variables[key],colors[key])
}
export const themeDraftKey='yarn-trade:design-system-theme-draft:v1'
export function saveThemeDraft(storage:FormStorage|undefined,themes:DesignTheme[]):boolean{if(!storage||!themes.length||themes.some(theme=>!validDesignTheme(theme)))return false;try{storage.setItem(themeDraftKey,JSON.stringify({version:1,themes}));return true}catch{return false}}
export function loadThemeDraft(storage:FormStorage|undefined):DesignTheme[]|null{try{const raw=storage?.getItem(themeDraftKey);if(!raw)return null;const value=JSON.parse(raw);return value.version===1&&Array.isArray(value.themes)&&value.themes.every(validDesignTheme)?value.themes:null}catch{return null}}
