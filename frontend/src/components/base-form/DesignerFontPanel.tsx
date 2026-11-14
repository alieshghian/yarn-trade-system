import {useLayoutEffect, useRef} from 'react'
import {ExcelColorPicker} from './ExcelColorPicker'
import './designerFontPanel.css'
export type DesignerFontValue={fontFamily:string;fontSize:number;bold:boolean;italic:boolean;underline:'none'|'single'|'double';strikeThrough:boolean;script:'none'|'superscript'|'subscript';normalFont:boolean;color:string;textAlign?:'start'|'center'|'end'|'left'|'right';base:{tableFont?:{size?:number}}}
export function DesignerFontPanel({value:gridFormatDialog,language,onChange:updateGridFormatDialog,onPreviewColor:previewGridFormatColor,onCommitColor:handleGridFormatColorCommit,allowColor=true,allowTextAlign=false}:{allowColor?:boolean;allowTextAlign?:boolean;value:DesignerFontValue;language:'fa'|'en'|'zh';onChange:(value:Partial<Omit<DesignerFontValue,'base'>>)=>void;onPreviewColor:(color:string|null)=>void;onCommitColor:(color:string|undefined)=>void}){
const gridWord=(fa:string,en:string,zh:string)=>language==='fa'?fa:language==='zh'?zh:en;
const gridFonts = [['inherit', 'پیش‌فرض', 'Default', '默认'], ['vazirmatn', 'وزیرمتن', 'Vazirmatn', 'Vazirmatn'], ['tahoma', 'Tahoma', 'Tahoma', 'Tahoma'], ['segoe', 'Segoe UI', 'Segoe UI', 'Segoe UI'], ['arial', 'Arial', 'Arial', 'Arial'], ['naskh', 'نسخ', 'Naskh', 'Naskh'], ['aptos', 'Aptos', 'Aptos', 'Aptos'], ['calibri', 'Calibri', 'Calibri', 'Calibri'], ['cambria', 'Cambria', 'Cambria', 'Cambria'], ['consolas', 'Consolas', 'Consolas', 'Consolas'], ['courier', 'Courier New', 'Courier New', 'Courier New'], ['georgia', 'Georgia', 'Georgia', 'Georgia'], ['times', 'Times New Roman', 'Times New Roman', 'Times New Roman'], ['verdana', 'Verdana', 'Verdana', 'Verdana']] as const
const gridFontSizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 36, 48, 72]
// Only the current custom size is transiently included; never accumulate presets.
const sizeOptions = Number.isFinite(gridFormatDialog.fontSize) && gridFormatDialog.fontSize >= 8 && gridFormatDialog.fontSize <= 72 && !gridFontSizes.includes(gridFormatDialog.fontSize)
  ? [...gridFontSizes, gridFormatDialog.fontSize].sort((a, b) => a - b)
  : gridFontSizes
const gridFontStyleSupport=Object.fromEntries(gridFonts.map(([id])=>[id,{bold:true,italic:true}]));
const fieldsRef = useRef<HTMLDivElement>(null)
const sizeInputRef = useRef<HTMLInputElement>(null)
const revealedValues = useRef(new WeakMap<HTMLSelectElement, string>())
useLayoutEffect(() => {
  sizeInputRef.current?.focus({preventScroll:true})
  sizeInputRef.current?.select()
}, [])
useLayoutEffect(() => {
  for (const list of fieldsRef.current?.querySelectorAll<HTMLSelectElement>('select[size]') ?? []) {
    // A font-family change must not scroll the independent size/style lists.
    if (revealedValues.current.get(list) === list.value) continue
    revealedValues.current.set(list, list.value)
    const selected = list.selectedOptions[0]
    if (!selected || selected.hidden) continue
    const css = getComputedStyle(selected), font = getComputedStyle(list)
    const line = Number.parseFloat(css.lineHeight) || Number.parseFloat(font.fontSize) * 1.2
    const height = selected.getBoundingClientRect().height || line + (Number.parseFloat(css.paddingTop) || 0) + (Number.parseFloat(css.paddingBottom) || 0)
    const index = Array.from(list.options).filter(option => !option.hidden).indexOf(selected)
    const top = Math.max(0, index) * height
    list.scrollTop = Math.max(0, top - (list.clientHeight - height) / 2)
  }
}, [gridFormatDialog.fontFamily, gridFormatDialog.fontSize, gridFormatDialog.bold, gridFormatDialog.italic])
return (      <>
        <div className="designer-grid-format-tabs" role="tablist" aria-label={gridWord('دسته‌های قالب‌بندی', 'Formatting categories', '格式类别')}><button type="button" role="tab" aria-selected="true">{gridWord('قلم', 'Font', '字体')}</button></div>
        <div className="designer-grid-format-normal"><label><input type="checkbox" checked={gridFormatDialog.normalFont} onChange={event => updateGridFormatDialog(event.target.checked ? { normalFont: true, fontFamily: 'inherit', fontSize: gridFormatDialog.base.tableFont?.size ?? 13, bold: false, italic: false, underline: 'none', strikeThrough: false, script: 'none', color: '#263a38' } : { normalFont: false })} />{gridWord('قلم معمولی', 'Normal font', '常规字体')}</label></div>
        <div ref={fieldsRef} className="designer-grid-font-fields">
          <label className="designer-grid-font-list">{gridWord('قلم', 'Font', '字体')}<select size={7} aria-label={gridWord('قلم', 'Font', '字体')} value={gridFormatDialog.fontFamily} onChange={event => { const support = gridFontStyleSupport[event.target.value] ?? { bold: false, italic: false }; updateGridFormatDialog({ fontFamily: event.target.value, bold: support.bold && gridFormatDialog.bold, italic: support.italic && gridFormatDialog.italic }) }}>{!gridFonts.some(([id]) => id === gridFormatDialog.fontFamily) && <option value={gridFormatDialog.fontFamily}>{gridFormatDialog.fontFamily}</option>}{gridFonts.map(([id, faName, enName, zhName]) => <option key={id} value={id}>{gridWord(faName, enName, zhName)}</option>)}</select></label>
          <label className="designer-grid-font-list">{gridWord('حالت قلم', 'Font style', '字形')}<select size={4} aria-label={gridWord('حالت قلم', 'Font style', '字形')} value={gridFormatDialog.bold ? gridFormatDialog.italic ? 'bold-italic' : 'bold' : gridFormatDialog.italic ? 'italic' : 'regular'} onChange={event => updateGridFormatDialog({ bold: event.target.value === 'bold' || event.target.value === 'bold-italic', italic: event.target.value === 'italic' || event.target.value === 'bold-italic' })}><option value="regular">{gridWord('معمولی', 'Regular', '常规')}</option><option value="italic" disabled={!gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic}>{gridWord('ایتالیک', 'Italic', '斜体')}{!gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic ? ` — ${gridWord('پشتیبانی نمی‌شود', 'unavailable', '不可用')}` : ''}</option><option value="bold" disabled={!gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold}>{gridWord('درشت', 'Bold', '粗体')}{!gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold ? ` — ${gridWord('پشتیبانی نمی‌شود', 'unavailable', '不可用')}` : ''}</option><option value="bold-italic" disabled={!gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold || !gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic}>{gridWord('درشت ایتالیک', 'Bold Italic', '粗斜体')}{!gridFontStyleSupport[gridFormatDialog.fontFamily]?.italic || !gridFontStyleSupport[gridFormatDialog.fontFamily]?.bold ? ` — ${gridWord('پشتیبانی نمی‌شود', 'unavailable', '不可用')}` : ''}</option></select></label>
          <label className="designer-grid-font-list">{gridWord('اندازه', 'Size', '字号')}<input ref={sizeInputRef} className="designer-font-current-size" aria-label={gridWord('اندازهٔ فعلی قلم', 'Current font size', '当前字号')} type="number" min="8" max="40" step="1" value={Number.isFinite(gridFormatDialog.fontSize) ? gridFormatDialog.fontSize : ''} onChange={event => updateGridFormatDialog({ fontSize: Number(event.target.value) })} onBlur={event => updateGridFormatDialog({ fontSize: Math.max(8, Math.min(40, Number(event.currentTarget.value) || 8)) })} /><select size={7} aria-label={gridWord('اندازه', 'Size', '字号')} value={sizeOptions.includes(gridFormatDialog.fontSize) ? gridFormatDialog.fontSize : ''} onChange={event => updateGridFormatDialog({ fontSize: Number(event.target.value) })}><option value="" disabled hidden />{sizeOptions.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <div className="designer-grid-font-options">
          {allowTextAlign&&<label className="designer-grid-format-underline">{gridWord('تراز متن داخل فیلد', 'Text alignment inside field', '字段内文本对齐')}<select aria-label={gridWord('تراز متن داخل فیلد', 'Text alignment inside field', '字段内文本对齐')} value={gridFormatDialog.textAlign??'start'} onChange={event=>updateGridFormatDialog({textAlign:event.target.value as DesignerFontValue['textAlign']})}><option value="start">{gridWord('پیش‌فرض زبان', 'Language default', '语言默认')}</option><option value="right">{gridWord('راست‌چین', 'Right', '右对齐')}</option><option value="center">{gridWord('وسط‌چین', 'Center', '居中')}</option><option value="left">{gridWord('چپ‌چین', 'Left', '左对齐')}</option></select></label>}
          <label className="designer-grid-format-underline">{gridWord('زیرخط', 'Underline', '下划线')}<select value={gridFormatDialog.underline} onChange={event => updateGridFormatDialog({ underline: event.target.value as 'none' | 'single' | 'double' })}><option value="none">{gridWord('بدون', 'None', '无')}</option><option value="single">{gridWord('تک', 'Single', '单线')}</option><option value="double">{gridWord('دوتایی', 'Double', '双线')}</option></select></label>
          {allowColor&&<div className="designer-grid-format-color"><span>{gridWord('رنگ قلم', 'Color', '颜色')}</span><ExcelColorPicker language={language} label={gridWord('رنگ قلم', 'Font color', '字体颜色')} value={gridFormatDialog.color} onPreview={value=>previewGridFormatColor(value??null)} onCommit={handleGridFormatColorCommit} /></div>}
        </div>
        <div className="designer-grid-font-bottom">
          <fieldset className="designer-grid-format-effects"><legend>{gridWord('جلوه‌ها', 'Effects', '效果')}</legend>
            <label><input type="checkbox" checked={gridFormatDialog.strikeThrough} onChange={event => updateGridFormatDialog({ strikeThrough: event.target.checked })} />{gridWord('خط‌خورده', 'Strikethrough', '删除线')}</label>
            <label><input type="checkbox" checked={gridFormatDialog.script === 'superscript'} onChange={event => updateGridFormatDialog({ script: event.target.checked ? 'superscript' : 'none' })} />{gridWord('بالانویس', 'Superscript', '上标')}</label>
            <label><input type="checkbox" checked={gridFormatDialog.script === 'subscript'} onChange={event => updateGridFormatDialog({ script: event.target.checked ? 'subscript' : 'none' })} />{gridWord('پایین‌نویس', 'Subscript', '下标')}</label>
          </fieldset>
          <div className="designer-grid-format-preview-wrap"><span>{gridWord('پیش‌نمایش', 'Preview', '预览')}</span><div className="designer-grid-format-preview" style={{ fontFamily: ({ inherit: 'inherit', vazirmatn: "'Vazirmatn',Tahoma,Arial,sans-serif", tahoma: 'Tahoma,Arial,sans-serif', segoe: "'Segoe UI',Tahoma,sans-serif", arial: 'Arial,sans-serif', naskh: "'Noto Naskh Arabic','B Nazanin',serif", aptos: 'Aptos,Arial,sans-serif', calibri: 'Calibri,Arial,sans-serif', cambria: 'Cambria,serif', consolas: 'Consolas,monospace', courier: "'Courier New',monospace", georgia: 'Georgia,serif', times: "'Times New Roman',serif", verdana: 'Verdana,sans-serif' } as Record<string, string>)[gridFormatDialog.fontFamily], fontSize: `${gridFormatDialog.fontSize}px`, fontWeight: gridFormatDialog.bold ? 700 : 400, fontStyle: gridFormatDialog.italic ? 'italic' : 'normal', color: gridFormatDialog.color, ...(allowTextAlign ? { textAlign: gridFormatDialog.textAlign ?? 'start' } : {}), textDecorationLine: [gridFormatDialog.underline !== 'none' ? 'underline' : '', gridFormatDialog.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none', textDecorationStyle: gridFormatDialog.underline === 'double' ? 'double' : 'solid' }}>{gridFormatDialog.script === 'superscript' ? <sup>{gridWord('نمونهٔ قلم', 'Font sample', '字体示例')}</sup> : gridFormatDialog.script === 'subscript' ? <sub>{gridWord('نمونهٔ قلم', 'Font sample', '字体示例')}</sub> : gridWord('نمونهٔ قلم', 'Font sample', '字体示例')}</div></div>
        </div>
      </>);
}
