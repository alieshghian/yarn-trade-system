# Shared Laboratory geometry contract

The Laboratory owns movement, resize and alignment calculations. Components
provide content and register editable surfaces; they do not implement geometry
algorithms, keyboard listeners or a separate layout engine.

## Registration and persistence

- Ordinary fields use the existing Canvas and section Canvas storage.
- Flow-based component parts register through `renderField` with
  `geometry: { storage: 'flow' }`. `data-designer-scope` on their layout host
  identifies stationary peers for explicit alignment and spacing commands.
- Full-width pinned rows declare `move: 'none', resize: 'vertical'`.
- Auto-sized flex children may declare `preserveSlot: true`. The first explicit
  edit records their natural slot dimensions in validated `flowSlots`, so resizing
  content cannot reflow stationary peers. These baselines participate in the
  existing document-local history and save/reopen; older drafts need no migration.
- `designerGeometry.ts` measures these surfaces and commits only deltas to their
  existing `::input` overrides. It does not migrate saved forms, rewrite schemas,
  recreate tables, change tree IDs or touch operational records.
- Content-specific registration is the only component adaptation. New movement,
  resizing or layout math belongs in `designer.ts`, with both storage adapters
  covered by focused tests. `behaviorManifest` includes the geometry contract.

## Shared commands

`moveCanvasFields`, `resizeCanvasHandle`, `alignCanvasFields` and
`layoutDesignerCanvasSelection` operate on physical coordinates in RTL and LTR.
Input-only rows use `levelDesignerInputRow` to normalize measured widths/heights,
preserve their average nonnegative gap and center a complete selected row.
Labelled multi-row forms retain the existing `levelDesignerCanvas` contract.

Plain arrows move one physical pixel; Shift uses ten. Resize-handle arrows use
the same resize calculation as pointer movement. The window capture handler and
React handler call the same nudge dispatcher so nested native controls cannot
silently consume a selected component's move command in Design mode. Entry,
component testing and runtime retain their own keyboard behavior.

Manual placement commits without a second automatic layout pass. Existing safety
insets must not reverse a manual move when an imported field is already beyond
an inset. Selected peers do not block group resizing. Unselected elements remain
stationary; explicit layout rejects a collision atomically.

The shared shell's minimum editor height reserves the actual horizontal
scrollbar thickness as well as padding and painted field bounds. Real horizontal
overflow must not hide field bottoms or make the surface exceed its pane.

## Validation and staged scope

`npm run validate:form-designer` covers existing fields, shared toolbar, runtime,
components, tree columns and report binding. The additional
`node tests/tree-geometry.browser.mjs --registered` checks actual top controls,
breadcrumb, status and subgroup count, including nested control focus and
independent resize axes. Browser fixtures use disposable profiles and isolated
storage. `npm run build` checks the production frontend output.

## Pointer presentation and settings

`designerGesturePreview.ts` paints field/panel moves and resizes at most once per
animation frame without changing React state, storage or document history during
pointer movement. Release flushes the final coordinate and commits once through
the existing geometry adapter. Escape, cancellation and lost capture restore the
original styles without committing. Unselected rectangles and scrollbar ownership
remain stable during the temporary view; the shell defers its content-floor
measurement until the gesture ends. Footer dimensions/offsets use the same deferred
pointer controller, preserving their existing layout rules.
`scheduleAfterDesignerGesture` defers timed local recovery and automatic server
backup while a gesture is active. Effect cleanup cancels retried old snapshots;
release schedules the new revision through the existing persistence workflow.
Unload protection still flushes the last committed document.

The full edge and corner hit areas are transparent, including hover and focus.
Only the existing small green marks are painted; focus outlines attach to the
small mark, never the full invisible button. Physical edge cursors and separate
move controls remain distinct. `shared-interaction.browser.mjs` checks actual
native fields, a tree panel and toolbar text for transparent chrome, hit testing,
live geometry, no React commits during movement, cancellation and atomic Undo.
Hit bands scale down on short controls so their centers remain selectable and
draggable. Move buttons stay above resize hit regions. Selection markers keep
the standard 19-by-18px chrome with no component-button padding; registered flow
targets anchor them above the input's physical top-left corner and translate them
with that input. They have no separate stored geometry. Compound columns retain
their attached whole-panel selector. Top controls apply corner radius to both the
painted control and its own wrapper, without inheriting a sibling's appearance.
Group-layout availability uses the measured registered selection as well as a
saved native Canvas. Selecting the five tree-toolbar controls therefore exposes
the same position-alignment and spacing context menu and shared equal-size tools;
it does not require a legacy editor Canvas. Browser checks execute top alignment,
equal height and positive equal spacing, and undo each through the shared history.

`FormSettingsButton` is the shared header entry. Operational forms keep their
permission-scoped `OperationalFormFrame` customization workflow. Laboratory
authoring opens the existing `FormDocumentSettings`; its tree-depth setting is
administrator structure, not a personal preference. `withCascadingTreeDepth`
changes only the allowed depth (root plus 0–4 subgroups), retaining nodes, codes,
bindings and tables. The behavior manifest embeds `laboratorySettingsContract`.

These checks use disposable browser storage. They do not certify or migrate the
user's personal Chrome records or activate a new operational route. Unrelated
scroll/layout stages are not implicitly declared complete by this contract.

### Implementation surfaces for this interaction/settings stage

- `frontend/src/FormLaboratoryPage.tsx`: both geometry adapters, deferred field
  and footer gestures, attached flow selectors and shared settings entry.
- `frontend/src/components/base-form/designerGesturePreview.ts`,
  `designerGeometry.ts`, `useDesignerSession.ts`, `BaseFormShell.tsx`: temporary
  presentation, shared contract, no-op dispatches and paused measurements.
- `frontend/src/styles.css` and `CascadingTreePanels.css`: transparent adaptive
  edge regions, independent move hit targets, standard markers and actual radii.
- `CascadingTreePanels.tsx`, `FormSettingsButton.tsx`,
  `CascadingTreeSettingsControls.tsx`, `FormDocumentSettings.tsx`,
  `FormFieldStructureControls.tsx`, `OperationalFormFrame.tsx`,
  `formSettingsContract.ts`, `formBehavior.ts`: shared settings, scoped personal
  access and non-destructive administrator depth control.
- `operationalFormFrame.css`: the same reserved scrollbar gutter for fixed
  Canvases as the Laboratory. Personal font/color flyouts stay open after a
  pointer hover followed by a click, matching the Laboratory menu behavior.
  Dynamic contract targets resolve their text, background and border selectors
  with the same column/toolbar identity; allowed personal values remain scoped
  by the existing permission validator and save/discard workflow.
- `frontend/tests/shared-interaction.browser.mjs`, `form-designer.fixture.tsx`,
  `frontend/package.json` and the corresponding designer, behavior and schema
  presentation unit tests: real-pointer, appearance and regression coverage.

No shared grid-engine implementation was changed in this stage.

### Verification — 2026-11-06

- `npm run build` and the targeted TypeScript check passed.
- Contract/schema tests: 195 passed; designer-session tests: 89 passed.
- The mandatory `validate:form-designer` run completed the main 270, runtime 75,
  focus 12 and component 26 browser checks. Its tree geometry stage encountered
  one CDP `Runtime.evaluate` timeout during the Undo scenario. The isolated
  rerun of that unchanged stage passed all 26 checks; the timeout's cause was
  not established and is not described as an application fix.
- The remaining unchanged-code matrix then passed: Canvas tree geometry 26,
  registered geometry 8, standard report 22, empty layout preview 14 and shared
  interaction 20 named checks (with additional direct geometry assertions).
- The separate operational fixture passed 51 checks, including shared settings,
  saved font/colors, permission boundaries and physical column resizing.
- Evidence: `frontend/review-interaction-validation.log`,
  `frontend/review-interaction-tree.log`,
  `frontend/review-interaction-remaining.log`,
  `frontend/review-interaction-operational.log` and
  `frontend/review-interaction-build.log`.

All browser fixtures use isolated storage; no personal Chrome records or
recovery history were inspected, migrated or rewritten by these checks.
