import { useState } from "react";
import {
  ArrowDown, ArrowUp, Brush, ChevronDown, Dices, FlaskConical, Globe2, Grid3X3,
  Loader2, Mountain, MoveVertical, Search, Shuffle, Sparkles,
  Trees, Waves, Wind, Eraser, SlidersHorizontal, Compass, Trash2,
} from "lucide-react";
import type { Landmass, ObjectKind, WorldConfig } from "../lib/types";
import { ASSET_CATALOG } from "../lib/assets";
import type { EditTool } from "./TerrainViewport";
import type { WorldPreset } from "../lib/presets";
import { cn } from "../utils/cn";
import { Section, SliderRow } from "./ui";

type NumericKey = {
  [K in keyof WorldConfig]: WorldConfig[K] extends number ? K : never;
}[keyof WorldConfig];

interface ControlDef {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: "percent" | "degrees" | "decimal" | "km" | "integer" | "metres";
}

interface ControlGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  controls: ControlDef[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (def: ControlDef, value: number) => {
  if (def.format === "percent") return pct(value);
  if (def.format === "degrees") return `${value > 0 ? "+" : ""}${value.toFixed(0)}°C`;
  if (def.format === "km") return `${value.toFixed(0)} km`;
  if (def.format === "decimal") return value.toFixed(2);
  if (def.format === "metres") return `${Math.round(value)} m`;
  return `${Math.round(value)}`;
};

const GROUPS: ControlGroup[] = [
  {
    id: "terrain",
    title: "Terrain structure",
    subtitle: "Macro-relief and coastal form",
    icon: <Mountain size={13} />,
    controls: [
      { key: "seaLevel", label: "Sea-level datum", min: 0.28, max: 0.64, step: 0.005, format: "percent" },
      { key: "coastline", label: "Coastline complexity", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "mountainFrequency", label: "Mountain frequency", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "mountainHeight", label: "Mountain uplift", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "roughness", label: "Terrain roughness", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "valleyDensity", label: "Valley density", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "detailScale", label: "Detail frequency", min: 0.2, max: 1.4, step: 0.02, format: "decimal" },
      { key: "domainWarp", label: "Domain warp", min: 0, max: 0.9, step: 0.01, format: "percent" },
    ],
  },
  {
    id: "geology",
    title: "Geological simulation",
    subtitle: "Process-based erosion & hydrology",
    icon: <FlaskConical size={13} />,
    controls: [
      { key: "erosion", label: "Erosion intensity", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "oceanDepth", label: "Ocean basin depth", min: 0.2, max: 1, step: 0.01, format: "percent" },
      { key: "lakeDensity", label: "Lake persistence", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "riverDensity", label: "River network density", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "geologicalVariation", label: "Volcanic variation", min: 0, max: 1, step: 0.01, format: "percent" },
    ],
  },
  {
    id: "climate",
    title: "Climate",
    subtitle: "Lapse rate · advection · rain shadow",
    icon: <Wind size={13} />,
    controls: [
      { key: "latitude", label: "Thermal equator", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "baseTemperature", label: "Sea-level temperature", min: -4, max: 34, step: 0.5, format: "degrees" },
      { key: "moisture", label: "Atmospheric moisture", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "rainShadow", label: "Orographic rain shadow", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "windBias", label: "Westerly advection", min: 0, max: 1, step: 0.01, format: "percent" },
    ],
  },
  {
    id: "ecology",
    title: "Ecology & detail",
    subtitle: "Vegetation, rock and landmark rules",
    icon: <Trees size={13} />,
    controls: [
      { key: "vegetationDensity", label: "Vegetation density", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "rockDensity", label: "Rock distribution", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "landmarkDensity", label: "Landmark density", min: 0, max: 1, step: 0.01, format: "percent" },
      { key: "widthKm", label: "Map width", min: 4, max: 32, step: 1, format: "km" },
      { key: "heightKm", label: "Map height", min: 4, max: 32, step: 1, format: "km" },
    ],
  },
];

const LANDS: { value: Landmass; label: string }[] = [
  { value: "continent", label: "Continent" },
  { value: "island", label: "Island" },
  { value: "archipelago", label: "Archipelago" },
  { value: "pangaea", label: "Pangaea" },
];

const TOOLS: { id: EditTool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "orbit", label: "Navigate", icon: <Compass size={13} />, hint: "Orbit / pan / zoom" },
  { id: "raise", label: "Raise", icon: <ArrowUp size={13} />, hint: "Add elevation with smooth falloff" },
  { id: "lower", label: "Lower", icon: <ArrowDown size={13} />, hint: "Remove elevation" },
  { id: "smooth", label: "Smooth", icon: <Waves size={13} />, hint: "Diffuse local height variance" },
  { id: "flatten", label: "Flatten", icon: <Eraser size={13} />, hint: "Blend toward a local datum" },
  { id: "place", label: "Place", icon: <Trees size={13} />, hint: "Place the selected environment asset" },
  { id: "erase", label: "Erase", icon: <Trash2 size={13} />, hint: "Remove assets inside the brush footprint" },
];

export default function LeftPanel({
  config,
  onChange,
  preset,
  onOpenPresets,
  onGenerate,
  isGenerating,
  progress,
  tool,
  onTool,
  brushRadius,
  brushStrength,
  onBrushRadius,
  onBrushStrength,
  assetKind,
  onAssetKind,
  onRandomise,
  editHistoryCount,
}: {
  config: WorldConfig;
  onChange: (partial: Partial<WorldConfig>) => void;
  preset?: WorldPreset;
  onOpenPresets: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  progress: number;
  tool: EditTool;
  onTool: (tool: EditTool) => void;
  brushRadius: number;
  brushStrength: number;
  onBrushRadius: (v: number) => void;
  onBrushStrength: (v: number) => void;
  assetKind: ObjectKind;
  onAssetKind: (kind: ObjectKind) => void;
  onRandomise: () => void;
  editHistoryCount: number;
}) {
  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const search = query.trim().toLowerCase();
  const matches = GROUPS.flatMap((group) =>
    group.controls.filter((control) => control.label.toLowerCase().includes(search)).map((control) => ({ group, control })),
  );

  const update = (key: NumericKey, value: number) => onChange({ [key]: value } as Partial<WorldConfig>);

  return (
    <aside className="left-rail flex h-full min-h-0 w-full flex-col border-r border-[var(--line)] bg-[#0a1115]">
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-[var(--accent)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c4d6d0]">World builder</span>
        </div>
        <button onClick={onRandomise} className="flex items-center gap-1 rounded border border-[var(--line)] bg-[#0c171a] px-1.5 py-1 text-[9px] font-medium text-[#7f948e] transition hover:border-[rgba(95,227,192,0.3)] hover:text-[var(--accent)]" title="Randomise deterministic parameters">
          <Shuffle size={10} /> Explore
        </button>
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="p-3">
          <button onClick={onOpenPresets} className="group relative w-full overflow-hidden rounded-lg border border-[var(--line)] bg-[#0d171b] p-3 text-left transition hover:border-[rgba(95,227,192,0.3)]">
            <div className="absolute inset-0 opacity-70" style={{ background: `linear-gradient(115deg, ${preset?.swatch[0] ?? "#2d4a3a"}55, transparent 65%)` }} />
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20 blur-xl" style={{ background: preset?.swatch[1] ?? "#5fe3c0" }} />
            <div className="relative flex items-start justify-between gap-2">
              <div>
                <div className="mono mb-1 text-[8px] uppercase tracking-[0.15em] text-[#79948b]">Active preset · calibrated</div>
                <div className="text-[13px] font-semibold leading-tight text-[#ecf7f2]">{preset?.name ?? config.name}</div>
                <div className="mt-0.5 text-[10px] text-[#9dbbb0]">{preset?.tagline ?? "Custom world profile"}</div>
              </div>
              <span className="mt-0.5 flex items-center gap-1 rounded border border-white/10 bg-black/25 px-1.5 py-1 text-[8.5px] font-medium text-[#ccdfd7] transition group-hover:border-[rgba(95,227,192,0.35)] group-hover:text-[var(--accent)]">
                Change <ChevronDown size={9} />
              </span>
            </div>
            <div className="relative mt-3 flex items-center gap-1.5">
              {["#4a7a5c", "#7ca47a", "#b9b586", "#78908c", "#355d63"].map((c) => (
                <span key={c} className="h-1 flex-1 rounded-full opacity-80" style={{ background: c }} />
              ))}
            </div>
          </button>

          <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
            <label className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[#0b1418] px-2 py-1.5">
              <span className="mono text-[8px] uppercase tracking-wider text-[#566d66]">Seed</span>
              <input
                type="number"
                value={config.seed}
                onChange={(event) => onChange({ seed: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                className="mono min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[#d6e5df] outline-none"
                aria-label="World seed"
              />
            </label>
            <button
              onClick={() => onChange({ seed: Math.floor(Math.random() * 9_000_000) + 1000 })}
              className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[#0c171a] px-2.5 text-[9.5px] font-medium text-[#8fa49d] transition hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
              title="New random deterministic seed"
            >
              <Dices size={12} /> Re-roll
            </button>
          </div>

          <div className="relative mt-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#566b64]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search world parameters…"
              className="w-full rounded-md border border-[var(--line)] bg-[#0a1215] py-[7px] pl-7 pr-2 text-[10.5px] text-[#c1d3cd] placeholder:text-[#4f635d]"
              aria-label="Search parameters"
            />
          </div>

          {search ? (
            <div className="mt-3 rounded-md border border-[var(--line)] bg-[#0b1317] px-3 py-2">
              <div className="mb-1 text-[9px] uppercase tracking-widest text-[#5f746d]">{matches.length} result{matches.length === 1 ? "" : "s"}</div>
              {matches.length === 0 && <p className="py-3 text-[10.5px] text-[#6f837c]">No parameter matches “{query}”.</p>}
              {matches.map(({ group, control }) => (
                <div key={control.key}>
                  <div className="mt-1 text-[8px] uppercase tracking-widest text-[#4f635d]">{group.title}</div>
                  <SliderRow
                    label={control.label}
                    value={Number(config[control.key])}
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    format={(v) => fmt(control, v)}
                    onChange={(v) => update(control.key, v)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="mt-3 rounded-lg border border-[var(--line)] bg-[#0b1317]">
                <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#b8ccc5]"><Globe2 size={11} /> Landmass</span>
                  <span className="mono text-[8px] text-[#5e726b]">TECTONIC</span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-2">
                  {LANDS.map((land) => (
                    <button
                      key={land.value}
                      onClick={() => onChange({ landmass: land.value })}
                      className={cn(
                        "rounded border px-2 py-[6px] text-[10px] font-medium transition",
                        config.landmass === land.value
                          ? "border-[rgba(95,227,192,0.32)] bg-[rgba(95,227,192,0.09)] text-[#d7f5ec]"
                          : "border-[var(--line)] bg-[#0a1215] text-[#758b84] hover:border-[var(--line-strong)] hover:text-[#b3c7c0]",
                      )}
                    >
                      {land.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-2 py-2">
                  <span className="flex items-center gap-1.5 text-[9px] text-[#677c75]"><Grid3X3 size={10} /> Grid</span>
                  <div className="flex gap-0.5">
                    {[256, 320, 448, 512].map((res) => (
                      <button
                        key={res}
                        onClick={() => onChange({ resolution: res })}
                        className={cn("mono rounded px-1.5 py-[3px] text-[9px]", config.resolution === res ? "bg-[#1d302f] text-[var(--accent)]" : "text-[#617771] hover:text-[#aec2bb]")}
                      >
                        {res}²
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {GROUPS.map((group, index) => (
                <Section key={group.id} title={group.title} subtitle={group.subtitle} icon={group.icon} defaultOpen={index < 2}>
                  {group.controls.map((control) => (
                    <SliderRow
                      key={control.key}
                      label={control.label}
                      value={Number(config[control.key])}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      format={(v) => fmt(control, v)}
                      onChange={(v) => update(control.key, v)}
                      hint={control.label}
                    />
                  ))}
                </Section>
              ))}

              <div className="border-b border-[var(--line)]">
                <button className="group flex w-full items-center gap-2.5 px-4 py-3 text-left" onClick={() => setEditOpen(!editOpen)} aria-expanded={editOpen}>
                  <Brush size={13} className="text-[#78948e] transition group-hover:text-[var(--accent)]" />
                  <span className="flex-1">
                    <span className="text-[11.5px] font-semibold tracking-wide text-[#cfdfd9]">Interactive editor</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--faint)]">Raycast sculpting · undoable</span>
                  </span>
                  {editHistoryCount > 0 && <span className="mono rounded-sm border border-[var(--line)] px-1 py-px text-[8px] text-[#7f948d]">{editHistoryCount} edits</span>}
                  <ChevronDown size={13} className={cn("text-[#5d716c] transition-transform", editOpen && "rotate-180")} />
                </button>
                {editOpen && (
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-4 gap-1">
                      {TOOLS.map((item) => (
                        <button
                          key={item.id}
                          title={item.hint}
                          onClick={() => onTool(item.id)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-md border py-1.5 text-[8px] font-medium transition",
                            tool === item.id ? "border-[rgba(95,227,192,0.34)] bg-[rgba(95,227,192,0.09)] text-[var(--accent)]" : "border-[var(--line)] bg-[#0a1215] text-[#73877f] hover:text-[#c1d4cd]",
                          )}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 rounded border border-dashed border-[var(--line-strong)] px-2 py-1.5 text-[9px] leading-tight text-[#6e837b]">
                      <MoveVertical size={11} className="shrink-0 text-[#8fa79f]" /> Drag on the terrain after choosing a brush. Changes reroute hydrology and re-measure the world.
                    </div>
                    {tool === "place" && (
                      <div className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1215] p-2">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[#8fa79e]">Environment asset</span>
                          <span className="mono text-[8px] text-[#5f776d]">{ASSET_CATALOG.length} types</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {ASSET_CATALOG.map((asset) => (
                            <button
                              key={asset.kind}
                              onClick={() => onAssetKind(asset.kind)}
                              title={`${asset.label} · max slope ${Math.round((asset.maxSlope * 180) / Math.PI)}°`}
                              className={cn(
                                "flex items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[8.5px] transition",
                                assetKind === asset.kind ? "border-[rgba(95,227,192,0.32)] bg-[rgba(95,227,192,0.08)] text-[#d5f4ea]" : "border-[var(--line)] bg-[#0c1518] text-[#849a91] hover:text-[#c9ddd5]",
                              )}
                            >
                              <span className="text-[11px] leading-none opacity-80">{asset.icon}</span>
                              <span className="truncate">{asset.label}</span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[8px] leading-relaxed text-[#5f766c]">Click the terrain to place. Trees and landmarks enforce their documented slope and shoreline limits; rejected clicks explain why.</p>
                      </div>
                    )}
                    {tool === "erase" && (
                      <div className="mt-2 rounded border border-dashed border-[var(--line-strong)] bg-[#0a1215] px-2 py-1.5 text-[8.5px] leading-relaxed text-[#7e948b]">
                        Click the terrain to remove every environment asset inside the brush footprint. Landmarks removed this way are restorable with undo.
                      </div>
                    )}
                    <SliderRow label="Brush radius" value={brushRadius} min={3} max={64} step={1} format={(v) => `${v} cells`} onChange={onBrushRadius} />
                    <SliderRow label="Brush strength" value={brushStrength} min={0.05} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={onBrushStrength} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 px-3 py-3">
                <button onClick={onRandomise} className="flex items-center justify-center gap-1.5 rounded border border-[var(--line)] bg-[#0c1619] py-1.5 text-[9.5px] font-medium text-[#879d95] transition hover:border-[var(--line-strong)] hover:text-[#d2e4de]">
                  <Dices size={11} /> Randomise all
                </button>
                <button
                  onClick={() => onChange({ mountainFrequency: 0.52, mountainHeight: 0.74, roughness: 0.56, erosion: 0.54, seaLevel: 0.46, coastline: 0.64, valleyDensity: 0.46, moisture: 0.6, baseTemperature: 26, vegetationDensity: 0.74 })}
                  className="flex items-center justify-center gap-1.5 rounded border border-[var(--line)] bg-[#0c1619] py-1.5 text-[9.5px] font-medium text-[#879d95] transition hover:border-[var(--line-strong)] hover:text-[#d2e4de]"
                >
                  <Shuffle size={11} /> Reset tuning
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[#0a1216] p-3">
        <div className="mb-2 flex items-center justify-between text-[9px]">
          <span className="flex items-center gap-1.5 text-[#728981]">
            <span className={cn("h-1.5 w-1.5 rounded-full", isGenerating ? "live-dot bg-[#e9b872]" : "bg-[var(--accent)]")} />
            {isGenerating ? "Synthesis in progress" : "Deterministic engine ready"}
          </span>
          <span className="mono text-[#5d716a]">{isGenerating ? `${Math.round(progress * 100)}%` : "9-stage pipeline"}</span>
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-md border border-[rgba(113,238,206,0.35)] bg-[linear-gradient(180deg,#2c7b6b,#225f55)] py-2.5 text-[11.5px] font-semibold text-[#eafff8] shadow-[0_6px_18px_rgba(30,124,104,0.24)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80"
        >
          <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.13),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
          {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {isGenerating ? "Synthesising world…" : "Generate world"}
          {!isGenerating && <kbd className="mono ml-1 rounded border border-white/15 bg-black/20 px-1 py-px text-[8px] font-normal text-white/55">G</kbd>}
        </button>
        <div className="mt-1.5 flex items-center justify-between text-[8.5px] text-[#586d66]">
          <span>{config.resolution}² grid · {(config.widthKm * config.heightKm).toFixed(0)} km²</span>
          <span>seed {config.seed}</span>
        </div>
      </div>
    </aside>
  );
}
