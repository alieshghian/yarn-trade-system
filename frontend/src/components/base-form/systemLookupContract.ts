/** Serializable Laboratory contract; registry adapters supply the actual source implementation. */
export const systemLookupContract = {
  id: 'laboratory.system-lookup', version: 10, componentId: 'base-form.system-lookup',
  source: 'field.settings.lookupSettings.sourceId', value: 'stable-source-record-id',
  display: ['code', 'name'], freeTextPersistence: false, blankSelection: 'null-no-association',
  presentation: 'single-standard-height-field',
  productGroupDisplay: {closed:'root-name-only-no-code',hover:'full-selected-ancestry',search:'full-code-and-path',value:'unchanged-selected-node-id'},
  create: { shortcut: 'Insert', trigger: 'keydown-or-unhandled-keyup-without-modifiers-no-repeat; never-run-twice-for-one-press', form: 'registered-source-form', mode: 'create', action: 'save-review-select', keepSourceFormOpenAfterSave: true, selectInViewMode: true, selectShortcut: 'Enter', mountDialogAfterSourceReady: true, preserveSourceEditing: true, sourceGeometry: 'identical-inline-and-dialog; no-inherited-column-height', physicalInsertFallback: true, preloadOnBrowse: true, saveShortcut: 'F3', shortcutOwner: 'topmost-modal-form', singleSubmission: true, preserveParentDraft: true, parentSaveOnReturn: false, nextFieldFocus: true, cancelPreservesSelection: true },
  search: { serverPaged: true, fields: ['code', 'name'], sourcePermissionsRequired: true, firstResultActive: true, arrowNavigation: 'ArrowUp/ArrowDown', select: 'Enter', keepTypingFocus: true, stableViewportDuringSearch: true, staleResponses: 'abort-and-ignore; pending-results-not-selectable', visibleCreateAction: 'Insert' },
  sources: {
    brands: { route: 'brands', formId: 'form.redesign.805deb77-bec5-41fa-af97-77b7007ca3a4', codeField: 'brandCode', nameField: 'brandName', ownership: 'one-person-per-brand', unassignedAllowed: true },
    persons: { route: 'persons', codeField: 'personCode', nameField: 'displayName' },
  },
} as const
