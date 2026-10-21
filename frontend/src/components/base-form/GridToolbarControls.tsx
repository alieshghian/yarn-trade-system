import {addToolbarHeaderPanel} from './formDocumentControls'
import type {FormSchemaDraft,FormSchemaTable} from './formSchema'
import {AppearanceNumberInput} from './AppearanceNumberInput'
import {useEffect,useRef} from 'react'
import {ExcelColorPicker} from './ExcelColorPicker'
import {gridToolbarParts,toolbarPartLabel,toolbarHeaderFor,toolbarPanels,moveToolbarPart,type GridToolbarSettings,type GridToolbarPartStyle,type GridToolbarPart} from './gridToolbarLayout'

export function GridToolbarControls({schema,table,onChange,selectedParts=[],selectionRequest=0,propertyRequest,onFont,onAlign,onSelect,onPreview}:{schema:FormSchemaDraft;table:FormSchemaTable;onChange:(schema:FormSchemaDraft)=>void;onPreview?:(part:GridToolbarPart,patch:GridToolbarPartStyle|null)=>void;selectedParts?:readonly GridToolbarPart[];selectionRequest?:number;propertyRequest?:{sequence:number;part:GridToolbarPart;property:string};onFont?:(part:GridToolbarPart)=>void;onAlign?:(direction:'left'|'right'|'top'|'bottom')=>void;onSelect?:(part:GridToolbarPart)=>void}) {
 const settings=(table.settings?.toolbar??{}) as GridToolbarSettings,root=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{if(!selectedParts.length||!root.current)return;root.current.open=true;const part=root.current.querySelector<HTMLElement>('[data-selected=true]');for(let parent=part?.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;const panel=part?.closest<HTMLElement>('.laboratory-designer-panel');if(part&&panel)panel.scrollTop+=part.getBoundingClientRect().top-panel.getBoundingClientRect().top-60},[selectedParts.join(','),selectionRequest])
 useEffect(()=>{if(!propertyRequest||!root.current)return
  const part=root.current.querySelector<HTMLElement>('[data-tool-settings="'+propertyRequest.part+'"]');if(!part)return
  root.current.open=true
  const colors:Record<string,string>={textColor:'رنگ متن',backgroundColor:'رنگ زمینه',borderColor:'رنگ حاشیه'}
  const color=colors[propertyRequest.property]
  const control=color?part.querySelector<HTMLButtonElement>('[aria-label="'+color+' انتخاب رنگ"]'):part.querySelector<HTMLElement>('[aria-label$=" — '+propertyRequest.property+'"]')
  control?.focus({preventScroll:true});if(color)control?.click()
 },[propertyRequest?.sequence])
 const save=(toolbar:GridToolbarSettings,source=schema)=>onChange({...source,tables:source.tables?.map(item=>item.id===table.id?{...item,settings:{...item.settings,toolbar}}:item)})
 const change=(part:GridToolbarPart,patch:GridToolbarPartStyle)=>{let next=settings;for(const id of selectedParts.includes(part)?selectedParts:[part])next=moveToolbarPart(next,id,patch);save(next)}
 const parts:GridToolbarPart[]=[...gridToolbarParts,...toolbarPanels(settings).slice(1)]
 const addPanel=(placement:'below'|'beside')=>{const id=('header:'+crypto.randomUUID()) as GridToolbarPart;onChange(addToolbarHeaderPanel(schema,table.id,id,'report-row.'+crypto.randomUUID(),placement));onSelect?.(id)}
 return <details ref={root} className="grid-toolbar-settings"><summary>چیدمان و قلم اجزای نوار جدول</summary>
  <p>هر جزء جست‌وجو جداگانه انتخاب می‌شود؛ برای انتخاب چند جزء، Ctrl یا Command را نگه دارید و روی هر جزء کلیک کنید. کشیدن اجزای انتخاب‌شده آن‌ها را با هم جابه‌جا می‌کند. لبه‌ها و گوشه‌ها اندازه را تغییر می‌دهند؛ کلید جهت ۱ پیکسل و Shift+جهت ۱۰ پیکسل حرکت می‌دهد.</p>
  {onSelect&&<div className="designer-toolbar-selection"><button type="button" onClick={()=>onSelect(toolbarHeaderFor(selectedParts[0]??'header',settings))}>انتخاب کل پنل هدر</button></div>}
  {onAlign&&selectedParts.length>1&&<div className="designer-toolbar-alignment">{(['left','right','top','bottom'] as const).map(direction=><button type="button" key={direction} onClick={()=>onAlign(direction)}>{({left:'تراز چپ',right:'تراز راست',top:'تراز بالا',bottom:'تراز پایین'})[direction]}</button>)}</div>}
  {parts.filter(part=>!selectedParts.length||selectedParts.includes(part)).map(part=><fieldset key={part} data-tool-settings={part} data-selected={selectedParts.includes(part)||undefined}><legend>{toolbarPartLabel(part)}</legend>
   {onFont&&<button type="button" onClick={()=>onFont(part)}>پنجره قلم — {toolbarPartLabel(part)}</button>}
   {(['x','y','width','height','fontSize','borderWidth','borderRadius','padding'] as const).map(key=><label key={key}>{({x:'موقعیت افقی',y:'موقعیت عمودی',width:'عرض',height:'ارتفاع',fontSize:'اندازه قلم',borderWidth:'ضخامت حاشیه',borderRadius:'گردی گوشه‌ها',padding:'فاصله داخلی'})[key]}<AppearanceNumberInput aria-label={toolbarPartLabel(part)+' — '+key} value={settings[part]?.[key]} onValueChange={value=>change(part,{[key]:value})}/></label>)}
   <label>تراز متن<select aria-label={toolbarPartLabel(part)+' — textAlign'} value={settings[part]?.textAlign??'start'} onChange={event=>change(part,{textAlign:event.target.value as 'start'|'center'|'end'})}><option value="start">ابتدا</option><option value="center">وسط</option><option value="end">انتها</option></select></label>
   {(['textColor','backgroundColor','borderColor'] as const).map(key=><ExcelColorPicker key={key} language="fa" label={key==='textColor'?'رنگ متن':key==='backgroundColor'?'رنگ زمینه':'رنگ حاشیه'} value={settings[part]?.[key]??'#263a38'} onPreview={color=>onPreview?.(part,color===null?null:{[key]:color})} onCommit={color=>change(part,{[key]:color})}/>)}
   {!part.startsWith('header')&&!['searchInput','searchOptions','searchReverse'].includes(part)&&!part.startsWith('searchOption:')&&<label>پنل میزبان<select aria-label={toolbarPartLabel(part)+' — پنل میزبان'} value={settings[part]?.panelId??'header'} onChange={event=>change(part,{panelId:event.target.value,x:0,y:0})}>{toolbarPanels(settings).map((id,index)=><option key={id} value={id}>{index===0?'هدر اصلی':'هدر '+(index+1)}</option>)}</select></label>}
   {part.startsWith('header')&&<><button type="button" onClick={()=>addPanel('beside')}>افزودن هدر کنار این هدر</button><button type="button" onClick={()=>addPanel('below')}>افزودن هدر زیر این هدر</button>{part!=='header'&&<label>چیدمان هدر افزوده<select aria-label="چیدمان هدر افزوده" value={settings[part]?.placement??'below'} onChange={event=>change(part,{placement:event.target.value as 'below'|'beside'})}><option value="below">زیر هدر قبلی</option><option value="beside">کنار هدر قبلی</option></select></label>}</>}
  </fieldset>)}
  <button type="button" onClick={()=>save({})}>بازنشانی چیدمان نوار این جدول</button>
 </details>
}
