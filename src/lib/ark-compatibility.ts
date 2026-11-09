import type { WorldData } from "./types";

/**
 * ARK / Unreal landscape compatibility assessment.
 *
 * Sources verified before writing these rules:
 *  - Epic, "Creating and Using Custom Heightmaps and Layers": native heightmap =
 *    single-channel grayscale 16 bpp; target layers = single-channel grayscale
 *    8 bpp and MUST match the Landscape actor's overall resolution.
 *  - Epic, "Landscape Technical Guide": height values map to -256…255.992 and are
 *    multiplied by the import Z scale; resolutions derive from
 *    (components × quads per component + 1).
 *  - Wildcard, "ARK DevKit Docs — Creating New Maps": ASA uses World Partition;
 *    World Composition is no longer supported.
 *  - ARK Modding Wiki, "Terrain Heightmap": 16-bit grayscale, sRGB off,
 *    TC_VectorDisplacementmap or TC_Greyscale compression.
 *
 * Nothing here is verified by importing into Unreal or cooking an ARK map. The
 * report therefore never emits a "compatible" or "playable" verdict.
 */

/**
 * Canonical compatibility disclosure. Every surface that describes ARK output
 * must render THIS text: the export dialog, field guide, compatibility JSON,
 * machine metadata and the bundle README. Tests assert exact equality so the
 * wording cannot drift or be weakened in one place while another overstates.
 */
export const ARK_COMPATIBILITY_DISCLOSURE = {
  headline: "Compatibility status: source data only — not a playable ARK map.",
  contents:
    "The bundle contains engine-importable terrain source: 16-bit grayscale heightmaps (PNG and RAW), separate 8-bit single-channel landscape target-layer weight maps, and supporting biome/hydrology/index maps.",
  notIncluded:
    "It does not contain a cooked map, a Landscape actor or its material, shared layer info, ARK biome volumes, spawner containers, map settings or GameMode/game-data overrides.",
  projectStructure:
    "ASE maps use a landscape plus sublevels. ASA uses World Partition and no longer supports World Composition.",
  verification:
    "Neither target has been imported or cooked here, so no in-engine compatibility verdict is claimed.",
  dataHonesty:
    "Resource and spawn maps are documented design hypotheses, not verified creature or loot spawn data.",
} as const;

export const ARK_COMPATIBILITY_DISCLOSURE_TEXT = [
  ARK_COMPATIBILITY_DISCLOSURE.headline,
  `${ARK_COMPATIBILITY_DISCLOSURE.contents} ${ARK_COMPATIBILITY_DISCLOSURE.notIncluded}`,
  `${ARK_COMPATIBILITY_DISCLOSURE.projectStructure} ${ARK_COMPATIBILITY_DISCLOSURE.verification}`,
  ARK_COMPATIBILITY_DISCLOSURE.dataHonesty,
].join("\n\n");

export type ArkTarget = "ase" | "asa";
export type ArkCheckStatus = "satisfied" | "advisory" | "in-engine-required" | "not-produced";

export interface ArkCheck {
  id: string;
  label: string;
  status: ArkCheckStatus;
  detail: string;
  reference?: string;
}

export interface ArkCompatibilityReport {
  target: ArkTarget;
  targetLabel: string;
  generatedAt: string;
  verdict: "source-data-only";
  playableMap: false;
  engineVerified: false;
  dimensions: { width: number; height: number; aspectNote: string };
  landscape: {
    /** UE quads-per-component = 63 (1 section × 63 quads) — the conventional family. */
    standardResolutions: number[];
    exactMatch: number | null;
    nearest: number[];
    guidance: string;
  };
  elevation: {
    minMetres: number;
    maxMetres: number;
    reliefMetres: number;
    normalisedSeaLevel: number;
    seaLevelPixelValue16: number;
    suggestedZScale: number;
    zScaleFormula: string;
  };
  /** Canonical wording shared by UI, JSON and the bundle README. */
  disclosure: typeof ARK_COMPATIBILITY_DISCLOSURE;
  disclosureText: string;
  checks: ArkCheck[];
  manualSteps: string[];
  references: { label: string; url: string }[];
}

/** Conventional Unreal landscape sizes: n×63 quads + 1 vertex. */
export const STANDARD_LANDSCAPE_RESOLUTIONS = [505, 1009, 2017, 4033, 8129];

export function nearestLandscapeResolutions(size: number, count = 2): number[] {
  return [...STANDARD_LANDSCAPE_RESOLUTIONS]
    .sort((a, b) => Math.abs(a - size) - Math.abs(b - size))
    .slice(0, count);
}

export function computeSuggestedZScale(reliefMetres: number): number {
  // UE maps the full unsigned 16-bit range across 512 height units
  // (-256…255.992) then multiplies by Z scale in centimetres.
  const safeRelief = Math.max(1, reliefMetres);
  return Number(((safeRelief * 100) / 512).toFixed(2));
}

const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function buildArkCompatibilityReport(world: WorldData, exportSize: number, target: ArkTarget = "ase"): ArkCompatibilityReport {
  const relief = world.maxHeight - world.minHeight;
  const range = Math.max(1, relief);
  const normalisedSeaLevel = (0 - world.minHeight) / range;
  const exactMatch = STANDARD_LANDSCAPE_RESOLUTIONS.includes(exportSize) ? exportSize : null;
  const nearest = nearestLandscapeResolutions(exportSize);
  const zScale = computeSuggestedZScale(relief);

  const checks: ArkCheck[] = [
    {
      id: "bit-depth",
      label: "Heightmap bit depth",
      status: "satisfied",
      detail: `${exportSize}×${exportSize} grayscale PNG and RAW encoded at 16 bits per pixel — the native Unreal heightmap format.`,
      reference: "Epic: custom heightmaps",
    },
    {
      id: "single-channel",
      label: "Single-channel heightmap",
      status: "satisfied",
      detail: "PNG colour type 0 (greyscale, no alpha). RAW is unsigned 16-bit little-endian, headerless.",
      reference: "Epic: custom heightmaps",
    },
    {
      id: "square",
      label: "Square, unskewed dimensions",
      status: "satisfied",
      detail: `Width equals height (${exportSize}). Import X and Y scale must be set to the same value to avoid terrain skew.`,
    },
    {
      id: "landscape-resolution",
      label: "Unreal landscape resolution family",
      status: exactMatch ? "satisfied" : "advisory",
      detail: exactMatch
        ? `${exportSize} matches the conventional n×63 quads + 1 family.`
        : `${exportSize} is not in the conventional family (${STANDARD_LANDSCAPE_RESOLUTIONS.join(", ")}). Either resize the heightmap to ${nearest[0]} or set a matching Landscape component layout and accept in-engine re-sampling.`,
      reference: "Epic: landscape technical guide",
    },
    {
      id: "layer-weights",
      label: "Per-layer weight maps",
      status: "satisfied",
      detail: "Separate 8-bit single-channel weight maps are exported at the same resolution for each material layer. Unreal target layers require single-channel 8 bpp at the Landscape's overall resolution; a packed RGB splat is provided only as a convenience preview.",
      reference: "Epic: target layers",
    },
    {
      id: "colour-space",
      label: "Heightmap colour space",
      status: "advisory",
      detail: "The PNG carries no colour-space guarantee that Unreal will honour. On import, disable sRGB and use TC_VectorDisplacementmap (or TC_Greyscale if no displacement compression is required). This is a manual step.",
      reference: "ARK Modding Wiki: terrain heightmap",
    },
    {
      id: "orientation",
      label: "Coordinate orientation",
      status: "satisfied",
      detail: "Row-major, north-west origin, +X east, +Z south, no vertical flip. Confirmed identical between PNG, RAW and weight-map encoders. Positive world X maps to increasing texture column.",
    },
    {
      id: "z-scale",
      label: "Elevation scale",
      status: "advisory",
      detail: `Measured relief ${fmt(relief)} m over 512 Unreal height units suggests Z scale ≈ ${zScale}. Re-derive after any import-time re-ranging; the studio's normalisation is linear from ${fmt(world.minHeight)} m to ${fmt(world.maxHeight)} m.`,
    },
    {
      id: "sea-level",
      label: "Sea-level datum",
      status: "advisory",
      detail: `The studio's 0 m datum sits at ${(normalisedSeaLevel * 100).toFixed(1)}% of the encoded height range (≈ 16-bit value ${Math.round(normalisedSeaLevel * 65535)}). Unreal has no inherent sea level; carry this offset into the ocean plane and GameMode settings.`,
    },
    {
      id: "landscape-actor",
      label: "Landscape actor + material",
      status: "in-engine-required",
      detail: "Not produced. Requires a Landscape actor with shared layer info, a landscape material exposing the target layers, and weight textures imported per layer in the ARK Dev Kit.",
    },
    {
      id: "water",
      label: "Water bodies",
      status: "not-produced",
      detail: "Not produced as geometry. The hydrology mask and water-depth layer are metadata/reference only; ARK oceans, rivers and lakes are separate authored assets and volumes.",
    },
    {
      id: "biome-volumes",
      label: "Biome volumes",
      status: "in-engine-required",
      detail: "Not produced. The biome map is an index reference, not an ARK biome volume or spawn-region definition.",
    },
    {
      id: "spawners",
      label: "Spawn containers / creature configuration",
      status: "in-engine-required",
      detail: "Not produced. The studio's spawn and resource maps are documented design hypotheses derived from slope, water and vegetation; they are not verified creature spawn entries.",
    },
    {
      id: "game-mode",
      label: "GameMode / primal game data / map settings",
      status: "in-engine-required",
      detail: "Not produced. Map settings, GameMode and game-data overrides must be authored in the target project.",
    },
    {
      id: "ase-vs-asa",
      label: "ASE vs ASA project structure",
      status: "in-engine-required",
      detail: target === "asa"
        ? "ASA uses World Partition. World Composition is no longer supported; the terrain must be placed into the mod's partitioned world and validated against the ASA mod tools."
        : "ASE maps use a landscape plus sublevels. The heightmap is only the terrain source; sublevels, streaming and map settings are authored in the dev kit.",
    },
    {
      id: "cooked-map",
      label: "Cooked playable map",
      status: "not-produced",
      detail: "No .ark/.umap, no cooked assets, no GameMode, no plugin packaging. This bundle cannot be launched as a map.",
    },
    {
      id: "engine-verification",
      label: "In-engine verification",
      status: "in-engine-required",
      detail: "Not performed. No import into Unreal Engine, ARK Dev Kit or ASA mod tools was executed, so no compatibility verdict is claimed.",
    },
  ];

  const manualSteps = [
    "Create or open the target ARK map project in the ARK Dev Kit (ASE) or the ASA mod tools (UE5 + World Partition).",
    "Create a Landscape actor whose overall resolution matches the exported heightmap, or resize the heightmap to a conventional resolution.",
    "Import the 16-bit grayscale heightmap with sRGB disabled and set the Z scale from the reported guidance.",
    "Import each single-channel 8-bit layer weight map as a Landscape target layer at the same resolution.",
    "Author the landscape material with shared layer info and assign the weight textures per layer.",
    "Offset the ocean/water plane to the documented sea-level datum and author rivers, lakes and water volumes separately.",
    "Author biome volumes, spawn containers, POI actors, map settings and GameMode/game-data overrides in the target project.",
    "Cook in the target toolchain. Re-export from the studio if the in-engine elevation range or resolution changes.",
  ];

  return {
    target,
    targetLabel: target === "asa" ? "ARK: Survival Ascended (UE5 / World Partition)" : "ARK: Survival Evolved (UE4 / landscape + sublevels)",
    generatedAt: new Date().toISOString(),
    verdict: "source-data-only",
    playableMap: false,
    engineVerified: false,
    dimensions: { width: exportSize, height: exportSize, aspectNote: "Square. Import X/Y scales must match." },
    landscape: {
      standardResolutions: STANDARD_LANDSCAPE_RESOLUTIONS,
      exactMatch,
      nearest,
      guidance: exactMatch
        ? "Dimension is within the conventional Unreal landscape family."
        : `Nearest conventional sizes: ${nearest.join(" and ")}. Resize or re-sample before import.`,
    },
    elevation: {
      minMetres: Number(world.minHeight.toFixed(2)),
      maxMetres: Number(world.maxHeight.toFixed(2)),
      reliefMetres: Number(relief.toFixed(2)),
      normalisedSeaLevel: Number(normalisedSeaLevel.toFixed(4)),
      seaLevelPixelValue16: Math.round(normalisedSeaLevel * 65535),
      suggestedZScale: zScale,
      zScaleFormula: "Z scale = (relief metres × 100) / 512 — derived from Unreal's −256…255.992 height range.",
    },
    disclosure: ARK_COMPATIBILITY_DISCLOSURE,
    disclosureText: ARK_COMPATIBILITY_DISCLOSURE_TEXT,
    checks,
    manualSteps,
    references: [
      { label: "Epic — Creating and Using Custom Heightmaps and Layers", url: "https://dev.epicgames.com/documentation/unreal-engine/creating-and-using-custom-heightmaps-and-layers-in-unreal-engine" },
      { label: "Epic — Landscape Technical Guide", url: "https://dev.epicgames.com/documentation/unreal-engine/landscape-technical-guide-in-unreal-engine" },
      { label: "Wildcard — ARK DevKit: Creating New Maps", url: "https://devkit.studiowildcard.com/getting-started/creating-new-maps" },
      { label: "ARK Modding Wiki — Terrain Heightmap", url: "https://wiki.arkmodding.net/index.php?title=Terrain_Heightmap" },
    ],
  };
}

export function compatibilitySummary(report: ArkCompatibilityReport) {
  const count = (status: ArkCheckStatus) => report.checks.filter((check) => check.status === status).length;
  return {
    satisfied: count("satisfied"),
    advisory: count("advisory"),
    inEngine: count("in-engine-required"),
    notProduced: count("not-produced"),
    total: report.checks.length,
  };
}
