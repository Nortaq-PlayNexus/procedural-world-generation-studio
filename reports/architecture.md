# Architecture — ARK Map Studio: Ultimate

## Boundary contract

```
src/lib/                    pure engine, no DOM or Three.js imports
  noise.ts                  seeded PRNG + noise mathematics
  worldgen.ts               geological/hydrological/climate/ecology pipeline
  analysis.ts               measured metrics + weighted quality
  exporters.ts              binary/PNG/JSON encoding and validation
  selftest.ts               live assertions against the real engine
  presets.ts                deterministic WorldConfig presets
src/components/             presentation and rendering only
  TerrainViewport.tsx       Three.js scene, geometry and raycast editing
  MapCanvas.tsx             cartographic overlay renderer
  *Panel / *Dialog         UI composition
src/App.tsx                 orchestration, persistence, undo, shortcuts
```

The generation engine can be executed headlessly (`scripts/verify.ts`) and has no renderer dependency. The renderer consumes only `WorldData` arrays.

## Pipeline

1. **Field allocation** — `n²` Float32 grid.
2. **Tectonic composition** — ellipsoidal/deformed landmass templates, cellular plate fields, plate sutures, orogenic belts, anisotropic ridged mountains, volcanic hotspots, valleys and micro-relief.
3. **Hydraulic incision** — priority-flood fill → D8 steepest descent → flow accumulation → stream-power incision with downstream deposition, 2–3 passes.
4. **Thermal relaxation** — talus-limited diffusion, 1–5 passes.
5. **Hydrology** — final fill and routing; depression extraction with minimum area/depth and a freshwater-area budget; watershed and terminal target propagation in fill order.
6. **Climate** — base temperature with abstract latitude gradient (−24 °C span) and 6.2 °C/km lapse rate; moisture from westerly/easterly advection, orographic rainout, lee drying, coastal fetch, inland aridity and riparian bonus.
7. **Biomes** — deterministic thresholds over temperature, moisture, elevation, slope, lake and volcanism; majority smoothing pass.
8. **Objects** — deterministic streams; tree/rock/landmark rules consider biome, slope, water and spacing. Landmarks enforce a 13×13 exclusion footprint.
9. **Analysis** — direct counts/moments over the field; transparent quality breakdown.
10. **Exports** — linear normalisation, NW origin, no vertical flip, from-scratch PNG and RAW encoders plus validators.

## Data contracts

- `heights[]`: metres, 0 = sea-level datum, clamp [−1600, 3050].
- `slope[]`: rise/run, central finite differences, cell spacing `widthKm·1000/(n−1)`.
- `flowDirection[]`: 0–7 clockwise from +X; −1 for undefined.
- `drainageTarget[]`: 0 unknown, 1 ocean, 2 previous lake sink (legacy), 3 closed basin. Current routing inherits lake spill targets downstream.
- `biome[]`: indices into `BIOMES`; ocean included.
- `watershed[]`: synthetic catchment labels.

## Rendering

Three.js WebGLRenderer, ACES tone mapping, PCF soft shadows at High/Ultra, procedural canvas terrain texture with temperature-based nival shading and land-only ecotone smoothing, custom sky shader, exponential fog, sprite clouds and instanced objects. Terrain mesh resolution is quality-scaled (112/176/300/440), vertical display exaggeration is fixed and documented.

## Persistence

Projects and autosave use browser local storage. Project documents contain the full configuration, seed and measured analysis snapshot. Geometry is rebuilt deterministically. `.arkproj` files can be imported/exported; malformed files are ignored without mutating state.

## ARK boundary

No cooked ARK map is produced. `arkMeta` documents dimension, coordinate origin, endianness, elevation bounds, scale and explicit engine-side authoring requirements.

## Editor asset pipeline (Cycle 4)

`src/lib/assets.ts` defines the placement catalog and its environmental limits. The viewport raycasts the terrain mesh and emits normalised `(u,v)` coordinates. `App.editTerrain` validates shoreline, slope and spacing, stamps a deterministic positional hash for scale/rotation, and presses an `EditSnapshot { heights, objects }` onto the undo stack at pointer release. `refreshWorld` is only used for terrain brushes; asset edits recompute metrics directly and leave hydrology untouched.

Rendering derives a band-limited normal map and a roughness map from measured elevation, slope, moisture, water masks and temperature. These are `DataTexture` objects regenerated with the terrain build and disposed on rebuild. Normal detail is intentionally capped to avoid double-lighting macro slope — this behaviour was visually regressed once and corrected.
