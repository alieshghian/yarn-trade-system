/** One settings entry used by the Laboratory and permission-scoped runtime. */
export function FormSettingsButton({language,onClick,expanded=false,label,className=''}:{language:'fa'|'en'|'zh';onClick:()=>void;expanded?:boolean;label?:string;className?:string}) {
  const title=label??(language==='fa'?'تنظیمات فرم':language==='zh'?'表单设置':'Form settings')
  return <button type="button" className={'form-settings-button '+className} aria-label={title} title={title} aria-expanded={expanded} aria-pressed={expanded} onClick={onClick}>⚙</button>
}
