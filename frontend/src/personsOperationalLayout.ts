import type { CSSProperties } from 'react'
import golden from './components/base-form/specs/persons.golden.v1.json'

export const personsOperationalLayout = golden.form
export const personsEditorTrackSizing = golden.sections[0].layout!.trackSizing
export const personsDefaultGridColumns = golden.sections[1].defaultColumns!

const editorRows = golden.sections[0].rows!
const placements = new Map(editorRows.flatMap(({ row, fields }) =>
  fields.map(field => [field.id, { row, start: field.startTrack, span: field.trackSpan }] as const)))

export function personsFieldPlacement(id: string, organization = false): CSSProperties {
  // The organization name reuses the first-name slot. The single Brand lookup spans both historical Brand slots.
  const slot = placements.get(organization && id === 'lastName' ? 'firstName' : id)
  if (!slot) throw new Error('Missing Golden Persons geometry for ' + id)
  const span = id === 'brandIds' ? slot.span + placements.get('defaultBrandId')!.span : slot.span
  return { '--persons-field-column': `${slot.start} / span ${span}`, '--persons-field-row': slot.row } as CSSProperties
}
