import source from '../specs/container_types.stage1.json' with { type: 'json' }
import type { ContainerSpec, ValidationError } from './types.ts'

/** Payload is deliberately supplied by the caller: Stage 1 does not define it. */
export function createContainerSpec(id: string, permittedPayloadKg: number, version = 'stage1-v1'):
  { spec: ContainerSpec | null; errors: ValidationError[] } {
  const model = source.containerTypes.find(item => item.id === id)
  if (!model || !Number.isFinite(permittedPayloadKg) || permittedPayloadKg <= 0 || typeof version !== 'string' || !version.trim()) {
    return { spec: null, errors: [{ code: 'INVALID_CONTAINER_REFERENCE', path: 'container', message: 'Supply a registered type, positive verified payload and spec version.' }] }
  }
  const metric = (value: number) => Math.round(value * 1000)
  const reference = 'displayLoadCBM' in model ? model.displayLoadCBM : undefined
  return { errors: [], spec: {
    id: model.id as ContainerSpec['id'], version, permittedPayloadKg,
    internal: { length: metric(model.internal.length), width: metric(model.internal.width), height: metric(model.internal.height) },
    door: { width: metric(model.doorOpening.width), height: metric(model.doorOpening.height) },
    ...(reference ? { operationalCapacityCBM: { PALLET: reference.pallet, CARTON: reference.carton, SACK: reference.sack }, visualGrid: { palletSectionMm: 1200, cartonSackSectionMm: 400 } } : {})
  } }
}
