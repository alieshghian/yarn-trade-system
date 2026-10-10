import type { FormSectionProps } from './types'

export function BaseFormSection({ id, children, className = '' }: FormSectionProps) {
  return <section data-form-section={id} className={`base-form-section ${className}`}>{children}</section>
}
