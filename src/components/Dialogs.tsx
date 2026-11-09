import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Check, CheckCircle2, ChevronRight, ClipboardList,
  Download, FileArchive, FileJson, FileImage, FlaskConical, FolderOpen, History, Info, Layers3,
  Loader2, Mountain, Play, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Upload, X, XCircle, Zap,
} from "lucide-react";
import type { HistoryEntry, PerfStats, SavedProject, TerrainPatch, WorldConfig, WorldData } from "../lib/types";
import { BIOMES } from "../lib/types";
import { PRESETS, randomiseConfig, type WorldPreset } from "../lib/presets";
import { EXPORT_FORMATS, buildExportBundle, downloadExportFile, type ExportBundle, type ExportKey } from "../lib/exporters";
import { simulateProcess, type GeoProcess } from "../lib/worldgen";
import { ARK_COMPATIBILITY_DISCLOSURE } from "../lib/ark-compatibility";
import { runValidationSuite, VALIDATION_LIMITATIONS, type TestResult } from "../lib/selftest";
import { Bar, Modal, Pill, Readout, ScoreRing, Segmented, TinyHistogram } from "./ui";
import MapCanvas, { MAP_LEGENDS, type MapOverlay } from "./MapCanvas";
import { cn } from "../utils/cn";

const fmtBytes = (bytes: number) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const fmtDate = (value: number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function downloadText(name: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------------------------------------------ */
/* PRESETS                                                             */
/* ------------------------------------------------------------------ */

export function PresetsDialog({ open, onClose, onApply, currentId }: { open: boolean; onClose: () => void; onApply: (preset: WorldPreset) => void; currentId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Preset library" subtitle="Calibrated starting profiles. Every parameter remains editable after load; seeds remain reproducible." icon={<Sparkles size={16} />} width="max-w-3xl">
      <div className="grid gap-2.5 p-4 sm:grid-cols-2">
        {PRESETS.map((preset) => (
          <div key={preset.id} className="group relative overflow-hidden rounded-lg border border-[var(--line)] bg-[#0b1418] transition hover:border-[rgba(95,227,192,0.3)]">
            <div className="h-[58px] overflow-hidden" style={{ background: `linear-gradient(120deg, ${preset.swatch[0]}, ${preset.swatch[1]}55)` }}>
              <div className="grain h-full w-full opacity-40" />
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[12.5px] font-semibold text-[#e2efe9]">{preset.name}</div>
                  <div className="mono mt-0.5 text-[8px] uppercase tracking-[0.1em] text-[#789188]">{preset.tagline}</div>
                </div>
                {currentId === preset.id && <Pill tone="accent">active</Pill>}
              </div>
              <p className="mt-1.5 min-h-[38px] text-[9.5px] leading-relaxed text-[#82978f]">{preset.description}</p>
              <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2">
                <div className="mono flex gap-2 text-[7.5px] text-[#5e746c]">
                  <span>SEA {Math.round(preset.config.seaLevel * 100)}%</span>
                  <span>MTN {Math.round(preset.config.mountainHeight * 100)}%</span>
                  <span>ERO {Math.round(preset.config.erosion * 100)}%</span>
                </div>
                <button onClick={() => { onApply(preset); onClose(); }} className="flex items-center gap-1 rounded border border-[rgba(95,227,192,0.25)] bg-[rgba(95,227,192,0.07)] px-2 py-1 text-[9px] font-medium text-[#a8e4d4] transition hover:bg-[rgba(95,227,192,0.14)]">
                  Load preset <ChevronRight size={9} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--line)] bg-[#0b1418] px-4 py-2.5 text-[9px] text-[#6d827a]">Presets are complete WorldConfig objects. Loading one preserves deterministic generation but closes the current edit history.</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* EXPORT                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_KEYS: ExportKey[] = ["heightmap16", "heightmapRaw", "preview", "biome", "water", "splat", "layerWeights", "resource", "spawn", "config", "compatibility", "readme", "arkMeta", "project"];

export function ExportDialog({ open, onClose, world }: { open: boolean; onClose: () => void; world: WorldData | null }) {
  const [size, setSize] = useState(1024);
  const [keys, setKeys] = useState<Set<ExportKey>>(new Set(DEFAULT_KEYS));
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [building, setBuilding] = useState(false);
  const [target, setTarget] = useState<"ase" | "asa">("ase");

  useEffect(() => {
    if (!open) { setBundle(null); setBuilding(false); }
  }, [open]);

  const toggle = (key: ExportKey) => setKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const build = () => {
    if (!world || !keys.size) return;
    setBuilding(true);
    setBundle(null);
    setTimeout(() => {
      try {
        const output = buildExportBundle(world, size, keys, target);
        setBundle(output);
      } finally {
        setBuilding(false);
      }
    }, 50);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export laboratory"
      subtitle="Generate verified world-source datasets with an explicit ARK/Unreal compatibility assessment. No playable map is produced."
      icon={<Download size={16} />}
      width="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="mono text-[8.5px] text-[#60756d]">
            {bundle ? <>CHECKSUM · {bundle.checksum} · {bundle.generatedAt.slice(11, 19)} UTC</> : <>NO ARCHIVE PRODUCED YET · 44-BYTE PNG CHUNK VALIDATION</>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded border border-[var(--line)] px-3 py-1.5 text-[10px] text-[#82968f] hover:text-white">Close</button>
            {bundle && (
              <button onClick={() => bundle.files.forEach((file, index) => setTimeout(() => downloadExportFile(file), index * 100))} className="flex items-center gap-1.5 rounded border border-[var(--line-strong)] bg-[#111c20] px-3 py-1.5 text-[10px] font-medium text-[#bfd4cc] transition hover:text-white">
                <Download size={11} /> Download all ({bundle.files.length})
              </button>
            )}
            <button onClick={build} disabled={building || !world || keys.size === 0} className="flex items-center gap-1.5 rounded border border-[rgba(95,227,192,0.3)] bg-[#236153] px-3 py-1.5 text-[10px] font-semibold text-[#effff9] transition hover:brightness-110 disabled:opacity-50">
              {building ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              {building ? "Encoding…" : bundle ? "Rebuild bundle" : `Build export bundle`}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4">
        {!world ? (
          <div className="py-16 text-center text-[11px] text-[#70857d]">Generate a world before exporting.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--line)] bg-[#0b1418] p-3">
              <div>
                <div className="mono text-[8px] uppercase tracking-[0.14em] text-[#61766e]">Source world</div>
                <div className="mt-0.5 text-[13px] font-semibold text-[#e7f3ee]">{world.config.name}</div>
                <div className="mono mt-0.5 text-[8.5px] text-[#6e847c]">seed {world.config.seed} · {world.resolution}² source · {(world.metrics.landCoverage * 100).toFixed(0)}% land</div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="mono text-[8.5px] text-[#657b72]">TARGET GRID</span>
                {[512, 1024, 2048].map((value) => (
                  <button key={value} onClick={() => { setSize(value); setBundle(null); }} className={cn("mono rounded border px-2 py-1 text-[9px] transition", size === value ? "border-[rgba(95,227,192,0.34)] bg-[rgba(95,227,192,0.09)] text-[#baf3e4]" : "border-[var(--line)] text-[#748a82] hover:text-white")}>{value}²</button>
                ))}
                <button onClick={() => { setSize(world.resolution); setBundle(null); }} className={cn("mono rounded border px-2 py-1 text-[9px] transition", size === world.resolution ? "border-[rgba(95,227,192,0.34)] bg-[rgba(95,227,192,0.09)] text-[#baf3e4]" : "border-[var(--line)] text-[#748a82] hover:text-white")}>source</button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-[rgba(100,200,255,0.18)] bg-[rgba(100,200,255,0.03)] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(100,200,255,0.24)] bg-[rgba(100,200,255,0.08)] text-[#86cdff]"><FileJson size={11} /></span>
                  <div>
                    <div className="text-[10px] font-semibold text-[#cfe6f1]">ARK / Unreal compatibility assessment</div>
                    <div className="mono text-[8px] text-[#75929e]">{target === "ase" ? "ASE · UE4 landscape + sublevels" : "ASA · UE5 World Partition"} · no in-engine verification</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Pill tone="amber">source data only</Pill>
                  <Pill>not playable</Pill>
                  <Pill>not engine-verified</Pill>
                </div>
              </div>
              {bundle ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="rounded border border-[var(--line)] bg-[#0a1316] px-2 py-1.5">
                    <div className="text-[8px] uppercase tracking-wider text-[#5f7a83]">Landscape resolution</div>
                    <div className="mono mt-0.5 text-[9.5px] text-[#bcd6e0]">{bundle.width}² {bundle.compatibility.landscape.exactMatch ? "· conventional" : "· non-standard"}</div>
                    <div className="mt-0.5 text-[8px] leading-snug text-[#68838d]">{bundle.compatibility.landscape.guidance}</div>
                  </div>
                  <div className="rounded border border-[var(--line)] bg-[#0a1316] px-2 py-1.5">
                    <div className="text-[8px] uppercase tracking-wider text-[#5f7a83]">Suggested import Z scale</div>
                    <div className="mono mt-0.5 text-[9.5px] text-[#bcd6e0]">≈ {bundle.compatibility.elevation.suggestedZScale}</div>
                    <div className="mt-0.5 text-[8px] leading-snug text-[#68838d]">Relief {bundle.compatibility.elevation.reliefMetres.toLocaleString()} m · sea level at {Math.round(bundle.compatibility.elevation.normalisedSeaLevel * 100)}% of range</div>
                  </div>
                  <div className="flex flex-col justify-center gap-1 rounded border border-[var(--line)] bg-[#0a1316] px-2 py-1.5">
                    {[
                      { label: "Format checks passed", value: bundle.compatibility.checks.filter((c) => c.status === "satisfied").length, tone: "text-[#7ddfc4]" },
                      { label: "Advisories", value: bundle.compatibility.checks.filter((c) => c.status === "advisory").length, tone: "text-[#dfc08d]" },
                      { label: "In-engine actions", value: bundle.compatibility.checks.filter((c) => c.status === "in-engine-required").length, tone: "text-[#8fc3e0]" },
                      { label: "Not produced", value: bundle.compatibility.checks.filter((c) => c.status === "not-produced").length, tone: "text-[#d79a8c]" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3">
                        <span className="text-[8px] text-[#75929e]">{row.label}</span>
                        <span className={cn("mono text-[9px] font-medium", row.tone)}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-[8.5px] leading-relaxed text-[#7d949e]">Build the bundle to evaluate format conformance, resolution family, layer-map requirements, elevation scale and the remaining in-engine steps. Checks marked satisfied prove file-level conformance only — never playability.</p>
              )}
              {bundle && (
                <details className="mt-2 rounded border border-[var(--line)] bg-[#0a1316] px-2 py-1.5">
                  <summary className="cursor-pointer text-[9px] font-medium text-[#a3bcc6]">Per-check evidence, manual steps and sources</summary>
                  <div className="mt-1.5 space-y-1">
                    {bundle.compatibility.checks.map((check) => (
                      <div key={check.id} className="flex items-start gap-1.5 border-t border-[var(--line)] py-1 first:border-0">
                        <span className={cn(
                          "mono mt-0.5 shrink-0 rounded-sm border px-1 py-px text-[6.5px] uppercase tracking-wide",
                          check.status === "satisfied" ? "border-[rgba(95,227,192,0.3)] text-[#7ddfc4]"
                          : check.status === "advisory" ? "border-[rgba(233,184,114,0.3)] text-[#dfc08d]"
                          : check.status === "in-engine-required" ? "border-[rgba(100,200,255,0.28)] text-[#8fc3e0]"
                          : "border-[rgba(242,124,106,0.28)] text-[#d79a8c]",
                        )}>{check.status === "in-engine-required" ? "engine" : check.status}</span>
                        <div className="min-w-0">
                          <div className="text-[8.5px] font-medium text-[#b6cdd6]">{check.label}</div>
                          <div className="text-[8px] leading-snug text-[#6f8a94]">{check.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-[var(--line)] pt-1.5">
                    <div className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-[#7d949e]">Required in-engine steps</div>
                    {bundle.compatibility.manualSteps.map((step, index) => (
                      <p key={step} className="flex gap-1.5 py-0.5 text-[8px] leading-snug text-[#6f8a94]"><span className="mono shrink-0 text-[#5b7681]">{index + 1}.</span>{step}</p>
                    ))}
                  </div>
                  <div className="mt-1.5 border-t border-[var(--line)] pt-1.5">
                    <div className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-[#7d949e]">References used for these requirements</div>
                    {bundle.compatibility.references.map((reference) => (
                      <p key={reference.url} className="py-0.5 text-[8px] leading-snug text-[#6f8a94]">· {reference.label}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_258px]">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#91a79f]">Export artefacts</span>
                  <span className="mono text-[8px] text-[#5f746c]">{keys.size} SELECTED</span>
                </div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {EXPORT_FORMATS.map((format) => (
                    <button key={format.key} onClick={() => toggle(format.key)} className={cn("flex items-start gap-2 rounded border px-2 py-1.5 text-left transition", keys.has(format.key) ? "border-[rgba(95,227,192,0.22)] bg-[rgba(95,227,192,0.045)]" : "border-[var(--line)] bg-[#0a1316] opacity-60 hover:opacity-90")}>
                      <span className={cn("mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border", keys.has(format.key) ? "border-[var(--accent)] bg-[rgba(95,227,192,0.18)] text-[var(--accent)]" : "border-[#40534d]")}>
                        {keys.has(format.key) && <Check size={9} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-medium text-[#c4d8d1]">{format.label}</span>
                        <span className="mt-0.5 block text-[8.5px] leading-snug text-[#6c8179]">{format.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-md border border-[rgba(233,184,114,0.24)] bg-[rgba(233,184,114,0.04)] p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#d5ab74]" />
                    <div className="min-w-0">
                      <p className="text-[9.5px] font-semibold leading-relaxed text-[#d6b180]">{ARK_COMPATIBILITY_DISCLOSURE.headline}</p>
                      <p className="mt-1 text-[9px] leading-relaxed text-[#a99880]">{ARK_COMPATIBILITY_DISCLOSURE.contents} {ARK_COMPATIBILITY_DISCLOSURE.notIncluded}</p>
                      <p className="mt-1.5 text-[9px] leading-relaxed text-[#a99880]">{ARK_COMPATIBILITY_DISCLOSURE.projectStructure} {ARK_COMPATIBILITY_DISCLOSURE.verification}</p>
                      <p className="mt-1.5 text-[9px] leading-relaxed text-[#a99880]">{ARK_COMPATIBILITY_DISCLOSURE.dataHonesty}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[rgba(233,184,114,0.18)] pt-2">
                    <span className="mono text-[8px] uppercase tracking-wider text-[#8f8272]">Target project</span>
                    {(["ase", "asa"] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => { setTarget(option); setBundle(null); }}
                        className={cn("mono rounded border px-2 py-1 text-[8.5px] uppercase transition", target === option ? "border-[rgba(233,184,114,0.4)] bg-[rgba(233,184,114,0.12)] text-[#e8c99c]" : "border-[var(--line)] text-[#8b8073] hover:text-[#cfbda4]")}
                      >
                        {option === "ase" ? "Evolved · UE4" : "Ascended · UE5"}
                      </button>
                    ))}
                    <span className="text-[8px] leading-snug text-[#7d7365]">Changes project-structure guidance only. The disclosure applies to both targets.</span>
                  </div>
                </div>
                <details className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1316] px-2.5 py-2">
                  <summary className="cursor-pointer text-[9.5px] font-medium text-[#93aaa1]">Format specification · bit depth, orientation, endianness & normalisation</summary>
                  <div className="mt-2 space-y-1.5 font-mono text-[8px] leading-relaxed text-[#748c83]">
                    <p>HEIGHTMAP PNG · 16-bit grayscale (colour type 0) · row-major NW origin · north→south rows · linear [min,max]→[0,65535].</p>
                    <p>RAW · Uint16 little-endian · no header · width×height×2 bytes · same orientation and normalisation.</p>
                    <p>BIOME · 8-bit palette PNG · index = studio biome id · ocean included. WATER · palette 0=dry 1=ocean 2=lake 3=river, alpha transparency.</p>
                    <p>TARGET LAYERS · five separate 8-bit single-channel greyscale maps (sand, vegetation, rock, snow, wetland) at the export resolution, matching Unreal's landscape target-layer convention.</p>
                    <p>SPLAT · packed RGB8 convenience preview. SPAWN/RESOURCE · indexed design rules, not verified creature or loot data.</p>
                    <p>ELEVATION · datum mean sea level 0 m · measured source min {bundle?.elevationMin.toFixed(1) ?? world.minHeight.toFixed(1)} m / max {bundle?.elevationMax.toFixed(1) ?? world.maxHeight.toFixed(1)} m.</p>
                    <p>PNG COMPRESSION · RFC 1951 stored-deflate; PNG 1.2 wire format with CRC-32 and Adler-32.</p>
                  </div>
                </details>
              </div>

              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#91a79f]">Validation</div>
                {!bundle ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--line-strong)] bg-[#0a1316] p-4 text-center">
                    {building ? <Loader2 size={20} className="animate-spin text-[var(--accent)]" /> : <ShieldCheck size={20} className="text-[#597067]" />}
                    <p className="text-[10px] font-medium text-[#a4b9b1]">{building ? "Encoding and verifying…" : "No bundle built yet"}</p>
                    <p className="text-[8.5px] leading-relaxed text-[#61766e]">Build the bundle to run range, dimension, palette, hydrology and binary-header checks.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border border-[var(--line)] bg-[#0b1418] p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <Pill tone={bundle.validation.every((v) => v.pass) ? "accent" : "amber"}>{bundle.validation.filter((v) => v.pass).length}/{bundle.validation.length} checks</Pill>
                        <span className="mono text-[8px] text-[#62786f]">{bundle.width}²</span>
                      </div>
                      {bundle.validation.map((check) => (
                        <div key={check.label} className="flex items-start gap-1.5 border-t border-[var(--line)] py-1 first:border-0">
                          {check.pass ? <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-[#66d7b9]" /> : <XCircle size={10} className="mt-0.5 shrink-0 text-[#e38a78]" />}
                          <div><div className="text-[8.5px] font-medium text-[#afc4bc]">{check.label}</div><div className="text-[7.5px] leading-snug text-[#61776e]">{check.detail}</div></div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 max-h-[174px] space-y-1 overflow-y-auto panel-scroll pr-0.5">
                      {bundle.files.map((file) => (
                        <button key={file.key} onClick={() => downloadExportFile(file)} className="group flex w-full items-center gap-2 rounded border border-[var(--line)] bg-[#0a1316] px-2 py-1.5 text-left transition hover:border-[rgba(95,227,192,0.28)]">
                          <span className="text-[#6dbda9]">{file.format.includes("PNG") ? <FileImage size={11} /> : file.format.includes("JSON") || file.format.includes("project") ? <FileJson size={11} /> : <FileArchive size={11} />}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-[8.5px] font-medium text-[#bcd0c9]">{file.name}</span><span className="mono block text-[7px] text-[#5d726a]">{fmtBytes(file.bytes)} · {file.format}</span></span>
                          <Download size={10} className="text-[#577067] transition group-hover:text-[var(--accent)]" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
                  <div className="mb-1 text-[8px] uppercase tracking-wider text-[#60756d]">Documented limitations</div>
                  {(bundle?.notes ?? ["Elevation normalisation bounds are recorded in metadata.", "PNG / RAW orientation is north-west origin, no flip.", "Target layers are separate 8-bit single-channel maps.", "No cooked map, volumes or spawners are produced."]).map((note) => (
                    <p key={note} className="flex gap-1.5 py-0.5 text-[7.8px] leading-relaxed text-[#657b72]"><span className="mt-[4px] h-[2px] w-[2px] shrink-0 rounded-full bg-[#5b746a]" />{note}</p>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* ANALYSIS                                                            */
/* ------------------------------------------------------------------ */

const METRIC_DOCS = [
  { label: "Elevation distribution", definition: "Arithmetic statistics and 32-bin histogram of land-cell elevations in metres.", method: "Streaming moments + per-bin counts; percentiles interpolated from bin index.", range: "−1600…3050 m clamp; median ±½ bin.", limitation: "Histogram median quantised to range/32." },
  { label: "Slope distribution", definition: "Gradient magnitude using central finite differences over cell spacing.", method: "s = hypot(∂h/∂x, ∂h/∂y) in rise/run, shown in degrees.", range: "0…4.0 rise/run (≈76° cap).", limitation: "Cell-scale only; does not resolve sub-cell cliffs." },
  { label: "Water & land coverage", definition: "Share of cells below the 0 m datum or covered by persistent lake/river surfaces.", method: "Direct cell counts from generation arrays.", range: "0…1.", limitation: "River mask excludes sub-threshold channels." },
  { label: "Drainage connectivity", definition: "Fraction of land cells whose terminal drainage target is the ocean.", method: "Terminal labels propagated in fill order after D8 routing.", range: "0…1.", limitation: "D8 single-flow; does not model groundwater." },
  { label: "Biome diversity", definition: "Shannon entropy of biome shares across land.", method: "H′ = −Σ pᵢ ln pᵢ on measured coverage.", range: "0…ln 13.", limitation: "Entropy is not an ecological quality judgement." },
  { label: "Coastline complexity", definition: "Orthogonal land/ocean transitions normalised by sqrt(land cells).", method: "Edge counting on the binary shoreline, clipped at 1.", range: "0…1.", limitation: "Resolution dependent; compare at equal grids." },
  { label: "Terrain roughness", definition: "Mean absolute residual from the four-neighbour average, metres.", method: "Local Laplacian magnitude over land cells.", range: "≥0 m.", limitation: "Affected by grid resolution." },
  { label: "Scenic index", definition: "Transparent composite of relief, visible fresh water and biome entropy.", method: "0.45·relief + 0.25·water + 0.30·entropy, clamped.", range: "0…1.", limitation: "A heuristic composition aid, not validated aesthetics." },
];

export function AnalysisDialog({ open, onClose, world, perf }: { open: boolean; onClose: () => void; world: WorldData | null; perf: PerfStats | null }) {
  const [overlay, setOverlay] = useState<MapOverlay>("suitability");
  if (!world) {
    return <Modal open={open} onClose={onClose} title="World analysis laboratory" subtitle="Measured scientific instrumentation" icon={<BarChart3 size={16} />} width="max-w-2xl"><div className="py-20 text-center text-[11px] text-[#6d837a]">Generate a world to open the analysis laboratory.</div></Modal>;
  }
  const m = world.metrics;
  const q = world.quality;
  const exportReport = () => {
    downloadText(`ark_studio_analysis_${world.config.seed}.json`, JSON.stringify({ application: "ARK Map Studio: Ultimate", generatedAt: new Date().toISOString(), config: world.config, metrics: world.metrics, quality: world.quality, performance: perf, definitions: METRIC_DOCS }, null, 2));
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="World analysis laboratory"
      subtitle={`${world.config.name} · seed ${world.config.seed} · ${world.resolution}² measured field`}
      icon={<BarChart3 size={16} />}
      width="max-w-6xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[8.5px] text-[#62776e]"><ShieldCheck size={11} className="text-[var(--accent)]" /> All metrics computed from generated arrays · measured {world.generationMs.toFixed(0)} ms generation</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded border border-[var(--line)] px-3 py-1.5 text-[10px] text-[#83978f]">Close</button>
            <button onClick={exportReport} className="flex items-center gap-1.5 rounded border border-[rgba(95,227,192,0.25)] bg-[rgba(95,227,192,0.06)] px-3 py-1.5 text-[10px] font-medium text-[#a9e4d4]"><Download size={11} /> Export analysis report</button>
          </div>
        </div>
      }
    >
      <div className="grid lg:grid-cols-[1.06fr_1fr]">
        <div className="border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[linear-gradient(130deg,#11211f,#0a1316)] p-3">
            <ScoreRing score={q.score} grade={q.grade} size={86} />
            <div className="min-w-0 flex-1">
              <div className="mono text-[8px] uppercase tracking-[0.14em] text-[#6c837a]">Composite quality assessment</div>
              <div className="mt-0.5 text-[15px] font-semibold text-[#e9f5f0]">{q.score >= 78 ? "Production candidate" : q.score >= 66 ? "Usable with advisories" : "Requires calibration"}</div>
              <p className="mt-1 text-[9px] leading-relaxed text-[#7b938a]">Weighted from six independent measurements. Warnings remain visible regardless of the score.</p>
              <div className="mt-1.5 flex items-center gap-1.5"><Pill tone="accent">grade {q.grade}</Pill><Pill>{m.watersheds} catchments</Pill><Pill>{m.biomeCoverage.length} biomes</Pill></div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <Readout label="Peak" value={`${m.maxElevation.toFixed(0)} m`} accent />
            <Readout label="Land" value={`${(m.landCoverage * 100).toFixed(0)}%`} />
            <Readout label="Water" value={`${(m.waterCoverage * 100).toFixed(1)}%`} />
            <Readout label="Objects" value={m.objectCount.toLocaleString()} />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8fa59d]">Measured overlay</span>
            <Segmented value={overlay} onChange={(value) => setOverlay(value as MapOverlay)} options={[{ value: "suitability", label: "Habitat" }, { value: "slope", label: "Slope" }, { value: "watershed", label: "Basins" }, { value: "flow", label: "Flow" }]} size="xs" />
          </div>
          <div className="mt-1.5 aspect-square w-full overflow-hidden rounded border border-[#293d3d]">
            <MapCanvas world={world} overlay={overlay} hillshade contours={false} selected={null} interactive={false} />
          </div>
          <div className="mt-1.5">
            <div className="flex overflow-hidden rounded-sm">{MAP_LEGENDS[overlay].stops.map((stop) => <div key={stop.label} className="h-1.5 flex-1" style={{ background: stop.color }} />)}</div>
            <div className="mt-0.5 flex justify-between text-[7.5px] text-[#5c7169]">{MAP_LEGENDS[overlay].stops.map((stop) => <span key={stop.label}>{stop.label}</span>)}</div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
              <div className="mb-1.5 flex justify-between text-[8px] uppercase tracking-wider text-[#60766d]"><span>Elevation histogram</span><span className="mono text-[#748b81]">land · 32 bins</span></div>
              <div className="px-0.5"><TinyHistogram data={m.elevationHistogram} color="#63d6b8" height={38} /></div>
              <div className="mono mt-1.5 flex justify-between border-t border-[var(--line)] pt-1 text-[7.5px] text-[#6c8379]"><span>0 m</span><span>median {m.medianElevation.toFixed(0)}</span><span>{m.maxElevation.toFixed(0)}</span></div>
            </div>
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
              <div className="mb-1.5 flex justify-between text-[8px] uppercase tracking-wider text-[#60766d]"><span>Slope histogram</span><span className="mono text-[#748b81]">all cells · 32 bins</span></div>
              <div className="px-0.5"><TinyHistogram data={m.slopeHistogram} color="#c1ab6f" height={38} /></div>
              <div className="mono mt-1.5 flex justify-between border-t border-[var(--line)] pt-1 text-[7.5px] text-[#6c8379]"><span>0°</span><span>p95 {((m.slopeP95 * 180) / Math.PI).toFixed(0)}°</span><span>76°</span></div>
            </div>
          </div>

          <div className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1316] p-2">
            <div className="mb-1.5 text-[8px] uppercase tracking-wider text-[#60766d]">Biome coverage · measured share of land</div>
            <div className="space-y-1">
              {m.biomeCoverage.slice().sort((a, b) => b.share - a.share).map((biome) => (
                <div key={biome.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: biome.color }} />
                  <span className="w-[92px] truncate text-[8.5px] text-[#a4bbb3]">{biome.label}</span>
                  <div className="flex-1"><Bar value={biome.share * 100 * 2.4} color={biome.color} height={2} /></div>
                  <span className="mono w-8 text-right text-[7.5px] text-[#647a71]">{(biome.share * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#91a79f]">Quality breakdown</div>
          <div className="space-y-2.5 rounded-md border border-[var(--line)] bg-[#0b1418] p-3">
            {q.breakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between"><span className="text-[10px] text-[#b7ccc5]">{item.label}</span><span className="mono text-[9px] text-[#92aba2]">{item.score}<span className="ml-1 text-[7.5px] text-[#53675f]">×{item.weight}</span></span></div>
                <div className="mt-1"><Bar value={item.score} color={item.score >= 76 ? "#5fe3c0" : item.score >= 55 ? "#d6b575" : "#d28a70"} height={3} /></div>
                <div className="mt-0.5 text-[8px] text-[#5e736b]">{item.detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-[rgba(233,184,114,0.18)] bg-[rgba(233,184,114,0.03)] p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#d2aa74]"><AlertTriangle size={10} /> Warnings · {q.warnings.length}</div>
              {q.warnings.map((warning) => <p key={warning} className="flex gap-1.5 py-0.5 text-[8.5px] leading-relaxed text-[#ad9d87]"><span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[#cfa66d]" />{warning}</p>)}
            </div>
            <div className="rounded-md border border-[rgba(95,227,192,0.16)] bg-[rgba(95,227,192,0.03)] p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#88ccb8]"><Sparkles size={10} /> Suggested tuning</div>
              {q.suggestions.map((suggestion) => <p key={suggestion} className="flex gap-1.5 py-0.5 text-[8.5px] leading-relaxed text-[#8fada2]"><span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[#63b29d]" />{suggestion}</p>)}
            </div>
          </div>

          <div className="mt-3 rounded-md border border-[var(--line)] bg-[#0a1316] p-2.5">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[#849b92]">Metric register · definitions & limitations</div>
            <div className="max-h-[190px] space-y-0 overflow-y-auto panel-scroll pr-1">
              {METRIC_DOCS.map((doc) => (
                <details key={doc.label} className="border-b border-[var(--line)] py-1.5 last:border-0">
                  <summary className="cursor-pointer text-[9px] font-medium text-[#a9bfb7]">{doc.label}<span className="ml-2 font-normal text-[#5f746c]">{doc.range}</span></summary>
                  <div className="mt-1 space-y-0.5 text-[8px] leading-relaxed text-[#6c8178]">
                    <p><span className="text-[#8ba198]">Definition.</span> {doc.definition}</p>
                    <p><span className="text-[#8ba198]">Method.</span> {doc.method}</p>
                    <p><span className="text-[#8ba198]">Limitation.</span> {doc.limitation}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2"><div className="text-[8px] uppercase tracking-wider text-[#60766d]">Mean slope</div><div className="mono mt-0.5 text-[12px] text-[#d2e3dd]">{((m.meanSlope * 180) / Math.PI).toFixed(1)}°</div><div className="text-[7.5px] text-[#586e65]">flat {((m.flatShare * 100)).toFixed(0)}% · mountain {((m.mountainShare * 100)).toFixed(1)}%</div></div>
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2"><div className="text-[8px] uppercase tracking-wider text-[#60766d]">Hydrology</div><div className="mono mt-0.5 text-[12px] text-[#d2e3dd]">{(m.riverConnectivity * 100).toFixed(0)}%</div><div className="text-[7.5px] text-[#586e65]">ocean-connected · {m.watersheds} basins</div></div>
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2"><div className="text-[8px] uppercase tracking-wider text-[#60766d]">Ecology</div><div className="mono mt-0.5 text-[12px] text-[#d2e3dd]">{m.meanMoisture.toFixed(2)}</div><div className="text-[7.5px] text-[#586e65]">mean moisture · H′ {m.shannonDiversity.toFixed(2)}</div></div>
            <div className="rounded-md border border-[var(--line)] bg-[#0a1316] p-2"><div className="text-[8px] uppercase tracking-wider text-[#60766d]">Scene</div><div className="mono mt-0.5 text-[12px] text-[#d2e3dd]">{perf ? `${perf.fps} fps` : "—"}</div><div className="text-[7.5px] text-[#586e65]">{perf ? `${(perf.triangles / 1000).toFixed(0)}k tris · ${perf.drawCalls} calls` : "viewport metrics unavailable"}</div></div>
          </div>
          <div className="mt-2 text-[7.5px] leading-relaxed text-[#4f655d]">Biome palette: {BIOMES.length} registered classes · ocean included in classification but excluded from land-share diversity. The composite score is intentionally not a substitute for visual inspection.</div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* VALIDATION                                                          */
/* ------------------------------------------------------------------ */

export function ValidationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");
  const [summary, setSummary] = useState<{ passed: number; failed: number; ms: number } | null>(null);
  const startedRef = useRef(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setResults(null);
    setSummary(null);
    try {
      const suite = await runValidationSuite((_step, _total, label) => setStep(label));
      setResults(suite.results);
      setSummary({ passed: suite.passed, failed: suite.failed, ms: suite.totalMs });
    } catch (error) {
      setResults([{ id: "suite", label: "Validation suite", pass: false, detail: String(error), ms: 0 }]);
      setSummary({ passed: 0, failed: 1, ms: 0 });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      void run();
    }
    if (!open) startedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Mathematical validation suite" subtitle="Live assertions executed against this build’s actual generator, hydrology, quality model and binary exporters." icon={<ShieldCheck size={16} />} width="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="mono text-[8px] text-[#61766e]">Deterministic seed 577 · 64² validation field · {summary ? `${summary.ms.toFixed(0)} ms` : "not run"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-[var(--line)] px-3 py-1.5 text-[10px] text-[#83978f]">Close</button>
            <button onClick={run} disabled={running} className="flex items-center gap-1.5 rounded border border-[rgba(95,227,192,0.28)] bg-[#1e5448] px-3 py-1.5 text-[10px] font-medium text-[#dcfff6] disabled:opacity-60">
              {running ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} {running ? "Running…" : "Re-run suite"}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[#0b1418] p-3">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg border", summary ? summary.failed === 0 ? "border-[rgba(95,227,192,0.28)] bg-[rgba(95,227,192,0.08)] text-[var(--accent)]" : "border-[rgba(242,124,106,0.3)] bg-[rgba(242,124,106,0.08)] text-[#f09588]" : "border-[var(--line)] text-[#7b938a]")}>
            {running ? <Loader2 size={20} className="animate-spin" /> : summary?.failed === 0 ? <CheckCircle2 size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-[#e3f1eb]">{running ? `Running assertions — ${step}` : summary ? `${summary.passed}/${summary.passed + summary.failed} assertions passed` : "Ready to run"}</div>
            <div className="mono mt-0.5 text-[8.5px] text-[#677d74]">{running ? "Real generator execution · no mocked values" : summary ? `Total ${summary.ms.toFixed(0)} ms · validation is reproducible` : "14 assertions · deterministic"}</div>
          </div>
          {summary && <Pill tone={summary.failed === 0 ? "accent" : "danger"}>{summary.failed === 0 ? "verified" : `${summary.failed} failed`}</Pill>}
        </div>

        <div className="mt-2 overflow-hidden rounded-md border border-[var(--line)] bg-[#0a1316]">
          {(results ?? []).map((result) => (
            <div key={result.id} className="flex items-start gap-2 border-b border-[var(--line)] px-2.5 py-2 last:border-0">
              {result.pass ? <Check size={11} className="mt-0.5 shrink-0 text-[#6ad7b9]" /> : <X size={11} className="mt-0.5 shrink-0 text-[#ec9383]" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="text-[9.5px] font-medium text-[#c2d5ce]">{result.label}</span><span className="mono text-[8px] text-[#5d726a]">{result.ms.toFixed(1)} ms</span></div>
                <div className="mono mt-0.5 text-[8px] leading-relaxed text-[#687e75]">{result.detail}</div>
              </div>
            </div>
          ))}
          {running && <div className="flex items-center gap-2 px-3 py-4 text-[9px] text-[#71887f]"><Loader2 size={12} className="animate-spin text-[var(--accent)]" /> {step}…</div>}
        </div>

        <div className="mt-2 rounded-md border border-[rgba(233,184,114,0.18)] bg-[rgba(233,184,114,0.03)] p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#ccaa79]"><Info size={10} /> Validation limitations</div>
          {VALIDATION_LIMITATIONS.map((limitation) => <p key={limitation} className="flex gap-1.5 py-0.5 text-[8.5px] leading-relaxed text-[#a4998b]"><span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[#c7a370]" />{limitation}</p>)}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* PROJECTS                                                            */
/* ------------------------------------------------------------------ */

export function ProjectsDialog({
  open, onClose, projects, history, world, onSave, onLoadProject, onDeleteProject, onRestore, onImport, onExportProject,
}: {
  open: boolean; onClose: () => void; projects: SavedProject[]; history: HistoryEntry[]; world: WorldData | null;
  onSave: () => void; onLoadProject: (project: SavedProject) => void; onDeleteProject: (id: string) => void;
  onRestore: (entry: HistoryEntry) => void; onImport: (config: WorldConfig, terrain?: TerrainPatch) => void; onExportProject: () => void;
}) {
  const [tab, setTab] = useState<"projects" | "history">("projects");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { config?: WorldConfig; terrain?: TerrainPatch };
        if (parsed.config && typeof parsed.config.seed === "number") {
          const terrain = parsed.terrain && typeof parsed.terrain.data === "string" && Number.isFinite(parsed.terrain.count) && Number.isFinite(parsed.terrain.resolution)
            ? parsed.terrain
            : undefined;
          onImport(parsed.config, terrain);
        }
      } catch {
        // Invalid project files are ignored; no state is corrupted.
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  return (
    <Modal open={open} onClose={onClose} title="Project laboratory" subtitle="Deterministic project documents, restore history and portable .arkproj interchange." icon={<FolderOpen size={16} />} width="max-w-3xl"
      footer={<div className="flex items-center justify-between"><span className="mono text-[8px] text-[#5e736b]">Projects stored locally · config + seed + analysis snapshot</span><div className="flex gap-2"><button onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 rounded border border-[var(--line)] px-2.5 py-1.5 text-[10px] text-[#a5bab2]"><Upload size={11} /> Import</button><button onClick={onSave} disabled={!world} className="flex items-center gap-1.5 rounded border border-[rgba(95,227,192,0.26)] bg-[#1e5347] px-2.5 py-1.5 text-[10px] font-medium text-[#e2fff7] disabled:opacity-50"><Save size={11} /> Save current world</button></div></div>}
    >
      <input ref={inputRef} type="file" accept=".arkproj,.json,application/json" className="hidden" onChange={handleFile} />
      <div className="flex items-center gap-1 border-b border-[var(--line)] px-4 py-2">
        <button onClick={() => setTab("projects")} className={cn("flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-medium", tab === "projects" ? "bg-[#182625] text-[#dff2eb]" : "text-[#748a82]")}><FolderOpen size={11} /> Projects ({projects.length})</button>
        <button onClick={() => setTab("history")} className={cn("flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-medium", tab === "history" ? "bg-[#182625] text-[#dff2eb]" : "text-[#748a82]")}><History size={11} /> Generation history ({history.length})</button>
      </div>
      <div className="p-4">
        {tab === "projects" && (
          <div className="space-y-1.5">
            {projects.length === 0 && <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[var(--line-strong)] py-12 text-center"><FolderOpen size={20} className="text-[#52685f]" /><p className="text-[11px] text-[#9db2aa]">No saved projects</p><p className="max-w-xs text-[9px] leading-relaxed text-[#657a72]">Save the current world to register a reproducible project document. Geometry is always reconstructed from the stored configuration.</p></div>}
            {projects.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((project) => (
              <div key={project.id} className="flex items-center gap-2.5 rounded-md border border-[var(--line)] bg-[#0b1418] p-2.5 transition hover:border-[var(--line-strong)]">
                <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded border border-[rgba(95,227,192,0.16)] bg-[linear-gradient(140deg,#17322f,#0e1e1f)]"><span className="mono text-[12px] font-semibold text-[#bcdfd4]">{project.score}</span><span className="text-[6.5px] uppercase tracking-wider text-[#5f7a70]">score</span></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-[#dceae5]">{project.name}</div>
                  <div className="mono mt-0.5 flex flex-wrap gap-x-2 text-[7.5px] text-[#657a72]"><span>SEED {project.seed}</span><span>{project.config.resolution}²</span><span>{project.config.landmass}</span><span>{fmtDate(project.updatedAt)}</span><span>{project.generationMs.toFixed(0)} ms</span></div>
                </div>
                <button onClick={() => { onLoadProject(project); onClose(); }} className="flex items-center gap-1 rounded border border-[rgba(95,227,192,0.22)] bg-[rgba(95,227,192,0.05)] px-2 py-1 text-[8.5px] text-[#9fe0cf]"><Play size={9} /> Load</button>
                <button onClick={() => onDeleteProject(project.id)} title="Delete project" className="rounded p-1 text-[#5d716a] transition hover:text-[#e58d7e]"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        )}
        {tab === "history" && (
          <div className="space-y-1">
            {history.length === 0 && <div className="py-12 text-center text-[10px] text-[#677c74]">Generation events appear here with reproducible seeds and scores.</div>}
            {history.map((entry, index) => (
              <button key={entry.id} onClick={() => { onRestore(entry); onClose(); }} className="group flex w-full items-center gap-2.5 rounded border border-[var(--line)] bg-[#0b1418] px-2.5 py-2 text-left transition hover:border-[rgba(95,227,192,0.25)]">
                <span className="mono w-6 text-[8px] text-[#556b63]">#{String(history.length - index).padStart(2, "0")}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] opacity-60" />
                <div className="min-w-0 flex-1"><div className="truncate text-[10px] text-[#bfd3cc]">{entry.label}</div><div className="mono mt-0.5 text-[7.5px] text-[#61766e]">seed {entry.seed} · {entry.config.landmass} · {entry.generationMs.toFixed(0)} ms · {fmtDate(entry.at)}</div></div>
                <span className="mono text-[10px] font-medium text-[#8fc7b8]">{entry.score}</span>
                <ChevronRight size={11} className="text-[#536960] transition group-hover:text-[var(--accent)]" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line)] bg-[#091215] px-2.5 py-2">
          <div className="flex items-center gap-2 text-[8.5px] text-[#6a8178]"><ClipboardList size={11} /> <span>Current world · seed {world?.config.seed ?? "—"} · quality {world?.quality.score ?? "—"}</span></div>
          <button disabled={!world} onClick={onExportProject} className="flex items-center gap-1 rounded border border-[var(--line)] px-2 py-1 text-[8.5px] text-[#a3b8b0] disabled:opacity-40"><Download size={9} /> Download .arkproj</button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* PROCESSES                                                           */
/* ------------------------------------------------------------------ */

const PROCESSES: { id: GeoProcess; label: string; description: string; assumption: string; icon: React.ReactNode }[] = [
  { id: "hydraulic", label: "Hydraulic incision", description: "Stream-power erosion with accumulation-weighted incision and 24% downstream deposition. Re-routes D8 drainage after the simulation.", assumption: "Detachment-limited incision; uniform lithology; no sediment transport capacity solver.", icon: <Mountain size={14} /> },
  { id: "thermal", label: "Thermal relaxation", description: "Talus-limited diffusion that transfers material from over-steep cells to their steepest lower neighbour.", assumption: "Angle of repose approximation; rate independent of lithology and climate.", icon: <Layers3 size={14} /> },
  { id: "channel-smoothing", label: "Surface smoothing", description: "Low-threshold diffusion for target polishing. Preserves gross relief while reducing single-cell spikes.", assumption: "Artistic surface treatment, not a physical process.", icon: <RotateCcw size={14} /> },
];

export function ProcessesDialog({ open, onClose, world, onApply }: { open: boolean; onClose: () => void; world: WorldData | null; onApply: (world: WorldData) => void }) {
  const [process, setProcess] = useState<GeoProcess>("hydraulic");
  const [intensity, setIntensity] = useState(0.5);
  const [result, setResult] = useState<WorldData | null>(null);
  const [baseline, setBaseline] = useState<WorldData | null>(null);
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (open && world) { setBaseline(world); setResult(null); setApplied(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = () => {
    if (!world) return;
    if (!baseline) setBaseline(world);
    setRunning(true);
    setTimeout(() => {
      try {
        const next = simulateProcess(world, process, intensity);
        setResult(next);
        setApplied(false);
      } finally {
        setRunning(false);
      }
    }, 40);
  };
  const comparison = baseline && result ? baseline.metrics : null;
  const delta = (a: number, b: number, decimals = 0) => {
    const d = b - a;
    return <span className={cn("mono text-[8px]", d > 0 ? "text-[#7fd6bd]" : d < 0 ? "text-[#db9c84]" : "text-[#758b82]")}>{d > 0 ? "+" : ""}{d.toFixed(decimals)}</span>;
  };
  return (
    <Modal open={open} onClose={onClose} title="Geological process laboratory" subtitle="Run a single process against the current height field, inspect the measured delta, then apply or revert." icon={<FlaskConical size={16} />} width="max-w-2xl"
      footer={<div className="flex items-center justify-between gap-2"><span className="mono text-[8px] text-[#5e736b]">CURRENT REVISION · {world?.revision ?? "—"} · {world?.objects.length.toLocaleString() ?? "—"} OBJECTS</span><div className="flex gap-2"><button onClick={onClose} className="rounded border border-[var(--line)] px-3 py-1.5 text-[10px] text-[#83978f]">Close</button>{applied && <button onClick={() => { if (baseline) { onApply(baseline); setApplied(false); setResult(null); } }} className="flex items-center gap-1.5 rounded border border-[var(--line-strong)] px-3 py-1.5 text-[10px] text-[#c7afa6]"><RotateCcw size={11} /> Restore baseline</button>}<button onClick={run} disabled={!world || running} className="flex items-center gap-1.5 rounded border border-[rgba(95,227,192,0.28)] bg-[#1e5448] px-3 py-1.5 text-[10px] font-medium text-[#e2fff7] disabled:opacity-50">{running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} {running ? "Simulating…" : "Run process"}</button>{result && !applied && <button onClick={() => { onApply(result); setApplied(true); }} className="rounded border border-[rgba(95,227,192,0.35)] bg-[#286a5a] px-3 py-1.5 text-[10px] font-semibold text-[#eefffa]">Apply result</button>}</div></div>}
    >
      <div className="p-4">
        {!world ? <div className="py-16 text-center text-[11px] text-[#6e837b]">Generate a world before running geological processes.</div> : (
          <>
            <div className="grid gap-1.5">
              {PROCESSES.map((item) => (
                <button key={item.id} onClick={() => { setProcess(item.id); setResult(null); setApplied(false); }} className={cn("flex items-start gap-2.5 rounded-md border p-2.5 text-left transition", process === item.id ? "border-[rgba(95,227,192,0.3)] bg-[rgba(95,227,192,0.05)]" : "border-[var(--line)] bg-[#0b1418] hover:border-[var(--line-strong)]")}>
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border", process === item.id ? "border-[rgba(95,227,192,0.28)] text-[var(--accent)]" : "border-[var(--line)] text-[#748b82]")}>{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between"><span className="text-[10.5px] font-medium text-[#d3e5de]">{item.label}</span>{process === item.id && <Pill tone="accent">selected</Pill>}</div>
                    <p className="mt-0.5 text-[8.5px] leading-relaxed text-[#7b9188]">{item.description}</p>
                    <p className="mt-0.5 text-[7.5px] italic text-[#5d7269]">Assumption: {item.assumption}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-md border border-[var(--line)] bg-[#0a1316] p-2.5">
              <div className="flex items-center justify-between text-[9px] text-[#9bb1a9]"><span>Process intensity</span><span className="mono text-[var(--accent)]">{Math.round(intensity * 100)}%</span></div>
              <input type="range" min={0.05} max={1} step={0.01} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} className="studio-range mt-1" style={{ "--pct": `${intensity * 100}%` } as React.CSSProperties} />
              <div className="mt-1 text-[8px] leading-relaxed text-[#5f756c]">Runs synchronously on the current grid; large fields may take a few hundred milliseconds. Hydrology, biomes and measured metrics are recomputed after the height field changes.</div>
            </div>
            {result && comparison && (
              <div className="mt-2 rounded-md border border-[rgba(95,227,192,0.2)] bg-[#0a1618] p-2.5">
                <div className="mb-1.5 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#91cfbd]"><BarChart3 size={10} /> Measured before → after</span><Pill tone="accent">revisions {baseline?.revision} → {result.revision}</Pill></div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
                  <div><div className="text-[8px] text-[#647a71]">Peak elevation</div><div className="mono text-[9px] text-[#c9ded6]">{comparison.maxElevation.toFixed(0)} → {result.metrics.maxElevation.toFixed(0)} m {delta(comparison.maxElevation, result.metrics.maxElevation)}</div></div>
                  <div><div className="text-[8px] text-[#647a71]">Mean slope</div><div className="mono text-[9px] text-[#c9ded6]">{((comparison.meanSlope * 180) / Math.PI).toFixed(1)} → {((result.metrics.meanSlope * 180) / Math.PI).toFixed(1)}° {delta((comparison.meanSlope * 180) / Math.PI, (result.metrics.meanSlope * 180) / Math.PI, 1)}</div></div>
                  <div><div className="text-[8px] text-[#647a71]">Roughness</div><div className="mono text-[9px] text-[#c9ded6]">{comparison.roughness.toFixed(1)} → {result.metrics.roughness.toFixed(1)} m {delta(comparison.roughness, result.metrics.roughness, 1)}</div></div>
                  <div><div className="text-[8px] text-[#647a71]">Quality score</div><div className="mono text-[9px] text-[#c9ded6]">{baseline?.quality.score} → {result.quality.score} {delta(baseline?.quality.score ?? 0, result.quality.score)}</div></div>
                  <div><div className="text-[8px] text-[#647a71]">River channels</div><div className="mono text-[9px] text-[#c9ded6]">{(comparison.riverCellShare * 100).toFixed(2)} → {(result.metrics.riverCellShare * 100).toFixed(2)}% {delta(comparison.riverCellShare, result.metrics.riverCellShare, 3)}</div></div>
                  <div><div className="text-[8px] text-[#647a71]">Ocean-linked</div><div className="mono text-[9px] text-[#c9ded6]">{(comparison.riverConnectivity * 100).toFixed(0)} → {(result.metrics.riverConnectivity * 100).toFixed(0)}% {delta(comparison.riverConnectivity, result.metrics.riverConnectivity, 1)}</div></div>
                </div>
                {result.quality.warnings.length > 0 && <p className="mt-1.5 flex gap-1 text-[7.5px] leading-relaxed text-[#a4957f]"><AlertTriangle size={9} className="mt-0.5 shrink-0" />{result.quality.warnings[0]}</p>}
                <div className="mono mt-1.5 flex items-center gap-1 border-t border-[var(--line)] pt-1.5 text-[7.5px] text-[#5d746b]">{applied ? <><Check size={9} className="text-[var(--accent)]" /> Applied to editable project state</> : <><Info size={9} /> Preview retained in memory · not yet committed</>}</div>
              </div>
            )}
            <div className="mt-2 flex items-start gap-1.5 rounded border border-[var(--line)] bg-[#091215] p-2 text-[8px] leading-relaxed text-[#667c73]">
              {process === "hydraulic" ? <ArrowDownRight size={11} className="mt-0.5 shrink-0 text-[#71998a]" /> : <ArrowUpRight size={11} className="mt-0.5 shrink-0 text-[#71998a]" />}
              This is a documented approximation, not a calibrated landscape-evolution model. Use simulation history and Ctrl+Z to compare revisions.
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* DOCS                                                                */
/* ------------------------------------------------------------------ */

export function DocsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Studio field guide" subtitle="Architecture, assumptions, reproducibility contract and operating notes for ARK Map Studio: Ultimate." icon={<FileJson size={16} />} width="max-w-4xl">
      <div className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Engine architecture</h3>
            <div className="space-y-1.5 text-[9.5px] leading-relaxed text-[#8ca29a]">
              <p><span className="font-medium text-[#c2d6ce]">Procedural mathematics.</span> Seeded Mulberry32, improved Perlin gradients, simplex sampling, FBM, ridged multifractal, domain warping and cellular plate fields. All finite and deterministic.</p>
              <p><span className="font-medium text-[#c2d6ce]">Generation pipeline.</span> Tectonic shape → uplift & volcanism → stream-power incision → thermal relaxation → priority-flood fill → D8 routing → persistent lakes → orographic climate → Whittaker-style biomes → rule-based object placement → measured analysis.</p>
              <p><span className="font-medium text-[#c2d6ce]">Separation of concerns.</span> <span className="mono text-[8.5px] text-[#7e988e]">src/lib/</span> contains no rendering logic. The Three.js layer only consumes immutable world arrays. Export encoders are independent of the viewport.</p>
              <p><span className="font-medium text-[#c2d6ce]">Determinism.</span> Same build + config + seed → identical Float32 fields on the same JavaScript runtime. No Math.random is used in generation; scatter uses isolated deterministic streams.</p>
            </div>
            <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Scientific assumptions</h3>
            <ul className="space-y-1 text-[9px] leading-relaxed text-[#82988f]">
              <li>• Priority-flood fill uses a min-heap and rank-based flat tie-breaks. D8 is single-flow.</li>
              <li>• Incision E ∝ A<sup>0.44</sup>·S with 24% downstream deposition. Uniform erodibility.</li>
              <li>• Temperature: sea-level base − latitude span − 6.5°C/km lapse + local noise.</li>
              <li>• Moisture: westerly advection, orographic precipitation and lee-side rain shadow.</li>
              <li>• Biomes are deterministic thresholds of temperature, moisture, elevation, slope and volcanism. Not a dynamic ecosystem model.</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Operating notes</h3>
            <div className="rounded-md border border-[var(--line)] bg-[#0b1418] p-2.5">
              {[
                ["G", "Generate the current configuration"],
                ["V / 1 / 2 / 3 / 4", "Navigate, raise, lower, smooth, flatten"],
                ["Ctrl / ⌘ + S", "Save project document"],
                ["Ctrl / ⌘ + Z", "Undo the latest committed edit"],
                ["Ctrl / ⌘ + Shift + Z", "Redo edit"],
                ["Shift + wheel", "Fine camera dolly in the 3D stage"],
              ].map(([keys, action]) => (
                <div key={keys} className="flex items-center justify-between border-b border-[var(--line)] py-1.5 last:border-0">
                  <kbd className="mono rounded border border-[var(--line-strong)] bg-[#101c1f] px-1.5 py-0.5 text-[8px] text-[#d0e2db]">{keys}</kbd>
                  <span className="text-[8.5px] text-[#81968e]">{action}</span>
                </div>
              ))}
            </div>
            <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Database & validation</h3>
            <p className="text-[9px] leading-relaxed text-[#82988f]">Projects are local documents containing the configuration and seed. The generated field is rebuilt on load; a saved quality snapshot preserves the measured reference. The live suite verifies PRNG determinism, noise bounds, FBM behaviour, world reproducibility, height integrity, accumulation ordering, water classification, biome domains, object validity, continuity guards, quality weights, mesh winding and PNG / RAW headers.</p>
            <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">ARK & visual limitations</h3>
            <div className="space-y-1">
              <p className="text-[9px] font-semibold leading-relaxed text-[#d6b180]">{ARK_COMPATIBILITY_DISCLOSURE.headline}</p>
              <p className="text-[9px] leading-relaxed text-[#a29484]">{ARK_COMPATIBILITY_DISCLOSURE.contents} {ARK_COMPATIBILITY_DISCLOSURE.notIncluded}</p>
              <p className="text-[9px] leading-relaxed text-[#a29484]">{ARK_COMPATIBILITY_DISCLOSURE.projectStructure} {ARK_COMPATIBILITY_DISCLOSURE.verification}</p>
              <p className="text-[9px] leading-relaxed text-[#a29484]">{ARK_COMPATIBILITY_DISCLOSURE.dataHonesty}</p>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded border border-[var(--line)] bg-[#091215] p-2">
              <ShieldCheck size={13} className="shrink-0 text-[#6ba998]" />
              <span className="mono text-[8px] leading-relaxed text-[#6b8379]">ENGINE 1.0.0 · BUILD deterministic · GEOMETRY 1 unit ≈ 75 m · VERTICAL DISPLAY ×2.4</span>
            </div>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-[var(--line)]">
          <div className="border-b border-[var(--line)] bg-[#0b1418] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#8ea69d]">Data contracts & formulas</div>
          <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
            {[
              ["Elevation datum", "0 m = mean sea level. Ocean floor clamped −1600 m; peaks clamped 3050 m."],
              ["Slope", "Central finite differences over cell spacing. Rise/run, displayed in degrees."],
              ["Flow accumulation", "Cells seeded 1; upstream contributions propagated in fill order."],
              ["Lake persistence", "Connected depressions > 0.55 m; retained by area or maximum depth."],
              ["Normalisation", "Exports map measured min/max linearly to 0…65535 without clipping."],
              ["Orientation", "Row-major north-west origin; +X east; +Z south. No vertical flip."],
            ].map(([term, description]) => (
              <div key={term} className="bg-[#0a1316] p-2.5"><div className="mono text-[8px] uppercase tracking-wider text-[#74a395]">{term}</div><div className="mt-0.5 text-[8.5px] leading-relaxed text-[#7d938a]">{description}</div></div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function randomiseForNewWorld(config: WorldConfig): WorldConfig {
  return { ...randomiseConfig(config), name: "Untitled World" };
}
