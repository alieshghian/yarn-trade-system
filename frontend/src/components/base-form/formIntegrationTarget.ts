import type { FormSchemaDraft } from './formSchema'
import { operationalSource, operationalFormCatalog } from './operationalFormCatalog.ts'

/** Labels never establish replacement identity. New forms cannot inherit a template's route. */
export function formIntegrationTarget(schema:FormSchemaDraft){
 const origin=schema.settings?.specific?.values?.integrationOrigin as {kind?:string;route?:string;sourceSchemaId?:string;navigationAddress?:string}|undefined
 const source=operationalSource(schema)
 if(origin?.kind==='new'||!origin&&!source)return {kind:'new' as const,destination:schema.menuPlacement?.menuId??null}
 if(!source)return {kind:'blocked' as const,reason:'Redesign source is missing'}
 const contract=operationalFormCatalog.find(item=>item.route===source.route&&item.availability==='operational')
 if(!contract||source.availability!=='operational'||!source.baseline?.id||!Array.isArray(source.sourceFiles)||!Array.isArray(source.api)||origin&&origin.kind!=='replacement'||origin?.route&&origin.route!==source.route||origin?.sourceSchemaId&&origin.sourceSchemaId!==source.baseline.id)return {kind:'blocked' as const,reason:'Original operational form identity is invalid or unavailable'}
 return {kind:'replacement' as const,originalRoute:source.route,sourceSchemaId:source.baseline.id,navigationAddress:origin?.navigationAddress??'navigation.route:'+source.route,sourceFiles:[...source.sourceFiles],api:[...source.api],keepOriginalUntilDeployment:true,rollbackRequired:true,preserveDataAndMenuIdentity:true}
}
