import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, Info, X } from "lucide-react";
import { cn } from "../utils/cn";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  width = "max-w-3xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-7" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#020506]/80 backdrop-blur-[7px] fade-in" onClick={onClose} />
      <div className={cn("relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-[#2a3a3d] bg-[#0a1115] shadow-[0_40px_120px_rgba(0,0,0,0.75)] animate-in", width)}>
        <div className="flex items-start justify-between gap-5 border-b border-[var(--line)] bg-[#0c1519] px-5 py-4">
          <div className="flex items-start gap-3.5">
            {icon && <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(95,227,192,0.22)] bg-[rgba(95,227,192,0.07)] text-[var(--accent)]">{icon}</div>}
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-[#edf5f1]">{title}</h2>
              {subtitle && <p className="mt-0.5 max-w-xl text-[11.5px] leading-relaxed text-[var(--muted)]">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="mt-0.5 rounded-md p-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={15} />
          </button>
        </div>
        <div className="panel-scroll flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-[var(--line)] bg-[#0b1317] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Section({
  title,
  subtitle,
  icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--line)]">
      <button className="group flex w-full items-center gap-2.5 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-[#78948e] transition group-hover:text-[var(--accent)]">{icon}</span>
        <span className="flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[11.5px] font-semibold tracking-wide text-[#cfdfd9]">{title}</span>
            {badge && <span className="mono rounded-sm border border-[var(--line-strong)] px-1.5 py-px text-[8.5px] text-[#78948e]">{badge}</span>}
          </span>
          {subtitle && <span className="mt-0.5 block text-[10px] leading-tight text-[var(--faint)]">{subtitle}</span>}
        </span>
        <ChevronDown size={13} className={cn("text-[#5d716c] transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  disabled,
  accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
  disabled?: boolean;
  accent?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("group py-1.5", disabled && "opacity-50")} title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#a7bab4]">
          {label}
          {hint && <Info size={10} className="text-[#4e625d] opacity-0 transition group-hover:opacity-100" />}
        </label>
        <span className={cn("mono rounded border border-[var(--line)] bg-[#0a1215] px-1.5 py-0.5 text-[10px] tabular-nums", accent ? "text-[var(--accent)]" : "text-[#b8cac4]")}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        className="studio-range mt-1"
        style={{ "--pct": `${pct}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
  hint,
  dot,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
  dot?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[7px]" title={hint}>
      <span className="flex items-center gap-2 text-[11.5px] text-[#aebfba]">
        {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
        {label}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-[17px] w-[30px] shrink-0 rounded-full border transition-colors duration-200", checked ? "border-[rgba(95,227,192,0.45)] bg-[rgba(95,227,192,0.28)]" : "border-[#2a393c] bg-[#182427]")}
      >
        <span className={cn("absolute top-[2px] h-[11px] w-[11px] rounded-full transition-all duration-200", checked ? "left-[16px] bg-[var(--accent)] shadow-[0_0_7px_rgba(95,227,192,0.5)]" : "left-[2px] bg-[#7b8f8a]")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-md border border-[var(--line)] bg-[#080e11] p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-all",
            size === "xs" ? "text-[9.5px]" : "text-[10.5px]",
            value === option.value ? "bg-[#1b2b2c] text-[#e9f6f1] shadow-[inset_0_0_0_1px_rgba(95,227,192,0.18)]" : "text-[#71847e] hover:text-[#b1c3bd]",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SelectBox({
  value,
  onChange,
  children,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#657a74]">{label}</span>}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="no-native-select w-full rounded border border-[var(--line)] bg-[#0a1215] py-[6px] pl-2 pr-6 text-[11px] font-medium text-[#c2d3ce] outline-none transition hover:border-[var(--line-strong)]"
      >
        {children}
      </select>
    </label>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-[9.5px] font-medium uppercase tracking-[0.09em] text-[#657a74]" title={hint}>
      {children}
      {hint && <Info size={9} className="text-[#4d5f5a]" />}
    </span>
  );
}

export function ScoreRing({ score, grade, size = 92, label }: { score: number; grade: string; size?: number; label?: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#1c2b2d" strokeWidth="4.5" />
        <circle cx="44" cy="44" r={radius} fill="none" stroke="url(#ringGrad)" strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} className="transition-all duration-700" />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7cf4d4" />
            <stop offset="65%" stopColor="#50c9b1" />
            <stop offset="100%" stopColor="#5f9fca" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[22px] font-semibold leading-none tracking-tight text-[#effbf7]">{Math.round(score)}</span>
        <span className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.16em] text-[#6f8a84]">{label || `grade ${grade}`}</span>
      </div>
    </div>
  );
}

export function Bar({ value, color = "#5fe3c0", height = 3 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-[#1c2a2c]" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "amber" | "blue" | "danger"; className?: string }) {
  const tones: Record<string, string> = {
    neutral: "border-[#2b3a3d] bg-[#111c20] text-[#91a7a1]",
    accent: "border-[rgba(95,227,192,0.28)] bg-[rgba(95,227,192,0.08)] text-[#7be8cc]",
    amber: "border-[rgba(233,184,114,0.28)] bg-[rgba(233,184,114,0.08)] text-[#e9b872]",
    blue: "border-[rgba(100,200,255,0.24)] bg-[rgba(100,200,255,0.07)] text-[#86cdff]",
    danger: "border-[rgba(242,124,106,0.28)] bg-[rgba(242,124,106,0.08)] text-[#f09588]",
  };
  return <span className={cn("mono inline-flex items-center gap-1 rounded-sm border px-1.5 py-[2px] text-[9px] uppercase tracking-wide", tones[tone], className)}>{children}</span>;
}

export function KeyValue({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[5px]">
      <span className="text-[10.5px] text-[#748983]">{label}</span>
      <span className={cn("text-right text-[11px] font-medium text-[#c8d8d3]", mono && "mono tabular-nums")}>{value}</span>
    </div>
  );
}

export function TinyHistogram({ data, color = "#5fe3c0", height = 32 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex w-full items-end gap-[2px]" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: color, opacity: 0.35 + (i / data.length) * 0.6 }} />
      ))}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  const id = useId();
  return (
    <span className="tooltip-wrap relative inline-flex" aria-describedby={id}>
      <Info size={11} className="text-[#5d736c]" />
      <span id={id} className="tooltip absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-md border border-[#2c3c3f] bg-[#0c1519] p-2 text-[10px] font-normal leading-relaxed text-[#a5b9b2] shadow-xl">
        {text}
      </span>
    </span>
  );
}

export function IconButton({ children, onClick, title, active, disabled, className }: { children: ReactNode; onClick?: () => void; title: string; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center rounded-md border transition-all disabled:cursor-not-allowed disabled:opacity-35",
        active ? "border-[rgba(95,227,192,0.3)] bg-[rgba(95,227,192,0.1)] text-[var(--accent)]" : "border-[var(--line)] bg-[#0c1518]/70 text-[#869b95] hover:border-[var(--line-strong)] hover:bg-[#131f22] hover:text-[#d1e2dc]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Readout({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[#0a1215] px-2.5 py-2">
      <div className="text-[8.5px] font-medium uppercase tracking-[0.1em] text-[#5e736d]">{label}</div>
      <div className={cn("mono mt-0.5 text-[13px] font-medium leading-tight", accent ? "text-[var(--accent)]" : "text-[#d3e2dd]")}>{value}</div>
      {sub && <div className="mt-0.5 text-[9px] text-[#5d716b]">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[#0d171a] text-[#68807a]">{icon}</div>
      <p className="text-[12px] font-medium text-[#b3c6bf]">{title}</p>
      <p className="max-w-xs text-[10.5px] leading-relaxed text-[#62766f]">{body}</p>
    </div>
  );
}
