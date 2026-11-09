import type { TerrainPatch } from "./types";

/**
 * Lossless-enough editable terrain codec.
 * Heights are quantised linearly to unsigned 16-bit over the measured field range.
 * At a typical ±1600 m range the step is ≈0.05 m — well below the visual and
 * hydrological resolution of the grid — while keeping project documents small.
 */
export function encodeHeights(heights: Float32Array): TerrainPatch | undefined {
  if (!heights.length) return undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const height of heights) {
    if (!Number.isFinite(height)) return undefined;
    if (height < min) min = height;
    if (height > max) max = height;
  }
  const bytes = new Uint8Array(heights.length * 2);
  const view = new DataView(bytes.buffer);
  const range = Math.max(1e-6, max - min);
  for (let i = 0; i < heights.length; i++) {
    const quantised = Math.round(((heights[i] - min) / range) * 65535);
    view.setUint16(i * 2, Math.max(0, Math.min(65535, quantised)), true);
  }
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return { data: btoa(binary), min, max, resolution: Math.round(Math.sqrt(heights.length)), count: heights.length };
}

export function decodeHeights(patch: TerrainPatch): Float32Array | null {
  try {
    if (!patch || typeof patch.data !== "string" || !Number.isFinite(patch.min) || !Number.isFinite(patch.max)) return null;
    const binary = atob(patch.data);
    if (binary.length !== patch.count * 2) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const out = new Float32Array(patch.count);
    const range = patch.max - patch.min;
    for (let i = 0; i < out.length; i++) {
      out[i] = patch.min + (view.getUint16(i * 2, true) / 65535) * range;
    }
    return out;
  } catch {
    return null;
  }
}

export function terrainPatchBytes(patch: TerrainPatch | undefined): number {
  if (!patch) return 0;
  return Math.round((patch.data.length * 3) / 4);
}
