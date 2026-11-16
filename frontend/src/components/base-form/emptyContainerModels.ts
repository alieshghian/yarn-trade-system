import source from './specs/container_types.stage1.json'

export type ContainerModelId = '40HC' | '40GP' | '20GP'
const files: Readonly<Record<ContainerModelId,string>> = Object.freeze({
  '40HC':'40HC_APPROVED_MASTER.png',
  '40GP':'40GP_GREEN_CANDIDATE.png',
  '20GP':'20GP_RED_CANDIDATE.png'
})

// Canonical measurements stay in the supplied JSON. Never infer them from pixels.
export const containerMetricScale=Object.freeze({unit:'meters',worldUnitsPerMeter:1})
export const emptyContainerModels=Object.freeze(source.containerTypes.map(model=>{
  const id=model.id as ContainerModelId
  return Object.freeze({
    id,label:model.label,color:model.color,filename:files[id],
    sourceAsset:model.asset,assetUrl:`/container-models/stage1/${files[id]}`,
    external:Object.freeze({...model.external}),
    internal:Object.freeze({...model.internal}),
    doorOpening:Object.freeze({...model.doorOpening}),
    nominalInternalCBM:model.nominalInternalCBM,
    approved:id==='40HC',locked:id==='40HC',
    approvalStatus:id==='40HC'?'approved':'pending-approval',
    assetConfiguration:'immutable'
  })
}))
