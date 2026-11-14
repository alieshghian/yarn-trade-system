import type { FormSchemaDraft, FormSchemaLocale } from './formSchema'
import { fieldFocusSequence, hasInvalidFieldFocusOrders, moveFieldFocusOrder } from './fieldFocusOrder'

export function FieldFocusOrderControls({ schema, language, visualFieldIds, onChange }: { schema: FormSchemaDraft; language: FormSchemaLocale; visualFieldIds: readonly string[]; onChange: (schema: FormSchemaDraft) => void }) {
  const fa = language === 'fa'
  const ordered = fieldFocusSequence(schema.fields, visualFieldIds, true)
  const readonly = schema.fields.filter(field=>field.kind!=='hidden'&&(field.readOnly||field.componentId==='base-form.derived-display'))
  const explicit = ordered.some(id=>schema.fields.find(field=>field.id===id)?.focusOrder!==undefined)
  const enabledCount = fieldFocusSequence(schema.fields, visualFieldIds).length
  const move = (id:string,position:number)=>onChange({...schema,fields:moveFieldFocusOrder(schema.fields,visualFieldIds,id,position)})
  return <details className="form-structure-disclosure form-focus-order-disclosure"><summary>{fa ? 'ترتیب ورود با Enter' : language === 'zh' ? '回车键输入顺序' : 'Enter navigation order'} ({enabledCount})</summary><fieldset>
    <p>{fa ? 'پیش‌فرض مطابق چیدمان فرم است. تیک را بردارید تا Enter از آن فیلد عبور کند؛ انتخاب با موس باقی می‌ماند. فیلدهای فقط‌خواندنی وارد مسیر نمی‌شوند.' : 'The default follows the form layout. Uncheck a field to skip it with Enter; mouse selection stays available. Read-only fields are excluded.'}</p>
    {hasInvalidFieldFocusOrders(schema.fields)&&<p role="alert">{fa?'شماره‌های ذخیره‌شده تکراری یا نامعتبرند؛ ترتیب خودکار استفاده می‌شود.':'Invalid saved positions; automatic order is used.'}</p>}
    <div className="form-focus-order-list">
      <div className="form-focus-order-head" aria-hidden="true"><span>{fa?'فعال':'On'}</span><span>{fa?'فیلد':'Field'}</span><span>{fa?'ترتیب':'Order'}</span><span>↑</span><span>↓</span></div>
      {ordered.map((id,index)=>{
        const field=schema.fields.find(item=>item.id===id)!, enabled=field.enterEnabled!==false
        return <div key={id} className="form-focus-order-row" data-enter-row={id}>
          <input type="checkbox" aria-label={(fa?'ورود با Enter ':'Enter enabled ')+field.label[language]} checked={enabled} onChange={event=>onChange({...schema,fields:schema.fields.map(item=>item.id===id?{...item,enterEnabled:event.target.checked}:item)})}/>
          <span className="form-focus-order-name">{field.label[language]}</span>
          <select aria-label={(fa?'شمارهٔ Enter ':'Enter position ')+field.label[language]} disabled={!enabled} value={index+1} onChange={event=>move(id,Number(event.target.value))}>{ordered.map((_,position)=><option key={position+1} value={position+1}>{position+1}</option>)}</select>
          <button type="button" aria-label={(fa?'یک پله بالا: ':'Move up: ')+field.label[language]} disabled={!enabled||index===0} onClick={()=>move(id,index)}>↑</button>
          <button type="button" aria-label={(fa?'یک پله پایین: ':'Move down: ')+field.label[language]} disabled={!enabled||index===ordered.length-1} onClick={()=>move(id,index+2)}>↓</button>
        </div>
      })}
      {readonly.map(field=><div className="form-focus-order-row is-readonly" key={field.id}><input type="checkbox" checked={false} disabled aria-label={(fa?'ورود با Enter ':'Enter enabled ')+field.label[language]}/><span className="form-focus-order-name">{field.label[language]}</span><small className="form-focus-order-readonly">{fa?'فقط‌خواندنی':'Read-only'}</small></div>)}
    </div>
    {!ordered.length&&!readonly.length&&<p>{fa?'فیلدی برای ترتیب ورود وجود ندارد.':'No fields to order.'}</p>}
    {explicit&&<button type="button" onClick={()=>onChange({...schema,fields:schema.fields.map(field=>{const {focusOrder:_focusOrder,...rest}=field;return rest})})}>{fa?'بازگشت به ترتیب چیدمان فرم':language==='zh'?'恢复自动顺序':'Restore form layout order'}</button>}
  </fieldset></details>
}
