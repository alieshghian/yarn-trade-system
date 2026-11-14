/** Shared release lifecycle; a UI confirmation is never a fabricated deployment receipt. */
export const laboratoryIntegrationContract = {
  id:'laboratory.integration-lifecycle', version:6,
  scope:'all-laboratory-forms',
  approval:'capture-current-design-permissions-and-history; save-and-read-back; reject-concurrent-changes',
  saveActions:{placement:'adjacent-at-settings-bottom',save:'explicit-permissions-and-save; prepare-complete-json-and-verify-server-read-back',menuRegistration:'hidden-until-successful-save-in-current-session; exact-prepared-json-required',changed:'hide-registration-enable-save; pending-menu-red',reopen:'hide-registration-until-explicit-save',registration:'reuse-prepared-json; verify-before-yellow-menu; hide-after-registration; never-auto-activate'},
  snapshot:{capture:'rebuild-from-current-unified-document-history-at-save-and-export',identity:'reject-mismatched-form-schema-designer',manifest:'component-bindings-and-editor-geometry-source',runtime:'honor-saved-component-id-and-text-contact-mode; never-infer-from-field-caption',approval:'digest-and-read-back-cover-the-complete-current-export'},
  identity:['formId','releaseId','digest','menuPlacement'],
  menu:{parent:'formLaboratory',approvedColor:'yellow',changedColor:'red',metadata:'nonvisual',contextAction:'request-api-database-integration'},
  changes:'invalidate-approved-release-immediately; persist-invalidation; require-explicit-reapproval-even-after-undo',
  integration:{blockedWhileChanged:true,request:'exact-verified-json-and-owner-confirmation',activation:'only-after-real-source-api-database-integration-tests-and-deployment-receipt',missingExecutor:'retain-pending-status-never-mark-operational',acceptance:'operationalAcceptanceBlockers-must-be-empty-for-each-table-and-hierarchy; exact-release-digest-and-test-artifacts'},
  safeguards:['database-unique-constraints','atomic-code-allocation','idempotent-create','row-version-conflict','server-permissions','admin-depth-validation','backup-and-rollback','isolated-concurrency-tests'],
  preserve:['schema-ids','custom-layout','columns','permissions','original-releases','recovery-history'],
  newForms:'own-destination-no-original-route-dependency',
  redesign:{captureAtCreation:['original-route','source-schema-id','navigation-address','source-files','api-contracts','baseline'],contextAction:'request-replacement-of-that-original-only',blockUnverifiedOriginal:true,activation:'atomic-switch-of-existing-route-after-verified-deployment',originalData:'retain',originalImplementation:'rollback-only-after-replacement',rollbackRequired:true},
} as const
