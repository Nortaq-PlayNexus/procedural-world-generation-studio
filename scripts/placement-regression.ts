import { BASE_CONFIG } from '../src/lib/presets';
import { generateWorldAsync } from '../src/lib/worldgen';
import { computeMetrics } from '../src/lib/analysis';
import { assetDefinition } from '../src/lib/assets';
import type { WorldData, WorldObject } from '../src/lib/types';

const w = await generateWorldAsync({ ...BASE_CONFIG, resolution: 256 });
const n = w.resolution;
const definition = assetDefinition('redwood');
// Mirror the App placement rules exactly.
function place(world: WorldData, u: number, v: number, kind: 'redwood' | 'obelisk'): WorldData | null {
  const gx = Math.min(n - 1, Math.max(0, Math.round(u * (n - 1))));
  const gz = Math.min(n - 1, Math.max(0, Math.round(v * (n - 1))));
  const cell = gz * n + gx;
  const def = assetDefinition(kind);
  if (world.heights[cell] < 1.5 || world.lakeMask[cell]) return null;
  if (world.slope[cell] > def.maxSlope) return null;
  if (world.objects.some((o) => Math.hypot((o.x - u) * n, (o.z - v) * n) < 1.6)) return null;
  const variation = ((Math.imul(gx + 11, 73856093) ^ Math.imul(gz + 7, 19349663)) >>> 0) / 4294967296;
  const object: WorldObject = { x: (gx + 0.5) / n, z: (gz + 0.5) / n, y: world.heights[cell], kind, scale: def.scale * (0.82 + variation * 0.42), rotation: variation * Math.PI * 2, biome: world.biome[cell] };
  const next = { ...world, objects: [...world.objects, object], revision: world.revision + 1 };
  const { metrics, quality } = computeMetrics(next);
  return { ...next, metrics, quality };
}
let placed: WorldData | null = null;
let attempts = 0;
for (let gy = 0.3; gy < 0.8 && !placed; gy += 0.02) for (let gx = 0.3; gx < 0.8 && !placed; gx += 0.02) { attempts++; placed = place(w, gx, gy, definition.kind as 'redwood'); }
console.log('placed:', !!placed, 'attempts:', attempts);
if (placed) {
  const last = placed.objects[placed.objects.length - 1];
  const i = Math.round(last.z * (n - 1)) * n + Math.round(last.x * (n - 1));
  console.log('asset valid:', last.kind === 'redwood', 'finite:', [last.x, last.y, last.z, last.scale].every(Number.isFinite), 'on dry land:', placed.heights[i] >= 0 && !placed.lakeMask[i], 'slope ok:', placed.slope[i] <= definition.maxSlope);
  console.log('object count delta:', placed.objects.length - w.objects.length, 'metrics objectCount:', placed.metrics.objectCount, 'quality finite:', Number.isFinite(placed.quality.score));
  // Obeystoke rejection on steep/unsuitable terrain should be exercised by rules above.
  const steepRejects = Array.from({ length: 2000 }, (_, k) => ({ u: 0.35 + ((k * 37) % 300) / 1000, v: 0.35 + ((k * 91) % 300) / 1000 })).filter(({ u, v }) => w.slope[Math.round(v * (n - 1)) * n + Math.round(u * (n - 1))] > assetDefinition('obelisk').maxSlope).length;
  console.log('sampled points rejected for obelisk slope:', steepRejects);
}
