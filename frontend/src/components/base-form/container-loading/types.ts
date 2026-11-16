export type PackagingType = 'CARTON' | 'SACK' | 'BALE' | 'PALLET'
/** Permutations of original length/width/height onto world X/Y/Z. */
export type Orientation = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL'
export type Dimensions = { length: number; width: number; height: number }
export type ContainerSpec = {
  id: '20GP' | '40GP' | '40HC'
  internal: Dimensions
  door: { width: number; height: number }
  permittedPayloadKg: number
  version: string
  operationalCapacityCBM?: Partial<Record<PackagingType, number>>
  visualGrid?: { palletSectionMm: number; cartonSackSectionMm: number }
}
export type PackageSpec = {
  type: PackagingType
  /** Outer bounding dimensions and gross weight, including pallet exactly once. */
  dimensions: Dimensions
  weightKg: number
  orientations: readonly Orientation[]
  stacking: { maxLayers: number; maxLoadAboveKg: number; allowedAboveTypes?: readonly PackagingType[] }
  pallet?: { dimensions: Dimensions; weightKg: number; includedInTotals: true }
}
export type CargoItem = {
  id: string
  invoiceRowId: string
  product: string
  supplier: string
  subgroupId?: string
  packaging: PackageSpec
  quantity: number
  /** Lower number means earlier. Ordered groups occupy disjoint X bands. */
  loadingOrder?: number
  unloadingOrder?: number
}
export type Placement = {
  packageId: string
  itemId: string
  invoiceRowId: string
  x: number; y: number; z: number
  orientation: Orientation
  dimensions: Dimensions
  weightKg: number
  supportedBy: string | null
}
export type UnplacedReason = 'OVERSIZED' | 'DOOR_CLEARANCE' | 'PAYLOAD_LIMIT' | 'STACKING_CONSTRAINT' | 'ORDER_CONSTRAINT' | 'NO_SPACE'
export type ValidationError = { code: string; path: string; message: string }
export type LoadingResult = {
  status: 'calculated' | 'invalid-input'
  specVersion: string | null
  placements: Placement[]
  unplaced: { packageId: string; itemId: string; reason: UnplacedReason }[]
  errors: ValidationError[]
  limitations: string[]
  geometricVolume: { containerCBM: number; requestedCBM: number; placedCBM: number }
  operationalUtilization: { status: 'configured' | 'unconfigured'; requestedRatio: number | null; placedRatio: number | null; missingTypes: PackagingType[] }
  remainingCapacity: { geometricCBM: number; payloadKg: number; operationalRatio: number | null }
}
