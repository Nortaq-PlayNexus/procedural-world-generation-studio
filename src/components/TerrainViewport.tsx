import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BIOMES, type PerfStats, type WorldData, type WorldObject } from "../lib/types";
import { clamp } from "../lib/noise";
import { ENVIRONMENT_BY_ID, type EnvironmentId } from "../lib/environments";

export type CameraMode = "free" | "top" | "satellite" | "geology" | "first" | "cinematic";
export type RenderQuality = "low" | "medium" | "high" | "ultra";
export type SunPreset = "dawn" | "noon" | "dusk" | "night";
export type EditTool = "orbit" | "raise" | "lower" | "smooth" | "flatten" | "place" | "erase";

export interface LayerState {
  water: boolean;
  rivers: boolean;
  vegetation: boolean;
  rocks: boolean;
  landmarks: boolean;
  clouds: boolean;
  bloom: boolean;
  waves: boolean;
  wireframe: boolean;
  colorMode: "biome" | "elevation" | "slope" | "moisture";
}

interface Props {
  world: WorldData | null;
  cameraMode: CameraMode;
  quality: RenderQuality;
  sun: SunPreset;
  environment: EnvironmentId;
  layers: LayerState;
  tool: EditTool;
  brushRadius: number;
  editing: boolean;
  onPerf: (stats: PerfStats) => void;
  onEdit: (u: number, v: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}

const WORLD_SIZE = 160;

const CAMERAS: Record<CameraMode, { pos: [number, number, number]; target: [number, number, number] }> = {
  free: { pos: [104, 72, 116], target: [0, 14, 0] },
  top: { pos: [0, 260, 0.01], target: [0, 0, 0] },
  satellite: { pos: [2, 340, 0.02], target: [0, 0, 0] },
  geology: { pos: [0, 150, 148], target: [0, 14, 0] },
  first: { pos: [18, 7, 52], target: [2, 13, -26] },
  cinematic: { pos: [186, 84, 32], target: [0, 8, 0] },
};

const SUNS: Record<SunPreset, {
  dir: [number, number, number];
  color: string;
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  exposure: number;
  stars: number;
  clouds: number;
}> = {
  dawn: { dir: [-120, 42, 96], color: "#ffd4a8", skyTop: "#1b3440", skyHorizon: "#a69b83", fog: "#637c7a", fogDensity: 0.0022, hemiSky: "#b6c9c2", hemiGround: "#303a30", hemiIntensity: 0.7, exposure: 1.06, stars: 0.12, clouds: 0.32 },
  noon: { dir: [96, 150, 68], color: "#fff1d5", skyTop: "#2c5a70", skyHorizon: "#8fb0a8", fog: "#6d8f8a", fogDensity: 0.00085, hemiSky: "#bcded4", hemiGround: "#3e4233", hemiIntensity: 0.68, exposure: 1.02, stars: 0, clouds: 0.16 },
  dusk: { dir: [-138, 26, -54], color: "#ffad7b", skyTop: "#142537", skyHorizon: "#b46e5f", fog: "#6b5b58", fogDensity: 0.0025, hemiSky: "#8b97a8", hemiGround: "#2d2620", hemiIntensity: 0.46, exposure: 1.04, stars: 0.25, clouds: 0.34 },
  night: { dir: [-46, 88, -92], color: "#9fb8ff", skyTop: "#030a12", skyHorizon: "#173641", fog: "#0a181d", fogDensity: 0.0032, hemiSky: "#456b85", hemiGround: "#10161a", hemiIntensity: 0.23, exposure: 1.18, stars: 1, clouds: 0.08 },
};

const BIOME_RGB = BIOMES.map((b) => [parseInt(b.color.slice(1, 3), 16), parseInt(b.color.slice(3, 5), 16), parseInt(b.color.slice(5, 7), 16)]);

function terrainTexture(world: WorldData, mode: LayerState["colorMode"], size = 768): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  const n = world.resolution;
  const baseColors = new Uint8ClampedArray(size * size * 3);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(n - 1, Math.floor((y / size) * n));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(n - 1, Math.floor((x / size) * n));
      const i = sy * n + sx;
      const h = world.heights[i];
      const slope = world.slope[i];
      const t = clamp(h / Math.max(1, world.maxHeight), 0, 1);
      let r = 60;
      let g = 80;
      let b = 65;
      if (h < 0) {
        const depth = clamp(-h / 760, 0, 1);
        r = 16 + (1 - depth) * 15;
        g = 44 + (1 - depth) * 34;
        b = 58 + (1 - depth) * 30;
      } else if (mode === "elevation") {
        if (t < 0.12) { r = 39; g = 72; b = 66; }
        else if (t < 0.32) { r = 70; g = 105; b = 76; }
        else if (t < 0.58) { r = 148; g = 142; b = 96; }
        else if (t < 0.78) { r = 143; g = 122; b = 103; }
        else { r = 219; g = 224; b = 220; }
        r = Math.round(r * (0.82 + t * 0.3));
        g = Math.round(g * (0.82 + t * 0.3));
        b = Math.round(b * (0.82 + t * 0.3));
      } else if (mode === "slope") {
        const s = clamp(slope / 1.1, 0, 1);
        r = Math.round(24 + s * 200);
        g = Math.round(66 + s * 82 - s * s * 36);
        b = Math.round(72 + (1 - s) * 32);
      } else if (mode === "moisture") {
        const m = world.moisture[i];
        r = Math.round(174 - m * 134);
        g = Math.round(136 + m * 62);
        b = Math.round(89 + m * 71);
      } else {
        const biome = BIOME_RGB[world.biome[i]] || BIOME_RGB[7];
        r = biome[0];
        g = biome[1];
        b = biome[2];
        const rock = clamp((slope - 0.36) / 0.6, 0, 1) * 0.8;
        r = Math.round(r * (1 - rock) + (108 + t * 34) * rock);
        g = Math.round(g * (1 - rock) + (102 + t * 30) * rock);
        b = Math.round(b * (1 - rock) + (95 + t * 22) * rock);
        // Nival cover is driven by measured surface temperature, not a fixed contour.
        const snow = clamp((0.5 - world.temperature[i]) / 7, 0, 1) * clamp((h - 320) / 380, 0, 1);
        r = Math.round(r * (1 - snow) + 231 * snow);
        g = Math.round(g * (1 - snow) + 238 * snow);
        b = Math.round(b * (1 - snow) + 236 * snow);
        const variation = (Math.sin(sx * 1.72 + sy * 2.31) + Math.cos(sx * 0.41 - sy * 1.13)) * 3;
        r = clamp(r + variation, 0, 255);
        g = clamp(g + variation, 0, 255);
        b = clamp(b + variation, 0, 255);
      }
      const colorIndex = (y * size + x) * 3;
      baseColors[colorIndex] = r;
      baseColors[colorIndex + 1] = g;
      baseColors[colorIndex + 2] = b;
    }
  }
  // Blend ecotones on land only. This softens categorical biome edges without
  // inventing colours; water and snow-classified pixels retain their identity.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bi = y * size + x;
      const sourceIndex = Math.min(n - 1, Math.floor((y / size) * n)) * n + Math.min(n - 1, Math.floor((x / size) * n));
      const isLand = world.heights[sourceIndex] >= 0 && mode === "biome";
      let r = baseColors[bi * 3];
      let g = baseColors[bi * 3 + 1];
      let b = baseColors[bi * 3 + 2];
      if (isLand) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let weight = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(size - 1, Math.max(0, x + dx));
            const ny = Math.min(size - 1, Math.max(0, y + dy));
            const w = dx === 0 && dy === 0 ? 3 : 1;
            const ni = (ny * size + nx) * 3;
            const nWorld = Math.min(n - 1, Math.floor((ny / size) * n)) * n + Math.min(n - 1, Math.floor((nx / size) * n));
            if (world.heights[nWorld] < 0) continue;
            sr += baseColors[ni] * w;
            sg += baseColors[ni + 1] * w;
            sb += baseColors[ni + 2] * w;
            weight += w;
          }
        }
        if (weight > 0) {
          r = Math.round(baseColors[bi * 3] * 0.55 + (sr / weight) * 0.45);
          g = Math.round(baseColors[bi * 3 + 1] * 0.55 + (sg / weight) * 0.45);
          b = Math.round(baseColors[bi * 3 + 2] * 0.55 + (sb / weight) * 0.45);
        }
      }
      const out = bi * 4;
      image.data[out] = r;
      image.data[out + 1] = g;
      image.data[out + 2] = b;
      image.data[out + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

interface SurfaceMaps {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

/**
 * Derive tangent-space normal and roughness maps from the measured world.
 *
 * The normal map is BAND-LIMITED: geometry normals already carry macro slope, so
 * this map contributes only the high-frequency residual (metres of local relief
 * minus a smoothed reference). Amplifying the raw macro gradient here caused a
 * verified double-lighting/exposure regression, so the residual is deliberately
 * capped. Roughness is a material response: wet surfaces glossy, snow and sand
 * matte, rock intermediate.
 */
function surfaceDetailMaps(world: WorldData, size: number): SurfaceMaps {
  const n = world.resolution;
  const normalBytes = new Uint8Array(size * size * 4);
  const roughBytes = new Uint8Array(size * size * 4);
  const spacing = (world.config.widthKm * 1000) / Math.max(1, n - 1);
  const residual = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.min(n - 1, Math.round((x / size) * (n - 1)));
      const gy = Math.min(n - 1, Math.round((y / size) * (n - 1)));
      const i = gy * n + gx;
      const sample = (ox: number, oy: number) => world.heights[Math.min(n - 1, Math.max(0, gy + oy)) * n + Math.min(n - 1, Math.max(0, gx + ox))];
      const smooth = (sample(-2, 0) + sample(2, 0) + sample(0, -2) + sample(0, 2)) * 0.25;
      residual[y * size + x] = world.heights[i] - smooth;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.min(n - 1, Math.round((x / size) * (n - 1)));
      const gy = Math.min(n - 1, Math.round((y / size) * (n - 1)));
      const i = gy * n + gx;
      const left = residual[y * size + Math.max(0, x - 1)];
      const right = residual[y * size + Math.min(size - 1, x + 1)];
      const up = residual[Math.max(0, y - 1) * size + x];
      const down = residual[Math.min(size - 1, y + 1) * size + x];
      const dx = (right - left) / (2 * spacing);
      const dz = (down - up) / (2 * spacing);
      const nx = clamp(-dx * 0.32, -0.62, 0.62);
      const nz = clamp(-dz * 0.32, -0.62, 0.62);
      const ny = Math.sqrt(Math.max(0.12, 1 - nx * nx - nz * nz));
      const length = Math.hypot(nx, ny, nz) || 1;
      const o = (y * size + x) * 4;
      normalBytes[o] = Math.round((nx / length * 0.5 + 0.5) * 255);
      normalBytes[o + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      normalBytes[o + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
      normalBytes[o + 3] = 255;

      const slope = world.slope[i];
      const wet = world.lakeMask[i] || world.riverMask[i] || world.heights[i] < 1.5;
      const snow = world.temperature[i] < 1.5 && world.heights[i] > 300;
      const sand = world.biome[i] === 1 || world.biome[i] === 7;
      let roughness = 0.9;
      if (wet) roughness = 0.42;
      else if (snow) roughness = 0.7;
      else if (slope > 0.32) roughness = 0.78;
      else if (sand) roughness = 0.94;
      roughness = clamp(roughness + (world.moisture[i] - 0.5) * 0.05, 0.25, 1);
      const value = Math.round(roughness * 255);
      roughBytes[o] = value;
      roughBytes[o + 1] = value;
      roughBytes[o + 2] = value;
      roughBytes[o + 3] = 255;
    }
  }
  const normalMap = new THREE.DataTexture(normalBytes, size, size, THREE.RGBAFormat);
  normalMap.needsUpdate = true;
  normalMap.wrapS = THREE.ClampToEdgeWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.minFilter = THREE.LinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  const roughnessMap = new THREE.DataTexture(roughBytes, size, size, THREE.RGBAFormat);
  roughnessMap.needsUpdate = true;
  roughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.minFilter = THREE.LinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  return { normalMap, roughnessMap };
}

const CinemaGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.52 },
    uSaturation: { value: 1.07 },
    uLift: { value: 0.004 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSaturation; uniform float uLift; varying vec2 vUv;
    void main(){
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = source.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color += uLift * (1.0 - luma);
      float distanceFromCentre = distance(vUv, vec2(0.5));
      float edge = smoothstep(0.86, 0.24, distanceFromCentre);
      color *= mix(1.0, edge, uVignette);
      gl_FragColor = vec4(color, source.a);
    }`,
};

/** Tileable ripple normals. Animated by offset, never by geometry displacement. */
function waterNormalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const hx = Math.cos(u * 3 + Math.sin(v * 2) * 0.9) * 0.55 + Math.cos(u * 7 - v * 4) * 0.24 + Math.cos(v * 5 + u * 2) * 0.12;
      const hz = Math.cos(v * 3 + Math.sin(u * 2) * 0.9) * 0.55 + Math.cos(v * 6 + u * 3) * 0.24 + Math.cos(u * 5 - v * 2) * 0.12;
      const nx = -hx * 0.62;
      const ny = 1;
      const nz = -hz * 0.62;
      const length = Math.hypot(nx, ny, nz);
      const o = (y * size + x) * 4;
      image.data[o] = Math.round((nx / length * 0.5 + 0.5) * 255);
      image.data[o + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      image.data[o + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(22, 22);
  return texture;
}

function heightLookupTexture(world: WorldData): { texture: THREE.DataTexture; min: number; max: number } {
  const size = Math.min(512, world.resolution);
  const bytes = new Uint8Array(size * size);
  const n = world.resolution;
  const range = Math.max(1, world.maxHeight - world.minHeight);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(n - 1, Math.floor((y / size) * n));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(n - 1, Math.floor((x / size) * n));
      bytes[y * size + x] = Math.round(clamp((world.heights[sy * n + sx] - world.minHeight) / range, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return { texture, min: world.minHeight * 0.029, max: world.maxHeight * 0.029 };
}

interface WaterUniformState {
  shallow: THREE.Color;
  deep: THREE.Color;
  opacity: { value: number };
  time: { value: number };
  heightTexture: THREE.DataTexture;
  elevationMin: number;
  elevationMax: number;
}

/**
 * Depth-aware water: samples the terrain height texture in world space to derive
 * true water depth, then tints from shallow to deep, adds animated shoreline foam
 * and reduces roughness with depth. Normals provide moving ripples.
 */
function createWaterMaterial(options: {
  shallow: string;
  deep: string;
  opacity: number;
  side: THREE.Side;
  normalMap: THREE.Texture;
  time: { value: number };
  heightTexture: THREE.DataTexture;
  elevationMin: number;
  elevationMax: number;
}): THREE.MeshPhysicalMaterial {
  const state: WaterUniformState = {
    shallow: new THREE.Color(options.shallow),
    deep: new THREE.Color(options.deep),
    opacity: { value: options.opacity },
    time: options.time,
    heightTexture: options.heightTexture,
    elevationMin: options.elevationMin,
    elevationMax: options.elevationMax,
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.46,
    metalness: 0.04,
    // No clearcoat: a 1000-unit plane with a tight clearcoat lobe produced a
    // visible vertical "sun glitter column". Verified by object-isolation QA:
    // hiding the ocean removed the band; hiding sky/clouds/sun did not.
    clearcoat: 0,
    clearcoatRoughness: 1,
    envMapIntensity: 0.35,
    specularIntensity: 0.32,
    transparent: true,
    opacity: options.opacity,
    depthWrite: true,
    side: options.side,
    normalMap: options.normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
  });
  (material.userData as { water: WaterUniformState }).water = state;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = state.time;
    shader.uniforms.uShallow = { value: state.shallow };
    shader.uniforms.uDeep = { value: state.deep };
    shader.uniforms.uWaterOpacity = state.opacity;
    shader.uniforms.uHeightMap = { value: state.heightTexture };
    shader.uniforms.uElevationRange = { value: new THREE.Vector2(state.elevationMin, state.elevationMax) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vArkWaterWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvArkWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uWaterTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform float uWaterOpacity;
        uniform sampler2D uHeightMap;
        uniform vec2 uElevationRange;
        varying vec3 vArkWaterWorld;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec2 arkUv = clamp(vec2(vArkWaterWorld.x, vArkWaterWorld.z) / 160.0 + 0.5, 0.0, 1.0);
        float arkTerrainN = texture2D(uHeightMap, arkUv).r;
        float arkTerrainY = mix(uElevationRange.x, uElevationRange.y, arkTerrainN);
        float arkDepth = max(0.0, vArkWaterWorld.y - arkTerrainY);
        vec3 arkWater = mix(uShallow, uDeep, smoothstep(0.0, 1.9, arkDepth));
        diffuseColor.rgb = arkWater;
        float arkRipple = sin(vArkWaterWorld.x * 2.3 + uWaterTime * 1.7) * cos(vArkWaterWorld.z * 2.9 - uWaterTime * 1.35);
        float arkFoam = smoothstep(0.19, 0.0, arkDepth) * smoothstep(0.1, 0.85, arkRipple * 0.5 + 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.87, 0.97, 0.95), arkFoam * 0.55);
        diffuseColor.a = uWaterOpacity * mix(0.72, 1.0, smoothstep(0.0, 0.55, arkDepth));`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.06, 0.34, 1.0 - smoothstep(0.04, 1.6, arkDepth));`);
  };
  material.customProgramCacheKey = () => "ark-water-depth-v2";
  return material;
}

function cloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 34; i++) {
    const x = 26 + Math.random() * 204;
    const y = 34 + Math.random() * 56;
    const r = 14 + Math.random() * 34;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(238,248,246,0.20)");
    gradient.addColorStop(0.55, "rgba(214,235,232,0.09)");
    gradient.addColorStop(1, "rgba(210,235,230,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,244,216,1)");
  gradient.addColorStop(0.12, "rgba(255,225,172,0.9)");
  gradient.addColorStop(0.4, "rgba(255,190,120,0.22)");
  gradient.addColorStop(1, "rgba(255,180,110,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

const objColor: Record<string, string> = {
  redwood: "#2e5b3c",
  pine: "#244d3c",
  jungle: "#1b5335",
  palm: "#4a7345",
  shrub: "#4c6b44",
  "grass tuft": "#6c7d49",
  boulder: "#6b6c64",
  rock: "#5a5d56",
  ruin: "#a39172",
  obelisk: "#7cb7b5",
};


/** Secondary crown tier breaks the single-cone tree silhouette. */
function addCanopyTier(world: WorldData, content: THREE.Group, quality: RenderQuality) {
  const source = world.objects.filter((o) => o.kind === "pine" || o.kind === "redwood" || o.kind === "jungle").slice(0, quality === "low" ? 1800 : quality === "medium" ? 3600 : 8000);
  if (!source.length) return;
  const temp = new THREE.Object3D();
  const color = new THREE.Color();
  const tiers: { factor: number; scale: number; tint: string }[] = quality === "low"
    ? [{ factor: 1.28, scale: 0.72, tint: "#2a5744" }]
    : [
        { factor: 1.26, scale: 0.76, tint: "#2a5744" },
        { factor: 1.6, scale: 0.54, tint: "#356a4c" },
        { factor: 1.86, scale: 0.34, tint: "#3f7654" },
      ];
  tiers.forEach((tier) => {
    const geometry = new THREE.ConeGeometry(0.52 * tier.scale, 1.05 * tier.scale, 6);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.01, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, source.length);
    source.forEach((object, index) => {
      const base = (object.kind === "redwood" ? 3.3 : object.kind === "pine" ? 2.5 : 2.9) * object.scale;
      temp.position.set((object.x - 0.5) * WORLD_SIZE, object.y * 0.029 + base * tier.factor, (object.z - 0.5) * WORLD_SIZE);
      temp.scale.setScalar(object.scale * (quality === "low" ? 1 : 1.15));
      temp.rotation.set(0, object.rotation + tier.factor * 0.8, 0);
      temp.updateMatrix();
      mesh.setMatrixAt(index, temp.matrix);
      color.set(object.kind === "jungle" ? "#2c6b45" : object.kind === "redwood" ? tier.tint : "#2a5744");
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    content.add(mesh);
  });
}

export default function TerrainViewport(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [webglError, setWebglError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    content: THREE.Group;
    terrain: THREE.Mesh | null;
    ring: THREE.Mesh;
    raycaster: THREE.Raycaster;
    sunLight: THREE.DirectionalLight;
    hemi: THREE.HemisphereLight;
    sky: THREE.ShaderMaterial;
    sunSprite: THREE.Sprite;
    clouds: THREE.Group;
    stars: THREE.Points;
    composer: EffectComposer;
    bloomPass: UnrealBloomPass;
    gradePass: ShaderPass;
    waterTime: { value: number };
    waterMaterials: THREE.MeshPhysicalMaterial[];
    sunSpriteDirection: THREE.Vector3;
    resize: () => void;
  } | null>(null);
  const pointerRef = useRef({ dragging: false, lastPaint: 0 });
  const goalRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Mount renderer and persistent scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setWebglError("WebGL 2 is unavailable in this browser. The 2D map studio and all analysis/export tools remain usable.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x071014, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.35, 1400);
    camera.position.set(...CAMERAS.free.pos);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 12;
    controls.maxDistance = 560;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(...CAMERAS.free.target);
    controls.update();

    // ---------- cinematic post-processing ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.62, 0.86);
    composer.addPass(bloomPass);
    const gradePass = new ShaderPass(CinemaGradeShader);
    composer.addPass(gradePass);
    composer.addPass(new OutputPass());
    renderer.info.autoReset = false;
    const waterTime = { value: 0 };
    const sunSpriteDirection = new THREE.Vector3(0.5, 0.6, 0.4).normalize();

    const hemi = new THREE.HemisphereLight(0xbcded4, 0x39473a, 0.7);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight(0xfff1d5, 2.5);
    sunLight.position.set(96, 150, 68);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 480;
    sunLight.shadow.camera.left = -130;
    sunLight.shadow.camera.right = 130;
    sunLight.shadow.camera.top = 130;
    sunLight.shadow.camera.bottom = -130;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.7;
    scene.add(sunLight);
    const fill = new THREE.DirectionalLight(0x90bcc9, 0.28);
    fill.position.set(-120, 60, -100);
    scene.add(fill);

    scene.fog = new THREE.FogExp2(0x789b94, 0.00145);
    const skyUniforms = {
      uTop: { value: new THREE.Color("#386578") },
      uHorizon: { value: new THREE.Color("#a6bfb4") },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.4) },
      uSunColor: { value: new THREE.Color("#fff1d5") },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 world = modelMatrix * vec4(position,1.0); vWorldPosition = world.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; varying vec3 vWorldPosition;
      void main(){
        // Direction MUST be camera-relative. Using normalize(vWorldPosition) made
        // the horizon mapping depend on the camera's offset from the dome centre,
        // which produced a bright vertical band through the sky.
        vec3 dir = normalize(vWorldPosition - cameraPosition);
        float h = clamp(dir.y, 0.0, 1.0);
        // Multi-band sky: dense horizon haze, clear zenith, asymmetric warm
        // forward-scattering around the sun (single-scattering approximation).
        float horizon = pow(1.0 - h, 3.4);
        vec3 col = mix(uTop, uHorizon, horizon);
        float sun = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sun, 5.0) * 0.12;
        col += uSunColor * pow(sun, 42.0) * 0.16;
        col += uSunColor * pow(sun, 1600.0) * 2.0;
        col += uSunColor * horizon * 0.05;
        // Ordered noise dither breaks 8-bit gradient banding.
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        col += (dither - 0.5) * 0.006;
        gl_FragColor = vec4(col, 1.0);
      }`,
      side: THREE.BackSide,
      depthWrite: false,
    });
    // High tessellation keeps the specular sun term smooth instead of smearing
    // across large sky facets (previously read as a vertical light pillar).
    const sky = new THREE.Mesh(new THREE.SphereGeometry(850, 96, 48), skyMat);
    sky.name = "ark:sky";
    scene.add(sky);

    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe7be, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    sunSprite.scale.set(38, 38, 1);
    sunSprite.name = "ark:sunSprite";
    scene.add(sunSprite);

    const cloudGroup = new THREE.Group();
    const cloudTex = cloudTexture();
    for (let i = 0; i < 10; i++) {
      const material = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.16, depthWrite: false, color: 0xe6f3ef });
      const sprite = new THREE.Sprite(material);
      const angle = (i / 10) * Math.PI * 2 + 0.4;
      // Clouds sit well above and outside the default orbit envelope so the
      // camera can never pass through a billboard and wash out the scene.
      const radius = 250 + (i % 3) * 70;
      sprite.position.set(Math.cos(angle) * radius, 165 + (i % 4) * 22, Math.sin(angle) * radius);
      const scale = 58 + (i % 5) * 14;
      sprite.scale.set(scale, scale * 0.32, 1);
      cloudGroup.add(sprite);
    }
    cloudGroup.name = "ark:clouds";
    scene.add(cloudGroup);

    const starsGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(1300 * 3);
    for (let i = 0; i < 1300; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48;
      const r = 720;
      starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      starPositions[i * 3 + 1] = Math.sin(phi) * r + 20;
      starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    }
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xbfe2ec, size: 1.7, transparent: true, opacity: 0, sizeAttenuation: true, depthWrite: false }));
    scene.add(stars);

    const content = new THREE.Group();
    scene.add(content);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.0, 72), new THREE.MeshBasicMaterial({ color: 0x5fe3c0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 6;
    scene.add(ring);

    const state = {
      scene, camera, renderer, controls, content, terrain: null as THREE.Mesh | null, ring, raycaster: new THREE.Raycaster(),
      sunLight, hemi, sky: skyMat, sunSprite, clouds: cloudGroup, stars,
      composer, bloomPass, gradePass, waterTime, waterMaterials: [] as THREE.MeshPhysicalMaterial[], sunSpriteDirection,
      resize: () => {},
    };
    sceneRef.current = state;
    // QA hook: enables automated object-level isolation in browser regression
    // tests. Only attached on an explicit ?debug query, never in normal use.
    if (new URLSearchParams(window.location.search).has("debug")) {
      (window as unknown as { __arkScene?: THREE.Scene }).__arkScene = scene;
    }

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      composer.setPixelRatio(renderer.getPixelRatio());
    };
    resize();
    state.resize = resize;
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let animationFrame = 0;
    let frames = 0;
    let lastSample = performance.now();
    let sampleStart = performance.now();
    let frameTotal = 0;
    let lastPerf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      controls.update();
      if (goalRef.current) {
        camera.position.lerp(goalRef.current.pos, 0.055);
        controls.target.lerp(goalRef.current.target, 0.055);
        if (camera.position.distanceTo(goalRef.current.pos) < 0.7) goalRef.current = null;
      }
      // Keep the sky dome and sun billboard centred on the viewer.
      sky.position.copy(camera.position);
      sunSprite.position.copy(camera.position).addScaledVector(sunSpriteDirection, 640);
      cloudGroup.children.forEach((child, i) => {
        child.position.x += Math.sin(elapsed * 0.02 + i) * 0.008;
      });
      sunSprite.material.opacity = 0.46 + Math.sin(elapsed * 0.25) * 0.03;
      waterTime.value = elapsed;
      if (propsRef.current.layers.waves) {
        state.waterMaterials.forEach((material, index) => {
          const map = material.normalMap;
          if (!map) return;
          map.offset.x = elapsed * (0.012 + index * 0.002);
          map.offset.y = elapsed * 0.008;
        });
      }
      const start = performance.now();
      renderer.info.reset();
      const wantsPost = state.composer && state.bloomPass.enabled;
      if (wantsPost) state.composer.render();
      else renderer.render(scene, camera);
      frameTotal += performance.now() - start;
      frames++;
      const now = performance.now();
      if (now - lastSample >= 700 && now - lastPerf > 420) {
        const measuredFps = Math.round((frames * 1000) / (now - lastSample));
        const avgFrame = frameTotal / Math.max(1, frames);
        lastPerf = now;
        propsRef.current.onPerf({
          fps: measuredFps,
          frameMs: Number(avgFrame.toFixed(2)),
          triangles: renderer.info.render.triangles,
          drawCalls: renderer.info.render.calls,
          geometryMem: renderer.info.memory.geometries,
          textureMem: renderer.info.memory.textures,
          viewportWidth: container.clientWidth,
          viewportHeight: container.clientHeight,
        });
        frames = 0;
        frameTotal = 0;
        lastSample = now;
        sampleStart = now;
      }
    };
    animate();
    void sampleStart;

    const toLocal = (event: PointerEvent | WheelEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 };
    };
    const raycaster = state.raycaster;
    const mouse = new THREE.Vector2();
    const paint = (event: PointerEvent) => {
      if (!state.terrain) return;
      const local = toLocal(event);
      mouse.set(local.x, local.y);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(state.terrain, false);
      if (!hits.length) {
        ring.visible = false;
        return;
      }
      const point = hits[0].point;
      ring.visible = propsRef.current.tool !== "orbit";
      ring.position.set(point.x, point.y + 0.55, point.z);
      const radiusWorld = (propsRef.current.brushRadius / Math.max(1, propsRef.current.world?.resolution ?? 320)) * WORLD_SIZE * 1.35;
      ring.scale.setScalar(Math.max(0.9, radiusWorld));
      const u = point.x / WORLD_SIZE + 0.5;
      const v = point.z / WORLD_SIZE + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      const activeTool = propsRef.current.tool;
      if ((activeTool === "place" || activeTool === "erase") && event.type !== "pointerdown") return;
      const now = performance.now();
      if (activeTool !== "orbit" && now - pointerRef.current.lastPaint > 110) {
        pointerRef.current.lastPaint = now;
        propsRef.current.onEdit(u, v);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerRef.current.dragging) paint(event);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (propsRef.current.tool === "orbit" || event.button !== 0) return;
      pointerRef.current.dragging = true;
      pointerRef.current.lastPaint = 0;
      propsRef.current.onEditStart();
      paint(event);
    };
    const onPointerUp = () => {
      if (pointerRef.current.dragging) {
        pointerRef.current.dragging = false;
        propsRef.current.onEditEnd();
      }
    };
    const onPointerLeave = () => {
      onPointerUp();
      ring.visible = false;
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    controls.addEventListener("start", () => { goalRef.current = null; });

    setLoaded(true);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) {
          object.geometry?.dispose();
          const material = object.material;
          const materials = Array.isArray(material) ? material : [material];
          materials.forEach((m) => {
            const standard = m as THREE.MeshStandardMaterial;
            standard.map?.dispose();
            standard.normalMap?.dispose();
            standard.roughnessMap?.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Rebuild world content when data, layers or quality changes
  useEffect(() => {
    const state = sceneRef.current;
    const world = props.world;
    if (!state) return;
    const { content } = state;
    while (content.children.length) {
      const child = content.children.pop()!;
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          const material = obj.material;
          const mats = Array.isArray(material) ? material : [material];
          mats.forEach((m) => {
            const standard = m as THREE.MeshStandardMaterial;
            standard.map?.dispose();
            standard.normalMap?.dispose();
            standard.roughnessMap?.dispose();
            m.dispose();
          });
        }
      });
    }
    state.terrain = null;
    if (!world) return;
    const quality = props.quality;
    const meshResolution = quality === "low" ? 112 : quality === "medium" ? 176 : quality === "high" ? Math.min(300, world.resolution) : Math.min(440, world.resolution);
    const n = world.resolution;
    const step = (n - 1) / Math.max(1, meshResolution - 1);
    const verts = meshResolution * meshResolution;
    const positions = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const indices = new Uint32Array((meshResolution - 1) * (meshResolution - 1) * 6);
    let vi = 0;
    let ui = 0;
    for (let y = 0; y < meshResolution; y++) {
      const sy = Math.min(n - 1, Math.round(y * step));
      for (let x = 0; x < meshResolution; x++) {
        const sx = Math.min(n - 1, Math.round(x * step));
        positions[vi++] = (x / (meshResolution - 1) - 0.5) * WORLD_SIZE;
        positions[vi++] = world.heights[sy * n + sx] * 0.029;
        positions[vi++] = (y / (meshResolution - 1) - 0.5) * WORLD_SIZE;
        uvs[ui++] = x / (meshResolution - 1);
        uvs[ui++] = 1 - y / (meshResolution - 1);
      }
    }
    let ii = 0;
    for (let y = 0; y < meshResolution - 1; y++) {
      for (let x = 0; x < meshResolution - 1; x++) {
        const a = y * meshResolution + x;
        const b = a + 1;
        const c = a + meshResolution;
        const d = c + 1;
        indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
        indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const tex = terrainTexture(world, props.layers.colorMode, props.quality === "low" ? 384 : props.quality === "medium" ? 640 : 896);
    const detailSize = quality === "low" ? 256 : quality === "medium" ? 384 : 512;
    const { normalMap, roughnessMap } = surfaceDetailMaps(world, detailSize);
    const material = new THREE.MeshStandardMaterial({
      map: tex,
      normalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughnessMap,
      roughness: 1,
      metalness: 0.015,
      wireframe: props.layers.wireframe,
      side: THREE.FrontSide,
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    terrain.castShadow = quality === "high" || quality === "ultra";
    content.add(terrain);
    state.terrain = terrain;

    if (props.layers.water) {
      const environment = ENVIRONMENT_BY_ID[props.environment];
      state.waterMaterials.forEach((material) => {
        (material.userData as { heightTexture?: THREE.DataTexture }).heightTexture?.dispose();
        material.normalMap?.dispose();
        material.dispose();
      });
      state.waterMaterials = [];
      const waterNormals = waterNormalTexture();
      const lookup = heightLookupTexture(world);

      const oceanMaterial = createWaterMaterial({
        shallow: environment.waterShallow,
        deep: environment.waterDeep,
        opacity: Math.min(0.97, environment.waterOpacity + 0.04),
        side: THREE.FrontSide,
        normalMap: waterNormals,
        time: state.waterTime,
        heightTexture: lookup.texture,
        elevationMin: lookup.min,
        elevationMax: lookup.max,
      });
      (oceanMaterial.userData as { heightTexture?: THREE.DataTexture }).heightTexture = lookup.texture;
      state.waterMaterials.push(oceanMaterial);
      const ocean = new THREE.Mesh(new THREE.CircleGeometry(1400, 96), oceanMaterial);
      ocean.name = "ark:ocean";
      ocean.rotation.x = -Math.PI / 2;
      // Circular horizon: a square plane exposed its corners as a hard diamond.
      ocean.position.y = 0.04;
      ocean.receiveShadow = true;
      ocean.renderOrder = 1;
      content.add(ocean);

      const lakePositions: number[] = [];
      const lakeIndices: number[] = [];
      const waterY = (level: number) => level * 0.029 + 0.07;
      const cell = WORLD_SIZE / n;
      for (let y = 0; y < n - 1; y++) {
        for (let x = 0; x < n - 1; x++) {
          const i = y * n + x;
          if (!world.lakeMask[i]) continue;
          const level = world.lakeSurface[i];
          if (!world.lakeMask[i + 1] && !world.lakeMask[i + n]) continue;
          const px = (x / (n - 1) - 0.5) * WORLD_SIZE;
          const pz = (y / (n - 1) - 0.5) * WORLD_SIZE;
          const base = lakePositions.length / 3;
          lakePositions.push(px, waterY(level), pz, px + cell, waterY(level), pz, px, waterY(level), pz + cell, px + cell, waterY(level), pz + cell);
          lakeIndices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
      }
      if (lakePositions.length) {
        const lakeTexture = waterNormalTexture();
        lakeTexture.repeat.set(9, 9);
        const lakeMaterial = createWaterMaterial({
          shallow: environment.waterShallow,
          deep: environment.waterDeep,
          opacity: environment.waterOpacity,
          side: THREE.DoubleSide,
          normalMap: lakeTexture,
          time: state.waterTime,
          heightTexture: lookup.texture,
          elevationMin: lookup.min,
          elevationMax: lookup.max,
        });
        (lakeMaterial.userData as { heightTexture?: THREE.DataTexture }).heightTexture = lookup.texture;
        state.waterMaterials.push(lakeMaterial);
        const lakeGeo = new THREE.BufferGeometry();
        lakeGeo.setAttribute("position", new THREE.Float32BufferAttribute(lakePositions, 3));
        lakeGeo.setIndex(lakeIndices);
        lakeGeo.computeVertexNormals();
        const lakes = new THREE.Mesh(lakeGeo, lakeMaterial);
        lakes.renderOrder = 2;
        content.add(lakes);
      }
    }

    if (props.layers.rivers) {
      // Two channel classes: low-order tributaries are dim and thin, trunk rivers
      // are brighter. Segments that would visually bridge a steep ridge (large
      // cell-to-cell drop) or cross a lake surface are culled.
      const minor: number[] = [];
      const trunk: number[] = [];
      const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      const trunkThreshold = 1200;
      for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
          const i = y * n + x;
          if (!world.riverMask[i] || world.lakeMask[i]) continue;
          const dir = world.flowDirection[i];
          if (dir < 0 || dir > 7) continue;
          const nx = x + dirs[dir][0];
          const ny = y + dirs[dir][1];
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const ni = ny * n + nx;
          if (world.heights[ni] < 0 || world.lakeMask[ni]) continue;
          const drop = world.heights[i] - world.heights[ni];
          if (drop < 0 || drop > 210) continue;
          if (world.slope[i] > 1.35 || world.slope[ni] > 1.35) continue;
          const target = world.flowAccumulation[i] >= trunkThreshold ? trunk : minor;
          const y1 = world.heights[i] * 0.029 + 0.07;
          const y2 = world.heights[ni] * 0.029 + 0.07;
          target.push((x / (n - 1) - 0.5) * WORLD_SIZE, y1, (y / (n - 1) - 0.5) * WORLD_SIZE);
          target.push((nx / (n - 1) - 0.5) * WORLD_SIZE, y2, (ny / (n - 1) - 0.5) * WORLD_SIZE);
        }
      }
      const addRiverLines = (positions: number[], color: number, opacity: number) => {
        if (!positions.length) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const lines = new THREE.LineSegments(geometry, material);
        lines.renderOrder = 2;
        content.add(lines);
      };
      addRiverLines(minor, 0x5fbcb2, 0.42);
      addRiverLines(trunk, 0x9be9dc, 0.72);
    }

    const addInstances = (kind: "trunks" | "canopy" | "shrubs" | "rocks" | "landmarks") => {
      const treeKinds = ["redwood", "pine", "jungle", "palm"];
      let source: WorldObject[] = [];
      if (kind === "trunks") source = world.objects.filter((o) => treeKinds.includes(o.kind) && (o.kind === "pine" || o.kind === "redwood" || o.kind === "jungle" || o.kind === "palm"));
      else if (kind === "canopy") source = world.objects.filter((o) => treeKinds.includes(o.kind) && o.kind !== "palm");
      else if (kind === "shrubs") source = world.objects.filter((o) => o.kind === "shrub" || o.kind === "grass tuft");
      else if (kind === "rocks") source = world.objects.filter((o) => o.kind === "rock" || o.kind === "boulder");
      else source = world.objects.filter((o) => o.kind === "ruin" || o.kind === "obelisk");
      if (kind === "trunks" && !props.layers.vegetation) return;
      if (kind === "canopy" && !props.layers.vegetation) return;
      if (kind === "shrubs" && !props.layers.vegetation) return;
      if (kind === "rocks" && !props.layers.rocks) return;
      if (kind === "landmarks" && !props.layers.landmarks) return;
      const cap = quality === "low" ? 2600 : quality === "medium" ? 5200 : 12000;
      source = source.slice(0, cap);
      if (!source.length) return;
      let geo: THREE.BufferGeometry;
      if (kind === "trunks") geo = new THREE.CylinderGeometry(0.09, 0.17, 1, 5);
      else if (kind === "canopy") geo = new THREE.ConeGeometry(0.72, 1.5, 6);
      else if (kind === "shrubs") geo = new THREE.IcosahedronGeometry(0.42, 0);
      else if (kind === "rocks") geo = new THREE.DodecahedronGeometry(0.72, 0);
      else geo = new THREE.BoxGeometry(1.1, 1.8, 1.1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.02, flatShading: true });
      const mesh = new THREE.InstancedMesh(geo, mat, source.length);
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const temp = new THREE.Object3D();
      const color = new THREE.Color();
      source.forEach((obj, index) => {
        const x = (obj.x - 0.5) * WORLD_SIZE;
        const z = (obj.z - 0.5) * WORLD_SIZE;
        const baseY = obj.y * 0.029 + 0.05;
        if (kind === "trunks") {
          const h = (obj.kind === "redwood" ? 3.3 : obj.kind === "pine" ? 2.5 : obj.kind === "jungle" ? 2.9 : 2.1) * obj.scale;
          temp.position.set(x, baseY + h / 2, z);
          temp.scale.set(Math.max(0.25, obj.scale * 0.82), h, Math.max(0.25, obj.scale * 0.82));
          temp.rotation.set(0, obj.rotation, 0);
          color.set("#4b3a2c");
        } else if (kind === "canopy") {
          const h = (obj.kind === "redwood" ? 3.3 : obj.kind === "pine" ? 2.5 : 2.9) * obj.scale;
          temp.position.set(x, baseY + h + obj.scale * 0.55, z);
          temp.scale.set(obj.scale * (obj.kind === "redwood" ? 1.35 : 1), obj.scale * (obj.kind === "jungle" ? 1.25 : 1.1), obj.scale * (obj.kind === "redwood" ? 1.35 : 1));
          temp.rotation.set(0, obj.rotation, 0);
          color.set(objColor[obj.kind] || "#3f6a47");
        } else if (kind === "shrubs") {
          temp.position.set(x, baseY + 0.28 * obj.scale, z);
          temp.scale.setScalar(obj.kind === "grass tuft" ? obj.scale * 0.65 : obj.scale);
          temp.rotation.set(0, obj.rotation, 0);
          color.set(obj.kind === "grass tuft" ? "#7b8c4a" : objColor.shrub);
        } else if (kind === "rocks") {
          // Boulders are outcrops, not monoliths: cap the wide axis and sink them
          // slightly into the surface so they read as embedded rock.
          temp.position.set(x, baseY + 0.12 * obj.scale, z);
          temp.scale.set(obj.scale * 0.92, obj.scale * (obj.kind === "boulder" ? 0.72 : 0.5), obj.scale * 0.8);
          temp.rotation.set(obj.rotation * 0.45, obj.rotation, obj.rotation * 0.22);
          color.set(obj.kind === "boulder" ? "#72746b" : "#60645d");
        } else {
          temp.position.set(x, baseY + (obj.kind === "obelisk" ? 2.6 : 0.9) * obj.scale, z);
          temp.scale.set(obj.scale, obj.scale, obj.scale);
          temp.rotation.set(0, obj.rotation, 0);
          color.set(objColor[obj.kind]);
        }
        temp.updateMatrix();
        mesh.setMatrixAt(index, temp.matrix);
        mesh.setColorAt(index, color);
        if (kind !== "shrubs") {
          mesh.castShadow = (quality === "high" || quality === "ultra") && kind !== "trunks";
          mesh.receiveShadow = false;
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = true;
      content.add(mesh);
    };

    addInstances("trunks");
    addInstances("canopy");
    addCanopyTier(world, content, quality);
    addInstances("shrubs");
    if (props.layers.rocks) addInstances("rocks");
    if (props.layers.landmarks) addInstances("landmarks");

    if (props.layers.clouds) {
      const cloudGroup = state.clouds;
      cloudGroup.visible = true;
    } else {
      state.clouds.visible = false;
    }
  }, [props.world, props.world?.revision, props.layers, props.quality]);

  // Render quality / resolution
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const ratio = { low: 0.85, medium: 1.1, high: 1.55, ultra: 2 }[props.quality] * Math.min(1.5, window.devicePixelRatio || 1);
    state.renderer.setPixelRatio(Math.min(ratio, 2.4));
    state.renderer.shadowMap.enabled = props.quality === "high" || props.quality === "ultra";
    // Post-processing is a measured workload: enabled on High/Ultra and user-toggled.
    const postEnabled = props.layers.bloom && (props.quality === "high" || props.quality === "ultra");
    state.bloomPass.enabled = postEnabled;
    state.gradePass.enabled = postEnabled;
    state.resize();
  }, [props.quality, props.layers.bloom]);

  // Lighting preset. Environment presets own atmosphere/colour response; the
  // time-of-day control owns solar direction and night/day visibility.
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const sun = SUNS[props.sun];
    const environment = ENVIRONMENT_BY_ID[props.environment];
    const night = props.sun === "night";
    state.sunLight.position.set(...sun.dir);
    state.sunLight.color.set(environment.sunColor);
    state.sunLight.intensity = night ? 0.36 : environment.sunIntensity;
    state.hemi.color.set(environment.hemiSky);
    state.hemi.groundColor.set(environment.hemiGround);
    state.hemi.intensity = night ? environment.hemiIntensity * 0.45 : environment.hemiIntensity;
    const fog = state.scene.fog as THREE.FogExp2;
    fog.color.set(environment.fog);
    fog.density = environment.fogDensity;
    state.scene.background = new THREE.Color(environment.skyHorizon).multiplyScalar(0.32);
    state.renderer.toneMappingExposure = environment.exposure;
    state.sky.uniforms.uTop.value.set(environment.skyTop);
    state.sky.uniforms.uHorizon.value.set(environment.skyHorizon);
    state.sky.uniforms.uSunColor.value.set(environment.sunColor);
    state.sky.uniforms.uSunDir.value.set(...sun.dir).normalize();
    state.sunSprite.material.color.set(environment.sunColor);
    state.clouds.children.forEach((child) => {
      const material = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      material.opacity = environment.cloudOpacity * (0.4 + sun.clouds * 2.2);
      material.color.set(environment.cloudTint);
    });
    (state.stars.material as THREE.PointsMaterial).opacity = sun.stars;
    state.bloomPass.strength = environment.bloom;
    state.waterMaterials.forEach((material) => {
      const water = (material.userData as { water?: WaterUniformState }).water;
      if (!water) return;
      water.shallow.set(environment.waterShallow);
      water.deep.set(environment.waterDeep);
      water.opacity.value = environment.waterOpacity;
      material.opacity = environment.waterOpacity;
    });
  }, [props.sun, props.environment]);

  // Camera mode. Ground-level is solved from the actual height field rather than
  // a fixed guess, so the viewpoint is genuinely inside the world.
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const config = CAMERAS[props.cameraMode];
    let pos = new THREE.Vector3(...config.pos);
    let target = new THREE.Vector3(...config.target);
    if (props.cameraMode === "first" && props.world) {
      const world = props.world;
      const n = world.resolution;
      let best: { x: number; z: number; score: number } | null = null;
      for (let gy = Math.floor(n * 0.62); gy < Math.floor(n * 0.94); gy += Math.max(2, Math.floor(n / 40))) {
        for (let gx = Math.floor(n * 0.18); gx < Math.floor(n * 0.82); gx += Math.max(2, Math.floor(n / 40))) {
          const i = gy * n + gx;
          if (world.heights[i] < 12 || world.heights[i] > 420) continue;
          if (world.lakeMask[i] || world.slope[i] > 0.34) continue;
          if (world.coastDistance[i] > 45) continue;
          const score = Math.exp(-world.coastDistance[i] / 16) * 100 - world.slope[i] * 40;
          if (!best || score > best.score) best = { x: gx / (n - 1), z: gy / (n - 1), score };
        }
      }
      if (best) {
        const i = Math.round(best.z * (n - 1)) * n + Math.round(best.x * (n - 1));
        const groundY = world.heights[i] * 0.029;
        const x = (best.x - 0.5) * WORLD_SIZE;
        const z = (best.z - 0.5) * WORLD_SIZE;
        // Look inland toward the terrain centre so hills fill the frame.
        const inlandX = -x * 0.32;
        const inlandZ = -z * 0.32;
        let targetY = groundY + 6;
        const ti = Math.max(0, Math.min(n - 1, Math.round((best.z - Math.sign(z) * 0.18) * (n - 1)))) * n
          + Math.max(0, Math.min(n - 1, Math.round(best.x - Math.sign(x) * 0.18)) * (n - 1));
        targetY = Math.max(groundY + 3, world.heights[ti] * 0.029 + 2);
        // A true eye-level viewpoint makes canopy occlude the whole frame at this
        // geographic scale, so the inspection camera sits just above the tree line
        // (still metres from the ground) and looks along the slope.
        const eye = groundY + Math.max(3.2, Math.min(11, (world.maxHeight * 0.029) * 0.035));
        pos = new THREE.Vector3(x, eye, z);
        target = new THREE.Vector3(x + inlandX * 0.85, targetY + 1.5, z + inlandZ * 0.85);
      }
    }
    goalRef.current = { pos, target };
    state.controls.autoRotate = props.cameraMode === "cinematic";
    state.controls.autoRotateSpeed = 0.36;
    state.controls.minDistance = props.cameraMode === "first" ? 2 : 12;
    state.controls.maxDistance = props.cameraMode === "top" || props.cameraMode === "satellite" ? 620 : 520;
    state.controls.maxPolarAngle = props.cameraMode === "first" ? Math.PI * 0.6 : Math.PI * 0.495;
  }, [props.cameraMode, props.world]);

  // Tool brush ring
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.controls.enabled = props.tool === "orbit";
    state.renderer.domElement.style.cursor = props.tool === "orbit" ? "grab" : props.tool === "place" ? "copy" : props.tool === "erase" ? "not-allowed" : "crosshair";
    state.ring.visible = false;
    const color = props.tool === "raise" ? 0x5fe3c0
      : props.tool === "lower" ? 0xf09588
      : props.tool === "smooth" ? 0x8fd7ff
      : props.tool === "place" ? 0x9be28a
      : props.tool === "erase" ? 0xf08a74
      : 0xe9b872;
    (state.ring.material as THREE.MeshBasicMaterial).color.set(color);
  }, [props.tool]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#081115]">
      {!loaded && !webglError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#081115]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border border-[#2b4142] border-t-[#5fe3c0]" />
            <span className="mono text-[10px] uppercase tracking-[0.2em] text-[#66807a]">Initialising WebGL</span>
          </div>
        </div>
      )}
      {webglError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#081115] p-8 text-center">
          <div className="max-w-sm">
            <p className="mb-2 text-[13px] font-medium text-[#dbe9e4]">3D renderer unavailable</p>
            <p className="text-[11px] leading-relaxed text-[#7d938c]">{webglError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
