import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const reference = JSON.parse(await readFile(new URL('../src/components/base-form/specs/persons.golden.v1.json', import.meta.url), 'utf8'))
const rows = reference.sections.find(section => section.id === 'persons.editor').rows
const fieldClasses = {
  personCode:'code', titleId:'title', firstName:'first-name', lastName:'family-name',
  directorName:'director', jobId:'job', nationalityId:'nationality', phone:'phone',
  mobile:'mobile', address:'address', defaultBrandId:'brands',
}
const member = { titleId: '.person-number-control', phone: '.person-number-control', mobile: '.person-number-control', address: '.person-number-control', defaultBrandId: '.person-number-control' }
const group = 'notes-active-group'

/** The archived 20-track layout defines the old rectangles. The combined Brand
 * takes the union of the two adjacent old controls. Its full raster has no authenticated reference. */
export async function checkPersonsEditorGeometry(evaluate, company = false) {
  const fields = rows.flatMap(({row,fields}) => fields.flatMap(field => {
    if (field.id === 'brandIds' || (company ? field.id === 'firstName' : field.id === 'directorName')) return []
    const key = field.id
    const originalBrand = key === 'defaultBrandId' ? fields.find(f => f.id === 'brandIds') : undefined
    const className = company && key === 'lastName' ? 'organization' : fieldClasses[key]
    return [{
      id:key, row, start:originalBrand?.startTrack ?? (company && key === 'lastName' ? 6 : field.startTrack),
      span:field.trackSpan + (originalBrand?.trackSpan ?? 0),
      selector:key === group ? '.person-notes-active' : '.person-' + className + '-field',
      control:member[key] ?? 'input,select,textarea',
    }]
  }))
  const actual = await evaluate('(' + measure.toString() + ')(' + JSON.stringify(fields) + ')')
  assert.equal(actual.tracks, 20, 'Persons editor retains the Golden track count')
  assert.equal(actual.direction, 'rtl')
  assert.equal(actual.gap, 12)
  for (const e of actual.entries) {
    assert.ok(e.complete, 'Persons editor field and label are present: ' + e.id)
    assert.ok(Math.abs(e.x - e.expectedX) < 0.1 && Math.abs(e.width - e.expectedWidth) < 0.1,
      'Persons editor Golden tracks for ' + e.id + ': ' + JSON.stringify(e))
    assert.equal(e.font, '13px', e.id + ' label typography')
    assert.equal(e.controlHeight, e.id === group ? 36 : 34, e.id + ' visible control height')
    assert.ok(e.controlContained, e.id + ' does not overlap the next field')
    assert.ok(e.y >= e.rowTop && e.y <= e.rowTop + 4, e.id + ' stays on its Golden row')
  }
  assert.ok(actual.active, 'Notes and active checkbox stay next to one another without overlap')
  assert.deepEqual(actual.children.sort(), fields.map(e => e.selector).sort(), 'Every direct editor field participates in the geometry check')
  const groups = Array.from({length: 3}, (_, index) => actual.entries.find(entry => entry.row === index + 1).rowTop)
  assert.ok(groups[1] - groups[0] >= 55 && groups[2] - groups[1] >= 55, 'Persons editor keeps three distinct ordered rows')
}

function measure(fields) {
  const grid = document.querySelector('.active .persons-page .person-form-grid')
  const frame = grid.getBoundingClientRect(), style = getComputedStyle(grid)
  const tracks = style.gridTemplateColumns.trim().split(/\s+/)
  const gap = parseFloat(style.columnGap), right = frame.right - parseFloat(style.paddingRight)
  const span = frame.width - parseFloat(style.paddingRight) - parseFloat(style.paddingLeft)
  const track = (span - 19 * gap) / 20
  const nodes = fields.map(e => grid.querySelector(':scope > ' + e.selector))
  const tops = new Map()
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]) tops.set(fields[i].row, Math.min(tops.get(fields[i].row) ?? Infinity, nodes[i].getBoundingClientRect().top))
  }
  const entries = fields.map((e,i) => {
    const node = nodes[i]
    const field = e.id === 'notes-active-group' ? node?.querySelector('.person-notes-field') : node
    const control = field?.querySelector(e.control)
    const caption = field?.querySelector(':scope > span')
    if (!node || !control || !caption) return {id:e.id,complete:false}
    const r = node.getBoundingClientRect(), input = control.getBoundingClientRect()
    const width = e.span * track + (e.span - 1) * gap
    return {
      id:e.id, complete:true, row:e.row, rowTop:tops.get(e.row), y:r.top,
      x:r.left, width:r.width, expectedX:right-(e.start-1)*(track+gap)-width, expectedWidth:width,
      font:getComputedStyle(caption).fontSize, controlHeight:input.height,
      controlContained:input.left >= r.left-0.1 && input.right <= r.right+0.1,
    }
  })
  const check = grid.querySelector('input[data-field=isActive]')?.getBoundingClientRect()
  const notes = grid.querySelector('input[data-field=notes]')?.getBoundingClientRect()
  const active = Boolean(check && notes && check.width === 16 && check.height === 16 &&
    check.right <= notes.left && check.top >= notes.top && check.bottom <= notes.bottom)
  return { tracks:tracks.length, gap, direction:style.direction, entries, active,
    children:[...grid.children].map(child => fields.find(e=>child.matches(e.selector))?.selector ?? child.className) }
}
