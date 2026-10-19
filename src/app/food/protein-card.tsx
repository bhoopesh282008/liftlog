"use client";

import { Check, Flame } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { Bar } from "@/components/ui";
import { MODE_LABELS } from "@/lib/targets";
import type { GoalMode, Macros, Target } from "@/lib/types";

const r = (n: number) => Math.round(n);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(r(n)).toLocaleString()}`;

// Protein leads the day: grams still to go, the streak, and how the goal is
// worked out. Calories and the other macros sit underneath.
export function ProteinCard({
  eaten,
  target,
  streak,
  perKg,
  weightKg,
  mode,
  maintenance,
  isToday,
  dayNote,
}: {
  eaten: Macros;
  target: Pick<Target, "calories" | "protein" | "carbs" | "fat">;
  streak: number;
  perKg: number;
  weightKg: number | null;
  mode: GoalMode;
  maintenance: number | null;
  isToday: boolean;
  dayNote: string;
}) {
  const left = Math.max(0, r(target.protein - eaten.protein));
  const met = eaten.protein >= target.protein * 0.95;
  const kcalLeft = target.calories - eaten.kcal;

  return (
    <section className="card mb-4 p-5" aria-label="Protein and calories">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            Protein
            {streak > 0 && (
              <span className="num inline-flex items-center gap-1 rounded-full bg-pr-soft px-2 py-0.5 text-xs font-semibold text-pr">
                <Flame size={13} aria-hidden /> {streak}-day streak
              </span>
            )}
          </p>
          {met ? (
            <p className="mt-2 flex items-center gap-2 text-[34px] leading-none font-bold tracking-[-0.04em] text-accent">
              <Check size={30} strokeWidth={2.8} aria-hidden /> Goal hit
            </p>
          ) : (
            <p className="mt-2 leading-none">
              <CountUp value={left} className="display" />
              <span className="ml-1.5 text-[17px] font-medium text-muted">g to go</span>
            </p>
          )}
          <p className="num mt-2.5 text-sm text-muted">
            <b className="font-semibold text-text">{r(eaten.protein)}</b> of {target.protein} g eaten
          </p>
        </div>
        <Ring value={eaten.protein} max={target.protein} />
      </div>
      <details className="group mt-3 text-sm">
        <summary className="flex min-h-9 cursor-pointer list-none items-center text-muted [&::-webkit-details-marker]:hidden">
          How is {target.protein} g worked out?
        </summary>
        <p className="pb-1 text-muted">
          {weightKg ? (
            <>
              {perKg.toFixed(1)} g per kg × {weightKg} kg body weight, rounded to the nearest 5 g.
            </>
          ) : (
            <>{perKg.toFixed(1)} g per kg of body weight.</>
          )}{" "}
          It moves with your weight. Spread it out: about {Math.round(target.protein / 4)} g at each of 4 meals builds more muscle than one huge serving. Change
          the amount per kg in Settings.
        </p>
      </details>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Macro label="Calories" value={eaten.kcal} goal={target.calories} unit="" note={kcalLeft >= 0 ? `${r(kcalLeft).toLocaleString()} left` : `${r(-kcalLeft).toLocaleString()} over`} />
        <Macro label="Carbs" value={eaten.carbs} goal={target.carbs} unit=" g" />
        <Macro label="Fat" value={eaten.fat} goal={target.fat} unit=" g" />
      </div>
      {dayNote && <p className="mt-3 text-xs text-muted">{dayNote}</p>}
      {maintenance !== null && (
        <p className="num mt-3 text-xs text-muted">
          vs maintenance {maintenance.toLocaleString()} kcal:{" "}
          <b className="font-semibold text-text">
            {signed(eaten.kcal - maintenance)} {eaten.kcal >= maintenance ? "surplus" : "deficit"}
          </b>
          {isToday && " so far"} · target {signed(target.calories - maintenance)} ({MODE_LABELS[mode].label.toLowerCase()})
        </p>
      )}
    </section>
  );
}

// The day's protein as a ring that fills from empty when the card appears.
function Ring({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max * 1.1;
  return (
    <div className="relative size-[92px] shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--track)" strokeWidth="11" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={over ? "var(--pr)" : "var(--accent)"}
          strokeWidth="11"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - pct}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <CountUp value={pct} format={(n) => `${Math.round(n)}%`} className="absolute inset-0 flex items-center justify-center text-[17px] font-bold tracking-[-0.02em]" />
    </div>
  );
}

function Macro({ label, value, goal, unit, note }: { label: string; value: number; goal: number; unit: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-[19px] leading-tight font-bold tracking-[-0.02em]">
        <CountUp value={value} />
      </p>
      <p className="num text-xs whitespace-nowrap text-muted">
        of {goal.toLocaleString()}
        {unit || " kcal"}
      </p>
      <div className="mt-2">
        <Bar value={value} max={goal} tone="muted" />
      </div>
      {note && <p className="num mt-1 text-[11px] text-faint">{note}</p>}
    </div>
  );
}
