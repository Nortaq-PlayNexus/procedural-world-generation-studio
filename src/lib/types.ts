export type Landmass = "continent" | "island" | "archipelago" | "pangaea";

export interface WorldConfig {
  name: string;
  seed: number;
  resolution: number;
  landmass: Landmass;
  widthKm: number;
  heightKm: number;
  seaLevel: number;
  coastline: number;
  mountainFrequency: number;
  mountainHeight: number;
  roughness: number;
  valleyDensity: number;
  detailScale: number;
  domainWarp: number;
  oceanDepth: number;
  lakeDensity: number;
  erosion: number;
  geologicalVariation: number;
  latitude: number;
  baseTemperature: number;
  moisture: number;
  rainShadow: number;
  windBias: number;
  riverDensity: number;
  vegetationDensity: number;
  rockDensity: number;
  landmarkDensity: number;
}

export type ObjectKind =
  | "redwood"
  | "pine"
  | "jungle"
  | "palm"
  | "shrub"
  | "boulder"
  | "rock"
  | "grass tuft"
  | "ruin"
  | "obelisk";

export interface WorldObject {
  x: number;
  z: number;
  y: number;
  kind: ObjectKind;
  scale: number;
  rotation: number;
  biome: number;
}

export interface BiomeDefinition {
  id: number;
  key: string;
  label: string;
  color: string;
  vegetation: number;
  rock: number;
  scientific: string;
}

export const BIOMES: BiomeDefinition[] = [
  { id: 0, key: "ocean", label: "Abyssal ocean", color: "#0d3345", vegetation: 0, rock: 0, scientific: "Subaqueous — below littoral datum" },
  { id: 1, key: "beach", label: "Littoral strand", color: "#cfc095", vegetation: 0.04, rock: 0.06, scientific: "Sandy coast — wave-worked sediment" },
  { id: 2, key: "wetland", label: "Wetland", color: "#4d7060", vegetation: 0.8, rock: 0.01, scientific: "Hydric soil — persistent saturation" },
  { id: 3, key: "rainforest", label: "Rainforest", color: "#1c5236", vegetation: 1, rock: 0.01, scientific: "Evergreen broadleaf — high precipitation" },
  { id: 4, key: "forest", label: "Temperate forest", color: "#416b47", vegetation: 0.85, rock: 0.03, scientific: "Mixed canopy — humid temperate" },
  { id: 5, key: "grassland", label: "Grassland", color: "#7f8b4c", vegetation: 0.4, rock: 0.04, scientific: "Poaceae dominant — moderate rainfall" },
  { id: 6, key: "savanna", label: "Savanna", color: "#a29556", vegetation: 0.3, rock: 0.05, scientific: "Grass with scattered canopy — seasonal rain" },
  { id: 7, key: "desert", label: "Desert", color: "#c0a46b", vegetation: 0.04, rock: 0.14, scientific: "Arid — potential evapotranspiration exceeds rainfall" },
  { id: 8, key: "shrubland", label: "Shrubland", color: "#898454", vegetation: 0.22, rock: 0.1, scientific: "Sclerophyll shrub — semi-arid" },
  { id: 9, key: "alpine", label: "Alpine", color: "#78827d", vegetation: 0.12, rock: 0.3, scientific: "Above tree line — cryoturbation" },
  { id: 10, key: "tundra", label: "Tundra", color: "#9aa39b", vegetation: 0.14, rock: 0.16, scientific: "Permafrost — short growing season" },
  { id: 11, key: "snow", label: "Snowfield", color: "#e3e8e7", vegetation: 0.01, rock: 0.08, scientific: "Nival — permanent snow/ice cover" },
  { id: 12, key: "volcanic", label: "Volcanic", color: "#4a3e3a", vegetation: 0.03, rock: 0.42, scientific: "Basaltic province — primary succession" },
];

export const BIOME_BY_KEY = Object.fromEntries(BIOMES.map((b) => [b.key, b])) as Record<string, BiomeDefinition>;

export interface WorldMetrics {
  meanElevation: number;
  maxElevation: number;
  minElevation: number;
  medianElevation: number;
  elevationStdDev: number;
  landCoverage: number;
  waterCoverage: number;
  oceanCoverage: number;
  lakeCoverage: number;
  riverCellShare: number;
  meanSlope: number;
  slopeP95: number;
  flatShare: number;
  mountainShare: number;
  roughness: number;
  coastlineComplexity: number;
  riverConnectivity: number;
  watersheds: number;
  drainageDensity: number;
  shannonDiversity: number;
  largestBiomeShare: number;
  forestShare: number;
  biomeCoverage: { key: string; label: string; color: string; share: number }[];
  meanTemperature: number;
  meanMoisture: number;
  objectDensity: number;
  objectCount: number;
  accessibility: number;
  scenicIndex: number;
  elevationHistogram: number[];
  slopeHistogram: number[];
}

export interface QualityBreakdown {
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface QualityAssessment {
  score: number;
  grade: string;
  breakdown: QualityBreakdown[];
  warnings: string[];
  suggestions: string[];
}

export interface WorldData {
  config: WorldConfig;
  resolution: number;
  heights: Float32Array;
  slope: Float32Array;
  waterDepth: Float32Array;
  lakeMask: Uint8Array;
  riverMask: Uint8Array;
  flowAccumulation: Float32Array;
  flowDirection: Int8Array;
  watershed: Int32Array;
  /** Terminal drainage target: 0 unknown, 1 ocean, 2 lake, 3 closed basin. */
  drainageTarget: Uint8Array;
  temperature: Float32Array;
  moisture: Float32Array;
  biome: Uint8Array;
  coastDistance: Float32Array;
  objects: WorldObject[];
  maxHeight: number;
  minHeight: number;
  lakeSurface: Float32Array;
  metrics: WorldMetrics;
  quality: QualityAssessment;
  generationMs: number;
  revision: number;
  riverWidthMax: number;
}

export interface GenerationProgress {
  phase: string;
  detail: string;
  progress: number;
}

export interface TerrainPatch {
  /** Base64-encoded Uint16LE heights. */
  data: string;
  min: number;
  max: number;
  resolution: number;
  count: number;
}

export interface SavedProject {
  id: string;
  name: string;
  config: WorldConfig;
  createdAt: number;
  updatedAt: number;
  seed: number;
  score: number;
  generationMs: number;
  /** Present when the world contains hand-edited terrain. */
  terrain?: TerrainPatch;
}

export interface HistoryEntry {
  id: string;
  label: string;
  config: WorldConfig;
  seed: number;
  score: number;
  at: number;
  generationMs: number;
}

export interface PerfStats {
  fps: number;
  frameMs: number;
  triangles: number;
  drawCalls: number;
  geometryMem: number;
  textureMem: number;
  viewportWidth: number;
  viewportHeight: number;
}
