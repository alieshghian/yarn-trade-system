export function Field({ label, wide, compact, error, className = '', style, labelId, labelContent, controlContent, children }: { label: string, wide?: boolean, compact?: boolean, error?: string, className?: string, style?: React.CSSProperties, labelId?: string, labelContent?: React.ReactNode, controlContent?: React.ReactNode, children: React.ReactNode }) {
  return <label style={style} className={`${wide ? 'wide-field' : ''} ${compact ? 'person-compact-field' : ''} ${error ? 'invalid-field' : ''} ${className}`}><span id={labelId}>{labelContent ?? label}</span>{controlContent ?? children}{error && <small className="field-error">{error}</small>}</label>
}
export function Shortcut({ code, label, onClick, primary, danger, disabled }: { code: string, label: string, onClick: () => void, primary?: boolean, danger?: boolean, disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`${primary ? 'primary' : ''} ${danger ? 'danger-shortcut' : ''}`} onClick={onClick}><kbd>{code}</kbd><span>{label}</span></button>
}
