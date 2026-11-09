import {
  ArrowDown, ArrowUp, Camera, Compass, Crosshair, Eraser, FlaskConical, Layers3, Loader2,
  Maximize2, Mountain, MousePointer2, Orbit, Play, Satellite, ScanEye, Sun, Waves, X, TreePine, Trash2,
} from "lucide-react";
import TerrainViewport, { type CameraMode, type EditTool, type LayerState, type RenderQuality, type SunPreset } from "./TerrainViewport";
import MapCanvas, { MAP_LEGENDS, type MapInspection, type MapOverlay } from "./MapCanvas";
import type { GenerationProgress, ObjectKind, PerfStats, WorldData } from "../lib/types";
import { ENVIRONMENTS, type EnvironmentId } from "../lib/environments";
import { cn } from "../utils/cn";
import { Segmented } from "./ui";

export type ViewMode = "world" | "map" | "split";

const CAMERA_LABELS: Record<CameraMode, string> = {
  free: "Free explore",
  top: "Top-down",
  satellite: "Satellite",
  geology: "Geological",
  first: "Ground level",
  cinematic: "Cinematic orbit",
};

const CAMERA_ICONS: Record<CameraMode, React.ReactNode> = {
  free: <Orbit size={11} />,
  top: <Mountain size={11} />,
  satellite: <Satellite size={11} />,
  geology: <ScanEye size={11} />,
  first: <Crosshair size={11} />,
  cinematic: <Camera size={11} />,
};

const TOOLS: { id: EditTool; label: string; icon: React.ReactNode }[] = [
  { id: "orbit", label: "Navigate (V)", icon: <MousePointer2 size={14} /> },
  { id: "raise", label: "Raise terrain (1)", icon: <ArrowUp size={14} /> },
  { id: "lower", label: "Lower terrain (2)", icon: <ArrowDown size={14} /> },
  { id: "smooth", label: "Smooth terrain (3)", icon: <Waves size={14} /> },
  { id: "flatten", label: "Flatten terrain (4)", icon: <Eraser size={14} /> },
  { id: "place", label: "Place environment asset (P)", icon: <TreePine size={14} /> },
  { id: "erase", label: "Remove environment assets (E)", icon: <Trash2 size={14} /> },
];

export default function ViewportStage({
  world,
  viewMode,
  onViewMode,
  overlay,
  onOverlay,
  layers,
  quality,
  onQuality,
  cameraMode,
  onCameraMode,
  sun,
  onSun,
  environment,
  onEnvironment,
  tool,
  onTool,
  brushRadius,
  assetKind,
  isGenerating,
  progress,
  onCancel,
  onPerf,
  onEdit,
  onEditStart,
  onEditEnd,
  selected,
  onSelect,
  hillshade,
  contours,
  onOpenProcesses,
  perf,
}: {
  world: WorldData | null;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  overlay: MapOverlay;
  onOverlay: (overlay: MapOverlay) => void;
  layers: LayerState;
  quality: RenderQuality;
  onQuality: (quality: RenderQuality) => void;
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
  sun: SunPreset;
  onSun: (sun: SunPreset) => void;
  environment: EnvironmentId;
  onEnvironment: (environment: EnvironmentId) => void;
  tool: EditTool;
  onTool: (tool: EditTool) => void;
  brushRadius: number;
  assetKind: ObjectKind;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  onCancel: () => void;
  onPerf: (perf: PerfStats) => void;
  onEdit: (u: number, v: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  selected: MapInspection | null;
  onSelect: (sample: MapInspection) => void;
  hillshade: boolean;
  contours: boolean;
  onOpenProcesses: () => void;
  perf: PerfStats | null;
}) {
  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#081014]">
      <div className="relative flex min-h-0 flex-1">
        {viewMode !== "map" && (
          <div className={cn("relative min-w-0", viewMode === "split" ? "w-1/2 border-r border-[#30403f]" : "w-full")}>
            {world ? (
              <TerrainViewport
                world={world}
                cameraMode={cameraMode}
                quality={quality}
                sun={sun}
                environment={environment}
                layers={layers}
                tool={tool}
                brushRadius={brushRadius}
                editing
                onPerf={onPerf}
                onEdit={onEdit}
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_38%,#11252a,#070e12_70%)]">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-[rgba(95,227,192,0.2)] bg-[#0b1a1c]">
                    <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-[#c5dad3]">Synthesising terrain</div>
                    <div className="mono mt-1 text-[9px] uppercase tracking-[0.15em] text-[#5b736b]">{progress?.phase ?? "Awaiting generation"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {viewMode !== "world" && (
          <div className={cn("relative min-w-0 bg-[#081014]", viewMode === "split" ? "w-1/2" : "w-full")}>
            {world ? (
              <MapCanvas world={world} overlay={overlay} hillshade={hillshade} contours={contours} selected={selected ? { x: selected.x, y: selected.y } : null} onSelect={onSelect} />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-[#576c65]">Topographic renderer waiting for field data</div>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-10 viewport-vignette" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-black/55 to-transparent" />

        {/* Top workspace chrome */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
          <div className="pointer-events-auto flex flex-col items-start gap-1.5">
            <div className="glass flex items-center gap-2 rounded-md px-2.5 py-[6px]">
              <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[rgba(95,227,192,0.1)]"><Layers3 size={10} className="text-[var(--accent)]" /></span>
              <span className="mono text-[8.5px] uppercase tracking-[0.15em] text-[#8ba49b]">Live world</span>
              <span className="max-w-[120px] truncate text-[10px] font-medium text-[#d7e8e2]">{world?.config.name ?? "—"}</span>
              <span className="mono rounded-sm border border-[rgba(95,227,192,0.22)] bg-[rgba(95,227,192,0.06)] px-1 py-px text-[7px] uppercase text-[#6edbc1]">Realtime</span>
            </div>
            <Segmented
              value={viewMode}
              onChange={(value) => onViewMode(value as ViewMode)}
              options={[
                { value: "world", label: "3D world" },
                { value: "map", label: "Topographic" },
                { value: "split", label: "Split" },
              ]}
              size="sm"
              className="bg-[#081114]/85 backdrop-blur"
            />
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
            <div className="glass flex items-center gap-1 rounded-md p-1">
              <span className="mono px-1 text-[7.5px] uppercase tracking-wider text-[#617a71]">GPU</span>
              <select
                value={quality}
                onChange={(event) => onQuality(event.target.value as RenderQuality)}
                aria-label="Render quality"
                className="no-native-select rounded bg-transparent py-0.5 pl-1 pr-5 text-[9.5px] font-medium text-[#c2d6cf] outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="ultra">Ultra</option>
              </select>
            </div>
            <div className="glass flex items-center gap-1 rounded-md p-1">
              <span className="px-1 text-[#6e8a80]">{CAMERA_ICONS[cameraMode]}</span>
              <select
                value={cameraMode}
                onChange={(event) => onCameraMode(event.target.value as CameraMode)}
                aria-label="Camera mode"
                className="no-native-select rounded bg-transparent py-0.5 pl-1 pr-5 text-[9.5px] font-medium text-[#c2d6cf] outline-none"
              >
                {(Object.keys(CAMERA_LABELS) as CameraMode[]).map((mode) => <option key={mode} value={mode}>{CAMERA_LABELS[mode]}</option>)}
              </select>
            </div>
            <div className="glass flex items-center gap-1 rounded-md p-1">
              <span className="px-1 text-[#7ea39a]"><TreePine size={11} /></span>
              <select
                value={environment}
                onChange={(event) => onEnvironment(event.target.value as EnvironmentId)}
                aria-label="Environment preset"
                title="Environment preset — atmosphere and water response only"
                className="no-native-select max-w-[112px] rounded bg-transparent py-0.5 pl-1 pr-5 text-[9.5px] font-medium text-[#c2d6cf] outline-none"
              >
                {ENVIRONMENTS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </div>
            <div className="glass flex items-center gap-1 rounded-md p-1">
              <Sun size={11} className="mx-1 text-[#b8b286]" />
              <select
                value={sun}
                onChange={(event) => onSun(event.target.value as SunPreset)}
                aria-label="Lighting preset"
                className="no-native-select rounded bg-transparent py-0.5 pl-1 pr-5 text-[9.5px] font-medium text-[#c2d6cf] outline-none"
              >
                <option value="dawn">Dawn</option>
                <option value="noon">Noon</option>
                <option value="dusk">Dusk</option>
                <option value="night">Night</option>
              </select>
            </div>
            <button onClick={onOpenProcesses} title="Simulation processes" className="glass flex items-center gap-1.5 rounded-md px-2 py-[7px] text-[9.5px] font-medium text-[#9fb5ad] transition hover:text-[#e0f1eb]">
              <FlaskConical size={11} /> <span className="hidden xl:inline">Simulate</span>
            </button>
            <button title="Full screen (browser F11)" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="glass flex h-[28px] w-[28px] items-center justify-center rounded-md text-[#8ea49c] transition hover:text-white">
              <Maximize2 size={11} />
            </button>
          </div>
        </div>

        {/* Editing tools */}
        {viewMode !== "map" && (
          <div className="pointer-events-auto absolute left-3 top-[88px] z-20 flex flex-col gap-[3px] rounded-lg border border-[rgba(168,200,193,0.12)] bg-[#0a1215]/90 p-1 shadow-xl backdrop-blur-md">
            {TOOLS.map((item) => (
              <button
                key={item.id}
                onClick={() => onTool(item.id)}
                title={item.label}
                aria-label={item.label}
                className={cn(
                  "relative flex h-7 w-7 items-center justify-center rounded transition",
                  tool === item.id ? "bg-[rgba(95,227,192,0.13)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(95,227,192,0.22)]" : "text-[#7b928a] hover:bg-white/5 hover:text-[#d8ece4]",
                )}
              >
                {item.icon}
                {tool === item.id && <span className="absolute -right-[1px] top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent)]" />}
              </button>
            ))}
            <div className="my-0.5 h-px bg-[var(--line)]" />
            <button onClick={onOpenProcesses} title="Run geological processes" className="flex h-7 w-7 items-center justify-center rounded text-[#7b928a] transition hover:bg-white/5 hover:text-[#c9ded6]">
              <FlaskConical size={13} />
            </button>
          </div>
        )}

        {tool !== "orbit" && viewMode !== "map" && (
          <div className="pointer-events-none absolute left-1/2 top-[88px] z-20 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full border border-[rgba(95,227,192,0.25)] bg-[#0a1a1a]/90 px-3 py-1.5 shadow-lg backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] live-dot" />
              <span className="text-[9.5px] font-medium text-[#cbebe1]">{tool === "place" ? `Place ${assetKind}` : tool === "erase" ? "Erase assets" : `${tool.charAt(0).toUpperCase() + tool.slice(1)} brush`}</span>
              <span className="mono text-[8.5px] text-[#6e8d83]">R {brushRadius} cells</span>
              <span className="text-[8.5px] text-[#59716a]">{tool === "place" || tool === "erase" ? "click terrain" : "drag terrain to sculpt"}</span>
            </div>
          </div>
        )}

        {/* Map-only overlay switch */}
        {viewMode !== "world" && (
          <div className="pointer-events-auto absolute left-3 top-[88px] z-20 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-1">
            {(["biome", "elevation", "slope", "hydrology", "watershed", "flow", "temperature", "moisture", "suitability"] as MapOverlay[]).map((item) => (
              <button
                key={item}
                onClick={() => onOverlay(item)}
                className={cn(
                  "rounded border px-2 py-[3px] text-[8.5px] font-medium capitalize backdrop-blur transition",
                  overlay === item ? "border-[rgba(95,227,192,0.34)] bg-[rgba(95,227,192,0.12)] text-[#d4f6ec]" : "border-white/10 bg-black/35 text-[#94aca3] hover:text-white",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {/* Sample / coordinates */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-end gap-2">
          <div className="pointer-events-auto glass min-w-[180px] rounded-md px-2.5 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[7.5px] uppercase tracking-[0.16em] text-[#6f8a80]">Surface sample</span>
              <Crosshair size={9} className="text-[#5f7a71]" />
            </div>
            {selected ? (
              <>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: selected.biomeColor }} />
                  <span className="text-[10px] font-medium text-[#dbece5]">{selected.biome}</span>
                </div>
                <div className="mono mt-1 grid grid-cols-3 gap-2 text-[8.5px] text-[#8aa39a]">
                  <span>{selected.elevation.toFixed(0)} m</span>
                  <span>{selected.slope.toFixed(0)}° slope</span>
                  <span>{selected.temperature.toFixed(0)}°C</span>
                </div>
                <div className="mono mt-0.5 text-[7.5px] text-[#59706a]">X {selected.x.toFixed(2)} · Y {selected.y.toFixed(2)} · {selected.water}</div>
              </>
            ) : (
              <div className="mono mt-1 text-[8.5px] text-[#6e877e]">Pick a point to inspect</div>
            )}
          </div>
          <div className="glass flex h-[34px] w-[34px] flex-col items-center justify-center rounded-full">
            <span className="text-[7px] font-semibold text-[#d5e9e1]">N</span>
            <Compass size={13} className="-mt-0.5 text-[#8ba59b]" />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 bg-black/35 px-2 py-1 backdrop-blur md:flex">
          {viewMode !== "world" && MAP_LEGENDS[overlay].stops.map((stop) => (
            <div key={stop.label} className="flex items-center gap-1 px-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: stop.color }} />
              <span className="text-[7.5px] text-[#8ba29a]">{stop.label}</span>
            </div>
          ))}
          {viewMode === "world" && <span className="mono text-[7.5px] uppercase tracking-[0.12em] text-[#728b81]">Drag to orbit · scroll to zoom · right-drag to pan</span>}
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-1">
          <div className="glass flex items-center gap-2 rounded-md px-2 py-[6px]">
            <span className="flex items-center gap-1 text-[8px] text-[#8ca69c]"><Sun size={9} className="text-[#c7ba83]" /> <span className="mono">{sun}</span></span>
            <span className="h-2.5 w-px bg-[#2a3c3b]" />
            <span className="mono text-[8px] text-[#8ca69c]">{quality.toUpperCase()}</span>
            <span className="h-2.5 w-px bg-[#2a3c3b]" />
            <span className="mono text-[8px] text-[#6d877e]">{perf ? `${perf.fps} FPS` : "×2.4 V"}</span>
            <span className="h-2.5 w-px bg-[#2a3c3b]" />
            <span className="mono text-[8px] text-[#6d877e]">{perf ? `${(perf.triangles / 1000).toFixed(0)}k TRI` : "—"}</span>
          </div>
        </div>

        {isGenerating && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030809]/55 backdrop-blur-[2px]">
            <div className="w-[330px] overflow-hidden rounded-xl border border-[#304443] bg-[#0a1417]/95 shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
              <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(95,227,192,0.24)] bg-[rgba(95,227,192,0.06)]">
                  <Loader2 size={17} className="animate-spin text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between"><span className="text-[11.5px] font-semibold text-[#e4f2ec]">World synthesis</span><span className="mono text-[10px] text-[var(--accent)]">{Math.round((progress?.progress ?? 0) * 100)}%</span></div>
                  <div className="mono mt-0.5 truncate text-[8px] uppercase tracking-wider text-[#687f76]">{progress?.phase ?? "Queued"}</div>
                </div>
                <button onClick={onCancel} title="Cancel generation" className="rounded p-1 text-[#667d74] transition hover:bg-white/5 hover:text-[#ee9d8e]"><X size={13} /></button>
              </div>
              <div className="px-4 py-3">
                <div className="h-1 overflow-hidden rounded-full bg-[#1b2b2c]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#3ea68c,#7ef5d8)] transition-all duration-500" style={{ width: `${Math.max(4, (progress?.progress ?? 0) * 100)}%` }} /></div>
                <p className="mt-2 min-h-[24px] text-[9px] leading-relaxed text-[#7a9188]">{progress?.detail ?? "Preparing deterministic field allocation."}</p>
                <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2">
                  <span className="mono text-[7.5px] text-[#536861]">SIGNAL · {progress?.phase.toUpperCase() ?? "INIT"}</span>
                  <button onClick={onCancel} className="flex items-center gap-1 text-[8px] text-[#a48b76] hover:text-[#e0b58b]"><X size={9} /> Cancel job</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-[27px] shrink-0 items-center justify-between border-t border-[var(--line)] bg-[#080f12] px-3">
        <div className="flex items-center gap-3">
          <span className="mono text-[7.5px] uppercase tracking-wider text-[#4f675f]">Viewport</span>
          <span className="flex items-center gap-1 text-[8px] text-[#728a81]"><Play size={8} className="text-[var(--accent)]" /> {viewMode === "map" ? "Cartographic renderer" : viewMode === "split" ? "Synchronised dual view" : "Realtime terrain"}</span>
          {tool !== "orbit" && <span className="mono text-[8px] text-[#c2a878]">sculpting active</span>}
        </div>
        <div className="flex items-center gap-3 text-[8px] text-[#5c726a]">
          {perf && <span className="mono hidden lg:inline">{perf.fps} fps · {perf.frameMs.toFixed(2)} ms · {perf.triangles.toLocaleString()} tris · {perf.drawCalls} calls</span>}
          <span className="mono">seed {world?.config.seed ?? "—"}</span>
          <span className="hidden sm:inline">|</span>
          <span className="mono hidden sm:inline">{world?.resolution ?? "—"}² field</span>
          <span className="hidden md:inline">|</span>
          <span className="hidden items-center gap-1 md:flex"><span className="h-1 w-1 rounded-full bg-[var(--accent)]" /> deterministic build</span>
        </div>
      </div>
    </section>
  );
}
