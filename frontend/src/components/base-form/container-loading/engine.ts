import type { CargoItem, ContainerSpec, Dimensions, LoadingResult, Orientation, PackagingType, Placement, UnplacedReason, ValidationError } from './types.ts'

const orientations: Record<Orientation, readonly (keyof Dimensions)[]> = {
  LWH: ['length','width','height'], WLH: ['width','length','height'], LHW: ['length','height','width'],
  HLW: ['height','length','width'], WHL: ['width','height','length'], HWL: ['height','width','length']
}
const categories: PackagingType[] = ['CARTON','SACK','BALE','PALLET']
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const dimensions = (value: unknown): value is Dimensions => object(value) && ['length','width','height'].every(key => positive(value[key]) && Number.isSafeInteger(value[key]))
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const volume = (d: Dimensions) => d.length * d.width * d.height / 1e9
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const epsilon = 1e-9

function validate(container: unknown, cargo: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  const add = (path: string, message: string) => errors.push({ code: 'INVALID_INPUT', path, message })
  if (!object(container) || !['20GP','40GP','40HC'].includes(String(container.id)) || !text(container.version) || !dimensions(container.internal) || !object(container.door) || !positive(container.door.width) || !Number.isSafeInteger(container.door.width) || !positive(container.door.height) || !Number.isSafeInteger(container.door.height) || !positive(container.permittedPayloadKg)) add('container','Registered type, version, positive integer millimeters and verified positive payload are required.')
  if (object(container) && container.operationalCapacityCBM !== undefined && (!object(container.operationalCapacityCBM) || Object.entries(container.operationalCapacityCBM).some(([key,value]) => !categories.includes(key as PackagingType) || !positive(value)))) add('container.operationalCapacityCBM','Capacities must be positive CBM keyed by packaging category.')
  if (!Array.isArray(cargo)) { add('cargo','Expected an array.'); return errors }
  const ids = new Set<string>(); let total = 0
  cargo.forEach((item, index) => {
    const path = `cargo[${index}]`
    if (!object(item)) { add(path,'Expected a cargo item.'); return }
    if (!text(item.id) || ids.has(String(item.id))) add(path+'.id','Stable, nonempty, unique item ID is required.')
    ids.add(String(item.id))
    if (!text(item.invoiceRowId) || !text(item.product) || !text(item.supplier)) add(path,'Invoice row, product and supplier are required.')
    if (!Number.isSafeInteger(item.quantity) || !positive(item.quantity)) add(path+'.quantity','Quantity must be a positive safe integer.')
    else total += item.quantity
    for (const key of ['loadingOrder','unloadingOrder']) if (item[key] !== undefined && (!nonnegative(item[key]) || !Number.isSafeInteger(item[key]))) add(path+'.'+key,'Order must be a nonnegative safe integer.')
    const p = item.packaging
    if (!object(p)) { add(path+'.packaging','Package specification is required.'); return }
    if (!categories.includes(p.type as PackagingType) || !dimensions(p.dimensions) || !positive(p.weightKg)) add(path+'.packaging','Valid category, positive integer bounding dimensions and gross weight are required.')
    if (!Array.isArray(p.orientations) || !p.orientations.length || p.orientations.some(o => typeof o !== 'string' || !Object.hasOwn(orientations,o) || (p.type === 'PALLET' && !['LWH','WLH'].includes(o)))) add(path+'.packaging.orientations','Explicit valid orientations are required; pallets must stay upright.')
    const s = p.stacking
    if (!object(s) || !positive(s.maxLayers) || !Number.isSafeInteger(s.maxLayers) || !nonnegative(s.maxLoadAboveKg) || (s.allowedAboveTypes !== undefined && (!Array.isArray(s.allowedAboveTypes) || s.allowedAboveTypes.some(t => !categories.includes(t as PackagingType))))) add(path+'.packaging.stacking','Explicit positive layer limit and nonnegative load-above limit are required.')
    if (p.type === 'PALLET') {
      const pallet = p.pallet
      if (!object(pallet) || pallet.includedInTotals !== true || !dimensions(pallet.dimensions) || !positive(pallet.weightKg) || !dimensions(p.dimensions) || !positive(p.weightKg) || pallet.weightKg > p.weightKg || (dimensions(pallet.dimensions) && dimensions(p.dimensions) && (pallet.dimensions.length > p.dimensions.length || pallet.dimensions.width > p.dimensions.width || pallet.dimensions.height > p.dimensions.height))) add(path+'.packaging.pallet','Own pallet dimensions and weight must be included exactly once in package totals.')
    } else if (p.pallet !== undefined) add(path+'.packaging.pallet','Only PALLET cargo has a wooden pallet.')
  })
  if (total > 500) errors.push({ code: 'REQUEST_TOO_LARGE', path: 'cargo', message: 'This bounded first-fit engine accepts at most 500 physical packages per request; no partial calculation was performed.' })
  return errors
}

/** Conservative first-fit corner packing. No remote calls, random values or mutations. */
export function calculateLoading(container: ContainerSpec, cargo: readonly CargoItem[]): LoadingResult {
  const errors = validate(container,cargo)
  const result: LoadingResult = {
    status: errors.length ? 'invalid-input' : 'calculated', specVersion: typeof container?.version === 'string' ? container.version : null,
    placements: [], unplaced: [], errors,
    limitations: ['First-fit is heuristic: unplaced does not prove that no alternative packing exists.', 'Elevated packages require full footprint support by one package; bridging, tilt-through-door and dynamic insertion paths are not modeled.', 'Ordered groups use conservative disjoint X bands; no unloading maneuver simulation.'],
    geometricVolume: { containerCBM: 0, requestedCBM: 0, placedCBM: 0 },
    operationalUtilization: { status: 'unconfigured', requestedRatio: null, placedRatio: null, missingTypes: [] },
    remainingCapacity: { geometricCBM: 0, payloadKg: 0, operationalRatio: null }
  }
  if (errors.length) return result
  type Packed = { placement: Placement; item: CargoItem; loadAboveKg: number }
  const packed: Packed[] = []
  const points = new Map<string,{x:number;y:number;z:number}>()
  const addPoint = (x:number,y:number,z:number) => { if (x < container.internal.length && y < container.internal.width && z < container.internal.height) points.set(`${x},${y},${z}`,{x,y,z}) }
  addPoint(0,0,0)
  const sorted = [...cargo].sort((a,b) => (a.loadingOrder ?? Number.MAX_SAFE_INTEGER) - (b.loadingOrder ?? Number.MAX_SAFE_INTEGER) || (b.unloadingOrder ?? -1) - (a.unloadingOrder ?? -1) || compare(a.id,b.id))
  let weight = 0
  const inside = (p: Placement) => p.x+p.dimensions.length <= container.internal.length && p.y+p.dimensions.width <= container.internal.width && p.z+p.dimensions.height <= container.internal.height
  const collides = (a: Placement,b: Placement) => a.x < b.x+b.dimensions.length && b.x < a.x+a.dimensions.length && a.y < b.y+b.dimensions.width && b.y < a.y+a.dimensions.width && a.z < b.z+b.dimensions.height && b.z < a.z+a.dimensions.height
  const violatesOrder = (a: CargoItem, p: Placement, b: Packed) => {
    const before = (first: Placement,second: Placement) => first.x+first.dimensions.length <= second.x
    return (a.loadingOrder !== undefined && b.item.loadingOrder !== undefined && ((a.loadingOrder < b.item.loadingOrder && !before(p,b.placement)) || (a.loadingOrder > b.item.loadingOrder && !before(b.placement,p)))) ||
      (a.unloadingOrder !== undefined && b.item.unloadingOrder !== undefined && ((a.unloadingOrder < b.item.unloadingOrder && !before(b.placement,p)) || (a.unloadingOrder > b.item.unloadingOrder && !before(p,b.placement))))
  }
  for (const item of sorted) {
    const p = item.packaging
    const variants = [...new Set(p.orientations)].map(orientation => {
      const axes = orientations[orientation]
      return { orientation, dimensions: { length:p.dimensions[axes[0]],width:p.dimensions[axes[1]],height:p.dimensions[axes[2]] } }
    })
    const fitting = variants.filter(v => v.dimensions.length <= container.internal.length && v.dimensions.width <= container.internal.width && v.dimensions.height <= container.internal.height)
    const doorFit = fitting.filter(v => v.dimensions.width <= container.door.width && v.dimensions.height <= container.door.height)
    for (let index=0;index<item.quantity;index++) {
      const packageId = JSON.stringify([item.id,index+1])
      let reason: UnplacedReason | null = !fitting.length ? 'OVERSIZED' : !doorFit.length ? 'DOOR_CLEARANCE' : weight+p.weightKg > container.permittedPayloadKg+epsilon ? 'PAYLOAD_LIMIT' : null
      let chosen: Placement | null = null; let chosenChain: Packed[] = []
      let blockedByStack = false, blockedByOrder = false
      if (!reason) search: for (const point of [...points.values()].sort((a,b) => a.x-b.x || a.z-b.z || a.y-b.y)) {
        for (const variant of doorFit) {
          const placement: Placement = { packageId,itemId:item.id,invoiceRowId:item.invoiceRowId,...point,...variant,weightKg:p.weightKg,supportedBy:null }
          if (!inside(placement) || packed.some(other => collides(placement,other.placement))) continue
          if (packed.some(other => violatesOrder(item,placement,other))) { blockedByOrder=true; continue }
          const chain: Packed[] = []
          if (point.z > 0) {
            let support = packed.find(other => {
              const b=other.placement,d=b.dimensions
              return b.z+d.height===point.z && b.x<=point.x && b.y<=point.y && b.x+d.length>=point.x+variant.dimensions.length && b.y+d.width>=point.y+variant.dimensions.width
            })
            if (!support) { blockedByStack=true; continue }
            placement.supportedBy=support.placement.packageId
            while (support) { chain.push(support); const id: string | null=support.placement.supportedBy; support=id ? packed.find(other=>other.placement.packageId===id) : undefined }
            if (chain.some((base,depth) => base.item.packaging.stacking.maxLayers < depth+2 || base.loadAboveKg+p.weightKg > base.item.packaging.stacking.maxLoadAboveKg+epsilon || (depth===0 && base.item.packaging.stacking.allowedAboveTypes && !base.item.packaging.stacking.allowedAboveTypes.includes(p.type)))) { blockedByStack=true; continue }
          }
          chosen=placement; chosenChain=chain; break search
        }
      }
      if (!chosen) {
        reason ??= blockedByOrder ? 'ORDER_CONSTRAINT' : blockedByStack ? 'STACKING_CONSTRAINT' : 'NO_SPACE'
        result.unplaced.push({packageId,itemId:item.id,reason}); continue
      }
      chosenChain.forEach(base=>{base.loadAboveKg+=p.weightKg})
      packed.push({placement:chosen,item,loadAboveKg:0}); result.placements.push(chosen); weight+=p.weightKg
      points.delete(`${chosen.x},${chosen.y},${chosen.z}`)
      addPoint(chosen.x+chosen.dimensions.length,chosen.y,chosen.z)
      addPoint(chosen.x,chosen.y+chosen.dimensions.width,chosen.z)
      addPoint(chosen.x,chosen.y,chosen.z+chosen.dimensions.height)
    }
  }
  const requestedCBM=cargo.reduce((sum,item)=>sum+volume(item.packaging.dimensions)*item.quantity,0)
  const placedCBM=packed.reduce((sum,item)=>sum+volume(item.placement.dimensions),0)
  const containerCBM=volume(container.internal)
  const missingTypes=categories.filter(type=>cargo.some(item=>item.packaging.type===type)&&!container.operationalCapacityCBM?.[type])
  const requestedRatio=missingTypes.length ? null : cargo.reduce((sum,item)=>sum+volume(item.packaging.dimensions)*item.quantity/container.operationalCapacityCBM![item.packaging.type]!,0)
  const placedRatio=missingTypes.length ? null : packed.reduce((sum,item)=>sum+volume(item.placement.dimensions)/container.operationalCapacityCBM![item.item.packaging.type]!,0)
  result.geometricVolume={containerCBM,requestedCBM,placedCBM}
  result.operationalUtilization={status:missingTypes.length?'unconfigured':'configured',requestedRatio,placedRatio,missingTypes}
  result.remainingCapacity={geometricCBM:Math.max(0,containerCBM-placedCBM),payloadKg:Math.max(0,container.permittedPayloadKg-weight),operationalRatio:placedRatio===null?null:1-placedRatio}
  return result
}
