import type { WorldConfig } from "./types";

export const BASE_CONFIG: WorldConfig = {
  name: "Verdant Expanse",
  seed: 577,
  resolution: 320,
  landmass: "continent",
  widthKm: 12,
  heightKm: 12,
  seaLevel: 0.46,
  coastline: 0.64,
  mountainFrequency: 0.52,
  mountainHeight: 0.74,
  roughness: 0.56,
  valleyDensity: 0.46,
  detailScale: 0.82,
  domainWarp: 0.42,
  oceanDepth: 0.62,
  lakeDensity: 0.56,
  erosion: 0.54,
  geologicalVariation: 0.36,
  latitude: 0.5,
  baseTemperature: 26,
  moisture: 0.6,
  rainShadow: 0.56,
  windBias: 0.4,
  riverDensity: 0.62,
  vegetationDensity: 0.74,
  rockDensity: 0.5,
  landmarkDensity: 0.36,
};

export interface WorldPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  swatch: [string, string];
  config: WorldConfig;
}

const preset = (id: string, name: string, tagline: string, description: string, swatch: [string, string], overrides: Partial<WorldConfig>): WorldPreset => ({
  id,
  name,
  tagline,
  description,
  swatch,
  config: { ...BASE_CONFIG, ...overrides, name },
});

export const PRESETS: WorldPreset[] = [
  preset(
    "verdant",
    "Verdant Expanse",
    "Balanced continent",
    "A temperate continental world with coherent orographic rain shadows, dendritic drainage and mixed forest. The studio calibration baseline.",
    ["#4d7a58", "#a8d5b5"],
    {},
  ),
  preset(
    "isles",
    "Shattered Isles",
    "Archipelago",
    "Fragmented island arcs with narrow fetch distances, high coastal complexity and salt-tolerant littoral ecotones.",
    ["#23677c", "#9ad9d4"],
    {
      seed: 2026,
      landmass: "archipelago",
      seaLevel: 0.51,
      coastline: 0.88,
      mountainFrequency: 0.62,
      mountainHeight: 0.66,
      oceanDepth: 0.78,
      erosion: 0.46,
      moisture: 0.68,
      rainShadow: 0.38,
      lakeDensity: 0.38,
      vegetationDensity: 0.8,
      riverDensity: 0.56,
      baseTemperature: 27,
    },
  ),
  preset(
    "caldera",
    "Ashen Caldera",
    "Volcanic province",
    "A high-volcanism province with basaltic centres, primary-succession barrens and mineral-rich highlands. Reduced vegetation, strong geological variation.",
    ["#5a3d2f", "#f2a65a"],
    {
      seed: 1234,
      landmass: "pangaea",
      seaLevel: 0.47,
      mountainFrequency: 0.68,
      mountainHeight: 0.92,
      roughness: 0.78,
      geologicalVariation: 0.94,
      erosion: 0.48,
      baseTemperature: 29,
      moisture: 0.41,
      rainShadow: 0.74,
      vegetationDensity: 0.42,
      rockDensity: 0.86,
      lakeDensity: 0.34,
      landmarkDensity: 0.55,
    },
  ),
  preset(
    "frost",
    "Frostmarch",
    "Glacial reach",
    "A cold high-latitude world dominated by tundra, nival cover and freeze-thaw rock fields. Tectonic relief remains prominent above the tree line.",
    ["#7fa8b8", "#eef5f6"],
    {
      seed: 8675309,
      seaLevel: 0.44,
      coastline: 0.62,
      latitude: 0.42,
      baseTemperature: 5,
      moisture: 0.5,
      mountainHeight: 0.84,
      roughness: 0.66,
      erosion: 0.7,
      lakeDensity: 0.72,
      vegetationDensity: 0.44,
      rockDensity: 0.64,
      geologicalVariation: 0.28,
      riverDensity: 0.58,
    },
  ),
  preset(
    "redstone",
    "Redstone Basin",
    "Arid interior",
    "A warm interior basin behind a western orographic barrier. Wide rain-shadow deserts, exotic drainages and evaporite flats.",
    ["#7d5a3c", "#dfb47f"],
    {
      seed: 42,
      landmass: "continent",
      seaLevel: 0.42,
      coastline: 0.8,
      mountainFrequency: 0.74,
      mountainHeight: 0.88,
      roughness: 0.6,
      valleyDensity: 0.68,
      baseTemperature: 31,
      moisture: 0.3,
      rainShadow: 0.94,
      windBias: 0.82,
      lakeDensity: 0.26,
      riverDensity: 0.48,
      vegetationDensity: 0.3,
      geologicalVariation: 0.5,
      erosion: 0.62,
    },
  ),
  preset(
    "reach",
    "Pangaean Reach",
    "Supercontinent",
    "A single vast landmass with interior endorheic basins, great mountain sutures and continental-scale rain shadows.",
    ["#5a6c45", "#c4b282"],
    {
      seed: 314159,
      landmass: "pangaea",
      seaLevel: 0.41,
      coastline: 0.5,
      mountainFrequency: 0.58,
      mountainHeight: 0.7,
      oceanDepth: 0.7,
      interiorMoisture: 0.5,
      moisture: 0.48,
      rainShadow: 0.82,
      lakeDensity: 0.64,
      riverDensity: 0.7,
      vegetationDensity: 0.62,
    } as Partial<WorldConfig>,
  ),
];

export function cloneConfig(config: WorldConfig): WorldConfig {
  return { ...config };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 9_000_000) + 1000;
}

export function randomiseConfig(config: WorldConfig): WorldConfig {
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  return {
    ...config,
    seed: randomSeed(),
    seaLevel: rand(0.4, 0.54),
    coastline: rand(0.45, 0.92),
    mountainFrequency: rand(0.3, 0.82),
    mountainHeight: rand(0.42, 0.95),
    roughness: rand(0.32, 0.82),
    valleyDensity: rand(0.2, 0.8),
    erosion: rand(0.25, 0.78),
    lakeDensity: rand(0.25, 0.82),
    moisture: rand(0.35, 0.75),
    rainShadow: rand(0.3, 0.9),
    baseTemperature: rand(4, 30),
    vegetationDensity: rand(0.35, 0.9),
  };
}
