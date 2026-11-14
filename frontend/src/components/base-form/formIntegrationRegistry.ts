import {operationalAcceptanceBlockers, type OperationalAcceptanceEvidence} from './operationalAcceptance.ts'
import type { MenuKey } from '../../navigation'
import { operationalFormCatalog } from './operationalFormCatalog.ts'
import type { DesignRelease } from './formDesignReleases'
import {formIntegrationTarget} from './formIntegrationTarget.ts'
import yarnAcceptance from '../../forms/yarn-operational-acceptance.json' with {type:'json'}

// Developer-owned deployment receipts, NEVER authored by the browser or a design export.
// Add an exact release/digest only after its operational route, permissions and persistence pass review.
export type FormIntegrationReceipt = { formId:string; releaseId:string; digest:string; route:MenuKey; acceptance?:OperationalAcceptanceEvidence; replacement?:{originalRoute:MenuKey;sourceBaselineDigest:string;rollbackArtifact:string} }
export const integratedDesignReleases:readonly FormIntegrationReceipt[] = [
 {formId:'form.new.8e77aae6-9477-41f9-b473-9d52511535a1',releaseId:'71bde8e8-51d2-4d93-b73a-a8bab7f687cc',digest:'52c3e388e158d790c8820b72d4685aa11c4767ae81e8e89958552d4548a840fc',route:'productGroups'},
 {formId:'form.redesign.f743b7d0-d9f9-49e0-a7a8-bb05a00ddde1',releaseId:'a348e3e7-ae39-4ff6-b701-7dc55c3201c5',digest:'8de207e06273ecab06f43cf12cbe3fe206272dca0ed6bf152165e1557a7c8bf5',route:'yarns',acceptance:yarnAcceptance as OperationalAcceptanceEvidence,replacement:{originalRoute:'yarns',sourceBaselineDigest:'26587c6244e196fadfef6b9d40518633f736942bbdc5e42d849f5441ae958c62',rollbackArtifact:'artifacts/yarn-operational-integration/rollback-manifest.json'}}
]
// Preserve only the already activated exact release; this is not acceptance evidence.
const preGateActivation = {formId:'form.new.8e77aae6-9477-41f9-b473-9d52511535a1',releaseId:'71bde8e8-51d2-4d93-b73a-a8bab7f687cc',digest:'52c3e388e158d790c8820b72d4685aa11c4767ae81e8e89958552d4548a840fc',route:'productGroups'} as const
export function integratedDesignRoute(release:DesignRelease,receipts=integratedDesignReleases):MenuKey|undefined{
 const receipt=receipts.find(item=>item.formId===release.formId&&item.releaseId===release.id&&item.digest===release.handoff?.digest)
 const target=formIntegrationTarget(release.snapshot.schema)
 if(target.kind==='blocked')return
 const previouslyActivated=receipt && receipt.formId===preGateActivation.formId && receipt.releaseId===preGateActivation.releaseId && receipt.digest===preGateActivation.digest && receipt.route===preGateActivation.route
 if(receipt && !previouslyActivated && operationalAcceptanceBlockers(release.snapshot.schema, release.id, receipt.digest, receipt.acceptance).length)return
 if(target.kind==='replacement'&&(!receipt?.replacement||receipt.route!==target.originalRoute||receipt.replacement.originalRoute!==target.originalRoute||!/^[a-f0-9]{64}$/.test(receipt.replacement.sourceBaselineDigest)||!receipt.replacement.rollbackArtifact.trim()))return
 return receipt&&operationalFormCatalog.some(item=>item.route===receipt.route&&item.availability==='operational')?receipt.route:undefined
}
