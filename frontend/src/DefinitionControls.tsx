export function Field({ label, wide, compact, error, className = '', children }: { label: string, wide?: boolean, compact?: boolean, error?: string, className?: string, children: React.ReactNode }) {
  return <label className={`${wide ? 'wide-field' : ''} ${compact ? 'person-compact-field' : ''} ${error ? 'invalid-field' : ''} ${className}`}><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}
export function Shortcut({ code, label, onClick, primary, danger, disabled }: { code: string, label: string, onClick: () => void, primary?: boolean, danger?: boolean, disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`${primary ? 'primary' : ''} ${danger ? 'danger-shortcut' : ''}`} onClick={onClick}><kbd>{code}</kbd><span>{label}</span></button>
}
