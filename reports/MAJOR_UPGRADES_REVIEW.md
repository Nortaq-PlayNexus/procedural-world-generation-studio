# ARK Map Studio: Ultimate — Full Review & Major Upgrade Plan

Reviewed at build 1,166 kB single file, 15/15 live assertions, 5 deterministic seeds, real Chromium visual QA.
Scope reviewed: engine, hydrology, climate, biomes, materials, atmosphere, water, vegetation, editor, exports, persistence, performance, UI, QA.

## What is genuinely strong today

- Deterministic pipeline with reproducible terrain from seed + config.
- Real geomorphology: stream-power incision, thermal diffusion, priority-flood fill, D8 routing, lake persistence budgeting, watershed propagation.
- Measured analysis with transparent metric register and honest composite scoring.
- Off-main-thread generation with transferables and cancellation.
- Validated 11-artefact export bundle including a from-scratch 16-bit PNG encoder.
- Working editor: five sculpt brushes, asset placement/removal, object-aware undo, terrain persistence.
- Professional dark UI with dense but legible controls and real measured telemetry.
- **New in this cycle:** depth-aware water shader, atmospheric sky, bloom + filmic grade, 10 environment presets, two-tier canopy, camera-relative sky, circular horizon.

## Shipped in this cycle (verified)

1. **Hydrological water shader** — samples a terrain height texture in world space to derive true depth, tints shallow→deep, adds animated shoreline foam, depth-driven roughness, animated ripple normals.
2. **Atmospheric sky** — multi-band scattering approximation, sun forward-scatter, horizon haze, dither to kill gradient banding, camera-relative direction.
3. **Cinematic post** — UnrealBloom + custom saturation/lift/vignette grade + output pass, enabled only at High/Ultra and user-toggleable.
4. **10 environment presets** — temperate, tropical, arctic, volcanic, desert, swamp, redwood, highlands, coastal, deep ocean. Control atmosphere and water response without touching world determinism.
5. **Forest silhouette** — three canopy tiers plus shrub/ground-cover instancing.
6. **Rendering telemetry fixed** — `renderer.info.autoReset = false` + per-frame reset so post-processing work is measured instead of reported as 1 draw call.
7. **QA infrastructure** — `?debug` scene hook for object-level visual isolation; luminance sampling of captures.

## Defect found by this cycle's visual QA (and fixed)

A vertical bright band through the sky persisted across changes to the sky shader, cloud sprites and sun billboard. Object-level isolation (hide sky / sun / clouds / ocean, then sample pixels) proved the cause was the **ocean's clearcoat specular lobe on a 1000-unit plane**. Removed clearcoat, raised ocean roughness, reduced specular intensity, switched to a 96-segment circular horizon. Measured sky-row luminance spread dropped from 125+ to 53, and the band is gone in `reports/visual/v3-ocean-fixed.jpg`.

## MAJOR UPGRADES STILL TO IMPLEMENT — ranked

### Tier 1 — visual ceiling
1. **Triplanar splat material with authored procedural PBR sets.** Current terrain is one RGB map + derived normal/roughness. Needed: 4–8 blended material layers (grass, forest floor, mud, sand, snow, limestone, granite, basalt, moss rock, sandstone, coastal rock, river gravel) with albedo/normal/roughness/AO generated at 1–2k and blended by slope/height/moisture/biome masks. This is the single largest remaining visual gain.
2. **Screen-space ambient occlusion + contact shadows** so trees and boulders sit in the terrain rather than on it.
3. **Vegetation LOD and billboard impostors.** Trees are 3-cone instanced meshes; at distance and in dense forest this reads stylised. Needed: 2–3 detail tiers, cross-quad billboards, wind vertex sway, per-instance colour variation.
4. **Better water**: planar reflection probe, foam texture near shores, refraction, depth-based absorbance, underwater fog and caustic hint at ground level.
5. **Atmospheric volumetrics**: height fog plus light shafts; the current fog is uniform exponential.
6. **Cloud banks with shadow projection** onto terrain; current clouds are sprites with no terrain interaction.

### Tier 2 — world production
7. **Cave system** — explicit graph-based cave generation, entrance validation, connectivity scoring, export as spline/bounds metadata. Currently caves are a parameter with no geometry.
8. **Petrology model** — spatial rock provinces (limestone belt, basalt plateau, granite batholith) so materials and resource rules come from geology rather than biome heuristics.
9. **Waterfalls and river surface meshes** — rivers are line segments; needed ribbon geometry with flow UVs, cascade assets at high-drop cells.
10. **Underwater terrain detail** — shelves, reefs, trenches reflected in both height and material.
11. **Desert dune fields** — anisotropic transverse dune generator; currently desert is a biome, not a dune landform.
12. **Coastal cliffs** — distinct wave-cut cliff profile control.
13. **Spawn region designer** — named regions with polygons, creature tags, density, draw distance, and ARK-side documentation export.
14. **POI/landmark authoring** — place, group, rename, annotate landmarks instead of only procedural ruins/obelisks.

### Tier 3 — compatibility and workflow
15. **Map production workspace** — region manager, spawn configuration export, cave list, water volumes, POI metadata, per-artefact validation panel.
16. **True ARK compatibility report** — explicit checklist against documented landscape/splat/weight requirements, with pass/fail and manual steps; never claim playable output.
17. **Export profiles** — 1024/2048/4096 grid presets with memory warnings, plus tiled export to avoid single huge blobs.
18. **Project comparison view** — side-by-side seed metrics and thumbnails for world family selection.
19. **Automated pixel-difference visual regression** — store baselines per seed/quality and diff on every cycle (currently manual inspection only).
20. **Editor materials/biome painting** — paint layer weights and biome overrides with the same undo stack.

### Tier 4 — performance and engineering
21. **Tiled / WASM hydrology** — priority-flood and D8 are memory-heavy at 1024²; move to WASM or chunked workers.
22. **Incremental editor re-simulation** — currently every brush release reruns full hydrology/analysis.
23. **GPU memory budget panel** with per-texture accounting and eviction.
24. **Worker pool for asset scatter and export encoding.**

### Honest caveats
- Headless Chromium uses SwiftShader (1–8 FPS); no hardware GPU numbers are claimed.
- ARK exports remain source datasets, not cooked maps.
- Quality scores are studio heuristics, not ground truth.
- Bitmap-diff regression and authored PBR texture sets are not yet implemented.
