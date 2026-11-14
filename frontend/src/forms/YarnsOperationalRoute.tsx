import LegacyYarnsPage from '../YarnsPage'
import ApprovedYarnsPage from './ApprovedYarnsPage'
import {approvedYarnDefinition as approved} from './approvedYarnDesign'
import {integratedDesignReleases,integratedDesignRoute,type FormIntegrationReceipt} from '../components/base-form/formIntegrationRegistry'
import type {DesignRelease} from '../components/base-form/formDesignReleases'
import type {Language} from '../i18n'

const release:DesignRelease={
 id:approved.integrationHandoff.releaseId,formId:approved.form.id,
 createdAt:approved.integrationHandoff.permissionsConfirmedAt,status:'awaiting-integration',change:'fundamental',
 snapshot:approved.form as unknown as DesignRelease['snapshot'],requirements:[],
 handoff:{digest:approved.sourceDigest,backupId:'3b861a4f1c804d0e8e94154609f6873f',jsonAddress:approved.fullJson,permissionsConfirmedAt:approved.integrationHandoff.permissionsConfirmedAt}
}
/** Staging the adapter does not publish it: only the reviewed exact deployment receipt can switch this route. */
export function approvedYarnRouteActive(receipts:readonly FormIntegrationReceipt[]=integratedDesignReleases){
 const receipt=receipts.find(item=>item.formId===release.formId&&item.releaseId===release.id&&item.digest===approved.sourceDigest)
 return receipt?.replacement?.sourceBaselineDigest==='26587c6244e196fadfef6b9d40518633f736942bbdc5e42d849f5441ae958c62' && integratedDesignRoute(release,receipts)==='yarns'
}
export default function YarnsOperationalRoute({language,demoMode=false,onClose}:{language:Language;demoMode?:boolean;onClose?:()=>void}){
 return !demoMode&&approvedYarnRouteActive()?<ApprovedYarnsPage language={language} onClose={onClose}/>:<LegacyYarnsPage language={language} demoMode={demoMode}/>
}
