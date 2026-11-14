import { Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { retryablePage, WorkspacePageBoundary } from '../src/WorkspacePageBoundary'
let attempts = 0
const Page = retryablePage(async () => {
  if (++attempts < 2) throw new Error('Intentional unavailable page')
  return { default: () => <div data-loaded>فرم باز شد</div> }
})
function Fixture() {
  const [open, setOpen] = useState(true)
  const [revision, setRevision] = useState(0)
  return <><input aria-label="other-tab-draft" defaultValue="unsaved" />
    <button id="reopen" onClick={() => { attempts = 0; Page.retry(); setRevision(value => value + 1); setOpen(true) }}>بازکردن</button>
    {open ? <WorkspacePageBoundary key={revision} language="fa" onRetry={Page.retry} onClose={() => setOpen(false)} onHome={() => setOpen(false)}><Suspense fallback="در حال بارگذاری"><Page /></Suspense></WorkspacePageBoundary> : <div data-home>داشبورد</div>}
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
