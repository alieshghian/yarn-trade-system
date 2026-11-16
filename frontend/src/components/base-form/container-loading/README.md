# Stage 2A — offline loading engine

No UI, graphics, network, database or invoice integration. Stage 1 assets and specifications are unchanged.

## Stage 2B integration

1. Call `createContainerSpec(type, verifiedPayloadKg, specVersion)` from `specs.ts`. It converts the existing Stage 1 JSON meters to integer millimeters; missing payload is an error, never unlimited capacity. Persist the full resolved specification with its version when an integration is approved.
2. Build `CargoItem[]` using stable item/invoice-row IDs. Dimensions are outer package bounds in millimeters; weights are gross kilograms. PALLET bounds and weight **already include its own pallet once**, with the pallet breakdown marked `includedInTotals: true`. Cartons/sacks/bales must not contain pallet metadata. No guessed package dimensions.
3. Call `calculateLoading(spec, items)`. For `invalid-input`, show structured `errors` and do not render a calculated plan. Validation rejects the whole request, including more than 500 physical packages; no partial batch is silently accepted.
4. Render returned `placements` as-is: origin is the **closed rear floor**, X toward the doors, Y across width, Z up. Resolve type/product/supplier/subgroup by `itemId`; `packageId` is the stable JSON tuple `[itemId, oneBasedPackageIndex]`. Do not stretch geometry to fill a bitmap. A Stage 2B geometric renderer requires separate approval.
5. Show every `unplaced` package and its reason. `NO_SPACE` means this heuristic found no remaining candidate, not a proof of infeasibility. Do not silently drop or redistribute these packages.

First-fit tries deterministic corner positions ordered X, then Z, then Y, using permitted orientations in caller order. Cargo is sorted by ascending supplied loading order, descending supplied unloading order, then binary stable ID. Ordered groups occupy disjoint length bands: earlier loading goes deeper, earlier unloading goes nearer the doors. Conflicting orders may leave packages unplaced rather than violate the requested order.

Elevated packages need full footprint support from one package. Every supporting ancestor enforces layer count and cumulative descendant weight; immediate support also enforces allowed package categories. No bridging, tipping through doors, compression, maneuver path, axle loading, friction, securing or unloading simulation. This is an advisory planning algorithm, not loading/safety certification or an optimal bin-packing solver.

Operational ratios use **outer package CBM**, requested and actually placed separately. Ratios are fractions (1 = 100%); mixed cargo sums CBM/category capacity. Missing category capacity gives `unconfigured` and null ratios. Only 40HC carton/sack/pallet capacities come from the existing JSON. BALE, 20GP and 40GP have no invented capacities. Remaining geometric CBM is unused bounding volume, not a guarantee of usable free-space shape. Remaining operational ratio is based on placed cargo and may be negative. Optional 1200/400 mm visual reference bands never affect physical dimensions or candidate points.

## Focused checks

From the repository root:

```text
node --test frontend/src/components/base-form/container-loading/engine.test.mjs
frontend/node_modules/.bin/tsc --noEmit -p frontend/src/components/base-form/container-loading/tsconfig.json
```

`example.json` is a reproducible synthetic input/result pair with one placed and one oversized package. Its payload is a test value, not an equipment limit.
