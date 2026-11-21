export function GridToolbarIcon({ kind }: { kind: 'columns' | 'expand' | 'restore' | 'excel' | 'reset' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {kind === 'columns' && <><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16m6-16v16"/></>}
    {kind === 'expand' && <path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>}
    {kind === 'restore' && <path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5"/>}
    {kind === 'excel' && <><path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5M8 12l4 6m0-6-4 6m7-6h1m-1 3h1"/></>}
    {kind === 'reset' && <path d="M3 5h18l-7 8v2m-4 5v-7L3 5m5 15 6-6m0 6-6-6" />}
  </svg>
}
