import SystemDateInput from './SystemDateInput'

type Props = {
  value: string
  onChange: (isoDate: string) => void
  onError?: (message: string) => void
  disabled?: boolean
  required?: boolean
  language?: 'fa' | 'en'
  ariaLabel?: string
}

export default function PersianDateInput({ value, onChange, onError, disabled, required, language = 'fa', ariaLabel }: Props) {
  return <SystemDateInput calendar="persian" value={value} onChange={onChange} onError={onError}
    disabled={disabled} required={required} language={language} ariaLabel={ariaLabel} />
}
