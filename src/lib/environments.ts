import type { SunPreset } from "../components/TerrainViewport";

export type EnvironmentId =
  | "temperate"
  | "tropical"
  | "arctic"
  | "volcanic"
  | "desert"
  | "swamp"
  | "redwood"
  | "highlands"
  | "coastal"
  | "deepocean";

export interface EnvironmentPreset {
  id: EnvironmentId;
  label: string;
  description: string;
  sun: SunPreset;
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  waterShallow: string;
  waterDeep: string;
  waterOpacity: number;
  cloudTint: string;
  cloudOpacity: number;
  exposure: number;
  bloom: number;
}

/**
 * Environment presets control atmosphere and water response only. They never
 * mutate the generated world, so switching look does not change determinism.
 */
export const ENVIRONMENTS: EnvironmentPreset[] = [
  {
    id: "temperate", label: "Temperate", description: "Soft maritime light, muted jade water, high thin cloud.",
    sun: "noon", skyTop: "#2c5a70", skyHorizon: "#8fb0a8", fog: "#6d8f8a", fogDensity: 0.00085, sunColor: "#fff1d5", sunIntensity: 2.1,
    hemiSky: "#bcded4", hemiGround: "#3e4233", hemiIntensity: 0.72, waterShallow: "#2f8f92", waterDeep: "#0a2f40", waterOpacity: 0.9,
    cloudTint: "#e8f4ef", cloudOpacity: 0.15, exposure: 1.02, bloom: 0.34,
  },
  {
    id: "tropical", label: "Tropical island", description: "High sun, turquoise shallows, warm haze and bright cumulus.",
    sun: "noon", skyTop: "#1e6d92", skyHorizon: "#bfe0d5", fog: "#8fc5bd", fogDensity: 0.00066, sunColor: "#fff6dd", sunIntensity: 2.45,
    hemiSky: "#cfeee5", hemiGround: "#4c5a3c", hemiIntensity: 0.82, waterShallow: "#37c9c0", waterDeep: "#06617a", waterOpacity: 0.86,
    cloudTint: "#ffffff", cloudOpacity: 0.24, exposure: 1.05, bloom: 0.42,
  },
  {
    id: "arctic", label: "Arctic", description: "Cold low sun, pale sky, glacial water and silver fog.",
    sun: "dawn", skyTop: "#2f4c64", skyHorizon: "#cfd9d9", fog: "#b9c9cb", fogDensity: 0.00115, sunColor: "#d9ecff", sunIntensity: 1.6,
    hemiSky: "#dbeaf0", hemiGround: "#5b6a70", hemiIntensity: 0.9, waterShallow: "#6fb6c4", waterDeep: "#123b52", waterOpacity: 0.92,
    cloudTint: "#f2f8fa", cloudOpacity: 0.3, exposure: 1.0, bloom: 0.28,
  },
  {
    id: "volcanic", label: "Volcanic", description: "Ash-dimmed sunlight, iron-stained water and dense basalt fog.",
    sun: "dusk", skyTop: "#211a22", skyHorizon: "#8c5341", fog: "#5a4038", fogDensity: 0.0019, sunColor: "#ff9f68", sunIntensity: 1.85,
    hemiSky: "#8d7160", hemiGround: "#2a1d1a", hemiIntensity: 0.5, waterShallow: "#4a6b60", waterDeep: "#161d20", waterOpacity: 0.94,
    cloudTint: "#8c7265", cloudOpacity: 0.22, exposure: 1.06, bloom: 0.5,
  },
  {
    id: "desert", label: "Desert", description: "Hard white light, dust haze and pale mineral shallows.",
    sun: "noon", skyTop: "#3a6f92", skyHorizon: "#e2d3ae", fog: "#cdbb9a", fogDensity: 0.0009, sunColor: "#fff2cc", sunIntensity: 2.7,
    hemiSky: "#e6dfc6", hemiGround: "#7d6748", hemiIntensity: 0.8, waterShallow: "#79c1bb", waterDeep: "#1b6570", waterOpacity: 0.88,
    cloudTint: "#f6efe0", cloudOpacity: 0.1, exposure: 1.0, bloom: 0.36,
  },
  {
    id: "swamp", label: "Swamp", description: "Humid green light, murky water and low canopy haze.",
    sun: "dawn", skyTop: "#243f3b", skyHorizon: "#8a9c7c", fog: "#6d7f68", fogDensity: 0.0022, sunColor: "#e4e9b8", sunIntensity: 1.65,
    hemiSky: "#a9bda2", hemiGround: "#313b28", hemiIntensity: 0.62, waterShallow: "#4f7a55", waterDeep: "#14291f", waterOpacity: 0.95,
    cloudTint: "#c4d1b6", cloudOpacity: 0.18, exposure: 1.03, bloom: 0.24,
  },
  {
    id: "redwood", label: "Redwood", description: "Shafted amber light, deep forest fog and dark creek water.",
    sun: "dawn", skyTop: "#2d4a4c", skyHorizon: "#c2a878", fog: "#8f9478", fogDensity: 0.0016, sunColor: "#ffd9a0", sunIntensity: 2.0,
    hemiSky: "#c9c9a4", hemiGround: "#33301f", hemiIntensity: 0.58, waterShallow: "#4f8b82", waterDeep: "#122c2c", waterOpacity: 0.9,
    cloudTint: "#e2d6b8", cloudOpacity: 0.12, exposure: 1.04, bloom: 0.4,
  },
  {
    id: "highlands", label: "Highlands", description: "Clear thin air, long views and cold blue water.",
    sun: "noon", skyTop: "#1f4e72", skyHorizon: "#a8c4c6", fog: "#9db6b6", fogDensity: 0.00055, sunColor: "#fff4de", sunIntensity: 2.3,
    hemiSky: "#c7dee2", hemiGround: "#495043", hemiIntensity: 0.72, waterShallow: "#4aa0a8", waterDeep: "#0b3550", waterOpacity: 0.88,
    cloudTint: "#f3f8f7", cloudOpacity: 0.18, exposure: 1.01, bloom: 0.3,
  },
  {
    id: "coastal", label: "Coastal", description: "Bright surf light, warm sand bounce and strong sea sparkle.",
    sun: "noon", skyTop: "#2a7195", skyHorizon: "#cfe3d8", fog: "#a7c8c1", fogDensity: 0.0008, sunColor: "#fff4d8", sunIntensity: 2.5,
    hemiSky: "#d6ece4", hemiGround: "#6a6349", hemiIntensity: 0.78, waterShallow: "#3fc0bb", waterDeep: "#0a4a60", waterOpacity: 0.85,
    cloudTint: "#ffffff", cloudOpacity: 0.2, exposure: 1.03, bloom: 0.46,
  },
  {
    id: "deepocean", label: "Deep ocean", description: "Heavy marine atmosphere, cold light and abyssal water.",
    sun: "dusk", skyTop: "#142b46", skyHorizon: "#6d8794", fog: "#43606a", fogDensity: 0.0014, sunColor: "#cfe0ec", sunIntensity: 1.7,
    hemiSky: "#9dbcc9", hemiGround: "#1f2f36", hemiIntensity: 0.66, waterShallow: "#2f8c9e", waterDeep: "#041d2b", waterOpacity: 0.93,
    cloudTint: "#c4d3d8", cloudOpacity: 0.26, exposure: 1.0, bloom: 0.32,
  },
];

export const ENVIRONMENT_BY_ID = Object.fromEntries(ENVIRONMENTS.map((environment) => [environment.id, environment])) as Record<EnvironmentId, EnvironmentPreset>;
