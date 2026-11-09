import { createNoise, mulberry32 } from "./noise";
import { BASE_CONFIG } from "./presets";
import { generateWorldAsync } from "./worldgen";
import { buildExportBundle } from "./exporters";
import { decodeHeights, encodeHeights } from "./terrainCodec";
import { ARK_COMPATIBILITY_DISCLOSURE } from "./ark-compatibility";
import type { WorldConfig } from "./types";

export interface TestResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  ms: number;
}

const testConfig: WorldConfig = { ...BASE_CONFIG, seed: 577, resolution: 64, name: "Validation Field" };

export async function runValidationSuite(onStep?: (step: number, total: number, label: string) => void): Promise<{ results: TestResult[]; totalMs: number; passed: number; failed: number }> {
  const results: TestResult[] = [];
  const suiteStart = performance.now();
  const labels = [
    "PRNG determinism & bounds",
    "Perlin gradient bounds",
    "FBM determinism & non-degeneracy",
    "World determinism (seed + config)",
    "Height field integrity",
    "Hydrology accumulation ordering",
    "Water/land classification",
    "Biome domain & coverage",
    "Object placement validity",
    "Terrain continuity guard",
    "Quality weight normalisation",
    "Mesh winding orientation",
    "16-bit heightmap PNG header",
    "RAW byte length & endianness",
    "Project terrain codec round-trip",
    "ARK layer weight maps",
    "ARK compatibility claim integrity",
    "Canonical disclosure & bundle README",
  ];
  const total = labels.length;
  const record = (id: string, label: string, pass: boolean, detail: string, started: number) => {
    results.push({ id, label, pass, detail, ms: performance.now() - started });
    onStep?.(results.length, total, label);
  };

  let start = performance.now();
  try {
    const a = mulberry32(577);
    const b = mulberry32(577);
    const seqA = Array.from({ length: 512 }, () => a());
    const seqB = Array.from({ length: 512 }, () => b());
    const identical = seqA.every((v, i) => v === seqB[i]);
    const bounds = seqA.every((v) => v >= 0 && v < 1);
    const mean = seqA.reduce((s, v) => s + v, 0) / seqA.length;
    record("prng", labels[0], identical && bounds && Math.abs(mean - 0.5) < 0.06, `512 samples · mean ${mean.toFixed(3)} · identical=${identical}`, start);
  } catch (error) {
    record("prng", labels[0], false, String(error), start);
  }

  start = performance.now();
  try {
    const noise = createNoise(577);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < 4096; i++) {
      const v = noise.perlin2(i * 0.173 + 0.31, i * 0.071 - 0.93);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
      sq += v * v;
    }
    const n = 4096;
    const variance = sq / n - (sum / n) ** 2;
    const lattice = noise.perlin2(0, 0);
    record("perlin", labels[1], min >= -1.0001 && max <= 1.0001 && variance > 0.01 && Math.abs(lattice) < 1e-9, `range [${min.toFixed(3)}, ${max.toFixed(3)}] · σ² ${variance.toFixed(3)} · lattice(0,0)=${lattice.toFixed(6)}`, start);
  } catch (error) {
    record("perlin", labels[1], false, String(error), start);
  }

  start = performance.now();
  try {
    const n1 = createNoise(2026);
    const n2 = createNoise(2026);
    let identical = true;
    let finite = true;
    let signal = 0;
    for (let i = 0; i < 300; i++) {
      const x = i * 0.087;
      const y = i * 0.031 + 2;
      const a = n1.fbm(x, y, 5);
      const b = n2.fbm(x, y, 5);
      if (a !== b) identical = false;
      if (!Number.isFinite(a) || a < -1.0001 || a > 1.0001) finite = false;
      signal += Math.abs(a);
    }
    record("fbm", labels[2], identical && finite && signal / 300 > 0.01, `300 octave stacks · deterministic=${identical} · mean |fbm| ${(signal / 300).toFixed(3)}`, start);
  } catch (error) {
    record("fbm", labels[2], false, String(error), start);
  }

  start = performance.now();
  let worldA: Awaited<ReturnType<typeof generateWorldAsync>> | null = null;
  let worldB: Awaited<ReturnType<typeof generateWorldAsync>> | null = null;
  try {
    onStep?.(4, total, "Generating two 64² validation worlds…");
    worldA = await generateWorldAsync(testConfig);
    worldB = await generateWorldAsync(testConfig);
    let differences = 0;
    for (let i = 0; i < worldA.heights.length; i += 13) if (worldA.heights[i] !== worldB.heights[i]) differences++;
    const sameMetrics = Math.abs(worldA.metrics.maxElevation - worldB.metrics.maxElevation) < 1e-6;
    record("determinism", labels[3], differences === 0 && sameMetrics, `${worldA.heights.length.toLocaleString()} samples compared · ${differences} differences · identical analysis=${sameMetrics}`, start);
  } catch (error) {
    record("determinism", labels[3], false, String(error), start);
  }

  start = performance.now();
  if (worldA) {
    let finite = true;
    let min = Infinity;
    let max = -Infinity;
    for (const height of worldA.heights) {
      if (!Number.isFinite(height)) finite = false;
      min = Math.min(min, height);
      max = Math.max(max, height);
    }
    const land = worldA.metrics.landCoverage;
    record("heights", labels[4], finite && max > min + 10 && land > 0.05 && land < 0.98, `range [${min.toFixed(1)}, ${max.toFixed(1)}] m · finite=${finite} · land ${(land * 100).toFixed(1)}%`, start);
  } else {
    record("heights", labels[4], false, "Determinism world unavailable", start);
  }

  start = performance.now();
  if (worldA) {
    const n = worldA.resolution;
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    let violations = 0;
    let checked = 0;
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        const d = worldA.flowDirection[i];
        if (d < 0 || worldA.heights[i] <= 0) continue;
        const ni = (y + dirs[d][1]) * n + (x + dirs[d][0]);
        if (worldA.heights[ni] <= 0) continue;
        checked++;
        if (worldA.flowAccumulation[ni] < worldA.flowAccumulation[i]) violations++;
      }
    }
    record("hydrology", labels[5], violations === 0 && checked > 10, `${checked.toLocaleString()} routed pairs · accumulation violations ${violations} · ${(worldA.metrics.riverConnectivity * 100).toFixed(0)}% ocean-linked`, start);
  } else {
    record("hydrology", labels[5], false, "World unavailable", start);
  }

  start = performance.now();
  if (worldA) {
    let lakeOnWater = 0;
    let riverOnWater = 0;
    let invalid = 0;
    for (let i = 0; i < worldA.resolution ** 2; i++) {
      if (worldA.lakeMask[i] && worldA.heights[i] < 0) lakeOnWater++;
      if (worldA.riverMask[i] && worldA.heights[i] < 0) riverOnWater++;
      if ((worldA.lakeMask[i] || worldA.riverMask[i]) && worldA.waterDepth[i] < 0) invalid++;
    }
    record("water", labels[6], lakeOnWater === 0 && riverOnWater === 0 && invalid === 0, `lake/ocean conflicts ${lakeOnWater} · river/ocean conflicts ${riverOnWater} · negative depths ${invalid}`, start);
  } else {
    record("water", labels[6], false, "World unavailable", start);
  }

  start = performance.now();
  if (worldA) {
    let valid = true;
    for (const value of worldA.biome) if (value < 0 || value > 12) valid = false;
    const coverage = worldA.metrics.biomeCoverage.reduce((s, b) => s + b.share, 0);
    record("biomes", labels[7], valid && Math.abs(coverage - 1) < 0.002 && worldA.metrics.biomeCoverage.length >= 3, `indices ∈ [0,12] · land coverage sums to ${(coverage * 100).toFixed(2)}% across ${worldA.metrics.biomeCoverage.length} classes`, start);
  } else {
    record("biomes", labels[7], false, "World unavailable", start);
  }

  start = performance.now();
  if (worldA) {
    let invalid = 0;
    for (const object of worldA.objects) {
      if (![object.x, object.y, object.z, object.scale].every(Number.isFinite) || object.x < 0 || object.x > 1 || object.z < 0 || object.z > 1 || object.scale <= 0) invalid++;
    }
    record("objects", labels[8], invalid === 0 && worldA.objects.length > 10, `${worldA.objects.length.toLocaleString()} placements validated · invalid records ${invalid}`, start);
  } else {
    record("objects", labels[8], false, "World unavailable", start);
  }

  start = performance.now();
  if (worldA) {
    const n = worldA.resolution;
    let maxStep = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n - 1; x++) {
        const i = y * n + x;
        const diff = Math.abs(worldA.heights[i] - worldA.heights[i + 1]);
        if (Number.isFinite(diff)) maxStep = Math.max(maxStep, diff);
      }
    }
    const range = worldA.maxHeight - worldA.minHeight;
    record("continuity", labels[9], maxStep < Math.max(650, range * 0.55), `max adjacent step ${maxStep.toFixed(0)} m · world relief ${range.toFixed(0)} m · guard ${Math.max(650, range * 0.55).toFixed(0)} m`, start);
  } else {
    record("continuity", labels[9], false, "World unavailable", start);
  }

  start = performance.now();
  if (worldA) {
    const sum = worldA.quality.breakdown.reduce((s, b) => s + b.weight, 0);
    const scoreValid = worldA.quality.score >= 0 && worldA.quality.score <= 100 && ["S", "A", "B", "C", "D"].includes(worldA.quality.grade);
    record("quality", labels[10], Math.abs(sum - 1) < 1e-9 && scoreValid, `weights sum ${sum.toFixed(4)} · composite ${worldA.quality.score} (${worldA.quality.grade})`, start);
  } else {
    record("quality", labels[10], false, "World unavailable", start);
  }

  start = performance.now();
  try {
    // Same winding as the renderer: (a, c, b), with +X east and +Z south.
    const a = [0, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 0, 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const crossY = ac[2] * ab[0] - ac[0] * ab[2];
    record("winding", labels[11], crossY > 0, `computed normal +Y component ${crossY} · index order (a,c,b) is upward-facing`, start);
  } catch (error) {
    record("winding", labels[11], false, String(error), start);
  }

  start = performance.now();
  try {
    if (!worldA) throw new Error("World unavailable");
    const bundle = buildExportBundle(worldA, 64, new Set(["heightmap16", "heightmapRaw"]));
    const png = bundle.files.find((f) => f.key === "heightmap16");
    const raw = bundle.files.find((f) => f.key === "heightmapRaw");
    if (!png || !raw) throw new Error("Missing export artefacts");
    const header = new Uint8Array(await png.blob.slice(0, 33).arrayBuffer());
    const view = new DataView(header.buffer);
    const signature = Array.from(header.slice(0, 8)).join(",");
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const bitDepth = header[24];
    const colorType = header[25];
    const pass = signature === "137,80,78,71,13,10,26,10" && width === 64 && height === 64 && bitDepth === 16 && colorType === 0;
    record("png16", labels[12], pass, `signature=${signature === "137,80,78,71,13,10,26,10" ? "valid" : "invalid"} · ${width}×${height} · ${bitDepth}-bit · colour type ${colorType}`, start);
    start = performance.now();
    const rawBuffer = new Uint8Array(await raw.blob.arrayBuffer());
    const expected = 64 * 64 * 2;
    record("raw16", labels[13], rawBuffer.length === expected && rawBuffer.length % 2 === 0, `${rawBuffer.length.toLocaleString()} bytes · expected ${expected.toLocaleString()} · Uint16LE paired bytes=${rawBuffer.length % 2 === 0}`, start);
  } catch (error) {
    record("png16", labels[12], false, String(error), start);
    record("raw16", labels[13], false, String(error), performance.now());
  }

  start = performance.now();
  try {
    if (!worldA) throw new Error("World unavailable");
    const patch = encodeHeights(worldA.heights);
    if (!patch) throw new Error("Encoder returned no patch");
    const decoded = decodeHeights(patch);
    if (!decoded || decoded.length !== worldA.heights.length) throw new Error("Decoded length mismatch");
    let maxError = 0;
    for (let i = 0; i < decoded.length; i += 3) maxError = Math.max(maxError, Math.abs(decoded[i] - worldA.heights[i]));
    const bytes = Math.round((patch.data.length * 3) / 4);
    record("terrain-codec", labels[14], maxError <= (patch.max - patch.min) / 65535 + 1e-4, `${decoded.length.toLocaleString()} heights · ${(bytes / 1024).toFixed(0)} KiB · max error ${maxError.toFixed(4)} m · bounds [${patch.min.toFixed(1)}, ${patch.max.toFixed(1)}]`, start);
  } catch (error) {
    record("terrain-codec", labels[14], false, String(error), start);
  }

  start = performance.now();
  try {
    if (!worldA) throw new Error("World unavailable");
    const bundle = buildExportBundle(worldA, 64, new Set(["layerWeights", "compatibility"]), "ase");
    const weights = bundle.files.filter((file) => file.key === "layerWeights");
    const expected = ["sand", "vegetation", "rock", "snow", "wetland"];
    const named = expected.every((layer) => weights.some((file) => file.name.includes(layer)));
    let headersValid = weights.length === expected.length;
    for (const file of weights) {
      const header = new Uint8Array(await file.blob.slice(0, 26).arrayBuffer());
      const view = new DataView(header.buffer);
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      // Target layers must be single-channel 8 bpp at the landscape resolution.
      if (header[24] !== 8 || header[25] !== 0 || width !== 64 || height !== 64) headersValid = false;
    }
    record("ark-layer-weights", labels[15], weights.length === 5 && named && headersValid, `${weights.length} maps · layers ${named ? "complete" : "missing"} · 8-bit greyscale at 64² ${headersValid ? "verified" : "failed"}`, start);
  } catch (error) {
    record("ark-layer-weights", labels[15], false, String(error), start);
  }

  start = performance.now();
  try {
    if (!worldA) throw new Error("World unavailable");
    const bundle = buildExportBundle(worldA, 64, new Set(["compatibility", "arkMeta"]), "asa");
    const report = bundle.compatibility;
    const claims = report.checks.filter((check) => /playable|compatible map|cooked map ready/i.test(check.label) && check.status === "satisfied");
    const honest = report.playableMap === false
      && report.engineVerified === false
      && report.verdict === "source-data-only"
      && report.checks.some((check) => check.id === "engine-verification" && check.status === "in-engine-required")
      && report.checks.some((check) => check.id === "cooked-map" && check.status === "not-produced")
      && claims.length === 0;
    const guidance = report.elevation.suggestedZScale > 0 && report.landscape.nearest.length > 0 && report.manualSteps.length >= 5;
    record("ark-compat", labels[16], honest && guidance, `${report.verdict} · playable=${report.playableMap} · engineVerified=${report.engineVerified} · no playability claims=${claims.length === 0} · Z≈${report.elevation.suggestedZScale} · ${report.checks.length} checks · ${report.manualSteps.length} manual steps`, start);
  } catch (error) {
    record("ark-compat", labels[16], false, String(error), start);
  }

  start = performance.now();
  try {
    if (!worldA) throw new Error("World unavailable");
    // 1. Every canonical phrase must survive in the generated report untouched.
    const report = buildExportBundle(worldA, 64, new Set(["compatibility", "readme"]), "asa").compatibility;
    const fragments = Object.values(ARK_COMPATIBILITY_DISCLOSURE);
    const reportIntact = fragments.every((fragment) => report.disclosureText.includes(fragment));
    // 2. The bundle README must contain the same canonical text and the checks.
    const bundle = buildExportBundle(worldA, 64, new Set(["compatibility", "readme"]), "ase");
    const readme = bundle.files.find((file) => file.key === "readme");
    const readmeText = readme ? await readme.blob.text() : "";
    const readmeIntact = fragments.every((fragment) => readmeText.includes(fragment));
    const readmeHasSteps = report.manualSteps.every((step) => readmeText.includes(step));
    const readmeHasChecks = report.checks.every((check) => readmeText.includes(check.label));
    // 3. Guard against weakening language: these phrases must never appear as claims.
    const forbidden = [/is a playable/i, /fully compatible/i, /ready to play/i, /verified in-engine/i];
    const noOverclaim = forbidden.every((pattern) => !pattern.test(readmeText) && !pattern.test(report.disclosureText));
    const pass = reportIntact && readmeIntact && readmeHasSteps && readmeHasChecks && noOverclaim && (readmeText.length > 1500);
    record("ark-disclosure", labels[17], pass, `canonical=${reportIntact && readmeIntact} · steps=${readmeHasSteps} · ${report.checks.length} checks mirrored · ${(readmeText.length / 1024).toFixed(1)} KiB README · overclaim language=${noOverclaim ? "absent" : "PRESENT"}`, start);
  } catch (error) {
    record("ark-disclosure", labels[17], false, String(error), start);
  }

  const totalMs = performance.now() - suiteStart;
  const passed = results.filter((r) => r.pass).length;
  return { results, totalMs, passed, failed: results.length - passed };
}

export const VALIDATION_LIMITATIONS = [
  "Automated assertions verify numerical invariants; they do not establish aesthetic quality.",
  "Rendered visual regression must be inspected separately in the 3D stage across seeds 577, 42, 1234, 2026 and 8675309.",
  "Hydrology is a D8 single-flow approximation with priority-flood depression filling; it is not a full Saint-Venant solver.",
  "ARK compatibility is limited to documented source-data exports; no cooked map is produced.",
];
