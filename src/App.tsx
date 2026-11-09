import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, CircleDot, Clock, History, ListFilter, Loader2, Terminal, Trash2 } from "lucide-react";
import TopBar, { type TopTab } from "./components/TopBar";
import LeftPanel from "./components/LeftPanel";
import RightPanel, { type InspectorTab } from "./components/RightPanel";
import ViewportStage, { type ViewMode } from "./components/ViewportStage";
import { type CameraMode, type EditTool, type LayerState, type RenderQuality, type SunPreset } from "./components/TerrainViewport";
import type { MapInspection, MapOverlay } from "./components/MapCanvas";
import { AnalysisDialog, DocsDialog, ExportDialog, PresetsDialog, ProcessesDialog, ProjectsDialog, ValidationDialog } from "./components/Dialogs";
import { BASE_CONFIG, PRESETS, randomiseConfig, type WorldPreset } from "./lib/presets";
import type { GenerationProgress, HistoryEntry, ObjectKind, PerfStats, SavedProject, WorldConfig, WorldData, WorldObject } from "./lib/types";
import { BIOMES } from "./lib/types";
import { applyTerrainBrush, refreshWorld } from "./lib/worldgen";
import { downloadProject } from "./lib/exporters";
import { computeMetrics } from "./lib/analysis";
import { assetDefinition } from "./lib/assets";
import type { EnvironmentId } from "./lib/environments";
import { generationClient } from "./lib/workerClient";
import { decodeHeights, encodeHeights } from "./lib/terrainCodec";
import { cn } from "./utils/cn";

type ModalId = "presets" | "export" | "analysis" | "validation" | "projects" | "docs" | "processes" | null;
type LogLevel = "info" | "success" | "warn" | "error" | "system";
interface StudioLog { id: string; at: number; message: string; level: LogLevel }
interface EditSnapshot { heights: Float32Array; objects: WorldObject[]; label: string }

const PROJECTS_KEY = "ark-map-studio-ultimate-projects";
const AUTOSAVE_KEY = "ark-map-studio-ultimate-autosave";

function terrainSignature(config: WorldConfig): string {
  const { name: _name, ...rest } = config;
  void _name;
  return JSON.stringify(rest);
}

function loadProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProject[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.seed === "number" && p.config) : [];
  } catch {
    return [];
  }
}

function initialTerrainPatch(): SavedProject["terrain"] | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { terrain?: SavedProject["terrain"] };
    const patch = parsed.terrain;
    if (patch && typeof patch.data === "string" && Number.isFinite(patch.count) && Number.isFinite(patch.resolution)) return patch;
  } catch {
    // A corrupt autosave must never prevent startup.
  }
  return null;
}

function initialConfig(): WorldConfig {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return BASE_CONFIG;
    const parsed = JSON.parse(raw) as { config?: WorldConfig };
    if (parsed.config && typeof parsed.config.seed === "number") return { ...BASE_CONFIG, ...parsed.config };
  } catch {
    // Fall back to the calibrated baseline.
  }
  return BASE_CONFIG;
}

function inspectCell(world: WorldData, x: number, y: number): MapInspection {
  const n = world.resolution;
  const gx = Math.min(n - 1, Math.max(0, Math.floor(x * n)));
  const gy = Math.min(n - 1, Math.max(0, Math.floor(y * n)));
  const i = gy * n + gx;
  const biome = BIOMES[world.biome[i]] ?? BIOMES[0];
  return {
    x: (gx + 0.5) / n,
    y: (gy + 0.5) / n,
    elevation: world.heights[i],
    slope: (Math.atan(world.slope[i]) * 180) / Math.PI,
    temperature: world.temperature[i],
    moisture: world.moisture[i],
    biome: biome.label,
    biomeColor: biome.color,
    water: world.heights[i] < 0 ? "Ocean" : world.lakeMask[i] ? "Lake" : world.riverMask[i] ? "River channel" : "Dry",
    flow: world.flowAccumulation[i],
  };
}

function pickSample(world: WorldData): MapInspection {
  const n = world.resolution;
  let best: { x: number; y: number; score: number } | null = null;
  for (let gy = n * 0.28; gy < n * 0.72; gy += Math.max(2, Math.floor(n / 22))) {
    for (let gx = n * 0.28; gx < n * 0.72; gx += Math.max(2, Math.floor(n / 22))) {
      const i = Math.floor(gy) * n + Math.floor(gx);
      const h = world.heights[i];
      if (h < 25 || world.lakeMask[i]) continue;
      const biome = BIOMES[world.biome[i]].key;
      const biomeScore = ["forest", "rainforest", "grassland", "savanna", "shrubland"].includes(biome) ? 30 : 0;
      const slopeScore = Math.max(0, 30 - (world.slope[i] * 180) / Math.PI);
      const waterScore = Math.exp(-world.coastDistance[i] / 30) * 20;
      const score = biomeScore + slopeScore + waterScore;
      if (!best || score > best.score) best = { x: (gx + 0.5) / n, y: (gy + 0.5) / n, score };
    }
  }
  return inspectCell(world, best?.x ?? 0.55, best?.y ?? 0.48);
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export default function App() {
  const [config, setConfig] = useState<WorldConfig>(initialConfig);
  const [world, setWorld] = useState<WorldData | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [perf, setPerf] = useState<PerfStats | null>(null);
  const [modal, setModal] = useState<ModalId>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("world");
  const [overlay, setOverlay] = useState<MapOverlay>("biome");
  const [hillshade, setHillshade] = useState(true);
  const [contours, setContours] = useState(true);
  const [layers, setLayers] = useState<LayerState>({ water: true, rivers: true, vegetation: true, rocks: true, landmarks: true, clouds: true, bloom: true, waves: true, wireframe: false, colorMode: "biome" });
  const [quality, setQuality] = useState<RenderQuality>("high");
  const [cameraMode, setCameraMode] = useState<CameraMode>("free");
  const [sun, setSun] = useState<SunPreset>("noon");
  const [environment, setEnvironment] = useState<EnvironmentId>("temperate");
  const [tool, setTool] = useState<EditTool>("orbit");
  const [brushRadius, setBrushRadius] = useState(22);
  const [brushStrength, setBrushStrength] = useState(0.32);
  const [assetKind, setAssetKind] = useState<ObjectKind>("pine");
  const [selected, setSelected] = useState<MapInspection | null>(null);
  const [currentPresetId, setCurrentPresetId] = useState<string | undefined>("verdant");
  const [projects, setProjects] = useState<SavedProject[]>(loadProjects);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saved, setSaved] = useState(false);
  const [logs, setLogs] = useState<StudioLog[]>([{ id: "boot", at: Date.now(), message: "Studio runtime initialised · awaiting deterministic field", level: "system" }]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [drawer, setDrawer] = useState<"builder" | "inspector" | null>(null);

  const worldRef = useRef<WorldData | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const sequenceRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  const skipNextAutoRef = useRef(false);
  const pendingTerrainRef = useRef<SavedProject["terrain"] | null>(initialTerrainPatch());
  const lastSignatureRef = useRef("");
  const editBaselineRef = useRef<Float32Array | null>(null);
  const editObjectsBaselineRef = useRef<WorldObject[] | null>(null);
  const undoRef = useRef<EditSnapshot[]>([]);
  const redoRef = useRef<EditSnapshot[]>([]);
  const saveRef = useRef<() => void>(() => {});

  const addLog = useCallback((message: string, level: LogLevel = "info") => {
    setLogs((current) => [...current.slice(-79), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), message, level }]);
  }, []);

  const generate = useCallback(async (target: WorldConfig, reason: "initial" | "manual" | "parameter" | "load") => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    generationClient.cancel();
    const sequence = ++sequenceRef.current;
    setIsGenerating(true);
    setProgress({ phase: "Queued", detail: "Preparing deterministic grid allocation", progress: 0 });
    if (reason === "manual") addLog("Manual generation requested", "system");
    try {
      let result = await generationClient.generate(target, (next) => {
        if (sequence === sequenceRef.current) setProgress(next);
      });
      if (sequence !== sequenceRef.current) return;
      // Apply a stored editable-terrain patch exactly once, only when its grid matches.
      const pendingTerrain = pendingTerrainRef.current;
      pendingTerrainRef.current = null;
      if (pendingTerrain && pendingTerrain.resolution === result.resolution) {
        const decoded = decodeHeights(pendingTerrain);
        if (decoded && decoded.length === result.heights.length) {
          result = refreshWorld({ ...result, heights: decoded });
          addLog("Edited terrain patch restored from project document", "system");
        }
      }
      lastSignatureRef.current = terrainSignature(result.config);
      worldRef.current = result;
      undoRef.current = [];
      redoRef.current = [];
      setHistoryVersion((v) => v + 1);
      setWorld(result);
      setConfig((current) => ({ ...current, resolution: result.resolution }));
      setSelected(pickSample(result));
      setSaved(reason === "load");
      setHistory((current) => [{
        id: `${Date.now()}-${result.config.seed}`,
        label: `${result.config.name} · ${result.config.landmass} · ${result.resolution}²`,
        config: result.config,
        seed: result.config.seed,
        score: result.quality.score,
        generationMs: result.generationMs,
        at: Date.now(),
      }, ...current].slice(0, 32));
      addLog(`World generated · seed ${result.config.seed} · ${result.resolution}² · ${result.quality.score}/100 (${result.quality.grade}) · ${result.generationMs.toFixed(0)} ms`, "success");
      addLog(`Hydrology routed · ${result.metrics.watersheds} catchments · ${(result.metrics.riverConnectivity * 100).toFixed(0)}% ocean-connected · ${result.objects.length.toLocaleString()} objects`, "info");
    } catch (error) {
      if (sequence !== sequenceRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        addLog("Generation cancelled by operator", "warn");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Generation failure: ${message}`, "error");
      setToast({ message: `Generation failed: ${message}`, tone: "error" });
    } finally {
      if (sequence === sequenceRef.current) {
        setIsGenerating(false);
        setProgress(null);
      }
    }
  }, [addLog]);

  // Debounced regeneration whenever terrain-affecting parameters change.
  useEffect(() => {
    const signature = terrainSignature(config);
    if (signature === lastSignatureRef.current) return;
    if (skipNextAutoRef.current) {
      skipNextAutoRef.current = false;
      return;
    }
    const delay = worldRef.current ? 820 : 40;
    const timer = window.setTimeout(() => {
      void generate(configRef.current, worldRef.current ? "parameter" : "initial");
    }, delay);
    pendingTimerRef.current = timer;
    return () => { if (pendingTimerRef.current === timer) pendingTimerRef.current = null; window.clearTimeout(timer); };
  }, [config, generate]);

  useEffect(() => { worldRef.current = world; }, [world]);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // Terrain patches can exceed the origin quota. Preserve the project
      // library by degrading gracefully rather than losing every saved world.
      try {
        const lightweight = projects.map((p) => ({ ...p, terrain: undefined }));
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(lightweight));
        addLog("Storage quota reached — newest terrain patch omitted from local library", "warn");
      } catch {
        addLog("Local project storage unavailable — projects remain in this session", "error");
      }
    }
  }, [projects, addLog]);

  useEffect(() => {
    if (!world) return;
    const timer = window.setTimeout(() => {
      const base = { config: world.config, savedAt: Date.now(), score: world.quality.score };
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...base, terrain: encodeHeights(world.heights) }));
      } catch {
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(base));
        } catch {
          // Autosave failure is non-fatal; generation and exports continue.
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [world]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateConfig = useCallback((partial: Partial<WorldConfig>) => {
    setConfig((current) => ({ ...current, ...partial }));
    setCurrentPresetId(undefined);
    setSaved(false);
  }, []);

  const handleRename = useCallback((name: string) => {
    setConfig((current) => ({ ...current, name }));
    setSaved(false);
  }, []);

  const applyPreset = useCallback((preset: WorldPreset) => {
    setConfig({ ...preset.config });
    setCurrentPresetId(preset.id);
    setCurrentProjectId(null);
    setSaved(false);
    addLog(`Preset loaded · ${preset.name}`, "system");
  }, [addLog]);

  const cancelGeneration = () => {
    generationClient.cancel();
    sequenceRef.current++;
    setIsGenerating(false);
    setProgress(null);
    addLog("Generation cancelled by operator", "warn");
  };

  const saveProject = useCallback(() => {
    const active = worldRef.current;
    if (!active) return;
    const now = Date.now();
    const id = currentProjectId ?? `project-${now}-${active.config.seed}`;
    const document: SavedProject = {
      id,
      name: active.config.name,
      config: active.config,
      createdAt: projects.find((p) => p.id === id)?.createdAt ?? now,
      updatedAt: now,
      seed: active.config.seed,
      score: active.quality.score,
      generationMs: active.generationMs,
      terrain: encodeHeights(active.heights),
    };
    setProjects((current) => [document, ...current.filter((p) => p.id !== id)]);
    setCurrentProjectId(id);
    setSaved(true);
    addLog(`Project saved · ${document.name} · seed ${document.seed}${document.terrain ? " · edited terrain embedded" : ""}`, "success");
    setToast({ message: document.terrain ? "Project saved with editable terrain" : "Project saved to the local project library", tone: "success" });
  }, [currentProjectId, projects, addLog]);
  saveRef.current = saveProject;

  const loadProject = useCallback((project: SavedProject) => {
    pendingTerrainRef.current = project.terrain ?? null;
    // Regenerate explicitly so a project whose seed already matches the active
    // world still receives its stored terrain patch.
    skipNextAutoRef.current = true;
    setConfig({ ...project.config });
    setCurrentProjectId(project.id);
    setSaved(true);
    addLog(`Project loaded · ${project.name} · seed ${project.seed}${project.terrain ? " · restoring edited terrain" : ""}`, "system");
    void generate(project.config, "load");
  }, [addLog, generate]);

  const restoreHistory = useCallback((entry: HistoryEntry) => {
    setConfig({ ...entry.config });
    setCurrentProjectId(null);
    setSaved(false);
    addLog(`History restored · seed ${entry.seed} · ${entry.label}`, "system");
  }, [addLog]);

  const startEdit = useCallback(() => {
    if (editBaselineRef.current || !worldRef.current) return;
    editBaselineRef.current = new Float32Array(worldRef.current.heights);
    editObjectsBaselineRef.current = worldRef.current.objects;
  }, []);

  const editTerrain = useCallback((u: number, v: number) => {
    const active = worldRef.current;
    if (!active || tool === "orbit") return;
    const n = active.resolution;
    const gx = Math.min(n - 1, Math.max(0, Math.round(u * (n - 1))));
    const gz = Math.min(n - 1, Math.max(0, Math.round(v * (n - 1))));
    const cell = gz * n + gx;

    if (tool === "place") {
      const definition = assetDefinition(assetKind);
      const height = active.heights[cell];
      if (height < 1.5 || active.lakeMask[cell]) {
        setToast({ message: "Placement rejected — choose dry land above the shoreline", tone: "error" });
        return;
      }
      if (active.slope[cell] > definition.maxSlope) {
        setToast({ message: `${definition.label} rejected — terrain slope exceeds its ${Math.round((definition.maxSlope * 180) / Math.PI)}° limit`, tone: "error" });
        return;
      }
      if (active.objects.some((object) => Math.hypot((object.x - u) * n, (object.z - v) * n) < 1.6)) {
        return;
      }
      // Positional hash gives deterministic-looking variation without consuming
      // the generation RNG stream or perturbing reproducibility of the base world.
      const variation = ((Math.imul(gx + 11, 73856093) ^ Math.imul(gz + 7, 19349663)) >>> 0) / 4294967296;
      const object: WorldObject = {
        x: (gx + 0.5) / n,
        z: (gz + 0.5) / n,
        y: height,
        kind: assetKind,
        scale: definition.scale * (0.82 + variation * 0.42),
        rotation: variation * Math.PI * 2,
        biome: active.biome[cell],
      };
      const placed = { ...active, objects: [...active.objects, object], revision: active.revision + 1 };
      const { metrics, quality } = computeMetrics(placed);
      const next = { ...placed, metrics, quality };
      worldRef.current = next;
      setWorld(next);
      setSaved(false);
      return;
    }

    if (tool === "erase") {
      const radiusCells = Math.max(1.5, brushRadius * 0.85);
      const remaining = active.objects.filter((object) => Math.hypot((object.x - u) * n, (object.z - v) * n) > radiusCells);
      if (remaining.length === active.objects.length) return;
      const removed = active.objects.length - remaining.length;
      const cleared = { ...active, objects: remaining, revision: active.revision + 1 };
      const { metrics, quality } = computeMetrics(cleared);
      const next = { ...cleared, metrics, quality };
      worldRef.current = next;
      setWorld(next);
      setSaved(false);
      if (removed > 0) addLog(`Removed ${removed} environment asset${removed === 1 ? "" : "s"} · density re-measured`, "info");
      return;
    }

    const targetHeight = active.heights[cell];
    const heights = new Float32Array(active.heights);
    applyTerrainBrush(heights, n, u, v, brushRadius, brushStrength, tool, targetHeight);
    const refreshed = refreshWorld({ ...active, heights, revision: active.revision + 1 });
    worldRef.current = refreshed;
    setWorld(refreshed);
    setSaved(false);
  }, [addLog, assetKind, brushRadius, brushStrength, tool]);

  const endEdit = useCallback(() => {
    if (!editBaselineRef.current) return;
    undoRef.current.push({
      heights: editBaselineRef.current,
      objects: editObjectsBaselineRef.current ?? [],
      label: tool === "place" ? `${assetKind} placement` : tool === "erase" ? "asset removal" : `${tool} brush`,
    });
    if (undoRef.current.length > 16) undoRef.current.shift();
    redoRef.current = [];
    editBaselineRef.current = null;
    editObjectsBaselineRef.current = null;
    setHistoryVersion((v) => v + 1);
    const active = worldRef.current;
    if (active) setSelected(pickSample(active));
    addLog(tool === "place" || tool === "erase" ? `Asset edit committed · ${tool === "place" ? assetKind : "removal"} · ${active?.objects.length.toLocaleString() ?? 0} total` : `Terrain edit committed · ${tool} · hydrology and metrics re-evaluated`, "info");
  }, [tool, assetKind, addLog]);

  const undo = useCallback(() => {
    const active = worldRef.current;
    const previous = undoRef.current.pop();
    if (!active || !previous) return;
    redoRef.current.push({ heights: new Float32Array(active.heights), objects: active.objects, label: previous.label });
    const restored = refreshWorld({ ...active, heights: previous.heights, objects: previous.objects, revision: active.revision + 1 });
    worldRef.current = restored;
    setWorld(restored);
    setHistoryVersion((v) => v + 1);
    setSaved(false);
    addLog(`Undo · ${previous.label}`, "system");
  }, [addLog]);

  const redo = useCallback(() => {
    const active = worldRef.current;
    const next = redoRef.current.pop();
    if (!active || !next) return;
    undoRef.current.push({ heights: new Float32Array(active.heights), objects: active.objects, label: next.label });
    const restored = refreshWorld({ ...active, heights: next.heights, objects: next.objects, revision: active.revision + 1 });
    worldRef.current = restored;
    setWorld(restored);
    setHistoryVersion((v) => v + 1);
    setSaved(false);
    addLog("Redo applied", "system");
  }, [addLog]);

  const applyProcessedWorld = useCallback((next: WorldData) => {
    const active = worldRef.current;
    if (active) {
      undoRef.current.push({ heights: new Float32Array(active.heights), objects: active.objects, label: "Geological process" });
      if (undoRef.current.length > 12) undoRef.current.shift();
    }
    redoRef.current = [];
    worldRef.current = next;
    setWorld(next);
    setSaved(false);
    setHistoryVersion((v) => v + 1);
    addLog(`Geological process applied · revision ${next.revision} · quality ${next.quality.score}/100`, "success");
  }, [addLog]);

  const openModal = (id: ModalId) => setModal(id);
  const closeModal = () => setModal(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (inField) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
        return;
      }
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (command || event.altKey) return;
      if (event.key.toLowerCase() === "g") { event.preventDefault(); void generate(configRef.current, "manual"); }
      if (event.key.toLowerCase() === "v") setTool("orbit");
      if (event.key === "1") setTool("raise");
      if (event.key === "2") setTool("lower");
      if (event.key === "3") setTool("smooth");
      if (event.key === "4") setTool("flatten");
      if (event.key.toLowerCase() === "p") setTool("place");
      if (event.key.toLowerCase() === "e") setTool("erase");
      if (event.key === "Escape") { setTool("orbit"); closeModal(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, generate]);

  const topTab: TopTab = modal === "analysis" ? "analysis" : modal === "projects" ? "projects" : modal === "docs" ? "docs" : "workspace";
  const handleOverlay = (next: MapOverlay) => { setOverlay(next); setInspectorTab("layers"); };
  const handleSelect = (sample: MapInspection) => { setSelected(sample); setInspectorTab("overview"); };
  const canUndo = undoRef.current.length > 0 && historyVersion >= 0;
  const canRedo = redoRef.current.length > 0 && historyVersion >= 0;
  const lastLog = logs[logs.length - 1];
  const fallbackWorld = world;

  return (
    <div className="relative flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar
        projectName={config.name}
        onRename={handleRename}
        isGenerating={isGenerating}
        saved={saved}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onGenerate={() => void generate(configRef.current, "manual")}
        onSave={saveProject}
        onExport={() => openModal("export")}
        onOpenProjects={() => openModal("projects")}
        onOpenValidation={() => openModal("validation")}
        onOpenAnalysis={() => openModal("analysis")}
        onOpenDocs={() => openModal("docs")}
        topTab={topTab}
      />

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[290px] shrink-0 lg:block">
          <LeftPanel
            config={config}
            onChange={updateConfig}
            preset={PRESETS.find((p) => p.id === currentPresetId)}
            onOpenPresets={() => openModal("presets")}
            onGenerate={() => void generate(configRef.current, "manual")}
            isGenerating={isGenerating}
            progress={progress?.progress ?? 0}
            tool={tool}
            onTool={setTool}
            brushRadius={brushRadius}
            brushStrength={brushStrength}
            onBrushRadius={setBrushRadius}
            onBrushStrength={setBrushStrength}
            assetKind={assetKind}
            onAssetKind={setAssetKind}
            onRandomise={() => { setConfig((current) => ({ ...randomiseConfig(current), resolution: current.resolution })); setCurrentPresetId(undefined); setSaved(false); }}
            editHistoryCount={undoRef.current.length}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {world || isGenerating || true ? (
            <ViewportStage
              world={world}
              viewMode={viewMode}
              onViewMode={(mode) => setViewMode(mode)}
              overlay={overlay}
              onOverlay={handleOverlay}
              layers={layers}
              quality={quality}
              onQuality={setQuality}
              cameraMode={cameraMode}
              onCameraMode={setCameraMode}
              sun={sun}
              onSun={setSun}
              environment={environment}
              onEnvironment={setEnvironment}
              tool={tool}
              onTool={setTool}
              brushRadius={brushRadius}
              assetKind={assetKind}
              isGenerating={isGenerating}
              progress={progress}
              onCancel={cancelGeneration}
              onPerf={setPerf}
              onEdit={editTerrain}
              onEditStart={startEdit}
              onEditEnd={endEdit}
              selected={selected}
              onSelect={handleSelect}
              hillshade={hillshade}
              contours={contours}
              onOpenProcesses={() => openModal("processes")}
              perf={perf}
            />
          ) : null}
        </div>

        <div className="hidden w-[314px] shrink-0 xl:block">
          <RightPanel
            world={fallbackWorld}
            tab={inspectorTab}
            onTab={setInspectorTab}
            layers={layers}
            onLayers={(partial) => setLayers((current) => ({ ...current, ...partial }))}
            overlay={overlay}
            onOverlay={handleOverlay}
            hillshade={hillshade}
            onHillshade={setHillshade}
            contours={contours}
            onContours={setContours}
            sun={sun}
            onSun={setSun}
            selected={selected}
            onSelect={handleSelect}
            onOpenAnalysis={() => openModal("analysis")}
            onOpenValidation={() => openModal("validation")}
          />
        </div>
      </div>

      <footer className="relative z-30 flex h-[30px] shrink-0 items-center gap-3 border-t border-[var(--line)] bg-[#070d10] px-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", isGenerating ? "bg-[#e9b872]" : world ? "bg-[var(--accent)]" : "bg-[#546a61]")} />
          <span className="mono text-[7.5px] uppercase tracking-[0.12em] text-[#7d958b]">{isGenerating ? "synthesising" : world ? "field ready" : "boot"}</span>
        </div>
        <span className="h-3 w-px bg-[var(--line)]" />
        <button onClick={() => setConsoleOpen(!consoleOpen)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left transition hover:text-white" title="Toggle studio diagnostics">
          <Terminal size={9} className="shrink-0 text-[#5d776d]" />
          <span className="mono truncate text-[8px] text-[#60786e]">{lastLog?.message ?? "Studio diagnostics ready"}</span>
          <ChevronUp size={9} className={cn("shrink-0 text-[#4d645b] transition-transform", consoleOpen && "rotate-180")} />
        </button>
        <div className="hidden items-center gap-2 text-[8px] text-[#617a70] md:flex">
          <span className="mono" title="Measured rendering frames per second">{perf ? `${perf.fps} FPS` : "— FPS"}</span>
          <span className="text-[#33453f]">·</span>
          <span className="mono" title="Measured renderer CPU submission time per frame (not GPU frame time)">{perf ? `${perf.frameMs.toFixed(2)} CPU MS` : "— CPU MS"}</span>
          <span className="text-[#33453f]">·</span>
          <span className="mono" title="Rendered triangles reported by WebGLRenderer">{perf ? `${(perf.triangles / 1000).toFixed(0)}K TRI` : "— TRI"}</span>
          <span className="text-[#33453f]">·</span>
          <span className="mono" title="Draw calls reported by WebGLRenderer">{perf ? `${perf.drawCalls} CALLS` : "— CALLS"}</span>
        </div>
        <span className="hidden h-3 w-px bg-[var(--line)] lg:block" />
        <div className="hidden items-center gap-2 text-[8px] text-[#5c736a] lg:flex">
          <Clock size={9} /><span className="mono">{world ? `${world.generationMs.toFixed(0)} ms` : "—"}</span>
          <span className="mono">·</span>
          <span className="mono">REV {world?.revision ?? 0}</span>
          <span className="mono">·</span>
          <span className="flex items-center gap-1"><CircleDot size={8} /> {saved ? "SAVED" : "AUTOSAVE"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setConsoleOpen(!consoleOpen)} title="Studio console" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] text-[#6a8178] transition hover:bg-white/5 hover:text-white">
            <Terminal size={9} /><span className="hidden sm:inline">Console</span>
          </button>
          <button onClick={() => openModal("projects")} title="Generation history" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] text-[#6a8178] transition hover:bg-white/5 hover:text-white">
            <History size={9} /><span className="hidden sm:inline">History</span>
          </button>
        </div>
      </footer>

      {consoleOpen && (
        <div className="absolute bottom-[30px] left-0 right-0 z-40 flex h-[168px] flex-col border-t border-[#31423f] bg-[#060c0f]/[0.98] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] backdrop-blur">
          <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
            <span className="mono flex items-center gap-1.5 text-[8px] uppercase tracking-[0.12em] text-[#86a096]"><Terminal size={10} className="text-[var(--accent)]" /> Studio diagnostics · measured events</span>
            <div className="flex items-center gap-1.5">
              <span className="mono text-[7.5px] text-[#50665c]">{logs.length} entries</span>
              <button onClick={() => setLogs([])} title="Clear log" className="rounded p-1 text-[#5f766d] hover:text-[#e79b8b]"><Trash2 size={9} /></button>
              <button onClick={() => setConsoleOpen(false)} className="rounded p-1 text-[#5f766d] hover:text-white"><ListFilter size={9} /></button>
            </div>
          </div>
          <div className="panel-scroll flex-1 overflow-y-auto px-3 py-1">
            {logs.slice().reverse().map((entry) => (
              <div key={entry.id} className="mono flex items-start gap-2 py-[2px] text-[8.5px] leading-relaxed">
                <span className="shrink-0 text-[#43584f]">{formatClock(entry.at)}</span>
                <span className={cn("shrink-0 uppercase", entry.level === "error" ? "text-[#df8b7b]" : entry.level === "warn" ? "text-[#d1a873]" : entry.level === "success" ? "text-[#67d5b8]" : entry.level === "system" ? "text-[#76a7c2]" : "text-[#4e665c]")}>{entry.level}</span>
                <span className="text-[#89a096]">{entry.message}</span>
              </div>
            ))}
            {logs.length === 0 && <div className="mono py-6 text-center text-[8.5px] text-[#4c6259]">Diagnostics cleared. Continue working to record events.</div>}
          </div>
        </div>
      )}

      {toast && (
        <div className={cn("fixed right-4 top-[62px] z-[60] flex items-center gap-2 rounded-md border px-3 py-2 text-[10px] shadow-xl animate-in", toast.tone === "error" ? "border-[rgba(242,124,106,0.35)] bg-[#201210] text-[#f0a294]" : "border-[rgba(95,227,192,0.3)] bg-[#0d1d1b] text-[#a4e8d6]")}>
          {toast.tone === "error" ? <Terminal size={12} /> : <CheckIcon />}
          {toast.message}
        </div>
      )}

      <PresetsDialog open={modal === "presets"} onClose={closeModal} onApply={applyPreset} currentId={currentPresetId} />
      <ExportDialog open={modal === "export"} onClose={closeModal} world={world} />
      <AnalysisDialog open={modal === "analysis"} onClose={closeModal} world={world} perf={perf} />
      <ValidationDialog open={modal === "validation"} onClose={closeModal} />
      <ProjectsDialog
        open={modal === "projects"}
        onClose={closeModal}
        projects={projects}
        history={history}
        world={world}
        onSave={saveProject}
        onLoadProject={loadProject}
        onDeleteProject={(id) => { setProjects((current) => current.filter((p) => p.id !== id)); if (currentProjectId === id) setCurrentProjectId(null); addLog("Project removed from library", "system"); }}
        onRestore={restoreHistory}
        onImport={(next, terrain) => {
          pendingTerrainRef.current = terrain ?? null;
          skipNextAutoRef.current = true;
          setConfig(next);
          setCurrentPresetId(undefined);
          setCurrentProjectId(null);
          setSaved(false);
          void generate(next, "load");
          setToast({ message: terrain ? "Project imported with editable terrain" : "Project configuration imported", tone: "success" });
        }}
        onExportProject={() => { if (worldRef.current) downloadProject(worldRef.current); }}
      />
      <ProcessesDialog open={modal === "processes"} onClose={closeModal} world={world} onApply={applyProcessedWorld} />
      <DocsDialog open={modal === "docs"} onClose={closeModal} />

      {!world && !isGenerating && (
        <div className="absolute inset-0 z-[45] flex items-center justify-center bg-[#050a0c]/85 backdrop-blur-sm">
          <div className="max-w-sm rounded-xl border border-[var(--line-strong)] bg-[#0a1418] p-6 text-center">
            <Loader2 size={22} className="mx-auto mb-3 animate-spin text-[var(--accent)]" />
            <p className="text-[12px] font-medium text-[#d6e7e1]">Terrain field unavailable</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#7b9289]">The deterministic engine did not return a world. Retry generation or inspect the console.</p>
            <button onClick={() => void generate(configRef.current, "manual")} className="mt-3 rounded border border-[rgba(95,227,192,0.3)] bg-[#1f574a] px-3 py-1.5 text-[10px] font-medium text-[#e8fff8]">Retry generation</button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[70] h-px bg-[linear-gradient(90deg,transparent,rgba(95,227,192,0.28),transparent)]" />

      {!drawer && (
        <div className="fixed bottom-[38px] left-3 z-30 flex gap-1.5 lg:hidden">
          <button onClick={() => setDrawer("builder")} className="rounded-md border border-[rgba(95,227,192,0.3)] bg-[#10201f]/95 px-2.5 py-1.5 text-[9px] font-medium text-[#b9eadc] shadow-lg backdrop-blur">Builder</button>
          <button onClick={() => setDrawer("inspector")} className="rounded-md border border-[var(--line-strong)] bg-[#101c1f]/95 px-2.5 py-1.5 text-[9px] font-medium text-[#b9cfc7] shadow-lg backdrop-blur xl:hidden">Inspector</button>
        </div>
      )}
      {drawer && (
        <div className="fixed inset-0 z-[55] flex xl:hidden">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setDrawer(null)} />
          <div className={cn("relative flex h-full w-[min(330px,90vw)] flex-col border-r border-[var(--line-strong)] bg-[#0a1115] shadow-2xl animate-in", drawer === "inspector" && "ml-auto border-l border-r-0")}>
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
              <span className="mono text-[9px] uppercase tracking-[0.14em] text-[#8ba49a]">{drawer === "builder" ? "World builder" : "World inspector"}</span>
              <button onClick={() => setDrawer(null)} className="rounded p-1 text-[#748a82] hover:text-white" aria-label="Close panel"><ChevronUp size={12} className="rotate-90" /></button>
            </div>
            <div className="min-h-0 flex-1">
              {drawer === "builder" ? (
                <LeftPanel
                  config={config}
                  onChange={updateConfig}
                  preset={PRESETS.find((p) => p.id === currentPresetId)}
                  onOpenPresets={() => openModal("presets")}
                  onGenerate={() => { setDrawer(null); void generate(configRef.current, "manual"); }}
                  isGenerating={isGenerating}
                  progress={progress?.progress ?? 0}
                  tool={tool}
                  onTool={setTool}
                  brushRadius={brushRadius}
                  brushStrength={brushStrength}
                  onBrushRadius={setBrushRadius}
                  onBrushStrength={setBrushStrength}
                  assetKind={assetKind}
                  onAssetKind={setAssetKind}
                  onRandomise={() => { setConfig((current) => ({ ...randomiseConfig(current), resolution: current.resolution })); setCurrentPresetId(undefined); setSaved(false); }}
                  editHistoryCount={undoRef.current.length}
                />
              ) : (
                <RightPanel
                  world={world}
                  tab={inspectorTab}
                  onTab={setInspectorTab}
                  layers={layers}
                  onLayers={(partial) => setLayers((current) => ({ ...current, ...partial }))}
                  overlay={overlay}
                  onOverlay={handleOverlay}
                  hillshade={hillshade}
                  onHillshade={setHillshade}
                  contours={contours}
                  onContours={setContours}
                  sun={sun}
                  onSun={setSun}
                  selected={selected}
                  onSelect={handleSelect}
                  onOpenAnalysis={() => { setDrawer(null); openModal("analysis"); }}
                  onOpenValidation={() => { setDrawer(null); openModal("validation"); }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}


