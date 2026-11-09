import { BIOMES, type GenerationProgress, type ObjectKind, type WorldConfig, type WorldData, type WorldMetrics, type WorldObject, type QualityAssessment } from "./types";
import { clamp, createNoise, lerp, seededStream, smoothstep } from "./noise";
import { computeMetrics } from "./analysis";

const OCEAN = 0;
const BEACH = 1;
const WETLAND = 2;
const RAINFOREST = 3;
const FOREST = 4;
const GRASSLAND = 5;
const SAVANNA = 6;
const DESERT = 7;
const SHRUBLAND = 8;
const ALPINE = 9;
const TUNDRA = 10;
const SNOW = 11;
const VOLCANIC = 12;

const ELEVATION_SCALE = 1550;
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
}

class MinHeap {
  private heap: Int32Array;
  private size = 0;
  private keys: Float32Array;
  constructor(capacity: number, keys: Float32Array) {
    this.heap = new Int32Array(capacity);
    this.keys = keys;
  }
  get length() {
    return this.size;
  }
  push(index: number) {
    let i = this.size++;
    this.heap[i] = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[this.heap[parent]] <= this.keys[this.heap[i]]) break;
      const tmp = this.heap[parent];
      this.heap[parent] = this.heap[i];
      this.heap[i] = tmp;
      i = parent;
    }
  }
  pop(): number {
    const top = this.heap[0];
    const last = this.heap[--this.size];
    if (this.size > 0) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.size && this.keys[this.heap[l]] < this.keys[this.heap[smallest]]) smallest = l;
        if (r < this.size && this.keys[this.heap[r]] < this.keys[this.heap[smallest]]) smallest = r;
        if (smallest === i) break;
        const tmp = this.heap[i];
        this.heap[i] = this.heap[smallest];
        this.heap[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Priority-flood depression filling (Barnes–Lehman–Mulla).
 * Every cell receives a non-decreasing drainage path to an open boundary.
 * rank records pop order and provides an acyclic tie-break across flats.
 */
function priorityFlood(heights: Float32Array, n: number) {
  const total = n * n;
  const filled = new Float32Array(heights);
  const visited = new Uint8Array(total);
  const rank = new Int32Array(total).fill(-1);
  const order = new Int32Array(total);
  let orderLen = 0;
  const heap = new MinHeap(total, filled);
  const seed = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    filled[i] = heights[i];
    heap.push(i);
  };
  for (let x = 0; x < n; x++) {
    seed(x);
    seed((n - 1) * n + x);
  }
  for (let y = 0; y < n; y++) {
    seed(y * n);
    seed(y * n + n - 1);
  }
  for (let i = 0; i < total; i++) if (heights[i] <= 0) seed(i);
  while (heap.length) {
    const c = heap.pop();
    rank[c] = orderLen;
    order[orderLen++] = c;
    const cx = c % n;
    const cy = (c / n) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (visited[ni]) continue;
        visited[ni] = 1;
        filled[ni] = Math.max(heights[ni], filled[c]);
        heap.push(ni);
      }
    }
  }
  return { filled, order, rank };
}

const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** D8 steepest descent with fill-rank tie-breaks. Returns downstream indices. */
function routeFlow(heights: Float32Array, filled: Float32Array, rank: Int32Array, n: number) {
  const total = n * n;
  const downstream = new Int32Array(total).fill(-1);
  const flowDirection = new Int8Array(total).fill(-1);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (heights[i] <= 0) continue;
      let best = -1;
      let bestFill = Infinity;
      let bestRank = Infinity;
      for (let d = 0; d < 8; d++) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        // Downstream must be lower on the filled surface, or lower in fill order on a flat.
        const downhill = filled[ni] < filled[i] || (filled[ni] === filled[i] && rank[ni] < rank[i]);
        if (!downhill) continue;
        if (filled[ni] < bestFill || (filled[ni] === bestFill && rank[ni] < bestRank)) {
          best = ni;
          bestFill = filled[ni];
          bestRank = rank[ni];
        }
      }
      downstream[i] = best;
      if (best >= 0) {
        const dx = (best % n) - x;
        const dy = ((best / n) | 0) - y;
        const d = DIRS.findIndex(([a, b]) => a === dx && b === dy);
        flowDirection[i] = d >= 0 ? d : -1;
      }
    }
  }
  return { downstream, flowDirection };
}

function accumulate(downstream: Int32Array, order: Int32Array, heights: Float32Array) {
  const acc = new Float32Array(order.length);
  for (let i = 0; i < order.length; i++) acc[i] = heights[i] > 0 ? 1 : 0;
  for (let k = order.length - 1; k >= 0; k--) {
    const c = order[k];
    const d = downstream[c];
    if (d >= 0) acc[d] += acc[c];
  }
  return acc;
}

function thermalErosion(heights: Float32Array, n: number, iterations: number, talus: number) {
  const total = n * n;
  const delta = new Float32Array(total);
  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (heights[i] <= 0) continue;
        let lowest = i;
        for (let d = 0; d < 8; d++) {
          const ni = (y + DIRS[d][1]) * n + (x + DIRS[d][0]);
          if (heights[ni] < heights[lowest]) lowest = ni;
        }
        if (lowest === i) continue;
        const diff = heights[i] - heights[lowest];
        if (diff <= talus) continue;
        const move = (diff - talus) * 0.16;
        delta[i] -= move;
        delta[lowest] += move;
      }
    }
    for (let i = 0; i < total; i++) heights[i] += delta[i];
  }
}

/** One detachment-limited stream-power pass. */
function streamPowerPass(heights: Float32Array, n: number, erosion: number) {
  const { filled, order, rank } = priorityFlood(heights, n);
  const { downstream } = routeFlow(heights, filled, rank, n);
  const acc = accumulate(downstream, order, heights);
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] <= 1) continue;
    const d = downstream[i];
    if (d < 0) continue;
    const drop = heights[i] - heights[d];
    if (drop <= 0) continue;
    // Detachment-limited incision. Coefficient calibrated against the 12 km
    // reference world so 1–3 passes carve valleys without planation of peaks.
    const incision = Math.min(6.5, erosion * Math.pow(acc[i], 0.4) * clamp(drop, 0, 16) * 0.021);
    if (incision <= 0) continue;
    heights[i] -= incision;
    heights[d] += incision * 0.24;
  }
}

function streamPowerErosion(heights: Float32Array, n: number, config: WorldConfig, passes: number) {
  for (let p = 0; p < passes; p++) streamPowerPass(heights, n, config.erosion);
}

interface LakeResult {
  lakeMask: Uint8Array;
  lakeId: Int32Array;
  lakeSurface: Float32Array;
  waterDepth: Float32Array;
}

/** Connected component extraction of filled depressions with a persistence filter. */
function extractLakes(heights: Float32Array, filled: Float32Array, n: number, config: WorldConfig): LakeResult {
  const total = n * n;
  const lakeMask = new Uint8Array(total);
  const lakeId = new Int32Array(total).fill(-1);
  const lakeSurface = new Float32Array(total);
  const waterDepth = new Float32Array(total);
  const candidate = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (heights[i] >= 0 && filled[i] - heights[i] > 0.8) candidate[i] = 1;
    if (heights[i] < 0) waterDepth[i] = -heights[i];
  }
  // Lake persistence: extract all closed depressions, then retain only components
  // that clear a minimum area or depth AND fit inside a hard freshwater-area budget.
  // This prevents priority-flood pit-filling from flooding the whole interior.
  const minCells = Math.max(4, Math.round(9 - config.lakeDensity * 5));
  const areaBudget = Math.floor(total * (0.005 + config.lakeDensity * 0.012));
  const stack = new Int32Array(total);
  const members = new Int32Array(total);
  const components: { cells: Int32Array; count: number; depth: number; area: number }[] = [];
  for (let start = 0; start < total; start++) {
    if (!candidate[start] || lakeId[start] !== -1) continue;
    let top = 0;
    let count = 0;
    let maxDepth = 0;
    stack[top++] = start;
    lakeId[start] = -2;
    while (top > 0) {
      const c = stack[--top];
      members[count++] = c;
      maxDepth = Math.max(maxDepth, filled[c] - heights[c]);
      const cx = c % n;
      const cy = (c / n) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d][0];
        const ny = cy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (candidate[ni] && lakeId[ni] === -1) {
          lakeId[ni] = -2;
          stack[top++] = ni;
        }
      }
    }
    if (count >= minCells || maxDepth > 6) {
      components.push({ cells: members.slice(0, count), count, depth: maxDepth, area: count });
    } else {
      for (let k = 0; k < count; k++) lakeId[members[k]] = -1;
    }
  }
  components.sort((a, b) => b.area - a.area);
  let used = 0;
  let nextId = 0;
  for (const component of components) {
    // Large, deep bodies persist first; tiny closed pits are omitted entirely.
    if (used + component.count > areaBudget) {
      for (let k = 0; k < component.count; k++) lakeId[component.cells[k]] = -1;
      continue;
    }
    used += component.count;
    for (let k = 0; k < component.count; k++) {
      const c = component.cells[k];
      lakeMask[c] = 1;
      lakeId[c] = nextId;
      lakeSurface[c] = filled[c];
      waterDepth[c] = filled[c] - heights[c];
    }
    nextId++;
  }
  for (let i = 0; i < total; i++) {
    if (!lakeMask[i] && heights[i] >= 0) waterDepth[i] = 0;
  }
  return { lakeMask, lakeId, lakeSurface, waterDepth };
}

function slopeField(heights: Float32Array, n: number, spacing: number) {
  const slope = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const xm = x > 0 ? i - 1 : i;
      const xp = x < n - 1 ? i + 1 : i;
      const ym = y > 0 ? i - n : i;
      const yp = y < n - 1 ? i + n : i;
      const dx = (heights[xp] - heights[xm]) / ((x > 0 && x < n - 1 ? 2 : 1) * spacing);
      const dy = (heights[yp] - heights[ym]) / ((y > 0 && y < n - 1 ? 2 : 1) * spacing);
      slope[i] = Math.min(4.0, Math.hypot(dx, dy));
    }
  }
  return slope;
}

function coastDistanceField(heights: Float32Array, n: number) {
  const total = n * n;
  const dist = new Float32Array(total).fill(9999);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < total; i++) {
    if (heights[i] < 0) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  const orth = [1, -1, n, -n];
  while (head < tail) {
    const c = queue[head++];
    const cx = c % n;
    const cy = (c / n) | 0;
    for (let k = 0; k < 4; k++) {
      const ni = c + orth[k];
      if (ni < 0 || ni >= total) continue;
      if (k === 0 && cx === n - 1) continue;
      if (k === 1 && cx === 0) continue;
      if (Math.abs(((ni / n) | 0) - cy) > 1) continue;
      if (dist[ni] > dist[c] + 1) {
        dist[ni] = dist[c] + 1;
        queue[tail++] = ni;
      }
    }
  }
  for (let i = 0; i < total; i++) if (dist[i] > 9000) dist[i] = Math.max(n, 999);
  return dist;
}

/**
 * Whittaker-style classification with explicit, inspectable thresholds.
 * Order matters: water → volcanism → wetland → littoral → cold → high-altitude →
 * aridity gradient → temperature/moisture forest & savanna → grassland.
 */
function classifyBiome(temp: number, moist: number, h: number, slope: number, isLake: boolean, volcano: number): number {
  if (h < 0) return OCEAN;
  if (isLake || (moist > 0.82 && slope < 0.03 && h < 140)) return WETLAND;
  if (h < 7.5 && slope < 0.42 && temp > -6) return BEACH;
  if (volcano > 0.66 && h > 260 && slope > 0.12) return VOLCANIC;
  if (temp < -3) return SNOW;
  if (temp < 3.5) return TUNDRA;
  if (h > 780 || (h > 540 && temp < 7.5)) return ALPINE;
  if (moist < 0.29) return temp > 16 ? DESERT : SHRUBLAND;
  if (moist < 0.34) return temp > 22 ? SAVANNA : temp < 10 ? TUNDRA : SHRUBLAND;
  if (moist < 0.5) return temp > 22 ? SAVANNA : temp < 12 ? TUNDRA : GRASSLAND;
  if (temp > 19 && moist > 0.62) return RAINFOREST;
  if (moist > 0.5) return FOREST;
  return GRASSLAND;
}

function smoothBiomes(biomes: Uint8Array, n: number) {
  const copy = new Uint8Array(biomes);
  const counts = new Int16Array(BIOMES.length);
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      if (copy[i] === OCEAN) continue;
      counts.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const b = copy[(y + dy) * n + (x + dx)];
          if (b === OCEAN) continue;
          counts[b] += dx === 0 && dy === 0 ? 2 : 1;
        }
      }
      let best = copy[i];
      let bestCount = counts[best];
      for (let b = 1; b < counts.length; b++) {
        if (counts[b] > bestCount) {
          best = b;
          bestCount = counts[b];
        }
      }
      biomes[i] = best;
    }
  }
}

function pickTree(biome: number, temp: number, elevation: number, rand: number): ObjectKind {
  switch (biome) {
    case RAINFOREST:
      return rand < 0.72 ? "jungle" : "palm";
    case FOREST:
      if (temp < 9 || elevation > 450) return rand < 0.7 ? "pine" : "redwood";
      return rand < 0.45 ? "redwood" : rand < 0.85 ? "pine" : "shrub";
    case WETLAND:
      return rand < 0.5 ? "palm" : "redwood";
    case GRASSLAND:
      return rand < 0.55 ? "shrub" : "grass tuft";
    case SAVANNA:
      return rand < 0.25 ? "palm" : rand < 0.6 ? "shrub" : "grass tuft";
    case SHRUBLAND:
      return rand < 0.72 ? "shrub" : "grass tuft";
    case BEACH:
      return "palm";
    case TUNDRA:
      return rand < 0.4 ? "pine" : "shrub";
    case ALPINE:
      return rand < 0.55 ? "shrub" : "grass tuft";
    default:
      return "grass tuft";
  }
}

function placeObjects(
  config: WorldConfig,
  n: number,
  heights: Float32Array,
  slope: Float32Array,
  biome: Uint8Array,
  coast: Float32Array,
  lakeMask: Uint8Array,
  riverMask: Uint8Array,
  temperature: Float32Array,
  moisture: Float32Array,
): WorldObject[] {
  const total = n * n;
  const objects: WorldObject[] = [];
  const occupied = new Uint8Array(total);
  const vegetationRandom = seededStream(config.seed, 11);
  const rockRandom = seededStream(config.seed, 12);
  const landmarkRandom = seededStream(config.seed, 13);
  const objsPerCellCap = 0.065;
  const maxObjects = Math.min(14000, Math.floor(total * objsPerCellCap) + 200);

  const vegetationAttempts = Math.min(total, Math.floor(total * 0.28 * (0.25 + config.vegetationDensity)));
  const treeCap = Math.floor(total * 0.055);
  let treeCount = 0;
  for (let attempt = 0; attempt < vegetationAttempts && objects.length < maxObjects && treeCount < treeCap; attempt++) {
    const x = Math.floor(vegetationRandom() * n);
    const z = Math.floor(vegetationRandom() * n);
    const i = z * n + x;
    if (occupied[i] || heights[i] < 2 || lakeMask[i] || slope[i] > 0.62) continue;
    const b = biome[i];
    const veg = BIOMES[b].vegetation * config.vegetationDensity;
    if (vegetationRandom() > veg) continue;
    if (b === DESERT || b === VOLCANIC || b === SNOW) continue;
    const kind = pickTree(b, temperature[i], heights[i], vegetationRandom());
    const treeLike = kind === "redwood" || kind === "pine" || kind === "jungle" || kind === "palm";
    if (treeLike && (slope[i] > 0.5 || moisture[i] < 0.2)) continue;
    objects.push({
      x: (x + 0.2 + vegetationRandom() * 0.6) / n,
      z: (z + 0.2 + vegetationRandom() * 0.6) / n,
      y: heights[i],
      kind,
      scale: treeLike ? 0.7 + vegetationRandom() * 0.85 : 0.45 + vegetationRandom() * 0.6,
      rotation: vegetationRandom() * Math.PI * 2,
      biome: b,
    });
    occupied[i] = 1;
    if (treeLike) treeCount++;
  }

  const rockAttempts = Math.floor(total * 0.05 * config.rockDensity);
  for (let attempt = 0; attempt < rockAttempts && objects.length < maxObjects; attempt++) {
    const x = Math.floor(rockRandom() * n);
    const z = Math.floor(rockRandom() * n);
    const i = z * n + x;
    if (occupied[i] || heights[i] < 1 || lakeMask[i]) continue;
    const rockChance = BIOMES[biome[i]].rock + smoothstep(0.18, 0.7, slope[i]) * 0.35;
    if (rockRandom() > rockChance) continue;
    objects.push({
      x: (x + 0.15 + rockRandom() * 0.7) / n,
      z: (z + 0.15 + rockRandom() * 0.7) / n,
      y: heights[i],
      kind: rockRandom() < 0.35 ? "boulder" : "rock",
      scale: 0.4 + rockRandom() * 0.75,
      rotation: rockRandom() * Math.PI * 2,
      biome: biome[i],
    });
    occupied[i] = 1;
  }

  const landmarkTarget = Math.max(2, Math.round(3 + config.landmarkDensity * 22));
  for (let k = 0; k < landmarkTarget; k++) {
    let best = -1;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 280; attempt++) {
      const x = 2 + Math.floor(landmarkRandom() * (n - 4));
      const z = 2 + Math.floor(landmarkRandom() * (n - 4));
      const i = z * n + x;
      if (heights[i] < 12 || lakeMask[i] || riverMask[i] || slope[i] > 0.2) continue;
      let near = false;
      for (let dy = -7; dy <= 7 && !near; dy += 2) {
        for (let dx = -7; dx <= 7; dx += 2) {
          const nx = x + dx;
          const ny = z + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          if (occupied[ny * n + nx]) { near = true; break; }
        }
      }
      if (near) continue;
      const scenic = Math.abs(heights[Math.min(n - 1, z + 5) * n + x] - heights[Math.max(0, z - 5) * n + x]) + Math.exp(-coast[i] / 12) * 45;
      const score = scenic + (biome[i] === GRASSLAND || biome[i] === FOREST ? 30 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) continue;
    const x = best % n;
    const z = (best / n) | 0;
    objects.push({
      x: (x + 0.5) / n,
      z: (z + 0.5) / n,
      y: heights[best],
      kind: k % 3 === 2 ? "obelisk" : "ruin",
      scale: 0.85 + landmarkRandom() * 0.5,
      rotation: landmarkRandom() * Math.PI * 2,
      biome: biome[best],
    });
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const nx = x + dx;
        const ny = z + dy;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) occupied[ny * n + nx] = 1;
      }
    }
  }
  return objects;
}

const nextWatershedGroup = (x: number, y: number, n: number) => 100000 + Math.floor((x / n) * 16) + Math.floor((y / n) * 16) * 16;

/** Full generation pipeline. Pure with respect to config + seed; no DOM dependencies. */
export async function generateWorldAsync(
  config: WorldConfig,
  onProgress?: (p: GenerationProgress) => void,
  signal?: AbortSignal,
): Promise<WorldData> {
  const started = performance.now();
  const n = Math.max(33, Math.min(768, Math.round(config.resolution)));
  const total = n * n;
  const noise = createNoise(config.seed);
  const spacing = (config.widthKm * 1000) / Math.max(1, n - 1);
  const report = (phase: string, detail: string, progress: number) => {
    checkAbort(signal);
    onProgress?.({ phase, detail, progress });
  };

  report("Initialising field", `Allocating ${total.toLocaleString()} cells @ ${n}²`, 0.01);
  await nextTask();

  const heights = new Float32Array(total);
  const volcanism = new Float32Array(total);
  // Noise offsets must stay small in noise-space and never leak into the normalized
  // tectonic coordinate pair (wx, wy); doing so previously collapsed the land mask.
  const beltNoiseOffset = (config.seed % 997) / 997;
  const plateFreq = 2.6 + config.mountainFrequency * 2.8;
  const mountainFreq = 1.9 + config.mountainFrequency * 2.3;

  const totalRows = n;
  for (let y = 0; y < n; y++) {
    if (y % 48 === 47) {
      report("Tectonic assembly", `Composing crust · row ${y + 1}/${totalRows}`, 0.02 + (y / n) * 0.14);
      await nextTask();
    }
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const u = x / (n - 1);
      const v = y / (n - 1);
      // Keep normalized tectonic coordinates in [-1,1] independent of the seed.
      // Warping is a bounded displacement in that same space, not a re-normalisation.
      const warpX = noise.fbm(u * 2.9 + 3.1, v * 2.9 - 6.4, 4);
      const warpY = noise.fbm(u * 2.9 - 8.7, v * 2.9 + 2.2, 4);
      const wx = u * 2 - 1 + warpX * config.domainWarp * 0.3;
      const wy = v * 2 - 1 + warpY * config.domainWarp * 0.3;
      const ellipse = Math.hypot(wx * 1.1, wy * 0.94);
      const coastNoise = noise.fbm(u * 3.1 + 17.4, v * 3.1 - 8.2, 5);
      const coastFine = noise.fbm(u * 8.4 - 2.4, v * 8.4 + 5.9, 4);
      const continentNoise = noise.fbm(u * 2.05 + 4.7 - beltNoiseOffset, v * 2.05 + 2.1, 5);
      const shelf = noise.fbm(u * 1.35 + 9.1, v * 1.35 - 3.7, 4);
      const coastMod = coastNoise * 0.15 * config.coastline + coastFine * 0.045 * config.coastline;
      let baseRaw = 0.2;
      let shape = 0.5;
      if (config.landmass === "continent") {
        shape = 1 - smoothstep(0.6, 1.0, ellipse + coastMod);
        baseRaw = 0.175 + shape * 0.4 + continentNoise * 0.14 + shelf * 0.045;
      } else if (config.landmass === "island") {
        shape = 1 - smoothstep(0.18, 0.72, ellipse + coastMod * 1.1);
        baseRaw = 0.13 + shape * 0.5 + continentNoise * 0.06;
      } else if (config.landmass === "archipelago") {
        const cell = noise.cellular(wx * 2.6 + 8.1, wy * 2.6 - 4.3);
        const islandCell = 1 - smoothstep(0.15, 0.78, cell.f1 + coastNoise * 0.06);
        const arc = smoothstep(0.38, 0.78, noise.fbm(u * 1.7 - 3.2, v * 1.7 + 9.4, 4) * 0.5 + 0.5);
        shape = clamp(islandCell * 0.82 + arc * 0.22, 0, 1);
        baseRaw = 0.14 + shape * 0.46 + continentNoise * 0.07;
      } else {
        shape = 1 - smoothstep(0.78, 1.12, ellipse + coastMod * 0.85);
        baseRaw = 0.255 + shape * 0.42 + continentNoise * 0.08 + shelf * 0.03;
      }

      const plate = noise.cellular(u * plateFreq + 3.3, v * plateFreq - 5.1);
      const boundary = 1 - smoothstep(0.05, 0.34, plate.edge);
      const belt = smoothstep(0.3, 0.7, noise.fbm(u * 2.2 + 12.4, v * 2.2 - 7.2, 4) * 0.5 + 0.5);
      const interior = smoothstep(0.08, 0.44, shape);
      // Anisotropic ridged sampling builds elongated ranges rather than isotropic blobs.
      const orogeny = noise.ridged(u * mountainFreq * 3.3 + 3.7, v * mountainFreq * 1.65 - 8.1, 5);
      const mountainMask = Math.max(boundary * 0.72, belt * 0.8) * interior * (0.55 + continentNoise * 0.45);
      const mountainRaw = Math.pow(orogeny, 1.42) * mountainMask * config.mountainHeight * 0.6;
      const hotspot = Math.pow(1 - smoothstep(0.0, 0.16, noise.cellular(u * 7.4 - 4.2, v * 7.4 + 6.8).f1), 2.6) * interior * smoothstep(0.2, 0.8, config.geologicalVariation);
      volcanism[i] = hotspot;
      const hills = noise.fbm(u * 5.4 + 3.1, v * 5.4 - 4.4, 4);
      const smallDetail = noise.fbm(u * 16.5 + 1.7, v * 16.5 + 8.3, 3);
      const valley = smoothstep(0.56, 0.92, noise.ridged(u * 4.6 - 9.1, v * 4.6 + 2.6, 3));
      const microRelief = (hills * 0.042 + smallDetail * 0.016 * config.detailScale) * config.roughness;
      baseRaw += mountainRaw + microRelief + hotspot * config.mountainHeight * 0.17;
      baseRaw -= valley * config.valleyDensity * 0.045 * interior;
      baseRaw = clamp(baseRaw, 0.005, 1.34);

      if (!Number.isFinite(baseRaw)) baseRaw = 0.3;
      const sea = clamp(config.seaLevel, 0.25, 0.7);
      let h: number;
      if (baseRaw > sea) {
        const norm = (baseRaw - sea) / Math.max(0.16, 1.0 - sea);
        h = Math.pow(norm, 1.14) * ELEVATION_SCALE;
      } else {
        const norm = (sea - baseRaw) / Math.max(0.12, sea);
        h = -Math.pow(norm, 1.25) * 1420 * config.oceanDepth;
      }
      heights[i] = clamp(h, -1600, 3050);
    }
  }

  report("Tectonic assembly", "Continental crust, plate sutures and volcanic provinces solved", 0.18);
  await nextTask();

  // --- Erosion: stream-power incision followed by thermal talus relaxation ---
  if (config.erosion > 0.01) {
    const incisionPasses = config.erosion > 0.6 ? 3 : 2;
    for (let pass = 0; pass < incisionPasses; pass++) {
      report("Hydraulic incision", `Stream-power pass ${pass + 1}/${incisionPasses} · D8 accumulation`, 0.2 + (pass / incisionPasses) * 0.1);
      await nextTask();
      streamPowerPass(heights, n, config.erosion);
    }
    const iterations = Math.round(1 + config.erosion * 4);
    for (let iteration = 0; iteration < iterations; iteration++) {
      report("Thermal relaxation", `Talus diffusion ${iteration + 1}/${iterations}`, 0.3 + (iteration / iterations) * 0.1);
      await nextTask();
      thermalErosion(heights, n, 1, 4 + config.roughness * 8);
    }
    report("Simulation complete", "Drainage and relief budget recomputed", 0.4);
    await nextTask();
  }

  const finalFill = priorityFlood(heights, n);
  const lakes = extractLakes(heights, finalFill.filled, n, config);
  const { downstream, flowDirection } = routeFlow(heights, finalFill.filled, finalFill.rank, n);
  const flowAccumulation = accumulate(downstream, finalFill.order, heights);
  const slope = slopeField(heights, n, spacing);

  report("Drainage routing", "Priority-flood fill, D8 steepest descent, watershed labels", 0.5);
  await nextTask();

  // Propagate watershed / terminal targets downstream → upstream (ascending fill order).
  const watershed = new Int32Array(total).fill(-1);
  const drainageTarget = new Uint8Array(total);
  for (let k = 0; k < finalFill.order.length; k++) {
    const c = finalFill.order[k];
    const x = c % n;
    const y = (c / n) | 0;
    if (heights[c] < 0) { drainageTarget[c] = 1; continue; }
    const d = downstream[c];
    if (lakes.lakeMask[c]) {
      // A lake spills along its downstream path in the filled surface; it is not a
      // terminal sink. Keep the lake's own watershed label while inheriting the spill target.
      drainageTarget[c] = d >= 0 ? drainageTarget[d] || 3 : 3;
      watershed[c] = 200000 + lakes.lakeId[c];
      continue;
    }
    if (d < 0) {
      drainageTarget[c] = 3;
      watershed[c] = 300000 + c;
    } else if (heights[d] < 0) {
      drainageTarget[c] = 1;
      watershed[c] = nextWatershedGroup(x, y, n);
    } else if (lakes.lakeMask[d]) {
      drainageTarget[c] = drainageTarget[d] || 3;
      watershed[c] = 200000 + lakes.lakeId[d];
    } else {
      drainageTarget[c] = drainageTarget[d] || 3;
      watershed[c] = watershed[d] >= 0 ? watershed[d] : -1;
    }
  }

  const riverMask = new Uint8Array(total);
  const riverThreshold = lerp(760, 90, config.riverDensity);
  let riverWidthMax = 1;
  for (let i = 0; i < total; i++) {
    if (heights[i] < 1 || lakes.lakeMask[i]) continue;
    if (flowAccumulation[i] >= riverThreshold) {
      riverMask[i] = 1;
      riverWidthMax = Math.max(riverWidthMax, Math.log(flowAccumulation[i] + 1));
    }
  }

  report("Climate synthesis", "Coastal fetch, orographic lift, rain-shadow and lapse rate", 0.61);
  await nextTask();

  const coastDistance = coastDistanceField(heights, n);
  const temperature = new Float32Array(total);
  const moisture = new Float32Array(total);
  const temporalNoise = createNoise(config.seed ^ 0x51f15e);
  const windFromWest = config.windBias >= 0.5;
  for (let y = 0; y < n; y++) {
    if (y % 32 === 31) {
      report("Climate synthesis", `Advecting moisture · latitude band ${y + 1}/${n}`, 0.6 + (y / n) * 0.09);
      await nextTask();
    }
    const v = y / (n - 1);
    // Abstract equator-to-pole gradient. At a 12 km map extent true latitude is
    // negligible; this is a deliberate macro-climate design control.
    const lat = Math.abs(v - config.latitude) * 1.8;
    let carried = 0.62 + config.moisture * 0.22;
    for (let row = 0; row < n; row++) {
      const x = windFromWest ? row : n - 1 - row;
      const i = y * n + x;
      const u = x / (n - 1);
      const h = heights[i];
      const upwindX = windFromWest ? x - 1 : x + 1;
      const westH = x > 0 ? heights[i - 1] : h;
      const eastH = x < n - 1 ? heights[i + 1] : h;
      const advectedH = upwindX >= 0 && upwindX < n ? heights[y * n + upwindX] : h;
      // Continuous wind bias: the effective upwind terrace blends both directions,
      // so a 0.0–1.0 control produces a genuine gradient in orographic response.
      const prevH = advectedH * 0.55 + (westH * config.windBias + eastH * (1 - config.windBias)) * 0.45;
      const localNoise = temporalNoise.fbm(u * 3.6 + 2.7, v * 3.6 - 1.9, 3);
      const regionalWet = temporalNoise.fbm(u * 1.9 - 5.3, v * 1.9 + 7.1, 4);
      const elevLapse = Math.max(0, h) * 0.0062;
      temperature[i] = config.baseTemperature - lat * 24 - elevLapse + localNoise * 2.6 - (lakes.lakeMask[i] ? 1.3 : 0);
      if (h < 0) {
        carried = 0.7 + config.moisture * 0.25 + localNoise * 0.04;
        moisture[i] = 1;
        continue;
      }
      const uplift = Math.max(0, h - prevH);
      const leeDrop = Math.max(0, prevH - h);
      const orographic = clamp(uplift / 16, 0, 1);
      const rainout = carried * orographic * (0.16 + config.rainShadow * 0.4);
      carried = clamp(carried - rainout + config.moisture * 0.016, 0.04, 1);
      const inland = clamp(coastDistance[i] / (10 + config.widthKm * 2.2), 0, 1);
      const continentalDry = inland * inland * (1 - config.moisture) * 0.42;
      const coastal = Math.exp(-coastDistance[i] / 20) * 0.14;
      const lee = clamp(leeDrop / 26, 0, 1) * config.rainShadow * 0.24;
      const riparian = flowAccumulation[i] > lerp(900, 120, config.riverDensity) ? 0.06 : 0;
      moisture[i] = clamp(
        0.25 + config.moisture * 0.38 + regionalWet * 0.16 + (localNoise * 0.5 + 0.5) * 0.1 +
        coastal + riparian + carried * 0.16 - continentalDry - lee,
        0,
        1,
      );
    }
  }

  report("Biome classification", "Whittaker-style temperature/moisture provinces + majority smoothing", 0.71);
  await nextTask();

  const biome = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    biome[i] = classifyBiome(temperature[i], moisture[i], heights[i], slope[i], lakes.lakeMask[i] === 1, volcanism[i]);
  }
  smoothBiomes(biome, n);

  report("Environment scattering", "Rule-based vegetation, rock and landmark distribution", 0.82);
  await nextTask();

  const objects = placeObjects(config, n, heights, slope, biome, coastDistance, lakes.lakeMask, riverMask, temperature, moisture);

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < total; i++) {
    minHeight = Math.min(minHeight, heights[i]);
    maxHeight = Math.max(maxHeight, heights[i]);
  }

  report("Quality assessment", "Measuring relief, hydrology, ecology and spatial diversity", 0.92);
  await nextTask();

  const world: WorldData = {
    config: { ...config, resolution: n },
    resolution: n,
    heights,
    slope,
    waterDepth: lakes.waterDepth,
    lakeMask: lakes.lakeMask,
    riverMask,
    flowAccumulation,
    flowDirection,
    watershed,
    drainageTarget,
    temperature,
    moisture,
    biome,
    coastDistance,
    objects,
    maxHeight,
    minHeight,
    lakeSurface: lakes.lakeSurface,
    metrics: {} as WorldMetrics,
    quality: {} as QualityAssessment,
    generationMs: 0,
    revision: 1,
    riverWidthMax,
  };
  const { metrics, quality } = computeMetrics(world);
  world.metrics = metrics;
  world.quality = quality;
  world.generationMs = performance.now() - started;
  report("Generation complete", `${(world.generationMs / 1000).toFixed(2)} s · seed ${config.seed}`, 1);
  return world;
}

/** Recompute measured information after an interactive edit without regenerating base noise. */
export function refreshWorld(world: WorldData): WorldData {
  const n = world.resolution;
  const spacing = (world.config.widthKm * 1000) / Math.max(1, n - 1);
  const slope = slopeField(world.heights, n, spacing);
  const fill = priorityFlood(world.heights, n);
  const lakes = extractLakes(world.heights, fill.filled, n, world.config);
  const { downstream, flowDirection } = routeFlow(world.heights, fill.filled, fill.rank, n);
  const flowAccumulation = accumulate(downstream, fill.order, world.heights);
  const watershed = new Int32Array(n * n).fill(-1);
  const drainageTarget = new Uint8Array(n * n);
  for (let k = 0; k < fill.order.length; k++) {
    const c = fill.order[k];
    const x = c % n;
    const y = (c / n) | 0;
    if (world.heights[c] < 0) { drainageTarget[c] = 1; continue; }
    const d = downstream[c];
    if (lakes.lakeMask[c]) {
      drainageTarget[c] = d >= 0 ? drainageTarget[d] || 3 : 3;
      watershed[c] = 200000 + lakes.lakeId[c];
      continue;
    }
    if (d < 0) { drainageTarget[c] = 3; watershed[c] = 300000 + c; }
    else if (world.heights[d] < 0) { drainageTarget[c] = 1; watershed[c] = nextWatershedGroup(x, y, n); }
    else if (lakes.lakeMask[d]) { drainageTarget[c] = drainageTarget[d] || 3; watershed[c] = 200000 + lakes.lakeId[d]; }
    else {
      drainageTarget[c] = drainageTarget[d] || 3;
      watershed[c] = watershed[d] >= 0 ? watershed[d] : -1;
    }
  }
  const riverMask = new Uint8Array(n * n);
  let riverWidthMax = 1;
  const threshold = lerp(760, 90, world.config.riverDensity);
  for (let i = 0; i < n * n; i++) {
    if (world.heights[i] < 1 || lakes.lakeMask[i]) continue;
    if (flowAccumulation[i] >= threshold) {
      riverMask[i] = 1;
      riverWidthMax = Math.max(riverWidthMax, Math.log(flowAccumulation[i] + 1));
    }
  }
  const biome = new Uint8Array(n * n);
  const temperature = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    temperature[i] = clamp(world.temperature[i] + (world.heights[i] - world.heights[i]) * 0.0065, -24, 42);
    biome[i] = classifyBiome(temperature[i], world.moisture[i], world.heights[i], slope[i], lakes.lakeMask[i] === 1, world.biome[i] === VOLCANIC ? 0.8 : 0);
  }
  smoothBiomes(biome, n);
  const objects: WorldObject[] = [];
  for (const object of world.objects) {
    const gx = Math.min(n - 1, Math.max(0, Math.round(object.x * (n - 1))));
    const gz = Math.min(n - 1, Math.max(0, Math.round(object.z * (n - 1))));
    const i = gz * n + gx;
    if (world.heights[i] < 1 || lakes.lakeMask[i] || slope[i] > 0.95) continue;
    objects.push({ ...object, y: world.heights[i], biome: biome[i] });
  }
  const next: WorldData = {
    ...world,
    slope,
    biome,
    temperature,
    objects,
    waterDepth: lakes.waterDepth,
    lakeMask: lakes.lakeMask,
    lakeSurface: lakes.lakeSurface,
    riverMask,
    flowAccumulation,
    flowDirection,
    watershed,
    drainageTarget,
    riverWidthMax,
    revision: world.revision + 1,
  };
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < n * n; i++) {
    minHeight = Math.min(minHeight, world.heights[i]);
    maxHeight = Math.max(maxHeight, world.heights[i]);
  }
  next.minHeight = minHeight;
  next.maxHeight = maxHeight;
  const { metrics, quality } = computeMetrics(next);
  next.metrics = metrics;
  next.quality = quality;
  return next;
}

export type GeoProcess = "hydraulic" | "thermal" | "channel-smoothing";

/**
 * Run one geomorphic process on a copy of the current field.
 * - hydraulic: stream-power incision (energy ∝ accumulation^0.44 × slope)
 * - thermal: talus-limited diffusion
 * - channel-smoothing: low-talus thermal pass biased to low relief
 * All resulting fields are re-routed and re-measured before returning.
 */
export function simulateProcess(world: WorldData, process: GeoProcess, intensity: number): WorldData {
  const n = world.resolution;
  const heights = new Float32Array(world.heights);
  const bounded = clamp(intensity, 0.05, 1);
  if (process === "hydraulic") {
    streamPowerErosion(heights, n, { ...world.config, erosion: bounded }, 2 + Math.round(bounded * 2));
  } else if (process === "thermal") {
    thermalErosion(heights, n, Math.max(1, Math.round(bounded * 6)), 2.5 + world.config.roughness * 6);
  } else {
    thermalErosion(heights, n, Math.max(1, Math.round(bounded * 5)), 0.35);
  }
  const updated = { ...world, heights, revision: world.revision + 1 };
  const refreshed = refreshWorld(updated);
  return { ...refreshed, generationMs: world.generationMs, config: world.config };
}

/** Real-time editing kernel. Mutates a supplied height copy in metres. */
export function applyTerrainBrush(
  heights: Float32Array,
  n: number,
  centerX: number,
  centerZ: number,
  radiusCells: number,
  strength: number,
  tool: "raise" | "lower" | "smooth" | "flatten",
  targetHeight = 0,
) {
  const cx = Math.round(centerX * (n - 1));
  const cz = Math.round(centerZ * (n - 1));
  const r = Math.max(1, Math.round(radiusCells));
  const snapshot = tool === "smooth" ? new Float32Array(heights) : null;
  for (let z = Math.max(0, cz - r); z <= Math.min(n - 1, cz + r); z++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x++) {
      const dist = Math.hypot(x - cx, z - cz) / r;
      if (dist > 1) continue;
      const falloff = Math.pow(1 - dist * dist, 1.65);
      const i = z * n + x;
      if (tool === "raise") heights[i] += falloff * strength * 26;
      else if (tool === "lower") heights[i] -= falloff * strength * 26;
      else if (tool === "flatten") heights[i] += (targetHeight - heights[i]) * falloff * strength * 0.33;
      else if (tool === "smooth" && snapshot) {
        let sum = 0;
        let count = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
            sum += snapshot[nz * n + nx];
            count++;
          }
        }
        heights[i] += (sum / count - heights[i]) * falloff * strength;
      }
      heights[i] = clamp(heights[i], -1600, 3200);
    }
  }
}
