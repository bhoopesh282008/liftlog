"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Circle, Droplet, Minus, Plus } from "lucide-react";
import { Bar } from "@/components/ui";
import { db, PROFILE_ID } from "@/lib/db";
import { updateDay } from "@/lib/repo";
import { GLASS_ML } from "@/lib/training";
import { useSupplements } from "./supplement-reminder";

// Quick taps for the daily basics: water and the supplements you take
// (whey and mass gainer are logged as food so their macros count).
export function HabitsCard({ date, waterGoal, training }: { date: string; waterGoal?: number; training: boolean }) {
  const supplements = useSupplements(date, training);
  const data = useLiveQuery(async () => {
    const [day, profile] = await Promise.all([db.days.get(date), db.profile.get(PROFILE_ID)]);
    return {
      water: day && !day.deletedAt ? day.waterGlasses : 0,
      goal: waterGoal ?? profile?.waterGoal ?? 12,
    };
  }, [date, waterGoal]);
  if (!data) return null;

  const due = supplements.data?.due ?? [];
  const litres = (data.water * GLASS_ML) / 1000;

  return (
    <section className="card mb-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Droplet size={16} className="text-muted" aria-hidden /> Water
        </p>
        <p className="num text-sm">
          <b>{data.water}</b>
          <span className="text-muted">
            {" "}
            / {data.goal} glasses · {Math.round(litres * 100) / 100} L
          </span>
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1">
          <Bar value={data.water} max={data.goal} tone="muted" />
        </div>
        <button
          className="btn btn-icon"
          aria-label="One glass less"
          disabled={data.water === 0}
          onClick={() => void updateDay(date, { waterGlasses: Math.max(0, data.water - 1) })}
        >
          <Minus size={18} />
        </button>
        <button className="btn btn-icon" aria-label="Add a glass of water" onClick={() => void updateDay(date, { waterGlasses: data.water + 1 })}>
          <Plus size={18} />
        </button>
      </div>
      {due.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="label mb-2">Supplements</p>
          <div className="flex flex-wrap gap-2">
            {due.map((s) => {
              const n = supplements.data?.checked.get(s.id) ?? 0;
              const on = n > 0;
              return (
                <button key={s.id} className="chip min-h-11" data-on={on} aria-pressed={on} onClick={() => void supplements.toggle(s)}>
                  {on ? <Check size={16} strokeWidth={2.6} /> : <Circle size={16} className="text-faint" />}
                  {s.label}
                  {n > 1 && <span className="num opacity-70">× {n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
