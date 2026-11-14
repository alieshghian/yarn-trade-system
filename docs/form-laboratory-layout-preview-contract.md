# Laboratory visual layout preview

The shared `laboratoryLayoutPreviewContract` is included in the behavior manifest.
It applies to the Laboratory template and independent forms through the existing
`FormSchemaPresentation`, `BaseFormShell` and standard grid renderer.

- **Visual preview** (نمای عملیاتی) hides design tools and disables entry actions.
  It is separate from component testing and full temporary runtime testing.
- The return-to-design button floats as a glass overlay at the available page's
  upper-right corner, independently of form width. It reserves no row or gutter:
  it can stay outside a small form and overlap a full-width form. The same button
  resumes its normal layout when returning to Design.
- Version 2 preserves the mounted grid, rows, virtual query/cache, navigation
  state and column settings. Switching the view must not reload the data source,
  generate placeholder rows or render the full data set. Existing virtualization
  continues to bound the visible rows.
- Existing columns, saved widths, typography, toolbar settings and stable IDs
  still pass through the standard renderer. No replacement table is created.
- The existing bounded flex/grid hosts remain bounded. Do not replace these
  hosts with `display:block`: a virtual spacer must never become its own viewport.
- Capture the actual shell dimensions before hiding the authoring sidebar and
  banners. Temporarily pin those dimensions, preserving the editor split, table
  viewport, widths and scroll offsets; center the real form when it fits. The
  released authoring space must not stretch the grid. Measurement observers
  that initialize or resize the editor pause while this view is active.
- Toggle only presentation attributes/styles, without a full-form React state
  transition. Hidden authoring controls and a capture-phase editing-event guard
  prevent design commands. Native scrolling remains available for inspection;
  do not use `inert` on the table's ancestors, which disables native scrolling.
- Return restores the original inline sizing and scroll offsets. Designer and
  component-test state are never switched. Schema, saved
  records, column preferences and design history are not rewritten by this view.

`tests/layout-preview.browser.mjs` uses a disposable browser/profile and the real
toggle. First it verifies the main Laboratory with a virtual 100,000-record
source, then Product Group's inherited six-column report. It checks repeated
transitions, real pointer-to-paint latency, mounted DOM identity, no query reset,
bounded populated rendering, matching dimensions/scroll, hidden authoring tools,
blocked design commands, preserved saved schema/history and return.
The fixture supplies the same bounded tab host as the application. The test does
not access the user's Chrome profile or establish a diagnosis of that profile.

Pointer gesture rendering/performance and edge hit areas are a separate stage;
this contract does not claim those have been changed or verified.
