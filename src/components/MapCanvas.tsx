import { useEffect, useRef } from "react";
import { BIOMES, type WorldData } from "../lib/types";
import { clamp } from "../lib/noise";

export type MapOverlay = "biome" | "elevation" | "slope" | "moisture" | "temperature" | "hydrology" | "watershed" | "flow" | "suitability";

export interface MapInspection {
  x: number;
  y: number;
  elevation: number;
  slope: number;
  temperature: number;
  moisture: number;
  biome: string;
  biomeColor: string;
  water: string;
  flow: number;
}

const RGB = BIOMES.map((b) => [parseInt(b.color.slice(1, 3), 16), parseInt(b.color.slice(3, 5), 16), parseInt(b.color.slice(5, 7), 16)]);

export const MAP_LEGENDS: Record<MapOverlay, { label: string; stops: { color: string; label: string }[] }> = {
  biome: { label: "Biome province", stops: [{ color: "#1c5236", label: "Rainforest" }, { color: "#7f8b4c", label: "Grass" }, { color: "#c0a46b", label: "Arid" }, { color: "#77827c", label: "Alpine" }, { color: "#e3e8e7", label: "Snow" }] },
  elevation: { label: "Elevation (m)", stops: [{ color: "#17423f", label: "0" }, { color: "#6e8a57", label: "350" }, { color: "#b9a477", label: "700" }, { color: "#e2e5e0", label: "1200" }] },
  slope: { label: "Slope (degrees)", stops: [{ color: "#16414a", label: "flat" }, { color: "#a5a15c", label: "18°" }, { color: "#c87649", label: "35°" }, { color: "#a93532", label: "55°+" }] },
  moisture: { label: "Moisture index", stops: [{ color: "#af8756", label: "arid" }, { color: "#8e9c62", label: "mesic" }, { color: "#3f8e76", label: "humid" }, { color: "#256e7a", label: "saturated" }] },
  temperature: { label: "Surface temperature (°C)", stops: [{ color: "#3e7fba", label: "−15" }, { color: "#77b6a0", label: "5" }, { color: "#d6bd72", label: "20" }, { color: "#bc6448", label: "34" }] },
  hydrology: { label: "Hydrology", stops: [{ color: "#174552", label: "ocean" }, { color: "#327f8e", label: "lake" }, { color: "#82e7dc", label: "river" }, { color: "#56674f", label: "land" }] },
  watershed: { label: "Drainage basins", stops: [{ color: "#74b9a8", label: "basin A" }, { color: "#a7a06b", label: "basin B" }, { color: "#718fb1", label: "basin C" }, { color: "#a97f93", label: "basin D" }] },
  flow: { label: "Flow accumulation", stops: [{ color: "#1b2a34", label: "1 cell" }, { color: "#3f8892", label: "20" }, { color: "#6ddbc9", label: "200" }, { color: "#e7f8e9", label: "2,000+" }] },
  suitability: { label: "Habitat suitability", stops: [{ color: "#6b3f36", label: "excluded" }, { color: "#8c8060", label: "marginal" }, { color: "#80a578", label: "viable" }, { color: "#62d3ad", label: "optimal" }] },
};

function colorFor(world: WorldData, i: number, overlay: MapOverlay): [number, number, number] {
  const h = world.heights[i];
  const slopeDeg = (Math.atan(world.slope[i]) * 180) / Math.PI;
  const temp = world.temperature[i];
  const moist = world.moisture[i];
  if (h < 0) {
    const depth = clamp(-h / 780, 0, 1);
    return [12 + (1 - depth) * 18, 43 + (1 - depth) * 33, 57 + (1 - depth) * 30];
  }
  if (world.lakeMask[i] && overlay !== "elevation") return [41, 116, 133];
  switch (overlay) {
    case "elevation": {
      const t = clamp(h / Math.max(1, world.maxHeight), 0, 1);
      if (t < 0.15) return [30, 78, 65];
      if (t < 0.35) return [88, 124, 76];
      if (t < 0.58) return [172, 156, 104];
      if (t < 0.78) return [162, 140, 118];
      return [226, 231, 226];
    }
    case "slope": {
      const s = clamp(slopeDeg / 55, 0, 1);
      if (s < 0.35) return [25 + s * 120, 66 + s * 95, 70 + s * 12];
      return [Math.round(130 + (s - 0.35) * 260), Math.round(120 - (s - 0.35) * 100), Math.round(88 - (s - 0.35) * 50)];
    }
    case "moisture": {
      const m = clamp(moist, 0, 1);
      if (m < 0.4) return [172 - m * 250, 136 + m * 40, 90 + m * 20];
      return [Math.round(130 - (m - 0.4) * 160), Math.round(152 + (m - 0.4) * 50), Math.round(100 + (m - 0.4) * 90)];
    }
    case "temperature": {
      const t = clamp((temp + 18) / 55, 0, 1);
      return [Math.round(60 + t * 190), Math.round(130 - Math.abs(t - 0.5) * 90), Math.round(190 - t * 140)];
    }
    case "watershed": {
      const id = world.watershed[i];
      if (id < 0) return [80, 88, 84];
      const seed = Math.abs(id) * 9301 + 49297;
      const hue = (seed % 360) / 360;
      const c = { r: 0, g: 0, b: 0 };
      const k = (n: number) => (n + hue * 6) % 6;
      const f = (n: number, t: number, s: number, v: number) => {
        const p = v * (1 - s);
        const q = v * (1 - s * t);
        const u = v * (1 - s * (1 - t));
        const kk = Math.floor(n) % 6;
        return [ [v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q] ][kk].map((x) => Math.round(x * 255));
      };
      const rgb = f(k(0), k(2), k(4), 0.58);
      c.r = rgb[0]; c.g = rgb[1]; c.b = rgb[2];
      return [c.r, c.g, c.b];
    }
    case "flow": {
      const f = Math.log(world.flowAccumulation[i] + 1) / Math.log(2400);
      const v = clamp(f, 0, 1);
      return [Math.round(24 + v * 62), Math.round(44 + v * 180), Math.round(48 + v * 150)];
    }
    case "hydrology":
      return world.riverMask[i] ? [130, 231, 220] : [86, 103, 79];
    case "suitability": {
      if (world.riverMask[i] || world.lakeMask[i]) return [110, 72, 61];
      const slopePenalty = clamp((slopeDeg - 10) / 35, 0, 1);
      const water = clamp(world.coastDistance[i] / 24, 0, 1);
      const vegetation = BIOMES[world.biome[i]].vegetation;
      const value = clamp(0.55 + vegetation * 0.35 - slopePenalty * 0.5 - water * 0.12, 0, 1);
      if (value < 0.35) return [107, 63, 54];
      if (value < 0.55) return [140, 128, 96];
      if (value < 0.74) return [128, 165, 120];
      return [98, 211, 173];
    }
    default: {
      const base = RGB[world.biome[i]] || RGB[7];
      return base as [number, number, number];
    }
  }
}

export default function MapCanvas({
  world,
  overlay,
  hillshade,
  contours,
  selected,
  onSelect,
  interactive = true,
}: {
  world: WorldData;
  overlay: MapOverlay;
  hillshade: boolean;
  contours: boolean;
  selected: { x: number; y: number } | null;
  onSelect?: (inspection: MapInspection) => void;
  interactive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const n = world.resolution;
    const size = Math.min(1400, Math.max(640, Math.round(wrapperRef.current?.clientWidth || 960)));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const sy = Math.min(n - 1, Math.floor((y / size) * n));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(n - 1, Math.floor((x / size) * n));
        const i = sy * n + sx;
        let [r, g, b] = colorFor(world, i, overlay);
        if (hillshade && world.heights[i] >= 0) {
          const left = world.heights[sy * n + Math.max(0, sx - 1)];
          const right = world.heights[sy * n + Math.min(n - 1, sx + 1)];
          const up = world.heights[Math.max(0, sy - 1) * n + sx];
          const down = world.heights[Math.min(n - 1, sy + 1) * n + sx];
          const shade = clamp(0.94 + (left - right) * 0.006 + (up - down) * 0.0055, 0.6, 1.35);
          r = Math.round(r * shade);
          g = Math.round(g * shade);
          b = Math.round(b * shade);
        }
        const out = (y * size + x) * 4;
        image.data[out] = clamp(r, 0, 255);
        image.data[out + 1] = clamp(g, 0, 255);
        image.data[out + 2] = clamp(b, 0, 255);
        image.data[out + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);

    // rivers top layer
    ctx.strokeStyle = overlay === "hydrology" || overlay === "flow" ? "rgba(188,252,242,0.92)" : "rgba(120,214,206,0.52)";
    ctx.lineWidth = Math.max(0.85, size / 1100);
    ctx.beginPath();
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (!world.riverMask[i]) continue;
        const d = world.flowDirection[i];
        if (d < 0) continue;
        const nx = x + dirs[d][0];
        const ny = y + dirs[d][1];
        ctx.moveTo((x / n) * size, (y / n) * size);
        ctx.lineTo((nx / n) * size, (ny / n) * size);
      }
    }
    ctx.stroke();

    if (contours) {
      ctx.strokeStyle = "rgba(9, 20, 21, 0.28)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const interval = 100;
      for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
          const i = y * n + x;
          const h = world.heights[i];
          if (h < 0) continue;
          const band = Math.floor(h / interval);
          const right = Math.floor(world.heights[i + 1] / interval);
          const down = Math.floor(world.heights[i + n] / interval);
          if (band !== right) {
            ctx.moveTo((x / n) * size, (y / n) * size);
            ctx.lineTo(((x + 1) / n) * size, (y / n) * size);
          }
          if (band !== down) {
            ctx.moveTo((x / n) * size, (y / n) * size);
            ctx.lineTo((x / n) * size, ((y + 1) / n) * size);
          }
        }
      }
      ctx.stroke();
    }

    // graticule
    ctx.strokeStyle = "rgba(220,244,238,0.14)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 10]);
    for (let g = 1; g < 8; g++) {
      ctx.beginPath();
      ctx.moveTo((g / 8) * size, 0);
      ctx.lineTo((g / 8) * size, size);
      ctx.moveTo(0, (g / 8) * size);
      ctx.lineTo(size, (g / 8) * size);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(8,16,18,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    if (selected) {
      const px = selected.x * size;
      const py = selected.y * size;
      ctx.strokeStyle = "#ecfdf7";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(px, py, 13, 0, Math.PI * 2);
      ctx.moveTo(px - 22, py);
      ctx.lineTo(px + 22, py);
      ctx.moveTo(px, py - 22);
      ctx.lineTo(px, py + 22);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#5fe3c0";
      ctx.beginPath();
      ctx.arc(px, py, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [world, world.revision, overlay, hillshade, contours, selected]);

  const inspect = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !onSelect) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 0.999);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 0.999);
    const n = world.resolution;
    const gx = Math.floor(x * n);
    const gy = Math.floor(y * n);
    const i = gy * n + gx;
    const biome = BIOMES[world.biome[i]];
    onSelect({
      x,
      y,
      elevation: world.heights[i],
      slope: (Math.atan(world.slope[i]) * 180) / Math.PI,
      temperature: world.temperature[i],
      moisture: world.moisture[i],
      biome: biome.label,
      biomeColor: biome.color,
      water: world.heights[i] < 0 ? "Ocean" : world.lakeMask[i] ? "Lake" : world.riverMask[i] ? "River channel" : "Dry",
      flow: world.flowAccumulation[i],
    });
  };

  return (
    <div ref={wrapperRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#081014]">
      <div className="absolute inset-0 checker opacity-30" />
      <div className="relative aspect-square h-[92%] max-h-[92%] max-w-[94%] overflow-hidden rounded-sm border border-[#2a3d3e] shadow-[0_20px_90px_rgba(0,0,0,0.6)]">
        <canvas ref={canvasRef} className="h-full w-full cursor-crosshair" onPointerDown={inspect} />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />
      </div>
    </div>
  );
}
