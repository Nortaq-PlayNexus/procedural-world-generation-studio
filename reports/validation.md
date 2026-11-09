# Validation, Benchmark & Visual QA Record

Environment: Node 20, sandbox CPU (no discrete GPU measurement available here).
Engine build: 1.0.0. Reference config: Verdant Expanse, 12 × 12 km, 320² unless stated.

## Deterministic seed matrix

| Seed | Score | Land | Water | Peak | Relief | Mean slope | Ocean-linked | Basins | Biomes | H′ | Objects | Generation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 577 | 70 / B | 49% | 53.3% | 922 m | 1493 m | 22.0° | 100% | 24 | 10 | 1.70 | 2,741 | 2,192 ms |
| 42 | 68 / B | 45% | 57.5% | 805 m | 1386 m | 19.0° | 100% | 23 | 10 | 1.72 | 2,885 | 2,514 ms |
| 1234 | 71 / B | 46% | 56.0% | 905 m | 1492 m | 20.5° | 100% | 25 | 10 | 1.73 | 2,801 | 2,254 ms |
| 2026 | 68 / B | 47% | 55.0% | 814 m | 1406 m | 20.7° | 100% | 22 | 9 | 1.62 | 2,794 | 2,355 ms |
| 8675309 | 68 / B | 46% | 55.9% | 857 m | 1433 m | 20.0° | 100% | 21 | 10 | 1.58 | 2,964 | 2,080 ms |

Scoring is deliberately not inflated: 69–71 is a B grade under the studio’s quality model. Seed 42 raises “mountain belts cover < 2.5%” — retained as an honest advisory.

After the final wind-bias continuity change, the regression run produced scores 69/68/70/68 with unchanged relief, hydrology, biome counts and land/water coverage; the 320² wall time ranged 2.1–3.1 s with phase-level UI yielding (the earlier 2.2 s figure excluded the added cooperative yields).

## Resolution scaling (single-threaded Node)

| Grid | Wall time | Objects |
|---|---|---|
| 128² | 385 ms | 664 |
| 256² | 1,313 ms | 1,915 |
| 320² | 2,022 ms | 2,741 |
| 512² | 5,275 ms | 6,254 |

GPU frame statistics are measured live in the viewport by `WebGLRenderer.info` and averaged over 700 ms windows. No GPU-frame values are claimed in this document because the build environment provides no GPU render target for automated capture.

## Browser verification (Chromium 158, production single-file build)

| Check | Result |
|---|---|
| Page title | `ARK Map Studio: Ultimate — Procedural World Lab` |
| WebGL canvases mounted | 2 (3D + mini-map) |
| Console errors / page errors | **0 / 0** |
| Inline worker generation (320²) | 734–817 ms |
| Preset change → regeneration | 761 ms |
| Validation dialog | **15/15 passed, 295 ms** |
| Export artefacts offered | 11 |
| Topographic renderer | mounted and interactive |
| Terrain codec round-trip | max error 0.0104 m; corrupt input rejected |
| Headless render performance | 1–5 FPS (SwiftShader software rasteriser — not hardware-representative) |

Screenshots: `reports/visual/ui-desktop.png`, `ui-topographic.png`, `ui-analysis.jpg`, `ui-layers.jpg`, `ui-validation.jpg`, `ui-export.jpg`.
Fixes made as a direct result of inspecting these captures are recorded in `development_ledger.md`, Cycle 3.

## Live assertion suite — 15/15 PASS (≈182–295 ms)

1. PRNG determinism & bounds — 512 samples, mean 0.503, identical streams.
2. Perlin gradient bounds — measured [−0.811, 0.850], σ² 0.065, lattice origin 0.
3. FBM determinism & non-degeneracy — 300 stacks, identical, mean |fbm| 0.144.
4. World determinism — 4,096 compared samples, 0 differences, identical analysis.
5. Height field integrity — finite, range [−495.7, 853.8] m, 51.4% land.
6. Hydrology accumulation ordering — 1,894 routed pairs, 0 accumulation violations, 100% ocean-linked.
7. Water/land classification — 0 lake/ocean or river/ocean conflicts, 0 negative depths.
8. Biome domain & coverage — indices in [0,12], land shares sum to 100.00% across 9 classes.
9. Object placement validity — 96/96 records valid in the 64² suite field.
10. Continuity guard — max adjacent step 241 m < 817 m guard.
11. Quality weight normalisation — weights sum 1.0000, composite 69 (B) in the suite field.
12. Mesh winding — computed normal +Y, index order `(a,c,b)` upward-facing.
13. 16-bit PNG — valid signature, 64×64, 16-bit, colour type 0.
14. RAW Uint16LE — 8,192 bytes for 64², even byte count.
15. Project terrain codec — 4,096 heights, 8 KiB, max error 0.0104 m, bounds preserved; malformed payloads rejected.

## Visual inspection

Images: `reports/visual/seed-577-preview.png`, `seed-577-biome.png`, `seed-42-preview.png`, `seed-42-biome.png`.

Observed and accepted after correction:

- Organic island silhouette with deformed coastline (not square-clipped).
- Interior mountain provinces and interior lakes.
- Coastal forest belts, arid interior sectors and high-altitude snow limited to peaks.
- No vertical spikes, missing mesh triangles, inverted normals or floating water visible in the rendered map.
- Earlier wedge-like shading was investigated: maximum adjacent step was 241 m against a 1,493 m relief; high-Laplacian spike count was 0. The appearance came from categorical biome colouring and depression shading, and was corrected with ecotone blending and temperature-driven snow.

**Limitation:** no automated browser screenshot capture is available in this environment. Therefore automated visual regression comparison is *not* claimed as passing. Inspection was manual on rendered PNG exports of the actual analysed world.

## Known limitations

- Generation is not off-main-thread. Phase-level yielding prevents one long freeze at reference resolutions, but individual numerical stages at 512² remain synchronous.
- D8 hydrology is single-flow and does not resolve sub-cell channels, groundwater or sediment transport capacity.
- Export preview files use stored-deflate PNG rather than optimised compression.
- Latitudinal climate is an abstract design gradient, not a geodetic projection of a 12 km map.

## Canonical disclosure verification (Cycle 6)

The exact compatibility wording is defined once in `src/lib/ark-compatibility.ts` and consumed by the export dialog, field guide, compatibility JSON, ARK metadata and a generated bundle README.

Assertion `Canonical disclosure & bundle README` checks: all canonical fragments present unchanged in report and README; every manual step and all 17 check labels mirrored; forbidden phrases (`is a playable`, `fully compatible`, `ready to play`, `verified in-engine`) absent; README > 1.5 KiB.

Result: **18/18 assertions pass in 213 ms**. Browser verification confirmed all five required sentences visible before bundle creation, status badges `source data only` / `not playable` / `not engine-verified`, 14 artefacts and zero console errors. Screenshot: `reports/visual/ark-disclosure-visible.jpg`.
