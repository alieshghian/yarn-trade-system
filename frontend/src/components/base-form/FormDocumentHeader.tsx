import type {CSSProperties, ReactNode} from 'react'

/** The form's own header is content, not Laboratory design chrome. */
export function FormDocumentHeader({title, actions, style}: {title:string; actions:ReactNode; style?:CSSProperties}) {
  return <header className="form-laboratory-banner form-document-header" data-form-document-header style={style}>
    <div className="laboratory-banner-title"><strong>{title}</strong></div>{actions}
  </header>
}
