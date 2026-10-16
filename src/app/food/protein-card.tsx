"use client";

import { Check, Flame } from "lucide-react";
import { Bar } from "@/components/ui";
import { PROTEIN_G_PER_KG } from "@/lib/targets";
import type { Macros, Target } from "@/lib/types";

const r = (n: number) => Math.round(n);

// Protein leads the day: grams still to go, the streak, and how the goal is
// worked out. Calories and the other macros sit underneath.
export function ProteinCard({
  eaten,
  target,
  streak,
  perKg,
  weightKg,
}: {
  eaten: Macros;
  target: Target;
  streak: number;
  perKg: number | undefined;
  weightKg: number | null;
}) {
  const left = Math.max(0, r(target.protein - eaten.protein));
  const met = eaten.protein >= target.protein * 0.95;
  const factor = perKg ?? PROTEIN_G_PER_KG;
  const kcalLeft = target.calories - eaten.kcal;

  return (
    <section className="card mb-4 p-4" aria-label="Protein and calories">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Protein</p>
          {met ? (
            <p className="mt-1 flex items-center gap-2 text-[28px] leading-none font-semibold tracking-[-0.02em] text-accent">
              <Check size={26} strokeWidth={2.6} /> Goal hit
            </p>
          ) : (
            <p className="num mt-1 leading-none">
              <span className="text-[40px] font-semibold tracking-[-0.03em]">{left}</span>
              <span className="ml-1.5 text-muted">g to go</span>
            </p>
          )}
        </div>
        <div className="pt-0.5 text-right">
          {streak > 0 && (
            <p className="flex items-center justify-end gap-1 text-sm font-medium text-pr">
              <Flame size={16} /> {streak}-day streak
            </p>
          )}
          <p className="num mt-1 text-sm text-muted">
            {r(eaten.protein)} of {target.protein} g
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Bar value={eaten.protein} max={target.protein} thick />
      </div>
      <details className="group mt-2 text-sm">
        <summary className="flex min-h-9 cursor-pointer list-none items-center text-muted [&::-webkit-details-marker]:hidden">
          How is {target.protein} g worked out?
        </summary>
        <p className="pb-1 text-muted">
          {weightKg ? (
            <>
              {factor.toFixed(1)} g per kg × {weightKg} kg body weight, rounded to the nearest 5 g.
            </>
          ) : (
            <>{factor.toFixed(1)} g per kg of body weight.</>
          )}{" "}
          It moves with your weight. Spread it out: about {Math.round(target.protein / 4)} g at each of 4 meals builds more muscle than one huge serving. Change
          the amount per kg in Settings.
        </p>
      </details>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <Macro label="Calories" value={eaten.kcal} goal={target.calories} unit="" note={kcalLeft >= 0 ? `${r(kcalLeft).toLocaleString()} left` : `${r(-kcalLeft).toLocaleString()} over`} />
        <Macro label="Carbs" value={eaten.carbs} goal={target.carbs} unit=" g" />
        <Macro label="Fat" value={eaten.fat} goal={target.fat} unit=" g" />
      </div>
    </section>
  );
}

function Macro({ label, value, goal, unit, note }: { label: string; value: number; goal: number; unit: string; note?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-0.5 text-sm">
        <b className="font-semibold">{r(value).toLocaleString()}</b>
        <span className="text-muted">
          {" "}
          / {goal.toLocaleString()}
          {unit}
        </span>
      </p>
      <div className="mt-1.5">
        <Bar value={value} max={goal} tone="muted" />
      </div>
      {note && <p className="num mt-1 text-[11px] text-faint">{note}</p>}
    </div>
  );
}
