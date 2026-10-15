import type { ComponentProps } from 'react'
import { NumberControl } from './NumberControl'

export type FormValueListProps = Omit<ComponentProps<typeof NumberControl>,
  'protectedMode' | 'keyboardPrimarySelection' | 'listPrimary' | 'onSelectValue'> & {
  /** Saved default, independent of the value selected for the current form. */
  listPrimary: string
  /** Select an existing value without saving list or default changes. */
  onSelectValue: (value: string) => void
}

/** Shared text/contact list with protected browsing, explicit management and fixed actions. */
export function FormValueList(props: FormValueListProps) {
  return <NumberControl {...props} protectedMode keyboardPrimarySelection />
}
