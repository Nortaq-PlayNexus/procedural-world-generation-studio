import { mkdirSync, writeFileSync } from "node:fs";
import { BASE_CONFIG } from "../src/lib/presets";
import { generateWorldAsync } from "../src/lib/worldgen";
import { buildExportBundle } from "../src/lib/exporters";
import { runValidationSuite } from "../src/lib/selftest";

mkdirSync("reports/visual", { recursive: true });

const seeds = [577, 42, 1234, 2026, 8675309];
const summaries: unknown[] = [];

for (const seed of seeds) {
  const started = performance.now();
  const world = await generateWorldAsync({ ...BASE_CONFIG, seed, resolution: 320 });
  const elapsed = performance.now() - started;
  const m = world.metrics;
  summaryLine(world, elapsed);
  summaries.push({ seed, score: world.quality.score, land: m.landCoverage, water: m.waterCoverage, max: m.maxElevation, objects: m.objectCount });
  if (seed === 577 || seed === 42) {
    const bundle = buildExportBundle(world, 640, new Set(["preview", "biome", "hydrology" as never]));
    for (const key of ["preview", "biome"]) {
      const file = bundle.files.find((f) => f.key === key);
      if (file) writeFileSync(`reports/visual/seed-${seed}-${key}.png`, Buffer.from(await file.blob.arrayBuffer()));
    }
  }
}

function summaryLine(world: Awaited<ReturnType<typeof generateWorldAsync>>, elapsed: number) {
  const m = world.metrics;
  const q = world.quality;
  console.log(
    `seed ${String(world.config.seed).padEnd(8)} ${q.score}/${q.grade} ` +
      `land ${(m.landCoverage * 100).toFixed(0)}% water ${(m.waterCoverage * 100).toFixed(1)}% ` +
      `peak ${m.maxElevation.toFixed(0)}m relief ${(m.maxElevation - m.minElevation).toFixed(0)}m ` +
      `slope ${((m.meanSlope * 180) / Math.PI).toFixed(1)}° ` +
      `rivers ${(m.riverConnectivity * 100).toFixed(0)}% lakes ${(m.lakeCoverage * 100).toFixed(2)}% ` +
      `basins ${m.watersheds} biomes ${m.biomeCoverage.length} H' ${m.shannonDiversity.toFixed(2)} ` +
      `objects ${m.objectCount} gen ${elapsed.toFixed(0)}ms`
  );
  console.log(`   warnings: ${q.warnings.join(" | ")}`);
}

console.log("\nBenchmark scaling");
for (const resolution of [128, 256, 320, 512]) {
  const started = performance.now();
  const world = await generateWorldAsync({ ...BASE_CONFIG, resolution });
  console.log(`   ${resolution}²: ${world.generationMs.toFixed(0)} ms (wall ${(performance.now() - started).toFixed(0)} ms) · ${world.objects.length} objects`);
}

console.log("\nValidation suite");
const suite = await runValidationSuite();
for (const result of suite.results) console.log(`   ${result.pass ? "PASS" : "FAIL"}  ${result.label} — ${result.detail}`);
console.log(`   ${suite.passed}/${suite.results.length} passed in ${suite.totalMs.toFixed(0)} ms`);

console.log("\nDeterministic seed summary");
console.log(JSON.stringify(summaries, null, 2));
