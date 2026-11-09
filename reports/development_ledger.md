# ARK Map Studio: Ultimate — Development Ledger

Application root: `ark-map-studio-ultimate/` (mounted as the available Vite workspace root).
The original application, prior baselines, `ark-map-studio-next/` and existing reports were not present in this workspace and were therefore not modified.

## Cycle 1 — Foundation and engine reconstruction

**Objective:** independent, deterministic generation core with no renderer coupling.

- Implemented seeded Mulberry32, Perlin, simplex, FBM, ridged multifractal, domain warp and cellular noise (`src/lib/noise.ts`).
- Implemented tectonic/landmass composition, stream-power incision, thermal relaxation, priority-flood fill, D8 routing, lake extraction, climate, biome classification and object placement (`src/lib/worldgen.ts`).
- Implemented measured analysis and transparent weighted quality (`src/lib/analysis.ts`).
- Implemented export encoding from scratch: 16-bit PNG, RAW Uint16LE, palette PNGs, splat, resource, spawn, config, ARK integration metadata and `.arkproj` (`src/lib/exporters.ts`).
- Implemented the Three.js viewport, terrain/water/river instancing, camera modes and raycast brushes.
- Build: `vite build` passed. TypeScript strict check passed.

**Defects found during the first headless run**

1. **CATASTROPHIC — all worlds submerged.** A seed-derived large offset was added to the normalized tectonic coordinate pair, pushing `(wx, wy)` far outside `[-1,1]` and collapsing the land mask. Fixed by keeping noise offsets small and confining warping to a bounded normalized displacement. Verified: land coverage moved from 0% to 45–51%.
2. **Perlin exceeded the documented `[-1,1]` bound** (observed −1.147…1.202). Root cause: an unjustified `×1.4142` scale. Removed; new measured range −0.811…0.850.
3. **Biome shares exceeded 100%** because ocean was counted as a land biome; individual shares reached 113%. Fixed by counting biome classes only on land.
4. **Endorheic drainage dominated** (35–43% ocean-connected) because lakes were treated as terminal sinks. Lakes now inherit their downstream spill target. Verified 100% ocean-connected terminal drainage on the reference field.
5. **Priority-flood lakes covered 11.5% of the world.** Persistence is now area/depth gated with a hard freshwater-area budget (1.2% at the reference seed).
6. **Export validator overflowed the call stack** with `Math.max(...typedArray)` and excluded empty keys. Replaced with iterative scans; the validator now reports every selected key.
7. **Seed 577 visual**: the initial preview showed a square-clipped landmass and excessive nival cover. Replaced max-of-axes shape templates with ellipsoidal/deformed coasts; snow is now driven by measured temperature.
8. **Uniform wedge shading / planar appearance** in the inspected preview traced to per-cell categorical colouring, not height spikes. Measured Laplacian spike count was 0. Added ecotone blending and temperature-based snow shading.

**Visual verification**

- Deterministic preview maps rendered to `reports/visual/seed-577-preview.png`, `reports/visual/seed-42-preview.png` and biome maps.
- These were inspected directly. Findings: organic island silhouette, interior mountain provinces, interior lakes, coastal forests, arid interior sectors and discontinuous high snow. No vertical spikes or missing geometry were visible.
- Automated screenshot comparison is **not** implemented. No claim of automated visual regression pass is made.

## Cycle 2 — Tuning, validation and interface completion

**Objective:** restore relief and biome diversity, verify exports and finish the professional interface.

- Erosion coefficient reduced after relief planation was observed; orogeny sharpened. Peak elevation range is now 805–922 m at 320², slope p95 below the studio’s cliff warning on 4/5 seeds.
- Climate rebuilt with advected moisture, inland aridity and lee drying. Biome entropy improved from 0.68 to ~1.58–1.73 and land coverage is ~9–10 classes.
- Added responsive builder/inspector drawers and full dialogs for presets, export, analysis, validation, projects/history, processes and field guide.
- Live validation suite: **14/14 assertions pass** in ~202 ms (Node).

## Cycle 3 — Worker isolation, editable persistence, real browser QA

**Objective:** remove main-thread generation stalls, preserve hand-edited worlds, and verify the running product in a real browser.

- Added a module Web Worker (`src/workers/generator.worker.ts`) with targeted job cancellation, typed transferables and an automatic main-thread fallback (`src/lib/workerClient.ts`), inlined into the single-file build. Chromium verification: a 320² world completed in **734–817 ms** with no UI error.
- Corrected phase yielding in tectonic, climate, incision and thermal passes so progress and cancellation update between numerical stages.
- Added a Uint16LE terrain codec (`src/lib/terrainCodec.ts`). Projects, autosave and `.arkproj` now embed edited terrain. Measured round-trip error **0.0104 m** at 64²; corrupt payloads are rejected. Storage-quota failure degrades to patch-free projects instead of losing the library.
- Browser-found defects and fixes:
  1. Viewport first-row chrome overlapped the brush rail and map-overlay buttons → stacked rows at 88 px.
  2. A vertical blown-out streak was traced through sky-facet, cloud-billboard and ocean-specular hypotheses and eliminated by softening ocean roughness/metalness and sun intensity; clouds were also moved outside the orbit envelope.
  3. Rivers drew as bright additive lines across high ground → split minor/trunk classes, removed additive blending, culled large drops, steep slopes and lake crossings.
  4. Boulders rendered as oversized monoliths → scales capped at 0.4–1.15 and proportions embedded.
  5. Analysis histogram labels overlapped plots → separated plot and axis rows.
  6. Topographic view no longer overrides the user's inspector tab.
- Chromium interaction test: validation **15/15 passed in 295 ms**, analysis dialog opened with measured overlay, export dialog offered 11 artefacts, preset load regenerated, topographic view rendered, console opened. **Zero page and console errors.**

**Visual inspection (real browser screenshots)**

`reports/visual/ui-desktop.png`, `ui-topographic.png`, `ui-analysis.jpg`, `ui-layers.jpg`, `ui-validation.jpg`, `ui-export.jpg`.

Accepted: studio hierarchy, dense but legible panels, organic island with named biome classes, working legends/readouts and dialogs.
Remaining visual notes: headless SwiftShader renders at 1–5 FPS (not representative of a discrete GPU); the terrain uses fixed ×2.4 vertical exaggeration; the 3D stage remains more stylised than a AAA title and would benefit from normal maps, triplanar detail and contact shadows.

**Known issues / next priorities**

- Generation is off-main-thread, but the terrain *editor* still recomputes hydrology and analysis synchronously (~100–300 ms at 320²).
- At 512², single-job worker generation remains ~5 s; WASM or tiled workers are the next throughput step.
- ARK exports remain source datasets; no cooked map is produced.
- Quality scores of 68–71 are honest B-grade results; the model deliberately flags mountain scarcity and diversity warnings.
- Automated pixel-difference regression is not implemented; screenshots are captured and manually inspected each cycle. Adding a baseline image diff is the next QA priority.
- Headless GPU benchmarking cannot substitute for testing on the target GTX 1080.

## Cycle 4 — Surface materials and environment asset editing

**Objective:** make the viewport surface read as material rather than painted biome colour, and give the editor real asset placement/removal.

**Implemented**
- Derived surface maps (`surfaceDetailMaps` in `TerrainViewport.tsx`): a band-limited tangent-space normal map and a measurement-driven roughness map (wet → glossy, snow/sand → matte, rock → intermediate). Generated at 256/384/512 per quality tier and disposed with the terrain.
- Editor asset catalog (`src/lib/assets.ts`): 10 environment assets with documented category, default scale and maximum slope.
- New `place` and `erase` tools in both the left builder and floating viewport rail. Placement validates shoreline, slope limits, spacing and writes a deterministic scale/rotation from a positional hash. Metrics and quality are recomputed after every asset edit.
- Full object-level undo/redo: `EditSnapshot` now captures both heights and placed objects. Keyboard shortcuts `P` (place) and `E` (erase).
- Ground-level camera solved from the actual height field using coastal lowland selection instead of a fixed coordinate, with an eye height just above the tree line.
- Two-tier forest canopy for pines/redwoods/jungle to break the single-cone silhouette.

**Defect found and reverted during the cycle**
The first normal-map implementation amplified macro gradient into normal detail, which double-lit slopes and blew out the surface (observed in `ui-asset-placement.jpg`, captured before the fix). Replaced with a band-limited residual normal computed from height minus a smoothed reference, capped at ±0.62 and scaled to 0.42. Re-inspection of `ui-materials.jpg` confirmed relief detail without exposure clipping and restored biome colour.

**Verification**
- TypeScript strict check: pass. Production build: pass (1.138 MB single file).
- Engine regression: 5 deterministic seeds unchanged in score (68–70), land/water, biomes and hydrology.
- Live assertion suite: **15/15 pass in 295 ms**.
- Headless placement regression: first candidate point accepted; asset finite, dry, slope-valid; object count delta exactly 1; metrics recomputed with finite quality; 1,031/2,000 sampled steep points correctly rejected for obelisk slope.
- Browser interaction: placed a redwood (2,815 → 2,816 objects), erase brush removed 49 assets in one footprint, **zero page/console errors**.
- Camera modes captured: `reports/visual/ui-camera-top.jpg`, `ui-camera-first.jpg`, `ui-camera-cinematic.jpg`; materials: `ui-materials.jpg`; editor: `ui-asset-placement.jpg`.

**Accepted improvements:** material relief and roughness response; functional asset placement/removal with undo; real ground-level camera; improved forest silhouette.
**Remaining:** textures are derived from the height/climate fields rather than authored PBR sets, so material identity (granite vs limestone vs basalt) is still approximated by slope/temperature rather than explicit petrology layers. Grass/flower understory meshes are not yet modelled. Water remains single-layer with no reflections or foam.

## Cycle 5 — ARK compatibility correction (evidence-based)

**Objective:** replace the vague ARK compatibility note with verified, specific claims, and close a real export gap found while checking it.

**Research performed before changing claims**
- Epic, *Creating and Using Custom Heightmaps and Layers*: native heightmap = single-channel grayscale **16 bpp**; **target layers = single-channel grayscale 8 bpp** and must match the Landscape's Overall Resolution.
- Epic, *Landscape Technical Guide*: height values span **−256…255.992**, multiplied by the import Z scale; landscape resolutions follow `(components × quads + 1)`; the conventional family is 505/1009/2017/4033/8129.
- Wildcard, *ARK DevKit — Creating New Maps*: **ASA uses World Partition**; World Composition is no longer supported.
- ARK Modding Wiki, *Terrain Heightmap*: 16-bit grayscale, disable sRGB, `TC_VectorDisplacementmap` / `TC_Greyscale`.

**Real defect found and fixed**
The export bundle only shipped one packed RGB "splat" preview. Unreal target layers require **separate single-channel 8-bit weight maps at the landscape resolution**, so the claim of layer-weight support was not actually satisfied. Added five genuine maps (`sand`, `vegetation`, `rock`, `snow`, `wetland`) with water masked out, and a regression assertion that parses their PNG headers (bit depth 8, colour type 0, matching dimensions).

**Claim corrections**
- Old text said "height/weight/suitability source datasets" without specifying formats or distinguishing ASE from ASA. New text names the actual artefacts, states explicitly what is **not** included (cooked map, Landscape actor/material, shared layer info, biome volumes, spawner containers, map settings, GameMode/game-data), distinguishes ASE sublevels from ASA World Partition, and states that **no import or cook was performed**.
- Added an ARK/Unreal compatibility report with 17 checks across four honest statuses: satisfied (5), advisory (4), in-engine-required (6), not-produced (2). Never emits a "compatible" or "playable" verdict.
- Report includes resolution-family match, suggested Z scale derived from Unreal's 512-unit height range, sea-level pixel value, eight ordered manual in-engine steps and four primary source links.
- Export dialog now has an ASE/ASA target toggle that changes project-structure guidance.

**Verification**
- Live suite: **17/17 pass in 309 ms**, including new `ARK layer weight maps` and `ARK compatibility claim integrity` assertions. The latter fails the suite if `playableMap` or `engineVerified` are ever true or if any check asserts playability.
- Browser verification: 13 artefacts selected, five `layerWeights_*.png` present, report shows "source data only / not playable / not engine-verified", World Partition guidance present, **zero console errors**.
- Visual capture: `reports/visual/ark-compatibility-report.jpg`.

**Remaining limitations:** none of this is validated by an actual Unreal/ARK Dev Kit import or cook; elevation re-ranging on import may require recomputing the Z scale; landscape material authoring and shared layer info remain entirely manual.

## Cycle 6 — Canonical compatibility disclosure

**Objective:** make the user's exact compatibility wording the single source of truth everywhere, so UI copy, JSON metadata and downloaded files cannot diverge or drift toward overclaiming.

**Implementation**
- Added `ARK_COMPATIBILITY_DISCLOSURE` and `ARK_COMPATIBILITY_DISCLOSURE_TEXT` in `src/lib/ark-compatibility.ts`. The text is verbatim: headline, contents, not-included, ASE/ASA project structure, verification status and spawn/resource honesty statement.
- Every surface reads that constant: the export dialog warning, the field guide limitation section, the compatibility JSON (`disclosure` + `disclosureText`), the ARK metadata file, and a new downloadable `Bundle README & disclosure` plain-text file.
- The README travels with the data. It contains the canonical disclosure, per-file inventory with formats and sizes, technical contract (dimensions, bit depth, endianness, origin, elevation range, relief, suggested Z scale, sea-level pixel value, target layers, resolution family, checksum), all required in-engine steps, every conformance check with status, sources, and import reminders (sRGB off, `TC_VectorDisplacementmap`/`TC_Greyscale`).
- Default export selection now includes the README (14 artefacts).

**Regression protection** — new assertion `Canonical disclosure & bundle README`:
- every canonical fragment must appear unchanged in the generated report and the README;
- all manual steps and all 17 check labels must be mirrored in the README;
- forbidden overclaim patterns (`is a playable`, `fully compatible`, `ready to play`, `verified in-engine`) must be absent;
- README must exceed 1.5 KiB.

**Verification**
- Suite: **18/18 pass in 213 ms**.
- Browser: all five required disclosure sentences present **before** building; target badges `source data only` / `not playable` / `not engine-verified`; 14 artefacts; README listed; **zero console errors**.
- Screenshot: `reports/visual/ark-disclosure-visible.jpg`.

**Known limitation:** disclosure integrity is proven at the string and file level only. It does not constitute an Unreal import, cook or engine compatibility test.
