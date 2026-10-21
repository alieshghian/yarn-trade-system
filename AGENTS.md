# Yarn Trade local startup

- Keep the frontend at `http://127.1.0.1:5173/`; start it with `runapp2.bat`.
- Start the API with `runapp1.bat` on `localhost:5223`. The script already carries the runtime compatibility setting; use it instead of explaining the runtime mismatch again.
- Vite starts the color-sampler companion on `127.1.0.1:5174` automatically. Do not launch it manually.
- If the page or data fails, check both frontend and API on these exact addresses, then restart the needed service with its script. Keep the user-facing browser on `127.1.0.1:5173`.

## CodeGraph workflow

- Use `codegraph_explore` to discover code locations and understand dependencies or call paths. For a narrow change in a precisely known file, direct reading is allowed; use CodeGraph whenever needed to establish correctness or impact. For multi-file or dependency-affecting changes, inspect relationships with CodeGraph before editing. Keep review depth sufficient for correctness; reducing token use must not weaken it.
- Before changes that may affect dependencies, callers, or multiple modules, use CodeGraph to inspect relationships and impact. Trust valid results without redundant searches, and expand the file scope only for a technical reason.
- When verification is requested or technically necessary, run only relevant tests or builds; run the full project only with a specific justification.
- If CodeGraph is unavailable, use the usual code-inspection method and report the limitation. Do not reindex unless genuinely needed; rely on automatic sync.
- Do not change dependent files solely because the graph shows a relationship.

## Approved Form Laboratory regression contract

- Preserve owner-approved behavior and existing drafts; do not silently reset, discard history, or change the master when editing an independent form.
- Shared toolbar behavior is versioned in `laboratoryToolbarContract`, documented in `docs/form-laboratory-toolbar-contract.md`, and included in the integration behavior manifest. Reusable fixes belong in this shared renderer; verify short-header content containment, live upward resizing, unchanged typography, saved child overrides and independent document storage before completion. Promoting a form's geometry to the master still requires explicit target selection.
- For changes touching Form Laboratory, shared presentation, Designer, structural editing, recovery or their CSS, run `npm run validate:form-designer` from `frontend` before reporting completion. It runs focused behavioral tests, session tests, TypeScript and real headless-browser tests.
- Keep the development site at `http://127.1.0.1:5173/`. Browser tests use a disposable profile and synthetic data. Chrome/Edge must be available; browser startup failures are validation failures, never a silent skip. Set FORM_TEST_BROWSER only to an installed browser executable if necessary.
- If a regression fails, fix the implementation and rerun relevant checks. Do not weaken an approved contract or mark visual success based only on source-text tests. Add a regression for each corrected defect.
- Persian user-facing text and reports must be right-to-left.
- Toolbar regression tests must operate on the actual button/input, not just its wrapper. Cover independent search input/reverse button/each option selection, Ctrl/Command multi-selection with a visible union frame and atomic drag/one-step Undo, pinned side controls with a flexible center, selected-only handles, numeric and mouse header sizing, multiple header hosts and persistence. Check horizontal overflow separately even with fixed editor height and old offset Canvas data.
- Header fields and table toolbar parts use the existing Designer and font dialog. Selecting an element reveals only its corresponding sidebar controls; do not scroll or resize the canvas to reveal settings.
- Dropdowns and submenus must overlay the form without reflow or covering their own trigger. Test them near the viewport bottom as well as the top.
- Remove unused scroll extents in the view layer without rewriting saved Canvas coordinates or restricting editing bounds. Keep explicit manual scrolling settings and the original Laboratory layout contract.
- Every Designer target (native field, composite/custom component, toolbar child/group and header panel) must support the same body selection/drag, multiselection, physical arrow movement, eight resize handles, shared font dialog and live appearance controls. Test actual nested controls, including Title-derived components; wrapper-only assertions are insufficient.
- During a gesture and Undo/Redo, keep the viewport origin, unselected rectangles and scroll position stable. Resizing an edge must leave its opposite edge fixed in RTL and LTR. Adding a header must not reflow or shrink existing panels; overlap is allowed until explicitly arranged.
- Component test mode uses local temporary sample state, never operational requests or design history entries. Returning to Design must preserve schema, styling, geometry and component definitions.
- Title, address and renamed list instances must use the same FormValueList/NumberControl interaction engine. PersonTitleControl is only a data adapter. Labels must drive help, placeholders and action names, never choose behavior. Keep stable library IDs and immutable revisions; inherited capabilities update dependent instances while explicit child overrides and data/API bindings remain intact.
- Every list popup must render in the shared opaque overlay, outside field opacity/transform/stacking contexts. Test empty gaps and underlying toolbar text, Enter batch rows, F3 versus parent save, edit/delete/default and Escape in the real Persons page as well as synthetic forms. Removing a row must not be mistaken for an outside click after its DOM node is removed.
- Component sample mode must not disable toolbar selection/context menus/dragging. Include this exact mode in the browser regression matrix.
- Form behavior originates in the Laboratory behavior library. Documents and components keep stable references and explicit differences, not copies of the shared engine. Keep reusable source/operation instructions, immutable revisions and preview-before-publish; include the resolved behavior manifest in integration releases.
- Test the full local runtime cycle: Create, only Save/Close during entry, validation, component Enter versus field navigation, saved sample rows, edit/cancel, normal actions after save and a stable return to Design. Reset temporary data when switching forms; never invoke operational APIs from this runtime.
- Runtime preview must render the existing designed actions through the same footer/Shortcut renderer. Preserve action IDs, labels, shortcut text, colors, fonts, border, radius and size; switch only visibility, availability and local behavior. Compare computed custom appearance before runtime, in Create/Edit and after Save in browser regression tests; do not introduce a separate plain-button runtime footer.
- Context menus for individual toolbar parts must expose their own typography/colors/box controls. Structural header commands belong to header targets. Switching between preview and design datasets must use current value adapters on the first render while preserving grid geometry and user column settings.
- Appearance commands are a shared contract: Color must directly open ExcelColorPicker, Font must directly open the existing Excel-style font dialog, and box/corner controls must use AppearanceNumberInput in the existing sidebar. Never replace these commands with a target-specific generic settings dialog. Extend the shared command/control and add real cross-target palette/font/preview/cancel/Undo tests when adding appearance capabilities.

## Operational form redesign and shared theme contract

- Keep the working operational original available. Redesigns are independent, versioned documents in the existing Laboratory Designer, with stable IDs and separate schema, appearance and history.
- Classify changes to bindings, types, validation, actions, table relationships or business behavior as requiring integration review. A browser design release must never activate or replace an operational route by itself.
- Before replacing a working form, verify its actual source/API/database contracts, migrations if needed, permissions, sorting and Master-Detail behavior; require tests, owner approval and a rollback path.
- Master revisions require an explicit target selection. Preserve form-specific and per-user overrides; show conflicting decisions instead of silently overwriting them.
- Author shared themes in the Laboratory. Ordinary users receive only permitted own-account preferences; theme editing must not grant structural or operational access.
- Catalog placeholders and partial routes must be labeled honestly; a synthetic redesign seed is not a completed migration of a live form.
