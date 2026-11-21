import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// These checked-in references are listed in docs/audits/approved-forms-baseline.md.
// The digest protects the existing design, including its interaction and
// geometry configuration. Runtime behavior still has its own browser tests.
const designs = JSON.parse(await readFile(new URL('./protected-form-designs.json', import.meta.url)))

for (const [form, baseline] of Object.entries(designs)) {
  test(`${form} retains its reviewed design reference`, async () => {
    const design = JSON.parse(await readFile(new URL('../src/forms/' + baseline.design, import.meta.url)))
    const actual = createHash('sha256').update(JSON.stringify(design)).digest('hex')
    assert.equal(actual, baseline.sha256, `${baseline.design} changed. Record the approved revision and review the affected runtime geometry and behavior before updating the baseline.`)
  })
}
