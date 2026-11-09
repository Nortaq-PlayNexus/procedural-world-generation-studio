import { useEffect, useMemo, useRef } from "react";
import {
  Activity, AlertTriangle, BarChart3, ChevronRight, Compass, Crosshair, Droplets, Eye, Gauge,
  Layers3, Map, Mountain, ShieldCheck, SlidersHorizontal, Thermometer, TreePine, Waves, Wind,
} from "lucide-react";
import { BIOMES, type WorldData } from "../lib/types";
import type { LayerState, SunPreset } from "./TerrainViewport";
import { MAP_LEGENDS, type MapInspection, type MapOverlay } from "./MapCanvas";
import { Bar, KeyValue, Pill, Readout, ScoreRing, Segmented, TinyHistogram, ToggleRow } from "./ui";
import { cn } from "../utils/cn";
import { clamp } from "../lib/noise";

export type InspectorTab = "overview" | "layers" | "metrics";

const OVERLAYS: { value: MapOverlay; label: string }[] = [
  { value: "biome", label: "Biomes" },
  { value: "elevation", label: "Elevation" },
  { value: "slope", label: "Slope" },
  { value: "moisture", label: "Moisture" },
  { value: "temperature", label: "Thermal" },
  { value: "hydrology", label: "Hydrology" },
  { value: "watershed", label: "Basins" },
  { value: "flow", label: "Flow accum." },
  { value: "suitability", label: "Habitat" },
];

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const BIOME_RGB = BIOMES.map((b) => rgb(b.color));

function MiniMap({ world, overlay, selected, onSelect }: { world: WorldData; overlay: MapOverlay; selected: MapInspection | null; onSelect: (sample: MapInspection) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    const n = world.resolution;
    for (let y = 0; y < size; y++) {
      const sy = Math.min(n - 1, Math.floor((y / size) * n));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(n - 1, Math.floor((x / size) * n));
        const i = sy * n + sx;
        let c: number[];
        const h = world.heights[i];
        if (h < 0) c = [15, 46, 59];
        else if (world.lakeMask[i]) c = [40, 112, 127];
        else if (overlay === "slope") {
          const s = clamp(world.slope[i] / 0.9, 0, 1);
          c = [35 + s * 160, 74 + s * 52, 72 + (1 - s) * 30];
        } else if (overlay === "moisture") {
          c = [174 - world.moisture[i] * 130, 132 + world.moisture[i] * 58, 88 + world.moisture[i] * 56];
        } else if (overlay === "elevation") {
          const t = clamp(h / Math.max(1, world.maxHeight), 0, 1);
          c = [28 + t * 180, 78 + t * 140, 60 + t * 150];
        } else {
          c = BIOME_RGB[world.biome[i]] || BIOME_RGB[7];
        }
        const left = world.heights[sy * n + Math.max(0, sx - 1)];
        const right = world.heights[sy * n + Math.min(n - 1, sx + 1)];
        const up = world.heights[Math.max(0, sy - 1) * n + sx];
        const down = world.heights[Math.min(n - 1, sy + 1) * n + sx];
        const shade = clamp(1 + (left - right) * 0.006 + (up - down) * 0.005, 0.65, 1.32);
        const out = (y * size + x) * 4;
        image.data[out] = clamp(c[0] * shade, 0, 255);
        image.data[out + 1] = clamp(c[1] * shade, 0, 255);
        image.data[out + 2] = clamp(c[2] * shade, 0, 255);
        image.data[out + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = "rgba(234,254,247,0.25)";
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath(); ctx.moveTo((g / 4) * size, 0); ctx.lineTo((g / 4) * size, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (g / 4) * size); ctx.lineTo(size, (g / 4) * size); ctx.stroke();
    }
    if (selected) {
      ctx.strokeStyle = "#ecfdf7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(selected.x * size, selected.y * size, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#5fe3c0";
      ctx.beginPath();
      ctx.arc(selected.x * size, selected.y * size, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [world, world.revision, overlay, selected]);

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 0.999);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 0.999);
    const n = world.resolution;
    const gx = Math.floor(x * n);
    const gy = Math.floor(y * n);
    const i = gy * n + gx;
    const biome = BIOMES[world.biome[i]];
    onSelect({
      x, y,
      elevation: world.heights[i],
      slope: (Math.atan(world.slope[i]) * 180) / Math.PI,
      temperature: world.temperature[i],
      moisture: world.moisture[i],
      biome: biome.label,
      biomeColor: biome.color,
      water: world.heights[i] < 0 ? "Ocean" : world.lakeMask[i] ? "Lake" : world.riverMask[i] ? "River" : "Dry land",
      flow: world.flowAccumulation[i],
    });
  };
  return (
    <div className="relative w-[118px] shrink-0 overflow-hidden rounded border border-[#2b3d3e] bg-[#081216]">
      <canvas ref={ref} onClick={pick} className="block h-[118px] w-[118px] cursor-crosshair" aria-label="Clickable world mini-map" />
      <div className="pointer-events-none absolute bottom-1 left-1 rounded-sm bg-black/55 px-1 py-px text-[7px] uppercase tracking-wider text-[#a6c5bb]">Click sample</div>
    </div>
  );
}

function ElevationProfile({ world }: { world: WorldData }) {
  const { path, area, seaY, min, max } = useMemo(() => {
    const n = world.resolution;
    const row = Math.floor(n * 0.48);
    const samples: number[] = [];
    for (let x = 0; x < n; x++) samples.push(world.heights[row * n + x]);
    const minV = Math.min(...samples);
    const maxV = Math.max(...samples);
    const range = Math.max(1, maxV - minV);
    const points = samples.map((v, i) => `${(i / (samples.length - 1)) * 200},${48 - ((v - minV) / range) * 42}`);
    return {
      path: `M${points.join(" L")}`,
      area: `M0,54 L${points.join(" L")} L200,54 Z`,
      seaY: 48 - ((0 - minV) / range) * 42,
      min: minV,
      max: maxV,
    };
  }, [world]);
  return (
    <div className="rounded-md border border-[var(--line)] bg-[#091215] px-2 pb-1.5 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#718781]"><Activity size={9} /> West–east transect</span>
        <span className="mono text-[8px] text-[#5e746d]">{min.toFixed(0)} → {max.toFixed(0)} m</span>
      </div>
      <svg viewBox="0 0 200 54" className="h-[50px] w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5fe3c0" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#5fe3c0" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <line x1="0" y1="12" x2="200" y2="12" stroke="#1c2b2d" strokeWidth="0.5" />
        <line x1="0" y1="30" x2="200" y2="30" stroke="#1c2b2d" strokeWidth="0.5" />
        <line x1="0" y1={seaY} x2="200" y2={seaY} stroke="rgba(95,183,196,0.35)" strokeWidth="0.7" strokeDasharray="3 3" />
        <path d={area} fill="url(#profileFill)" />
        <path d={path} fill="none" stroke="#6fe7c7" strokeWidth="1.15" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function RightPanel({
  world,
  tab,
  onTab,
  layers,
  onLayers,
  overlay,
  onOverlay,
  hillshade,
  onHillshade,
  contours,
  onContours,
  sun,
  onSun,
  selected,
  onSelect,
  onOpenAnalysis,
  onOpenValidation,
}: {
  world: WorldData | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  layers: LayerState;
  onLayers: (partial: Partial<LayerState>) => void;
  overlay: MapOverlay;
  onOverlay: (overlay: MapOverlay) => void;
  hillshade: boolean;
  onHillshade: (v: boolean) => void;
  contours: boolean;
  onContours: (v: boolean) => void;
  sun: SunPreset;
  onSun: (sun: SunPreset) => void;
  selected: MapInspection | null;
  onSelect: (sample: MapInspection) => void;
  onOpenAnalysis: () => void;
  onOpenValidation: () => void;
}) {
  const metrics = world?.metrics;
  const quality = world?.quality;
  const topBiomes = metrics?.biomeCoverage.slice().sort((a, b) => b.share - a.share).slice(0, 6) ?? [];
  const landArea = world ? world.config.widthKm * world.config.heightKm * (metrics?.landCoverage ?? 0) : 0;

  return (
    <aside className="right-rail flex h-full min-h-0 w-full flex-col border-l border-[var(--line)] bg-[#0a1115]">
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-[var(--accent)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c4d6d0]">World inspector</span>
        </div>
        <Pill tone="accent">measured</Pill>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--line)] px-3 py-1.5">
        {[
          { id: "overview" as const, label: "Overview", icon: <Eye size={11} /> },
          { id: "layers" as const, label: "Layers", icon: <Layers3 size={11} /> },
          { id: "metrics" as const, label: "Quality", icon: <BarChart3 size={11} /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => onTab(item.id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-[6px] text-[10px] font-medium transition",
              tab === item.id ? "bg-[#162321] text-[#d9ede5]" : "text-[#6b8079] hover:bg-white/[0.03] hover:text-[#adc2bb]",
            )}
          >
            {item.icon} {item.label}
            {tab === item.id && <span className="absolute -bottom-[7px] left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-[var(--accent)]" />}
          </button>
        ))}
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="fade-in p-3">
            <div className="relative overflow-hidden rounded-lg border border-[var(--line)] bg-[linear-gradient(140deg,#101e1f,#0a1317_62%)] p-3">
              <div className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-[rgba(95,227,192,0.07)] blur-2xl" />
              <div className="relative flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="mono text-[8px] uppercase tracking-[0.16em] text-[#647c74]">Procedural world</div>
                  <div className="mt-1 truncate text-[14px] font-semibold tracking-tight text-[#eff9f5]">{world?.config.name ?? "Awaiting generation"}</div>
                  <div className="mono mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8.5px] text-[#738a82]">
                    <span>SEED {world?.config.seed ?? "—"}</span>
                    <span className="text-[#394a46]">/</span>
                    <span>{world?.resolution ?? "—"}²</span>
                    <span className="text-[#394a46]">/</span>
                    <span>{(world?.config.widthKm ?? 0).toFixed(0)}×{(world?.config.heightKm ?? 0).toFixed(0)} km</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Pill tone={quality && quality.score >= 78 ? "accent" : "amber"}>{quality ? quality.grade : "—"} CLASS</Pill>
                    <span className="text-[9px] text-[#8aa29a]">{world ? "Regenerable from seed" : "Generate to inspect"}</span>
                  </div>
                </div>
                <ScoreRing score={quality?.score ?? 0} grade={quality?.grade ?? "–"} size={82} />
              </div>
              <div className="relative mt-2.5 grid grid-cols-3 gap-1 border-t border-[var(--line)] pt-2">
                <div>
                  <div className="text-[7.5px] uppercase tracking-wider text-[#5b7169]">Water</div>
                  <div className="mono mt-0.5 text-[11px] text-[#d4e5df]">{((metrics?.waterCoverage ?? 0) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[7.5px] uppercase tracking-wider text-[#5b7169]">Land</div>
                  <div className="mono mt-0.5 text-[11px] text-[#d4e5df]">{((metrics?.landCoverage ?? 0) * 100).toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-[7.5px] uppercase tracking-wider text-[#5b7169]">Objects</div>
                  <div className="mono mt-0.5 text-[11px] text-[#d4e5df]">{metrics?.objectCount.toLocaleString() ?? "—"}</div>
                </div>
              </div>
            </div>

            {world && (
              <div className="mt-2 flex gap-2 rounded-lg border border-[var(--line)] bg-[#0b1418] p-2">
                <MiniMap world={world} overlay={overlay} selected={selected} onSelect={onSelect} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[#6d847c]">
                    <Crosshair size={10} /> Surface sample
                  </div>
                  {selected ? (
                    <div className="mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: selected.biomeColor }} />
                        <span className="truncate text-[11px] font-medium text-[#e1eee9]">{selected.biome}</span>
                      </div>
                      <div className="mt-1 space-y-[1px]">
                        <KeyValue label="Elevation" value={`${selected.elevation.toFixed(0)} m`} />
                        <KeyValue label="Slope" value={`${selected.slope.toFixed(1)}°`} />
                        <KeyValue label="Temperature" value={`${selected.temperature.toFixed(1)}°C`} />
                        <KeyValue label="Moisture" value={selected.moisture.toFixed(2)} />
                        <KeyValue label="Drainage" value={selected.water} mono={false} />
                        <KeyValue label="Flow accum." value={`${Math.round(selected.flow)} cells`} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[86px] flex-col justify-center gap-1.5 text-[9.5px] leading-relaxed text-[#647a72]">
                      <Map size={15} className="text-[#4f665f]" />
                      Select a cell to inspect elevation, slope, climate and routed drainage.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Readout label="Peak elevation" value={`${(metrics?.maxElevation ?? 0).toFixed(0)} m`} sub={world ? `relief ${(world.maxHeight - world.minHeight).toFixed(0)} m` : undefined} accent />
              <Readout label="Mean slope" value={`${(((metrics?.meanSlope ?? 0) * 180) / Math.PI).toFixed(1)}°`} sub={`p95 ${(((metrics?.slopeP95 ?? 0) * 180) / Math.PI).toFixed(0)}°`} />
              <Readout label="River network" value={((metrics?.drainageDensity ?? 0)).toFixed(1)} sub="cells / 1k land" />
              <Readout label="Catchments" value={`${metrics?.watersheds ?? 0}`} sub={`${((metrics?.riverConnectivity ?? 0) * 100).toFixed(0)}% ocean-linked`} />
            </div>

            {world && <div className="mt-3"><ElevationProfile world={world} /></div>}

            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#7d938b]"><TreePine size={10} /> Biome composition</span>
              <button onClick={onOpenAnalysis} className="flex items-center gap-0.5 text-[9px] text-[#6fa398] transition hover:text-[var(--accent)]">Details <ChevronRight size={9} /></button>
            </div>
            <div className="mt-1.5 space-y-[6px]">
              {topBiomes.map((biome) => (
                <div key={biome.key} className="group">
                  <div className="mb-0.5 flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1.5 text-[9.5px] text-[#a9beb7]">
                      <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: biome.color }} />
                      {biome.label}
                    </span>
                    <span className="mono text-[8.5px] text-[#6e837c]">{(biome.share * 100).toFixed(1)}%</span>
                  </div>
                  <Bar value={biome.share * 100 * 2.6} color={biome.color} height={2} />
                </div>
              ))}
              {!world && <div className="py-4 text-[10px] text-[#61766f]">Biome shares appear after generation.</div>}
            </div>

            {world && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
                  <div className="mb-1 flex items-center justify-between text-[8.5px] uppercase tracking-wider text-[#6a7f78]"><span>Elevation spread</span><span className="mono text-[#8ba29a]">{metrics?.elevationStdDev.toFixed(0)} m</span></div>
                  <TinyHistogram data={metrics?.elevationHistogram ?? []} color="#65d5b8" height={28} />
                </div>
                <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
                  <div className="mb-1 flex items-center justify-between text-[8.5px] uppercase tracking-wider text-[#6a7f78]"><span>Slope spread</span><span className="mono text-[#8ba29a]">{(((metrics?.meanSlope ?? 0) * 180) / Math.PI).toFixed(0)}° avg</span></div>
                  <TinyHistogram data={metrics?.slopeHistogram ?? []} color="#b7a36a" height={28} />
                </div>
              </div>
            )}

            <div className="mt-3 rounded-md border border-[var(--line)] bg-[#0b1418] px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between text-[9px] font-medium uppercase tracking-wider text-[#6e847c]"><span>Hydrology measured</span><Droplets size={10} /></div>
              <div className="grid grid-cols-2 gap-x-3">
                <KeyValue label="Lakes" value={`${(metrics?.lakeCoverage ?? 0) > 0 ? ((metrics!.lakeCoverage * 100).toFixed(1) + "%") : "—"}`} />
                <KeyValue label="Mean temp" value={`${(metrics?.meanTemperature ?? 0).toFixed(1)}°C`} />
                <KeyValue label="Flow channels" value={`${((metrics?.riverCellShare ?? 0) * 100).toFixed(2)}%`} />
                <KeyValue label="Mean moisture" value={(metrics?.meanMoisture ?? 0).toFixed(2)} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 rounded border border-[rgba(95,227,192,0.14)] bg-[rgba(95,227,192,0.04)] px-2 py-1.5">
                <ShieldCheck size={11} className="shrink-0 text-[var(--accent)]" />
                <span className="flex-1 text-[8.5px] leading-snug text-[#82a79c]">All values measured from generated arrays. No synthetic telemetry.</span>
                <button onClick={onOpenValidation} className="shrink-0 text-[8px] text-[var(--accent)] underline-offset-2 hover:underline">Verify</button>
              </div>
            </div>
            <div className="mt-2 text-[8.5px] leading-relaxed text-[#4d625b]">Land area {landArea.toFixed(1)} km² · generation {(world?.generationMs ?? 0).toFixed(0)} ms · vertical display exaggeration ×2.4.</div>
          </div>
        )}

        {tab === "layers" && (
          <div className="fade-in p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9bb1aa]"><Map size={11} /> Cartographic overlay</span>
              <Pill>{MAP_LEGENDS[overlay].label}</Pill>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {OVERLAYS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => onOverlay(item.value)}
                  className={cn(
                    "rounded border px-1.5 py-[7px] text-[9px] font-medium transition",
                    overlay === item.value ? "border-[rgba(95,227,192,0.34)] bg-[rgba(95,227,192,0.08)] text-[#c9f2e6]" : "border-[var(--line)] bg-[#0b1418] text-[#70867e] hover:border-[var(--line-strong)] hover:text-[#b7ccc4]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1316] px-2.5 py-1">
              <ToggleRow label="Hillshade relief" checked={hillshade} onChange={onHillshade} hint="Multi-directional shading from measured local gradients." />
              <ToggleRow label="Elevation contours" checked={contours} onChange={onContours} hint="100 m contour intervals on the topographic renderer." />
            </div>

            <div className="mb-2 mt-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9bb1aa]"><Layers3 size={11} /> 3D scene layers</span>
              <span className="mono text-[8px] text-[#5a6f67]">REALTIME</span>
            </div>
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] px-2.5 py-1">
              <ToggleRow label="Ocean & lake surfaces" checked={layers.water} onChange={(v) => onLayers({ water: v })} dot="#2b8192" />
              <ToggleRow label="River network" checked={layers.rivers} onChange={(v) => onLayers({ rivers: v })} dot="#7fe3d7" />
              <ToggleRow label="Vegetation instancing" checked={layers.vegetation} onChange={(v) => onLayers({ vegetation: v })} dot="#4f8459" />
              <ToggleRow label="Rock fields" checked={layers.rocks} onChange={(v) => onLayers({ rocks: v })} dot="#827c6c" />
              <ToggleRow label="Landmarks & ruins" checked={layers.landmarks} onChange={(v) => onLayers({ landmarks: v })} dot="#c2a77a" />
              <ToggleRow label="Atmospheric clouds" checked={layers.clouds} onChange={(v) => onLayers({ clouds: v })} dot="#b9d8d3" />
              <ToggleRow label="Animated waves" checked={layers.waves} onChange={(v) => onLayers({ waves: v })} dot="#5fc9e0" hint="Animated ripple normals and depth-shaded water response." />
              <ToggleRow label="Bloom & grade" checked={layers.bloom} onChange={(v) => onLayers({ bloom: v })} dot="#e0c98a" hint="Cinematic bloom and colour grade. Renders only at High/Ultra quality; disabling reduces GPU workload." />
              <ToggleRow label="Terrain wireframe" checked={layers.wireframe} onChange={(v) => onLayers({ wireframe: v })} dot="#5fe3c0" />
            </div>

            <div className="mb-2 mt-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9bb1aa]"><Mountain size={11} /> Surface colouring</span>
            </div>
            <Segmented
              options={[
                { value: "biome", label: "Biome" },
                { value: "elevation", label: "Elev." },
                { value: "slope", label: "Slope" },
                { value: "moisture", label: "Water" },
              ]}
              value={layers.colorMode}
              onChange={(value) => onLayers({ colorMode: value as LayerState["colorMode"] })}
              className="w-full justify-between"
            />

            <div className="mb-2 mt-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9bb1aa]"><Wind size={11} /> Atmospheric time</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {([
                { id: "dawn" as const, label: "Dawn", grad: "linear-gradient(180deg,#5f7c78,#c09970)" },
                { id: "noon" as const, label: "Noon", grad: "linear-gradient(180deg,#477d8d,#b8c9b7)" },
                { id: "dusk" as const, label: "Dusk", grad: "linear-gradient(180deg,#1e3547,#b57764)" },
                { id: "night" as const, label: "Night", grad: "linear-gradient(180deg,#040b12,#1c3f49)" },
              ]).map((preset) => (
                <button key={preset.id} onClick={() => onSun(preset.id)} className={cn("overflow-hidden rounded border text-[8.5px] font-medium transition", sun === preset.id ? "border-[rgba(95,227,192,0.4)] text-[#dcf3eb]" : "border-[var(--line)] text-[#748a82] hover:border-[var(--line-strong)]")}>
                  <div className="h-7 w-full" style={{ background: preset.grad }} />
                  <div className="bg-[#0b1418] py-1">{preset.label}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-md border border-[var(--line)] bg-[#0a1316] px-2.5 py-2">
              <div className="mb-1 text-[9px] uppercase tracking-wider text-[#667c74]">Map legend · {MAP_LEGENDS[overlay].label}</div>
              <div className="flex overflow-hidden rounded-sm">
                {MAP_LEGENDS[overlay].stops.map((stop) => (
                  <div key={stop.label} className="h-2 flex-1" style={{ background: stop.color }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[7.5px] text-[#62776f]">
                {MAP_LEGENDS[overlay].stops.map((stop) => <span key={stop.label}>{stop.label}</span>)}
              </div>
            </div>
          </div>
        )}

        {tab === "metrics" && (
          <div className="fade-in p-3">
            <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[linear-gradient(130deg,#101e1f,#0a1316)] p-3">
              <ScoreRing score={quality?.score ?? 0} grade={quality?.grade ?? "–"} size={74} label="weighted" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8ba39a]">Composite quality</div>
                <div className="mt-0.5 text-[12px] font-semibold text-[#e3f0eb]">{quality ? (quality.score >= 78 ? "Production candidate" : quality.score >= 66 ? "Needs calibration" : "Revise structure") : "Not measured"}</div>
                <p className="mt-1 text-[9px] leading-relaxed text-[#6d837a]">Weighted from six measured categories. No metric is hidden behind the composite score.</p>
              </div>
            </div>

            <div className="mt-2 space-y-2.5 rounded-lg border border-[var(--line)] bg-[#0b1418] p-2.5">
              {(quality?.breakdown ?? []).map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-1">
                    <span className="text-[10px] font-medium text-[#b6cbc4]">{item.label}</span>
                    <span className="mono text-[9px] text-[#89a29a]">{item.score}<span className="ml-1 text-[8px] text-[#51655e]">×{item.weight}</span></span>
                  </div>
                  <Bar value={item.score} color={item.score >= 76 ? "#5fe3c0" : item.score >= 55 ? "#d3b573" : "#d58a6f"} height={3} />
                  <div className="mt-0.5 text-[8px] text-[#5b7068]">{item.detail}</div>
                </div>
              ))}
              {!quality && <div className="py-4 text-center text-[10px] text-[#667b73]">Generate a world to populate measured quality.</div>}
            </div>

            {quality && (
              <div className="mt-2 rounded-md border border-[rgba(233,184,114,0.2)] bg-[rgba(233,184,114,0.035)] p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#d0a66f]"><AlertTriangle size={10} /> Advisories · {quality.warnings.length}</div>
                <div className="space-y-1.5">
                  {quality.warnings.slice(0, 3).map((warning) => (
                    <p key={warning} className="flex gap-1.5 text-[9px] leading-relaxed text-[#b4a187]"><span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[#cfa76e]" />{warning}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1316] px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-[#6e847c]"><span>Spatial diversity</span><Gauge size={10} /></div>
              <KeyValue label="Shannon H′" value={(metrics?.shannonDiversity ?? 0).toFixed(3)} />
              <KeyValue label="Dominant biome" value={`${((metrics?.largestBiomeShare ?? 0) * 100).toFixed(1)}%`} />
              <KeyValue label="Coastal complexity" value={`${((metrics?.coastlineComplexity ?? 0) * 100).toFixed(0)}%`} />
              <KeyValue label="Flat areas" value={`${((metrics?.flatShare ?? 0) * 100).toFixed(0)}%`} />
              <KeyValue label="Object density" value={`${(metrics?.objectDensity ?? 0).toFixed(1)} / 1k`} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1">
              <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
                <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[#61766e]"><Thermometer size={9} /> Climate</div>
                <div className="mono mt-1 text-[11px] text-[#c8dcd4]">{(metrics?.meanTemperature ?? 0).toFixed(1)}°C <span className="text-[8px] text-[#5a6f67]">avg</span></div>
              </div>
              <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
                <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[#61766e]"><Waves size={9} /> Scenic index</div>
                <div className="mono mt-1 text-[11px] text-[#c8dcd4]">{((metrics?.scenicIndex ?? 0) * 100).toFixed(0)} <span className="text-[8px] text-[#5a6f67]">/ 100</span></div>
              </div>
            </div>

            <button onClick={onOpenAnalysis} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[rgba(95,227,192,0.25)] bg-[rgba(95,227,192,0.06)] py-2 text-[10px] font-medium text-[#a8e4d4] transition hover:bg-[rgba(95,227,192,0.1)]">
              <BarChart3 size={11} /> Open analysis laboratory
            </button>
            <button onClick={onOpenValidation} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--line)] bg-[#0b1418] py-2 text-[10px] font-medium text-[#8ca29a] transition hover:text-[#d5e7e0]">
              <ShieldCheck size={11} /> Run mathematical validation
            </button>

            <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--line)] bg-[#091215] p-2.5">
              <Compass size={13} className="mt-0.5 shrink-0 text-[#5b746b]" />
              <div>
                <div className="text-[9px] font-medium text-[#9bb2aa]">Interpretation limits</div>
                <p className="mt-0.5 text-[8.5px] leading-relaxed text-[#5b7068]">Slope uses central finite differences. Quality targets are studio heuristics, not geological ground truth. ARK exports are source datasets unless cooked by the target engine.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[#0a1216] px-3 py-2">
        <button onClick={onOpenValidation} className="flex w-full items-center gap-2 text-left">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(95,227,192,0.2)] bg-[rgba(95,227,192,0.06)] text-[var(--accent)]"><ShieldCheck size={11} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-medium text-[#a6bdb4]">Validation baseline</div>
            <div className="mono text-[8px] text-[#5b7169]">14 checks · deterministic seeds</div>
          </div>
          <ChevronRight size={11} className="text-[#52685f]" />
        </button>
      </div>
    </aside>
  );
}
