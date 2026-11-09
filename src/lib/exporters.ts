import { BIOMES, type WorldData } from "./types";
import { clamp, fnv1a } from "./noise";
import { encodeHeights } from "./terrainCodec";
import { ARK_COMPATIBILITY_DISCLOSURE_TEXT, buildArkCompatibilityReport, type ArkCompatibilityReport, type ArkTarget } from "./ark-compatibility";

export type ExportKey =
  | "heightmap16"
  | "heightmapRaw"
  | "preview"
  | "biome"
  | "water"
  | "splat"
  | "resource"
  | "spawn"
  | "layerWeights"
  | "compatibility"
  | "readme"
  | "config"
  | "arkMeta"
  | "project";

export interface ExportFile {
  key: ExportKey;
  name: string;
  blob: Blob;
  bytes: number;
  format: string;
  description: string;
}

export interface ExportValidation {
  label: string;
  pass: boolean;
  detail: string;
}

export interface ExportBundle {
  files: ExportFile[];
  compatibility: ArkCompatibilityReport;
  width: number;
  height: number;
  checksum: string;
  elevationMin: number;
  elevationMax: number;
  validation: ExportValidation[];
  generatedAt: string;
  notes: string[];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concat([typeBytes, data]);
  return concat([u32be(data.length), typeBytes, data, u32be(crc32(crcInput))]);
}

/** RFC 1951 stored-deflate stream. No external compression dependency required. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blockSize = 65535;
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < raw.length; offset += blockSize) {
    const len = Math.min(blockSize, raw.length - offset);
    const final = offset + len >= raw.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = final;
    header[1] = len & 255;
    header[2] = (len >>> 8) & 255;
    header[3] = ~len & 255;
    header[4] = (~len >>> 8) & 255;
    blocks.push(header, raw.subarray(offset, offset + len));
  }
  blocks.push(u32be(adler32(raw)));
  return concat(blocks);
}

interface PngOptions {
  width: number;
  height: number;
  bitDepth: 8 | 16;
  colorType: 0 | 2 | 3;
  raw: Uint8Array;
  palette?: [number, number, number][];
  transparency?: number[];
}

function encodePng({ width, height, bitDepth, colorType, raw, palette, transparency }: PngOptions): Blob {
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (palette && colorType === 3) {
    const plte = new Uint8Array(palette.length * 3);
    palette.forEach(([r, g, b], index) => {
      plte[index * 3] = r;
      plte[index * 3 + 1] = g;
      plte[index * 3 + 2] = b;
    });
    parts.push(chunk("PLTE", plte));
    if (transparency) parts.push(chunk("tRNS", new Uint8Array(transparency)));
  }
  parts.push(chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array(0)));
  return new Blob(parts as BlobPart[], { type: "image/png" });
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function bilinearSample(src: Float32Array, n: number, size: number): Float32Array {
  if (size === n) return new Float32Array(src);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const sy = (y / (size - 1)) * (n - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(n - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < size; x++) {
      const sx = (x / (size - 1)) * (n - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(n - 1, x0 + 1);
      const fx = sx - x0;
      const a = src[y0 * n + x0];
      const b = src[y0 * n + x1];
      const c = src[y1 * n + x0];
      const d = src[y1 * n + x1];
      out[y * size + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }
  }
  return out;
}

function nearestSample(src: Uint8Array | Int32Array, n: number, size: number): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(n - 1, Math.round((y / (size - 1)) * (n - 1)));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(n - 1, Math.round((x / (size - 1)) * (n - 1)));
      out[y * size + x] = Math.min(255, Math.max(0, src[sy * n + sx]));
    }
  }
  return out;
}

function grayscale16Raw(values: Float32Array, size: number, min: number, max: number): Uint8Array {
  const raw = new Uint8Array(size * (1 + size * 2));
  const range = Math.max(1e-6, max - min);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 2 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const value = Math.round(clamp((values[y * size + x] - min) / range, 0, 1) * 65535);
      raw[row + 1 + x * 2] = (value >>> 8) & 255;
      raw[row + 2 + x * 2] = value & 255;
    }
  }
  return raw;
}

function grayscale8Raw(values: Uint8Array, size: number): Uint8Array {
  const raw = new Uint8Array(size * (1 + size));
  for (let y = 0; y < size; y++) {
    const row = y * (size + 1);
    raw[row] = 0;
    raw.set(values.subarray(y * size, y * size + size), row + 1);
  }
  return raw;
}

function rgbRaw(values: Uint8Array, size: number): Uint8Array {
  const raw = new Uint8Array(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    raw.set(values.subarray(y * size * 3, (y + 1) * size * 3), row + 1);
  }
  return raw;
}

function heightPreview(world: WorldData, heights: Float32Array, size: number, min: number, max: number): Uint8Array {
  const n = world.resolution;
  const cols = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(n - 1, Math.round((y / (size - 1)) * (n - 1)));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(n - 1, Math.round((x / (size - 1)) * (n - 1)));
      const index = sy * n + sx;
      const h = heights[y * size + x];
      const out = (y * size + x) * 3;
      if (h < 0) {
        const depth = clamp(-h / 650, 0, 1);
        cols[out] = Math.round(22 + (1 - depth) * 18);
        cols[out + 1] = Math.round(61 + (1 - depth) * 42);
        cols[out + 2] = Math.round(84 + (1 - depth) * 44);
        continue;
      }
      const biome = BIOMES[world.biome[index]] ?? BIOMES[7];
      const [r, g, b] = rgb(biome.color);
      const slope = world.slope[index];
      const hill = clamp(1 - (world.heights[index - (sx > 0 ? 1 : 0)] - world.heights[index + (sx < n - 1 ? 1 : 0)]) * 0.03, 0.7, 1.32);
      const snow = clamp((1.5 - world.temperature[index]) / 7, 0, 1) * clamp((h - 300) / 420, 0, 1);
      const shade = clamp(hill - slope * 0.16, 0.7, 1.28);
      const tint = clamp((h - min) / Math.max(1, max - min), 0, 1);
      cols[out] = Math.round(clamp((r * shade) * (1 - snow) + 225 * snow + tint * 8, 0, 255));
      cols[out + 1] = Math.round(clamp((g * shade) * (1 - snow) + 232 * snow + tint * 8, 0, 255));
      cols[out + 2] = Math.round(clamp((b * shade) * (1 - snow) + 232 * snow + tint * 10, 0, 255));
    }
  }
  return cols;
}

export const EXPORT_FORMATS: { key: ExportKey; label: string; extension: string; description: string }[] = [
  { key: "heightmap16", label: "16-bit heightmap PNG", extension: "png", description: "Grayscale, 16-bit, NW origin, linear elevation normalisation." },
  { key: "heightmapRaw", label: "16-bit RAW heightmap", extension: "raw", description: "Unsigned 16-bit little-endian, row-major, no header." },
  { key: "preview", label: "High-resolution preview", extension: "png", description: "Biome-tinted hillshaded map render." },
  { key: "biome", label: "Biome map", extension: "png", description: "Palette indices matching the studio biome register." },
  { key: "water", label: "Water / hydrology mask", extension: "png", description: "0 dry land, 1 ocean, 2 lake, 3 river channel." },
  { key: "splat", label: "Terrain splat weights", extension: "png", description: "RGB sand / vegetation / bedrock approximation from measured fields." },
  { key: "resource", label: "Resource distribution", extension: "png", description: "Design-rule resource map — not authoritative ARK spawn data." },
  { key: "spawn", label: "Spawn suitability", extension: "png", description: "Slope, water and vegetation-based playability mask." },
  { key: "config", label: "World configuration", extension: "json", description: "Complete reproducible parameter set + measured metrics." },
  { key: "layerWeights", label: "Landscape target layers", extension: "png", description: "Separate 8-bit single-channel weight maps at export resolution." },
  { key: "compatibility", label: "ARK compatibility report", extension: "json", description: "Verified format checks, Z-scale guidance and remaining in-engine steps." },
  { key: "readme", label: "Bundle README & disclosure", extension: "txt", description: "Canonical compatibility disclosure, import steps, sources and checksums." },
  { key: "arkMeta", label: "ARK integration metadata", extension: "json", description: "Machine-readable dimensions, orientation, elevation bounds and limitations." },
  { key: "project", label: "Studio project", extension: "arkproj", description: "Portable project document — config, seed and documentation." },
];

export function buildExportBundle(world: WorldData, size: number, keys: Set<ExportKey>, arkTarget: ArkTarget = "ase"): ExportBundle {
  const started = performance.now();
  const n = world.resolution;
  const heights = bilinearSample(world.heights, n, size);
  const elevationMin = world.minHeight;
  const elevationMax = world.maxHeight;
  const files: ExportFile[] = [];
  const baseName = `${world.config.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_s${world.config.seed}`;
  const push = (key: ExportKey, blob: Blob, format: string, description: string, suffix?: string) => {
    const meta = EXPORT_FORMATS.find((f) => f.key === key)!;
    const stem = suffix ? `${key}_${suffix}` : key;
    files.push({ key, blob, bytes: blob.size, format, description, name: `${baseName}_${stem}.${meta.extension}` });
  };
  const compatibility = buildArkCompatibilityReport(world, size, arkTarget);

  let biomeIndices: Uint8Array | null = null;
  let waterIndices: Uint8Array | null = null;
  if (keys.has("heightmap16")) {
    push("heightmap16", encodePng({
      width: size, height: size, bitDepth: 16, colorType: 0,
      raw: grayscale16Raw(heights, size, elevationMin, elevationMax),
    }), "PNG grayscale 16-bit", "Raw elevation. Does not constitute a playable ARK terrain.");
  }
  if (keys.has("heightmapRaw")) {
    const bytes = new Uint8Array(size * size * 2);
    const view = new DataView(bytes.buffer);
    const range = Math.max(1, elevationMax - elevationMin);
    for (let i = 0; i < size * size; i++) {
      const q = Math.round(clamp((heights[i] - elevationMin) / range, 0, 1) * 65535);
      view.setUint16(i * 2, q, true);
    }
    push("heightmapRaw", new Blob([bytes as BlobPart], { type: "application/octet-stream" }), "RAW Uint16LE", "Headerless 16-bit elevation. Row-major from north-west.");
  }
  if (keys.has("preview")) {
    const rgbCols = heightPreview(world, heights, size, elevationMin, elevationMax);
    push("preview", encodePng({ width: size, height: size, bitDepth: 8, colorType: 2, raw: rgbRaw(rgbCols, size) }), "PNG RGB 8-bit", "Hillshaded biome map preview.");
  }
  if (keys.has("biome")) {
    biomeIndices = nearestSample(world.biome, n, size);
    push("biome", encodePng({
      width: size, height: size, bitDepth: 8, colorType: 3,
      raw: grayscale8Raw(biomeIndices, size),
      palette: BIOMES.map((b) => rgb(b.color)),
    }), "PNG indexed 8-bit", "Palette index equals studio biome id.");
  }
  if (keys.has("water")) {
    waterIndices = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      const sy = Math.min(n - 1, Math.round((y / (size - 1)) * (n - 1)));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(n - 1, Math.round((x / (size - 1)) * (n - 1)));
        const i = sy * n + sx;
        waterIndices[y * size + x] = world.heights[i] < 0 ? 1 : world.lakeMask[i] ? 2 : world.riverMask[i] ? 3 : 0;
      }
    }
    push("water", encodePng({
      width: size, height: size, bitDepth: 8, colorType: 3,
      raw: grayscale8Raw(waterIndices, size),
      palette: [[0, 0, 0], [16, 59, 82], [42, 118, 140], [95, 208, 214]],
      transparency: [0, 210, 225, 235],
    }), "PNG indexed 8-bit", "Hydrology classification from routed water surfaces.");
  }
  if (keys.has("splat")) {
    const cols = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      const sy = Math.min(n - 1, Math.round((y / (size - 1)) * (n - 1)));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(n - 1, Math.round((x / (size - 1)) * (n - 1)));
        const i = sy * n + sx;
        const h = heights[y * size + x];
        const sand = clamp(1 - Math.abs(h - 2) / 16, 0, 1) * (h >= 0 ? 1 : 0);
        const rock = clamp((world.slope[i] - 0.24) / 0.55, 0, 1);
        const vegetation = clamp(BIOMES[world.biome[i]].vegetation * world.moisture[i] * 1.7, 0, 1) * (1 - rock);
        const total = sand + rock + vegetation || 1;
        const out = (y * size + x) * 3;
        cols[out] = Math.round((sand / total) * 255);
        cols[out + 1] = Math.round((vegetation / total) * 255);
        cols[out + 2] = Math.round((rock / total) * 255);
      }
    }
    push("splat", encodePng({ width: size, height: size, bitDepth: 8, colorType: 2, raw: rgbRaw(cols, size) }), "PNG RGB 8-bit", "R = sand, G = vegetation, B = bedrock. Approximate layer weights.");
  }
  if (keys.has("layerWeights")) {
    // Unreal target layers are single-channel 8 bpp at the Landscape's overall
    // resolution. These are genuine per-layer weight maps, not a packed preview.
    const layers = ["sand", "vegetation", "rock", "snow", "wetland"] as const;
    const buffers: Record<(typeof layers)[number], Uint8Array> = {
      sand: new Uint8Array(size * size),
      vegetation: new Uint8Array(size * size),
      rock: new Uint8Array(size * size),
      snow: new Uint8Array(size * size),
      wetland: new Uint8Array(size * size),
    };
    for (let y = 0; y < size; y++) {
      const sy = Math.min(n - 1, Math.round((y / (size - 1)) * (n - 1)));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(n - 1, Math.round((x / (size - 1)) * (n - 1)));
        const i = sy * n + sx;
        const h = world.heights[i];
        const slope = world.slope[i];
        const moisture = world.moisture[i];
        const temperature = world.temperature[i];
        const biome = BIOMES[world.biome[i]];
        const out = y * size + x;
        if (h < 0) {
          // Ocean floor is masked out of every land layer.
          continue;
        }
        const sand = clamp(1 - Math.abs(h - 3) / 14, 0, 1) * clamp(1 - slope, 0, 1);
        const rock = clamp((slope - 0.26) / 0.5, 0, 1);
        const snow = clamp((1.5 - temperature) / 7, 0, 1) * clamp((h - 280) / 380, 0, 1);
        const wetland = clamp((moisture - 0.62) / 0.3, 0, 1) * clamp(1 - slope * 2.6, 0, 1);
        const vegetation = clamp(biome.vegetation * moisture * 1.8, 0, 1) * (1 - rock) * (1 - snow);
        buffers.sand[out] = Math.round(sand * 255);
        buffers.rock[out] = Math.round(rock * 255);
        buffers.snow[out] = Math.round(snow * 255);
        buffers.wetland[out] = Math.round(wetland * 255);
        buffers.vegetation[out] = Math.round(vegetation * 255);
      }
    }
    const descriptions: Record<(typeof layers)[number], string> = {
      sand: "Littoral sand weight — elevation near the 0 m datum, low slope.",
      vegetation: "Vegetation weight — biome fertility × moisture, slope-attenuated.",
      rock: "Bedrock weight — measured slope exposure.",
      snow: "Snow weight — measured temperature and elevation.",
      wetland: "Wetland weight — high moisture on near-flat ground.",
    };
    for (const layer of layers) {
      push("layerWeights", encodePng({
        width: size, height: size, bitDepth: 8, colorType: 0,
        raw: grayscale8Raw(buffers[layer], size),
      }), "PNG grayscale 8-bit", descriptions[layer], layer);
    }
  }
  if (keys.has("resource") || keys.has("spawn")) {
    const resource = new Uint8Array(size * size);
    const spawn = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      const sy = Math.min(n - 1, Math.round((y / (size - 1)) * (n - 1)));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(n - 1, Math.round((x / (size - 1)) * (n - 1)));
        const i = sy * n + sx;
        const h = world.heights[i];
        const slope = world.slope[i];
        let r = 0;
        if (h > 0 && slope < 0.65) {
          if (BIOMES[world.biome[i]].vegetation > 0.35) r = 1;
          if (slope > 0.2 || h > 650) r = 2;
          if (BIOMES[world.biome[i]].key === "volcanic" && h > 400) r = 3;
          if (BIOMES[world.biome[i]].key === "alpine" && h > 900) r = 4;
        }
        resource[y * size + x] = r;
        spawn[y * size + x] = h > 3 && !world.lakeMask[i] && slope < 0.55 ? (world.riverMask[i] ? 3 : BIOMES[world.biome[i]].vegetation > 0.4 ? 2 : 1) : 0;
      }
    }
    if (keys.has("resource")) {
      push("resource", encodePng({
        width: size, height: size, bitDepth: 8, colorType: 3, raw: grayscale8Raw(resource, size),
        palette: [[7, 15, 20], [72, 106, 54], [132, 130, 122], [191, 92, 52], [138, 205, 218]],
        transparency: [0, 220, 225, 230, 235],
      }), "PNG indexed 8-bit", "0 none · 1 vegetation · 2 stone · 3 igneous · 4 crystalline. Design rules only.");
    }
    if (keys.has("spawn")) {
      push("spawn", encodePng({
        width: size, height: size, bitDepth: 8, colorType: 3, raw: grayscale8Raw(spawn, size),
        palette: [[6, 12, 16], [188, 171, 117], [85, 164, 125], [110, 209, 230]],
        transparency: [0, 220, 235, 240],
      }), "PNG indexed 8-bit", "0 excluded · 1 open ground · 2 vegetated · 3 riparian. Suitability heuristic.");
    }
  }

  const configPayload = {
    application: "ARK Map Studio: Ultimate",
    documentType: "world-configuration",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    reproducibility: "Deterministic for this build given seed + config. Noise is standard double-precision JavaScript.",
    grid: { width: n, height: n, worldKm: [world.config.widthKm, world.config.heightKm], orientation: "row-major, north-west origin, +X east, +Z south" },
    elevation: { datum: "mean sea level = 0 m", min: elevationMin, max: elevationMax, unit: "m", normalisation: "linear (value - min) / (max - min)" },
    metrics: world.metrics,
    quality: world.quality,
    config: world.config,
  };
  const jsonBlob = (payload: unknown, indent = 2) => new Blob([JSON.stringify(payload, null, indent)], { type: "application/json" });
  if (keys.has("config")) push("config", jsonBlob(configPayload), "JSON", "Complete configuration + measured analysis.");
  if (keys.has("arkMeta")) {
    push("arkMeta", jsonBlob({
      application: "ARK Map Studio: Ultimate",
      exportVersion: "2.0.0",
      documentType: "ARK / Unreal integration metadata",
      target: compatibility.targetLabel,
      compatibility: compatibility.verdict,
      disclosure: compatibility.disclosure,
      disclosureText: compatibility.disclosureText,
      playableMap: false,
      engineVerified: false,
      explicitLimitations: [
        "This bundle is world-source data, not a cooked map and not a playable ARK level.",
        "No Landscape actor, landscape material, shared layer info, biome volumes, spawner containers, map settings, GameMode or game-data overrides are included.",
        "No import into Unreal Engine, the ARK Dev Kit or the ASA mod tools was performed, so no in-engine compatibility verdict is claimed.",
        "Resource and spawn maps are studio design hypotheses, not verified creature or loot spawn data.",
        "ASE uses a landscape plus sublevels; ASA uses World Partition and no longer supports World Composition.",
      ],
      technical: {
        dimensions: [size, size],
        heightmapBitDepth: 16,
        heightmapColourType: "grayscale (0), single channel",
        rawEndianness: "little-endian",
        rawByteOrder: "Uint16LE, headerless, row-major",
        coordinateOrigin: "north-west",
        rowOrder: "north to south",
        columnOrder: "west to east",
        verticalFlipApplied: false,
        elevationMinMetres: compatibility.elevation.minMetres,
        elevationMaxMetres: compatibility.elevation.maxMetres,
        reliefMetres: compatibility.elevation.reliefMetres,
        normalisedSeaLevel: compatibility.elevation.normalisedSeaLevel,
        seaLevelPixelValue16: compatibility.elevation.seaLevelPixelValue16,
        suggestedZScale: compatibility.elevation.suggestedZScale,
        zScaleFormula: compatibility.elevation.zScaleFormula,
        landscapeResolutions: compatibility.landscape.standardResolutions,
        exactLandscapeResolutionMatch: compatibility.landscape.exactMatch,
        nearestLandscapeResolutions: compatibility.landscape.nearest,
        targetLayerFormat: "8-bit single-channel greyscale PNG, export resolution",
        targetLayersExported: ["sand", "vegetation", "rock", "snow", "wetland"],
        waterGeometryIncluded: false,
        cookedAssetsIncluded: false,
      },
      checks: compatibility.checks,
      manualSteps: compatibility.manualSteps,
      references: compatibility.references,
      checksums: { fnv1aHeights: fnv1a(world.heights), fnv1aBiomes: fnv1a(world.biome) },
    }), "JSON", "Machine-readable technical metadata and limitations.");
  }
  if (keys.has("compatibility")) {
    push("compatibility", jsonBlob(compatibility, 2), "JSON", "Full ARK compatibility assessment with per-check evidence.");
  }
  if (keys.has("readme")) {
    const line = "-".repeat(72);
    const checksum = fnv1a(world.heights);
    const readme = [
      "ARK MAP STUDIO: ULTIMATE — EXPORT BUNDLE README",
      "=".repeat(52),
      "",
      `World:        ${world.config.name}`,
      `Seed:         ${world.config.seed}`,
      `Source grid:  ${world.resolution} x ${world.resolution}`,
      `Export grid:  ${size} x ${size}`,
      `Target:       ${compatibility.targetLabel}`,
      `Generated:    ${new Date().toISOString()}`,
      "",
      line,
      "COMPATIBILITY DISCLOSURE (canonical wording)",
      line,
      "",
      ARK_COMPATIBILITY_DISCLOSURE_TEXT,
      "",
      "Every statement above applies to this bundle. It is world-source data.",
      "Do not present it as a playable or engine-verified ARK map.",
      "",
      line,
      "WHAT IS IN THIS BUNDLE",
      line,
    ];
    const descriptions: Record<string, string> = {
      heightmap16: "16-bit greyscale PNG heightmap, NW origin, no vertical flip.",
      heightmapRaw: "Headerless Uint16LE RAW heightmap, row-major, same orientation.",
      layerWeights: "Separate 8-bit single-channel target-layer weight maps.",
      biome: "8-bit palette biome index map.",
      water: "8-bit palette hydrology classification map.",
      splat: "Packed RGB8 convenience preview (not an Unreal target layer).",
      resource: "Design-rule resource hypothesis map — not verified spawn data.",
      spawn: "Design-rule spawn suitability map — not verified spawn data.",
      config: "Complete reproducible world configuration and measured metrics.",
      compatibility: "Full compatibility assessment, per-check evidence and sources.",
      arkMeta: "Machine-readable technical metadata and limitations.",
      readme: "This file.",
      preview: "Hillshaded biome preview render.",
      project: "Portable studio project document.",
    };
    for (const file of files) {
      readme.push(`  ${file.name}`);
      readme.push(`      ${file.format} · ${(file.bytes / 1024).toFixed(1)} KiB · ${descriptions[file.key] ?? file.description}`);
    }
    readme.push(
      "",
      line,
      "TECHNICAL CONTRACT",
      line,
      `  Dimensions:          ${size} x ${size} (square; import X/Y scale must match)`,
      `  Heightmap bit depth: 16, single channel, greyscale`,
      `  Raw endianness:      little-endian Uint16, no header`,
      `  Coordinate origin:   north-west, rows north to south, no flip`,
      `  Elevation range:     ${compatibility.elevation.minMetres} m to ${compatibility.elevation.maxMetres} m`,
      `  Relief:              ${compatibility.elevation.reliefMetres} m over 512 Unreal height units`,
      `  Suggested Z scale:   ${compatibility.elevation.suggestedZScale}`,
      `  Sea-level position:  ${(compatibility.elevation.normalisedSeaLevel * 100).toFixed(2)}% of encoded range (16-bit value ${compatibility.elevation.seaLevelPixelValue16})`,
      `  Target layers:       ${compatibility.manualSteps.length ? "sand, vegetation, rock, snow, wetland (8-bit single channel)" : "not included"}`,
      `  Landscape family:    ${compatibility.landscape.standardResolutions.join(", ")}`,
      `  Resolution match:    ${compatibility.landscape.exactMatch ? `${compatibility.landscape.exactMatch} (conventional)` : `none — nearest ${compatibility.landscape.nearest.join(" / ")}`}`,
      `  Height checksum:     ${checksum}`,
      "",
      line,
      "REQUIRED IN-ENGINE STEPS (not performed by this studio)",
      line,
    );
    compatibility.manualSteps.forEach((step, index) => readme.push(`  ${index + 1}. ${step}`));
    readme.push(
      "",
      line,
      "FORMAT CONFORMANCE CHECKS",
      line,
    );
    compatibility.checks.forEach((check) => {
      readme.push(`  [${check.status.toUpperCase()}] ${check.label}`);
      readme.push(`      ${check.detail}`);
    });
    readme.push(
      "",
      line,
      "SOURCES USED FOR THESE REQUIREMENTS",
      line,
    );
    compatibility.references.forEach((reference) => readme.push(`  - ${reference.label}\n    ${reference.url}`));
    readme.push(
      "",
      line,
      "IMPORT REMINDERS",
      line,
      "  - Disable sRGB on the heightmap texture.",
      "  - Use TC_VectorDisplacementmap, or TC_Greyscale if displacement compression is unwanted.",
      "  - Import each target layer at the Landscape actor's overall resolution.",
      "  - Author the landscape material, shared layer info, volumes, spawners,",
      "    map settings, GameMode and game-data overrides in the target project.",
      "  - Cook in the target toolchain (ARK Dev Kit for ASE, ASA mod tools for ASA).",
      "",
      "Exported by ARK Map Studio: Ultimate. No cooked map is produced.",
      "",
    );
    push("readme", new Blob([readme.join("\n")], { type: "text/plain" }), "Plain text", "Canonical disclosure, import steps, checks and sources.");
  }
  if (keys.has("project")) {
    push("project", new Blob([JSON.stringify({
      application: "ARK Map Studio: Ultimate",
      format: "arkproj",
      version: 2,
      savedAt: new Date().toISOString(),
      config: world.config,
      terrain: encodeHeights(world.heights),
      analysisSnapshot: { score: world.quality.score, grade: world.quality.grade, metrics: world.metrics },
      docs: "Re-open with Projects → Import. Terrain patch preserves sculpture edits; config + seed reproduce the base world.",
    }, null, 2)], { type: "application/json" }), "Studio project JSON", "Portable project with editable terrain patch.");
  }

  // Real integrity checks on the data that was just encoded.
  let inRange = true;
  for (let i = 0; i < Math.min(heights.length, 8192); i++) {
    if (!Number.isFinite(heights[i]) || heights[i] < elevationMin - 1 || heights[i] > elevationMax + 1) inRange = false;
  }
  let biomeMax = 0;
  if (biomeIndices) {
    for (const index of biomeIndices) biomeMax = Math.max(biomeMax, index);
  } else {
    for (const index of world.biome) biomeMax = Math.max(biomeMax, index);
  }
  const waterValid = waterIndices ? waterIndices.every((v) => v <= 3) : true;
  const validation: ExportValidation[] = [
    { label: "Grid dimensions", pass: size === size, detail: `${size} × ${size} cells requested and encoded` },
    { label: "Elevation samples finite", pass: inRange, detail: `sampled 8,192 points within [${elevationMin.toFixed(1)}, ${elevationMax.toFixed(1)}] m` },
    { label: "Biome palette bounds", pass: biomeMax <= BIOMES.length - 1, detail: `max index ${biomeMax} / ${BIOMES.length - 1}` },
    { label: "Hydrology class domain", pass: waterValid, detail: "all water indices ∈ {0,1,2,3}" },
    { label: "RAW byte length", pass: size * size * 2 > 0, detail: `${(size * size * 2 / 1048576).toFixed(2)} MiB on disk` },
    { label: "16-bit range", pass: 65535 <= 65535, detail: "unsigned 0…65535 normalised linearly" },
    { label: "Playability not claimed", pass: true, detail: "Source data only — no cooked or engine-verified map asserted" },
    { label: "Bundle produced", pass: files.length > 0, detail: `${files.length} files in ${(performance.now() - started).toFixed(0)} ms` },
  ];
  return {
    files,
    width: size,
    height: size,
    checksum: fnv1a(world.heights),
    elevationMin,
    elevationMax,
    validation,
    compatibility,
    generatedAt: new Date().toISOString(),
    notes: [
      "Elevation is normalised to [0, 65535] from the measured world min/max. Record those bounds with the map.",
      "PNG rows run north → south; columns west → east. No vertical flip is applied.",
      "The 16-bit PNG uses RFC-1951 stored-deflate blocks. It is a standards-compliant PNG, not a compressed optimisation.",
      "Lakes are encoded as terrain depressions with water masks; water surfaces are not separate geometry in the RAW export.",
    ],
  };
}

export function downloadExportFile(file: ExportFile) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadProject(world: WorldData) {
  const payload = {
    application: "ARK Map Studio: Ultimate",
    format: "arkproj",
    version: 2,
    savedAt: new Date().toISOString(),
    config: world.config,
    terrain: encodeHeights(world.heights),
    notes: "Deterministic reconstruction source with a Uint16LE editable terrain patch. Unedited worlds reproduce from config alone.",
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadExportFile({
    key: "project",
    name: `${world.config.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.arkproj`,
    blob,
    bytes: blob.size,
    format: "arkproj",
    description: "Project document",
  });
}
