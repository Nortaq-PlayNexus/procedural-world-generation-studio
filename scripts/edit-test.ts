import { BASE_CONFIG } from '../src/lib/presets';
import { generateWorldAsync, refreshWorld, applyTerrainBrush, simulateProcess } from '../src/lib/worldgen';
import { buildExportBundle } from '../src/lib/exporters';
const w = await generateWorldAsync({...BASE_CONFIG, resolution: 256});
const h = new Float32Array(w.heights);
applyTerrainBrush(h, w.resolution, 0.5, 0.5, 20, 0.5, 'raise', 0);
const raised = refreshWorld({...w, heights: h, revision: w.revision+1});
console.log('raise delta peak', (raised.maxHeight-w.maxHeight).toFixed(1), 'water', (raised.metrics.waterCoverage*100).toFixed(1), 'biomes', raised.metrics.biomeCoverage.length, 'objects', raised.objects.length);
for (const p of ['hydraulic','thermal','channel-smoothing'] as const) {
  const sim = simulateProcess(raised, p, 0.6);
  console.log(p, 'score', sim.quality.score, 'peak', sim.metrics.maxElevation.toFixed(0), 'rough', sim.metrics.roughness.toFixed(1), 'rev', sim.revision, 'finite', sim.heights.every(Number.isFinite));
}
const bundle = buildExportBundle(w, 1024, new Set(['heightmap16','heightmapRaw','preview','biome','water','splat','resource','spawn','config','arkMeta','project']));
console.log('exports', bundle.files.length, bundle.files.map(f=>`${f.key}:${(f.bytes/1024).toFixed(0)}KB`).join(' '));
console.log('validation', bundle.validation.map(v=>`${v.pass?'ok':'FAIL'}:${v.label}`).join(' '));
