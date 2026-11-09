import { BIOMES, type QualityAssessment, type QualityBreakdown, type WorldData, type WorldMetrics } from "./types";
import { clamp, smoothstep } from "./noise";

const HIST_BINS = 32;

function percentileFromHistogram(hist: number[], total: number, p: number): number {
  if (total <= 0) return 0;
  const target = total * p;
  let sum = 0;
  for (let i = 0; i < hist.length; i++) {
    sum += hist[i];
    if (sum >= target) return i / (hist.length - 1);
  }
  return 1;
}

/**
 * Every number in this module is measured from the generated arrays.
 * Elevation percentiles use 32-bin histograms (documented ±bin quantisation).
 * Slope is rise/run in metres, displayed as degrees elsewhere.
 */
export function computeMetrics(world: WorldData): { metrics: WorldMetrics; quality: QualityAssessment } {
  const n = world.resolution;
  const total = n * n;
  const land = new Float32Array(total);
  let landCount = 0;
  let oceanCount = 0;
  let lakeCount = 0;
  let riverCount = 0;
  let elevSum = 0;
  let elevSqSum = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let slopeSum = 0;
  let slopeSqSum = 0;
  let flatCount = 0;
  let mountainCount = 0;
  let roughnessSum = 0;
  let tempSum = 0;
  let moistSum = 0;
  let coastSum = 0;
  const biomeCounts = new Uint32Array(BIOMES.length);
  const elevationHistogram = new Array<number>(HIST_BINS).fill(0);
  const slopeHistogram = new Array<number>(HIST_BINS).fill(0);
  const SLOPE_CAP = Math.tan((70 * Math.PI) / 180);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const h = world.heights[i];
      const s = world.slope[i];
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
      slopeSum += s;
      slopeSqSum += s * s;
      slopeHistogram[clamp(Math.floor((s / SLOPE_CAP) * HIST_BINS), 0, HIST_BINS - 1)]++;
      if (s < Math.tan((3 * Math.PI) / 180)) flatCount++;
      if (h > 600) mountainCount++;
      if (h < 0) {
        oceanCount++;
      } else {
        land[landCount++] = h;
        elevSum += h;
        elevSqSum += h * h;
        if (world.lakeMask[i]) lakeCount++;
        if (world.riverMask[i]) riverCount++;
        tempSum += world.temperature[i];
        moistSum += world.moisture[i];
        coastSum += world.coastDistance[i];
        const xm = x > 0 ? i - 1 : i;
        const xp = x < n - 1 ? i + 1 : i;
        const ym = y > 0 ? i - n : i;
        const yp = y < n - 1 ? i + n : i;
        roughnessSum += Math.abs(h - (world.heights[xm] + world.heights[xp] + world.heights[ym] + world.heights[yp]) / 4);
      }
      if (h >= 0) biomeCounts[world.biome[i]]++;
    }
  }

  // elevation histogram over land only
  const elevRange = Math.max(1, maxHeight);
  for (let i = 0; i < landCount; i++) {
    const b = clamp(Math.floor((land[i] / elevRange) * HIST_BINS), 0, HIST_BINS - 1);
    elevationHistogram[b]++;
  }

  const meanElevation = landCount ? elevSum / landCount : 0;
  const elevationStdDev = landCount ? Math.sqrt(Math.max(0, elevSqSum / landCount - meanElevation * meanElevation)) : 0;
  const meanSlope = slopeSum / total;
  const medianElevation = percentileFromHistogram(elevationHistogram, landCount, 0.5) * elevRange;
  const slopeP95 = percentileFromHistogram(slopeHistogram, total, 0.95) * SLOPE_CAP;

  // Coastline complexity: number of orthogonal ocean/land transitions normalised by sqrt(land area).
  let coastEdges = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (world.heights[i] < 0) continue;
      if (x + 1 < n && world.heights[i + 1] < 0) coastEdges++;
      if (y + 1 < n && world.heights[i + n] < 0) coastEdges++;
    }
  }
  const coastlineComplexity = landCount ? clamp(coastEdges / Math.sqrt(landCount) / 2.2, 0, 1) : 0;

  // Drainage connectivity measured from propagated terminal targets.
  let drainOcean = 0;
  let drainLake = 0;
  let drainClosed = 0;
  const watershedSet = new Set<number>();
  for (let i = 0; i < total; i++) {
    if (world.heights[i] < 0 || world.lakeMask[i]) continue;
    if (world.drainageTarget[i] === 1) drainOcean++;
    else if (world.drainageTarget[i] === 2) drainLake++;
    else if (world.drainageTarget[i] === 3) drainClosed++;
    if (world.flowAccumulation[i] > 180 && world.watershed[i] >= 0) watershedSet.add(world.watershed[i]);
  }
  const drained = drainOcean + drainLake + drainClosed;
  const riverConnectivity = drained ? drainOcean / drained : 0;

  const landBiomeTotal = Math.max(1, landCount);
  const biomeCoverage = BIOMES.map((b, idx) => ({
    key: b.key,
    label: b.label,
    color: b.color,
    share: landCount ? (biomeCounts[idx] as number) / landBiomeTotal : 0,
  })).filter((b) => b.share > 0.0002);
  let shannon = 0;
  for (const b of biomeCoverage) {
    if (b.share > 0) shannon -= b.share * Math.log(b.share);
  }
  const shannonDiversity = shannon;
  const largestBiomeShare = biomeCoverage.reduce((m, b) => Math.max(m, b.share), 0);
  const forestShare = biomeCoverage.filter((b) => ["forest", "rainforest", "wetland"].includes(b.key)).reduce((s, b) => s + b.share, 0);

  const landCoverage = landCount / total;
  const oceanCoverage = oceanCount / total;
  const waterCoverage = (oceanCount + lakeCount + riverCount) / total;
  const meanTemp = landCount ? tempSum / landCount : 0;
  const meanMoisture = landCount ? moistSum / landCount : 0;
  const accessibility = landCount ? coastSum / landCount : 0;

  // Scenic index: relief + visible water + biome variety, all measured.
  const relief = clamp((maxHeight - meanElevation) / 900, 0, 1);
  const waterView = clamp((lakeCount + riverCount) / Math.max(1, landCount) * 18, 0, 1);
  const scenicIndex = clamp(relief * 0.45 + waterView * 0.25 + clamp(shannon / 2.2, 0, 1) * 0.3, 0, 1);

  const metrics: WorldMetrics = {
    meanElevation,
    maxElevation: maxHeight,
    minElevation: minHeight,
    medianElevation,
    elevationStdDev,
    landCoverage,
    waterCoverage,
    oceanCoverage,
    lakeCoverage: lakeCount / total,
    riverCellShare: riverCount / total,
    meanSlope,
    slopeP95,
    flatShare: flatCount / total,
    mountainShare: mountainCount / total,
    roughness: landCount ? roughnessSum / landCount : 0,
    coastlineComplexity,
    riverConnectivity,
    watersheds: watershedSet.size,
    drainageDensity: landCount ? (riverCount / landCount) * 1000 : 0,
    shannonDiversity,
    largestBiomeShare,
    forestShare,
    biomeCoverage,
    meanTemperature: meanTemp,
    meanMoisture,
    objectDensity: landCount ? (world.objects.length / landCount) * 1000 : 0,
    objectCount: world.objects.length,
    accessibility,
    scenicIndex,
    elevationHistogram,
    slopeHistogram,
  };

  const quality = assessQuality(metrics, world);
  return { metrics, quality };
}

export function assessQuality(m: WorldMetrics, world: WorldData): QualityAssessment {
  const waterTarget = 100 - Math.min(100, Math.abs(m.waterCoverage - 0.24) * 260);
  const hydrology = clamp(waterTarget * 0.46 + m.riverConnectivity * 100 * 0.36 + clamp(m.lakeCoverage * 900, 0, 100) * 0.18, 0, 100);
  const reliefVariety = clamp((m.elevationStdDev / 235) * 100, 0, 100);
  const peakScore = clamp((m.maxElevation / 1150) * 100, 0, 100);
  const terrain = clamp(reliefVariety * 0.58 + peakScore * 0.24 + clamp((m.meanSlope / 0.24) * 100, 0, 100) * 0.18, 0, 100);
  const diversity = clamp((m.shannonDiversity / Math.log(10)) * 100, 0, 100);
  const balance = clamp((0.44 - m.largestBiomeShare) / 0.36 * 100, 0, 100);
  const ecology = clamp(diversity * 0.56 + balance * 0.24 + clamp(m.meanMoisture / 0.58, 0, 1) * 100 * 0.2, 0, 100);
  const coast = clamp(m.coastlineComplexity * 100 * 0.7 + (100 - Math.abs(m.landCoverage - 0.68) * 240) * 0.3, 0, 100);
  const detailTarget = clamp(m.objectDensity / 9, 0, 1) * 100;
  const detail = clamp(detailTarget * 0.55 + clamp(m.forestShare / 0.42, 0, 1) * 100 * 0.45, 0, 100);
  const stability = clamp(100 - Math.abs(m.meanSlope * 180 / Math.PI - 11) * 3.1 - Math.max(0, m.flatShare - 0.42) * 120, 0, 100);

  const breakdown: QualityBreakdown[] = [
    { label: "Terrain relief", score: Math.round(terrain), weight: 0.22, detail: `σ ${m.elevationStdDev.toFixed(0)} m · peak ${m.maxElevation.toFixed(0)} m` },
    { label: "Hydrology", score: Math.round(hydrology), weight: 0.2, detail: `${(m.waterCoverage * 100).toFixed(1)}% water · ${(m.riverConnectivity * 100).toFixed(0)}% ocean-connected` },
    { label: "Biome diversity", score: Math.round(ecology), weight: 0.2, detail: `${m.biomeCoverage.length} classes · Shannon ${m.shannonDiversity.toFixed(2)}` },
    { label: "Coastal form", score: Math.round(coast), weight: 0.14, detail: `complexity ${(m.coastlineComplexity * 100).toFixed(0)}% · land ${(m.landCoverage * 100).toFixed(0)}%` },
    { label: "World detail", score: Math.round(detail), weight: 0.12, detail: `${m.objectCount.toLocaleString()} objects · forest ${(m.forestShare * 100).toFixed(0)}%` },
    { label: "Surface stability", score: Math.round(stability), weight: 0.12, detail: `mean slope ${(m.meanSlope * 180 / Math.PI).toFixed(1)}° · flat ${(m.flatShare * 100).toFixed(0)}%` },
  ];
  const score = Math.round(clamp(breakdown.reduce((s, b) => s + b.score * b.weight, 0), 0, 100));
  const grade = score >= 88 ? "S" : score >= 78 ? "A" : score >= 66 ? "B" : score >= 52 ? "C" : "D";

  const warnings: string[] = [];
  const suggestions: string[] = [];
  if (m.landCoverage > 0.88) { warnings.push("Land coverage exceeds 88% — coastline variety is limited."); suggestions.push("Raise sea level or reduce landmass fill by 4–8%."); }
  if (m.landCoverage < 0.34) { warnings.push("Only " + (m.landCoverage * 100).toFixed(0) + "% of the surface is land."); suggestions.push("Lower sea level or increase continental uplift."); }
  if (m.waterCoverage < 0.08) { warnings.push("Freshwater coverage is below the 8% floor used by the studio target."); suggestions.push("Increase lake density or reduce erosion sink filling."); }
  if (m.riverConnectivity < 0.62) { warnings.push(`Only ${(m.riverConnectivity * 100).toFixed(0)}% of land drains to the ocean; endorheic basins dominate.`); suggestions.push("Reduce basin closure via sea-level or erosion changes."); }
  if (m.lakeCoverage < 0.0015) { warnings.push("No persistent lake bodies were detected."); suggestions.push("Increase lake distribution above 40%."); }
  if (m.slopeP95 * 180 / Math.PI > 58) { warnings.push("95th-percentile slope exceeds 58° — inspect for cliff artefacts."); suggestions.push("Raise thermal erosion iterations."); }
  if (m.flatShare > 0.46) { warnings.push("Large fraction of near-flat terrain reduces visual relief."); suggestions.push("Increase ridge influence or reduce thermal stabilisation."); }
  if (m.mountainShare < 0.025) { warnings.push("Mountain belts cover less than 2.5% of the world."); suggestions.push("Increase mountain height or frequency."); }
  if (m.largestBiomeShare > 0.46) { warnings.push(`${(m.largestBiomeShare * 100).toFixed(0)}% of land is a single biome — spatial monotony risk.`); suggestions.push("Adjust moisture or temperature span to diversify ecotones."); }
  if (m.objectCount < 40) { warnings.push("Very few environment objects were placed."); suggestions.push("Increase vegetation density or reduce slope rejection."); }
  if (m.riverConnectivity > 0.85 && m.watersheds < 6) { warnings.push("Drainage is coherent but watershed count is low."); suggestions.push("Increase mountain frequency to divide catchments."); }
  if (world.heights.some((h) => !Number.isFinite(h))) { warnings.push("Non-finite height samples were detected — regeneration recommended."); }
  if (!suggestions.length) suggestions.push("World meets target thresholds. Probe new seeds to confirm consistency.");
  if (!warnings.length) warnings.push("No threshold warnings. Metrics are not a substitute for visual inspection.");

  return { score, grade, breakdown, warnings, suggestions };
}

export function describeQuality(q: QualityAssessment): string {
  if (q.score >= 88) return "Production candidate";
  if (q.score >= 78) return "Strong world";
  if (q.score >= 66) return "Usable — needs tuning";
  if (q.score >= 52) return "Uneven composition";
  return "Revise structure";
}

export const qualityBand = (score: number) => smoothstep(30, 92, score);
