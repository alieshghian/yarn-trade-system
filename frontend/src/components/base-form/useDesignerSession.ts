import { useCallback, useReducer, useRef } from 'react'
import { attachDesignerDocument, createDesignerHistory, designerHistoryReducer, loadDesignerDraft, saveDesignerDraft, type DesignerDraft, type DesignerHistory, type DesignerHistoryAction } from './designer'
import type { FormSchemaDraft } from './formSchema'

export type DesignerSessionIdentity = { formId: string; fieldIds: readonly string[]; userId?: string }
type Options = DesignerSessionIdentity & { initialDraftLoader?: (identity: DesignerSessionIdentity) => DesignerDraft; initialHistoryLoader?: (identity: DesignerSessionIdentity) => DesignerHistory | undefined; documentSchema?: FormSchemaDraft; legacyStructureHistory?: { past: FormSchemaDraft[]; future: FormSchemaDraft[] } }
type Session = { history: ReturnType<typeof createDesignerHistory>; previewDraft: DesignerDraft | null; editingBaseline: DesignerDraft | null }
type PreviewUpdate = DesignerDraft | null | ((current: DesignerDraft | null) => DesignerDraft | null)

function browserStorage(): Storage | undefined {
  try { return window.localStorage } catch { return undefined }
}

/** One shared session controller with isolated history, preview and baseline per form/user. */
export function useDesignerSession(options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const load = (identity: Options) => identity.initialDraftLoader
    ? identity.initialDraftLoader(identity)
    : loadDesignerDraft(browserStorage(), identity.userId, identity.formId, identity.fieldIds)
  const keyOf = (identity: Options) => JSON.stringify([identity.userId ?? null, identity.formId])
  const initialKey = keyOf(options)
  const sessionsRef = useRef(new Map<string, Session>())
  if (!sessionsRef.current.has(initialKey)) sessionsRef.current.set(initialKey, { history: options.initialHistoryLoader?.(options) ?? createDesignerHistory(load(options)), previewDraft: null, editingBaseline: null })
  const activeKeyRef = useRef(initialKey)
  const activeSession = sessionsRef.current.get(initialKey)!
  const historyRef = useRef(activeSession.history)
  const previewDraftRef = useRef(activeSession.previewDraft)
  const editingBaseline = useRef<DesignerDraft | null>(activeSession.editingBaseline)
  const [, forceRender] = useReducer((revision: number) => revision + 1, 0)

  if (activeKeyRef.current !== initialKey) {
    const previous = sessionsRef.current.get(activeKeyRef.current)
    if (previous) {
      previous.history = historyRef.current
      previous.previewDraft = null
      previous.editingBaseline = editingBaseline.current
    }
    let next = sessionsRef.current.get(initialKey)
    if (!next) {
      next = { history: options.initialHistoryLoader?.(options) ?? createDesignerHistory(load(options)), previewDraft: null, editingBaseline: null }
      sessionsRef.current.set(initialKey, next)
    }
    activeKeyRef.current = initialKey
    historyRef.current = next.history
    previewDraftRef.current = null
    next.previewDraft = null
    editingBaseline.current = next.editingBaseline
  }
  const current = sessionsRef.current.get(initialKey)!
  if (options.documentSchema && !historyRef.current.document) historyRef.current = attachDesignerDocument(historyRef.current, options.documentSchema, options.legacyStructureHistory)
  current.history = historyRef.current
  current.previewDraft = previewDraftRef.current
  current.editingBaseline = editingBaseline.current

  // Pointer/color callbacks may dispatch several history actions before React renders.
  const dispatchHistory = useCallback((action: DesignerHistoryAction) => {
    const key = activeKeyRef.current
    const session = sessionsRef.current.get(key)
    if (!session) return
    const next = designerHistoryReducer(historyRef.current, action)
    historyRef.current = next
    session.history = next
    forceRender()
  }, [])
  const setPreviewDraft = useCallback((update: PreviewUpdate) => {
    const next = typeof update === 'function' ? update(previewDraftRef.current) : update
    previewDraftRef.current = next
    const session = sessionsRef.current.get(activeKeyRef.current)
    if (session) session.previewDraft = next
    forceRender()
  }, [])
  const save = () => {
    const identity = optionsRef.current
    return saveDesignerDraft(browserStorage(), identity.userId, identity.formId, historyRef.current.present, identity.fieldIds)
  }
  const undo = () => { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'undo' }) }
  const redo = () => { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'redo' }) }
  const history = historyRef.current
  const restoreHistory = (restored: DesignerHistory) => {
    if (restored.present.formId !== optionsRef.current.formId) return
    historyRef.current = restored
    sessionsRef.current.get(activeKeyRef.current)!.history = restored
    previewDraftRef.current = null
    forceRender()
  }
  const previewDraft = previewDraftRef.current
  return { history, historyRef, dispatchHistory, previewDraft, setPreviewDraft, visibleDraft: previewDraft ?? history.present, editingBaseline, save, undo, redo, restoreHistory }
}
