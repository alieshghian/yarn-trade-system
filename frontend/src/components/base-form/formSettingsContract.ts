export const laboratorySettingsContract = {
  version:2, entry:'shared-header-button', alwaysAvailable:true,
  documentHeader:{renderer:'FormDocumentHeader',title:'schema.title',settingsAt:'inline-end',visibleInDesignAndPreview:true,independentOfFieldCanvas:true,compositeMayOwnHeader:true},
  personal:{renderer:'OperationalFormFrame',scope:'user-and-form',permissions:'document-customization',saveOrDiscard:true},
  administrator:{renderer:'FormDocumentSettings',scope:'form-definition',hierarchy:{minimumSubgroups:0,maximumSubgroups:4,retainInactiveNodes:true}},
} as const
