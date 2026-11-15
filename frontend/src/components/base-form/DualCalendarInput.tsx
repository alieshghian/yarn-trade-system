import SystemDateInput from '../../SystemDateInput'

/** Both calendar editors share one date-only ISO value and the application's validators. */
export function DualCalendarInput({ value, onChange, disabled, label }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; label: string
}) {
  return <div className="laboratory-dual-date" role="group" aria-label={label}>
    <SystemDateInput value={value} onChange={onChange} disabled={disabled} language="fa" ariaLabel={`${label} شمسی`}/>
    <span aria-hidden="true" className="laboratory-date-conversion">⇄</span>
    <SystemDateInput value={value} onChange={onChange} disabled={disabled} language="en" ariaLabel={`${label} میلادی`}/>
  </div>
}
