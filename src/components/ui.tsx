"use client";

import { Minus, Plus, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="animate-sheet relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface sm:rounded-[28px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-icon -mr-2" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

export function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "muted" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max * 1.1;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-track">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${pct}%`,
          background: over ? "var(--pr)" : tone === "accent" ? "var(--accent)" : "var(--faint)",
        }}
      />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  format = (v: number) => String(v),
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  format?: (v: number) => string;
  label: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-surface-2 p-1">
      <button className="btn btn-icon bg-surface" onClick={() => set(value - step)} aria-label={`Less ${label}`}>
        <Minus size={18} />
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        className="num w-full min-w-0 bg-transparent text-center text-lg font-semibold outline-none"
        value={format(value)}
        onChange={(e) => {
          const n = parseFloat(e.target.value.replace(",", "."));
          if (Number.isFinite(n)) onChange(n);
          else if (e.target.value === "") onChange(0);
        }}
        onFocus={(e) => e.target.select()}
      />
      <button className="btn btn-icon bg-surface" onClick={() => set(value + step)} aria-label={`More ${label}`}>
        <Plus size={18} />
      </button>
    </div>
  );
}

export function LineChart({
  points,
  goal,
  height = 120,
  color = "var(--accent)",
}: {
  points: { date: string; value: number }[];
  goal?: { from: number; to: number };
  height?: number;
  color?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-surface-2 text-sm text-muted" style={{ height }}>
        Log a couple more times to see a trend
      </div>
    );
  }
  const values = points.map((p) => p.value).concat(goal ? [goal.from, goal.to] : []);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || 1;
  const y = (v: number) => 100 - ((v - (lo - pad)) / (hi - lo + pad * 2)) * 100;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <div className="relative" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
        {goal && (
          <line
            x1={0}
            y1={y(goal.from)}
            x2={100}
            y2={y(goal.to)}
            stroke="var(--faint)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={`${d} L100,100 L0,100 Z`} fill={color} opacity={0.08} />
        <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
        style={{ left: "100%", top: `${y(points[points.length - 1].value)}%`, background: color }}
      />
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-xl px-2 text-sm font-medium transition-[background-color,color] duration-150 ${
            value === o.value ? "bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
