import { BarChart3, BookOpen, ChevronRight, Download, FolderOpen, Loader2, Redo2, Save, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { cn } from "../utils/cn";

export type TopTab = "workspace" | "analysis" | "projects" | "docs";

export default function TopBar({
  projectName,
  onRename,
  isGenerating,
  saved,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGenerate,
  onSave,
  onExport,
  onOpenProjects,
  onOpenValidation,
  onOpenAnalysis,
  onOpenDocs,
  topTab,
}: {
  projectName: string;
  onRename: (name: string) => void;
  isGenerating: boolean;
  saved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGenerate: () => void;
  onSave: () => void;
  onExport: () => void;
  onOpenProjects: () => void;
  onOpenValidation: () => void;
  onOpenAnalysis: () => void;
  onOpenDocs: () => void;
  topTab: TopTab;
}) {
  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center border-b border-[var(--line)] bg-[#080e11] px-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-[7px] border border-[rgba(95,227,192,0.25)] bg-[radial-gradient(circle_at_30%_20%,#1c4d43,#0b1a1a_70%)] shadow-[0_0_18px_rgba(60,220,185,0.12)]">
            <svg viewBox="0 0 32 32" className="h-[23px] w-[23px]" fill="none">
              <path d="M6 22.5c3.8-6.4 6.2-1.9 9.3-7.5 2.4-4.3 5.2-6.5 10.7-6" stroke="#74f0d0" strokeWidth="1.25" strokeLinecap="round" />
              <path d="M5 17.4c4.2-4.1 6.4 1.7 10.1-2.1 2.8-2.8 5.3-4.6 11-4" stroke="#4ca99a" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
              <path d="M6.5 26.2c4.7-3 7.7 1.8 12-1.7 2.3-1.9 4.8-2.8 8.1-2.4" stroke="#356f6c" strokeWidth="1" strokeLinecap="round" />
              <circle cx="22.1" cy="11.6" r="1.5" fill="#a8ffe8" />
            </svg>
          </div>
          <div className="leading-none">
            <div className="flex items-baseline gap-1">
              <span className="text-[14px] font-bold tracking-[0.06em] text-[#f0faf6]">ARK</span>
              <span className="text-[9px] font-semibold tracking-[0.16em] text-[#8ca79f]">MAP STUDIO</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="mono text-[7.5px] uppercase tracking-[0.22em] text-[#4f6a62]">Ultimate</span>
              <span className="rounded-sm border border-[rgba(95,227,192,0.2)] bg-[rgba(95,227,192,0.06)] px-1 py-px text-[6.5px] font-semibold uppercase tracking-wider text-[#6bd6bc]">v1.0</span>
            </div>
          </div>
        </div>

        <div className="mx-1.5 hidden h-5 w-px bg-[var(--line)] sm:block" />
        <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
          <span className="mono text-[8.5px] uppercase tracking-[0.1em] text-[#526a62]">Workspace</span>
          <ChevronRight size={10} className="text-[#40544e]" />
          <div className="group flex items-center gap-1">
            <input
              value={projectName}
              onChange={(event) => onRename(event.target.value)}
              aria-label="Project name"
              className="min-w-0 max-w-[168px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] font-semibold text-[#e2eee9] transition hover:border-[var(--line)] focus:border-[var(--line-strong)]"
            />
            <span
              className={cn("flex items-center gap-1 rounded-sm border px-1 py-px text-[8px]", saved ? "border-[var(--line)] text-[#6f8980]" : "border-[rgba(233,184,114,0.25)] bg-[rgba(233,184,114,0.06)] text-[#c8a16d]")}
              title={saved ? "Latest world saved to project browser" : "Project has unsaved changes"}
            >
              <span className={cn("h-1 w-1 rounded-full", saved ? "bg-[var(--accent)]" : "bg-[#e9b872]")} />
              {saved ? "Saved" : "Unsaved"}
            </span>
          </div>
        </div>
      </div>

      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-md border border-[var(--line)] bg-[#0a1215] p-0.5 lg:flex">
        {[
          { id: "workspace", label: "Studio", icon: <Sparkles size={11} />, action: () => {} },
          { id: "analysis", label: "Analysis", icon: <BarChart3 size={11} />, action: onOpenAnalysis },
          { id: "projects", label: "Projects", icon: <FolderOpen size={11} />, action: onOpenProjects },
          { id: "docs", label: "Field guide", icon: <BookOpen size={11} />, action: onOpenDocs },
        ].map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-[10.5px] font-medium transition",
              topTab === item.id ? "bg-[#182625] text-[#dff2eb] shadow-[inset_0_0_0_1px_rgba(95,227,192,0.12)]" : "text-[#6c817a] hover:text-[#b5c9c2]",
            )}
          >
            {item.icon}
            <span className="hidden xl:inline">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="mr-0.5 hidden items-center gap-1 md:flex">
          <button onClick={onUndo} disabled={!canUndo} title="Undo terrain edit (Ctrl+Z)" aria-label="Undo" className="rounded p-1.5 text-[#778d86] transition hover:bg-white/5 hover:text-white disabled:opacity-25">
            <Undo2 size={14} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo terrain edit (Ctrl+Shift+Z)" aria-label="Redo" className="rounded p-1.5 text-[#778d86] transition hover:bg-white/5 hover:text-white disabled:opacity-25">
            <Redo2 size={14} />
          </button>
          <button onClick={onOpenValidation} title="Open mathematical validation suite" aria-label="Validation suite" className="rounded p-1.5 text-[#778d86] transition hover:bg-white/5 hover:text-[var(--accent)]">
            <ShieldCheck size={14} />
          </button>
        </div>
        <div className="mx-1 hidden h-5 w-px bg-[var(--line)] md:block" />
        <button onClick={onSave} className="hidden items-center gap-1.5 rounded-md border border-[var(--line)] bg-[#0d171b] px-2.5 py-[6px] text-[10.5px] font-medium text-[#aabfb8] transition hover:border-[var(--line-strong)] hover:text-white sm:flex" title="Save project (Ctrl+S)">
          <Save size={12} /> Save
        </button>
        <button onClick={onExport} className="flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[#0d171b] px-2.5 py-[6px] text-[10.5px] font-medium text-[#c0d3cc] transition hover:border-[rgba(95,227,192,0.3)] hover:text-white" title="Open validated export system">
          <Download size={12} /> <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 rounded-md border border-[rgba(113,238,206,0.32)] bg-[linear-gradient(180deg,#2f7e6e,#236356)] px-3 py-[6px] text-[10.5px] font-semibold text-[#effff9] shadow-[0_2px_14px_rgba(43,162,133,0.2)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-75"
        >
          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {isGenerating ? "Generating" : "Generate"}
        </button>
        <div className="ml-1 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[rgba(95,227,192,0.22)] bg-[linear-gradient(140deg,#1b3b36,#0e1f20)] text-[9px] font-semibold text-[#9ce7d4]" title="Local engineering profile">
          AX
        </div>
      </div>
    </header>
  );
}
