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
