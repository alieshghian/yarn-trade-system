import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createDesignerHistory, designerHistoryReducer, loadDesignerDraft, saveDesignerDraft, type DesignerDraft, type DesignerHistoryAction } from './designer'

export type DesignerSessionIdentity = { formId: string; fieldIds: readonly string[]; userId?: string }
type Options = DesignerSessionIdentity & { initialDraftLoader?: (identity: DesignerSessionIdentity) => DesignerDraft }

function browserStorage(): Storage | undefined {
  try { return window.localStorage } catch { return undefined }
}

/** A document session only; selection, geometry and form behavior belong to its host. */
export function useDesignerSession(options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const load = () => {
    const current = optionsRef.current
    return current.initialDraftLoader
      ? current.initialDraftLoader(current)
      : loadDesignerDraft(browserStorage(), current.userId, current.formId, current.fieldIds)
  }
  const [history, reactDispatch] = useReducer(designerHistoryReducer, undefined, () => createDesignerHistory(load()))
  const historyRef = useRef(history)
  historyRef.current = history
  const [previewDraft, setPreviewDraft] = useState<DesignerDraft | null>(null)
  const editingBaseline = useRef<DesignerDraft | null>(null)
  // Pointer/color callbacks can dispatch several actions before React renders again.
  const dispatchHistory = useCallback((action: DesignerHistoryAction) => {
    historyRef.current = designerHistoryReducer(historyRef.current, action)
    reactDispatch(action)
  }, [])
  const fieldIdsKey = JSON.stringify(options.fieldIds)
  useEffect(() => {
    dispatchHistory({ type: 'replace', draft: load() })
    editingBaseline.current = null
    setPreviewDraft(null)
    // Loader identity is deliberately excluded: inline adapters must not reload a document.
    // Reload only when the document/user or its valid field collection changes.
  }, [options.formId, options.userId, fieldIdsKey, dispatchHistory])

  const save = () => {
    const current = optionsRef.current
    return saveDesignerDraft(browserStorage(), current.userId, current.formId, historyRef.current.present, current.fieldIds)
  }
  const undo = () => { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'undo' }) }
  const redo = () => { dispatchHistory({ type: 'commitTransaction' }); dispatchHistory({ type: 'redo' }) }
  return { history, historyRef, dispatchHistory, previewDraft, setPreviewDraft, visibleDraft: previewDraft ?? history.present, editingBaseline, save, undo, redo }
}
